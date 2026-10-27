import test from 'node:test';
import assert from 'node:assert/strict';
import { issueNumber, issueRanges, libraryContext } from '../src/assistant.js';

test('issue numbers come from metadata or file names', () => {
  assert.equal(issueNumber({ name: 'Saga 012 (2013).cbr', metadata: {} }), 12);
  assert.equal(issueNumber({ name: 'Batman #7.cbz', metadata: {} }), 7);
  assert.equal(issueNumber({ name: 'x.cbz', metadata: { issue: '42' } }), 42);
  assert.equal(issueNumber({ name: 'One-Shot (2020).cbz', metadata: {} }), null);
});

test('owned issue ranges and gaps are summarised', () => {
  assert.deepEqual(issueRanges([1, 2, 3, 4, 9, 10, 12]), { ranges: '1-4, 9-10, 12', missing: [5, 6, 7, 8, 11] });
});

test('library context lists series, progress and short references', () => {
  const comics = [1, 2, 4].map(n => ({ id: 'mega:' + n, name: `Saga 00${n}.cbr`, metadata: { title: `Saga 00${n}`, series: 'Saga', publisher: 'Image' } }));
  const { text, byRef } = libraryContext({ comics, progress: { 'mega:1': { status: 'finished', page: 20, pageCount: 22, updatedAt: '2026-10-01' }, 'mega:2': { status: 'reading', page: 4, pageCount: 22, updatedAt: '2026-10-02' } }, favorites: ['mega:1'] });
  assert.match(text, /Saga \(Image\): 3 ed\. nº 1-2, 4; lidas 1\/3; lendo \[\[c2\]\]; faltando: 3/);
  assert.match(text, /Favoritos: \[\[c1\]\]/);
  assert.equal(byRef.get('c3'), 'mega:4');
});

import { buildLibraryIndex, libraryBrief, libraryTools, cleanHistory, askAssistant, friendlyError } from '../src/assistant.js';

const bigLibrary = () => {
  const comics = [], progress = {};
  for (let f = 0; f < 60; f++) for (let n = 1; n <= 40; n++) {
    const id = `mega:f${f}n${n}`;
    comics.push({ id, name: `Series ${f} ${String(n).padStart(3, '0')}.cbr`, metadata: { title: `Series ${f} ${n}`, series: `Series ${f}`, publisher: f % 2 ? 'DC' : 'Marvel' }, path: `HQs/Pub ${f % 3}/Series ${f}/Series ${f} ${n}.cbr` });
    if (n <= 3) progress[id] = { status: n === 3 ? 'reading' : 'finished', page: 5, pageCount: 22, updatedAt: `2026-10-${String(1 + (f % 28)).padStart(2, '0')}` };
  }
  return { comics, progress, favorites: ['mega:f7n1'] };
};
const folderOf = c => c.path.split('/').slice(0, -1).join(' / ');

test('the library overview names every folder of a large collection without cutting it', () => {
  const index = buildLibraryIndex(bigLibrary(), { folderOf });
  const brief = libraryBrief(index);
  assert.match(brief, /Biblioteca: 2400 quadrinhos/);
  for (let f = 0; f < 60; f++) assert.ok(brief.includes(`HQs / Pub ${f % 3} / Series ${f} — 40`), `folder ${f} listed`);
  assert.ok(brief.length < 30000, `brief has ${brief.length} chars`);
});

