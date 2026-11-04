// English text to the sounds the natural voices read (Kokoro / misaki style
// phonemes). Words come from a pronunciation list (misaki, Apache-2.0); a few
// simple rules cover the rest (names, invented words, numbers, "the" before a
// vowel and so on). Runs inside the voice worker and in the tests.

// The Kokoro v1.0 symbol table (symbol -> number fed to the voice model).
export const KOKORO_VOCAB = Object.freeze({ ';': 1, ':': 2, ',': 3, '.': 4, '!': 5, '?': 6, '—': 9, '…': 10, '"': 11, '(': 12, ')': 13, '“': 14, '”': 15, ' ': 16, '̃': 17, 'ʣ': 18, 'ʥ': 19, 'ʦ': 20, 'ʨ': 21, 'ᵝ': 22, 'ꭧ': 23, 'A': 24, 'I': 25, 'O': 31, 'Q': 33, 'S': 35, 'T': 36, 'W': 39, 'Y': 41, 'ᵊ': 42, a: 43, b: 44, c: 45, d: 46, e: 47, f: 48, h: 50, i: 51, j: 52, k: 53, l: 54, m: 55, n: 56, o: 57, p: 58, q: 59, r: 60, s: 61, t: 62, u: 63, v: 64, w: 65, x: 66, y: 67, z: 68, 'ɑ': 69, 'ɐ': 70, 'ɒ': 71, 'æ': 72, 'β': 75, 'ɔ': 76, 'ɕ': 77, 'ç': 78, 'ɖ': 80, 'ð': 81, 'ʤ': 82, 'ə': 83, 'ɚ': 85, 'ɛ': 86, 'ɜ': 87, 'ɟ': 90, 'ɡ': 92, 'ɥ': 99, 'ɨ': 101, 'ɪ': 102, 'ʝ': 103, 'ɯ': 110, 'ɰ': 111, 'ŋ': 112, 'ɳ': 113, 'ɲ': 114, 'ɴ': 115, 'ø': 116, 'ɸ': 118, 'θ': 119, 'œ': 120, 'ɹ': 123, 'ɾ': 125, 'ɻ': 126, 'ʁ': 128, 'ɽ': 129, 'ʂ': 130, 'ʃ': 131, 'ʈ': 132, 'ʧ': 133, 'ʊ': 135, 'ʋ': 136, 'ʌ': 138, 'ɣ': 139, 'ɤ': 140, 'χ': 142, 'ʎ': 143, 'ʒ': 147, 'ʔ': 148, 'ˈ': 156, 'ˌ': 157, 'ː': 158, 'ʰ': 162, 'ʲ': 164, '↓': 169, '→': 171, '↗': 172, '↘': 173, 'ᵻ': 177 });
// Longer lines are made in pieces: the voice model's memory grows with the
// piece (about 360 MB at this size, 600 MB at 500).
export const MAX_TOKENS = 220;

const VOWEL_SOUNDS = new Set('AIOQWYaiuæɑɒɔəɛɜɪʊʌᵻ');
const PUNCT = new Set([';', ':', ',', '.', '!', '?', '—', '…']);
const PRIMARY = 'ˈ', SECONDARY = 'ˌ';

/** The pronunciation list: one "word<TAB>sounds" per line. */
export function parseLexicon(text) {
  const map = new Map();
  for (const row of String(text || '').split('\n')) {
    if (!row || row[0] === '#') continue;
    const tab = row.indexOf('\t');
    if (tab > 0) map.set(row.slice(0, tab), row.slice(tab + 1).trim());
  }
  return map;
}

