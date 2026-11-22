import test from 'node:test';
import assert from 'node:assert/strict';
import { QUICK_ACTIONS, QUICK_DEFAULT, QUICK_MAX, quickActions, toggleQuickAction, twoFingerTap } from '../src/quick-menu.js';
import { LibraryStore } from '../src/store.js';

const memory = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) }; };

test('the buttons chosen for the quick menu: known ones, once each, in the menu order, at most eight', () => {
  assert.deepEqual(quickActions(undefined), [...QUICK_DEFAULT], 'nothing chosen yet: the first choice');
  assert.deepEqual(quickActions([]), [], 'all taken out: none');
  assert.deepEqual(quickActions(['options', 'nonsense', 'guided', 'guided', 7]), ['guided', 'options']);
  assert.equal(quickActions([...QUICK_ACTIONS]).length, QUICK_MAX);
  assert.deepEqual(toggleQuickAction(['guided'], 'steps'), ['guided', 'steps']);
  assert.deepEqual(toggleQuickAction(['guided', 'steps'], 'guided'), ['steps']);
  assert.deepEqual(toggleQuickAction(['guided'], 'nothing'), ['guided']);
  const full = QUICK_ACTIONS.slice(0, QUICK_MAX);
  assert.deepEqual(toggleQuickAction(full, QUICK_ACTIONS[QUICK_MAX]), full, 'no ninth');
});

test('two fingers: a quick tap that stays put opens the menu; a pinch, a drag or a long touch does not', () => {
  assert.equal(twoFingerTap({ duration: 140, spread: 3, travel: 2 }), true);
  assert.equal(twoFingerTap({ duration: 140, spread: 60, travel: 2 }), false, 'pinching');
  assert.equal(twoFingerTap({ duration: 140, spread: 2, travel: 45 }), false, 'dragging');
  assert.equal(twoFingerTap({ duration: 900, spread: 2, travel: 2 }), false, 'held');
  assert.equal(twoFingerTap({}), false);
});

test('the quick menu starts off; its choice is kept, and anything else is ignored', () => {
  const s = new LibraryStore({ storage: memory() });
  assert.equal(s.state.settings.readerQuickMenu, false);
  assert.deepEqual(s.state.settings.readerQuickActions, [...QUICK_DEFAULT]);
  s.setSettings({ readerQuickMenu: true, readerQuickActions: ['steps', 'guided', 'whatever'] });
  s.setSettings({ readerQuickMenu: 'yes', readerQuickActions: 'all' });
  assert.equal(s.state.settings.readerQuickMenu, true);
  assert.deepEqual(s.state.settings.readerQuickActions, ['guided', 'steps']);
  const restored = new LibraryStore({ storage: memory() }); restored.importBackup(s.exportBackup());
  assert.equal(restored.state.settings.readerQuickMenu, true);
  assert.deepEqual(restored.state.settings.readerQuickActions, ['guided', 'steps']);
});
