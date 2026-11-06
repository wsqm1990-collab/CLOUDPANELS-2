// Makes smaller copies of page images away from the reader's thread: page
// navigator thumbnails, library covers, and a readable copy of pages too big
// to show directly. Decodes the page (at the smaller size when the browser can
// do that directly), scales it on an OffscreenCanvas and encodes a JPEG.
// Page pixels stay on this device; the worker makes no requests.
// With `crop`, it cuts off the page's plain black or white margins instead
// (Crop borders), at full size, and says which part of the page was kept.
import { findBorders } from './page-crop.js';
const close = bitmap => { try { bitmap?.close?.(); } catch { /* Already released. */ } };
// The browser's own resizing, when it gives the requested shape (it may
// ignore the request, or turn the page by its EXIF orientation first).
async function decode(blob, resize) {
  if (resize?.width > 0 && resize?.height > 0) {
    try {
      const bitmap = await createImageBitmap(blob, { resizeWidth: resize.width, resizeHeight: resize.height, resizeQuality: 'high' });
      const wanted = resize.width / resize.height, got = bitmap.width / bitmap.height;
      if (Math.abs(got - wanted) <= wanted * .02) return bitmap;
      close(bitmap);
    } catch { /* Decoded at full size below. */ }
  }
  return createImageBitmap(blob);
}
self.onmessage = async event => {
  const { id, blob, maxWidth = 340, maxHeight = 224, quality = .72, resize, crop } = event.data || {};
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') { self.postMessage({ id, unsupported: true }); return; }
  let bitmap, canvas;
  if (crop) {
    try {
      bitmap = await createImageBitmap(blob);
      const made = await cropBitmap(bitmap, quality);
      if (!made) { self.postMessage({ id, nothing: true }); return; }
      self.postMessage({ id, ...made });
    } catch { self.postMessage({ id, error: true }); }
    finally { close(bitmap); }
    return;
  }
  try {
    bitmap = await decode(blob, resize);
    const width = bitmap.width, height = bitmap.height;
    if (!(width > 0) || !(height > 0)) { self.postMessage({ id, error: true }); return; }
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context || typeof canvas.convertToBlob !== 'function') { self.postMessage({ id, unsupported: true }); return; }
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    close(bitmap); bitmap = undefined;
    const result = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    self.postMessage({ id, blob: result, width: canvas.width, height: canvas.height });
  } catch { self.postMessage({ id, error: true }); }
  finally { close(bitmap); if (canvas) { canvas.width = 0; canvas.height = 0; } }
};

// The page without its plain margins (null when it has none worth cutting).
async function cropBitmap(bitmap, quality) {
  const width = bitmap.width, height = bitmap.height;
  if (!(width > 0) || !(height > 0)) return null;
  const scale = Math.min(1, 360 / Math.max(width, height));
  const small = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  const look = small.getContext('2d', { willReadFrequently: true });
  if (!look) return null;
  look.drawImage(bitmap, 0, 0, small.width, small.height);
  const box = findBorders(look.getImageData(0, 0, small.width, small.height));
  small.width = small.height = 0;
  if (!box) return null;
  const sx = Math.round(box.x * width), sy = Math.round(box.y * height), sw = Math.max(1, Math.round(box.width * width)), sh = Math.max(1, Math.round(box.height * height));
  const canvas = new OffscreenCanvas(sw, sh), context = canvas.getContext('2d', { alpha: false });
  if (!context || typeof canvas.convertToBlob !== 'function') return null;
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  try {
    const result = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    return { blob: result, width: sw, height: sh, box: { x: sx / width, y: sy / height, width: sw / width, height: sh / height } };
  } finally { canvas.width = canvas.height = 0; }
}
