const MAX_PIXELS = 480000;
const MAX_EDGE = 768;
const abortError = () => new DOMException('Panel analysis cancelled.', 'AbortError');
const fallback = (reason = 'analysis-unavailable') => ({ panels: [{ x: 0, y: 0, width: 1, height: 1 }], confidence: 'low', reason });

export function analysisDimensions(width, height) {
  if (![width, height].every(value => Number.isInteger(value) && value > 0 && value <= 16384) || width * height > 24 * 1024 * 1024) throw new Error('Invalid page dimensions.');
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

function checkedRects(values, maximum) {
  if (!Array.isArray(values) || !values.length || values.length > maximum) return null;
  const rects = [];
  for (const rect of values) {
    if (![rect?.x, rect?.y, rect?.width, rect?.height].every(Number.isFinite) || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 || rect.x + rect.width > 1.000001 || rect.y + rect.height > 1.000001) return null;
    rects.push({ x: rect.x, y: rect.y, width: Math.min(rect.width, 1 - rect.x), height: Math.min(rect.height, 1 - rect.y) });
  }
  return rects;
}
function checked(result) {
  if (!result || !['high', 'low'].includes(result.confidence)) return fallback();
  const panels = checkedRects(result.panels, 32);
  if (!panels) return fallback();
  return { panels, confidence: result.confidence, reason: String(result.reason || '').slice(0, 120) };
}

async function runPixels(pixels, { signal, direction, workerFactory }) {
  signal?.throwIfAborted();
  let worker;
  try { worker = workerFactory(); } catch { /* Module workers are unavailable on some older devices. */ }
  if (!worker) {
    // A bounded fallback still permits reading on browsers without module workers.
    await new Promise(resolve => setTimeout(resolve, 0)); signal?.throwIfAborted();
    const { detectPanelRegions } = await import('./panel-detection.js'); signal?.throwIfAborted();
    return checked(detectPanelRegions({ ...pixels, direction }));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value, error) => {
      if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      worker.onmessage = worker.onerror = worker.onmessageerror = null; worker.terminate();
      if (error) reject(error); else resolve(value);
    };
    const cancel = () => finish(undefined, signal?.reason instanceof Error ? signal.reason : abortError());
    const timer = setTimeout(() => finish(fallback('analysis-timeout')), 8000);
    worker.onmessage = event => finish(checked(event.data?.result));
    worker.onerror = worker.onmessageerror = () => finish(fallback());
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) return cancel();
    try { worker.postMessage({ ...pixels, direction }, [pixels.data.buffer]); }
    catch { finish(fallback()); }
  });
}

/** Analyze only the currently decoded page, using a small, disposable raster. */
export async function analyzePagePanels(image, { signal, direction = 'ltr',
  canvasFactory = () => document.createElement('canvas'),
  workerFactory = () => new Worker('/panel-worker.js', { type: 'module' }),
} = {}) {
  signal?.throwIfAborted();
  const dimensions = analysisDimensions(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const canvas = canvasFactory();
  try {
    canvas.width = dimensions.width; canvas.height = dimensions.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return fallback();
    context.drawImage(image, 0, 0, dimensions.width, dimensions.height); signal?.throwIfAborted();
    const { data } = context.getImageData(0, 0, dimensions.width, dimensions.height);
    return await runPixels({ ...dimensions, data }, { signal, direction: direction === 'rtl' ? 'rtl' : 'ltr', workerFactory });
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    return fallback();
  } finally { canvas.width = canvas.height = 0; }
}
