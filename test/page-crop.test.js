import test from 'node:test';
import assert from 'node:assert/strict';
import { findBorders, toCropped, toWhole } from '../src/page-crop.js';

// A small page: margins of one colour around a busy drawing.
function page({ width = 200, height = 300, margin = [0, 0, 0, 0], paper = [0, 0, 0], specks = 0, extra } = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  const [top, right, bottom, left] = margin.map((value, index) => Math.round(value * (index % 2 ? width : height)));
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const o = (y * width + x) * 4, inside = y >= top && y < height - bottom && x >= left && x < width - right;
    const colour = inside ? [40 + ((x * 7 + y * 3) % 180), 60 + ((x * 13) % 150), 90 + ((y * 11) % 140)] : rnd() < specks ? [128, 128, 128] : paper;
    data[o] = colour[0]; data[o + 1] = colour[1]; data[o + 2] = colour[2]; data[o + 3] = 255;
  }
  extra?.(data, width, height);
  return { data, width, height };
}
const near = (box, expected, slack = .012) => ['x', 'y', 'width', 'height'].every(key => Math.abs(box[key] - expected[key]) <= slack);

test('black margins around the drawing are found, side by side', () => {
  const box = findBorders(page({ margin: [.1, .05, .08, .05] }));
  assert.ok(box && near(box, { x: .05, y: .1, width: .9, height: .82 }), JSON.stringify(box));
  assert.ok(box.x < .05 && box.y < .1, 'a hair of margin is left, never the drawing');
});

test('white paper margins too, even with a few specks of dust', () => {
  const box = findBorders(page({ margin: [.06, .04, .06, .04], paper: [250, 250, 248], specks: .01 }));
  assert.ok(box && near(box, { x: .04, y: .06, width: .92, height: .88 }), JSON.stringify(box));
});

test('no margins, tiny margins or a coloured edge (drawing) are left alone', () => {
  assert.equal(findBorders(page()), null, 'drawing to the edges');
  assert.equal(findBorders(page({ margin: [.005, .005, .005, .005] })), null, 'too little to bother');
  assert.equal(findBorders(page({ margin: [.1, .1, .1, .1], paper: [40, 90, 200] })), null, 'a blue sky is drawing, not paper');
  assert.equal(findBorders({ data: new Uint8ClampedArray(16), width: 2, height: 2 }), null);
  assert.equal(findBorders(), null);
});

test('a page number in the margin stops the cut there; a nearly empty page is not cut to a sliver', () => {
  const numbered = findBorders(page({ margin: [.05, .05, .1, .05], paper: [255, 255, 255], extra: (data, width, height) => {
    for (let y = height - 12; y < height - 6; y++) for (let x = 95; x < 105; x++) { const o = (y * width + x) * 4; data[o] = data[o + 1] = data[o + 2] = 0; }
  } }));
  assert.ok(numbered && numbered.y + numbered.height > .95, 'the number is kept');
  const empty = findBorders(page({ margin: [.4, .4, .4, .4], paper: [255, 255, 255] }));
  assert.ok(empty && empty.x >= .24 && empty.x <= .25 && empty.width >= .5, 'at most a quarter from each side');
});

test('panels move between the whole page and the cropped page and back', () => {
  const box = { x: .05, y: .1, width: .9, height: .8 }, panel = { x: .1, y: .2, width: .4, height: .3, extra: 1 };
  const shown = toCropped(panel, box), back = toWhole(shown, box);
  assert.ok(Math.abs(shown.x - .05 / .9) < 1e-9 && Math.abs(shown.height - .375) < 1e-9 && shown.extra === 1);
  for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(back[key] - panel[key]) < 1e-9, key);
  const reaching = toCropped({ x: 0, y: 0, width: .5, height: .5 }, box);
  assert.deepEqual([reaching.x, reaching.y], [0, 0], 'what reaches into the cut margin is left out');
  assert.equal(toCropped(panel, null), panel); assert.equal(toWhole(panel, null), panel);
});
