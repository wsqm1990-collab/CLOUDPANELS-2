import test from 'node:test';
import assert from 'node:assert/strict';
import { cutBalloon, roundedCard, cutoutWindow } from '../src/balloon-cutout.js';

// A small painter for test pages (RGBA).
function page(width, height, color = [60, 90, 140]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) data.set([...color, 255], index * 4);
  return { data, width, height };
}
const put = (image, x, y, color) => { if (x >= 0 && y >= 0 && x < image.width && y < image.height) image.data.set([...color, 255], (y * image.width + x) * 4); };
function noise(image, amount, seed = 3) {
  for (let index = 0; index < image.width * image.height; index++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const shift = Math.round((seed / 2147483648 - .5) * amount);
    for (let channel = 0; channel < 3; channel++) image.data[index * 4 + channel] += shift;
  }
}
function ellipse(image, cx, cy, rx, ry, fill, line = null, thickness = 0) {
  for (let y = Math.floor(cy - ry - thickness - 1); y <= cy + ry + thickness + 1; y++) for (let x = Math.floor(cx - rx - thickness - 1); x <= cx + rx + thickness + 1; x++) {
    const outer = ((x - cx) / (rx + thickness)) ** 2 + ((y - cy) / (ry + thickness)) ** 2, inner = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    if (inner <= 1) put(image, x, y, fill); else if (line && outer <= 1) put(image, x, y, line);
  }
}
function rect(image, x0, y0, x1, y1, fill) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(image, x, y, fill); }
function frame(image, x0, y0, x1, y1, line, thickness) {
  rect(image, x0, y0, x1, y0 + thickness - 1, line); rect(image, x0, y1 - thickness + 1, x1, y1, line);
  rect(image, x0, y0, x0 + thickness - 1, y1, line); rect(image, x1 - thickness + 1, y0, x1, y1, line);
}
// Lettering: rows of little letters (strokes), `letter` pixels tall.
function lettering(image, x0, y0, columns, rows, letter, color = [12, 12, 12]) {
  const box = { x: x0, y: y0, width: 0, height: 0 };
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const x = x0 + column * Math.round(letter * .8), y = y0 + row * Math.round(letter * 1.4);
    rect(image, x, y, x + Math.max(1, Math.round(letter * .15)), y + letter - 1, color);
    rect(image, x, y, x + Math.round(letter * .5), y + Math.max(1, Math.round(letter * .15)), color);
    rect(image, x, y + letter - Math.max(1, Math.round(letter * .15)), x + Math.round(letter * .5), y + letter - 1, color);
    box.width = Math.max(box.width, x + Math.round(letter * .5) - x0 + 1); box.height = Math.max(box.height, y + letter - y0);
  }
  return box;
}
// A tail: a thin wedge from (x, y) down to a point.
function tail(image, x, y, length, base, fill, line) {
  for (let step = 0; step <= length; step++) {
    const half = base / 2 * (1 - step / length);
    for (let offset = -Math.ceil(half) - 2; offset <= Math.ceil(half) + 2; offset++) {
      const inside = Math.abs(offset) <= half, edge = Math.abs(offset) <= half + 2;
      if (inside) put(image, Math.round(x + offset + step * .25), y + step, fill); else if (edge && line) put(image, Math.round(x + offset + step * .25), y + step, line);
    }
  }
}
const at = (result, image, x, y) => result.mask[y * image.width + x];
const WHITE = [250, 250, 250], BLACK = [10, 10, 10];

test('a round balloon comes out with its outline and the start of its tail, none of the drawing around it', () => {
  const image = page(400, 320, [40, 70, 150]);
  noise(image, 30);
  ellipse(image, 200, 130, 120, 70, WHITE, BLACK, 4);
  tail(image, 190, 196, 110, 26, WHITE, BLACK);
  const text = lettering(image, 125, 100, 16, 3, 16);
  const result = cutBalloon(image, text, { letter: 16, balloon: { x: 80, y: 60, width: 240, height: 140 } });
  assert.equal(result.kind, 'shape');
  assert.equal(at(result, image, 200, 130), 255, 'the middle');
  assert.equal(at(result, image, 130, 105), 255, 'the letters');
  assert.ok(at(result, image, 200, 62) >= 200, 'the outline at the top');
  assert.ok(at(result, image, 78, 130) >= 128, 'the outline at the side');
  assert.equal(at(result, image, 200, 40), 0, 'the sky above');
  assert.equal(at(result, image, 20, 20), 0, 'the corner');
  assert.ok(at(result, image, 197, 214) > 200, 'the start of the tail');
  assert.ok(at(result, image, 215, 300) < 20, 'the far end of a long tail fades out');
  assert.ok(result.outline >= 3 && result.outline <= 6, `outline ${result.outline}`);
  assert.ok(result.box.x <= 78 && result.box.x + result.box.width >= 322 && result.box.y <= 58);
  assert.ok(result.box.y + result.box.height < 300, 'the box stops where the tail fades');
});

