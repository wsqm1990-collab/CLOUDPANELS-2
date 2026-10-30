import test from 'node:test';
import assert from 'node:assert/strict';
import { PageThumbnails, pageThumbnailComicKey, createThumbnailWorker } from '../src/page-thumbnails.js';

const jpeg = (text = 'x') => new Blob([text], { type: 'image/jpeg' });

function fakeDisk() {
  const rows = new Map(); let gets = 0, puts = 0;
  return {
    rows, get gets() { return gets; }, get puts() { return puts; },
    async get(key) { gets++; return rows.get(key) || null; },
    async put(key, blob) { puts++; rows.set(key, blob); },
  };
}

test('page thumbnails are tied to the comic file, not its title or progress', () => {
  const comic = { id: 'mega:abc123', source: 'mega', size: 1234, name: 'Issue 1.cbr', metadata: { title: 'Edited' } };
  const key = pageThumbnailComicKey(comic);
  assert.equal(key, pageThumbnailComicKey({ ...comic, metadata: { title: 'Another title' } }));
  assert.notEqual(key, pageThumbnailComicKey({ ...comic, size: 999 }));
  assert.notEqual(key, pageThumbnailComicKey({ ...comic, id: 'mega:other' }));
  assert.equal(pageThumbnailComicKey(null), null);
  assert.equal(pageThumbnailComicKey({ id: '' }), null);
});

test('a thumbnail is made once, then comes from memory or the device', async () => {
  const disk = fakeDisk(); let made = 0;
  const thumbs = new PageThumbnails({ disk, make: async () => { made++; return { blob: jpeg('page'), width: 10, height: 15 }; } });
  const first = await thumbs.from('comic', 3, 'decoded page');
  assert.equal(made, 1); assert.equal(disk.puts, 1); assert.ok(first instanceof Blob);
  assert.equal(await thumbs.from('comic', 3, 'decoded page'), first, 'second request uses the remembered one');
  assert.equal(made, 1);
  // A fresh session (empty memory) finds it on the device without making it again.
  const later = new PageThumbnails({ disk, make: async () => { made++; return { blob: jpeg('again') }; } });
  assert.equal(await later.get('comic', 3), first);
  assert.equal(made, 1);
  assert.equal(await later.get('comic', 4), null);
  assert.equal(await later.get(null, 4), null);
});

test('thumbnails still work when the device storage fails', async () => {
  const broken = { async get() { throw new Error('no storage'); }, async put() { throw new Error('no storage'); } };
  const thumbs = new PageThumbnails({ disk: broken, make: async () => ({ blob: jpeg('p') }) });
  const blob = await thumbs.from('comic', 0, 'page');
  assert.ok(blob instanceof Blob);
  assert.equal(await thumbs.get('comic', 0), blob);
});

