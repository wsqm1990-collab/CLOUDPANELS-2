// Metadata only. MEGA sessions, passwords, keys and file bytes never enter this store.
export const STORAGE_KEY = 'cloudpanels.library.v1';
export const MAX_COMICS = 50000;
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
export const MAX_BOOKMARKS = 5000;
const SOURCES = new Set(['mega', 'local', 'demo']);
const STATUSES = new Set(['unread', 'reading', 'finished']);
const META_KEYS = ['title', 'series', 'volume', 'issue', 'publisher', 'year', 'characters', 'tags'];
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const now = () => new Date().toISOString();
const browserStorage = () => { try { return globalThis.localStorage; } catch { return undefined; } };
const string = (value, max = 512) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/https?:\/\/(?:www\.)?mega\.(?:nz|co\.nz)\/\S+/gi, '[MEGA link omitted]').trim().slice(0, max)
  : '';
const noteText = value => typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/https?:\/\/(?:www\.)?mega\.(?:nz|co\.nz)\/\S+/gi, '[MEGA link omitted]').trim().slice(0, 2000) : '';
const idValue = value => typeof value === 'string' && value.length > 0 && value.length <= 180 && !FORBIDDEN.has(value) && !/[\u0000-\u001f\u007f]/.test(value) && !/https?:\/\//i.test(value) ? value : null;
const integer = (value, fallback, min, max) => Number.isFinite(Number(value)) && value !== '' && value !== null && value !== undefined ? Math.max(min, Math.min(max, Math.floor(Number(value)))) : fallback;
const decimal = (value, fallback, min, max) => Number.isFinite(Number(value)) && value !== '' && value !== null && value !== undefined ? Math.max(min, Math.min(max, Number(value))) : fallback;
const newId = prefix => prefix + ':' + (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : now();
const list = (value, max = 64) => Array.isArray(value) ? [...new Set(value.map(v => string(v, 120)).filter(Boolean))].slice(0, max) : [];
const defaultState = () => ({version: 1, comics: [], progress: {}, collections: [], favorites: [], readLater: [], bookmarks: [], settings: {language: 'en', cacheMiB: 64, readingDirection: 'ltr', readerFitMode: 'whole', readerGuided: false, readerNavigationSeconds: 3, readerSwipeResistance: 3, readerPageAnimation: 'slide', readerPageDuration: 420, readerBackground: 'black', readerBrightness: 1, readerContrast: 1, spoilers: false}, panels: {}});

export function parseMetadata(name = '', path = '') {
  const stem = string(name).replace(/\.(cbz|zip|pdf|cbr|rar|cb7|7z|cbt|tar|jpe?g|png|webp|avif)$/i, '').replace(/_/g, ' ');
  const volume = stem.match(/\b(?:vol(?:ume)?\.?|v)\s*0*(\d+)\b/i);
  const explicitIssue = stem.match(/#\s*(-?\d+(?:\.\d+)?[a-z]?)/i);
  const year = stem.match(/\b((?:19|20)\d{2})\b/);
  let series = stem.replace(/\[[^\]]*\]/g, '').replace(/\((?:19|20)\d{2}[^)]*\)/g, '').replace(/\b(?:vol(?:ume)?\.?|v)\s*0*\d+\b/gi, '').trim();
  let issue = explicitIssue?.[1] || '';
  if (explicitIssue) series = series.replace(/#\s*-?\d+(?:\.\d+)?[a-z]?/i, '');
  else {
    const trailing = series.match(/(?:\s|\s[-–]\s)(0*\d{1,3}(?:\.\d+)?[a-z]?)\s*$/i);
    if (trailing) { issue = trailing[1]; series = series.slice(0, trailing.index); }
  }
  issue = issue.replace(/^0+(?=\d)/, '');
  series = series.replace(/\s*[-–:]\s*$/, '').replace(/\s+/g, ' ').trim() || stem;
  return {title: stem || string(name) || 'Untitled', series, volume: volume?.[1] || '', issue, publisher: '', characters: [], year: year?.[1] || '', tags: []};
}

function metadata(value, fallback = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = {};
  for (const key of META_KEYS) {
    const v = own(source, key) ? source[key] : fallback[key];
    result[key] = key === 'characters' || key === 'tags' ? list(v) : string(typeof v === 'number' ? String(v) : v, key === 'title' || key === 'series' ? 512 : 160);
  }
  return result;
}

function comic(value, previous) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = idValue(value.id), name = string(value.name);
  if (!id || !name || !SOURCES.has(value.source)) return null;
  const result = {id, name, size: integer(value.size, 0, 0, Number.MAX_SAFE_INTEGER), path: string(value.path, 4096), source: value.source,
    format: string(value.format || name.split('.').pop(), 12).toLowerCase(), metadata: metadata(value.metadata, previous?.metadata || parseMetadata(name, value.path)), addedAt: previous?.addedAt || stamp(value.addedAt)};
  // Re-indexing a cloud folder preserves the user's corrections.
  if (previous && !value.metadata) result.metadata = metadata(previous.metadata);
  return result;
}

