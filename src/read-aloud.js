// Read aloud (optional, off unless switched on in Panel options): the
// balloons of each page are read out loud with this device's own voice, panel
// by panel, and the reader moves on by itself. The assistant's AI (the user's
// own key) reads each page once; the result is kept on this device.

export const READ_ALOUD_MODEL = 'claude-sonnet-5-5';
const KINDS = new Set(['speech', 'thought', 'caption', 'sfx']);
const TONES = new Set(['normal', 'shout', 'whisper', 'sad', 'angry', 'scared', 'laugh']);
const VOICES = new Set(['narrator', 'man', 'woman', 'boy', 'girl', 'old man', 'old woman', 'creature', 'robot']);
const MAX_LINES = 150;
// Music, background sound and sound effects (optional extras of read aloud).
export const MOODS = Object.freeze(['calm', 'happy', 'funny', 'romantic', 'sad', 'mystery', 'tense', 'action', 'scary', 'heroic', 'none']);
export const AMBIENCES = Object.freeze(['none', 'city', 'night', 'rain', 'storm', 'wind', 'indoors', 'fire', 'water', 'forest', 'space']);
export const SOUNDS = Object.freeze(['explosion', 'punch', 'slash', 'gunshot', 'gunfire', 'laser', 'zap', 'whoosh', 'web', 'crash', 'glass', 'thud', 'footsteps', 'knock', 'door', 'metal', 'thunder', 'splash', 'roar', 'alarm', 'beep', 'ring', 'engine', 'screech', 'magic', 'boing', 'pop', 'snap', 'heartbeat', 'fire', 'rumble', 'crunch']);
const MOOD_SET = new Set(MOODS), AMBIENCE_SET = new Set(AMBIENCES), SOUND_SET = new Set(SOUNDS);

/** What the AI is asked to do with one page. */
export function scriptInstructions() {
  return [
    'You transcribe comic book pages for the read-aloud feature of a comic reader app.',
    'Look at the page and list the text a reader would read, in reading order: panel by panel, and within each panel balloon by balloon.',
    'Reply with JSON only (no other text, no code fence) in exactly this shape:',
    '{"language":"en-US","mood":"tense","intensity":2,"ambience":"city","panels":[{"panel":2,"mood":"action","intensity":3}],"lines":[{"panel":1,"x":0.42,"y":0.18,"kind":"speech","speaker":"Batman","voice":"man","tone":"normal","text":"We need to go."},{"panel":2,"x":0.6,"y":0.55,"kind":"sfx","sound":"explosion","speaker":"","voice":"man","tone":"normal","text":"Kaboom"}]}',
    'Rules:',
    '- kind: speech (speech balloon), thought (thought balloon), caption (narration box) or sfx (sound effect lettering such as BOOM).',
    '- text: the exact words, but in normal sentence case instead of ALL CAPITALS, joining words split across lines. Keep the language of the page. No quotation marks around it.',
    '- x and y: the centre of the balloon, caption or sound effect, as fractions of the page width and height (0 = left or top edge, 1 = right or bottom edge), two decimals.',
    '- panel: the number of the numbered outline it sits in, or 0 when the page has no numbered outlines or it sits outside them.',
    '- speaker: the character speaking (their name if the page shows it, otherwise a short description such as "old man"); "narrator" for captions. Use the same name for the same character on every page.',
    '- voice: one of narrator, man, woman, boy, girl, old man, old woman, creature, robot. Use boy or girl only for young children; teenagers are man or woman. Old man and old woman are for the elderly.',
    '- tone: one of normal, shout, whisper, sad, angry, scared, laugh.',
    '- language: the BCP 47 code of the lettering, such as en-US, pt-BR or es-ES.',
    `- sound (sound effects only): what it sounds like, one of ${SOUNDS.join(', ')}.`,
    'The page also gets background music and sound, so describe the scene:',
    `- mood: the feeling of the page for its music, one of ${MOODS.join(', ')}.`,
    '- intensity: 1 (gentle), 2 or 3 (strongest).',
    `- ambience: the background sound of the place, one of ${AMBIENCES.join(', ')}.`,
    '- panels: only for panels whose mood, intensity or ambience differ from the page, e.g. [{"panel":3,"mood":"action","intensity":3}]; otherwise [].',
    '- Leave out page numbers, credits, logos, signs and background writing that is not dialogue, a caption or a sound effect.',
    '- A page without text still gets mood, intensity and ambience, with "lines":[] (and "language":"und" if nothing is written).',
  ].join('\n');
}

