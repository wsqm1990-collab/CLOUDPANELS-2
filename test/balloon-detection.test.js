import test from 'node:test';
import assert from 'node:assert/strict';
import { findBalloons } from '../src/balloon-detection.js';
import { balloonAnalysisSize, checkedBalloons, analyzePageBalloons } from '../src/balloon-analyzer.js';

// A tiny lettering font (5 x 7), drawn 2x: capitals 14 pixels tall.
const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'], E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'], K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'], O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'], S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'], U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'], Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'], G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'], M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
};
function page(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  const set = (x, y, [r, g, b]) => { if (x < 0 || y < 0 || x >= width || y >= height) return; const o = (y * width + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255; };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) set(x, y, [128, 128, 128]);
  paint({ set, width, height });
  return { data, width, height };
}
const ellipse = ({ set }, cx, cy, rx, ry, fill, outline = [0, 0, 0]) => {
  for (let y = Math.floor(cy - ry - 3); y <= cy + ry + 3; y++) for (let x = Math.floor(cx - rx - 3); x <= cx + rx + 3; x++) {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    if (d <= 1) set(x, y, fill); else if (d <= 1.12) set(x, y, outline);
  }
};
const rectangle = ({ set }, x0, y0, w, h, fill, outline = [0, 0, 0]) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, x < x0 + 3 || y < y0 + 3 || x >= x0 + w - 3 || y >= y0 + h - 3 ? outline : fill);
};
const write = ({ set }, x, y, words, ink = [10, 10, 10]) => {
  for (const char of words) {
    const glyph = GLYPHS[char];
    if (glyph) glyph.forEach((row, gy) => [...row].forEach((bit, gx) => { if (bit === '1') for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) set(x + gx * 2 + dx, y + gy * 2 + dy, ink); }));
    x += 14;
  }
};
const centred = (canvas, cx, y, lines, ink) => lines.forEach((line, index) => write(canvas, Math.round(cx - line.length * 7), y + index * 22, line, ink));
// Drawing: hatching and dots, as a busy panel has.
const hatch = ({ set, width, height }, x0, y0, x1, y1) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if ((x + y) % 9 < 2 || (x * 7 + y * 13) % 97 === 0) set(x, y, [25, 25, 25]);
};

test('a speech balloon is found, with its lettering and the size of its letters', () => {
  const picture = page(1040, 1600, canvas => {
    hatch(canvas, 0, 0, 1040, 1600);
    ellipse(canvas, 400, 300, 200, 90, [255, 255, 255]);
    centred(canvas, 400, 255, ['WHAT ARE YOU', 'DOING HERE', 'TONY?'], [10, 10, 10]);
  });
  const { balloons, letter } = findBalloons(picture);
  assert.equal(balloons.length, 1);
  const [found] = balloons;
  assert.ok(Math.abs(found.letter * 1600 - 14) <= 1, `letter ${found.letter * 1600}`);
  assert.equal(found.lines, 3); assert.ok(found.letters >= 20); assert.equal(found.light, false);
  // The lettering is inside the balloon found, and that inside the page.
  const text = found.text;
  assert.ok(text.x * 1040 < 330 && (text.x + text.width) * 1040 > 470 && text.y * 1600 <= 256 && (text.y + text.height) * 1600 >= 297);
  assert.ok(found.x <= text.x && found.y <= text.y && found.x + found.width >= text.x + text.width && found.y + found.height >= text.y + text.height);
  assert.ok(letter > 0);
});

test('light lettering on a dark balloon, and a caption box, are found too', () => {
  const picture = page(1040, 1600, canvas => {
    hatch(canvas, 0, 0, 1040, 1600);
    ellipse(canvas, 300, 400, 190, 80, [12, 12, 12], [240, 240, 240]);
    centred(canvas, 300, 370, ['DO NOT RUN', 'HERO'], [245, 245, 245]);
    rectangle(canvas, 560, 900, 340, 90, [255, 240, 170]);
    write(canvas, 580, 920, 'MEANWHILE', [10, 10, 10]); write(canvas, 580, 942, 'ACROSS TOWN', [10, 10, 10]);
  });
  const { balloons } = findBalloons(picture);
  assert.equal(balloons.length, 2);
  const dark = balloons.find(item => item.light), caption = balloons.find(item => !item.light);
  assert.ok(dark && caption);
  assert.ok(dark.text.y * 1600 < 400 && caption.text.y * 1600 > 900);
  assert.equal(caption.lines, 2);
});

test('drawing alone (hatching, dots, shapes) gives no balloons; bad input gives none', () => {
  const picture = page(1040, 1600, canvas => {
    hatch(canvas, 0, 0, 1040, 1600);
    for (let index = 0; index < 40; index++) rectangle(canvas, 40 + (index % 8) * 120, 60 + Math.floor(index / 8) * 300, 30 + (index % 3) * 10, 40, [200, 200, 60], [0, 0, 0]);
  });
  assert.deepEqual(findBalloons(picture).balloons, []);
  assert.deepEqual(findBalloons({}), { balloons: [], letter: 0 });
  assert.deepEqual(findBalloons({ data: new Uint8ClampedArray(16), width: 2, height: 2 }), { balloons: [], letter: 0 });
});

