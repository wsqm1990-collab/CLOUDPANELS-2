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
// voices of the model, each checked by listening back with speech recognition
// (two sentences understood word for word) and by pitch: men 89-140 Hz,
// women 170-245 Hz, never in between, spread out so they sound different.
export const CAST = Object.freeze({
  narrator: [498],
  man: [677, 334, 410, 784, 736, 752, 478, 895, 225, 700, 521, 673, 724, 303, 489, 269],
  woman: [131, 46, 238, 312, 783, 567, 623, 285, 439, 853, 449, 343, 149, 65, 80, 57],
  boy: [602, 486],
  girl: [693, 94],
  'old man': [522, 547],
  'old woman': [433, 165],
  creature: [629],
  robot: [385],
});
// Nameless people ("a guard", "woman", the crowd) have voices of their own, so
// they never sound like a named character; two different ones differ.
export const EXTRAS = Object.freeze({ man: [86, 812], woman: [178, 20] });
const GENERIC = /^(?:|narrator|man|woman|boy|girl|old man|old woman|creature|robot|voice|someone|unknown|crowd|people|men|women|guard|soldier|thug|cop|police|officer|kid|child)$/;
const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'doctor', 'prof', 'professor', 'aunt', 'uncle', 'captain', 'officer', 'agent', 'sir', 'lady', 'lord', 'king', 'queen', 'young', 'old', 'big', 'little', 'the', 'and', 'man', 'woman', 'boy', 'girl', 'guy', 'kid']);
const FEMALE = new Set(['woman', 'girl', 'old woman']);
const nameWords = name => name.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(word => word.length >= 3 && !TITLES.has(word));

/**
 * Gives each character a voice and keeps it for the whole comic.
 * - Every named character gets a voice no one else in the story has, while
 *   there are enough; then the voice of someone not heard for the longest
 *   time (never someone in the same scene).
 * - Man or woman is what most of their lines say: one slip by the AI changes
 *   nothing, and a wrong first guess is put right once the story shows it.
 *   Once heard, a character's age (man, old man, boy) never changes.
 * - Voices only change when a page starts, never while it is heard: the
 *   pages the AI reads ahead count, but on their own page.
 * - A name two characters share ("Osborn": Norman and Harry) goes to the one
 *   who spoke last.
 * - Nameless people have voices of their own.
 * `learn(lines)` takes in a page as soon as it is read, before it is heard;
 * `learn(lines, { now: true })` when it starts being heard.
 */
