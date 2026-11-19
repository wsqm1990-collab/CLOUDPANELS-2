// Panel borders and gutters between balloons, for the order of Balloon by balloon on a
// page whose panels are not known (the art runs to the edges, panels set inside others):
// a long straight line or band across the picture, of one tone and standing out on both
// sides, between two balloons puts them in different panels. Done on this device, on the
// page as balloons are looked for (see balloon-analyzer.js), without a network.

/** The page's brightness, from RGBA pixels ({ data, width, height }). */
export function lumaPicture({ data, width, height } = {}) {
  if (!data || !(width > 0) || !(height > 0) || data.length < width * height * 4) return null;
  const luma = new Uint8Array(width * height);
  for (let index = 0, offset = 0; index < luma.length; index++, offset += 4) luma[index] = (54 * data[offset] + 183 * data[offset + 1] + 19 * data[offset + 2]) >> 8;
  return { luma, width, height };
}

const TONE = 24, CONTRAST = 35;
const valid = rect => [rect?.x, rect?.y, rect?.width, rect?.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;
const lettering = balloon => valid(balloon?.text) ? balloon.text : balloon;

/**
 * Whether a panel's border or gutter stands between balloons `a` and `b` (fractions of the
 * page). Along the line between their lettering, outside every balloon in `balloons`, it
 * looks for a stroke of one tone, thin (at most about 3.5% of the page across), standing out
 * on both sides, and long (a fifth of the page or more) and straight, upright or level.
 */
export function wallBetween(picture, a, b, { balloons = [] } = {}) {
  const { luma, width, height } = picture || {};
  if (!luma || !valid(lettering(a)) || !valid(lettering(b))) return false;
  const at = (x, y) => luma[y * width + x];
  const thickest = Math.max(3, Math.round(width * .035)), longest = { upright: height * .2, level: width * .2 };
  const boxes = [a, b, ...balloons].filter(valid).map(box => ({ x0: Math.floor(box.x * width) - 2, y0: Math.floor(box.y * height) - 2, x1: Math.ceil((box.x + box.width) * width) + 2, y1: Math.ceil((box.y + box.height) * height) + 2 }));
  const covered = (x, y) => boxes.some(box => x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1);
  // A stroke through (x, y): `upright` runs down the page (a border between panels side by side).
  // (Across it is `u`, along it `v`.)
  const wall = (x, y, upright) => {
    const value = at(x, y), reach = upright ? height : width;
    const tone = (u, v) => { const px = upright ? u : v, py = upright ? v : u; return px >= 0 && py >= 0 && px < width && py < height ? at(px, py) : -1; };
    const like = (u, v) => { const t = tone(u, v); return t >= 0 && Math.abs(t - value) <= TONE; };
    const u0 = upright ? x : y, v0 = upright ? y : x;
    // Across: how thick the stroke of this tone is, and that it stands out from both sides.
    let before = 0, after = 0;
    while (before <= thickest && like(u0 - before - 1, v0)) before++;
    while (after <= thickest && like(u0 + after + 1, v0)) after++;
    const thick = before + after + 1;
    if (thick > thickest) return false;
    const out = t => t >= 0 && Math.abs(t - value) > CONTRAST;
    if (!out(tone(u0 - before - 1, v0)) || !out(tone(u0 + after + 1, v0))) return false;
    // Along: from its middle, how far it goes on in one tone (leaning a little at most), staying
    // thin: a border or gutter does; a patch of paint widens, a line of the drawing bends away.
    const middle = u0 + Math.round((after - before) / 2);
    let length = 1, thin = 1;
    for (const direction of [-1, 1]) {
      let u = middle;
      for (let distance = 1, misses = 0; ; distance++) {
        const v = v0 + distance * direction;
        if (v < 0 || v >= reach) break;
        const lean = 2 + distance * .04, shift = [0, -1, 1].find(by => Math.abs(u + by - middle) <= lean && like(u + by, v));
        if (shift === undefined) { if (++misses > 2) break; continue; }
        u += shift; misses = 0; length++;
        // Its edges on this row: thin, standing out on both sides (and its middle followed).
        let low = u, high = u;
        while (u - low <= thickest && like(low - 1, v)) low--;
        while (high - u <= thickest && like(high + 1, v)) high++;
        if (high - low + 1 <= thickest) {
          if (out(tone(low - 2, v)) && out(tone(high + 2, v))) thin++;
          u = (low + high) >> 1;
        }
      }
    }
    return length >= (upright ? longest.upright : longest.level) && thin >= length * .6;
  };
  const from = lettering(a), to = lettering(b);
  const x0 = (from.x + from.width / 2) * width, y0 = (from.y + from.height / 2) * height, x1 = (to.x + to.width / 2) * width, y1 = (to.y + to.height / 2) * height;
  const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
  for (let index = 1; index < steps; index++) {
    const x = Math.round(x0 + (x1 - x0) * index / steps), y = Math.round(y0 + (y1 - y0) * index / steps);
    if (x < 0 || y < 0 || x >= width || y >= height || covered(x, y)) continue;
    if (wall(x, y, true) || wall(x, y, false)) return true;
  }
  return false;
}
