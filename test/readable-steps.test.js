import test from 'node:test';
import assert from 'node:assert/strict';
import { readableSteps, balloonOrder, balloonOwner, balloonBox, stepPosition, stepFrame, letterTarget, LETTER_TARGETS } from '../src/readable-steps.js';

// A phone held upright and a page of the usual shape (1988 x 3056 pixels).
const phone = { imageWidth: 1988, imageHeight: 3056, availableWidth: 412, availableHeight: 860, margin: 10 };
const aspect = phone.imageWidth / phone.imageHeight;
const balloon = (x, y, width = .16, height = .04, letter = .0075) => ({ x: x - .02, y: y - .01, width: width + .04, height: height + .02, text: { x, y, width, height }, letter });
const contains = (outer, inner) => inner.x >= outer.x - 1e-9 && inner.y >= outer.y - 1e-9 && inner.x + inner.width <= outer.x + outer.width + 1e-9 && inner.y + inner.height <= outer.y + outer.height + 1e-9;
// The page's width on screen when a step fills it (as guidedPanelFit does).
const shownWidth = (step, { availableWidth, availableHeight, margin } = phone) => Math.min((availableWidth - 2 * margin) / step.width, (availableHeight - 2 * margin) * aspect / step.height);

test('letter sizes to choose from (off unless chosen)', () => {
  assert.equal(letterTarget('off'), 0); assert.equal(letterTarget(undefined), 0);
  assert.equal(letterTarget('normal'), LETTER_TARGETS.normal);
  assert.ok(LETTER_TARGETS.normal < LETTER_TARGETS.large && LETTER_TARGETS.large < LETTER_TARGETS.xlarge);
});

test('switched off, or with no balloons found, the steps stay exactly as they were', () => {
  // (Lettering found outside its balloon's box is still shown whole.)
  const odd = { x: .1, y: .1, width: .05, height: .05, text: { x: .3, y: .3, width: .1, height: .03 }, letter: .0075 };
  const box = balloonBox(odd, aspect);
  assert.ok(box.width > 0 && box.height > 0 && contains(box, odd.text));
  const steps = [{ x: 0, y: 0, width: 1, height: .5 }, { x: 0, y: .5, width: 1, height: .5 }];
  assert.equal(readableSteps({ ...phone, steps, balloons: [balloon(.1, .1)], target: 0 }), steps);
  assert.equal(readableSteps({ ...phone, steps, balloons: [], target: 9.5 }), steps);
  assert.deepEqual(readableSteps({ ...phone, steps: [], balloons: [balloon(.1, .1)], target: 9.5 }), []);
});

test('a wide panel on a phone: shown whole first, then its balloons close, in reading order, big enough to read', () => {
  const panel = { x: .05, y: .05, width: .9, height: .42 }, below = { x: .05, y: .5, width: .9, height: .45 };
  const found = [balloon(.62, .1), balloon(.12, .08), balloon(.42, .36)];
  const steps = readableSteps({ ...phone, steps: [panel, below], balloons: found, target: LETTER_TARGETS.normal });
  assert.deepEqual({ ...steps[0], family: undefined }, { ...panel, family: undefined }, 'the whole panel first');
  assert.equal(steps.at(-1), below, 'a panel without balloons is left as it was');
  const close = steps.filter(step => step.part);
  assert.ok(close.length >= 2, 'its balloons follow, a few at a time');
  close.forEach((step, index) => {
    assert.equal(step.frame, steps[0]); assert.equal(stepFrame(step), steps[0]); assert.equal(step.part, index + 1); assert.equal(step.parts, close.length);
    for (const text of step.balloons) assert.ok(contains(step, text), 'each balloon shown whole');
    const letterPx = .0075 * shownWidth(step) / aspect;
    assert.ok(letterPx >= LETTER_TARGETS.normal * .97, `letters ${letterPx.toFixed(1)}px`);
    assert.ok(step.x >= 0 && step.y >= 0 && step.x + step.width <= 1 + 1e-9 && step.y + step.height <= 1 + 1e-9);
  });
  // Every balloon is shown close exactly once, the top left one first.
  const shown = close.flatMap(step => step.balloons);
  assert.equal(shown.length, found.length);
  for (const item of found) assert.equal(shown.filter(text => text === item.text).length, 1);
  assert.equal(shown[0], found[1].text);
  // Bigger letters chosen: closer, so never fewer steps.
  const larger = readableSteps({ ...phone, steps: [panel, below], balloons: found, target: LETTER_TARGETS.xlarge }).filter(step => step.part);
  assert.ok(larger.length >= close.length);
  assert.ok(.0075 * shownWidth(larger[0]) / aspect >= LETTER_TARGETS.xlarge * .97);
});

test('lettering already big enough (a tablet, or a small panel) adds no steps', () => {
  const panels = [{ x: .05, y: .05, width: .9, height: .42 }, { x: .05, y: .5, width: .44, height: .45 }];
  const found = [balloon(.12, .08), balloon(.1, .55, .16, .04, .009)];
  const tablet = readableSteps({ ...phone, availableWidth: 810, availableHeight: 1040, steps: panels, balloons: found, target: LETTER_TARGETS.normal });
  assert.equal(tablet.length, 2);
  assert.ok(tablet.every(step => !step.part));
  // A panel shown big already, with large lettering: as it was.
  const big = readableSteps({ ...phone, steps: [panels[1]], balloons: [balloon(.1, .55, .16, .04, .02)], target: LETTER_TARGETS.normal });
  assert.equal(big.length, 1); assert.ok(!big[0].part);
});

