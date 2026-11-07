// Balloons, captions and lettering on a comic page, found on this device (no
// network, no AI): where each block of text is and how tall its letters are,
// so Panel view can bring every balloon to a size that reads well on a phone.
//
// How: letters are small dark marks of about the same height, side by side
// in rows; rows stacked closely make a block; a block sits on plain paper (a
// balloon or a caption box), unlike the shading and windows of a drawing.
// Light letters on dark balloons are found the same way, the other way round.

const quantile = (values, share) => { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]; };
const median = values => quantile(values, .5);

function unionFind(size) {
  const parent = new Int32Array(size); for (let index = 0; index < size; index++) parent[index] = index;
  const find = index => { while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; } return index; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) { if (a < b) parent[b] = a; else parent[a] = b; } };
  return { find, join };
}

// Marks of one kind of ink (`mask` 1), as boxes with their pixel counts (8-connected).
function components(mask, width, height) {
  const labels = new Int32Array(width * height);
  let parent = new Int32Array(4096), next = 1;
  const find = label => { while (parent[label] !== label) { parent[label] = parent[parent[label]]; label = parent[label]; } return label; };
  const unite = (a, b) => { a = find(a); b = find(b); if (a === b) return a; if (a < b) { parent[b] = a; return a; } parent[a] = b; return b; };
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const index = row + x;
      if (!mask[index]) continue;
      let label = x > 0 ? labels[index - 1] : 0;
      if (y > 0) {
        const up = index - width;
        if (labels[up]) label = label ? unite(label, labels[up]) : labels[up];
        if (x > 0 && labels[up - 1]) label = label ? unite(label, labels[up - 1]) : labels[up - 1];
        if (x < width - 1 && labels[up + 1]) label = label ? unite(label, labels[up + 1]) : labels[up + 1];
      }
      if (!label) {
        if (next >= parent.length) { const grown = new Int32Array(parent.length * 2); grown.set(parent); parent = grown; }
        parent[next] = next; label = next++;
      }
      labels[index] = label;
    }
  }
  const boxes = new Map();
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const raw = labels[row + x]; if (!raw) continue;
      const label = find(raw);
      let box = boxes.get(label);
      if (!box) { box = { x0: x, y0: y, x1: x, y1: y, count: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0 }; boxes.set(label, box); }
      if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y > box.y1) box.y1 = y;
      // Moments relative to the first pixel, for the mark's shape (a thin slanted stroke is shading, not a letter).
      const dx = x, dy = y;
      box.count++; box.sx += dx; box.sy += dy; box.sxx += dx * dx; box.syy += dy * dy; box.sxy += dx * dy;
    }
  }
  return [...boxes.values()];
}

/**
 * The text blocks of a page. `image`: RGBA pixels ({ data, width, height }),
 * best about 1,500 pixels on its long side. Returns blocks as fractions of the
 * page ({ x, y, width, height } of the balloon or box around the text,
 * `text`: the box of the lettering itself, `letter`: the height of its
 * capital letters as a fraction of the page height, `lines`, `letters`,
 * `light`: light letters on a dark balloon, `mixed`: lower-case lettering).
 * `explain` adds why each block was taken (for tuning).
 */
