// Enlarge balloons (optional): the shape of a balloon, cut out of the page so
// it can be shown bigger. From around its lettering, its paper is followed out
// to the outline that closes it; the letters and the outline are taken in and
// the edge is smoothed. A balloon that cannot be followed (open to the page,
// lettering straight on the drawing, a paper that fades) comes out as a
// rounded card around its lettering instead, never as a ragged piece.

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * `pixels`: RGBA ({ data, width, height }) of a part of the page around the
 * balloon. `text`: the box of its lettering there ({ x, y, width, height }, in
 * pixels); `balloon`: the box found around it (optional, same units);
 * `letter`: the height of its capital letters there (pixels).
 * Returns { kind: 'shape' | 'card', mask: 0-255 per pixel (the cut, with a
 * soft edge), box: the part of the window the cut covers, open: the balloon
 * runs out of the window (a bigger window may hold all of it) }.
 */
export function cutBalloon({ data, width, height } = {}, text, { balloon = null, letter = 0 } = {}) {
  width = Math.floor(width); height = Math.floor(height);
  const size = width * height;
  const tx0 = clamp(Math.floor(text?.x ?? 0), 0, Math.max(0, width - 1)), ty0 = clamp(Math.floor(text?.y ?? 0), 0, Math.max(0, height - 1));
  const tx1 = clamp(Math.ceil((text?.x ?? 0) + (text?.width ?? 0)) - 1, tx0, Math.max(0, width - 1)), ty1 = clamp(Math.ceil((text?.y ?? 0) + (text?.height ?? 0)) - 1, ty0, Math.max(0, height - 1));
  letter = letter > 0 ? letter : Math.max(4, (ty1 - ty0 + 1) / 3);
  const card = (why, open = false) => ({ ...roundedCard(width, height, { x0: tx0, y0: ty0, x1: tx1, y1: ty1 }, letter), open, why });
  if (!(width >= 8 && height >= 8) || !data || data.length < size * 4) return card('no pixels');
  // (Each pixel is looked at only when needed: the window is mostly not the balloon.)
  const luma = index => { const offset = index * 4; return (54 * data[offset] + 183 * data[offset + 1] + 19 * data[offset + 2]) >> 8; };

  // The paper: the most common tone around the letters.
  const tones = new Uint32Array(256);
  let boxCount = 0;
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) { tones[luma(y * width + x)]++; boxCount++; }
  let best = -1, paperTone = 0;
  for (let tone = 0; tone < 256; tone++) {
    let sum = 0;
    for (let near = Math.max(0, tone - 6); near <= Math.min(255, tone + 6); near++) sum += tones[near];
    if (sum > best) { best = sum; paperTone = tone; }
  }
  let count = 0, red = 0, green = 0, blue = 0, tone = 0, toneSquares = 0, ink = 0;
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
    const index = y * width + x, value = luma(index);
    if (Math.abs(value - paperTone) <= 16) { const offset = index * 4; count++; red += data[offset]; green += data[offset + 1]; blue += data[offset + 2]; tone += value; toneSquares += value * value; }
  }
  // Lettering without a paper of its own (on the drawing): a card.
  if (count < boxCount * .3) return card('no paper');
  red /= count; green /= count; blue /= count; tone /= count;
  const spread = Math.sqrt(Math.max(0, toneSquares / count - tone * tone));
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) if (Math.abs(luma(y * width + x) - tone) > 70) ink++;
  if (ink < boxCount * .03) return card('no lettering');
  const tolerance = clamp(spread * 3 + 14, 20, 44), reach = tolerance * tolerance * 3.2;
  const distance = index => { const offset = index * 4, dr = data[offset] - red, dg = data[offset + 1] - green, db = data[offset + 2] - blue; return dr * dr + dg * dg + db * db; };
  const looked = new Uint8Array(size);
  const paper = index => { let state = looked[index]; if (!state) looked[index] = state = Math.abs(luma(index) - tone) <= tolerance && distance(index) <= reach ? 1 : 2; return state === 1; };

  // The paper reached from around the letters.
  const region = new Uint8Array(size), stack = new Int32Array(size);
  let top = 0, filled = 0, atEdge = 0;
  const take = index => { region[index] = 1; stack[top++] = index; };
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) { const index = y * width + x; if (!region[index] && paper(index)) take(index); }
  let minX = width, minY = height, maxX = -1, maxY = -1;
  while (top) {
    const index = stack[--top], x = index % width, y = (index - x) / width;
    filled++;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) atEdge++;
    if (x > 0 && !region[index - 1] && paper(index - 1)) take(index - 1);
    if (x < width - 1 && !region[index + 1] && paper(index + 1)) take(index + 1);
    if (y > 0 && !region[index - width] && paper(index - width)) take(index - width);
    if (y < height - 1 && !region[index + width] && paper(index + width)) take(index + width);
  }
  // Open to the rest of the page (more than a tail running out of the window): a card.
  if (atEdge > Math.max(letter * 4, (width + height) * .1) || filled > size * .8) return card('open', true);
  // Far more paper than a balloon around this lettering (a wall, a sky): a card.
  const found = balloon && balloon.width > 0 && balloon.height > 0 ? balloon.width * balloon.height : 0;
  if (found && filled > found * 3.5) return card('too much paper');
  if (minX > tx0 + (tx1 - tx0) * .25 || maxX < tx1 - (tx1 - tx0) * .25 || minY > ty0 + (ty1 - ty0) * .25 || maxY < ty1 - (ty1 - ty0) * .25) return card('paper apart');

  // What the paper surrounds is the balloon's too: its letters, and anything drawn inside it
  // (whatever cannot be reached from around the paper without crossing it).
  const outside = new Uint8Array(size), fx0 = Math.max(0, minX - 1), fy0 = Math.max(0, minY - 1), fx1 = Math.min(width - 1, maxX + 1), fy1 = Math.min(height - 1, maxY + 1);
  const out = index => { if (!region[index] && !outside[index]) { outside[index] = 1; stack[top++] = index; } };
  for (let x = fx0; x <= fx1; x++) { out(fy0 * width + x); out(fy1 * width + x); }
  for (let y = fy0; y <= fy1; y++) { out(y * width + fx0); out(y * width + fx1); }
  while (top) {
    const index = stack[--top], x = index % width, y = (index - x) / width;
    if (x > fx0) out(index - 1); if (x < fx1) out(index + 1);
    if (y > fy0) out(index - width); if (y < fy1) out(index + width);
  }
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) { const index = y * width + x; if (!outside[index]) region[index] = 1; }

  // Its edge: an outline (or a clear change of tone) all around, and how thick it is.
  const strong = index => Math.abs(luma(index) - tone) > 60, differs = index => strong(index) || distance(index) > reach * 4.8;
  // An outline is about as thick as the strokes of the letters, of one tone:
  // the run outwards stops where that tone ends (the drawing beyond it).
  const cap = Math.max(2, Math.round(letter * .35)), runs = [], linePixels = [];
  let edges = 0, closed = 0;
  for (let y = Math.max(1, minY); y <= Math.min(height - 2, maxY); y++) for (let x = Math.max(1, minX); x <= Math.min(width - 2, maxX); x++) {
    const index = y * width + x;
    if (!region[index]) continue;
    let dx = 0, dy = 0;
    if (!region[index - 1]) dx = -1; else if (!region[index + 1]) dx = 1; else if (!region[index - width]) dy = -1; else if (!region[index + width]) dy = 1; else continue;
    edges++;
    // (The first pixel or two outside may be a blend of the paper and the line.)
    const next = index + dx + dy * width, after = x + 2 * dx >= 0 && y + 2 * dy >= 0 && x + 2 * dx < width && y + 2 * dy < height ? next + dx + dy * width : -1;
    if (differs(next) || (after >= 0 && differs(after))) closed++;
    let run = 0, lines = 0, px = x + dx, py = y + dy, lineTone = -1, linePixel = -1;
    while (run < cap && px >= 0 && py >= 0 && px < width && py < height) {
      const value = luma(py * width + px);
      if (Math.abs(value - tone) <= 60) { if (!lines && run < 2) { run++; px += dx; py += dy; continue; } break; }
      if (lines < 2) { if (lineTone < 0 || Math.abs(value - tone) > Math.abs(lineTone - tone)) { lineTone = value; linePixel = py * width + px; } }
      else if (Math.abs(value - lineTone) > 28) break;
      lines++; run++; px += dx; py += dy;
    }
    runs.push(lines ? run : 0);
    if (lines) linePixels.push(linePixel);
  }
  // A paper that fades or blends into the drawing would give a ragged cut: a card.
  if (!edges || closed < edges * .6) return card(`ragged ${closed}/${edges}`);
  runs.sort((a, b) => a - b);
  const outline = runs[Math.floor(runs.length * .5)] || 0;

  // The outline is taken in, a pixel more to be sure of all of it; past the
  // paper's first pixel, what is not of the line's colour (the drawing beyond
  // it) fades out. The edge is softened on its inner side.
  const line = middleColour(data, linePixels);
  const grow = outline + 1, layer = new Uint8Array(size);
  const x0 = Math.max(0, minX - grow - 1), y0 = Math.max(0, minY - grow - 1), x1 = Math.min(width - 1, maxX + grow + 1), y1 = Math.min(height - 1, maxY + grow + 1);
  // (The region itself stays as it is: the body of the balloon is found from it below.)
  let shape = region.slice(), spare = new Uint8Array(size);
  for (let step = 0; step < grow; step++) { dilate(shape, spare, width, x0, y0, x1, y1, step % 2 === 1, layer, step + 1); [shape, spare] = [spare, shape]; }
  // A long tail (pointing far off at the speaker) fades out a little past the
  // balloon; so does whatever runs out of the window. The balloon's body is what
  // is left of it without its thin parts (an opening a little under a letter wide).
  const fade = tailFade(region, width, x0, y0, x1, y1, letter);
  const edgeFade = Math.max(2, letter * 1.2);
  const mask = new Uint8ClampedArray(size);
  let bx0 = width, by0 = height, bx1 = -1, by1 = -1, runsOut = false;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const index = y * width + x;
    if (!shape[index]) continue;
    let sum = 0;
    for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) sum += shape[ny * width + nx];
    let alpha = Math.min(255, 64 + sum * 24);
    if (layer[index] >= 2 && line) {
      const offset = index * 4, dr = data[offset] - line[0], dg = data[offset + 1] - line[1], db = data[offset + 2] - line[2];
      const away = Math.sqrt((dr * dr + dg * dg + db * db) / 3);
      if (away > 30) alpha *= Math.max(0, 1 - (away - 30) / 60);
    }
    if (fade) alpha *= fade[(y - y0) * (x1 - x0 + 1) + x - x0];
    // (Still clearly there at the window's edge: the balloon goes on beyond it.)
    if (alpha > 40 && (x === 0 || y === 0 || x === width - 1 || y === height - 1)) runsOut = true;
    if (atEdge) alpha *= Math.min(1, (Math.min(x, y, width - 1 - x, height - 1 - y) + .5) / edgeFade);
    mask[index] = Math.round(alpha);
    if (mask[index] > 8) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  }
  if (bx1 < bx0) return card('empty');
  return { kind: 'shape', mask, box: { x: bx0, y: by0, width: bx1 - bx0 + 1, height: by1 - by0 + 1 }, outline, open: runsOut };
}