function progress(value, previous = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const count = integer(value.pageCount, integer(previous.pageCount, 1, 1, 100000), 1, 100000);
  const page = integer(value.page, integer(previous.page, 0, 0, count - 1), 0, count - 1);
  const panel = integer(value.panel, integer(previous.panel, 0, 0, 500), 0, 500);
  const status = STATUSES.has(value.status) ? value.status : (STATUSES.has(previous.status) ? previous.status : 'reading');
  // The overview belongs to this exact page/panel position, never a stale page
  // reached by an older caller that does not know about guided overviews.
  const overview = status !== 'unread' && (typeof value.overview === 'boolean' ? value.overview : page === previous.page && panel === previous.panel && previous.overview === true);
  return {page, panel, pageCount: count, overview, status, updatedAt: stamp(value.updatedAt)};
}

function rectangles(values) {
  if (!Array.isArray(values)) throw new Error('Panel layouts must contain rectangles.');
  if (values.length > 100) throw new Error('A page can contain up to 100 panels.');
  return values.map(value => {
    if (!value || typeof value !== 'object') throw new Error('Invalid panel rectangle.');
    const x = Number(value.x), y = Number(value.y), width = Number(value.width ?? value.w), height = Number(value.height ?? value.h);
    if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.000001 || y + height > 1.000001) throw new Error('Panels must be inside the page.');
    return {x, y, width: Math.min(width, 1 - x), height: Math.min(height, 1 - y)};
  });
}

function settings(value, previous = defaultState().settings) {
  if (!value || typeof value !== 'object') return {...previous};
  return {language: ['en', 'pt-BR', 'es'].includes(value.language) ? value.language : previous.language,
    cacheMiB: integer(value.cacheMiB, previous.cacheMiB, 16, 256), readingDirection: ['ltr', 'rtl'].includes(value.readingDirection) ? value.readingDirection : previous.readingDirection,
    readerFitMode: ['whole', 'fill', 'width'].includes(value.readerFitMode) ? value.readerFitMode : (previous.readerFitMode || 'whole'),
    readerGuided: typeof value.readerGuided === 'boolean' ? value.readerGuided : Boolean(previous.readerGuided),
    readerNavigationSeconds: [0, 3, 5, 8].includes(value.readerNavigationSeconds) ? value.readerNavigationSeconds : ([0, 3, 5, 8].includes(previous.readerNavigationSeconds) ? previous.readerNavigationSeconds : 3),
    readerSwipeResistance: [1, 2, 3, 4, 5].includes(value.readerSwipeResistance) ? value.readerSwipeResistance : ([1, 2, 3, 4, 5].includes(previous.readerSwipeResistance) ? previous.readerSwipeResistance : 3),
    readerPageAnimation: ['slide', 'fade', 'none'].includes(value.readerPageAnimation) ? value.readerPageAnimation : (['slide', 'fade', 'none'].includes(previous.readerPageAnimation) ? previous.readerPageAnimation : 'slide'),
    readerPageDuration: [240, 420, 650].includes(value.readerPageDuration) ? value.readerPageDuration : ([240, 420, 650].includes(previous.readerPageDuration) ? previous.readerPageDuration : 420),
    readerBackground: ['black', 'paper', 'sepia'].includes(value.readerBackground) ? value.readerBackground : (previous.readerBackground || 'black'),
    readerBrightness: decimal(value.readerBrightness, previous.readerBrightness ?? 1, .4, 1.2),
    readerContrast: decimal(value.readerContrast, previous.readerContrast ?? 1, .6, 1.6),
    spoilers: typeof value.spoilers === 'boolean' ? value.spoilers : previous.spoilers};
}

