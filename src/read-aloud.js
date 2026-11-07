// Read aloud (optional, off unless switched on in Panel options): the
// balloons of each page are read out loud with this device's own voice, panel
// by panel, and the reader moves on by itself. The assistant's AI (the user's
// own key) reads each page once; the result is kept on this device.

export const READ_ALOUD_MODEL = 'claude-sonnet-5-5';
// "scene" lines (audio description, optional): what each panel shows, for
// listening without looking (screen off). Only asked for when wanted.
const KINDS = new Set(['speech', 'thought', 'caption', 'sfx', 'scene']);
const TONES = new Set(['normal', 'shout', 'whisper', 'sad', 'angry', 'scared', 'laugh']);
const VOICES = new Set(['narrator', 'man', 'woman', 'boy', 'girl', 'old man', 'old woman', 'creature', 'robot']);
const MAX_LINES = 150;
// Music, background sound and sound effects (optional extras of read aloud).
export const MOODS = Object.freeze(['calm', 'happy', 'funny', 'romantic', 'sad', 'mystery', 'tense', 'action', 'scary', 'heroic', 'none']);
export const AMBIENCES = Object.freeze(['none', 'city', 'night', 'rain', 'storm', 'wind', 'indoors', 'fire', 'water', 'forest', 'space']);
export const SOUNDS = Object.freeze(['explosion', 'punch', 'slash', 'gunshot', 'gunfire', 'laser', 'zap', 'whoosh', 'web', 'crash', 'glass', 'thud', 'footsteps', 'knock', 'door', 'metal', 'thunder', 'splash', 'roar', 'alarm', 'beep', 'ring', 'engine', 'screech', 'magic', 'boing', 'pop', 'snap', 'heartbeat', 'fire', 'rumble', 'crunch']);
const MOOD_SET = new Set(MOODS), AMBIENCE_SET = new Set(AMBIENCES), SOUND_SET = new Set(SOUNDS);
// Balloon translator (optional): the languages lines can be translated into.
export const TRANSLATE_NAMES = Object.freeze({ 'pt-BR': 'Brazilian Portuguese', es: 'Spanish', en: 'English' });

/**
 * What the AI is asked to do with one page. With `describe`, it also writes a
 * short description of every panel (audio description), as "scene" lines.
 */
export function scriptInstructions({ describe = false, translate = '' } = {}) {
  const scene = describe ? '{"panel":1,"x":0.5,"y":0.2,"kind":"scene","text":"Batman crouches on a rooftop in the rain, watching the street below."},' : '';
  const into = TRANSLATE_NAMES[translate] || '';
  return [
    'You transcribe comic book pages for the read-aloud feature of a comic reader app.',
    'Look at the page and list the text a reader would read, in reading order: panel by panel, and within each panel balloon by balloon.',
    'Reply with JSON only (no other text, no code fence) in exactly this shape:',
    `{"language":"en-US","mood":"tense","intensity":2,"ambience":"city","panels":[{"panel":2,"mood":"action","intensity":3}],"lines":[${scene}{"panel":1,"x":0.42,"y":0.18,"kind":"speech","speaker":"Batman","voice":"man","tone":"normal","text":"We need to go."${into ? `,"translation":"(that line in ${into})"` : ''}},{"panel":2,"x":0.6,"y":0.55,"kind":"sfx","sound":"explosion","speaker":"","voice":"man","tone":"normal","text":"Kaboom"}]}`,
    'Rules:',
    `- kind: speech (speech balloon), thought (thought balloon), caption (narration box)${describe ? ', sfx (sound effect lettering such as BOOM) or scene (your description of a panel, see below).' : ' or sfx (sound effect lettering such as BOOM).'}`,
    '- text: the exact words, but in normal sentence case instead of ALL CAPITALS, joining words split across lines. Keep the language of the page. No quotation marks around it.',
    '- x and y: the centre of the balloon, caption or sound effect, as fractions of the page width and height (0 = left or top edge, 1 = right or bottom edge), two decimals.',
    '- panel: the number of the numbered outline it sits in, or 0 when the page has no numbered outlines or it sits outside them.',
    '- speaker: the character speaking (their name if the story shows it, otherwise a short description such as "old man"); "narrator" for captions. Use one name per person on every page, also when they appear in costume or under another name.',
    '- Who says each balloon: follow its tail (the pointer) to the character it points at, not to whoever is nearest. When two or more characters share a panel, check the tail of every balloon. Balloons joined together belong to one speaker; a tail pointing out of the panel is someone off-panel.',
    '- voice: one of narrator, man, woman, boy, girl, old man, old woman, creature, robot, by how the character looks (a woman is woman even when shouting). Use boy or girl only for young children; teenagers are man or woman. Old man and old woman are for the elderly. A character keeps the same voice on every page.',
    '- tone: one of normal, shout, whisper, sad, angry, scared, laugh.',
    '- language: the BCP 47 code of the lettering, such as en-US, pt-BR or es-ES.',
    `- sound (sound effects only): what it sounds like, one of ${SOUNDS.join(', ')}.`,
    'The page also gets background music and sound, so describe the scene:',
    `- mood: the feeling of the page for its music, one of ${MOODS.join(', ')}.`,
    '- intensity: 1 (gentle), 2 or 3 (strongest).',
    `- ambience: the background sound of the place, one of ${AMBIENCES.join(', ')}.`,
    '- panels: only for panels whose mood, intensity or ambience differ from the page, e.g. [{"panel":3,"mood":"action","intensity":3}]; otherwise [].',
    ...(into ? [`- translation (balloons and captions only): the line in ${into}, natural and short, as a comic in ${into} would say it, keeping names and the tone (slang stays slang).`] : []),
    '- Leave out page numbers, credits, logos, signs and background writing that is not dialogue, a caption or a sound effect.',
    describe
      ? '- A page without text still gets mood, intensity and ambience, and its scene lines (and "language":"und" if nothing is written).'
      : '- A page without text still gets mood, intensity and ambience, with "lines":[] (and "language":"und" if nothing is written).',
    ...(describe ? [
      'Audio description: the listener may not see the page (the screen may be off), so the lines also tell what each panel shows.',
      '- At the start of every panel, before its other lines, add one line with kind "scene" (also for a panel without text): one short sentence of at most 20 words, present tense, saying what the panel shows and what happens: who is there, what they do, and where when the place changes.',
      '- Write it in the language of the lettering (English if nothing is written). Use the same names as in speaker; describe anyone you cannot name in a few words ("a tall man in a red cape").',
      '- Do not repeat what the balloons say, do not read the lettering, and do not guess what is not shown.',
      '- A scene line has only panel, x, y, kind and text: the number of its panel, and as x and y the centre of that panel.',
    ] : []),
  ].join('\n');
}

