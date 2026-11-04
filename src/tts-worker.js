// Natural voices (optional): runs the free Kokoro voice model on this device,
// away from the page so reading and turning pages stay smooth. The files are
// downloaded once into this device's storage; nothing is sent anywhere.
import { parseLexicon, createPhonemizer, chunkSounds, soundTokens } from './tts-text.js';
import { smallerMemory } from './tts-memory.js';

const CACHE = 'cloudpanels-voices-v1';
const ROWS = 510, SIZE = 256;
let failedWith = '', ready = null, session = null, ort = null, phonemizer = null, voicePack = null, names = null, voiceIndex = new Map();
const cancelled = new Set();
let queue = Promise.resolve();

const post = (message, transfer) => self.postMessage(message, transfer || []);

// Where the voice files are kept: the browser's file cache, or (in app views
// without it) the device database. Either way they download only once.
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
const transact = (db, mode, action) => new Promise((resolve, reject) => {
  const tx = db.transaction('files', mode), store = tx.objectStore('files'); let result;
  const request = action(store); if (request) request.onsuccess = () => { result = request.result; };
  tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(tx.error);
});
async function openStorage(base) {
  try {
    if (self.caches) {
      const cache = await caches.open(CACHE), probe = new URL('probe.txt', base).href;
      await cache.put(probe, new Response('1')); const kept = await cache.match(probe); await cache.delete(probe);
      if (kept) return { get: async url => { const saved = await cache.match(url); return saved ? saved.arrayBuffer() : null; }, put: (url, bytes) => cache.put(url, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } })), drop: url => cache.delete(url) };
    }
  } catch { /* Try the database. */ }
  try {
    const db = await database();
    return { get: async url => { const blob = await transact(db, 'readonly', store => store.get(url)); return blob ? blob.arrayBuffer() : null; },
      put: (url, bytes) => transact(db, 'readwrite', store => { store.put(new Blob([bytes]), url); }), drop: url => transact(db, 'readwrite', store => { store.delete(url); }) };
  } catch { return null; }
}

async function download(storage, base, file, progress) {
  const url = new URL(file.name, base).href;
  try {
    const saved = storage ? await storage.get(url) : null;
    if (saved) {
      if (!file.size || saved.byteLength === file.size) { progress(saved.byteLength); return saved; }
      await storage.drop(url);
    }
  } catch { /* Storage unavailable: download again. */ }
  // A download that stops moving for a while gives up with a clear message.
  const controller = new AbortController(); let stalled = false, watchdog = 0;
  const watch = () => { clearTimeout(watchdog); watchdog = setTimeout(() => { stalled = true; controller.abort(); }, 45000); };
  watch();
  let response;
  try { response = await fetch(url, { credentials: 'omit', cache: 'no-cache', signal: controller.signal }); }
  catch (error) { clearTimeout(watchdog); throw new Error(stalled ? 'The voices download stopped. Check the connection and try again.' : 'The voices could not be downloaded. Check the connection and try again.'); }
  if (!response.ok) { clearTimeout(watchdog); throw new Error(`The voices could not be downloaded (HTTP ${response.status}).`); }
  let bytes;
  const reader = response.body && typeof response.body.getReader === 'function' ? response.body.getReader() : null;
  if (reader && file.size) {
    // Written straight into one buffer of the known size: half the memory of
    // collecting pieces and joining them (phones with little memory).
    bytes = new Uint8Array(file.size); let loaded = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (loaded + value.byteLength > bytes.byteLength) throw new RangeError('too long');
        watch(); bytes.set(value, loaded); loaded += value.byteLength; progress(loaded);
      }
    } catch (error) { throw new Error(error instanceof RangeError ? 'The voices download did not match. Try again.' : 'The voices download stopped. Check the connection and try again.'); }
    finally { clearTimeout(watchdog); }
    if (loaded !== bytes.byteLength) throw new Error('The voices download was cut short. Try again on a steady connection.');
  } else if (reader) {
    const parts = []; let loaded = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        watch(); parts.push(value); loaded += value.byteLength; progress(loaded);
      }
    } catch { throw new Error('The voices download stopped. Check the connection and try again.'); }
    finally { clearTimeout(watchdog); }
    bytes = new Uint8Array(loaded); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  } else { try { bytes = new Uint8Array(await response.arrayBuffer()); } finally { clearTimeout(watchdog); } progress(bytes.byteLength); }
  if (file.size && bytes.byteLength !== file.size) throw new Error('The voices download was cut short. Try again on a steady connection.');
  try { if (storage) await storage.put(url, bytes); } catch { /* Kept for this visit only. */ }
  return bytes.buffer;
}

