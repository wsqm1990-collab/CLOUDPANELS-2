import test from 'node:test';
import assert from 'node:assert/strict';
import { createReaderNavigationTimer } from '../src/reader-navigation.js';

function clock() {
  let time = 0, next = 0;
  const pending = new Map(), changes = [];
  const timer = createReaderNavigationTimer({ onChange: visible => changes.push(visible),
    setTimer: (run, delay) => { const id = ++next; pending.set(id, { run, at: time + delay }); return id; },
    clearTimer: id => pending.delete(id),
  });
  function advance(milliseconds) {
    const end = time + milliseconds;
    for (;;) {
      const entry = [...pending].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      time = entry[1].at; pending.delete(entry[0]); entry[1].run();
    }
    time = end;
  }
  return { timer, changes, advance, pending };
}

test('page or viewport refreshes cannot reveal navigation or extend its deadline', () => {
  const { timer, changes, advance } = clock();
  timer.update({ available: true, seconds: 3 }); assert.equal(timer.visible, false);
  timer.reveal(); advance(2000);
  for (let i = 0; i < 50; i++) timer.update({ available: true, seconds: 3 });
  advance(999); assert.equal(timer.visible, true);
  advance(1); assert.equal(timer.visible, false);
  timer.update({ available: true, seconds: 3 }); advance(6000);
  assert.equal(timer.visible, false); assert.deepEqual(changes, [true, false]);
});

test('explicit previous or next activation renews the selected reading interval', () => {
  for (const seconds of [3, 5, 8]) {
    const { timer, advance } = clock();
    timer.update({ available: true, seconds }); timer.reveal(); advance(seconds * 1000 - 1);
    timer.reveal(); advance(seconds * 1000 - 1); assert.equal(timer.visible, true);
    advance(1); assert.equal(timer.visible, false);
  }
});

test('Off removes navigation and popup/pan availability does not reveal it on return', () => {
  const { timer, advance, pending } = clock();
  timer.update({ available: true, seconds: 3 }); timer.reveal();
  timer.update({ available: true, seconds: 0 }); assert.equal(timer.visible, false); assert.equal(pending.size, 0);
  timer.reveal(); assert.equal(timer.visible, false);
  timer.update({ available: true, seconds: 5 }); assert.equal(timer.visible, false);
  timer.reveal(); timer.update({ available: false, seconds: 5 }); assert.equal(timer.visible, false);
  timer.update({ available: true, seconds: 5 }); advance(6000); assert.equal(timer.visible, false);
  timer.reveal(); assert.equal(timer.visible, true);
});

test('keyboard focus can hold visible controls; pointer activation releases that hold', () => {
  const { timer, advance } = clock();
  timer.update({ available: true, seconds: 3 }); timer.reveal(); advance(2500);
  timer.setKeyboardFocused(true); advance(9000); assert.equal(timer.visible, true);
  timer.setKeyboardFocused(false); timer.reveal(); advance(2999); assert.equal(timer.visible, true);
  advance(1); assert.equal(timer.visible, false);
});

test('teardown invalidates already queued callbacks before another session reveals', () => {
  const { timer, pending, advance } = clock();
  timer.update({ available: true, seconds: 3 }); timer.reveal();
  const stale = [...pending.values()][0].run;
  timer.reset(); timer.update({ available: true, seconds: 8 }); timer.reveal();
  stale(); assert.equal(timer.visible, true);
  advance(7999); assert.equal(timer.visible, true);
  advance(1); assert.equal(timer.visible, false);
});
