const STYLES = new Set(['slide', 'fade', 'none']);
const DURATIONS = new Set([240, 420, 650]);

/**
 * A single bounded outgoing image layer. Capture before replacing the page and
 * play only after the incoming image has decoded and its layout is committed.
 * Capture mounts the outgoing layer immediately, covering incoming analysis/layout.
 * The caller owns image URLs and must retain the captured URL until play settles.
 * No canvas copy, controls, panel editor or additional comic data is retained.
 */
export function createPageTransition({ stage, wrap, image, overlay,
  reducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!stage || !wrap || !image) throw new Error('Page transitions need the reader stage and image.');
  let pending, running;
  const computed = node => node.ownerDocument.defaultView.getComputedStyle(node);
  function remove(snapshot) { snapshot?.layer.remove(); }
  function finish(run, completed) {
    if (running !== run) return;
    running = undefined;
    if (run.timer !== undefined) clearTimer(run.timer);
    // Cancel removes the Web Animation effect without changing reader drag or
    // camera styles. A later completion from an older animation is ignored.
    for (const animation of run.animations) { try { animation.cancel(); } catch { /* Already removed. */ } }
    remove(run.snapshot); run.resolve(completed);
  }
  function cancel() {
    if (running) finish(running, false);
    remove(pending); pending = undefined;
  }
  function capture() {
    cancel();
    const source = image.currentSrc || image.getAttribute('src');
    if (!source || image.hidden || image.style.display === 'none') return null;
    const bounds = stage.getBoundingClientRect(), page = image.getBoundingClientRect();
    if (![bounds.width, bounds.height, page.width, page.height].every(value => Number.isFinite(value) && value > 0)) return null;
    const doc = image.ownerDocument, layer = doc.createElement('div'), copy = doc.createElement('img');
    layer.className = 'reader-page-transition'; layer.setAttribute('aria-hidden', 'true');
    Object.assign(layer.style, { position: 'fixed', left: `${bounds.left}px`, top: `${bounds.top}px`,
      width: `${bounds.width}px`, height: `${bounds.height}px`, overflow: 'hidden', pointerEvents: 'none',
      zIndex: '2', margin: '0', padding: '0', background: computed(stage).background,
      contain: 'layout paint', willChange: 'transform, opacity' });
    copy.alt = ''; copy.draggable = false; copy.src = source;
    Object.assign(copy.style, { position: 'absolute', left: `${page.left - bounds.left}px`, top: `${page.top - bounds.top}px`,
      width: `${page.width}px`, height: `${page.height}px`, display: 'block', maxWidth: 'none', maxHeight: 'none',
      margin: '0', padding: '0', border: '0', filter: computed(image).filter, pointerEvents: 'none' });
    layer.append(copy);
    // Guided reading hides adjacent artwork with a read-only focus shadow.
    // Recreate only that bounded mask, never editor rectangles or their labels.
    const focus = overlay?.querySelector?.('.panel-focus');
    if (focus) {
      const focusBounds = focus.getBoundingClientRect(), focusStyle = computed(focus);
      if (focusStyle.display !== 'none' && focusStyle.visibility !== 'hidden' &&
          [focusBounds.left, focusBounds.top, focusBounds.width, focusBounds.height].every(Number.isFinite) &&
          focusBounds.width > 0 && focusBounds.height > 0) {
        const mask = doc.createElement('div'); mask.className = 'reader-page-transition-focus';
        Object.assign(mask.style, { position: 'absolute', left: `${focusBounds.left - bounds.left}px`, top: `${focusBounds.top - bounds.top}px`,
          width: `${focusBounds.width}px`, height: `${focusBounds.height}px`, boxSizing: focusStyle.boxSizing || 'border-box',
          margin: '0', padding: '0', border: focusStyle.border, borderRadius: focusStyle.borderRadius,
          boxShadow: focusStyle.boxShadow, background: focusStyle.background, opacity: focusStyle.opacity, pointerEvents: 'none' });
        layer.append(mask);
      }
    }
    pending = { layer, bounds: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height } };
    // Mount before the incoming image/layout is committed so its intermediate
    // whole-page view or panel analysis never flashes through.
    (stage.parentElement || stage).append(layer);
    return pending;
  }
  async function play({ snapshot, style = 'slide', duration = 420, direction = 1 } = {}) {
    // A stale caller cannot cancel a newer page's transition or layer.
    if (!snapshot || snapshot !== pending) return false;
    if (running) finish(running, false);
    pending = undefined;
    style = STYLES.has(style) ? style : 'slide'; duration = DURATIONS.has(duration) ? duration : 420;
    const bounds = stage.getBoundingClientRect(), oldBounds = snapshot.bounds;
    const resized = ['left', 'top', 'width', 'height'].some(key => Math.abs(bounds[key] - oldBounds[key]) > 1);
    if (style === 'none' || reducedMotion() || resized || typeof wrap.animate !== 'function' || typeof snapshot.layer.animate !== 'function') {
      remove(snapshot); return false;
    }
    // Capture already placed the layer inside the dialog's top layer.
    return new Promise(resolve => {
      const run = { snapshot, resolve, animations: [], timer: undefined }; running = run;
      const options = { duration, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both' };
      const animate = (node, frames) => {
        const animation = node.animate(frames, options);
        run.animations.push(animation);
        // A later animate() call can throw. Handle this promise immediately so
        // cancellation of an already-started effect cannot reject unobserved.
        void animation.finished?.catch?.(() => {});
      };
      try {
        if (style === 'fade') {
          animate(wrap, [{ opacity: 0 }, { opacity: 1 }]);
          animate(snapshot.layer, [{ opacity: 1 }, { opacity: 0 }]);
        } else {
          const sign = direction < 0 ? -1 : 1, distance = bounds.width * sign;
          const base = computed(wrap).transform;
          const withBase = x => `translate3d(${x}px, 0, 0)${base && base !== 'none' ? ` ${base}` : ''}`;
          animate(wrap, [{ transform: withBase(distance) }, { transform: withBase(0) }]);
          animate(snapshot.layer, [{ transform: 'translate3d(0, 0, 0)' }, { transform: `translate3d(${-distance}px, 0, 0)` }]);
        }
        run.timer = setTimer(() => finish(run, true), duration + 120);
        if (run.animations.every(animation => typeof animation.finished?.then === 'function')) {
          void Promise.all(run.animations.map(animation => animation.finished)).then(
            () => finish(run, true), () => finish(run, false));
        }
      } catch { finish(run, false); }
    });
  }
  return { capture, play, cancel, get active() { return Boolean(running); } };
}
