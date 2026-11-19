import test from 'node:test';
import assert from 'node:assert/strict';
import { balloonSequence, readingTime, createBalloonStepper, stepPause, STEP_PAUSES } from '../src/balloon-steps.js';

const balloon = (id, x, y, letters = 20, width = .1, height = .05) => ({ id, x, y, width, height, text: { x: x + .01, y: y + .01, width: width - .02, height: height - .02 }, letter: .01, letters });
const ids = list => list.map(b => b.id);

test('balloons in reading order: panel by panel, a spread page by page, one panel in Panel view', () => {
  // Two columns of panels: the left column is read first, though a balloon on the right sits higher.
  const panels = [{ x: 0, y: 0, width: .5, height: .5 }, { x: 0, y: .5, width: .5, height: .5 }, { x: .5, y: 0, width: .5, height: 1 }];
  const page = [balloon('right-top', .6, .05), balloon('left-top-b', .3, .1), balloon('left-top-a', .05, .1), balloon('left-bottom', .1, .6), balloon('right-low', .6, .7)];
  assert.deepEqual(ids(balloonSequence(page, { panels })), ['left-top-a', 'left-top-b', 'left-bottom', 'right-top', 'right-low']);
  assert.deepEqual(ids(balloonSequence(page)), ['right-top', 'left-top-a', 'left-top-b', 'left-bottom', 'right-low'], 'no panels known: row by row');
  assert.deepEqual(ids(balloonSequence(page, { panels, direction: 'rtl' })), ['left-top-b', 'left-top-a', 'left-bottom', 'right-top', 'right-low'], 'right to left inside each panel');
  assert.deepEqual(ids(balloonSequence(page, { panels, panel: 2 })), ['right-top', 'right-low'], 'Panel view: that panel only');
  assert.deepEqual(ids(balloonSequence(page, { panels: [], panel: 0 })), [], 'Panel view without panels: none');
  const spread = [balloon('second', .55, .05), balloon('first-low', .1, .8), balloon('first-top', .2, .1)];
  assert.deepEqual(ids(balloonSequence(spread, { spread: true })), ['first-top', 'first-low', 'second']);
  assert.deepEqual(ids(balloonSequence(spread, { spread: true, direction: 'rtl' })), ['second', 'first-top', 'first-low'], 'right to left: the right page first');
  assert.deepEqual(balloonSequence([{ nothing: true }, null].filter(Boolean)), []);
});

test('a balloon stays out by itself about as long as its lettering takes', () => {
  assert.equal(readingTime(balloon('a', 0, 0, 40)), 4300);
  assert.equal(readingTime(balloon('a', 0, 0, 40), 'slow'), Math.round(4300 * 1.45));
  assert.equal(readingTime(balloon('a', 0, 0, 40), 'fast'), Math.round(4300 * .7));
  assert.equal(readingTime(balloon('a', 0, 0, 0)), 1800, 'never too short to find it');
  assert.equal(readingTime(balloon('a', 0, 0, 900)), 14000, 'never too long');
  assert.equal(stepPause('long'), STEP_PAUSES.long); assert.equal(stepPause('nope'), STEP_PAUSES.medium);
});

// A small reader: pages of balloons, a clock, and what was done.
function world(pages, { canTurn = () => true } = {}) {
  let now = 0, serial = 0, page = 0, opened = null; const timers = [], log = [], states = [];
  const clock = {
    wait(ms, fn) { const id = ++serial; timers.push({ id, at: now + ms, fn }); return id; },
    cancel(id) { const at = timers.findIndex(t => t.id === id); if (at >= 0) timers.splice(at, 1); },
    async advance(ms) {
      const end = now + ms;
      for (;;) { await flush(); timers.sort((a, b) => a.at - b.at); const next = timers[0]; if (!next || next.at > end) break; timers.shift(); now = next.at; next.fn(); }
      now = end; await flush();
    },
  };
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  const stepper = createBalloonStepper({
    place: () => `p${page}`,
    sequence: async () => pages[page],
    open: (b, { timer }) => { opened = b; log.push(`open ${b.id}${timer ? ` (${timer})` : ''}`); return true; },
    close: () => { log.push('close'); opened = null; },
    isOpen: () => opened !== null,
    turn: async (delta, { auto }) => { if (!canTurn(page + delta, auto) || page + delta < 0 || page + delta >= pages.length) return false; page += delta; log.push(`page ${page}`); return true; },
    pause: () => 1000, readFor: b => b.letters * 100,
    wait: clock.wait, cancel: clock.cancel, onState: state => states.push(state),
  });
  return { stepper, clock, log, states, flush, get page() { return page; }, set page(value) { page = value; }, get opened() { return opened; } };
}
const pages = () => [[balloon('a1', .1, .1, 10), balloon('a2', .5, .1, 20), balloon('a3', .1, .5, 30)], [balloon('b1', .1, .1, 15)], [], [balloon('d1', .1, .1, 12), balloon('d2', .1, .5, 8)]];

