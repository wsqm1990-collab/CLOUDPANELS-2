// Keeps the screen on while a comic is open, so the iPad (which turns its
// screen off after 30 seconds in Low Power Mode) or a phone does not go dark
// in the middle of a page. In the iPad app the app itself does it (the reader
// posts to its "keepAwake" handler); in a browser the Screen Wake Lock is used
// where available. After a long time without any touch the screen may turn off
// again as usual, so a comic left open does not drain the battery.
export const KEEP_AWAKE_IDLE_MS = 15 * 60 * 1000;

export function createKeepAwake({ idleMs = KEEP_AWAKE_IDLE_MS, win = globalThis.window, doc = globalThis.document, nav = globalThis.navigator,
  setTimer = (callback, ms) => setTimeout(callback, ms), clearTimer = id => clearTimeout(id) } = {}) {
  let wanted = false, awake = false, timer, lock = null, requesting = false;
  const native = () => { try { return win?.webkit?.messageHandlers?.keepAwake || null; } catch { return null; } };
  const visible = () => !doc || doc.visibilityState !== 'hidden';

  function holdScreen() {
    const handler = native();
    if (handler) { try { handler.postMessage(true); } catch { /* Not available. */ } return; }
    if (lock || requesting || typeof nav?.wakeLock?.request !== 'function' || !visible()) return;
    requesting = true;
    let request;
    try { request = Promise.resolve(nav.wakeLock.request('screen')); } catch (error) { request = Promise.reject(error); }
    request.then(sentinel => {
      requesting = false;
      if (!awake) { try { void Promise.resolve(sentinel?.release?.()).catch(() => {}); } catch { /* Already released. */ } return; }
      lock = sentinel;
      try { sentinel?.addEventListener?.('release', () => { if (lock === sentinel) lock = null; }); } catch { /* No release event. */ }
    }, () => { requesting = false; });
  }
  function releaseScreen() {
    const handler = native();
    if (handler) { try { handler.postMessage(false); } catch { /* Not available. */ } }
    const held = lock; lock = null;
    if (held) { try { void Promise.resolve(held.release?.()).catch(() => {}); } catch { /* Already released. */ } }
  }
  function sleepLater() {
    if (timer !== undefined) clearTimer(timer);
    timer = setTimer(() => { timer = undefined; if (awake) { awake = false; releaseScreen(); } }, idleMs);
  }
  function wake() {
    if (!wanted) return;
    if (!awake) { awake = true; holdScreen(); }
    else if (!lock && !native()) holdScreen(); // the browser let go (page hidden)
    sleepLater();
  }
  // Browsers drop the wake lock when the page is hidden; take it again on return.
  try { doc?.addEventListener?.('visibilitychange', () => { if (awake && visible()) holdScreen(); }); } catch { /* No document. */ }

  return {
    /** A comic was opened. */
    start() { wanted = true; wake(); },
    /** Any touch or key while reading: stay awake for another `idleMs`. */
    activity() { wake(); },
    /** The comic was closed (or the setting turned off). */
    stop() {
      wanted = false;
      if (timer !== undefined) { clearTimer(timer); timer = undefined; }
      if (awake) { awake = false; releaseScreen(); }
    },
    get awake() { return awake; },
  };
}