function sanitizeState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1 || !Array.isArray(raw.comics)) throw new Error('This is not a CloudPanels version 1 backup.');
  if (raw.comics.length > MAX_COMICS) throw new Error(`The library limit is ${MAX_COMICS} comics.`);
  const result = defaultState(), seen = new Set();
  for (const entry of raw.comics) {
    const valid = comic(entry);
    if (!valid) throw new Error('A comic in this backup is invalid.');
    if (seen.has(valid.id)) throw new Error('Duplicate comic identifier in backup.');
    seen.add(valid.id); result.comics.push(valid);
  }
  result.favorites = selectedIds(raw.favorites, seen);
  result.readLater = selectedIds(raw.readLater, seen);
  if (raw.bookmarks !== undefined && (!Array.isArray(raw.bookmarks) || raw.bookmarks.length > MAX_BOOKMARKS)) throw new Error('Invalid bookmark list.');
  const positions = new Map(), bookmarkIds = new Set();
  for (const entry of raw.bookmarks || []) {
    const valid = bookmark(entry, seen); if (!valid) continue;
    if (bookmarkIds.has(valid.id)) throw new Error('Duplicate bookmark identifier.');
    bookmarkIds.add(valid.id);
    const key = JSON.stringify([valid.comicId, valid.page, valid.panel]), previous = positions.get(key);
    if (!previous || valid.updatedAt >= previous.updatedAt) positions.set(key, valid);
  }
  result.bookmarks = [...positions.values()];
  if (raw.progress && typeof raw.progress === 'object' && !Array.isArray(raw.progress)) {
    for (const [id, p] of Object.entries(raw.progress)) {
      if (!idValue(id) || !seen.has(id)) continue;
      const valid = progress(p); if (valid) result.progress[id] = valid;
    }
  }
  if (raw.panels && typeof raw.panels === 'object' && !Array.isArray(raw.panels)) {
    for (const [id, pages] of Object.entries(raw.panels)) {
      if (!idValue(id) || !seen.has(id) || !pages || typeof pages !== 'object' || Array.isArray(pages)) continue;
      result.panels[id] = {};
      const entries = Object.entries(pages);
      if (entries.length > 10000) throw new Error('Too many page layouts in backup.');
      for (const [page, rects] of entries) {
        if (!/^(0|[1-9]\d{0,4})$/.test(page)) throw new Error('Invalid page layout number.');
        result.panels[id][page] = rectangles(rects);
      }
    }
  }
  if (raw.collections !== undefined && !Array.isArray(raw.collections)) throw new Error('Invalid collection list.');
  if ((raw.collections?.length || 0) > 1000) throw new Error('Too many collections.');
  const collectionIds = new Set();
  for (const value of raw.collections || []) {
    const id = idValue(value?.id), name = string(value?.name, 160);
    if (!id || !name || collectionIds.has(id)) throw new Error('Invalid collection.');
    collectionIds.add(id);
    result.collections.push({id, name, comicIds: Array.isArray(value.comicIds) ? [...new Set(value.comicIds.filter(v => idValue(v) && seen.has(v)))].slice(0, MAX_COMICS) : [], createdAt: stamp(value.createdAt)});
  }
  result.settings = settings(raw.settings);
  return result;
}

function selectedIds(values, known) {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.length > MAX_COMICS) throw new Error('Invalid saved shelf.');
  return [...new Set(values.filter(value => idValue(value) && known.has(value)))];
}

function bookmark(value, known, previous) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !known.has(value.comicId)) return null;
  const id = idValue(value.id || previous?.id), comicId = idValue(value.comicId);
  if (!id || !comicId) return null;
  const count = integer(value.pageCount, previous?.pageCount || 1, 1, 100000);
  return { id, comicId, page: integer(value.page, previous?.page || 0, 0, count - 1), panel: integer(value.panel, previous?.panel || 0, 0, 99), pageCount: count,
    guided: typeof value.guided === 'boolean' ? value.guided : Boolean(previous?.guided), label: string(value.label ?? previous?.label, 160), note: noteText(value.note ?? previous?.note),
    createdAt: previous?.createdAt || stamp(value.createdAt), updatedAt: stamp(value.updatedAt) };
}

