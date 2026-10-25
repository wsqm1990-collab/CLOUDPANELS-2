// Comics saved on this device for reading without a connection. Files are kept
// whole in IndexedDB (one record per comic) and read back by byte range.
const DB_NAME = 'cloudpanels-offline', STORE = 'files', VERSION = 1;
const CHUNK = 4 * 1024 * 1024;

function request(value) {
  return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
}

export class OfflineLibrary {
  constructor() { this.ids = new Map(); this.db = null; this.jobs = new Map(); this.listeners = new Set(); }
  async init() {
    if (typeof indexedDB === 'undefined') return this;
    try {
      this.db = await new Promise((resolve, reject) => {
        const open = indexedDB.open(DB_NAME, VERSION);
        open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE, { keyPath: 'id' }); };
        open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
      });
      const rows = await this._tx('readonly', store => request(store.getAll()));
      for (const row of rows || []) if (row?.id && row.blob instanceof Blob) this.ids.set(row.id, { size: row.blob.size, savedAt: row.savedAt || 0 });
    } catch { this.db = null; }
    return this;
  }
  get available() { return Boolean(this.db); }
  has(id) { return this.ids.has(id); }
  downloading(id) { return this.jobs.get(id) || null; }
  get totalBytes() { let sum = 0; for (const row of this.ids.values()) sum += row.size; return sum; }
  onChange(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  _emit(id) { for (const listener of this.listeners) { try { listener(id); } catch {} } }
  _tx(mode, action) {
    if (!this.db) return Promise.reject(new Error('Offline storage is unavailable.'));
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, mode); let result;
      Promise.resolve(action(tx.objectStore(STORE))).then(value => { result = value; }, reject);
      tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Storage aborted.'));
    });
  }
  async get(id) {
    if (!this.ids.has(id)) return null;
    const row = await this._tx('readonly', store => request(store.get(id)));
    return row?.blob instanceof Blob ? row.blob : null;
  }
  async put(id, blob, name) {
    if (navigator.storage?.persist) { try { await navigator.storage.persist(); } catch {} }
    await this._tx('readwrite', store => request(store.put({ id, blob, name, savedAt: Date.now() })));
    this.ids.set(id, { size: blob.size, savedAt: Date.now() }); this._emit(id);
  }
  async remove(id) {
    this.jobs.get(id)?.controller.abort();
    if (!this.ids.has(id)) return;
    await this._tx('readwrite', store => request(store.delete(id)));
    this.ids.delete(id); this._emit(id);
  }
  /** Download a whole comic from its source (for example MEGA) and keep it. */
  download(id, source, name) {
    if (this.jobs.has(id)) return this.jobs.get(id).promise;
    const controller = new AbortController();
    const job = { controller, loaded: 0, total: source.size, promise: null };
    job.promise = (async () => {
      const parts = [];
      try {
        for (let start = 0; start < source.size; start += CHUNK) {
          controller.signal.throwIfAborted();
          const end = Math.min(source.size, start + CHUNK);
          parts.push(await source.read(start, end, { signal: controller.signal }));
          job.loaded = end; this._emit(id);
        }
        controller.signal.throwIfAborted();
        await this.put(id, new Blob(parts), name);
        return true;
      } finally { this.jobs.delete(id); parts.length = 0; this._emit(id); }
    })();
    this.jobs.set(id, job); this._emit(id);
    return job.promise;
  }
  /** A reader source backed by the saved file. */
  async source(id, name) {
    const blob = await this.get(id);
    if (!blob) return null;
    return { name, size: blob.size, offline: true, async read(start, end, { signal } = {}) {
      signal?.throwIfAborted();
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > blob.size) throw new Error('Invalid file range.');
      const bytes = new Uint8Array(await blob.slice(start, end).arrayBuffer());
      signal?.throwIfAborted(); return bytes;
    } };
  }
}