/** The note sent with the page image. */
export function scriptRequestNote({ direction = 'ltr', panelCount = 0 } = {}) {
  const order = direction === 'rtl' ? 'right to left (manga order), top to bottom' : 'left to right, top to bottom';
  return `Reading order: ${order}. ` + (panelCount > 0
    ? `The coloured outlines numbered 1 to ${panelCount} mark the panels in reading order; they were drawn on the page for you and are not part of the art.`
    : 'No panels are marked on this page.');
}

/** A stable short description of panel rectangles (fractions of the page). */
export function panelsKeyOf(rects = []) {
  return (Array.isArray(rects) ? rects : []).map(rect => [rect.x, rect.y, rect.width, rect.height].map(value => Math.round((Number(value) || 0) * 1000)).join(',')).join(';');
}

const fraction = value => { const number = Number(value); return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : null; };
const word = (value, allowed, fallback) => { const text = String(value || '').trim().toLowerCase(); return allowed.has(text) ? text : fallback; };

/** Turn the AI's reply into a checked page script. Throws when there is none. */
export function parseScript(reply, { panelCount = 0, panelsKey = '' } = {}) {
  const text = String(reply || ''), start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw Object.assign(new Error('The AI did not describe this page.'), { type: 'empty_answer' });
  let data;
  try { data = JSON.parse(text.slice(start, end + 1)); } catch { throw Object.assign(new Error('The AI did not describe this page clearly.'), { type: 'empty_answer' }); }
  const language = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(String(data?.language || '')) && data.language !== 'und' ? String(data.language) : '';
  const lines = [];
  const intensityOf = value => { const number = Math.round(Number(value)); return number >= 1 && number <= 3 ? number : 0; };
  const scene = {
    mood: word(data?.mood, MOOD_SET, ''), intensity: intensityOf(data?.intensity), ambience: word(data?.ambience, AMBIENCE_SET, ''),
    panels: (Array.isArray(data?.panels) ? data.panels : []).filter(item => item && typeof item === 'object' && Number.isInteger(Number(item.panel)) && Number(item.panel) >= 1 && Number(item.panel) <= panelCount)
      .slice(0, 60).map(item => ({ panel: Number(item.panel), mood: word(item.mood, MOOD_SET, ''), intensity: intensityOf(item.intensity), ambience: word(item.ambience, AMBIENCE_SET, '') })),
  };
  for (const raw of Array.isArray(data?.lines) ? data.lines : []) {
    if (!raw || typeof raw !== 'object') continue;
    const words = String(raw.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
    if (!words) continue;
    const kind = word(raw.kind, KINDS, 'speech');
    const panel = Number.isInteger(Number(raw.panel)) && Number(raw.panel) >= 1 && Number(raw.panel) <= panelCount ? Number(raw.panel) : 0;
    const line = { panel, x: fraction(raw.x), y: fraction(raw.y), kind, tone: word(raw.tone, TONES, 'normal'),
      voice: word(raw.voice, VOICES, kind === 'caption' ? 'narrator' : 'man'), speaker: String(raw.speaker || '').trim().slice(0, 80), text: words };
    if (kind === 'sfx') line.sound = word(raw.sound, SOUND_SET, '') || classifySound(words);
    lines.push(line);
    if (lines.length >= MAX_LINES) break;
  }
  return { v: 1, language, panelsKey: panelCount > 0 ? panelsKey : '', ...scene, lines };
}

// Lettered sounds -> the sound effect that plays (when the AI did not say).
const SOUND_WORDS = [
  ['web', /thwi?pp?|thwp|thwap/], ['gunfire', /rat-?a-?tat|ratatat|brr+a+p|budda|dakka|takka|brakka|blat-?blat/], ['explosion', /k?a-?boo+m|ba-?doo+m|kra-?boo+m|boo+m|fwoo+m|ka-?blam|kablooey|blooo?m/],
  ['thunder', /thunder|krakoo+m|kra+ck?-?a-?boo+m|rumble?ble/], ['gunshot', /\bbang|\bblam|\bblat|\bkrack?-?ow|\bbla+m|\bpakow|\bchak/], ['laser', /\bpew|zarr?k|zwa+p|vwee|zee+ow/],
  ['zap', /zz+a?p|z+a+p|bzz+t?|kzz+t?|zzt|crackle|vzz+t?/], ['slash', /shi+n+g|schwi+n+g|shink|snikt|slash|slice|shunk|chi+ng/], ['web', /thwip/], ['glass', /tinkle|shatter|kr?i?ssh|krsh|crsh/],
  ['crash', /crash|krash|kerash|smash|kersmash|wreck/], ['punch', /\bk?a?pow|wha+m|thwa+ck|wha+ck|sma+ck|\bba+m|biff|\bsock|thok|kra+k|\bwhap|kapow|\bpunch|\boof|\bwump/], ['whoosh', /wh?oo+sh|fwoo+sh|swoo+sh|zoo+m|whsh|fwip|swish|vwoo+sh|whizz?/],
  ['thud', /thu+d|thu+mp|flump|clunk|klunk|plop|whump|\bdoof/], ['footsteps', /tap tap|stomp|clomp|tromp|step|kla+k|clack/], ['knock', /knock|\btok\b|rap rap/], ['door', /slam|cree+a+k|ka-?chunk|\bchunk|\bclick/],
  ['metal', /cla+ng|kla+ng|kling|cla+nk|kla+nk|\btang|\btin+g|\bdink/], ['splash', /splash|sploo+sh|splish|splosh|splat|glug|blub|bloop/], ['roar', /roa+r|rawr|ra+a+rgh|gra+a+h|gr+o+a+r|snarl|\bgrr+/],
  ['alarm', /wee-?oo|weeoo|whoop|alarm|blare|\bwail/], ['beep', /bee+p|\bbip|\bblip|\bboop|blee+p|\bping/], ['ring', /\bri+n+g|brr+i+n+g|\bdi+n+g|\bdo+n+g|\bbo+n+g/], ['engine', /vroo+m|vrr+|brr+m|\bputt|\bchug/],
  ['screech', /scree+ch|skree+|skrr+|scree+|squeal|ee+ee+/], ['magic', /shimmer|sparkle|twinkle|vworp|\bglow/], ['boing', /boi+n+g|sproi+n+g|bwoi+n+g/], ['pop', /\bpop\b|\bplip|\bplink|\bblop/],
  ['snap', /\bsnap|\bcra+ck|\bsnik/], ['heartbeat', /ba-?dump|bu-?dump|ba-?bump|lub-?dub|thump-?thump/], ['fire', /\bfoo+m|whoo+m|frooo+sh/], ['rumble', /rumble|rmmbl|\brrr+|tremble|\bshake/], ['crunch', /crunch|krunch|munch|chomp/],
];
export function classifySound(text) {
  const t = String(text || '').toLowerCase();
  for (const [sound, pattern] of SOUND_WORDS) if (pattern.test(t)) return sound;
  return /[ou]{2,}|[ou]m+\b/.test(t) ? 'thud' : 'whoosh';
}

// A page read before this feature has no mood: guess one from how people speak.
function guessMood(lines) {
  if (!lines.length) return 'calm';
  const count = tone => lines.filter(line => line.tone === tone).length, loud = count('shout') + count('angry') + count('scared');
  if (lines.some(line => line.kind === 'sfx') && loud) return 'action';
  if (loud * 2 >= lines.length) return 'tense';
  if (count('sad') * 2 >= lines.length) return 'sad';
  if (count('laugh') * 2 >= lines.length) return 'happy';
  return 'calm';
}

/** The music and background sound for one reading step (numbered panel or the page). */
export function sceneForStep(script, { panelNumber = 0 } = {}) {
  const lines = Array.isArray(script?.lines) ? script.lines : [];
  const page = { mood: script?.mood || guessMood(lines), intensity: script?.intensity || 2, ambience: script?.ambience || 'none' };
  const special = panelNumber > 0 && Array.isArray(script?.panels) ? script.panels.find(item => item.panel === panelNumber) : null;
  return special ? { mood: special.mood || page.mood, intensity: special.intensity || page.intensity, ambience: special.ambience || page.ambience } : page;
}

function containing(rects, x, y) {
  if (x === null || y === null) return -1;
  for (let index = 0; index < rects.length; index++) {
    const rect = rects[index];
    if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) return index;
  }
  let best = -1, distance = Infinity;
  for (let index = 0; index < rects.length; index++) {
    const rect = rects[index], dx = Math.max(rect.x - x, 0, x - rect.x - rect.width), dy = Math.max(rect.y - y, 0, y - rect.y - rect.height);
    if (dx * dx + dy * dy < distance) { distance = dx * dx + dy * dy; best = index; }
  }
  return best;
}

