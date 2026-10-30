import test from 'node:test';
import assert from 'node:assert/strict';
import * as BrowserSDK from '../src/megajs-browser.js';
import { MegaConnection } from '../src/mega.js';
import { decryptMegaRange, megaCounter, megaFileCipher, webCryptoAvailable } from '../src/mega-fast-read.js';

const collect = stream => new Promise((resolve, reject) => { const parts = []; stream.on('data', part => parts.push(part)); stream.on('error', reject); stream.on('end', () => resolve(Buffer.concat(parts))); });
async function encrypted(plaintext, seed = 7) {
  const encryption = BrowserSDK.encrypt(Uint8Array.from({ length: 24 }, (_, i) => (i * 31 + seed) & 255));
  const done = collect(encryption); encryption.end(Buffer.from(plaintext)); const ciphertext = await done;
  return { ciphertext, key: encryption.key };
}
// The MEGA library's own decryption of `data` starting at `offset`.
async function libraryDecrypt(key, offset, data) {
  const stream = BrowserSDK.decrypt(key, { start: offset, disableVerification: true });
  const done = collect(stream); stream.end(Buffer.from(data)); return done;
}

test('the key and counter are derived like the MEGA library derives them', () => {
  const fileKey = Uint8Array.from({ length: 32 }, (_, i) => i * 7);
  const cipher = megaFileCipher(fileKey);
  assert.deepEqual([...cipher.key], [...Array.from({ length: 16 }, (_, i) => (i * 7) ^ ((16 + i) * 7) & 255)]);
  assert.deepEqual([...cipher.nonce], [...fileKey.slice(16, 24)]);
  assert.equal(megaFileCipher(new Uint8Array(24)), null); assert.equal(megaFileCipher('key'), null);
  const counter = megaCounter(cipher.nonce, 16 * (256 * 3 + 5));
  assert.deepEqual([...counter.slice(0, 8)], [...cipher.nonce]);
  assert.deepEqual([...counter.slice(8)], [0, 0, 0, 0, 0, 0, 3, 5]);
  assert.deepEqual([...megaCounter(cipher.nonce, 16 * 2 ** 40).slice(8)], [0, 0, 1, 0, 0, 0, 0, 0]);
  assert.throws(() => megaCounter(cipher.nonce, 15), RangeError);
});

test('Web Crypto decrypts exactly what the MEGA library encrypted, from any block', async () => {
  assert.ok(webCryptoAvailable());
  const plaintext = Uint8Array.from({ length: 1_200_000 }, (_, i) => (i * 13 + (i >> 7)) & 255);
  const { ciphertext, key } = await encrypted(plaintext);
  // Whole file, then pieces across the counter's byte carries (4 KB, 1 MB).
  for (const [offset, length] of [[0, plaintext.length], [0, 1], [16 * 255, 64], [16 * 65535 - 32, 4096], [16 * 1000, 100_003], [1_199_984, 16]]) {
    const plain = new Uint8Array(await decryptMegaRange(key, offset, ciphertext.subarray(offset, offset + length)));
    assert.ok(Buffer.from(plain).equals(Buffer.from(plaintext.subarray(offset, offset + length))), `offset ${offset} length ${length}`);
  }
});

test('far into a file, Web Crypto and the MEGA library produce the same bytes', async () => {
  const key = Uint8Array.from({ length: 32 }, (_, i) => (i * 97 + 11) & 255);
  const data = Uint8Array.from({ length: 4096 }, (_, i) => (i * 5) & 255);
  for (const offset of [16 * 0xff_ff_ff, 16 * 2 ** 33 - 16 * 3, 16 * (2 ** 44 + 255)]) {
    const ours = Buffer.from(await decryptMegaRange(key, offset, data));
    const theirs = await libraryDecrypt(key, offset, data);
    assert.ok(ours.equals(theirs), `offset ${offset}`);
  }
});

function megaFixture(plaintext, ciphertext, key, { failData = 0, status = 200, addressHangs = false } = {}) {
  const requests = [];
  const api = new BrowserSDK.API(false, { userAgent: null, fetch: async (url, options = {}) => {
    const interval = /\/(\d+)-(\d+)$/.exec(url);
    if (interval) {
      requests.push([Number(interval[1]), Number(interval[2])]);
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (failData > 0) { failData--; return new Response('nope', { status: 500 }); }
      if (status !== 200) return new Response('', { status, headers: { 'x-mega-time-left': '60' } });
      return new Response(ciphertext.subarray(Number(interval[1]), Number(interval[2]) + 1));
    }
    if (addressHangs) return new Promise(() => {});
    return new Response(JSON.stringify([{ g: 'https://download.mega.nz/fixture', s: plaintext.length }]), { headers: { 'content-type': 'application/json' } });
  } });
  const file = new BrowserSDK.File({ downloadId: '12345678', key, api });
  file.name = 'Fast.cbz'; file.size = plaintext.length;
  class TestStorage { constructor(options) { this.options = options; this.root = { nodeId: 'r', name: 'T', directory: true, children: [file] }; this.ready = Promise.resolve(this); } close(cb) { cb?.(); } }
  return { requests, connection: new MegaConnection({ sdk: { ...BrowserSDK, Storage: TestStorage } }) };
}
async function sourceFor(fixture) {
  const roots = await fixture.connection.login({ email: 'fixture@example.com', password: 'test-only' });
  const [comic] = await fixture.connection.listComics(roots[0].id);
  return fixture.connection.getSource(comic);
}