test('the page is looked at at a size that keeps letters readable', () => {
  assert.deepEqual(balloonAnalysisSize(1988, 3056), { width: 1041, height: 1600 });
  assert.deepEqual(balloonAnalysisSize(800, 600), { width: 800, height: 600 });
  const scroll = balloonAnalysisSize(800, 12000);
  assert.ok(scroll.width >= 340 && scroll.width * scroll.height <= 4_000_000 * 1.01);
  assert.throws(() => balloonAnalysisSize(0, 10));
  assert.ok(balloonAnalysisSize(800, 30000).width >= 300, 'very long scrolls too');
});

test('only well-formed results come out of the worker', () => {
  const good = { x: .1, y: .1, width: .3, height: .1, text: { x: .12, y: .12, width: .2, height: .05 }, letter: .009, lines: 2, letters: 18, light: false };
  const out = checkedBalloons({ balloons: [good, { ...good, x: -1 }, { ...good, letter: 5 }, { ...good, text: null }], letter: .009 });
  assert.equal(out.balloons.length, 1); assert.equal(out.letter, .009); assert.equal(out.balloons[0].mixed, false);
  assert.equal(checkedBalloons(null), null, 'nothing usable: tried again later');
  assert.equal(checkedBalloons({ balloons: 'x' }), null);
  const outside = checkedBalloons({ balloons: [{ ...good, text: { x: .5, y: .5, width: .1, height: .05 } }] }).balloons[0];
  assert.ok(outside.x <= .5 && outside.x + outside.width >= .6 - 1e-9 && outside.y + outside.height >= .55 - 1e-9, 'the balloon box holds its lettering');
});

test('the page goes to a worker and comes back checked; cancelling stops it', async () => {
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }) };
  const sent = [];
  const worker = () => {
    const fake = { terminate() { fake.ended = true; }, postMessage(message) { sent.push(message); setTimeout(() => fake.onmessage?.({ data: { result: { balloons: [{ x: .1, y: .1, width: .2, height: .1, text: { x: .11, y: .11, width: .1, height: .05 }, letter: .01 }], letter: .01 } } }), 5); } };
    return fake;
  };
  const result = await analyzePageBalloons({ naturalWidth: 1988, naturalHeight: 3056 }, { canvasFactory: () => canvas, workerFactory: worker });
  assert.equal(result.balloons.length, 1);
  assert.equal(sent[0].width, 1041); assert.equal(sent[0].height, 1600);
  const controller = new AbortController();
  const pending = analyzePageBalloons({ naturalWidth: 100, naturalHeight: 100 }, { signal: controller.signal, canvasFactory: () => canvas, workerFactory: () => ({ terminate() {}, postMessage() {} }) });
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  // A worker that never answers, or a page no longer there: null (looked at again later, never "no balloons").
  assert.equal(await analyzePageBalloons({ naturalWidth: 100, naturalHeight: 100 }, { timeout: 20, canvasFactory: () => canvas, workerFactory: () => ({ terminate() {}, postMessage() {} }) }), null);
  assert.equal(await analyzePageBalloons({ naturalWidth: 0, naturalHeight: 0 }, { canvasFactory: () => canvas, workerFactory: worker }), null);
});

test('where the device can, the worker gets the page itself and reads it there', async () => {
  const sent = [], made = [];
  const previous = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = class {};
  try {
    const bitmapFactory = async (image, options) => { made.push(options); return { close() { this.closed = true; } }; };
    const worker = () => { const fake = { terminate() {}, postMessage(message, transfer) { sent.push({ message, transfer }); setTimeout(() => fake.onmessage?.({ data: { result: { balloons: [], letter: 0 } } }), 1); } }; return fake; };
    const result = await analyzePageBalloons({ naturalWidth: 1988, naturalHeight: 3056 }, { bitmapFactory, workerFactory: worker, canvasFactory: () => { throw new Error('not here'); } });
    assert.deepEqual(result, { balloons: [], letter: 0 });
    assert.deepEqual(made[0], { resizeWidth: 1041, resizeHeight: 1600, resizeQuality: 'high' });
    assert.equal(sent[0].message.width, 1041); assert.ok(sent[0].message.bitmap); assert.equal(sent[0].transfer[0], sent[0].message.bitmap);
    // A worker that cannot read the page itself, or no worker at all: the page is read here instead.
    let tries = 0;
    const failing = () => { const fake = { terminate() {}, postMessage() { tries++; setTimeout(() => fake.onmessage?.({ data: tries === 1 ? { error: true } : { result: { balloons: [], letter: .01 } } }), 1); } }; return fake; };
    const pixelsCanvas = { width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }) };
    assert.deepEqual(await analyzePageBalloons({ naturalWidth: 200, naturalHeight: 300 }, { bitmapFactory, workerFactory: failing, canvasFactory: () => pixelsCanvas }), { balloons: [], letter: .01 });
    assert.equal(tries, 2);
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }) };
    assert.deepEqual(await analyzePageBalloons({ naturalWidth: 200, naturalHeight: 300 }, { bitmapFactory, workerFactory: () => null, canvasFactory: () => canvas }), { balloons: [], letter: 0 });
  } finally { globalThis.OffscreenCanvas = previous; }
});