// The middle colour of some pixels (each channel's median), or null for none.
function middleColour(data, pixels) {
  if (!pixels.length) return null;
  const colour = [];
  for (let channel = 0; channel < 3; channel++) {
    const counts = new Uint32Array(256);
    for (const index of pixels) counts[data[index * 4 + channel]]++;
    let seen = 0, value = 0;
    while (value < 255 && (seen += counts[value]) * 2 < pixels.length) value++;
    colour.push(value);
  }
  return colour;
}

// Distances in a frame (in thirds of a pixel, close to straight-line distances):
// 0 where `seed` holds, else the distance to the nearest seed.
function chamfer(seed, width, x0, y0, x1, y1) {
  const frame = x1 - x0 + 1, rows = y1 - y0 + 1, far = 1e9, distance = new Float64Array(frame * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < frame; x++) distance[y * frame + x] = seed((y0 + y) * width + x0 + x) ? 0 : far;
  for (let y = 0; y < rows; y++) for (let x = 0; x < frame; x++) {
    const index = y * frame + x; let value = distance[index];
    if (x > 0 && distance[index - 1] + 3 < value) value = distance[index - 1] + 3;
    if (y > 0) {
      if (distance[index - frame] + 3 < value) value = distance[index - frame] + 3;
      if (x > 0 && distance[index - frame - 1] + 4 < value) value = distance[index - frame - 1] + 4;
      if (x < frame - 1 && distance[index - frame + 1] + 4 < value) value = distance[index - frame + 1] + 4;
    }
    distance[index] = value;
  }
  for (let y = rows - 1; y >= 0; y--) for (let x = frame - 1; x >= 0; x--) {
    const index = y * frame + x; let value = distance[index];
    if (x < frame - 1 && distance[index + 1] + 3 < value) value = distance[index + 1] + 3;
    if (y < rows - 1) {
      if (distance[index + frame] + 3 < value) value = distance[index + frame] + 3;
      if (x < frame - 1 && distance[index + frame + 1] + 4 < value) value = distance[index + frame + 1] + 4;
      if (x > 0 && distance[index + frame - 1] + 4 < value) value = distance[index + frame - 1] + 4;
    }
    distance[index] = value;
  }
  return distance;
}

