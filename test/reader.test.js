import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync } from 'fflate';
import { openComic, readerLimits } from '../src/reader.js';

// Valid 8 × 12 RGB PNG (decoded with Pillow before using this fixture).
// Padding files make the footer substantially smaller than
// the edition, so a test cannot accidentally pass with a whole-book download.
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAMCAIAAADQ/GvKAAAAFElEQVR4nGO0rw1kwAaYsIqOaAkASFsBJZDk8iQAAAAASUVORK5CYII=', 'base64'));
const u16 = (bytes, offset) => bytes[offset] | bytes[offset + 1] << 8;
const u32 = (bytes, offset) => (bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16 | bytes[offset + 3] << 24) >>> 0;
function set16(bytes, offset, value) { new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(offset, value, true); }
function set32(bytes, offset, value) { new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true); }
function fixture(level = 0) {
  return zipSync({ '10.png': png, '2.png': png, '1.png': png, 'unread-padding.bin': new Uint8Array(120000).fill(87) }, { level });
}
function sourceFor(bytes, name = 'sample.cbz') {
  const reads = [];
  return { name, size: bytes.length, reads, async read(start, end, { signal } = {}) {
    signal?.throwIfAborted(); reads.push([start, end]); return bytes.slice(start, end);
  } };
}
function firstCentral(bytes) { const eocd = bytes.length - 22; assert.equal(u32(bytes, eocd), 0x06054b50); return u32(bytes, eocd + 16); }

test('CBZ indexes footer/directory only, orders naturally and fetches selected page intervals', async () => {
  const source = sourceFor(fixture()); const comic = await openComic(source);
  assert.equal(comic.pageCount, 3); assert.equal(comic.type, 'cbz');
  assert.deepEqual(comic.metadata.pageNames, ['1.png', '2.png', '10.png']);
  assert.ok(source.reads.every(([start]) => start > 0), 'opening does not fetch first file or the edition');
  assert.ok(source.reads.reduce((sum, [a, b]) => sum + b - a, 0) < 2048);
  const blob = await comic.page(1);
  assert.equal(blob.type, 'image/png'); assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), png);
  const requests = source.reads.length; await comic.page(1); assert.equal(source.reads.length, requests, 'recent page is reused');
  assert.ok(source.reads.every(([a, b]) => b - a < source.size));
  assert.ok(source.reads.reduce((sum, [a, b]) => sum + b - a, 0) < source.size / 20);
  comic.close(); await assert.rejects(comic.page(0), { name: 'AbortError' });
});

test('deflated pages are decompressed and verified', async () => {
  const comic = await openComic(sourceFor(fixture(6)));
  assert.deepEqual(new Uint8Array(await (await comic.page(0)).arrayBuffer()), png); comic.close();
});

test('only two recently used image pages are retained', async () => {
  const source = sourceFor(fixture()); const comic = await openComic(source);
  await comic.page(0); await comic.page(1); await comic.page(2);
  const after = source.reads.length; await comic.page(0); assert.ok(source.reads.length > after); comic.close();
});

test('CRC rejects a changed selected page', async () => {
  const data = fixture(); const cd = firstCentral(data); const local = u32(data, cd + 42);
  data[local + 30 + u16(data, local + 26) + u16(data, local + 28) + 10] ^= 1;
  const comic = await openComic(sourceFor(data));
  await assert.rejects(comic.page(2), /integrity check/); comic.close();
});

test('invalid actual inflated length is rejected without trusting advertised length', async () => {
  const data = fixture(6), cd = firstCentral(data), local = u32(data, cd + 42);
  set32(data, cd + 24, 4); set32(data, local + 22, 4);
  const comic = await openComic(sourceFor(data));
  await assert.rejects(comic.page(2), /declared size/); comic.close();
});

test('traversal and absolute paths are refused before page requests', async () => {
  for (const name of ['../1.png', '/1.png', 'C:/1.png', 'a/../../1.png']) {
    await assert.rejects(openComic(sourceFor(zipSync({ [name]: png }))), /unsafe file path/);
  }
});

test('encrypted, split and ZIP64 containers fail with an actionable reason', async () => {
  let bytes = fixture(); set16(bytes, firstCentral(bytes) + 8, 1);
  await assert.rejects(openComic(sourceFor(bytes)), /Password-protected/);
  bytes = fixture(); set16(bytes, bytes.length - 22 + 4, 1);
  await assert.rejects(openComic(sourceFor(bytes)), /Split ZIP/);
  bytes = fixture(); set32(bytes, bytes.length - 22 + 16, 0xffffffff);
  // ZIP64 variants are handed to the full-archive decoder instead of failing.
  await assert.rejects(openComic(sourceFor(bytes), { extractArchive: async () => { throw new Error('full archive decoder used'); } }), /full archive decoder used/);
});