test('a cancelled thumbnail is not stored', async () => {
  const disk = fakeDisk(), controller = new AbortController();
  const thumbs = new PageThumbnails({ disk, make: async () => { controller.abort(); return { blob: jpeg('p') }; } });
  await assert.rejects(thumbs.from('comic', 1, 'page', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(disk.puts, 0);
  assert.equal(thumbs.has('comic', 1), false);
});

test('memory keeps only the most recent thumbnails', async () => {
  const thumbs = new PageThumbnails({ disk: null, maxMemory: 3, make: async () => ({ blob: jpeg() }) });
  for (let page = 0; page < 5; page++) await thumbs.from('comic', page, 'page');
  assert.equal(thumbs.has('comic', 0), false);
  assert.equal(thumbs.has('comic', 1), false);
  assert.equal(thumbs.has('comic', 4), true);
});

test('clearing thumbnails forgets them in memory and on the device', async () => {
  const disk = fakeDisk(); disk.clear = async () => { disk.rows.clear(); };
  const thumbs = new PageThumbnails({ disk, make: async () => ({ blob: jpeg('p') }) });
  await thumbs.from('comic', 2, 'page');
  await thumbs.clear();
  assert.equal(thumbs.has('comic', 2), false);
  assert.equal(await thumbs.get('comic', 2), null);
  // A device storage without a clear still empties memory.
  const plain = new PageThumbnails({ disk: null, make: async () => ({ blob: jpeg('p') }) });
  await plain.from('comic', 1, 'page'); await plain.clear();
  assert.equal(plain.has('comic', 1), false);
});

// A stand-in for the background worker: answers each job like thumb-worker.js.
function fakeWorkerFactory(reply) {
  const made = [];
  const factory = () => {
    const worker = { terminated: false, postMessage(message) { made.push(message); queueMicrotask(() => worker.onmessage?.({ data: reply(message) })); }, terminate() { worker.terminated = true; } };
    factory.workers.push(worker); return worker;
  };
  factory.workers = []; factory.made = made; return factory;
}

test('thumbnails are made in the background worker, one at a time', async () => {
  const factory = fakeWorkerFactory(message => ({ id: message.id, blob: jpeg('thumb'), width: 1000, height: 1500 }));
  const maker = createThumbnailWorker({ factory, idleMs: 20 });
  const [a, b] = await Promise.all([maker.make(new Blob(['page-a'], { type: 'image/jpeg' })), maker.make(new Blob(['page-b'], { type: 'image/jpeg' }))]);
  assert.equal(a.width, 1000); assert.equal(b.height, 1500); assert.equal(a.blob.type, 'image/jpeg');
  assert.equal(factory.workers.length, 1); assert.deepEqual(factory.made.map(m => m.id), [1, 2]);
  assert.equal(factory.made[0].maxWidth, 340);
  // It stops when idle, and starts again for the next page.
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(factory.workers[0].terminated, true);
  assert.ok(await maker.make(new Blob(['page-c'], { type: 'image/jpeg' })));
  assert.equal(factory.workers.length, 2);
  maker.stop();
});

test('without a usable worker, nothing is made in the background (the navigator draws it instead)', async () => {
  const unsupported = createThumbnailWorker({ factory: fakeWorkerFactory(message => ({ id: message.id, unsupported: true })) });
  assert.equal(await unsupported.make(new Blob(['page'], { type: 'image/jpeg' })), null);
  assert.equal(unsupported.unsupported, true);
  assert.equal(await unsupported.make(new Blob(['page'], { type: 'image/jpeg' })), null);
  const missing = createThumbnailWorker({ factory: () => { throw new Error('No module workers'); } });
  assert.equal(await missing.make(new Blob(['page'], { type: 'image/jpeg' })), null); assert.equal(missing.unsupported, true);
  // A page the worker could not decode is simply not made.
  const failing = createThumbnailWorker({ factory: fakeWorkerFactory(message => ({ id: message.id, error: true })) });
  assert.equal(await failing.make(new Blob(['page'], { type: 'image/jpeg' })), null); assert.equal(failing.unsupported, false);
  failing.stop();
});

test('a cancelled or stuck thumbnail job gives up', async () => {
  const silent = createThumbnailWorker({ factory: () => ({ postMessage() {}, terminate() {} }), timeoutMs: 30 });
  const controller = new AbortController();
  const cancelled = silent.make(new Blob(['page'], { type: 'image/jpeg' }), { signal: controller.signal }); controller.abort();
  assert.equal(await cancelled, null);
  assert.equal(await silent.make(new Blob(['page'], { type: 'image/jpeg' })), null);
  silent.stop();
});

test('a worker that stops answering is replaced, and after two silences it is not used again', async () => {
  const workers = [];
  const factory = () => { const worker = { terminated: false, postMessage() {}, terminate() { worker.terminated = true; } }; workers.push(worker); return worker; };
  const maker = createThumbnailWorker({ factory, timeoutMs: 20 });
  assert.equal(await maker.make(new Blob(['a'], { type: 'image/jpeg' })), null);
  assert.equal(workers[0].terminated, true); assert.equal(maker.unsupported, false);
  assert.equal(await maker.make(new Blob(['b'], { type: 'image/jpeg' })), null);
  assert.equal(workers.length, 2); assert.equal(maker.unsupported, true);
  assert.equal(await maker.make(new Blob(['c'], { type: 'image/jpeg' })), null); assert.equal(workers.length, 2);
});

test('a job cancelled while waiting for its turn gives up at once', async () => {
  const replies = [];
  const factory = () => ({ postMessage(message) { replies.push(message); }, terminate() {} });
  const maker = createThumbnailWorker({ factory, timeoutMs: 5000 });
  const first = maker.make(new Blob(['a'], { type: 'image/jpeg' }));
  const controller = new AbortController();
  const queued = maker.make(new Blob(['b'], { type: 'image/jpeg' }), { signal: controller.signal });
  const began = Date.now(); controller.abort();
  assert.equal(await queued, null); assert.ok(Date.now() - began < 100);
  maker.stop(); assert.equal(await first, null);
});
