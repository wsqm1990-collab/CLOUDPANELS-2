import test from 'node:test';
import assert from 'node:assert/strict';
import {findSagas, wheelCounts, wheelPool, wheelScopes, sampleSlices, pickWinner, landingRotation, sliceAtRotation, spinEase, rememberWinner, PAUSED_AFTER_DAYS} from '../src/saga-wheel.js';

const NOW = Date.parse('2026-11-10T12:00:00Z'), DAY = 86400000;
const ago = days => new Date(NOW - days * DAY).toISOString();
const comic = (path, extra = {}) => {
  const name = path.split('/').pop();
  return {id: 'mega:' + path, name, path, source: 'mega', size: 1, format: name.split('.').pop().toLowerCase(), metadata: {title: name.replace(/\.[^.]+$/, '')}, ...extra};
};
const issues = (folder, count, extension = 'cbz') => Array.from({length: count}, (_, index) => comic(`${folder}/Issue ${String(index + 1).padStart(3, '0')}.${extension}`));
const read = (list, from, to, days, status = 'finished') => Object.fromEntries(list.slice(from, to).map(item => [item.id, {status, page: 0, panel: 0, pageCount: 20, updatedAt: ago(days)}]));
const sagaNamed = (sagas, name) => sagas.find(saga => saga.name === name);

test('folders with comics directly inside are sagas, in issue order, starting at the first issue', () => {
  const comics = [...issues('Comics/Once and Future', 12), comic('Comics/Once and Future/Notes.txt')].reverse();
  const [saga] = findSagas(comics, {}, {now: NOW});
  assert.equal(saga.name, 'Once and Future');
  assert.deepEqual(saga.path, ['Comics', 'Once and Future']);
  assert.deepEqual(saga.parent, ['Comics']);
  assert.equal(saga.count, 12, 'files the reader does not open are left out');
  assert.equal(saga.state, 'new');
  assert.equal(saga.next.name, 'Issue 001.cbz');
  assert.equal(saga.comics[9].name, 'Issue 010.cbz', 'numbers sort as numbers');
});

test('a saga read up to some issue and left for a while is "paused", and goes on after the last one read', () => {
  const list = issues('Comics/Saga', 10);
  const sagas = findSagas(list, read(list, 0, 4, 30), {now: NOW});
  assert.equal(sagas[0].state, 'paused');
  assert.equal(sagas[0].finished, 4);
  assert.equal(sagas[0].next.name, 'Issue 005.cbz');
  assert.equal(sagas[0].lastAt, NOW - 30 * DAY);
});

test('an issue left half read is where a paused saga continues', () => {
  const list = issues('Comics/Saga', 10);
  const progress = {...read(list, 0, 3, 40), ...read(list, 3, 4, 20, 'reading')};
  const [saga] = findSagas(list, progress, {now: NOW});
  assert.equal(saga.state, 'paused');
  assert.equal(saga.reading, 1);
  assert.equal(saga.next.name, 'Issue 004.cbz');
});

test('after the last issue read, the next one not read yet; past the end, the first one skipped', () => {
  const list = issues('Comics/Saga', 6);
  const skipped = {...read(list, 0, 1, 50), ...read(list, 2, 6, 40)};
  assert.equal(findSagas(list, skipped, {now: NOW})[0].next.name, 'Issue 002.cbz');
  const jumped = {...read(list, 0, 1, 10), ...read(list, 3, 4, 9)};
  assert.equal(findSagas(list, jumped, {now: NOW})[0].next.name, 'Issue 005.cbz');
});

test('a whole folder marked read at once counts the last issue as the latest one', () => {
  const list = issues('Comics/Saga', 8);
  const [saga] = findSagas(list, read(list, 0, 5, 20), {now: NOW});
  assert.equal(saga.next.name, 'Issue 006.cbz');
});

test('sagas being read now and sagas read to the end stay out of the wheel', () => {
  const now = issues('Comics/Now', 5), done = issues('Comics/Done', 3), later = issues('Comics/Later', 4), fresh = issues('Comics/Fresh', 2);
  const progress = {...read(now, 0, 2, 1), ...read(done, 0, 3, 90), ...read(later, 0, 1, PAUSED_AFTER_DAYS + 1)};
  const sagas = findSagas([...now, ...done, ...later, ...fresh], progress, {now: NOW});
  assert.equal(sagaNamed(sagas, 'Now').state, 'active');
  assert.equal(sagaNamed(sagas, 'Done').state, 'finished');
  assert.equal(sagaNamed(sagas, 'Done').next, null);
  assert.equal(sagaNamed(sagas, 'Later').state, 'paused');
  assert.equal(sagaNamed(sagas, 'Fresh').state, 'new');
  assert.deepEqual(wheelCounts(sagas), {new: 1, paused: 1, all: 2});
  assert.deepEqual(wheelPool(sagas).map(saga => saga.name), ['Fresh', 'Later']);
  assert.deepEqual(wheelPool(sagas, {kind: 'new'}).map(saga => saga.name), ['Fresh']);
  assert.deepEqual(wheelPool(sagas, {kind: 'paused'}).map(saga => saga.name), ['Later']);
});