test('library tools find comics in any folder, list folders and report gaps', () => {
  const state = bigLibrary(); state.comics = state.comics.filter(c => c.id !== 'mega:f59n20');
  const index = buildLibraryIndex(state, { folderOf }), tools = libraryTools(index);
  const found = tools.search_library.run({ query: 'series 59' });
  assert.match(found, /\[\[c\d+\]\] Series 59 1 \(#1\) — pasta: HQs \/ Pub 2 \/ Series 59/);
  assert.match(found, /39 no total/);
  const folder = tools.list_folder.run({ path: 'HQs / Pub 1' });
  assert.match(folder, /Subpastas:/); assert.match(folder, /HQs \/ Pub 1 \/ Series 58 — 40/);
  const inside = tools.list_folder.run({ path: 'Series 58' });
  assert.match(inside, /Revistas nesta pasta:/);
  assert.match(tools.series_status.run({ series: 'Series 59' }), /faltando: 20/);
  assert.match(tools.reading_history.run({ status: 'reading' }), /lendo \(pág\. 6\/22\)/);
  assert.match(tools.search_library.run({ query: 'nothing like this' }), /Nada encontrado/);
});

test('history sent to the AI always starts with the question side and has no empty turns', () => {
  const chat = [];
  for (let i = 0; i < 9; i++) chat.push({ role: 'user', text: `q${i}` }, { role: 'assistant', text: i === 4 ? '' : `a${i}` });
  chat.push({ role: 'user', text: 'latest' });
  const clean = cleanHistory(chat, 16);
  assert.equal(clean[0].role, 'user'); assert.equal(clean.at(-1).text, 'latest');
  for (let i = 1; i < clean.length; i++) assert.notEqual(clean[i].role, clean[i - 1].role);
  assert.ok(clean.every(m => m.text));
});

function sse(events) {
  const text = events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(text)); controller.close(); } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
const textTurn = (text, stop = 'end_turn') => [{ type: 'message_start', message: {} },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }, { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: stop } }, { type: 'message_stop' }];

test('the assistant answers library questions through tools and resumes paused turns', async () => {
  const requests = [];
  const replies = [
    sse([{ type: 'message_start', message: {} },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Vou olhar.' } }, { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'search_library', input: {} } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"query":' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"series 7"}' } }, { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } }]),
    sse(textTurn('Parte 1', 'pause_turn')),
    sse(textTurn('Você tem [[c1]].')),
  ];
  const fetchImpl = async (url, options) => { requests.push(JSON.parse(options.body)); return replies.shift(); };
  const index = buildLibraryIndex(bigLibrary(), { folderOf });
  const seen = [];
  const answer = await askAssistant({ key: 'sk-ant-test', system: 'x', web: false, tools: libraryTools(index), fetchImpl,
    messages: [{ role: 'assistant', text: 'olá' }, { role: 'user', text: 'o que tenho de series 7?' }], onText: value => seen.push(value) });
  assert.equal(requests.length, 3);
  assert.equal(requests[0].messages[0].role, 'user');
  assert.ok(requests[0].tools.some(tool => tool.name === 'list_folder'));
  const toolResult = requests[1].messages.at(-1).content[0];
  assert.equal(toolResult.type, 'tool_result'); assert.equal(toolResult.tool_use_id, 'toolu_1');
  assert.match(toolResult.content, /Series 7 1/);
  assert.deepEqual(requests[1].messages.at(-2).content[1].input, { query: 'series 7' });
  assert.equal(requests[2].messages.at(-1).role, 'assistant', 'paused turn sent back unchanged');
  assert.match(answer, /Vou olhar\.\n\nParte 1\n\nVocê tem \[\[c1\]\]\./);
  assert.ok(seen.length >= 3);
});

test('an empty answer or an API refusal becomes a clear message', async () => {
  const empty = async () => sse([{ type: 'message_start', message: {} }, { type: 'message_delta', delta: { stop_reason: 'end_turn' } }]);
  await assert.rejects(askAssistant({ key: 'k', system: 's', web: false, fetchImpl: empty, messages: [{ role: 'user', text: 'oi' }] }), error => error.type === 'empty_answer');
  const refused = async () => new Response(JSON.stringify({ error: { type: 'invalid_request_error', message: 'messages: roles must alternate' } }), { status: 400 });
  const error = await askAssistant({ key: 'k', system: 's', web: false, fetchImpl: refused, messages: [{ role: 'user', text: 'oi' }] }).catch(e => e);
  assert.equal(error.status, 400);
  assert.match(friendlyError(error, 'pt-BR'), /recusou o pedido: messages: roles must alternate/);
  assert.match(friendlyError({ type: 'empty_answer' }, 'pt-BR'), /não mandou resposta/);
});
