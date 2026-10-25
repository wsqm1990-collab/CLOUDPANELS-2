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
