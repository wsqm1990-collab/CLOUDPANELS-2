// Browser test: at the end of a comic, swiping on follows the collection it is
// read through: opened from the collection, then continued from the reading
// list or after the app reopens; collections made by hand go on in the order
// their screen lists them; folders stay as they always were. The comics are
// demo comics (they all open the demo CBZ), in three folders. Run after
// `npm run build`, with dist/ served locally:
//   (cd dist && python3 -m http.server 8099) &
//   CLOUDPANELS_URL=http://127.0.0.1:8099/index.html node test/e2e/collections-next.e2e.cjs
// Needs Playwright with Chromium. Not part of `npm test`.
const { chromium } = require('playwright');

const APP = process.env.CLOUDPANELS_URL || 'http://127.0.0.1:8099/index.html';
const results = [];
const check = (ok, what, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${what}${detail ? ' — ' + detail : ''}`);

// The library: a reading order across the folders, and a collection made by hand.
const comic = (id, folder, n) => ({ id, name: `${folder} 0${n}.cbz`, size: 42330, path: `Marvel/${folder}`, source: 'demo', format: 'cbz', metadata: { title: `${folder} 0${n}` }, addedAt: '2026-11-01T10:00:00.000Z' });
const library = (progress = {}) => ({ version: 1, progress, retired: {}, favorites: [], readLater: [], bookmarks: [], panels: {}, deletedCollections: [], settings: { language: 'en' },
  comics: [comic('demo:a1', 'Alpha', 1), comic('demo:a2', 'Alpha', 2), comic('demo:a3', 'Alpha', 3), comic('demo:b1', 'Beta', 1), comic('demo:b2', 'Beta', 2), comic('demo:g1', 'Gamma', 1), comic('demo:g2', 'Gamma', 2)],
  collections: [
    { id: 'collection:event', name: 'Event order', ordered: true, comicIds: ['demo:b1', 'demo:a2', 'demo:g1', 'demo:b2'], missing: [{ title: 'Tie-in #1', before: 'demo:g1' }], createdAt: '2026-11-02T10:00:00.000Z', updatedAt: '2026-11-02T10:00:00.000Z' },
    { id: 'collection:mine', name: 'Mine', comicIds: ['demo:g2', 'demo:a1', 'demo:b2'], createdAt: '2026-11-02T10:00:00.000Z', updatedAt: '2026-11-02T10:00:00.000Z' },
  ] });
const at = (status, day) => ({ page: 0, panel: 0, pageCount: 3, status, updatedAt: `2026-11-${day}T10:00:00.000Z` });

async function start(browser, state) {
  const context = await browser.newContext({ viewport: { width: 412, height: 900 }, hasTouch: true });
  await context.addInitScript(seed => {
    // The library is put in place once (like one saved before); reloading keeps what the app saved since.
    if (!localStorage.getItem('cloudpanels.library.v1') && !sessionStorage.getItem('seeded')) { localStorage.setItem('cloudpanels.library.v1', JSON.stringify(seed)); sessionStorage.setItem('seeded', '1'); }
    window.__statuses = [];
    new MutationObserver(() => { const s = document.querySelector('#reader-status'); if (s && s.textContent && window.__statuses.at(-1) !== s.textContent) window.__statuses.push(s.textContent); })
      .observe(document, { subtree: true, childList: true, characterData: true });
  }, state);
  const page = await context.newPage();
  page.on('pageerror', error => check(false, 'no page errors', error.message));
  await page.goto(APP); await page.waitForSelector('[data-view="collections"]:visible'); await page.waitForTimeout(600);
  return { context, page };
}
const nav = async (page, view) => { await page.click(`[data-view="${view}"]:visible`); await page.waitForTimeout(500); };
const title = page => page.evaluate(() => document.querySelector('#reader')?.open ? document.querySelector('#reader-title').textContent : null);
async function open(page, name) {
  await page.locator(`main button[aria-label$="${name}"]`).first().click();
  await page.waitForFunction(wanted => document.querySelector('#reader')?.open && document.querySelector('#reader-title').textContent === wanted, name, { timeout: 15000 });
  await page.waitForTimeout(900);
}
// Turns pages until another comic opens (or the reader says it ended); what is open then, and what the reader said.
async function readOn(page) {
  const from = await title(page);
  await page.evaluate(() => { window.__statuses = []; });
  for (let turn = 0; turn < 8; turn++) {
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(800);
    const now = await title(page), said = await page.evaluate(() => window.__statuses.join(' | '));
    if (now !== from) { await page.waitForTimeout(700); return { now, said }; }
    if (/End of this/.test(said)) return { now, said };
  }
  return { now: await title(page), said: await page.evaluate(() => window.__statuses.join(' | ')) };
}
// (The reader's buttons hide while reading: its close button is pressed as a tap on it would.)
async function close(page) { await page.evaluate(() => document.querySelector('#reader-close').click()); await page.waitForFunction(() => !document.querySelector('#reader')?.open); await page.waitForTimeout(500); }

(async () => {
  const browser = await chromium.launch();
  try {
    // A reading order, opened from its screen.
    let { context, page } = await start(browser, library());
    await nav(page, 'collections'); await page.click('.collection-card[aria-label="Event order"]'); await page.waitForTimeout(500);
    await open(page, 'Beta 01');
    let step = await readOn(page);
    check(step.now === 'Alpha 02', 'reading order: Beta 01 goes on to Alpha 02, not Beta 02 of its folder', step.now);
    check(/next comic in this collection/.test(step.said), 'the reader says it opens the next one of the collection', step.said);
    // Closed, and continued from the reading list.
    await close(page); await nav(page, 'continue'); await open(page, 'Alpha 02');
    step = await readOn(page);
    check(step.now === 'Gamma 01', 'continued from the reading list: Alpha 02 goes on to Gamma 01, not Alpha 03', step.now);
    // The app closed and opened again.
    await close(page); await page.reload(); await page.waitForSelector('[data-view="continue"]:visible'); await page.waitForTimeout(800);
    await nav(page, 'continue'); await open(page, 'Gamma 01');
    step = await readOn(page);
    check(step.now === 'Beta 02', 'after the app reopens: Gamma 01 goes on to Beta 02, not Gamma 02', step.now);
    step = await readOn(page);
    check(step.now === 'Beta 02' && /End of this collection/.test(step.said), 'at the end of the collection it stops and says so', `${step.now} · ${step.said}`);
    await close(page);
    // A collection made by hand: the order its screen lists.
    await nav(page, 'collections'); await page.click('.collection-card[aria-label="Mine"]'); await page.waitForTimeout(500);
    const listed = await page.evaluate(() => [...document.querySelectorAll('main .comic-title')].map(node => node.textContent).join(', '));
    await open(page, 'Alpha 01');
    step = await readOn(page);
    check(step.now === 'Beta 02', 'made by hand: Alpha 01 goes on to Beta 02, as its screen lists them', `${step.now} (listed: ${listed})`);
    await close(page);
    // A finished comic opened again from its folder: its folder, as always.
    await nav(page, 'library'); await page.locator('main button.folder-open', { hasText: 'Marvel' }).first().click(); await page.waitForTimeout(500);
    await open(page, 'Alpha 02');
    step = await readOn(page);
    check(step.now === 'Alpha 03', 'from its folder: Alpha 02 goes on to Alpha 03, as always', step.now);
    check(/next comic in this folder/.test(step.said), 'the reader says the folder', step.said);
    await close(page); await context.close();
    // Begun on another device (nothing kept on this one), where its reading order has got to: it goes on in it.
    ({ context, page } = await start(browser, library({ 'demo:b1': at('finished', 10), 'demo:a2': at('finished', 11), 'demo:g1': at('reading', 20), 'demo:a1': at('reading', 19) })));
    await nav(page, 'continue'); await open(page, 'Gamma 01');
    step = await readOn(page);
    check(step.now === 'Beta 02', 'begun on another device where its reading order has got to: it goes on in it', step.now);
    await close(page); await nav(page, 'continue'); await open(page, 'Alpha 01');
    step = await readOn(page);
    check(step.now === 'Alpha 02', 'begun elsewhere, only in a collection made by hand: its folder, as always', step.now);
    await close(page); await context.close();
    // Begun elsewhere, out of its reading order (one before it there not read): its folder.
    ({ context, page } = await start(browser, library({ 'demo:g1': at('reading', 20) })));
    await nav(page, 'continue'); await open(page, 'Gamma 01');
    step = await readOn(page);
    check(step.now === 'Gamma 02', 'begun elsewhere out of its reading order: its folder, as always', step.now);
    await context.close();
  } catch (error) { results.push('SCRIPT ERROR ' + String(error.stack || error).split('\n').slice(0, 3).join(' ')); }
  await browser.close();
  console.log(results.join('\n'));
  process.exit(results.some(line => !line.startsWith('PASS')) ? 1 : 0);
})();