/**
 * The lines to read for one reading step: every line of a whole page, or the
 * lines of one panel (or part). The AI's panel numbers are used when they were
 * made for these same panels; otherwise each line goes where its centre is.
 * Sound effects are left out unless `sounds` is set (they play, not read).
 */
export function linesForStep(script, { rects = [], panel = 0, overview = false, panelsKey = '', numberedRects = rects, sounds = false } = {}) {
  const lines = (Array.isArray(script?.lines) ? script.lines : []).filter(line => sounds || line.kind !== 'sfx');
  if (overview || !lines.length) return [];
  if (!rects.length) return lines;
  const numbered = Boolean(script.panelsKey) && script.panelsKey === panelsKey;
  // The steps can hold more than the numbered panels (areas outside them).
  const same = (a, b) => Boolean(a && b) && ['x', 'y', 'width', 'height'].every(name => Math.abs(a[name] - b[name]) < 1e-6);
  let previous = 0;
  return lines.filter(line => {
    let index = -1;
    if (numbered && line.panel >= 1 && line.panel <= numberedRects.length) index = rects.findIndex(rect => same(rect, numberedRects[line.panel - 1]));
    if (index < 0) index = containing(rects, line.x, line.y);
    // A line with no place stays with the line before it.
    if (index < 0) index = previous;
    previous = index;
    return index === panel;
  });
}

