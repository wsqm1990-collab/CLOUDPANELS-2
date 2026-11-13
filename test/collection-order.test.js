import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionItems, nextInCollection, continueInCollection, reanchorMissing, findCollection, proposeCollection, cleanProposal, MAX_ORDER } from '../src/collection-order.js';
import { LibraryStore } from '../src/store.js';

const memory = () => { const data = new Map(); return { getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k, v), data }; };
const comic = (id, title = id, path = 'Marvel/Civil War') => ({ id, name: `${title}.cbz`, size: 1000, path, source: 'mega', format: 'cbz', metadata: { title } });
const byId = list => new Map(list.map(c => [c.id, c]));

test('a collection in its own order: comics and missing issues numbered where they belong', () => {
  const comics = byId([comic('a'), comic('b'), comic('c')]);
  const collection = { comicIds: ['a', 'gone', 'b', 'c'], missing: [{ title: 'Front Line #1', before: 'b' }, { title: 'Epilogue', before: '' }, { title: 'Before the gone one', before: 'gone' }] };
  const items = collectionItems(collection, comics);
  assert.deepEqual(items.map(item => item.type === 'comic' ? `${item.position}:${item.comic.id}` : `${item.position}:? ${item.title}`),
    ['1:a', '2:? Before the gone one', '3:? Front Line #1', '4:b', '5:c', '6:? Epilogue']);
  assert.deepEqual(collectionItems({ comicIds: ['c', 'a'] }, comics).map(item => item.comic.id), ['c', 'a'], 'no missing list: its comics in its order');
  assert.deepEqual(collectionItems(null, comics), []);
});

test('the next comic comes from the collection, skipping what cannot be opened; none at its end', () => {
  const comics = byId([comic('a'), comic('b'), { ...comic('c'), format: 'epub' }, comic('d')]);
  const collection = { comicIds: ['d', 'a', 'gone', 'c', 'b'] };
  const canOpen = c => c.format === 'cbz';
  assert.equal(nextInCollection(collection, 'd', comics, canOpen).id, 'a');
  assert.equal(nextInCollection(collection, 'a', comics, canOpen).id, 'b', 'past a comic that left and one that cannot be opened');
  assert.equal(nextInCollection(collection, 'b', comics, canOpen), null, 'the end of the collection');
  assert.equal(nextInCollection(collection, 'x', comics, canOpen), null, 'not in it');
});

test('going on in a collection: its first comic not read yet', () => {
  const comics = byId([comic('a'), comic('b'), comic('c')]);
  const collection = { comicIds: ['c', 'a', 'b'], missing: [{ title: 'Gap', before: 'a' }] };
  assert.deepEqual(pick(continueInCollection(collection, comics, {})), { id: 'c', position: 1, started: false });
  assert.deepEqual(pick(continueInCollection(collection, comics, { c: { status: 'finished' } })), { id: 'a', position: 3, started: true }, 'numbered with the missing issue counted');
  assert.deepEqual(pick(continueInCollection(collection, comics, { c: { status: 'reading' } })), { id: 'c', position: 1, started: true });
  assert.deepEqual(pick(continueInCollection(collection, comics, { b: { status: 'finished' } })), { id: 'c', position: 1, started: true }, 'something further on read: going on, from the first not read');
  assert.equal(continueInCollection(collection, comics, { a: { status: 'finished' }, b: { status: 'finished' }, c: { status: 'finished' } }), null);
  function pick(value) { return value && { id: value.comic.id, position: value.position, started: value.started }; }
});

test('missing issues keep their place when comics leave', () => {
  const missing = [{ title: 'X', before: 'b' }, { title: 'Y', before: 'c' }, { title: 'Z', before: '' }, { title: 'W', before: 'unknown' }];
  assert.deepEqual(reanchorMissing(missing, ['a', 'b', 'c'], ['a', 'c']).map(m => m.before), ['c', 'c', '', '']);
  assert.deepEqual(reanchorMissing(missing, ['a', 'b', 'c'], ['a']).map(m => m.before), ['', '', '', '']);
  assert.deepEqual(reanchorMissing(undefined, [], []), []);
});

