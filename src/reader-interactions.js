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

/** A backwards page turn can request the last panel before its count is known. */
export function resolvePanelIndex(target, count) {
  count = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
  if (!count) return 0;
  const requested = Number(target);
  if (requested === -1) return count - 1;
  return Math.max(0, Math.min(count - 1, Number.isFinite(requested) ? Math.floor(requested) : 0));
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