test('all of the outline comes out, even where it is thicker, and none of a coloured drawing just past it', () => {
  const image = page(360, 260, [220, 80, 120]);
  noise(image, 16, 5);
  // A brush outline: 4 pixels at the sides, 3 at the top and bottom.
  ellipse(image, 180, 130, 114, 63, BLACK);
  ellipse(image, 180, 130, 110, 60, WHITE);
  const text = lettering(image, 125, 110, 14, 2, 14);
  const result = cutBalloon(image, text, { letter: 14, balloon: { x: 66, y: 67, width: 228, height: 126 } });
  assert.equal(result.kind, 'shape');
  for (const x of [66, 67, 68, 69]) assert.ok(at(result, image, x, 130) >= 200, `the side's outline, x ${x}: ${at(result, image, x, 130)}`);
  for (const x of [291, 292, 293]) assert.ok(at(result, image, x, 130) >= 200, `the other side, x ${x}: ${at(result, image, x, 130)}`);
  for (const y of [67, 68, 69]) assert.ok(at(result, image, 180, y) >= 200, `the top's outline, y ${y}: ${at(result, image, 180, y)}`);
  for (const [x, y] of [[64, 130], [65, 130], [180, 65], [180, 66], [295, 130], [180, 194]]) assert.ok(at(result, image, x, y) < 40, `the drawing past it, ${x},${y}: ${at(result, image, x, y)}`);
});

test('a square caption comes out square, corners and border included', () => {
  const image = page(360, 240, [180, 120, 60]);
  noise(image, 20, 9);
  rect(image, 60, 50, 300, 170, [245, 225, 120]);
  frame(image, 60, 50, 300, 170, BLACK, 3);
  const text = lettering(image, 90, 80, 14, 3, 14);
  const result = cutBalloon(image, text, { letter: 14, balloon: { x: 58, y: 48, width: 245, height: 125 } });
  assert.equal(result.kind, 'shape');
  for (const [x, y] of [[62, 52], [298, 52], [62, 168], [298, 168], [180, 110]]) assert.equal(at(result, image, x, y), 255, `inside at ${x},${y}`);
  for (const [x, y] of [[55, 45], [306, 176], [180, 200], [20, 110]]) assert.equal(at(result, image, x, y), 0, `outside at ${x},${y}`);
  assert.ok(Math.abs(result.box.x - 60) <= 2 && Math.abs(result.box.y - 50) <= 2 && Math.abs(result.box.width - 241) <= 4 && Math.abs(result.box.height - 121) <= 4, JSON.stringify(result.box));
});

test('light letters on a dark balloon, with no outline, on a light page', () => {
  const image = page(320, 220, [230, 228, 220]);
  ellipse(image, 160, 110, 110, 62, [18, 16, 30]);
  const text = lettering(image, 95, 85, 13, 3, 13, [245, 245, 245]);
  const result = cutBalloon(image, text, { letter: 13 });
  assert.equal(result.kind, 'shape');
  assert.equal(at(result, image, 160, 110), 255);
  assert.equal(at(result, image, 160, 10), 0);
  assert.ok(at(result, image, 52, 110) > 100, 'its edge');
});

test('two balloons joined by a bridge come out together', () => {
  const image = page(420, 260, [90, 40, 60]);
  ellipse(image, 120, 90, 90, 50, WHITE, BLACK, 3);
  ellipse(image, 300, 170, 90, 50, WHITE, BLACK, 3);
  rect(image, 190, 110, 230, 150, WHITE);
  const text = lettering(image, 70, 75, 10, 2, 12);
  const result = cutBalloon(image, text, { letter: 12 });
  assert.equal(result.kind, 'shape');
  assert.equal(at(result, image, 300, 170), 255, 'the second balloon too');
});