export function findBalloons({ data, width, height } = {}, { maxBlocks = 60, explain = false } = {}) {
  if (!data || !(width >= 32) || !(height >= 32) || data.length < width * height * 4) return { balloons: [], letter: 0 };
  const size = width * height, luma = new Uint8Array(size);
  for (let index = 0, offset = 0; index < size; index++, offset += 4) luma[index] = (54 * data[offset] + 183 * data[offset + 1] + 19 * data[offset + 2]) >> 8;
  // The mean brightness around each pixel (a square a little wider than a letter).
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) { sum += luma[y * width + x]; integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + sum; }
  }
  const radius = Math.max(6, Math.round(Math.min(width, height) * .012)), stride = width + 1;
  const darkInk = new Uint8Array(size), lightInk = new Uint8Array(size);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(height, y + radius + 1), top = y0 * stride, end = y1 * stride, rows = y1 - y0;
    for (let x = 0; x < width; x++) {
      const x0 = x > radius ? x - radius : 0, x1 = x + radius + 1 < width ? x + radius + 1 : width;
      const mean = (integral[end + x1] - integral[top + x1] - integral[end + x0] + integral[top + x0]) / ((x1 - x0) * rows);
      const index = y * width + x, value = luma[index];
      if (value < 150 && value < mean - 28) darkInk[index] = 1;
      else if (value > 130 && value > mean + 28) lightInk[index] = 1;
    }
  }
  const found = [];
  for (const [mask, light] of [[darkInk, false], [lightInk, true]]) found.push(...blocksOf(mask, light, { luma, width, height }));
  // Pieces of one balloon's lettering found apart (wide spaces, an odd line) are put together;
  // of two finds of one balloon seen both ways (dark and light letters), the clearer one stays.
  found.sort((a, b) => b.letters - a.letters);
  // An outline or a panel's border between two pieces: two balloons, not one.
  const wallBetween = (a, b) => {
    const mask = a.light ? lightInk : darkInk;
    const line = (fixed, from, to, vertical) => { let ink = 0; for (let t = from; t <= to; t++) ink += mask[vertical ? t * width + fixed : fixed * width + t]; return ink > (to - from + 1) * .6; };
    if (Math.max(a.x0, b.x0) > Math.min(a.x1, b.x1)) {
      const left = a.x1 < b.x0 ? a : b, other = left === a ? b : a, top = Math.min(Math.max(a.y0, b.y0), Math.min(a.y1, b.y1)), end = Math.max(Math.max(a.y0, b.y0), Math.min(a.y1, b.y1));
      for (let x = left.x1 + 1; x < other.x0; x++) if (line(x, top, end, true)) return true;
    }
    if (Math.max(a.y0, b.y0) > Math.min(a.y1, b.y1)) {
      const upper = a.y1 < b.y0 ? a : b, other = upper === a ? b : a, from = Math.min(Math.max(a.x0, b.x0), Math.min(a.x1, b.x1)), to = Math.max(Math.max(a.x0, b.x0), Math.min(a.x1, b.x1));
      for (let y = upper.y1 + 1; y < other.y0; y++) if (line(y, from, to, false)) return true;
    }
    return false;
  };
  const together = (a, b) => a.light === b.light && near(a, b) && !wallBetween(a, b);
  let kept = [];
  for (const block of found) {
    const same = kept.find(other => together(other, block));
    if (same) { merge(same, block); continue; }
    if (!kept.some(other => overlap(block, other) > .4 * Math.min(area(block), area(other)))) kept.push(block);
  }
  for (let again = true; again;) {
    again = false;
    for (let i = 0; i < kept.length && !again; i++) for (let j = i + 1; j < kept.length && !again; j++) {
      if (together(kept[i], kept[j])) { merge(kept[i], kept[j]); kept.splice(j, 1); again = true; }
    }
  }
  // Fine print (credits, signatures, signs in the drawing) is far smaller than the lettering.
  const typical = median(kept.flatMap(block => Array(Math.min(block.letters, 40)).fill(block.letterPx)));
  const balloons = kept.filter(block => block.letterPx >= typical * .5 && block.letterPx <= typical * 2.4)
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0).slice(0, maxBlocks)
    .map(block => ({
      x: round(block.bx0 / width), y: round(block.by0 / height), width: round((block.bx1 - block.bx0 + 1) / width), height: round((block.by1 - block.by0 + 1) / height),
      text: { x: round(block.x0 / width), y: round(block.y0 / height), width: round((block.x1 - block.x0 + 1) / width), height: round((block.y1 - block.y0 + 1) / height) },
      letter: round(block.letterPx / height), lines: block.lines, letters: block.letters, light: block.light, mixed: Boolean(block.mixed),
      ...(explain ? { why: { paper: block.paper, ink: block.inkTone, even: block.even, sides: block.sides, closed: block.closed, px: block.letterPx, bars: block.bars, pieces: block.pieces, wide: block.wide } } : {}),
    }));
  return { balloons, letter: round(typical / height) };
}
// Two blocks may be of one balloon: letters of one size, close together or on one paper.
function near(a, b) {
  const ratio = a.letterPx / b.letterPx; if (ratio < .74 || ratio > 1.35) return false;
  const letter = Math.max(a.letterPx, b.letterPx);
  const gapX = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1), gapY = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
  if (gapX <= letter * 1.3 && gapY <= letter * 1.3) return true;
  return overlap(a, b) > .2 * Math.min(area(a), area(b)) && gapX <= letter * 3 && gapY <= letter * 2;
}
function merge(into, block) {
  const side = Math.min(into.y1, block.y1) - Math.max(into.y0, block.y0) > .5 * Math.min(into.y1 - into.y0, block.y1 - block.y0);
  into.letterPx = (into.letterPx * into.letters + block.letterPx * block.letters) / (into.letters + block.letters);
  into.lines = side ? Math.max(into.lines, block.lines) : into.lines + block.lines;
  for (const key of ['letters', 'pieces', 'wide', 'bars', 'ink']) into[key] = (into[key] || 0) + (block[key] || 0);
  for (const [low, high] of [['x0', 'x1'], ['y0', 'y1'], ['bx0', 'bx1'], ['by0', 'by1']]) { into[low] = Math.min(into[low], block[low]); into[high] = Math.max(into[high], block[high]); }
  into.mixed = into.mixed || block.mixed;
}
const round = value => Math.round(value * 100000) / 100000;
const area = box => (box.bx1 - box.bx0 + 1) * (box.by1 - box.by0 + 1);
const overlap = (a, b) => Math.max(0, Math.min(a.bx1, b.bx1) - Math.max(a.bx0, b.bx0) + 1) * Math.max(0, Math.min(a.by1, b.by1) - Math.max(a.by0, b.by0) + 1);

