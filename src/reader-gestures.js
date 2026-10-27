// Touch physics for the reader, modelled on iOS scroll views (the feel of the
// Panels app): the page follows the finger 1:1, keeps gliding after a flick,
// stretches with a rubber band at the edges and turns like a paged view.
// Everything here is pure so it can be tested without a browser.

export const TOUCH_SLOP = 8;            // px of travel before a drag is recognised
export const DECELERATION = 0.998;      // velocity kept per millisecond (UIScrollView "normal")
export const SPRING_STIFFNESS = 0.00028; // px/ms² per px when stretched past an edge
export const SPRING_DAMPING = 2 * Math.sqrt(SPRING_STIFFNESS); // critically damped

const finite = value => Number.isFinite(value);

/** iOS rubber band: the further past the edge, the stiffer it gets. */
export function rubberBand(overshoot, dimension, constant = 0.55) {
  if (!finite(overshoot) || !overshoot || !(dimension > 0)) return 0;
  const x = Math.abs(overshoot);
  return Math.sign(overshoot) * (1 - 1 / (x * constant / dimension + 1)) * dimension;
}

/** Inverse of rubberBand, so a finger can catch a page that is still bouncing. */
export function inverseRubberBand(displayed, dimension, constant = 0.55) {
  if (!finite(displayed) || !displayed || !(dimension > 0)) return 0;
  const y = Math.min(Math.abs(displayed), dimension * 0.995);
  return Math.sign(displayed) * (1 / (1 - y / dimension) - 1) * dimension / constant;
}

/**
 * Release velocity in px/ms from recent pointer samples ({t, x, y}). Uses the
 * newest sample and the oldest one inside the window; a finger that stopped
 * before lifting has no velocity.
 */
export function releaseVelocity(samples, now, { windowMs = 100, staleMs = 70 } = {}) {
  if (!Array.isArray(samples) || samples.length < 2) return { x: 0, y: 0 };
  const last = samples[samples.length - 1];
  if (!finite(now) || now - last.t > staleMs) return { x: 0, y: 0 };
  let first = last;
  for (let i = samples.length - 2; i >= 0; i--) { first = samples[i]; if (last.t - samples[i].t >= windowMs) break; }
  const dt = last.t - first.t;
  if (!(dt > 0)) return { x: 0, y: 0 };
  const clampV = v => Math.max(-8, Math.min(8, v));
  return { x: clampV((last.x - first.x) / dt), y: clampV((last.y - first.y) / dt) };
}

/**
 * Decide which axis a one-finger drag controls once it has moved past the slop.
 * 'x'    — turn pages (the page follows the finger sideways)
 * 'y'    — scroll the page up and down
 * 'free' — move a zoomed page in any direction
 * 'none' — nothing to do (vertical drag on a page that already fits)
 */
export function lockAxis({ dx, dy, canScrollY = false, zoomed = false, slop = TOUCH_SLOP } = {}) {
  if (!finite(dx) || !finite(dy)) return null;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < slop) return null;
  if (zoomed) return 'free';
  // A page that fits needs no vertical scrolling: even a fairly diagonal
  // movement is a page turn. Otherwise the dominant direction wins.
  if (!canScrollY) return ax >= ay * 0.6 ? 'x' : 'none';
  // Sideways swipes get a little benefit of the doubt: a page turn is the
  // most common gesture, while scrolling drags are mostly straight up/down.
  return ax >= ay * 0.8 ? 'x' : 'y';
}

const TURN_LEVELS = [null,
  { ratio: .10, flick: .22 }, { ratio: .15, flick: .30 }, { ratio: .20, flick: .38 },
  { ratio: .28, flick: .50 }, { ratio: .36, flick: .65 }];

/**
 * After a sideways drag: return +1 (next page), -1 (previous) or 0 (stay).
 * A flick in the drag's direction turns even when short; dragging far enough
 * turns unless the finger flicked back. Resistance 1 (light) … 5 (firm).
 */
export function decidePageTurn({ dx, vx = 0, width, resistance = 3, direction = 'ltr' } = {}) {
  if (!finite(dx) || !finite(vx) || !(width > 0)) return 0;
  const level = TURN_LEVELS[resistance] || TURN_LEVELS[3];
  const distance = Math.abs(dx), sign = Math.sign(dx);
  if (!sign) return 0;
  const flick = Math.abs(vx) >= level.flick;
  let physical = 0;
  if (flick && Math.sign(vx) === sign && distance >= 24) physical = sign;
  else if (distance >= width * level.ratio && !(flick && Math.sign(vx) === -sign)) physical = sign;
  if (!physical) return 0;
  const logical = physical < 0 ? 1 : -1; // finger moving left reveals the next page
  return direction === 'rtl' ? -logical : logical;
}

/** Duration (ms) for the rest of a page turn, faster after a quick flick. */
export function turnDuration(remaining, velocity = 0, { min = 160, max = 340 } = {}) {
  const distance = Math.abs(remaining), speed = Math.abs(velocity);
  if (!finite(distance) || distance < 1) return min;
  const byVelocity = speed > 0.05 ? distance / speed * 1.6 : max;
  return Math.round(Math.max(min, Math.min(max, byVelocity)));
}

/**
 * One frame of the scroll simulation on a single axis. Inside the bounds the
 * page glides and slows down like iOS; past an edge a critically damped
 * spring pulls it back. Returns { pos, vel, done }.
 */
export function stepScroll({ pos, vel }, dt, { min = 0, max = 0, deceleration = DECELERATION, stiffness = SPRING_STIFFNESS, damping = SPRING_DAMPING } = {}) {
  if (!finite(pos) || !finite(vel) || !(dt > 0)) return { pos: finite(pos) ? pos : 0, vel: 0, done: true };
  max = Math.max(min, max);
  let remaining = Math.min(dt, 64);
  while (remaining > 0) {
    const h = Math.min(4, remaining); remaining -= h;
    const edge = pos < min ? min : pos > max ? max : null;
    if (edge === null) {
      const decay = Math.pow(deceleration, h);
      pos += vel * (decay - 1) / Math.log(deceleration);
      vel *= decay;
      // Gliding into an edge keeps the velocity: the spring takes over next.
    } else {
      const force = -stiffness * (pos - edge) - damping * vel;
      vel += force * h; pos += vel * h;
      // Back at the edge: the bounce is over. A strong flick back into the
      // page keeps gliding; otherwise the page rests exactly on the edge.
      if ((edge === min && pos >= min) || (edge === max && pos <= max)) {
        pos = edge;
        if (Math.abs(vel) < 0.25) vel = 0;
      }
    }
  }
  const inside = pos >= min - 0.25 && pos <= max + 0.25;
  if (inside && Math.abs(vel) < 0.012) return { pos: Math.max(min, Math.min(max, pos)), vel: 0, done: true };
  if (!inside && Math.abs(vel) < 0.012 && Math.abs(pos - (pos < min ? min : max)) < 0.5) return { pos: pos < min ? min : max, vel: 0, done: true };
  return { pos, vel, done: false };
}

/** Where to put a neighbouring page so it matches how the reader will lay it out. */
export function neighbourGeometry({ fit, available, padding = { left: 0, top: 0 } } = {}) {
  if (!fit || !available || !(fit.width > 0) || !(fit.height > 0)) return null;
  return {
    width: fit.width, height: fit.height,
    left: padding.left + (available.width - fit.width) / 2,
    top: padding.top + Math.max(0, (available.height - fit.height) / 2),
  };
}
