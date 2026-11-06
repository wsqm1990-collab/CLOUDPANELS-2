// Crop borders (optional, off unless switched on in the reader's Appearance):
// plain black or white margins around a page are cut off, so the drawing is
// bigger on the screen. Panels found or drawn on a page are always kept as
// parts of the whole page, so they stay right with the option on or off.

const luma = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
function median(values) { const sorted = [...values].sort((a, b) => a - b); return sorted[sorted.length >> 1]; }

/**
 * The part of the page inside its plain margins, as fractions of the page
 * ({ x, y, width, height }), or null when there is nothing worth cutting.
 * `image`: RGBA pixels of a small copy of the page ({ data, width, height }).
 * Only margins of near-black or near-white paper count (a coloured sky that
 * reaches the edge is drawing). A line of the margin may have a few specks.
 */
export function findBorders({ data, width, height } = {}, { tolerance = 40, share = .97, maxSide = .25, least = .012, keep = .004 } = {}) {
  if (!data || !(width >= 16) || !(height >= 16) || data.length < width * height * 4) return null;
  const offset = (x, y) => (y * width + x) * 4;
  // How far from one side the plain margin goes (in lines of the small copy).
  function depth(lineCount, lineLength, pixel, limit) {
    const outer = Array.from({ length: lineLength }, (_, i) => pixel(0, i));
    const paper = [0, 1, 2].map(channel => median(outer.map(o => data[o + channel])));
    const light = luma(...paper);
    if (!(light <= 70 || light >= 190)) return 0;
    let lines = 0;
    while (lines < Math.min(limit, lineCount)) {
      let close = 0;
      for (let i = 0; i < lineLength; i++) {
        const o = pixel(lines, i);
        if (Math.max(Math.abs(data[o] - paper[0]), Math.abs(data[o + 1] - paper[1]), Math.abs(data[o + 2] - paper[2])) <= tolerance) close++;
      }
      if (close < share * lineLength) break;
      lines++;
    }
    return lines;
  }
  const maxRows = Math.floor(height * maxSide), maxCols = Math.floor(width * maxSide);
  const top = depth(height, width, (line, i) => offset(i, line), maxRows);
  const bottom = depth(height, width, (line, i) => offset(i, height - 1 - line), maxRows);
  // Columns only between the top and bottom margins already found.
  const rows = Math.max(1, height - top - bottom), first = Math.min(top, height - 1);
  const left = depth(width, rows, (line, i) => offset(line, Math.min(height - 1, first + i)), maxCols);
  const right = depth(width, rows, (line, i) => offset(width - 1 - line, Math.min(height - 1, first + i)), maxCols);
  // A hair of margin is left, so the edge of the drawing is never cut.
  const cut = (lines, size) => Math.max(0, lines / size - keep);
  const box = { left: cut(left, width), right: cut(right, width), top: cut(top, height), bottom: cut(bottom, height) };
  if (Math.max(box.left, box.right, box.top, box.bottom) < least) return null;
  const round = value => Math.round(value * 10000) / 10000;
  return { x: round(box.left), y: round(box.top), width: round(1 - box.left - box.right), height: round(1 - box.top - box.bottom) };
}

/** A part of the whole page (fractions) as part of the cropped page (what reaches into the margin is left out). */
export function toCropped(rect, box) {
  if (!box || !rect) return rect;
  const left = Math.max(0, (rect.x - box.x) / box.width), top = Math.max(0, (rect.y - box.y) / box.height);
  const right = Math.min(1, (rect.x + rect.width - box.x) / box.width), bottom = Math.min(1, (rect.y + rect.height - box.y) / box.height);
  return { ...rect, x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** A part of the cropped page (fractions) as part of the whole page. */
export function toWhole(rect, box) {
  if (!box || !rect) return rect;
  return { ...rect, x: box.x + rect.x * box.width, y: box.y + rect.y * box.height, width: rect.width * box.width, height: rect.height * box.height };
}
