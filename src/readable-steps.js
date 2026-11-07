// Readable balloons in Panel view (optional, off at first). A panel whose
// lettering would show too small on this screen is shown whole first (the
// drawing, as the artist framed it), then its balloons are brought close, a
// few at a time and in reading order, at a size that reads well. Nothing is
// skipped: a balloon breaking out of its panel, or sitting between panels,
// joins the panel it belongs to. Pure geometry; fractions of the page.

/** The height capital letters are brought to (CSS pixels), by choice. */
export const LETTER_TARGETS = Object.freeze({ normal: 9.5, large: 11.5, xlarge: 13.5 });
export const letterTarget = choice => LETTER_TARGETS[choice] || 0;

const right = rect => rect.x + rect.width, bottom = rect => rect.y + rect.height;
const union = (a, b) => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(right(a), right(b)) - x, height: Math.max(bottom(a), bottom(b)) - y };
};
const shared = (a, b) => Math.max(0, Math.min(right(a), right(b)) - Math.max(a.x, b.x)) * Math.max(0, Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y));
const inside = (rect, x, y) => x >= rect.x && x <= right(rect) && y >= rect.y && y <= bottom(rect);
const distance = (rect, x, y) => Math.hypot(Math.max(rect.x - x, 0, x - right(rect)), Math.max(rect.y - y, 0, y - bottom(rect)));
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[sorted.length >> 1] : 0; };
const clampRect = rect => {
  const x = Math.max(0, rect.x), y = Math.max(0, rect.y);
  return { x, y, width: Math.min(1, right(rect)) - x, height: Math.min(1, bottom(rect)) - y };
};
const valid = rect => [rect?.x, rect?.y, rect?.width, rect?.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;

/** What of a balloon must be seen: its lettering, with a little of the balloon around it. */
export function balloonBox(balloon, aspect = 1) {
  const text = valid(balloon?.text) ? balloon.text : balloon, letter = Number(balloon?.letter) || 0;
  // Up to about a letter and a half of the balloon on each side (its margin and outline).
  const padY = letter * 1.4, padX = padY / (aspect || 1);
  const outer = valid(balloon) ? union(balloon, text) : text;
  return clampRect({
    x: Math.max(outer.x, text.x - padX), y: Math.max(outer.y, text.y - padY),
    width: Math.min(right(outer), right(text) + padX) - Math.max(outer.x, text.x - padX),
    height: Math.min(bottom(outer), bottom(text) + padY) - Math.max(outer.y, text.y - padY),
  });
}

/**
 * Balloons in reading order: row by row from the top; in a row, from the left
 * (from the right in comics read right to left). A balloon starting level with
 * the upper part of a row's first balloon is in that row.
 */
export function balloonOrder(balloons = [], direction = 'ltr') {
  const box = balloon => valid(balloon?.text) ? balloon.text : balloon;
  const rows = [];
  for (const balloon of [...balloons].filter(item => valid(box(item))).sort((a, b) => box(a).y - box(b).y)) {
    const row = rows.at(-1), first = row?.[0];
    if (row && box(balloon).y < box(first).y + box(first).height * .6) row.push(balloon); else rows.push([balloon]);
  }
  const rtl = direction === 'rtl';
  return rows.flatMap(row => row.sort((a, b) => rtl ? right(box(b)) - right(box(a)) : box(a).x - box(b).x));
}

/** The step a balloon belongs to: the one holding its lettering, or the nearest. */
export function balloonOwner(steps = [], balloon) {
  const text = valid(balloon?.text) ? balloon.text : balloon;
  if (!steps.length || !valid(text)) return -1;
  const cx = text.x + text.width / 2, cy = text.y + text.height / 2;
  let best = -1, bestArea = Infinity;
  steps.forEach((step, index) => { if (inside(step, cx, cy) && step.width * step.height < bestArea) { best = index; bestArea = step.width * step.height; } });
  if (best >= 0) return best;
  let most = 0;
  steps.forEach((step, index) => { const amount = shared(step, text); if (amount > most) { most = amount; best = index; } });
  if (best >= 0) return best;
  let nearest = Infinity;
  steps.forEach((step, index) => { const gap = distance(step, cx, cy); if (gap < nearest) { nearest = gap; best = index; } });
  return best;
}

// Where a view of `size` goes along one side: around `center`, inside
// `low`–`high` when it fits there; when it is bigger, all of `low`–`high`
// stays in view and the view leans towards `center` (what is being read).
function place(center, size, low, high) {
  if (size >= 1) return { start: 0, size: 1 };
  let start = size >= high - low ? Math.min(Math.max(center - size / 2, high - size), low) : Math.min(Math.max(center - size / 2, low), high - size);
  start = Math.min(Math.max(start, 0), 1 - size);
  return { start, size };
}

/**
 * The steps of a page with its balloons made readable.
 * `steps`: the steps as they are (panels, parts of a page…), in reading order.
 * `balloons`: as found on the page ({ x, y, width, height, text, letter }).
 * `target`: the height capital letters should have (CSS pixels); 0 leaves the steps as they are.
 * `margin`: the room the reader leaves around a step (as in guidedPanelFit).
 * `maxWidth`: the widest the page may be shown (CSS pixels), so the art never blurs.
 * `lead`: false leaves the steps themselves out, only the close views stay (for a page
 *   that was just shown whole).
 * Steps showing balloons close have `frame` (the step they are part of: lit, and
 * shown first), `family` (shared with it), `part`/`parts`, and `balloons` (their lettering).
 */
export function readableSteps({ steps = [], balloons = [], imageWidth, imageHeight, availableWidth, availableHeight, margin = 0, target = 0, maxWidth = Infinity, direction = 'ltr', lead = true } = {}) {
  const unchanged = () => lead ? steps : [];
  if (!(target > 0) || !Array.isArray(steps) || !steps.length || !Array.isArray(balloons) || !balloons.length) return unchanged();
  if (![imageWidth, imageHeight, availableWidth, availableHeight].every(value => Number.isFinite(value) && value > 0)) return unchanged();
  const aspect = imageWidth / imageHeight, inset = Math.max(0, Math.min(margin || 0, availableWidth * .2, availableHeight * .2));
  const roomX = availableWidth - inset * 2, roomY = availableHeight - inset * 2;
  // The page's width on screen when `rect` fills it.
  const widthFor = rect => Math.min(roomX / rect.width, roomY * aspect / rect.height);
  const usable = balloons.filter(balloon => valid(balloon) && Number(balloon.letter) > 0);
  if (!usable.length) return unchanged();
  const owned = steps.map(() => []);
  for (const balloon of usable) { const index = balloonOwner(steps, balloon); if (index >= 0) owned[index].push(balloon); }
  const result = [];
  steps.forEach((step, index) => {
    const mine = owned[index];
    if (!mine.length || !valid(step)) { if (lead) result.push(step); return; }
    // Balloons reaching out of the step are taken in, so none is cut.
    let frame = { x: step.x, y: step.y, width: step.width, height: step.height };
    for (const balloon of mine) {
      const box = balloonBox(balloon, aspect), within = shared(frame, box) / (box.width * box.height);
      if (within < .97) frame = union(frame, box);
    }
    frame = clampRect(frame);
    const grown = Math.abs(frame.x - step.x) + Math.abs(frame.y - step.y) + Math.abs(frame.width - step.width) + Math.abs(frame.height - step.height) > 1e-6;
    const whole = grown ? { ...step, ...frame, source: step.source || step, family: index } : { ...step, family: index };
    const letter = median(mine.map(balloon => Number(balloon.letter)));
    const shown = letter * widthFor(whole) / aspect, wanted = Math.min(maxWidth, target * aspect / letter);
    // Already readable here, or bringing it closer would hardly help: as it was.
    if (shown >= target * .92 || wanted < widthFor(whole) * 1.18) { if (lead) result.push(grown ? whole : step); return; }
    // A few balloons at a time, in reading order: the next one joins the view
    // when it is seen whole there, or when the view can move to take both in.
    const viewOf = box => {
      // A balloon bigger than the screen at that size is shown whole, a little smaller.
      const width = Math.min(wanted, widthFor(box) * .97), sizeX = roomX / width, sizeY = roomY * aspect / width;
      const bounds = union(whole, box);
      const across = place(box.x + box.width / 2, sizeX, bounds.x, right(bounds)), down = place(box.y + box.height / 2, sizeY, bounds.y, bottom(bounds));
      return { x: across.start, y: down.start, width: across.size, height: down.size, zoom: width };
    };
    const seen = (view, box) => box.x >= view.x - 1e-9 && box.y >= view.y - 1e-9 && right(box) <= right(view) + 1e-9 && bottom(box) <= bottom(view) + 1e-9;
    const viewWidth = roomX / wanted, viewHeight = roomY * aspect / wanted, groups = [];
    for (const balloon of balloonOrder(mine, direction)) {
      const box = balloonBox(balloon, aspect), last = groups.at(-1);
      if (last) {
        const joined = union(last.box, box);
        // (Only a view at the size wanted takes in what it shows: one shown smaller would keep that small too.)
        if ((last.view.zoom >= wanted * .999 && seen(last.view, box)) || (joined.width <= viewWidth * .94 && joined.height <= viewHeight * .94)) {
          const view = viewOf(joined);
          if (last.balloons.every(other => seen(view, balloonBox(other, aspect))) && seen(view, box)) { last.box = joined; last.view = view; last.balloons.push(balloon); continue; }
        }
      }
      groups.push({ box, view: viewOf(box), balloons: [balloon] });
    }
    // A view hardly closer than the whole step would only add a tap: its balloons read as well there.
    const closer = groups.filter(group => group.view.zoom >= widthFor(whole) * 1.18);
    if (!closer.length) { if (lead) result.push(grown ? whole : step); return; }
    if (lead) result.push(whole);
    closer.forEach((group, part) => {
      const { x, y, width, height } = group.view;
      result.push({ x, y, width, height, frame: whole, family: index, part: part + 1, parts: closer.length, balloons: group.balloons.map(balloon => valid(balloon.text) ? balloon.text : { x: balloon.x, y: balloon.y, width: balloon.width, height: balloon.height }) });
    });
  });
  return result;
}

/** The step a step is part of (itself when it is a whole one). */
export const stepFrame = step => step?.frame || step;
/** A step's place among the panels: `{ panel, panels, part, parts }` (1-based; part 0 = a whole panel). */
export function stepPosition(steps = [], index = 0) {
  const seen = new Set(); let panels = 0, panel = 0;
  steps.forEach((step, at) => {
    const family = step?.family;
    if (family === undefined || !seen.has(family)) { panels++; if (family !== undefined) seen.add(family); }
    if (at === index) panel = panels;
  });
  const step = steps[index];
  return { panel: Math.max(1, panel), panels: Math.max(1, panels), part: step?.part || 0, parts: step?.parts || 0 };
}
