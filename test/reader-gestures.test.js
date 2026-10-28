import test from 'node:test';
import assert from 'node:assert/strict';
import { rubberBand, inverseRubberBand, releaseVelocity, lockAxis, decidePageTurn, turnDuration, stepScroll, neighbourGeometry, entryEdge, stripDrag, sideDragAction, sideStep, DECELERATION } from '../src/reader-gestures.js';

test('rubber band stretches less the further it is pulled and can be inverted', () => {
  assert.equal(rubberBand(0, 800), 0);
  const small = rubberBand(50, 800), large = rubberBand(400, 800);
  assert.ok(small > 0 && small < 50);
  assert.ok(large < 400 && large > small);
  assert.ok(rubberBand(100000, 800) < 800);
  assert.ok(rubberBand(-120, 800) < 0);
  for (const value of [10, 80, 250, -60]) assert.ok(Math.abs(inverseRubberBand(rubberBand(value, 800), 800) - value) < 0.01);
});

test('release velocity uses recent movement and ignores a finger that stopped', () => {
  const samples = [{ t: 0, x: 0, y: 0 }, { t: 16, x: -20, y: 2 }, { t: 32, x: -42, y: 3 }, { t: 48, x: -65, y: 4 }];
  const v = releaseVelocity(samples, 50);
  assert.ok(v.x < -1.2 && v.x > -1.5, `vx ${v.x}`);
  assert.deepEqual(releaseVelocity(samples, 200), { x: 0, y: 0 });
  assert.deepEqual(releaseVelocity([{ t: 0, x: 0, y: 0 }], 5), { x: 0, y: 0 });
});

test('axis lock: sideways turns pages, vertical scrolls tall pages, zoomed pages move freely', () => {
  assert.equal(lockAxis({ dx: 4, dy: 3, canScrollY: true }), null);
  assert.equal(lockAxis({ dx: -30, dy: 12, canScrollY: true }), 'x');
  assert.equal(lockAxis({ dx: 6, dy: -20, canScrollY: true }), 'y');
  assert.equal(lockAxis({ dx: -18, dy: 20, canScrollY: true }), 'x', 'a slightly steep swipe still turns');
  assert.equal(lockAxis({ dx: -9, dy: 30, canScrollY: true }), 'y');
  // A slightly diagonal swipe on a page that already fits still turns the page.
  assert.equal(lockAxis({ dx: -20, dy: 25, canScrollY: false }), 'x');
  assert.equal(lockAxis({ dx: 3, dy: 30, canScrollY: false }), 'none');
  assert.equal(lockAxis({ dx: 30, dy: 30, zoomed: true }), 'free');
});

test('page turn decision honours distance, flicks and reading direction', () => {
  const width = 800;
  assert.equal(decidePageTurn({ dx: -200, vx: 0, width }), 1);
  assert.equal(decidePageTurn({ dx: 200, vx: 0, width }), -1);
  assert.equal(decidePageTurn({ dx: -100, vx: 0, width }), 0);
  assert.equal(decidePageTurn({ dx: -40, vx: -0.6, width }), 1, 'short quick flick turns');
  assert.equal(decidePageTurn({ dx: -15, vx: -0.9, width }), 0, 'tiny movement never turns');
  assert.equal(decidePageTurn({ dx: -260, vx: 0.6, width }), 0, 'flicking back cancels');
  assert.equal(decidePageTurn({ dx: -200, vx: 0, width, direction: 'rtl' }), -1);
  assert.equal(decidePageTurn({ dx: -100, vx: 0, width, resistance: 1 }), 1, 'light resistance');
  assert.equal(decidePageTurn({ dx: -200, vx: 0, width, resistance: 5 }), 0, 'firm resistance');
});

test('turn duration is shorter after a fast flick and bounded', () => {
  assert.equal(turnDuration(600, 0), 340);
  assert.ok(turnDuration(600, 4) <= 240);
  assert.equal(turnDuration(0.5, 2), 160);
});

function simulate(state, bounds, limit = 10000) {
  let t = 0; const trace = [];
  while (t < limit) { state = stepScroll(state, 16, bounds); trace.push(state.pos); t += 16; if (state.done) break; }
  return { state, t, trace };
}

test('a flick glides like iOS and stops inside the page', () => {
  const { state, trace } = simulate({ pos: 0, vel: 1 }, { min: 0, max: 5000 });
  assert.ok(state.done);
  const expected = 1 / -Math.log(DECELERATION);
  assert.ok(Math.abs(state.pos - expected) < 25, `travelled ${state.pos}, expected about ${expected}`);
  for (let i = 1; i < trace.length; i++) assert.ok(trace[i] >= trace[i - 1] - 1e-6, 'never moves backwards');
});

test('gliding into the bottom edge bounces back and rests exactly on the edge', () => {
  const { state, trace } = simulate({ pos: 900, vel: 2 }, { min: 0, max: 1000 });
  assert.ok(state.done);
  assert.equal(state.pos, 1000);
  const overshoot = Math.max(...trace) - 1000;
  assert.ok(overshoot > 5 && overshoot < 120, `overshoot ${overshoot}`);
});

test('a page released past the top edge springs back without passing it', () => {
  const { state, trace } = simulate({ pos: -80, vel: 0 }, { min: 0, max: 1000 });
  assert.ok(state.done);
  assert.equal(state.pos, 0);
  assert.ok(Math.max(...trace) <= 0.0001);
});

test('neighbour geometry centres short pages and tops tall ones', () => {
  assert.deepEqual(neighbourGeometry({ fit: { width: 600, height: 900 }, available: { width: 800, height: 1000 }, padding: { left: 0, top: 20 } }), { width: 600, height: 900, left: 100, top: 70 });
  assert.deepEqual(neighbourGeometry({ fit: { width: 800, height: 1240 }, available: { width: 800, height: 1000 } }), { width: 800, height: 1240, left: 0, top: 0 });
  assert.equal(neighbourGeometry({ fit: { width: 0, height: 0 }, available: { width: 1, height: 1 } }), null);
});