/** The best device voice for a language (exact region first, nicer voices preferred). */
export function pickVoice(voices, language) {
  if (!Array.isArray(voices) || !voices.length || !language) return null;
  const wanted = String(language).toLowerCase().replace('_', '-'), base = wanted.split('-')[0];
  let best = null, bestScore = -1;
  for (const voice of voices) {
    const lang = String(voice?.lang || '').toLowerCase().replace('_', '-');
    let score = lang === wanted ? 4 : lang.split('-')[0] === base ? 2 : -1;
    if (score < 0) continue;
    if (/enhanced|premium|natural|neural|google/i.test(String(voice.name || ''))) score += 1;
    if (voice.localService) score += .5;
    if (voice.default) score += .25;
    if (score > bestScore) { best = voice; bestScore = score; }
  }
  return best;
}

const TONE = { normal: [1, 1, 1], shout: [1.06, 1.12, 1], whisper: [.92, .96, .55], sad: [.9, .93, .9], angry: [1.05, 1.04, 1], scared: [1.1, 1.08, .95], laugh: [1.04, 1.1, 1] };
const PITCH = { narrator: .97, man: .9, woman: 1.12, boy: 1.24, girl: 1.3, 'old man': .82, 'old woman': 1.02, creature: .7, robot: .8 };

