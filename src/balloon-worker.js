import { findBalloons } from './balloon-detection.js';

// Page pixels stay on this device. The worker has no network requests.
// It gets either the pixels, or the page itself (an image bitmap) to shrink and read here,
// which keeps that work off the reader's thread.
self.onmessage = event => {
  try {
    let pixels = event.data;
    if (pixels?.bitmap) {
      const { bitmap, width, height } = pixels, canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d', { willReadFrequently: true });
      context.imageSmoothingQuality = 'high'; context.drawImage(bitmap, 0, 0, width, height); bitmap.close?.();
      pixels = { width, height, data: context.getImageData(0, 0, width, height).data };
    }
    self.postMessage({ result: findBalloons(pixels) });
  } catch { self.postMessage({ error: true }); }
};
