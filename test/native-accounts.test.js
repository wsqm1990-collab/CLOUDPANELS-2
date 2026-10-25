import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeAccounts, NativeAccountError, getNativeAccounts } from '../src/native-accounts.js';
const profileFor = id => ({ id, name: id, email: `${id}@example.test`, biometricEnabled: false, sessionToken: `test-session-${id}-01234567890123456789` });
const contextFor = id => ({ profileId: id, sessionToken: profileFor(id).sessionToken });
const withAuthentication = handler => value => ['createProfile', 'signIn', 'unlockBiometric'].includes(value.action) ? profileFor(value.payload.id || 'alice') : handler(value);

function host(handler) {
  const calls = [];
  const bridge = { onmessage: null, postMessage(text) {
    const value = JSON.parse(text); calls.push(value);
    queueMicrotask(async () => {
      const reply = await handler(value);
      if (reply !== undefined) bridge.onmessage?.({ data: JSON.stringify({ requestId: value.requestId, ok: true, result: reply }) });
    });
  } };
  return { bridge, calls };
}

test('native account RPC correlates replies, ignores spoofed requests and hides native secret errors', async () => {
  const queued = [];
  const bridge = { onmessage: null, postMessage: text => queued.push(JSON.parse(text)) };
  const client = createNativeAccounts(bridge);
  const first = client.signIn('alice', 'not-logged'), second = client.listProfiles();
  bridge.onmessage({ data: 'not json' });
  bridge.onmessage({ data: JSON.stringify({ requestId: 'unknown', ok: true, result: { id: 'intruder' } }) });
  bridge.onmessage({ data: JSON.stringify({ requestId: queued[1].requestId, ok: true, result: { profiles: [] } }) });
  bridge.onmessage({ data: JSON.stringify({ requestId: queued[0].requestId, ok: false, error: { code: 'AUTH', message: 'password=secret token=private' } }) });
  assert.deepEqual(await second, { profiles: [] });
  await assert.rejects(first, error => error instanceof NativeAccountError && error.code === 'AUTH' && !/secret|private/.test(error.message));
  assert.equal(await client.currentProfile(), null);
  assert.throws(() => client.createMetadataStore(), { code: 'LOCKED' });
  client.dispose();
  assert.equal(bridge.onmessage, null);
  assert.equal(getNativeAccounts(), null);
});

test('timed out or disposed native requests cannot be revived by late replies', async () => {
  const timers = [], sent = [];
  const bridge = { postMessage: text => sent.push(JSON.parse(text)) };
  const client = createNativeAccounts(bridge, { setTimer: callback => { timers.push(callback); return timers.length; }, clearTimer: () => {} });
  const request = client.listProfiles(); timers[0]();
  await assert.rejects(request, { code: 'NATIVE_TIMEOUT' });
  bridge.onmessage({ data: JSON.stringify({ requestId: sent[0].requestId, ok: true, result: { profiles: [] } }) });
  const pending = client.listProfiles(); client.dispose();
  await assert.rejects(pending, { code: 'NATIVE_UNAVAILABLE' });
  await assert.rejects(client.listProfiles(), { code: 'NATIVE_UNAVAILABLE' });
});