test('a balloon open to the white of the page, lettering on the drawing, a fading paper or a wall: a card instead', () => {
  // Open: the paper goes on out of the window on a whole side.
  const open = page(300, 200, WHITE);
  rect(open, 0, 150, 299, 199, [40, 60, 90]);
  const openText = lettering(open, 100, 60, 10, 2, 14);
  const opened = cutBalloon(open, openText, { letter: 14 });
  assert.equal(opened.kind, 'card'); assert.equal(opened.open, true);
  // Straight on a busy drawing (no paper of its own).
  const busy = page(300, 200, [100, 100, 100]);
  for (let y = 0; y < 200; y++) for (let x = 0; x < 300; x++) if ((x * 7 + y * 13) % 11 < 5) put(busy, x, y, [(x * 5) % 255, (y * 3) % 255, 120]);
  const busyText = lettering(busy, 90, 80, 10, 2, 14, [250, 250, 250]);
  assert.equal(cutBalloon(busy, busyText, { letter: 14 }).kind, 'card');
  // A paper that fades into the drawing: no clean edge to follow.
  const fading = page(320, 220, [30, 30, 40]);
  for (let y = 0; y < 220; y++) for (let x = 0; x < 320; x++) {
    const reach = Math.hypot((x - 160) / 130, (y - 110) / 80);
    if (reach < 1) { const value = Math.round(250 - reach * reach * 200); put(fading, x, y, [value, value, value]); }
  }
  const fadingText = lettering(fading, 115, 95, 9, 2, 12);
  assert.equal(cutBalloon(fading, fadingText, { letter: 12 }).kind, 'card');
  // Lettering on a big white wall: far more paper than a balloon around it.
  const wall = page(400, 300, [50, 50, 50]);
  rect(wall, 20, 20, 380, 280, WHITE);
  const wallText = lettering(wall, 170, 140, 5, 1, 12);
  const walled = cutBalloon(wall, wallText, { letter: 12, balloon: { x: 160, y: 130, width: 70, height: 32 } });
  assert.equal(walled.kind, 'card'); assert.equal(walled.why, 'too much paper');
});

test('a balloon running out of the window says so (a wider window is tried), and fades at the cut', () => {
  // Cut across by the window: a card for now, asking for a wider window.
  const across = page(300, 200, [40, 70, 150]);
  ellipse(across, 260, 100, 110, 60, WHITE, BLACK, 3);
  const acrossText = lettering(across, 200, 85, 6, 2, 12);
  const wide = cutBalloon(across, acrossText, { letter: 12 });
  assert.equal(wide.kind, 'card'); assert.equal(wide.open, true);
  // Just poking out: its shape, soft where the window cuts it.
  const poking = page(300, 200, [40, 70, 150]);
  ellipse(poking, 230, 100, 72, 60, WHITE, BLACK, 3);
  const pokingText = lettering(poking, 185, 85, 6, 2, 12);
  const result = cutBalloon(poking, pokingText, { letter: 12 });
  assert.equal(result.kind, 'shape');
  assert.equal(result.open, true);
  assert.ok(at(result, poking, 299, 100) < 40, 'soft at the edge of the window');
  assert.equal(at(result, poking, 240, 100), 255);
});

test('a card is a rounded box around the lettering, with soft corners', () => {
  const card = roundedCard(200, 120, { x0: 50, y0: 40, x1: 149, y1: 79 }, 10);
  assert.equal(card.kind, 'card');
  assert.equal(card.mask[60 * 200 + 100], 255);
  assert.equal(card.mask[60 * 200 + 20], 0);
  assert.ok(card.mask[(40 - 9) * 200 + (50 - 9)] < 60, 'a round corner');
  assert.ok(card.box.x <= 41 && card.box.x + card.box.width >= 159 && card.box.y <= 31 && card.box.y + card.box.height >= 89);
});

test('the window holds the balloon with room for a round side or a tail, inside the page', () => {
  const balloon = { x: .4, y: .3, width: .2, height: .1, letter: .01 };
  const window = cutoutWindow(balloon, 1000, 1500);
  // Margin: the larger of 3.5 letters (52 px) and 45% of the balloon's longer side (90 px).
  assert.deepEqual(window, { x: 310, y: 360, width: 380, height: 330, whole: false });
  assert.deepEqual(cutoutWindow({ x: 0, y: 0, width: 1, height: 1, letter: .02 }, 800, 1200), { x: 0, y: 0, width: 800, height: 1200, whole: true });
  const wider = cutoutWindow(balloon, 1000, 1500, { wider: 2.2 });
  assert.ok(wider.width > window.width && wider.x < window.x);
});

test('no pixels, a tiny window or a missing box: a card, never an error', () => {
  assert.equal(cutBalloon({ data: null, width: 0, height: 0 }, { x: 0, y: 0, width: 0, height: 0 }).kind, 'card');
  assert.equal(cutBalloon(page(6, 6), { x: 1, y: 1, width: 3, height: 3 }).kind, 'card');
  assert.equal(cutBalloon(page(40, 40), undefined).kind, 'card');
});

test('a big window is cut quickly', () => {
  const image = page(640, 640, [40, 70, 150]);
  noise(image, 24);
  ellipse(image, 320, 300, 230, 150, WHITE, BLACK, 5);
  tail(image, 300, 448, 150, 40, WHITE, BLACK);
  const text = lettering(image, 160, 240, 22, 4, 26);
  cutBalloon(image, text, { letter: 26 });
  const started = performance.now();
  const result = cutBalloon(image, text, { letter: 26 });
  assert.equal(result.kind, 'shape');
  assert.ok(performance.now() - started < 250, `${Math.round(performance.now() - started)} ms`);
});
