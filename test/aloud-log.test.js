import test from 'node:test';
import assert from 'node:assert/strict';
import { noteAloud, aloudEvents, listeningBeat, interruptedListening } from '../src/aloud-log.js';

const memory = () => { const data = new Map(); return { getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key), data }; };

test('the read-aloud diary keeps the latest events, short and without secrets', () => {
  const storage = memory();
  noteAloud('listen', { page: 3, screenOff: true, empty: '', none: null }, { storage, now: Date.UTC(2026, 10, 6, 12) });
  noteAloud('page failed', { why: 'Could not reach https://g.api.mega.co.nz/dl/abcdefghijklmnopqrstuvwxyz0123?x=1 for a@b.com with sk-ant-api03-secret' }, { storage });
  const [first, second] = aloudEvents({ storage });
  assert.deepEqual(first, { at: '2026-11-06T12:00:00.000Z', e: 'listen', page: 3, screenOff: true });
  assert.ok(!/secret|a@b\.com|abcdefghijklmnopqrstuvwxyz0123|x=1/.test(second.why), second.why);
  assert.ok(second.why.length <= 120);
  for (let index = 0; index < 100; index++) noteAloud('tick', { index }, { storage });
  const all = aloudEvents({ storage });
  assert.equal(all.length, 60, 'only the latest 60');
  assert.equal(all.at(-1).index, 99);
  assert.deepEqual(aloudEvents({ storage: { getItem: () => '{bad' } }), [], 'a damaged diary reads as empty');
  assert.doesNotThrow(() => noteAloud('x', {}, { storage: { getItem: () => { throw new Error('blocked'); } } }));
});

test('when the phone closes the app while reading aloud, the next start knows it (once)', () => {
  const storage = memory(), at = Date.UTC(2026, 10, 6, 12);
  listeningBeat({ id: 'mega:abc', page: 7, hidden: true }, { storage, now: at });
  const found = interruptedListening({ storage, now: at + 5 * 60000 });
  assert.deepEqual(found, { id: 'mega:abc', page: 7, hidden: true, at });
  assert.equal(interruptedListening({ storage, now: at + 6 * 60000 }), null, 'only once');
  listeningBeat({ id: 'x', page: 1 }, { storage, now: at }); listeningBeat(null, { storage });
  assert.equal(interruptedListening({ storage, now: at + 1000 }), null, 'a normal stop leaves nothing');
  listeningBeat({ id: 'x', page: 1 }, { storage, now: at });
  assert.equal(interruptedListening({ storage, now: at + 7 * 3600000 }), null, 'too long ago: not a recent reading');
});