function blocksOf(mask, light, { luma, width, height }) {
  // Letter sizes as a share of the page's height; a strip, a spread or a long
  // scroll measures as the single page it is part of (about 1.55 times as tall as wide).
  const scale = Math.min(width * 1.55, Math.max(height, width * .78)), hMin = Math.max(5, scale * .0035), hMax = scale * .045;
  const marks = components(mask, width, height).filter(box => {
    const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1, fill = box.count / (w * h);
    // (A solid mark is a blot or a window, unless it is a thin upright: "l", "I", "!".)
    if (!(h >= hMin && h <= hMax && w >= Math.max(1, h * .1) && fill >= .1 && (fill <= .82 || w < h * .35) && box.x0 > 0 && box.y0 > 0 && box.x1 < width - 1 && box.y1 < height - 1)) return false;
    // Letters printed close together touch, and a whole word becomes one mark: wide, but as inky as letters are.
    if (w > h * 3.2 && (w > h * 9 || fill < .3 || fill > .75)) return false;
    // A long thin slanted stroke (shading, rain, hatching) is not a letter.
    const n = box.count, mx = box.sx / n, my = box.sy / n, a = box.sxx / n - mx * mx, b = box.syy / n - my * my, c = box.sxy / n - mx * my;
    const root = Math.sqrt(((a - b) / 2) ** 2 + c * c), major = (a + b) / 2 + root, minor = Math.max(1e-6, (a + b) / 2 - root);
    const angle = Math.abs(Math.atan2(2 * c, a - b) / 2) * 180 / Math.PI;
    return !(major / minor > 12 && angle > 20 && angle < 70);
  });
  if (marks.length < 3) return [];
  // Between two marks side by side, no upright of ink (a balloon's outline, a panel's border).
  const openBetween = (a, b) => {
    const left = a.x1 < b.x0 ? a : b, other = left === a ? b : a, top = Math.max(a.y0, b.y0), end = Math.min(a.y1, b.y1), span = end - top + 1;
    for (let x = left.x1 + 1; x < other.x0; x++) { let ink = 0; for (let y = top; y <= end; y++) ink += mask[y * width + x]; if (ink > span * .6) return false; }
    return true;
  };
  // Rows: marks of about the same height, side by side.
  marks.sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const rows = unionFind(marks.length);
  for (let i = 0; i < marks.length; i++) {
    const a = marks[i], ha = a.y1 - a.y0 + 1, cya = (a.y0 + a.y1) / 2;
    for (let j = i + 1; j < marks.length; j++) {
      const b = marks[j], hb = b.y1 - b.y0 + 1, cyb = (b.y0 + b.y1) / 2;
      if (cyb - cya > Math.max(ha, hb) * .5) break;
      const ratio = ha / hb; if (ratio < .55 || ratio > 1.8) continue;
      const shared = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1; if (shared < Math.min(ha, hb) * .55) continue;
      // Next letter, or next word: a wide space is fine as long as no outline stands in it.
      const gap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1) - 1, h = Math.min(ha, hb);
      if (gap > h * 1.7 || (gap > h * 1.15 && !openBetween(a, b))) continue;
      rows.join(i, j);
    }
  }
  const lineMap = new Map();
  marks.forEach((mark, index) => {
    const root = rows.find(index); let line = lineMap.get(root);
    if (!line) { line = { x0: mark.x0, y0: mark.y0, x1: mark.x1, y1: mark.y1, heights: [], ink: 0, bars: 0, pieces: 0, wide: 0 }; lineMap.set(root, line); }
    line.x0 = Math.min(line.x0, mark.x0); line.y0 = Math.min(line.y0, mark.y0); line.x1 = Math.max(line.x1, mark.x1); line.y1 = Math.max(line.y1, mark.y1);
    const h = mark.y1 - mark.y0 + 1, w = mark.x1 - mark.x0 + 1;
    // A word whose letters touch counts as the letters it holds.
    for (let count = w > h * 1.6 ? Math.max(2, Math.round(w / (h * .8))) : 1; count > 0; count--) line.heights.push(h);
    line.ink += mark.count; line.pieces++; if (w > h * 1.6) line.wide++;
    // A plain upright stroke ("I", "l", "!" or a fold in a drawing).
    if (mark.x1 - mark.x0 + 1 < h * .3) line.bars++;
  });
  const lines = [...lineMap.values()].map(line => ({ ...line, h: median(line.heights) }))
    .filter(line => line.pieces >= 2 && line.x1 - line.x0 + 1 >= line.h * 1.2);
  if (!lines.length) return [];
  // Blocks: rows stacked closely, sharing their middle (balloons) or their left edge (captions),
  // with nothing between them (two balloons one above the other have their outlines there).
  lines.sort((a, b) => a.y0 - b.y0);
  const clearBetween = (a, b) => {
    const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1), span = x1 - x0 + 1;
    for (let y = a.y1 + 1; y < b.y0; y++) {
      let ink = 0; for (let x = x0, row = y * width; x <= x1; x++) ink += mask[row + x];
      if (ink > span * .3) return false;
    }
    return true;
  };
  const stacks = unionFind(lines.length);
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i];
    for (let j = i + 1; j < lines.length; j++) {
      const b = lines[j], h = (a.h + b.h) / 2;
      if (b.y0 - a.y1 > h * 1.1) break;
      if (b.y0 - a.y1 < -h * .3) continue;
      const ratio = a.h / b.h; if (ratio < .7 || ratio > 1.45) continue;
      const sharedX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      if (sharedX <= 0) continue;
      const middle = Math.abs((a.x0 + a.x1) - (b.x0 + b.x1)) / 2, left = Math.abs(a.x0 - b.x0);
      if (middle > Math.max(a.x1 - a.x0, b.x1 - b.x0) * .45 + h && left > h * 1.5) continue;
      if (!clearBetween(a, b)) continue;
      stacks.join(i, j);
    }
  }
  const groups = new Map();
  lines.forEach((line, index) => { const root = stacks.find(index); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(line); });
  const blocks = [];
  // A group that does not sit on plain paper as a whole may still hold blocks that do
  // (two captions touching, a line of a drawing taken in): it is split where its rows are farthest apart.
  const judgeGroup = (group, depth = 0) => {
    const block = judgeBlock(group, light, { luma, mask, width, height });
    if (block) { blocks.push(block); return; }
    if (group.length < 2 || depth > 6) return;
    let cut = 1, widest = -Infinity;
    for (let index = 1; index < group.length; index++) { const gap = group[index].y0 - group[index - 1].y1; if (gap > widest) { widest = gap; cut = index; } }
    judgeGroup(group.slice(0, cut), depth + 1); judgeGroup(group.slice(cut), depth + 1);
  };
  for (const group of groups.values()) judgeGroup(group);
  return blocks;
}