test('comics outside any folder stand on their own; samples and other sources are kept apart', () => {
  const loose = {id: 'local:1', name: 'One Shot.cbz', path: 'One Shot.cbz', source: 'local', size: 1, format: 'cbz', metadata: {title: 'One Shot'}};
  const demo = {id: 'demo:1', name: 'reader-demo.cbz', path: '', source: 'demo', size: 1, format: 'cbz', metadata: {title: 'Demo'}};
  const sameFolderElsewhere = {...comic('Comics/Saga/Issue 001.cbz'), id: 'local:2', source: 'local'};
  const sagas = findSagas([loose, demo, sameFolderElsewhere, ...issues('Comics/Saga', 2)], {}, {now: NOW});
  assert.equal(sagas.length, 3);
  const single = sagas.find(saga => saga.kind === 'comic');
  assert.equal(single.name, 'One Shot');
  assert.deepEqual(single.path, []);
  assert.equal(single.next, loose);
  assert.equal(sagas.filter(saga => saga.name === 'Saga').length, 2);
});

test('a folder named only by its number is shown with the folder it is in', () => {
  const names = ['Vol 1', 'Volume 12', 'Livro 3', 'Tomo 2', 'Season 1', '03', '#4', '01 - Origem', '2. Year One', '300', '100 Bullets', 'Saga', '1602 Witch Hunter Angela'];
  const sagas = findSagas(names.map(name => comic(`Comics/Series/${name}/Issue 001.cbz`)), {}, {now: NOW});
  assert.deepEqual(sagas.map(saga => saga.name).sort(), ['Series · #4', 'Series · 01 - Origem', 'Series · 2. Year One', 'Series · 03', '100 Bullets', 'Series · 300', '1602 Witch Hunter Angela',
    'Saga', 'Series · Livro 3', 'Series · Season 1', 'Series · Tomo 2', 'Series · Vol 1', 'Series · Volume 12'].sort());
  assert.equal(findSagas([comic('Vol 1/Issue 001.cbz')], {}, {now: NOW})[0].name, 'Vol 1', 'nothing to add at the top');
});

test('the draw can be kept to one folder, and folders holding a few sagas are offered', () => {
  const comics = [...issues('Marvel/X-Men/Vol 1', 2), ...issues('Marvel/X-Men/Vol 2', 2), ...issues('Marvel/Daredevil', 2), ...issues('DC/Batman', 2), ...issues('Image/Saga', 2)];
  const sagas = findSagas(comics, {}, {now: NOW});
  assert.deepEqual(wheelPool(sagas, {scope: ['Marvel', 'X-Men']}).map(saga => saga.name), ['X-Men · Vol 1', 'X-Men · Vol 2']);
  assert.deepEqual(wheelPool(sagas, {scope: 'Marvel'}).length, 3);
  assert.deepEqual(wheelScopes(sagas).map(folder => [folder.path.join('/'), folder.count]), [['Marvel', 3], ['Marvel/X-Men', 2]]);
  assert.deepEqual(wheelScopes(sagas, {min: 1}).map(folder => folder.path.join('/')), ['DC', 'DC/Batman', 'Image', 'Image/Saga', 'Marvel', 'Marvel/Daredevil', 'Marvel/X-Men', 'Marvel/X-Men/Vol 1', 'Marvel/X-Men/Vol 2']);
});

const sequence = values => { let index = 0; return () => values[index++ % values.length]; };
const pool = count => Array.from({length: count}, (_, index) => ({key: 'k' + index, name: 'Saga ' + index}));

