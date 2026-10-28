import { openComic } from './reader.js';
import { wholePageFit, pageFit, slideFitMode, slideThreshold, guidedPanelFit, guidedPanelMargin, resolvePanelIndex, canSwipePages, decideTapNavigation } from './reader-interactions.js';
import { analyzePagePanels } from './panel-analyzer.js';
import { createReaderNavigationTimer } from './reader-navigation.js';
import { createPageTransition } from './reader-transitions.js';
import { stepReadingPosition, spreadPartners } from './reader-position.js';
import { PageThumbnails, pageThumbnailComicKey } from './page-thumbnails.js';
import { rubberBand, inverseRubberBand, releaseVelocity, lockAxis, decidePageTurn, turnDuration, stepScroll, neighbourGeometry, entryEdge, stripDrag, sideDragAction, sideStep } from './reader-gestures.js';

const MiB = 1024 * 1024;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const abortError = () => new DOMException('Reading cancelled.', 'AbortError');

const STRINGS = {
  en: {
    library: 'Library', now: 'NOW READING', close: 'Close reader', markRead: 'Mark as read', marked: 'Read',
    previous: 'Previous page or panel', next: 'Next page or panel', previousShort: 'Previous', nextShort: 'Next', swipeResistance: 'Swipe resistance', swipeLevels: ['Very light', 'Light', 'Balanced', 'Firm', 'Very firm'], navigation: 'Reading navigation', navigationButtons: 'Navigation buttons', navigationOff: 'Off', navigationDelay: n => `Hide after ${n} seconds`, page: 'Page', pageOf: (p, n) => `Page ${p} of ${n}`,
    loading: 'Opening comic…', loadingPage: p => `Loading page ${p}…`, loadingPdf: 'Loading PDF into temporary memory (maximum 128 MB)…', downloading: p => `Downloading comic… ${p}%`, extracting: 'Unpacking pages…', indexing: 'Large comic: finding its pages (only the first time)…',
    readHint: 'Your place is saved on this device.', panelStatus: (p, n) => `Panel ${p} of ${n}`, retry: 'Try again',
    failed: 'This comic could not be opened.', pageFailed: 'This page could not be displayed. Your previous position is unchanged.',
    reachedEnd: 'You have reached the last page. Mark this comic as read when you are finished.', finished: 'Marked as read. Your place is saved.',
    fit: 'Fit page', zoomIn: 'Zoom in', zoomOut: 'Zoom out', guided: 'Panel view', edit: 'Edit page panels',
    choose: 'Choose a panel layout', suggestions: 'These are layout suggestions, not detected comic panels. You can redraw them for this page.',
    stacked: '2 stacked panels', grid: '4-panel grid', draw: 'Draw panels', cancel: 'Cancel',
    drawHint: 'Draw around each panel in reading order. Drag from one corner to the opposite corner.',
    savedPanels: n => `${n} panel${n === 1 ? '' : 's'} · Draw in reading order`, undo: 'Undo', clear: 'Clear', done: 'Done',
    panelSmall: 'Draw a larger rectangle around the panel.', panelLimit: 'A page can contain up to 100 panels.',
    noPage: 'Load a page before creating panels.', layoutSaved: 'Panel layout saved for this page.',
    storage: 'Your place could not be saved. Export a library backup before closing this page.',
  },
  'pt-BR': {
    library: 'Biblioteca', now: 'LENDO AGORA', close: 'Fechar leitor', markRead: 'Marcar como lido', marked: 'Lido',
    previous: 'Página ou quadro anterior', next: 'Próxima página ou quadro', previousShort: 'Anterior', nextShort: 'Próxima', swipeResistance: 'Resistência do deslize', swipeLevels: ['Muito leve', 'Leve', 'Equilibrada', 'Firme', 'Muito firme'], navigation: 'Navegação da leitura', navigationButtons: 'Botões de navegação', navigationOff: 'Desativados', navigationDelay: n => `Ocultar após ${n} segundos`, page: 'Página', pageOf: (p, n) => `Página ${p} de ${n}`,
    loading: 'Abrindo quadrinho…', loadingPage: p => `Carregando página ${p}…`, loadingPdf: 'Carregando PDF na memória temporária (máximo de 128 MB)…', downloading: p => `Baixando quadrinho… ${p}%`, extracting: 'Preparando as páginas…', indexing: 'Quadrinho grande: localizando as páginas (só na primeira vez)…',
    readHint: 'Sua posição fica salva neste aparelho.', panelStatus: (p, n) => `Quadro ${p} de ${n}`, retry: 'Tentar novamente',
    failed: 'Não foi possível abrir este quadrinho.', pageFailed: 'Não foi possível exibir esta página. Sua posição anterior foi mantida.',
    reachedEnd: 'Você chegou à última página. Marque como lido quando terminar.', finished: 'Marcado como lido. Sua posição está salva.',
    fit: 'Ajustar página', zoomIn: 'Ampliar', zoomOut: 'Reduzir', guided: 'Por quadro', edit: 'Editar quadros da página',
    choose: 'Escolha a disposição dos quadros', suggestions: 'Estas são sugestões de disposição, não quadros detectados. Você pode redesenhá-los nesta página.',
    stacked: '2 quadros empilhados', grid: 'Grade de 4 quadros', draw: 'Desenhar quadros', cancel: 'Cancelar',
    drawHint: 'Desenhe cada quadro na ordem de leitura. Arraste de um canto ao canto oposto.',
    savedPanels: n => `${n} quadro${n === 1 ? '' : 's'} · Desenhe na ordem de leitura`, undo: 'Desfazer', clear: 'Limpar', done: 'Concluir',
    panelSmall: 'Desenhe um retângulo maior ao redor do quadro.', panelLimit: 'Uma página pode ter até 100 quadros.',
    noPage: 'Carregue uma página antes de criar quadros.', layoutSaved: 'Disposição dos quadros salva para esta página.',
    storage: 'Não foi possível salvar sua posição. Exporte um backup da biblioteca antes de fechar esta página.',
  },
  es: {
    library: 'Biblioteca', now: 'LEYENDO AHORA', close: 'Cerrar lector', markRead: 'Marcar como leído', marked: 'Leído',
    previous: 'Página o viñeta anterior', next: 'Página o viñeta siguiente', previousShort: 'Anterior', nextShort: 'Siguiente', swipeResistance: 'Resistencia del deslizamiento', swipeLevels: ['Muy ligera', 'Ligera', 'Equilibrada', 'Firme', 'Muy firme'], navigation: 'Navegación de lectura', navigationButtons: 'Botones de navegación', navigationOff: 'Desactivados', navigationDelay: n => `Ocultar tras ${n} segundos`, page: 'Página', pageOf: (p, n) => `Página ${p} de ${n}`,
    loading: 'Abriendo cómic…', loadingPage: p => `Cargando página ${p}…`, loadingPdf: 'Cargando PDF en la memoria temporal (máximo 128 MB)…', downloading: p => `Descargando cómic… ${p}%`, extracting: 'Preparando las páginas…', indexing: 'Cómic grande: buscando sus páginas (solo la primera vez)…',
    readHint: 'Tu posición se guarda en este dispositivo.', panelStatus: (p, n) => `Viñeta ${p} de ${n}`, retry: 'Reintentar',
    failed: 'No se pudo abrir este cómic.', pageFailed: 'No se pudo mostrar esta página. Se conserva tu posición anterior.',
    reachedEnd: 'Has llegado a la última página. Marca el cómic como leído cuando termines.', finished: 'Marcado como leído. Tu posición está guardada.',
    fit: 'Ajustar página', zoomIn: 'Ampliar', zoomOut: 'Reducir', guided: 'Por viñeta', edit: 'Editar viñetas de la página',
    choose: 'Elige la disposición de las viñetas', suggestions: 'Son sugerencias de disposición, no viñetas detectadas. Puedes volver a dibujarlas para esta página.',
    stacked: '2 viñetas apiladas', grid: 'Cuadrícula de 4', draw: 'Dibujar viñetas', cancel: 'Cancelar',
    drawHint: 'Dibuja cada viñeta en el orden de lectura. Arrastra de una esquina a la opuesta.',
    savedPanels: n => `${n} viñeta${n === 1 ? '' : 's'} · Dibuja en orden de lectura`, undo: 'Deshacer', clear: 'Borrar', done: 'Listo',
    panelSmall: 'Dibuja un rectángulo más grande alrededor de la viñeta.', panelLimit: 'Una página puede contener hasta 100 viñetas.',
    noPage: 'Carga una página antes de crear viñetas.', layoutSaved: 'Disposición guardada para esta página.',
    storage: 'No se pudo guardar tu posición. Exporta una copia de la biblioteca antes de cerrar esta página.',
  },
};

const FEATURE_STRINGS = {
  en: { navigate: 'Page navigator', preview: 'Tap a page to open it, or move the slider and let go.', go: 'Go', bookmarks: 'Bookmarks', addBookmark: 'Bookmark this position', noBookmarks: 'No bookmarks in this comic yet.', label: 'Label', note: 'Note', save: 'Save bookmark', edit: 'Edit', remove: 'Delete', cancel: 'Cancel', close: 'Done', appearance: 'Reading appearance', brightness: 'Brightness', contrast: 'Contrast', background: 'Background', black: 'Black', paper: 'Paper', sepia: 'Sepia', reset: 'Reset appearance', local: 'Bookmarks and notes are saved on this device and included in library backups.', width: 'Fit width', widthHint: 'Scroll vertically to read the page · Swipe sideways to turn pages', bookmarkSaved: 'Bookmark saved.', bookmarkDeleted: 'Bookmark deleted.', guided: 'Guided reading' },
  'pt-BR': { navigate: 'Navegar pelas páginas', preview: 'Toque numa página para abrir, ou arraste o controle e solte.', go: 'Ir', bookmarks: 'Marcadores', addBookmark: 'Marcar esta posição', noBookmarks: 'Este quadrinho ainda não tem marcadores.', label: 'Título', note: 'Anotação', save: 'Salvar marcador', edit: 'Editar', remove: 'Excluir', cancel: 'Cancelar', close: 'Concluir', appearance: 'Aparência da leitura', brightness: 'Brilho', contrast: 'Contraste', background: 'Fundo', black: 'Preto', paper: 'Papel', sepia: 'Sépia', reset: 'Restaurar aparência', local: 'Marcadores e anotações ficam neste aparelho e são incluídos no backup da biblioteca.', width: 'Ajustar à largura', widthHint: 'Role na vertical para ler a página · Deslize para os lados para trocar de página', bookmarkSaved: 'Marcador salvo.', bookmarkDeleted: 'Marcador excluído.', guided: 'Leitura guiada' },
  es: { navigate: 'Navegar por las páginas', preview: 'Toca una página para abrirla, o mueve el control y suéltalo.', go: 'Ir', bookmarks: 'Marcadores', addBookmark: 'Marcar esta posición', noBookmarks: 'Este cómic aún no tiene marcadores.', label: 'Título', note: 'Nota', save: 'Guardar marcador', edit: 'Editar', remove: 'Eliminar', cancel: 'Cancelar', close: 'Listo', appearance: 'Aspecto de lectura', brightness: 'Brillo', contrast: 'Contraste', background: 'Fondo', black: 'Negro', paper: 'Papel', sepia: 'Sepia', reset: 'Restablecer aspecto', local: 'Los marcadores y notas se guardan en este dispositivo y se incluyen en la copia de la biblioteca.', width: 'Ajustar al ancho', widthHint: 'Desplázate verticalmente para leer · Desliza a los lados para pasar páginas', bookmarkSaved: 'Marcador guardado.', bookmarkDeleted: 'Marcador eliminado.', guided: 'Lectura guiada' },
};

/** A bounded, session-only LRU for exact or contained byte intervals. */
export class ReadingRangeBuffer {
  constructor(source, budget = 64 * MiB, signal) {
    this.source = source; this.budget = clamp(Number(budget) || 64 * MiB, 16 * MiB, 256 * MiB);
    this.signal = signal; this.ranges = new Map(); this.bytes = 0;
  }
  async read(start, end, { signal } = {}) {
    this.signal?.throwIfAborted(); signal?.throwIfAborted();
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > this.source.size) throw new Error('Invalid reading interval.');
    const key = `${start}:${end}`;
    let entry = this.ranges.get(key), foundKey = key;
    if (!entry) {
      for (const [candidate, range] of this.ranges) {
        if (range.start <= start && range.end >= end) { entry = range; foundKey = candidate; break; }
      }
    }
    if (entry) {
      this.ranges.delete(foundKey); this.ranges.set(foundKey, entry);
      return entry.bytes.subarray(start - entry.start, end - entry.start);
    }
    const whole = this._fromWhole(start, end);
    if (whole) return whole;
    const bytes = await this.source.read(start, end, { signal: signal || this.signal });
    this.signal?.throwIfAborted(); signal?.throwIfAborted();
    if (!(bytes instanceof Uint8Array) || bytes.length !== end - start) throw new Error('The cloud returned an incomplete page.');
    // A single very large page remains readable without displacing the entire
    // configured budget or retaining another copy after the engine uses it.
    if (bytes.length && bytes.length <= this.budget) {
      while (this.bytes + bytes.length > this.budget || this.ranges.size >= 2048) {
        const oldest = this.ranges.keys().next().value;
        const removed = this.ranges.get(oldest); if (!removed) break;
        this.bytes -= removed.bytes.length; this.ranges.delete(oldest);
      }
      const previous = this.ranges.get(key); if (previous) this.bytes -= previous.bytes.length;
      this.ranges.set(key, { start, end, bytes }); this.bytes += bytes.length;
    }
    return bytes;
  }
  _fromWhole(start, end) {
    if (!this.chunks || start === end) return null;
    const size = ReadingRangeBuffer.CHUNK, first = Math.floor(start / size), last = Math.floor((end - 1) / size);
    for (let i = first; i <= last; i++) if (!this.chunks[i]) return null;
    if (first === last) return this.chunks[first].subarray(start - first * size, end - first * size);
    const out = new Uint8Array(end - start);
    for (let i = first, offset = 0; i <= last; i++) {
      const from = Math.max(start, i * size) - i * size, to = Math.min(end, (i + 1) * size) - i * size;
      out.set(this.chunks[i].subarray(from, to), offset); offset += to - from;
    }
    return out;
  }
  /** Bring the whole comic into temporary memory in the background, so page
   * turns no longer wait for the cloud. Nothing is written to the device. */
  async loadWhole(limit = 300 * MiB) {
    if (this.chunks || this.source.blob || !(this.source.size > 0) || this.source.size > limit) return false;
    const size = ReadingRangeBuffer.CHUNK, count = Math.ceil(this.source.size / size);
    this.chunks = new Array(count);
    try {
      for (let i = 0; i < count; i++) {
        this.signal?.throwIfAborted();
        if (!this.chunks) return false;
        const start = i * size, end = Math.min(this.source.size, start + size);
        const bytes = await this.source.read(start, end, { signal: this.signal });
        if (!this.chunks) return false;
        if (!(bytes instanceof Uint8Array) || bytes.length !== end - start) throw new Error('Incomplete chunk.');
        this.chunks[i] = bytes;
      }
      // The small page ranges are no longer needed once everything is here.
      this.ranges.clear(); this.bytes = 0;
      return true;
    } catch { return false; }
  }
  get wholeBytes() { return this.chunks ? this.chunks.reduce((sum, chunk) => sum + (chunk?.length || 0), 0) : 0; }
  clear() { this.ranges.clear(); this.bytes = 0; this.chunks = null; }
}
ReadingRangeBuffer.CHUNK = 4 * MiB;

