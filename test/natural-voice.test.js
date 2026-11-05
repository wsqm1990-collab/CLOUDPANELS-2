import test from 'node:test';
import assert from 'node:assert/strict';
import { createCast, voicePlan, naturalSpeed, ttsBase, voiceEngineCount, naturalVoiceSupported, createNaturalVoice, TTS_FILES, TTS_BYTES, CAST } from '../src/natural-voice.js';

test('every character keeps one voice; men, women and the narrator differ', () => {
  const cast = createCast();
  const peter = cast.voiceFor({ voice: 'man', speaker: 'Peter' }), harry = cast.voiceFor({ voice: 'man', speaker: 'Harry' });
  const mj = cast.voiceFor({ voice: 'woman', speaker: 'MJ' }), narrator = cast.voiceFor({ kind: 'caption', voice: 'narrator', speaker: 'narrator' });
  assert.notEqual(peter, harry, 'two named men get different voices');
  assert.equal(cast.voiceFor({ voice: 'man', speaker: '  peter ' }), peter, 'the same name keeps its voice');
  assert.ok(CAST.man.includes(peter) && CAST.woman.includes(mj) && CAST.narrator.includes(narrator));
  assert.ok(!CAST.man.includes(narrator), 'the narrator never sounds like one of the men');
  assert.equal(cast.voiceFor({ voice: 'man', speaker: 'guard' }), CAST.man[0], 'nameless extras share the first voice');
  assert.equal(cast.voiceFor({ voice: 'dragon', speaker: 'X' }), CAST.man[2], 'unknown kinds read as a man');
  cast.reset(); assert.equal(cast.voiceFor({ voice: 'man', speaker: 'Harry' }), CAST.man[0], 'a new comic starts over');
});

test('tone and kind of voice set pace, pitch and loudness', () => {
  const shout = voicePlan({ tone: 'shout', voice: 'man' }, 'am_michael'), sad = voicePlan({ tone: 'sad', voice: 'woman' }, 'af_heart');
  assert.ok(shout.speed > 1 && sad.speed < 1 && sad.gain < shout.gain);
  const girl = voicePlan({ voice: 'girl' }, CAST.girl[0]);
  assert.ok(girl.rate > 1 && Math.abs(girl.speed * girl.rate - 1) < .02, 'children are higher at the same pace');
  assert.equal(voicePlan({ voice: 'robot' }, 'am_echo').effect, 'robot');
  assert.equal(voicePlan({ voice: 'creature' }, 'am_onyx').effect, 'creature');
  assert.equal(voicePlan({ tone: 'whisper', voice: 'man' }, 'am_michael').effect, 'whisper');
  assert.equal(voicePlan({ kind: 'thought', voice: 'man' }, 'am_michael').effect, 'thought');
});

