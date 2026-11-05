// Background music, background sound and sound effects for read aloud
// (optional extras). Everything is made on this device with Web Audio:
// nothing is downloaded and nothing costs anything. The music follows the
// mood and intensity of each page; the sound effects follow the lettering.

const mtof = midi => 440 * 2 ** ((midi - 69) / 12);
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10] };
const degreeNote = (root, scale, degree) => root + 12 * Math.floor(degree / 7) + scale[((degree % 7) + 7) % 7];
const chordOf = (root, scale, degree, size = 3, step = 2) => Array.from({ length: size }, (_, index) => degreeNote(root, scale, degree + index * step));
function seeded(text) {
  let state = 2166136261;
  for (const ch of String(text)) state = Math.imul(state ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 4294967296; };
}

// ---- The music: one recipe per mood (tempo, key, chords and what plays when) ----
// `m` gives the time `t`, the 16th-note position `pos` (0-15) in the bar, the
// bar number, the chord, the intensity (1-3), a repeatable random `rnd` and the
// instruments (each plays into this mood's own volume control).
export const MUSIC = {
  calm: { bpm: 72, root: 62, scale: 'major', chords: [0, 5, 3, 4], bars: 2, level: 0.9, wet: .5, play(m) {
    if (m.chordStart) m.pad(m.t, m.bar2, m.chord(-12), { gain: .13, cutoff: 1300, type: 'triangle', a: 1.2 });
    if (m.pos % 8 === 0 && m.rnd() < .6) m.bell(m.t, m.pick(m.chord(12)), { gain: .035, decay: 2.6 });
    if (m.intensity >= 2 && m.pos % 2 === 0) m.pluck(m.t, m.chord(0)[(m.pos / 2) % 3], { gain: .022, decay: .5 });
    if (m.intensity >= 3 && m.pos === 0) m.bass(m.t, m.beat * 3.5, m.chord(-24)[0], { gain: .09, type: 'triangle', cutoff: 500 });
  } },
  happy: { bpm: 112, root: 55, scale: 'major', chords: [0, 4, 5, 3], bars: 1, level: 0.9, wet: .25, play(m) {
    const notes = m.chord(12);
    if (m.pos % 2 === 0) m.pluck(m.t, [notes[0], notes[1], notes[2], notes[1]][(m.pos / 2) % 4], { gain: .045, decay: .25 });
    if (m.pos === 0 || m.pos === 8) m.bass(m.t, m.beat * .8, m.chord(-12)[0], { gain: .12, type: 'triangle', cutoff: 900 });
    if (m.pos === 6 || m.pos === 14) m.bass(m.t, m.beat * .5, m.chord(-12)[2] - 12, { gain: .09, type: 'triangle', cutoff: 900 });
    if (m.pos % 4 === 2) m.hat(m.t, { gain: .022 });
    if (m.intensity >= 2) { if (m.pos === 0 || m.pos === 8) m.kick(m.t, { gain: .22 }); if (m.pos === 4 || m.pos === 12) m.snare(m.t, { gain: .06 }); }
    if (m.chordStart) m.pad(m.t, m.barLength, m.chord(0), { gain: .045, cutoff: 1600 });
    if (m.intensity >= 3 && m.pos % 4 === 0 && m.rnd() < .7) m.bell(m.t, m.pick(m.chord(24)), { gain: .028, decay: 1.2 });
  } },
  funny: { bpm: 124, root: 53, scale: 'major', chords: [0, 3, 4, 0], bars: 1, level: 2.2, wet: .15, play(m) {
    if (m.pos % 4 === 0) m.pluck(m.t, m.pos % 8 === 0 ? m.chord(-12)[0] : m.chord(-12)[2] - 12, { gain: .1, decay: .18, type: 'square', cutoff: 900 });
    if (m.pos % 2 === 0 && m.rnd() < .65) m.bell(m.t, m.walk(m.chord(12)), { gain: .04, decay: .35, ratio: 4, index: .8 });
    if (m.pos % 4 === 2) m.block(m.t, { gain: .045, freq: m.pos === 6 ? 1500 : 1100 });
    if (m.intensity >= 2 && m.pos === 12 && m.rnd() < .5) m.boing(m.t, { gain: .05 });
  } },
  romantic: { bpm: 66, root: 51, scale: 'major', chords: [0, 5, 1, 4], bars: 2, level: 1.12, wet: .5, play(m) {
    if (m.chordStart) { m.pad(m.t, m.bar2, m.chord(-12, 4), { gain: .1, cutoff: 1100, type: 'triangle', a: 1.4 }); for (const [index, note] of m.chord(0, 4).entries()) m.ep(m.t + index * m.step * 2, note, { gain: .035 }); }
    if (m.pos % 4 === 0 && !m.chordStart && m.rnd() < .45) m.ep(m.t, m.walk(m.chord(12, 4)), { gain: .03 });
    if (m.intensity >= 2 && m.pos === 8) m.bass(m.t, m.beat * 3.5, m.chord(-24)[0], { gain: .08, type: 'sine', cutoff: 400 });
  } },
  sad: { bpm: 60, root: 57, scale: 'minor', chords: [0, 5, 2, 6], bars: 2, level: 0.95, wet: .55, play(m) {
    if (m.chordStart) m.pad(m.t, m.bar2, m.chord(-12), { gain: .12, cutoff: 950, a: 1.6 });
    if (m.pos % 4 === 0 && m.rnd() < .55) m.ep(m.t, m.walk(m.chord(12)), { gain: .04 });
    if (m.intensity >= 2 && m.chordStart) m.bass(m.t, m.bar2 - m.beat, m.chord(-24)[0], { gain: .08, type: 'sine', cutoff: 300 });
    if (m.intensity >= 3 && m.pos === 8) m.pad(m.t, m.barLength, [m.chord(-12)[0] - 12], { gain: .07, cutoff: 600, a: .6 });
  } },
  mystery: { bpm: 84, root: 49, scale: 'harmonic', chords: [0, 5, 3, 4], bars: 2, level: 1.5, wet: .6, play(m) {
    const r = m.chord(12)[0], figure = [0, 3, 7, 11, 7, 3];
    if (m.pos % 2 === 0) { const note = r + figure[(m.pos / 2) % figure.length]; m.pluck(m.t, note, { gain: .03, decay: .4 }); m.pluck(m.t + m.step * 3, note, { gain: .012, decay: .4 }); }
    if (m.chordStart) m.pad(m.t, m.bar2, m.chord(-12), { gain: .08, cutoff: 750, a: 1.5 });
    if (m.pos === 0 && m.rnd() < .35) m.bell(m.t, r + 24 + m.pick([0, 3, 7]), { gain: .02, decay: 3 });
    if (m.intensity >= 2 && m.pos % 4 === 0) m.kick(m.t, { gain: .1, f0: 70, f1: 38, decay: .5 });
  } },
  tense: { bpm: 92, root: 50, scale: 'phrygian', chords: [0, 1, 0, 6], bars: 2, level: 0.7, wet: .35, play(m) {
    if (m.chordStart) m.drone(m.t, m.bar2, [m.root - 12, m.root - 5], { gain: .11, cutoff: 420 });
    if (m.pos === 0 || (m.intensity >= 2 && m.pos === 8) || (m.intensity >= 3 && m.pos % 4 === 0)) m.heartbeat(m.t, { gain: .28 });
    if (m.intensity >= 2 && m.chordStart) m.tremolo(m.t, m.bar2, [m.root + 24, m.root + 25], { gain: .022 });
    if (m.intensity >= 3 && m.pos % 2 === 0) m.bass(m.t, m.step * 1.6, m.root - 12, { gain: .08, cutoff: 380 });
    if (m.intensity >= 2 && m.pos === 0 && m.bar % 4 === 0) m.boom(m.t, { gain: .2 });
    if (m.intensity >= 3 && m.pos === 0 && m.bar % 8 === 7) m.riser(m.t, m.barLength, { gain: .05 });
  } },
  action: { bpm: 140, root: 52, scale: 'minor', chords: [0, 5, 6, 0], bars: 1, level: 0.53, wet: .2, play(m) {
    const low = m.chord(-12)[0], pattern = [0, 0, 12, 0];
    if (m.intensity >= 3 || m.pos % 2 === 0) m.bass(m.t, m.step * .9, low + pattern[m.pos % 4], { gain: .11, cutoff: 950 });
    if ([0, 8].includes(m.pos) || (m.intensity >= 2 && [7, 10].includes(m.pos))) m.kick(m.t, { gain: .34 });
    if (m.intensity >= 2 && (m.pos === 4 || m.pos === 12)) m.snare(m.t, { gain: .15 });
    if (m.intensity >= 2 && (m.intensity >= 3 || m.pos % 2 === 0)) m.hat(m.t, { gain: m.pos % 4 === 2 ? .028 : .016 });
    if (m.intensity >= 2 && m.pos === 0) m.brass(m.t, m.step * 3, m.chord(0), { gain: .07 });
    if (m.intensity >= 3 && m.pos === 6) m.brass(m.t, m.step * 2, m.chord(0), { gain: .055 });
    if (m.intensity >= 3 && m.bar % 4 === 3 && m.pos >= 12) m.tom(m.t, m.root - 12 - (m.pos - 12) * 3, { gain: .2 });
    if (m.chordStart && m.intensity >= 2) m.pad(m.t, m.barLength, m.chord(-12), { gain: .045, cutoff: 1400, a: .3 });
  } },
  scary: { bpm: 60, root: 50, scale: 'phrygian', chords: [0], bars: 2, level: 1.2, wet: .7, play(m) {
    if (m.chordStart) { m.drone(m.t, m.bar2, [m.root - 24, m.root - 23, m.root - 18], { gain: .1, cutoff: 320 }); m.noiseBed(m.t, m.bar2, { gain: .025, freq: 420, q: .8, sweep: 900 }); }
    if (m.pos === 0 && m.rnd() < (m.intensity >= 2 ? .5 : .3)) m.metal(m.t + m.rnd() * m.beat * 2, { gain: .05 });
    if (m.chordStart && m.rnd() < .5) { const top = m.root + 36; m.glide(m.t + m.beat, m.beat * 5, mtof(top), mtof(top + (m.rnd() < .5 ? -1 : 1)), { gain: .012 }); }
    if (m.intensity >= 3 && m.pos === 0 && m.bar % 4 === 2) m.boom(m.t, { gain: .25 });
  } },
  heroic: { bpm: 100, root: 48, scale: 'mixolydian', chords: [0, 6, 3, 0], bars: 1, level: 0.67, wet: .3, play(m) {
    if (m.pos === 0 || m.pos === 8) m.brass(m.t, m.beat * 1.7, m.chord(0), { gain: .07 });
    if (m.pos === 0) m.timpani(m.t, m.chord(-12)[0], { gain: .28 });
    if (m.pos === 8) m.timpani(m.t, m.chord(-12)[2] - 12, { gain: .2 });
    if (m.intensity >= 2 && [12, 14, 15].includes(m.pos)) m.snare(m.t, { gain: .06 });
    if (m.chordStart) m.pad(m.t, m.barLength, m.chord(-12), { gain: .06, cutoff: 1500 });
    if (m.intensity >= 3 && m.pos % 4 === 0) m.bell(m.t, m.walk(m.chord(24)), { gain: .025, decay: 1.4 });
  } },
};

