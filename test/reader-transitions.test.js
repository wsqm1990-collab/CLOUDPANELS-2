import test from 'node:test';
import assert from 'node:assert/strict';
import { createPageTransition } from '../src/reader-transitions.js';

function fixture({ reduce = false, unsupported = false, guided = false } = {}) {
  const animations = [], timers = new Map(); let timerId = 0;
  const doc = { defaultView: { getComputedStyle: node => ({ background: '#000', filter: node === image ? 'brightness(0.8)' : 'none', transform: 'none', ...node.computed }) }, createElement: name => node(name) };
  function node(name) {
    const result = { name, ownerDocument: doc, style: {}, children: [], attributes: {}, hidden: false,
      setAttribute(name, value) { this.attributes[name] = value; }, getAttribute(name) { return this.attributes[name]; },
      append(child) { this.children.push(child); child.parentElement = this; },
      remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = undefined; },
      getBoundingClientRect() { return this.bounds; },
    };
    if (!unsupported) result.animate = (frames, options) => {
      let resolve, reject;
      const animation = { target: result, frames, options, finished: new Promise((yes, no) => { resolve = yes; reject = no; }), cancel() { this.cancelled = true; reject(new Error('cancelled')); }, resolve: () => resolve() };
      animations.push(animation); return animation;
    };
    return result;
  }
  const host = node('host'), stage = node('stage'), wrap = node('wrap'), image = node('img'), overlay = node('overlay'), focus = node('focus'); host.append(stage); stage.append(wrap); wrap.append(image);
  stage.bounds = { left: 20, top: 30, width: 600, height: 900 };
  image.bounds = { left: -40, top: -50, width: 720, height: 1080 }; image.attributes.src = 'blob:old-page'; image.style.filter = 'brightness(0.8)';
  focus.bounds = { left: 25, top: 40, width: 580, height: 850 };
  focus.computed = { boxSizing: 'border-box', border: '0px none rgb(0, 0, 0)', borderRadius: '0px', boxShadow: 'rgb(0, 0, 0) 0px 0px 0px 9999px', background: 'rgba(0, 0, 0, 0)', opacity: '1' };
  overlay.querySelector = selector => guided && selector === '.panel-focus' ? focus : null;
  const transition = createPageTransition({ stage, wrap, image, overlay, reducedMotion: () => reduce,
    setTimer: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; }, clearTimer: id => timers.delete(id) });
  return { transition, stage, image, wrap, overlay, focus, host, animations, timers };
}

test('captures only the displayed image and visible geometry without comic controls or a canvas', async () => {
  const f = fixture(), snapshot = f.transition.capture();
  assert.equal(f.host.children.length, 2, 'outgoing page covers incoming decode and analysis immediately');
  assert.equal(snapshot.layer.children.length, 1);
  const copy = snapshot.layer.children[0];
  assert.equal(copy.name, 'img'); assert.equal(copy.src, 'blob:old-page'); assert.equal(copy.attributes.id, undefined);
  assert.equal(copy.style.left, '-60px'); assert.equal(copy.style.top, '-80px'); assert.equal(copy.style.filter, 'brightness(0.8)');
  const playback = f.transition.play({ snapshot, direction: 1, duration: 650 });
  assert.equal(f.transition.active, true); assert.equal(f.host.children.length, 2);
  assert.equal(f.animations[0].frames[0].transform, 'translate3d(600px, 0, 0)');
  assert.equal(f.animations[1].frames[1].transform, 'translate3d(-600px, 0, 0)');
  assert.equal(f.animations[0].options.duration, 650);
  f.animations.forEach(a => a.resolve()); assert.equal(await playback, true);
  assert.equal(f.transition.active, false); assert.equal(f.host.children.length, 1); assert.equal(f.timers.size, 0);
  assert.deepEqual(f.wrap.style, {});
});

test('reverse turns enter from the left and cancellation resolves without leaving animation effects', async () => {
  const f = fixture(), playback = f.transition.play({ snapshot: f.transition.capture(), direction: -1 });
  assert.equal(f.animations[0].frames[0].transform, 'translate3d(-600px, 0, 0)');
  f.transition.cancel(); assert.equal(await playback, false);
  assert.equal(f.host.children.length, 1); assert.equal(f.timers.size, 0);
  assert.ok(f.animations.every(a => a.cancelled)); assert.equal(f.transition.active, false);
});

test('an old completion or capture cannot remove a later page animation', async () => {
  const f = fixture(), oldSnapshot = f.transition.capture();
  const old = f.transition.play({ snapshot: oldSnapshot }); const oldAnimations = [...f.animations];
  const nextSnapshot = f.transition.capture(); assert.equal(await old, false);
  const next = f.transition.play({ snapshot: nextSnapshot, style: 'fade' });
  assert.equal(await f.transition.play({ snapshot: oldSnapshot }), false);
  oldAnimations.forEach(a => a.resolve()); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.transition.active, true); assert.equal(f.host.children.length, 2);
  assert.deepEqual(f.animations[2].frames, [{ opacity: 0 }, { opacity: 1 }]);
  f.transition.cancel(); assert.equal(await next, false);
});

test('reduced motion, Off, unsupported engines and viewport changes skip without an overlay or delay', async () => {
  for (const options of [{ reduce: true }, { unsupported: true }, { off: true }]) {
    const f = fixture(options), snapshot = f.transition.capture();
    const style = options.off ? 'none' : 'slide';
    assert.equal(await f.transition.play({ snapshot, style }), false);
    assert.equal(f.animations.length, 0); assert.equal(f.host.children.length, 1); assert.equal(f.timers.size, 0);
  }
  const f = fixture(), snapshot = f.transition.capture(); f.stage.bounds.width = 900;
  assert.equal(await f.transition.play({ snapshot }), false); assert.equal(f.host.children.length, 1);
});

test('missing animation completion is bounded by a cleanup timer', async () => {
  const f = fixture(), playback = f.transition.play({ snapshot: f.transition.capture(), duration: 240 });
  const timer = [...f.timers.values()][0]; assert.equal(timer.delay, 360); timer.callback();
  assert.equal(await playback, true); assert.equal(f.transition.active, false); assert.equal(f.host.children.length, 1);
});

test('an engine failure during the second effect cleans the first effect and mounted layer', async () => {
  const f = fixture(), snapshot = f.transition.capture();
  snapshot.layer.animate = () => { throw new Error('animation unavailable'); };
  assert.equal(await f.transition.play({ snapshot }), false);
  assert.equal(f.host.children.length, 1); assert.equal(f.timers.size, 0); assert.equal(f.transition.active, false);
  assert.equal(f.animations[0].cancelled, true);
});

test('guided snapshots preserve only the read-only opaque panel mask without editor rectangles or labels', () => {
  const f = fixture({ guided: true }), snapshot = f.transition.capture();
  assert.equal(snapshot.layer.children.length, 2);
  const mask = snapshot.layer.children[1];
  assert.equal(mask.name, 'div'); assert.equal(mask.children.length, 0); assert.equal(mask.attributes.id, undefined);
  assert.equal(mask.style.left, '5px'); assert.equal(mask.style.top, '10px');
  assert.equal(mask.style.width, '580px'); assert.equal(mask.style.height, '850px');
  assert.equal(mask.style.boxShadow, 'rgb(0, 0, 0) 0px 0px 0px 9999px');
  assert.equal(mask.style.background, 'rgba(0, 0, 0, 0)');
  f.transition.cancel(); assert.equal(f.host.children.length, 1);
});