test('encrypted metadata transport round-trips large UTF-8 libraries in acknowledged bounded chunks', async () => {
  const text = JSON.stringify({ stories: Array.from({ length: 8000 }, (_, id) => ({ id, title: 'Batman · ação · 日本語 🦇' })) });
  const source = new TextEncoder().encode(text), chunks = [];
  let writing = false, readIndex = 0;
  const { bridge, calls } = host(withAuthentication(async ({ action, payload }) => {
    assert.deepEqual(payload.context, contextFor('alice'));
    if (action === 'libraryWriteBegin') { assert.equal(writing, false); writing = true; assert.equal(payload.bytes, source.length); return { transferId: 'write' }; }
    if (action === 'libraryWriteChunk') { assert.equal(payload.transferId, 'write'); assert.equal(payload.index, chunks.length); const value = Buffer.from(payload.data, 'base64'); assert.ok(value.length <= 48 * 1024); chunks.push(value); return {}; }
    if (action === 'libraryWriteEnd') { assert.equal(Buffer.concat(chunks).toString('utf8'), text); writing = false; return {}; }
    if (action === 'libraryReadBegin') { assert.equal(writing, false); return { transferId: 'read', bytes: source.length }; }
    if (action === 'libraryReadChunk') { assert.equal(payload.index, readIndex++); const start = payload.index * 48 * 1024, end = Math.min(source.length, start + 48 * 1024); return { data: Buffer.from(source.subarray(start, end)).toString('base64'), done: end === source.length }; }
    throw new Error('Unexpected native action');
  }));
  const client = createNativeAccounts(bridge);
  const publicAccount = await client.signIn('alice', 'account-password');
  assert.equal(Object.hasOwn(publicAccount, 'sessionToken'), false);
  const metadata = client.createMetadataStore();
  // Concurrent callers are serialized across an entire transfer, not per chunk.
  const write = metadata.write(text), read = metadata.read();
  await write; assert.equal(await read, text);
  assert.ok(chunks.length > 3);
  assert.ok(calls.findIndex(call => call.action === 'libraryReadBegin') > calls.findIndex(call => call.action === 'libraryWriteEnd'));
  client.dispose();
});

test('truncated or malformed metadata cancels the transfer instead of returning a partial library', async () => {
  const { bridge, calls } = host(withAuthentication(async ({ action, payload }) => {
    assert.deepEqual(payload.context, contextFor('alice'));
    if (action === 'libraryReadBegin') return { transferId: 'read', bytes: 8 };
    if (action === 'libraryReadChunk') return { data: Buffer.from('short').toString('base64'), done: true };
    if (action === 'libraryCancel') return {};
  }));
  const client = createNativeAccounts(bridge);
  await client.signIn('alice', 'account-password');
  await assert.rejects(client.createMetadataStore().read(), { code: 'INVALID_LIBRARY_TRANSFER' });
  await Promise.resolve();
  assert.equal(calls.at(-1).action, 'libraryCancel'); client.dispose();
});

test('session records use the agreed native record payload and never enter metadata transfer actions', async () => {
  const { bridge, calls } = host(withAuthentication(async () => ({})));
  const client = createNativeAccounts(bridge), record = { session: { version: 1, mode: 'account', sid: 'private' }, folder: { id: 'mega:abc' } };
  await client.signIn('alice', 'account-password');
  await client.saveSession(record); await client.canImportLegacyLibrary(); await client.finishLegacyMigration();
  assert.deepEqual(calls[1].payload, { record, context: contextFor('alice') });
  assert.equal(JSON.stringify(record).includes(profileFor('alice').sessionToken), false);
  assert.deepEqual(calls.slice(1).map(call => call.action), ['saveSession', 'canImportLegacyLibrary', 'finishLegacyMigration']);
  client.dispose();
});

test('queued and in-flight metadata from account A never inherit account B authentication', async () => {
  let activeId, releaseFirstBegin, signalFirstBegin;
  const firstBegin = new Promise(resolve => { signalFirstBegin = resolve; });
  const heldBegin = new Promise(resolve => { releaseFirstBegin = resolve; });
  const stored = new Map(), chunks = [];
  const { bridge, calls } = host(async ({ action, payload }) => {
    if (action === 'signIn') { activeId = payload.id; return profileFor(activeId); }
    assert.deepEqual(payload.context, contextFor(activeId));
    if (action === 'libraryWriteBegin' && activeId === 'alice') { signalFirstBegin(); await heldBegin; return { transferId: 'old-alice' }; }
    if (action === 'libraryWriteBegin') return { transferId: 'write-bob' };
    if (action === 'libraryWriteChunk') { assert.equal(payload.transferId, 'write-bob'); chunks.push(Buffer.from(payload.data, 'base64')); return {}; }
    if (action === 'libraryWriteEnd') { stored.set(activeId, Buffer.concat(chunks).toString('utf8')); return {}; }
    if (action === 'libraryCancel') return {};
    throw new Error('Unexpected native action');
  });
  const client = createNativeAccounts(bridge);
  await client.signIn('alice', 'alice-password'); const aliceLibrary = client.createMetadataStore();
  const writingAlice = aliceLibrary.write('private Alice library'), queuedAlice = aliceLibrary.write('queued Alice library');
  const firstRejected = assert.rejects(writingAlice, { code: 'LOCKED' }), queuedRejected = assert.rejects(queuedAlice, { code: 'LOCKED' });
  await firstBegin;
  await client.signIn('bob', 'bob-password'); const bobLibrary = client.createMetadataStore();
  releaseFirstBegin(); await firstRejected; await queuedRejected;
  await bobLibrary.write('Bob library');
  assert.equal(stored.has('alice'), false); assert.equal(stored.get('bob'), 'Bob library');
  assert.equal(calls.filter(call => call.action === 'libraryWriteBegin' && call.payload.context.profileId === 'alice').length, 1);
  assert.ok(calls.filter(call => call.action === 'libraryWriteChunk').every(call => call.payload.context.profileId === 'bob'));
  const before = calls.length;
  await assert.rejects(aliceLibrary.read(), { code: 'LOCKED' });
  assert.equal(calls.length, before); client.dispose();
});