test('a page wider than the screen enters showing the edge that faces the page just left', () => {
  const fit = { width: 1400, height: 1080 }, available = { width: 810, height: 1080 };
  // Coming in from the right (reading forward): its left edge shows.
  assert.deepEqual(neighbourGeometry({ fit, available, align: 'left' }), { width: 1400, height: 1080, left: 0, top: 0 });
  // Coming in from the left (going back): its right edge shows.
  assert.deepEqual(neighbourGeometry({ fit, available, align: 'right' }), { width: 1400, height: 1080, left: -590, top: 0 });
  assert.deepEqual(neighbourGeometry({ fit, available }), { width: 1400, height: 1080, left: -295, top: 0 });
  // Pages that fit are centred whatever the side.
  assert.deepEqual(neighbourGeometry({ fit: { width: 600, height: 900 }, available: { width: 800, height: 1000 }, align: 'left' }), { width: 600, height: 900, left: 100, top: 50 });
});

test('wide pages open at the left edge going forward and at the right edge going back', () => {
  assert.equal(entryEdge({ direction: 1 }), 'left');
  assert.equal(entryEdge({ direction: -1 }), 'right');
  assert.equal(entryEdge({}), 'left');
  // Right-to-left comics read from the right.
  assert.equal(entryEdge({ direction: 1, rtl: true }), 'right');
  assert.equal(entryEdge({ direction: -1, rtl: true }), 'left');
});

test('a sideways drag slides across a wide page and turns only from its edge', () => {
  // At the left edge: dragging left (to see the right side) slides; dragging right turns back.
  assert.equal(sideDragAction({ dx: -30, canPan: true, atLeft: true, atRight: false }), 'pan');
  assert.equal(sideDragAction({ dx: 30, canPan: true, atLeft: true, atRight: false }), 'turn');
  // In the middle both directions slide.
  assert.equal(sideDragAction({ dx: -30, canPan: true, atLeft: false, atRight: false }), 'pan');
  assert.equal(sideDragAction({ dx: 30, canPan: true, atLeft: false, atRight: false }), 'pan');
  // At the right edge: dragging left turns to the next page.
  assert.equal(sideDragAction({ dx: -30, canPan: true, atLeft: false, atRight: true }), 'turn');
  // A page that fits always turns.
  assert.equal(sideDragAction({ dx: -30, canPan: false, atLeft: false, atRight: false }), 'turn');
  assert.equal(sideDragAction({ dx: NaN, canPan: true, atLeft: false, atRight: false }), 'turn');
});

test('taps move across a wide page in even steps, then turn the page', () => {
  // A double page on an upright iPad: one step reaches the other edge.
  const ipad = { maxLeft: 590, viewWidth: 810 };
  assert.equal(sideStep({ ...ipad, scrollLeft: 0, delta: 1 }), 590);
  assert.equal(sideStep({ ...ipad, scrollLeft: 590, delta: 1 }), null);
  assert.equal(sideStep({ ...ipad, scrollLeft: 590, delta: -1 }), 0);
  assert.equal(sideStep({ ...ipad, scrollLeft: 0, delta: -1 }), null);
  // Right-to-left: "next" moves towards the left edge.
  assert.equal(sideStep({ ...ipad, scrollLeft: 590, delta: 1, direction: 'rtl' }), 0);
  assert.equal(sideStep({ ...ipad, scrollLeft: 0, delta: 1, direction: 'rtl' }), null);
  // A phone: three even steps across a very wide page, never a sliver at the end.
  const phone = { maxLeft: 720, viewWidth: 400 };
  const stops = []; let x = 0;
  for (let i = 0; i < 5; i++) { const next = sideStep({ ...phone, scrollLeft: x, delta: 1 }); if (next === null) break; stops.push(next); x = next; }
  assert.deepEqual(stops, [240, 480, 720]);
  // From a position the finger left in between, the next stop is ahead of it.
  assert.equal(sideStep({ ...phone, scrollLeft: 300, delta: 1 }), 480);
  assert.equal(sideStep({ ...phone, scrollLeft: 300, delta: -1 }), 240);
  // Nothing to step across.
  assert.equal(sideStep({ scrollLeft: 0, maxLeft: 2, viewWidth: 400, delta: 1 }), null);
});

test('one sideways drag slides across a wide page, then pulls the neighbouring page in', () => {
  assert.deepEqual(stripDrag({ startScroll: 0, dx: -300, maxLeft: 595 }), { scroll: 300, offset: 0 });
  // Past the right edge the page stays at its edge and the rest of the drag moves it aside.
  assert.deepEqual(stripDrag({ startScroll: 0, dx: -700, maxLeft: 595 }), { scroll: 595, offset: -105 });
  // From the left edge, dragging right pulls the previous page in straight away.
  assert.deepEqual(stripDrag({ startScroll: 0, dx: 80, maxLeft: 595 }), { scroll: 0, offset: 80 });
  // Coming back within the same drag slides into the page again.
  assert.deepEqual(stripDrag({ startScroll: 595, dx: 40, maxLeft: 595 }), { scroll: 555, offset: 0 });
  // A page caught while bouncing counts from its edge.
  assert.deepEqual(stripDrag({ startScroll: -30, dx: -10, maxLeft: 595 }), { scroll: 10, offset: 0 });
  assert.deepEqual(stripDrag({ startScroll: 0, dx: NaN, maxLeft: 595 }), { scroll: 0, offset: 0 });
});
