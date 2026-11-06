// A short diary of read aloud, for Settings → Diagnostics → Copy report: what
// happened while listening (above all with the screen off), so a problem can
// be found afterwards. Only events, page numbers and short reasons: never the
// balloons' words, keys or passwords.
const LOG_KEY = 'cloudpanels-aloud-log-v1', BEAT_KEY = 'cloudpanels-listening-v1', KEEP = 60;

function scrub(value, limit = 120) {
  return String(value ?? '').replace(/sk-ant-[A-Za-z0-9_-]+/g, '[key]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/https?:\/\/[^\s"')]+/g, url => url.split('?')[0].replace(/\/[^/]{24,}/g, '/[id]')).slice(0, limit);
}

/** Notes one event (`details`: a few short values). */
export function noteAloud(event, details = {}, { storage = globalThis.localStorage, now = Date.now() } = {}) {
  try {
    const list = JSON.parse(storage.getItem(LOG_KEY) || '[]'), entry = { at: new Date(now).toISOString(), e: scrub(event, 40) };
    for (const [key, value] of Object.entries(details || {})) {
      if (value === undefined || value === null || value === '') continue;
      entry[key] = typeof value === 'number' || typeof value === 'boolean' ? value : scrub(value);
    }
    list.push(entry);
    storage.setItem(LOG_KEY, JSON.stringify(Array.isArray(list) ? list.slice(-KEEP) : [entry]));
  } catch { /* The diary is only a help; reading goes on without it. */ }
}

/** The events noted, oldest first. */
export function aloudEvents({ storage = globalThis.localStorage } = {}) {
  try { const list = JSON.parse(storage.getItem(LOG_KEY) || '[]'); return Array.isArray(list) ? list : []; } catch { return []; }
}

/**
 * While reading aloud, every few seconds: which comic and page. If the phone
 * closes the app, the next start finds it (a normal stop clears it: `null`).
 */
export function listeningBeat(state, { storage = globalThis.localStorage, now = Date.now() } = {}) {
  try { if (state) storage.setItem(BEAT_KEY, JSON.stringify({ ...state, at: now })); else storage.removeItem(BEAT_KEY); } catch { /* Only a help. */ }
}

/** At start: the reading aloud that was going on when the app was closed, if recent (then forgotten). */
export function interruptedListening({ storage = globalThis.localStorage, now = Date.now(), within = 6 * 3600 * 1000 } = {}) {
  try {
    const beat = JSON.parse(storage.getItem(BEAT_KEY) || 'null');
    storage.removeItem(BEAT_KEY);
    if (!beat || typeof beat !== 'object' || !(beat.at > now - within) || beat.at > now + 60000) return null;
    return beat;
  } catch { return null; }
}
