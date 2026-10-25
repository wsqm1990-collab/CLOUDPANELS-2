import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as SDK from '../src/megajs-browser.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const response = () => new Response(JSON.stringify([{ g: 'https://download.mega.nz/fixture', s: 100 }]), { headers: { 'content-type': 'application/json' } });
function fixture(fetch) {
  const api = new SDK.API(false, { userAgent: null, fetch });
  return new SDK.File({ downloadId: '12345678', key: new Uint8Array(32).fill(7), api });
}
function rejectedStream(stream) {
  return new Promise((resolve, reject) => {
    stream.on('data', () => {});
    stream.once('error', resolve);
    stream.once('end', () => reject(new Error('Expected a failed browser transfer.')));
  });
}

test('actual browser SDK forwards response-body read rejection and closes the stream', { timeout: 1500 }, async () => {
  let contentSignal;
  const file = fixture(async (url, options) => {
    if (String(url).includes('/0-9')) {
      contentSignal = options.signal;
      return new Response(new ReadableStream({ pull(controller) { controller.error(new Error('body interrupted')); } }));
    }
    return response();
  });
  const stream = file.download({ start: 0, end: 9, maxConnections: 1, forceHttps: true });
  const error = await rejectedStream(stream);
  assert.match(error.message, /body interrupted/);
  await tick();
  assert.equal(stream.destroyed, true);
  assert.equal(contentSignal.aborted, true);
});

test('actual browser SDK does not start content transfer after cancellation before address response', { timeout: 1500 }, async () => {
  let releaseAddress, addressRequested;
  const addressGate = new Promise(resolve => { releaseAddress = resolve; });
  const started = new Promise(resolve => { addressRequested = resolve; });
  let contentFetches = 0;
  const file = fixture(async url => {
    if (String(url).includes('/0-9')) { contentFetches++; return new Response(new Uint8Array(10)); }
    addressRequested();
    await addressGate;
    return response();
  });
  const stream = file.download({ start: 0, end: 9, maxConnections: 1, forceHttps: true });
  stream.on('error', () => {});
  await started;
  stream.destroy();
  await tick();
  releaseAddress();
  await tick(); await tick();
  assert.equal(contentFetches, 0);
  assert.equal(stream.destroyed, true);
});

test('unaligned browser range cancellation closes the underlying transfer without unhandled errors', { timeout: 1500 }, async () => {
  let contentStarted, contentSignal;
  const started = new Promise(resolve => { contentStarted = resolve; });
  const file = fixture(async (url, options) => {
    if (String(url).includes('/16-29')) {
      contentSignal = options.signal;
      contentStarted();
      return new Response(new ReadableStream({
        start(controller) { options.signal.addEventListener('abort', () => controller.error(new DOMException('cancelled', 'AbortError')), { once: true }); },
      }));
    }
    return response();
  });
  const stream = file.download({ start: 17, end: 29, maxConnections: 1, forceHttps: true });
  stream.on('error', () => {});
  await started;
  stream.destroy();
  await tick(); await tick();
  assert.equal(contentSignal.aborted, true);
  assert.equal(stream.destroyed, true);
});