test('by tapping the corners: balloon by balloon, the page seen in between, then the next page', async () => {
  const w = world(pages());
  await w.stepper.step(1); assert.deepEqual(w.log, ['open a1'], 'the first one comes out at once');
  await w.stepper.step(1); assert.deepEqual(w.log.slice(1), ['close'], 'the page is seen first');
  await w.clock.advance(999); assert.equal(w.opened, null);
  await w.clock.advance(1); assert.equal(w.opened.id, 'a2');
  // Two quick taps: the second one does not wait.
  await w.stepper.step(1); await w.stepper.step(-1); assert.equal(w.opened.id, 'a2', 'back during the pause: at once');
  await w.stepper.step(1); await w.clock.advance(1000); assert.equal(w.opened.id, 'a3');
  w.log.length = 0;
  await w.stepper.step(1); assert.deepEqual(w.log, ['close', 'page 1'], 'after the last one, the page turns');
  await w.stepper.step(1); assert.equal(w.opened.id, 'b1', 'and its first balloon comes out');
  // Back: to the page without a balloon out, then the page before, from its last balloon.
  await w.stepper.step(-1); assert.equal(w.opened, null); assert.equal(w.page, 1);
  await w.stepper.step(-1); assert.equal(w.page, 0);
  await w.stepper.step(-1); assert.equal(w.opened.id, 'a3');
  // A page without balloons turns at once.
  w.page = 2; w.log.length = 0;
  await w.stepper.step(1); assert.deepEqual(w.log, ['close', 'page 3'], '(the balloon still out is put back first)');
  assert.deepEqual(w.states, []);
});

test('a balloon tapped directly: the steps go on from it', async () => {
  const seq = pages(), w = world(seq);
  await w.stepper.shown(seq[0][1]);
  await w.stepper.step(1); assert.equal(w.opened.id, 'a3');
});

test('by itself: each balloon for its reading time, the page in between, page after page, until the end', async () => {
  const w = world(pages());
  await w.stepper.start();
  assert.deepEqual(w.states, ['running']); assert.deepEqual(w.log, ['open a1 (1000)'], 'out with its time (for the bar)');
  await w.clock.advance(1000); assert.deepEqual(w.log.slice(1), ['close']);
  await w.clock.advance(1000); assert.equal(w.opened.id, 'a2');
  await w.clock.advance(2000 + 1000 + 3000);
  assert.equal(w.opened, null); assert.equal(w.page, 1, 'after a3: the next page');
  await w.clock.advance(1000); assert.equal(w.opened.id, 'b1', 'seen for a moment, then its first balloon');
  await w.clock.advance(1500); assert.equal(w.page, 2);
  await w.clock.advance(1000); assert.equal(w.page, 3, 'a page without balloons goes by');
  await w.clock.advance(1000); assert.equal(w.opened.id, 'd1');
  await w.clock.advance(1200 + 1000 + 800);
  assert.equal(w.opened, null); assert.equal(w.stepper.running, false); assert.deepEqual(w.states, ['running', 'end'], 'stops at the end');
});

