// The lucky wheel's screen (opened from the Assistant): a wheel of sagas that
// spins and stops on the next one to read, with the buttons to start it (or
// go on with it) right away. The choice is made by chance (see saga-wheel.js);
// the wheel only shows it.
import {findSagas, wheelCounts, wheelPool, wheelScopes, sampleSlices, pickWinner, landingRotation, sliceAtRotation, spinEase, rememberWinner, PAUSED_AFTER_DAYS} from './saga-wheel.js';

const TEXT = {
  en: {title: 'Lucky wheel', cardText: 'Can’t decide what to read? Spin the wheel and let chance pick your next saga.', cardCounts: '{new} not started · {paused} started and stopped', open: 'Spin the wheel',
    subtitle: 'Your next saga, picked by chance from your folders.', all: 'All', new: 'Not started', paused: 'Started and stopped',
    hint: 'Sagas already finished, and the ones you read in the last {days} days, stay out.', scope: 'Spin in', wholeLibrary: 'Whole library',
    spin: 'Spin', spinAgain: 'Spin again', spinning: 'Spinning…', pool: '{count} sagas in the draw', poolOne: '1 saga in the draw',
    emptyLibrary: 'Add comics to your library and the wheel will pick from your folders.', allDone: 'Every saga in your library is finished or being read right now. Impressive!',
    emptyPool: 'No sagas for this choice here. Try “All” or another folder.', winner: 'Your next saga', newInfo: 'Not started · {count} stories', newInfoOne: 'Not started · 1 story',
    pausedInfo: '{read} of {count} read', lastRead: 'last read {when}', startsWith: 'Starts with {name}', nextUp: 'Next: {name}', pageOf: 'page {page} of {count}',
    start: 'Start reading', continue: 'Continue', openFolder: 'Open folder', wheelLabel: 'Wheel with {names}', stopped: 'The wheel stopped on {name}.'},
  'pt-BR': {title: 'Roleta da sorte', cardText: 'Na dúvida do que ler? Gire a roleta e deixe a sorte escolher sua próxima saga.', cardCounts: '{new} não começadas · {paused} começadas e paradas', open: 'Girar a roleta',
    subtitle: 'Sua próxima saga, sorteada entre as suas pastas.', all: 'Todas', new: 'Não começadas', paused: 'Começadas e paradas',
    hint: 'Ficam de fora as sagas que você já terminou e as que leu nos últimos {days} dias.', scope: 'Girar em', wholeLibrary: 'Biblioteca inteira',
    spin: 'Girar', spinAgain: 'Girar de novo', spinning: 'Girando…', pool: '{count} sagas no sorteio', poolOne: '1 saga no sorteio',
    emptyLibrary: 'Adicione quadrinhos à sua biblioteca e a roleta vai sortear entre as suas pastas.', allDone: 'Todas as sagas da sua biblioteca já foram lidas ou estão sendo lidas agora. Impressionante!',
    emptyPool: 'Nenhuma saga para essa escolha aqui. Tente “Todas” ou outra pasta.', winner: 'Sua próxima saga', newInfo: 'Ainda não começada · {count} histórias', newInfoOne: 'Ainda não começada · 1 história',
    pausedInfo: '{read} de {count} lidas', lastRead: 'última leitura {when}', startsWith: 'Começa por {name}', nextUp: 'Próxima: {name}', pageOf: 'página {page} de {count}',
    start: 'Começar a ler', continue: 'Continuar', openFolder: 'Abrir pasta', wheelLabel: 'Roleta com {names}', stopped: 'A roleta parou em {name}.'},
  es: {title: 'Ruleta de la suerte', cardText: '¿No sabes qué leer? Gira la ruleta y deja que la suerte elija tu próxima saga.', cardCounts: '{new} sin empezar · {paused} empezadas y paradas', open: 'Girar la ruleta',
    subtitle: 'Tu próxima saga, sorteada entre tus carpetas.', all: 'Todas', new: 'Sin empezar', paused: 'Empezadas y paradas',
    hint: 'Quedan fuera las sagas que ya terminaste y las que leíste en los últimos {days} días.', scope: 'Girar en', wholeLibrary: 'Toda la biblioteca',
    spin: 'Girar', spinAgain: 'Girar de nuevo', spinning: 'Girando…', pool: '{count} sagas en el sorteo', poolOne: '1 saga en el sorteo',
    emptyLibrary: 'Añade cómics a tu biblioteca y la ruleta sorteará entre tus carpetas.', allDone: 'Todas las sagas de tu biblioteca ya están leídas o en lectura. ¡Impresionante!',
    emptyPool: 'No hay sagas para esta opción aquí. Prueba “Todas” u otra carpeta.', winner: 'Tu próxima saga', newInfo: 'Sin empezar · {count} historias', newInfoOne: 'Sin empezar · 1 historia',
    pausedInfo: '{read} de {count} leídas', lastRead: 'última lectura {when}', startsWith: 'Empieza por {name}', nextUp: 'Siguiente: {name}', pageOf: 'página {page} de {count}',
    start: 'Empezar a leer', continue: 'Continuar', openFolder: 'Abrir carpeta', wheelLabel: 'Ruleta con {names}', stopped: 'La ruleta se detuvo en {name}.'},
};
const wheelText = language => TEXT[language] || TEXT.en;
const fill = (value, vars = {}) => String(value).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
const comicName = comic => comic?.metadata?.title || comic?.name || '';