export function createCast() {
  let clock = 0, learned = new WeakSet(), started = new WeakSet(), fixed = new WeakMap();
  const people = [], byName = new Map();
  const clean = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const kindOf = line => CAST[line.voice] ? line.voice : line.kind === 'caption' ? 'narrator' : 'man';
  const narrated = line => line.voice === 'narrator' || line.kind === 'scene' || (line.kind === 'caption' && (GENERIC.test(clean(line.speaker)) || clean(line.speaker) === 'narrator'));
  function assign(person) {
    const pool = (person.extra && EXTRAS[person.kind]) || CAST[person.kind] || CAST.man;
    const holders = voice => people.filter(other => other !== person && other.voice === voice);
    let voice = pool.find(id => !holders(id).length);
    if (voice === undefined) {
      let quietest = Infinity;
      for (const id of pool) { const recent = Math.max(...holders(id).map(other => other.heard)); if (recent < quietest) { quietest = recent; voice = id; } }
    }
    person.voice = voice ?? pool[0];
  }
  function decide(person) {
    let leader = person.kind, top = person.votes.get(leader) || 0;
    for (const [kind, count] of person.votes) if (count > top) { leader = kind; top = count; }
    if (leader === person.kind) return;
    // Before their first page is heard: what most of their lines say. After:
    // only a clear man/woman mistake is put right, never their age.
    if (person.spoke && (FEMALE.has(leader) === FEMALE.has(person.kind) || top < (person.votes.get(person.kind) || 0) + 2)) return;
    person.kind = leader;
    if (!(CAST[leader] || []).includes(person.voice) || person.extra) assign(person);
  }
  function personFor(line) {
    const kind = kindOf(line), name = clean(line.speaker);
    if (GENERIC.test(name)) {
      const key = `extra|${kind}|${name}`;
      let extra = byName.get(key);
      if (!extra) { extra = { extra: true, kind, votes: new Map([[kind, 1]]), heard: 0, last: 0, names: [], aliases: [] }; people.push(extra); byName.set(key, extra); assign(extra); }
      return extra;
    }
    const known = byName.get(name);
    if (known) return known;
    // "Peter" and "Peter Parker", or "Mr. Osborn" and "Norman Osborn", are the
    // same character (of the same sex): they keep one voice. A name that fits
    // more than one ("Osborn": Norman and Harry) goes to the one who spoke last.
    const words = nameWords(name), female = FEMALE.has(kind);
    const fits = people.filter(other => !other.extra && FEMALE.has(other.kind) === female && other.aliases.some(alias => (words.length === 1 && alias.includes(words[0])) || (alias.length === 1 && words.includes(alias[0]))));
    if (fits.length) {
      const person = fits.reduce((best, other) => other.last > best.last || (other.last === best.last && other.heard > best.heard) ? other : best);
      // A fuller name of one character becomes theirs; a short one ("Osborn")
      // stays open, so it never ties two people of one family together.
      if (fits.length === 1 && words.length > 1) { person.aliases.push(words); person.names.push(String(line.speaker).trim()); byName.set(name, person); }
      return person;
    }
    const person = { extra: false, kind, votes: new Map([[kind, 1]]), heard: 0, last: 0, names: [String(line.speaker).trim()], aliases: [words] };
    people.push(person); byName.set(name, person); assign(person);
    return person;
  }
  function lookup(line = {}) {
    if (narrated(line)) return { voice: CAST.narrator[0], kind: 'narrator' };
    const person = fixed.get(line) || personFor(line);
    person.heard = ++clock;
    return person;
  }
  return {
    voiceFor: line => lookup(line).voice,
    kindFor: line => lookup(line).kind,
    /** How this line is said: the character's voice, at their pitch, in the line's tone. */
    plan: (line = {}, options) => { const who = lookup(line); return voicePlan({ ...line, voice: who.kind }, who.voice, options); },
    /**
     * A page just read by the AI: who speaks on it, and as man or woman
     * (counted once per page). With `now` (the page starts being heard): who
     * says each line is settled, in reading order, and stays so on this page.
     */
    learn(lines = [], { now = false } = {}) {
      if (!Array.isArray(lines)) return;
      if (!learned.has(lines)) {
        learned.add(lines);
        for (const line of lines) {
          if (!line || line.kind === 'sfx' || narrated(line) || GENERIC.test(clean(line.speaker))) continue;
          // A character met just now already counts this line.
          const before = people.length, person = personFor(line);
          if (people.length === before) person.votes.set(kindOf(line), (person.votes.get(kindOf(line)) || 0) + 1);
          person.heard = ++clock;
        }
      }
      if (!now || started.has(lines)) return;
      started.add(lines);
      const speaking = new Set();
      for (const line of lines) {
        if (!line || line.kind === 'sfx' || narrated(line)) continue;
        const person = personFor(line);
        person.last = ++clock; fixed.set(line, person); speaking.add(person);
      }
      for (const person of speaking) { decide(person); person.spoke = true; }
    },
    /** The characters met so far (most recent first), for the AI to keep names and voices. */
    known(limit = 30) {
      return people.filter(person => !person.extra).sort((a, b) => b.heard - a.heard).slice(0, limit)
        .map(person => ({ name: person.names.reduce((best, name) => name.length > best.length ? name : best, ''), voice: person.kind }));
    },
    reset() { people.length = 0; byName.clear(); clock = 0; learned = new WeakSet(); started = new WeakSet(); fixed = new WeakMap(); },
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
  function request(message, { urgent = false } = {}) {
    const job = { ...message, id: nextId++ };
    job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
    if (state === 'failed') { job.reject(new Error(failure)); return job; }
    if (urgent) queue.unshift(job); else queue.push(job);
    if (state === 'idle') load().catch(() => {});
    dispatch();
    return job;
  }
  const lineKey = (text, plan) => `${plan.voice}|${plan.speed}|${text}`;
  // A line waiting in the queue goes to its front (the one about to be heard).
  function hurry(job) { const at = queue.indexOf(job); if (at > 0) { queue.splice(at, 1); queue.unshift(job); } }
  /** The audio of one line (asked once; later calls share it). `urgent`: it is needed now, so it is made first. */
  function synth(text, plan, { urgent = false } = {}) {
    const key = lineKey(text, plan), known = lines.get(key);
    if (known) { lines.delete(key); lines.set(key, known); if (urgent) hurry(known.job); return known.promise; }
    const job = request({ type: 'say', text, voice: plan.voice, speed: plan.speed }, { urgent });
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
    /** Lines to make ahead; with `first`, before anything else waiting (this page before the next). */
    prepare(list, { first = false } = {}) {
      const jobs = [];
      for (const { text, plan } of list) { synth(text, plan).catch(() => {}); const entry = lines.get(lineKey(text, plan)); if (entry) jobs.push(entry.job); }
      if (first) for (const job of jobs.reverse()) { const at = queue.indexOf(job); if (at >= 0) { queue.splice(at, 1); queue.unshift(job); } }
    },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() {
      for (const member of pool.splice(0)) { try { member.worker.terminate(); } catch {} member.job?.reject(aborted()); }
      for (const job of queue.splice(0)) job.reject(aborted());
      lines.clear(); state = 'idle'; loading?.reject(aborted()); loading = null;
    },
  };
}
