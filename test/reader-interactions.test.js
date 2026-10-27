import test from 'node:test';
import assert from 'node:assert/strict';
import { wholePageFit, pageFit, guidedPanelFit, guidedPanelMargin, resolvePanelIndex, canSwipePages, decideSwipe, decideTapNavigation } from '../src/reader-interactions.js';

test('a portrait comic fits entirely inside a short landscape viewport', () => {
  const result = wholePageFit({ imageWidth: 1800, imageHeight: 2700, availableWidth: 1000, availableHeight: 600 });
  assert.deepEqual(result, { width: 400, height: 600 });
});

test('a wide spread preserves both outer edges on a narrow phone screen', () => {
  const result = wholePageFit({ imageWidth: 3000, imageHeight: 1500, availableWidth: 390, availableHeight: 740 });
  assert.deepEqual(result, { width: 390, height: 195 });
});

test('fractional viewport sizes cannot create a cropped or scrollable extra pixel', () => {
  for (const [imageWidth, imageHeight] of [[2047, 3191], [3191, 2047], [4032, 3024], [3024, 4032]]) {
    for (const [availableWidth, availableHeight] of [[389.667, 683.333], [683.333, 389.667], [819.2, 1064.8]]) {
      const fit = wholePageFit({ imageWidth, imageHeight, availableWidth, availableHeight });
      assert.ok(fit.width <= availableWidth && fit.height <= availableHeight);
      assert.ok(Math.abs(fit.width / fit.height - imageWidth / imageHeight) < 1e-12);
      assert.ok(Math.abs(fit.width - availableWidth) < 1e-10 || Math.abs(fit.height - availableHeight) < 1e-10);
    }
  }
});

test('an unavailable viewport yields no invalid page size', () => {
  for (const invalid of [0, -1, NaN, Infinity, undefined]) {
    assert.deepEqual(wholePageFit({ imageWidth: 1000, imageHeight: 1500, availableWidth: invalid, availableHeight: 500 }), { width: 0, height: 0 });
  }
});

test('a screenshot-shaped tall phone distinguishes whole page letterboxing from actual fill', () => {
  const dimensions = { imageWidth: 691, imageHeight: 1064, availableWidth: 691, availableHeight: 1536 };
  assert.deepEqual(pageFit(dimensions), { width: 691, height: 1064 });
  const fill = pageFit({ ...dimensions, mode: 'fill' });
  assert.equal(fill.height, 1536); assert.ok(fill.width > 990 && fill.width < 1000);
  assert.ok(Math.abs(fill.width / fill.height - 691 / 1064) < 1e-12, 'filling does not stretch the artwork');
  const maxScroll = fill.width - dimensions.availableWidth;
  assert.ok(maxScroll > 300, 'horizontal excess is a positive scroll range');
});

test('filling a rotated wide page preserves a reachable vertical overflow range', () => {
  const dimensions = { imageWidth: 1800, imageHeight: 2700, availableWidth: 1024, availableHeight: 600 };
  const fill = pageFit({ ...dimensions, mode: 'fill' });
  assert.equal(fill.width, 1024); assert.equal(fill.height, 1536);
  assert.ok(fill.height > dimensions.availableHeight, 'fill requires vertical panning in this orientation');
  assert.ok(pageFit({ ...dimensions, mode: 'whole' }).height <= dimensions.availableHeight);
});

test('fractional fill geometry covers both extents without changing the image aspect ratio', () => {
  const dimensions = { imageWidth: 1333, imageHeight: 2000, availableWidth: 393.25, availableHeight: 851.75 };
  const fill = pageFit({ ...dimensions, mode: 'fill' });
  assert.ok(fill.width >= dimensions.availableWidth && fill.height >= dimensions.availableHeight);
  assert.ok(Math.abs(fill.width / fill.height - 1333 / 2000) < 1e-12);
});

test('width fitting keeps a tall comic readable at full viewport width with vertical overflow', () => {
  const dimensions = { imageWidth: 1800, imageHeight: 2700, availableWidth: 1024, availableHeight: 600 };
  const whole = pageFit(dimensions), width = pageFit({ ...dimensions, mode: 'width' });
  assert.deepEqual(whole, { width: 400, height: 600 });
  assert.deepEqual(width, { width: 1024, height: 1536 });
  assert.equal(width.height - dimensions.availableHeight, 936, 'the remaining artwork can be reached by vertical scrolling');
  assert.equal(width.width / width.height, dimensions.imageWidth / dimensions.imageHeight);
});