export class LibraryStore {
  constructor({storage = browserStorage()} = {}) { this.storage = storage; this.state = defaultState(); this.lastError = null; }
  load() {
    try {
      const text = this.storage?.getItem(STORAGE_KEY);
      if (text) {
        if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error('Saved library is too large.');
        this.state = sanitizeState(JSON.parse(text));
      }
      this.lastError = null;
    } catch (error) { this.state = defaultState(); this.lastError = 'Your saved library could not be loaded. Import a backup if available.'; }
    return this.state;
  }
  save() {
    try {
      // Sanitize every write, including accidental extra fields added by the caller.
      const clean = sanitizeState(this.state), text = JSON.stringify(clean);
      if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error('Library metadata reached the storage limit.');
      if (!this.storage?.setItem) throw new Error('Browser storage is unavailable.');
      this.storage.setItem(STORAGE_KEY, text); this.state = clean; this.lastError = null; return true;
    } catch (error) { this.lastError = 'Could not save your library. Export a backup before closing this page.'; return false; }
  }
  async flush() { return !this.lastError; }
  upsertComics(values) {
    if (!Array.isArray(values)) throw new Error('Comics must be a list.');
    const map = new Map(this.state.comics.map(c => [c.id, c]));
    for (const value of values) { const valid = comic(value, map.get(value?.id)); if (!valid) throw new Error('Invalid comic.'); map.set(valid.id, valid); }
    if (map.size > MAX_COMICS) throw new Error(`The library limit is ${MAX_COMICS} comics.`);
    this.state.comics = [...map.values()]; this.save(); return this.state.comics;
  }
  updateComic(id, patch) {
    const entry = this.state.comics.find(c => c.id === id); if (!entry) return null;
    // Accept a metadata wrapper or direct metadata fields, never rename/move cloud files.
    entry.metadata = metadata(patch?.metadata || patch, entry.metadata); this.save(); return this.state.comics.find(c => c.id === id);
  }
  removeComic(id) {
    this.state.comics = this.state.comics.filter(c => c.id !== id); delete this.state.progress[id]; delete this.state.panels[id];
    this.state.favorites = this.state.favorites.filter(value => value !== id);
    this.state.readLater = this.state.readLater.filter(value => value !== id);
    this.state.bookmarks = this.state.bookmarks.filter(value => value.comicId !== id);
    this.state.collections = this.state.collections.map(c => ({...c, comicIds: c.comicIds.filter(v => v !== id)})); this.save();
  }
  setProgress(id, value) {
    if (!this.state.comics.some(c => c.id === id)) throw new Error('Comic is not in your library.');
    const valid = progress(value, this.state.progress[id]); if (!valid) throw new Error('Invalid reading progress.');
    this.state.progress[id] = valid; this.save(); return this.state.progress[id];
  }
  setReadStatusBatch(ids, status) {
    // Validate the entire selection before changing reading memory. Stale, valid
    // identifiers are ignored; malformed identifiers never partially apply.
    if (!Array.isArray(ids) || ids.length > MAX_COMICS || !['finished', 'unread'].includes(status)) throw new Error('Invalid reading selection.');
    const selected = new Set();
    for (const id of ids) { if (!idValue(id)) throw new Error('Invalid comic identifier in reading selection.'); selected.add(id); }
    const known = new Set(this.state.comics.map(entry => entry.id)), updates = [];
    const updatedAt = now();
    for (const id of selected) {
      if (!known.has(id)) continue;
      const previous = this.state.progress[id];
      if (!previous && status === 'unread') continue;
      if (previous?.status === status && (status === 'finished' || (previous.page === 0 && previous.panel === 0 && !previous.overview))) continue;
      const next = progress({ page: status === 'unread' ? 0 : previous?.page ?? 0,
        panel: status === 'unread' ? 0 : previous?.panel ?? 0, pageCount: previous?.pageCount ?? 1, status, updatedAt }, previous);
      updates.push([id, next]);
    }
    if (!updates.length) return 0;
    for (const [id, next] of updates) this.state.progress[id] = next;
    this.save();
    return updates.length;
  }
  markUnread(id) {
    const previous = this.state.progress[id];
    return this.setProgress(id, { page: 0, panel: 0, pageCount: previous?.pageCount || 1, status: 'unread' });
  }
  setPanels(id, page, values) {
    if (!this.state.comics.some(c => c.id === id) || !Number.isInteger(page) || page < 0 || page > 99999) throw new Error('Invalid comic page.');
    const valid = rectangles(values); if (!this.state.panels[id]) this.state.panels[id] = {};
    if (!valid.length) delete this.state.panels[id][page]; else this.state.panels[id][page] = valid;
    this.save(); return this.getPanels(id, page);
  }
  getPanels(id, page) { return (this.state.panels[id]?.[page] || []).map(r => ({...r})); }
  setFavorite(id, enabled = true) { return this.setShelf('favorites', id, enabled); }
  setReadLater(id, enabled = true) { return this.setShelf('readLater', id, enabled); }
  setShelf(shelf, id, enabled) {
    if (!['favorites', 'readLater'].includes(shelf) || !this.state.comics.some(value => value.id === id)) throw new Error('Comic is not in your library.');
    const values = this.state[shelf].filter(value => value !== id);
    if (enabled) {
      // Keep an existing choice in its original reading-queue position.
      if (this.state[shelf].includes(id)) return true;
      values.push(id);
    }
    this.state[shelf] = values; this.save(); return Boolean(enabled);
  }
  getBookmarks(comicId) { return this.state.bookmarks.filter(value => value.comicId === comicId).sort((a, b) => a.page - b.page || a.panel - b.panel).map(value => ({...value})); }
  setBookmark(comicId, value) {
    const known = new Set(this.state.comics.map(entry => entry.id));
    if (!known.has(comicId) || !value || typeof value !== 'object') throw new Error('Invalid bookmark.');
    const count = integer(value.pageCount, this.state.progress[comicId]?.pageCount || 1, 1, 100000);
    const page = integer(value.page, 0, 0, count - 1), panel = integer(value.panel, 0, 0, 99);
    const previous = this.state.bookmarks.find(entry => entry.comicId === comicId && entry.page === page && entry.panel === panel);
    if (!previous && this.state.bookmarks.length >= MAX_BOOKMARKS) throw new Error('The bookmark limit is 5000.');
    const valid = bookmark({...value, comicId, page, panel, pageCount: count, id: previous?.id || newId('bookmark'), updatedAt: now()}, known, previous);
    if (!valid) throw new Error('Invalid bookmark.');
    if (previous) this.state.bookmarks = this.state.bookmarks.map(entry => entry.id === previous.id ? valid : entry);
    else this.state.bookmarks.push(valid);
    this.save(); return {...valid};
  }
  removeBookmark(id) { this.state.bookmarks = this.state.bookmarks.filter(value => value.id !== id); return this.save(); }
  setSettings(patch) { this.state.settings = settings(patch, this.state.settings); this.save(); return this.state.settings; }
  createCollection(name) {
    name = string(name, 160); if (!name) throw new Error('Name your collection.');
    if (this.state.collections.length >= 1000) throw new Error('The collection limit is 1000.');
    const id = 'collection:' + (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
    const value = {id, name, comicIds: [], createdAt: now()}; this.state.collections.push(value); this.save(); return value;
  }
  setCollectionComics(id, ids) {
    const value = this.state.collections.find(c => c.id === id); if (!value) throw new Error('Collection not found.');
    if (!Array.isArray(ids)) throw new Error('Choose comics for this collection.');
    const known = new Set(this.state.comics.map(c => c.id)); value.comicIds = [...new Set(ids.filter(v => idValue(v) && known.has(v)))]; this.save(); return this.state.collections.find(c => c.id === id);
  }
  related(id, limit = 6) {
    const selected = this.state.comics.find(c => c.id === id); if (!selected) return [];
    const m = selected.metadata, same = (a, b) => a && b && a.toLocaleLowerCase() === b.toLocaleLowerCase();
    return this.state.comics.filter(c => c.id !== id).map(c => {
      const n = c.metadata; let score = 0;
      if (same(m.series, n.series)) score += 100;
      if (same(m.publisher, n.publisher)) score += 12;
      score += n.characters.filter(v => m.characters.some(w => same(v, w))).length * 25;
      score += n.tags.filter(v => m.tags.some(w => same(v, w))).length * 5;
      if (same(m.series, n.series) && same(m.volume, n.volume)) score += 5;
      return {comic: c, score};
    }).filter(v => v.score > 0).sort((a, b) => b.score - a.score || numberIssue(a.comic) - numberIssue(b.comic) || a.comic.name.localeCompare(b.comic.name)).slice(0, integer(limit, 6, 0, 100)).map(v => v.comic);
  }
  recommendations(limit = 6) {
    const output = [], seen = new Set(), add = c => { if (c && !seen.has(c.id) && this.state.progress[c.id]?.status !== 'finished') { output.push(c); seen.add(c.id); } };
    const reading = this.state.comics.filter(c => this.state.progress[c.id]?.status === 'reading').sort((a, b) => (this.state.progress[b.id]?.updatedAt || '').localeCompare(this.state.progress[a.id]?.updatedAt || ''));
    reading.forEach(add);
    const byId = new Map(this.state.comics.map(c => [c.id, c]));
    this.state.readLater.forEach(id => add(byId.get(id)));
    const finished = this.state.comics.filter(c => this.state.progress[c.id]?.status === 'finished').sort((a, b) => (this.state.progress[b.id]?.updatedAt || '').localeCompare(this.state.progress[a.id]?.updatedAt || ''));
    for (const c of finished) {
      const next = this.state.comics.filter(n => n.metadata.series && n.metadata.series.toLocaleLowerCase() === c.metadata.series.toLocaleLowerCase() && n.metadata.volume === c.metadata.volume && Number.isFinite(numberIssue(c)) && Number.isFinite(numberIssue(n)) && numberIssue(n) > numberIssue(c) && this.state.progress[n.id]?.status !== 'finished').sort((a, b) => numberIssue(a) - numberIssue(b));
      next.slice(0, 1).forEach(add);
    }
    this.state.comics.slice().sort((a, b) => b.addedAt.localeCompare(a.addedAt)).forEach(add);
    return output.slice(0, integer(limit, 6, 0, 100));
  }
  exportBackup() { return JSON.stringify(sanitizeState(this.state)); }
  importBackup(text) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error('Choose a CloudPanels backup smaller than 64 MB.');
    let imported;
    try { imported = sanitizeState(JSON.parse(text)); } catch (error) { throw new Error(error instanceof SyntaxError ? 'The backup is not valid JSON.' : error.message); }
    // Validate before changing anything; import is a merge, preserving the existing library.
    const current = sanitizeState(this.state), map = new Map(current.comics.map(c => [c.id, c]));
    imported.comics.forEach(c => map.set(c.id, c)); if (map.size > MAX_COMICS) throw new Error(`The library limit is ${MAX_COMICS} comics.`);
    const merged = {...current, comics: [...map.values()], settings: imported.settings, progress: {...current.progress}, panels: {...current.panels}};
    merged.favorites = [...new Set([...current.favorites, ...imported.favorites])];
    merged.readLater = [...new Set([...current.readLater, ...imported.readLater])];
    const bookmarks = new Map(current.bookmarks.map(value => [value.id, value]));
    for (const entry of imported.bookmarks) { const previous = bookmarks.get(entry.id); if (!previous || entry.updatedAt >= previous.updatedAt) bookmarks.set(entry.id, entry); }
    merged.bookmarks = [...bookmarks.values()];
    for (const [id, value] of Object.entries(imported.progress)) { if (!merged.progress[id] || value.updatedAt >= merged.progress[id].updatedAt) merged.progress[id] = value; }
    for (const [id, value] of Object.entries(imported.panels)) merged.panels[id] = {...merged.panels[id], ...value};
    const collections = new Map(current.collections.map(c => [c.id, c])); imported.collections.forEach(c => collections.set(c.id, c)); merged.collections = [...collections.values()];
    this.state = sanitizeState(merged); this.save(); return this.state;
  }
}
const numberIssue = c => c.metadata.issue !== '' && Number.isFinite(Number(c.metadata.issue)) ? Number(c.metadata.issue) : Infinity;

