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