test('collections are found by name, whatever the accents and capitals', () => {
  const list = [{ id: '1', name: 'Guerra Civil' }, { id: '2', name: 'Guerra Civil II' }, { id: '3', name: 'Ação Total' }];
  assert.equal(findCollection(list, 'guerra civil').id, '1', 'the same name first');
  assert.equal(findCollection(list, 'ACAO').id, '3', 'the only one containing it');
  assert.equal(findCollection(list, 'Guerra'), null, 'two contain it: none');
  assert.equal(findCollection(list, ''), null);
});

test('a proposed collection is checked against the library', () => {
  const comics = byId([comic('id-a'), comic('id-b'), comic('id-c')]);
  const byRef = new Map([['c1', 'id-a'], ['c2', 'id-b'], ['c3', 'id-c'], ['c9', 'id-gone']]);
  const collections = [{ id: 'col-1', name: 'Guerra Civil', comicIds: ['id-a'] }];
  const ok = proposeCollection({ name: '  Civil War — reading order ', order: [{ missing: 'Prologue' }, { ref: 'c2' }, { ref: '[[c1]]' }, { missing: 'Front Line #1' }, { ref: 'c3' }, { ref: 'c2' }, { missing: 'Epilogue' }] }, { byRef, comicsById: comics, collections });
  assert.deepEqual(ok.proposal, { name: 'Civil War — reading order', comicIds: ['id-b', 'id-a', 'id-c'],
    missing: [{ title: 'Prologue', before: 'id-b' }, { title: 'Front Line #1', before: 'id-c' }, { title: 'Epilogue', before: '' }], replaceId: '', replaceName: '', repeated: ['c2'] });
  assert.match(proposeCollection({ name: 'X', order: [{ ref: 'c1' }, { ref: 'c77' }, { ref: 'c9' }] }, { byRef, comicsById: comics, collections }).error, /c77, c9/, 'codes not in the library');
  assert.match(proposeCollection({ name: 'guerra civil', order: [{ ref: 'c1' }] }, { byRef, comicsById: comics, collections }).error, /replace: "Guerra Civil"/, 'the same name: asked to say it replaces');
  const replace = proposeCollection({ name: 'Guerra Civil', replace: 'GUERRA CIVIL', order: [{ ref: 'c3' }, { ref: 'c1' }] }, { byRef, comicsById: comics, collections });
  assert.equal(replace.proposal.replaceId, 'col-1'); assert.equal(replace.proposal.replaceName, 'Guerra Civil'); assert.deepEqual(replace.proposal.comicIds, ['id-c', 'id-a']);
  assert.match(proposeCollection({ name: 'Y', replace: 'Nope', order: [{ ref: 'c1' }] }, { byRef, comicsById: comics, collections }).error, /Não existe/);
  assert.match(proposeCollection({ name: '', order: [{ ref: 'c1' }] }, { byRef, comicsById: comics }).error, /nome/);
  assert.match(proposeCollection({ name: 'Z', order: [] }, { byRef, comicsById: comics }).error, /ordem/);
  assert.match(proposeCollection({ name: 'Z', order: [{ missing: 'Only missing' }] }, { byRef, comicsById: comics }).error, /pelo menos uma/);
  assert.match(proposeCollection({ name: 'Z', order: Array.from({ length: MAX_ORDER + 1 }, () => ({ ref: 'c1' })) }, { byRef, comicsById: comics }).error, /limite/);
});

test('a proposal kept with the chat is checked again when it comes back', () => {
  assert.deepEqual(cleanProposal({ name: 'A', comicIds: ['x', 'x', 7, 'y'], missing: [{ title: 'M', before: 'y' }, { title: '' }], state: 'created', collectionId: 'col', replaceId: '', extra: 'dropped' }),
    { name: 'A', comicIds: ['x', 'y'], missing: [{ title: 'M', before: 'y' }], replaceId: '', replaceName: '', state: 'created', collectionId: 'col' });
  assert.equal(cleanProposal({ name: 'A', comicIds: [] }), null);
  assert.equal(cleanProposal({ name: '', comicIds: ['x'] }), null);
  assert.equal(cleanProposal({ name: 'A', comicIds: ['x'], state: 'weird' }).state, 'pending');
});

