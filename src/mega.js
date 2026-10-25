import { Storage, File as MEGAFile, API } from './megajs-browser.js';

export const MAX_MEGA_READ = 48 * 1024 * 1024;
export const MAX_LIBRARY_FILES = 50000;
const FORMATS = new Set(['cbz', 'zip', 'pdf', 'jpg', 'jpeg', 'png', 'webp', 'cbr', 'rar', 'cb7', '7z', 'cbt', 'tar']);
const READABLE = new Set(['cbz', 'zip', 'pdf', 'jpg', 'jpeg', 'png', 'webp']);

export class MegaConnectionError extends Error {
  constructor(message, code = 'MEGA_ERROR') { super(message); this.name = 'MegaConnectionError'; this.code = code; }
}

function cancelled() { return new DOMException('Operation cancelled.', 'AbortError'); }
function checkSignal(signal) { if (signal?.aborted) throw cancelled(); }
function safeName(value, fallback = 'Untitled') {
  return (typeof value === 'string' ? value : fallback).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 1024) || fallback;
}
function safeError(error) {
  if (error?.name === 'AbortError') return cancelled();
  if (error instanceof MegaConnectionError) return error;
  const message = String(error?.message ?? error ?? '').toLowerCase();
  const code = Number(error?.code ?? error?.errno);
  if (code === -26 || /emfarequired|two.factor|multi.factor|\b-26\b/.test(message)) return new MegaConnectionError('Enter the current two-factor authentication code from your authenticator app.', 'MFA_REQUIRED');
  if (code === -16 || /blocked|suspended|\b-16\b/.test(message)) return new MegaConnectionError('MEGA has temporarily blocked this account or request. Check your account in the official MEGA app.', 'ACCOUNT_BLOCKED');
  if (code === -17 || /over.?quota|bandwidth|transfer quota|\b-17\b/.test(message)) return new MegaConnectionError('Your MEGA transfer quota has been reached. Try again later.', 'QUOTA');
  if (code === -15 || /\besid\b|invalid session|session expired|\b-15\b/.test(message)) return new MegaConnectionError('Your saved MEGA session has expired. Sign in to MEGA again.', 'SESSION_EXPIRED');
  if (code === -9 || /not found|enoent|\b-9\b/.test(message)) return new MegaConnectionError('This MEGA item is no longer available. Reconnect your library.', 'NOT_FOUND');
  if (code === -11 || /access denied|eaccess|\b-11\b/.test(message)) return new MegaConnectionError('MEGA refused access. Check the account, folder link and decryption key.', 'ACCESS');
  if (code === -2 || /password|credentials|login|\b-2\b/.test(message)) return new MegaConnectionError('MEGA could not sign you in. Check your email, password and two-factor code.', 'LOGIN');
  return new MegaConnectionError('Could not connect to MEGA. Check your connection and try again.', 'NETWORK');
}

/** Accept only complete, official MEGA HTTPS share URLs. Catalogs never retain keys. */
export function validateMegaLink(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new MegaConnectionError('Paste a complete MEGA file or folder link, including its decryption key.', 'LINK'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !['mega.nz', 'mega.co.nz', 'www.mega.nz', 'www.mega.co.nz'].includes(host) || url.username || url.password || (url.port && url.port !== '443') || url.search) {
    throw new MegaConnectionError('Use an HTTPS link from mega.nz or mega.co.nz.', 'LINK');
  }
  let match = /^\/(file|folder)\/([A-Za-z0-9_-]{8})\/?$/.exec(url.pathname);
  if (match) {
    const keyLength = match[1] === 'folder' ? 22 : 43;
    if (!new RegExp(`^#[A-Za-z0-9_-]{${keyLength}}$`).test(url.hash)) throw new MegaConnectionError('Include the decryption key after #. For a subfolder link, copy the main shared-folder link from MEGA.', 'LINK_KEY');
    return { url: `https://${host.replace(/^www\./, '')}/${match[1]}/${match[2]}${url.hash}`, kind: match[1], downloadId: match[2] };
  }
  if (url.pathname === '/' || url.pathname === '') {
    match = /^#(F!|!)([A-Za-z0-9_-]{8})!([A-Za-z0-9_-]+)$/.exec(url.hash);
    if (match && match[3].length === (match[1] === 'F!' ? 22 : 43)) return { url: `https://${host.replace(/^www\./, '')}/${url.hash}`, kind: match[1] === 'F!' ? 'folder' : 'file', downloadId: match[2] };
  }
  throw new MegaConnectionError('Paste a complete MEGA file or folder link, including its decryption key.', 'LINK');
}

