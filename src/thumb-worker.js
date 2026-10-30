// Makes small page thumbnails for the page navigator away from the reader's
// thread: decodes the page, scales it down on an OffscreenCanvas and encodes a
// small JPEG. Page pixels stay on this device; the worker makes no requests.
self.onmessage = async event => {
  const { id, blob, maxWidth = 340, maxHeight = 224, quality = .72 } = event.data || {};
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') { self.postMessage({ id, unsupported: true }); return; }
  let bitmap, canvas;
  try {
    bitmap = await createImageBitmap(blob);
    const width = bitmap.width, height = bitmap.height;
    if (!(width > 0) || !(height > 0)) { self.postMessage({ id, error: true }); return; }
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context || typeof canvas.convertToBlob !== 'function') { self.postMessage({ id, unsupported: true }); return; }
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.(); bitmap = undefined;
    const thumbnail = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    self.postMessage({ id, blob: thumbnail, width, height });
  } catch { self.postMessage({ id, error: true }); }
  finally { bitmap?.close?.(); if (canvas) { canvas.width = 0; canvas.height = 0; } }
};
