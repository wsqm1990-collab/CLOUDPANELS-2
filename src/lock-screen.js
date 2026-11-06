// The lock screen for listening (read aloud): the screen stays on but black,
// and touches do nothing, so the phone can go into a pocket while the story
// is read. To the phone the app is still in front, so it is never put to
// sleep or cut off from the internet (unlike turning the screen off).
// Holding a finger on it for two seconds unlocks it.

/**
 * `parent`: where the lock screen goes (above everything in it).
 * `onUnlock()`: called once it is unlocked by holding.
 */
export function createLockScreen({ parent, hold = 2000, drift = 45000, onUnlock = () => {}, doc = globalThis.document, setTimer = (f, ms) => setTimeout(f, ms), clearTimer = id => clearTimeout(id) } = {}) {
  const root = doc.createElement('div'); root.className = 'reader-lock'; root.id = 'reader-lock'; root.hidden = true;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
  const info = doc.createElement('div'); info.className = 'reader-lock-info';
  const title = doc.createElement('p'), status = doc.createElement('p'), hint = doc.createElement('p');
  title.className = 'reader-lock-title'; status.className = 'reader-lock-status'; hint.className = 'reader-lock-hint';
  info.append(title, status, hint);
  // The ring that fills while a finger is held.
  const ns = 'http://www.w3.org/2000/svg', ring = doc.createElementNS(ns, 'svg'), track = doc.createElementNS(ns, 'circle'), fill = doc.createElementNS(ns, 'circle');
  ring.setAttribute('class', 'reader-lock-ring'); ring.setAttribute('viewBox', '0 0 80 80'); ring.setAttribute('aria-hidden', 'true');
  for (const circle of [track, fill]) { circle.setAttribute('cx', '40'); circle.setAttribute('cy', '40'); circle.setAttribute('r', '34'); }
  track.setAttribute('class', 'reader-lock-ring-track'); fill.setAttribute('class', 'reader-lock-ring-fill');
  ring.append(track, fill);
  root.append(info, ring);
  parent.append(root);

  let locked = false, holding = null, holdTimer, driftTimer;
  const stop = event => { event.stopPropagation(); if (event.cancelable) event.preventDefault(); };
  function cancelHold() {
    if (holdTimer !== undefined) { clearTimer(holdTimer); holdTimer = undefined; }
    holding = null; root.classList.remove('reader-lock-holding');
  }
  function startHold(event) {
    // A second finger (or the pocket's fabric) cancels: only one steady finger unlocks.
    if (holding) { cancelHold(); return; }
    holding = { id: event.pointerId, x: event.clientX, y: event.clientY };
    ring.style.left = `${event.clientX}px`; ring.style.top = `${event.clientY}px`;
    root.classList.remove('reader-lock-holding'); void ring.getBoundingClientRect?.(); root.classList.add('reader-lock-holding');
    holdTimer = setTimer(() => { holdTimer = undefined; if (holding) { cancelHold(); unlock(); onUnlock(); } }, hold);
  }
  root.addEventListener('pointerdown', event => { stop(event); if (locked) startHold(event); });
  root.addEventListener('pointermove', event => {
    stop(event);
    if (holding && event.pointerId === holding.id && Math.hypot(event.clientX - holding.x, event.clientY - holding.y) > 24) cancelHold();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) root.addEventListener(type, event => { stop(event); if (!holding || event.pointerId === holding.id) cancelHold(); });
  for (const type of ['click', 'dblclick', 'contextmenu', 'wheel', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'mouseup', 'gesturestart'])
    root.addEventListener(type, stop, { passive: false });
  // Now and then the words move, so they never mark the screen.
  function move() {
    if (!locked) return;
    info.style.left = `${8 + Math.random() * 40}%`; info.style.top = `${14 + Math.random() * 58}%`;
    driftTimer = setTimer(move, drift);
  }
  function unlock() {
    if (!locked) return;
    locked = false; cancelHold();
    if (driftTimer !== undefined) { clearTimer(driftTimer); driftTimer = undefined; }
    root.hidden = true;
  }
  return {
    get locked() { return locked; },
    get element() { return root; },
    /** Locks; `words` as in `update`. */
    lock({ words = {} } = {}) {
      this.update(words);
      if (!locked) { locked = true; root.hidden = false; move(); }
    },
    /** `title`, `status` (page, finished…) and `hint` (how to unlock). */
    update({ title: heading, status: line, hint: help } = {}) {
      if (heading !== undefined) title.textContent = heading;
      if (line !== undefined) status.textContent = line;
      if (help !== undefined) hint.textContent = help;
    },
    unlock,
    destroy() { unlock(); root.remove(); },
  };
}