const DATABASE_NAME = 'cloudpanels-metadata';
const DATABASE_STORE = 'library';
const ASYNC_SAVE_ERROR = 'Your reading changes are in memory, but could not be saved to this browser. Export a backup before closing CloudPanels.';
const FALLBACK_NOTICE = 'IndexedDB is unavailable. CloudPanels is using limited browser storage; export backups, especially for a large library.';
const STRICT_LOAD_ERROR = 'Your saved library could not be loaded.';
const safeNotify = (callback, message) => { try { callback?.(message); } catch { /* UI callbacks must not break persistence. */ } };
const browserIndexedDB = () => { try { return globalThis.indexedDB; } catch { return undefined; } };

// The adapter stores one bounded, sanitized metadata snapshot. It never receives files or sessions.
async function openMetadataDatabase(indexedDB) {
  if (!indexedDB?.open) throw new Error('IndexedDB unavailable.');
  const database = await new Promise((resolve, reject) => {
    let request, blocked = false;
    try { request = indexedDB.open(DATABASE_NAME, 1); } catch (error) { reject(error); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DATABASE_STORE)) db.createObjectStore(DATABASE_STORE);
    };
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    request.onerror = () => reject(request.error || new Error('Metadata database failed to open.'));
    request.onblocked = () => { blocked = true; reject(new Error('Metadata database upgrade is blocked.')); };
  });
  database.onversionchange = () => database.close();
  return {
    read: () => new Promise((resolve, reject) => {
      let transaction, request, value;
      try {
        transaction = database.transaction(DATABASE_STORE, 'readonly');
        request = transaction.objectStore(DATABASE_STORE).get(STORAGE_KEY);
      } catch (error) { reject(error); return; }
      request.onsuccess = () => { value = request.result; };
      transaction.oncomplete = () => resolve(typeof value === 'string' ? value : null);
      transaction.onerror = () => reject(transaction.error || request.error || new Error('Metadata read failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('Metadata read was interrupted.'));
    }),
    write: text => new Promise((resolve, reject) => {
      let transaction;
      try {
        transaction = database.transaction(DATABASE_STORE, 'readwrite');
        transaction.objectStore(DATABASE_STORE).put(text, STORAGE_KEY);
      } catch (error) { reject(error); return; }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Metadata write failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('Metadata write was interrupted.'));
    }),
    close: () => database.close()
  };
}