/** How one line is spoken: a little faster for shouting, softer for whispers, and so on. */
export function utteranceSettings(line = {}, speed = 1) {
  const [rate, pitch, volume] = TONE[line.tone] || TONE.normal;
  const thought = line.kind === 'thought', caption = line.kind === 'caption';
  const clamp = (value, low, high) => Math.round(Math.min(high, Math.max(low, value)) * 100) / 100;
  return {
    rate: clamp(rate * (thought ? .96 : 1) * (Number(speed) > 0 ? Number(speed) : 1) * (line.voice === 'robot' ? .95 : 1), .5, 2),
    pitch: clamp(pitch * (PITCH[line.voice] || 1) * (caption ? .98 : 1), .5, 2),
    volume: clamp(volume * (thought ? .85 : 1), .1, 1),
  };
}

/** Reads lines one after another with the device voice; cancel() stops at once. */
export function createSpeaker({ synth = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let generation = 0;
  const available = () => Boolean(synth && typeof synth.speak === 'function' && typeof Utterance === 'function');
  const voices = () => { try { return synth.getVoices() || []; } catch { return []; } };
  function cancel() { generation++; try { synth?.cancel(); } catch {} }
  function speakOne(line, { language, voice, speed }) {
    return new Promise(resolve => {
      let finished = false, timer;
      const done = () => { if (finished) return; finished = true; clearTimeout(timer); resolve(); };
      try {
        const utterance = new Utterance(line.text), settings = utteranceSettings(line, speed);
        if (language) utterance.lang = language;
        if (voice) utterance.voice = voice;
        utterance.rate = settings.rate; utterance.pitch = settings.pitch; utterance.volume = settings.volume;
        utterance.onend = done; utterance.onerror = done;
        // Some voices never report the end: give up well after it should be over.
        timer = setTimeout(done, 4000 + line.text.length * 130 / settings.rate);
        synth.speak(utterance);
      } catch { done(); }
    });
  }
  return {
    available,
    // Called from the tap that starts reading, so the browser lets it speak.
    unlock() {
      if (!available()) return;
      try { const utterance = new Utterance(' '); utterance.volume = 0; synth.speak(utterance); } catch {}
    },
    cancel,
    async speak(lines, { language = '', speed = 1 } = {}) {
      if (!available()) return false;
      cancel(); const mine = generation;
      await wait(60);
      const voice = pickVoice(voices(), language);
      for (let index = 0; index < lines.length; index++) {
        if (mine !== generation) return false;
        await speakOne(lines[index], { language, voice, speed });
        if (mine !== generation) return false;
        if (index < lines.length - 1) await wait(220);
      }
      return mine === generation;
    },
  };
}

/** Ask the AI for one page's script. `image` is a base64 JPEG. */
export async function requestPageScript({ key, image, panelCount = 0, panelsKey = '', direction = 'ltr', signal, model = READ_ALOUD_MODEL, fetchImpl = globalThis.fetch?.bind(globalThis) }) {
  if (!key) throw Object.assign(new Error('No AI key.'), { type: 'no_key' });
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal, credentials: 'omit', referrerPolicy: 'no-referrer',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model, max_tokens: 4096, system: scriptInstructions(), messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
      { type: 'text', text: scriptRequestNote({ direction, panelCount }) },
    ] }] }),
  });
  if (!response.ok) {
    let detail = '', type = ''; try { const json = await response.json(); detail = json?.error?.message || ''; type = json?.error?.type || ''; } catch {}
    throw Object.assign(new Error(detail || `HTTP ${response.status}`), { status: response.status, type });
  }
  const json = await response.json();
  const reply = (Array.isArray(json?.content) ? json.content : []).filter(block => block?.type === 'text').map(block => block.text).join('');
  return parseScript(reply, { panelCount, panelsKey });
}