test('width fitting a wide spread does not stretch it to the tall viewport height', () => {
  const dimensions = { imageWidth: 3000, imageHeight: 1500, availableWidth: 390, availableHeight: 850 };
  assert.deepEqual(pageFit({ ...dimensions, mode: 'width' }), { width: 390, height: 195 });
  const fill = pageFit({ ...dimensions, mode: 'fill' });
  assert.equal(fill.height, 850); assert.equal(fill.width, 1700);
});

test('width fitting is independent of viewport height and preserves fractional width exactly', () => {
  const dimensions = { imageWidth: 1333, imageHeight: 2000, availableWidth: 393.25, mode: 'width' };
  const reference = pageFit({ ...dimensions, availableHeight: 851.75 });
  for (const availableHeight of [200, 1200, 0, undefined]) assert.deepEqual(pageFit({ ...dimensions, availableHeight }), reference);
  assert.equal(reference.width, 393.25);
  assert.ok(Math.abs(reference.width / reference.height - 1333 / 2000) < 1e-12);
  assert.deepEqual(pageFit({ ...dimensions, availableWidth: 0 }), { width: 0, height: 0 });
});

test('width fit is a swipe baseline rather than an implicit manual zoom', () => {
  const dimensions = { imageWidth: 1800, imageHeight: 2700, availableWidth: 1024, availableHeight: 600 };
  const width = pageFit({ ...dimensions, mode: 'width' });
  assert.ok(width.width > pageFit(dimensions).width * 2);
  assert.equal(canSwipePages({ pageWidth: width.width, baselineWidth: width.width }), true);
  assert.equal(canSwipePages({ pageWidth: width.width * 1.3, baselineWidth: width.width }), false);
  assert.equal(canSwipePages({ pageWidth: width.width, baselineWidth: width.width, browserScale: 1.2 }), false);
});

test('slow deliberate page drags navigate in either reading direction', () => {
  const swipe = { dx: -260, dy: 12, duration: 700, width: 600 };
  assert.equal(decideSwipe(swipe), 1);
  assert.equal(decideSwipe({ ...swipe, dx: 260 }), -1);
  assert.equal(decideSwipe({ ...swipe, direction: 'rtl' }), -1);
  assert.equal(decideSwipe({ ...swipe, dx: 260, direction: 'rtl' }), 1);
});

test('fast flicks cannot bypass the longer page-turn distance', () => {
  for (const width of [390, 768, 1024]) {
    for (const dx of [18, 32, 64, 100]) {
      for (const duration of [10, 45, 140, 500]) {
        assert.equal(decideSwipe({ dx: -dx, dy: 4, duration, width }), 0);
      }
    }
  }
  for (const duration of [45, 140, 500, 1200]) {
    assert.equal(decideSwipe({ dx: -300, dy: 4, duration, width: 768 }), 1);
  }
});

test('phone and iPad page turns require substantial horizontal travel', () => {
  for (const [width, justBelow, sufficient] of [[280, 89, 90], [320, 95, 96], [390, 116, 117], [768, 230, 231], [1024, 259, 260], [1366, 259, 260]]) {
    for (const duration of [30, 250, 800]) {
      assert.equal(decideSwipe({ dx: -justBelow, dy: 1, duration, width }), 0);
      assert.equal(decideSwipe({ dx: sufficient, dy: 1, duration, width }), -1);
      assert.equal(decideSwipe({ dx: -sufficient, dy: 1, duration, width }), 1);
      assert.equal(decideSwipe({ dx: sufficient, dy: 1, duration, width, direction: 'rtl' }), 1);
      assert.equal(decideSwipe({ dx: -sufficient, dy: 1, duration, width, direction: 'rtl' }), -1);
    }
  }
});

test('vertical and ambiguous diagonal movement retain scrolling ownership', () => {
  assert.equal(decideSwipe({ dx: 65, dy: 100, duration: 120, width: 390 }), 0);
  assert.equal(decideSwipe({ dx: -180, dy: 90, duration: 120, width: 390 }), 0);
  assert.equal(decideSwipe({ dx: -200, dy: 81, duration: 120, width: 390 }), 0);
  assert.equal(decideSwipe({ dx: -200, dy: 80, duration: 120, width: 390 }), 1);
});

test('pinching, panning a zoomed page and drawing panels never turn pages', () => {
  const swipe = { dx: -220, dy: 1, duration: 150, width: 390 };
  for (const flag of ['zoomed', 'editing', 'multiTouch']) assert.equal(decideSwipe({ ...swipe, [flag]: true }), 0);
  assert.equal(decideSwipe({ ...swipe, duration: 0 }), 0);
  assert.equal(decideSwipe({ ...swipe, dx: NaN }), 0);
});

