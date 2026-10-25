import test from 'node:test';
import assert from 'node:assert/strict';
import {detectPanelRegions, orderPanels} from '../src/panel-detection.js';

// Original synthetic rasters: no comic artwork, external images or ML models.
function raster(width = 320, height = 460, background = [247, 244, 235, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(background, i * 4);
  return {width, height, data};
}
function fill(image, rect, color) {
  for (let y = rect.y; y < rect.y + rect.height; y++) for (let x = rect.x; x < rect.x + rect.width; x++)
    image.data.set(color, (y * image.width + x) * 4);
}
function panel(image, rect, index = 0, {frame = [17, 19, 20, 255]} = {}) {
  const colors = [[58, 111, 160, 255], [174, 80, 58, 255], [70, 132, 98, 255], [146, 97, 161, 255]];
  if (frame) fill(image, rect, frame);
  const inset = frame ? 2 : 0;
  fill(image, {x: rect.x + inset, y: rect.y + inset, width: rect.width - inset * 2, height: rect.height - inset * 2}, colors[index % colors.length]);
  // A speech balloon and fragmented tiny text must remain inside the panel.
  if (rect.width > 70 && rect.height > 70) {
    fill(image, {x: rect.x + 10, y: rect.y + 12, width: Math.floor(rect.width * .48), height: 21}, [255, 255, 255, 255]);
    for (let x = rect.x + 14; x < rect.x + rect.width * .4; x += 6)
      fill(image, {x, y: rect.y + 19, width: 3, height: 3}, [20, 20, 20, 255]);
  }
}
function expectLayout(result, rects, image, direction = 'ltr') {
  assert.equal(result.confidence, 'high', result.reason);
  assert.equal(result.panels.length, rects.length, JSON.stringify(result));
  const expected = orderPanels(rects, direction);
  for (let i = 0; i < expected.length; i++) {
    const actual = result.panels[i], target = expected[i];
    assert.ok(Math.abs(actual.x * image.width - target.x) <= 3, `panel ${i} x`);
    assert.ok(Math.abs(actual.y * image.height - target.y) <= 3, `panel ${i} y`);
    assert.ok(Math.abs(actual.width * image.width - target.width) <= 6, `panel ${i} width`);
    assert.ok(Math.abs(actual.height * image.height - target.height) <= 6, `panel ${i} height`);
    assert.ok(actual.x >= 0 && actual.y >= 0 && actual.width > 0 && actual.height > 0);
    assert.ok(actual.x + actual.width <= 1 && actual.y + actual.height <= 1);
  }
}

test('six actual unequal framed regions with off-white gutters ignore header/footer lettering', () => {
  const image = raster(), rects = [
    {x: 16, y: 35, width: 178, height: 118}, {x: 204, y: 35, width: 100, height: 118},
    {x: 16, y: 164, width: 112, height: 108}, {x: 138, y: 164, width: 166, height: 108},
    {x: 16, y: 283, width: 145, height: 140}, {x: 171, y: 283, width: 133, height: 140},
  ];
  rects.forEach((r, i) => panel(image, r, i));
  for (let x = 30; x < 200; x += 9) fill(image, {x, y: 15, width: 5, height: 7}, [30, 30, 30, 255]);
  fill(image, {x: 150, y: 442, width: 10, height: 5}, [20, 20, 20, 255]);
  expectLayout(detectPanelRegions(image), rects, image);
});

test('black gutters and a tall panel follow columns in LTR and RTL', () => {
  const image = raster(320, 460, [13, 13, 13, 255]), rects = [
    {x: 16, y: 18, width: 115, height: 424},
    {x: 143, y: 18, width: 161, height: 178}, {x: 143, y: 208, width: 161, height: 234},
  ];
  rects.forEach((r, i) => panel(image, r, i, {frame: [245, 245, 245, 255]}));
  expectLayout(detectPanelRegions(image), rects, image);
  const rtl = detectPanelRegions({...image, direction: 'rtl'});
  expectLayout(rtl, rects, image, 'rtl');
  assert.ok(rtl.panels[0].x > .4 && rtl.panels[1].x > .4 && rtl.panels[2].x < .1);
});

test('staggered row cuts retain unequal panel dimensions instead of inventing a grid', () => {
  const image = raster(), rects = [
    {x: 12, y: 15, width: 88, height: 160}, {x: 110, y: 15, width: 198, height: 160},
    {x: 12, y: 187, width: 190, height: 258}, {x: 212, y: 187, width: 96, height: 258},
  ];
  rects.forEach((r, i) => panel(image, r, i));
  expectLayout(detectPanelRegions(image), rects, image);
});

test('connected rectangular islands recover a non-slicing pinwheel layout', () => {
  const image = raster(420, 520), rects = [
    {x: 16, y: 16, width: 310, height: 100}, {x: 338, y: 16, width: 66, height: 350},
    {x: 108, y: 378, width: 296, height: 126}, {x: 16, y: 128, width: 80, height: 376},
    {x: 108, y: 128, width: 218, height: 238},
  ];
  rects.forEach((r, i) => panel(image, r, i));
  expectLayout(detectPanelRegions(image), rects, image);
});

test('recursive separators tolerate a tiny scan mark bridging a gutter', () => {
  const image = raster(), rects = [
    {x: 16, y: 20, width: 138, height: 420}, {x: 166, y: 20, width: 138, height: 420},
  ];
  rects.forEach((r, i) => panel(image, r, i));
  fill(image, {x: 153, y: 239, width: 14, height: 2}, [25, 25, 25, 255]);
  expectLayout(detectPanelRegions(image), rects, image);
});

test('a full-bleed painting and a splash with no enclosing gutters remain a whole page', () => {
  const image = raster();
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++)
    image.data.set([50 + x % 80, 70 + y % 90, 95 + (x + y) % 70, 255], (y * image.width + x) * 4);
  assert.deepEqual(detectPanelRegions(image).panels, [{x: 0, y: 0, width: 1, height: 1}]);
  // A horizontal band of white sky alone is insufficient evidence for 2 panels.
  fill(image, {x: 0, y: 208, width: 320, height: 16}, [255, 255, 255, 255]);
  const result = detectPanelRegions(image);
  assert.equal(result.confidence, 'low');
  assert.deepEqual(result.panels, [{x: 0, y: 0, width: 1, height: 1}]);
  const marginSplash = raster();
  fill(marginSplash, {x: 14, y: 14, width: 292, height: 432}, [60, 130, 95, 255]);
  fill(marginSplash, {x: 14, y: 208, width: 292, height: 12}, [255, 255, 255, 255]);
  assert.equal(detectPanelRegions(marginSplash).confidence, 'low');
});

