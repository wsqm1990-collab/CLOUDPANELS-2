// Original, local raster heuristic. It looks for rectangular islands separated
// by near-neutral gutters, then tries recursive cuts for interrupted gutters.
// It cannot infer an artist's intended reading order or understand artwork.
const MAX_PIXELS = 600_000;
const MAX_PANELS = 32;
const wholePage = reason => ({panels: [{x: 0, y: 0, width: 1, height: 1}], confidence: 'low', reason});
const area = r => r.width * r.height;
const right = r => r.x + r.width;
const bottom = r => r.y + r.height;

/**
 * Synchronous, worker-safe detection on an already downsampled RGBA raster.
 * No image, DOM, network or model dependencies. Invalid/oversized input safely
 * returns the whole page. Successful rectangles are normalized and padded.
 */
export function detectPanelRegions(input = {}) {
  const {data, width, height, direction = 'ltr'} = input && typeof input === 'object' ? input : {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16)
    return wholePage('invalid-image-dimensions');
  if (width > MAX_PIXELS || height > MAX_PIXELS || width * height > MAX_PIXELS)
    return wholePage('image-too-large');
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray) || data.length !== width * height * 4)
    return wholePage('invalid-rgba-data');

  const count = width * height, light = new Uint8Array(count), dark = new Uint8Array(count);
  let lightCount = 0, darkCount = 0;
  for (let i = 0; i < count; i++) {
    const offset = i * 4, alpha = data[offset + 3] / 255;
    // Canvas/image transparency is consistently composited onto white.
    const r = data[offset] * alpha + 255 * (1 - alpha);
    const g = data[offset + 1] * alpha + 255 * (1 - alpha);
    const b = data[offset + 2] * alpha + 255 * (1 - alpha);
    const neutral = Math.max(r, g, b) - Math.min(r, g, b);
    const luminance = .2126 * r + .7152 * g + .0722 * b;
    const isLight = luminance >= 220 && neutral <= 44;
    const isDark = luminance <= 38 && neutral <= 32;
    light[i] = isLight ? 0 : 1;
    dark[i] = isDark ? 0 : 1;
    if (isLight) lightCount++;
    if (isDark) darkCount++;
  }

  const candidates = [];
  for (const [mask, backgroundCount, tone] of [[light, lightCount, 'light'], [dark, darkCount, 'dark']]) {
    if (backgroundCount < count * .015) continue;
    const context = {mask, opposite: tone === 'light' ? dark : light, width, height, count, tone};
    const connected = componentPanels(context);
    if (connected.overflow) continue;
    let candidate = assess(connected.rects, context);
    if (!candidate) candidate = assess(separatorPanels(context), context);
    if (candidate) candidates.push(candidate);
  }
  if (!candidates.length) return wholePage('no-clear-panel-boundaries');
  candidates.sort((a, b) => b.score - a.score || a.tone.localeCompare(b.tone));
  const best = candidates[0], other = candidates[1];
  if (other && Math.abs(best.score - other.score) < .16 && !sameLayout(best.rects, other.rects))
    return wholePage('ambiguous-panel-boundaries');
  const padded = padPanels(best.rects, width, height).map(r => ({
    x: r.x / width, y: r.y / height, width: r.width / width, height: r.height / height,
  }));
  return {panels: orderPanels(padded, direction), confidence: 'high', reason: `clear-${best.tone}-gutters`};
}

