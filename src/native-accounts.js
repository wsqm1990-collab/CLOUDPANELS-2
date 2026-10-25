const MAX_LIBRARY_BYTES = 64 * 1024 * 1024;
const CHUNK_BYTES = 48 * 1024;
const safeCode = value => typeof value === 'string' && /^[A-Z0-9_]{1,64}$/.test(value) ? value : 'ACCOUNT_ACTION_FAILED';
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{16,256}$/.test(value);
const profileContext = profile => profile && validId(profile.id) && typeof profile.name === 'string' && validToken(profile.sessionToken)
  ? Object.freeze({ profileId: profile.id, sessionToken: profile.sessionToken }) : null;
const publicProfile = profile => ({ id: profile.id, name: profile.name, email: typeof profile.email === 'string' ? profile.email : '', biometricEnabled: profile.biometricEnabled === true });

export class NativeAccountError extends Error {
  constructor(code = 'ACCOUNT_ACTION_FAILED') {
    super('The account action could not be completed. Please try again.');
    this.name = 'NativeAccountError'; this.code = safeCode(code);
  }
}

/** The Android host owns authentication, cryptography and private files. */
export function createNativeAccounts(bridge, { timeoutMs = 60000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!bridge || typeof bridge.postMessage !== 'function') throw new NativeAccountError('NATIVE_UNAVAILABLE');
  const pending = new Map();
  let sequence = 0, disposed = false, metadataQueue = Promise.resolve(), authContext = null, authGeneration = 0;
  function request(action, payload = {}) {
    if (disposed) return Promise.reject(new NativeAccountError('NATIVE_UNAVAILABLE'));
    const requestId = `account-${Date.now().toString(36)}-${++sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimer(() => { pending.delete(requestId); reject(new NativeAccountError('NATIVE_TIMEOUT')); }, timeoutMs);
      pending.set(requestId, { resolve, reject, timer });
      try { bridge.postMessage(JSON.stringify({ requestId, action, payload })); }
      catch { clearTimer(timer); pending.delete(requestId); reject(new NativeAccountError('NATIVE_UNAVAILABLE')); }
    });
  }
  const receive = event => {
    let value;
    try { value = typeof event?.data === 'string' ? JSON.parse(event.data) : event?.data; } catch { return; }
    if (!value || typeof value.requestId !== 'string') return;
    const waiting = pending.get(value.requestId); if (!waiting) return;
    pending.delete(value.requestId); clearTimer(waiting.timer);
    if (value.ok === true) waiting.resolve(value.result);
    else waiting.reject(new NativeAccountError(typeof value.error === 'object' ? value.error?.code : value.error));
  };
  bridge.onmessage = receive;
  const copyContext = () => authContext ? Object.freeze({ ...authContext }) : null;
  const isCurrentContext = expected => Boolean(!disposed && expected && authContext && expected.profileId === authContext.profileId && expected.sessionToken === authContext.sessionToken);
  const requireContext = expected => { if (!isCurrentContext(expected)) throw new NativeAccountError('LOCKED'); };
  const protectedRequest = (action, payload = {}, expected = copyContext()) => {
    try { requireContext(expected); } catch (error) { return Promise.reject(error); }
    return request(action, { ...payload, context: expected }).then(result => {
      // A response for the previous account is not allowed to resume old work
      // after another password/biometric authentication replaced its session.
      requireContext(expected); return result;
    });
  };
  async function authenticate(action, payload) {
    const attempt = ++authGeneration;
    authContext = null;
    const result = await request(action, payload), nextContext = profileContext(result);
    if (disposed || attempt !== authGeneration) throw new NativeAccountError('STALE_AUTH');
    if (!nextContext) throw new NativeAccountError('INVALID_AUTH_RESPONSE');
    authContext = nextContext;
    // Session tokens stay inside this closure; app state and library backups
    // receive only displayable profile metadata.
    return publicProfile(result);
  }
  const profilePreference = action => {
    const expected = copyContext();
    return protectedRequest(action, {}, expected).then(result => {
      if (!result || result.id !== expected.profileId || typeof result.name !== 'string' ||
          (result.sessionToken !== undefined && result.sessionToken !== expected.sessionToken)) throw new NativeAccountError('INVALID_AUTH_RESPONSE');
      return publicProfile(result);
    });
  };
  const enqueueMetadata = task => {
    const queued = metadataQueue.then(task);
    metadataQueue = queued.catch(() => {});
    return queued;
  };
  const cancelTransfer = (transferId, expected) => {
    if (transferId) void protectedRequest('libraryCancel', { transferId }, expected).catch(() => {});
  };
  const validTransfer = value => value && typeof value.transferId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value.transferId);
  const encodeChunk = bytes => {
    let value = '';
    for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(value);
  };
  const decodeChunk = text => {
    if (typeof text !== 'string' || text.length > 4 * Math.ceil(CHUNK_BYTES / 3) + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new NativeAccountError('INVALID_LIBRARY_TRANSFER');
    let value; try { value = atob(text); } catch { throw new NativeAccountError('INVALID_LIBRARY_TRANSFER'); }
    if (value.length > CHUNK_BYTES) throw new NativeAccountError('INVALID_LIBRARY_TRANSFER');
    return Uint8Array.from(value, character => character.charCodeAt(0));
  };
  const client = {
    listProfiles: () => request('listProfiles'),
    currentProfile() {
      const expected = copyContext();
      if (!expected) return Promise.resolve(null);
      return protectedRequest('currentProfile', {}, expected).then(result => {
        const checked = profileContext(result);
        if (!checked || checked.profileId !== expected.profileId || checked.sessionToken !== expected.sessionToken) throw new NativeAccountError('INVALID_AUTH_RESPONSE');
        return publicProfile(result);
      });
    },
    createProfile: ({ name, email = '', password }) => authenticate('createProfile', { name, email, password }),
    signIn: (id, password) => authenticate('signIn', { id, password }),
    unlockBiometric: id => authenticate('unlockBiometric', { id }),
    enableBiometric: () => profilePreference('enableBiometric'),
    disableBiometric: () => profilePreference('disableBiometric'),
    logout() {
      const expected = copyContext();
      // Post with the exact old context, then discard it immediately. A late
      // logout reply must never erase a more recent account's authentication.
      const loggingOut = expected ? request('logout', { context: expected }) : Promise.resolve(false);
      authGeneration++; authContext = null;
      return loggingOut;
    },
    loadSession: () => protectedRequest('loadSession'),
    saveSession: record => protectedRequest('saveSession', { record }),
    clearSession: () => protectedRequest('clearSession'),
    canImportLegacyLibrary: () => protectedRequest('canImportLegacyLibrary'),
    finishLegacyMigration: () => protectedRequest('finishLegacyMigration'),
    createMetadataStore() {
      // Bind when the backend is created, not when a queued transfer begins.
      // Old account A snapshots must never inherit account B's newer token.
      const expected = copyContext(); requireContext(expected);
      return {
        read: () => enqueueMetadata(async () => {
          let transferId;
          try {
            const begin = await protectedRequest('libraryReadBegin', {}, expected);
            if (begin === null || begin?.exists === false) return null;
            if (!validTransfer(begin) || !Number.isSafeInteger(begin.bytes) || begin.bytes < 0 || begin.bytes > MAX_LIBRARY_BYTES) throw new NativeAccountError('INVALID_LIBRARY_TRANSFER');
            transferId = begin.transferId;
            const bytes = new Uint8Array(begin.bytes);
            let position = 0, index = 0;
            while (position < bytes.length) {
              const chunk = await protectedRequest('libraryReadChunk', { transferId, index }, expected);
              const data = decodeChunk(chunk?.data);
              if (!data.length || position + data.length > bytes.length || chunk.done !== (position + data.length === bytes.length)) throw new NativeAccountError('INVALID_LIBRARY_TRANSFER');
              bytes.set(data, position); position += data.length; index++;
            }
            // The final chunk releases the host's bounded read buffer.
            return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          } catch (error) { cancelTransfer(transferId, expected); throw error instanceof NativeAccountError ? error : new NativeAccountError('INVALID_LIBRARY_TRANSFER'); }
        }),
        write: text => enqueueMetadata(async () => {
          requireContext(expected);
          if (typeof text !== 'string' || text.length > MAX_LIBRARY_BYTES) throw new NativeAccountError('LIBRARY_TOO_LARGE');
          const bytes = new TextEncoder().encode(text);
          if (bytes.length > MAX_LIBRARY_BYTES) throw new NativeAccountError('LIBRARY_TOO_LARGE');
          let transferId;
          try {
            const begin = await protectedRequest('libraryWriteBegin', { bytes: bytes.length }, expected);
            if (!validTransfer(begin)) throw new NativeAccountError('INVALID_LIBRARY_TRANSFER');
            transferId = begin.transferId;
            for (let position = 0, index = 0; position < bytes.length; position += CHUNK_BYTES, index++) {
              await protectedRequest('libraryWriteChunk', { transferId, index, data: encodeChunk(bytes.subarray(position, position + CHUNK_BYTES)) }, expected);
            }
            await protectedRequest('libraryWriteEnd', { transferId }, expected);
          } catch (error) { cancelTransfer(transferId, expected); throw error instanceof NativeAccountError ? error : new NativeAccountError('INVALID_LIBRARY_TRANSFER'); }
        }),
        close() { /* The native vault is closed explicitly when the account locks. */ },
      };
    },
    dispose() {
      disposed = true; authGeneration++; authContext = null;
      if (bridge.onmessage === receive) bridge.onmessage = null;
      for (const item of pending.values()) { clearTimer(item.timer); item.reject(new NativeAccountError('NATIVE_UNAVAILABLE')); }
      pending.clear();
    },
  };
  return client;
}

let singleton, singletonBridge;
export function getNativeAccounts() {
  const bridge = typeof window === 'undefined' ? null : window.CloudPanelsAndroidAccounts;
  if (!bridge || typeof bridge.postMessage !== 'function') return null;
  if (!singleton || singletonBridge !== bridge) { singleton?.dispose(); singletonBridge = bridge; singleton = createNativeAccounts(bridge); }
  return singleton;
}
