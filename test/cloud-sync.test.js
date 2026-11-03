import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudSync, incomingPositions, outgoingDocument, syncReadingPositions } from '../src/cloud-sync.js';
import { LibraryStore } from '../src/store.js';

const URL = 'https://example.supabase.co', KEY = 'sb_publishable_test';
const memory = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k), data }; };
// A small stand-in for the Supabase project: sign-in with refresh tokens used
// once, and one row per user that only that user can read or change.
function fakeSupabase({ users = { 'walter@example.com': 'right password' } } = {}) {
  const tokens = new Map(), refresh = new Map(), rows = new Map(); let serial = 0;
  const calls = [];
  const issue = email => { serial++; const access = `at-${serial}`, renew = `rt-${serial}`; tokens.set(access, email); refresh.set(renew, email); return { access_token: access, refresh_token: renew, expires_in: 3600, user: { id: `user-${email}`, email } }; };
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = async (url, options = {}) => {
    const { pathname, searchParams } = new globalThis.URL(url); const method = options.method || 'GET';
    calls.push(`${method} ${pathname}`);
    assert.equal(options.headers.apikey, KEY);
    const body = options.body ? JSON.parse(options.body) : undefined;
    if (pathname === '/auth/v1/token' && searchParams.get('grant_type') === 'password') {
      return users[body.email] === body.password ? json(issue(body.email)) : json({ error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400);
    }
    if (pathname === '/auth/v1/token' && searchParams.get('grant_type') === 'refresh_token') {
      const email = refresh.get(body.refresh_token); if (!email) return json({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Already Used' }, 400);
      refresh.delete(body.refresh_token); return json(issue(email));
    }
    if (pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
    const email = tokens.get(String(options.headers.authorization || '').replace(/^Bearer /, ''));
    if (!email) return json({ message: 'JWT expired' }, 401);
    if (pathname === '/rest/v1/cloudpanels_sync') {
      const row = rows.get(email);
      if (method === 'GET') return json(row ? [{ data: row.data, revision: row.revision }] : []);
      if (method === 'POST') { if (row) return json({ message: 'duplicate key' }, 409); rows.set(email, { data: body.data, revision: 1 }); return json([{ revision: 1 }], 201); }
      if (method === 'PATCH') {
        const wanted = Number(searchParams.get('revision').replace('eq.', ''));
        if (!row || row.revision !== wanted) return json([]);
        row.data = body.data; row.revision = body.revision; return json([{ revision: row.revision }]);
      }
    }
    return json({ message: 'not found' }, 404);
  };
  return { fetchImpl, rows, calls, tokens };
}
const comic = (id, name, size = 1000) => ({ id, name, size, path: `Comics/${name}`, source: 'mega', format: 'cbz' });
function library(comics) { const store = new LibraryStore({ storage: memory() }); store.upsertComics(comics); return store; }

test('signing in keeps a session on this device, never the password; a wrong password is reported', async () => {
  const server = fakeSupabase(), storage = memory();
  const cloud = createCloudSync({ url: URL, key: KEY, fetchImpl: server.fetchImpl, storage });
  assert.equal(cloud.configured, true); assert.equal(cloud.signedIn, false);
  await assert.rejects(cloud.signIn('walter@example.com', 'wrong'), { code: 'LOGIN' });
  assert.equal(await cloud.signIn(' walter@example.com ', 'right password'), 'walter@example.com');
  assert.equal(cloud.signedIn, true);
  const saved = [...storage.data.values()].join('');
  assert.ok(!saved.includes('right password')); assert.match(saved, /rt-\d/);
  // Another start of the app on this device is still signed in.
  assert.equal(createCloudSync({ url: URL, key: KEY, fetchImpl: server.fetchImpl, storage }).signedIn, true);
  await cloud.signOut(); assert.equal(cloud.signedIn, false); assert.equal(storage.data.size, 0);
  await assert.rejects(createCloudSync({ url: '', key: '', storage: memory() }).pull(), { code: 'SIGNED_OUT' });
  await assert.rejects(createCloudSync({ url: '', key: '', storage: memory() }).signIn('a@b.c', 'x'), { code: 'NOT_CONFIGURED' });
});

test('what is read on the iPad shows on the phone, even where the comic has another id', async () => {
  const server = fakeSupabase();
  const ipad = createCloudSync({ url: URL, key: KEY, fetchImpl: server.fetchImpl, storage: memory() });
  const phone = createCloudSync({ url: URL, key: KEY, fetchImpl: server.fetchImpl, storage: memory() });
  await ipad.signIn('walter@example.com', 'right password'); await phone.signIn('walter@example.com', 'right password');
  const ipadLibrary = library([comic('mega:A', 'Saga 1.cbr'), comic('mega:B', 'Saga 2.cbr')]);
  const phoneLibrary = library([comic('mega:folder:A', 'Saga 1.cbr'), comic('mega:B', 'Saga 2.cbr'), comic('mega:C', 'Only on phone.cbz')]);
  ipadLibrary.setProgress('mega:A', { page: 7, pageCount: 30, status: 'reading', updatedAt: '2026-11-03T10:00:00.000Z' });
  ipadLibrary.setProgress('mega:B', { page: 29, pageCount: 30, status: 'finished', updatedAt: '2026-11-03T09:00:00.000Z' });
  phoneLibrary.setProgress('mega:C', { page: 3, pageCount: 20, status: 'reading', updatedAt: '2026-11-03T08:00:00.000Z' });
  phoneLibrary.setProgress('mega:B', { page: 10, pageCount: 30, status: 'reading', updatedAt: '2026-11-02T09:00:00.000Z' });
  assert.deepEqual(await syncReadingPositions({ cloud: ipad, store: ipadLibrary }), { applied: 0, sent: true });
  assert.deepEqual(await syncReadingPositions({ cloud: phone, store: phoneLibrary }), { applied: 2, sent: true });
  assert.equal(phoneLibrary.state.progress['mega:folder:A'].page, 7);
  assert.equal(phoneLibrary.state.progress['mega:B'].status, 'finished');
  assert.equal(phoneLibrary.state.progress['mega:C'].page, 3, 'the phone keeps its own');
  // The iPad learns nothing it lacks, but the shared copy keeps the phone's comic.
  assert.deepEqual(await syncReadingPositions({ cloud: ipad, store: ipadLibrary }), { applied: 0, sent: false });
  const shared = server.rows.get('walter@example.com').data.progress;
  assert.deepEqual(Object.keys(shared).sort(), ['mega:A', 'mega:B', 'mega:C']);
  assert.equal(shared['mega:A'].name, 'Saga 1.cbr');
  // Marked unread on the phone later: the iPad follows.
  phoneLibrary.setProgress('mega:folder:A', { page: 0, panel: 0, pageCount: 30, status: 'unread', updatedAt: '2026-11-03T11:00:00.000Z' });
  await syncReadingPositions({ cloud: phone, store: phoneLibrary });
  await syncReadingPositions({ cloud: ipad, store: ipadLibrary });
  assert.equal(ipadLibrary.state.progress['mega:A'].status, 'unread');
});

test('the comic open in the reader is never moved by another device, and a save in between is merged', async () => {
  const server = fakeSupabase();
  const ipad = createCloudSync({ url: URL, key: KEY, fetchImpl: server.fetchImpl, storage: memory() });
  await ipad.signIn('walter@example.com', 'right password');
  const store = library([comic('mega:A', 'One.cbz'), comic('mega:B', 'Two.cbz')]);
  const remote = { v: 1, progress: { 'mega:A': { page: 9, pageCount: 20, status: 'reading', updatedAt: '2026-11-03T12:00:00.000Z' } } };
  assert.deepEqual(incomingPositions(store.state, remote, { skip: 'mega:A' }), []);
  assert.equal(incomingPositions(store.state, remote).length, 1);
  // Another device saves between this device's read and save.
  store.setProgress('mega:B', { page: 4, pageCount: 20, status: 'reading', updatedAt: '2026-11-03T12:01:00.000Z' });
  await syncReadingPositions({ cloud: ipad, store });
  const other = createCloudSync({ url: URL, key: KEY, fetchImpl: server.fetchImpl, storage: memory() });
  await other.signIn('walter@example.com', 'right password');
  const first = await ipad.pull();
  const theirs = await other.pull();
  await other.push(outgoingDocument({ comics: [comic('mega:Z', 'Three.cbz')], progress: { 'mega:Z': { page: 1, pageCount: 5, status: 'reading', updatedAt: '2026-11-03T12:02:00.000Z' } } }, theirs.data), theirs.revision);
  await assert.rejects(ipad.push(first.data, first.revision), { code: 'CONFLICT' });
  store.setProgress('mega:B', { page: 5, pageCount: 20, status: 'reading', updatedAt: '2026-11-03T12:03:00.000Z' });
  assert.deepEqual(await syncReadingPositions({ cloud: ipad, store }), { applied: 0, sent: true });
  const shared = server.rows.get('walter@example.com').data.progress;
  assert.equal(shared['mega:B'].page, 5); assert.equal(shared['mega:Z'].page, 1);
});

test('an expired session renews itself once; a reused renewal signs this device out', async () => {
  const server = fakeSupabase(); let clock = Date.parse('2026-11-03T10:00:00Z'); const storage = memory();
  const cloud = createCloudSync({ url: URL, key: KEY, fetchImpl: server.fetchImpl, storage, now: () => clock });
  await cloud.signIn('walter@example.com', 'right password');
  const stale = JSON.parse(storage.getItem('cloudpanels-cloud-sync-v1'));
  clock += 2 * 3600 * 1000;
  assert.equal(await cloud.pull(), null);
  assert.ok(server.calls.includes('POST /auth/v1/token'));
  const renewed = JSON.parse(storage.getItem('cloudpanels-cloud-sync-v1'));
  assert.notEqual(renewed.refreshToken, stale.refreshToken);
  // An old copy of the session (its renewal already used) cannot renew again.
  const old = memory(); old.setItem('cloudpanels-cloud-sync-v1', JSON.stringify(stale));
  const copy = createCloudSync({ url: URL, key: KEY, fetchImpl: server.fetchImpl, storage: old, now: () => clock });
  await assert.rejects(copy.pull(), { code: 'SIGNED_OUT' }); assert.equal(copy.signedIn, false);
});

test('a library of thousands of comics syncs at once, also when the other device uses other ids', () => {
  const comics = Array.from({ length: 6000 }, (_, i) => comic(`mega:${i}`, `Series ${i % 300} #${i} (2024).cbr`, 50e6 + i));
  const progress = {};
  comics.slice(0, 5000).forEach((c, i) => { progress[c.id] = { page: 20, panel: 0, pageCount: 21, overview: false, status: 'read', updatedAt: new Date(Date.UTC(2026, 9, 1) + i * 60000).toISOString() }; });
  const state = { comics, progress };
  let started = performance.now();
  const first = outgoingDocument(state, { v: 1, progress: {} });
  assert.equal(Object.keys(first.progress).length, 5000);
  // The same files under other ids, from another device: found by file, not added twice.
  const other = { v: 1, progress: Object.fromEntries(Object.entries(first.progress).map(([key, entry]) => [`other:${key}`, entry])) };
  const merged = outgoingDocument(state, other);
  assert.equal(Object.keys(merged.progress).length, 5000);
  assert.ok(Object.keys(merged.progress).every(key => key.startsWith('other:')));
  const newerThere = structuredClone(other); newerThere.progress['other:mega:7'].updatedAt = '2026-12-01T00:00:00.000Z'; newerThere.progress['other:mega:7'].page = 3;
  assert.deepEqual(incomingPositions(state, newerThere).map(([id, value]) => [id, value.page]), [['mega:7', 3]]);
  assert.ok(performance.now() - started < 1500, `took ${Math.round(performance.now() - started)} ms`);
});

test('the same file twice in a library is written once, under the first key', () => {
  const state = { comics: [comic('a', 'Same.cbz', 10), comic('b', 'Same.cbz', 10)], progress: {
    a: { page: 1, panel: 0, pageCount: 9, status: 'reading', updatedAt: '2026-11-01T00:00:00.000Z' },
    b: { page: 5, panel: 0, pageCount: 9, status: 'reading', updatedAt: '2026-11-02T00:00:00.000Z' } } };
  const document = outgoingDocument(state, { v: 1, progress: {} });
  assert.deepEqual(Object.keys(document.progress), ['a']);
  assert.equal(document.progress.a.page, 5);
});

test('a sync with nothing new only asks for the revision; the list is downloaded again only after another device saved', async () => {
  const server = fakeSupabase(), requests = []; let between = null;
  const fetchImpl = async (url, options = {}) => {
    const { pathname, searchParams } = new globalThis.URL(url);
    if (pathname.startsWith('/rest/')) requests.push(`${options.method || 'GET'} ${searchParams.get('select')}`);
    const response = await server.fetchImpl(url, options);
    if (between && searchParams.get('select') === 'revision' && (options.method || 'GET') === 'GET') { const run = between; between = null; await run(); }
    return response;
  };
  const phone = createCloudSync({ url: URL, key: KEY, fetchImpl, storage: memory() });
  const ipad = createCloudSync({ url: URL, key: KEY, fetchImpl: server.fetchImpl, storage: memory() });
  await phone.signIn('walter@example.com', 'right password'); await ipad.signIn('walter@example.com', 'right password');
  const store = library([comic('mega:A', 'One.cbz'), comic('mega:B', 'Two.cbz')]);
  const ipadStore = library([comic('mega:A', 'One.cbz'), comic('mega:B', 'Two.cbz')]);
  store.setProgress('mega:A', { page: 2, pageCount: 20, status: 'reading', updatedAt: '2026-11-03T10:00:00.000Z' });
  const seen = {};
  assert.deepEqual(await syncReadingPositions({ cloud: phone, store, seen }), { applied: 0, sent: true });
  assert.deepEqual(requests.splice(0), ['GET data,revision', 'POST revision']);
  // Nothing new anywhere: one small request.
  assert.deepEqual(await syncReadingPositions({ cloud: phone, store, seen, changes: false }), { applied: 0, sent: false });
  assert.deepEqual(requests.splice(0), ['GET revision']);
  // A change here: saved over the copy this device already has.
  store.setProgress('mega:A', { page: 3, pageCount: 20, status: 'reading', updatedAt: '2026-11-03T10:05:00.000Z' });
  assert.deepEqual(await syncReadingPositions({ cloud: phone, store, seen, changes: true }), { applied: 0, sent: true });
  assert.deepEqual(requests.splice(0), ['GET revision', 'PATCH revision']);
  assert.equal(server.rows.get('walter@example.com').data.progress['mega:A'].page, 3);
  // The iPad saves: the phone downloads the list again and takes the newer place.
  ipadStore.setProgress('mega:B', { page: 8, pageCount: 20, status: 'reading', updatedAt: '2026-11-03T11:00:00.000Z' });
  await syncReadingPositions({ cloud: ipad, store: ipadStore });
  assert.deepEqual(await syncReadingPositions({ cloud: phone, store, seen, changes: false }), { applied: 1, sent: false });
  assert.deepEqual(requests.splice(0), ['GET revision', 'GET data,revision']);
  assert.equal(store.state.progress['mega:B'].page, 8);
  // The iPad saves right between the phone's check and its save: merged, nothing lost.
  store.setProgress('mega:A', { page: 4, pageCount: 20, status: 'reading', updatedAt: '2026-11-03T12:00:00.000Z' });
  between = async () => { ipadStore.setProgress('mega:B', { page: 9, pageCount: 20, status: 'reading', updatedAt: '2026-11-03T12:01:00.000Z' }); await syncReadingPositions({ cloud: ipad, store: ipadStore }); };
  assert.deepEqual(await syncReadingPositions({ cloud: phone, store, seen, changes: true }), { applied: 1, sent: true });
  const shared = server.rows.get('walter@example.com').data.progress;
  assert.equal(shared['mega:A'].page, 4); assert.equal(shared['mega:B'].page, 9);
  assert.equal(seen.revision, server.rows.get('walter@example.com').revision);
});

test('a comic that was open during the last sync gets the other device\'s newer place after closing it', async () => {
  const server = fakeSupabase();
  const phone = createCloudSync({ url: URL, key: KEY, fetchImpl: server.fetchImpl, storage: memory() });
  const ipad = createCloudSync({ url: URL, key: KEY, fetchImpl: server.fetchImpl, storage: memory() });
  await phone.signIn('walter@example.com', 'right password'); await ipad.signIn('walter@example.com', 'right password');
  const store = library([comic('mega:A', 'One.cbz')]), ipadStore = library([comic('mega:A', 'One.cbz')]);
  store.setProgress('mega:A', { page: 1, pageCount: 20, status: 'reading', updatedAt: '2026-11-03T10:00:00.000Z' });
  ipadStore.setProgress('mega:A', { page: 15, pageCount: 20, status: 'reading', updatedAt: '2026-11-03T11:00:00.000Z' });
  await syncReadingPositions({ cloud: ipad, store: ipadStore });
  const seen = {};
  // Open on the phone: its place is kept.
  assert.deepEqual(await syncReadingPositions({ cloud: phone, store, seen, skip: 'mega:A' }), { applied: 0, sent: false });
  assert.equal(store.state.progress['mega:A'].page, 1);
  // Closed without reading on: the iPad's newer place comes in, with no new download.
  assert.deepEqual(await syncReadingPositions({ cloud: phone, store, seen, changes: false }), { applied: 1, sent: false });
  assert.equal(store.state.progress['mega:A'].page, 15);
});
