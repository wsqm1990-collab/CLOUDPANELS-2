// Natural voices for read aloud (optional, English): a cast of free AI voices
// that run on this device (Piper, light and fast: one model with hundreds of
// voices). Men sound like men, women like women, and every character keeps
// the same voice. The voices are downloaded once.

export const TTS_FILES = Object.freeze([
  { name: 'piper-en_US-libritts_r-medium.onnx', size: 78529840 },
  { name: 'ort-wasm-simd-threaded.wasm', size: 12644565 },
  { name: 'piper-en_US-libritts_r-medium-tokens.txt', size: 954 },
  { name: 'lexicon-en-us-v1.txt', size: 4574576 },
]);
export const TTS_BYTES = TTS_FILES.reduce((sum, file) => sum + file.size, 0);
const SITE = 'https://wsqm1990-collab.github.io/CLOUDPANELS-2/';

/** Where the voice files are: next to the website, or on the website for the iPad app. */
export function ttsBase(location = globalThis.location, baseURI = globalThis.document?.baseURI) {
  // The iPad app (capacitor://localhost) and Android app (https://localhost)
  // carry no voice files: they come from the website.
  const web = /^https?:$/.test(location?.protocol || '') && (location.hostname !== 'localhost' || Boolean(location.port));
  return new URL('tts/', web ? (baseURI || location.href) : SITE).href;
}

/** Whether this device can run the natural voices at all. */
export function naturalVoiceSupported(scope = globalThis) {
  return typeof scope.Worker === 'function' && typeof scope.WebAssembly === 'object' && Boolean(scope.AudioContext || scope.webkitAudioContext) && typeof scope.BigInt64Array === 'function';
}

// Best voices first: the first named characters get them. The numbers are
// voices of the model, picked for clear sound (men around 110-150 Hz, women
// around 180-250 Hz).
export const CAST = Object.freeze({
  narrator: [498],
  man: [677, 334, 410, 784, 736, 752],
  woman: [131, 46, 238, 312, 783, 567, 623],
  boy: [602, 486],
  girl: [693, 94],
  'old man': [522],
  'old woman': [433],
  creature: [522],
  robot: [410],
});
const GENERIC = /^(?:|narrator|man|woman|boy|girl|old man|old woman|creature|robot|voice|someone|unknown|crowd|people|men|women|guard|soldier|thug|cop|police|officer|kid|child)$/;
const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'doctor', 'prof', 'professor', 'aunt', 'uncle', 'captain', 'officer', 'agent', 'sir', 'lady', 'lord', 'king', 'queen', 'young', 'old', 'big', 'little', 'the', 'and', 'man', 'woman', 'boy', 'girl', 'guy', 'kid']);
const FEMALE = new Set(['woman', 'girl', 'old woman']);
const nameWords = name => name.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(word => word.length >= 3 && !TITLES.has(word));

