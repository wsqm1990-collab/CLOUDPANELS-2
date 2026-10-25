import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePagePanels, analysisDimensions } from '../src/panel-analyzer.js';

function canvasFixture() {
  const canvas = { width: 0, height: 0, reads: 0, draws: 0, getContext() {
    return { drawImage() { canvas.draws++; }, getImageData() { canvas.reads++; return { data: new Uint8ClampedArray(canvas.width * canvas.height * 4).fill(255) }; } };
  } };
  return canvas;
}
const page = { naturalWidth: 1800, naturalHeight: 2700 };

test('panel analysis bounds a disposable raster while preserving page aspect', () => {
  for (const [width, height] of [[1800, 2700], [2700, 1800], [4096, 4096], [100, 50]]) {
    const size = analysisDimensions(width, height);
    assert.ok(size.width <= width && size.height <= height && Math.max(size.width, size.height) <= 768 && size.width * size.height <= 480000);
    assert.ok(Math.abs(size.width / size.height - width / height) < .01);
  }
  assert.throws(() => analysisDimensions(100000, 100000), /dimensions/);
  assert.throws(() => analysisDimensions(0, 20), /dimensions/);
});

test('the local worker receives only bounded pixels and returns checked rectangles, then releases resources', async () => {
  const canvas = canvasFixture(); let payload, terminated = 0;
  const worker = { terminate() { terminated++; }, postMessage(value, transfer) {
    payload = value; assert.deepEqual(transfer, [value.data.buffer]);
    queueMicrotask(() => worker.onmessage({ data: { result: { panels: [{ x: .1, y: .1, width: .8, height: .3 }, { x: .1, y: .5, width: .8, height: .4 }], confidence: 'high', reason: 'gutters' } } }));
  } };
  const result = await analyzePagePanels(page, { canvasFactory: () => canvas, workerFactory: () => worker, direction: 'rtl' });
  assert.equal(payload.direction, 'rtl'); assert.ok(payload.width * payload.height <= 480000);
  assert.deepEqual(Object.keys(payload).sort(), ['data', 'direction', 'height', 'width']);
  assert.equal(result.panels.length, 2); assert.equal(result.confidence, 'high');
  assert.equal(terminated, 1); assert.equal(canvas.width, 0); assert.equal(canvas.height, 0); assert.equal(canvas.reads, 1);
});

test('cancelling a running analysis terminates its worker and does not save a stale result', async () => {
  const controller = new AbortController(), canvas = canvasFixture(); let terminated = 0;
  const worker = { terminate() { terminated++; }, postMessage() { controller.abort(); } };
  await assert.rejects(analyzePagePanels(page, { signal: controller.signal, canvasFactory: () => canvas, workerFactory: () => worker }), { name: 'AbortError' });
  assert.equal(terminated, 1); assert.equal(canvas.width, 0); assert.equal(worker.onmessage, null);
  let touched = false;
  await assert.rejects(analyzePagePanels(page, { signal: controller.signal, canvasFactory: () => { touched = true; } }), { name: 'AbortError' });
  assert.equal(touched, false);
});

test('worker failure or invalid selections keeps the complete page readable', async () => {
  for (const bad of [null, { confidence: 'high', panels: [{ x: .9, y: 0, width: .5, height: 1 }] }]) {
    const canvas = canvasFixture();
    const worker = { terminate() {}, postMessage() { queueMicrotask(() => worker.onmessage({ data: { result: bad } })); } };
    const result = await analyzePagePanels(page, { canvasFactory: () => canvas, workerFactory: () => worker });
    assert.deepEqual(result.panels, [{ x: 0, y: 0, width: 1, height: 1 }]); assert.equal(result.confidence, 'low'); assert.equal(canvas.width, 0);
  }
});

test('browsers without module workers can analyze a blank page locally without inventing panels', async () => {
  const canvas = canvasFixture();
  const result = await analyzePagePanels({ naturalWidth: 60, naturalHeight: 90 }, { canvasFactory: () => canvas, workerFactory: () => { throw new Error('unsupported'); } });
  assert.deepEqual(result.panels, [{ x: 0, y: 0, width: 1, height: 1 }]); assert.equal(result.confidence, 'low'); assert.equal(canvas.width, 0);
  assert.deepEqual(Object.keys(result).sort(), ['confidence', 'panels', 'reason']);
});

test('low-confidence pages stay whole-page candidates and the next page can return confident panels', async () => {
  const fullPage = [{ x: 0, y: 0, width: 1, height: 1 }];
  const nextPage = [{ x: 0, y: 0, width: 1, height: .375 }, { x: 0, y: .625, width: 1, height: .375 }];
  for (const [confidence, panels] of [['low', fullPage], ['high', nextPage]]) {
    const canvas = canvasFixture();
    // A stale worker's extra fields must not reintroduce balloon enlargement.
    const worker = { terminate() {}, postMessage() { queueMicrotask(() => worker.onmessage({ data: { result: { panels, confidence, balloons: [{ x: .2, y: .3, width: .3, height: .2 }], balloonConfidence: 'high', balloonReason: 'glyphs' } } })); } };
    const result = await analyzePagePanels(page, { canvasFactory: () => canvas, workerFactory: () => worker });
    assert.equal(result.confidence, confidence); assert.deepEqual(result.panels, panels);
    assert.deepEqual(Object.keys(result).sort(), ['confidence', 'panels', 'reason']);
  }
});
