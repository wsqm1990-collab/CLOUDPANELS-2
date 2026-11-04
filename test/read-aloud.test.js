import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, linesForStep, pickVoice, utteranceSettings, panelsKeyOf, scriptKey, createSpeaker, requestPageScript, scriptRequestNote } from '../src/read-aloud.js';

const reply = JSON.stringify({ language: 'pt-BR', lines: [
  { panel: 1, x: .3, y: .1, kind: 'caption', speaker: 'narrator', voice: 'narrator', tone: 'normal', text: 'Mais tarde…' },
  { panel: 1, x: .6, y: .2, kind: 'speech', speaker: 'Ana', voice: 'woman', tone: 'shout', text: 'Você  chegou\ntarde!' },
  { panel: 2, x: .2, y: .6, kind: 'sfx', speaker: '', voice: 'man', tone: 'normal', text: 'BOOM' },
  { panel: 2, x: .25, y: .7, kind: 'speech', speaker: 'Rui', voice: 'man', tone: 'whisper', text: 'O trem atrasou.' },
  { panel: 0, x: .8, y: .75, kind: 'thought', speaker: 'Rui', voice: 'man', tone: 'sad', text: 'De novo...' },
] });
const panels = [{ x: 0, y: 0, width: 1, height: .45 }, { x: 0, y: .5, width: .5, height: .5 }, { x: .5, y: .5, width: .5, height: .5 }];

test('the AI reply becomes a checked page script, even with words around the JSON', () => {
  const script = parseScript(`Here it is:\n${reply}\nDone.`, { panelCount: 3, panelsKey: panelsKeyOf(panels) });
  assert.equal(script.language, 'pt-BR');
  assert.equal(script.lines.length, 5);
  assert.equal(script.lines[1].text, 'Você chegou tarde!', 'spaces and line breaks are tidied');
  assert.equal(script.lines[1].tone, 'shout');
  assert.equal(script.panelsKey, panelsKeyOf(panels));
  const odd = parseScript(JSON.stringify({ language: 'und', lines: [{ panel: 9, x: 'left', y: 3, kind: 'yell', voice: 'dragon', tone: 'mad', text: ' Hi ' }, { text: '' }, null] }), { panelCount: 2 });
  assert.deepEqual(odd.lines, [{ panel: 0, x: null, y: 1, kind: 'speech', tone: 'normal', voice: 'man', speaker: '', text: 'Hi' }], 'unknown values fall back, empty lines are dropped');
  assert.equal(odd.language, '');
  assert.throws(() => parseScript('Sorry, no.'), /did not describe/);
  assert.throws(() => parseScript('{not json}'), /did not describe/);
});

test('each panel reads its own lines in order; sound effects wait for later', () => {
  const script = parseScript(reply, { panelCount: 3, panelsKey: panelsKeyOf(panels) });
  const texts = step => linesForStep(script, { rects: panels, panelsKey: panelsKeyOf(panels), ...step }).map(line => line.text);
  assert.deepEqual(texts({ panel: 0 }), ['Mais tarde…', 'Você chegou tarde!']);
  assert.deepEqual(texts({ panel: 1 }), ['O trem atrasou.'], 'BOOM is not read by the device voice');
  assert.deepEqual(texts({ panel: 2 }), ['De novo...'], 'a line without a panel number goes where it sits');
  assert.deepEqual(texts({ panel: 0, overview: true }), [], 'the whole page view reads nothing');
  assert.deepEqual(linesForStep(script, { rects: [] }).map(line => line.text), ['Mais tarde…', 'Você chegou tarde!', 'O trem atrasou.', 'De novo...'], 'a whole page reads everything');
});

test('when the panels change (or the page is read in parts) lines follow their place on the page', () => {
  const script = parseScript(reply, { panelCount: 3, panelsKey: panelsKeyOf(panels) });
  const parts = [{ x: 0, y: 0, width: .55, height: .55 }, { x: .45, y: 0, width: .55, height: .55 }, { x: 0, y: .45, width: .55, height: .55 }, { x: .45, y: .45, width: .55, height: .55 }];
  const texts = panel => linesForStep(script, { rects: parts, panel, panelsKey: '' }).map(line => line.text);
  assert.deepEqual(texts(0), ['Mais tarde…']);
  assert.deepEqual(texts(1), ['Você chegou tarde!']);
  assert.deepEqual(texts(2), ['O trem atrasou.']);
  assert.deepEqual(texts(3), ['De novo...']);
  const placeless = parseScript(JSON.stringify({ lines: [{ x: .1, y: .1, text: 'A' }, { text: 'B' }, { x: .9, y: .9, text: 'C' }] }));
  assert.deepEqual(linesForStep(placeless, { rects: parts, panel: 0 }).map(line => line.text), ['A', 'B'], 'a line with no place stays with the one before it');
});

test('the device voice matches the language, preferring the exact region and nicer voices', () => {
  const voices = [{ name: 'Joana', lang: 'pt-PT' }, { name: 'Luciana', lang: 'pt-BR' }, { name: 'Google português do Brasil', lang: 'pt_BR' }, { name: 'Samantha', lang: 'en-US', default: true }];
  assert.equal(pickVoice(voices, 'pt-BR').name, 'Google português do Brasil');
  assert.equal(pickVoice(voices, 'pt-PT').name, 'Joana');
  assert.equal(pickVoice(voices, 'en-GB').name, 'Samantha', 'same language, other region');
  assert.equal(pickVoice(voices, 'ja-JP'), null);
  assert.equal(pickVoice([], 'en-US'), null);
});

