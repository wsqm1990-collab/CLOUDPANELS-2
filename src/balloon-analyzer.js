// Finds the balloons of the page being read, on this device, in a worker
// (the reader stays smooth meanwhile). See balloon-detection.js.
const abortError = () => new DOMException('Balloon analysis cancelled.', 'AbortError');
// (A page that could not be looked at gives null, not "no balloons", so it is tried again later.)
const failed = () => null;

/** The size the page is looked at: letters then come out about 10 pixels tall. */
export function balloonAnalysisSize(width, height) {
  if (![width, height].every(value => Number.isInteger(value) && value > 0 && value <= 32768) || width * height > 64 * 1024 * 1024) throw new Error('Invalid page dimensions.');
  // A long scroll (webtoon) keeps enough of its width for its lettering.
  const scale = height > width * 2.2 ? Math.min(1, 1100 / width, Math.sqrt(4_000_000 / (width * height))) : Math.min(1, 1600 / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const fraction = value => Number.isFinite(value) && value >= 0 && value <= 1.000001;
const box = rect => rect && [rect.x, rect.y, rect.width, rect.height].every(fraction) && rect.width > 0 && rect.height > 0 && rect.x + rect.width <= 1.000001 && rect.y + rect.height <= 1.000001
  ? { x: rect.x, y: rect.y, width: Math.min(rect.width, 1 - rect.x), height: Math.min(rect.height, 1 - rect.y) } : null;

/** Only well-formed results leave here (anything else: null, the page could not be looked at). */
export function checkedBalloons(result) {
  if (!result || !Array.isArray(result.balloons) || result.balloons.length > 80) return failed();
  const balloons = [];
  for (const item of result.balloons) {
    let outer = box(item); const text = box(item?.text), letter = Number(item?.letter);
    if (!outer || !text || !(letter > 0 && letter < .2)) continue;
    // The balloon's box always holds its lettering.
    const x = Math.min(outer.x, text.x), y = Math.min(outer.y, text.y);
    outer = { x, y, width: Math.max(outer.x + outer.width, text.x + text.width) - x, height: Math.max(outer.y + outer.height, text.y + text.height) - y };
    balloons.push({ ...outer, text, letter, lines: Math.max(1, Math.round(Number(item.lines) || 1)), letters: Math.max(1, Math.round(Number(item.letters) || 1)), light: item.light === true, mixed: item.mixed === true });
  }
  const letter = Number(result.letter);
  return { balloons, letter: letter > 0 && letter < .2 ? letter : 0 };
}

async function runPixels(pixels, { signal, workerFactory, timeout, local = true }) {
  signal?.throwIfAborted();
  let worker;
  try { worker = workerFactory(); } catch { /* Module workers are missing on some older devices. */ }
  if (!worker) {
    if (!local) throw new Error('No worker.');
    await new Promise(resolve => setTimeout(resolve, 0)); signal?.throwIfAborted();
    const { findBalloons } = await import('./balloon-detection.js'); signal?.throwIfAborted();
    return checkedBalloons(findBalloons(pixels));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value, error) => {
      if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      worker.onmessage = worker.onerror = worker.onmessageerror = null; worker.terminate();
      if (error) reject(error); else resolve(value);
    };
    const cancel = () => finish(undefined, signal?.reason instanceof Error ? signal.reason : abortError());
    const timer = setTimeout(() => finish(failed()), timeout);
    // (A worker that could not read the page itself: it is read on this thread instead.)
    worker.onmessage = event => event.data?.error && !local ? finish(undefined, new Error('The worker could not read the page.')) : finish(checkedBalloons(event.data?.result));
    worker.onerror = worker.onmessageerror = () => local ? finish(failed()) : finish(undefined, new Error('The worker could not read the page.'));
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) return cancel();
    try { worker.postMessage(pixels, [pixels.bitmap || pixels.data.buffer]); }
    catch (error) { if (local) finish(failed()); else finish(undefined, error); }
  });
}

/**
 * The balloons of a decoded page (an image or canvas): `{ balloons, letter }`,
 * or null when it could not be looked at (try again later). Throws only when cancelled.
 */
export async function analyzePageBalloons(image, { signal, timeout = 10000,
  canvasFactory = () => document.createElement('canvas'),
  workerFactory = () => new Worker(new URL('balloon-worker.js', document.baseURI), { type: 'module' }),
  bitmapFactory = globalThis.createImageBitmap?.bind(globalThis),
} = {}) {
  signal?.throwIfAborted();
  let canvas;
  try {
    const size = balloonAnalysisSize(image.naturalWidth || image.width, image.naturalHeight || image.height);
    // Where the device can, the worker shrinks and reads the page (the reader's thread stays free).
    if (typeof bitmapFactory === 'function' && typeof globalThis.OffscreenCanvas === 'function') {
      let bitmap;
      try {
        bitmap = await bitmapFactory(image, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high' }); signal?.throwIfAborted();
        return await runPixels({ ...size, bitmap }, { signal, workerFactory, timeout, local: false });
      } catch (error) {
        bitmap?.close?.();
        if (signal?.aborted || error?.name === 'AbortError') throw error;
        /* Then on this thread, as below. */
      }
    }
    canvas = canvasFactory(); canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return failed();
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, size.width, size.height); signal?.throwIfAborted();
    const { data } = context.getImageData(0, 0, size.width, size.height);
    return await runPixels({ ...size, data }, { signal, workerFactory, timeout });
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    return failed();
  } finally { if (canvas) canvas.width = canvas.height = 0; }
}
