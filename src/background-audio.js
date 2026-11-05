// Listening with the screen off (optional, off unless switched on in Panel
// options; phones with Android). While reading aloud, a looped, practically
// silent sound plays in an <audio> element: it tells the phone that audio is
// playing, so the phone keeps the reader going with the screen off and shows
// play, pause and page buttons on the lock screen (Media Session). The sound
// is a 30 Hz hum far below hearing, made here (no file, nothing downloaded).

/** Ten seconds of the hum as a WAV file (300 whole waves, so it loops without a click). */
export function humWav({ rate = 8000, seconds = 10, frequency = 30, level = 52 } = {}) {
  const samples = rate * seconds, bytes = new ArrayBuffer(44 + samples * 2), view = new DataView(bytes);
  const text = (offset, value) => { for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples * 2, true);
  for (let index = 0; index < samples; index++) view.setInt16(44 + index * 2, Math.round(Math.sin(2 * Math.PI * frequency * index / rate) * level), true);
  return bytes;
}

/**
 * Where reading can go on with the screen off: phones and tablets with
 * Android, in the browser or the installed web app. Not yet on the iPad and
 * iPhone (they pause apps in the background) or inside the native apps.
 */
export function backgroundListeningSupported(scope = globalThis) {
  const nav = scope.navigator || {}, agent = String(nav.userAgent || '');
  const apple = /iPad|iPhone|iPod/.test(agent) || (/Macintosh/.test(agent) && Number(nav.maxTouchPoints) > 1);
  let native = false; try { native = Boolean(scope.Capacitor?.isNativePlatform?.()); } catch { native = false; }
  return !apple && !native && typeof scope.Audio === 'function' && Boolean(nav.mediaSession) && typeof scope.URL?.createObjectURL === 'function' && typeof scope.Blob === 'function';
}

const ACTIONS = ['play', 'pause', 'stop', 'nexttrack', 'previoustrack'];

/** The keep-alive sound and the lock-screen controls for one reader. */
export function createBackgroundListening({ scope = globalThis } = {}) {
  let audio = null, url = '', active = false, actions = null;
  const session = () => scope.navigator?.mediaSession || null;
  function setHandlers(list) {
    const media = session(); if (!media || typeof media.setActionHandler !== 'function') return;
    for (const action of ACTIONS) { try { media.setActionHandler(action, list?.[action] ? () => list[action]() : null); } catch { /* Not offered here. */ } }
  }
  function describe({ title = '', subtitle = '', artwork = [] } = {}) {
    const media = session(); if (!media) return;
    try { media.metadata = typeof scope.MediaMetadata === 'function' ? new scope.MediaMetadata({ title, artist: subtitle, album: 'CloudPanels', artwork }) : null; } catch { /* Shown without details. */ }
  }
  function state(value) { const media = session(); if (media) { try { media.playbackState = value; } catch { /* Not offered here. */ } } }
  function element() {
    if (audio) return audio;
    url = scope.URL.createObjectURL(new scope.Blob([humWav()], { type: 'audio/wav' }));
    audio = new scope.Audio(url); audio.loop = true; audio.preload = 'auto';
    // Something else took the sound (a call, another app): reading pauses too.
    // (Pauses asked for here come with `active` already false.)
    audio.addEventListener?.('pause', () => { if (active && audio?.paused) actions?.pause?.(); });
    return audio;
  }
  return {
    get active() { return active; },
    /** From a tap (Listen) or a lock-screen button: the hum starts and the controls show. */
    start({ title, subtitle, artwork, actions: list } = {}) {
      actions = list || actions; active = true;
      describe({ title, subtitle, artwork }); setHandlers(actions);
      try { const playing = element().play(); playing?.catch?.(() => {}); } catch { /* Reading goes on; the phone may stop it later. */ }
      state('playing');
    },
    /** The page or the comic changed. */
    update({ title, subtitle, artwork } = {}) { if (active) describe({ title, subtitle, artwork }); },
    /** Reading paused: the controls stay, so it can go on from the lock screen. */
    pause() {
      if (!audio && !active) return;
      active = false;
      try { audio?.pause(); } catch { /* Already quiet. */ }
      state('paused');
    },
    /** The comic was closed or the option switched off: nothing is left behind. */
    stop() {
      const had = Boolean(audio) || active;
      active = false;
      if (audio) { try { audio.pause(); audio.removeAttribute?.('src'); audio.load?.(); } catch { /* Already gone. */ } audio = null; }
      if (url) { try { scope.URL.revokeObjectURL(url); } catch { /* Already released. */ } url = ''; }
      if (!had) return;
      actions = null; setHandlers(null);
      const media = session(); if (media) { try { media.metadata = null; } catch { /* Not offered here. */ } }
      state('none');
    },
  };
}