/** Gives each character a voice and keeps it for the whole comic. */
export function createCast() {
  const given = new Map(), taken = new Map(), named = [];
  function lookup(line = {}) {
    const kind = CAST[line.voice] ? line.voice : line.kind === 'caption' ? 'narrator' : 'man';
    const name = String(line.speaker || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (GENERIC.test(name)) {
      const key = `${kind}|`;
      if (!given.has(key)) given.set(key, { voice: CAST[kind][0], kind });
      return given.get(key);
    }
    const key = `name|${name}`;
    if (given.has(key)) return given.get(key);
    // "Peter" and "Peter Parker", or "Mr. Osborn" and "Norman Osborn", are the
    // same character: they keep the first voice (and its kind).
    const words = nameWords(name), female = FEMALE.has(kind);
    const match = named.find(entry => entry.female === female && ((words.length === 1 && entry.words.includes(words[0])) || (entry.words.length === 1 && words.includes(entry.words[0]))));
    if (match) { given.set(key, match.cast); return match.cast; }
    const pool = CAST[kind], used = taken.get(kind) || new Set();
    const cast = { voice: pool.find(id => !used.has(id)) ?? pool[used.size % pool.length], kind };
    used.add(cast.voice); taken.set(kind, used); given.set(key, cast);
    named.push({ words, female, cast });
    return cast;
  }
  return {
    voiceFor: line => lookup(line).voice,
    kindFor: line => lookup(line).kind,
    /** How this line is said: the character's voice, at their pitch, in the line's tone. */
    plan: (line = {}, options) => { const cast = lookup(line); return voicePlan({ ...line, voice: cast.kind }, cast.voice, options); },
    reset() { given.clear(); taken.clear(); named.length = 0; },
  };
}

// How a line is said: a touch of pitch for children and creatures, pace and loudness by tone.
const PITCH = { boy: 1.05, girl: 1.04, creature: .8, 'old man': .97, 'old woman': .98 };
const TONE_SPEED = { normal: 1, shout: 1.08, angry: 1.05, scared: 1.12, sad: .88, whisper: .93, laugh: 1.05 };
const TONE_GAIN = { normal: 1, shout: 1, angry: 1, scared: .95, sad: .82, whisper: .62, laugh: 1 };

export function voicePlan(line = {}, voice, { speed = 1 } = {}) {
  const rate = PITCH[line.voice] || 1, kind = line.kind;
  const pace = (TONE_SPEED[line.tone] || 1) * (kind === 'thought' ? .96 : kind === 'caption' || kind === 'scene' ? .97 : 1) * naturalSpeed(speed);
  const effect = line.voice === 'robot' ? 'robot' : line.voice === 'creature' ? 'creature' : line.tone === 'whisper' ? 'whisper' : kind === 'thought' ? 'thought' : '';
  return { voice, speed: Math.round(Math.min(2.6, Math.max(.5, pace / rate)) * 100) / 100, rate, gain: (TONE_GAIN[line.tone] || 1) * (kind === 'thought' ? .88 : 1), effect };
}

/**
 * The reader's voice speed (1 = normal) as the voice model needs it. Part of
 * every word keeps its length whatever the pace (about 40% of the sound), so
 * the model is asked for more than the number shown: then "1.5×" really reads
 * one and a half times as fast (measured: 1.52×; 0.75× gives 0.74×).
 */
export function naturalSpeed(speed = 1) {
  const value = Math.min(1.6, Math.max(.5, Number(speed) > 0 ? Number(speed) : 1));
  return value === 1 ? 1 : 1 / (1.6 / value - .6);
}

/** How many voice engines run side by side: two on roomy Android phones, one elsewhere (about 300 MB each). */
export function voiceEngineCount(scope = globalThis) {
  const nav = scope.navigator || {}, cores = Number(nav.hardwareConcurrency) || 2, memory = Number(nav.deviceMemory) || 0;
  const apple = /iPad|iPhone|iPod/.test(nav.userAgent || '') || (/Macintosh/.test(nav.userAgent || '') && Number(nav.maxTouchPoints) > 1);
  if (apple || !memory) return 1;
  return memory >= 6 && cores >= 6 ? 2 : 1;
}

/** The voice engine on the main side: loads the workers, asks for lines, keeps recent ones. */
export function createNaturalVoice({ base = ttsBase(), ortUrl = new URL('vendor/ort/ort.wasm.bundle.min.mjs', globalThis.document?.baseURI || globalThis.location?.href).href,
  workerFactory = () => new Worker(new URL('tts-worker.js', globalThis.document?.baseURI || globalThis.location?.href), { type: 'module' }), files = TTS_FILES, keep = 80, engines = 1 } = {}) {
  let state = 'idle', failure = '', loading = null, nextId = 1;
  const progress = { loaded: 0, total: files.reduce((sum, file) => sum + file.size, 0), preparing: false };
  // A second engine only where the browser runs in 64-bit mode (32-bit Chrome cannot hold two).
  const extraAllowed = engines > 1 ? Promise.resolve(globalThis.navigator?.userAgentData?.getHighEntropyValues?.(['bitness'])).then(values => values?.bitness !== '32', () => true) : Promise.resolve(false);
  const listeners = new Set(), queue = [], lines = new Map(), pool = [];
  const notify = () => { for (const listener of listeners) { try { listener({ state, failure, ...progress }); } catch {} } };
  const aborted = () => Object.assign(new Error('Stopped.'), { name: 'AbortError' });
  function fail(message) {
    state = 'failed'; failure = message || 'The natural voices could not start on this device.';
    for (const job of queue.splice(0)) job.reject(new Error(failure));
    notify();
  }
  function drop(member) {
    const index = pool.indexOf(member); if (index >= 0) pool.splice(index, 1);
    try { member.worker.terminate(); } catch {}
    if (member.job) { queue.unshift(member.job); member.job = null; }
    if (!pool.length) { loading?.reject(new Error(failure || 'The natural voices could not start on this device.')); if (state !== 'idle') fail(failure); }
    else dispatch();
  }
  function spawn(first) {
    let member;
    try { member = { worker: workerFactory(), ready: false, job: null }; } catch (error) { if (first) { loading?.reject(error); fail(error?.message); } return null; }
    member.worker.onmessage = event => {
      const message = event.data || {};
      if (message.type === 'progress') { if (first && state === 'loading') { progress.loaded = message.loaded; progress.total = message.total || progress.total; progress.preparing = Boolean(message.preparing); notify(); } return; }
      if (message.type === 'ready') {
        member.ready = true;
        if (state !== 'ready') { state = 'ready'; progress.loaded = progress.total; progress.preparing = false; notify(); loading?.resolve(message); void extraAllowed.then(ok => { if (ok && state === 'ready') while (pool.length < engines && spawn(false)); }); }
        dispatch(); return;
      }
      if (message.type === 'failed' && message.id === undefined) { failure = message.message || failure; drop(member); return; }
      const job = member.job;
      if (!job || job.id !== message.id) return;
      member.job = null;
      if (message.type === 'audio') job.resolve({ samples: message.samples, sampleRate: message.sampleRate, ms: message.ms, sounds: message.sounds });
      else if (message.type === 'sounds') job.resolve(message.sounds);
      else if (message.type === 'skipped') job.reject(aborted());
      else job.reject(new Error(message.message || 'The voice could not read this line.'));
      dispatch();
    };
    member.worker.onerror = event => { event?.preventDefault?.(); drop(member); };
    pool.push(member);
    member.worker.postMessage({ type: 'load', base, files: files.map(file => ({ ...file })), ortUrl });
    return member;
  }
  function dispatch() {
    for (const member of pool) {
      if (!member.ready || member.job || !queue.length) continue;
      const job = queue.shift(); member.job = job;
      member.worker.postMessage({ type: job.type, id: job.id, text: job.text, voice: job.voice, speed: job.speed });
    }
  }
  function load() {
    if (state === 'ready') return Promise.resolve();
    if (loading) return loading.promise;
    state = 'loading'; failure = ''; notify();
    let resolve, reject;
    const promise = new Promise((ok, no) => { resolve = ok; reject = no; });
    loading = { promise, resolve, reject };
    promise.then(() => { loading = null; }, () => { loading = null; });
    spawn(true);
    return promise;
  }
  function request(message) {
    const job = { ...message, id: nextId++ };
    job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
    if (state === 'failed') { job.reject(new Error(failure)); return job; }
    queue.push(job);
    if (state === 'idle') load().catch(() => {});
    dispatch();
    return job;
  }
  const lineKey = (text, plan) => `${plan.voice}|${plan.speed}|${text}`;
  /** The audio of one line (asked once; later calls share it). */
  function synth(text, plan) {
    const key = lineKey(text, plan), known = lines.get(key);
    if (known) { lines.delete(key); lines.set(key, known); return known.promise; }
    const job = request({ type: 'say', text, voice: plan.voice, speed: plan.speed });
    const entry = { job, promise: job.promise };
    job.promise.catch(() => { if (lines.get(key) === entry) lines.delete(key); });
    lines.set(key, entry);
    while (lines.size > keep) lines.delete(lines.keys().next().value);
    return job.promise;
  }
  /** Lines not in `wanted` that have not started yet are dropped. */
  function only(wanted) {
    const keys = new Set(wanted.map(({ text, plan }) => lineKey(text, plan)));
    for (const [key, entry] of lines) {
      const at = queue.indexOf(entry.job);
      if (!keys.has(key) && at >= 0) { queue.splice(at, 1); lines.delete(key); entry.job.reject(aborted()); }
    }
  }
  return {
    get state() { return state; }, get failure() { return failure; }, get progress() { return { ...progress }; }, get engines() { return pool.filter(member => member.ready).length; },
    load, synth, only,
    sounds: text => request({ type: 'sounds', text }).promise,
    prepare(list) { for (const { text, plan } of list) synth(text, plan).catch(() => {}); },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() {
      for (const member of pool.splice(0)) { try { member.worker.terminate(); } catch {} member.job?.reject(aborted()); }
      for (const job of queue.splice(0)) job.reject(aborted());
      lines.clear(); state = 'idle'; loading?.reject(aborted()); loading = null;
    },
  };
}