// Per device: the last choices and the latest winners (so they rest a while).
const PREFS_KEY = 'cloudpanels-saga-wheel-v1';
function loadPrefs() {
  try {
    const value = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {};
    return {kind: ['all', 'new', 'paused'].includes(value.kind) ? value.kind : 'all',
      scope: Array.isArray(value.scope) ? value.scope.filter(part => typeof part === 'string').slice(0, 64) : [],
      recent: Array.isArray(value.recent) ? value.recent.filter(key => typeof key === 'string').slice(0, 12) : []};
  } catch { return {kind: 'all', scope: [], recent: []}; }
}
function savePrefs(prefs) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* a convenience only */ } }

function relativeTime(at, language) {
  const days = Math.max(0, Math.round((Date.now() - at) / 86400000));
  try {
    const format = new Intl.RelativeTimeFormat(language, {numeric: 'auto'});
    if (days < 1) return format.format(0, 'day');
    if (days < 14) return format.format(-days, 'day');
    if (days < 60) return format.format(-Math.round(days / 7), 'week');
    if (days < 548) return format.format(-Math.round(days / 30.44), 'month');
    return format.format(-Math.round(days / 365.25), 'year');
  } catch { return new Date(at).toLocaleDateString(language); }
}

const SVG = 'http://www.w3.org/2000/svg';
function svgNode(tag, attrs = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}
// Slices: lime, night blue, steel blue (the third only where two would touch).
const PALETTE = [{fill: '#c5ef62', text: '#16200d'}, {fill: '#1f3044', text: '#eef3f8'}, {fill: '#35587a', text: '#f3f7fb'}];
const sliceColor = (index, total) => total % 2 === 0 || index < total - 1 ? index % 2 : 2;
function wheelIcon() {
  const svg = svgNode('svg', {viewBox: '0 0 48 48', class: 'saga-wheel-icon', 'aria-hidden': 'true'});
  const turn = svgNode('g', {class: 'saga-wheel-icon-turn'}), cx = 24, cy = 26, r = 18.5;
  turn.append(svgNode('circle', {cx, cy, r: r + 2.6, fill: '#0a1018', stroke: '#33465c'}));
  for (let index = 0; index < 8; index++) {
    const a = (-90 + index * 45) * Math.PI / 180, b = (-45 + index * 45) * Math.PI / 180;
    turn.append(svgNode('path', {d: `M${cx} ${cy}L${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}A${r} ${r} 0 0 1 ${(cx + r * Math.cos(b)).toFixed(2)} ${(cy + r * Math.sin(b)).toFixed(2)}Z`, fill: PALETTE[index % 2].fill}));
  }
  turn.append(svgNode('circle', {cx, cy, r: 5, fill: '#0e151f', stroke: '#c5ef62', 'stroke-width': 2}));
  svg.append(turn, svgNode('path', {d: 'M19.5 2h9l-4.5 8.5z', fill: '#c5ef62', stroke: '#0a1018', 'stroke-width': 1.3, 'stroke-linejoin': 'round'}));
  return svg;
}
function pointerIcon() {
  const svg = svgNode('svg', {viewBox: '0 0 30 40', class: 'saga-wheel-pointer', 'aria-hidden': 'true'});
  svg.append(svgNode('path', {d: 'M5 2.5h20a3 3 0 0 1 2.7 4.3L17.8 35.2a3 3 0 0 1-5.6 0L2.3 6.8A3 3 0 0 1 5 2.5Z', fill: '#c5ef62', stroke: '#0a1018', 'stroke-width': 2, 'stroke-linejoin': 'round'}),
    svgNode('circle', {cx: 15, cy: 10, r: 3, fill: '#0a1018'}));
  return svg;
}

