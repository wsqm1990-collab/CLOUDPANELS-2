import test from 'node:test';
import assert from 'node:assert/strict';
import * as BrowserSDK from '../src/megajs-browser.js';
import { MegaConnection } from '../src/mega.js';

// The network delivers bodies in arbitrary pieces, some smaller than one AES
// block. Every range must still decrypt to exactly the original bytes.
test('MEGA range reads stay exact when the network splits data into odd pieces', async () => {
  const plaintext = Uint8Array.from({ length: 3_000_017 }, (_, i) => (i * 7 + (i >> 9)) & 255);
  const encryptedChunks = [];
  const encryption = BrowserSDK.encrypt(new Uint8Array(24).fill(3));
  const encrypted = new Promise((resolve, reject) => { encryption.on('data', c => encryptedChunks.push(c)); encryption.on('error', reject); encryption.on('end', () => resolve(Buffer.concat(encryptedChunks))); });
  encryption.end(plaintext.slice());
  const ciphertext = await encrypted;
  let seed = 12345; const rand = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const api = new BrowserSDK.API(false, { userAgent: null, fetch: async (url, options) => {
    const interval = /\/(\d+)-(\d+)$/.exec(url);
    if (interval) {
      const body = ciphertext.subarray(Number(interval[1]), Number(interval[2]) + 1);
      let at = 0;
      const stream = new ReadableStream({ pull(controller) {
        if (at >= body.length) { controller.close(); return; }
        const size = rand(4) === 0 ? 1 + rand(15) : 1 + rand(70000);
        controller.enqueue(new Uint8Array(body.subarray(at, at + size))); at += size;
      } });
      return new Response(stream);
    }
    return new Response(JSON.stringify([{ g: 'https://download.mega.nz/fixture', s: plaintext.length }]), { headers: { 'content-type': 'application/json' } });
  } });
  const file = new BrowserSDK.File({ downloadId: '12345678', key: encryption.key, api });
  file.name = 'Big.cbr'; file.size = plaintext.length;
  class TestStorage { constructor(options) { this.options = options; this.root = { nodeId: 'r', name: 'T', directory: true, children: [file] }; this.ready = Promise.resolve(this); } close(cb) { cb?.(); } }
  const connection = new MegaConnection({ sdk: { ...BrowserSDK, Storage: TestStorage } });
  const roots = await connection.login({ email: 'fixture@example.com', password: 'test-only' });
  const [comic] = await connection.listComics(roots[0].id); const source = connection.getSource(comic);
  for (const [start, end] of [[29, 2411138], [0, 3_000_017], [5, 21], [1_000_003, 1_000_004], [2_411_138, 3_000_000]]) {
    for (let round = 0; round < 3; round++) {
      const bytes = await source.read(start, end);
      assert.equal(bytes.length, end - start);
      assert.ok(Buffer.from(bytes).equals(Buffer.from(plaintext.subarray(start, end))), `range ${start}-${end} round ${round}`);
    }
  }
  await connection.disconnect();
});