/**
 * The note sent with the page image. `characters`: who was met on the pages
 * read before (name and voice), so the same people keep the same names and
 * voices from page to page.
 */
export function scriptRequestNote({ direction = 'ltr', panelCount = 0, characters = [] } = {}) {
  const order = direction === 'rtl' ? 'right to left (manga order), top to bottom' : 'left to right, top to bottom';
  const known = (Array.isArray(characters) ? characters : []).filter(person => person && String(person.name || '').trim()).slice(0, 30)
    .map(person => `${String(person.name).replace(/[\s;()]+/g, ' ').trim().slice(0, 60)} (${VOICES.has(person.voice) ? person.voice : 'man'})`);
  return `Reading order: ${order}. ` + (panelCount > 0
    ? `The coloured outlines numbered 1 to ${panelCount} mark the panels in reading order; they were drawn on the page for you and are not part of the art.`
    : 'No panels are marked on this page.')
    + (known.length ? ` Characters met on the pages before (name and voice): ${known.join('; ')}. When one of them speaks here, use exactly that name; keep their voice unless this page clearly shows it is wrong.` : '');
}

/** A stable short description of panel rectangles (fractions of the page). */
export function panelsKeyOf(rects = []) {
  return (Array.isArray(rects) ? rects : []).map(rect => [rect.x, rect.y, rect.width, rect.height].map(value => Math.round((Number(value) || 0) * 1000)).join(',')).join(';');
}

const fraction = value => { const number = Number(value); return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : null; };
const word = (value, allowed, fallback) => { const text = String(value || '').trim().toLowerCase(); return allowed.has(text) ? text : fallback; };

/**
 * Turn the AI's reply into a checked page script. Throws when there is none.
 * `describe`: it was asked for scene descriptions (kept as `described`).
 */