// How much of each pixel of the frame stays (1, or less along a long tail), or null: no body found.
function tailFade(region, width, x0, y0, x1, y1, letter) {
  const radius = Math.max(2, letter * .8) * 3, frame = x1 - x0 + 1;
  // The body: the part of the balloon at least `radius` from its edge, grown back by as much.
  const inside = chamfer(index => !region[index], width, x0, y0, x1, y1);
  let core = 0;
  for (let index = 0; index < inside.length; index++) if (inside[index] > radius) core++;
  if (!core) return null;
  const fromCore = chamfer(index => { const x = index % width - x0, y = (index - index % width) / width - y0; return inside[y * frame + x] > radius; }, width, x0, y0, x1, y1);
  const keep = letter * 2, length = Math.max(2, letter * 1.5), fade = new Float32Array(inside.length);
  for (let index = 0; index < fade.length; index++) {
    const beyond = fromCore[index] / 3 - radius / 3 - keep;
    fade[index] = beyond <= 0 ? 1 : Math.max(0, 1 - beyond / length);
  }
  return fade;
}

// One step of growth within a frame (a cross, or a square every other step: close to a circle);
// `layer` notes at which step each pixel was taken in.
function dilate(source, result, width, x0, y0, x1, y1, square, layer, step) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const index = y * width + x;
    if (source[index]) { result[index] = 1; continue; }
    result[index] = (x > x0 && source[index - 1]) || (x < x1 && source[index + 1]) || (y > y0 && source[index - width]) || (y < y1 && source[index + width]) ||
      (square && ((x > x0 && y > y0 && source[index - width - 1]) || (x < x1 && y > y0 && source[index - width + 1]) || (x > x0 && y < y1 && source[index + width - 1]) || (x < x1 && y < y1 && source[index + width + 1]))) ? 1 : 0;
    if (result[index]) layer[index] = step;
  }
}

