// Enlarge balloons (optional): a tapped balloon comes out of the page bigger,
// cut to its own shape (see balloon-cutout.js), over the page a little darker;
// a touch anywhere puts it back. Nothing leaves the device.
import { cutBalloon, cutoutWindow } from './balloon-cutout.js';

// The cut is worked out on a copy of the part of the page around the balloon,
// about this many pixels across (letters stay at least 9 pixels tall in it).
const WORK_SIDE = 640;
// Capital letters of the enlarged balloon: about this tall (CSS pixels).
export const ENLARGED_LETTER = 15;

/**
 * Where the enlarged balloon goes: from `start` (its place on the screen now,
 * CSS pixels), bigger until its letters are about `goal` tall (at least half
 * as big again), never past the screen's edges (`viewport`: width, height and
 * the parts kept free at each side), centred where it was as far as it fits.
 */
export function zoomGeometry({ start, letter, viewport, goal = ENLARGED_LETTER, margin = 14 }) {
  const top = (viewport.top || 0) + margin, left = (viewport.left || 0) + margin;
  const right = viewport.width - (viewport.right || 0) - margin, bottom = viewport.height - (viewport.bottom || 0) - margin;
  const room = Math.min((right - left) / start.width, (bottom - top) / start.height);
  const wanted = Math.max(1.5, letter > 0 ? goal / letter : 1.5);
  const scale = Math.max(Math.min(wanted, room), Math.min(1, room));
  const width = start.width * scale, height = start.height * scale;
  const place = (center, size, low, high) => size >= high - low ? (low + high - size) / 2 : Math.min(Math.max(center - size / 2, low), high - size);
  return { x: place(start.x + start.width / 2, width, left, right), y: place(start.y + start.height / 2, height, top, bottom), width, height, scale };
}

/** The balloon cut out of the page shown: the cut, and the part of the page it was worked out on. */
export function prepareCutout(image, balloon, { canvasFactory = () => document.createElement('canvas') } = {}) {
  const pageWidth = image.naturalWidth || image.width, pageHeight = image.naturalHeight || image.height;
  if (!(pageWidth > 0 && pageHeight > 0) || !(balloon?.letter > 0) || !balloon.text) return null;
  const letterPx = balloon.letter * pageHeight;
  let chosen = null;
  for (const wider of [1, 2.2]) {
    const window = cutoutWindow(balloon, pageWidth, pageHeight, { wider });
    const scale = Math.max(Math.min(1, WORK_SIDE / Math.max(window.width, window.height)), Math.min(1, 9 / letterPx));
    const width = Math.max(8, Math.round(window.width * scale)), height = Math.max(8, Math.round(window.height * scale));
    const canvas = canvasFactory(); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return chosen;
    context.imageSmoothingQuality = 'high';
    let pixels;
    try { context.drawImage(image, window.x, window.y, window.width, window.height, 0, 0, width, height); pixels = context.getImageData(0, 0, width, height); }
    catch { return chosen; }
    finally { canvas.width = canvas.height = 0; }
    const sx = width / window.width, sy = height / window.height;
    const box = rect => ({ x: (rect.x * pageWidth - window.x) * sx, y: (rect.y * pageHeight - window.y) * sy, width: rect.width * pageWidth * sx, height: rect.height * pageHeight * sy });
    const cut = cutBalloon(pixels, box(balloon.text), { balloon: box(balloon), letter: letterPx * sy });
    const found = { cut, window, width, height };
    // A wider look is kept when it finds the balloon's shape (more of it than the first look).
    if (!chosen || cut.kind === 'shape') chosen = found;
    if (!(cut.open && !window.whole)) break;
  }
  return chosen;
}

/** The part of the page the cut covers (page pixels). */
export function cutoutOnPage({ cut, window, width, height }) {
  const fx = window.width / width, fy = window.height / height;
  return { x: window.x + cut.box.x * fx, y: window.y + cut.box.y * fy, width: cut.box.width * fx, height: cut.box.height * fy };
}