test('oversized entries and central directories are rejected before allocation', async () => {
  let bytes = fixture(); set32(bytes, firstCentral(bytes) + 24, readerLimits.entry + 1);
  await assert.rejects(openComic(sourceFor(bytes)), /48 MB/);
  bytes = fixture(); set32(bytes, bytes.length - 22 + 12, readerLimits.directory + 1);
  await assert.rejects(openComic(sourceFor(bytes)), /16 MB/);
});

test('unsupported image compression and changed local headers are rejected', async () => {
  let bytes = fixture(); set16(bytes, firstCentral(bytes) + 10, 12);
  await assert.rejects(openComic(sourceFor(bytes), { extractArchive: async () => { throw new Error('full archive decoder used'); } }), /full archive decoder used/);
  bytes = fixture(); const cd = firstCentral(bytes); const local = u32(bytes, cd + 42);
  set16(bytes, local + 8, 8);
  const comic = await openComic(sourceFor(bytes));
  await assert.rejects(comic.page(2), /header does not match/); comic.close();
});

test('archive filename mismatches, duplicates and missing image pages are refused', async () => {
  let bytes = fixture(); const cd = firstCentral(bytes); const local = u32(bytes, cd + 42);
  bytes[local + 30] = 65;
  const comic = await openComic(sourceFor(bytes));
  await assert.rejects(comic.page(2), /filename does not match/); comic.close();
  bytes = fixture(); const first = firstCentral(bytes); const second = first + 46 + u16(bytes, first + 28) + u16(bytes, first + 30) + u16(bytes, first + 32);
  // Both 2.png and 1.png have the same five-byte name.
  const third = second + 46 + u16(bytes, second + 28) + u16(bytes, second + 30) + u16(bytes, second + 32);
  bytes.set(bytes.slice(second + 46, second + 51), third + 46);
  await assert.rejects(openComic(sourceFor(bytes)), /duplicate filenames/);
  await assert.rejects(openComic(sourceFor(zipSync({ 'hello.txt': new TextEncoder().encode('hello') }))), /No JPEG/);
});

test('short or malformed sources cannot silently return partial pages', async () => {
  await assert.rejects(openComic(sourceFor(new Uint8Array(10))), /incomplete/);
  const source = sourceFor(fixture()); source.read = async () => new Uint8Array(1);
  await assert.rejects(openComic(source), /incomplete page/);
  await assert.rejects(openComic({ size: Number.MAX_SAFE_INTEGER + 1, name: 'x.cbz', read() {} }), /invalid size/);
});

test('footer scanning handles a ZIP comment without issuing a whole-file read', async () => {
  const original = fixture(); const bytes = new Uint8Array(original.length + 100); bytes.set(original);
  set16(bytes, original.length - 2, 100);
  const source = sourceFor(bytes), comic = await openComic(source);
  assert.equal(comic.pageCount, 3);
  assert.ok(source.reads.every(([a, b]) => b - a < source.size)); comic.close();
});

test('pre-cancelled and per-page cancellation do not perform requests', async () => {
  const source = sourceFor(fixture()); const controller = new AbortController(); controller.abort();
  await assert.rejects(openComic(source, { signal: controller.signal }), { name: 'AbortError' }); assert.equal(source.reads.length, 0);
  const comic = await openComic(source); const reads = source.reads.length;
  await assert.rejects(comic.page(0, { signal: controller.signal }), { name: 'AbortError' }); assert.equal(source.reads.length, reads); comic.close();
});

test('unsupported formats and oversized PDFs have explicit web-reader explanations', async () => {
  await assert.rejects(openComic(sourceFor(new TextEncoder().encode('not an archive at all'), 'issue.cbr')), /not a recognizable comic archive/);
  await assert.rejects(openComic(sourceFor(png, 'issue.doc')), /Choose a CBZ, CBR/);
  await assert.rejects(openComic({ name: 'large.pdf', size: readerLimits.pdf + 1, read() { throw new Error('must not read'); } }), /128 MB/);
});

test('individual image reading validates magic bytes and page indices', async () => {
  const comic = await openComic(sourceFor(png, '1.png'));
  assert.equal(comic.pageCount, 1); assert.equal((await comic.page(0)).type, 'image/png');
  await assert.rejects(comic.page(1), /does not exist/); comic.close();
  const wrong = await openComic(sourceFor(new TextEncoder().encode('<svg/>'), 'wrong.png'));
  await assert.rejects(wrong.page(0), /not a supported/); wrong.close();
});

test('compressed image pixel dimensions are capped before browser decoding', async () => {
  const huge = png.slice(); const view = new DataView(huge.buffer);
  view.setUint32(16, 10000); view.setUint32(20, 10000);
  const comic = await openComic(sourceFor(zipSync({ '1.png': huge })));
  await assert.rejects(comic.page(0), /24-megapixel/); comic.close();
});