// This envelope is only for an explicitly opted-in, encrypted native vault.
// It is never part of the catalog, settings, metadata backup or browser storage.
function rememberedSession(value) {
  const invalid = () => new MegaConnectionError('The saved MEGA connection is invalid. Sign in to MEGA again.', 'SESSION_RECORD');
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) throw invalid();
  if (value.mode === 'link') {
    if (Object.keys(value).some(key => !['version', 'mode', 'url'].includes(key)) || typeof value.url !== 'string' || value.url.length > 2048) throw invalid();
    try { return { version: 1, mode: 'link', url: validateMegaLink(value.url).url }; }
    catch { throw invalid(); }
  }
  if (value.mode !== 'account' || Object.keys(value).some(key => !['version', 'mode', 'key', 'sid', 'user', 'name'].includes(key)) ||
      typeof value.key !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(value.key) ||
      typeof value.sid !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(value.sid) ||
      typeof value.user !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(value.user) ||
      typeof value.name !== 'string' || value.name.length > 1024 || /[\u0000-\u001f\u007f]/.test(value.name)) throw invalid();
  return { version: 1, mode: 'account', key: value.key, sid: value.sid, user: value.user, name: value.name };
}

export function validateMegaRange(size, start, end) {
  if (![size, start, end].every(Number.isSafeInteger) || size < 0 || start < 0 || end < start || end > size) throw new MegaConnectionError('The requested page has an invalid byte range.', 'RANGE');
  if (end - start > MAX_MEGA_READ) throw new MegaConnectionError('This page is too large to read safely in this browser.', 'READ_LIMIT');
}

function waitAbortable(promise, signal, onCancel) {
  checkSignal(signal);
  if (!signal) return Promise.resolve(promise);
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (fn, value) => { if (finished) return; finished = true; signal.removeEventListener('abort', abort); fn(value); };
    const abort = () => { try { onCancel?.(); } catch {} finish(reject, cancelled()); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
    if (signal.aborted) abort();
  });
}

/** Read-only facade. Catalog descriptors never expose keys, sessions or SDK objects. */
const SYNC_FOLDER = 'CloudPanels', SYNC_FILE = 'cloudpanels-biblioteca.json', COVERS_FILE = 'cloudpanels-capas.json', SYNC_LIMIT = 16 * 1024 * 1024;
const OUR_FILES = new Set([SYNC_FILE, COVERS_FILE]);

export class MegaConnection {
  constructor({ sdk = { Storage, File: MEGAFile, API }, maxConcurrentReads = 2, logoutTimeoutMs = 3000 } = {}) {
    this._sdk = sdk;
    this._maxConcurrentReads = Math.max(1, Math.min(2, Number(maxConcurrentReads) || 2));
    this._nodes = new Map(); this._parents = new Map(); this._rootNodes = [];
    this._storage = null; this._streams = new Set(); this._waiters = [];
    this._activeReads = 0; this._generation = 0; this.mode = null;
    this._connectionController = null;
    this._isolatedAPI = null; this._rememberedLinkURL = null;
    this._closingStorages = new WeakMap();
    this._logoutTimeoutMs = Math.min(4000, Math.max(10, Number(logoutTimeoutMs) || 3000));
  }
  get connected() { return this._rootNodes.length > 0; }

