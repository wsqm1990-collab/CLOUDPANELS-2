// Browser test: the real app (dist/) talks to a fake MEGA server that uses
// MEGA's real encryption, and folders are moved "in the MEGA app" between
// steps. Run after `npm run build`, with dist/ served locally:
//   (cd dist && python3 -m http.server 8099) &
//   CLOUDPANELS_URL=http://127.0.0.1:8099/index.html node test/e2e/mega-library.e2e.cjs
// Needs Playwright with Chromium. Not part of `npm test`.
const { chromium } = require('playwright');
const { randomBytes } = require('crypto');
const path = require('path');

const APP = process.env.CLOUDPANELS_URL || 'http://127.0.0.1:8099/index.html';
const e64 = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

async function fakeMega() {
  const SDK = await import(path.join(__dirname, '../../src/megajs-browser.js'));
  const masterKey = randomBytes(16);
  const helper = SDK.Storage.fromJSON({ key: e64(masterKey), sid: 'x', options: { keepalive: false } });
  const AES = helper.aes.constructor, master = helper.aes, nodes = new Map();
  const attrs = (key, name) => { const p = Buffer.from('MEGA' + JSON.stringify({ n: name })), a = Buffer.alloc(Math.ceil(p.length / 16) * 16); p.copy(a); new AES(Buffer.from(key)).encryptCBC(a); return e64(a); };
  const folder = (h, p, name) => { const k = randomBytes(16), s = Buffer.from(k); master.encryptECB(s); nodes.set(h, { h, p, t: 1, u: 'user0001', ts: 1, k: `user0001:${e64(s)}`, a: attrs(k, name) }); };
  const file = (h, p, name) => { const k = randomBytes(32), s = Buffer.from(k); master.encryptECB(s); const ak = Buffer.alloc(16); for (let i = 0; i < 16; i++) ak[i] = k[i] ^ k[16 + i]; nodes.set(h, { h, p, t: 0, s: 5000, u: 'user0001', ts: 1, k: `user0001:${e64(s)}`, a: attrs(ak, name) }); };
  nodes.set('root0001', { h: 'root0001', p: '', t: 2, u: 'user0001', ts: 1 });
  nodes.set('bin00001', { h: 'bin00001', p: '', t: 4, u: 'user0001', ts: 1 });
  folder('comics01', 'root0001', 'COMICS'); folder('reading1', 'comics01', 'READING'); folder('read0001', 'comics01', 'READ');
  folder('ultxmen1', 'reading1', 'ULTIMATE X-MEN'); folder('ultvisn1', 'reading1', 'ULTIMATE VISION'); folder('wanted01', 'reading1', 'WANTED');
  folder('saga0001', 'read0001', 'SAGA');
  file('xmen0001', 'ultxmen1', 'Ultimate X-Men 001.cbr'); file('xmen0002', 'ultxmen1', 'Ultimate X-Men 002.cbr'); file('visn0001', 'ultvisn1', 'Ultimate Vision 001.cbr');
  file('want0001', 'wanted01', 'Wanted 001.cbr'); file('saga0001f', 'saga0001', 'Saga 001.cbz');
  const session = { version: 1, connection: { version: 1, mode: 'account', key: e64(masterKey), sid: Buffer.alloc(43, 9).toString('base64url'), user: 'user0001', name: 'Reader' }, folder: null, browsePath: [] };
  return {
    session, treeFetches: 0,
    // What the person does in the MEGA app.
    moveUltimateToRead() { for (const h of ['ultxmen1', 'ultvisn1']) nodes.set(h, { ...nodes.get(h), p: 'read0001' }); },
    answer(body) { return body.map(item => { if (item.a === 'f') { this.treeFetches++; return { f: [...nodes.values()].map(n => ({ ...n })), ok: [], s: [], u: [] }; } return -9; }); },
  };
}

async function openApp(browser, mega) {
  const context = await browser.newContext({ viewport: { width: 412, height: 900 }, isMobile: true, hasTouch: true });
  await context.addInitScript(value => { if (!localStorage.getItem('cloudpanels-mega-session-v1')) localStorage.setItem('cloudpanels-mega-session-v1', value); }, JSON.stringify(mega.session));
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
  await context.route(/https:\/\/[^/]*mega\.(co\.)?nz\//, async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    let body = []; try { body = JSON.parse(request.postData() || '[]'); } catch {}
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(mega.answer(body)) });
  });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(APP);
  await page.waitForSelector('text=Manage MEGA', { timeout: 20000 });
  return { context, page };
}

