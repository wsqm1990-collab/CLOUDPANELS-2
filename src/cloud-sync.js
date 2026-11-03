// Sync between devices through the owner's own CloudPanels sync account (a
// Supabase project), not through MEGA. Only reading positions travel: which
// comics are read, in progress or unread, and the page and panel. Comic files,
// covers, MEGA sessions and settings never leave the device. Nothing runs
// until the reader signs in on that device; signing out stops it.
//
// The project's address and its publishable key are public by design: the
// table only lets each signed-in user read and write their own row (see the
// SQL in the release notes), and new sign-ups are turned off in the project.
export const SYNC_URL = 'https://vtjjibsllcwfamixdfnk.supabase.co';
export const SYNC_KEY = 'sb_publishable_RdM8yKZDH2syfddg2rTrVA_2WkaIRVy';
const SESSION_KEY = 'cloudpanels-cloud-sync-v1';
const TABLE = 'cloudpanels_sync';

export class CloudSyncError extends Error {
  constructor(message, code = 'NETWORK', status) { super(message); this.name = 'CloudSyncError'; this.code = code; this.status = status; }
}

/** The account connection on this device (its session is kept here; the password never is). */
export function createCloudSync({ url = SYNC_URL, key = SYNC_KEY, fetchImpl = globalThis.fetch?.bind(globalThis), storage = globalThis.localStorage, now = () => Date.now(), timeoutMs = 20000 } = {}) {
  const base = String(url || '').replace(/\/+$/, '');
  const load = () => { try { const value = JSON.parse(storage?.getItem(SESSION_KEY) || 'null'); return value?.refreshToken ? value : null; } catch { return null; } };
  const keep = value => { try { if (value) storage?.setItem(SESSION_KEY, JSON.stringify(value)); else storage?.removeItem(SESSION_KEY); } catch { /* Kept in memory only. */ } };
  let session = load(), refreshing = null;

  async function call(path, { method = 'GET', body, token, headers = {}, signal } = {}) {
    if (!base || !key) throw new CloudSyncError('Sync between devices is not set up in this version.', 'NOT_CONFIGURED');
    const controller = new AbortController(), stop = () => controller.abort();
    const timer = setTimeout(stop, timeoutMs);
    signal?.addEventListener('abort', stop, { once: true });
    try {
      let response;
      try {
        response = await fetchImpl(base + path, { method, signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
          headers: { apikey: key, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      } catch (error) {
        if (signal?.aborted) throw new DOMException('Sync cancelled.', 'AbortError');
        throw new CloudSyncError('No connection to the sync service.', 'NETWORK');
      }
      let data = null; const text = await response.text().catch(() => '');
      if (text) { try { data = JSON.parse(text); } catch { data = null; } }
      if (!response.ok) {
        const message = String(data?.error_description || data?.msg || data?.message || data?.error || `HTTP ${response.status}`);
        const code = response.status === 400 && /invalid login|invalid_grant|credentials/i.test(message) ? 'LOGIN'
          : response.status === 401 || response.status === 403 ? 'AUTH' : response.status === 429 ? 'BUSY' : 'NETWORK';
        throw new CloudSyncError(message.slice(0, 200), code, response.status);
      }
      return data;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', stop); }
  }
  function remember(data, email) {
    if (!data?.access_token || !data?.refresh_token) throw new CloudSyncError('The sync service sent an unexpected answer.', 'NETWORK');
    session = { email: email || data.user?.email || session?.email || '', userId: data.user?.id || session?.userId || '', accessToken: data.access_token, refreshToken: data.refresh_token,
      expiresAt: now() + Math.max(60, Number(data.expires_in) || 3600) * 1000 };
    keep(session); return session;
  }
  async function token(signal) {
    if (!session) throw new CloudSyncError('Not signed in on this device.', 'SIGNED_OUT');
    if (session.accessToken && session.expiresAt - 60000 > now()) return session.accessToken;
    // One refresh at a time: each refresh token can be used only once.
    refreshing ||= call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refreshToken }, signal })
      .then(data => remember(data, session?.email))
      .catch(error => { if (error.code === 'AUTH' || error.code === 'LOGIN' || error.status === 400) { session = null; keep(null); throw new CloudSyncError('Signed out: sign in again to keep syncing.', 'SIGNED_OUT'); } throw error; })
      .finally(() => { refreshing = null; });
    return (await refreshing).accessToken;
  }
  return {
    get configured() { return Boolean(base && key); },
    get signedIn() { return Boolean(session); },
    get email() { return session?.email || ''; },
    async signIn(email, password) {
      email = String(email || '').trim();
      if (!email || !password) throw new CloudSyncError('Enter the e-mail and password of your sync account.', 'LOGIN');
      const data = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
      return remember(data, email).email;
    },
    async signOut() {
      const previous = session; session = null; keep(null);
      if (previous?.accessToken) { try { await call('/auth/v1/logout', { method: 'POST', token: previous.accessToken }); } catch { /* Signed out here anyway. */ } }
    },
    /** This account's saved reading positions: { data, revision } or null. */
    async pull({ signal } = {}) {
      const rows = await call(`/rest/v1/${TABLE}?select=data,revision`, { token: await token(signal), signal });
      const row = Array.isArray(rows) ? rows[0] : null;
      return row ? { data: row.data && typeof row.data === 'object' ? row.data : {}, revision: Number(row.revision) || 1 } : null;
    },
    /** Only the revision of this account's shared list (null: none yet). */
    async revision({ signal } = {}) {
      const rows = await call(`/rest/v1/${TABLE}?select=revision`, { token: await token(signal), signal });
      const row = Array.isArray(rows) ? rows[0] : null;
      return row ? Number(row.revision) || 1 : null;
    },
    /** Save `data` over `revision` (null: the first save). A newer save from
     * another device in between is reported as a CONFLICT (pull and merge again). */
    async push(data, revision, { signal } = {}) {
      const access = await token(signal), prefer = { prefer: 'return=representation' };
      if (revision == null) {
        try { const rows = await call(`/rest/v1/${TABLE}?select=revision`, { method: 'POST', body: { data }, token: access, headers: prefer, signal }); return Number(rows?.[0]?.revision) || 1; }
        catch (error) { if (error.status === 409) throw new CloudSyncError('Saved meanwhile on another device.', 'CONFLICT', 409); throw error; }
      }
      const rows = await call(`/rest/v1/${TABLE}?revision=eq.${Number(revision)}&select=revision`, { method: 'PATCH', body: { data, revision: Number(revision) + 1, updated_at: new Date(now()).toISOString() }, token: access, headers: prefer, signal });
      if (!Array.isArray(rows) || !rows.length) throw new CloudSyncError('Saved meanwhile on another device.', 'CONFLICT', 409);
      return Number(rows[0].revision) || Number(revision) + 1;
    },
  };
}

// ---- What is synced: reading positions ---------------------------------------
// The shared document: { v: 1, progress: { key: { page, panel, pageCount,
// overview, status, updatedAt, name, size } } }. Each comic is found on another
// device by its id, or by its file name and size when its id differs there.
const identity = comic => `${comic.name}\u0000${comic.size}`;
function libraryIndex(state) {
  const byId = new Map(), byFile = new Map();
  for (const comic of state?.comics || []) {
    byId.set(comic.id, comic);
    const file = identity(comic); byFile.set(file, byFile.has(file) ? null : comic); // the same file twice: never guess
  }
  return { byId, byFile };
}
// The shared document's keys by file (name and size), for comics whose id
// differs on this device. Built once per sync: looking through the whole
// document again for every comic froze the screen for many seconds with a
// library of thousands of comics.
const fileOf = item => typeof item?.name === 'string' && typeof item?.size === 'number' ? identity(item) : null;
function documentFiles(document) {
  const files = new Map();
  for (const [key, entry] of Object.entries(document.progress)) { const file = fileOf(entry); if (file !== null && !files.has(file)) files.set(file, key); }
  return files;
}
function remoteKey(document, files, comic) {
  if (document.progress[comic.id]) return comic.id;
  const file = fileOf(comic), key = file === null ? undefined : files.get(file), entry = key === undefined ? null : document.progress[key];
  if (!entry) return comic.id;
  if (entry.name === comic.name && entry.size === comic.size) return key;
  // Rare: that entry was rewritten for another file during this sync.
  for (const [other, value] of Object.entries(document.progress)) if (value?.name === comic.name && value?.size === comic.size) return other;
  return comic.id;
}
const newer = (a, b) => typeof a === 'string' && (typeof b !== 'string' || a > b);
export function emptySyncDocument() { return { v: 1, progress: {} }; }
function cleanDocument(value) {
  const progress = value && typeof value === 'object' && value.v === 1 && value.progress && typeof value.progress === 'object' && !Array.isArray(value.progress) ? value.progress : {};
  const out = emptySyncDocument();
  for (const [key, entry] of Object.entries(progress)) if (typeof key === 'string' && key.length <= 200 && entry && typeof entry === 'object' && typeof entry.updatedAt === 'string') out.progress[key] = entry;
  return out;
}

/** Reading positions from other devices that are newer than this device's:
 * [[local comic id, position], …]. `skip`: the comic open in the reader. */
export function incomingPositions(state, remote, { skip } = {}) {
  const document = cleanDocument(remote), { byId, byFile } = libraryIndex(state), best = new Map();
  for (const [key, entry] of Object.entries(document.progress)) {
    const comic = byId.get(key) || (typeof entry.name === 'string' && Number.isSafeInteger(entry.size) ? byFile.get(`${entry.name}\u0000${entry.size}`) : null);
    if (!comic || comic.id === skip) continue;
    if (!newer(entry.updatedAt, best.get(comic.id)?.updatedAt)) continue;
    if (!newer(entry.updatedAt, state.progress?.[comic.id]?.updatedAt)) continue;
    best.set(comic.id, entry);
  }
  return [...best].map(([id, entry]) => [id, { page: entry.page, panel: entry.panel, pageCount: entry.pageCount, overview: entry.overview, status: entry.status, updatedAt: entry.updatedAt }]);
}

/** The shared document with this device's newer positions written in (the
 * positions of comics this device does not have are kept as they are). */
export function outgoingDocument(state, remote) { return mergeOutgoing(state, remote).document; }
function mergeOutgoing(state, remote) {
  const document = cleanDocument(remote), files = documentFiles(document); let changed = 0;
  for (const comic of state?.comics || []) {
    const position = state.progress?.[comic.id]; if (!position?.updatedAt) continue;
    const key = remoteKey(document, files, comic);
    if (!newer(position.updatedAt, document.progress[key]?.updatedAt)) continue;
    document.progress[key] = { page: position.page, panel: position.panel, pageCount: position.pageCount, overview: Boolean(position.overview), status: position.status, updatedAt: position.updatedAt, name: comic.name, size: comic.size };
    changed++;
    const file = fileOf(comic); if (file !== null && !files.has(file)) files.set(file, key);
  }
  return { document, changed };
}
export const sameSyncDocument = (a, b) => JSON.stringify(cleanDocument(a).progress) === JSON.stringify(cleanDocument(b).progress);

/** One sync: take newer positions from other devices, then save this
 * device's newer ones. A save from another device in between is merged in
 * and tried again. Returns { applied, sent }.
 * `seen` (kept by the caller between syncs): the shared list as this device
 * last saw it. While its revision is unchanged the list is not downloaded
 * again, and with no `changes` on this device either, nothing else is done.
 * `changes`: false when nothing changed on this device since the last sync. */
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
export async function syncReadingPositions({ cloud, store, skip, signal, attempts = 3, seen = null, changes = true }) {
  let applied = 0;
  const remember = (revision, data) => { if (seen) { seen.revision = revision; seen.data = data; seen.skipped = skip || null; } };
  for (let attempt = 1; ; attempt++) {
    let remote = null;
    if (attempt === 1 && seen?.data && seen.revision != null) {
      const revision = await cloud.revision({ signal });
      if (revision === seen.revision) {
        // A comic left out last time (it was open) is looked at again.
        if (!changes && !seen.skipped) return { applied, sent: false };
        remote = { data: seen.data, revision };
      }
    }
    remote ||= await cloud.pull({ signal });
    const document = remote?.data || emptySyncDocument();
    const incoming = incomingPositions(store.state, document, { skip });
    if (incoming.length) applied += store.applySyncedProgress(incoming);
    await pause(); // lets a tap in between be answered
    const { document: next, changed } = mergeOutgoing(store.state, document);
    if (remote && !changed) { remember(remote.revision, next); return { applied, sent: false }; }
    try { const revision = await cloud.push(next, remote ? remote.revision : null, { signal }); remember(revision, next); return { applied, sent: true }; }
    catch (error) { remember(null, null); if (error?.code !== 'CONFLICT' || attempt >= attempts) throw error; }
  }
}