test('reading-order collections are kept, backed up, and keep their order and gaps as comics come and go', () => {
  const storage = memory(), s = new LibraryStore({ storage });
  s.upsertComics([comic('a'), comic('b'), comic('c'), comic('d')]);
  const manual = s.createCollection('By hand'); s.setCollectionComics(manual.id, ['d', 'a']);
  const made = s.saveOrderedCollection({ name: 'Civil War', comicIds: ['c', 'unknown', 'a', 'b'], missing: [{ title: 'Front Line #1', before: 'a' }, { title: 'Before unknown', before: 'unknown' }, { title: 'End', before: '' }, { title: '' }] });
  assert.equal(made.ordered, true); assert.deepEqual(made.comicIds, ['c', 'a', 'b']);
  assert.deepEqual(made.missing, [{ title: 'Front Line #1', before: 'a' }, { title: 'Before unknown', before: 'a' }, { title: 'End', before: '' }]);
  assert.equal(s.state.collections.find(c => c.id === manual.id).ordered, undefined, 'collections made by hand stay as they were');
  // Kept as it is, and in a backup.
  const again = new LibraryStore({ storage }); again.load();
  assert.deepEqual(again.state.collections.find(c => c.id === made.id), made);
  const restored = new LibraryStore({ storage: memory() }); restored.importBackup(s.exportBackup());
  assert.deepEqual(restored.state.collections.find(c => c.id === made.id), made);
  // A comic leaves the library: what came before it moves on to the next comic.
  s.removeComic('a');
  assert.deepEqual(s.state.collections.find(c => c.id === made.id).missing.map(m => m.before), ['b', 'b', '']);
  // Edited by hand: the order is kept, new ones go at the end.
  s.setCollectionComics(made.id, ['c', 'b', 'd']);
  assert.deepEqual(s.state.collections.find(c => c.id === made.id).comicIds, ['c', 'b', 'd']);
  s.setCollectionComics(made.id, ['c', 'd']);
  assert.deepEqual(s.state.collections.find(c => c.id === made.id).missing.map(m => m.before), ['d', 'd', '']);
  // Replaced by a new order (the assistant's update), same collection.
  const updated = s.saveOrderedCollection({ id: made.id, name: 'Civil War (full)', comicIds: ['d', 'c'], missing: [] });
  assert.equal(updated.id, made.id); assert.equal(updated.name, 'Civil War (full)'); assert.deepEqual(updated.comicIds, ['d', 'c']); assert.deepEqual(updated.missing, []);
  assert.equal(s.state.collections.length, 2);
  assert.throws(() => s.saveOrderedCollection({ name: 'Empty', comicIds: ['nope'] }), /library/);
  assert.throws(() => s.saveOrderedCollection({ name: '', comicIds: ['c'] }), /Name/);
  // A file that moved in MEGA (a new identity) keeps its place and its gaps.
  s.saveOrderedCollection({ id: made.id, name: 'Civil War', comicIds: ['c', 'd'], missing: [{ title: 'Gap', before: 'd' }] });
  s.reconcileLibrary([{ prefix: 'Marvel', comics: [comic('b'), comic('c'), { ...comic('d'), id: 'd2', path: 'Marvel/Moved' }] }]);
  const moved = s.state.collections.find(c => c.id === made.id);
  assert.deepEqual(moved.comicIds, ['c', 'd2']); assert.deepEqual(moved.missing, [{ title: 'Gap', before: 'd2' }]);
  assert.deepEqual(s.state.collections.find(c => c.id === manual.id).comicIds, ['d2']);
});

test('a backup with a broken reading-order collection is cleaned, not lost', () => {
  const s = new LibraryStore({ storage: memory() }); s.upsertComics([comic('a'), comic('b')]);
  const data = JSON.parse(s.exportBackup());
  data.collections = [{ id: 'collection:x', name: 'Order', comicIds: ['gone', 'b', 'a'], ordered: true, missing: [{ title: 'Gap', before: 'gone' }, { title: 'Bad', before: 'http://x' }, 'junk', { title: 42 }] },
    { id: 'collection:y', name: 'Plain', comicIds: ['a'], ordered: 'yes', missing: [{ title: 'Ignored', before: 'a' }] }];
  s.importBackup(JSON.stringify(data));
  const order = s.state.collections.find(c => c.id === 'collection:x'), plain = s.state.collections.find(c => c.id === 'collection:y');
  assert.deepEqual(order.comicIds, ['b', 'a']); assert.deepEqual(order.missing, [{ title: 'Gap', before: 'b' }, { title: 'Bad', before: '' }]);
  assert.equal(plain.ordered, undefined); assert.equal(plain.missing, undefined);
});
