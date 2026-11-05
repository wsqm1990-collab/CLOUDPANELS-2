import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundscape, MUSIC, AMBIENCE } from '../src/soundscape.js';
import { MOODS, AMBIENCES, SOUNDS } from '../src/read-aloud.js';

// A stand-in for Web Audio that only counts what would play.
function fakeContext() {
  const counts = { oscillator: 0, noise: 0, voice: 0 }, param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime(value) { if (!(value > 0)) throw new RangeError('exponential ramps need a positive value'); }, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = extra => ({ connect(target) { if (!target) throw new Error('nowhere to connect'); return target; }, disconnect() {}, ...extra });
  const ctx = { currentTime: 0, sampleRate: 8000, state: 'running', destination: node(), counts,
    createGain: () => node({ gain: param() }), createBiquadFilter: () => node({ type: '', frequency: param(), Q: param() }),
    createOscillator: () => node({ type: 'sine', frequency: param(), detune: param(), start() { counts.oscillator++; }, stop() {}, onended: null }),
    createBufferSource: () => node({ buffer: null, loop: false, playbackRate: param(), start() { if (this.buffer?.voice) counts.voice++; else counts.noise++; }, stop() {}, addEventListener() {}, onended: null }),
    createBuffer: (channels, length, rate) => { const data = Array.from({ length: channels }, () => new Float32Array(length)); return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: index => data[index] }; },
    createConvolver: () => node({ buffer: null }), createWaveShaper: () => node({ curve: null }),
    createDynamicsCompressor: () => node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }) };
  return ctx;
}

test('every mood, place and sound effect the AI can name exists and plays without errors', () => {
  assert.deepEqual(Object.keys(MUSIC).sort(), MOODS.filter(mood => mood !== 'none').sort());
  assert.deepEqual(Object.keys(AMBIENCE).sort(), AMBIENCES.filter(place => place !== 'none').sort());
  for (const mood of MOODS) for (const intensity of [1, 2, 3]) {
    const errors = [], ctx = fakeContext(), scape = createSoundscape({ context: ctx, onError: error => errors.push(error) });
    scape.setScene({ mood, intensity, ambience: AMBIENCES[(intensity + MOODS.indexOf(mood)) % AMBIENCES.length] }, 0);
    scape.pump(40);
    assert.deepEqual(errors.map(String), [], `${mood} ${intensity}`);
    if (mood !== 'none') assert.ok(ctx.counts.oscillator > 20, `${mood} plays notes`);
  }
  const ctx = fakeContext(), scape = createSoundscape({ context: ctx });
  for (const sound of SOUNDS) { const seconds = scape.play(sound, { at: 1 }); assert.ok(seconds > 0 && seconds < 4, `${sound}: ${seconds}`); }
  assert.ok(ctx.counts.noise + ctx.counts.oscillator > SOUNDS.length);
});

test('switches: music and effects off play nothing; a mood change fades the old one out', () => {
  const ctx = fakeContext(), scape = createSoundscape({ context: ctx });
  scape.music = false; scape.effects = false;
  scape.setScene({ mood: 'action', intensity: 3, ambience: 'rain' }, 0); scape.pump(10);
  assert.equal(ctx.counts.oscillator + ctx.counts.noise, 0);
  assert.equal(scape.play('explosion'), 0);
  scape.music = true; scape.setScene({ mood: 'calm', ambience: 'rain' }, 10); scape.pump(20);
  assert.ok(ctx.counts.oscillator > 0 && ctx.counts.noise === 0, 'music only, no rain');
  assert.equal(scape.active, true);
  scape.stop(); scape.pump(40); assert.equal(scape.active, false);
});

test('a natural voice line plays over the music, which steps back meanwhile', async () => {
  const ctx = fakeContext(), scape = createSoundscape({ context: ctx });
  scape.setScene({ mood: 'tense' }, 0);
  const samples = new Float32Array(2400);
  const original = ctx.createBuffer; ctx.createBuffer = (...args) => Object.assign(original(...args), { voice: args[1] === 2400 });
  assert.equal(await scape.playVoice(samples, 24000, { rate: 1.12, gain: .8, effect: 'robot' }, 1), true);
  assert.equal(ctx.counts.voice, 1);
});

test('with the screen off allowed, a hum far below hearing keeps the sound running between lines', () => {
  const ctx = fakeContext(), made = [], scape = createSoundscape({ context: ctx });
  const original = ctx.createOscillator; ctx.createOscillator = () => { const node = original(); made.push(node); node.stopped = false; node.stop = () => { node.stopped = true; }; return node; };
  const gains = [], originalGain = ctx.createGain; ctx.createGain = () => { const node = originalGain(); gains.push(node); return node; };
  assert.equal(scape.keptAlive, false);
  scape.keepAlive(true); scape.keepAlive(true);
  const hum = made.filter(node => node.frequency.value === 30);
  assert.equal(hum.length, 1, 'only one'); assert.equal(scape.keptAlive, true);
  assert.ok(gains.some(node => Math.abs(node.gain.value - .0016) < 1e-9), 'about -56 dB');
  scape.keepAlive(false); assert.equal(hum[0].stopped, true); assert.equal(scape.keptAlive, false);
});
