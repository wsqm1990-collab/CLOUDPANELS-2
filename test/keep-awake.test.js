import test from 'node:test';
import assert from 'node:assert/strict';
import { createKeepAwake, KEEP_AWAKE_IDLE_MS } from '../src/keep-awake.js';

function fakeTimers() {
  let now = 0, next = 1; const timers = new Map();
  return {
    setTimer: (callback, ms) => { const id = next++; timers.set(id, { at: now + ms, callback }); return id; },
    clearTimer: id => { timers.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, entry] of [...timers].sort((a, b) => a[1].at - b[1].at)) if (entry.at <= now) { timers.delete(id); entry.callback(); }
    },
    get pending() { return timers.size; },
  };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test('the iPad app is asked to keep the screen on while a comic is open', () => {
  const sent = [], clock = fakeTimers();
  const win = { webkit: { messageHandlers: { keepAwake: { postMessage: value => sent.push(value) } } } };
  const keep = createKeepAwake({ win, doc: null, nav: {}, ...clock });
  keep.activity();
  assert.deepEqual(sent, [], 'nothing before a comic is opened');
  keep.start();
  assert.deepEqual(sent, [true]);
  keep.activity(); keep.activity();
  assert.deepEqual(sent, [true], 'touches do not repeat the request');
  keep.stop();
  assert.deepEqual(sent, [true, false]);
  assert.equal(clock.pending, 0);
});

test('after a long time without a touch the screen may turn off again, and a touch wakes it', () => {
  const sent = [], clock = fakeTimers();
  const win = { webkit: { messageHandlers: { keepAwake: { postMessage: value => sent.push(value) } } } };
  const keep = createKeepAwake({ win, doc: null, nav: {}, ...clock });
  keep.start();
  clock.advance(KEEP_AWAKE_IDLE_MS - 1000);
  keep.activity();
  clock.advance(KEEP_AWAKE_IDLE_MS - 1000);
  assert.deepEqual(sent, [true], 'each touch restarts the wait');
  clock.advance(2000);
  assert.deepEqual(sent, [true, false]);
  assert.equal(keep.awake, false);
  keep.activity();
  assert.deepEqual(sent, [true, false, true]);
  keep.stop();
});

test('in a browser the screen wake lock is held while reading and taken again after the page was hidden', async () => {
  const listeners = {}, doc = { visibilityState: 'visible', addEventListener: (name, fn) => { listeners[name] = fn; } };
  const locks = [];
  const nav = { wakeLock: { request: async kind => {
    assert.equal(kind, 'screen');
    const lock = { released: false, handlers: [], release: async () => { lock.released = true; lock.handlers.forEach(fn => fn()); }, addEventListener: (name, fn) => lock.handlers.push(fn) };
    locks.push(lock); return lock;
  } } };
  const clock = fakeTimers();
  const keep = createKeepAwake({ win: {}, doc, nav, ...clock });
  keep.start(); await flush();
  assert.equal(locks.length, 1);
  // The browser lets go when the page is hidden; coming back takes it again.
  doc.visibilityState = 'hidden'; await locks[0].release(); listeners.visibilitychange();
  assert.equal(locks.length, 1, 'no request while hidden');
  doc.visibilityState = 'visible'; listeners.visibilitychange(); await flush();
  assert.equal(locks.length, 2);
  keep.stop(); await flush();
  assert.equal(locks[1].released, true);
});

test('a refused wake lock is harmless', async () => {
  const keep = createKeepAwake({ win: {}, doc: null, nav: { wakeLock: { request: async () => { throw new Error('NotAllowedError'); } } }, ...fakeTimers() });
  keep.start(); await flush();
  keep.activity(); await flush();
  keep.stop();
  const none = createKeepAwake({ win: {}, doc: null, nav: {}, ...fakeTimers() });
  none.start(); none.stop();
});
