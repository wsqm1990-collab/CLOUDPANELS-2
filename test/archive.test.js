import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zipSync } from 'fflate';
import { openComic, containerKind, archiveExtractor } from '../src/reader.js';

const { Archive } = await import('../node_modules/libarchive.js/dist/libarchive-node.mjs');
const extractArchive = archiveExtractor(async () => Archive);
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAMCAIAAADQ/GvKAAAAFElEQVR4nGO0rw1kwAaYsIqOaAkASFsBJZDk8iQAAAAASUVORK5CYII=', 'base64'));
function sourceFor(bytes, name) {
  const reads = [];
  return { name, size: bytes.length, reads, async read(start, end, { signal } = {}) { signal?.throwIfAborted(); reads.push([start, end]); return bytes.slice(start, end); } };
}
// Minimal ustar writer for an original synthetic CBT fixture.
function tar(entries) {
  const blocks = [];
  for (const [name, data] of entries) {
    const header = new Uint8Array(512); const put = (text, offset) => header.set(new TextEncoder().encode(text), offset);
    put(name, 0); put('0000644\0', 100); put('0000000\0', 108); put('0000000\0', 116);
    put(data.length.toString(8).padStart(11, '0') + '\0', 124); put('00000000000\0', 136); put('        ', 148); put('0', 156); put('ustar\0', 257); put('00', 263);
    let sum = 0; for (const byte of header) sum += byte; put(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(header); const body = new Uint8Array(Math.ceil(data.length / 512) * 512); body.set(data); blocks.push(body);
  }
  blocks.push(new Uint8Array(1024));
  const out = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0)); let o = 0; for (const b of blocks) { out.set(b, o); o += b.length; } return out;
}
const comicInfo = new TextEncoder().encode('<ComicInfo><Title>Original Test</Title><Series>Tests</Series></ComicInfo>');

test('container sniffing ignores misleading extensions', () => {
  assert.equal(containerKind(zipSync({ 'a.png': png })), 'zip');
  assert.equal(containerKind(new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])), 'rar');
  assert.equal(containerKind(new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 4])), '7z');
  assert.equal(containerKind(png), 'image');
  assert.equal(containerKind(new TextEncoder().encode('hello world')), null);
});

test('a .cbr that is really a ZIP is read page by page like a CBZ', async () => {
  const bytes = zipSync({ '2.png': png, '1.png': png, 'pad.bin': new Uint8Array(150000).fill(3) }, { level: 0 });
  const source = sourceFor(bytes, 'Renamed.cbr');
  const comic = await openComic(source, { extractArchive: () => { throw new Error('must not fully extract'); } });
  assert.equal(comic.type, 'cbz'); assert.equal(comic.pageCount, 2);
  assert.equal((await comic.page(0)).type, 'image/png');
  assert.ok(source.reads.reduce((sum, [a, b]) => sum + b - a, 0) < bytes.length / 4);
  comic.close();
});

test('TAR comics are extracted, naturally ordered and read with ComicInfo', async () => {
  const bytes = tar([['pages/10.png', png], ['pages/2.png', png], ['pages/1.png', png], ['ComicInfo.xml', comicInfo], ['__MACOSX/._1.png', png]]);
  const progress = [];
  const comic = await openComic(sourceFor(bytes, 'Issue.cbt'), { extractArchive, onProgress: value => progress.push(value.phase) });
  assert.equal(comic.pageCount, 3);
  assert.deepEqual(comic.metadata.pageNames, ['pages/1.png', 'pages/2.png', 'pages/10.png']);
  const page = await comic.page(2);
  assert.equal(page.type, 'image/png'); assert.deepEqual(new Uint8Array(await page.arrayBuffer()), png);
  assert.ok(progress.includes('download') && progress.includes('extract'));
  comic.close(); await assert.rejects(comic.page(0), { name: 'AbortError' });
});

