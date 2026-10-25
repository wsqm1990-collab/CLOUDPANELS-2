/** A reveal-only timer: rendering and availability updates never show controls. */
export function createReaderNavigationTimer({ onChange = () => {}, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let available = false, seconds = 3, visible = false, keyboardFocused = false, timer, generation = 0;
  function cancel() {
    generation++;
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
  }
  function show(value) {
    if (visible === value) return;
    visible = value; onChange(visible);
  }
  function arm() {
    cancel();
    if (!visible || keyboardFocused) return;
    const current = generation;
    timer = setTimer(() => {
      if (generation !== current) return;
      timer = undefined; show(false);
    }, seconds * 1000);
  }
  return {
    update({ available: nextAvailable, seconds: nextSeconds } = {}) {
      const normalized = [0, 3, 5, 8].includes(nextSeconds) ? nextSeconds : 3;
      const changed = seconds !== normalized;
      available = Boolean(nextAvailable); seconds = normalized;
      if (!available || seconds === 0) { keyboardFocused = false; cancel(); show(false); }
      else if (changed && visible) arm();
    },
    reveal() {
      if (!available || seconds === 0) return;
      show(true); arm();
    },
    setKeyboardFocused(value) {
      value = Boolean(value);
      if (keyboardFocused === value) return;
      keyboardFocused = value;
      if (visible) arm();
    },
    reset() {
      available = false; keyboardFocused = false; cancel(); show(false);
    },
    get visible() { return visible; },
  };
}