// The enlarged balloon, drawn from the page itself at the size it is shown.
function drawCutout(image, prepared, { width, height, ratio, canvasFactory }) {
  const { cut, width: workWidth } = prepared, source = cutoutOnPage(prepared);
  const canvas = canvasFactory();
  canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);
  // Its shape (soft at the edge), stretched over the same place.
  const shape = canvasFactory(); shape.width = cut.box.width; shape.height = cut.box.height;
  const shapeContext = shape.getContext('2d');
  if (shapeContext) {
    const alpha = shapeContext.createImageData(cut.box.width, cut.box.height);
    for (let y = 0; y < cut.box.height; y++) for (let x = 0; x < cut.box.width; x++) alpha.data[(y * cut.box.width + x) * 4 + 3] = cut.mask[(cut.box.y + y) * workWidth + cut.box.x + x];
    shapeContext.putImageData(alpha, 0, 0);
    context.globalCompositeOperation = 'destination-in';
    context.drawImage(shape, 0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'source-over';
  }
  shape.width = shape.height = 0;
  // A piece of the page without a balloon of its own gets a thin light border, like a card.
  if (cut.kind === 'card') {
    const scale = canvas.width / cut.box.width, line = Math.max(1.5, 1.5 * ratio), inset = line / 2 + .5;
    const radius = Math.max(2, (cut.radius || 6) * scale - inset);
    context.lineWidth = line; context.strokeStyle = 'rgba(255,255,255,.92)';
    context.beginPath();
    if (typeof context.roundRect === 'function') context.roundRect(inset, inset, canvas.width - 2 * inset, canvas.height - 2 * inset, radius);
    else context.rect(inset, inset, canvas.width - 2 * inset, canvas.height - 2 * inset);
    context.stroke();
  }
  return canvas;
}

/**
 * The enlarged balloon over the reader (`parent`). `open` returns false when
 * nothing could be shown (then the tap does what it always did); `close` puts
 * it back (at once with `instant`).
 */
export function createBalloonZoom({ parent, canvasFactory = () => document.createElement('canvas'), onOpen, onClose } = {}) {
  let layer = null, start = null, cut = null, timer = 0;
  function remove() {
    clearTimeout(timer); timer = 0;
    if (layer) { layer.remove(); if (cut) cut.width = cut.height = 0; }
    layer = null; cut = null; start = null;
  }
  function close({ instant = false } = {}) {
    if (!layer || layer.classList.contains('is-closing')) { if (instant) remove(); return; }
    layer.classList.add('is-closing'); layer.classList.remove('is-open');
    if (cut && start) cut.style.transform = start;
    onClose?.();
    if (instant) remove(); else timer = setTimeout(remove, 280);
  }
  function open({ image, balloon, imageRect, viewport, calm = false }) {
    remove();
    if (!parent || !image || !(imageRect?.width > 0 && imageRect?.height > 0)) return false;
    const prepared = prepareCutout(image, balloon, { canvasFactory });
    if (!prepared) return false;
    const pageWidth = image.naturalWidth || image.width, pageHeight = image.naturalHeight || image.height;
    const onPage = cutoutOnPage(prepared), kx = imageRect.width / pageWidth, ky = imageRect.height / pageHeight;
    const now = { x: imageRect.left + onPage.x * kx, y: imageRect.top + onPage.y * ky, width: onPage.width * kx, height: onPage.height * ky };
    if (!(now.width > 2 && now.height > 2)) return false;
    const target = zoomGeometry({ start: now, letter: balloon.letter * imageRect.height, viewport });
    // Sharp on this screen, but never far past the page's own pixels.
    const deviceRatio = Math.min(3, Math.max(1, globalThis.devicePixelRatio || 1));
    const ratio = Math.max(1, Math.min(deviceRatio, 2.5 * onPage.width / target.width, 2048 / Math.max(target.width, target.height)));
    const canvas = drawCutout(image, prepared, { width: target.width, height: target.height, ratio, canvasFactory });
    if (!canvas) return false;
    layer = document.createElement('div'); layer.className = 'reader-balloon-zoom' + (calm ? ' is-calm' : ''); layer.dataset.kind = prepared.cut.kind;
    const dim = document.createElement('div'); dim.className = 'reader-balloon-zoom-dim';
    canvas.className = 'reader-balloon-zoom-cut'; canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { left: `${target.x}px`, top: `${target.y}px`, width: `${target.width}px`, height: `${target.height}px` });
    start = `translate(${now.x - target.x}px, ${now.y - target.y}px) scale(${now.width / target.width}, ${now.height / target.height})`;
    canvas.style.transform = start;
    layer.append(dim, canvas); parent.append(layer); cut = canvas;
    // Any touch on it puts the balloon back (and nothing else happens with it).
    let pressed = false;
    layer.addEventListener('pointerdown', event => { pressed = true; event.preventDefault(); event.stopPropagation(); });
    layer.addEventListener('pointerup', event => { event.preventDefault(); event.stopPropagation(); if (pressed) close(); pressed = false; });
    layer.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
    layer.addEventListener('contextmenu', event => event.preventDefault());
    void canvas.offsetWidth;
    layer.classList.add('is-open'); canvas.style.transform = '';
    onOpen?.(prepared.cut.kind);
    return true;
  }
  return { open, close, get isOpen() { return Boolean(layer) && !layer.classList.contains('is-closing'); } };
}