// A block made of rows of letters, if it is lettering: letters of one size, on plain paper.
function judgeBlock(group, light, picture) {
  const block = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, heights: [], ink: 0, lines: 0, bars: 0, pieces: 0, wide: 0 };
  for (const line of group) {
    block.x0 = Math.min(block.x0, line.x0); block.y0 = Math.min(block.y0, line.y0); block.x1 = Math.max(block.x1, line.x1); block.y1 = Math.max(block.y1, line.y1);
    block.heights.push(...line.heights); block.ink += line.ink; block.lines++; block.bars += line.bars; block.pieces += line.pieces; block.wide += line.wide;
  }
  const letters = block.heights.length; if (letters < 2) return null;
  const middle = median(block.heights);
  // Letters of one hand are of one height.
  const spread = Math.sqrt(block.heights.reduce((sum, h) => sum + (h - middle) ** 2, 0) / letters) / middle;
  if (spread > .38) return null;
  // Strokes that are nearly all plain uprights are the folds or bars of a drawing, not words.
  if (block.bars > block.pieces * .6) return null;
  // Capital letters are the tallest of the common ones; in lower-case lettering most letters are
  // shorter (a, e, o…), so the size there is that of the tall ones (b, d, h, capitals).
  const tall = quantile(block.heights, .8), mixed = tall > middle * 1.2, letterPx = mixed ? tall : middle;
  const judged = paper(block, letterPx, light, picture);
  // A word or two ("NO!", "ME.") counts only inside a clear balloon, paper on every side.
  // (Marks that are whole words count as one here: a stroke in a drawing can be as wide.)
  if (!judged || ((block.pieces < 3 || block.pieces - block.wide < 2) && (judged.sides < 4 || judged.closed < 4 || judged.even > 16))) return null;
  return { ...block, ...judged, letters, letterPx, light, mixed };
}

