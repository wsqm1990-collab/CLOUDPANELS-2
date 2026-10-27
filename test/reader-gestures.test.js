import test from 'node:test';
import assert from 'node:assert/strict';
import { rubberBand, inverseRubberBand, releaseVelocity, lockAxis, decidePageTurn, turnDuration, stepScroll, neighbourGeometry, DECELERATION } from '../src/reader-gestures.js';

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
