import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { MegaConnection, validateMegaLink, MAX_MEGA_READ } from '../src/mega.js';
import * as BrowserSDK from '../src/megajs-browser.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture({ manual = false, rejectLogin = null } = {}) {
  const calls = []; const streams = []; const storages = [];
  const bytes = Uint8Array.from({ length: 200 }, (_, i) => i);
  const comic = { nodeId: 'comic001', name: 'Adventure 10.cbz', size: bytes.length, key: 'never-persist-key', directory: false, download(options) {
    calls.push(options); const stream = new PassThrough(); streams.push(stream);
    if (!manual) queueMicrotask(() => stream.end(bytes.subarray(options.start, options.end + 1)));
    return stream;
  } };
  const image = { nodeId: 'image001', name: 'Cover.png', size: 20, directory: false };
  const unsupported = { nodeId: 'comic002', name: 'Adventure 2.cbr', size: 10, directory: false };
  const folder = { nodeId: 'folder01', name: 'Publisher', directory: true, children: [comic, image, unsupported, { nodeId: 'notes001', name: 'Notes.txt', size: 20 }] };
  const root = { nodeId: 'root0001', name: 'Cloud Drive', directory: true, children: [folder] };
  class Storage {
    constructor(options) { this.options = options; this.root = root; this.files = { root0001: root, folder01: folder, comic001: comic }; this.sid = 'secret-session'; storages.push(this); this.ready = rejectLogin ? Promise.reject(rejectLogin) : Promise.resolve(this); }
    close(callback) { this.closed = true; callback?.(); }
  }
  const linkFile = { ...root, name: 'Shared Comics', async loadAttributes() { return this; } };
  class API { constructor(keepalive, options) { this.keepalive = keepalive; this.options = options; } }
  const sdk = { Storage, API, File: { fromURL(url, options) { linkFile.api = options?.api; return linkFile; } } };
  return { connection: new MegaConnection({ sdk }), root, folder, comic, linkFile, calls, streams, bytes, storages, sdk };
}
async function connected(options) {
  const f = fixture(options);
  const roots = await f.connection.login({ email: ' reader@example.com ', password: 'private password', secondFactorCode: '123456' });
  const books = await f.connection.listComics(roots[0].id);
  return { ...f, roots, books, source: f.connection.getSource(books.find(book => book.format === 'cbz')) };
}

test('complete official HTTPS share links are accepted and phishing/credential/missing-key URLs rejected', () => {
  assert.equal(validateMegaLink('https://mega.nz/folder/12345678#abcdefghijklmnopqrstuv').kind, 'folder');
  assert.equal(validateMegaLink('https://mega.co.nz/#!12345678!abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ').kind, 'file');
  for (const value of ['https://mega.nz.evil.example/folder/12345678#abcdefghijklmnopqrstuv', 'http://mega.nz/folder/12345678#abcdefghijklmnopqrstuv', 'https://user:pass@mega.nz/folder/12345678#abcdefghijklmnopqrstuv', 'https://mega.nz/folder/12345678', 'javascript:alert(1)', 'https://mega.nz:444/folder/12345678#abcdefghijklmnopqrstuv', 'https://mega.nz/folder/12345678?key=secret#abcdefghijklmnopqrstuv']) assert.throws(() => validateMegaLink(value), { name: 'MegaConnectionError' });
});

test('login is nonpolling, does not expose credentials/session, and scrubs retained login fields', async () => {
  const f = await connected();
  const options = f.storages[0].options;
  assert.equal(options.keepalive, false); assert.equal(options.userAgent, null);
  assert.equal(options.email, 'reader@example.com'); assert.equal(options.password, undefined); assert.equal(options.secondFactorCode, undefined);
  assert.ok(f.connection.connected);
  const persisted = JSON.stringify([f.roots, f.books]);
  for (const sensitive of ['secret-session', 'never-persist-key', 'private password', 'reader@example.com', '123456']) assert.ok(!persisted.includes(sensitive));
  assert.equal(typeof f.connection.upload, 'undefined');
  await f.connection.disconnect(); assert.equal(f.connection.connected, false);
  assert.equal(f.storages[0].closed, true);
});

test('recursive indexing preserves hierarchy and natural order, skips unrelated files, identifies unreadable CBR', async () => {
  const f = await connected();
  assert.deepEqual(f.books.map(book => book.name), ['Adventure 2.cbr', 'Adventure 10.cbz', 'Cover.png']);
  assert.equal(f.books[0].readable, false); assert.equal(f.books[1].readable, true);
  assert.equal(f.books[1].parentId, 'mega:folder01');
  assert.equal(f.books[1].path, 'Cloud Drive/Publisher/Adventure 10.cbz');
  assert.deepEqual((await f.connection.children(f.roots[0].id)).map(item => item.id), ['mega:folder01']);
});