function componentPanels(context) {
  const {mask, width, height, count} = context;
  const visited = new Uint8Array(count), queue = new Int32Array(count), found = [];
  for (let start = 0; start < count; start++) {
    if (!mask[start] || visited[start]) continue;
    let head = 0, tail = 1, minX = width, minY = height, maxX = 0, maxY = 0;
    queue[0] = start; visited[start] = 1;
    while (head < tail) {
      const index = queue[head++], x = index % width, y = Math.floor(index / width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      if (x > 0) enqueue(index - 1);
      if (x + 1 < width) enqueue(index + 1);
      if (y > 0) enqueue(index - width);
      if (y + 1 < height) enqueue(index + width);
    }
    const rect = {x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1};
    // The inverse tone often makes the exterior paper one giant component.
    const touches = Number(minX === 0) + Number(minY === 0) + Number(maxX === width - 1) + Number(maxY === height - 1);
    if (touches >= 3 && area(rect) > count * .9) continue;
    if (meaningful(rect, context) && tail >= Math.max(12, Math.sqrt(area(rect)) * .8)) {
      const evidence = edgeEvidence(rect, context);
      if (evidence.support >= 3 && evidence.average >= .66) found.push(rect);
    }
    function enqueue(index) {
      if (!visited[index] && mask[index]) { visited[index] = 1; queue[tail++] = index; }
    }
  }
  // A connected frame can contain disconnected artwork/lettering. Keep its
  // outer boundary, not the individual islands inside it.
  found.sort((a, b) => area(b) - area(a) || a.y - b.y || a.x - b.x);
  const rects = [];
  for (const rect of found) {
    if (!rects.some(outer => contains(outer, rect))) rects.push(rect);
    if (rects.length > MAX_PANELS) return {rects: [], overflow: true};
  }
  return {rects, overflow: false};
}

function meaningful(rect, {width, height, count}) {
  return rect.width >= Math.max(8, width * .065) && rect.height >= Math.max(8, height * .045)
    && area(rect) >= Math.max(80, count * .008);
}
function contains(a, b) { return b.x >= a.x && b.y >= a.y && right(b) <= right(a) && bottom(b) <= bottom(a); }
function intersection(a, b) {
  return Math.max(0, Math.min(right(a), right(b)) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y));
}

function edgeEvidence(rect, {mask, width}) {
  const band = Math.max(1, Math.min(3, Math.floor(Math.min(rect.width, rect.height) * .025)));
  let leftHits = 0, rightHits = 0, topHits = 0, bottomHits = 0;
  for (let y = rect.y; y < bottom(rect); y++) {
    let a = false, b = false;
    for (let d = 0; d < band; d++) { a ||= Boolean(mask[y * width + rect.x + d]); b ||= Boolean(mask[y * width + right(rect) - 1 - d]); }
    if (a) leftHits++; if (b) rightHits++;
  }
  for (let x = rect.x; x < right(rect); x++) {
    let a = false, b = false;
    for (let d = 0; d < band; d++) { a ||= Boolean(mask[(rect.y + d) * width + x]); b ||= Boolean(mask[(bottom(rect) - 1 - d) * width + x]); }
    if (a) topHits++; if (b) bottomHits++;
  }
  const values = [leftHits / rect.height, rightHits / rect.height, topHits / rect.width, bottomHits / rect.width];
  return {support: values.filter(v => v >= .62).length, average: values.reduce((a, b) => a + b, 0) / 4};
}

