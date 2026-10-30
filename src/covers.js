import { openComic, archiveCover } from './reader.js';

const MiB = 1024 * 1024;
const ALLOWED = new Set(['cbz', 'zip', 'jpg', 'jpeg', 'png', 'webp', 'cbr', 'rar', 'cbt', 'tar']);
// RAR/TAR covers come from the start of the file only (see archiveCover).
const PARTIAL = new Set(['cbr', 'rar', 'cbt', 'tar']);
const MAX_THUMB_BYTES = 512 * 1024;
const abortError = () => new DOMException('Cover loading cancelled.', 'AbortError');
const check = signal => { if (signal?.aborted) throw abortError(); };
const budget = (value, fallback, maximum) => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, maximum) : fallback;

/** File identity only: edited titles, metadata, and reading progress do not invalidate covers. */
export function coverCacheId(comic) {
  if (!comic || !['mega', 'local', 'demo'].includes(comic.source) || typeof comic.id !== 'string' || !/^[a-z][a-z0-9_-]*:[A-Za-z0-9:_-]{1,180}$/i.test(comic.id)
    || !Number.isSafeInteger(comic.size) || comic.size <= 0 || typeof comic.name !== 'string' || !comic.name || comic.name.length > 1024 || /[\u0000-\u001f\u007f]/.test(comic.name)) throw new TypeError('Invalid comic cover identity.');
  // v2 for RAR/TAR: earlier covers could show a page other than the first.
  const version = /\.(?:cbr|rar|cbt|tar)$/i.test(comic.name) ? 'cloudpanels-cover-v2' : 'cloudpanels-cover-v1';
  return JSON.stringify([version, comic.source, comic.id, comic.size, comic.name]);
}

/** Thumbnail pixels remain local. No edition or full-resolution page is persisted. */
export async function thumbnailCover(blob, { signal } = {}) {
  check(signal);
  if (!(blob instanceof Blob) || blob.size > 48 * MiB || !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) return null;
  let image, objectURL, canvas;
  try {
    if (typeof globalThis.createImageBitmap === 'function') image = await globalThis.createImageBitmap(blob);
    else if (typeof globalThis.Image === 'function') {
      objectURL = URL.createObjectURL(blob);
      image = await new Promise((resolve, reject) => {
        const img = new Image();
        const stop = () => { img.src = ''; reject(abortError()); };
        signal?.addEventListener('abort', stop, { once: true });
        const done = () => signal?.removeEventListener('abort', stop);
        img.onload = () => { done(); resolve(img); };
        img.onerror = () => { done(); reject(new Error('Could not decode the cover.')); };
        img.src = objectURL;
        if (signal?.aborted) { done(); stop(); }
      });
    } else return null;
    check(signal);
    const width = image.width || image.naturalWidth, height = image.height || image.naturalHeight;
    if (!width || !height || width > 16384 || height > 16384 || width * height > 24_000_000) return null;
    const scale = Math.min(1, 360 / width, 540 / height);
    canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return null;
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.68));
    check(signal);
    return result?.type === 'image/jpeg' && result.size <= MAX_THUMB_BYTES ? result : null;
  } finally {
    image?.close?.();
    if (objectURL) URL.revokeObjectURL(objectURL);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

class IndexedCoverDisk {
  constructor(maxBytes) { this.maxBytes = maxBytes; this.opening = null; }
  _open() {
    if (!globalThis.indexedDB) return Promise.resolve(null);
    if (this.opening) return this.opening;
    this.opening = new Promise((resolve, reject) => {
      const request = indexedDB.open('cloudpanels-thumbnails-v1', 1);
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('Cover storage is unavailable.')); } }, 1800);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('thumbnails')) request.result.createObjectStore('thumbnails', { keyPath: 'key' }); };
      request.onsuccess = () => { clearTimeout(timer); if (done) { request.result.close(); return; } done = true; request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = () => { clearTimeout(timer); if (!done) { done = true; reject(request.error); } };
    });
    return this.opening;
  }
  async _transaction(action) {
    const db = await this._open(); if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('thumbnails', 'readwrite'); let result = null;
      const timer = setTimeout(() => { try { tx.abort(); } catch {} reject(new Error('Cover storage timed out.')); }, 1800);
      tx.oncomplete = () => { clearTimeout(timer); resolve(result); };
      tx.onerror = tx.onabort = () => { clearTimeout(timer); reject(tx.error || new Error('Cover storage is unavailable.')); };
      action(tx.objectStore('thumbnails'), value => { result = value; });
    });
  }
  get(key) {
    return this._transaction((store, result) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const row = request.result;
        if (!row || !(row.blob instanceof Blob) || row.blob.type !== 'image/jpeg' || row.blob.size > MAX_THUMB_BYTES || row.size !== row.blob.size) { if (row) store.delete(key); return; }
        store.put({ ...row, accessedAt: Date.now() }); result(row.blob);
      };
    });
  }
  put(key, blob) {
    if (!this.maxBytes || blob.size > this.maxBytes) return Promise.resolve();
    return this._transaction(store => {
      const request = store.getAll();
      request.onsuccess = () => {
        let used = blob.size, count = 1;
        const records = request.result.filter(row => row.key !== key).sort((a, b) => b.accessedAt - a.accessedAt);
        for (const row of records) {
          const valid = Number.isSafeInteger(row.size) && row.size > 0 && row.size <= MAX_THUMB_BYTES;
          if (!valid || used + row.size > this.maxBytes || count >= 2048) store.delete(row.key);
          else { used += row.size; count++; }
        }
        store.put({ key, blob, size: blob.size, accessedAt: Date.now() });
      };
    });
  }
  clear() { return this._transaction(store => store.clear()); }
  async close() { try { (await this.opening)?.close(); } catch {} }
}