test('range reads map exclusive end to SDK inclusive end, force HTTPS, and do not fetch the edition', async () => {
  const f = await connected();
  assert.deepEqual(await f.source.read(17, 37), f.bytes.subarray(17, 37));
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].start, 17); assert.equal(f.calls[0].end, 36);
  assert.equal(f.calls[0].forceHttps, true); assert.equal(f.calls[0].maxConnections, 1);
  assert.ok(f.calls[0].end - f.calls[0].start + 1 < f.source.size);
});

test('first-byte request avoids MEGAJS end:0 EOF bug and returns exactly one byte', async () => {
  const f = await connected();
  assert.deepEqual(await f.source.read(0, 1), f.bytes.subarray(0, 1));
  assert.equal(f.calls[0].end, 1);
});

test('invalid, oversized, empty and pre-cancelled intervals never start a download', async () => {
  const f = await connected();
  for (const args of [[-1, 3], [0, 201], [3, 2], [0.5, 2], [0, NaN]]) await assert.rejects(f.source.read(...args), { code: 'RANGE' });
  assert.equal((await f.source.read(5, 5)).length, 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.source.read(0, 3, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(f.calls.length, 0);
  f.comic.size = MAX_MEGA_READ + 1;
  const large = f.connection.getSource(f.books[1]);
  await assert.rejects(large.read(0, MAX_MEGA_READ + 1), { code: 'READ_LIMIT' });
});

test('incomplete and overlong responses fail explicitly rather than returning corrupt page data', async () => {
  const f = await connected({ manual: true });
  const short = f.source.read(0, 10); await tick(); f.streams[0].end(new Uint8Array(5));
  await assert.rejects(short, { code: 'READ_SIZE' });
  const long = f.source.read(0, 10); await tick(); f.streams[1].end(new Uint8Array(11));
  await assert.rejects(long, { code: 'READ_SIZE' });
});

test('reads are bounded to two active streams and cancellation releases a slot for queued pages', async () => {
  const f = await connected({ manual: true });
  const controller = new AbortController();
  const first = f.source.read(0, 10, { signal: controller.signal });
  const firstRejected = assert.rejects(first, { name: 'AbortError' });
  const second = f.source.read(10, 20); const third = f.source.read(20, 30);
  await tick(); assert.equal(f.calls.length, 2);
  controller.abort(); await firstRejected; await tick();
  assert.equal(f.streams[0].destroyed, true); assert.equal(f.calls.length, 3);
  f.streams[1].end(f.bytes.subarray(10, 20)); f.streams[2].end(f.bytes.subarray(20, 30));
  assert.deepEqual(await second, f.bytes.subarray(10, 20)); assert.deepEqual(await third, f.bytes.subarray(20, 30));
});

test('cancelled queued requests never start and disconnect rejects active requests and stale sources', async () => {
  const f = await connected({ manual: true });
  const first = f.source.read(0, 10); const second = f.source.read(10, 20);
  const firstRejected = assert.rejects(first, { name: 'AbortError' }); const secondRejected = assert.rejects(second, { name: 'AbortError' });
  const controller = new AbortController(); const third = f.source.read(20, 30, { signal: controller.signal });
  const thirdRejected = assert.rejects(third, { name: 'AbortError' });
  controller.abort(); await thirdRejected; await tick(); assert.equal(f.calls.length, 2);
  await f.connection.disconnect(); await Promise.all([firstRejected, secondRejected]);
  assert.ok(f.streams.every(stream => stream.destroyed));
  await assert.rejects(f.source.read(0, 10), { code: 'DISCONNECTED' });
});

test('MFA and unknown upstream errors are mapped without echoing sensitive URLs', async () => {
  const f = fixture({ rejectLogin: new Error('EMFAREQUIRED (-26): Multi-Factor Authentication Required') });
  await assert.rejects(f.connection.login({ email: 'reader@example.com', password: 'secret', secondFactorCode: '123456' }), { code: 'MFA_REQUIRED' });
  assert.equal(f.storages[0].options.password, undefined); assert.equal(f.storages[0].options.secondFactorCode, undefined);
  const g = fixture({ rejectLogin: new Error('https://g.api.mega.co.nz/cs?sid=secret-session#secret-key') });
  await assert.rejects(g.connection.login({ email: 'reader@example.com', password: 'secret' }), error => error.code === 'NETWORK' && !error.message.includes('secret'));
});

test('folder links use a nonpolling isolated API and the same read-only tree boundary', async () => {
  const f = fixture();
  const roots = await f.connection.connectLink('https://mega.nz/folder/12345678#abcdefghijklmnopqrstuv');
  assert.equal(f.connection.mode, 'link'); assert.equal(f.linkFile.api.keepalive, false);
  assert.equal((await f.connection.listComics(roots[0].id)).length, 3);
  assert.ok(!JSON.stringify(roots).includes('abcdefghijklmnopqrstuv'));
  assert.equal(f.comic.api, f.linkFile.api);
});

test('persisted account comic opens after reconnect without importing its folder again', async () => {
  const f = await connected();
  const savedComic = JSON.parse(JSON.stringify(f.books.find(book => book.format === 'cbz')));
  await f.connection.disconnect();
  await f.connection.login({ email: 'reader@example.com', password: 'secret' });
  assert.equal(f.connection._nodes.has(savedComic.id), false);
  assert.deepEqual(await f.connection.getSource(savedComic).read(17, 37), f.bytes.subarray(17, 37));
});

test('persisted shared comic opens after reconnect and rebinds nested child to the isolated guarded API', async () => {
  const f = fixture();
  const url = 'https://mega.nz/folder/12345678#abcdefghijklmnopqrstuv';
  const roots = await f.connection.connectLink(url);
  const savedComic = JSON.parse(JSON.stringify((await f.connection.listComics(roots[0].id)).find(book => book.format === 'cbz')));
  await f.connection.disconnect();
  f.comic.api = { unguardedGlobalAPI: true };
  await f.connection.connectLink(url);
  assert.equal(f.connection._nodes.has(savedComic.id), false);
  assert.deepEqual(await f.connection.getSource(savedComic).read(17, 37), f.bytes.subarray(17, 37));
  assert.equal(f.comic.api, f.linkFile.api);
  assert.notEqual(f.comic.api.unguardedGlobalAPI, true);
});

test('actual SDK session is revoked through a fresh transport after reading lifetime is aborted', async () => {
  const originalFetch = globalThis.fetch; const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    assert.equal(options.signal.aborted, false);
    assert.equal(JSON.parse(options.body)[0].a, 'sml');
    return new Response('[0]', { headers: { 'content-type': 'application/json' } });
  };
  try {
    class LogoutStorage extends BrowserSDK.Storage {
      constructor(options) {
        super({ ...options, autologin: false });
        this.root = { nodeId: 'logout01', name: 'Test', directory: true, children: [] };
        this.api.sid = this.sid = 'test-session-only';
      }
    }
    const connection = new MegaConnection({ sdk: { ...BrowserSDK, Storage: LogoutStorage }, logoutTimeoutMs: 100 });
    await connection.login({ email: 'fixture@example.com', password: 'test-only' });
    const lifetime = connection._connectionController.signal;
    await connection.disconnect();
    assert.equal(lifetime.aborted, true);
    assert.equal(requests.length, 1);
    assert.equal(new URL(requests[0].url).searchParams.get('sid'), 'test-session-only');
    assert.equal(connection.connected, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('unreachable logout is time bounded and local keys/tree are still forgotten', async () => {
  const originalFetch = globalThis.fetch; let signal;
  globalThis.fetch = async (url, options) => { signal = options.signal; return new Promise(() => {}); };
  try {
    class LogoutStorage extends BrowserSDK.Storage {
      constructor(options) {
        super({ ...options, autologin: false }); this.root = { nodeId: 'logout01', name: 'Test', directory: true, children: [] };
        this.api.sid = this.sid = 'test-session-only';
      }
    }
    const connection = new MegaConnection({ sdk: { ...BrowserSDK, Storage: LogoutStorage }, logoutTimeoutMs: 15 });
    await connection.login({ email: 'fixture@example.com', password: 'test-only' });
    const started = Date.now(); await connection.disconnect();
    assert.ok(Date.now() - started < 300);
    assert.equal(signal.aborted, true); assert.equal(connection._nodes.size, 0); assert.equal(connection._storage, null);
  } finally { globalThis.fetch = originalFetch; }
});

test('SDK fetch boundary rejects HTTP and external redirects and sends no browser credentials/referrer', async () => {
  const f = await connected();
  const originalFetch = globalThis.fetch; const requests = [];
  globalThis.fetch = async (url, options) => { requests.push({ url, options }); return { ok: true }; };
  try {
    const sdkFetch = f.storages[0].options.fetch;
    await assert.rejects(sdkFetch('http://g.api.mega.co.nz/cs'), { code: 'ADDRESS' });
    await assert.rejects(sdkFetch('https://mega.nz.attacker.example/file'), { code: 'ADDRESS' });
    await sdkFetch('https://g.api.mega.co.nz/cs');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.redirect, 'error'); assert.equal(requests[0].options.credentials, 'omit'); assert.equal(requests[0].options.referrerPolicy, 'no-referrer'); assert.equal(requests[0].options.cache, 'no-store');
  } finally { globalThis.fetch = originalFetch; }
});

test('already cancelled login and index operations perform no work', async () => {
  const f = fixture(); const controller = new AbortController(); controller.abort();
  await assert.rejects(f.connection.login({ email: 'reader@example.com', password: 'secret' }, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(f.storages.length, 0);
  await assert.rejects(f.connection.listComics('missing', { signal: controller.signal }), { name: 'AbortError' });
});

test('actual MEGAJS browser build decrypts aligned remote byte ranges through the provider', async () => {
  const plaintext = Uint8Array.from({ length: 100003 }, (_, i) => i % 251);
  const encryptedChunks = [];
  const encryption = BrowserSDK.encrypt(new Uint8Array(24).fill(7));
  const encrypted = new Promise((resolve, reject) => {
    encryption.on('data', chunk => encryptedChunks.push(chunk));
    encryption.on('error', reject);
    encryption.on('end', () => resolve(Buffer.concat(encryptedChunks)));
  });
  encryption.end(plaintext.slice());
  const ciphertext = await encrypted;
  const network = [];
  const api = new BrowserSDK.API(false, { userAgent: null, fetch: async (url, options) => {
    const interval = /\/(\d+)-(\d+)$/.exec(url);
    if (interval) {
      network.push({ start: Number(interval[1]), end: Number(interval[2]) });
      return new Response(ciphertext.subarray(Number(interval[1]), Number(interval[2]) + 1));
    }
    const request = JSON.parse(options.body)[0];
    assert.equal(request.a, 'g'); assert.equal(request.ssl, 2);
    return new Response(JSON.stringify([{ g: 'https://download.mega.nz/original-fixture', s: plaintext.length }]), { headers: { 'content-type': 'application/json' } });
  } });
  const file = new BrowserSDK.File({ downloadId: '12345678', key: encryption.key, api });
  file.name = 'Original Test.cbz'; file.size = plaintext.length;
  class TestStorage {
    constructor(options) { this.options = options; this.root = { nodeId: 'testroot', name: 'Test', directory: true, children: [file] }; this.ready = Promise.resolve(this); }
    close(callback) { callback?.(); }
  }
  const connection = new MegaConnection({ sdk: { ...BrowserSDK, Storage: TestStorage } });
  const roots = await connection.login({ email: 'fixture@example.com', password: 'test-only' });
  const [comic] = await connection.listComics(roots[0].id); const source = connection.getSource(comic);
  assert.deepEqual(await source.read(17, 913), plaintext.subarray(17, 913));
  assert.deepEqual(await source.read(0, 1), plaintext.subarray(0, 1));
  // Web Crypto reads whole 16-byte blocks: the first byte comes from bytes 0-15.
  assert.deepEqual(network, [{ start: 16, end: 912 }, { start: 0, end: 15 }]);
  assert.equal(connection.lastReadPath, 'webcrypto');
  assert.ok(network.every(range => range.end - range.start + 1 < plaintext.length));
  await connection.disconnect();
});

const savedSession = () => ({ version: 1, mode: 'account', key: Buffer.alloc(16, 7).toString('base64url'),
  sid: Buffer.alloc(43, 9).toString('base64url'), user: 'original001', name: 'Original reader' });
function rememberableFixture({ reloadGate } = {}) {
  const f = fixture({ manual: true }), records = [], localCloses = [], reloads = [];
  class RememberableStorage extends f.sdk.Storage {
    constructor(options) {
      super(options); const value = savedSession();
      this.sid = value.sid; this.key = value.key; this.user = value.user; this.name = value.name;
      this.api = { sid: this.sid, fetch: options.fetch, close: () => localCloses.push(this) };
    }
    toJSON() { return { key: this.key, sid: this.sid, user: this.user, name: this.name,
      options: { ...this.options, password: 'never-export-password', secondFactorCode: '123456', token: 'never-export-option' }, extra: 'never-export-extra' }; }
    static fromJSON(record) {
      records.push(record);
      const storage = new RememberableStorage(record.options);
      storage.root = undefined; storage.files = {};
      storage.reload = async force => {
        reloads.push(force); await reloadGate;
        storage.root = f.root; storage.files = { root0001: f.root, folder01: f.folder, comic001: f.comic };
        return [f.root];
      };
      return storage;
    }
  }
  const connection = new MegaConnection({ sdk: { ...f.sdk, Storage: RememberableStorage } });
  return { ...f, connection, records, localCloses, reloads };
}

test('remembered session export is explicit, minimal, detached and excludes every SDK option', async () => {
  const f = rememberableFixture(); assert.equal(f.connection.exportRememberedSession(), null);
  await f.connection.login({ email: 'fixture@example.com', password: 'never-export-password', secondFactorCode: '123456' });
  const record = f.connection.exportRememberedSession(); assert.deepEqual(record, savedSession());
  assert.deepEqual(Object.keys(record).sort(), ['key', 'mode', 'name', 'sid', 'user', 'version']);
  assert.doesNotMatch(JSON.stringify(record), /password|123456|option|extra|email|fetch|root0001|comic001/);
  record.name = 'Changed outside'; assert.equal(f.connection.exportRememberedSession().name, 'Original reader');
  await f.connection.suspend(); assert.equal(f.connection.exportRememberedSession(), null);
  assert.equal(f.storages[0].closed, undefined); assert.equal(f.localCloses.length, 1);
});

test('restoration rejects malformed or extra saved fields before changing an active connection', async () => {
  const f = rememberableFixture(); await f.connection.login({ email: 'fixture@example.com', password: 'secret' });
  for (const record of [null, [], {}, { ...savedSession(), version: '1' }, { ...savedSession(), mode: 'other' },
    { ...savedSession(), options: { password: 'do-not-use', fetch: 'untrusted' } }, { ...savedSession(), email: 'private@example.com' },
    { ...savedSession(), key: 'short' }, { ...savedSession(), sid: 'bad token with spaces' },
    { ...savedSession(), user: 'bad/name' }, { ...savedSession(), name: 'Bad\nName' }, { ...savedSession(), name: 'x'.repeat(1025) },
    { version: 1, mode: 'link', url: 'https://mega.nz.attacker.example/folder/12345678#abcdefghijklmnopqrstuv' },
    { version: 1, mode: 'link', url: 'https://mega.nz/folder/12345678#abcdefghijklmnopqrstuv', password: 'unexpected' }]) {
    await assert.rejects(f.connection.restoreRememberedSession(record), { code: 'SESSION_RECORD' });
    assert.equal(f.connection.connected, true);
  }
  assert.equal(f.records.length, 0); assert.equal(f.localCloses.length, 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.connection.restoreRememberedSession(savedSession(), { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(f.connection.connected, true);
  await f.connection.suspend();
});

test('session restore rebuilds the tree with fresh nonpolling options and the guarded transport', async () => {
  const f = rememberableFixture();
  const input = savedSession(), unchanged = JSON.stringify(input);
  const roots = await f.connection.restoreRememberedSession(input);
  assert.equal(JSON.stringify(input), unchanged); assert.equal(f.connection.mode, 'account');
  assert.deepEqual(f.reloads, [true]); assert.equal(roots[0].id, 'mega:root0001');
  assert.deepEqual(Object.keys(f.records[0]).sort(), ['key', 'name', 'options', 'sid', 'user']);
  assert.deepEqual(Object.keys(f.records[0].options).sort(), ['fetch', 'keepalive', 'userAgent']);
  assert.equal(f.records[0].options.keepalive, false); assert.equal(f.records[0].options.userAgent, null);
  assert.equal(typeof f.records[0].options.fetch, 'function');
  await assert.rejects(f.records[0].options.fetch('https://attacker.example/session'), { code: 'ADDRESS' });
  const books = await f.connection.listComics(roots[0].id), source = f.connection.getSource(books.find(book => book.format === 'cbz'));
  const reading = source.read(17, 37); await tick(); f.streams[0].end(f.bytes.subarray(17, 37));
  assert.deepEqual(await reading, f.bytes.subarray(17, 37)); assert.equal(f.comic.api, f.storages[0].api);
  assert.equal(f.storages[0].closed, undefined);
  await f.connection.disconnect(); assert.equal(f.storages[0].closed, true);
});

test('aborting restored tree loading rejects promptly without revoking the remembered session', async () => {
  let complete; const gate = new Promise(resolve => { complete = resolve; });
  const f = rememberableFixture({ reloadGate: gate }), controller = new AbortController();
  const restoring = f.connection.restoreRememberedSession(savedSession(), { signal: controller.signal });
  const rejected = assert.rejects(restoring, { name: 'AbortError' });
  await tick(); assert.equal(f.reloads.length, 1); controller.abort(); await rejected;
  assert.equal(f.connection.connected, false); assert.equal(f.storages[0].closed, undefined);
  assert.ok(f.localCloses.length > 0); assert.equal(f.records[0].options.fetch instanceof Function, true);
  assert.throws(() => f.records[0].options.fetch('https://g.api.mega.co.nz/cs'), { name: 'AbortError' });
  complete(); await tick(); assert.equal(f.connection.connected, false); assert.equal(f.connection._storage, null);
});

test('a profile suspension cancels an in-flight restore and late reload cannot replace a newer login', async () => {
  let complete; const gate = new Promise(resolve => { complete = resolve; });
  const f = rememberableFixture({ reloadGate: gate });
  const restoring = f.connection.restoreRememberedSession(savedSession());
  const rejected = assert.rejects(restoring, { name: 'AbortError' });
  await tick(); await f.connection.suspend(); await rejected;
  await f.connection.login({ email: 'fixture@example.com', password: 'new-login' });
  const active = f.connection._storage; complete(); await tick();
  assert.equal(f.connection._storage, active); assert.equal(f.connection.connected, true);
  assert.notEqual(active, f.storages[0]); assert.equal(f.storages[0].closed, undefined);
  await f.connection.disconnect();
});

test('suspending an authenticated reader aborts pages and stale sources but does not call SDK logout', async () => {
  const f = rememberableFixture(); await f.connection.login({ email: 'fixture@example.com', password: 'secret' });
  const roots = f.connection.roots(), books = await f.connection.listComics(roots[0].id), source = f.connection.getSource(books.find(book => book.format === 'cbz'));
  const record = f.connection.exportRememberedSession(), reading = source.read(0, 10), rejected = assert.rejects(reading, { name: 'AbortError' });
  await tick(); await f.connection.suspend(); await rejected;
  assert.equal(f.storages[0].closed, undefined); assert.equal(f.streams[0].destroyed, true);
  await assert.rejects(source.read(0, 10), { code: 'DISCONNECTED' });
  assert.equal(f.connection._storage, null); assert.equal(f.connection._nodes.size, 0);
  await f.connection.restoreRememberedSession(record); assert.equal(f.connection.connected, true);
  await f.connection.disconnect(); assert.equal(f.storages[1].closed, true);
});

test('remembered share links are canonical and restore through the same isolated API without retaining a password', async () => {
  const f = fixture(), url = 'https://www.mega.nz/folder/12345678#abcdefghijklmnopqrstuv';
  await f.connection.connectLink(url);
  const record = f.connection.exportRememberedSession();
  assert.deepEqual(record, { version: 1, mode: 'link', url: url.replace('www.', '') });
  assert.equal(Object.hasOwn(record, 'options'), false);
  await f.connection.suspend(); assert.equal(f.connection.exportRememberedSession(), null);
  const roots = await f.connection.restoreRememberedSession(record);
  assert.equal(f.connection.mode, 'link'); assert.equal(roots[0].name, 'Shared Comics');
  const [folder] = await f.connection.children(roots[0].id); assert.equal(folder.id, 'mega:folder01');
  await f.connection.listComics(roots[0].id); assert.equal(f.comic.api, f.linkFile.api);
  await f.connection.suspend();
});

test('actual pinned SDK restores a saved session by guarded tree reload and only explicit disconnect revokes it', async () => {
  const originalFetch = globalThis.fetch, network = [], record = savedSession();
  globalThis.fetch = async (url, options) => {
    const request = JSON.parse(options.body)[0]; network.push(request.a);
    assert.equal(new URL(url).searchParams.get('sid'), record.sid);
    assert.equal(options.signal.aborted, false); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    if (request.a === 'f') return new Response(JSON.stringify([{ ok: [], f: [{ h: 'restore1', t: 2, ts: 1700000000 }] }]), { headers: { 'content-type': 'application/json' } });
    assert.equal(request.a, 'sml'); return new Response('[0]', { headers: { 'content-type': 'application/json' } });
  };
  try {
    const connection = new MegaConnection({ sdk: BrowserSDK });
    assert.deepEqual((await connection.restoreRememberedSession(record)).map(root => root.id), ['mega:restore1']);
    assert.deepEqual(connection.exportRememberedSession(), record);
    await connection.suspend(); assert.deepEqual(network, ['f']);
    await connection.restoreRememberedSession(record); assert.deepEqual(network, ['f', 'f']);
    await connection.disconnect(); assert.deepEqual(network, ['f', 'f', 'sml']);
  } finally { globalThis.fetch = originalFetch; }
});

test('reading history sync writes one current file in a CloudPanels folder and reads the newest', async () => {
  const { MegaConnection } = await import('../src/mega.js');
  const made = [];
  const node = (name, extra = {}) => ({ name, ...extra });
  const root = node('Cloud Drive', { directory: true, children: [] });
  root.mkdir = async name => { const folder = node(name, { directory: true, children: [], parent: root }); folder.upload = (opt, data) => { const file = node(opt.name, { size: data.length, timestamp: 100 + made.length, data, delete(_, cb) { file.deleted = true; cb(); }, async downloadBuffer() { return file.data; } }); made.push(file); folder.children.push(file); return { complete: Promise.resolve(file), on() {} }; }; root.children.push(folder); return folder; };
  const connection = new MegaConnection();
  connection.mode = 'account'; connection._storage = { root };
  assert.equal(await connection.readSyncFile(), null);
  await connection.writeSyncFile('{"v":1}');
  await connection.writeSyncFile('{"v":2}');
  const folder = root.children.find(child => child.name === 'CloudPanels');
  assert.equal(folder.children.length, 1); assert.equal(made[0].deleted, true);
  assert.equal(await connection.readSyncFile(), '{"v":2}');
  connection.mode = 'link'; assert.equal(connection.canSync, false); assert.equal(await connection.writeSyncFile('x'), false);
});

test('duplicate CloudPanels sync folders are merged into one, keeping the newest data', async () => {
  const { MegaConnection } = await import('../src/mega.js');
  const root = { name: 'Cloud Drive', directory: true, children: [] };
  const file = (text, timestamp, parent) => { const f = { name: 'cloudpanels-biblioteca.json', size: text.length, timestamp, parent, async downloadBuffer() { return new TextEncoder().encode(text); }, delete(_, cb) { cb(); } }; return f; };
  const folder = (name) => { const f = { name, directory: true, children: [], parent: root, delete(_, cb) { cb(); } }; f.upload = (opt, data) => { const n = file(new TextDecoder().decode(data), 999, f); f.children.push(n); return { complete: Promise.resolve(n), on() {} }; }; root.children.push(f); return f; };
  const a = folder('CloudPanels'), b = folder('CloudPanels'), c = folder('CloudPanels'), comics = folder('CloudPanels');
  a.children.push(file('{"old":1}', 10, a)); b.children.push(file('{"newest":1}', 30, b)); c.children.push(file('{"mid":1}', 20, c));
  comics.children.push({ name: 'Saga 01.cbr', size: 5 }); // a user folder with comics is never touched
  const connection = new MegaConnection(); connection.mode = 'account'; connection._storage = { root };
  assert.equal(await connection.readSyncFile(), '{"newest":1}');
  await connection.writeSyncFile('{"v":2}');
  const remaining = root.children.filter(f => f.name === 'CloudPanels');
  assert.equal(remaining.length, 2, 'one sync folder plus the user comics folder');
  assert.ok(remaining.includes(comics));
  const sync = remaining.find(f => f !== comics);
  assert.deepEqual(sync.children.map(f => f.name), ['cloudpanels-biblioteca.json']);
  assert.equal(await connection.readSyncFile(), '{"v":2}');
  await connection.writeSyncFile('{"v":3}');
  assert.equal(root.children.filter(f => f.name === 'CloudPanels').length, 2, 'no new folder is created');
});

test('a CBZ is uploaded in pieces next to the original; the original moves to the Rubbish Bin only when asked', async () => {
  const { MegaConnection } = await import('../src/mega.js');
  const events = [];
  const parent = { nodeId: 'folder01', name: 'Saga', directory: true, children: [] };
  const original = { nodeId: 'orig0001', name: 'Saga 01.cbr', size: 50, parent, delete(permanent, cb) { events.push(['delete', permanent]); cb(); } };
  parent.children.push(original);
  parent.upload = (opt) => {
    events.push(['upload', opt.name, opt.size]); let written = 0, resolveDone;
    const stream = { complete: new Promise(r => { resolveDone = r; }), write(chunk) { written += chunk.length; return true; }, end() { const node = { nodeId: 'new00001', name: opt.name, size: written, parent }; parent.children.push(node); resolveDone(node); }, on() {}, once() {} };
    return stream;
  };
  const connection = new MegaConnection(); connection.mode = 'account'; connection._storage = { root: parent, files: { orig0001: original } }; connection._rootNodes = [parent];
  connection._register(original, 'mega:folder01');
  const upload = await connection.startCbzUpload('mega:orig0001', 70);
  await upload.write(new Uint8Array(30)); await upload.write(new Uint8Array(40));
  const result = await upload.end();
  assert.equal(result.id, 'mega:new00001'); assert.equal(result.format, 'cbz');
  assert.deepEqual(events, [['upload', 'Saga 01.cbz', 70]]);
  await connection.moveToRubbishBin('mega:orig0001');
  assert.deepEqual(events.at(-1), ['delete', false]);
  // An incomplete upload is reported and never touches the original.
  events.length = 0;
  const short = await connection.startCbzUpload('mega:orig0001', 70);
  await short.write(new Uint8Array(10));
  await assert.rejects(short.end(), /original was kept/);
  assert.ok(!events.some(e => e[0] === 'delete'));
});

// A storage that behaves like MEGAJS: reload() only adds handles it has not
// seen, so moved or deleted nodes stay where they were unless files is reset.
function movingFixture({ treeTimeoutMs } = {}) {
  let hang = false;
  let server = {
    root0001: { t: 2, p: null, name: 'Cloud Drive' },
    hqs00001: { t: 1, p: 'root0001', name: 'HQs' },
    dc000001: { t: 1, p: 'hqs00001', name: 'DC' },
    bat00001: { t: 0, p: 'dc000001', name: 'Batman 1.cbz', size: 100 },
    bat00002: { t: 0, p: 'dc000001', name: 'Batman 2.cbz', size: 100 },
  };
  class Storage {
    constructor(options) { this.options = options; this.files = {}; this.ready = this.reload(true).then(() => this); }
    async reload() {
      if (hang) return new Promise(() => {}); // a request that never comes back
      // MEGA lists parents before their children.
      const depth = h => { let d = 0; for (let p = server[h]?.p; p && d < 50; p = server[p]?.p) d++; return d; };
      for (const [h, f] of Object.entries(server).sort((a, b) => depth(a[0]) - depth(b[0]))) {
        if (this.files[h]) continue;
        const node = { nodeId: h, name: f.name, size: f.size, directory: f.t > 0, children: [] };
        this.files[h] = node;
        if (f.t === 2) this.root = node;
        if (f.p && this.files[f.p]) { this.files[f.p].children.push(node); node.parent = this.files[f.p]; }
      }
      return [];
    }
    close(callback) { callback?.(); }
  }
  const connection = new MegaConnection({ sdk: { Storage, API: class {}, File: {} }, ...(treeTimeoutMs ? { treeTimeoutMs } : {}) });
  return { connection, setServer(next) { server = next(server); }, setHang(value) { hang = value; } };
}

test('refreshing MEGA shows folders that were moved, added or deleted elsewhere', async () => {
  const f = movingFixture();
  await f.connection.login({ email: 'reader@example.com', password: 'secret' });
  let comics = await f.connection.listComics('mega:hqs00001');
  assert.deepEqual(comics.map(c => c.path), ['HQs/DC/Batman 1.cbz', 'HQs/DC/Batman 2.cbz']);
  // Elsewhere: Batman moves to its own folder, a new comic appears, one is deleted, HQs is renamed.
  f.setServer(server => {
    const next = { ...server, hqs00001: { ...server.hqs00001, name: 'Quadrinhos' }, batf0001: { t: 1, p: 'hqs00001', name: 'Batman' }, new00001: { t: 0, p: 'batf0001', name: 'Batman 3.cbz', size: 100 } };
    next.bat00001 = { ...server.bat00001, p: 'batf0001' }; delete next.bat00002;
    return next;
  });
  assert.equal(await f.connection.refreshTree(), true);
  comics = await f.connection.listComics('mega:hqs00001');
  assert.deepEqual(comics.map(c => c.path), ['Quadrinhos/Batman/Batman 1.cbz', 'Quadrinhos/Batman/Batman 3.cbz']);
  // The library folder is found again from its comics even without the remembered id.
  assert.equal(f.connection.findLibraryFolder({ name: 'HQs', samples: [{ id: 'mega:bat00001', depth: 2 }] }), 'mega:hqs00001');
  assert.equal(f.connection.findLibraryFolder({ name: 'HQs', samples: [], hintId: 'mega:hqs00001' }), 'mega:hqs00001');
  assert.equal(f.connection.findLibraryFolder({ name: 'Quadrinhos', samples: [] }), 'mega:hqs00001');
  assert.equal(f.connection.findLibraryFolder({ name: 'Nowhere', samples: [] }), null);
});

import { LibraryStore } from '../src/store.js';
test('end to end: folders moved in the MEGA app show up in the library after an update', async () => {
  const f = movingFixture();
  await f.connection.login({ email: 'reader@example.com', password: 'secret' });
  const memory = new Map(), store = new LibraryStore({ storage: { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) } }); store.load();
  store.upsertComics(await f.connection.listComics('mega:hqs00001'));
  store.setProgress('mega:bat00001', { page: 4, pageCount: 20, status: 'reading' });
  f.setServer(server => { const next = { ...server, batf0001: { t: 1, p: 'hqs00001', name: 'Batman' }, new00001: { t: 0, p: 'batf0001', name: 'Batman 3.cbz', size: 100 } }; next.bat00001 = { ...server.bat00001, p: 'batf0001' }; return next; });
  // What the app does when it updates the library (see refreshLibrary in app.js).
  await f.connection.refreshTree();
  const roots = new Map();
  for (const comic of store.state.comics) { const parts = comic.path.split('/'); if (!roots.has(parts[0])) roots.set(parts[0], []); roots.get(parts[0]).push({ id: comic.id, depth: parts.length - 1 }); }
  const listings = [];
  for (const [name, samples] of roots) { const id = f.connection.findLibraryFolder({ name, samples }); if (id) listings.push({ prefix: name, comics: await f.connection.listComics(id) }); }
  const result = store.reconcileLibrary(listings);
  assert.deepEqual(result, { added: 1, moved: 1, removed: 0 });
  assert.deepEqual(store.state.comics.map(c => c.path).sort(), ['HQs/Batman/Batman 1.cbz', 'HQs/Batman/Batman 3.cbz', 'HQs/DC/Batman 2.cbz']);
  assert.equal(store.state.progress['mega:bat00001'].page, 4);
});

test('a MEGA refresh that never hears back gives up, keeps the old folders and the next refresh works', async () => {
  const f = movingFixture({ treeTimeoutMs: 40 });
  await f.connection.login({ email: 'reader@example.com', password: 'secret' });
  const loadedAt = f.connection.treeLoadedAt;
  assert.ok(loadedAt > 0);
  f.setServer(server => ({ ...server, bat00001: { ...server.bat00001, p: 'hqs00001' } }));
  f.setHang(true);
  await assert.rejects(f.connection.refreshTree(), error => error.code === 'TREE_TIMEOUT');
  // Nothing was lost while waiting: the folders loaded before are still there.
  assert.deepEqual((await f.connection.listComics('mega:hqs00001')).map(c => c.path), ['HQs/DC/Batman 1.cbz', 'HQs/DC/Batman 2.cbz']);
  assert.equal(f.connection.treeLoadedAt, loadedAt);
  // MEGA answers again: the next refresh is not stuck behind the failed one.
  f.setHang(false);
  assert.equal(await f.connection.refreshTree(), true);
  assert.deepEqual((await f.connection.listComics('mega:hqs00001')).map(c => c.path), ['HQs/Batman 1.cbz', 'HQs/DC/Batman 2.cbz']);
  assert.ok(f.connection.treeLoadedAt >= loadedAt);
  assert.equal(f.connection.treeSize, 5);
});

test('reconnecting never waits behind a refresh left over from the old connection', async () => {
  const f = movingFixture({ treeTimeoutMs: 60000 });
  await f.connection.login({ email: 'reader@example.com', password: 'secret' });
  f.setHang(true);
  const stale = f.connection.refreshTree();
  stale.catch(() => {});
  assert.equal(f.connection.refreshTree(), stale, 'callers share the refresh that is running');
  f.setHang(false);
  await f.connection.login({ email: 'reader@example.com', password: 'secret' });
  await assert.rejects(stale, error => error.name === 'AbortError');
  const fresh = f.connection.refreshTree();
  assert.notEqual(fresh, stale);
  assert.equal(await fresh, true);
});