// Tolerant cuts recover a gutter interrupted by a small caption/scan speck.
// Each resulting leaf still needs rectangular boundary evidence.
function separatorPanels(context) {
  const {width, height, mask} = context, stride = width + 1;
  const integral = new Uint32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) { row += mask[y * width + x]; integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row; }
  }
  const sum = (x, y, w, h) => integral[(y + h) * stride + x + w] - integral[y * stride + x + w]
    - integral[(y + h) * stride + x] + integral[y * stride + x];
  const trim = rect => {
    let x1 = rect.x, y1 = rect.y, x2 = right(rect), y2 = bottom(rect);
    const rowLimit = Math.max(1, rect.width * .012), colLimit = Math.max(1, rect.height * .012);
    while (y1 < y2 && sum(x1, y1, x2 - x1, 1) <= rowLimit) y1++;
    while (y2 > y1 && sum(x1, y2 - 1, x2 - x1, 1) <= rowLimit) y2--;
    while (x1 < x2 && sum(x1, y1, 1, y2 - y1) <= colLimit) x1++;
    while (x2 > x1 && sum(x2 - 1, y1, 1, y2 - y1) <= colLimit) x2--;
    return {x: x1, y: y1, width: x2 - x1, height: y2 - y1};
  };
  const leaves = [], initial = trim({x: 0, y: 0, width, height});
  let exceeded = false;
  function split(rect, depth = 0) {
    if (exceeded) return;
    if (leaves.length >= MAX_PANELS || depth > 16) { exceeded = true; return; }
    const choices = [];
    for (const vertical of [false, true]) {
      const length = vertical ? rect.width : rect.height, cross = vertical ? rect.height : rect.width;
      const minGap = Math.max(2, Math.floor(Math.min(width, height) * .004));
      let start = -1;
      for (let p = 0; p <= length; p++) {
        const ink = p < length ? (vertical ? sum(rect.x + p, rect.y, 1, rect.height) : sum(rect.x, rect.y + p, rect.width, 1)) : Infinity;
        if (ink <= Math.max(1, cross * .018)) { if (start < 0) start = p; continue; }
        if (start < 0) continue;
        const gap = p - start;
        if (gap >= minGap && gap <= length * .18 && start >= length * .09 && p <= length * .91) {
          const a = trim(vertical ? {...rect, width: start} : {...rect, height: start});
          const b = trim(vertical ? {x: rect.x + p, y: rect.y, width: length - p, height: rect.height}
            : {x: rect.x, y: rect.y + p, width: rect.width, height: length - p});
          if (meaningful(a, context) && meaningful(b, context)
            && sum(a.x, a.y, a.width, a.height) >= area(a) * .055 && sum(b.x, b.y, b.width, b.height) >= area(b) * .055)
            choices.push({a, b, score: gap / length + Math.min(area(a), area(b)) / area(rect) * .045 + (vertical ? 0 : .002)});
        }
        start = -1;
      }
    }
    choices.sort((a, b) => b.score - a.score);
    if (!choices.length) { leaves.push(rect); return; }
    split(choices[0].a, depth + 1); split(choices[0].b, depth + 1);
  }
  if (meaningful(initial, context)) split(initial);
  return exceeded ? [] : leaves;
}

function assess(rects, context) {
  if (rects.length < 2 || rects.length > MAX_PANELS) return null;
  let total = 0, edges = 0;
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i], evidence = edgeEvidence(rect, context);
    if (!meaningful(rect, context) || evidence.support < 3 || evidence.average < .66) return null;
    for (let j = 0; j < i; j++) if (intersection(rect, rects[j]) > Math.min(area(rect), area(rects[j])) * .025) return null;
    total += area(rect); edges += evidence.average;
  }
  const coverage = total / context.count;
  if (coverage < .24) return null; // Ignore isolated lettering, captions and decorative boxes.
  const exterior = exteriorGutterSides(context);
  // A white sky/black silhouette can divide a splash into two rectangular
  // pieces, even with outer paper margins. Two-region layouts need frames too.
  if (rects.length === 2 && !hasFrameEvidence(rects, context)) return null;
  return {rects, tone: context.tone, score: edges / rects.length + coverage + Math.min(rects.length, 8) * .012 + exterior * .025};
}

function exteriorGutterSides({mask, width, height}) {
  let top = 0, bottomCount = 0, left = 0, rightCount = 0;
  for (let x = 0; x < width; x++) { top += !mask[x]; bottomCount += !mask[(height - 1) * width + x]; }
  for (let y = 0; y < height; y++) { left += !mask[y * width]; rightCount += !mask[y * width + width - 1]; }
  return [top / width, bottomCount / width, left / height, rightCount / height].filter(v => v > .9).length;
}