  async login({ email, password, secondFactorCode = '' } = {}, { signal } = {}) {
    checkSignal(signal);
    const address = String(email ?? '').trim();
    if (!address || !address.includes('@') || typeof password !== 'string' || !password) throw new MegaConnectionError('Enter your MEGA email and password.', 'LOGIN_INPUT');
    const mfa = String(secondFactorCode).trim();
    if (mfa && !/^\d{6}$/.test(mfa)) throw new MegaConnectionError('The two-factor code must contain six digits.', 'MFA_INPUT');
    const generation = this._generation + 1;
    await this.disconnect();
    if (generation !== this._generation) throw cancelled();
    checkSignal(signal);
    const connectionController = new AbortController();
    this._connectionController = connectionController;
    let storage;
    try {
      // userAgent:null avoids forbidden request headers in browsers. keepalive:false
      // fetches the tree once and does not poll for account mutations.
      storage = new this._sdk.Storage({ email: address, password, ...(mfa ? { secondFactorCode: mfa } : {}), keepalive: false, userAgent: null, fetch: this._connectionFetch(connectionController.signal) });
      await waitAbortable(storage.ready, signal, () => { connectionController.abort(); this._closeStorage(storage); });
      if (generation !== this._generation) { this._closeStorage(storage); throw cancelled(); }
      checkSignal(signal);
      if (!storage.root?.directory) throw new MegaConnectionError('Your MEGA Cloud Drive could not be loaded. Try again.', 'TREE');
      this._storage = storage; this._isolatedAPI = storage.api ?? null; this._rootNodes = [storage.root]; this.mode = 'account';
      this._register(storage.root, null);
      return this.roots();
    } catch (error) { connectionController.abort(); if (storage) this._closeStorage(storage); throw safeError(error); }
    finally { this._scrubLoginOptions(storage); }
  }

  async connectLink(value, options = {}) { return this._connectLink(value, options, true); }

  async _connectLink(value, { signal } = {}, revoke = true) {
    checkSignal(signal);
    const parsed = validateMegaLink(value);
    const generation = this._generation + 1;
    await this.disconnect({ revoke });
    if (generation !== this._generation) throw cancelled();
    checkSignal(signal);
    const connectionController = new AbortController();
    this._connectionController = connectionController;
    let file;
    try {
      const api = this._sdk.API ? new this._sdk.API(false, { userAgent: null, fetch: this._connectionFetch(connectionController.signal) }) : undefined;
      file = this._sdk.File.fromURL(parsed.url, api ? { api } : undefined);
      await waitAbortable(file.loadAttributes(), signal, () => { connectionController.abort(); try { file.api?.close?.(); } catch {} });
      if (generation !== this._generation) throw cancelled();
      checkSignal(signal);
      if (!file.name || (file.directory && !Array.isArray(file.children))) throw new MegaConnectionError('The folder link could not be decrypted. Copy its complete link and key from MEGA.', 'LINK_KEY');
      this._isolatedAPI = api ?? file.api ?? null;
      this._rootNodes = [file]; this.mode = 'link'; this._register(file, null); this._rememberedLinkURL = parsed.url;
      return this.roots();
    } catch (error) { connectionController.abort(); throw safeError(error); }
  }

  /** Return a minimal secret envelope only when the native caller opts in. */
  exportRememberedSession() {
    if (!this.connected) return null;
    if (this.mode === 'link') return rememberedSession({ version: 1, mode: 'link', url: this._rememberedLinkURL });
    if (this.mode !== 'account' || typeof this._storage?.toJSON !== 'function') return null;
    let value;
    try { value = this._storage.toJSON(); }
    catch { throw new MegaConnectionError('This MEGA connection could not be remembered. Sign in again.', 'SESSION_RECORD'); }
    // Never forward SDK options: older SDK builds may retain login credentials,
    // a caller transport, or fields that are unrelated to session restoration.
    return rememberedSession({ version: 1, mode: 'account', key: value?.key, sid: value?.sid,
      user: value?.user, name: safeName(value?.name, '') });
  }