function ellipsize(context, value, width) {
  if (context.measureText(value).width <= width) return value;
  let low = 0, high = value.length;
  while (low < high) { const middle = (low + high + 1) >> 1; if (context.measureText(value.slice(0, middle).trimEnd() + '…').width <= width) low = middle; else high = middle - 1; }
  return value.slice(0, low).trimEnd() + '…';
}
function twoLines(context, value, width) {
  const words = value.split(/\s+/).filter(Boolean);
  let best = null;
  for (let cut = 1; cut < words.length; cut++) {
    const first = words.slice(0, cut).join(' '), second = words.slice(cut).join(' ');
    const a = context.measureText(first).width;
    if (a > width) break;
    const longest = Math.max(a, context.measureText(second).width);
    if (!best || longest < best.longest) best = {first, second, longest};
  }
  return best ? [best.first, ellipsize(context, best.second, width)] : null;
}
// A name along its slice, from near the middle out to the rim: on one line if
// it fits, else on two (where the slice is wide enough), else shortened.
function sliceLabel(context, name, {from, to, half, family}) {
  const value = String(name || '').replace(/\s+/g, ' ').trim(), width = to - from;
  for (const size of [14, 13, 12]) {
    context.font = `700 ${size}px ${family}`;
    if (context.measureText(value).width <= width) { context.fillText(value, from, 0); return; }
  }
  const size = 11, gap = size * 1.18, start = from + 6;
  if (Math.tan(half) * start * 2 * .9 >= gap * 2) {
    context.font = `700 ${size}px ${family}`;
    const lines = twoLines(context, value, to - start);
    if (lines) { context.fillText(lines[0], start, -gap / 2); context.fillText(lines[1], start, gap / 2); return; }
  }
  context.font = `700 ${size}px ${family}`;
  context.fillText(ellipsize(context, value, width), from, 0);
}
function drawWheel(canvas, slices, {size, highlight = -1, family}) {
  const ratio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  canvas.width = Math.round(size * ratio); canvas.height = Math.round(size * ratio);
  const context = canvas.getContext('2d');
  if (!context || !slices.length) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const center = size / 2, rim = center - 1, radius = center - Math.max(8, size * .036);
  const total = slices.length, step = Math.PI * 2 / total;
  context.beginPath(); context.arc(center, center, rim, 0, Math.PI * 2);
  context.fillStyle = '#0a1018'; context.fill(); context.lineWidth = 1; context.strokeStyle = '#33465c'; context.stroke();
  for (let index = 0; index < total; index++) {
    const start = -Math.PI / 2 + index * step;
    context.beginPath(); context.moveTo(center, center); context.arc(center, center, radius, start, start + step); context.closePath();
    context.fillStyle = PALETTE[sliceColor(index, total)].fill; context.fill();
    if (highlight >= 0 && index !== highlight) { context.fillStyle = 'rgba(6,10,16,.64)'; context.fill(); }
    context.lineWidth = 1.5; context.strokeStyle = '#0a1018'; context.stroke();
  }
  context.textBaseline = 'middle'; context.textAlign = 'left';
  for (let index = 0; index < total; index++) {
    context.save(); context.translate(center, center); context.rotate(-Math.PI / 2 + (index + .5) * step);
    context.fillStyle = highlight >= 0 && index !== highlight ? 'rgba(226,233,241,.42)' : PALETTE[sliceColor(index, total)].text;
    sliceLabel(context, slices[index].name, {from: radius * .29, to: radius * .93, half: step / 2, family});
    context.restore();
  }
  // Little lights on the rim, between the slices.
  const lights = (rim + radius) / 2;
  context.fillStyle = '#f2ffd1';
  for (let index = 0; index < total; index++) {
    const angle = -Math.PI / 2 + index * step;
    context.beginPath(); context.arc(center + Math.cos(angle) * lights, center + Math.sin(angle) * lights, Math.max(1.7, size * .008), 0, Math.PI * 2); context.fill();
  }
  if (highlight >= 0) {
    const start = -Math.PI / 2 + highlight * step;
    context.beginPath(); context.moveTo(center, center); context.arc(center, center, radius - 1.5, start, start + step); context.closePath();
    context.lineWidth = 3; context.strokeStyle = '#f4ffd9'; context.stroke();
  }
}