test('natural fill scaling permits magazine swipes although it exceeds whole-page width', () => {
  const dimensions = { imageWidth: 691, imageHeight: 1064, availableWidth: 691, availableHeight: 1536 };
  const whole = pageFit(dimensions), fill = pageFit({ ...dimensions, mode: 'fill' });
  assert.ok(fill.width > whole.width * 1.4);
  assert.equal(canSwipePages({ pageWidth: fill.width, baselineWidth: fill.width }), true);
  assert.equal(canSwipePages({ pageWidth: whole.width, baselineWidth: whole.width }), true);
  assert.equal(decideSwipe({ dx: -300, dy: 3, duration: 300, width: 691 }), 1);
  assert.equal(decideSwipe({ dx: -300, dy: 3, duration: 300, width: 691, direction: 'rtl' }), -1);
});

test('manual magnification and explicit exploration preserve panning instead of page turns', () => {
  const base = { pageWidth: 997, baselineWidth: 997 };
  assert.equal(canSwipePages({ ...base, pageWidth: 997 * 1.3 }), false);
  assert.equal(canSwipePages({ ...base, pageWidth: 997 / 1.3 }), false);
  assert.equal(canSwipePages({ ...base, browserScale: 1.2 }), false);
  for (const flag of ['panning', 'guided', 'editing', 'popup', 'loading']) assert.equal(canSwipePages({ ...base, [flag]: true }), false);
  assert.equal(canSwipePages({ ...base, baselineWidth: 0 }), false);
});

test('tall and wide guided panels fit every edge and retain the comic aspect ratio', () => {
  const dimensions = { imageWidth: 1800, imageHeight: 2700, availableWidth: 393.25, availableHeight: 851.75 };
  for (const panel of [
    { x: 0, y: 0, width: .3, height: .9 },
    { x: 0, y: .7, width: 1, height: .3 },
    { x: .8, y: .8, width: .2, height: .2 },
  ]) {
    const fit = guidedPanelFit({ ...dimensions, panel });
    assert.ok(fit);
    assert.ok(fit.panelWidth <= dimensions.availableWidth && fit.panelHeight <= dimensions.availableHeight);
    assert.ok(Math.abs(fit.width / fit.height - dimensions.imageWidth / dimensions.imageHeight) < 1e-12);
    assert.ok(Math.abs(fit.panelWidth - dimensions.availableWidth) < 1e-10 || Math.abs(fit.panelHeight - dimensions.availableHeight) < 1e-10);
    assert.equal(fit.centerX, fit.width * (panel.x + panel.width / 2));
    assert.equal(fit.centerY, fit.height * (panel.y + panel.height / 2));
  }
});

test('a small panel near the page edge is enlarged fully rather than clamped to whole-page zoom', () => {
  const fit = guidedPanelFit({ imageWidth: 2000, imageHeight: 3000, availableWidth: 400, availableHeight: 600,
    panel: { x: .9, y: .9, width: .1, height: .1 } });
  assert.equal(fit.width, 4000); assert.equal(fit.height, 6000);
  assert.equal(fit.panelWidth, 400); assert.equal(fit.panelHeight, 600);
  assert.ok(Math.abs(fit.centerX - 3800) < 1e-9 && Math.abs(fit.centerY - 5700) < 1e-9);
});

test('invalid guided rectangles are rejected instead of producing an off-page focus', () => {
  const dimensions = { imageWidth: 1000, imageHeight: 1500, availableWidth: 390, availableHeight: 700 };
  for (const panel of [null, {}, { x: 0, y: 0, width: 0, height: .5 }, { x: -.1, y: 0, width: .5, height: .5 },
    { x: .8, y: 0, width: .5, height: .5 }, { x: 0, y: .8, width: .5, height: .5 }, { x: 0, y: 0, width: Infinity, height: .5 }]) {
    assert.equal(guidedPanelFit({ ...dimensions, panel }), null);
  }
  assert.equal(guidedPanelFit({ ...dimensions, availableHeight: 0, panel: { x: 0, y: 0, width: 1, height: 1 } }), null);
});

test('backwards navigation resolves the last panel only after the page layout is available', () => {
  assert.equal(resolvePanelIndex(-1, 0), 0);
  assert.equal(resolvePanelIndex(-1, 2), 1);
  assert.equal(resolvePanelIndex(-1, 7), 6);
  assert.equal(resolvePanelIndex(99, 3), 2);
  assert.equal(resolvePanelIndex(1.8, 3), 1);
  assert.equal(resolvePanelIndex(-3, 3), 0);
  assert.equal(resolvePanelIndex(undefined, 3), 0);
});