/**
 * Creates the browser library with IndexedDB as its durable metadata store.
 * metadataStore is an optional asynchronous {read(), write(text)} adapter for tests or hosts.
 * The normal app needs only onPersistenceError. LibraryStore's editing API stays synchronous;
 * await flush() at important boundaries and on visibilitychange as a best effort.
 */
export async function createBrowserLibraryStore({onPersistenceError, metadataStore, strictPersistence = false, indexedDB = browserIndexedDB(), fallbackStorage} = {}) {
  // A host's encrypted profile is an independent library. Never inspect or
  // import browser-global legacy data on its behalf, even when it is empty.
  const legacyStorage = metadataStore && strictPersistence ? undefined : fallbackStorage === undefined ? browserStorage() : fallbackStorage;
  let backend, initialText = null;
  try {
    backend = metadataStore || await openMetadataDatabase(indexedDB);
    initialText = await backend.read();
    if (initialText !== null && initialText !== undefined && typeof initialText !== 'string') throw new Error('Invalid stored library.');
  } catch {
    try { backend?.close?.(); } catch { /* Best effort. */ }
    if (strictPersistence) throw new Error(STRICT_LOAD_ERROR);
    const fallback = new LibraryStore({storage: legacyStorage});
    fallback.load(); fallback.persistence = 'localStorage'; fallback.persistenceNotice = FALLBACK_NOTICE;
    fallback.close = () => {};
    const baseSave = fallback.save.bind(fallback);
    fallback.save = () => {
      const saved = baseSave();
      if (!saved) safeNotify(onPersistenceError, fallback.lastError);
      return saved;
    };
    fallback.lastError = fallback.lastError || FALLBACK_NOTICE;
    safeNotify(onPersistenceError, fallback.lastError);
    return fallback;
  }

  let migrated = false;
  // A previous browser build may have used localStorage. Read it only when IndexedDB is empty.
  if (!initialText && !(metadataStore && strictPersistence)) {
    try { initialText = legacyStorage?.getItem(STORAGE_KEY) || null; migrated = !!initialText; } catch { /* IndexedDB still works. */ }
  }
  let text = initialText || null, revision = 0, committedRevision = 0, failedRevision = -1, pending = null, store, closed = false;
  const drain = () => {
    if (closed) return Promise.resolve(false);
    if (pending) return pending;
    const task = Promise.resolve().then(async () => {
      while (committedRevision < revision) {
        if (closed) return false;
        const writingRevision = revision, snapshot = text;
        try { await backend.write(snapshot); }
        catch {
          failedRevision = writingRevision;
          store.lastError = ASYNC_SAVE_ERROR;
          safeNotify(onPersistenceError, ASYNC_SAVE_ERROR);
          return false;
        }
        committedRevision = writingRevision;
      }
      if (store.lastError === ASYNC_SAVE_ERROR) store.lastError = null;
      return true;
    });
    pending = task;
    // task absorbs every write failure. This continuation cannot create an unhandled rejection.
    void task.then(() => {
      if (pending === task) pending = null;
      if (committedRevision < revision && revision > failedRevision) drain();
    });
    return task;
  };
  const bridge = {
    getItem: key => key === STORAGE_KEY ? text : null,
    setItem: (key, value) => {
      if (key !== STORAGE_KEY || typeof value !== 'string') throw new Error('Invalid metadata write.');
      text = value; revision += 1; void drain();
    }
  };
  store = new LibraryStore({storage: bridge});
  store.persistence = 'indexedDB'; store.persistenceNotice = null;
  store.load();
  if (strictPersistence && (store.lastError || initialText === '')) {
    try { backend?.close?.(); } catch { /* Best effort. */ }
    throw new Error(STRICT_LOAD_ERROR);
  }
  if (store.lastError) safeNotify(onPersistenceError, store.lastError);
  // Reader mutations must not traverse a potentially 64 MiB catalog during
  // image/panel animation. Keep exact small updates in memory, then coalesce
  // them after the camera settles. Explicit flush/hide still commits promptly.
  const saveSnapshot = store.save.bind(store);
  const readerMutations = Object.fromEntries(['setProgress', 'setPanels', 'setSettings'].map(name => [name, store[name].bind(store)]));
  let progressWrite = false, progressDirty = false, progressTimer = null, preparingProgress = null;
  const cancelProgressTimer = () => {
    if (progressTimer !== null) clearTimeout(progressTimer);
    progressTimer = null;
  };
  const commitProgress = () => {
    cancelProgressTimer();
    if (closed) return false;
    if (!progressDirty) return true;
    progressDirty = false;
    const saved = saveSnapshot();
    if (!saved) { progressDirty = true; safeNotify(onPersistenceError, store.lastError); }
    return saved;
  };
  store.save = () => {
    if (closed) return false;
    if (progressWrite) {
      progressDirty = true;
      cancelProgressTimer();
      progressTimer = setTimeout(commitProgress, 350);
      return true;
    }
    cancelProgressTimer();
    const saved = saveSnapshot();
    if (saved) progressDirty = false;
    return saved;
  };
  for (const [name, mutation] of Object.entries(readerMutations)) store[name] = (...args) => {
    progressWrite = true;
    try { return mutation(...args); } finally { progressWrite = false; }
  };
  const prepareProgress = () => {
    if (!progressDirty) return Promise.resolve(true);
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return Promise.resolve(commitProgress());
    if (preparingProgress) return preparingProgress;
    cancelProgressTimer();
    preparingProgress = (async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && typeof requestAnimationFrame === 'function') {
        await new Promise(resolve => {
          let settled = false;
          const done = () => { if (!settled) { settled = true; resolve(); } };
          // The fallback also lets flush finish if the tab becomes hidden.
          const deadline = setTimeout(done, 120);
          requestAnimationFrame(() => setTimeout(() => { clearTimeout(deadline); done(); }, 0));
        });
      }
      return commitProgress();
    })().finally(() => { preparingProgress = null; });
    return preparingProgress;
  };
  store.flush = async () => {
    if (closed) return false;
    const prepared = await prepareProgress();
    if (committedRevision < revision) await drain();
    return prepared && committedRevision === revision && !store.lastError;
  };
  // Account-switch callers flush first. Closing only releases ownership and
  // pending timers; it must never save another profile or migrate browser data.
  store.close = () => {
    if (closed) return;
    closed = true; cancelProgressTimer();
    try { return backend?.close?.(); } catch { /* Best effort. */ }
  };
  if (migrated && !store.lastError) {
    store.save();
    await store.flush();
  }
  return store;
}

/** Remove only the legacy metadata after its encrypted replacement is saved.
 * The caller must close its legacy store first so deletion cannot be blocked.
 * Cover thumbnails are held in a separate database and are never touched here.
 */
export async function clearLegacyBrowserLibrary({indexedDB = browserIndexedDB(), storage = browserStorage()} = {}) {
  if (typeof indexedDB?.deleteDatabase !== 'function') return false;
  const deleted = await new Promise(resolve => {
    let request;
    try { request = indexedDB.deleteDatabase(DATABASE_NAME); } catch { resolve(false); return; }
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
    request.onblocked = () => resolve(false);
  });
  if (!deleted) return false;
  if (typeof storage?.removeItem !== 'function') return false;
  try { storage.removeItem(STORAGE_KEY); return true; } catch { return false; }
}
