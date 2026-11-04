import { orderPanels } from './panel-detection.js';

/** Fit every edge of a page inside the available stage without rounding up. */
export function wholePageFit({ imageWidth, imageHeight, availableWidth, availableHeight } = {}) {
  if (![imageWidth, imageHeight, availableWidth, availableHeight].every(value => Number.isFinite(value) && value > 0)) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight);
  // Clamp floating-point noise as well: a fractional viewport must never gain
  // a scrollable extra pixel because its fitted height was rounded upward.
  return {
    width: Math.min(availableWidth, imageWidth * scale),
    height: Math.min(availableHeight, imageHeight * scale),
  };
}

/** Preserve page aspect while containing every edge, fitting the width, or
 * filling the view. Width/fill overflow remains scrollable, not clipped away.
 */
export function pageFit({ mode = 'whole', imageWidth, imageHeight, availableWidth, availableHeight } = {}) {
  if (mode === 'screen') mode = 'fill'; // fills the area below the status bar
  if (mode === 'height') {
    // A double page with the tablet upright: as tall as the screen, and the
    // reader slides sideways across it.
    if (![imageWidth, imageHeight, availableHeight].every(value => Number.isFinite(value) && value > 0)) return { width: 0, height: 0 };
    const width = imageWidth * (availableHeight / imageHeight);
    return Number.isFinite(width) && width > 0 ? { width, height: availableHeight } : { width: 0, height: 0 };
  }
  if (mode === 'width') {
    if (![imageWidth, imageHeight, availableWidth].every(value => Number.isFinite(value) && value > 0)) return { width: 0, height: 0 };
    const height = imageHeight * (availableWidth / imageWidth);
    return Number.isFinite(height) && height > 0 ? { width: availableWidth, height } : { width: 0, height: 0 };
  }
  if (mode !== 'fill') return wholePageFit({ imageWidth, imageHeight, availableWidth, availableHeight });
  if (![imageWidth, imageHeight, availableWidth, availableHeight].every(value => Number.isFinite(value) && value > 0)) return { width: 0, height: 0 };
  const scale = Math.max(availableWidth / imageWidth, availableHeight / imageHeight);
  return { width: Math.max(availableWidth, imageWidth * scale), height: Math.max(availableHeight, imageHeight * scale) };
}

/** A page wider than it is tall (usually a double page) shown on an upright
 * screen fills the screen's height instead of shrinking to a thin strip, so it
 * can be read by sliding sideways (like the Panels app). Fill modes already do
 * this on their own; "Whole page" and "Fit width" switch to it for such pages.
 */
export function slideFitMode({ mode = 'whole', imageWidth, imageHeight, availableWidth, availableHeight, slideWide = true } = {}) {
  if (!slideWide || (mode !== 'whole' && mode !== 'width')) return mode;
  if (![imageWidth, imageHeight, availableWidth, availableHeight].every(value => Number.isFinite(value) && value > 0)) return mode;
  return imageWidth > imageHeight && availableWidth < availableHeight ? 'height' : mode;
}

/** How far a page must reach past the sides before it slides sideways. Smaller
 * overhangs stay centred: an extra swipe for a sliver of artwork is not worth it. */
export function slideThreshold(availableWidth) {
  return Number.isFinite(availableWidth) && availableWidth > 0 ? Math.max(24, availableWidth * .06) : 24;
}

/** Breathing room around a panel in Panel view: a panel found a few pixels
 * off (or rounding) must never cut its own border off at the screen edge. */
export function guidedPanelMargin(availableWidth, availableHeight) {
  if (![availableWidth, availableHeight].every(value => Number.isFinite(value) && value > 0)) return 0;
  return Math.max(8, Math.min(availableWidth, availableHeight) * .025);
}