/** The card on the Assistant screen that opens the wheel. */
export function sagaWheelCard({store, element, action, onOpen}) {
  const L = wheelText(store.state.settings.language);
  const counts = element('p', {class: 'saga-wheel-card-counts', hidden: true});
  const card = element('section', {class: 'card saga-wheel-card', 'aria-label': L.title, 'data-saga-wheel-card': ''},
    wheelIcon(), element('div', {class: 'saga-wheel-card-copy'}, element('h3', {text: L.title}), element('p', {text: L.cardText}), counts),
    action(L.open, onOpen, 'button primary saga-wheel-card-button', {'data-saga-wheel': 'open'}));
  // Counted once the screen is drawn: a big library takes a moment.
  setTimeout(() => {
    if (!card.isConnected) return;
    try {
      const total = wheelCounts(findSagas(store.state.comics, store.state.progress));
      if (total.all) { counts.textContent = fill(L.cardCounts, {new: total.new, paused: total.paused}); counts.hidden = false; }
    } catch { /* the card works without the numbers */ }
  }, 60);
  return card;
}

/** The wheel itself, in the app's dialog. */
export function openSagaWheel({store, t, element, action, openModal, openComic, loadCover, showFolder, toast}) {
  const language = store.state.settings.language, L = wheelText(language);
  const {body, current} = openModal(L.title, L.subtitle);
  body.classList.add('saga-wheel');
  const prefs = loadPrefs(), sagas = findSagas(store.state.comics, store.state.progress), totals = wheelCounts(sagas), scopes = wheelScopes(sagas);
  const sameScope = path => path.length === prefs.scope.length && path.every((part, index) => part === prefs.scope[index]);
  if (prefs.scope.length && !scopes.some(folder => sameScope(folder.path))) prefs.scope = [];
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  let pool = [], slices = [], rotation = 0, spinning = false, spun = false, highlighted = -1;
  const urls = new Set(), jobs = new Map(), controller = new AbortController();

  const kinds = element('div', {class: 'chips saga-wheel-kinds', role: 'group', 'aria-label': L.title});
  const kindButtons = ['all', 'new', 'paused'].map(kind => {
    const button = action('', () => { if (prefs.kind !== kind) { prefs.kind = kind; refresh(); } }, 'chip', {'data-wheel-kind': kind});
    kinds.append(button); return [kind, button];
  });
  const hint = element('p', {class: 'saga-wheel-hint', text: fill(L.hint, {days: PAUSED_AFTER_DAYS})});
  let scopeSelect = null;
  if (scopes.length) {
    scopeSelect = element('select', {class: 'input', 'aria-label': L.scope, 'data-wheel-scope': ''});
    scopeSelect.append(element('option', {value: '', text: `${L.wholeLibrary} (${totals.all})`}));
    scopes.forEach((folder, index) => scopeSelect.append(element('option', {value: String(index), text: `${folder.path.join(' › ')} (${folder.count})`})));
    const chosen = scopes.findIndex(folder => sameScope(folder.path));
    scopeSelect.value = chosen >= 0 ? String(chosen) : '';
    scopeSelect.addEventListener('change', () => { prefs.scope = scopeSelect.value === '' ? [] : scopes[Number(scopeSelect.value)]?.path.slice() || []; refresh(); });
  }
  const canvas = element('canvas', {class: 'saga-wheel-canvas', role: 'img'});
  const pointer = pointerIcon();
  const hub = action(L.spin, () => spin(), 'saga-wheel-hub', {'data-wheel-hub': ''});
  const stage = element('div', {class: 'saga-wheel-stage'}, canvas, pointer, hub);
  const poolLine = element('p', {class: 'saga-wheel-pool'});
  const spinButton = action(L.spin, () => spin(), 'button primary saga-wheel-spin', {'data-wheel-spin': ''});
  const empty = element('p', {class: 'saga-wheel-empty', hidden: true});
  const announce = element('p', {class: 'saga-wheel-announce', 'aria-live': 'polite'});
  const result = element('section', {class: 'saga-wheel-result', hidden: true, 'data-wheel-result': ''});
  body.append(...[kinds, hint, scopeSelect ? element('label', {class: 'saga-wheel-scope'}, element('span', {text: L.scope}), scopeSelect) : null, stage, poolLine, spinButton, empty, announce, result].filter(Boolean));
  body.closest('dialog')?.addEventListener('close', () => { controller.abort(); urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); }, {once: true});
  const onResize = () => { if (!current()) { window.removeEventListener('resize', onResize); return; } if (!spinning && slices.length) draw(highlighted); };
  window.addEventListener('resize', onResize);

  function draw(highlight = -1) {
    highlighted = highlight;
    drawWheel(canvas, slices, {size: Math.round(stage.clientWidth) || 300, highlight, family});
    canvas.setAttribute('aria-label', fill(L.wheelLabel, {names: [...new Set(slices.map(saga => saga.name))].join(', ')}));
  }
  function setBusy(busy) {
    spinning = busy;
    hub.disabled = busy; spinButton.disabled = busy;
    spinButton.textContent = busy ? L.spinning : spun ? L.spinAgain : L.spin;
    kindButtons.forEach(([, button]) => { button.disabled = busy; });
    if (scopeSelect) scopeSelect.disabled = busy;
  }
  function refresh() {
    savePrefs(prefs);
    const scoped = wheelCounts(wheelPool(sagas, {scope: prefs.scope}));
    for (const [kind, button] of kindButtons) {
      const active = prefs.kind === kind;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
      button.replaceChildren(element('span', {text: L[kind]}), element('span', {class: 'shelf-count', text: String(scoped[kind])}));
    }
    pool = wheelPool(sagas, {kind: prefs.kind, scope: prefs.scope});
    result.hidden = true; result.replaceChildren(); announce.textContent = '';
    const nothing = !totals.all;
    kinds.hidden = nothing; hint.hidden = nothing;
    if (scopeSelect) scopeSelect.parentElement.hidden = nothing;
    if (!pool.length) {
      stage.hidden = true; poolLine.hidden = true; spinButton.hidden = true; empty.hidden = false;
      empty.textContent = !store.state.comics.some(comic => comic.source !== 'demo') ? L.emptyLibrary : nothing ? L.allDone : L.emptyPool;
      return;
    }
    stage.hidden = false; poolLine.hidden = false; spinButton.hidden = false; empty.hidden = true;
    poolLine.textContent = pool.length === 1 ? L.poolOne : fill(L.pool, {count: pool.length});
    slices = sampleSlices(pool, {avoid: prefs.recent}); spun = false;
    spinButton.textContent = L.spin;
    draw();
  }
  function coverOf(comic) {
    if (!comic || !loadCover) return Promise.resolve(null);
    if (!jobs.has(comic.id)) jobs.set(comic.id, Promise.resolve().then(() => loadCover(comic, controller.signal)).catch(() => null));
    return jobs.get(comic.id);
  }
  function tick() {
    pointer.style.transition = 'none'; pointer.style.transform = 'rotate(-18deg)';
    requestAnimationFrame(() => { pointer.style.transition = ''; pointer.style.transform = ''; });
  }
  function spin() {
    if (spinning || !pool.length || !current()) return;
    // From the second spin on, the wheel is filled again from the whole draw.
    if (spun) slices = sampleSlices(pool, {avoid: prefs.recent});
    spun = true;
    rotation = ((rotation % 360) + 360) % 360;
    canvas.style.transform = `rotate(${rotation}deg)`;
    draw();
    result.hidden = true; announce.textContent = '';
    const index = pickWinner(slices), winner = slices[index];
    prefs.recent = rememberWinner(prefs.recent, winner.key); savePrefs(prefs);
    void coverOf(winner.next);
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const from = rotation, to = landingRotation(from, index, slices.length, {turns: calm ? 1 : 5}), duration = calm ? 700 : 4600;
    setBusy(true);
    const started = performance.now();
    let last = sliceAtRotation(from, slices.length);
    const frame = now => {
      if (!current()) return;
      const progress = Math.min(1, Math.max(0, (now - started) / duration));
      rotation = from + (to - from) * spinEase(progress);
      canvas.style.transform = `rotate(${rotation.toFixed(2)}deg)`;
      const at = sliceAtRotation(rotation, slices.length);
      if (at !== last) { last = at; tick(); }
      if (progress < 1) requestAnimationFrame(frame); else land(index);
    };
    requestAnimationFrame(frame);
  }
  function land(index) {
    setBusy(false);
    draw(index);
    try { navigator.vibrate?.(28); } catch { /* not on every device */ }
    showResult(slices[index]);
  }
  function showResult(saga) {
    const next = saga.next, entry = store.state.progress[next.id];
    const coverBox = element('div', {class: 'saga-wheel-cover'}, element('span', {text: saga.name}));
    void coverOf(next).then(blob => {
      if (!blob || !coverBox.isConnected || controller.signal.aborted) return;
      const url = URL.createObjectURL(blob); urls.add(url);
      coverBox.prepend(element('img', {src: url, alt: '', decoding: 'async'})); coverBox.classList.add('has-cover');
    });
    const status = saga.state === 'new' ? (saga.count === 1 ? L.newInfoOne : fill(L.newInfo, {count: saga.count}))
      : [fill(L.pausedInfo, {read: saga.finished, count: saga.count}), saga.lastAt ? fill(L.lastRead, {when: relativeTime(saga.lastAt, language)}) : ''].filter(Boolean).join(' · ');
    const page = entry?.status === 'reading' && entry.pageCount > 1 ? fill(L.pageOf, {page: entry.page + 1, count: entry.pageCount}) : '';
    const nextLine = saga.kind === 'comic'
      ? (page ? page.charAt(0).toLocaleUpperCase(language) + page.slice(1) : '')
      : fill(saga.state === 'new' ? L.startsWith : L.nextUp, {name: comicName(next) + (page ? ' · ' + page : '')});
    const later = action('', toggleLater, 'button secondary', {'data-wheel-later': ''});
    const saved = () => (store.state.readLater || []).includes(next.id);
    const paintLater = () => { const on = saved(); later.textContent = on ? '✓ ' + t('laterActive') : t('laterAction'); later.setAttribute('aria-pressed', String(on)); later.classList.toggle('is-active', on); };
    function toggleLater() {
      const on = !saved();
      try { store.setReadLater(next.id, on); paintLater(); toast(store.lastError ? t('storageError') : t(on ? 'laterAdded' : 'laterRemoved')); }
      catch { toast(t('storageError')); }
    }
    paintLater();
    result.replaceChildren(coverBox,
      element('div', {class: 'saga-wheel-info'},
        element('span', {class: 'eyebrow', text: L.winner}),
        element('h3', {text: saga.name}),
        saga.parent.length ? element('p', {class: 'saga-wheel-where', text: saga.parent.join(' › ')}) : null,
        element('p', {class: 'saga-wheel-status', text: status}),
        nextLine ? element('p', {class: 'saga-wheel-next', text: nextLine}) : null),
      element('div', {class: 'saga-wheel-actions'},
        action(saga.state === 'new' ? L.start : L.continue, () => openComic(next), 'button primary', {'data-wheel-read': ''}),
        later,
        saga.kind === 'folder' && showFolder ? action(L.openFolder, () => showFolder(saga.path), 'button ghost', {'data-wheel-folder': ''}) : null));
    result.hidden = false;
    announce.textContent = fill(L.stopped, {name: saga.name});
    requestAnimationFrame(() => { if (result.isConnected) result.scrollIntoView({block: 'nearest', behavior: 'smooth'}); });
  }
  refresh();
}
