// Small pictures of a comic's pages for the page navigator. They are made on
// the device: from a page the reader already has decoded, or, for a page shown
// in the navigator's strip, by fetching just that page. They stay in this
// browser's storage (never in MEGA), so they appear at once the next time.
const MiB = 1024 * 1024;
const MAX_BYTES = 128 * 1024;
const abortError = () => new DOMException('Thumbnail cancelled.', 'AbortError');
const check = signal => { if (signal?.aborted) throw abortError(); };

/** The comic file's identity (not its title or reading progress). */
export function pageThumbnailComicKey(comic) {
  if (!comic || typeof comic.id !== 'string' || !comic.id || comic.id.length > 240) return null;
  const size = Number.isSafeInteger(comic.size) && comic.size > 0 ? comic.size : 0;
  return JSON.stringify(['pages-v1', String(comic.source || ''), comic.id, size, String(comic.name || '').slice(0, 300)]);
}

async function decodeBlob(blob, signal) {
  if (typeof globalThis.createImageBitmap === 'function') {
    try { return { drawable: await globalThis.createImageBitmap(blob), release: bitmap => bitmap.close?.() }; }
    catch (error) { if (signal?.aborted) throw abortError(); if (typeof globalThis.Image !== 'function') throw error; }
  }
  if (typeof globalThis.Image !== 'function') return null;
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const picture = new Image();
      const stop = () => { picture.src = ''; reject(abortError()); };
      signal?.addEventListener('abort', stop, { once: true });
      picture.onload = () => { signal?.removeEventListener('abort', stop); resolve(picture); };
      picture.onerror = () => { signal?.removeEventListener('abort', stop); reject(new Error('Could not decode the page.')); };
      picture.src = url;
    });
    return { drawable: img, release: () => {} };
  } finally { URL.revokeObjectURL(url); }
}

/**
 * Scale a page down to a small JPEG. `source` is a decoded <img>, bitmap or
 * canvas, or the page's image Blob. Returns { blob, width, height } with the
 * page's own size, or null when the page cannot be drawn.
 */
export async function makePageThumbnail(source, { signal, maxWidth = 340, maxHeight = 224, quality = .72 } = {}) {
  check(signal);
  let decoded, canvas;
  try {
    let drawable = source;
    if (typeof Blob !== 'undefined' && source instanceof Blob) {
      if (!source.size || source.size > 48 * MiB) return null;
      decoded = await decodeBlob(source, signal);
      if (!decoded) return null;
      drawable = decoded.drawable;
    }
    check(signal);
    const width = drawable?.naturalWidth || drawable?.width, height = drawable?.naturalHeight || drawable?.height;
    if (!(width > 0) || !(height > 0) || typeof document === 'undefined') return null;
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return null;
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(drawable, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    check(signal);
    return blob && blob.type === 'image/jpeg' && blob.size > 0 && blob.size <= MAX_BYTES ? { blob, width, height } : null;
  } finally {
    if (decoded) decoded.release(decoded.drawable);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

/**
 * Makes thumbnails from page Blobs in a background worker (thumb-worker.js),
 * so decoding a large page never stalls the reader. One job at a time; the
 * worker stops after `idleMs` without work. `make` resolves with
 * { blob, width, height }, or null when the page could not be made there
 * (`unsupported` then tells whether this device can use the worker at all).
 */
export function createThumbnailWorker({ factory = () => new Worker(new URL('thumb-worker.js', document.baseURI), { type: 'module' }), idleMs = 20000, timeoutMs = 15000 } = {}) {
  let worker = null, unsupported = false, nextId = 1, idleTimer, chain = Promise.resolve(), timeouts = 0;
  const jobs = new Map();
  const finishAll = () => { for (const job of jobs.values()) job.finish(null); jobs.clear(); };
  function stop() {
    clearTimeout(idleTimer); idleTimer = undefined;
    const current = worker; worker = null;
    if (current) { current.onmessage = current.onerror = current.onmessageerror = null; try { current.terminate(); } catch { /* Already stopped. */ } }
    finishAll();
  }
  function start() {
    if (worker || unsupported) return worker;
    try { worker = factory(); } catch { worker = null; }
    if (!worker) { unsupported = true; return null; }
    worker.onmessage = event => {
      const { id, blob, width, height, unsupported: cannot } = event.data || {};
      if (cannot) { unsupported = true; stop(); return; }
      timeouts = 0;
      jobs.get(id)?.finish(blob instanceof Blob && blob.size > 0 && blob.size <= MAX_BYTES ? { blob, width, height } : null);
    };
    worker.onerror = worker.onmessageerror = () => { unsupported = true; stop(); };
    return worker;
  }
  function run(blob, { signal, maxWidth = 340, maxHeight = 224, quality = .72 } = {}) {
    return new Promise(resolve => {
      if (signal?.aborted || unsupported || !(blob instanceof Blob) || !blob.size || blob.size > 48 * MiB) { resolve(null); return; }
      const current = start(); if (!current) { resolve(null); return; }
      clearTimeout(idleTimer); idleTimer = undefined;
      const id = nextId++;
      let timer;
      const finish = value => {
        if (!jobs.has(id)) return; jobs.delete(id); clearTimeout(timer); signal?.removeEventListener('abort', cancel);
        if (!jobs.size && worker) idleTimer = setTimeout(stop, idleMs);
        resolve(value);
      };
      const cancel = () => finish(null);
      jobs.set(id, { finish });
      // A worker that stopped answering is replaced for the next page; one
      // that never answers twice in a row is not used again.
      timer = setTimeout(() => { finish(null); if (++timeouts >= 2) unsupported = true; stop(); }, timeoutMs);
      signal?.addEventListener('abort', cancel, { once: true });
      try { current.postMessage({ id, blob, maxWidth, maxHeight, quality }); } catch { finish(null); }
    });
  }
  return {
    get unsupported() { return unsupported; },
    /** Thumbnail of a page Blob, made in the background (one at a time). */
    make(blob, options = {}) {
      const job = chain.then(() => run(blob, options)); chain = job.catch(() => null);
      const signal = options.signal;
      if (!signal) return job;
      // A cancelled job waiting for its turn gives up at once.
      return new Promise(resolve => {
        const cancel = () => resolve(null);
        if (signal.aborted) { resolve(null); return; }
        signal.addEventListener('abort', cancel, { once: true });
        job.then(value => { signal.removeEventListener('abort', cancel); resolve(value); }, () => { signal.removeEventListener('abort', cancel); resolve(null); });
      });
    },
    stop,
  };
}

/** Thumbnails on the device, oldest-used removed beyond `maxEntries`. */
export class PageThumbnailDisk {
  constructor({ name = 'cloudpanels-page-thumbnails-v1', maxEntries = 3000 } = {}) {
    this.name = name; this.maxEntries = maxEntries; this.opening = null; this.puts = 0;
  }
  _open() {
    if (!globalThis.indexedDB) return Promise.resolve(null);
    if (this.opening) return this.opening;
    this.opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('Thumbnail storage is unavailable.')); } }, 2500);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('thumbs')) db.createObjectStore('thumbs', { keyPath: 'key' }).createIndex('accessedAt', 'accessedAt');
      };
      request.onsuccess = () => { clearTimeout(timer); if (done) { request.result.close(); return; } done = true; request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = () => { clearTimeout(timer); if (!done) { done = true; reject(request.error); } };
    }).catch(error => { this.opening = null; throw error; });
    return this.opening;
  }
  async _transaction(mode, action) {
    const db = await this._open(); if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('thumbs', mode); let result = null;
      const timer = setTimeout(() => { try { tx.abort(); } catch {} reject(new Error('Thumbnail storage timed out.')); }, 2500);
      tx.oncomplete = () => { clearTimeout(timer); resolve(result); };
      tx.onerror = tx.onabort = () => { clearTimeout(timer); reject(tx.error || new Error('Thumbnail storage is unavailable.')); };
      action(tx.objectStore('thumbs'), value => { result = value; });
    });
  }
  get(key) {
    return this._transaction('readwrite', (store, result) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const row = request.result;
        if (!row) return;
        if (!(row.blob instanceof Blob) || row.blob.type !== 'image/jpeg' || !row.blob.size || row.blob.size > MAX_BYTES) { store.delete(key); return; }
        // Remember the use now and then, not on every look.
        if (!(row.accessedAt > Date.now() - 6 * 3600 * 1000)) store.put({ ...row, accessedAt: Date.now() });
        result(row.blob);
      };
    });
  }
  async put(key, blob) {
    await this._transaction('readwrite', store => { store.put({ key, blob, size: blob.size, accessedAt: Date.now() }); });
    if (++this.puts % 25 === 1) await this.trim();
  }
  trim() {
    return this._transaction('readwrite', store => {
      const counting = store.count();
      counting.onsuccess = () => {
        let extra = counting.result - this.maxEntries;
        if (extra <= 0) return;
        extra += Math.ceil(this.maxEntries * .05);
        const cursor = store.index('accessedAt').openCursor();
        cursor.onsuccess = () => { const at = cursor.result; if (!at || extra-- <= 0) return; at.delete(); at.continue(); };
      };
    });
  }
  clear() { return this._transaction('readwrite', store => store.clear()); }
}