export function createReaderController({ store, onChange, onActivity, onCoverFirstPage, onNextComic } = {}) {
  if (!store) throw new Error('The reader needs a library store.');
  const element = id => { const node = document.getElementById(id); if (!node) throw new Error(`Missing reader control: ${id}`); return node; };
  const dialog = element('reader'), stage = element('reader-stage'), image = element('reader-image');
  // Closing the reader is an explicit Library action. Browser Back/Escape and
  // native light-dismiss requests must not discard an active reading session.
  dialog.setAttribute('closedby', 'none');
  const wrap = image.parentElement, overlay = element('reader-canvas-overlay'), shell = dialog.querySelector('.reader-shell');
  const status = element('reader-status'), input = element('reader-page-input'), total = element('reader-page-total');
  const buttons = Object.fromEntries(['close', 'finish', 'prev', 'next', 'zoom-out', 'fit', 'zoom-in', 'guided', 'edit-panels'].map(name => [name, element(`reader-${name}`)]));
  for (const control of [buttons.guided, buttons.fit]) { control.removeAttribute('data-i18n'); for (const label of control.querySelectorAll('[data-i18n]')) label.removeAttribute('data-i18n'); }
  const immersiveButton = document.createElement('button'); immersiveButton.id = 'reader-immersive'; immersiveButton.type = 'button'; immersiveButton.className = 'button ghost compact';
  const fullscreenButton = document.createElement('button'); fullscreenButton.id = 'reader-fullscreen'; fullscreenButton.type = 'button'; fullscreenButton.className = 'button ghost compact';
  const restoreButton = document.createElement('button'); restoreButton.id = 'reader-restore-controls'; restoreButton.type = 'button'; restoreButton.className = 'button secondary compact';
  const fillButton = document.createElement('button'); fillButton.id = 'reader-fill'; fillButton.type = 'button'; fillButton.className = 'button ghost compact';
  const panButton = document.createElement('button'); panButton.id = 'reader-pan'; panButton.type = 'button'; panButton.className = 'button ghost compact';
  const resumeButton = document.createElement('button'); resumeButton.id = 'reader-resume-reading'; resumeButton.type = 'button'; resumeButton.className = 'button primary compact'; resumeButton.hidden = true;
  const featureButtons = Object.fromEntries(['navigate', 'bookmarks', 'appearance'].map(name => {
    const button = document.createElement('button'); button.id = `reader-${name}`; button.type = 'button'; button.className = 'button ghost compact'; return [name, button];
  }));
  const fitHint = document.createElement('div'); fitHint.className = 'reader-fit-hint'; fitHint.setAttribute('role', 'status'); fitHint.hidden = true; shell.append(fitHint);
  buttons.fit.after(fillButton, panButton); shell.append(resumeButton); dialog.classList.add('reader-overlay-controls');
  buttons.next.after(featureButtons.navigate); dialog.querySelector('.reader-panel-controls').append(featureButtons.bookmarks, featureButtons.appearance);
  dialog.querySelector('.reader-panel-controls').prepend(immersiveButton, fullscreenButton); shell.append(restoreButton);
  // Keep the basic back/forward actions discoverable while the larger toolbar
  // is hidden. This overlay never takes space away from the comic viewport.
  const quickNavigation = document.createElement('nav'); quickNavigation.id = 'reader-quick-navigation'; quickNavigation.className = 'reader-quick-navigation'; quickNavigation.hidden = true;
  const quickButtons = Object.fromEntries(['prev', 'next'].map(name => {
    const button = document.createElement('button'); button.id = `reader-quick-${name}`; button.type = 'button'; button.className = 'reader-quick-button';
    const label = document.createElement('span'); label.className = 'reader-quick-label';
    const arrow = buttons[name].querySelector('svg')?.cloneNode(true);
    if (arrow) button.append(arrow); button.append(label); return [name, button];
  }));
  const quickPosition = document.createElement('div'); quickPosition.className = 'reader-quick-position';
  const quickPage = document.createElement('span'), quickPanel = document.createElement('span'); quickPanel.className = 'reader-quick-panel'; quickPanel.hidden = true;
  quickPosition.append(quickPage, quickPanel); quickNavigation.append(quickButtons.prev, quickPosition, quickButtons.next); shell.append(quickNavigation);
  let book, comic, rangeBuffer, sessionController, pageController;
  let serial = 0, pageSerial = 0, currentPage = -1, panel = 0, guided = false, loading = false, editing = false;
  let currentURL, imageWidth = 0, imageHeight = 0, pageWidth = 0, draft = [], pointer, popup;
  let storageWarning = '', lastStatus = '', errorStatus = false, retryPage;
  let immersive = false, panMode = false, prefetchTimer, restoreTimer, hintTimer, fullscreenOwned = false, fullscreenRequest;
  let analysisController, analysisGeneration = 0, analysisPending = false, guidedFallbackPage = -1, cameraFrame, cameraGeneration = 0;
  let positionCommitted = false, overview = false, turning = false, guidedMode = 'whole', guidedFillFromBottom = false, spreadPages = [], lastTap, appFullscreenAsked = false;
  const pageTransition = createPageTransition({ stage, wrap, image, overlay });
  // Small pictures of the pages for the page navigator (kept on this device).
  const pageThumbs = new PageThumbnails();
  let thumbSeedTimer;
  // Decoded pages kept ready around the current one (previous, current, next),
  // so a swipe shows the neighbouring page under the finger at once.
  const decodedPages = new Map();
  // The neighbouring page that slides in beside the current one while turning.
  const neighbourLayer = document.createElement('div'); neighbourLayer.className = 'reader-neighbour'; neighbourLayer.setAttribute('aria-hidden', 'true'); neighbourLayer.hidden = true;
  const neighbourImage = document.createElement('img'); neighbourImage.alt = ''; neighbourImage.draggable = false;
  const neighbourNote = document.createElement('div'); neighbourNote.className = 'reader-neighbour-note';
  neighbourLayer.append(neighbourImage, neighbourNote); shell.append(neighbourLayer);
  const pageAnimation = () => store.state.settings.readerPageAnimation || 'slide';
  const pageDuration = () => store.state.settings.readerPageDuration || 420;
  const turnLabels = () => language() === 'pt-BR'
    ? { animation: 'Animação da página', slide: 'Deslizar', fade: 'Dissolver', none: 'Sem animação', speed: 'Velocidade da animação', speeds: ['Rápida', 'Suave', 'Lenta'], overview: 'Página inteira · Deslize para continuar', next: 'Abrindo a próxima revista da pasta…', nextFailed: 'Não foi possível abrir a próxima revista. Confira a conexão com o MEGA ou selecione novamente o arquivo local.', end: 'Fim desta pasta. Esta revista foi marcada como lida.' }
    : language() === 'es'
      ? { animation: 'Animación de página', slide: 'Deslizar', fade: 'Disolver', none: 'Sin animación', speed: 'Velocidad de animación', speeds: ['Rápida', 'Suave', 'Lenta'], overview: 'Página completa · Desliza para continuar', next: 'Abriendo el siguiente cómic de la carpeta…', nextFailed: 'No se pudo abrir el siguiente cómic. Comprueba MEGA o vuelve a seleccionar el archivo local.', end: 'Fin de esta carpeta. El cómic está marcado como leído.' }
      : { animation: 'Page animation', slide: 'Slide', fade: 'Fade', none: 'No animation', speed: 'Animation speed', speeds: ['Quick', 'Smooth', 'Slow'], overview: 'Whole page · Swipe to continue', next: 'Opening the next comic in this folder…', nextFailed: 'Could not open the next comic. Check your MEGA connection or reselect the local file.', end: 'End of this folder. This comic is marked as read.' };
  const slideLabels = () => language() === 'pt-BR'
    ? { hint: 'Deslize para o lado para ver a página inteira', toggle: 'Página dupla em pé: ocupar a altura e deslizar', on: 'Ligado', off: 'Desligado', note: 'Com o iPad em pé, a página dupla ocupa a altura da tela: deslize para o lado para ver ela toda e, na ponta, deslize de novo para virar a página.' }
    : language() === 'es'
      ? { hint: 'Desliza hacia el lado para ver la página entera', toggle: 'Página doble en vertical: ocupar el alto y deslizar', on: 'Activado', off: 'Desactivado', note: 'Con el iPad en vertical, la página doble ocupa el alto de la pantalla: desliza hacia el lado para verla entera y, en el borde, desliza otra vez para pasar la página.' }
      : { hint: 'Slide sideways to see the whole page', toggle: 'Double pages upright: fill the height and slide', on: 'On', off: 'Off', note: 'With the iPad upright, a double page fills the height of the screen: slide sideways to see all of it, and at its edge slide again to turn the page.' };
  let slideHintShown = false;
  let viewportFrame, viewportWidth = 0, viewportHeight = 0, suppressClicksUntil = 0, closeIntent;
  let persistenceTimer, persistenceGeneration = 0;
  const activePointers = new Set();
  const cancelledPointers = new Set();
  const pendingURLs = new Set();
  let navigationSessionShown = false, navigationPointerFocus = false;
  const navigationTimer = createReaderNavigationTimer({ onChange: visible => {
    const releasePointerFocus = !visible && navigationPointerFocus && quickNavigation.contains(document.activeElement);
    quickNavigation.hidden = !visible; dialog.classList.toggle('reader-has-quick-navigation', visible);
    if (releasePointerFocus && dialog.open) stage.focus({ preventScroll: true });
  } });
  const navigationSeconds = () => [0, 3, 5, 8].includes(store.state.settings.readerNavigationSeconds) ? store.state.settings.readerNavigationSeconds : 3;
  const swipeResistance = () => [1, 2, 3, 4, 5].includes(store.state.settings.readerSwipeResistance) ? store.state.settings.readerSwipeResistance : 3;
  const language = () => store.state.settings.language || 'en';
  const text = () => STRINGS[language()] || STRINGS.en;
  const featureText = () => FEATURE_STRINGS[language()] || FEATURE_STRINGS.en;
  const rtl = () => store.state.settings.readingDirection === 'rtl';
  const notify = () => onChange?.();
  const storedPanels = () => comic && currentPage >= 0 ? store.getPanels(comic.id, currentPage) : [];
  const panels = () => guided && !editing && guidedFallbackPage === currentPage ? [] : storedPanels();
  const focusLabel = (n, count) => text().panelStatus(n, count);
  const showImage = visible => { image.hidden = !visible; image.style.display = visible ? 'block' : 'none'; };
  const activity = (busy, open = Boolean(comic)) => { onActivity?.({ busy, open }); };
  const fullscreenTarget = document.documentElement;
  const fitMode = () => ['whole', 'fill', 'width', 'screen'].includes(store.state.settings.readerFitMode) ? store.state.settings.readerFitMode : 'whole';
  const modeLabels = () => language() === 'pt-BR'
    ? { title: 'Enquadramento da página', whole: 'Página inteira', fill: 'Preencher tela', screen: 'Tela toda (abaixo do relógio)', width: 'Ajustar à largura', note: 'Página inteira mostra todas as bordas. Ajustar à largura permite rolar na vertical. Preencher tela deixa algumas bordas fora da área visível; use Mover página para explorá-las. Deslize para os lados para trocar de página.', cancel: 'Cancelar' }
    : language() === 'es'
      ? { title: 'Ajuste de página', whole: 'Página completa', fill: 'Llenar pantalla', screen: 'Pantalla completa (bajo el reloj)', width: 'Ajustar al ancho', note: 'Página completa muestra todos los bordes. Ajustar al ancho permite desplazarse verticalmente. Llenar pantalla deja algunos bordes fuera de la vista; usa Mover página para explorarlos. Desliza a los lados para pasar páginas.', cancel: 'Cancelar' }
      : { title: 'Page fit', whole: 'Whole page', fill: 'Fill screen', screen: 'Full screen (below the clock)', width: 'Fit width', note: 'Whole page shows every edge. Fit width lets you scroll vertically. Fill screen leaves some edges outside the view; use Move page to explore them. Swipe sideways to turn pages.', cancel: 'Cancel' };
  const panLabels = () => language() === 'pt-BR' ? { move: 'Mover página', resume: 'Voltar à leitura', hint: 'Deslize para trocar de página · Mover página permite explorar as bordas', panHint: 'Arraste para explorar as bordas · Toque em Voltar à leitura para trocar páginas' }
    : language() === 'es' ? { move: 'Mover página', resume: 'Volver a leer', hint: 'Desliza para pasar páginas · Mover página permite explorar los bordes', panHint: 'Arrastra para explorar los bordes · Toca Volver a leer para pasar páginas' }
      : { move: 'Move page', resume: 'Resume reading', hint: 'Swipe to turn pages · Use Move page to explore the edges', panHint: 'Drag to explore the edges · Tap Resume reading to turn pages' };
  const guidedLabels = () => language() === 'pt-BR'
    ? { button: 'Leitura guiada', analyzing: 'Analisando os quadros desta página no aparelho…', fallback: 'Não foi possível identificar os quadros com segurança. Página inteira exibida; a leitura guiada será tentada novamente na próxima página.', options: 'Opções dos quadros', edit: 'Editar quadros', detect: 'Detectar novamente', detectNote: 'Detectar novamente substitui a disposição salva desta página somente se encontrar quadros com confiança.', retry: 'Tentar novamente', whole: 'Ver página inteira', cancel: 'Cancelar', detected: n => `${n} quadros encontrados · Deslize para avançar` }
    : language() === 'es'
      ? { button: 'Lectura guiada', analyzing: 'Analizando las viñetas de esta página en el dispositivo…', fallback: 'No se identificaron las viñetas con seguridad. Se muestra la página completa; la lectura guiada se intentará en la siguiente página.', options: 'Opciones de viñetas', edit: 'Editar viñetas', detect: 'Detectar de nuevo', detectNote: 'Detectar de nuevo reemplaza la disposición guardada de esta página solo si encuentra viñetas con confianza.', retry: 'Reintentar', whole: 'Ver página completa', cancel: 'Cancelar', detected: n => `${n} viñetas encontradas · Desliza para avanzar` }
      : { button: 'Guided reading', analyzing: 'Analyzing this page’s panels on your device…', fallback: 'Panels could not be identified confidently. Showing the whole page; guided reading will try again on the next page.', options: 'Panel options', edit: 'Edit panels', detect: 'Detect again', detectNote: 'Detect again replaces this page’s saved layout only when panels are identified confidently.', retry: 'Try again', whole: 'Show whole page', cancel: 'Cancel', detected: n => `${n} panels found · Swipe to advance` };
  const fullscreenSupported = () => (document.fullscreenEnabled !== false && typeof fullscreenTarget.requestFullscreen === 'function') || (document.webkitFullscreenEnabled !== false && typeof fullscreenTarget.webkitRequestFullscreen === 'function');

  function translatedControl(button, label) {
    const span = button.querySelector('span');
    if (span) span.textContent = label; else if (!button.querySelector('svg')) button.textContent = label;
  }
  function localize() {
    const t = text();
    buttons.close.setAttribute('aria-label', t.close); translatedControl(buttons.close, t.library);
    dialog.querySelector('.reader-eyebrow').textContent = t.now;
    buttons.prev.setAttribute('aria-label', t.previous); buttons.next.setAttribute('aria-label', t.next);
    input.setAttribute('aria-label', t.page);
    translatedControl(buttons.fit, t.fit); buttons['zoom-in'].setAttribute('aria-label', t.zoomIn); buttons['zoom-out'].setAttribute('aria-label', t.zoomOut);
    translatedControl(buttons.guided, guidedLabels().button); buttons['edit-panels'].setAttribute('aria-label', guidedLabels().options);
    for (const name of ['prev', 'next']) buttons[name].querySelector('svg')?.style.setProperty('transform', rtl() ? 'rotate(180deg)' : 'none');
    const labels = language() === 'pt-BR' ? ['Leitura sem distrações', 'Tela cheia', 'Mostrar controles'] : language() === 'es' ? ['Lectura sin distracciones', 'Pantalla completa', 'Mostrar controles'] : ['Immersive reading', 'Full screen', 'Show controls'];
    immersiveButton.textContent = labels[0]; fullscreenButton.textContent = labels[1]; restoreButton.textContent = `☰ ${labels[2]}`;
    restoreButton.setAttribute('aria-label', labels[2]); fullscreenButton.hidden = !fullscreenSupported();
    translatedControl(buttons.fit, modeLabels().title); fillButton.textContent = modeLabels().fill; fillButton.title = modeLabels().note;
    panButton.textContent = panLabels().move; resumeButton.textContent = panLabels().resume;
    for (const [name, button] of Object.entries(featureButtons)) button.textContent = featureText()[name];
    applyAppearance(); syncQuickNavigation();
  }
  const ERROR_PT = {
    'The cloud returned an incomplete page. Please try again.': 'A nuvem enviou uma página incompleta. Tente novamente.',
    'This comic archive could not be opened. It may be damaged or use an unsupported format.': 'Não foi possível abrir este quadrinho. O arquivo pode estar danificado ou usar um formato não suportado.',
    'This comic is over 300 MB and packed in a way that can only be opened whole, which is too big for this device. Saving it as CBZ (or a normal, non-solid CBR) lets it open page by page.': 'Este quadrinho tem mais de 300 MB e foi compactado de um jeito que só abre inteiro, grande demais para este aparelho. Em CBZ (ou CBR normal, não sólido) ele abre página por página.',
    'No JPEG, PNG or WebP comic pages were found in this archive.': 'Nenhuma página JPEG, PNG ou WebP foi encontrada neste arquivo.',
    'Password-protected comics are not supported.': 'Quadrinhos protegidos por senha não são suportados.',
    'Password-protected ZIP comics are not supported.': 'Quadrinhos protegidos por senha não são suportados.',
    'This file is not a recognizable comic archive.': 'Este arquivo não parece ser um quadrinho válido.',
    'This page image exceeds the 24-megapixel browser reading limit.': 'Esta página é grande demais para abrir neste aparelho (limite de 24 megapixels).',
    'This page exceeds the 48 MB reading limit.': 'Esta página passa do limite de 48 MB.',
    'This comic file is empty.': 'Este arquivo está vazio.',
    'This PDF could not be opened. It may be damaged or unsupported.': 'Não foi possível abrir este PDF. Ele pode estar danificado.',
    'PDFs larger than 128 MB are not supported on this device. CBZ comics can be read page by page from the cloud.': 'PDFs com mais de 128 MB não abrem neste aparelho. Quadrinhos CBZ podem ser lidos página por página da nuvem.',
    'Animated image pages are not supported.': 'Páginas animadas não são suportadas.',
  };
  const localError = message => language() === 'pt-BR' && ERROR_PT[message] ? ERROR_PT[message] : message;
  function statusMessage(message = '', isError = false, retry) {
    if (isError) message = localError(message);
    lastStatus = message; errorStatus = isError; retryPage = retry;
    status.replaceChildren(document.createTextNode([message, storageWarning].filter(Boolean).join('\n')));
    status.style.color = isError || storageWarning ? 'var(--red, #ff919d)' : '';
    dialog.classList.toggle('reader-error', Boolean(isError || storageWarning));
    if (retry) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'text-button'; button.textContent = text().retry;
      button.style.marginLeft = '10px'; button.addEventListener('click', retry); status.append(button);
    }
  }
  function normalStatus() {
    if (!book || currentPage < 0) return;
    const rects = panels(), t = text();
    const fallback = guided && guidedFallbackPage === currentPage;
    statusMessage(`${t.pageOf(currentPage + 1, book.pageCount)}${guided && rects.length ? ` · ${overview ? turnLabels().overview : focusLabel(panel + 1, rects.length)}` : ''}${fallback ? ` · ${guidedLabels().fallback}` : storageWarning ? '' : ` · ${t.readHint}`}`);
    if (fallback) {
      const identity = `${serial}:${currentPage}`;
      for (const [label, action] of [[guidedLabels().edit, startEditing], [guidedLabels().retry, () => enableGuided({ force: true })]]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'text-button'; button.textContent = label; button.style.marginLeft = '10px';
        button.addEventListener('click', () => { if (`${serial}:${currentPage}` === identity) action(); }); status.append(button);
      }
    }
  }
  function checkSaved() {
    storageWarning = store.lastError ? text().storage : '';
    return !storageWarning;
  }
  function observePersistence({ immediate = false } = {}) {
    clearTimeout(persistenceTimer); persistenceTimer = undefined;
    if (typeof store.flush !== 'function') return;
    const mySession = serial, generation = ++persistenceGeneration;
    const flush = () => {
      persistenceTimer = undefined;
      let saving;
      try { saving = store.flush(); } catch (error) { saving = Promise.reject(error); }
      void Promise.resolve(saving).then(saved => {
        if (serial !== mySession || generation !== persistenceGeneration || !comic) return;
        const hadWarning = storageWarning;
        checkSaved();
        if (!saved) storageWarning = text().storage;
        if (storageWarning) statusMessage(lastStatus.replace(` · ${text().readHint}`, ''), errorStatus, retryPage);
        else if (hadWarning) { if (editing) statusMessage(text().drawHint); else normalStatus(); }
      }).catch(() => {
        if (serial !== mySession || generation !== persistenceGeneration || !comic) return;
        storageWarning = text().storage;
        statusMessage(lastStatus.replace(` · ${text().readHint}`, ''), true, retryPage);
      });
    };
    // Let the 240ms panel camera settle before preparing a large catalog
    // snapshot. A later save replaces this trailing observation.
    if (immediate || document.hidden) flush(); else persistenceTimer = setTimeout(flush, 320);
  }
  function persist(finished = false, { observe = true } = {}) {
    // Decoded image presentation can precede local panel analysis. Preserve the
    // last committed page/panel if closing or hiding the app during that gap.
    if (!comic || !book || currentPage < 0 || loading || analysisPending || !positionCommitted) return true;
    try {
      const previous = store.state.progress[comic.id];
      store.setProgress(comic.id, { page: currentPage, panel: guided ? panel : 0, overview: Boolean(guided && overview), pageCount: book.pageCount,
        status: finished || previous?.status === 'finished' ? 'finished' : 'reading' });
      checkSaved(); if (observe) observePersistence(); notify();
      return !storageWarning;
    } catch { storageWarning = text().storage; return false; }
  }
  function syncQuickNavigation() {
    navigationTimer.update({ available: Boolean(immersive && book && currentPage >= 0 && !editing && !popup && !panMode), seconds: navigationSeconds() });
    const t = text(); quickNavigation.setAttribute('aria-label', t.navigation);
    quickNavigation.classList.toggle('reader-quick-rtl', rtl());
    for (const [name, label] of [['prev', t.previousShort], ['next', t.nextShort]]) {
      quickButtons[name].disabled = buttons[name].disabled;
      quickButtons[name].querySelector('.reader-quick-label').textContent = label;
      quickButtons[name].setAttribute('aria-label', name === 'prev' ? t.previous : t.next);
      quickButtons[name].querySelector('svg')?.style.setProperty('transform', rtl() ? 'rotate(180deg)' : 'none');
    }
    quickPage.textContent = `${t.page} ${Math.max(0, currentPage) + 1} / ${book?.pageCount || '—'}`;
    const rects = guided && !analysisPending && positionCommitted ? panels() : [];
    quickPanel.hidden = !rects.length;
    quickPanel.textContent = rects.length ? overview ? turnLabels().overview : focusLabel(panel + 1, rects.length) : '';
  }
  function updateControls() {
    dialog.classList.toggle('reader-overlay-controls', !editing);
    dialog.classList.toggle('reader-guided', guided && !editing);
    const ready = Boolean(book && currentPage >= 0), blocked = loading || turning || editing || !ready;
    buttons.prev.disabled = blocked || (currentPage === 0 && (!guided || (panel === 0 && !overview)));
    // Keep Next enabled on the last page: it offers an explicit finish action.
    buttons.next.disabled = blocked;
    buttons.finish.disabled = blocked || analysisPending || !positionCommitted;
    for (const name of ['zoom-out', 'fit', 'zoom-in', 'guided', 'edit-panels']) buttons[name].disabled = blocked;
    input.disabled = blocked; input.max = String(book?.pageCount || 1);
    input.value = String(Math.max(0, currentPage) + 1); total.textContent = String(book?.pageCount || '—');
    buttons.guided.setAttribute('aria-pressed', String(guided));
    buttons['edit-panels'].setAttribute('aria-pressed', String(editing));
    const finished = comic && store.state.progress[comic.id]?.status === 'finished';
    translatedControl(buttons.finish, finished ? text().marked : text().markRead);
    buttons.finish.setAttribute('aria-pressed', String(Boolean(finished)));
    dialog.classList.toggle('reader-loading', loading);
    immersiveButton.disabled = !ready || loading; immersiveButton.setAttribute('aria-pressed', String(immersive));
    fillButton.disabled = blocked; fillButton.setAttribute('aria-pressed', String(fitMode() === 'fill'));
    for (const [name, button] of Object.entries(featureButtons)) button.disabled = name === 'appearance' ? !ready || editing || loading || turning : blocked || analysisPending || !positionCommitted;
    panButton.disabled = blocked || guided; panButton.setAttribute('aria-pressed', String(panMode));
    panButton.textContent = panMode ? panLabels().resume : panLabels().move; resumeButton.textContent = panLabels().resume; resumeButton.hidden = !panMode;
    dialog.classList.toggle('reader-panning', panMode);
    dialog.classList.toggle('reader-fit-fill', fitMode() === 'fill' && !editing && !guided);
    dialog.classList.toggle('reader-fit-screen', fitMode() === 'screen' && !editing && !guided);
    syncGestureMode(); syncQuickNavigation();
    if (!navigationSessionShown && ready && !loading && !analysisPending && positionCommitted) {
      navigationSessionShown = true; navigationTimer.reveal();
    }
  }
  function availableSize() {
    const style = getComputedStyle(stage);
    return { width: Math.max(1, stage.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0)),
      height: Math.max(1, stage.clientHeight - parseFloat(style.paddingTop || 0) - parseFloat(style.paddingBottom || 0)) };
  }
  function fitWidth() {
    const available = availableSize();
    return imageWidth && imageHeight ? wholePageFit({ imageWidth, imageHeight, availableWidth: available.width, availableHeight: available.height }).width : available.width;
  }
  function setPageWidth(width, { availableHeight, syncGestures = true } = {}) {
    if (!imageWidth || !imageHeight) return;
    // Never round a fractional fit upwards: one extra pixel on a tall portrait
    // page can crop the bottom or introduce an unnecessary scroll bar.
    pageWidth = Math.max(1, width); wrap.style.width = `${pageWidth}px`;
    wrap.style.minHeight = `${pageWidth * imageHeight / imageWidth}px`;
    const remaining = (availableHeight ?? availableSize().height) - pageWidth * imageHeight / imageWidth;
    wrap.style.marginTop = `${Math.max(0, remaining / 2)}px`;
    if (syncGestures) syncGestureMode();
  }
  // In Panel view, a whole page (no recognised panels, or the overview after
  // the last panel) fills the screen width when the iPad is in landscape,
  // instead of leaving wide empty bars at the sides. The page then scrolls.
  function guidedWholeFills() {
    if (!guided || editing || !imageWidth || !imageHeight) return false;
    if (guidedMode === 'panels' && !overview && panels()[panel]) return false;
    const available = availableSize();
    if (available.width <= available.height) return false;
    return wholePageFit({ imageWidth, imageHeight, availableWidth: available.width, availableHeight: available.height }).width < available.width * .92;
  }
  function guidedFitMode() { return guidedWholeFills() ? 'width' : 'whole'; }
  // A double page with the iPad upright fills the screen's height and slides
  // sideways (see slideFitMode), unless turned off in Page fit.
  const slideWideEnabled = () => store.state.settings.readerSlideWide !== false;
  function layoutMode(width = imageWidth, height = imageHeight) {
    if (editing) return 'whole';
    if (guided) return guidedFitMode();
    const available = availableSize();
    return slideFitMode({ mode: fitMode(), imageWidth: width, imageHeight: height, availableWidth: available.width, availableHeight: available.height, slideWide: slideWideEnabled() });
  }
  // The page reaches past the sides of the screen at its normal size (a double
  // page upright, or Fill screen on a phone): sideways drags slide across it,
  // and past its edge the same drag pulls the neighbouring page in.
  function slideable() {
    if (!book || currentPage < 0 || guided || editing || panMode || !imageWidth || !imageHeight || isZoomed()) return false;
    return scrollLimits().maxLeft > slideThreshold(availableSize().width);
  }
  // Two-page spread: in landscape, with Whole page fit and outside Panel view,
  // facing pages are shown side by side like an open comic. The cover is alone.
  const spreadEnabled = () => store.state.settings.readerSpread !== false;
  function spreadActive() {
    if (!spreadEnabled() || guided || editing || !book || book.pageCount < 3 || fitMode() !== 'whole') return false;
    const width = stage.clientWidth || window.innerWidth, height = stage.clientHeight || window.innerHeight;
    return width > height * 1.1;
  }
  async function composeSpread(first, second, signal) {
    const left = rtl() ? second : first, right = rtl() ? first : second;
    const height = Math.min(Math.max(left.height, right.height), 3000);
    const lw = Math.round(left.width * height / left.height), rw = Math.round(right.width * height / right.height);
    const scale = Math.min(1, Math.sqrt(14_000_000 / ((lw + rw) * height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((lw + rw) * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error(text().pageFailed);
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(left.decodedImage, 0, 0, Math.round(lw * scale), canvas.height);
    context.drawImage(right.decodedImage, Math.round(lw * scale), 0, canvas.width - Math.round(lw * scale), canvas.height);
    signal.throwIfAborted();
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(text().pageFailed)), 'image/jpeg', .92));
    canvas.width = 0; canvas.height = 0;
    return blob;
  }
  function baselineWidth() {
    const available = availableSize(), rect = guided && guidedMode === 'panels' && !editing && !overview ? panels()[panel] : undefined;
    if (rect) return guidedPanelFit({ imageWidth, imageHeight, availableWidth: available.width, availableHeight: available.height, panel: rect, margin: guidedPanelMargin(available.width, available.height) })?.width || fitWidth();
    return pageFit({ mode: layoutMode(), imageWidth, imageHeight, availableWidth: available.width, availableHeight: available.height }).width;
  }
  function swipeAllowed() { return canSwipePages({ pageWidth, baselineWidth: baselineWidth(), browserScale: window.visualViewport?.scale || 1, panning: panMode, guided, guidedReady: guided && !analysisPending, editing, popup: Boolean(popup), loading: loading || turning }); }
  function isZoomed() { const baseline = baselineWidth(); return !baseline || Math.abs(pageWidth - baseline) > Math.max(1, baseline * .035) || (window.visualViewport?.scale || 1) > 1.035; }
  function syncGestureMode() {
    // The reader owns every touch on the page: scrolling, page turns and pinch.
    // Browser scrolling fought the page-turn gesture on iPad and felt stuck, and
    // one engine behaves the same on iPad Safari and Android Chrome.
    stage.style.touchAction = 'none';
  }
  function showHint(message, duration = 4500) { clearTimeout(hintTimer); fitHint.textContent = message; fitHint.hidden = false; hintTimer = setTimeout(() => { fitHint.hidden = true; }, duration); }
  function setPanMode(value, { hint = true } = {}) {
    panMode = Boolean(value); resetGesture(); if (!immersive) setImmersive(true); updateControls();
    if (hint) showHint(panMode ? panLabels().panHint : panLabels().hint);
  }
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  function exitFullscreen() {
    try {
      const result = document.webkitFullscreenElement && !document.fullscreenElement && document.webkitExitFullscreen
        ? document.webkitExitFullscreen() : document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen?.();
      if (result?.catch) void result.catch(() => {});
    } catch { /* The user agent retains control of fullscreen. */ }
  }
  // The iPad app (TestFlight) hides the clock and battery itself; never ask the
  // web view for full screen there.
  const nativeApp = () => Boolean(window.Capacitor?.isNativePlatform?.());
  const installedApp = () => nativeApp() || window.navigator.standalone === true || Boolean(window.matchMedia?.('(display-mode: standalone)').matches);
  function fullscreenFallback() {
    // The installed app already hides Safari; stay quiet if the system keeps the clock.
    if (installedApp()) return;
    showHint(language() === 'pt-BR' ? 'O navegador não permitiu ocultar suas barras. Abra no Chrome/Safari ou use o atalho na tela inicial.' : language() === 'es' ? 'El navegador no permitió ocultar sus barras. Abre en Chrome/Safari o desde la pantalla de inicio.' : 'The browser did not allow its bars to hide. Open in Chrome/Safari or use a home-screen shortcut.', 6500);
  }
  function finishFullscreenRequest(state, failed = false) {
    if (fullscreenRequest !== state) return;
    clearTimeout(state.timer); fullscreenRequest = undefined;
    const acquired = fullscreenElement() === fullscreenTarget;
    if (acquired) {
      if (!comic || serial !== state.serial) { exitFullscreen(); return; }
      fullscreenOwned = true; syncViewport();
    } else if (failed && comic && serial === state.serial) fullscreenFallback();
  }
  // Called synchronously from a tap handler. Fill requests entry only; it never
  // toggles an already active fullscreen session off or takes ownership of it.
  function ensureFullscreen() {
    if (installedApp()) return;
    if (fullscreenElement()) return;
    if (fullscreenRequest) {
      // A native promise can still acquire fullscreen after a slow permission
      // prompt. Keep its original session guard alive until it actually settles.
      if (!fullscreenRequest.timedOut || fullscreenRequest.waitsForPromise) return;
      fullscreenRequest = undefined;
    }
    if (!fullscreenSupported()) { fullscreenFallback(); return; }
    const state = { serial, timer: undefined, timedOut: false, waitsForPromise: false }; fullscreenRequest = state;
    state.timer = setTimeout(() => {
      if (fullscreenRequest !== state) return;
      if (fullscreenElement() === fullscreenTarget) return finishFullscreenRequest(state);
      state.timedOut = true;
      if (comic && serial === state.serial) fullscreenFallback();
      // Prefixed void-returning requests are also retained for their eventual
      // event, so closing the reader before acquisition still releases our entry.
    }, 2000);
    try {
      const request = document.fullscreenEnabled !== false && typeof fullscreenTarget.requestFullscreen === 'function'
        ? fullscreenTarget.requestFullscreen({ navigationUI: 'hide' }) : fullscreenTarget.webkitRequestFullscreen();
      state.waitsForPromise = Boolean(request?.then);
      if (request?.then) void request.then(() => {
        if (fullscreenElement() === fullscreenTarget) finishFullscreenRequest(state);
        else finishFullscreenRequest(state, true);
      }).catch(() => finishFullscreenRequest(state, true));
      // Prefixed implementations can return void; their state is observed via
      // webkitfullscreenchange, never assumed from a resolved undefined value.
    } catch { finishFullscreenRequest(state, true); }
  }
  function wakeRestore() {
    clearTimeout(restoreTimer); dialog.classList.remove('reader-controls-sleeping');
    if (!immersive) return;
    restoreTimer = setTimeout(() => {
      if (!immersive || document.activeElement === restoreButton || restoreButton.matches(':hover')) return;
      dialog.classList.add('reader-controls-sleeping');
    }, 2500);
  }
  function setImmersive(value, { requestScreen = false } = {}) {
    if (value && requestScreen) ensureFullscreen();
    if (editing) finishEditing({ wholePage: true });
    if (immersive === Boolean(value)) { wakeRestore(); syncQuickNavigation(); if (immersive) navigationTimer.reveal(); return; }
    immersive = Boolean(value); dialog.classList.toggle('reader-immersive', immersive);
    immersiveButton.setAttribute('aria-pressed', String(immersive)); restoreButton.hidden = !immersive;
    wakeRestore(); syncQuickNavigation(); if (immersive) navigationTimer.reveal();
    if (currentPage >= 0 && !dialog.classList.contains('reader-overlay-controls')) layoutPage({ preserveWidthPosition: true });
  }
  function syncViewport() {
    if ((window.visualViewport?.scale || 1) > 1.035) return;
    if (viewportFrame) return;
    viewportFrame = requestAnimationFrame(() => {
      viewportFrame = undefined;
      if ((window.visualViewport?.scale || 1) > 1.035) return;
      const height = window.visualViewport?.height || window.innerHeight, width = window.visualViewport?.width || window.innerWidth;
      if (Math.abs(height - viewportHeight) < 1 && Math.abs(width - viewportWidth) < 1) return;
      viewportHeight = height; viewportWidth = width;
      dialog.style.setProperty('--reader-viewport-height', `${height}px`);
      pagerAbort(); stopMotion();
      if (dialog.open && !loading && book && currentPage >= 0 && !editing && spreadActive() !== (spreadPages.length > 1) && (spreadActive() ? currentPage > 0 : true)) { void showPage(currentPage, panel); return; }
      if (dialog.open && !loading) { pageTransition.cancel(); layoutPage({ preserveWidthPosition: true }); if (editing) editToolbar(); }
    });
  }
  function scrollToPosition(left, top, smooth = false) {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // The browser's own smooth scrolling could keep running after a page turn
    // and drag the new page down to its bottom. Our animation stops with any
    // touch or page change; a direct position also cancels a running one.
    stopMotion();
    const limits = scrollLimits(), x = clamp(left, 0, limits.maxLeft), y = clamp(top, 0, limits.maxTop);
    if (!smooth || reduce) { stage.scrollLeft = x; stage.scrollTop = y; return; }
    const fromX = stage.scrollLeft, fromY = stage.scrollTop, began = performance.now(), token = {};
    const step = now => {
      if (motion !== token) return;
      const progress = Math.min(1, (now - began) / 300), eased = 1 - (1 - progress) ** 3;
      stage.scrollLeft = fromX + (x - fromX) * eased; stage.scrollTop = fromY + (y - fromY) * eased;
      if (progress < 1) token.frame = requestAnimationFrame(step); else motion = undefined;
    };
    motion = token; token.frame = requestAnimationFrame(step);
  }
  function drawRect(rect, index, focus = false) {
    const node = document.createElement('div'); node.className = focus ? 'panel-focus' : 'panel-rect';
    Object.assign(node.style, { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` });
    if (!focus) { const label = document.createElement('span'); label.className = 'panel-label'; label.textContent = String(index + 1); node.append(label); }
    return node;
  }
  function paintPanels() {
    overlay.replaceChildren(); overlay.classList.toggle('editing', editing);
    if (editing) draft.forEach((rect, index) => overlay.append(drawRect(rect, index)));
    else if (guided && guidedMode === 'panels' && !overview && panels()[panel]) overlay.append(drawRect(panels()[panel], panel, true));
  }
  function cancelCamera() { cameraGeneration++; if (cameraFrame) cancelAnimationFrame(cameraFrame); cameraFrame = undefined; dialog.classList.remove('reader-guided-moving'); }
  function layoutPage({ smooth = false, keepZoom = false, preserveWidthPosition = false, fromBottom = false, enter = 1, keepCenter = false } = {}) {
    if (!imageWidth || !imageHeight || currentPage < 0) return;
    stopMotion();
    const widthViewY = preserveWidthPosition && !guided && !editing && layoutMode() === 'width' && pageWidth > 0
      ? Math.max(0, (stage.scrollTop - wrap.offsetTop) / (pageWidth * imageHeight / imageWidth)) : null;
    // What sits in the middle of the screen stays there when the screen turns
    // or a zoom ends (fraction of the page's width), for pages that slide.
    const centerX = (preserveWidthPosition || keepCenter) && !guided && !editing && pageWidth > 0
      ? (stage.scrollLeft + stage.clientWidth / 2 - wrap.offsetLeft) / pageWidth : null;
    cancelCamera();
    dialog.classList.toggle('reader-overlay-controls', !editing);
    dialog.classList.toggle('reader-guided', guided && !editing);
    dialog.classList.toggle('reader-fit-fill', fitMode() === 'fill' && !editing && !guided);
    dialog.classList.toggle('reader-fit-screen', fitMode() === 'screen' && !editing && !guided);
    const rect = guided && guidedMode === 'panels' && !editing ? overview ? (guidedWholeFills() ? undefined : { x: 0, y: 0, width: 1, height: 1 }) : panels()[panel] : undefined;
    if (rect) {
      const available = availableSize(), aspect = imageWidth / imageHeight;
      // The whole-page overview keeps using the full screen; single panels get a little room.
      const target = guidedPanelFit({ imageWidth, imageHeight, availableWidth: available.width, availableHeight: available.height, panel: rect, margin: overview ? 0 : guidedPanelMargin(available.width, available.height) });
      if (!target) return;
      const style = getComputedStyle(stage), centerX = parseFloat(style.paddingLeft || 0) + available.width / 2, centerY = parseFloat(style.paddingTop || 0) + available.height / 2;
      const startWidth = pageWidth || fitWidth();
      const startX = (stage.scrollLeft + centerX - wrap.offsetLeft) / startWidth;
      const startY = (stage.scrollTop + centerY - wrap.offsetTop) / (startWidth / aspect);
      const targetX = rect.x + rect.width / 2, targetY = rect.y + rect.height / 2;
      paintPanels();
      const generation = cameraGeneration, identity = `${serial}:${pageSerial}:${currentPage}:${panel}:${overview}`, reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const apply = progress => {
        const eased = 1 - (1 - progress) ** 3;
        setPageWidth(startWidth + (target.width - startWidth) * eased, { availableHeight: available.height, syncGestures: false });
        scrollToPosition(wrap.offsetLeft + (startX + (targetX - startX) * eased) * pageWidth - centerX,
          wrap.offsetTop + (startY + (targetY - startY) * eased) * pageWidth / aspect - centerY);
      };
      if (!smooth || reduce) { apply(1); syncGestureMode(); }
      else {
        const began = performance.now(); dialog.classList.add('reader-guided-moving');
        const frame = now => {
          if (generation !== cameraGeneration || identity !== `${serial}:${pageSerial}:${currentPage}:${panel}:${overview}` || !dialog.open) return;
          const progress = Math.min(1, (now - began) / (overview ? pageDuration() : 240)); apply(progress);
          if (progress < 1) cameraFrame = requestAnimationFrame(frame);
          else { cameraFrame = undefined; dialog.classList.remove('reader-guided-moving'); syncGestureMode(); }
        };
        cameraFrame = requestAnimationFrame(frame);
      }
    } else {
      if (!keepZoom) {
        const available = availableSize();
        const guidedFill = guidedWholeFills();
        const fit = pageFit({ mode: layoutMode(), imageWidth, imageHeight, availableWidth: available.width, availableHeight: available.height });
        setPageWidth(fit.width);
        // A new page always starts at its top. Only reading backwards through a
        // filled page with the keyboard or in Panel view starts at its bottom.
        const topY = fromBottom && (guidedFill || ['width', 'fill', 'screen'].includes(fitMode())) && widthViewY === null ? wrap.offsetTop + fit.height : guidedFill ? 0 : widthViewY !== null ? wrap.offsetTop + widthViewY * fit.height : !guided && !editing && ['width', 'fill', 'screen'].includes(fitMode()) ? 0 : Math.max(0, (fit.height - available.height) / 2);
        // A page wider than the screen starts at the edge it is entered from
        // (its left edge when reading forward); others stay centred.
        const overflowX = fit.width - available.width;
        let left = Math.max(0, overflowX / 2);
        if (!guided && !editing && overflowX > slideThreshold(available.width)) {
          left = centerX !== null ? clamp(centerX * fit.width - available.width / 2, 0, overflowX)
            : entryEdge({ direction: enter, rtl: rtl() }) === 'left' ? 0 : overflowX;
        }
        scrollToPosition(left, topY, smooth && guidedFill);
      }
      paintPanels();
    }
  }
  function selectFitMode(mode) {
    if (!book || currentPage < 0) return;
    if (editing) finishEditing({ wholePage: true });
    cancelAnalysis(); panMode = false; guided = false; overview = false; guidedFallbackPage = -1; panel = 0; hidePopup(); store.setSettings({ readerFitMode: mode, readerGuided: false }); checkSaved(); observePersistence();
    positionCommitted = true; updateControls(); setImmersive(true); layoutPage(); persist(); updateControls(); normalStatus();
    clearTimeout(hintTimer); fitHint.hidden = mode !== 'fill' && mode !== 'screen';
    if (mode === 'fill' || mode === 'screen') {
      fitHint.textContent = panLabels().hint;
      hintTimer = setTimeout(() => { fitHint.hidden = true; }, 4500);
      // Still in the original click task, before any awaited work. A rejected
      // request's explanation takes precedence over the generic reading hint.
      ensureFullscreen();
    } else if (mode === 'width') showHint(featureText().widthHint);
  }
  function chooseFitMode() {
    if (!book || loading || currentPage < 0) return;
    const labels = modeLabels(), menu = makePopup(labels.title);
    const heading = document.createElement('h3'); heading.textContent = labels.title;
    const note = document.createElement('p'); note.textContent = labels.note; note.style.cssText = 'font-size:12px;color:#bac8d7;line-height:1.6;';
    const controls = document.createElement('div'); controls.className = 'row'; menu.append(heading, note, controls);
    for (const mode of ['whole', 'width', 'fill', 'screen']) {
      const button = popupButton(controls, labels[mode], () => selectFitMode(mode), fitMode() === mode);
      button.setAttribute('aria-pressed', String(fitMode() === mode));
    }
    popupButton(controls, labels.cancel, hidePopup); controls.querySelector('button')?.focus({ preventScroll: true });
    const spreadLabel = language() === 'pt-BR' ? 'Página dupla na horizontal' : language() === 'es' ? 'Página doble en horizontal' : 'Two pages in landscape';
    const spreadNote = document.createElement('p'); spreadNote.style.cssText = 'font-size:12px;color:#bac8d7;line-height:1.6;margin-top:14px;';
    spreadNote.textContent = language() === 'pt-BR' ? 'Com o iPad deitado e "Página inteira", mostra duas páginas lado a lado, como uma revista aberta.' : language() === 'es' ? 'Con el iPad en horizontal y "Página completa", muestra dos páginas lado a lado.' : 'With the iPad in landscape and Whole page fit, shows facing pages side by side.';
    const spreadRow = document.createElement('div'); spreadRow.className = 'row'; menu.append(spreadNote, spreadRow);
    const toggle = popupButton(spreadRow, `${spreadLabel}: ${spreadEnabled() ? (language() === 'en' ? 'On' : 'Ligada'.replace('Ligada', language() === 'es' ? 'Activada' : 'Ligada')) : (language() === 'en' ? 'Off' : language() === 'es' ? 'Desactivada' : 'Desligada')}`, () => {
      store.setSettings({ readerSpread: !spreadEnabled() }); checkSaved(); hidePopup(); void showPage(currentPage, panel);
    }, spreadEnabled());
    toggle.setAttribute('aria-pressed', String(spreadEnabled()));
    const slide = slideLabels(), slideNote = document.createElement('p'); slideNote.style.cssText = 'font-size:12px;color:#bac8d7;line-height:1.6;margin-top:14px;';
    slideNote.textContent = slide.note;
    const slideRow = document.createElement('div'); slideRow.className = 'row'; menu.append(slideNote, slideRow);
    const slideToggle = popupButton(slideRow, `${slide.toggle}: ${slideWideEnabled() ? slide.on : slide.off}`, () => {
      store.setSettings({ readerSlideWide: !slideWideEnabled() }); checkSaved(); observePersistence(); hidePopup(); layoutPage(); updateControls();
    }, slideWideEnabled());
    slideToggle.id = 'reader-slide-wide'; slideToggle.setAttribute('aria-pressed', String(slideWideEnabled()));
  }
  function hidePopup() {
    const previous = popup; popup = undefined; previous?.remove();
    try { previous?._cleanup?.(); } catch { /* Already released. */ }
    if (previous?._returnFocus?.isConnected && dialog.open) previous._returnFocus.focus({ preventScroll: true });
    applyAppearance(); syncGestureMode(); syncQuickNavigation();
  }
  function makePopup(title) {
    hidePopup();
    const node = document.createElement('div'); node.className = 'reader-popup'; node.setAttribute('role', 'dialog'); node.setAttribute('aria-label', title); node._returnFocus = document.activeElement;
    Object.assign(node.style, { position: 'absolute', zIndex: '10', left: '50%', transform: 'translateX(-50%)', width: 'min(500px, calc(100% - 24px))',
      bottom: `${dialog.querySelector('.reader-toolbar').offsetHeight + status.offsetHeight + 10}px`, padding: '18px', border: '1px solid #40516a',
      borderRadius: '12px', background: '#152131', color: '#edf3fb', boxShadow: '0 12px 40px #0009', lineHeight: '1.5', maxHeight: '60dvh', overflowY: 'auto' });
    shell.style.position = 'relative'; shell.append(node); popup = node; syncGestureMode(); syncQuickNavigation();
    return node;
  }
  function popupButton(container, label, action, primary = false) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `button ${primary ? 'primary' : 'secondary'} compact`;
    button.textContent = label; button.addEventListener('click', action); container.append(button); return button;
  }
  function popupHeading(menu, title, note) {
    const heading = document.createElement('h3'); heading.textContent = title; menu.append(heading);
    if (note) { const paragraph = document.createElement('p'); paragraph.className = 'reader-popup-note'; paragraph.textContent = note; menu.append(paragraph); }
  }
  function chooseNavigator() {
    if (!book || loading || editing || analysisPending || !positionCommitted || currentPage < 0) return;
    setImmersive(false);
    const labels = featureText(), menu = makePopup(labels.navigate), mySession = serial;
    popupHeading(menu, labels.navigate, labels.preview);
    const output = document.createElement('output'); output.className = 'reader-navigator-position'; output.setAttribute('aria-live', 'polite');
    const slider = document.createElement('input'); slider.id = 'reader-page-scrubber'; slider.type = 'range'; slider.min = '1'; slider.max = String(book.pageCount); slider.step = '1'; slider.value = String(currentPage + 1); slider.setAttribute('aria-label', labels.navigate);
    const row = document.createElement('div'); row.className = 'row';
    const numberLabel = document.createElement('label'); numberLabel.className = 'reader-navigator-number'; numberLabel.textContent = text().page;
    const number = document.createElement('input'); number.type = 'number'; number.min = '1'; number.max = String(book.pageCount); number.inputMode = 'numeric'; number.value = slider.value; number.setAttribute('aria-label', text().page); numberLabel.append(number);
    // A strip of page thumbnails, like the Panels app. Thumbnails already made
    // on this device show at once; the others are made one at a time, only for
    // the pages scrolled into view (each needs that page from the comic).
    menu.classList.add('reader-navigator'); menu.style.width = 'min(880px, calc(100% - 24px))';
    const strip = document.createElement('div'); strip.className = 'reader-thumb-strip'; strip.id = 'reader-thumb-strip';
    const comicKey = pageThumbnailComicKey(comic), activeBook = book, cells = [], urls = new Set(), wanted = new Set(), visible = new Set();
    const thumbs = new AbortController(), shown = new Set(spreadPages.length > 1 ? spreadPages : [currentPage]);
    for (let index = 0; index < book.pageCount; index++) {
      const cell = document.createElement('button'); cell.type = 'button'; cell.className = 'reader-thumb'; cell.dataset.page = String(index);
      cell.setAttribute('aria-label', text().pageOf(index + 1, book.pageCount));
      const frame = document.createElement('span'); frame.className = 'reader-thumb-frame';
      const placeholder = document.createElement('span'); placeholder.className = 'reader-thumb-placeholder'; placeholder.textContent = String(index + 1);
      const picture = document.createElement('img'); picture.alt = ''; picture.draggable = false; picture.decoding = 'async';
      const caption = document.createElement('span'); caption.className = 'reader-thumb-number'; caption.textContent = String(index + 1);
      frame.append(placeholder, picture); cell.append(frame, caption);
      if (shown.has(index)) { cell.classList.add('current'); cell.setAttribute('aria-current', 'page'); }
      cell.addEventListener('click', () => {
        if (mySession !== serial || book !== activeBook || loading || editing) return;
        hidePopup(); void showPage(index);
      });
      cells.push(cell);
    }
    // Right-to-left comics run from the right, like their pages.
    strip.append(...(rtl() ? [...cells].reverse() : cells));
    const centre = (index, smooth = false) => {
      const cell = cells[index]; if (!cell || !strip.clientWidth) return;
      strip.scrollTo({ left: Math.max(0, cell.offsetLeft - (strip.clientWidth - cell.offsetWidth) / 2), behavior: smooth ? 'smooth' : 'auto' });
    };
    const display = (index, blob) => {
      const cell = cells[index], picture = cell?.querySelector('img');
      if (!picture || picture.getAttribute('src') || thumbs.signal.aborted) return;
      const url = URL.createObjectURL(blob); urls.add(url);
      picture.onload = () => cell.classList.add('loaded'); picture.onerror = () => cell.classList.add('failed');
      picture.src = url;
    };
    const thumbnailFor = async index => {
      const cached = await pageThumbs.get(comicKey, index); if (cached) return cached;
      thumbs.signal.throwIfAborted();
      const ready = decodedPages.get(index)?.candidate?.decodedImage;
      if (ready?.naturalWidth) return pageThumbs.from(comicKey, index, ready, { signal: thumbs.signal });
      const blob = await activeBook.page(index, { signal: thumbs.signal });
      return pageThumbs.from(comicKey, index, blob, { signal: thumbs.signal });
    };
    let pumping = false;
    const pump = async () => {
      if (pumping || !comicKey) return;
      pumping = true;
      try {
        while (!thumbs.signal.aborted && wanted.size) {
          // Nearest to the middle of the visible pages first.
          const seen = [...visible].sort((a, b) => a - b), middle = seen.length ? seen[Math.floor(seen.length / 2)] : currentPage;
          const index = [...wanted].reduce((best, value) => Math.abs(value - middle) < Math.abs(best - middle) ? value : best);
          wanted.delete(index);
          const cell = cells[index];
          if (!cell || cell.classList.contains('loaded') || cell.classList.contains('failed') || cell.querySelector('img').getAttribute('src')) continue;
          cell.classList.add('loading');
          try { const blob = await thumbnailFor(index); if (blob) display(index, blob); else cell.classList.add('failed'); }
          catch (error) { if (thumbs.signal.aborted || error?.name === 'AbortError') return; cell.classList.add('failed'); }
          finally { cell.classList.remove('loading'); }
        }
      } finally { pumping = false; }
    };
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        const index = Number(entry.target.dataset.page);
        if (entry.isIntersecting) { visible.add(index); wanted.add(index); } else { visible.delete(index); wanted.delete(index); }
      }
      void pump();
    }, { root: strip, rootMargin: '0px 120px' }) : null;
    if (observer) for (const cell of cells) observer.observe(cell);
    else { for (let index = Math.max(0, currentPage - 3); index <= Math.min(book.pageCount - 1, currentPage + 3); index++) wanted.add(index); void pump(); }
    menu._cleanup = () => { thumbs.abort(); observer?.disconnect(); for (const url of urls) URL.revokeObjectURL(url); urls.clear(); };
    const preview = (value, { follow = false } = {}) => {
      const page = clamp(Math.floor(Number(value)) || 1, 1, book.pageCount);
      slider.value = String(page); number.value = String(page); output.textContent = text().pageOf(page, book.pageCount); slider.setAttribute('aria-valuetext', output.textContent);
      cells.forEach((cell, index) => cell.classList.toggle('previewed', index === page - 1 && !shown.has(index)));
      if (follow) centre(page - 1);
    };
    const go = () => {
      if (mySession !== serial || !book || loading || editing) return;
      const page = clamp(Math.floor(Number(number.value)) || 1, 1, book.pageCount) - 1;
      hidePopup(); void showPage(page);
    };
    // The slider shows where it points in the strip; letting go opens that page.
    if (rtl()) slider.style.direction = 'rtl';
    slider.addEventListener('input', () => preview(slider.value, { follow: true })); slider.addEventListener('change', go);
    number.addEventListener('input', () => { if (number.value) preview(number.value, { follow: true }); });
    number.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); go(); } });
    row.append(numberLabel); popupButton(row, labels.go, go, true); popupButton(row, labels.cancel, hidePopup);
    menu.append(output, strip, slider, row); preview(slider.value);
    centre(currentPage); requestAnimationFrame(() => { if (popup === menu) centre(currentPage); });
    slider.focus({ preventScroll: true });
  }
  // Keep a thumbnail of the page being read (made from the page already on
  // screen, once the reader has settled on it), for the page navigator.
  function scheduleThumbnailSeed(attempt = 0) {
    clearTimeout(thumbSeedTimer); thumbSeedTimer = undefined;
    const comicKey = pageThumbnailComicKey(comic);
    if (!comicKey || currentPage < 0 || spreadPages.length > 1 || attempt > 3) return;
    const mySession = serial, page = currentPage, url = currentURL;
    thumbSeedTimer = setTimeout(async () => {
      thumbSeedTimer = undefined;
      if (mySession !== serial || currentPage !== page || currentURL !== url || spreadPages.length > 1) return;
      if (loading || turning || gesture || pinch || pager || motion || popup) { scheduleThumbnailSeed(attempt + 1); return; }
      try {
        if (await pageThumbs.get(comicKey, page)) return;
        if (mySession !== serial || currentPage !== page || currentURL !== url || !image.complete || !image.naturalWidth) return;
        await pageThumbs.from(comicKey, page, image);
      } catch { /* Made again when the navigator needs it. */ }
    }, 1200);
  }
  function bookmarkLocation(value) {
    const pageLabel = text().pageOf(value.page + 1, book?.pageCount || value.pageCount);
    const panelLabel = language() === 'pt-BR' ? 'Quadro' : language() === 'es' ? 'Viñeta' : 'Panel';
    return `${pageLabel}${value.guided ? ` · ${panelLabel} ${value.panel + 1}` : ''}`;
  }
  function chooseBookmarks() {
    if (!book || loading || editing || analysisPending || !positionCommitted || currentPage < 0) return;
    setImmersive(false);
    const labels = featureText(), menu = makePopup(labels.bookmarks), mySession = serial;
    popupHeading(menu, labels.bookmarks, labels.local);
    const actions = document.createElement('div'); actions.className = 'row'; menu.append(actions);
    popupButton(actions, labels.addBookmark, () => editBookmark({ page: currentPage, panel: guided ? panel : 0, overview: Boolean(guided && overview), pageCount: book.pageCount, guided, label: '', note: '' }), true);
    popupButton(actions, labels.close, hidePopup);
    const entries = store.getBookmarks(comic.id), list = document.createElement('div'); list.className = 'reader-bookmark-list'; menu.append(list);
    if (!entries.length) { const empty = document.createElement('p'); empty.className = 'reader-popup-note'; empty.textContent = labels.noBookmarks; list.append(empty); }
    for (const entry of entries) {
      const item = document.createElement('article'); item.className = 'reader-bookmark-item';
      const jump = document.createElement('button'); jump.type = 'button'; jump.className = 'reader-bookmark-jump';
      const title = document.createElement('strong'); title.textContent = entry.label || bookmarkLocation(entry);
      const location = document.createElement('span'); location.textContent = `${bookmarkLocation(entry)}${entry.guided ? ` · ${labels.guided}` : ''}`;
      jump.append(title, location);
      if (entry.note) { const note = document.createElement('span'); note.className = 'reader-bookmark-note'; note.textContent = entry.note; jump.append(note); }
      jump.addEventListener('click', () => {
        if (mySession !== serial || !book || loading || editing || analysisPending) return;
        hidePopup(); overview = false; guided = Boolean(entry.guided); guidedFallbackPage = -1;
        store.setSettings({ readerGuided: guided }); checkSaved(); observePersistence();
        void showPage(clamp(entry.page, 0, book.pageCount - 1), entry.panel);
      });
      const controls = document.createElement('div'); controls.className = 'row';
      popupButton(controls, labels.edit, () => editBookmark(entry));
      popupButton(controls, labels.remove, () => {
        if (mySession !== serial || !comic) return;
        try { store.removeBookmark(entry.id); checkSaved(); observePersistence(); notify(); chooseBookmarks(); showHint(labels.bookmarkDeleted, 2500); }
        catch (error) { statusMessage(error?.message || text().storage, true); }
      });
      item.append(jump, controls); list.append(item);
    }
    actions.querySelector('button')?.focus({ preventScroll: true });
  }
  function editBookmark(value) {
    if (!book || loading || editing || analysisPending || !positionCommitted) return;
    const labels = featureText(), menu = makePopup(labels.bookmarks), mySession = serial, id = comic.id;
    const target = { page: value.page, panel: value.panel, pageCount: book.pageCount, guided: Boolean(value.guided) };
    popupHeading(menu, value.id ? labels.edit : labels.addBookmark, bookmarkLocation(target));
    const form = document.createElement('form'); form.className = 'reader-bookmark-form';
    const labelField = document.createElement('label'); labelField.textContent = labels.label;
    const label = document.createElement('input'); label.type = 'text'; label.maxLength = 120; label.value = value.label || ''; label.placeholder = bookmarkLocation(target); labelField.append(label);
    const noteField = document.createElement('label'); noteField.textContent = labels.note;
    const note = document.createElement('textarea'); note.maxLength = 2000; note.rows = 4; note.value = value.note || ''; noteField.append(note);
    const error = document.createElement('p'); error.className = 'reader-popup-error'; error.setAttribute('role', 'alert'); error.hidden = true;
    const actions = document.createElement('div'); actions.className = 'row';
    const save = popupButton(actions, labels.save, () => {}, true); save.type = 'submit';
    popupButton(actions, labels.cancel, chooseBookmarks);
    form.append(labelField, noteField, error, actions); menu.append(form);
    form.addEventListener('submit', event => {
      event.preventDefault(); if (mySession !== serial || comic?.id !== id || loading || analysisPending || !positionCommitted) return;
      try {
        store.setBookmark(id, { ...target, label: label.value, note: note.value }); checkSaved(); observePersistence(); notify(); chooseBookmarks(); showHint(labels.bookmarkSaved, 2500);
      } catch (failure) { error.textContent = failure?.message || text().storage; error.hidden = false; }
    });
    label.focus({ preventScroll: true });
  }
  function applyAppearance(preview = store.state.settings) {
    const backgrounds = { black: '#000000', paper: '#ece8df', sepia: '#d8c8a5' };
    const background = backgrounds[preview.readerBackground] || backgrounds.black;
    const brightness = clamp(Number(preview.readerBrightness) || 1, .4, 1.2), contrast = clamp(Number(preview.readerContrast) || 1, .6, 1.6);
    dialog.style.setProperty('--reader-reading-background', background); stage.style.backgroundColor = background;
    image.style.filter = brightness === 1 && contrast === 1 ? '' : `brightness(${brightness}) contrast(${contrast})`;
  }
  function saveAppearance(patch) {
    try { store.setSettings(patch); checkSaved(); observePersistence(); notify(); applyAppearance(); }
    catch (error) { statusMessage(error?.message || text().storage, true); }
  }
  function chooseAppearance() {
    if (!book || currentPage < 0 || editing) return;
    setImmersive(false);
    const labels = featureText(), menu = makePopup(labels.appearance);
    popupHeading(menu, labels.appearance);
    const values = { readerBackground: store.state.settings.readerBackground || 'black', readerBrightness: store.state.settings.readerBrightness ?? 1, readerContrast: store.state.settings.readerContrast ?? 1 };
    for (const [key, title, min, max] of [['readerBrightness', labels.brightness, .4, 1.2], ['readerContrast', labels.contrast, .6, 1.6]]) {
      const field = document.createElement('label'); field.className = 'reader-appearance-field';
      const caption = document.createElement('span'); caption.textContent = title;
      const output = document.createElement('output'); output.textContent = `${Math.round(values[key] * 100)}%`;
      const slider = document.createElement('input'); slider.type = 'range'; slider.min = String(min); slider.max = String(max); slider.step = '.05'; slider.value = String(values[key]); slider.setAttribute('aria-label', title);
      slider.addEventListener('input', () => { values[key] = Number(slider.value); output.textContent = `${Math.round(values[key] * 100)}%`; applyAppearance(values); });
      slider.addEventListener('change', () => saveAppearance({ [key]: values[key] }));
      field.append(caption, output, slider); menu.append(field);
    }
    const backgrounds = document.createElement('div'); backgrounds.className = 'reader-background-options row'; backgrounds.setAttribute('role', 'group'); backgrounds.setAttribute('aria-label', labels.background);
    for (const background of ['black', 'paper', 'sepia']) {
      const button = popupButton(backgrounds, labels[background], () => {
        values.readerBackground = background; saveAppearance({ readerBackground: background });
        for (const sibling of backgrounds.querySelectorAll('button')) sibling.setAttribute('aria-pressed', String(sibling === button));
      });
      button.setAttribute('aria-pressed', String(values.readerBackground === background));
    }
    const resistanceField = document.createElement('label'); resistanceField.className = 'reader-appearance-field reader-swipe-resistance';
    const resistanceCaption = document.createElement('span'); resistanceCaption.textContent = text().swipeResistance;
    const resistanceOutput = document.createElement('output');
    const resistanceSlider = document.createElement('input'); resistanceSlider.id = 'reader-swipe-resistance'; resistanceSlider.type = 'range'; resistanceSlider.min = '1'; resistanceSlider.max = '5'; resistanceSlider.step = '1'; resistanceSlider.value = String(swipeResistance()); resistanceSlider.setAttribute('aria-label', text().swipeResistance);
    const describeResistance = () => { const label = text().swipeLevels[Number(resistanceSlider.value) - 1]; resistanceOutput.textContent = `${resistanceSlider.value} · ${label}`; resistanceSlider.setAttribute('aria-valuetext', label); };
    describeResistance(); resistanceSlider.addEventListener('input', describeResistance);
    resistanceSlider.addEventListener('change', () => {
      try { store.setSettings({ readerSwipeResistance: Number(resistanceSlider.value) }); checkSaved(); observePersistence(); notify(); }
      catch (error) { statusMessage(error?.message || text().storage, true); }
    });
    resistanceField.append(resistanceCaption, resistanceOutput, resistanceSlider);
    const navigationField = document.createElement('label'); navigationField.className = 'reader-navigation-setting'; navigationField.textContent = text().navigationButtons;
    const navigationSelect = document.createElement('select'); navigationSelect.id = 'reader-navigation-seconds';
    for (const seconds of [0, 3, 5, 8]) {
      const option = document.createElement('option'); option.value = String(seconds); option.textContent = seconds ? text().navigationDelay(seconds) : text().navigationOff; navigationSelect.append(option);
    }
    navigationSelect.value = String(navigationSeconds());
    navigationSelect.addEventListener('change', () => {
      try { store.setSettings({ readerNavigationSeconds: Number(navigationSelect.value) }); checkSaved(); observePersistence(); notify(); syncQuickNavigation(); }
      catch (error) { statusMessage(error?.message || text().storage, true); }
    });
    navigationField.append(navigationSelect);
    const actions = document.createElement('div'); actions.className = 'row';
    popupButton(actions, labels.reset, () => { saveAppearance({ readerBackground: 'black', readerBrightness: 1, readerContrast: 1 }); chooseAppearance(); });
    popupButton(actions, labels.close, () => { saveAppearance(values); hidePopup(); });
    const turns = turnLabels();
    const animationField = document.createElement('label'); animationField.className = 'reader-navigation-setting'; animationField.textContent = turns.animation;
    const animationSelect = document.createElement('select'); animationSelect.id = 'reader-page-animation';
    for (const value of ['slide', 'fade', 'none']) { const option = document.createElement('option'); option.value = value; option.textContent = turns[value]; animationSelect.append(option); }
    animationSelect.value = pageAnimation(); animationField.append(animationSelect);
    const durationField = document.createElement('label'); durationField.className = 'reader-navigation-setting'; durationField.textContent = turns.speed;
    const durationSelect = document.createElement('select'); durationSelect.id = 'reader-page-duration';
    [240, 420, 650].forEach((value, index) => { const option = document.createElement('option'); option.value = String(value); option.textContent = turns.speeds[index]; durationSelect.append(option); });
    durationSelect.value = String(pageDuration()); durationSelect.disabled = pageAnimation() === 'none'; durationField.append(durationSelect);
    animationSelect.addEventListener('change', () => { saveAppearance({ readerPageAnimation: animationSelect.value }); durationSelect.disabled = animationSelect.value === 'none'; });
    durationSelect.addEventListener('change', () => saveAppearance({ readerPageDuration: Number(durationSelect.value) }));
    const overviewField = document.createElement('label'); overviewField.className = 'reader-navigation-setting';
    overviewField.textContent = language() === 'pt-BR' ? 'Panel view: mostrar a página inteira depois do último quadro' : language() === 'es' ? 'Por viñeta: mostrar la página completa tras la última viñeta' : 'Panel view: show the whole page after the last panel';
    const overviewSelect = document.createElement('select'); overviewSelect.id = 'reader-overview';
    for (const [value, label] of [['on', language() === 'pt-BR' ? 'Sim' : language() === 'es' ? 'Sí' : 'On'], ['off', language() === 'pt-BR' ? 'Não' : 'Off']]) { const option = document.createElement('option'); option.value = value; option.textContent = label; overviewSelect.append(option); }
    overviewSelect.value = store.state.settings.readerOverview === false ? 'off' : 'on'; overviewField.append(overviewSelect);
    overviewSelect.addEventListener('change', () => saveAppearance({ readerOverview: overviewSelect.value === 'on' }));
    menu.append(backgrounds, resistanceField, navigationField, animationField, durationField, overviewField, actions); menu.querySelector('input')?.focus({ preventScroll: true });
  }
  function savePanelLayout(rects) {
    try { store.setPanels(comic.id, currentPage, rects); checkSaved(); observePersistence(); notify(); if (storageWarning) statusMessage('', true); return !storageWarning; }
    catch (error) { statusMessage(error?.message || text().storage, true); return false; }
  }
  function cancelAnalysis() {
    analysisGeneration++; analysisController?.abort(); analysisController = undefined; analysisPending = false;
    dialog.classList.remove('reader-analyzing');
  }
  async function obtainPagePanels({ force = false, signal, imageElement = image } = {}) {
    if (!force && storedPanels().length) { guidedMode = 'panels'; guidedFallbackPage = -1; return storedPanels(); }
    cancelAnalysis();
    const controller = new AbortController(); analysisController = controller; analysisPending = true;
    const generation = analysisGeneration, mySession = serial, myPage = pageSerial, page = currentPage, id = comic.id;
    const valid = () => !controller.signal.aborted && generation === analysisGeneration && serial === mySession && pageSerial === myPage && currentPage === page && comic?.id === id && guided;
    const parents = [signal, sessionController?.signal].filter(Boolean), cancel = () => controller.abort();
    for (const parent of parents) { if (parent.aborted) controller.abort(); else parent.addEventListener('abort', cancel, { once: true }); }
    dialog.classList.add('reader-analyzing'); statusMessage(guidedLabels().analyzing);
    try {
      const result = await analyzePagePanels(imageElement, { signal: controller.signal, direction: rtl() ? 'rtl' : 'ltr' });
      if (!valid()) throw abortError();
      // A manually saved layout that appeared during analysis takes precedence.
      if (!force && storedPanels().length) { guidedMode = 'panels'; guidedFallbackPage = -1; return storedPanels(); }
      if (result.confidence === 'high' && result.panels?.length) {
        store.setPanels(id, page, result.panels); checkSaved(); observePersistence(); notify();
        guidedMode = 'panels'; guidedFallbackPage = -1; return storedPanels();
      }
      // Never replace manual corrections with an uncertain result or a made-up
      // grid. Existing layouts remain stored even after an uncertain recheck.
      guidedMode = 'whole'; guidedFallbackPage = page; return [];
    } catch (error) {
      if (!valid() || controller.signal.aborted || error?.name === 'AbortError') throw abortError();
      guidedMode = 'whole'; guidedFallbackPage = page; return [];
    } finally {
      for (const parent of parents) parent.removeEventListener('abort', cancel);
      if (analysisController === controller) { analysisController = undefined; analysisPending = false; dialog.classList.remove('reader-analyzing'); }
    }
  }
  async function enableGuided({ force = false } = {}) {
    if (!book || currentPage < 0 || editing || loading) return;
    hidePopup(); panMode = false; overview = false; guided = true; store.setSettings({ readerGuided: true }); checkSaved(); observePersistence();
    setImmersive(true, { requestScreen: true });
    const mySession = serial, myPage = pageSerial, selectedPanel = panel;
    loading = true; positionCommitted = false; activity(true); updateControls();
    try {
      const rects = await obtainPagePanels({ force });
      if (serial !== mySession || pageSerial !== myPage || !guided) return;
      panel = resolvePanelIndex(selectedPanel, rects.length); loading = false; positionCommitted = true; updateControls(); layoutPage({ smooth: true }); persist(); normalStatus(); activity(false); wakeRestore();
      showHint(rects.length ? guidedLabels().detected(rects.length) : guidedLabels().fallback, rects.length ? 3500 : 6500);
      schedulePrefetch();
    } catch (error) {
      if (serial !== mySession || pageSerial !== myPage || error?.name === 'AbortError') return;
      loading = false; guidedMode = 'whole'; guidedFallbackPage = currentPage; panel = 0; overview = false; positionCommitted = true;
      activity(false); updateControls(); layoutPage(); persist(); normalStatus(); showHint(guidedLabels().fallback, 6500); schedulePrefetch();
    }
  }
  function disableGuided() {
    cancelAnalysis(); cancelCamera(); guided = false; overview = false; guidedFallbackPage = -1; panel = 0;
    store.setSettings({ readerGuided: false }); checkSaved(); observePersistence();
    positionCommitted = true; updateControls(); layoutPage(); persist(); normalStatus();
  }
  function choosePanelOptions() {
    if (!book || loading || currentPage < 0) return;
    setImmersive(false); const labels = guidedLabels(), menu = makePopup(labels.options);
    const heading = document.createElement('h3'); heading.textContent = labels.options;
    const note = document.createElement('p'); note.textContent = labels.detectNote; note.style.cssText = 'font-size:12px;color:#bac8d7;line-height:1.6;';
    const controls = document.createElement('div'); controls.className = 'row'; menu.append(heading, note, controls);
    popupButton(controls, labels.edit, startEditing, true);
    popupButton(controls, labels.detect, () => enableGuided({ force: true }));
    popupButton(controls, labels.whole, () => { hidePopup(); disableGuided(); });
    popupButton(controls, labels.cancel, hidePopup); controls.querySelector('button')?.focus({ preventScroll: true });
    const spreadLabel = language() === 'pt-BR' ? 'Página dupla na horizontal' : language() === 'es' ? 'Página doble en horizontal' : 'Two pages in landscape';
    const spreadNote = document.createElement('p'); spreadNote.style.cssText = 'font-size:12px;color:#bac8d7;line-height:1.6;margin-top:14px;';
    spreadNote.textContent = language() === 'pt-BR' ? 'Com o iPad deitado e "Página inteira", mostra duas páginas lado a lado, como uma revista aberta.' : language() === 'es' ? 'Con el iPad en horizontal y "Página completa", muestra dos páginas lado a lado.' : 'With the iPad in landscape and Whole page fit, shows facing pages side by side.';
    const spreadRow = document.createElement('div'); spreadRow.className = 'row'; menu.append(spreadNote, spreadRow);
    const toggle = popupButton(spreadRow, `${spreadLabel}: ${spreadEnabled() ? (language() === 'en' ? 'On' : 'Ligada'.replace('Ligada', language() === 'es' ? 'Activada' : 'Ligada')) : (language() === 'en' ? 'Off' : language() === 'es' ? 'Desactivada' : 'Desligada')}`, () => {
      store.setSettings({ readerSpread: !spreadEnabled() }); checkSaved(); hidePopup(); void showPage(currentPage, panel);
    }, spreadEnabled());
    toggle.setAttribute('aria-pressed', String(spreadEnabled()));
  }
  function editToolbar() {
    const t = text(), menu = makePopup(t.edit);
    // Reuse the already disabled bottom controls' area while drawing, leaving
    // every part of the page visible and reachable by a finger.
    menu.style.padding = '9px 14px'; menu.style.bottom = '8px';
    const note = document.createElement('p'); note.textContent = t.savedPanels(draft.length); note.style.cssText = 'font-size:11px;margin:0 0 10px;color:#b6c5d7;';
    const controls = document.createElement('div'); controls.className = 'row'; menu.append(note, controls);
    const undo = popupButton(controls, t.undo, () => { draft.pop(); savePanelLayout(draft); panel = 0; paintPanels(); editToolbar(); }); undo.disabled = !draft.length;
    const clear = popupButton(controls, t.clear, () => { draft = []; savePanelLayout(draft); panel = 0; paintPanels(); editToolbar(); }); clear.disabled = !draft.length;
    popupButton(controls, t.done, () => finishEditing(), true);
  }
  function startEditing() {
    if (!book || loading || currentPage < 0) return;
    cancelAnalysis(); setImmersive(false); cancelPrefetch();
    hidePopup(); overview = false; draft = storedPanels(); editing = true; pointer = undefined;
    dialog.classList.add('editing-panels'); panel = 0; updateControls(); layoutPage(); editToolbar(); statusMessage(text().drawHint);
    stage.focus({ preventScroll: true });
  }
  function finishEditing({ wholePage = false } = {}) {
    if (!editing) return;
    pointer = undefined; editing = false; dialog.classList.remove('editing-panels');
    const saved = savePanelLayout(draft); guided = !wholePage && draft.length > 0; guidedMode = guided ? 'panels' : 'whole'; guidedFallbackPage = -1; panel = 0; hidePopup();
    store.setSettings({ readerGuided: guided }); checkSaved(); observePersistence();
    positionCommitted = true; persist(); updateControls(); layoutPage(); statusMessage(saved && !storageWarning ? text().layoutSaved : '', !saved);
    stage.focus({ preventScroll: true });
  }
  function point(event) {
    const box = overlay.getBoundingClientRect();
    return { x: clamp((event.clientX - box.left) / box.width, 0, 1), y: clamp((event.clientY - box.top) / box.height, 0, 1) };
  }
  overlay.addEventListener('pointerdown', event => {
    if (!editing || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); event.stopPropagation();
    pointer = { id: event.pointerId, start: point(event), current: point(event) };
    overlay.setPointerCapture(event.pointerId);
  });
  overlay.addEventListener('pointermove', event => {
    if (!editing || pointer?.id !== event.pointerId) return;
    event.preventDefault(); pointer.current = point(event);
    paintPanels(); const { start, current } = pointer;
    overlay.append(drawRect({ x: Math.min(start.x, current.x), y: Math.min(start.y, current.y), width: Math.abs(current.x - start.x), height: Math.abs(current.y - start.y) }, draft.length));
  });
  overlay.addEventListener('pointerup', event => {
    if (!editing || pointer?.id !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const { start } = pointer, end = point(event); pointer = undefined;
    if (overlay.hasPointerCapture(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
    const rect = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
    if (rect.width < .02 || rect.height < .02) statusMessage(text().panelSmall);
    else if (draft.length >= 100) statusMessage(text().panelLimit);
    else { draft.push(rect); savePanelLayout(draft); statusMessage(text().drawHint); }
    paintPanels(); editToolbar();
  });
  overlay.addEventListener('pointercancel', () => { pointer = undefined; paintPanels(); });

  async function decodedURL(blob, signal) {
    const url = URL.createObjectURL(blob); pendingURLs.add(url);
    const candidate = new Image(); candidate.decoding = 'async';
    try {
      await new Promise((resolve, reject) => {
        let timeout;
        const cleanup = () => { candidate.onload = candidate.onerror = null; signal.removeEventListener('abort', cancel); clearTimeout(timeout); };
        const cancel = () => { cleanup(); candidate.removeAttribute('src'); reject(signal.reason instanceof Error ? signal.reason : abortError()); };
        candidate.onload = () => { cleanup(); resolve(); };
        candidate.onerror = () => { cleanup(); reject(new Error(text().pageFailed)); };
        signal.addEventListener('abort', cancel, { once: true });
        timeout = setTimeout(() => { cleanup(); candidate.removeAttribute('src'); reject(new Error(text().pageFailed)); }, 30000);
        if (signal.aborted) return cancel();
        candidate.src = url;
      });
      signal.throwIfAborted();
      if (!candidate.naturalWidth || !candidate.naturalHeight) throw new Error(text().pageFailed);
      // Retain one predecoded Image for the next page, so page turning can reuse
      // its decoded resource rather than decode a fresh object URL again.
      if (typeof candidate.decode === 'function') await candidate.decode();
      signal.throwIfAborted();
      return { url, width: candidate.naturalWidth, height: candidate.naturalHeight, decodedImage: candidate, blob };
    } catch (error) { URL.revokeObjectURL(url); pendingURLs.delete(url); throw error; }
  }
  function disposeCandidate(candidate) {
    if (!candidate || candidate.url === currentURL) return;
    candidate.decodedImage?.removeAttribute('src'); URL.revokeObjectURL(candidate.url); pendingURLs.delete(candidate.url);
  }
  // ---- Pages kept decoded around the current one ----
  function decodedEntry(index, { start = true } = {}) {
    if (!book || !comic || !sessionController || !Number.isInteger(index) || index < 0 || index >= book.pageCount) return null;
    const existing = decodedPages.get(index);
    if (existing && !existing.controller.signal.aborted) return existing;
    if (!start) return null;
    const controller = new AbortController(), activeBook = book, mySession = serial, activeSession = sessionController;
    const entry = { index, controller, candidate: undefined, promise: undefined };
    const cancel = () => controller.abort(); activeSession.signal.addEventListener('abort', cancel, { once: true });
    entry.promise = (async () => {
      const blob = await activeBook.page(index, { signal: controller.signal });
      controller.signal.throwIfAborted();
      const candidate = await decodedURL(blob, controller.signal);
      if (mySession !== serial || controller.signal.aborted) { disposeCandidate(candidate); throw abortError(); }
      entry.candidate = candidate; return candidate;
    })().finally(() => activeSession.signal.removeEventListener('abort', cancel));
    entry.promise.catch(() => { if (decodedPages.get(index) === entry && !entry.candidate) decodedPages.delete(index); });
    decodedPages.set(index, entry);
    return entry;
  }
  const cachedURL = url => Boolean(url) && [...decodedPages.values()].some(entry => entry.candidate?.url === url);
  function releaseDecoded(entry) { entry.controller.abort(); if (entry.candidate) disposeCandidate(entry.candidate); }
  function trimDecoded(keep) {
    for (const [index, entry] of [...decodedPages]) if (!keep.has(index)) { decodedPages.delete(index); releaseDecoded(entry); }
  }
  function clearDecoded() { for (const entry of decodedPages.values()) releaseDecoded(entry); decodedPages.clear(); }
  function cancelPrefetch() {
    clearTimeout(prefetchTimer); prefetchTimer = undefined;
    // Pages still loading in the background stop; ready ones stay ready.
    for (const [index, entry] of [...decodedPages]) if (!entry.candidate && index !== currentPage) { decodedPages.delete(index); entry.controller.abort(); }
  }
  function schedulePrefetch() {
    clearTimeout(prefetchTimer); prefetchTimer = undefined;
    if (!book || !comic || loading || editing || document.hidden || currentPage < 0) return;
    const mySession = serial, page = currentPage;
    const last = spreadPages.length > 1 ? spreadPages[spreadPages.length - 1] : currentPage;
    // Let the shown page and the next input paint first, then get the next page
    // ready, then the previous one (usually already ready when reading forward).
    prefetchTimer = setTimeout(() => {
      prefetchTimer = undefined;
      if (mySession !== serial || !book || loading || editing || document.hidden || currentPage !== page) return;
      const next = decodedEntry(last + 1);
      const previous = () => { if (mySession === serial && currentPage === page && !spreadActive()) decodedEntry(page - 1); };
      if (next && !next.candidate) next.promise.then(previous, previous); else previous();
    }, 120);
  }
  function waitFor(promise, signal) {
    if (signal.aborted) return Promise.reject(signal.reason instanceof Error ? signal.reason : abortError());
    return new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason instanceof Error ? signal.reason : abortError());
      signal.addEventListener('abort', abort, { once: true });
      promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
    });
  }
  async function showPage(index, targetPanel = 0, { prompt = true, targetOverview = false, animate = false, direction = 1, pager: fromPager = false, spread = 'jump' } = {}) {
    if (!book || !comic || editing) return;
    index = clamp(Math.floor(index), 0, book.pageCount - 1);
    const spreading = spreadActive();
    if (!fromPager) pagerAbort();
    const fromBottom = guidedFillFromBottom; guidedFillFromBottom = false;
    pageTransition.cancel(); if (!fromPager) turning = false; cancelAnalysis(); cancelCamera(); stopMotion(); clearStretch(); panMode = false; positionCommitted = false;
    clearTimeout(prefetchTimer); prefetchTimer = undefined;
    // Keep only the pages around the new position (and the one still shown).
    const around = center => { const keep = new Set(); const reach = spreading ? 2 : 1; for (let i = center - reach; i <= center + reach + (spreading ? 1 : 0); i++) keep.add(i); return keep; };
    const keep = around(index); keep.add(currentPage); trimDecoded(keep);
    pageController?.abort(); pageController = new AbortController();
    const request = pageController, mySession = serial, myPage = ++pageSerial, activeBook = book;
    const sessionAbort = () => request.abort(sessionController?.signal.reason);
    const activeSessionSignal = sessionController.signal;
    activeSessionSignal.addEventListener('abort', sessionAbort, { once: true });
    hidePopup(); loading = true; activity(true); updateControls(); statusMessage(text().loadingPage(index + 1));
    let candidate, snapshot, previousURL;
    // Pages kept in the decoded cache own their address; a two-page composite
    // belongs to this view only and is released when it is replaced.
    const release = value => { if (value?.url && value.url !== currentURL && !cachedURL(value.url)) { URL.revokeObjectURL(value.url); pendingURLs.delete(value.url); } };
    try {
      const entry = decodedEntry(index);
      if (!entry) throw new Error(text().pageFailed);
      candidate = await waitFor(entry.promise, request.signal);
      const blob = candidate.blob;
      let pairedPages = [index];
      // Landscape two-page view: pair this upright page with an upright
      // neighbour (see spreadPartners); the cover and double pages stand alone.
      if (spreading && candidate.height > candidate.width) {
        for (const other of spreadPartners({ index, pageCount: activeBook.pageCount, mode: spread })) {
          try {
            const partnerEntry = decodedEntry(other);
            const partner = partnerEntry ? await waitFor(partnerEntry.promise, request.signal) : null;
            if (!partner || partner.height <= partner.width) continue;
            const first = Math.min(index, other);
            const combined = await composeSpread(first === index ? candidate : partner, first === index ? partner : candidate, request.signal);
            candidate = await decodedURL(combined, request.signal);
            pairedPages = [first, first + 1]; index = first;
            break;
          } catch (error) { if (request.signal.aborted) throw error; }
        }
      }
      if (mySession !== serial || myPage !== pageSerial || request.signal.aborted) { release(candidate); return; }
      spreadPages = pairedPages;
      previousURL = currentURL;
      if (animate && !fromPager && currentPage >= 0 && currentURL) { resetGesture(); clearStretch(); snapshot = pageTransition.capture(); }
      currentURL = candidate.url; pendingURLs.delete(candidate.url);
      image.src = currentURL; showImage(true); image.alt = spreadPages.length > 1 ? `${text().pageOf(index + 1, activeBook.pageCount)} + ${index + 2}` : text().pageOf(index + 1, activeBook.pageCount);
      imageWidth = candidate.width; imageHeight = candidate.height;
      currentPage = index; guidedFallbackPage = -1; panel = 0; overview = false; guidedMode = 'whole';
      layoutPage({ fromBottom, enter: direction });
      if (guided) {
        const rects = await obtainPagePanels({ signal: request.signal, imageElement: candidate.decodedImage });
        if (mySession !== serial || myPage !== pageSerial || request.signal.aborted) return;
        panel = resolvePanelIndex(targetPanel, rects.length); overview = Boolean(targetOverview && rects.length);
      }
      loading = false; positionCommitted = true; if (!fromPager) turning = Boolean(snapshot); layoutPage({ fromBottom, enter: direction }); persist(); updateControls(); normalStatus();
      if (snapshot) await pageTransition.play({ snapshot, style: pageAnimation(), duration: pageDuration(), direction: direction * (rtl() ? -1 : 1) });
      if (mySession !== serial || myPage !== pageSerial || request.signal.aborted) return;
      if (!fromPager) turning = false;
      paintPanels(); updateControls(); activity(false);
      wakeRestore();
      if (index === 0 && onCoverFirstPage) void Promise.resolve().then(() => onCoverFirstPage(comic, blob)).catch(() => {});
      if (guided && guidedFallbackPage === currentPage) showHint(guidedLabels().fallback, 6500);
      else if (!slideHintShown && slideable()) { slideHintShown = true; showHint(slideLabels().hint, 3200); }
      trimDecoded(around(index));
      schedulePrefetch(); scheduleThumbnailSeed();
    } catch (error) {
      release(candidate);
      if (mySession !== serial || myPage !== pageSerial || request.signal.aborted) return;
      pageTransition.cancel(); if (!fromPager) turning = false; loading = false; activity(false); updateControls();
      try { window.dispatchEvent(new CustomEvent('cloudpanels-error', { detail: { where: 'page', error, extra: { page: index + 1, format: comic?.format, size: comic?.size, ...(error?.details || {}) } } })); } catch {}
      statusMessage(error?.message || text().pageFailed, true, () => showPage(index, targetPanel, { prompt, targetOverview }));
    } finally {
      if (previousURL && previousURL !== currentURL && !cachedURL(previousURL)) URL.revokeObjectURL(previousURL);
      activeSessionSignal.removeEventListener('abort', sessionAbort);
    }
  }
  async function endOfBook() {
    const mySession = serial, finishedComic = comic;
    persist(true);
    loading = true; activity(true); updateControls(); statusMessage(turnLabels().next);
    try {
      const next = await onNextComic?.(finishedComic);
      if (mySession !== serial || comic !== finishedComic) return;
      loading = false; updateControls();
      if (next) return await controller.open(next.comic, next.source, { fromStart: true });
      activity(false); setImmersive(false); statusMessage(turnLabels().end);
    } catch {
      if (mySession !== serial || comic !== finishedComic) return;
      loading = false; activity(false); updateControls(); setImmersive(false);
      statusMessage(turnLabels().nextFailed, true, endOfBook);
    }
  }
  async function move(delta, { stepScroll = false } = {}) {
    if (!book || currentPage < 0 || loading || turning || editing || popup || analysisPending || !positionCommitted) return;
    stopMotion(); clearStretch();
    // A page wider than the screen (a double page upright): taps, buttons and
    // arrow keys first move across it and turn the page once its edge shows.
    if (slideable()) {
      const target = sideStep({ scrollLeft: stage.scrollLeft, maxLeft: scrollLimits().maxLeft, viewWidth: stage.clientWidth, delta, direction: rtl() ? 'rtl' : 'ltr' });
      if (target !== null) { scrollToPosition(target, stage.scrollTop, true); return; }
    }
    // In Panel view a filled landscape page is read top to bottom before
    // turning; elsewhere only the keyboard's Page Down/Space scrolls first.
    // Taps and swipes always turn the page, and the new page starts at its top.
    const scrollsPage = guidedWholeFills() || (stepScroll && !guided && !editing && ['width', 'fill', 'screen'].includes(fitMode()));
    if (scrollsPage && !isZoomed() && stage.scrollHeight - stage.clientHeight > 4) {
      const maxTop = stage.scrollHeight - stage.clientHeight, step = stage.clientHeight * .8;
      if (delta > 0 && stage.scrollTop < maxTop - 4) { scrollToPosition(stage.scrollLeft, Math.min(maxTop, stage.scrollTop + step), true); return; }
      if (delta < 0 && stage.scrollTop > 4) { scrollToPosition(stage.scrollLeft, Math.max(0, stage.scrollTop - step), true); return; }
      if (delta < 0) guidedFillFromBottom = true;
    }
    if (spreadActive() && !guided && !isZoomed()) {
      const last = spreadPages.length ? spreadPages[spreadPages.length - 1] : currentPage;
      const target = delta > 0 ? last + 1 : currentPage - 1;
      if (delta > 0 && target >= book.pageCount) return endOfBook();
      if (delta < 0 && currentPage <= 0) return;
      return showPage(target, 0, { animate: true, direction: delta, spread: delta > 0 ? 'forward' : 'backward' });
    }
    const step = stepReadingPosition({ page: currentPage, pageCount: book.pageCount, panel, panelCount: panels().length, guided, overview, delta, showOverview: store.state.settings.readerOverview !== false });
    if (step.kind === 'panel' || step.kind === 'overview') {
      const fromBottom = guidedFillFromBottom; guidedFillFromBottom = false;
      panel = step.panel; overview = step.overview; layoutPage({ smooth: true, fromBottom }); persist(); updateControls(); normalStatus();
      if (overview) showHint(turnLabels().overview, 2600);
      return;
    }
    guidedFillFromBottom = guidedFillFromBottom && step.kind === 'page';
    if (step.kind === 'end') return endOfBook();
    if (step.kind === 'page') {
      // The page slides in beside the current one, the same way a swipe does.
      if (!guided && step.page === currentPage + delta && await pagerTurn(delta)) return;
      return showPage(step.page, step.panel, { targetOverview: step.overview, animate: true, direction: delta });
    }
  }
  function markRead() {
    if (!book || currentPage < 0 || loading || editing || analysisPending || !positionCommitted) return;
    const saved = persist(true); updateControls(); statusMessage(saved ? text().finished : text().marked);
  }
  function zoom(multiplier, point, { anchor = 'center', pan } = {}) {
    if (!book || currentPage < 0 || loading || editing) return;
    cancelCamera(); stopMotion(); clearStretch();
    const box = stage.getBoundingClientRect();
    const focusX = point ? point.x - box.left : stage.clientWidth / 2, focusY = point ? point.y - box.top : stage.clientHeight / 2;
    const oldWidth = pageWidth || fitWidth(), ratioX = (stage.scrollLeft + focusX - wrap.offsetLeft) / oldWidth;
    const oldHeight = oldWidth * imageHeight / imageWidth, ratioY = (stage.scrollTop + focusY - wrap.offsetTop) / oldHeight;
    setPageWidth(clamp(oldWidth * multiplier, fitWidth() * .5, Math.max(fitWidth() * 8, imageWidth * 2)));
    paintPanels();
    // A double tap brings the tapped spot to the centre; a pinch keeps the
    // spot under the fingers and follows them as they move.
    const keep = anchor === 'finger' && point;
    scrollToPosition(wrap.offsetLeft + ratioX * pageWidth - (keep ? focusX : point ? stage.clientWidth / 2 : focusX) - (pan?.x || 0),
      wrap.offsetTop + ratioY * pageWidth * imageHeight / imageWidth - (keep ? focusY : point ? stage.clientHeight / 2 : focusY) - (pan?.y || 0));
  }
  // ---- Touch: scrolling, page turns and pinch, all owned by the reader -----
  // The page follows the finger 1:1, glides after a flick and stretches at the
  // edges like an iPad scroll view. A sideways drag slides the neighbouring page
  // in beside the current one (like the Panels app): letting go far enough, or
  // with a flick, turns the page; otherwise both spring back into place.
  const PAGE_GAP = 14;
  const easeOut = 'cubic-bezier(.22,.8,.3,1)';
  let gesture, pinch, motion, pager, stretch = { x: 0, y: 0 };
  const touchPoints = new Map();
  const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  function scrollLimits() { return { maxLeft: Math.max(0, stage.scrollWidth - stage.clientWidth), maxTop: Math.max(0, stage.scrollHeight - stage.clientHeight) }; }
  function clearStretch() { if (stretch.x || stretch.y) { stretch = { x: 0, y: 0 }; wrap.style.translate = ''; } }
  // Positions may lie past the edges while the page is stretched: the browser
  // keeps a valid scroll position and the overflow moves the page itself.
  function renderScroll(x, y, limits) {
    const left = clamp(x, 0, limits.maxLeft), top = clamp(y, 0, limits.maxTop);
    if (Math.abs(stage.scrollLeft - left) >= .5) stage.scrollLeft = left;
    if (Math.abs(stage.scrollTop - top) >= .5) stage.scrollTop = top;
    const ox = left - x, oy = top - y;
    if (ox !== stretch.x || oy !== stretch.y) { stretch = { x: ox, y: oy }; wrap.style.translate = ox || oy ? `${ox}px ${oy}px` : ''; }
  }
  function currentScroll() { return { x: stage.scrollLeft - stretch.x, y: stage.scrollTop - stretch.y }; }
  function stopMotion() { if (motion) { cancelAnimationFrame(motion.frame); motion = undefined; } }
  // Keep moving after a flick (and bounce back from an edge), like iOS.
  function glide(vx, vy) {
    stopMotion();
    const limits = scrollLimits(), start = currentScroll();
    let x = { pos: start.x, vel: limits.maxLeft > 0 ? vx : 0 }, y = { pos: start.y, vel: limits.maxTop > 0 ? vy : 0 };
    if (Math.abs(x.vel) < .02 && Math.abs(y.vel) < .02 && !stretch.x && !stretch.y) return;
    const token = {}; let last = performance.now();
    const step = now => {
      if (motion !== token) return;
      const dt = Math.min(48, Math.max(1, now - last)); last = now;
      x = stepScroll(x, dt, { min: 0, max: limits.maxLeft }); y = stepScroll(y, dt, { min: 0, max: limits.maxTop });
      renderScroll(x.pos, y.pos, limits);
      if (x.done && y.done) { motion = undefined; clearStretch(); return; }
      token.frame = requestAnimationFrame(step);
    };
    motion = token; token.frame = requestAnimationFrame(step);
  }

  // ---- Sliding pages ----
  const pagerLabels = () => language() === 'pt-BR'
    ? { end: 'Fim da revista · Solte para abrir a próxima', loading: n => `Carregando página ${n}…` }
    : language() === 'es' ? { end: 'Fin del cómic · Suelta para abrir el siguiente', loading: n => `Cargando página ${n}…` }
      : { end: 'End of this comic · Let go to open the next one', loading: n => `Loading page ${n}…` };
  function pagerAllowed({ zoomed = false } = {}) {
    return Boolean(book && comic && currentPage >= 0 && !guided && !editing && !popup && !panMode && !loading && !turning && !analysisPending && positionCommitted && !spreadActive() && (zoomed || swipeAllowed()));
  }
  // physical: +1 when the page comes in from the right, -1 from the left.
  function neighbourPlacement(candidate, physical = 1) {
    const available = availableSize(), style = getComputedStyle(stage);
    const fit = pageFit({ mode: layoutMode(candidate.width, candidate.height), imageWidth: candidate.width, imageHeight: candidate.height, availableWidth: available.width, availableHeight: available.height });
    const slides = fit.width - available.width > slideThreshold(available.width);
    return neighbourGeometry({ fit, available, padding: { left: parseFloat(style.paddingLeft) || 0, top: parseFloat(style.paddingTop) || 0 }, align: slides ? (physical > 0 ? 'left' : 'right') : 'center' });
  }
  function pagerBegin() {
    stopMotion(); clearStretch();
    const rect = stage.getBoundingClientRect();
    pager = { width: rect.width, offset: 0, delta: 0, physical: 0, index: -1, exists: false, ready: false, animating: false, animations: [] };
    Object.assign(neighbourLayer.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
      background: getComputedStyle(stage).backgroundColor, transform: `translate3d(${rect.width + PAGE_GAP}px,0,0)`, opacity: '' });
    neighbourImage.style.filter = image.style.filter;
    neighbourLayer.classList.remove('has-image'); neighbourImage.removeAttribute('src'); neighbourNote.textContent = '';
    neighbourLayer.hidden = false; dialog.classList.add('reader-paging');
    return pager;
  }
  // Show the page that belongs on this side (logical +1 next, -1 previous).
  function pagerShowSide(delta) {
    const p = pager; if (!p) return;
    const index = currentPage + delta;
    p.delta = delta; p.index = index; p.exists = index >= 0 && index < book.pageCount; p.ready = false;
    neighbourLayer.classList.remove('has-image'); neighbourImage.removeAttribute('src');
    neighbourNote.textContent = p.exists ? pagerLabels().loading(index + 1) : delta > 0 ? pagerLabels().end : '';
    if (!p.exists) return;
    const entry = decodedEntry(index);
    const apply = candidate => {
      if (pager !== p || p.index !== index) return;
      const place = neighbourPlacement(candidate, rtl() ? -delta : delta); if (!place) return;
      Object.assign(neighbourImage.style, { left: `${place.left}px`, top: `${place.top}px`, width: `${place.width}px`, height: `${place.height}px` });
      neighbourImage.src = candidate.url; neighbourLayer.classList.add('has-image'); p.ready = true;
    };
    if (entry?.candidate) apply(entry.candidate); else entry?.promise.then(apply, () => {});
  }
  function pagerPosition(offset) {
    const p = pager; if (!p) return;
    p.offset = offset;
    stage.style.transform = offset ? `translate3d(${offset}px,0,0)` : '';
    neighbourLayer.style.transform = `translate3d(${offset + (p.physical || 1) * (p.width + PAGE_GAP)}px,0,0)`;
  }
  function pagerDrag(dx) {
    const p = pager; if (!p || p.animating) return;
    // +1: the finger moves left and the page on the right slides in.
    const physical = dx < 0 ? 1 : dx > 0 ? -1 : 0;
    if (physical && physical !== p.physical) { p.physical = physical; pagerShowSide(rtl() ? -physical : physical); }
    pagerPosition(p.exists ? dx : rubberBand(dx, p.width, .55));
  }
  function animateTransform(node, from, to, duration, p) {
    return new Promise(resolve => {
      node.style.transform = `translate3d(${to}px,0,0)`;
      if (reducedMotion() || duration <= 0 || Math.abs(to - from) < .5 || typeof node.animate !== 'function') { resolve(); return; }
      const animation = node.animate([{ transform: `translate3d(${from}px,0,0)` }, { transform: `translate3d(${to}px,0,0)` }], { duration, easing: easeOut });
      p.animations.push(animation);
      animation.onfinish = animation.oncancel = () => resolve();
    });
  }
  async function pagerSettle(p, stageTo, duration) {
    const side = (p.physical || 1) * (p.width + PAGE_GAP);
    await Promise.all([animateTransform(stage, p.offset, stageTo, duration, p), animateTransform(neighbourLayer, p.offset + side, stageTo + side, duration, p)]);
    p.offset = stageTo;
  }
  function pagerFinish(p) {
    if (!p || pager !== p) return;
    for (const animation of p.animations) { try { animation.cancel(); } catch { /* Already finished. */ } }
    stage.style.transform = ''; neighbourLayer.hidden = true; neighbourLayer.style.transform = ''; neighbourLayer.style.opacity = '';
    neighbourLayer.classList.remove('has-image'); neighbourImage.removeAttribute('src');
    dialog.classList.remove('reader-paging'); pager = undefined;
    if (p.animating) { turning = false; updateControls(); }
  }
  function pagerAbort() { if (pager) pagerFinish(pager); }
  async function pagerRelease(dx, vx) {
    const p = pager; if (!p || p.animating) return;
    const decision = decidePageTurn({ dx, vx, width: p.width, resistance: swipeResistance(), direction: rtl() ? 'rtl' : 'ltr' });
    p.animating = true; turning = true; updateControls();
    if (decision && decision === p.delta && p.exists) {
      const to = -(p.physical || 1) * (p.width + PAGE_GAP);
      await pagerSettle(p, to, turnDuration(to - p.offset, vx));
      return pagerComplete(p);
    }
    await pagerSettle(p, 0, turnDuration(p.offset, vx, { min: 180, max: 300 }));
    pagerFinish(p);
    // Pulling past the last page finishes this comic and opens the next one.
    if (decision > 0 && p.delta > 0 && !p.exists && book && currentPage === book.pageCount - 1) void endOfBook();
  }
  // The neighbouring page now fills the screen: make it the current page.
  async function pagerComplete(p) {
    const entry = decodedEntry(p.index);
    try { if (!entry) throw new Error(text().pageFailed); if (!entry.candidate) await entry.promise; }
    catch (error) {
      if (pager !== p) return;
      await pagerSettle(p, 0, 260); pagerFinish(p);
      if (error?.name !== 'AbortError') statusMessage(error?.message || text().pageFailed, true, () => move(p.delta));
      return;
    }
    if (pager !== p) return;
    await showPage(p.index, 0, { pager: true, direction: p.delta });
    if (pager !== p) return;
    // The new page sits exactly where the sliding copy shows it; swap them
    // once it is painted so nothing flickers.
    if (currentPage === p.index && typeof image.decode === 'function') { try { await Promise.race([image.decode(), new Promise(resolve => setTimeout(resolve, 350))]); } catch { /* Shown anyway. */ } }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    pagerFinish(p);
  }
  // Taps, buttons and arrow keys: the same slide, when the page is ready.
  async function pagerTurn(delta) {
    if (!pagerAllowed({ zoomed: true })) return false;
    const entry = decodedEntry(currentPage + delta, { start: false });
    if (!entry?.candidate) return false;
    const p = pagerBegin();
    p.physical = rtl() ? -delta : delta; pagerShowSide(delta); pagerPosition(0);
    p.animating = true; turning = true; updateControls();
    const style = reducedMotion() ? 'none' : pageAnimation();
    if (style === 'slide') await pagerSettle(p, -p.physical * (p.width + PAGE_GAP), pageDuration());
    else {
      neighbourLayer.style.transform = 'translate3d(0,0,0)';
      if (style === 'fade' && typeof neighbourLayer.animate === 'function') {
        await new Promise(resolve => { const fade = neighbourLayer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: pageDuration(), easing: 'ease-out' }); p.animations.push(fade); fade.onfinish = fade.oncancel = () => resolve(); });
      }
    }
    await pagerComplete(p);
    return true;
  }

  // ---- Fingers ----
  function resetGesture() {
    const g = gesture; gesture = undefined;
    if (g && stage.hasPointerCapture?.(g.id)) { try { stage.releasePointerCapture(g.id); } catch { /* Already released. */ } }
    if ((g?.turn === 'drag' || g?.axis === 'strip') && pager && !pager.animating) pagerFinish(pager);
  }
  // A sideways drag on a page wider than the screen: the page slides until its
  // edge shows, then the same movement pulls the neighbouring page in beside it.
  function stripMove(g, dx) {
    const { scroll, offset } = stripDrag({ startScroll: g.stripStart, dx, maxLeft: g.limits.maxLeft });
    renderScroll(scroll, clamp(g.startY, 0, g.limits.maxTop), g.limits);
    if (offset && !pager) pagerBegin();
    if (pager) pagerDrag(offset);
  }
  // 'y' scrolls up and down, 'pan' slides sideways across a wide page, 'free'
  // moves a zoomed page in any direction; past an edge the page stretches.
  function dragScroll(g, event) {
    const lim = g.limits, band = (value, max, size) => value < 0 ? rubberBand(value, size) : value > max ? max + rubberBand(value - max, size) : value;
    const x = g.axis === 'free' || g.axis === 'pan' ? band(g.startX - (event.clientX - g.x0), lim.maxLeft, stage.clientWidth) : clamp(g.startX, 0, lim.maxLeft);
    const y = g.axis === 'pan' ? clamp(g.startY, 0, lim.maxTop) : band(g.startY - (event.clientY - g.y0), lim.maxTop, stage.clientHeight);
    renderScroll(x, y, lim);
  }
  function requestAppFullscreen() {
    // Installed app: if the system bars are still showing, ask once per app
    // launch for true fullscreen (a touch is required for this). It is not left
    // when closing a comic, so the system's notice appears at most once.
    if (installedApp() && !nativeApp() && comic && !appFullscreenAsked && !fullscreenElement() && !fullscreenRequest && fullscreenSupported() && !window.matchMedia?.('(display-mode: fullscreen)').matches) {
      appFullscreenAsked = true;
      try { const request = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); request?.catch?.(() => {}); } catch { /* Not allowed. */ }
    }
  }
  function beginPinch() {
    const g = gesture; gesture = undefined;
    if ((g?.turn === 'drag' || g?.axis === 'strip') && pager && !pager.animating) void pagerRelease(0, 0);
    stopMotion(); clearStretch();
    if (!book || currentPage < 0 || loading || editing || popup || turning || touchPoints.size !== 2) { pinch = undefined; return; }
    const [a, b] = [...touchPoints.values()];
    pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, frame: undefined };
    suppressClicksUntil = performance.now() + 600;
  }
  function updatePinch(event) {
    event.preventDefault();
    if (!pinch || touchPoints.size !== 2 || pinch.frame) return;
    // One zoom step per frame keeps pinching smooth on slower tablets.
    pinch.frame = requestAnimationFrame(() => {
      if (!pinch) return;
      pinch.frame = undefined;
      if (touchPoints.size !== 2) return;
      const [a, b] = [...touchPoints.values()], distance = Math.hypot(a.x - b.x, a.y - b.y) || 1, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const ratio = distance / pinch.distance, pan = { x: mid.x - pinch.mid.x, y: mid.y - pinch.mid.y };
      if (Math.abs(ratio - 1) > .004 || Math.abs(pan.x) + Math.abs(pan.y) > .5) { zoom(ratio, pinch.mid, { anchor: 'finger', pan }); pinch.distance = distance; pinch.mid = mid; }
    });
  }
  function endPinch() {
    if (pinch?.frame) cancelAnimationFrame(pinch.frame);
    pinch = undefined; suppressClicksUntil = performance.now() + 600;
    // Let go smaller than the fitted page: return to the fitted page.
    if (book && currentPage >= 0 && !editing && !loading && pageWidth < baselineWidth() * .98) layoutPage({ keepCenter: true });
  }
  function settleGesture(g) {
    if (g.turn === 'drag' || (g.axis === 'strip' && pager)) void pagerRelease(0, 0); else glide(0, 0);
  }
  // Which way a sideways drag goes on a page wider than the screen.
  function sideways(g, dx) {
    if (pagerAllowed()) { g.axis = 'strip'; g.stripStart = clamp(g.startX, 0, g.limits.maxLeft); clearStretch(); return; }
    if (sideDragAction({ dx, canPan: true, atLeft: g.atLeft, atRight: g.atRight }) === 'pan') g.axis = 'pan';
    else { g.axis = 'x'; g.turn = 'release'; }
  }
  stage.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    activePointers.add(event.pointerId);
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPoints.size >= 2) { if (touchPoints.size === 2) beginPinch(); return; }
    gesture = undefined;
    if (!book || currentPage < 0 || loading || editing || popup || turning || pager) return;
    const now = performance.now(), caughtMoving = Boolean(motion) || Boolean(stretch.x || stretch.y);
    const caught = currentScroll(); stopMotion();
    const limits = scrollLimits();
    // A finger that catches a stretched page continues the stretch smoothly.
    const raw = (value, max, size) => value < 0 ? inverseRubberBand(value, size) : value > max ? max + inverseRubberBand(value - max, size) : value;
    gesture = { id: event.pointerId, x0: event.clientX, y0: event.clientY, t0: now, samples: [{ t: now, x: event.clientX, y: event.clientY }], axis: null, turn: null, distance: 0,
      limits, startX: raw(caught.x, limits.maxLeft, stage.clientWidth), startY: raw(caught.y, limits.maxTop, stage.clientHeight), caught: caughtMoving,
      session: serial, page: pageSerial, panel, guided, overview, scrollLeft: stage.scrollLeft, scrollTop: stage.scrollTop,
      atLeft: caught.x <= 6, atRight: caught.x >= limits.maxLeft - 6, canPanX: slideable() };
  });
  stage.addEventListener('pointermove', event => {
    if (touchPoints.has(event.pointerId)) touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch) { updatePinch(event); return; }
    const g = gesture;
    if (!g || g.id !== event.pointerId) return;
    const now = performance.now(), dx = event.clientX - g.x0, dy = event.clientY - g.y0;
    g.samples.push({ t: now, x: event.clientX, y: event.clientY }); if (g.samples.length > 20) g.samples.shift();
    g.distance = Math.max(g.distance, Math.hypot(dx, dy));
    // A swipe that began with a small vertical wobble is still a page turn:
    // if it soon becomes clearly sideways, undo the scroll and turn instead.
    if (g.axis === 'y' && !g.relocked && now - g.lockedAt < 260 && Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy) * 1.6 && !(isZoomed() || panMode)) {
      g.relocked = true; renderScroll(clamp(g.startX, 0, g.limits.maxLeft), clamp(g.startY, 0, g.limits.maxTop), g.limits); clearStretch();
      if (g.canPanX) sideways(g, dx);
      else { g.axis = 'x'; g.turn = pagerAllowed() ? 'drag' : 'release'; if (g.turn === 'drag') pagerBegin(); }
    }
    if (!g.axis) {
      const zoomed = isZoomed() || panMode;
      const axis = lockAxis({ dx, dy, canScrollY: g.limits.maxTop > 1, zoomed });
      if (!axis) return;
      g.axis = axis; g.lockedAt = now;
      // A page wider than the screen slides across first, then the same drag
      // pulls the neighbouring page in (see stripMove).
      if (axis === 'x' && g.canPanX) sideways(g, dx);
      else if (axis === 'x') g.turn = pagerAllowed() ? 'drag' : 'release';
      // Zoomed in and already at a side: pulling further outwards turns the page.
      if (axis === 'free' && !panMode && Math.abs(dx) > Math.abs(dy) * 1.2 && ((dx > 0 && g.atLeft) || (dx < 0 && g.atRight)) && pagerAllowed({ zoomed: true })) { g.axis = 'x'; g.turn = 'drag'; }
      // Touch pointers already stay with the page (implicit capture). Capturing
      // them again makes the browser report a lost capture, which used to cancel
      // every swipe: the page trembled and sprang back instead of turning.
      if (event.pointerType === 'mouse') { try { stage.setPointerCapture(event.pointerId); } catch { /* Not capturable. */ } }
      if (g.turn === 'drag') pagerBegin();
    }
    event.preventDefault();
    if (g.axis === 'y' || g.axis === 'free' || g.axis === 'pan') dragScroll(g, event);
    else if (g.axis === 'strip') stripMove(g, dx);
    else if (g.axis === 'x' && g.turn === 'drag') pagerDrag(dx);
  });
  function handleTap(g, event, now) {
    const duration = now - g.t0, dx = event.clientX - g.x0, dy = event.clientY - g.y0;
    const unchanged = g.session === serial && g.page === pageSerial && g.panel === panel && g.guided === guided && g.overview === overview && Math.abs(stage.scrollTop - g.scrollTop) < 3;
    const box = stage.getBoundingClientRect(), x = (event.clientX - box.left) / box.width, y = (event.clientY - box.top) / box.height;
    const style = getComputedStyle(stage);
    const inset = edge => Math.max(0, parseFloat(style.getPropertyValue(`--reader-safe-${edge}`)) || 0);
    const insideSafeArea = event.clientX >= box.left + inset('left') && event.clientX <= box.right - inset('right') && event.clientY >= box.top + inset('top') && event.clientY <= box.bottom - inset('bottom');
    const tapDelta = decideTapNavigation({ x, y, dx, dy, distance: g.distance, duration, unchanged: unchanged && Math.abs(stage.scrollLeft - g.scrollLeft) < 3, insideSafeArea,
      zoomed: !swipeAllowed(), panning: panMode, editing, popup: Boolean(popup), loading, analysisPending, multiTouch: activePointers.size > 0, dragging: false });
    if (tapDelta) { event.preventDefault(); suppressClicksUntil = now + 450; void move(tapDelta); return; }
    if (unchanged && !activePointers.size && g.distance < 9 && Math.abs(stage.scrollLeft - g.scrollLeft) < 3 && duration < 400 && !editing && !popup && (x > .25 && x < .75 || (isZoomed() && !guided))) {
      suppressClicksUntil = now + 450;
      // Double tap zooms into that spot (or back to the fitted page); a single
      // tap still shows or hides the controls after a short wait.
      if (lastTap && now - lastTap.time < 300 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 40) {
        clearTimeout(lastTap.timer); lastTap = undefined;
        if (book && currentPage >= 0 && !loading) { if (isZoomed()) layoutPage({ keepCenter: true }); else zoom(2.2, { x: event.clientX, y: event.clientY }); syncGestureMode(); }
        return;
      }
      if (lastTap) clearTimeout(lastTap.timer);
      const centred = y > .15 && y < .85 && x > .25 && x < .75;
      lastTap = { time: now, x: event.clientX, y: event.clientY, timer: setTimeout(() => { lastTap = undefined; if (centred) setImmersive(!immersive); }, 300) };
    }
  }
  stage.addEventListener('pointerup', event => {
    touchPoints.delete(event.pointerId); activePointers.delete(event.pointerId);
    if (pinch) { if (touchPoints.size < 2) endPinch(); return; }
    requestAppFullscreen();
    const g = gesture;
    if (!g || g.id !== event.pointerId) return;
    gesture = undefined;
    try { if (stage.hasPointerCapture?.(event.pointerId)) stage.releasePointerCapture(event.pointerId); } catch { /* Already released. */ }
    const now = performance.now(), velocity = releaseVelocity(g.samples, now), dx = event.clientX - g.x0;
    if (g.axis === 'y' || g.axis === 'free' || g.axis === 'pan') { suppressClicksUntil = now + 450; glide(g.axis === 'y' ? 0 : -velocity.x, g.axis === 'pan' ? 0 : -velocity.y); return; }
    if (g.axis === 'strip') {
      suppressClicksUntil = now + 600;
      // Pulled past the page's edge: turn, or spring back to the edge.
      if (pager?.offset) { void pagerRelease(pager.offset, velocity.x); return; }
      if (pager) pagerFinish(pager);
      glide(-velocity.x, 0); return;
    }
    if (g.axis === 'x') {
      suppressClicksUntil = now + 600;
      if (g.turn === 'drag') { void pagerRelease(dx, velocity.x); return; }
      // Panel view: a swipe moves to the next or previous panel.
      const unchanged = g.session === serial && g.page === pageSerial && g.panel === panel && g.guided === guided && g.overview === overview;
      const delta = unchanged && swipeAllowed() ? decidePageTurn({ dx, vx: velocity.x, width: stage.clientWidth, resistance: swipeResistance(), direction: rtl() ? 'rtl' : 'ltr' }) : 0;
      if (delta) void move(delta);
      return;
    }
    if (g.axis === 'none') { suppressClicksUntil = now + 450; return; }
    // A tap. Touching a gliding page only stops it, like on iOS.
    if (g.caught) { suppressClicksUntil = now + 450; glide(0, 0); return; }
    handleTap(g, event, now);
  });
  stage.addEventListener('pointercancel', event => {
    touchPoints.delete(event.pointerId); activePointers.delete(event.pointerId);
    if (pinch) { if (touchPoints.size < 2) endPinch(); return; }
    const g = gesture; if (!g || g.id !== event.pointerId) return;
    gesture = undefined; suppressClicksUntil = performance.now() + 600; settleGesture(g);
  });
  // A finger lifted outside the page (without capture) still ends its gesture.
  const forgetPointer = event => {
    if (!touchPoints.has(event.pointerId)) return;
    touchPoints.delete(event.pointerId); activePointers.delete(event.pointerId);
    if (pinch && touchPoints.size < 2) endPinch();
    const g = gesture; if (g?.id === event.pointerId) { gesture = undefined; settleGesture(g); }
  };
  window.addEventListener('pointerup', forgetPointer); window.addEventListener('pointercancel', forgetPointer);
  window.addEventListener('blur', () => { touchPoints.clear(); activePointers.clear(); cancelledPointers.clear(); closeIntent = undefined; if (pinch?.frame) cancelAnimationFrame(pinch.frame); pinch = undefined; resetGesture(); });
  dialog.addEventListener('pointerdown', event => {
    if (event.isPrimary !== false) suppressClicksUntil = 0;
    if (event.target.closest?.('#reader-close') && event.isPrimary !== false && (event.pointerType !== 'mouse' || event.button === 0)) closeIntent = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
    else closeIntent = undefined;
  }, true);
  dialog.addEventListener('click', event => {
    if (event.detail > 0 && performance.now() < suppressClicksUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  function teardown({ closeDialog = true, notifyChange = true } = {}) {
    navigationTimer.reset(); navigationSessionShown = false; navigationPointerFocus = false; slideHintShown = false;
    const wasReading = Boolean(comic);
    if (comic && book && currentPage >= 0) persist(false, { observe: false });
    clearTimeout(persistenceTimer); persistenceTimer = undefined;
    if (wasReading) observePersistence({ immediate: true });
    const warning = storageWarning;
    serial++; pageSerial++; pageTransition.cancel(); turning = false; overview = false; guidedMode = 'whole'; cancelAnalysis(); cancelCamera(); cancelPrefetch(); pageController?.abort(); sessionController?.abort();
    pageController = sessionController = undefined;
    book?.close(); book = undefined; rangeBuffer?.clear(); rangeBuffer = undefined;
    comic = undefined; currentPage = -1; panel = 0; guidedFallbackPage = -1; positionCommitted = false; loading = false; editing = false; panMode = false; resumeButton.hidden = true; pointer = undefined; draft = [];
    clearTimeout(restoreTimer); clearTimeout(hintTimer); clearTimeout(thumbSeedTimer); thumbSeedTimer = undefined; fitHint.hidden = true; hidePopup(); resetGesture(); pagerAbort(); stopMotion(); clearStretch(); clearDecoded(); touchPoints.clear(); activePointers.clear(); cancelledPointers.clear(); closeIntent = undefined; dialog.classList.remove('editing-panels', 'reader-immersive', 'reader-loading', 'reader-error', 'reader-controls-sleeping', 'reader-fit-fill', 'reader-panning', 'reader-guided', 'reader-guided-moving'); immersive = false; restoreButton.hidden = true;
    overlay.replaceChildren(); overlay.classList.remove('editing');
    image.removeAttribute('src'); showImage(false); imageWidth = imageHeight = pageWidth = 0;
    wrap.style.removeProperty('width'); wrap.style.removeProperty('min-height'); wrap.style.removeProperty('margin-top');
    if (currentURL) URL.revokeObjectURL(currentURL); currentURL = undefined;
    for (const url of pendingURLs) URL.revokeObjectURL(url); pendingURLs.clear();
    storageWarning = ''; lastStatus = ''; errorStatus = false; retryPage = undefined; status.replaceChildren();
    if (closeDialog && dialog.open) dialog.close();
    if (closeDialog && fullscreenOwned && fullscreenElement() === fullscreenTarget) exitFullscreen();
    if (closeDialog) fullscreenOwned = false;
    if (warning && closeDialog) {
      const toast = document.getElementById('toast');
      if (toast) { toast.textContent = warning; toast.hidden = false; setTimeout(() => { if (toast.textContent === warning) toast.hidden = true; }, 7000); }
    }
    activity(false, false); if (notifyChange) notify();
  }

  buttons.close.addEventListener('click', event => {
    // A drag ending over a newly revealed button is not an exit intent.
    // detail=0 preserves keyboard and assistive-technology activation.
    const intentionalPointer = closeIntent && performance.now() - closeIntent.time < 1500 && Math.hypot(event.clientX - closeIntent.x, event.clientY - closeIntent.y) < 10;
    closeIntent = undefined;
    if (event.detail > 0 && !intentionalPointer) { event.preventDefault(); return; }
    teardown();
  });
  buttons.prev.addEventListener('click', () => move(-1)); buttons.next.addEventListener('click', () => move(1));
  quickButtons.prev.addEventListener('click', () => { navigationTimer.reveal(); move(-1); });
  quickButtons.next.addEventListener('click', () => { navigationTimer.reveal(); move(1); });
  // Pointer focus or a hovering cursor must not pin controls over the art.
  quickNavigation.addEventListener('pointerdown', () => { navigationPointerFocus = true; navigationTimer.setKeyboardFocused(false); });
  dialog.addEventListener('keydown', () => { navigationPointerFocus = false; }, true);
  const keyboardNavigationFocus = () => navigationTimer.setKeyboardFocused(!navigationPointerFocus && Boolean(quickNavigation.querySelector(':focus-visible')));
  quickNavigation.addEventListener('focusin', keyboardNavigationFocus);
  quickNavigation.addEventListener('focusout', () => queueMicrotask(keyboardNavigationFocus));
  quickNavigation.addEventListener('keydown', keyboardNavigationFocus);
  buttons.finish.addEventListener('click', markRead);
  buttons['zoom-in'].addEventListener('click', () => zoom(1.3)); buttons['zoom-out'].addEventListener('click', () => zoom(1 / 1.3));
  buttons.fit.addEventListener('click', chooseFitMode); fillButton.addEventListener('click', () => selectFitMode('fill'));
  featureButtons.navigate.addEventListener('click', chooseNavigator);
  featureButtons.bookmarks.addEventListener('click', chooseBookmarks);
  featureButtons.appearance.addEventListener('click', chooseAppearance);
  panButton.addEventListener('click', () => setPanMode(!panMode)); resumeButton.addEventListener('click', () => setPanMode(false));
  restoreButton.addEventListener('focus', wakeRestore); restoreButton.addEventListener('pointerover', wakeRestore);
  restoreButton.addEventListener('blur', wakeRestore); restoreButton.addEventListener('pointerleave', wakeRestore);
  immersiveButton.addEventListener('click', () => { setImmersive(!immersive, { requestScreen: !immersive }); persist(); updateControls(); });
  restoreButton.addEventListener('click', () => { setImmersive(false); stage.focus({ preventScroll: true }); });
  fullscreenButton.addEventListener('click', () => {
    setImmersive(true);
    if (fullscreenElement()) exitFullscreen(); else ensureFullscreen();
  });
  buttons.guided.addEventListener('click', () => {
    if (!book || loading || currentPage < 0) return;
    if (guided) disableGuided(); else void enableGuided();
  });
  buttons['edit-panels'].addEventListener('click', choosePanelOptions);
  input.addEventListener('change', () => {
    if (!book || loading || editing) return;
    const value = Number(input.value);
    if (!Number.isFinite(value) || !input.value.trim()) { input.value = String(currentPage + 1); return; }
    void showPage(clamp(Math.floor(value) - 1, 0, book.pageCount - 1)); input.blur();
  });
  function dismissReaderControls(event) {
    event.preventDefault();
    if (editing) finishEditing();
    else if (popup) { hidePopup(); updateControls(); normalStatus(); }
    else { setImmersive(false); wakeRestore(); }
  }
  dialog.addEventListener('cancel', dismissReaderControls);
  dialog.addEventListener('close', () => {
    if (dialog.open || !comic) return;
    const mySession = serial;
    // An unexpected native dismissal keeps the book, decoded page and progress
    // in this same session. Explicit Library/close() clear comic before closing.
    requestAnimationFrame(() => {
      if (serial !== mySession || !comic || dialog.open) return;
      try { dialog.showModal(); setImmersive(false); syncViewport(); stage.focus({ preventScroll: true }); }
      catch { /* Navigation away may make the document temporarily inactive. */ }
    });
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { if (fullscreenElement()) exitFullscreen(); dismissReaderControls(event); event.stopPropagation(); return; }
    if (popup && event.key === 'Tab') {
      const focusable = [...popup.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]')].filter(node => !node.hidden);
      const first = focusable[0], last = focusable.at(-1);
      if (first && (event.shiftKey && (document.activeElement === first || !popup.contains(document.activeElement)))) { event.preventDefault(); last.focus(); }
      else if (last && !event.shiftKey && (document.activeElement === last || !popup.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      return;
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.ctrlKey || event.altKey || event.metaKey) return;
    let delta;
    if (event.key === 'ArrowLeft') delta = rtl() ? 1 : -1;
    else if (event.key === 'ArrowRight') delta = rtl() ? -1 : 1;
    else if (event.key === 'PageDown' || (event.key === ' ' && event.target === stage)) { event.preventDefault(); void move(1, { stepScroll: true }); return; }
    else if (event.key === 'PageUp') { event.preventDefault(); void move(-1, { stepScroll: true }); return; }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.3); }
    else if (event.key === '-') { event.preventDefault(); zoom(1 / 1.3); }
    if (delta) { event.preventDefault(); void move(delta); }
  });
  window.addEventListener('resize', syncViewport); window.addEventListener('orientationchange', syncViewport);
  window.visualViewport?.addEventListener('resize', syncViewport);
  const fullscreenChanged = () => {
    if (fullscreenRequest && fullscreenElement() === fullscreenTarget) finishFullscreenRequest(fullscreenRequest);
    if (!fullscreenElement()) fullscreenOwned = false;
    // Full screen puts the whole app on top of the open reader, which then
    // looked like the library and ignored every touch. Bring the reader back
    // to the front (its own close handler ignores this immediate reopen).
    const owner = fullscreenElement();
    if (owner && dialog.open && owner !== dialog && owner.contains(dialog)) { try { dialog.close(); dialog.showModal(); stage.focus({ preventScroll: true }); } catch { /* Kept as it is. */ } }
    syncViewport();
  };
  document.addEventListener('fullscreenchange', fullscreenChanged); document.addEventListener('webkitfullscreenchange', fullscreenChanged);
  const fullscreenFailed = () => { if (fullscreenRequest) finishFullscreenRequest(fullscreenRequest, true); };
  document.addEventListener('fullscreenerror', fullscreenFailed); document.addEventListener('webkitfullscreenerror', fullscreenFailed);
  window.addEventListener('pagehide', () => { if (comic) { persist(false, { observe: false }); observePersistence({ immediate: true }); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && comic) { cancelPrefetch(); persist(false, { observe: false }); observePersistence({ immediate: true }); } else if (comic) schedulePrefetch(); });

  const controller = {
    async open(value, source, { fromStart = false } = {}) {
      teardown({ closeDialog: false, notifyChange: false });
      comic = value; sessionController = new AbortController();
      const mySerial = serial, currentSession = sessionController;
      const saved = fromStart ? undefined : store.state.progress[value.id]; overview = false; guided = Boolean(store.state.settings.readerGuided); panel = saved?.panel || 0;
      localize(); element('reader-title').textContent = value.metadata?.title || value.name || 'CloudPanels';
      loading = true; currentPage = -1; updateControls(); showImage(false);
      const pdf = /\.pdf$/i.test(source.name || value.name); statusMessage(pdf ? text().loadingPdf : text().loading);
      if (!dialog.open) dialog.showModal(); setImmersive(true); syncViewport(); activity(true, true); stage.focus({ preventScroll: true });
      const budget = clamp(Number(store.state.settings.cacheMiB) || 64, 16, 256) * MiB;
      rangeBuffer = new ReadingRangeBuffer(source, budget, currentSession.signal);
      try {
        const opened = await openComic({ name: source.name || value.name, size: source.size, blob: source.blob, readFresh: source.read?.bind(source),
          read: rangeBuffer.read.bind(rangeBuffer) }, { signal: currentSession.signal,
          onProgress: info => { if (mySerial !== serial || !loading) return;
            if (info.phase === 'download' && info.total > 8 * MiB) statusMessage(text().downloading(Math.floor(info.loaded / info.total * 100)));
            else if (info.phase === 'extract') statusMessage(text().extracting);
            else if (info.phase === 'index') statusMessage(text().indexing); } });
        if (mySerial !== serial || currentSession.signal.aborted) { opened.close(); return; }
        book = opened;
        // Supplement missing fields without overwriting the user's corrections.
        const additions = {}, metadata = value.metadata || {};
        for (const name of ['publisher', 'volume', 'issue', 'year']) if (!metadata[name] && opened.metadata?.[name]) additions[name] = opened.metadata[name];
        if (!metadata.characters?.length && opened.metadata?.characters) additions.characters = String(opened.metadata.characters).split(/[,;]/).map(s => s.trim()).filter(Boolean);
        if (Object.keys(additions).length) { store.updateComic(value.id, additions); checkSaved(); }
        await showPage(clamp(saved?.page || 0, 0, opened.pageCount - 1), saved?.panel || 0, { targetOverview: Boolean(saved?.overview) });
        // Page-by-page formats (CBZ, images) continue downloading the rest of
        // the comic into temporary memory, so the following pages open at once.
        if (opened.type === 'cbz' && mySerial === serial) void rangeBuffer.loadWhole().then(done => { if (done && book === opened) schedulePrefetch(); });
      } catch (error) {
        if (mySerial !== serial || currentSession.signal.aborted) return;
        loading = false; updateControls();
        const message = error?.message || text().failed;
        statusMessage(message, true); throw error;
      }
    },
    close() { teardown(); },
    // Closing also releases PDF worker/document memory and the current page,
    // rather than merely emptying a counter while decoded pages remain alive.
    clearBuffer() { teardown(); },
    get bufferedBytes() { return (rangeBuffer?.bytes || 0) + (rangeBuffer?.wholeBytes || 0) + (book?.bufferedBytes || 0); },
  };
  return controller;
}
