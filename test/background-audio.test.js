import test from 'node:test';
import assert from 'node:assert/strict';
import { humWav, backgroundListeningSupported, createBackgroundListening } from '../src/background-audio.js';

test('the keep-alive sound is a 10 second, 30 Hz hum far below hearing that loops without a click', () => {
  const bytes = humWav(), view = new DataView(bytes), text = (offset, length) => String.fromCharCode(...new Uint8Array(bytes, offset, length));
  assert.equal(text(0, 4), 'RIFF'); assert.equal(text(8, 4), 'WAVE'); assert.equal(text(36, 4), 'data');
  assert.equal(view.getUint32(24, true), 8000); assert.equal(view.getUint16(22, true), 1); assert.equal(view.getUint16(34, true), 16);
  const samples = (bytes.byteLength - 44) / 2; assert.equal(samples, 80000);
  let peak = 0, crossings = 0, previous = 0;
  for (let index = 0; index < samples; index++) { const value = view.getInt16(44 + index * 2, true); peak = Math.max(peak, Math.abs(value)); if (previous < 0 && value >= 0) crossings++; previous = value; }
  assert.equal(peak, 52, 'about -56 dB');
  assert.equal(crossings, 299, '300 whole waves');
  assert.equal(view.getInt16(44, true), 0); assert.ok(view.getInt16(44 + (samples - 1) * 2, true) < 0, 'the end leads back into the start');
});

const android = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36', maxTouchPoints: 5, mediaSession: {} };
const scopeWith = (nav, extra = {}) => ({ navigator: nav, Audio: function Audio() {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, Blob: function Blob() {}, ...extra });

test('reading with the screen off is offered on Android, not yet on the iPad or in the native apps', () => {
  assert.equal(backgroundListeningSupported(scopeWith(android)), true);
  assert.equal(backgroundListeningSupported(scopeWith({ ...android, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' })), false);
  assert.equal(backgroundListeningSupported(scopeWith({ ...android, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', maxTouchPoints: 5 })), false, 'iPad asking for desktop sites');
  assert.equal(backgroundListeningSupported(scopeWith(android, { Capacitor: { isNativePlatform: () => true } })), false);
  assert.equal(backgroundListeningSupported(scopeWith({ ...android, mediaSession: undefined })), false);
});

function fakeScope() {
  const media = { handlers: {}, metadata: undefined, playbackState: 'none', setActionHandler(action, handler) { this.handlers[action] = handler; } };
  const made = [], revoked = [];
  class Audio {
    constructor(src) { this.src = src; this.paused = true; this.loop = false; this.listeners = {}; this.plays = 0; made.push(this); }
    play() { this.paused = false; this.plays++; return Promise.resolve(); }
    pause() { this.paused = true; for (const listener of this.listeners.pause || []) queueMicrotask(listener); }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    removeAttribute() { this.src = ''; } load() {}
  }
  class MediaMetadata { constructor(info) { Object.assign(this, info); } }
  return { media, made, revoked, scope: { navigator: { ...android, mediaSession: media }, Audio, MediaMetadata, Blob: class { constructor(parts, options) { this.parts = parts; this.type = options?.type; } }, URL: { createObjectURL: () => 'blob:hum', revokeObjectURL: url => revoked.push(url) } } };
}

test('Listen starts the hum and the lock-screen controls; pause keeps them; closing removes everything', async () => {
  const { media, made, revoked, scope } = fakeScope(), calls = [];
  const background = createBackgroundListening({ scope });
  const actions = Object.fromEntries(['play', 'pause', 'stop', 'nexttrack', 'previoustrack'].map(name => [name, () => calls.push(name)]));
  background.start({ title: 'Night Patrol #1', subtitle: 'Page 3 of 24', artwork: [{ src: 'icon-512.png' }], actions });
  assert.equal(background.active, true); assert.equal(made.length, 1); assert.equal(made[0].loop, true); assert.equal(made[0].plays, 1);
  assert.equal(media.metadata.title, 'Night Patrol #1'); assert.equal(media.metadata.artist, 'Page 3 of 24'); assert.equal(media.playbackState, 'playing');
  media.handlers.nexttrack(); media.handlers.pause(); assert.deepEqual(calls, ['nexttrack', 'pause']);
  background.update({ title: 'Night Patrol #1', subtitle: 'Page 4 of 24' }); assert.equal(media.metadata.artist, 'Page 4 of 24');
  background.pause(); await Promise.resolve();
  assert.equal(made[0].paused, true); assert.equal(media.playbackState, 'paused'); assert.equal(typeof media.handlers.play, 'function', 'play stays on the lock screen');
  assert.deepEqual(calls, ['nexttrack', 'pause'], 'its own pause is not taken for an outside one');
  background.start({ title: 'Night Patrol #1', subtitle: 'Page 4 of 24' }); assert.equal(made.length, 1, 'the same sound again'); assert.equal(made[0].plays, 2);
  // A phone call or another app takes the sound: reading pauses too.
  made[0].pause(); await Promise.resolve(); assert.deepEqual(calls, ['nexttrack', 'pause', 'pause']);
  background.stop();
  assert.equal(background.active, false); assert.equal(media.metadata, null); assert.equal(media.playbackState, 'none'); assert.deepEqual(revoked, ['blob:hum']);
  assert.ok(Object.values(media.handlers).every(handler => handler === null), 'no buttons left behind');
});