function hasFrameEvidence(rects, context) {
  // Count dark frame pixels with light gutters, or light frame pixels with dark
  // gutters. A colored sky boundary alone does not satisfy this evidence.
  const {opposite, width} = context;
  return rects.every(rect => {
    const band = Math.max(1, Math.min(3, Math.floor(Math.min(rect.width, rect.height) * .025)));
    let leftHits = 0, rightHits = 0, topHits = 0, bottomHits = 0;
    for (let y = rect.y; y < bottom(rect); y++) {
      let a = false, b = false;
      for (let d = 0; d < band; d++) { a ||= !opposite[y * width + rect.x + d]; b ||= !opposite[y * width + right(rect) - 1 - d]; }
      if (a) leftHits++; if (b) rightHits++;
    }
    for (let x = rect.x; x < right(rect); x++) {
      let a = false, b = false;
      for (let d = 0; d < band; d++) { a ||= !opposite[(rect.y + d) * width + x]; b ||= !opposite[(bottom(rect) - 1 - d) * width + x]; }
      if (a) topHits++; if (b) bottomHits++;
    }
    return [leftHits / rect.height, rightHits / rect.height, topHits / rect.width, bottomHits / rect.width]
      .filter(value => value >= .6).length >= 3;
  });
}

function sameLayout(a, b) {
  return a.length === b.length && a.every(rect => b.some(other => intersection(rect, other) / (area(rect) + area(other) - intersection(rect, other)) >= .7));
}

function padPanels(rects, width, height) {
  const padding = Math.max(1, Math.round(Math.min(width, height) * .004));
  return rects.map(rect => {
    let x1 = Math.max(0, rect.x - padding), x2 = Math.min(width, right(rect) + padding);
    let y1 = Math.max(0, rect.y - padding), y2 = Math.min(height, bottom(rect) + padding);
    for (const other of rects) {
      if (other === rect) continue;
      if (other.y < bottom(rect) && bottom(other) > rect.y) {
        if (right(other) <= rect.x) x1 = Math.max(x1, Math.ceil((right(other) + rect.x) / 2));
        if (other.x >= right(rect)) x2 = Math.min(x2, Math.floor((right(rect) + other.x) / 2));
      }
      if (other.x < right(rect) && right(other) > rect.x) {
        if (bottom(other) <= rect.y) y1 = Math.max(y1, Math.ceil((bottom(other) + rect.y) / 2));
        if (other.y >= bottom(rect)) y2 = Math.min(y2, Math.floor((bottom(rect) + other.y) / 2));
      }
    }
    return {x: x1, y: y1, width: x2 - x1, height: y2 - y1};
  });
}

/** Geometry-based reading order, with horizontal rows preferred to columns.
 * A tall panel consumes its column before the adjacent stacked column. */
export function orderPanels(rects, direction = 'ltr') {
  if (!Array.isArray(rects)) return [];
  const rtl = direction === 'rtl';
  const source = rects.filter(r => r && [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0);
  function ordered(items) {
    if (items.length < 2) return [...items];
    for (const vertical of [false, true]) {
      const start = r => vertical ? r.x : r.y, end = r => vertical ? right(r) : bottom(r);
      const sorted = [...items].sort((a, b) => start(a) - start(b) || end(a) - end(b));
      let edge = end(sorted[0]);
      for (let i = 1; i < sorted.length; i++) {
        if (start(sorted[i]) >= edge - 1e-8) {
          const a = ordered(sorted.slice(0, i)), b = ordered(sorted.slice(i));
          return vertical && rtl ? [...b, ...a] : [...a, ...b];
        }
        edge = Math.max(edge, end(sorted[i]));
      }
    }
    // Non-slicing/staggered layouts: fixed row anchors avoid non-transitive
    // pairwise comparators. Ambiguous narrative flow remains user-editable.
    const remaining = [...items].sort((a, b) => a.y - b.y || a.x - b.x), result = [];
    while (remaining.length) {
      const anchor = remaining[0], tolerance = Math.min(anchor.height * .25, .04 * Math.max(1, bottom(anchor)));
      const row = remaining.filter(r => r.y <= anchor.y + tolerance);
      row.sort((a, b) => (rtl ? right(b) - right(a) : a.x - b.x) || a.y - b.y);
      result.push(...row);
      for (const r of row) remaining.splice(remaining.indexOf(r), 1);
    }
    return result;
  }
  return ordered(source);
}
