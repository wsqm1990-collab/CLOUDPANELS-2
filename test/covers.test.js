import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CoverService, coverCacheId, thumbnailCover } from '../src/covers.js';

const comic = (number = 1, format = 'cbz') => ({ id: `mega:comic${number}`, source: 'mega', name: `Original ${number}.${format}`, size: 100000, format });
const jpeg = (size = 10) => new Blob([new Uint8Array(size)], { type: 'image/jpeg' });
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function setup(options = {}) {
  let opened = 0, closed = 0, sourced = 0;
  const service = new CoverService({ disk: null, getSource: async () => { sourced++; return { name: 'Original.cbz', size: 100000 }; }, openComic: async () => {
    opened++; return { page: async index => { assert.equal(index, 0); return jpeg(1000); }, close: () => closed++ };
  }, thumbnail: async () => jpeg(), ...options });
  return { service, counts: () => ({ opened, closed, sourced }) };
}

test('cover identity is validated, stable across metadata/progress edits, and changes when the underlying file changes', () => {
  const original = comic(); const key = coverCacheId(original);
  assert.equal(key, coverCacheId({ ...original, metadata: { title: 'Edited title' }, progress: { page: 3 } }));
  assert.notEqual(key, coverCacheId({ ...original, size: original.size + 1 }));
  assert.notEqual(key, coverCacheId({ ...original, name: 'Replacement.cbz' }));
  for (const change of [{ id: 'https://mega.nz/folder/secret#key' }, { id: 'bad\nkey' }, { size: NaN }, { size: 0 }, { source: 'unknown' }, { name: '' }]) assert.throws(() => coverCacheId({ ...original, ...change }), TypeError);
});

test('visible requests are deduplicated and closing one consumer does not cancel another', async () => {
  const gate = deferred();
  const { service, counts } = setup({ thumbnail: async () => { await gate.promise; return jpeg(); } });
  const controller = new AbortController();
  const first = service.get(comic(), { signal: controller.signal }); const firstRejected = assert.rejects(first, { name: 'AbortError' });
  const second = service.get(comic()); await tick();
  assert.equal(counts().opened, 1); controller.abort(); await firstRejected;
  gate.resolve(); assert.equal((await second).type, 'image/jpeg');
  assert.deepEqual(counts(), { opened: 1, closed: 1, sourced: 1 });
  assert.equal((await service.get(comic())).type, 'image/jpeg'); assert.equal(counts().opened, 1);
});

test('last retired card cancels its cover job and releases the queue for the next visible comic', async () => {
  const signals = [], calls = []; let closed = 0;
  const service = new CoverService({ disk: null, getSource: async item => item, thumbnail: async () => jpeg(), openComic: async (source, { signal }) => {
    calls.push(source.id); signals.push(signal);
    return { page: async () => source.id === comic(1).id ? new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })) : jpeg(), close: () => closed++ };
  } });
  const controller = new AbortController();
  const first = service.get(comic(1), { signal: controller.signal }); const firstRejected = assert.rejects(first, { name: 'AbortError' });
  const second = service.get(comic(2)); await tick(); assert.equal(calls.length, 1);
  controller.abort(); await firstRejected;
  assert.equal((await second).type, 'image/jpeg'); assert.equal(signals[0].aborted, true); assert.equal(closed, 2);
});

test('foreground reading pauses queued downloads while cache hits remain available', async () => {
  const { service, counts } = setup(); await service.seed(comic(1), jpeg()); service.setForegroundBusy(true);
  assert.equal((await service.get(comic(1))).type, 'image/jpeg');
  const waiting = service.get(comic(2)); await tick(); assert.equal(counts().sourced, 0);
  service.setForegroundBusy(false); assert.equal((await waiting).type, 'image/jpeg'); assert.equal(counts().sourced, 1);
});

test('PDF covers never download a full PDF and can be seeded from the already opened first page', async () => {
  const { service, counts } = setup(); const pdf = comic(1, 'pdf');
  assert.equal(await service.get(pdf), null); assert.deepEqual(counts(), { opened: 0, closed: 0, sourced: 0 });
  await service.seed(pdf, jpeg(1000)); assert.equal((await service.get(pdf)).type, 'image/jpeg'); assert.equal(counts().sourced, 0);
  for (const format of ['cbr', '7z', 'tar']) assert.equal(await service.get(comic(2, format)), null);
});

test('memory cache follows LRU and byte bounds rather than retaining every library cover', async () => {
  const { service } = setup({ maxMemoryBytes: 12, thumbnail: async () => jpeg(6) });
  await service.seed(comic(1), jpeg()); await service.seed(comic(2), jpeg());
  await service.peek(comic(1)); await service.seed(comic(3), jpeg());
  assert.equal(service.memoryBytes, 12); assert.equal(service.memory.size, 2);
  assert.equal(await service.peek(comic(2)), null); assert.ok(await service.peek(comic(1))); assert.ok(await service.peek(comic(3)));
});