/** A smaller copy of the page for the AI, with the panels outlined and numbered. */
export function pageImageForScript(drawable, rects = [], { longSide = 1568, quality = .85 } = {}) {
  const width = drawable?.naturalWidth || drawable?.width, height = drawable?.naturalHeight || drawable?.height;
  if (!width || !height) throw new Error('The page is not ready.');
  const scale = Math.min(1, longSide / Math.max(width, height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('The page is not ready.');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(drawable, 0, 0, canvas.width, canvas.height);
  const line = Math.max(3, Math.round(Math.min(canvas.width, canvas.height) * .006)), radius = Math.max(14, Math.round(Math.min(canvas.width, canvas.height) * .028));
  rects.forEach((rect, index) => {
    const x = rect.x * canvas.width, y = rect.y * canvas.height, w = rect.width * canvas.width, h = rect.height * canvas.height;
    context.strokeStyle = '#ff2bd6'; context.lineWidth = line; context.strokeRect(x + line / 2, y + line / 2, Math.max(1, w - line), Math.max(1, h - line));
    const cx = x + radius + line, cy = y + radius + line;
    context.fillStyle = '#ff2bd6'; context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#ffffff'; context.font = `bold ${Math.round(radius * 1.15)}px sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(String(index + 1), cx, cy + 1);
  });
  const data = canvas.toDataURL('image/jpeg', quality);
  canvas.width = 0; canvas.height = 0;
  return data.slice(data.indexOf(',') + 1);
}

/** Where one page's script is kept on the device. */
export function scriptKey(comic, page) {
  if (!comic || typeof comic.id !== 'string' || !comic.id || comic.id.length > 240 || page === undefined || page === null) return null;
  const size = Number.isSafeInteger(comic.size) && comic.size > 0 ? comic.size : 0;
  return JSON.stringify(['aloud-v1', String(comic.source || ''), comic.id, size, String(comic.name || '').slice(0, 300), String(page)]);
}

/** Page scripts on this device; the oldest-used go beyond `maxEntries`. */
export class ScriptDisk {
  constructor({ name = 'cloudpanels-read-aloud-v1', maxEntries = 20000 } = {}) { this.name = name; this.maxEntries = maxEntries; this.opening = null; this.puts = 0; }
  _open() {
    if (!globalThis.indexedDB) return Promise.resolve(null);
    if (this.opening) return this.opening;
    this.opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1); let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('Read-aloud storage is unavailable.')); } }, 2500);
      request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains('scripts')) db.createObjectStore('scripts', { keyPath: 'key' }).createIndex('accessedAt', 'accessedAt'); };
      request.onsuccess = () => { clearTimeout(timer); if (done) { request.result.close(); return; } done = true; request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = () => { clearTimeout(timer); if (!done) { done = true; reject(request.error); } };
    }).catch(error => { this.opening = null; throw error; });
    return this.opening;
  }
  async _transaction(mode, action) {
    const db = await this._open(); if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('scripts', mode); let result = null;
      const timer = setTimeout(() => { try { tx.abort(); } catch {} reject(new Error('Read-aloud storage timed out.')); }, 2500);
      tx.oncomplete = () => { clearTimeout(timer); resolve(result); };
      tx.onerror = tx.onabort = () => { clearTimeout(timer); reject(tx.error || new Error('Read-aloud storage is unavailable.')); };
      action(tx.objectStore('scripts'), value => { result = value; });
    });
  }
  get(key) {
    return this._transaction('readwrite', (store, result) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const row = request.result;
        if (!row || row.script?.v !== 1 || !Array.isArray(row.script.lines)) return;
        if (!(row.accessedAt > Date.now() - 6 * 3600 * 1000)) store.put({ ...row, accessedAt: Date.now() });
        result(row.script);
      };
    });
  }
  async put(key, script) {
    await this._transaction('readwrite', store => { store.put({ key, script, accessedAt: Date.now() }); });
    if (++this.puts % 50 === 1) await this.trim();
  }
  trim() {
    return this._transaction('readwrite', store => {
      const counting = store.count();
      counting.onsuccess = () => {
        let extra = counting.result - this.maxEntries; if (extra <= 0) return;
        extra += Math.ceil(this.maxEntries * .05);
        const cursor = store.index('accessedAt').openCursor();
        cursor.onsuccess = () => { const at = cursor.result; if (!at || extra-- <= 0) return; at.delete(); at.continue(); };
      };
    });
  }
}