/** Fit a normalized panel, retaining its location within the scaled full page. */
export function guidedPanelFit({ imageWidth, imageHeight, availableWidth, availableHeight, panel, margin = 0 } = {}) {
  if (![imageWidth, imageHeight, availableWidth, availableHeight].every(value => Number.isFinite(value) && value > 0) || !panel || typeof panel !== 'object') return null;
  const x = panel.x, y = panel.y, panelWidth = panel.width ?? panel.w, panelHeight = panel.height ?? panel.h;
  if (![x, y, panelWidth, panelHeight].every(Number.isFinite) || x < 0 || y < 0 || panelWidth <= 0 || panelHeight <= 0 || x + panelWidth > 1 || y + panelHeight > 1) return null;
  const inset = Number.isFinite(margin) && margin > 0 ? Math.min(margin, availableWidth * .2, availableHeight * .2) : 0;
  const scale = Math.min((availableWidth - inset * 2) / (imageWidth * panelWidth), (availableHeight - inset * 2) / (imageHeight * panelHeight));
  const width = imageWidth * scale, height = imageHeight * scale;
  if (![scale, width, height].every(value => Number.isFinite(value) && value > 0)) return null;
  return {
    width, height,
    panelWidth: Math.min(availableWidth, width * panelWidth),
    panelHeight: Math.min(availableHeight, height * panelHeight),
    centerX: width * (x + panelWidth / 2),
    centerY: height * (y + panelHeight / 2),
  };
}

/**
 * Enhanced guided view: a page with no panels found is read in a few
 * overlapping parts, in reading order, instead of only as a whole page.
 * Picks the grid that makes the art clearly bigger with the fewest steps
 * (single columns preferred), or none when splitting would not help.
 */
export function readingParts({ imageWidth, imageHeight, availableWidth, availableHeight, direction = 'ltr', overlap = .1, maxParts = 6 } = {}) {
  if (![imageWidth, imageHeight, availableWidth, availableHeight].every(value => Number.isFinite(value) && value > 0)) return [];
  const whole = Math.min(availableWidth / imageWidth, availableHeight / imageHeight);
  let best = null;
  for (let count = 2; count <= maxParts; count++) {
    for (let columns = 1; columns <= count; columns++) {
      if (count % columns) continue;
      const rows = count / columns;
      const width = Math.min(1, (1 + (columns - 1) * overlap) / columns), height = Math.min(1, (1 + (rows - 1) * overlap) / rows);
      const gain = Math.min(availableWidth / (imageWidth * width), availableHeight / (imageHeight * height)) / whole;
      if (gain < 1.3) continue;
      // Zoom past twice the whole page adds steps without helping to read.
      const score = Math.min(gain, 2) - .15 * (count - 1) - .25 * (columns - 1);
      if (!best || score > best.score + 1e-9) best = { score, columns, rows, width, height };
    }
  }
  if (!best) return [];
  const parts = [], position = (index, size, total) => total > 1 ? index * (1 - size) / (total - 1) : 0;
  for (let row = 0; row < best.rows; row++) {
    for (let step = 0; step < best.columns; step++) {
      const column = direction === 'rtl' ? best.columns - 1 - step : step;
      const x = position(column, best.width, best.columns), y = position(row, best.height, best.rows);
      parts.push({ x, y, width: Math.min(best.width, 1 - x), height: Math.min(best.height, 1 - y) });
    }
  }
  return parts;
}

/**
 * Enhanced guided view: areas of a page that no panel found covers but that
 * hold drawing (a splash behind the panels, a big title), so they are read
 * too instead of skipped. `busy` marks the cells of a `cols` × `rows` grid
 * laid over the page: 1 for drawing, 0 for plain paper. An area shaped like
 * an L is cut into bands; tiny scraps, margins and gutters are left out.
 */