test('guided swipes follow each fitted panel baseline while manual zoom and pinch keep ownership', () => {
  for (const baselineWidth of [650, 1400, 4500]) {
    const state = { pageWidth: baselineWidth, baselineWidth, guided: true, guidedReady: true };
    assert.equal(canSwipePages(state), true);
    assert.equal(canSwipePages({ ...state, guidedReady: false }), false);
    assert.equal(canSwipePages({ ...state, pageWidth: baselineWidth * 1.3 }), false);
    assert.equal(canSwipePages({ ...state, browserScale: 1.3 }), false);
    assert.equal(canSwipePages({ ...state, panning: true }), false);
    assert.equal(canSwipePages({ ...state, editing: true }), false);
  }
});


test('five resistance levels increase required travel across phone and iPad sizes', () => {
  for (const [width, thresholds] of [[240, [56, 72, 90, 110, 130]], [768, [122.88, 176.64, 230.4, 291.84, 353.28]], [1440, [140, 200, 260, 320, 380]]]) {
    for (let resistance = 1; resistance <= 5; resistance++) {
      const threshold = thresholds[resistance - 1];
      for (const duration of [10, 700]) {
        assert.equal(decideSwipe({ dx: -threshold + .01, dy: 0, duration, width, resistance }), 0);
        assert.equal(decideSwipe({ dx: -threshold - .01, dy: 0, duration, width, resistance }), 1);
        assert.equal(decideSwipe({ dx: threshold + .01, dy: 0, duration, width, resistance, direction: 'rtl' }), 1);
      }
    }
  }
  const gesture = { dx: -250, dy: 1, duration: 100, width: 768 };
  assert.equal(decideSwipe(gesture), 1);
  assert.equal(decideSwipe({ ...gesture, resistance: 4 }), 0);
  for (const resistance of [0, 6, 2.5, '1', NaN]) assert.equal(decideSwipe({ ...gesture, resistance }), 1);
});

test('short left and right taps navigate physical sides including RTL', () => {
  const tap = { x: .1, y: .5, dx: 0, dy: 0, distance: 0, duration: 120 };
  for (const direction of ['ltr', 'rtl']) {
    for (const y of [0, .02, .5, .98, 1]) {
      assert.equal(decideTapNavigation({ ...tap, y, direction }), -1);
      assert.equal(decideTapNavigation({ ...tap, x: .9, y, direction }), 1);
    }
    for (const x of [.25, .4, .5, .75]) assert.equal(decideTapNavigation({ ...tap, x, direction }), 0);
  }
});

test('side navigation rejects drags, diagonal movements, long holds and unsafe edges', () => {
  const tap = { x: .9, y: .5, dx: 0, dy: 0, distance: 0, duration: 120 };
  for (const patch of [{ distance: 12 }, { dx: 9 }, { dy: 9 }, { dx: 8, dy: 8 }, { distance: -1 }, { duration: 0 }, { duration: 400 }, { x: -.1 }, { x: 1.1 }, { y: -.1 }, { y: 1.1 }, { insideSafeArea: false }, { unchanged: false }]) {
    assert.equal(decideTapNavigation({ ...tap, ...patch }), 0);
  }
  for (const flag of ['zoomed', 'panning', 'editing', 'popup', 'loading', 'analysisPending', 'multiTouch', 'cancelled', 'dragging']) assert.equal(decideTapNavigation({ ...tap, [flag]: true }), 0);
  for (const key of ['x', 'y', 'dx', 'dy', 'distance', 'duration']) assert.equal(decideTapNavigation({ ...tap, [key]: NaN }), 0);
});

test('Panel view leaves a little room around each panel so its border is never cut', () => {
  // A phone in portrait: a wide panel fills the width minus the margin on both sides.
  const margin = guidedPanelMargin(412, 915);
  assert.ok(margin >= 8 && margin <= 12, `margin ${margin}`);
  const fit = guidedPanelFit({ imageWidth: 1988, imageHeight: 3056, availableWidth: 412, availableHeight: 915, panel: { x: .03, y: .1, width: .94, height: .6 }, margin });
  assert.ok(Math.abs(fit.width * .94 - (412 - 2 * margin)) < .001, 'panel spans the width minus the margins');
  assert.ok(fit.height * .6 <= 915 - 2 * margin + .001);
  // Without a margin it touches both edges, as before.
  const tight = guidedPanelFit({ imageWidth: 1988, imageHeight: 3056, availableWidth: 412, availableHeight: 915, panel: { x: .03, y: .1, width: .94, height: .6 } });
  assert.ok(Math.abs(tight.width * .94 - 412) < .001);
  assert.equal(guidedPanelMargin(0, 100), 0);
});
