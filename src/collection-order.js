// Reading-order collections. A collection can keep its own order (the comics
// assistant makes these), with the issues that are not in the library marked
// where they belong. Each collection has its own order: the library, the
// folders and the other collections are not touched by it.

export const MAX_ORDER = 400;
export const MAX_MISSING = 300;

const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const fold = value => clean(value, 400).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * The order of a collection: its comics and its missing issues, numbered
 * from 1. Comics that left the library are skipped (a missing issue placed
 * before one of them keeps its place).
 */
export function collectionItems(collection, comicsById) {
  const ids = Array.isArray(collection?.comicIds) ? collection.comicIds : [], present = new Set(ids);
  const before = new Map(), atEnd = [];
  for (const entry of Array.isArray(collection?.missing) ? collection.missing : []) {
    if (!entry?.title) continue;
    if (entry.before && present.has(entry.before)) { if (!before.has(entry.before)) before.set(entry.before, []); before.get(entry.before).push(entry); }
    else atEnd.push(entry);
  }
  const items = []; let position = 0;
  for (const id of ids) {
    for (const entry of before.get(id) || []) items.push({ type: 'missing', title: entry.title, position: ++position });
    const comic = comicsById.get(id);
    if (comic) items.push({ type: 'comic', comic, position: ++position });
  }
  for (const entry of atEnd) items.push({ type: 'missing', title: entry.title, position: ++position });
  return items;
}

/** The comic after `currentId` in the collection's order (one that can be opened), or null at its end. */
export function nextInCollection(collection, currentId, comicsById, canOpen = () => true) {
  const ids = Array.isArray(collection?.comicIds) ? collection.comicIds : [];
  const index = ids.indexOf(currentId);
  if (index < 0) return null;
  for (let next = index + 1; next < ids.length; next++) {
    const comic = comicsById.get(ids[next]);
    if (comic && canOpen(comic)) return comic;
  }
  return null;
}

/**
 * The comic after `currentId` in a collection made by hand, in the order its
 * screen lists them (`listed` puts its comics in that order), or null at its end.
 */
export function nextInListedCollection(collection, currentId, comics, listed, canOpen = () => true) {
  const ids = new Set(Array.isArray(collection?.comicIds) ? collection.comicIds : []);
  if (!ids.has(currentId)) return null;
  const order = listed((Array.isArray(comics) ? comics : []).filter(comic => ids.has(comic?.id)));
  const index = order.findIndex(comic => comic.id === currentId);
  if (index < 0) return null;
  for (let next = index + 1; next < order.length; next++) if (canOpen(order[next])) return order[next];
  return null;
}

// Which collection each comic is read through, kept on the device: the
// comic's id → the collection's id ('' = its folder). The latest are kept.
export const MAX_THROUGH = 400;
const throughId = value => typeof value === 'string' && value.length <= 180;

/** The kept list, back from storage (anything unexpected is left out). */
export function throughFromText(text) {
  const kept = new Map();
  let value = null;
  try { value = JSON.parse(text || 'null'); } catch { /* Nothing kept. */ }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return kept;
  for (const [comicId, collectionId] of Object.entries(value).slice(-MAX_THROUGH)) if (comicId && throughId(comicId) && throughId(collectionId)) kept.set(comicId, collectionId);
  return kept;
}

/** Keeps how a comic is read (no collection given: forgets it). The newest go last; the oldest leave first. */
export function keepThrough(kept, comicId, collectionId) {
  if (!comicId || !throughId(comicId)) return kept;
  kept.delete(comicId);
  if (throughId(collectionId)) kept.set(comicId, collectionId);
  while (kept.size > MAX_THROUGH) kept.delete(kept.keys().next().value);
  return kept;
}

/**
 * The collection a comic is read through ('' = its folder, as always).
 * Opened from a collection's screen: that one. Otherwise the way it was last
 * opened on this device, while that collection still has it. A comic this
 * device knows nothing about (begun on another device, or before this was
 * kept) goes on in a reading order only when it is clearly being read through
 * it: it is being read and it is where that order has got to (everything
 * before it there is read), in exactly one reading order.
 */
export function readingThrough(comicId, { shown = '', kept = new Map(), collections = [], progress = {} } = {}) {
  const list = Array.isArray(collections) ? collections : [];
  const holds = collection => Array.isArray(collection?.comicIds) && collection.comicIds.includes(comicId);
  const has = id => Boolean(id) && list.some(collection => collection?.id === id && holds(collection));
  if (has(shown)) return shown;
  if (kept.has(comicId)) return has(kept.get(comicId)) ? kept.get(comicId) : '';
  if (progress?.[comicId]?.status !== 'reading') return '';
  const reached = collection => collection.comicIds.find(id => progress[id]?.status !== 'finished') === comicId;
  const orders = list.filter(collection => collection?.ordered === true && holds(collection) && reached(collection));
  return orders.length === 1 ? orders[0].id : '';
}

/**
 * Where to go on in a collection: its first comic not read yet, with its
 * number in the order; `started` when any of it has been read (or is being read).
 * Null when everything in it has been read.
 */
export function continueInCollection(collection, comicsById, progress = {}) {
  const comics = collectionItems(collection, comicsById).filter(item => item.type === 'comic');
  const next = comics.find(item => progress[item.comic.id]?.status !== 'finished');
  if (!next) return null;
  const started = comics.some(item => ['finished', 'reading'].includes(progress[item.comic.id]?.status));
  return { comic: next.comic, position: next.position, started };
}