// Comic book noises and interjections the list does not have.
const INTERJECTIONS = { grr: 'ɡˈɜɹ', grrr: 'ɡˈɜɹ', hnng: 'hˈʌŋ', hngh: 'hˈʌŋ', nngh: 'ˈʌŋ', nng: 'ˈʌŋ', ngh: 'ˈʌŋ', gah: 'ɡˈɑ', bah: 'bˈɑ', hah: 'hˈɑ', heh: 'hˈɛ', hmph: 'hˈʌmf', pfft: 'pfˈʌt', tsk: 'tˈɪsk', urk: 'ˈɜɹk', ack: 'ˈæk', eek: 'ˈik', oof: 'ˈuf', ow: 'ˈW', uh: 'ˈʌ', um: 'ˈʌm', huh: 'hˈʌ', wha: 'wˈʌ', aah: 'ˈɑ', ahh: 'ˈɑ', ah: 'ˈɑ', ooh: 'ˈu', ohh: 'ˈO', oh: 'ˈO', yah: 'jˈɑ', hyah: 'hjˈɑ', yeesh: 'jˈiʃ', sheesh: 'ʃˈiʃ', whew: 'hjˈu', phew: 'fjˈu', mmm: 'mˈʌm', mm: 'mˈʌm', hm: 'hˈʌm', hmm: 'hˈʌm', nyah: 'njˈɑ', gasp: 'ɡˈæsp', sigh: 'sˈI', sob: 'sˈɑb', gulp: 'ɡˈʌlp', cough: 'kˈɔf', ha: 'hˈɑ', haha: 'hˈɑhɑ', hahaha: 'hˈɑhɑhɑ', heheh: 'hˈɛhɛ', hehe: 'hˈihi', spidey: 'spˈIdi' };

const ABBREVIATIONS = { mr: 'mister', mrs: 'missus', ms: 'miz', dr: 'doctor', st: 'saint', jr: 'junior', sr: 'senior', prof: 'professor', capt: 'captain', sgt: 'sergeant', lt: 'lieutenant', gen: 'general', vs: 'versus', etc: 'et cetera', mt: 'mount', no: 'number' };
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORDINAL = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };

/** Whole numbers as words (up to the billions). */
export function numberWords(value) {
  let n = Math.floor(Math.abs(Number(value)));
  if (!Number.isFinite(n)) return '';
  if (n < 20) return ONES[n];
  const parts = [];
  for (const [size, name] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]) {
    if (n >= size) { parts.push(numberWords(Math.floor(n / size)), name); n %= size; }
  }
  if (n >= 100) { parts.push(ONES[Math.floor(n / 100)], 'hundred'); n %= 100; }
  if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '')); n = 0; }
  if (n > 0) parts.push(ONES[n]);
  return parts.join(' ');
}
function ordinalWords(n) {
  const words = numberWords(n).split(' '), last = words.pop(), pieces = last.split('-'), end = pieces.pop();
  const ord = ORDINAL[end] || (end.endsWith('y') ? end.slice(0, -1) + 'ieth' : end + 'th');
  return [...words, [...pieces, ord].join('-')].join(' ');
}
function yearWords(n) {
  if (n >= 2000 && n < 2010) return numberWords(n);
  const high = Math.floor(n / 100), low = n % 100;
  return numberWords(high) + ' ' + (low === 0 ? 'hundred' : low < 10 ? 'oh ' + ONES[low] : numberWords(low));
}