test('the voice files come from the website (also for the iPad app) and are sized', () => {
  assert.equal(ttsBase({ protocol: 'https:', hostname: 'wsqm1990-collab.github.io', port: '', href: 'https://wsqm1990-collab.github.io/CLOUDPANELS-2/' }, 'https://wsqm1990-collab.github.io/CLOUDPANELS-2/'), 'https://wsqm1990-collab.github.io/CLOUDPANELS-2/tts/');
  assert.equal(ttsBase({ protocol: 'capacitor:', hostname: 'localhost', port: '' }, 'capacitor://localhost/'), 'https://wsqm1990-collab.github.io/CLOUDPANELS-2/tts/');
  assert.equal(ttsBase({ protocol: 'https:', hostname: 'localhost', port: '' }, 'https://localhost/'), 'https://wsqm1990-collab.github.io/CLOUDPANELS-2/tts/', 'the Android app');
  assert.equal(ttsBase({ protocol: 'http:', hostname: '127.0.0.1', port: '8100', href: 'http://127.0.0.1:8100/' }, 'http://127.0.0.1:8100/'), 'http://127.0.0.1:8100/tts/');
  assert.equal(TTS_BYTES, TTS_FILES.reduce((sum, file) => sum + file.size, 0));
  assert.ok(TTS_BYTES > 80e6 && TTS_BYTES < 110e6, String(TTS_BYTES));
  assert.equal(voiceEngineCount({ navigator: { hardwareConcurrency: 8, deviceMemory: 8, userAgent: 'Linux; Android 11' } }), 2);
  assert.equal(voiceEngineCount({ navigator: { hardwareConcurrency: 8, deviceMemory: 4, userAgent: 'Linux; Android 11' } }), 1);
  assert.equal(voiceEngineCount({ navigator: { hardwareConcurrency: 6, userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0)' } }), 1, 'one on the iPad (3 GB)');
  assert.equal(naturalVoiceSupported({}), false);
});

function fakeWorkers({ failLoad = false, slow = 5 } = {}) {
  const made = [];
  const factory = () => {
    const worker = { posted: [], terminated: false, onmessage: null, onerror: null,
      postMessage(message) {
        this.posted.push(message);
        const reply = data => setTimeout(() => !worker.terminated && worker.onmessage?.({ data }), slow);
        if (message.type === 'load') { reply({ type: 'progress', loaded: 50, total: 100 }); setTimeout(() => !worker.terminated && worker.onmessage?.({ data: failLoad ? { type: 'failed', message: 'No WebAssembly here.' } : { type: 'ready', ms: 1 } }), slow * 2); }
        if (message.type === 'say') reply({ type: 'audio', id: message.id, samples: new Float32Array(240), sampleRate: 24000, ms: 1, sounds: message.text });
      },
      terminate() { this.terminated = true; } };
    made.push(worker); return worker;
  };
  return { made, factory };
}

test('the engine loads once, spreads lines over its workers and shares repeats', async () => {
  const { made, factory } = fakeWorkers(), seen = [];
  const engine = createNaturalVoice({ base: 'https://example.test/tts/', ortUrl: 'https://example.test/ort.mjs', workerFactory: factory, engines: 2 });
  engine.onChange(change => seen.push(change.state));
  const plan = voicePlan({ voice: 'man' }, 'am_michael');
  const first = engine.synth('Hello there.', plan), again = engine.synth('Hello there.', plan);
  assert.equal(first, again, 'the same line is asked once');
  await engine.load();
  const lines = await Promise.all(['One.', 'Two.', 'Three.', 'Four.'].map(text => engine.synth(text, plan)));
  assert.equal(lines.length, 4); assert.equal((await first).sampleRate, 24000);
  assert.equal(made.length, 2, 'a second engine starts once the first is ready');
  assert.ok(made.every(worker => worker.posted.some(message => message.type === 'say')), 'both did some of the work');
  assert.ok(seen.includes('loading') && seen.at(-1) === 'ready');
  assert.equal(made[0].posted[0].base, 'https://example.test/tts/');
  engine.dispose(); assert.ok(made.every(worker => worker.terminated));
});

test('lines no longer needed are dropped before they start; a failed start is reported', async () => {
  const { factory } = fakeWorkers({ slow: 30 });
  const engine = createNaturalVoice({ workerFactory: factory, base: 'x:/', ortUrl: 'x:/o', engines: 1 });
  const plan = voicePlan({}, 'am_michael');
  const a = engine.synth('Keep me.', plan), b = engine.synth('Drop me.', plan);
  engine.only([{ text: 'Keep me.', plan }]);
  await assert.rejects(b, error => error.name === 'AbortError');
  assert.equal((await a).samples.length, 240);
  engine.dispose();
  const broken = createNaturalVoice({ workerFactory: fakeWorkers({ failLoad: true }).factory, base: 'x:/', ortUrl: 'x:/o' });
  await assert.rejects(broken.load(), /WebAssembly/);
  assert.equal(broken.state, 'failed');
  await assert.rejects(broken.synth('Hi.', plan), /WebAssembly/);
});

test('the voice engine asks the device for less memory, stepping down if refused', async () => {
  const { smallerMemory, MEMORY_STEPS } = await import('../src/tts-memory.js');
  const asked = [];
  class Real { constructor(d) { asked.push(d.maximum); if (d.shared && d.maximum > 8192) throw new RangeError('could not allocate memory'); this.d = d; } }
  const scope = { WebAssembly: { Memory: Real } };
  smallerMemory(scope);
  const memory = new scope.WebAssembly.Memory({ initial: 256, maximum: 65536, shared: true });
  assert.deepEqual(asked, [...MEMORY_STEPS].filter(pages => pages >= 8192), 'it tried 1 GB, 768 MB, then 512 MB');
  assert.equal(memory.d.maximum, 8192); assert.ok(memory instanceof scope.WebAssembly.Memory);
  assert.equal(new scope.WebAssembly.Memory({ initial: 1, maximum: 2 }).d.maximum, 2, 'small or unshared memories are left alone');
  smallerMemory(scope); assert.equal(scope.WebAssembly.Memory.cloudpanels, true, 'wrapped once');
  const none = { WebAssembly: { Memory: class { constructor() { throw new RangeError('no'); } } } };
  smallerMemory(none); assert.throws(() => new none.WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true }), RangeError);
});

test('the same character keeps one voice even when the AI names them differently', () => {
  const cast = createCast();
  const peter = cast.voiceFor({ voice: 'man', speaker: 'Peter' });
  assert.equal(cast.voiceFor({ voice: 'man', speaker: 'Peter Parker' }), peter, 'first name, then full name');
  assert.equal(cast.voiceFor({ voice: 'boy', speaker: 'Peter' }), peter, 'marked as a boy on another page: still his voice');
  assert.equal(cast.plan({ voice: 'boy', speaker: 'Peter', text: 'Hi.' }).rate, 1, '...and his pitch (no child pitch for him)');
  const osborn = cast.voiceFor({ voice: 'man', speaker: 'Norman Osborn' });
  assert.equal(cast.voiceFor({ voice: 'man', speaker: 'Mr. Osborn' }), osborn, 'titles are ignored');
  assert.notEqual(cast.voiceFor({ voice: 'old man', speaker: 'Ben Parker' }), peter, 'two full names that only share a family name are two people');
  const may = cast.voiceFor({ voice: 'woman', speaker: 'Aunt May' });
  assert.ok(CAST.woman.includes(may));
  assert.equal(cast.voiceFor({ voice: 'old woman', speaker: 'May' }), may, 'Aunt May and May');
  assert.notEqual(cast.voiceFor({ voice: 'woman', speaker: 'Mary Parker' }), peter, 'a woman never takes a man\'s voice');
});

test('the voice speed setting makes every natural voice faster or slower', () => {
  const cast = createCast(), line = { voice: 'man', speaker: 'Peter', tone: 'normal', text: 'Hi.' };
  const normal = cast.plan(line), fast = cast.plan(line, { speed: 1.5 }), slow = cast.plan(line, { speed: .75 });
  assert.equal(normal.speed, 1, 'at 1× nothing changes');
  assert.equal(fast.speed, 2.14, 'the model is asked for more, so it really reads 1.5× as fast');
  assert.equal(slow.speed, .65, 'and really 0.75× as fast');
  assert.equal(fast.voice, normal.voice, 'same voice, only faster');
  assert.ok(cast.plan(line, { speed: 1.25 }).speed > 1.25 && cast.plan(line, { speed: 1.25 }).speed < fast.speed);
  assert.equal(cast.plan({ ...line, tone: 'scared' }, { speed: 1.5 }).speed, 2.4, 'tone still counts');
  assert.equal(cast.plan({ ...line, voice: 'creature', speaker: 'Thing', tone: 'scared' }, { speed: 1.5 }).speed, 2.6, 'never beyond what still sounds right');
});

test('without a voice speed set, every line is said exactly as before', () => {
  assert.equal(naturalSpeed(1), 1); assert.equal(naturalSpeed(), 1); assert.equal(naturalSpeed('x'), 1);
  const tones = ['normal', 'shout', 'angry', 'scared', 'sad', 'whisper', 'laugh'], voices = ['man', 'woman', 'boy', 'girl', 'old man', 'old woman', 'creature', 'robot', 'narrator'];
  for (const tone of tones) for (const voice of voices) for (const kind of ['speech', 'thought', 'caption']) {
    const plan = voicePlan({ voice, tone, kind }, 1), old = Math.round(Math.min(1.6, Math.max(.6, ({ normal: 1, shout: 1.08, angry: 1.05, scared: 1.12, sad: .88, whisper: .93, laugh: 1.05 })[tone] * (kind === 'thought' ? .96 : kind === 'caption' ? .97 : 1) / (({ boy: 1.05, girl: 1.04, creature: .8, 'old man': .97, 'old woman': .98 })[voice] || 1))) * 100) / 100;
    assert.equal(plan.speed, old, `${voice} ${tone} ${kind}`);
  }
});

test('the narrator tells scene descriptions at the calm pace of captions', () => {
  assert.deepEqual(voicePlan({ voice: 'narrator', kind: 'scene', tone: 'normal' }, 498), voicePlan({ voice: 'narrator', kind: 'caption', tone: 'normal' }, 498));
  assert.equal(voicePlan({ voice: 'narrator', kind: 'scene' }, 498, { speed: 1.5 }).speed, voicePlan({ voice: 'narrator', kind: 'caption' }, 498, { speed: 1.5 }).speed);
});