// A block of text sits on plain paper (a balloon or caption): the paper
// around its letters is even, and keeps going a little beyond them. Returns
// the balloon's extent, or null for marks in a drawing.
function paper(block, letterPx, light, { luma, mask, width, height }) {
  const pad = Math.max(2, Math.round(letterPx * .4));
  const x0 = Math.max(0, block.x0 - pad), y0 = Math.max(0, block.y0 - pad), x1 = Math.min(width - 1, block.x1 + pad), y1 = Math.min(height - 1, block.y1 + pad);
  let count = 0, sum = 0, squares = 0, ink = 0, inkSum = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const index = y * width + x, value = luma[index];
    if (mask[index]) { ink++; inkSum += value; continue; }
    count++; sum += value; squares += value * value;
  }
  if (!count || !ink) return null;
  const mean = sum / count, spread = Math.sqrt(Math.max(0, squares / count - mean * mean)), density = ink / ((x1 - x0 + 1) * (y1 - y0 + 1));
  if (density < .04 || density > .5) return null;
  // Lettering stands out strongly from its balloon (black on white, white on black…).
  if (Math.abs(mean - inkSum / ink) < 90) return null;
  if (light ? mean > 120 : mean < 90) return null;
  if (spread > 34) return null;
  // The same paper goes on around the text (a balloon's or box's margin).
  const like = index => !mask[index] && Math.abs(luma[index] - mean) <= 34;
  // Only the middle half of each side is looked at: a round balloon is roomiest there.
  const edge = (fixed, from, to, vertical) => {
    const quarter = Math.floor((to - from) / 4); let good = 0, all = 0;
    for (let t = from + quarter; t <= to - quarter; t++) { const x = vertical ? fixed : t, y = vertical ? t : fixed; if (x < 0 || y < 0 || x >= width || y >= height) continue; all++; if (like(y * width + x)) good++; }
    return all ? good / all : 0;
  };
  let bx0 = x0, by0 = y0, bx1 = x1, by1 = y1, closed = 0;
  const reach = Math.round(letterPx * 2.6);
  // Each side grows while the paper goes on; it is closed when an outline (or anything else) stops it.
  const grow = (more, next, step) => { let steps = 0; while (steps < reach && more()) { if (next() < .8) { closed++; return; } step(); steps++; } };
  grow(() => bx0 > 0, () => edge(bx0 - 1, by0, by1, true), () => bx0--);
  grow(() => bx1 < width - 1, () => edge(bx1 + 1, by0, by1, true), () => bx1++);
  grow(() => by0 > 0, () => edge(by0 - 1, bx0, bx1, false), () => by0--);
  grow(() => by1 < height - 1, () => edge(by1 + 1, bx0, bx1, false), () => by1++);
  const margin = Math.min(bx0 === x0 ? 0 : 1, 1) + Math.min(bx1 === x1 ? 0 : 1, 1) + Math.min(by0 === y0 ? 0 : 1, 1) + Math.min(by1 === y1 ? 0 : 1, 1);
  // Paper on at least two sides beyond the letters (a short balloon may be tight on the others).
  if (margin < 2) return null;
  const outline = Math.round(letterPx * .35);
  return { bx0: Math.max(0, bx0 - outline), by0: Math.max(0, by0 - outline), bx1: Math.min(width - 1, bx1 + outline), by1: Math.min(height - 1, by1 + outline), paper: Math.round(mean), inkTone: Math.round(inkSum / ink), even: Math.round(spread), sides: margin, closed };
}