test('MEGA pages are read with Web Crypto, exact for every range', async () => {
  const plaintext = Uint8Array.from({ length: 2_000_003 }, (_, i) => (i * 11 + (i >> 10)) & 255);
  const { ciphertext, key } = await encrypted(plaintext, 3);
  const fixture = megaFixture(plaintext, ciphertext, key), source = await sourceFor(fixture);
  for (const [start, end] of [[0, 1], [0, 2_000_003], [17, 4_194], [1_048_575, 1_048_591], [1_999_990, 2_000_003], [33, 34]]) {
    const bytes = await source.read(start, end);
    assert.equal(bytes.length, end - start);
    assert.ok(Buffer.from(bytes).equals(Buffer.from(plaintext.subarray(start, end))), `range ${start}-${end}`);
    assert.equal(bytes.byteOffset, 0); assert.equal(bytes.buffer.byteLength, end - start);
  }
  assert.equal(fixture.connection.lastReadPath, 'webcrypto'); assert.equal(fixture.connection.fastFailures || 0, 0);
  // Ranges start on a 16-byte boundary and cover at least one block.
  assert.deepEqual(fixture.requests[0], [0, 15]); assert.deepEqual(fixture.requests[2], [16, 4_193]);
  await fixture.connection.disconnect();
});

test('if the fast read fails, the MEGA library reads the page instead', async () => {
  const plaintext = Uint8Array.from({ length: 70_000 }, (_, i) => (i * 3) & 255);
  const { ciphertext, key } = await encrypted(plaintext, 9);
  const fixture = megaFixture(plaintext, ciphertext, key, { failData: 1 }), source = await sourceFor(fixture);
  const bytes = await source.read(100, 60_000);
  assert.ok(Buffer.from(bytes).equals(Buffer.from(plaintext.subarray(100, 60_000))));
  assert.equal(fixture.connection.lastReadPath, 'sdk'); assert.equal(fixture.connection.fastFailures, 1);
  // The next page uses the fast read again.
  assert.ok(Buffer.from(await source.read(5, 50)).equals(Buffer.from(plaintext.subarray(5, 50))));
  assert.equal(fixture.connection.lastReadPath, 'webcrypto');
  await fixture.connection.disconnect();
});

test('a reached transfer quota is reported, and a cancelled read stops', async () => {
  const plaintext = Uint8Array.from({ length: 5000 }, (_, i) => i & 255);
  const { ciphertext, key } = await encrypted(plaintext, 5);
  const quota = megaFixture(plaintext, ciphertext, key, { status: 509 });
  await assert.rejects((await sourceFor(quota)).read(0, 100), { code: 'QUOTA' });
  await quota.connection.disconnect();
  const fixture = megaFixture(plaintext, ciphertext, key), source = await sourceFor(fixture);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(source.read(0, 100, { signal: controller.signal }), { name: 'AbortError' });
  await fixture.connection.disconnect();
});

test('a read waiting for MEGA\'s answer stops at once when cancelled or disconnected, and frees its place', async () => {
  const plaintext = Uint8Array.from({ length: 5000 }, (_, i) => i & 255);
  const { ciphertext, key } = await encrypted(plaintext, 6);
  const fixture = megaFixture(plaintext, ciphertext, key, { addressHangs: true }), source = await sourceFor(fixture);
  const controller = new AbortController();
  const reading = source.read(0, 100, { signal: controller.signal });
  await new Promise(resolve => setTimeout(resolve, 20));
  const began = Date.now(); controller.abort();
  await assert.rejects(reading, { name: 'AbortError' });
  assert.ok(Date.now() - began < 200); assert.equal(fixture.connection._activeReads, 0);
  const waiting = source.read(0, 100);
  await new Promise(resolve => setTimeout(resolve, 20));
  await fixture.connection.disconnect();
  await assert.rejects(waiting, { name: 'AbortError' });
  assert.equal(fixture.connection._activeReads, 0);
});

test('a dropped connection does not turn the fast reads off; a new connection tries them again', async () => {
  const plaintext = Uint8Array.from({ length: 9000 }, (_, i) => (i * 7) & 255);
  const { ciphertext, key } = await encrypted(plaintext, 8);
  // Every page download fails: the library's read fails as well.
  const offline = megaFixture(plaintext, ciphertext, key, { failData: 99 }), source = await sourceFor(offline);
  for (let i = 0; i < 4; i++) await assert.rejects(source.read(0, 500));
  assert.equal(offline.connection.fastFailures || 0, 0); assert.ok(!offline.connection._fastReadsOff);
  offline.connection._fastReadsOff = true; offline.connection.fastFailures = 5;
  await offline.connection.disconnect();
  assert.equal(offline.connection._fastReadsOff, false); assert.equal(offline.connection.fastFailures, 0);
});