/** A rounded card around the lettering, with a soft edge. */
export function roundedCard(width, height, { x0, y0, x1, y1 }, letter) {
  const pad = Math.max(3, letter * .9), radius = Math.max(3, Math.min(letter * 1.2, (x1 - x0) / 2 + pad, (y1 - y0) / 2 + pad));
  const left = Math.max(0, x0 - pad), top = Math.max(0, y0 - pad), right = Math.min(width, x1 + 1 + pad), bottom = Math.min(height, y1 + 1 + pad);
  const centerX = (left + right) / 2, centerY = (top + bottom) / 2, halfX = (right - left) / 2 - radius, halfY = (bottom - top) / 2 - radius;
  const mask = new Uint8ClampedArray(Math.max(0, width * height));
  const bx0 = Math.max(0, Math.floor(left)), by0 = Math.max(0, Math.floor(top)), bx1 = Math.min(width - 1, Math.ceil(right) - 1), by1 = Math.min(height - 1, Math.ceil(bottom) - 1);
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    const px = Math.abs(x + .5 - centerX) - halfX, py = Math.abs(y + .5 - centerY) - halfY;
    const reachOut = Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - radius;
    mask[y * width + x] = Math.round(clamp(.5 - reachOut, 0, 1) * 255);
  }
  return { kind: 'card', mask, box: { x: bx0, y: by0, width: Math.max(1, bx1 - bx0 + 1), height: Math.max(1, by1 - by0 + 1) }, outline: 0, radius };
}

/**
 * The part of the page to look at for a balloon (fractions of the page, as
 * found): its box with room around it for a round side or a tail, in page pixels.
 */
export function cutoutWindow(balloon, pageWidth, pageHeight, { wider = 1 } = {}) {
  const letter = Number(balloon?.letter) * pageHeight;
  const bx = balloon.x * pageWidth, by = balloon.y * pageHeight, bw = balloon.width * pageWidth, bh = balloon.height * pageHeight;
  const margin = Math.max(letter * 3.5, Math.max(bw, bh) * .45) * wider;
  const x0 = Math.max(0, Math.floor(bx - margin)), y0 = Math.max(0, Math.floor(by - margin));
  const x1 = Math.min(pageWidth, Math.ceil(bx + bw + margin)), y1 = Math.min(pageHeight, Math.ceil(by + bh + margin));
  return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0), whole: x0 === 0 && y0 === 0 && x1 === pageWidth && y1 === pageHeight };
}