// ---- Background sound of the place (rain, wind, city...) ----
export const AMBIENCE = {
  city: { level: 1, play(a) {
    if (a.segmentStart) { a.noiseBed(a.t, a.segment, { gain: .05, freq: 260, brown: true }); a.noiseBed(a.t, a.segment, { gain: .012, freq: 750, type: 'bandpass', q: .5 }); }
    if (a.rnd() < .02) a.swell(a.t, 3, { gain: .02, from: 380, to: 900 });
    if (a.rnd() < .004) a.siren(a.t, 3.5, { gain: .005 });
  } },
  night: { level: 2.5, play(a) {
    if (a.segmentStart) a.noiseBed(a.t, a.segment, { gain: .012, freq: 500, type: 'bandpass', q: .7 });
    if (a.rnd() < .45) a.chirp(a.t + a.rnd() * .2, { gain: .005, freq: 4400 + a.rnd() * 400 });
  } },
  rain: { level: 0.5, play(a) {
    if (a.segmentStart) { a.noiseBed(a.t, a.segment, { gain: .055, freq: 1000, type: 'highpass', top: 6500 }); a.noiseBed(a.t, a.segment, { gain: .03, freq: 380, brown: true }); }
    for (let drop = 0; drop < 3; drop++) if (a.rnd() < .6) a.drop(a.t + a.rnd() * a.stepLength, { gain: .006 });
  } },
  storm: { level: 0.35, play(a) {
    if (a.segmentStart) { a.noiseBed(a.t, a.segment, { gain: .085, freq: 900, type: 'highpass', top: 6000 }); a.noiseBed(a.t, a.segment, { gain: .05, freq: 320, brown: true }); }
    if (a.rnd() < .012) a.sfx('thunder', a.t, { gain: .55, far: true });
  } },
  wind: { level: 1.4, play(a) { if (a.segmentStart) a.noiseBed(a.t, a.segment, { gain: .05, freq: 420, type: 'bandpass', q: 1.1, sweep: 950 }); } },
  indoors: { level: 1.7, play(a) { if (a.segmentStart) a.noiseBed(a.t, a.segment, { gain: .022, freq: 180, brown: true }); } },
  fire: { level: 1.25, play(a) {
    if (a.segmentStart) a.noiseBed(a.t, a.segment, { gain: .04, freq: 350, brown: true });
    const count = 1 + Math.floor(a.rnd() * 3);
    for (let index = 0; index < count; index++) a.crackle(a.t + a.rnd() * a.stepLength, { gain: .015 + a.rnd() * .03 });
  } },
  water: { level: 1.4, play(a) { if (a.segmentStart) a.wave(a.t, a.segment, { gain: .06 }); } },
  forest: { level: 2.5, play(a) {
    if (a.segmentStart) a.noiseBed(a.t, a.segment, { gain: .012, freq: 600, type: 'bandpass', q: .6 });
    if (a.rnd() < .08) { const notes = 2 + Math.floor(a.rnd() * 3); for (let index = 0; index < notes; index++) a.bird(a.t + index * .11, { gain: .008 }); }
  } },
  space: { level: 0.8, play(a) {
    if (a.segmentStart) { a.hum(a.t, a.segment, { gain: .018 }); a.noiseBed(a.t, a.segment, { gain: .018, freq: 130, brown: true }); }
    if (a.rnd() < .03) a.blip(a.t, { gain: .005 });
  } },
};