export function parseScript(reply, { panelCount = 0, panelsKey = '', describe = false, translate = '' } = {}) {
  const text = String(reply || ''), start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw Object.assign(new Error('The AI did not describe this page.'), { type: 'empty_answer' });
  let data;
  try { data = JSON.parse(text.slice(start, end + 1)); } catch { throw Object.assign(new Error('The AI did not describe this page clearly.'), { type: 'empty_answer' }); }
  const language = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(String(data?.language || '')) && data.language !== 'und' ? String(data.language) : '';
  const lines = [], translated = [];
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
    // Descriptions only when they were asked for; always told by the narrator.
    if (kind === 'scene' && !describe) continue;
    const panel = Number.isInteger(Number(raw.panel)) && Number(raw.panel) >= 1 && Number(raw.panel) <= panelCount ? Number(raw.panel) : 0;
    const line = kind === 'scene'
      ? { panel, x: fraction(raw.x), y: fraction(raw.y), kind, tone: 'normal', voice: 'narrator', speaker: 'narrator', text: words.slice(0, 300) }
      : { panel, x: fraction(raw.x), y: fraction(raw.y), kind, tone: word(raw.tone, TONES, 'normal'),
        voice: word(raw.voice, VOICES, kind === 'caption' ? 'narrator' : 'man'), speaker: String(raw.speaker || '').trim().slice(0, 80), text: words };
    if (kind === 'sfx') line.sound = word(raw.sound, SOUND_SET, '') || classifySound(words);
    lines.push(line);
    translated.push(kind === 'sfx' || kind === 'scene' ? '' : String(raw.translation ?? '').replace(/\s+/g, ' ').trim().slice(0, 600));
    if (lines.length >= MAX_LINES) break;
  }
  return { v: 1, language, panelsKey: panelCount > 0 ? panelsKey : '', ...scene, lines, ...(describe ? { described: true } : {}),
    ...(TRANSLATE_NAMES[translate] ? { translations: { [translate]: translated } } : {}) };
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
function guessMood(all) {
  const lines = all.filter(line => line.kind !== 'scene');
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
 * Sound effects are left out unless `sounds` is set (they play, not read), and
 * scene descriptions unless `scenes` is set (they come first in their panel).
 */
export function linesForStep(script, { rects = [], panel = 0, overview = false, panelsKey = '', numberedRects = rects, sounds = false, scenes = false } = {}) {
  const lines = (Array.isArray(script?.lines) ? script.lines : []).filter(line => (sounds || line.kind !== 'sfx') && (scenes || line.kind !== 'scene'));
  if (overview || !lines.length) return [];
  if (!rects.length) return lines;
  const numbered = Boolean(script.panelsKey) && script.panelsKey === panelsKey;
  // By its place on the page: among the whole steps (a close view of balloons reaches over
  // its neighbours; the one showing a line's balloon is chosen in closeViews).
  const whole = rects.map((rect, index) => rect?.part ? -1 : index).filter(index => index >= 0);
  const placeOf = (x, y) => {
    if (!whole.length || whole.length === rects.length) return containing(rects, x, y);
    const found = containing(whole.map(index => rects[index]), x, y);
    return found < 0 ? -1 : whole[found];
  };
  // The steps can hold more than the numbered panels (areas outside them).
  const same = (a, b) => Boolean(a && b) && ['x', 'y', 'width', 'height'].every(name => Math.abs(a[name] - b[name]) < 1e-6);
  const places = lines.map(line => {
    let index = -1;
    // (A panel grown to take in a balloon breaking out of it is still that panel.)
    if (numbered && line.panel >= 1 && line.panel <= numberedRects.length) index = rects.findIndex(rect => !rect.part && same(rect.source || rect, numberedRects[line.panel - 1]));
    return index < 0 ? placeOf(line.x, line.y) : index;
  });
  // A description with no place belongs to the panel after it (it opens it).
  for (let index = places.length - 1, next = -1; index >= 0; index--) {
    if (places[index] >= 0) next = places[index]; else if (lines[index].kind === 'scene' && next >= 0) places[index] = next;
  }
  // Any other line with no place stays with the line before it.
  let previous = 0;
  for (let index = 0; index < places.length; index++) { if (places[index] < 0) places[index] = previous; previous = places[index]; }
  closeViews(lines, places, rects);
  const step = lines.filter((line, index) => places[index] === panel);
  return scenes ? [...step.filter(line => line.kind === 'scene'), ...step.filter(line => line.kind !== 'scene')] : step;
}

// Readable balloons: a panel shown whole and then in close views (see
// readable-steps.js). Each line goes to the view showing its balloon; a line
// whose balloon is not among them stays with the line before it, and the
// descriptions of the panel with the panel shown whole.
function closeViews(lines, places, rects) {
  const chosen = new Map();
  for (let index = 0; index < lines.length; index++) {
    const family = rects[places[index]]?.family;
    if (family === undefined) continue;
    const views = [], whole = rects.findIndex(rect => rect.family === family && !rect.part);
    rects.forEach((rect, at) => { if (rect.family === family && rect.part) views.push(at); });
    if (!views.length) continue;
    const opening = whole >= 0 ? whole : views[0], line = lines[index];
    if (line.kind === 'scene') { places[index] = opening; continue; }
    let best = -1, nearest = .08;
    if (line.x !== null && line.y !== null && Number.isFinite(line.x) && Number.isFinite(line.y)) {
      for (const at of views) for (const box of rects[at].balloons || []) {
        const gap = Math.hypot(Math.max(box.x - line.x, 0, line.x - box.x - box.width), Math.max(box.y - line.y, 0, line.y - box.y - box.height));
        if (gap < nearest || (gap === 0 && best < 0)) { nearest = gap; best = at; }
      }
    }
    places[index] = best >= 0 ? best : chosen.has(family) ? chosen.get(family) : opening;
    chosen.set(family, places[index]);
  }
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
  const thought = line.kind === 'thought', caption = line.kind === 'caption' || line.kind === 'scene';
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

/** Ask the AI for one page's script. `image` is a base64 JPEG; `describe` adds scene descriptions. */
export async function requestPageScript({ key, image, panelCount = 0, panelsKey = '', direction = 'ltr', describe = false, translate = '', characters = [], signal, model = READ_ALOUD_MODEL, fetchImpl = globalThis.fetch?.bind(globalThis) }) {
  if (!key) throw Object.assign(new Error('No AI key.'), { type: 'no_key' });
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal, credentials: 'omit', referrerPolicy: 'no-referrer',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model, max_tokens: 4096, system: scriptInstructions({ describe, translate }), messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
      { type: 'text', text: scriptRequestNote({ direction, panelCount, characters }) },
    ] }] }),
  });
  if (!response.ok) {
    let detail = '', type = ''; try { const json = await response.json(); detail = json?.error?.message || ''; type = json?.error?.type || ''; } catch {}
    throw Object.assign(new Error(detail || `HTTP ${response.status}`), { status: response.status, type });
  }
  const json = await response.json();
  const reply = (Array.isArray(json?.content) ? json.content : []).filter(block => block?.type === 'text').map(block => block.text).join('');
  return parseScript(reply, { panelCount, panelsKey, describe, translate });
}

