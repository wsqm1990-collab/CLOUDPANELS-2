import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import * as SDK from '../src/megajs-browser.js';
import { MegaConnection } from '../src/mega.js';
import { LibraryStore } from '../src/store.js';

// A tiny MEGA server for the real MEGAJS code: nodes are encrypted exactly
// like MEGA does (keys with the master key, attributes with the node key).
const e64 = buffer => Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
function megaServer() {
  const masterKey = randomBytes(16);
  const helper = SDK.Storage.fromJSON({ key: e64(masterKey), sid: 'x', options: { keepalive: false } });
  const AES = helper.aes.constructor, master = helper.aes;
  const nodes = new Map();
  const encryptAttributes = (key, name) => { const packed = Buffer.from('MEGA' + JSON.stringify({ n: name })), attributes = Buffer.alloc(Math.ceil(packed.length / 16) * 16); packed.copy(attributes); new AES(Buffer.from(key)).encryptCBC(attributes); return e64(attributes); };
  const folder = (h, p, name) => { const key = randomBytes(16), sealed = Buffer.from(key); master.encryptECB(sealed); nodes.set(h, { h, p, t: 1, u: 'user0001', ts: 1, k: `user0001:${e64(sealed)}`, a: encryptAttributes(key, name) }); };
  const file = (h, p, name, s = 1000) => {
    const key = randomBytes(32), sealed = Buffer.from(key); master.encryptECB(sealed);
    const attributeKey = Buffer.alloc(16); for (let i = 0; i < 16; i++) attributeKey[i] = key[i] ^ key[16 + i];
    nodes.set(h, { h, p, t: 0, s, u: 'user0001', ts: 1, k: `user0001:${e64(sealed)}`, a: encryptAttributes(attributeKey, name) });
  };
  nodes.set('root0001', { h: 'root0001', p: '', t: 2, u: 'user0001', ts: 1 });
  nodes.set('bin00001', { h: 'bin00001', p: '', t: 4, u: 'user0001', ts: 1 });
  let fetches = 0;
  const fetch = async (url, options) => {
    const requests = JSON.parse(options.body);
    const answers = requests.map(request => {
      if (request.a === 'f') { fetches++; return { f: [...nodes.values()].map(node => ({ ...node })), ok: [], s: [], u: [] }; }
      return 0;
    });
    return new Response(JSON.stringify(answers), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { masterKey, folder, file, nodes, fetch, get fetches() { return fetches; }, move(h, parent) { nodes.set(h, { ...nodes.get(h), p: parent }); } };
}

test('with the real MEGAJS code, folders moved in MEGA appear in their new place after an update', async () => {
  const server = megaServer();
  server.folder('comics01', 'root0001', 'COMICS');
  server.folder('reading1', 'comics01', 'READING');
  server.folder('read0001', 'comics01', 'READ');
  server.folder('ultxmen1', 'reading1', 'ULTIMATE X-MEN');
  server.folder('ultvisn1', 'reading1', 'ULTIMATE VISION');
  server.folder('wanted01', 'reading1', 'WANTED');
  server.file('xmen0001', 'ultxmen1', 'Ultimate X-Men 001.cbr');
  server.file('visn0001', 'ultvisn1', 'Ultimate Vision 001.cbr');
  server.file('want0001', 'wanted01', 'Wanted 001.cbr');
  const original = globalThis.fetch; globalThis.fetch = server.fetch;
  try {
    const connection = new MegaConnection({ sdk: SDK });
    await connection.restoreRememberedSession({ version: 1, mode: 'account', key: e64(server.masterKey), sid: Buffer.alloc(43, 9).toString('base64url'), user: 'user0001', name: 'Reader' });
    const names = async id => (await connection.children(id)).map(item => item.name);
    assert.deepEqual(await names('mega:reading1'), ['ULTIMATE VISION', 'ULTIMATE X-MEN', 'WANTED']);
    const memory = new Map(), store = new LibraryStore({ storage: { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) } }); store.load();
    store.upsertComics(await connection.listComics('mega:comics01'));
    store.setProgress('mega:xmen0001', { page: 5, pageCount: 24, status: 'reading' });
    // In the MEGA app: both ULTIMATE folders go from READING to READ.
    server.move('ultxmen1', 'read0001'); server.move('ultvisn1', 'read0001');
    const before = server.fetches;
    await connection.refreshTree();
    assert.equal(server.fetches, before + 1, 'the tree was fetched again');
    assert.deepEqual(await names('mega:reading1'), ['WANTED']);
    assert.deepEqual(await names('mega:read0001'), ['ULTIMATE VISION', 'ULTIMATE X-MEN']);
    const folderId = connection.findLibraryFolder({ name: 'COMICS', samples: [{ id: 'mega:xmen0001', depth: 3 }] });
    assert.equal(folderId, 'mega:comics01');
    const result = store.reconcileLibrary([{ prefix: 'COMICS', comics: await connection.listComics(folderId) }]);
    assert.deepEqual(result, { added: 0, moved: 2, removed: 0 });
    assert.equal(store.state.comics.find(c => c.id === 'mega:xmen0001').path, 'COMICS/READ/ULTIMATE X-MEN/Ultimate X-Men 001.cbr');
    assert.equal(store.state.progress['mega:xmen0001'].page, 5);
    await connection.disconnect();
  } finally { globalThis.fetch = original; }
});

test('a folder listed by MEGA before the folder it now sits in is not lost', async () => {
  const server = megaServer();
  server.folder('comics01', 'root0001', 'COMICS');
  server.folder('reading1', 'comics01', 'READING');
  server.folder('ultxmen1', 'reading1', 'ULTIMATE X-MEN');
  server.file('xmen0001', 'ultxmen1', 'Ultimate X-Men 001.cbr');
  // READ is created after ULTIMATE X-MEN, so MEGA may list it later.
  server.folder('read0001', 'comics01', 'READ');
  const original = globalThis.fetch; globalThis.fetch = server.fetch;
  try {
    const connection = new MegaConnection({ sdk: SDK });
    await connection.restoreRememberedSession({ version: 1, mode: 'account', key: e64(server.masterKey), sid: Buffer.alloc(43, 9).toString('base64url'), user: 'user0001', name: 'Reader' });
    const names = async id => (await connection.children(id)).map(item => item.name);
    server.move('ultxmen1', 'read0001');
    assert.ok([...server.nodes.keys()].indexOf('ultxmen1') < [...server.nodes.keys()].indexOf('read0001'), 'the moved folder comes first in the list');
    await connection.refreshTree();
    assert.deepEqual(await names('mega:reading1'), []);
    assert.deepEqual(await names('mega:read0001'), ['ULTIMATE X-MEN']);
    assert.deepEqual((await connection.listComics('mega:comics01')).map(c => c.path), ['COMICS/READ/ULTIMATE X-MEN/Ultimate X-Men 001.cbr']);
    // Opening the app again (a fresh session) finds it there too.
    const again = new MegaConnection({ sdk: SDK });
    await again.restoreRememberedSession({ version: 1, mode: 'account', key: e64(server.masterKey), sid: Buffer.alloc(43, 9).toString('base64url'), user: 'user0001', name: 'Reader' });
    assert.deepEqual((await again.children('mega:read0001')).map(item => item.name), ['ULTIMATE X-MEN']);
    await again.disconnect(); await connection.disconnect();
  } finally { globalThis.fetch = original; }
});
