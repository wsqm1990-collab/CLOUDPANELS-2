// Balloon by balloon (optional, with Enlarge balloons): the corners of the
// screen go from balloon to balloon in reading order, each one enlarged, the
// page seen for a moment in between; or it goes on by itself, each balloon out
// for about as long as its lettering takes to read. After the last balloon the
// page (or, in Panel view, the panel) turns. Nothing here touches the screen:
// the reader gives the stepper what to show and how.
import { balloonOrder, balloonOwner } from './readable-steps.js';

/** The page seen between two balloons (ms), by choice. */
export const STEP_PAUSES = Object.freeze({ short: 600, medium: 1100, long: 1800 });
/** A tap this soon (ms) after a balloon came out is not taken: it was meant for the page before. */
export const TAP_GUARD = 550;
/** How long balloons stay out when it goes on by itself, by choice (a factor of the reading time). */
export const READING_SPEEDS = Object.freeze({ slow: 1.45, normal: 1, fast: .7 });
export const stepPause = choice => STEP_PAUSES[choice] ?? STEP_PAUSES.medium;

/** How long a balloon stays out when it goes on by itself (ms): a moment to find it, then its lettering. */
export function readingTime(balloon, speed = 'normal') {
  const letters = Math.max(0, Number(balloon?.letters) || 0), factor = READING_SPEEDS[speed] || 1;
  return Math.round(Math.min(14000, Math.max(1800, (1300 + letters * 75) * factor)));
}

