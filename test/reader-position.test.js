import test from 'node:test';
import assert from 'node:assert/strict';
import { stepReadingPosition } from '../src/reader-position.js';

test('guided reading visits every panel, then the whole page, before advancing or finishing', () => {
  const counts = [2, 3], visits = [];
  let position = { page: 0, panel: 0, overview: false };
  for (let i = 0; i < 8; i++) {
    const step = stepReadingPosition({ ...position, pageCount: 2, panelCount: counts[position.page], guided: true, delta: 1 });
    visits.push(step);
    if (step.kind === 'end') break;
    position = step;
  }
  assert.deepEqual(visits, [
    { kind: 'panel', page: 0, panel: 1, overview: false },
    { kind: 'overview', page: 0, panel: 1, overview: true },
    { kind: 'page', page: 1, panel: 0, overview: false },
    { kind: 'panel', page: 1, panel: 1, overview: false },
    { kind: 'panel', page: 1, panel: 2, overview: false },
    { kind: 'overview', page: 1, panel: 2, overview: true },
    { kind: 'end', page: 1, panel: 2, overview: true },
  ]);
});

test('previous retraces the overview and panels without skipping the preceding page overview', () => {
  const counts = [2, 3], visits = [];
  let position = { page: 1, panel: 2, overview: true };
  for (let i = 0; i < 8; i++) {
    const step = stepReadingPosition({ ...position, pageCount: 2, panelCount: counts[position.page], guided: true, delta: -1 });
    visits.push(step);
    if (step.kind === 'none') break;
    position = { ...step, panel: step.panel === -1 ? counts[step.page] - 1 : step.panel };
  }
  assert.deepEqual(visits, [
    { kind: 'panel', page: 1, panel: 2, overview: false },
    { kind: 'panel', page: 1, panel: 1, overview: false },
    { kind: 'panel', page: 1, panel: 0, overview: false },
    { kind: 'page', page: 0, panel: -1, overview: true },
    { kind: 'panel', page: 0, panel: 1, overview: false },
    { kind: 'panel', page: 0, panel: 0, overview: false },
    { kind: 'none', page: 0, panel: 0, overview: false },
  ]);
});

test('a single-panel final page still requires a separate overview step before end', () => {
  const state = { page: 0, pageCount: 1, panel: 0, panelCount: 1, guided: true, delta: 1 };
  const whole = stepReadingPosition(state);
  assert.equal(whole.kind, 'overview');
  assert.equal(stepReadingPosition({ ...state, ...whole }).kind, 'end');
  assert.deepEqual(state, { page: 0, pageCount: 1, panel: 0, panelCount: 1, guided: true, delta: 1 });
});

test('unguided and uncertain pages have no duplicate whole-page step and never wrap', () => {
  for (const mode of [{ guided: false, panelCount: 4 }, { guided: true, panelCount: 0 }]) {
    assert.deepEqual(stepReadingPosition({ ...mode, page: 0, pageCount: 2, panel: 0, delta: 1 }),
      { kind: 'page', page: 1, panel: 0, overview: false });
    assert.equal(stepReadingPosition({ ...mode, page: 1, pageCount: 2, panel: 0, delta: 1 }).kind, 'end');
    assert.equal(stepReadingPosition({ ...mode, page: 0, pageCount: 2, panel: 0, delta: -1 }).kind, 'none');
  }
});

test('guided navigation resumes on the first panel after an unrecognized whole page', () => {
  const fullPage = { page: 0, pageCount: 2, panel: 0, panelCount: 0, guided: true, overview: false, delta: 1 };
  const nextPage = stepReadingPosition(fullPage);
  assert.deepEqual(nextPage, { kind: 'page', page: 1, panel: 0, overview: false });
  const nextPanel = stepReadingPosition({ ...fullPage, ...nextPage, panelCount: 2 });
  assert.deepEqual(nextPanel, { kind: 'panel', page: 1, panel: 1, overview: false });
  assert.deepEqual(stepReadingPosition({ ...fullPage, ...nextPanel, panelCount: 2 }),
    { kind: 'overview', page: 1, panel: 1, overview: true });
  assert.equal(fullPage.guided, true);
});

test('invalid directions and stale or malformed positions cannot initiate navigation', () => {
  const valid = { page: 1, pageCount: 3, panel: 1, panelCount: 3, guided: true, overview: false, delta: 1 };
  for (const invalid of [{ delta: 0 }, { delta: 2 }, { delta: '1' }, { page: -1 }, { page: 3 }, { page: 1.5 },
    { pageCount: 0 }, { pageCount: NaN }, { panel: -1 }, { panel: 3 }, { panelCount: -1 }, { panelCount: Infinity }]) {
    assert.equal(stepReadingPosition({ ...valid, ...invalid }).kind, 'none');
  }
});