export function uncoveredRegions({ rects = [], busy, cols, rows, minArea = .035, minWidth = .08, minHeight = .08, minFill = .45, pad = .012 } = {}) {
  if (!busy || !Number.isInteger(cols) || !Number.isInteger(rows) || cols < 4 || rows < 4 || busy.length !== cols * rows) return [];
  const panels = (Array.isArray(rects) ? rects : []).filter(rect => rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite));
  const count = cols * rows, open = new Uint8Array(count), drawn = new Uint8Array(count);
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x = (col + .5) / cols, y = (row + .5) / rows, index = row * cols + col;
    const covered = panels.some(rect => x >= rect.x - pad && x <= rect.x + rect.width + pad && y >= rect.y - pad && y <= rect.y + rect.height + pad);
    open[index] = covered ? 0 : 1; drawn[index] = !covered && busy[index] ? 1 : 0;
  }
  // Flat colour inside a drawing still belongs to it: open cells next to drawing join in.
  const joined = new Uint8Array(count);
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const index = row * cols + col;
    if (!open[index]) continue;
    let near = drawn[index];
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) {
      const r = row + dy, c = col + dx;
      if (r >= 0 && r < rows && c >= 0 && c < cols && drawn[r * cols + c]) near = 1;
    }
    joined[index] = near;
  }
  const seen = new Uint8Array(count), regions = [], tolerance = Math.max(2, Math.round(cols * .06));
  for (let start = 0; start < count; start++) {
    if (!joined[start] || seen[start]) continue;
    const extent = new Map(), queue = [start]; seen[start] = 1;
    while (queue.length) {
      const index = queue.pop(), row = Math.floor(index / cols), col = index % cols;
      // The area's edges follow the drawing itself, not the paper around it.
      if (drawn[index]) { const span = extent.get(row); if (span) { span[0] = Math.min(span[0], col); span[1] = Math.max(span[1], col); } else extent.set(row, [col, col]); }
      for (const [r, c] of [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]) {
        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
        const next = r * cols + c;
        if (joined[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
      }
    }
    const bands = [];
    for (const row of [...extent.keys()].sort((a, b) => a - b)) {
      const [low, high] = extent.get(row), band = bands[bands.length - 1];
      if (band && band.bottom === row - 1 && Math.abs(low - band.low) <= tolerance && Math.abs(high - band.high) <= tolerance) { band.low = Math.min(band.low, low); band.high = Math.max(band.high, high); band.bottom = row; }
      else bands.push({ low, high, top: row, bottom: row });
    }
    for (const band of bands) {
      const width = (band.high - band.low + 1) / cols, height = (band.bottom - band.top + 1) / rows;
      let cells = 0;
      for (let row = band.top; row <= band.bottom; row++) for (let col = band.low; col <= band.high; col++) cells += drawn[row * cols + col];
      const area = width * height;
      if (area < minArea || width < minWidth || height < minHeight || cells / ((band.high - band.low + 1) * (band.bottom - band.top + 1)) < minFill) continue;
      const region = { x: band.low / cols, y: band.top / rows, width, height };
      // Not a copy of a panel that is already read.
      const overlap = panels.reduce((sum, rect) => sum + Math.max(0, Math.min(region.x + region.width, rect.x + rect.width) - Math.max(region.x, rect.x)) * Math.max(0, Math.min(region.y + region.height, rect.y + rect.height) - Math.max(region.y, rect.y)), 0);
      if (overlap <= region.width * region.height * .5) regions.push(region);
    }
  }
  return regions.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Enhanced guided view: the steps of a page with panels found — the panels
 * plus the drawing outside them (see uncoveredRegions), in reading order. A
 * big area (a splash) is read in parts; a smaller one shows whole, like a panel.
 */
export function pageReadingSteps({ rects = [], busy, cols, rows, imageWidth, imageHeight, availableWidth, availableHeight, direction = 'ltr' } = {}) {
  if (!Array.isArray(rects) || !rects.length) return Array.isArray(rects) ? rects : [];
  const extras = uncoveredRegions({ rects, busy, cols, rows }).flatMap(region => {
    if (region.width * region.height < .2) return [region];
    const parts = readingParts({ imageWidth: imageWidth * region.width, imageHeight: imageHeight * region.height, availableWidth, availableHeight, direction });
    return parts.length ? parts.map(part => ({ x: region.x + part.x * region.width, y: region.y + part.y * region.height, width: part.width * region.width, height: part.height * region.height })) : [region];
  });
  if (!extras.length) return rects;
  // Ordered with slightly smaller stand-ins, so an area that only touches
  // the panels next to it keeps its place before or after them.
  const inset = rect => { const dx = Math.min(.025, rect.width * .1), dy = Math.min(.025, rect.height * .1); return { x: rect.x + dx, y: rect.y + dy, width: rect.width - 2 * dx, height: rect.height - 2 * dy, source: rect }; };
  return orderPanels([...rects, ...extras.map(inset)], direction).map(item => item.source || item);
}

/** A backwards page turn can request the last panel before its count is known. */
export function resolvePanelIndex(target, count) {
  count = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
  if (!count) return 0;
  const requested = Number(target);
  if (requested === -1) return count - 1;
  return Math.max(0, Math.min(count - 1, Number.isFinite(requested) ? Math.floor(requested) : 0));
}

/**
 * How the reader turns pages, chosen in Reading appearance / Settings:
 * 'both' (swipe and tap the sides; the default), 'swipe' (taps on the sides
 * only show or hide the controls) or 'tap' (sideways drags never turn a page
 * or panel; they still slide across a wide or zoomed page).
 */
export function turnInputs(mode) {
  const value = mode === 'swipe' || mode === 'tap' ? mode : 'both';
  return { mode: value, swipe: value !== 'tap', tap: value !== 'swipe' };
}

/** Intrinsic fill scaling is the reading baseline, not a manual zoom gesture. */
export function canSwipePages({ pageWidth, baselineWidth, browserScale = 1, panning = false, guided = false, guidedReady = false, editing = false, popup = false, loading = false } = {}) {
  if (panning || (guided && !guidedReady) || editing || popup || loading || ![pageWidth, baselineWidth, browserScale].every(Number.isFinite) || pageWidth <= 0 || baselineWidth <= 0 || browserScale <= 0 || browserScale > 1.035) return false;
  return Math.abs(pageWidth - baselineWidth) <= Math.max(1, baselineWidth * .035);
}

/**
 * Return logical previous/next navigation for a deliberate single-finger swipe.
 * Positive dx means the finger moved right; reading direction determines which
 * logical page that reveals. Zooming, panel editing and pinch gestures own their
 * pointer sequences and must never turn a page.
 */
export function decideSwipe({ dx, dy, duration, width, resistance = 3, direction = 'ltr', zoomed = false, editing = false, multiTouch = false } = {}) {
  if (zoomed || editing || multiTouch || ![dx, dy, duration, width].every(Number.isFinite) || duration <= 0 || width <= 0) return 0;
  const distance = Math.abs(dx), vertical = Math.abs(dy);
  // Travel, rather than touch pressure, expresses intent on phones and tablets.
  // Require a substantial part of the viewport even for a very fast flick.
  // Velocity must not let an incidental adjustment bypass this resistance.
  if (distance < vertical * 2.5) return 0;
  const levels = [null, { ratio: .16, min: 56, max: 140 }, { ratio: .23, min: 72, max: 200 }, { ratio: .30, min: 90, max: 260 }, { ratio: .38, min: 110, max: 320 }, { ratio: .46, min: 130, max: 380 }];
  const level = Number.isInteger(resistance) && resistance >= 1 && resistance <= 5 ? levels[resistance] : levels[3];
  if (distance < Math.max(level.min, Math.min(level.max, width * level.ratio))) return 0;
  const logical = dx < 0 ? 1 : -1;
  return direction === 'rtl' ? -logical : logical;
}


/** Physical side taps stay left=previous/right=next in either reading direction.
 * A drag which returns to its starting point is still a drag, not a side tap.
 */
export function decideTapNavigation({ x, y, dx, dy, distance, duration, unchanged = true, insideSafeArea = true, zoomed = false, panning = false, editing = false, popup = false, loading = false, analysisPending = false, multiTouch = false, cancelled = false, dragging = false } = {}) {
  if (!unchanged || !insideSafeArea || zoomed || panning || editing || popup || loading || analysisPending || multiTouch || cancelled || dragging) return 0;
  if (![x, y, dx, dy, distance, duration].every(Number.isFinite) || x < 0 || x > 1 || y < 0 || y > 1 || distance < 0 || duration <= 0 || duration >= 400) return 0;
  if (Math.max(distance, Math.hypot(dx, dy)) >= 9) return 0;
  if (x < .25) return -1;
  if (x > .75) return 1;
  return 0;
}
