import test from 'node:test';
import assert from 'node:assert/strict';
import { lumaPicture, wallBetween } from '../src/balloon-walls.js';

// A page of drawing (an uneven, busy texture), 1000 x 1600, to paint borders and gutters on.
function picture(paint) {
  const width = 1000, height = 1600, luma = new Uint8Array(width * height);
  let seed = 7;
  const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) luma[y * width + x] = 40 + Math.round(60 * Math.abs(Math.sin(x / 23) * Math.cos(y / 31))) + Math.round(random() * 30);
  const fill = (x0, y0, x1, y1, value) => { for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(width, x1); x++) luma[y * width + x] = value; };
  paint({ fill, width, height, luma });
  return { luma, width, height };
}
// A balloon (fractions of the page) around lettering at (x, y), in pixels of the 1000 x 1600 page.
const balloon = (x, y, w = 160, h = 50) => ({ x: (x - 10) / 1000, y: (y - 10) / 1600, width: (w + 20) / 1000, height: (h + 20) / 1600, text: { x: x / 1000, y: y / 1600, width: w / 1000, height: h / 1600 } });

test('a gutter or a border between two balloons puts them in different panels', () => {
  // A white gutter down the page, edged in black (the panels' outlines), from the top to two thirds down.
  const page = picture(({ fill }) => { fill(497, 0, 500, 1070, 0); fill(500, 0, 512, 1070, 250); fill(512, 0, 515, 1070, 0); });
  const left = balloon(150, 400), right = balloon(700, 430), under = balloon(170, 470);
  assert.equal(wallBetween(page, left, right), true, 'across the gutter');
  assert.equal(wallBetween(page, left, under), false, 'on the same side');
  assert.equal(wallBetween(page, under, balloon(700, 1300)), true, 'still across it, lower down');
  assert.equal(wallBetween(page, balloon(150, 1200), balloon(700, 1250)), false, 'past its end: nothing between');
  // Level ones too: a pale band across the page between two rows of panels.
  const rows = picture(({ fill }) => fill(0, 790, 1000, 800, 250));
  assert.equal(wallBetween(rows, balloon(300, 600), balloon(320, 1000)), true);
  assert.equal(wallBetween(rows, balloon(100, 600), balloon(600, 640)), false);
});

test('short strokes, broad patches and slanting lines of a drawing are not borders', () => {
  const page = picture(({ fill, luma, width }) => {
    fill(495, 350, 505, 520, 250); // a short upright stroke (a lamp post)
    fill(440, 900, 640, 1500, 250); // a broad pale patch (a wall in the drawing)
    for (let y = 0; y < 1600; y++) for (let t = 0; t < 8; t++) { const x = Math.round(200 + y * .55) + t; if (x < width) luma[y * width + x] = 250; } // a long slanting line
  });
  assert.equal(wallBetween(page, balloon(150, 400), balloon(700, 420)), false, 'short');
  assert.equal(wallBetween(page, balloon(150, 1200), balloon(760, 1210)), false, 'broad');
  assert.equal(wallBetween(page, balloon(80, 1000), balloon(820, 380, 120)), false, 'slanting');
  assert.equal(wallBetween(null, balloon(1, 1), balloon(2, 2)), false);
  assert.equal(wallBetween(page, { nothing: true }, balloon(2, 2)), false);
});

test('a border under another balloon does not count (only what lies between them)', () => {
  const page = picture(({ fill }) => fill(500, 0, 512, 1600, 250));
  const left = balloon(150, 400), right = balloon(700, 400), across = { x: .45, y: .2, width: .12, height: .1, text: { x: .46, y: .21, width: .1, height: .08 } };
  assert.equal(wallBetween(page, left, right), true);
  assert.equal(wallBetween(page, left, right, { balloons: [across] }), false, 'a caption laid over the gutter there');
});

test('the brightness of a page comes from its colours', () => {
  const { luma, width, height } = lumaPicture({ data: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255]), width: 3, height: 1 });
  assert.deepEqual([...luma], [255, 0, 53]); assert.equal(width, 3); assert.equal(height, 1);
  assert.equal(lumaPicture({ data: new Uint8ClampedArray(4), width: 3, height: 3 }), null);
});