/**
 * Missing issues keep their place when comics leave the collection: one placed
 * before a comic that is no longer there moves to the comic that came after it.
 */
export function reanchorMissing(missing, oldIds, newIds) {
  const kept = new Set(newIds), old = Array.isArray(oldIds) ? oldIds : [];
  return (Array.isArray(missing) ? missing : []).map(entry => {
    if (!entry.before || kept.has(entry.before)) return entry;
    const from = old.indexOf(entry.before);
    if (from >= 0) for (let next = from + 1; next < old.length; next++) if (kept.has(old[next])) return { ...entry, before: old[next] };
    return { ...entry, before: '' };
  });
}

/** A collection by name (accents and capitals do not matter): the same name, or the only one containing it. */
export function findCollection(collections, name) {
  const wanted = fold(name);
  if (!wanted) return null;
  const list = Array.isArray(collections) ? collections : [];
  const same = list.find(collection => fold(collection.name) === wanted);
  if (same) return same;
  const partial = list.filter(collection => fold(collection.name).includes(wanted));
  return partial.length === 1 ? partial[0] : null;
}

/**
 * A collection the assistant proposes, checked against the library.
 * input: { name, order: [{ ref: 'c12' } | { missing: 'Title #1' }], replace?: 'existing name' }
 * Returns { proposal } or { error } (a message the assistant can act on, in Portuguese like its tools).
 */
export function proposeCollection(input, { byRef, comicsById, collections = [] }) {
  const name = clean(input?.name, 160);
  if (!name) return { error: 'Falta o nome da coleção (name).' };
  const order = Array.isArray(input?.order) ? input.order : [];
  if (!order.length) return { error: 'Falta a ordem (order): uma lista de itens {"ref":"c12"} (revista da biblioteca) ou {"missing":"Título #1"} (edição que falta).' };
  if (order.length > MAX_ORDER) return { error: `A ordem tem ${order.length} itens; o limite é ${MAX_ORDER}. Divida em mais de uma coleção (por exemplo, parte 1 e parte 2).` };
  const replaceName = clean(input?.replace, 160);
  let target = null;
  if (replaceName) {
    target = findCollection(collections, replaceName);
    if (!target) return { error: `Não existe coleção chamada "${replaceName}". Veja os nomes com my_collections, ou crie uma nova sem replace.` };
  } else {
    const same = (Array.isArray(collections) ? collections : []).find(collection => fold(collection.name) === fold(name));
    if (same) return { error: `Já existe a coleção "${same.name}" (${same.comicIds.length} revistas). Para mudá-la, chame de novo com replace: "${same.name}" e a ordem nova completa; para criar outra, use um nome diferente.` };
  }
  const comicIds = [], missing = [], unknown = [], repeated = [], seen = new Set();
  let waiting = [];
  for (const item of order) {
    const ref = typeof item === 'string' ? item : item?.ref;
    if (ref) {
      const code = String(ref).replace(/[[\]\s]/g, '');
      const id = byRef.get(code);
      if (!id || !comicsById.has(id)) { unknown.push(code); continue; }
      if (seen.has(id)) { repeated.push(code); continue; }
      seen.add(id); comicIds.push(id);
      for (const title of waiting) missing.push({ title, before: id });
      waiting = [];
    } else if (typeof item?.missing === 'string' && clean(item.missing, 200)) {
      if (missing.length + waiting.length < MAX_MISSING) waiting.push(clean(item.missing, 200));
    }
  }
  for (const title of waiting) missing.push({ title, before: '' });
  if (unknown.length) return { error: `Estes códigos não são de revistas da biblioteca: ${unknown.slice(0, 20).join(', ')}. Use só os códigos [[cN]] que as ferramentas mostram; edições que ele não tem vão como {"missing":"Título #N"}.` };
  if (!comicIds.length) return { error: 'A ordem não tem nenhuma revista da biblioteca. Uma coleção precisa de pelo menos uma.' };
  return { proposal: { name, comicIds, missing, replaceId: target?.id || '', replaceName: target?.name || '', repeated } };
}

/** A proposal kept with the chat (checked again when it comes back from storage). */
export function cleanProposal(value) {
  if (!value || typeof value !== 'object') return null;
  const name = clean(value.name, 160);
  const comicIds = Array.isArray(value.comicIds) ? [...new Set(value.comicIds.filter(id => typeof id === 'string' && id && id.length <= 180))].slice(0, MAX_ORDER) : [];
  if (!name || !comicIds.length) return null;
  const missing = (Array.isArray(value.missing) ? value.missing : []).filter(entry => entry && clean(entry.title, 200))
    .slice(0, MAX_MISSING).map(entry => ({ title: clean(entry.title, 200), before: typeof entry.before === 'string' && entry.before.length <= 180 ? entry.before : '' }));
  const state = ['pending', 'created', 'updated', 'cancelled'].includes(value.state) ? value.state : 'pending';
  return { name, comicIds, missing, replaceId: typeof value.replaceId === 'string' ? value.replaceId.slice(0, 180) : '', replaceName: clean(value.replaceName, 160),
    state, collectionId: typeof value.collectionId === 'string' ? value.collectionId.slice(0, 180) : '' };
}