test('out-of-order authentication replies cannot replace the most recent account context', async () => {
  const sent = [], bridge = { postMessage: text => sent.push(JSON.parse(text)) };
  const reply = (request, result) => bridge.onmessage({ data: JSON.stringify({ requestId: request.requestId, ok: true, result }) });
  const client = createNativeAccounts(bridge);
  const alice = client.signIn('alice', 'alice-password'), aliceRejected = assert.rejects(alice, { code: 'STALE_AUTH' });
  const bob = client.unlockBiometric('bob');
  reply(sent[1], profileFor('bob')); assert.equal((await bob).id, 'bob');
  reply(sent[0], profileFor('alice')); await aliceRejected;
  const loaded = client.loadSession(); assert.deepEqual(sent[2].payload.context, contextFor('bob'));
  reply(sent[2], { owner: 'bob' }); assert.deepEqual(await loaded, { owner: 'bob' }); client.dispose();
});

test('late current-profile and logout replies cannot revive or clear a newer authentication', async () => {
  const sent = [], bridge = { postMessage: text => sent.push(JSON.parse(text)) };
  const reply = (request, result) => bridge.onmessage({ data: JSON.stringify({ requestId: request.requestId, ok: true, result }) });
  const client = createNativeAccounts(bridge);
  const alice = client.signIn('alice', 'alice-password'); reply(sent[0], profileFor('alice')); await alice;
  const previousProfile = client.currentProfile(), previousRejected = assert.rejects(previousProfile, { code: 'LOCKED' });
  const loggingOut = client.logout(); assert.deepEqual(sent[2].payload.context, contextFor('alice'));
  assert.equal(await client.currentProfile(), null);
  const bob = client.signIn('bob', 'bob-password'); reply(sent[3], profileFor('bob')); await bob;
  reply(sent[1], profileFor('alice')); await previousRejected;
  reply(sent[2], true); assert.equal(await loggingOut, true);
  const session = client.loadSession(); assert.deepEqual(sent[4].payload.context, contextFor('bob'));
  reply(sent[4], null); assert.equal(await session, null); client.dispose();
});

test('invalid auth responses never unlock a backend and profile preferences keep tokens private', async () => {
  const { bridge, calls } = host(async ({ action, payload }) => {
    if (action === 'createProfile') return { id: 'alice', name: 'Alice' }; // No authenticated session token.
    if (action === 'signIn') return profileFor(payload.id);
    if (action === 'enableBiometric') { assert.deepEqual(payload.context, contextFor('alice')); return { id: 'alice', name: 'Alice', biometricEnabled: true }; }
  });
  const client = createNativeAccounts(bridge);
  await assert.rejects(client.createProfile({ name: 'Alice', password: 'account-password' }), { code: 'INVALID_AUTH_RESPONSE' });
  assert.throws(() => client.createMetadataStore(), { code: 'LOCKED' });
  const publicAccount = await client.signIn('alice', 'account-password');
  const enabled = await client.enableBiometric(); assert.equal(enabled.biometricEnabled, true);
  assert.equal(Object.hasOwn(publicAccount, 'sessionToken'), false); assert.equal(Object.hasOwn(enabled, 'sessionToken'), false);
  assert.equal(calls.filter(call => call.action.startsWith('library')).length, 0); client.dispose();
});
