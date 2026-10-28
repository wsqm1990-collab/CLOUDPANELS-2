import test from 'node:test';
import assert from 'node:assert/strict';
import { PageThumbnails, pageThumbnailComicKey } from '../src/page-thumbnails.js';

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