  async restoreRememberedSession(value, { signal } = {}) {
    checkSignal(signal);
    const record = rememberedSession(value);
    if (record.mode === 'link') return this._connectLink(record.url, { signal }, false);
    if (typeof this._sdk.Storage.fromJSON !== 'function') throw new MegaConnectionError('This MEGA connection cannot be restored. Sign in to MEGA again.', 'SESSION_RECORD');
    const generation = this._generation + 1;
    await this.suspend();
    if (generation !== this._generation) throw cancelled();
    checkSignal(signal);
    const connectionController = new AbortController(); this._connectionController = connectionController;
    const cancel = () => connectionController.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) connectionController.abort();
    let storage;
    try {
      // fromJSON mutates its options. Reconstruct a fresh, allowlisted record;
      // never trust saved autologin, host, fetch, email or password options.
      storage = this._sdk.Storage.fromJSON({ key: record.key, sid: record.sid, user: record.user, name: record.name,
        options: { keepalive: false, userAgent: null, fetch: this._connectionFetch(connectionController.signal) } });
      if (!storage?.api || typeof storage.reload !== 'function') throw new MegaConnectionError('The saved MEGA connection could not be loaded. Sign in again.', 'SESSION_RECORD');
      storage.api.fetch = this._connectionFetch(connectionController.signal);
      await waitAbortable(storage.ready, connectionController.signal, () => this._detachStorage(storage));
      if (generation !== this._generation) throw cancelled();
      // The pinned SDK restores the AES master key and SID but deliberately
      // leaves autoload disabled. A guarded reload fetches/decrypts its tree.
      await waitAbortable(storage.reload(true), connectionController.signal, () => this._detachStorage(storage));
      if (generation !== this._generation) throw cancelled();
      checkSignal(connectionController.signal);
      if (!storage.root?.directory) throw new MegaConnectionError('Your saved MEGA session could not load Cloud Drive. Sign in again.', 'SESSION_EXPIRED');
      storage.status = 'ready';
      this._storage = storage; this._isolatedAPI = storage.api; this._rootNodes = [storage.root]; this.mode = 'account';
      this._register(storage.root, null);
      return this.roots();
    } catch (error) {
      connectionController.abort(); this._detachStorage(storage);
      if (generation === this._generation) {
        this._storage = null; this._isolatedAPI = null; this._rootNodes = []; this.mode = null;
        this._nodes.clear(); this._parents.clear();
      }
      throw safeError(error);
    } finally { signal?.removeEventListener('abort', cancel); this._scrubLoginOptions(storage); }
  }

  /** Lock/switch profile without revoking the session held in the native vault. */
  // ---- Reading history sync -------------------------------------------------
  // A small CloudPanels file in the user's own MEGA Cloud Drive carries the
  // library, progress and preferences between devices. Account logins only.
  get canSync() { return this.mode === 'account' && Boolean(this._storage?.root?.directory); }
  // Every Cloud Drive folder that holds (or is) the CloudPanels sync folder.
  _syncFolders() {
    const root = this._storage?.root, found = new Set();
    for (const node of root?.children || []) if (node?.directory && node.name === SYNC_FOLDER) found.add(node);
    let hint = null; try { hint = globalThis.localStorage?.getItem('cloudpanels-sync-folder'); } catch {}
    const hinted = hint && this._storage?.files?.[hint];
    if (hinted?.directory && !hinted.deleted) found.add(hinted);
    const remembered = (this._syncFolderNode?.directory && this._syncFolderNode) || (this._syncFolderId && this._storage?.files?.[this._syncFolderId]);
    if (remembered?.directory && !remembered.deleted) found.add(remembered);
    for (const node of root?.children || []) if (node?.directory && (node.children || []).some(child => !child.directory && child.name === SYNC_FILE)) found.add(node);
    return [...found];
  }
  _syncFiles(folders = this._syncFolders(), name = SYNC_FILE) {
    return folders.flatMap(folder => (folder?.children || []).filter(node => node && !node.directory && node.name === name))
      .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  }
  _syncFolder() {
    const folders = this._syncFolders();
    if (!folders.length) return null;
    const newest = this._syncFiles(folders)[0];
    return (newest && folders.find(folder => folder.children?.includes(newest))) || folders[0];
  }
  async refreshTree({ signal } = {}) {
    if (!this.canSync || typeof this._storage.reload !== 'function') return;
    await waitAbortable(this._storage.reload(true), signal);
  }
  async readSyncFile({ signal, name = SYNC_FILE } = {}) {
    if (!this.canSync) return null;
    for (const file of this._syncFiles(this._syncFolders(), name)) {
      checkSignal(signal);
      if (!(file.size >= 0) || file.size > SYNC_LIMIT) continue;
      try {
        const data = await waitAbortable(file.downloadBuffer({}), signal);
        return new TextDecoder().decode(data instanceof Uint8Array ? data : new Uint8Array(data));
      } catch (error) { if (signal?.aborted) throw error; }
    }
    return null;
  }
  async writeSyncFile(text, { signal, name = SYNC_FILE } = {}) {
    if (!this.canSync) return false;
    if (!OUR_FILES.has(name)) throw new MegaConnectionError('Unknown sync file.', 'SYNC_NAME');
    const data = new TextEncoder().encode(String(text));
    if (data.length > SYNC_LIMIT) throw new MegaConnectionError('Your reading history is too large to sync.', 'SYNC_SIZE');
    let folder = this._syncFolder();
    if (!folder) {
      // Make sure the folder really does not exist (another device may have
      // created it) before creating a new one.
      try { await this.refreshTree({ signal }); } catch {}
      folder = this._syncFolder();
    }
    if (!folder) {
      folder = await waitAbortable(this._storage.root.mkdir(SYNC_FOLDER), signal);
      if (folder && !folder.name) folder.name = SYNC_FOLDER;
    }
    this._syncFolderId = folder?.nodeId || this._syncFolderId; this._syncFolderNode = folder;
    try { if (folder?.nodeId) globalThis.localStorage?.setItem('cloudpanels-sync-folder', folder.nodeId); } catch {}
    const previous = this._syncFiles(this._syncFolders(), name);
    const upload = folder.upload({ name, size: data.length }, data);
    upload.on?.('error', () => {});
    const created = await waitAbortable(upload.complete, signal);
    const remove = node => new Promise(resolve => {
      try {
        node.delete(true, error => {
          if (!error) { node.deleted = true; return resolve(); }
          try { node.delete(false, () => { node.deleted = true; resolve(); }); } catch { resolve(); }
        });
      } catch { resolve(); }
    });
    const detach = node => { const parent = node.parent || this._syncFolders().find(f => f.children?.includes(node)); if (Array.isArray(parent?.children)) { const i = parent.children.indexOf(node); if (i >= 0) parent.children.splice(i, 1); } };
    for (const old of previous) { if (old === created) continue; await remove(old); detach(old); }
    if (name !== SYNC_FILE) return true;
    // Tidy up extra CloudPanels folders left by earlier versions: they only
    // ever contained copies of this sync file, now replaced by the current one.
    for (const extra of this._syncFolders()) {
      if (extra === folder) continue;
      const others = (extra.children || []).filter(child => child.directory || !OUR_FILES.has(child.name));
      if (others.length) continue;
      await remove(extra); detach(extra);
    }
    return true;
  }

  /**
   * Upload a CBZ next to a comic and move the original to MEGA's Rubbish Bin
   * (recoverable). The original is only touched after the upload is complete
   * and has the expected size. Account logins only.
   */
  async replaceWithCbz(comicId, data, { signal } = {}) {
    if (this.mode !== 'account') throw new MegaConnectionError('Converting needs your MEGA account login (not a link).', 'READ_ONLY');
    const node = this._findNode(comicId);
    const parent = node?.parent;
    if (!node || node.directory || !parent?.directory || typeof parent.upload !== 'function') throw new MegaConnectionError('This comic is unavailable. Reconnect MEGA and try again.', 'NOT_FOUND');
    const base = safeName(node.name).replace(/\.[^.]+$/, '');
    const taken = new Set((parent.children || []).map(child => child.name));
    let name = `${base}.cbz`;
    for (let n = 2; taken.has(name) && n < 100; n++) name = `${base} (${n}).cbz`;
    const upload = parent.upload({ name, size: data.length }, data);
    upload.on?.('error', () => {});
    const created = await waitAbortable(upload.complete, signal);
    if (!created || created.size !== data.length) throw new MegaConnectionError('The converted file did not upload completely. The original was kept.', 'UPLOAD');
    await new Promise(resolve => { try { node.delete(false, () => resolve()); } catch { resolve(); } });
    const parentId = this._parents.get(comicId) ?? null;
    return this._describe(created, parentId);
  }

  async suspend() { return this.disconnect({ revoke: false }); }

  roots() { return this._rootNodes.map(node => this._describe(node, null)); }

  async children(id) {
    const node = this._findNode(id);
    if (!node?.directory) throw new MegaConnectionError('This MEGA folder is unavailable. Reconnect your library.', 'NOT_FOUND');
    const children = Array.isArray(node.children) ? node.children : [];
    return children.map(child => { this._register(child, id); return this._describe(child, id); }).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  async listComics(folderId, { signal, onProgress } = {}) {
    checkSignal(signal);
    const root = this._findNode(folderId);
    if (!root) throw new MegaConnectionError('This MEGA folder is unavailable. Reconnect your library.', 'NOT_FOUND');
    const generation = this._generation;
    const queue = [{ node: root, parentId: this._parents.get(folderId) ?? null, path: '' }];
    const visited = new Set(); const comics = []; let count = 0;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      checkSignal(signal);
      if (generation !== this._generation) throw cancelled();
      const { node, parentId, path } = queue[cursor];
      const id = this._register(node, parentId);
      if (visited.has(id)) continue;
      visited.add(id);
      if (++count > MAX_LIBRARY_FILES) throw new MegaConnectionError('This folder contains more than 50,000 items. Choose a smaller library folder.', 'LIBRARY_LIMIT');
      const name = safeName(node.name, node.directory ? 'Cloud Drive' : 'Untitled');
      if (node.directory) {
        for (const child of node.children ?? []) {
          if (queue.length > MAX_LIBRARY_FILES * 2) throw new MegaConnectionError('This library folder is too large. Choose a smaller folder.', 'LIBRARY_LIMIT');
          queue.push({ node: child, parentId: id, path: path ? `${path}/${name}` : name });
        }
      } else {
        const descriptor = this._describe(node, parentId);
        if (FORMATS.has(descriptor.format) && Number.isSafeInteger(node.size) && node.size > 0) comics.push({ ...descriptor, path: path ? `${path}/${name}` : name });
      }
      if (count % 128 === 0) {
        onProgress?.({ scanned: count, found: comics.length });
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    onProgress?.({ scanned: count, found: comics.length });
    return comics.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  }

  getSource(comic) {
    const node = this._findNode(comic?.id);
    if (!node || node.directory || !Number.isSafeInteger(node.size) || node.size <= 0) throw new MegaConnectionError('Reconnect MEGA and select this comic again.', 'NOT_FOUND');
    const generation = this._generation;
    return {
      size: node.size, name: safeName(node.name),
      read: async (start, end, { signal } = {}) => {
        checkSignal(signal);
        if (generation !== this._generation || !this.connected) throw new MegaConnectionError('Reconnect MEGA to continue reading.', 'DISCONNECTED');
        validateMegaRange(node.size, start, end);
        if (start === end) return new Uint8Array();
        await this._acquire(signal, generation);
        try {
          checkSignal(signal);
          if (generation !== this._generation) throw cancelled();
          return await this._download(node, start, end, signal);
        } catch (error) { throw safeError(error); }
        finally { this._release(); }
      }
    };
  }

  async disconnect({ revoke = true } = {}) {
    this._generation++;
    const storage = this._storage, isolatedAPI = this._isolatedAPI; this._storage = null;
    this._connectionController?.abort(); this._connectionController = null;
    for (const stream of [...this._streams]) { try { stream.emit('error', cancelled()); stream.destroy(); } catch {} }
    this._streams.clear();
    for (const waiter of this._waiters.splice(0)) waiter.reject(cancelled());
    this._nodes.clear(); this._parents.clear(); this._rootNodes = []; this.mode = null; this._isolatedAPI = null; this._rememberedLinkURL = null;
    if (revoke) await this._closeStorage(storage); else this._detachStorage(storage);
    if (!storage) { try { isolatedAPI?.close?.(); } catch {} }
  }

  _detachStorage(storage) {
    if (!storage) return;
    this._scrubLoginOptions(storage);
    // API.close only stops local listeners/timers. Storage.close sends `sml`
    // and would invalidate the remembered SID, so it is never called here.
    try { storage.api?.close?.(); } catch { /* Local cleanup only. */ }
    try { storage.status = 'closed'; } catch { /* A detached SDK object is discarded. */ }
  }

  _scrubLoginOptions(storage) {
    if (!storage) return;
    for (const options of [storage.options, storage._options]) {
      if (!options || typeof options !== 'object') continue;
      for (const key of ['password', 'secondFactorCode']) { try { delete options[key]; } catch {} }
    }
  }
  _connectionFetch(connectionSignal) {
    return (url, options = {}) => {
      // Login/tree requests use the connection lifetime. Single-connection file
      // streams carry their own AbortSignal, which their close event aborts.
      checkSignal(connectionSignal);
      let target;
      try { target = new URL(String(url)); } catch { return Promise.reject(new MegaConnectionError('MEGA returned an invalid download address.', 'ADDRESS')); }
      if (target.protocol !== 'https:' || target.username || target.password || (target.port && target.port !== '443') || !['mega.nz', 'mega.co.nz'].some(host => target.hostname === host || target.hostname.endsWith(`.${host}`))) {
        return Promise.reject(new MegaConnectionError('MEGA returned an unsupported download address.', 'ADDRESS'));
      }
      return globalThis.fetch(target.href, { ...options, signal: options.signal ?? connectionSignal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error' });
    };
  }
  _closeStorage(storage) {
    if (!storage) return Promise.resolve(false);
    if (this._closingStorages.has(storage)) return this._closingStorages.get(storage);
    this._scrubLoginOptions(storage);
    const closing = (async () => {
      // Logout must not reuse the aborted reading/login lifetime. Give only the
      // SDK's sml request a fresh, bounded HTTPS transport before forgetting it.
      const logoutController = new AbortController();
      let timeout;
      try {
        if (storage.api && !storage.api.sid && !storage.sid) {
          storage.api.close?.(); storage.status = 'closed'; return false;
        }
        if (storage.api) storage.api.fetch = this._connectionFetch(logoutController.signal);
        const logout = new Promise(resolve => {
          try {
            const pending = storage.close?.(error => resolve(!error));
            if (!storage.close) resolve(false);
            if (pending && typeof pending.then === 'function') pending.then(() => resolve(true), () => resolve(false));
          } catch { resolve(false); }
        });
        return await Promise.race([logout, new Promise(resolve => { timeout = setTimeout(() => resolve(false), this._logoutTimeoutMs); })]);
      } finally { clearTimeout(timeout); logoutController.abort(); }
    })();
    this._closingStorages.set(storage, closing);
    return closing;
  }
  _findNode(id) {
    if (typeof id !== 'string' || !/^mega:[A-Za-z0-9_:-]{1,96}$/.test(id)) return null;
    const known = this._nodes.get(id);
    if (known) return known;
    const raw = id.slice(5);
    // Account autoload already populated this table. A saved comic should open
    // immediately after reconnecting, without importing its folder a second time.
    if (this.mode === 'account' && Object.prototype.hasOwnProperty.call(this._storage?.files ?? {}, raw)) {
      const node = this._storage.files[raw];
      if (node && node.nodeId === raw) { this._register(node, null); return node; }
    }
    // Shared-folder nodes are in the loaded tree rather than Storage.files.
    // Bound the lookup and avoid following an invalid cyclic folder structure.
    const queue = this._rootNodes.map(node => ({ node, parentId: null }));
    const visited = new Set();
    for (let cursor = 0; cursor < queue.length && cursor < MAX_LIBRARY_FILES; cursor++) {
      const { node, parentId } = queue[cursor];
      const nodeId = this._register(node, parentId);
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      if (nodeId === id) return node;
      for (const child of node.directory ? node.children ?? [] : []) {
        if (queue.length >= MAX_LIBRARY_FILES) break;
        queue.push({ node: child, parentId: nodeId });
      }
    }
    return null;
  }
  _register(node, parentId) {
    const raw = node.nodeId ?? (typeof node.downloadId === 'string' ? node.downloadId : Array.isArray(node.downloadId) ? node.downloadId.join(':') : null);
    if (typeof raw !== 'string' || !/^[A-Za-z0-9_:-]{1,96}$/.test(raw)) throw new MegaConnectionError('MEGA returned an invalid file identifier.', 'TREE');
    const id = `mega:${raw}`;
    // MEGAJS constructs shared-folder children with its global API. Rebind each
    // child before exposing it so all reads retain the same HTTPS/cancel guard.
    if (this._isolatedAPI) node.api = this._isolatedAPI;
    this._nodes.set(id, node); this._parents.set(id, parentId);
    return id;
  }
  _describe(node, parentId) {
    const id = this._register(node, parentId);
    const name = safeName(node.name, node.directory ? 'Cloud Drive' : 'Untitled');
    const format = node.directory ? '' : name.split('.').pop().toLowerCase();
    return { id, name, size: Number.isSafeInteger(node.size) && node.size > 0 ? node.size : 0, path: name, source: 'mega', format, directory: Boolean(node.directory), parentId, readable: READABLE.has(format) };
  }
  _acquire(signal, generation) {
    checkSignal(signal);
    if (generation !== this._generation) return Promise.reject(cancelled());
    if (this._activeReads < this._maxConcurrentReads) { this._activeReads++; return Promise.resolve(); }
    if (this._waiters.length >= 32) return Promise.reject(new MegaConnectionError('Too many page requests. Try again in a moment.', 'BUSY'));
    return new Promise((resolve, reject) => {
      const entry = { resolve: () => { signal?.removeEventListener('abort', abort); this._activeReads++; resolve(); }, reject: error => { signal?.removeEventListener('abort', abort); reject(error); } };
      const abort = () => { const index = this._waiters.indexOf(entry); if (index >= 0) this._waiters.splice(index, 1); entry.reject(cancelled()); };
      this._waiters.push(entry); signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  }
  _release() { this._activeReads = Math.max(0, this._activeReads - 1); this._waiters.shift()?.resolve(); }
  // Each range read normally asks MEGA for the file's download address first.
  // Reusing that address for a few minutes halves the round trips, which makes
  // covers, page turns and large-archive indexing noticeably faster.
  _cacheDownloadAddress(api) {
    if (!api || typeof api.request !== 'function' || api.__cloudpanelsAddressCache) return;
    const original = api.request.bind(api), cache = new Map(), TTL = 5 * 60 * 1000;
    api.__cloudpanelsAddressCache = cache;
    api.request = (request, callback, ...rest) => {
      if (!request || request.a !== 'g' || typeof callback !== 'function') return original(request, callback, ...rest);
      const key = JSON.stringify([request.n, request.p, request._querystring, request.ssl]);
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < TTL) { queueMicrotask(() => callback(null, hit.response)); return; }
      return original(request, (error, response, ...more) => {
        if (!error && response && typeof response.g === 'string') { cache.set(key, { at: Date.now(), response }); if (cache.size > 500) cache.delete(cache.keys().next().value); }
        callback(error, response, ...more);
      }, ...rest);
    };
  }
  _download(node, start, end, signal) {
    try { this._cacheDownloadAddress(node?.api); } catch {}
    const wanted = end - start;
    const receivedLimit = start === 0 && end === 1 ? Math.min(node.size, 2) : wanted;
    return new Promise((resolve, reject) => {
      let stream; let done = false; let total = 0; const chunks = [];
      const finish = (error, result) => {
        if (done) return; done = true;
        signal?.removeEventListener('abort', abort);
        if (stream) { this._streams.delete(stream); stream.removeListener?.('data', data); stream.removeListener?.('end', ended); stream.removeListener?.('error', failed); stream.on('error', () => {}); }
        chunks.length = 0;
        if (error) { try { node?.api?.__cloudpanelsAddressCache?.clear(); } catch {} }
        error ? reject(error) : resolve(result);
      };
      const abort = () => { finish(cancelled()); try { stream?.destroy(); } catch {} };
      const failed = error => finish(error);
      const data = chunk => {
        if (done) return;
        const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        if (total + bytes.byteLength > receivedLimit) { finish(new MegaConnectionError('MEGA returned more data than the requested page.', 'READ_SIZE')); try { stream?.destroy(); } catch {} return; }
        chunks.push(bytes.slice()); total += bytes.byteLength;
      };
      const ended = () => {
        if (total !== receivedLimit) { finish(new MegaConnectionError('MEGA returned an incomplete page. Try reading it again.', 'READ_SIZE')); return; }
        const result = new Uint8Array(wanted); let offset = 0;
        for (const chunk of chunks) { const length = Math.min(chunk.length, wanted - offset); if (length > 0) result.set(chunk.subarray(0, length), offset); offset += length; }
        finish(null, result);
      };
      try {
        checkSignal(signal);
        // MEGAJS end is inclusive, while CloudPanels uses half-open ranges.
        // Its end:0 means "to EOF", so the one-byte prefix is read as two bytes
        // and trimmed below. One connection provides real fetch cancellation.
        stream = node.download({ start, end: end === 1 ? Math.min(node.size - 1, 1) : end - 1, forceHttps: true, maxConnections: 1, initialChunkSize: Math.min(wanted, 256 * 1024), maxChunkSize: 1024 * 1024, handleRetries: (tries, error, callback) => callback(error) });
        if (!stream || typeof stream.on !== 'function') throw new MegaConnectionError('The MEGA download could not be started.', 'NETWORK');
        this._streams.add(stream);
        stream.on('error', failed); stream.on('data', data); stream.on('end', ended);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      } catch (error) { finish(error); }
    });
  }
}