/** Turns symbols, numbers and shortcuts into words a voice can say. */
export function normalizeText(input) {
  let text = String(input || '').normalize('NFKC')
    .replace(/[‘’ʼ`´]/g, "'").replace(/[“”«»"]/g, ' ')
    .replace(/\.{3,}/g, '…').replace(/\s*[–—]+\s*|\s+-{1,2}\s+|-{2,}/g, ' — ')
    .replace(/[ \t\r\n]+/g, ' ');
  // Lettering in ALL CAPITALS reads as normal words (acronyms stay).
  const letters = text.match(/[A-Za-z]/g) || [], upper = text.match(/[A-Z]/g) || [];
  if (letters.length >= 4 && upper.length / letters.length > .8) text = text.toLowerCase().replace(/\bi\b/g, 'I').replace(/\bi'(m|ll|ve|d)\b/g, "I'$1");
  text = text.replace(/\$\s?(\d[\d,]*)(?:\.(\d\d))?/g, (_, whole, cents) => {
    const n = Number(whole.replace(/,/g, ''));
    return `${n} ${n === 1 ? 'dollar' : 'dollars'}` + (cents && Number(cents) ? ` and ${Number(cents)} ${Number(cents) === 1 ? 'cent' : 'cents'}` : '');
  });
  text = text.replace(/(\d)\s?%/g, '$1 percent').replace(/&/g, ' and ').replace(/\+/g, ' plus ').replace(/@/g, ' at ').replace(/#(\d)/g, 'number $1').replace(/°/g, ' degrees');
  text = text.replace(/\b(\d{1,3}(?:,\d{3})+|\d+)(st|nd|rd|th)\b/gi, (_, digits, suffix) => ` ${ordinalWords(Number(digits.replace(/,/g, '')))} `);
  text = text.replace(/\b(\d+)\.(\d+)\b/g, (_, whole, part) => ` ${numberWords(Number(whole))} point ${part.split('').map(d => ONES[Number(d)]).join(' ')} `);
  text = text.replace(/\b(\d{1,3}(?:,\d{3})+|\d+)(s?)\b/g, (_, digits, plural) => {
    const n = Number(digits.replace(/,/g, ''));
    let words = digits.length === 4 && !digits.includes(',') && n >= 1100 && n < 2100 ? yearWords(n) : numberWords(n);
    if (plural) words = words.endsWith('y') ? words.slice(0, -1) + 'ies' : words + 's';
    return ` ${words} `;
  });
  text = text.replace(/\b(mr|mrs|ms|dr|st|jr|sr|prof|capt|sgt|lt|gen|vs|etc|mt)\./gi, (match, word) => ABBREVIATIONS[word.toLowerCase()] + ' ');
  return text.replace(/[^A-Za-z0-9'\-;:,.!?…— ]+/g, ' ').replace(/\s+/g, ' ').replace(/\s+([;:,.!?…])/g, '$1').trim();
}

// ---- Rules for words that are not in the list ----
const LONG = { a: 'A', e: 'i', i: 'I', o: 'O', u: 'u', y: 'I' };
const SHORT = { a: 'æ', e: 'ɛ', i: 'ɪ', o: 'ɑ', u: 'ʌ', y: 'ɪ' };
const REDUCED = { a: 'ə', e: 'ə', i: 'ɪ', o: 'ə', u: 'ə', y: 'ɪ' };
const isVowelLetter = c => 'aeiouy'.includes(c || '#');
const isConsonantLetter = c => /[bcdfghjklmnpqrstvwxz]/.test(c || '');

/** A guess at how an unknown English-looking word sounds. */
export function guessSounds(input) {
  const w = String(input || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return '';
  const segments = []; // { p, vowel, kind: 'reducible' | 'r' | 'fixed' }
  const add = (p, vowel = false, kind = 'fixed', reduced = '') => segments.push({ p, vowel, kind, reduced });
  let i = 0;
  while (i < w.length) {
    const rest = w.slice(i), prev = w[i - 1] || '', c = w[i], next = w[i + 1] || '', end = w.length - i;
    const at = (text, onlyEnd = false) => rest.startsWith(text) && (!onlyEnd || rest.length === text.length);
    if (i === 0) {
      const start = [['kn', 'n'], ['gn', 'n'], ['wr', 'ɹ'], ['ps', 's'], ['pn', 'n'], ['wh', 'w'], ['rh', 'ɹ'], ['x', 'z']].find(([g]) => at(g) && (g !== 'x' || isVowelLetter(next)));
      if (start) { add(start[1]); i += start[0].length; continue; }
      if (c === 'y' && isVowelLetter(next)) { add('j'); i++; continue; }
    }
    const rules = [
      ['tch', 'ʧ'], ['dge', 'ʤ'], ['tion', 'ʃən', true], ['cian', 'ʃən', true], ['tian', 'ʃən', true], ['tial', 'ʃᵊl', true], ['cial', 'ʃᵊl', true],
      ['cious', 'ʃəs', true], ['tious', 'ʃəs', true], ['ture', 'ʧəɹ', true], ['eigh', 'A', true], ['augh', 'ɔ', true], ['igh', 'I', true], ['eau', 'O', true],
      ['sch', 'sk'], ['chr', 'kɹ'], ['ch', 'ʧ'], ['sh', 'ʃ'], ['th', 'θ'], ['ph', 'f'], ['ck', 'k'], ['nk', 'ŋk'], ['ng', 'ŋ'], ['qu', 'kw'], ['wh', 'w'],
    ];
    if (at('sion')) { add(isVowelLetter(prev) ? 'ʒən' : 'ʃən', true); i += 4; continue; }
    if (at('ough')) { add(w[i + 4] === 't' ? 'ɔ' : 'O', true); i += 4; continue; }
    if (at('ous', true)) { add('əs', true); i += 3; continue; }
    if (at('ism', true)) { add('ɪzᵊm', true); i += 3; continue; }
    if (end === 3 && isConsonantLetter(c) && next === 'l' && w[i + 2] === 'e' && i > 0) { add(c === 'c' ? 'k' : c); add('ᵊl', true); i += 3; continue; }
    if (at('que', true)) { add('k'); i += 3; continue; }
    if (at('gue', true) && i > 0) { add('ɡ'); i += 3; continue; }
    const rule = rules.find(([g]) => at(g));
    if (rule) { add(rule[1], Boolean(rule[2])); i += rule[0].length; continue; }
    if (at('gh')) { if (i === 0) add('ɡ'); i += 2; continue; }
    if ((at('mb', true) || at('mn', true))) { add('m'); i += 2; continue; }
    if (at('gn', true)) { add('n'); i += 2; continue; }
    if ((at('sc') || at('cc') || at('xc')) && 'eiy'.includes(w[i + 2] || '#')) { add(c === 's' ? 's' : 'ks'); i += 2; continue; }
    if (isConsonantLetter(c) && next === c && c !== 'c') { i++; continue; }
    if (isVowelLetter(c)) {
      const pair = rest.slice(0, 2), after = w[i + 2] || '';
      const two = { ai: 'A', ay: 'A', au: 'ɔ', aw: 'ɔ', ea: 'i', ee: 'i', ei: 'A', eu: 'u', ew: 'u', oa: 'O', oi: 'Y', oy: 'Y', oo: 'u', ou: 'W', ue: 'u', ui: 'u', uy: 'I' }[pair];
      if (pair === 'ey') { add(rest.length === 2 ? 'i' : 'A', true); i += 2; continue; }
      if (pair === 'ie') { add(rest.length === 2 && w.length <= 3 ? 'I' : 'i', true); i += 2; continue; }
      if (pair === 'oe') { add('O', true); i += 2; continue; }
      if (pair === 'ow') { add(rest.length === 2 ? 'O' : 'W', true); i += 2; continue; }
      if (two) { add(two, true); i += 2; continue; }
      if (c === 'y' && !isVowelLetter(next) && i > 0) { add(rest.length === 1 ? (segments.some(s => s.vowel) ? 'i' : 'I') : 'ɪ', true); i++; continue; }
      if (c === 'e' && rest.length === 1 && segments.some(s => s.vowel)) { i++; continue; }
      if (c === 'e' && rest === 'es' && /[sxz]|[cs]h/.test(w.slice(Math.max(0, i - 2), i)) && segments.some(s => s.vowel)) { add('ᵻz', true); i += 2; continue; }
      if (c === 'e' && rest === 'ed' && segments.some(s => s.vowel)) { add(/[td]$/.test(w.slice(0, i)) ? 'ᵻd' : /[pkfsxʃ]|ch|sh$/.test(w.slice(Math.max(0, i - 2), i)) ? 't' : 'd', /[td]$/.test(w.slice(0, i))); i += 2; continue; }
      if (next === 'r' && !isVowelLetter(after)) {
        const r = { a: ['ɑɹ', 'əɹ'], e: ['ɜɹ', 'əɹ'], i: ['ɜɹ', 'əɹ'], u: ['ɜɹ', 'əɹ'], o: ['ɔɹ', 'əɹ'], y: ['ɜɹ', 'əɹ'] }[c];
        if (r) { add(r[0], true, 'r', r[1]); i += 2; continue; }
      }
      // A vowel, one consonant and a final "e" is long (cake, time, hope).
      const magic = isConsonantLetter(next) && next !== 'x' && next !== 'w' && /^e(s|d)?$/.test(w.slice(i + 2)) && w.length > 3;
      if (magic) { add(LONG[c], true); i++; continue; }
      if (rest.length === 1 && 'aiou'.includes(c) && segments.length) { add({ a: 'ə', i: 'i', o: 'O', u: 'u' }[c], true); i++; continue; }
      add(SHORT[c], true, 'reducible', REDUCED[c]); i++; continue;
    }
    const single = { b: 'b', d: 'd', f: 'f', j: 'ʤ', k: 'k', l: 'l', m: 'm', n: 'n', p: 'p', q: 'k', r: 'ɹ', t: 't', v: 'v', w: 'w', x: 'ks', z: 'z' }[c];
    if (single) { add(single); i++; continue; }
    if (c === 'c') { add('eiy'.includes(next || '#') ? 's' : 'k'); i++; continue; }
    if (c === 'g') { add('eiy'.includes(next || '#') && next ? 'ʤ' : 'ɡ'); i++; continue; }
    if (c === 'h') { if (!(isVowelLetter(prev) && !isVowelLetter(next))) add('h'); i++; continue; }
    if (c === 's') { add(isVowelLetter(prev) && isVowelLetter(next) ? 'z' : 's'); i++; continue; }
    i++;
  }
  // Stress the first vowel; later plain vowels relax (banana -> bənˈænə style).
  let stressed = false, out = '';
  for (const segment of segments) {
    if (segment.vowel && !stressed) { stressed = true; out += PRIMARY + segment.p; continue; }
    out += segment.vowel && segment.kind !== 'fixed' && segment.reduced ? segment.reduced : segment.p;
  }
  if (!stressed) {
    // No vowel at all ("hmm", "brr"): say it with a short "uh".
    const first = out.search(/[^ˈˌ]/);
    out = out ? out.slice(0, first + 1) + PRIMARY + 'ʌ' + out.slice(first + 1) : '';
  }
  return out;
}

const startsWithVowel = ps => {
  for (const ch of String(ps || '')) { if (ch === PRIMARY || ch === SECONDARY) continue; return VOWEL_SOUNDS.has(ch); }
  return null;
};

function suffixS(stem) { const last = stem.slice(-1); return /[ptkfθ]/.test(last) ? stem + 's' : /[szʃʒʧʤ]/.test(last) ? stem + 'ᵻz' : stem + 'z'; }
function suffixEd(stem) {
  const last = stem.slice(-1);
  if (/[pkfθʃsʧ]/.test(last)) return stem + 't';
  if (last === 'd') return stem + 'ᵻd';
  if (last !== 't') return stem + 'd';
  return /[AIOWYiuæɑəɛɪɹʊʌ]/.test(stem.slice(-2, -1)) ? stem.slice(0, -1) + 'Tᵻd' : stem + 'ᵻd';
}
function suffixIng(stem) { return stem.length > 1 && stem.slice(-1) === 't' && /[AIOWYiuæɑəɛɪɹʊʌ]/.test(stem.slice(-2, -1)) ? stem.slice(0, -1) + 'Tɪŋ' : stem + 'ɪŋ'; }

/** A phonemizer over a pronunciation list (a Map of word -> sounds). */
export function createPhonemizer(lexicon = new Map()) {
  const known = word => lexicon.get(word) ?? lexicon.get(word.toLowerCase()) ?? lexicon.get(word[0]?.toUpperCase() + word.slice(1).toLowerCase());
  const has = word => known(word) !== undefined;
  function stems(word) {
    const w = word.toLowerCase();
    if (w.length >= 3 && w.endsWith('s')) {
      if (w.endsWith("'s") && has(w.slice(0, -2))) return suffixS(known(w.slice(0, -2)));
      if (w.endsWith("s'") && has(w.slice(0, -2))) return suffixS(known(w.slice(0, -2)));
      if (!w.endsWith('ss') && has(w.slice(0, -1))) return suffixS(known(w.slice(0, -1)));
      if (w.length > 4 && w.endsWith('ies') && has(w.slice(0, -3) + 'y')) return suffixS(known(w.slice(0, -3) + 'y'));
      if (w.length > 4 && w.endsWith('es') && has(w.slice(0, -2))) return suffixS(known(w.slice(0, -2)));
    }
    if (w.length >= 4 && w.endsWith('d')) {
      if (!w.endsWith('dd') && has(w.slice(0, -1))) return suffixEd(known(w.slice(0, -1)));
      if (w.length > 4 && w.endsWith('ed') && !w.endsWith('eed') && has(w.slice(0, -2))) return suffixEd(known(w.slice(0, -2)));
      if (w.length > 5 && /([bdgklmnprstz])\1ed$/.test(w) && has(w.slice(0, -3))) return suffixEd(known(w.slice(0, -3)));
    }
    if (w.length >= 5 && w.endsWith('ing')) {
      if (has(w.slice(0, -3)) && w.length > 5) return suffixIng(known(w.slice(0, -3)));
      if (has(w.slice(0, -3) + 'e')) return suffixIng(known(w.slice(0, -3) + 'e'));
      if (w.length > 5 && /([bcdgklmnprstvxz])\1ing$/.test(w) && has(w.slice(0, -4))) return suffixIng(known(w.slice(0, -4)));
      if (w.endsWith("in'") && has(w.slice(0, -1) + 'g')) return known(w.slice(0, -1) + 'g').replace(/ŋ$/, 'n');
    }
    if (w.endsWith("in'") && has(w.slice(0, -1) + 'g')) return known(w.slice(0, -1) + 'g').replace(/ŋ$/, 'n');
    if (w.length > 4 && w.endsWith('ly') && has(w.slice(0, -2))) return known(w.slice(0, -2)) + 'li';
    return undefined;
  }
  function spell(word) {
    const letters = word.toUpperCase().split('').map(ch => lexicon.get(ch));
    if (letters.some(p => p === undefined)) return undefined;
    // Each letter loses its stress except the last ("FBI" -> ˌɛfbˌiˈI style).
    return letters.map((p, index) => index === letters.length - 1 ? p : p.replace(PRIMARY, SECONDARY)).join('');
  }
  function word(raw) {
    if (!raw) return '';
    if (/^[A-Z]{2,5}$/.test(raw) && raw !== 'I' && lexicon.get(raw) === undefined && !has(raw.toLowerCase())) return spell(raw) ?? guessSounds(raw);
    let found = known(raw) ?? stems(raw);
    if (found !== undefined) return found;
    const lower = raw.toLowerCase();
    const squeezed = lower.replace(/(.)\1+/g, '$1');
    if (INTERJECTIONS[lower] || INTERJECTIONS[squeezed]) return INTERJECTIONS[lower] || INTERJECTIONS[squeezed];
    // "Nooooo", "Aaargh": fewer repeated letters until it is a known word.
    if (/(.)\1\1/.test(lower)) {
      for (const shorter of [lower.replace(/(.)\1{2,}/g, '$1$1'), lower.replace(/(.)\1{2,}/g, '$1'), lower.replace(/(.)\1+/g, '$1')]) {
        found = known(shorter) ?? stems(shorter) ?? INTERJECTIONS[shorter];
        if (found !== undefined) return found;
      }
      return guessSounds(lower.replace(/(.)\1{2,}/g, '$1'));
    }
    // Two known words written together ("spiderverse").
    for (let cut = lower.length - 3; cut >= 3; cut--) {
      const left = known(lower.slice(0, cut)), right = known(lower.slice(cut));
      if (left !== undefined && right !== undefined && lower.length >= 7) return left + right.replace(PRIMARY, SECONDARY);
    }
    return guessSounds(lower);
  }
  function wordSounds(raw, nextSounds) {
    const lower = raw.toLowerCase(), nextVowel = startsWithVowel(nextSounds);
    if (lower === 'the') return nextVowel ? 'ði' : 'ðə';
    if (lower === 'a') return nextSounds === null ? 'ˈA' : 'ɐ';
    if (lower === 'an') return 'ɐn';
    if (lower === 'to') return nextVowel === null ? (known('to') || 'tu') : nextVowel ? 'tʊ' : 'tə';
    if (lower === 'in') return nextSounds === null ? 'ˈɪn' : 'ɪn';
    if (raw === 'I') return 'ˌI';
    const parts = raw.split('-').filter(Boolean);
    if (parts.length > 1 && !has(raw)) return parts.map(part => /^\d+$/.test(part) ? numberWords(part) : part).map(part => part.includes(' ') ? phonemize(part) : word(part)).join(' ');
    return word(raw);
  }
  const PAST = new Set(['have', 'has', 'had', "i've", "you've", "we've", "they've", 'was', 'were', 'been', 'is', 'are', "i'd", 'just', 'already', 'never']);
  /** Sentence text -> the sounds the voice model reads. */
  function phonemize(text) {
    const clean = normalizeText(text);
    const tokens = clean.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*'?|[;:,.!?…—]| +/g) || [];
    const sounds = new Array(tokens.length).fill('');
    let next = null; // sounds of the following word (null at the end or before a stop)
    for (let index = tokens.length - 1; index >= 0; index--) {
      const token = tokens[index];
      if (token.startsWith(' ')) { sounds[index] = ' '; continue; }
      if (PUNCT.has(token)) { sounds[index] = token; if (token !== ',' && token !== '—') next = null; continue; }
      let ps = wordSounds(token, next);
      if (token.toLowerCase() === 'read') {
        const before = tokens.slice(0, index).reverse().find(t => /[A-Za-z]/.test(t));
        if (before && PAST.has(before.toLowerCase()) && lexicon.get('read:past')) ps = lexicon.get('read:past');
      }
      sounds[index] = ps; next = ps;
    }
    return sounds.join('').replace(/ +/g, ' ').replace(/ ([;:,.!?…])/g, '$1').trim();
  }
  return { phonemize, word: raw => word(raw), size: lexicon.size };
}

/** Splits long sounds into pieces the model can read (at stops, then commas). */
export function chunkSounds(ps, max = MAX_TOKENS) {
  const text = String(ps || '').trim();
  if (!text) return [];
  if ([...text].length <= max) return [text];
  const pieces = [];
  let current = '';
  const parts = text.split(/(?<=[.!?…;:])\s+/);
  for (const part of parts) {
    if ([...current].length + 1 + [...part].length <= max) { current = current ? current + ' ' + part : part; continue; }
    if (current) pieces.push(current);
    if ([...part].length <= max) { current = part; continue; }
    current = '';
    for (const piece of part.split(/(?<=[,—])\s+|\s+/)) {
      if ([...current].length + 1 + [...piece].length <= max) current = current ? current + ' ' + piece : piece;
      else { if (current) pieces.push(current); current = [...piece].slice(0, max).join(''); }
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Sounds -> model numbers (unknown symbols are left out). */
export function soundTokens(ps) {
  const out = [];
  for (const ch of String(ps || '').normalize('NFD')) { const id = KOKORO_VOCAB[ch]; if (id !== undefined) out.push(id); }
  return out;
}