async function isZip(source, signal) {
  try { const head = await source.read(0, Math.min(source.size, 4), { signal }); return head[0] === 0x50 && head[1] === 0x4b; } catch { return false; }
}

/** Lazy, deduplicated cover loading. The UI owns object URLs and their revocation. */
export class CoverService {
  constructor({ getSource, maxConcurrent = 1, maxMemoryBytes = 12 * MiB, maxDiskBytes = 24 * MiB,
    openComic: open = openComic, thumbnail = thumbnailCover, disk, allowFull } = {}) {
    this.getSource = getSource; this.openComic = open; this.thumbnail = thumbnail;
    // Formats read as a whole (CBR, PDF…) may still get covers when the file is
    // already on the device, because no download is needed.
    this.allowFull = typeof allowFull === 'function' ? allowFull : () => false;
    this.maxConcurrent = Math.max(1, Math.min(2, Math.floor(maxConcurrent) || 1));
    this.maxMemoryBytes = budget(maxMemoryBytes, 12 * MiB, 24 * MiB);
    this.maxDiskBytes = budget(maxDiskBytes, 24 * MiB, 48 * MiB);
    this.disk = disk === null ? null : disk || new IndexedCoverDisk(this.maxDiskBytes);
    this.memory = new Map(); this.memoryBytes = 0; this.jobs = new Map(); this.queue = [];
    this.running = 0; this.busy = false; this.closed = false; this.epoch = 0; this.diskQueue = Promise.resolve();
    this.fresh = new Map(); // covers made on this device, to share through MEGA
  }
  _key(comic) { try { return coverCacheId(comic); } catch { return null; } }
  _memoryGet(key) {
    const row = this.memory.get(key); if (!row) return null;
    this.memory.delete(key); this.memory.set(key, row); return row;
  }
  _remember(key, blob) {
    const previous = this.memory.get(key);
    if (previous) { this.memoryBytes -= previous.size; this.memory.delete(key); }
    if (blob.size > this.maxMemoryBytes) return;
    this.memory.set(key, blob); this.memoryBytes += blob.size;
    while (this.memoryBytes > this.maxMemoryBytes || this.memory.size > 512) { const oldest = this.memory.keys().next().value; this.memoryBytes -= this.memory.get(oldest).size; this.memory.delete(oldest); }
  }
  _disk(action, force = false) {
    if (!this.disk || (!force && !this.maxDiskBytes)) return Promise.resolve(null);
    const pending = this.diskQueue.then(action).catch(() => null);
    this.diskQueue = pending.then(() => {}); return pending;
  }
  async peek(comic) {
    if (this.closed) return null;
    const key = this._key(comic); if (!key) return null;
    const hit = this._memoryGet(key); if (hit) return hit;
    const epoch = this.epoch;
    const blob = await this._disk(() => this.disk.get(key));
    if (this.closed || epoch !== this.epoch || !(blob instanceof Blob) || !blob.size || blob.type !== 'image/jpeg' || blob.size > MAX_THUMB_BYTES) return null;
    this._remember(key, blob); return blob;
  }
  async get(comic, { signal, priority = 'visible' } = {}) {
    check(signal);
    if (this.closed) return null;
    const key = this._key(comic); if (!key) return null;
    const cached = await this.peek(comic) || this._memoryGet(key); check(signal);
    if (cached || this.closed) return cached;
    const format = String(comic.format || comic.name.split('.').pop()).toLowerCase();
    // A PDF cover must be seeded from a page already opened by the reader. It
    // must never trigger a whole-PDF download merely to decorate the library.
    if ((!ALLOWED.has(format) && !this.allowFull(comic)) || typeof this.getSource !== 'function') return null;
    let job = this.jobs.get(key);
    if (!job || job.controller.signal.aborted) {
      job = { key, comic, controller: new AbortController(), consumers: new Set(), priority, epoch: this.epoch, started: false };
      this.jobs.set(key, job); this.queue.push(job);
    } else if (priority === 'foreground') job.priority = priority;
    const promise = new Promise((resolve, reject) => {
      const consumer = { resolve, reject, signal, abort: null };
      consumer.abort = () => {
        signal?.removeEventListener('abort', consumer.abort); job.consumers.delete(consumer); reject(abortError());
        if (!job.consumers.size) { job.controller.abort(); if (this.jobs.get(key) === job) this.jobs.delete(key); this.queue = this.queue.filter(item => item !== job); }
      };
      job.consumers.add(consumer); signal?.addEventListener('abort', consumer.abort, { once: true });
      if (signal?.aborted) consumer.abort();
    });
    this._drain(); return promise;
  }
  setForegroundBusy(value) { this.busy = Boolean(value); if (!this.busy) this._drain(); }
  _drain() {
    while (!this.closed && this.running < this.maxConcurrent) {
      const index = this.queue.findIndex(job => job.consumers.size && (!this.busy || job.priority === 'foreground'));
      if (index < 0) return;
      const [job] = this.queue.splice(index, 1); job.started = true; this.running++;
      this._load(job).then(blob => this._finish(job, null, blob), error => this._finish(job, error));
    }
  }
  async _load(job) {
    const signal = job.controller.signal; let book;
    try {
      check(signal);
      const source = await this.getSource(job.comic, { signal }); check(signal);
      if (!source) return null;
      const format = String(job.comic.format || job.comic.name?.split('.').pop() || '').toLowerCase();
      let page = null;
      if (PARTIAL.has(format)) {
        page = await archiveCover(source, { signal }); check(signal);
        // A ".cbr" that is really a ZIP is read like a CBZ below.
      }
      if (!page && (!PARTIAL.has(format) || this.allowFull(job.comic) || await isZip(source, signal))) {
        book = await this.openComic(source, { signal }); check(signal);
        page = await book.page(0, { signal }); check(signal);
      }
      if (!page) return null;
      const blob = await this.thumbnail(page, { signal }); check(signal);
      if (!(blob instanceof Blob) || !blob.size || blob.type !== 'image/jpeg' || blob.size > MAX_THUMB_BYTES || job.epoch !== this.epoch || this.closed) return null;
      this._remember(job.key, blob); this.fresh.set(job.key, blob);
      await this._disk(() => job.epoch === this.epoch && !this.closed ? this.disk.put(job.key, blob) : null);
      check(signal); return blob;
    } catch (error) { if (signal.aborted || error?.name === 'AbortError') throw abortError(); return null; }
    finally { try { await book?.close(); } catch {} }
  }
  _finish(job, error, blob = null) {
    this.running = Math.max(0, this.running - 1); if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
    for (const consumer of job.consumers) { consumer.signal?.removeEventListener('abort', consumer.abort); error ? consumer.reject(error) : consumer.resolve(blob); }
    job.consumers.clear(); this._drain();
  }
  // `thumbnail`: the cover already made from this page (by the reader's
  // background worker), so nothing is decoded here.
  async seed(comic, pageBlob, { thumbnail } = {}) {
    if (this.closed) return null;
    const key = this._key(comic); if (!key) return null;
    const epoch = this.epoch;
    try {
      const blob = thumbnail instanceof Blob && thumbnail.size ? thumbnail : await this.thumbnail(pageBlob);
      if (this.closed || epoch !== this.epoch || !(blob instanceof Blob) || !blob.size || blob.type !== 'image/jpeg' || blob.size > MAX_THUMB_BYTES) return null;
      this._remember(key, blob); this.fresh.set(key, blob);
      await this._disk(() => epoch === this.epoch && !this.closed ? this.disk.put(key, blob) : null);
      return blob;
    } catch { return null; }
  }
  /** Covers made here since the last share, as { key: base64 JPEG }. */
  async takeFresh(limit = 300) {
    const out = {};
    for (const [key, blob] of [...this.fresh].slice(-limit)) {
      try { const bytes = new Uint8Array(await blob.arrayBuffer()); let text = ''; for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); out[key] = btoa(text); } catch {}
    }
    return out;
  }
  clearFresh(keys) { for (const key of keys) this.fresh.delete(key); }
  /** Store covers received from another device (only the missing ones). */
  async importShared(map) {
    let added = 0;
    for (const [key, value] of Object.entries(map || {})) {
      if (this.closed || typeof key !== 'string' || typeof value !== 'string' || value.length > MAX_THUMB_BYTES * 1.4) continue;
      if (this.memory.has(key)) continue;
      const existing = await this._disk(() => this.disk.get(key));
      if (existing instanceof Blob && existing.size) continue;
      try {
        const raw = atob(value), bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        if (bytes[0] !== 0xff || bytes[1] !== 0xd8) continue;
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        this._remember(key, blob); await this._disk(() => this.disk.put(key, blob)); added++;
      } catch {}
    }
    return added;
  }
  _stop() {
    this.epoch++;
    for (const job of this.jobs.values()) {
      job.controller.abort();
      for (const consumer of job.consumers) { consumer.signal?.removeEventListener('abort', consumer.abort); consumer.reject(abortError()); }
      job.consumers.clear();
    }
    this.jobs.clear(); this.queue = []; this.memory.clear(); this.memoryBytes = 0;
  }
  async clear() { this._stop(); await this._disk(() => this.disk.clear(), true); }
  async close() { if (this.closed) return; this.closed = true; this._stop(); await this.diskQueue; await this.disk?.close?.(); }
}