test('shouts are a little faster and higher, whispers softer, children higher', () => {
  const normal = utteranceSettings({ tone: 'normal', voice: 'narrator' });
  const shout = utteranceSettings({ tone: 'shout', voice: 'man' }), whisper = utteranceSettings({ tone: 'whisper', voice: 'man' });
  assert.ok(shout.rate > normal.rate && whisper.volume < normal.volume);
  assert.ok(utteranceSettings({ voice: 'girl' }).pitch > utteranceSettings({ voice: 'man' }).pitch);
  for (const settings of [shout, whisper, utteranceSettings({ voice: 'creature', tone: 'scared', kind: 'thought' }, 3)]) {
    assert.ok(settings.rate >= .5 && settings.rate <= 2 && settings.pitch >= .5 && settings.pitch <= 2 && settings.volume > 0 && settings.volume <= 1);
  }
});

test('each page of each comic has its own place on the device', () => {
  const comic = { id: 'mega:1', source: 'mega', size: 1234, name: 'Saga 001.cbr' };
  assert.notEqual(scriptKey(comic, 0), scriptKey(comic, 1));
  assert.notEqual(scriptKey(comic, 2), scriptKey({ ...comic, size: 999 }, 2));
  assert.equal(scriptKey(null, 0), null);
  assert.equal(scriptKey(comic, undefined), null);
  assert.notEqual(panelsKeyOf(panels), panelsKeyOf(panels.slice(1)));
  assert.equal(panelsKeyOf([]), '');
});

function fakeSynth() {
  const spoken = [];
  return { spoken, getVoices: () => [{ name: 'Luciana', lang: 'pt-BR' }], cancel() { this.cancelled = (this.cancelled || 0) + 1; },
    speak(utterance) { spoken.push(utterance); setTimeout(() => utterance.onend?.(), 5); } };
}
class FakeUtterance { constructor(text) { this.text = text; } }

test('the speaker reads lines one after another with the right voice, and stops when cancelled', async () => {
  const synth = fakeSynth(), speaker = createSpeaker({ synth, Utterance: FakeUtterance, wait: ms => new Promise(resolve => setTimeout(resolve, Math.min(ms, 5))) });
  const done = await speaker.speak([{ text: 'Um.', tone: 'shout', voice: 'man' }, { text: 'Dois.' }], { language: 'pt-BR' });
  assert.equal(done, true);
  assert.deepEqual(synth.spoken.map(u => u.text), ['Um.', 'Dois.']);
  assert.equal(synth.spoken[0].voice.name, 'Luciana'); assert.equal(synth.spoken[0].lang, 'pt-BR');
  assert.ok(synth.spoken[0].rate > synth.spoken[1].rate, 'the shout is quicker');
  const reading = speaker.speak([{ text: 'Três.' }, { text: 'Quatro.' }, { text: 'Cinco.' }], { language: 'pt-BR' });
  setTimeout(() => speaker.cancel(), 12);
  assert.equal(await reading, false);
  assert.ok(synth.spoken.length < 5, 'it stopped before the end');
  assert.equal(await createSpeaker({ synth: undefined, Utterance: undefined }).speak([{ text: 'x' }]), false, 'no voice on the device: nothing happens');
});

test('the page goes to the AI with the user key and comes back as a script', async () => {
  let sent;
  const fetchImpl = async (url, options) => { sent = { url, ...options, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: reply }] }) }; };
  const script = await requestPageScript({ key: 'sk-test', image: 'AAAA', panelCount: 3, panelsKey: 'k', fetchImpl });
  assert.equal(sent.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(sent.headers['x-api-key'], 'sk-test');
  assert.equal(sent.body.messages[0].content[0].source.data, 'AAAA');
  assert.match(sent.body.messages[0].content[1].text, /numbered 1 to 3/);
  assert.equal(script.lines.length, 5); assert.equal(script.panelsKey, 'k');
  await assert.rejects(requestPageScript({ key: '', image: 'A', fetchImpl }), error => error.type === 'no_key');
  await assert.rejects(requestPageScript({ key: 'k', image: 'A', fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid x-api-key' } }) }) }), error => error.status === 401);
  assert.match(scriptRequestNote({ direction: 'rtl' }), /right to left/);
});

test('with areas outside the panels in between, numbered lines still find their panel', () => {
  const top = { x: 0, y: 0, width: 1, height: .4 }, left = { x: 0, y: .45, width: .5, height: .55 }, right = { x: .5, y: .45, width: .5, height: .55 };
  const script = parseScript(JSON.stringify({ lines: [{ panel: 0, x: .3, y: .1, text: 'Up here.' }, { panel: 1, x: .9, y: .9, text: 'Left one.' }, { panel: 2, x: .7, y: .7, text: 'Right one.' }] }), { panelCount: 2, panelsKey: panelsKeyOf([left, right]) });
  const steps = [top, { ...left }, { ...right }], texts = panel => linesForStep(script, { rects: steps, panel, panelsKey: panelsKeyOf([left, right]), numberedRects: [left, right] }).map(line => line.text);
  assert.deepEqual(texts(0), ['Up here.'], 'a balloon outside every panel is read with the area it sits in');
  assert.deepEqual(texts(1), ['Left one.'], 'the AI said panel 1, even if its spot looked elsewhere');
  assert.deepEqual(texts(2), ['Right one.']);
});
