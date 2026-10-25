import test from 'node:test';
import assert from 'node:assert/strict';
import { convertToCbz } from '../src/convert.js';
import { openComic, archiveExtractor } from '../src/reader.js';

const { Archive } = await import('../node_modules/libarchive.js/dist/libarchive-node.mjs');
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAMCAIAAADQ/GvKAAAAFElEQVR4nGO0rw1kwAaYsIqOaAkASFsBJZDk8iQAAAAASUVORK5CYII=', 'base64'));
function tar(entries) {
  const blocks = [];
  for (const [name, data] of entries) {
    const h = new Uint8Array(512), put = (t, o) => h.set(new TextEncoder().encode(t), o);
    put(name, 0); put('0000644\0', 100); put('0000000\0', 108); put('0000000\0', 116); put(data.length.toString(8).padStart(11, '0') + '\0', 124); put('00000000000\0', 136); put('        ', 148); put('0', 156); put('ustar\0', 257); put('00', 263);
    let sum = 0; for (const b of h) sum += b; put(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(h); const body = new Uint8Array(Math.ceil(data.length / 512) * 512); body.set(data); blocks.push(body);
  }
  blocks.push(new Uint8Array(1024));
  const out = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0)); let o = 0; for (const b of blocks) { out.set(b, o); o += b.length; } return out;
}
const src = (bytes, name) => ({ name, size: bytes.length, async read(a, b) { return bytes.slice(a, b); } });

test('a CBR/CBT is repackaged as CBZ with identical pages, names, order and ComicInfo', async () => {
  const other = png.slice(); other[19] = 9;
  const bytes = tar([['Issue/10.png', other], ['Issue/2.png', png], ['Issue/1.png', png], ['ComicInfo.xml', new TextEncoder().encode('<ComicInfo><Title>T</Title></ComicInfo>')]]);
  const phases = new Set();
  const { bytes: zip, pageCount } = await convertToCbz(src(bytes, 'Issue.cbt'), { openOptions: { extractArchive: archiveExtractor(async () => Archive) }, onProgress: p => phases.add(p.phase) });
  assert.equal(pageCount, 3); assert.ok(phases.has('pages') && phases.has('verify'));
  const cbz = await openComic(src(zip, 'Issue.cbz'));
  assert.equal(cbz.type, 'cbz');
  assert.deepEqual(cbz.metadata.pageNames, ['Issue/1.png', 'Issue/2.png', 'Issue/10.png']);
  assert.deepEqual(new Uint8Array(await (await cbz.page(2)).arrayBuffer()), other);
  cbz.close();
  assert.ok(new TextDecoder().decode(zip).includes('ComicInfo.xml'));
});