async function indexFolder(page, ...names) {
  await page.locator('button', { hasText: 'Manage MEGA' }).first().click();
  await page.locator('.folder-row', { hasText: 'Cloud Drive' }).click();
  for (const name of names) await page.locator('.folder-row').filter({ has: page.locator('.folder-name', { hasText: new RegExp(`^${name}$`) }) }).click();
  await page.locator('button', { hasText: 'Add this folder' }).click();
  await page.waitForSelector('.folder-card, .comic-card', { timeout: 15000 });
  await page.waitForTimeout(600);
}
const goHome = async page => { await page.locator('nav >> text=Library').last().click(); await page.waitForTimeout(400); const root = page.locator('.library-breadcrumbs button', { hasText: /^Library$/ }).first(); if (await root.count()) await root.click().catch(() => {}); await page.waitForTimeout(300); };
const openFolder = async (page, name) => { await page.locator(`.folder-open[aria-label="${name}"]`).first().click({ timeout: 5000 }); await page.waitForTimeout(400); };
const mainText = page => page.locator('#main').innerText();
const checkLine = page => page.locator('[data-library-check-short]').first().textContent().catch(() => '');
async function hideAndReturn(page, hiddenMs) {
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(hiddenMs);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const check = (name, ok, info) => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !info ? '' : ' ' + JSON.stringify(info).slice(0, 500)}`); };
  try {
    // A: one library folder; move in MEGA; tap Update from MEGA.
    try {
      const mega = await fakeMega(); const { context, page } = await openApp(browser, mega);
      await indexFolder(page, 'COMICS');
      mega.moveUltimateToRead();
      const before = mega.treeFetches;
      await page.locator('[data-refresh-library]').first().click({ timeout: 5000 }).catch(() => results.push('FAIL the Update from MEGA button could not be tapped (it stayed disabled)'));
      await page.waitForFunction(() => /moved/.test(document.querySelector('[data-library-check-short]')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
      check('A: Update from MEGA asks MEGA again', mega.treeFetches > before, { fetches: mega.treeFetches, before });
      check('A: the library says what changed', /3 moved/.test(await checkLine(page)), { line: await checkLine(page) });
      await goHome(page); await openFolder(page, 'COMICS'); await openFolder(page, 'READ');
      const read = await mainText(page);
      check('A: READ holds the ULTIMATE folders', /ULTIMATE X-MEN/.test(read) && /ULTIMATE VISION/.test(read) && /SAGA/.test(read), { read });
      await goHome(page); await openFolder(page, 'COMICS'); await openFolder(page, 'READING');
      const reading = await mainText(page);
      check('A: READING no longer shows them', /WANTED/.test(reading) && !/ULTIMATE/.test(reading), { reading });
      check('A: no page errors', !page.errors.length, page.errors);
      await context.close();
    } catch (error) { results.push('FAIL scenario A stopped: ' + String(error.message || error).split('\n')[0]); }
    // B: move in MEGA while the app is closed; open it again.
    try {
      const mega = await fakeMega(); const { context, page } = await openApp(browser, mega);
      await indexFolder(page, 'COMICS');
      mega.moveUltimateToRead();
      await page.reload(); await page.waitForSelector('text=Manage MEGA', { timeout: 20000 });
      await page.waitForFunction(() => /moved/.test(document.querySelector('[data-library-check-short]')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
      check('B: reopening the app updates the library by itself', /3 moved/.test(await checkLine(page)), { line: await checkLine(page) });
      await goHome(page); await openFolder(page, 'COMICS'); await openFolder(page, 'READING');
      const reading = await mainText(page);
      check('B: READING no longer shows them', /WANTED/.test(reading) && !/ULTIMATE/.test(reading), { reading });
      await context.close();
    } catch (error) { results.push('FAIL scenario B stopped: ' + String(error.message || error).split('\n')[0]); }
    // C: move in MEGA while CloudPanels is in the background; come back.
    try {
      const mega = await fakeMega(); const { context, page } = await openApp(browser, mega);
      await indexFolder(page, 'COMICS');
      await page.waitForTimeout(8500); // the library was checked when it was added
      mega.moveUltimateToRead();
      await hideAndReturn(page, 2500);
      await page.waitForFunction(() => /moved/.test(document.querySelector('[data-library-check-short]')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
      check('C: coming back to the app updates the library', /3 moved/.test(await checkLine(page)), { line: await checkLine(page) });
      await context.close();
    } catch (error) { results.push('FAIL scenario C stopped: ' + String(error.message || error).split('\n')[0]); }
    // D: READING and READ added as two separate library folders; reading
    // progress follows a comic that moves from one to the other.
    try {
      const mega = await fakeMega(); const { context, page } = await openApp(browser, mega);
      await indexFolder(page, 'COMICS', 'READING');
      await indexFolder(page, 'COMICS', 'READ');
      await page.evaluate(() => { const key = Object.keys(localStorage).find(k => /library/i.test(k)); return key; });
      mega.moveUltimateToRead();
      await page.locator('[data-refresh-library]').first().click({ timeout: 5000 }).catch(() => results.push('FAIL the Update from MEGA button could not be tapped (it stayed disabled)'));
      await page.waitForFunction(() => /moved/.test(document.querySelector('[data-library-check-short]')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
      const line = await checkLine(page);
      check('D: moves between two library folders are found', /3 moved/.test(line), { line });
      await goHome(page);
      const home = await mainText(page);
      check('D: both library folders are still there', /READING/.test(home) && /READ\b/.test(home), { home });
      await openFolder(page, 'READ');
      const read = await mainText(page);
      check('D: READ shows the ULTIMATE folders', /ULTIMATE X-MEN/.test(read) && /ULTIMATE VISION/.test(read), { read });
      await goHome(page); await openFolder(page, 'READING');
      const reading = await mainText(page);
      check('D: READING shows only WANTED', /WANTED/.test(reading) && !/ULTIMATE/.test(reading), { reading });
      // The folder browser says when it loaded the folders from MEGA.
      await page.locator('button', { hasText: 'Manage MEGA' }).first().click();
      await page.waitForFunction(() => /loaded at/.test(document.querySelector('.folder-freshness')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
      check('D: the folder browser says the list is fresh', /as they are right now/.test(await page.locator('.folder-freshness').textContent()), {});
      await context.close();
    } catch (error) { results.push('FAIL scenario D stopped: ' + String(error.message || error).split('\n')[0]); }
  } catch (error) { results.push('SCRIPT ERROR ' + (error.stack || error)); }
  await browser.close();
  console.log(results.join('\n'));
  process.exit(results.some(line => !line.startsWith('PASS')) ? 1 : 0);
})();