/**
 * Balloon translator: the lines of a page already read, translated (text only,
 * no picture, so it costs very little). Returns one translation per line, in
 * order ('' for sound effects and scene descriptions).
 */
export async function requestTranslations({ key, lines = [], language = 'pt-BR', signal, model = READ_ALOUD_MODEL, fetchImpl = globalThis.fetch?.bind(globalThis) }) {
  if (!key) throw Object.assign(new Error('No AI key.'), { type: 'no_key' });
  const into = TRANSLATE_NAMES[language] || TRANSLATE_NAMES['pt-BR'];
  const wanted = lines.map((line, index) => ({ index, line })).filter(({ line }) => line && line.kind !== 'sfx' && line.kind !== 'scene' && String(line.text || '').trim());
  const result = lines.map(() => '');
  if (!wanted.length) return result;
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal, credentials: 'omit', referrerPolicy: 'no-referrer',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model, max_tokens: 2048, system: [
      `You translate the balloons of a comic book page into ${into} for a reader who is learning the language of the comic.`,
      `Reply with JSON only (no other text, no code fence): {"translations":["...","..."]}, one translation for each line given, in the same order.`,
      `Translate naturally, as a comic in ${into} would say it, keeping names, the tone and slang. Explain nothing.`,
    ].join('\n'), messages: [{ role: 'user', content: JSON.stringify(wanted.map(({ line }) => ({ speaker: String(line.speaker || ''), text: String(line.text) }))) }] }),
  });
  if (!response.ok) {
    let detail = '', type = ''; try { const json = await response.json(); detail = json?.error?.message || ''; type = json?.error?.type || ''; } catch {}
    throw Object.assign(new Error(detail || `HTTP ${response.status}`), { status: response.status, type });
  }
  const json = await response.json();
  const reply = (Array.isArray(json?.content) ? json.content : []).filter(block => block?.type === 'text').map(block => block.text).join('');
  const start = reply.indexOf('{'), end = reply.lastIndexOf('}');
  let list = [];
  try { list = JSON.parse(reply.slice(start, end + 1))?.translations; } catch { list = []; }
  if (!Array.isArray(list) || !list.length) throw Object.assign(new Error('The AI did not translate this page.'), { type: 'empty_answer' });
  wanted.forEach(({ index }, at) => { result[index] = String(list[at] ?? '').replace(/\s+/g, ' ').trim().slice(0, 600); });
  return result;
}

/** The balloon nearest to a point of the page (fractions), or null if none is close. */
export function balloonAt(script, x, y, { aspect = 1.5, reach = .2 } = {}) {
  let best = null, nearest = Infinity;
  (Array.isArray(script?.lines) ? script.lines : []).forEach((line, index) => {
    if (!line || line.kind === 'sfx' || line.kind === 'scene' || line.x === null || line.y === null || !Number.isFinite(line.x) || !Number.isFinite(line.y)) return;
    const distance = Math.hypot(line.x - x, (line.y - y) * aspect);
    if (distance < nearest) { nearest = distance; best = { line, index }; }
  });
  return nearest <= reach ? best : null;
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