test('the wheel shows up to eight sagas; a short pool is repeated evenly so it stays a wheel', () => {
  assert.equal(sampleSlices(pool(40)).length, 8);
  assert.equal(new Set(sampleSlices(pool(40)).map(saga => saga.key)).size, 8);
  for (const [size, slices] of [[1, 6], [2, 6], [3, 6], [4, 8], [5, 10], [6, 6], [7, 7]]) {
    const shown = sampleSlices(pool(size));
    assert.equal(shown.length, slices, `pool of ${size}`);
    const counts = new Map(); for (const saga of shown) counts.set(saga.key, (counts.get(saga.key) || 0) + 1);
    assert.equal(counts.size, size);
    assert.equal(new Set(counts.values()).size, 1, 'every saga as many times as any other');
  }
  assert.deepEqual(sampleSlices([]), []);
});

test('recent winners sit out when the pool is bigger than the wheel; a small pool is always shown whole', () => {
  const recent = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9', 'k10', 'k11'];
  for (let round = 0; round < 50; round++) {
    // Ten sagas, eight on the wheel: the two latest winners sit out.
    const ten = sampleSlices(pool(10), {avoid: recent}).map(saga => saga.key);
    assert.deepEqual([...ten].sort(), ['k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9']);
    // Thirty sagas: the ten latest winners sit out.
    assert.ok(sampleSlices(pool(30), {avoid: recent}).every(saga => !recent.slice(0, 10).includes(saga.key)));
    // Eight or fewer: everyone is on the wheel, the latest winner too.
    assert.deepEqual([...new Set(sampleSlices(pool(5), {avoid: recent}).map(saga => saga.key))].sort(), ['k0', 'k1', 'k2', 'k3', 'k4']);
  }
  assert.equal(sampleSlices(pool(1), {avoid: ['k0']})[0].key, 'k0', 'a single saga is never left out');
});

test('every saga of the pool is equally likely to win', () => {
  const sagas = pool(5), wins = new Map();
  let seed = 7;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let round = 0; round < 20000; round++) {
    const slices = sampleSlices(sagas, {count: 3, random});
    const winner = slices[pickWinner(slices, random)];
    wins.set(winner.key, (wins.get(winner.key) || 0) + 1);
  }
  for (const count of wins.values()) assert.ok(Math.abs(count - 4000) < 300, `about a fifth each, got ${count}`);
  assert.equal(pickWinner([]), -1);
});

test('the wheel stops with the winning slice under the pointer, after whole turns, never on an edge', () => {
  for (const total of [6, 7, 8, 10]) {
    for (let index = 0; index < total; index++) {
      for (const random of [0, .5, .9999]) {
        const from = 123.4, to = landingRotation(from, index, total, {turns: 5, random: () => random});
        assert.ok(to >= from + 5 * 360 && to < from + 6 * 360, 'five to six turns');
        assert.equal(sliceAtRotation(to, total), index);
        const angle = ((-to % 360) + 360) % 360, slice = 360 / total, inside = angle - index * slice;
        assert.ok(inside > slice * .17 && inside < slice * .83, 'away from the edges');
      }
    }
  }
  assert.equal(sliceAtRotation(0, 8), 0);
  assert.equal(sliceAtRotation(-10, 8), 0);
  assert.equal(sliceAtRotation(10, 8), 7);
});

test('the spin slows down smoothly to a stop', () => {
  assert.equal(spinEase(0), 0);
  assert.equal(spinEase(1), 1);
  assert.equal(spinEase(2), 1);
  let previous = 0, step = Infinity;
  for (let index = 1; index <= 100; index++) {
    const value = spinEase(index / 100), moved = value - previous;
    assert.ok(moved >= 0 && moved <= step + 1e-12, 'never backwards, never faster');
    previous = value; step = moved;
  }
});

test('the latest winners are remembered newest first, without repeats', () => {
  assert.deepEqual(rememberWinner(['b', 'a'], 'a'), ['a', 'b']);
  assert.deepEqual(rememberWinner(undefined, 'a'), ['a']);
  assert.equal(rememberWinner(Array.from({length: 20}, (_, index) => 'k' + index), 'new').length, 12);
});

test('a big library is gone through quickly', () => {
  const comics = [];
  for (let folder = 0; folder < 400; folder++) comics.push(...issues(`Comics/Publisher ${folder % 9}/Series ${folder}`, 16));
  const progress = {};
  for (let index = 0; index < comics.length; index += 3) progress[comics[index].id] = {status: index % 2 ? 'finished' : 'reading', updatedAt: ago(index % 40)};
  const started = performance.now();
  const sagas = findSagas(comics, progress, {now: NOW});
  wheelScopes(sagas); wheelPool(sagas);
  assert.equal(sagas.length, 400);
  assert.ok(performance.now() - started < 400, 'well under a second for 6400 comics');
});