test('a balloon breaking out of its panel, or between panels, is never cut or skipped', () => {
  const top = { x: .05, y: .05, width: .9, height: .4 }, bottom = { x: .05, y: .5, width: .9, height: .45 };
  // Lettering in the gutter between the two panels, nearer the top one, and one sticking out at the side.
  const gutter = balloon(.4, .44, .2, .04), side = balloon(.85, .2, .14, .04);
  const steps = readableSteps({ ...phone, steps: [top, bottom], balloons: [gutter, side], target: LETTER_TARGETS.normal });
  const whole = steps[0];
  assert.ok(contains(whole, balloonBox(gutter, aspect)) && contains(whole, balloonBox(side, aspect)), 'the panel shown whole takes them in');
  assert.equal(whole.source, top, 'and remembers the panel it was');
  const shown = steps.filter(step => step.part).flatMap(step => step.balloons);
  assert.ok(shown.includes(gutter.text) && shown.includes(side.text));
  assert.equal(balloonOwner([top, bottom], gutter), 0);
  assert.equal(balloonOwner([top, bottom], balloon(.4, .7)), 1);
});

test('a balloon too big for the screen at that size is shown whole, a little smaller; it never keeps the next one small', () => {
  const page = { x: 0, y: 0, width: 1, height: 1 };
  const caption = { x: .05, y: .05, width: .56, height: .2, text: { x: .07, y: .06, width: .5, height: .15 }, letter: .0075 };
  const small = balloon(.3, .22, .12, .03);
  const steps = readableSteps({ ...phone, steps: [page], balloons: [caption, small], target: LETTER_TARGETS.normal });
  const close = steps.filter(step => step.part);
  assert.ok(close[0] && contains(close[0], caption.text), 'the big caption, whole');
  assert.ok(.0075 * shownWidth(close[0]) / aspect < LETTER_TARGETS.normal, 'a little smaller than wanted');
  const own = close.find(step => step.balloons.includes(small.text));
  assert.ok(own && own !== close[0], 'the small balloon after it gets its own view');
  assert.ok(.0075 * shownWidth(own) / aspect >= LETTER_TARGETS.normal * .97);
  // A caption filling a wide panel: a view hardly closer than the panel itself is left out.
  const wide = readableSteps({ ...phone, steps: [{ x: 0, y: 0, width: 1, height: .6 }], balloons: [{ x: .05, y: .05, width: .9, height: .2, text: { x: .07, y: .06, width: .86, height: .18 }, letter: .0075 }], target: LETTER_TARGETS.normal });
  assert.equal(wide.length, 1); assert.ok(!wide[0].part);
});

test('reading order: rows from the top, left to right (right to left for manga)', () => {
  const a = balloon(.1, .1), b = balloon(.6, .11), c = balloon(.3, .3), d = balloon(.7, .5), e = balloon(.1, .52);
  assert.deepEqual(balloonOrder([d, c, b, e, a]), [a, b, c, e, d]);
  assert.deepEqual(balloonOrder([d, c, b, e, a], 'rtl'), [b, a, c, d, e]);
  const steps = readableSteps({ ...phone, steps: [{ x: 0, y: 0, width: 1, height: .7 }], balloons: [a, b, c, d, e], target: LETTER_TARGETS.large, direction: 'rtl' });
  assert.equal(steps.find(step => step.part).balloons[0], b.text, 'manga starts at the right');
});

test('a page shown whole just before: only the close views (no second whole page)', () => {
  const page = { x: 0, y: 0, width: 1, height: 1 };
  const steps = readableSteps({ ...phone, steps: [page], balloons: [balloon(.1, .1), balloon(.6, .7)], target: LETTER_TARGETS.normal, lead: false });
  assert.ok(steps.length >= 1 && steps.every(step => step.part && step.frame.width === 1));
  assert.deepEqual(readableSteps({ ...phone, availableWidth: 1400, availableHeight: 2000, steps: [page], balloons: [balloon(.1, .1)], target: LETTER_TARGETS.normal, lead: false }), []);
  assert.deepEqual(readableSteps({ ...phone, steps: [page], balloons: [], target: LETTER_TARGETS.normal, lead: false }), [], 'nothing to bring close: nothing');
  assert.deepEqual(readableSteps({ ...phone, steps: [page], balloons: [balloon(.1, .1)], target: 0, lead: false }), []);
});

test('the place of a step among the panels, for the status line', () => {
  const panel = { x: .05, y: .05, width: .9, height: .42 }, below = { x: .05, y: .5, width: .9, height: .45 };
  const steps = readableSteps({ ...phone, steps: [panel, below], balloons: [balloon(.12, .08), balloon(.62, .1)], target: LETTER_TARGETS.normal });
  assert.deepEqual(stepPosition(steps, 0), { panel: 1, panels: 2, part: 0, parts: 0 });
  assert.deepEqual(stepPosition(steps, 1), { panel: 1, panels: 2, part: 1, parts: steps[1].parts });
  assert.deepEqual(stepPosition(steps, steps.length - 1), { panel: 2, panels: 2, part: 0, parts: 0 });
  assert.deepEqual(stepPosition([panel, below], 1), { panel: 2, panels: 2, part: 0, parts: 0 });
});