/** The sound engine (one per reader). Give `context` to render offline. */
export function createSoundscape({ context = null, make = () => { const Audio = globalThis.AudioContext || globalThis.webkitAudioContext; return new Audio({ latencyHint: 'playback' }); }, realtime = !context, onError = () => {} } = {}) {
  let ctx = context, built = false, white = null, brown = null, timer = 0, sleep = 0, ducks = 0, hum = null;
  let out, reverb, musicBus, musicWet, ambienceBus, sfxBus, voiceBus, voiceWet;
  const music = [], places = [], voices = new Set();
  const levels = { music: .55, ambience: .75, sfx: .75 };
  // Quieter sounds are lifted so every effect reads at a similar loudness.
  const BOOST = { web: 2, screech: 2, alarm: 1.8, beep: 1.6, ring: 1.6, magic: 1.4, slash: 1.4, whoosh: 1.4, laser: 1.3, zap: 1.3, footsteps: 1.3, knock: 1.3, splash: 1.3 };

  function build() {
    if (built) return ctx;
    if (!ctx) ctx = make();
    built = true;
    const rate = ctx.sampleRate;
    white = ctx.createBuffer(1, rate * 2, rate); brown = ctx.createBuffer(1, rate * 4, rate);
    const w = white.getChannelData(0), b = brown.getChannelData(0); let last = 0;
    const rnd = seeded('noise');
    for (let index = 0; index < w.length; index++) w[index] = rnd() * 2 - 1;
    for (let index = 0; index < b.length; index++) { last = (last + .02 * (rnd() * 2 - 1)) / 1.02; b[index] = last * 3.5; }
    // Glue and a safety limiter so nothing ever clips.
    const glue = ctx.createDynamicsCompressor(); glue.threshold.value = -16; glue.knee.value = 8; glue.ratio.value = 3; glue.attack.value = .004; glue.release.value = .3;
    const limit = ctx.createDynamicsCompressor(); limit.threshold.value = -3; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = .001; limit.release.value = .08;
    glue.connect(limit); limit.connect(ctx.destination); out = glue;
    // A soft hall for everything (made here, no file).
    reverb = ctx.createConvolver();
    const length = Math.round(rate * 2.2), impulse = ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel); let smooth = 0;
      for (let index = 0; index < length; index++) { smooth = smooth * .55 + (rnd() * 2 - 1) * .45; data[index] = smooth * Math.exp(-index / rate * 2.8) * (index < rate * .01 ? index / (rate * .01) : 1); }
    }
    reverb.buffer = impulse;
    const reverbOut = gain(.8); reverb.connect(reverbOut); reverbOut.connect(out);
    musicBus = gain(levels.music); musicBus.connect(out); musicWet = gain(1); musicWet.connect(reverb);
    ambienceBus = gain(levels.ambience); ambienceBus.connect(out);
    sfxBus = gain(levels.sfx); sfxBus.connect(out); const sfxWet = gain(.22); sfxBus.connect(sfxWet); sfxWet.connect(reverb);
    voiceBus = gain(1); voiceBus.connect(out); voiceWet = gain(.06); voiceBus.connect(voiceWet); voiceWet.connect(reverb);
    return ctx;
  }
  function gain(value = 1) { const node = ctx.createGain(); node.gain.value = value; return node; }
  function filter(type, frequency, q = .7) { const node = ctx.createBiquadFilter(); node.type = type; node.frequency.value = frequency; node.Q.value = q; return node; }
  const tidy = (source, ...nodes) => { source.onended = () => { for (const node of [source, ...nodes]) { try { node.disconnect(); } catch {} } }; };
  function tone(type, frequency, t, end, destination, detune = 0) {
    const node = ctx.createOscillator(); node.type = type; node.frequency.setValueAtTime(frequency, t);
    if (detune) node.detune.setValueAtTime(detune, t);
    node.connect(destination); node.start(t); node.stop(end); tidy(node); return node;
  }
  function noise(t, end, destination, { dark = false, offset = 0 } = {}) {
    const node = ctx.createBufferSource(); node.buffer = dark ? brown : white; node.loop = true;
    node.connect(destination); node.start(t, offset % (dark ? 3.5 : 1.5)); node.stop(end); tidy(node); return node;
  }
  // A gain that rises to `peak` and fades (exponential-like) over `decay`.
  function hit(t, peak, decay, attack = .002) { const node = gain(0); node.gain.setValueAtTime(0, t); node.gain.linearRampToValueAtTime(peak, t + attack); node.gain.setTargetAtTime(0, t + attack, decay / 4); return node; }
  function held(t, peak, duration, attack, release) {
    const node = gain(0); node.gain.setValueAtTime(0, t); node.gain.linearRampToValueAtTime(peak, t + attack);
    node.gain.setValueAtTime(peak, t + Math.max(attack, duration)); node.gain.linearRampToValueAtTime(0, t + Math.max(attack, duration) + release); return node;
  }

  // ---- Instruments (all play into `to`) ----
  const kit = to => ({
    pad(t, duration, notes, { gain: level = .1, cutoff = 1200, type = 'sawtooth', a = .9, r = 1.4, detune = 7 } = {}) {
      const end = t + duration + r + .05, lp = filter('lowpass', cutoff, .5), env = held(t, 1, duration, a, r), each = gain(level / Math.max(1, notes.length * 1.4));
      each.connect(lp); lp.connect(env); env.connect(to);
      lp.frequency.setValueAtTime(cutoff * .6, t); lp.frequency.linearRampToValueAtTime(cutoff, t + Math.min(duration, a * 2)); lp.frequency.linearRampToValueAtTime(cutoff * .75, end);
      let last; for (const note of notes) for (const d of [-detune, detune]) last = tone(type, mtof(note), t, end, each, d);
      tidy(last, each, lp, env);
    },
    bass(t, duration, note, { gain: level = .12, cutoff = 700, type = 'sawtooth' } = {}) {
      const lp = filter('lowpass', cutoff * 2, 1.1), env = gain(0), end = t + duration + .08;
      env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(level, t + .006); env.gain.setTargetAtTime(level * .6, t + .02, .08); env.gain.setValueAtTime(level * .6, t + duration); env.gain.linearRampToValueAtTime(0, end);
      lp.frequency.setTargetAtTime(cutoff, t, .05); lp.connect(env); env.connect(to);
      tone(type, mtof(note), t, end, lp); const sub = gain(.5); sub.connect(env); const last = tone('sine', mtof(note - 12), t, end, sub); tidy(last, sub, lp, env);
    },
    pluck(t, note, { gain: level = .05, decay = .35, type = 'triangle', cutoff = 3200 } = {}) {
      const lp = filter('lowpass', cutoff), env = hit(t, level, decay, .004); lp.connect(env); env.connect(to);
      lp.frequency.setValueAtTime(cutoff, t); lp.frequency.setTargetAtTime(cutoff * .25, t, decay / 2);
      tidy(tone(type, mtof(note), t, t + decay * 2.2 + .05, lp), lp, env);
    },
    bell(t, note, { gain: level = .04, decay = 2.4, ratio = 3.5, index = 2 } = {}) {
      const frequency = mtof(note), carrier = ctx.createOscillator(), modulator = ctx.createOscillator(), depth = gain(0), env = hit(t, level, decay, .003);
      carrier.frequency.value = frequency; modulator.frequency.value = frequency * ratio;
      depth.gain.setValueAtTime(frequency * index, t); depth.gain.setTargetAtTime(0, t, decay / 5);
      modulator.connect(depth); depth.connect(carrier.frequency); carrier.connect(env); env.connect(to);
      const end = t + decay * 1.6; carrier.start(t); modulator.start(t); carrier.stop(end); modulator.stop(end); tidy(modulator, depth); tidy(carrier, env);
    },
    ep(t, note, { gain: level = .04 } = {}) { this.bell(t, note, { gain: level, decay: 2.2, ratio: 1, index: 1.3 }); this.bell(t, note + 12, { gain: level * .25, decay: 1.2, ratio: 1, index: .4 }); },
    brass(t, duration, notes, { gain: level = .08, cutoff = 2300 } = {}) {
      const lp = filter('lowpass', 420, 1.6), env = held(t, 1, duration, .04, .25), each = gain(level / Math.max(1, notes.length * 1.4)), end = t + duration + .3;
      lp.frequency.setValueAtTime(420, t); lp.frequency.linearRampToValueAtTime(cutoff, t + .07); lp.frequency.setTargetAtTime(cutoff * .55, t + .07, .25);
      each.connect(lp); lp.connect(env); env.connect(to);
      let last; for (const note of notes) for (const d of [-5, 5]) last = tone('sawtooth', mtof(note), t, end, each, d);
      tidy(last, each, lp, env);
    },
    kick(t, { gain: level = .4, f0 = 140, f1 = 42, decay = .42 } = {}) {
      const env = hit(t, level, decay), node = ctx.createOscillator(); node.type = 'sine';
      node.frequency.setValueAtTime(f0, t); node.frequency.exponentialRampToValueAtTime(f1, t + .1);
      node.connect(env); env.connect(to); node.start(t); node.stop(t + decay * 1.5); tidy(node, env);
      const click = filter('highpass', 3000), clickEnv = hit(t, level * .25, .012); click.connect(clickEnv); clickEnv.connect(to); noise(t, t + .03, click, { offset: t });
    },
    snare(t, { gain: level = .16 } = {}) {
      const band = filter('bandpass', 1800, .8), env = hit(t, level, .16); band.connect(env); env.connect(to); noise(t, t + .25, band, { offset: t * 1.3 });
      const body = hit(t, level * .5, .08); body.connect(to); tidy(tone('triangle', 185, t, t + .15, body), body, band, env);
    },
    hat(t, { gain: level = .03, open = false } = {}) { const high = filter('highpass', 7500), env = hit(t, level, open ? .18 : .035); high.connect(env); env.connect(to); tidy(noise(t, t + (open ? .3 : .08), high, { offset: t * 1.7 }), high, env); },
    tom(t, note, { gain: level = .25 } = {}) {
      const env = hit(t, level, .4), node = ctx.createOscillator(); node.frequency.setValueAtTime(mtof(note) * 1.5, t); node.frequency.exponentialRampToValueAtTime(mtof(note), t + .06);
      node.connect(env); env.connect(to); node.start(t); node.stop(t + .6); tidy(node, env);
    },
    timpani(t, note, { gain: level = .3 } = {}) {
      const env = hit(t, level, 1.4), node = ctx.createOscillator(); node.frequency.setValueAtTime(mtof(note) * 1.04, t); node.frequency.exponentialRampToValueAtTime(mtof(note), t + .12);
      node.connect(env); env.connect(to); node.start(t); node.stop(t + 2); tidy(node, env);
      const low = filter('lowpass', 420), thump = hit(t, level * .5, .06); low.connect(thump); thump.connect(to); tidy(noise(t, t + .1, low, { offset: t }), low, thump);
    },
    block(t, { gain: level = .05, freq = 1100 } = {}) { const band = filter('bandpass', freq, 12), env = hit(t, level * 3, .045); band.connect(env); env.connect(to); tidy(noise(t, t + .07, band, { offset: t }), band, env); const body = hit(t, level, .04); body.connect(to); tidy(tone('sine', freq, t, t + .08, body), body); },
    heartbeat(t, { gain: level = .3 } = {}) { this.kick(t, { gain: level, f0: 90, f1: 38, decay: .3 }); this.kick(t + .24, { gain: level * .7, f0: 85, f1: 36, decay: .28 }); },
    boom(t, { gain: level = .3 } = {}) {
      const env = hit(t, level, 2.2, .01), node = ctx.createOscillator(); node.frequency.setValueAtTime(58, t); node.frequency.exponentialRampToValueAtTime(26, t + 1.3);
      node.connect(env); env.connect(to); node.start(t); node.stop(t + 3); tidy(node, env);
      const low = filter('lowpass', 160), rumble = hit(t, level * .6, 1.6, .02); low.connect(rumble); rumble.connect(to); tidy(noise(t, t + 2.5, low, { dark: true, offset: t }), low, rumble);
    },
    riser(t, duration, { gain: level = .05 } = {}) {
      const band = filter('bandpass', 300, 3), env = gain(0); band.frequency.setValueAtTime(300, t); band.frequency.exponentialRampToValueAtTime(7000, t + duration);
      env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(level, t + duration); env.gain.linearRampToValueAtTime(0, t + duration + .05);
      band.connect(env); env.connect(to); tidy(noise(t, t + duration + .1, band, { offset: t }), band, env);
    },
    metal(t, { gain: level = .06, freq = 210 } = {}) {
      const carrier = ctx.createOscillator(), modulator = ctx.createOscillator(), depth = gain(0), env = hit(t, level, 2.6, .002), high = filter('highpass', 120);
      carrier.frequency.value = freq; modulator.frequency.value = freq * 1.414; depth.gain.setValueAtTime(freq * 6, t); depth.gain.setTargetAtTime(0, t, .3);
      modulator.connect(depth); depth.connect(carrier.frequency); carrier.connect(high); high.connect(env); env.connect(to);
      carrier.start(t); modulator.start(t); carrier.stop(t + 3.5); modulator.stop(t + 3.5); tidy(modulator, depth); tidy(carrier, high, env);
    },
    tremolo(t, duration, notes, { gain: level = .025, rate = 9 } = {}) {
      const end = t + duration + .9, lp = filter('lowpass', 3800), shake = gain(.5), lfo = ctx.createOscillator(), depth = gain(.5), env = held(t, level, duration, .7, .8);
      lfo.frequency.value = rate; lfo.connect(depth); depth.connect(shake.gain); lp.connect(shake); shake.connect(env); env.connect(to); lfo.start(t); lfo.stop(end); tidy(lfo, depth);
      let last; for (const note of notes) for (const d of [-6, 6]) last = tone('sawtooth', mtof(note), t, end, lp, d);
      tidy(last, lp, shake, env);
    },
    drone(t, duration, notes, { gain: level = .1, cutoff = 450 } = {}) {
      const end = t + duration + 1.6, lp = filter('lowpass', cutoff, .9), env = held(t, 1, duration, 1.5, 1.5), each = gain(level / Math.max(1, notes.length * 1.4));
      const lfo = ctx.createOscillator(), depth = gain(cutoff * .45); lfo.frequency.value = .09; lfo.connect(depth); depth.connect(lp.frequency); lfo.start(t); lfo.stop(end); tidy(lfo, depth);
      each.connect(lp); lp.connect(env); env.connect(to);
      let last; for (const note of notes) for (const d of [-8, 8]) last = tone('sawtooth', mtof(note), t, end, each, d);
      tidy(last, each, lp, env);
    },
    glide(t, duration, from, to2, { gain: level = .015 } = {}) {
      const env = held(t, level, duration, duration * .4, duration * .4), node = ctx.createOscillator(), vibrato = ctx.createOscillator(), depth = gain(7);
      node.frequency.setValueAtTime(from, t); node.frequency.linearRampToValueAtTime(to2, t + duration); vibrato.frequency.value = 5.2; vibrato.connect(depth); depth.connect(node.frequency);
      node.connect(env); env.connect(to); const end = t + duration * 1.5; node.start(t); vibrato.start(t); node.stop(end); vibrato.stop(end); tidy(vibrato, depth); tidy(node, env);
    },
    noiseBed(t, duration, { gain: level = .04, freq = 600, type = 'lowpass', q = .7, brown: dark = false, sweep = 0, top = 0 } = {}) {
      const shape = filter(type, freq, q), env = held(t, level, duration, 1.2, 1.2), end = t + duration + 1.3;
      if (sweep) { shape.frequency.setValueAtTime(freq, t); shape.frequency.linearRampToValueAtTime(sweep, t + duration * .5); shape.frequency.linearRampToValueAtTime(freq, end); }
      let head = shape;
      if (top) { const cap = filter('lowpass', top); shape.connect(cap); head = cap; }
      head.connect(env); env.connect(to); tidy(noise(t, end, shape, { dark, offset: t * 1.1 }), shape, head, env);
    },
    boing(t, { gain: level = .25 } = {}) {
      const env = hit(t, level, .6), node = ctx.createOscillator(), wobble = ctx.createOscillator(), depth = gain(80);
      node.frequency.value = 190; wobble.frequency.value = 16; depth.gain.setValueAtTime(80, t); depth.gain.setTargetAtTime(0, t, .2);
      wobble.connect(depth); depth.connect(node.frequency); node.connect(env); env.connect(to); node.start(t); wobble.start(t); node.stop(t + 1); wobble.stop(t + 1); tidy(wobble, depth); tidy(node, env);
    },
  });

  // ---- Sound effects (each returns how long it lasts) ----
  function effect(name, t, { gain: level = 1, far = false } = {}) {
    build();
    const k = level * (BOOST[name] || 1);
    let to = sfxBus;
    if (far) { const low = filter('lowpass', 900), quiet = gain(.7); low.connect(quiet); quiet.connect(ambienceBus); to = low; setTimeoutSafe(() => { try { low.disconnect(); quiet.disconnect(); } catch {} }, 6000); }
    const i = kit(to), n = (start, end, destination, dark) => noise(start, end, destination, { dark, offset: start * 2.3 });
    const band = (type, frequency, q = .7) => filter(type, frequency, q);
    const burst = (start, peak, decay, type, frequency, q, dark) => { const f = band(type, frequency, q), env = hit(start, peak * k, decay); f.connect(env); env.connect(to); tidy(n(start, start + decay * 2 + .05, f, dark), f, env); return f; };
    const sweepTone = (start, type, f0, f1, time, peak, decay) => { const env = hit(start, peak * k, decay), node = ctx.createOscillator(); node.type = type; node.frequency.setValueAtTime(f0, start); node.frequency.exponentialRampToValueAtTime(Math.max(20, f1), start + time); node.connect(env); env.connect(to); node.start(start); node.stop(start + decay * 2 + time); tidy(node, env); return node; };
    const thump = (start, peak = .9) => sweepTone(start, 'sine', 100, 44, .1, peak, .22);
    const r = seeded(name + t.toFixed(2));
    switch (name) {
      case 'explosion': {
        const f = burst(t, .9, 2, 'lowpass', 7000, .6); f.frequency.setTargetAtTime(180, t, .35);
        burst(t, .8, 2.8, 'lowpass', 300, .7, true); sweepTone(t, 'sine', 72, 28, .9, .9, 1.3); return 2.6;
      }
      case 'punch': sweepTone(t, 'sine', 150, 55, .07, .9, .16); burst(t, .6, .05, 'bandpass', 1100, 1.2); burst(t, .25, .02, 'highpass', 3000); return .3;
      case 'slash': { const f = burst(t, .35, .15, 'bandpass', 1500, 1.4); f.frequency.exponentialRampToValueAtTime(6000, t + .12); i.bell(t + .05, 98, { gain: .12 * k, decay: .9, ratio: 2.01, index: 1.5 }); return .7; }
      case 'gunshot': burst(t, 1, .1, 'highpass', 500); sweepTone(t, 'sine', 110, 45, .1, .7, .15); burst(t, .3, .35, 'lowpass', 1200); return .9;
      case 'gunfire': for (let shot = 0; shot < 7; shot++) { const at = t + shot * .085 + r() * .01; burst(at, .6, .07, 'highpass', 600); sweepTone(at, 'sine', 120, 50, .06, .4, .08); } return 1;
      case 'laser': { const f = band('bandpass', 1200, .7), env = hit(t, .22 * k, .25); f.connect(env); env.connect(to); for (const d of [0, 7]) { const node = ctx.createOscillator(); node.type = d ? 'square' : 'sawtooth'; node.frequency.setValueAtTime(1600 + d * 10, t); node.frequency.exponentialRampToValueAtTime(180, t + .22); node.connect(f); node.start(t); node.stop(t + .5); tidy(node); } setTimeoutSafe(() => { try { f.disconnect(); env.disconnect(); } catch {} }, 1500); return .35; }
      case 'zap': {
        const f = band('bandpass', 1800, 1), env = held(t, .25 * k, .5, .01, .08), node = ctx.createOscillator(), lfo = ctx.createOscillator(), depth = gain(300);
        node.type = 'sawtooth'; node.frequency.value = 120; lfo.type = 'square'; lfo.frequency.value = 37; lfo.connect(depth); depth.connect(node.frequency);
        node.connect(f); f.connect(env); env.connect(to); node.start(t); lfo.start(t); node.stop(t + .7); lfo.stop(t + .7); tidy(lfo, depth); tidy(node, f, env);
        for (let spark = 0; spark < 6; spark++) burst(t + r() * .5, .2, .015, 'highpass', 2500); return .6;
      }
      case 'whoosh': { const f = band('bandpass', 250, 1.8), env = gain(0); f.frequency.setValueAtTime(250, t); f.frequency.exponentialRampToValueAtTime(2600, t + .25); f.frequency.exponentialRampToValueAtTime(500, t + .55);
        env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(.5 * k, t + .2); env.gain.linearRampToValueAtTime(0, t + .55); f.connect(env); env.connect(to); tidy(n(t, t + .6, f), f, env); return .6; }
      case 'web': { const f = burst(t, .4, .08, 'bandpass', 5000, 2.5); f.frequency.exponentialRampToValueAtTime(1200, t + .1); sweepTone(t, 'sine', 2400, 700, .07, .08, .06); return .2; }
      case 'crash': [0, .04, .1, .19].forEach((at, index) => burst(t + at, [.7, .5, .4, .3][index], .25, 'bandpass', 2000 + r() * 2000, .8)); thump(t, .6); for (let piece = 0; piece < 6; piece++) i.bell(t + .05 + r() * .5, 100 + Math.floor(r() * 14), { gain: .03 * k, decay: .25, ratio: 1.5, index: 1 }); return 1.2;
      case 'glass': burst(t, .45, .3, 'highpass', 4500); for (let piece = 0; piece < 10; piece++) sweepTone(t + r() * .6, 'sine', 3000 + r() * 4500, 2800, .02, .04, .25); return 1;
      case 'thud': thump(t, .9); burst(t, .35, .06, 'lowpass', 600); return .35;
      case 'footsteps': for (const at of [0, .38, .76]) { burst(t + at, .3, .04, 'lowpass', 1100); sweepTone(t + at, 'sine', 120, 60, .05, .25, .07); } return 1.1;
      case 'knock': for (const at of [0, .17, .34]) { burst(t + at, .5, .03, 'bandpass', 800, 5); sweepTone(t + at, 'sine', 210, 170, .03, .3, .05); } return .6;
      case 'door': burst(t, .3, .01, 'highpass', 3000); thump(t + .03, 1); burst(t + .03, .4, .3, 'lowpass', 400, .7, true); return .7;
      case 'metal': i.metal(t, { gain: .25 * k, freq: 330 }); burst(t, .3, .03, 'highpass', 2000); return 1.6;
      case 'thunder': burst(t, .5, .2, 'highpass', 1200); for (const [at, decay] of [[.1, 1.2], [.6, 1.6], [1.3, 2]]) burst(t + at, .8 * (1 - at / 3), decay, 'lowpass', 220, .7, true); sweepTone(t, 'sine', 45, 38, 1, .4, 2.5); return 3.2;
      case 'splash': { const f = burst(t, .6, .5, 'bandpass', 600, 1); f.frequency.exponentialRampToValueAtTime(2200, t + .25); for (let drop = 0; drop < 8; drop++) sweepTone(t + r() * .7, 'sine', 700 + r() * 1500, 400, .04, .05, .05); return .9; }
      case 'roar': {
        const lp = band('lowpass', 900, .8), env = held(t, .45 * k, .6, .25, .8), wobble = ctx.createOscillator(), depth = gain(6); wobble.frequency.value = 6; wobble.connect(depth);
        for (const frequency of [78, 117]) { const node = ctx.createOscillator(); node.type = 'sawtooth'; node.frequency.value = frequency; depth.connect(node.frequency); node.connect(lp); node.start(t); node.stop(t + 1.8); tidy(node); }
        wobble.start(t); wobble.stop(t + 1.8); tidy(wobble, depth); lp.connect(env); env.connect(to); setTimeoutSafe(() => { try { lp.disconnect(); env.disconnect(); } catch {} }, 2500);
        const rasp = burst(t, .25, .9, 'bandpass', 420, .8); rasp.Q.value = .8; return 1.5;
      }
      case 'alarm': { const env = held(t, .12 * k, 1.6, .05, .2), node = ctx.createOscillator(); node.type = 'triangle'; for (let step = 0; step < 6; step++) node.frequency.setValueAtTime(step % 2 ? 900 : 680, t + step * .3); node.connect(env); env.connect(to); node.start(t); node.stop(t + 2); tidy(node, env); return 1.9; }
      case 'beep': for (const at of [0, .21]) { const env = held(t + at, .14 * k, .11, .005, .01); env.connect(to); tidy(tone('sine', 1050, t + at, t + at + .15, env), env); } return .4;
      case 'ring': for (const at of [0, .65]) { const env = held(t + at, .08 * k, .45, .01, .03), shake = gain(.5), lfo = ctx.createOscillator(), depth = gain(.5); lfo.frequency.value = 18; lfo.connect(depth); depth.connect(shake.gain); shake.connect(env); env.connect(to); lfo.start(t + at); lfo.stop(t + at + .6); tidy(lfo, depth); for (const frequency of [1250, 1580]) tidy(tone('sine', frequency, t + at, t + at + .55, shake), shake, env); } return 1.2;
      case 'engine': {
        const lp = band('lowpass', 500, 1), env = held(t, .3 * k, 1.1, .15, .4), lfo = ctx.createOscillator(), depth = gain(.3), shake = gain(.7);
        lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1200, t + .8); lfo.frequency.value = 24; lfo.connect(depth); depth.connect(shake.gain); lp.connect(shake); shake.connect(env); env.connect(to);
        for (const base of [48, 96]) { const node = ctx.createOscillator(); node.type = 'sawtooth'; node.frequency.setValueAtTime(base, t); node.frequency.exponentialRampToValueAtTime(base * 2, t + .8); node.frequency.exponentialRampToValueAtTime(base * 1.7, t + 1.4); node.connect(lp); node.start(t); node.stop(t + 1.7); tidy(node); }
        lfo.start(t); lfo.stop(t + 1.7); tidy(lfo, depth); setTimeoutSafe(() => { try { lp.disconnect(); shake.disconnect(); env.disconnect(); } catch {} }, 2500); return 1.6;
      }
      case 'screech': {
        const f = band('bandpass', 2400, 5), env = held(t, .18 * k, .8, .03, .25), node = ctx.createOscillator(), vibrato = ctx.createOscillator(), depth = gain(30);
        node.type = 'sawtooth'; node.frequency.setValueAtTime(1900, t); node.frequency.linearRampToValueAtTime(1500, t + 1); vibrato.frequency.value = 9; vibrato.connect(depth); depth.connect(node.frequency);
        node.connect(f); f.connect(env); env.connect(to); node.start(t); vibrato.start(t); node.stop(t + 1.2); vibrato.stop(t + 1.2); tidy(vibrato, depth); tidy(node, f, env); burst(t, .15, .8, 'bandpass', 3000, 1); return 1.1;
      }
      case 'magic': [0, 2, 4, 7, 9, 12, 14, 16, 19, 21].forEach((step, index) => i.bell(t + index * .055, 84 + step, { gain: .045 * k, decay: 1.2 })); { const f = band('highpass', 6000), env = held(t, .05 * k, .8, .3, .4); f.connect(env); env.connect(to); tidy(n(t, t + 1.6, f), f, env); } return 1.4;
      case 'boing': i.boing(t, { gain: .3 * k }); return .8;
      case 'pop': sweepTone(t, 'sine', 700, 180, .05, .45, .06); return .15;
      case 'snap': burst(t, .6, .012, 'highpass', 2500); burst(t, .3, .03, 'bandpass', 1500); return .12;
      case 'heartbeat': i.heartbeat(t, { gain: .6 * k }); i.heartbeat(t + .75, { gain: .6 * k }); return 1.5;
      case 'fire': { const f = burst(t, .5, 1.1, 'lowpass', 250, .7); f.frequency.exponentialRampToValueAtTime(2200, t + .35); for (let spark = 0; spark < 14; spark++) burst(t + r(), .1, .015, 'highpass', 2000); return 1.3; }
      case 'rumble': { const low = band('lowpass', 160), env = held(t, .7 * k, .8, .4, 1.6); low.connect(env); env.connect(to); tidy(n(t, t + 3, low, true), low, env); sweepTone(t, 'sine', 40, 36, 2, .35, 2); return 2.4; }
      case 'crunch': for (let piece = 0; piece < 5; piece++) burst(t + piece * .045, .4, .04, 'bandpass', 1200 + r() * 2000, 1); thump(t, .5); return .4;
      default: return effect('thud', t, { gain: k * .6 });
    }
  }
  function setTimeoutSafe(action, ms) { if (realtime) setTimeout(action, ms); }

  // ---- Background sound helpers (quiet, endless) ----
  const placeKit = to => {
    const base = kit(to);
    return { ...base,
      swell(t, duration, { gain: level = .02, from = 400, to: top = 900 } = {}) {
        const f = filter('bandpass', from, .8), env = gain(0); f.frequency.setValueAtTime(from, t); f.frequency.linearRampToValueAtTime(top, t + duration / 2); f.frequency.linearRampToValueAtTime(from, t + duration);
        env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(level, t + duration / 2); env.gain.linearRampToValueAtTime(0, t + duration); f.connect(env); env.connect(to); tidy(noise(t, t + duration + .1, f, { offset: t }), f, env);
      },
      siren(t, duration, { gain: level = .005 } = {}) {
        const lp = filter('lowpass', 1500), env = held(t, level, duration, 1, 1), node = ctx.createOscillator(); node.type = 'triangle';
        for (let step = 0; step <= duration * 2; step++) node.frequency.linearRampToValueAtTime(step % 2 ? 900 : 700, t + step * .5);
        node.connect(lp); lp.connect(env); env.connect(to); node.start(t); node.stop(t + duration + 1.2); tidy(node, lp, env);
      },
      chirp(t, { gain: level = .005, freq = 4500 } = {}) { for (let pulse = 0; pulse < 3; pulse++) { const env = held(t + pulse * .045, level, .022, .004, .006); env.connect(to); tidy(tone('sine', freq, t + pulse * .045, t + pulse * .045 + .04, env), env); } },
      drop(t, { gain: level = .006 } = {}) { const env = hit(t, level, .02), node = ctx.createOscillator(); node.frequency.setValueAtTime(2500 + Math.random() * 2500, t); node.frequency.exponentialRampToValueAtTime(1500, t + .02); node.connect(env); env.connect(to); node.start(t); node.stop(t + .06); tidy(node, env); },
      crackle(t, { gain: level = .03 } = {}) { const high = filter('highpass', 2000), env = hit(t, level, .015 + Math.random() * .02); high.connect(env); env.connect(to); tidy(noise(t, t + .06, high, { offset: t * 3 }), high, env); },
      wave(t, duration, { gain: level = .06 } = {}) {
        const lp = filter('lowpass', 350), env = gain(0); lp.frequency.setValueAtTime(350, t); lp.frequency.linearRampToValueAtTime(1400, t + duration * .45); lp.frequency.linearRampToValueAtTime(350, t + duration + 1);
        env.gain.setValueAtTime(level * .3, t); env.gain.linearRampToValueAtTime(level, t + duration * .45); env.gain.linearRampToValueAtTime(level * .3, t + duration + 1); env.gain.linearRampToValueAtTime(0, t + duration + 1.3);
        lp.connect(env); env.connect(to); tidy(noise(t, t + duration + 1.4, lp, { offset: t }), lp, env);
      },
      bird(t, { gain: level = .008 } = {}) { const env = held(t, level, .06, .01, .02), node = ctx.createOscillator(); node.frequency.setValueAtTime(2600 + Math.random() * 600, t); node.frequency.exponentialRampToValueAtTime(3800 + Math.random() * 600, t + .07); node.connect(env); env.connect(to); node.start(t); node.stop(t + .12); tidy(node, env); },
      hum(t, duration, { gain: level = .018 } = {}) { const env = held(t, level, duration, 1.2, 1.2); env.connect(to); tone('sine', 55, t, t + duration + 1.3, env); const upper = gain(.5); upper.connect(env); tidy(tone('sine', 110, t, t + duration + 1.3, upper), upper, env); },
      blip(t, { gain: level = .005 } = {}) { const env = held(t, level, .08, .005, .02); env.connect(to); tidy(tone('sine', 1300, t, t + .12, env), env); },
      sfx: (name, at, options) => effect(name, at, options),
    };
  };

  // ---- Running the music and background sound ----
  function startTrack(list, recipe, name, intensity, at, fadeIn, bus, wetBus, isPlace) {
    const out = gain(0); out.gain.setValueAtTime(0, at); out.gain.linearRampToValueAtTime(recipe.level ?? 1, at + fadeIn); out.connect(bus);
    let wet = null; if (wetBus) { wet = gain(recipe.wet ?? .3); out.connect(wet); wet.connect(wetBus); }
    const step = isPlace ? .25 : 60 / recipe.bpm / 4;
    const track = { recipe, name, intensity, start: at, next: 0, step, stopAt: null, out, wet, rnd: seeded(name), kit: isPlace ? placeKit(out) : kit(out), isPlace };
    list.push(track); return track;
  }
  function fadeTrack(track, at, seconds) {
    if (track.stopAt !== null) return;
    track.out.gain.cancelScheduledValues(at); track.out.gain.setTargetAtTime(0, at, seconds / 3); track.stopAt = at + seconds;
  }
  function musicApi(track, index, t) {
    const recipe = track.recipe, pos = index % 16, bar = Math.floor(index / 16), bars = recipe.bars || 1, scale = SCALES[recipe.scale] || SCALES.major;
    const degree = recipe.chords[Math.floor(bar / bars) % recipe.chords.length], beat = track.step * 4;
    let walker = track.walker ?? 0;
    return { ...track.kit, t, pos, bar, intensity: track.intensity, rnd: track.rnd, root: recipe.root, step: track.step, beat, barLength: beat * 4, bar2: beat * 4 * bars,
      chordStart: pos === 0 && bar % bars === 0,
      chord: (shift = 0, size = 3) => chordOf(recipe.root + shift, scale, degree, size),
      pick: list => list[Math.floor(track.rnd() * list.length) % list.length],
      walk: list => { walker = Math.max(0, Math.min(list.length - 1, walker + (track.rnd() < .5 ? -1 : 1))); track.walker = walker; return list[walker]; } };
  }
  function placeApi(track, index, t) { return { ...track.kit, t, rnd: track.rnd, stepLength: track.step, segment: 8, segmentStart: index % 32 === 0 }; }
  function pump(until) {
    if (!built) return;
    const horizon = until ?? ctx.currentTime + .45;
    for (const list of [music, places]) {
      for (const track of list) {
        for (;;) {
          const t = track.start + track.next * track.step;
          if (t >= horizon || (track.stopAt !== null && t >= track.stopAt)) break;
          try { track.recipe.play(track.isPlace ? placeApi(track, track.next, t) : musicApi(track, track.next, t)); } catch (error) { onError(error); /* One note less. */ }
          track.next++;
        }
      }
      for (let index = list.length - 1; index >= 0; index--) {
        const track = list[index];
        if (track.stopAt !== null && track.stopAt + 4 < (realtime ? ctx.currentTime : horizon)) { list.splice(index, 1); if (realtime) { try { track.out.disconnect(); track.wet?.disconnect(); } catch {} } }
      }
    }
    if (realtime && !music.length && !places.length && timer) { clearInterval(timer); timer = 0; }
  }
  function running() { if (realtime && !timer) timer = setInterval(() => pump(), 100); }

  const scene = { music: true, effects: true };
  /** Music and background sound for what is on screen now (or at `at`, offline). */
  function setScene({ mood = 'none', intensity = 2, ambience = 'none' } = {}, at) {
    build();
    const now = Math.max(ctx.currentTime, at ?? ctx.currentTime) + .02, level = Math.max(1, Math.min(3, Math.round(intensity) || 2));
    // Offline, everything before the change is written first.
    if (!realtime) pump(now);
    const current = music.find(track => track.stopAt === null);
    if (!scene.music || !MUSIC[mood]) { if (current) fadeTrack(current, now, 2.4); }
    else if (current?.name === mood) current.intensity = level;
    else {
      const sudden = mood === 'action' || mood === 'scary';
      if (current) fadeTrack(current, now, sudden ? .9 : 2.4);
      startTrack(music, MUSIC[mood], mood, level, now + (sudden ? 0 : .3), sudden ? .35 : 2, musicBus, musicWet, false);
    }
    const place = places.find(track => track.stopAt === null);
    if (!scene.effects || !AMBIENCE[ambience]) { if (place) fadeTrack(place, now, 2.5); }
    else if (place?.name !== ambience) { if (place) fadeTrack(place, now, 2.5); startTrack(places, AMBIENCE[ambience], ambience, level, now, 2.5, ambienceBus, null, true); }
    running(); pump(realtime ? undefined : now + .45);
  }
  function duck(on, at) {
    if (!built) return;
    ducks = Math.max(0, ducks + (on ? 1 : -1));
    const t = Math.max(ctx.currentTime, at ?? ctx.currentTime);
    for (const [bus, base, low] of [[musicBus, levels.music, .42], [ambienceBus, levels.ambience, .7]]) {
      bus.gain.cancelScheduledValues(t);
      bus.gain.setTargetAtTime(ducks ? base * low : base, t + (ducks ? 0 : .25), ducks ? .08 : .4);
    }
  }
  /** Plays one line of a natural voice; resolves true when it was heard to the end. */
  function playVoice(samples, sampleRate, plan = {}, at) {
    build();
    const buffer = ctx.createBuffer(1, samples.length, sampleRate); buffer.getChannelData(0).set(samples);
    const source = ctx.createBufferSource(); source.buffer = buffer; source.playbackRate.value = plan.rate || 1;
    const level = gain(plan.gain ?? 1), nodes = [level];
    let head = source;
    const through = node => { head.connect(node); head = node; nodes.push(node); };
    if (plan.effect === 'robot') {
      const ring = gain(0), carrier = ctx.createOscillator(), dry = gain(.35), mix = gain(1);
      carrier.frequency.value = 52; carrier.connect(ring.gain); head.connect(ring); head.connect(dry); ring.connect(mix); dry.connect(mix); head = mix; nodes.push(ring, dry, mix);
      carrier.start(); source.addEventListener('ended', () => { try { carrier.stop(); carrier.disconnect(); } catch {} });
      through(filter('bandpass', 1500, .4));
    } else if (plan.effect === 'creature') {
      const shaper = ctx.createWaveShaper(), curve = new Float32Array(1024);
      for (let index = 0; index < curve.length; index++) { const x = index / 511.5 - 1; curve[index] = Math.tanh(x * 2.2); }
      shaper.curve = curve; through(shaper); through(filter('lowpass', 2300));
    } else if (plan.effect === 'whisper') through(filter('highpass', 550));
    else if (plan.effect === 'thought') { through(filter('lowpass', 6500)); const echo = gain(.25); head.connect(echo); echo.connect(reverb); nodes.push(echo); }
    head.connect(level); level.connect(voiceBus);
    const entry = { source, stopped: false };
    voices.add(entry);
    const when = Math.max(ctx.currentTime, at ?? ctx.currentTime);
    duck(true, when);
    if (!realtime) { duck(false, when + buffer.duration / (plan.rate || 1)); source.start(when); voices.delete(entry); return Promise.resolve(true); }
    return new Promise(resolve => {
      source.onended = () => { voices.delete(entry); for (const node of [source, ...nodes]) { try { node.disconnect(); } catch {} } duck(false); resolve(!entry.stopped); };
      source.start(when);
    });
  }
  function stopVoices() { for (const entry of voices) { entry.stopped = true; try { entry.source.stop(); } catch {} } }
  // Listening with the screen off: a 30 Hz hum far below hearing keeps the
  // sound running between lines, so the phone does not put it to sleep.
  function keepAlive(on) {
    if (!on) { if (hum) { try { hum.node.stop(); hum.node.disconnect(); hum.level.disconnect(); } catch {} hum = null; } return; }
    build();
    if (hum) return;
    try {
      const node = ctx.createOscillator(), level = gain(.0016);
      node.type = 'sine'; node.frequency.value = 30; node.connect(level); level.connect(ctx.destination); node.start();
      hum = { node, level };
    } catch { hum = null; }
  }
  return {
    get context() { return ctx; },
    get active() { return built && (music.some(track => track.stopAt === null) || places.some(track => track.stopAt === null)); },
    get music() { return scene.music; }, set music(value) { scene.music = Boolean(value); },
    get effects() { return scene.effects; }, set effects(value) { scene.effects = Boolean(value); },
    /** From the tap that starts reading: lets the device play sound. */
    resume() {
      try { if (globalThis.navigator?.audioSession) navigator.audioSession.type = 'playback'; } catch {}
      build(); clearTimeout(sleep);
      try { if (ctx.state !== 'running') ctx.resume?.()?.catch?.(() => {}); } catch {}
      try { const silent = ctx.createBuffer(1, 1, ctx.sampleRate), source = ctx.createBufferSource(); source.buffer = silent; source.connect(ctx.destination); source.start(); } catch {}
    },
    setScene, duck, playVoice, stopVoices, pump, keepAlive,
    get keptAlive() { return Boolean(hum); },
    /** Plays a sound effect now (or at `at`); returns its length in seconds. */
    play(name, { intensity = 2, at } = {}) {
      if (!scene.effects) return 0;
      build();
      return effect(name, Math.max(ctx.currentTime, at ?? ctx.currentTime) + .01, { gain: .7 + .15 * Math.max(1, Math.min(3, intensity)) });
    },
    /** Fades everything out; the device sleeps a little later. */
    stop({ fade = .8 } = {}) {
      stopVoices();
      if (!built) return;
      const now = ctx.currentTime;
      for (const track of [...music, ...places]) fadeTrack(track, now, fade);
      ducks = 0;
      if (realtime) { clearTimeout(sleep); sleep = setTimeout(() => { if (!music.some(t => t.stopAt === null) && !places.some(t => t.stopAt === null) && !voices.size && !hum) { try { ctx.suspend?.()?.catch?.(() => {}); } catch {} } }, (fade + 2.5) * 1000); }
    },
    close() { keepAlive(false); this.stop({ fade: .2 }); clearInterval(timer); timer = 0; if (realtime) { try { ctx?.close?.()?.catch?.(() => {}); } catch {} } ctx = context; built = false; music.length = 0; places.length = 0; },
  };
}
