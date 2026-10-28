/**
 * Take one deliberate reading step. Page transitions can target panel -1 when
 * the preceding page's panel count has not been loaded yet. The controller
 * resolves that sentinel and keeps overview only if the new page has panels.
 */
export function stepReadingPosition({ page = 0, pageCount = 0, panel = 0, panelCount = 0, guided = false, overview = false, delta = 0, showOverview = true } = {}) {
  const current = kind => ({ kind, page, panel, overview: Boolean(overview) });
  if ((delta !== 1 && delta !== -1) || !Number.isSafeInteger(pageCount) || pageCount < 1 ||
      !Number.isSafeInteger(page) || page < 0 || page >= pageCount ||
      !Number.isSafeInteger(panelCount) || panelCount < 0 ||
      !Number.isSafeInteger(panel) || panel < 0 || (panelCount > 0 && panel >= panelCount)) return current('none');

  if (guided && panelCount > 0) {
    if (overview) {
      if (delta < 0) return { kind: 'panel', page, panel: panelCount - 1, overview: false };
      if (page + 1 >= pageCount) return current('end');
      return { kind: 'page', page: page + 1, panel: 0, overview: false };
    }
    if (delta > 0 && panel === panelCount - 1) {
      // The whole-page view after the last panel is optional.
      if (showOverview) return { kind: 'overview', page, panel, overview: true };
      if (page + 1 >= pageCount) return current('end');
      return { kind: 'page', page: page + 1, panel: 0, overview: false };
    }
    if (panel + delta >= 0 && panel + delta < panelCount) return { kind: 'panel', page, panel: panel + delta, overview: false };
    if (page === 0) return current('none');
    return { kind: 'page', page: page - 1, panel: -1, overview: showOverview };
  }

  const nextPage = page + delta;
  if (nextPage < 0) return { kind: 'none', page, panel, overview: false };
  if (nextPage >= pageCount) return { kind: 'end', page, panel, overview: false };
  return { kind: 'page', page: nextPage, panel: delta < 0 && guided ? -1 : 0, overview: Boolean(delta < 0 && guided && showOverview) };
}

/**
 * Landscape two-page view: the cover and wide (double) pages stand alone, and
 * two upright pages sit side by side. Which neighbour page `index` may pair
 * with, in the order to try: reading forward the next page, going back the
 * previous one, and when jumping to a page its usual left-hand partner (odd
 * pages start a pair) before the next page. A double page in the middle of a
 * comic therefore never makes the view skip it or get stuck on one page.
 */
export function spreadPartners({ index, pageCount, mode = 'jump' } = {}) {
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(pageCount) || index < 1 || index >= pageCount) return [];
  const before = index - 1 >= 1 ? [index - 1] : [], after = index + 1 < pageCount ? [index + 1] : [];
  if (mode === 'backward') return before;
  if (mode === 'forward') return after;
  return index % 2 ? after : [...before, ...after];
}