test('stopping: no more steps, and corners still work by hand', async () => {
  const w = world(pages());
  await w.stepper.start(); await w.clock.advance(1000);
  w.stepper.stop(); assert.deepEqual(w.states, ['running', 'stopped']);
  await w.clock.advance(20000); assert.equal(w.opened, null, 'the pending balloon never comes');
  await w.stepper.step(1); assert.equal(w.opened.id, 'a2', 'by hand from where it was');
  await w.clock.advance(20000); assert.equal(w.opened.id, 'a2', 'not by itself any more');
});

test('a corner that cannot turn the page says so; going by itself stops at the end of the comic', async () => {
  const w = world(pages(), { canTurn: () => false });
  await w.stepper.step(1); await w.stepper.step(1); await w.clock.advance(1000); await w.stepper.step(1); await w.clock.advance(1000);
  await w.stepper.step(1); assert.equal(w.page, 0); assert.deepEqual(w.states, ['edge']);
  const r = world([[balloon('x', .1, .1, 10)]]);
  await r.stepper.start(); await r.clock.advance(1000);
  assert.deepEqual(r.states, ['running', 'end']); assert.equal(r.stepper.running, false);
});

test('another page shown meanwhile (a swipe): the steps start again there', async () => {
  const w = world(pages());
  await w.stepper.step(1); await w.stepper.step(1); await w.clock.advance(1000); assert.equal(w.opened.id, 'a2');
  w.page = 3;
  await w.stepper.step(1); await w.clock.advance(1000);
  assert.equal(w.opened.id, 'd1', 'its first balloon');
});

test('a balloon that cannot come out yet (the page still turning) is tried again, not skipped', async () => {
  const w = world(pages()); let busy = 2;
  const stepper = createBalloonStepper({ place: () => 'p0', sequence: async () => pages()[0], open: b => { if (busy-- > 0) return 'busy'; w.log.push(`open ${b.id}`); return true; },
    close: () => {}, isOpen: () => false, turn: async () => false, pause: () => 1000, wait: w.clock.wait, cancel: w.clock.cancel });
  await stepper.step(1); assert.deepEqual(w.log, []);
  await w.clock.advance(500); assert.deepEqual(w.log, ['open a1']);
  assert.equal(stepper.position.cursor, 0);
});

test('joined balloons come out together: one step, and the time to read both', async () => {
  const joined = [balloon('a', .1, .1, 10), balloon('a-joined', .1, .16, 30), balloon('b', .5, .5, 10)];
  const w = world([joined]); const log = []; let opened = null;
  const pair = (shown, other) => shown !== other && ['a', 'a-joined'].includes(shown.id) && ['a', 'a-joined'].includes(other.id);
  const stepper = createBalloonStepper({ place: () => 'p0', sequence: async () => joined, open: (b, { timer }) => { opened = b; log.push(`${b.id}${timer ? ` ${timer}` : ''}`); return true; },
    close: () => { opened = null; }, isOpen: () => opened !== null, turn: async () => false, pause: () => 500, readFor: b => b.letters * 100,
    covers: pair, wait: w.clock.wait, cancel: w.clock.cancel });
  await stepper.step(1); await stepper.step(1); await w.clock.advance(500);
  assert.deepEqual(log, ['a', 'b'], 'the joined one is not shown again');
  // Back: the joined shape once (by its last lettering), then the page.
  await stepper.step(-1); await w.clock.advance(500);
  await stepper.step(-1); await w.clock.advance(500);
  assert.deepEqual(log, ['a', 'b', 'a-joined']); assert.equal(opened, null);
  const r = world([joined]); const timed = [];
  const auto = createBalloonStepper({ place: () => 'p0', sequence: async () => joined, open: (b, { timer }) => { timed.push(`${b.id} ${timer}`); return true; }, close: () => {}, isOpen: () => false,
    turn: async () => false, pause: () => 500, readFor: b => b.letters * 100, covers: (shown, other) => shown !== other && ['a', 'a-joined'].includes(shown.id) && ['a', 'a-joined'].includes(other.id), wait: r.clock.wait, cancel: r.clock.cancel });
  await auto.start(); await r.clock.advance(4000 + 500);
  assert.deepEqual(timed, ['a 4000', 'b 1000'], 'its time counts both letterings');
});