const valid = rect => [rect?.x, rect?.y, rect?.width, rect?.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;
const lettering = balloon => valid(balloon?.text) ? balloon.text : balloon;
const middleX = balloon => { const box = lettering(balloon); return box.x + box.width / 2; };

// `lower` sits right under `upper` (a caption stacked under another): sharing a third of their
// width, at most about four letters below it.
function stackedUnder(upper, lower) {
  const a = lettering(upper), b = lettering(lower), letter = Math.max(Number(upper?.letter) || 0, Number(lower?.letter) || 0) || a.height / 3;
  const gap = b.y - (a.y + a.height), shared = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  return gap >= -letter && gap <= letter * 4 && shared >= Math.min(a.width, b.width) * .3;
}
// Row by row, but a panel is not left too soon: when the next balloon is across a panel's border
// or gutter (`apart`) and one on this side sits right under the balloon just read, that one
// comes first (captions stacked down one side of a panel are read down it before another panel).
function staying(order, apart) {
  const read = [], rest = [...order];
  while (rest.length) {
    const last = read[read.length - 1];
    let next = 0;
    if (last && apart(last, rest[0])) {
      const under = rest.findIndex((other, index) => index > 0 && stackedUnder(last, other) && !apart(last, other));
      if (under > 0) next = under;
    }
    read.push(rest.splice(next, 1)[0]);
  }
  return read;
}

/**
 * The balloons of what is shown, in reading order (fractions of the shown image).
 * - `panel` ≥ 0 (Panel view): only those of that step of `panels`;
 * - `spread`: two pages side by side, the first page's balloons, then the second's;
 * - `panels` (a page's panels, in reading order): panel by panel, row by row in each;
 * - otherwise row by row over the page, not leaving a panel too soon where `apart(a, b)`
 *   tells of a panel's border or gutter between two balloons (see balloon-walls.js).
 */
export function balloonSequence(balloons = [], { panels = [], panel = -1, direction = 'ltr', spread = false, apart = () => false } = {}) {
  const list = (Array.isArray(balloons) ? balloons : []).filter(balloon => valid(balloon) || valid(balloon?.text));
  const steps = (Array.isArray(panels) ? panels : []).filter(valid);
  const rows = group => staying(balloonOrder(group, direction), apart);
  if (panel >= 0) return steps.length === (panels?.length || 0) && steps.length ? balloonOrder(list.filter(balloon => balloonOwner(steps, balloon) === panel), direction) : [];
  if (spread) {
    const first = list.filter(balloon => direction === 'rtl' ? middleX(balloon) >= .5 : middleX(balloon) < .5);
    return [...rows(first), ...rows(list.filter(balloon => !first.includes(balloon)))];
  }
  if (!steps.length) return rows(list);
  const groups = steps.map(() => []);
  for (const balloon of list) groups[Math.max(0, balloonOwner(steps, balloon))].push(balloon);
  return groups.flatMap(group => balloonOrder(group, direction));
}

/**
 * The stepping. Given by the reader:
 * - `place()`: what is shown now (a new page or panel starts again from its first balloon);
 * - `sequence()`: a promise of the balloons of what is shown, in order (null or [] when there are none);
 * - `open(balloon, { timer })`: shows it enlarged (true when shown; 'busy' when it cannot be shown yet,
 *   a page still turning: tried again in a moment); `close()`: puts it back;
 * - `isOpen()`: whether a balloon is out;
 * - `turn(delta, { auto })`: a promise, true when the next/previous page or panel is shown (false: none, or not allowed);
 * - `pause()`: ms the page is seen between balloons; `readFor(balloon)`: ms a balloon stays out by itself;
 * - `covers(shown, other)`: whether the enlarged `shown` already holds `other` (joined balloons come out
 *   together: the next step goes past it, and the time to read counts both);
 * - `wait(ms, fn)` / `cancel(id)`: timers; `now()`: the time (ms); `guard`: ms after a balloon comes out
 *   during which a tap is not taken; `onState(state)`: 'running' | 'stopped' | 'end' | 'edge'.
 */
export function createBalloonStepper({ place, sequence, open, close, isOpen = () => false, turn, pause = () => STEP_PAUSES.medium, readFor = () => 3000, covers = () => false, wait = (ms, fn) => setTimeout(fn, ms), cancel = id => clearTimeout(id), now = () => Date.now(), guard = TAP_GUARD, onState } = {}) {
  let at = null, list = [], cursor = -1, timer = null, running = false, pending = null, work = 0, enteredBackward = false, shownAt = null;
  const clearTimer = () => { if (timer !== null) cancel(timer); timer = null; };
  const later = (ms, fn) => { clearTimer(); timer = wait(ms, () => { timer = null; fn(); }); };
  // What is shown now, and its balloons (known once per page or panel, so the order never shifts under a step).
  async function sync(job) {
    const here = place();
    if (here === at) return true;
    const found = await sequence();
    if (job !== work) return false;
    if (place() !== here) return false;
    at = here; list = Array.isArray(found) ? found : []; cursor = enteredBackward ? list.length : -1; enteredBackward = false; pending = null;
    return true;
  }
  function show(index, job, tries = 0) {
    // What is shown changed meanwhile (a swipe): nothing of the old page comes out.
    if (place() !== at) { pending = null; if (running) void step(1, { auto: true }); return; }
    const balloon = list[index];
    // Balloons joined to it come out with it: reading it takes their time too.
    let letters = Number(balloon?.letters) || 0;
    for (let next = index + 1; next < list.length && covers(balloon, list[next]); next++) letters += Number(list[next]?.letters) || 0;
    const time = running ? readFor({ ...balloon, letters }) : 0, shown = open(balloon, { timer: time });
    if (job !== work) return;
    if (shown === 'busy' && tries < 12) { pending = index; later(250, () => { if (job === work) show(index, job, tries + 1); }); return; }
    cursor = index; pending = null; shownAt = shown === true ? now() : null;
    if (running) later(shown === true ? time : pause(), () => void step(1, { auto: true }));
  }
  /** One step forwards (1) or back (-1). */
  async function step(delta, { auto = false } = {}) {
    // A tap just as a balloon comes out was meant for the page before it: the balloon stays, to be read.
    if (!auto && guard > 0 && pending === null && shownAt !== null && isOpen() && now() - shownAt < guard) return;
    const job = ++work;
    if (!auto) clearTimer();
    if (!(await sync(job))) return;
    const from = pending ?? cursor, current = from >= 0 && from < list.length ? list[from] : null;
    // During a pause, a tap forwards brings out the balloon on its way at once (it is never skipped).
    let target = pending !== null && delta > 0 ? pending : from + delta;
    // (Past the balloons already out with this one.)
    while (target !== pending && current && target >= 0 && target < list.length && covers(current, list[target])) target += delta;
    clearTimer();
    if (target >= 0 && target < list.length) {
      // During a pause a tap goes on at once; from a balloon out, the page is seen for a moment first.
      if (pending !== null || !isOpen()) return show(target, job);
      close(); shownAt = null; pending = target;
      later(pause(), () => { if (job === work) show(target, job); });
      return;
    }
    if (isOpen()) close();
    pending = null; shownAt = null;
    // Back from the first balloon: the page as it is, without one out.
    if (target === -1 && delta < 0 && list.length) { cursor = -1; return; }
    cursor = delta > 0 ? list.length : -1;
    enteredBackward = delta < 0;
    const turned = await turn(delta, { auto: running });
    // (A wide page moved across instead of turning: still the same place.)
    if (place() === at) enteredBackward = false;
    if (job !== work) return;
    if (!turned) { enteredBackward = false; if (running) { running = false; onState?.('end'); } else onState?.('edge'); return; }
    // By itself: the new page (or panel) is seen for a moment, then its first balloon comes out.
    if (running && delta > 0) later(pause(), () => void step(1, { auto: true }));
  }
  return {
    step,
    /** Goes on by itself from where it is (a tap on the right side starts it). */
    start() { if (!running) { running = true; onState?.('running'); } return step(1, { auto: true }); },
    /** Stops going on by itself (and any step on its way); the balloon out stays until it is put back. */
    stop() { work++; clearTimer(); pending = null; if (running) { running = false; onState?.('stopped'); } },
    /** A balloon opened by a tap on it: the steps go on from it (going on by itself stops). */
    async shown(balloon) {
      const job = ++work; clearTimer(); pending = null;
      if (running) { running = false; onState?.('stopped'); }
      if (!(await sync(job))) return;
      const index = list.indexOf(balloon); if (index >= 0) cursor = index;
    },
    /** What is shown changed in another way (a swipe, another page): starts again there. */
    reset() { work++; clearTimer(); pending = null; at = null; list = []; cursor = -1; enteredBackward = false; shownAt = null; if (running) { running = false; onState?.('stopped'); } },
    get running() { return running; },
    get position() { return { cursor, count: list.length, pending }; },
  };
}