/** Page thumbnails kept in memory for this session and on the device. */
export class PageThumbnails {
  constructor({ disk, make = makePageThumbnail, maxMemory = 400 } = {}) {
    this.disk = disk === null ? null : disk || new PageThumbnailDisk();
    this.make = make; this.maxMemory = maxMemory; this.memory = new Map();
  }
  _key(comicKey, index) { return `${comicKey}#${index}`; }
  _remember(key, blob) {
    this.memory.delete(key); this.memory.set(key, blob);
    while (this.memory.size > this.maxMemory) this.memory.delete(this.memory.keys().next().value);
  }
  has(comicKey, index) { return this.memory.has(this._key(comicKey, index)); }
  async get(comicKey, index) {
    if (!comicKey || !Number.isInteger(index) || index < 0) return null;
    const key = this._key(comicKey, index), hit = this.memory.get(key);
    if (hit) { this._remember(key, hit); return hit; }
    let blob = null;
    try { blob = this.disk ? await this.disk.get(key) : null; } catch { blob = null; }
    if (blob instanceof Blob && blob.size) { this._remember(key, blob); return blob; }
    return null;
  }
  async save(comicKey, index, blob) {
    if (!comicKey || !Number.isInteger(index) || index < 0 || !(blob instanceof Blob) || !blob.size) return;
    const key = this._key(comicKey, index); this._remember(key, blob);
    try { await this.disk?.put(key, blob); } catch { /* Memory only. */ }
  }
  /** Forget every page thumbnail (Settings → Clear thumbnails). */
  async clear() {
    this.memory.clear();
    try { await this.disk?.clear(); } catch { /* Nothing stored. */ }
  }
  /** Make (or reuse) the thumbnail of page `index` from a decoded page or its Blob. */
  async from(comicKey, index, source, { signal } = {}) {
    const existing = await this.get(comicKey, index); if (existing) return existing;
    check(signal);
    const made = await this.make(source, { signal });
    check(signal);
    if (!made?.blob) return null;
    await this.save(comicKey, index, made.blob);
    return made.blob;
  }
}
