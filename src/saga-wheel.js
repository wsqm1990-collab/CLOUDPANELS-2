// The lucky wheel (Assistant screen) picks the next saga to read, by chance.
// A saga is a folder with comics directly inside, as organized in MEGA; a
// comic outside any folder stands on its own. Sagas already read to the end,
// or read in the last few days (being read now), stay out of the wheel.
import {comicFolderParts, normalizeFolderPath, statusOf} from './app-helpers.js';

export const PAUSED_AFTER_DAYS = 7;
const DAY = 86400000;
// The kinds of files the reader opens (as in the app's own list).
const WHEEL_FORMATS = new Set(['cbz', 'zip', 'pdf', 'jpg', 'jpeg', 'png', 'webp', 'cbr', 'rar', 'cb7', '7z', 'cbt', 'tar']);
const nameOrder = new Intl.Collator('en', {numeric: true, sensitivity: 'base'});
const byName = (a, b) => nameOrder.compare(String(a.name || ''), String(b.name || '')) ||
  (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
// A folder named only by its number ("Vol 1", "Livro 2", "03", "01 - Origem")
// is shown with the name of the folder it is in: "X-Men · Vol 1".
const NUMBERED = /^(?:(?:vol(?:ume)?|v|book|livro|tomo|tome|season|temporada|part|parte|arc|arco|year|ano|chapter|cap[ií]tulo|edi[cç][aã]o|issue|n[ºo°])\.?\s*)?#?\d+[a-z]?$|^\d+\s*[-–—.:)_]/i;
const sagaName = path => path.length > 1 && NUMBERED.test(path.at(-1)) ? path.at(-2) + ' · ' + path.at(-1) : path.at(-1);

/**
 * Every saga in the library, with how far it was read and what to open next.
 * state: 'new' (nothing read yet), 'paused' (started, not finished, nothing
 * read in the last `pausedAfterDays` days), 'active' (read recently) or
 * 'finished' (every comic read).
 */
export function findSagas(comics, progress = {}, {now = Date.now(), pausedAfterDays = PAUSED_AFTER_DAYS} = {}) {
  const groups = new Map();
  for (const comic of Array.isArray(comics) ? comics : []) {
    if (!comic?.id || typeof comic.source !== 'string' || comic.source === 'demo') continue;
    if (!WHEEL_FORMATS.has(String(comic.format || '').toLowerCase())) continue;
    const path = comicFolderParts(comic);
    const key = path.length ? comic.source + '\u0000' + path.join('/') : comic.source + '\u0000\u0000' + comic.id;
    let group = groups.get(key);
    if (!group) groups.set(key, group = {key, path, comics: []});
    group.comics.push(comic);
  }
  const cutoff = now - pausedAfterDays * DAY, sagas = [];
  for (const {key, path, comics: list} of groups.values()) {
    list.sort(byName);
    let finished = 0, reading = 0, latest = -1, latestAt = 0;
    const states = list.map((comic, index) => {
      const status = statusOf(comic, progress);
      if (status === 'finished') finished++;
      else if (status === 'reading') reading++;
      else return status;
      // The comic read last (the furthest one when several share a time, as
      // after marking a whole folder as read).
      const at = Date.parse(progress[comic.id]?.updatedAt || '') || 0;
      if (latest < 0 || at >= latestAt) { latest = index; latestAt = at; }
      return status;
    });
    let nextIndex = -1;
    if (latest < 0) nextIndex = 0;
    else if (states[latest] === 'reading') nextIndex = latest;
    else {
      for (let index = latest + 1; index < list.length && nextIndex < 0; index++) if (states[index] !== 'finished') nextIndex = index;
      for (let index = 0; index < latest && nextIndex < 0; index++) if (states[index] !== 'finished') nextIndex = index;
    }
    const state = finished === list.length ? 'finished' : finished + reading === 0 ? 'new' : latestAt >= cutoff ? 'active' : 'paused';
    const single = !path.length, first = list[0];
    sagas.push({key, kind: single ? 'comic' : 'folder', path, parent: single ? [] : path.slice(0, -1),
      name: single ? (first.metadata?.title || first.name) : sagaName(path), comics: list, count: list.length,
      finished, reading, lastAt: latest < 0 ? 0 : latestAt, state, next: nextIndex >= 0 ? list[nextIndex] : null});
  }
  return sagas.sort((a, b) => comparePaths(a.path, b.path) || nameOrder.compare(a.name, b.name));
}

function comparePaths(a, b) {
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const order = nameOrder.compare(a[index], b[index]);
    if (order) return order;
  }
  return a.length - b.length;
}
const insideScope = (path, scope) => scope.length <= path.length && scope.every((part, index) => path[index] === part);