test('a persisted thumbnail is reused after recreating the service without network or edition bytes', async () => {
  const rows = new Map();
  const disk = { get: async key => rows.get(key) || null, put: async (key, blob) => rows.set(key, blob), clear: async () => rows.clear() };
  const first = setup({ disk }); await first.service.seed(comic(), jpeg(1000)); await first.service.close();
  const second = setup({ disk }); assert.equal((await second.service.get(comic())).type, 'image/jpeg');
  assert.deepEqual(second.counts(), { opened: 0, closed: 0, sourced: 0 });
  assert.equal(rows.size, 1); assert.ok([...rows.values()].every(row => row instanceof Blob && row.type === 'image/jpeg'));
});

test('storage quota or blocked IndexedDB failures gracefully fall back to memory covers', async () => {
  const disk = { get: async () => { throw new Error('Unavailable'); }, put: async () => { throw new Error('Quota exceeded'); }, clear: async () => { throw new Error('Unavailable'); } };
  const { service, counts } = setup({ disk });
  assert.ok(await service.get(comic())); assert.ok(await service.get(comic())); assert.equal(counts().opened, 1);
  await service.clear(); assert.equal(service.memoryBytes, 0);
});

test('clear cancels stale work, clears disk, and does not allow old thumbnail work to repopulate it', async () => {
  const gate = deferred(), rows = new Map();
  const disk = { get: async key => rows.get(key), put: async (key, value) => rows.set(key, value), clear: async () => rows.clear() };
  const { service } = setup({ disk, thumbnail: async () => { await gate.promise; return jpeg(); } });
  const waiting = service.get(comic()); const rejected = assert.rejects(waiting, { name: 'AbortError' }); await tick();
  await service.clear(); await rejected; gate.resolve(); await tick();
  assert.equal(service.memoryBytes, 0); assert.equal(rows.size, 0);
});

test('invalid identities, unsafe thumbnail types and failed image decoding produce a fallback without a broken cover', async () => {
  const { service, counts } = setup({ thumbnail: async () => new Blob(['<svg/>'], { type: 'image/svg+xml' }) });
  assert.equal(await service.get({ ...comic(), id: 'invalid' }), null); assert.equal(counts().sourced, 0);
  assert.equal(await service.get(comic()), null); assert.equal(counts().closed, 1);
  const broken = setup({ thumbnail: async () => { throw new Error('Decode failed'); } });
  assert.equal(await broken.service.get(comic()), null); assert.equal(broken.counts().closed, 1);
  assert.equal(await thumbnailCover(new Blob(['<svg/>'], { type: 'image/svg+xml' })), null);
});

test('pre-cancelled requests never load a source and close cancels queued jobs without deleting persisted covers', async () => {
  const { service, counts } = setup(); const controller = new AbortController(); controller.abort();
  await assert.rejects(service.get(comic(), { signal: controller.signal }), { name: 'AbortError' }); assert.equal(counts().sourced, 0);
  service.setForegroundBusy(true);
  const queued = service.get(comic()); const rejected = assert.rejects(queued, { name: 'AbortError' }); await tick();
  await service.close(); await rejected; assert.equal(await service.get(comic()), null); assert.equal(counts().sourced, 0);
});

test('thumbnail encoding bounds decoded dimensions, uses JPEG quality, and releases canvas/bitmap memory', async () => {
  const priorBitmap = globalThis.createImageBitmap, priorDocument = globalThis.document;
  const encoded = [], drawn = []; let released = 0;
  const canvas = { width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage: (...args) => drawn.push(args) }), toBlob(callback, type, quality) { encoded.push({ width: this.width, height: this.height, type, quality }); callback(jpeg()); } };
  globalThis.createImageBitmap = async () => ({ width: 2400, height: 3600, close: () => released++ });
  globalThis.document = { createElement: () => canvas };
  try {
    assert.equal((await thumbnailCover(jpeg(1000))).type, 'image/jpeg');
    assert.deepEqual(encoded, [{ width: 360, height: 540, type: 'image/jpeg', quality: 0.68 }]);
    assert.equal(drawn.length, 1); assert.equal(released, 1); assert.equal(canvas.width, 0); assert.equal(canvas.height, 0);
  } finally { globalThis.createImageBitmap = priorBitmap; globalThis.document = priorDocument; }
});

test('a cover already made by the reader\'s background worker is stored without decoding the page again', async () => {
  let decoded = 0;
  const { service } = setup({ thumbnail: async () => { decoded++; return jpeg(); } });
  const ready = jpeg(321);
  assert.equal(await service.seed(comic(7), jpeg(5000), { thumbnail: ready }), ready);
  assert.equal(decoded, 0); assert.equal((await service.get(comic(7))).size, 321);
  // Without one, the page is decoded here as before.
  assert.equal((await service.seed(comic(8), jpeg(5000))).type, 'image/jpeg'); assert.equal(decoded, 1);
});