async function load({ base, files, ortUrl }) {
  const started = performance.now();
  const cache = await openStorage(base);
  const total = files.reduce((sum, file) => sum + (file.size || 0), 0), done = new Map();
  let lastPost = 0;
  const progressFor = file => loaded => {
    done.set(file.name, loaded);
    const now = performance.now();
    if (now - lastPost > 120) { lastPost = now; post({ type: 'progress', loaded: [...done.values()].reduce((a, b) => a + b, 0), total }); }
  };
  const byName = name => files.find(file => file.name.endsWith(name));
  // One file at a time keeps memory low on phones.
  const model = await download(cache, base, byName('.onnx'), progressFor(byName('.onnx')));
  const wasm = await download(cache, base, byName('.wasm'), progressFor(byName('.wasm')));
  const pack = await download(cache, base, byName('.bin'), progressFor(byName('.bin')));
  const index = await download(cache, base, byName('.json'), progressFor(byName('.json')));
  const lexicon = await download(cache, base, byName('.txt'), progressFor(byName('.txt')));
  post({ type: 'progress', loaded: total, total, preparing: true });
  smallerMemory();
  ort = await import(ortUrl);
  ort.env.wasm.wasmBinary = wasm;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.logLevel = 'error';
  try { session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }); }
  catch (error) { throw new Error(/memory|RangeError|allocat/i.test(String(error?.message || error) + (error?.name || '')) ? 'This device did not have enough free memory for the voices. Close other apps and try again.' : `The voice engine could not start (${String(error?.message || error).slice(0, 120)}).`); }
  names = {
    tokens: session.inputNames.find(name => /token|input_ids/.test(name)) || session.inputNames[0],
    style: session.inputNames.find(name => /style/.test(name)) || session.inputNames[1],
    speed: session.inputNames.find(name => /speed/.test(name)) || session.inputNames[2],
  };
  voicePack = new Float32Array(pack);
  const info = JSON.parse(new TextDecoder().decode(index));
  voiceIndex = new Map(info.voices.map(voice => [voice.name, voice.offset / 4]));
  phonemizer = createPhonemizer(parseLexicon(new TextDecoder().decode(lexicon)));
  return { ms: Math.round(performance.now() - started), voices: [...voiceIndex.keys()] };
}

function styleFor(voice, count) {
  const start = voiceIndex.get(voice) ?? voiceIndex.values().next().value;
  const row = Math.min(Math.max(count, 0), ROWS - 1);
  return voicePack.slice(start + row * SIZE, start + (row + 1) * SIZE);
}

async function say({ id, text, voice, speed = 1 }) {
  if (cancelled.has(id)) { cancelled.delete(id); post({ type: 'skipped', id }); return; }
  const started = performance.now();
  const sounds = phonemizer.phonemize(text), pieces = chunkSounds(sounds), audio = [];
  for (const piece of pieces) {
    const tokens = soundTokens(piece);
    if (!tokens.length) continue;
    const ids = new BigInt64Array(tokens.length + 2);
    tokens.forEach((token, index) => { ids[index + 1] = BigInt(token); });
    const feeds = {
      [names.tokens]: new ort.Tensor('int64', ids, [1, ids.length]),
      [names.style]: new ort.Tensor('float32', styleFor(voice, tokens.length), [1, SIZE]),
      [names.speed]: new ort.Tensor('float32', new Float32Array([Math.min(1.8, Math.max(.5, Number(speed) || 1))]), [1]),
    };
    const result = await session.run(feeds);
    const output = result[session.outputNames[0]];
    audio.push(new Float32Array(output.data));
    output.dispose?.();
    if (cancelled.has(id)) { cancelled.delete(id); post({ type: 'skipped', id }); return; }
  }
  const gap = Math.round(24000 * .12), length = audio.reduce((sum, part) => sum + part.length, 0) + gap * Math.max(0, audio.length - 1);
  const samples = new Float32Array(length);
  let offset = 0;
  for (const part of audio) { samples.set(part, offset); offset += part.length + gap; }
  // Soft edges: no click at the start or the end.
  const fade = Math.min(240, samples.length >> 2);
  for (let index = 0; index < fade; index++) { const k = index / fade; samples[index] *= k; samples[samples.length - 1 - index] *= k; }
  post({ type: 'audio', id, samples, sampleRate: 24000, ms: Math.round(performance.now() - started), sounds }, [samples.buffer]);
}

self.onmessage = event => {
  const message = event.data || {};
  if (message.type === 'load') {
    if (!ready) ready = load(message).then(info => { post({ type: 'ready', ...info }); return info; }, error => { failedWith = String(error?.message || error); ready = null; post({ type: 'failed', message: failedWith }); return null; });
    return;
  }
  if (message.type === 'cancel') { for (const id of message.ids || []) cancelled.add(id); return; }
  if (message.type === 'say') {
    queue = queue.then(async () => {
      try { await ready; if (!session) throw new Error(failedWith || 'The voices are not ready.'); await say(message); }
      catch (error) { post({ type: 'failed', id: message.id, message: String(error?.message || error) }); }
    });
    return;
  }
  if (message.type === 'sounds') {
    queue = queue.then(async () => {
      try { await ready; if (!phonemizer) throw new Error(failedWith || 'The voices are not ready.'); post({ type: 'sounds', id: message.id, sounds: phonemizer.phonemize(message.text) }); }
      catch (error) { post({ type: 'failed', id: message.id, message: String(error?.message || error) }); }
    });
  }
};