/** How many sagas wait in the wheel: not started yet, and started then stopped. */
export function wheelCounts(sagas) {
  let fresh = 0, paused = 0;
  for (const saga of sagas) { if (saga.state === 'new') fresh++; else if (saga.state === 'paused') paused++; }
  return {new: fresh, paused, all: fresh + paused};
}

/** The sagas in the draw: kind 'all', 'new' or 'paused', inside a folder (scope). */
export function wheelPool(sagas, {kind = 'all', scope = []} = {}) {
  const wanted = kind === 'new' ? ['new'] : kind === 'paused' ? ['paused'] : ['new', 'paused'];
  const within = normalizeFolderPath(scope);
  return sagas.filter(saga => wanted.includes(saga.state) && insideScope(saga.path, within));
}

/** Folders worth spinning in: those holding at least `min` sagas of the draw. */
export function wheelScopes(sagas, {min = 2, limit = 400} = {}) {
  const folders = new Map();
  for (const saga of sagas) {
    if (saga.state !== 'new' && saga.state !== 'paused') continue;
    for (let depth = 1; depth <= saga.path.length; depth++) {
      const path = saga.path.slice(0, depth), key = path.join('\u0000');
      const folder = folders.get(key);
      if (folder) folder.count++; else folders.set(key, {path, count: 1});
    }
  }
  let list = [...folders.values()].filter(folder => folder.count >= min);
  if (list.length > limit) list = list.sort((a, b) => b.count - a.count || a.path.length - b.path.length).slice(0, limit);
  return list.sort((a, b) => comparePaths(a.path, b.path));
}

export function randomUnit() {
  try { const value = new Uint32Array(1); globalThis.crypto.getRandomValues(value); return value[0] / 4294967296; }
  catch { return Math.random(); }
}
const pick = (random, count) => Math.min(count - 1, Math.max(0, Math.floor(random() * count)));

// The wheel's slices hide what is under them: they only make the show.
export const WHEEL_SLICES = 12;

/**
 * The next saga, by chance, from the whole draw: every saga in it as likely as
 * any other. In a big draw (more than 8), the latest winners sit out for a
 * while, so spinning again brings something else; in a small one, anything
 * can come up again.
 */
export function pickSaga(pool, {avoid = [], random = randomUnit} = {}) {
  if (!Array.isArray(pool) || !pool.length) return null;
  const recent = new Set((Array.isArray(avoid) ? avoid : []).slice(0, Math.max(0, Math.min(10, pool.length - 8))));
  const fresh = pool.filter(saga => !recent.has(saga.key));
  return fresh[pick(random, fresh.length)];
}

/** Where the wheel stops: any slice, equally likely. */
export function pickSlice(total = WHEEL_SLICES, random = randomUnit) {
  return total > 0 ? pick(random, total) : -1;
}

/**
 * Where the wheel stops (degrees, clockwise): `turns` full turns past
 * `current`, with the winning slice under the pointer at the top, never right
 * on an edge between two slices.
 */
export function landingRotation(current, index, total, {turns = 5, random = randomUnit} = {}) {
  const slice = 360 / total, within = (index + .18 + .64 * random()) * slice;
  const base = current + turns * 360;
  return base + (((-within - base) % 360) + 360) % 360;
}

/** The slice under the pointer for a rotation of the wheel. */
export function sliceAtRotation(rotation, total) {
  const angle = (((-rotation) % 360) + 360) % 360;
  return Math.min(total - 1, Math.floor(angle / (360 / total)));
}

/** A wheel slowing down by itself: fast at first, a long gentle end. */
export const spinEase = progress => 1 - (1 - Math.min(1, Math.max(0, progress))) ** 3;

/** The latest winners, newest first, without repeats. */
export function rememberWinner(recent, key, limit = 12) {
  return [key, ...(Array.isArray(recent) ? recent : []).filter(value => value !== key)].slice(0, limit);
}