test('a .cbz that is really a TAR falls back to the full-archive decoder', async () => {
  const bytes = tar([['1.png', png], ['2.png', png]]);
  const comic = await openComic(sourceFor(bytes, 'Mislabelled.cbz'), { extractArchive });
  assert.equal(comic.pageCount, 2); comic.close();
});

test('real RAR v4 and v5 archives are decoded (no images => explicit message)', async () => {
  for (const name of ['test-v4.rar', 'test-v5.rar', 'lzma2.7z']) {
    const bytes = new Uint8Array(readFileSync(new URL('./fixtures/' + name, import.meta.url)));
    await assert.rejects(openComic(sourceFor(bytes, name.endsWith('7z') ? 'Issue.cb7' : 'Issue.cbr'), { extractArchive }), /No JPEG, PNG or WebP comic pages/);
  }
});

test('oversized full-archive formats are refused before downloading', async () => {
  await assert.rejects(openComic({ name: 'big.cbr', size: 301 * 1024 * 1024, async read(start, end) { if (end > 1024) throw new Error('must not download'); const head = new Uint8Array(end - start); head.set([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]); return head; } }, { extractArchive }), /300 MB/);
});

test('the cover is the first page in reading order even when stored out of order', async () => {
  const { archiveCover } = await import('../src/reader.js');
  const other = png.slice(); other[19] = 9; // a different (still valid-looking) page
  const bytes = tar([['pages/10.png', other], ['pages/02.png', other], ['notes.txt', new Uint8Array(3000)], ['pages/01.png', png], ['big.bin', new Uint8Array(300000)]]);
  const source = sourceFor(bytes, 'Issue.cbr');
  const cover = await archiveCover(source, { loadArchive: async () => Archive });
  assert.equal(cover.type, 'image/png');
  assert.deepEqual(new Uint8Array(await cover.arrayBuffer()), png);
  assert.ok(source.reads.reduce((sum, [a, b]) => sum + b - a, 0) < bytes.length / 2, 'the big entry is never downloaded');
  assert.equal(await archiveCover(sourceFor(zipSync({ 'a.png': png }), 'x.cbr'), { loadArchive: async () => Archive }), null);
});

test('a single entry of a non-solid RAR is extracted from only its own bytes', async () => {
  const { listArchive } = await import('../src/reader.js');
  for (const name of ['test-v4.rar', 'test-v5.rar']) {
    const bytes = new Uint8Array(readFileSync(new URL('./fixtures/' + name, import.meta.url)));
    const list = await listArchive(async (a, b) => bytes.slice(a, b), bytes.length, 'rar');
    assert.equal(list.complete, true, name);
    const target = list.entries.find(entry => entry.name === 'README.md');
    const synthetic = new Uint8Array([...bytes.subarray(0, list.preamble), ...bytes.subarray(target.start, target.end)]);
    const archive = await Archive.open(new Blob([synthetic]));
    const file = await archive.extractSingleFile('README.md'); await archive.close();
    assert.equal(file.size, 28, name + (list.solid ? ' (solid)' : ''));
  }
});

test('RAR v4 and v5 entry headers are listed from the start of the file', async () => {
  const { archiveHeadEntries } = await import('../src/reader.js');
  for (const name of ['test-v4.rar', 'test-v5.rar']) {
    const bytes = new Uint8Array(readFileSync(new URL('./fixtures/' + name, import.meta.url)));
    const entries = archiveHeadEntries(bytes, 'rar').filter(e => !e.directory).map(e => e.name).sort();
    assert.deepEqual(entries, ['.gitignore', 'README.md', 'addon/addon.py', 'addon/addon.xml'], name);
    const first = archiveHeadEntries(bytes, 'rar').find(e => !e.directory);
    const archive = await Archive.open(new Blob([bytes.subarray(0, first.end)]));
    const file = await archive.extractSingleFile(first.name);
    await archive.close(); assert.ok(file.size > 0, name + ' first entry extracts from a partial file');
  }
});
