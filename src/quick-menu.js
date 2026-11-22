// Quick menu (optional, off at first): a tap with two fingers at once on the page opens a
// small menu of big buttons for the reader's most used features, chosen by the reader.
// Nothing here touches the screen: the reader shows the menu and runs the buttons.

/** The features the quick menu can hold, in the order they are shown. */
export const QUICK_ACTIONS = Object.freeze(['guided', 'enlarge', 'steps', 'listen', 'navigator', 'options', 'bookmarks', 'appearance', 'translate', 'immersive', 'fullscreen']);
/** Those in it at first. */
export const QUICK_DEFAULT = Object.freeze(['guided', 'enlarge', 'steps', 'listen', 'navigator', 'options']);
/** At most this many (two columns of four on a phone). */
export const QUICK_MAX = 8;

/** A kept choice of buttons: known ones only, once each, in the menu's order, at most QUICK_MAX (not a list: the first choice). */
export function quickActions(value) {
  if (!Array.isArray(value)) return [...QUICK_DEFAULT];
  const chosen = new Set(value.filter(item => typeof item === 'string'));
  return QUICK_ACTIONS.filter(action => chosen.has(action)).slice(0, QUICK_MAX);
}

/** A button switched on or off in the choice (none past QUICK_MAX). */
export function toggleQuickAction(list, action) {
  const now = quickActions(list);
  if (!QUICK_ACTIONS.includes(action)) return now;
  if (now.includes(action)) return now.filter(item => item !== action);
  return now.length >= QUICK_MAX ? now : quickActions([...now, action]);
}

/**
 * Whether two fingers that touched and let go were a tap (not a pinch or a drag): quick, the
 * fingers kept as far apart as they were, and staying where they were (in CSS pixels).
 */
export function twoFingerTap({ duration, spread, travel } = {}) {
  return [duration, spread, travel].every(Number.isFinite) && duration >= 0 && duration < 450 && Math.abs(spread) < 28 && travel < 28;
}
