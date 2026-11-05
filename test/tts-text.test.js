import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLexicon, createPhonemizer, normalizeText, numberWords, guessSounds, chunkSounds, soundTokens, KOKORO_VOCAB, MAX_TOKENS, toEspeak, parsePiperTokens, piperIds } from '../src/tts-text.js';

const lexicon = parseLexicon(readFileSync(new URL('../tts/lexicon-en-us-v1.txt', import.meta.url), 'utf8'));
const g = createPhonemizer(lexicon);
const onlyKnownSymbols = sounds => [...sounds.normalize('NFD')].every(ch => KOKORO_VOCAB[ch] !== undefined);

test('the pronunciation list loads (misaki US words) and reads lines as Kokoro sounds', () => {
  assert.ok(lexicon.size > 180000, String(lexicon.size));
  assert.equal(g.phonemize("You're late! Where were you?"), 'jʊɹ lˈAt! wˌɛɹ wɜɹ ju?');
  assert.equal(g.phonemize('Later that night, at the lab...'), 'lˈATəɹ ðæt nˈIt, æt ðə lˈæb…', 'flaps are the T symbol Kokoro v1.0 was taught');
  assert.ok(onlyKnownSymbols(g.phonemize('With great power comes great responsibility.')));
});

test('ALL CAPITALS lettering reads like normal words; acronyms are spelled', () => {
  assert.equal(g.phonemize("YOU'RE LATE! WHERE WERE YOU?"), g.phonemize("You're late! Where were you?"));
  assert.match(g.phonemize('The FBI knew.'), /ˌɛfbˌiˈI/);
  assert.equal(normalizeText('I CAN SEE YOU!'), 'I can see you!');
});

test('"the", "a" and "to" change before a vowel, as people say them', () => {
  assert.match(g.phonemize('the apple'), /^ði /);
  assert.match(g.phonemize('the city'), /^ðə /);
  assert.equal(g.phonemize('a day'), 'ɐ dˈA');
  assert.match(g.phonemize('to it'), /^tʊ /);
  assert.match(g.phonemize('I have read it.'), /ɹˈɛd/, 'read after have is past tense');
  assert.match(g.phonemize('I will read it.'), /ɹˈid/);
});

test('numbers, money, years and shortcuts become words', () => {
  assert.equal(numberWords(1984), 'one thousand nine hundred eighty-four');
  assert.equal(normalizeText('In 1984 he paid $5,000 for 2 cars, 100% sure.'), 'In nineteen eighty-four he paid five thousand dollars for two cars, one hundred percent sure.');
  assert.equal(normalizeText('Mr. Parker is 2nd.'), 'mister Parker is second.');
  assert.equal(normalizeText('Wait -- no... “please”'), 'Wait — no… please');
});

test('comic words not in the list still get a sound: stretched words, noises, names', () => {
  assert.equal(g.word('Noooo'), g.word('no'));
  assert.match(g.word('Aaaargh'), /^ˈɑɹ/);
  assert.equal(g.word('Hnngh'), 'hˈʌŋ');
  for (const name of ['Galactus', 'Wakanda', 'Thwip', 'Zorblax', 'Krrrk']) {
    const sounds = g.word(name);
    assert.ok(sounds && onlyKnownSymbols(sounds) && sounds.includes('ˈ'), `${name} -> ${sounds}`);
  }
  assert.equal(guessSounds('make'), 'mˈAk', 'a final e makes the vowel long');
  assert.equal(guessSounds('blint'), 'blˈɪnt');
});

test('long text is cut at sentence ends into pieces the model can take', () => {
  const sounds = g.phonemize(Array.from({ length: 30 }, (_, i) => `This is sentence number ${i + 1}, and it goes on a while.`).join(' '));
  const pieces = chunkSounds(sounds);
  assert.ok(pieces.length > 1);
  assert.ok(pieces.every(piece => [...piece].length <= MAX_TOKENS));
  assert.equal(pieces.join(' ').replace(/\s+/g, ' '), sounds.replace(/\s+/g, ' '));
  assert.deepEqual(soundTokens('hˈɛ'), [50, 156, 86]);
  assert.deepEqual(soundTokens('ɐ̃'), [70, 17], 'nasal vowels split into vowel and tilde');
});

test('the light voices get the same sounds, written their way (espeak style)', () => {
  assert.equal(toEspeak(g.phonemize('Later that night, Peter met his aunt at the old city lab.')), 'lˈeɪɾɚ ðæt nˈaɪt, pˈiːɾɚ mˈɛt hɪz ˈænt æt ði ˈoʊld sˈɪɾi lˈæb.');
  assert.equal(toEspeak(g.phonemize('The water is better for the girl.')), 'ðə wˈɔːɾɚ ɪz bˈɛɾɚ fɔːɹ ðə ɡˈɜːl.');
  assert.equal(toEspeak('bˈY'), 'bˈɔɪ', 'the oy sound stays short');
  assert.equal(toEspeak('wˈAt — wˌʌt…'), 'wˈeɪt, wˌʌt...');
  const tokens = parsePiperTokens(readFileSync(new URL('../tts/piper-en_US-libritts_r-medium-tokens.txt', import.meta.url), 'utf8'));
  assert.equal(tokens[' '], 3); assert.equal(tokens['^'], 1); assert.equal(tokens.$, 2); assert.equal(tokens._, 0);
  assert.deepEqual(piperIds('hˈi', tokens), [1, 20, 0, 120, 0, 21, 0, 2], 'start, each sound and a pause mark, end');
  const ipa = toEspeak(g.phonemize("You're late! Where were you? With great power comes great responsibility."));
  assert.ok([...ipa.normalize('NFD')].every(ch => tokens[ch] !== undefined), 'every sound is one the voices know: ' + ipa);
});