test('three unframed colored panels with clear black gutters are detected from boundaries', () => {
  const image = raster(320, 460, [0, 0, 0, 255]), rects = [
    {x: 12, y: 12, width: 296, height: 130},
    {x: 12, y: 154, width: 132, height: 294}, {x: 156, y: 154, width: 152, height: 294},
  ];
  rects.forEach((r, i) => panel(image, r, i, {frame: null}));
  expectLayout(detectPanelRegions(image), rects, image);
});

test('blank, transparent, one outlined splash and text-only pages remain whole', () => {
  const images = [raster(), raster(320, 460, [0, 0, 0, 0])];
  const splash = raster(); panel(splash, {x: 12, y: 12, width: 296, height: 436}); images.push(splash);
  const letters = raster();
  for (let y = 30; y < 400; y += 15) for (let x = 20; x < 280; x += 10)
    fill(letters, {x, y, width: 4, height: 5}, [10, 10, 10, 255]);
  images.push(letters);
  for (const image of images) {
    const result = detectPanelRegions(image);
    assert.equal(result.confidence, 'low'); assert.equal(result.panels.length, 1);
    assert.deepEqual(result.panels[0], {x: 0, y: 0, width: 1, height: 1});
  }
});

test('two tiny decorative boxes do not become a panel layout', () => {
  const image = raster();
  panel(image, {x: 20, y: 20, width: 45, height: 45});
  panel(image, {x: 200, y: 300, width: 50, height: 50});
  assert.equal(detectPanelRegions(image).confidence, 'low');
});

test('more than 32 regions safely falls back instead of returning a truncated page', () => {
  const image = raster(600, 800);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++)
    panel(image, {x: 8 + x * 74, y: 8 + y * 99, width: 65, height: 89}, x + y);
  const result = detectPanelRegions(image);
  assert.equal(result.confidence, 'low'); assert.equal(result.panels.length, 1);
});

test('reading order prefers rows for a regular grid and whole columns for a tall panel', () => {
  const rects = [{x: .1, y: .1, width: .3, height: .3}, {x: .6, y: .1, width: .3, height: .3},
    {x: .1, y: .6, width: .3, height: .3}, {x: .6, y: .6, width: .3, height: .3}];
  assert.deepEqual(orderPanels(rects, 'rtl'), [rects[1], rects[0], rects[3], rects[2]]);
  const tall = [{x: .1, y: .1, width: .3, height: .8}, rects[1], rects[3]];
  assert.deepEqual(orderPanels(tall, 'rtl'), [tall[1], tall[2], tall[0]]);
  assert.deepEqual(orderPanels(tall, 'ltr'), tall);
  assert.deepEqual(orderPanels(tall, 'ltr'), orderPanels([...tall].reverse(), 'ltr'));
  assert.equal(tall.length, 3);
});

test('input validation rejects unsafe dimensions/data before raster allocation and accepts both byte arrays', () => {
  for (const input of [undefined, null, 12, 'invalid', {}, {width: NaN, height: 30}, {width: 20.5, height: 30},
    {width: -1, height: 20}, {width: 1000000, height: 1000000},
    {width: 20, height: 20, data: new Uint8Array(10)}, {width: 20, height: 20, data: []}]) {
    const result = detectPanelRegions(input); assert.equal(result.confidence, 'low'); assert.equal(result.panels.length, 1);
  }
  const image = raster(400, 600), rects = [{x: 20, y: 20, width: 360, height: 260}, {x: 20, y: 300, width: 360, height: 280}];
  rects.forEach((r, i) => panel(image, r, i));
  expectLayout(detectPanelRegions({...image, data: new Uint8Array(image.data)}), rects, image);
  assert.equal(detectPanelRegions({width: 1000, height: 1000, data: new Uint8Array(0)}).reason, 'image-too-large');
});
