/**
 * TDD tests for two-phase scroll-based page navigation and keyboard scrolling.
 *
 * Two-phase overscroll navigation:
 *  - Phase 1: scrolling hits a boundary (top or bottom) — the system records
 *    that the boundary has been reached. No page navigation yet.
 *  - Phase 2: the user scrolls again in the SAME direction while still at that
 *    boundary, AFTER a minimum gesture gap (300ms) — page navigation fires.
 *  - Rapid wheel events from a single swipe (within the gesture gap) do NOT
 *    satisfy phase 2 — this prevents accidental page turns.
 *  - If the user scrolls away from the boundary, or changes direction, the
 *    recorded boundary state resets.
 *  - A cooldown still prevents rapid repeated navigation after phase 2 fires.
 *  - Single-finger touch swipe does not trigger page navigation.
 *
 * Keyboard scrolling:
 *  - Up/Down arrow keys scroll the reader content within the current page.
 *  - Left/Right arrow keys navigate between pages.
 *  - Keyboard navigation only works when reader screen is active.
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// --------------- helpers ---------------
function buildDOM() {
  const html = fs.readFileSync(path.join(__dirname, 'reader.html'), 'utf-8');
  const dom = new JSDOM(html, { url: 'http://localhost' });
  const doc = dom.window.document;
  const win = dom.window;

  win.chrome = { storage: { local: { get: (keys, cb) => cb({}) } } };
  Object.defineProperty(win, 'innerHeight', { value: 800, writable: true });
  Object.defineProperty(win, 'innerWidth', { value: 1200, writable: true });

  return { dom, doc, win };
}

function loadReaderJS(win) {
  const js = fs.readFileSync(path.join(__dirname, 'reader.js'), 'utf-8');
  const script = new win.Function(
    'document', 'window', 'localStorage', 'navigator', 'chrome', 'fetch', 'URL', 'Audio', 'alert', 'requestAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    js
  );
  script(
    win.document, win, win.localStorage, win.navigator,
    win.chrome, win.fetch || (() => {}), win.URL, win.Audio || class {},
    () => {}, (cb) => cb(), win.setTimeout.bind(win), win.clearTimeout.bind(win),
    win.setInterval.bind(win), win.clearInterval.bind(win)
  );
}

function enterReadingMode(doc, win) {
  doc.getElementById('uploadScreen').classList.remove('active');
  doc.getElementById('readerScreen').classList.add('active');
  doc.dispatchEvent(new win.Event('DOMContentLoaded'));
}

function setReaderState(win, overrides) {
  Object.assign(win._readerState, overrides);
}

function makeDummyPages(n) {
  return Array.from({ length: n }, () => [
    { text: 'Hello world. This is a test sentence.', sentences: ['Hello world.', 'This is a test sentence.'] }
  ]);
}

/**
 * Fire a wheel event on a target element.
 * deltaY > 0 means scroll down, deltaY < 0 means scroll up.
 */
function fireWheel(win, target, deltaY) {
  let ev;
  try {
    ev = new win.WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
  } catch {
    ev = new win.Event('wheel', { bubbles: true, cancelable: true });
    ev.deltaY = deltaY;
  }
  target.dispatchEvent(ev);
}

/**
 * Simulate a single-finger swipe gesture (touchstart → touchend).
 */
function fireSwipe(win, target, startX, startY, endX, endY) {
  const startTouch = [{ identifier: 0, target, clientX: startX, clientY: startY }];
  const endTouch = [{ identifier: 0, target, clientX: endX, clientY: endY }];

  const tsEvent = new win.Event('touchstart', { bubbles: true, cancelable: true });
  tsEvent.touches = startTouch;
  tsEvent.targetTouches = startTouch;
  tsEvent.changedTouches = startTouch;
  target.dispatchEvent(tsEvent);

  const teEvent = new win.Event('touchend', { bubbles: true, cancelable: true });
  teEvent.touches = [];
  teEvent.targetTouches = [];
  teEvent.changedTouches = endTouch;
  target.dispatchEvent(teEvent);
}

/**
 * Mock the scroll geometry of an element.
 * "At bottom" when scrollTop + clientHeight >= scrollHeight - tolerance
 * "At top" when scrollTop <= tolerance
 */
function setScrollState(element, scrollTop, scrollHeight, clientHeight) {
  element.scrollTop = scrollTop;
  Object.defineProperty(element, 'scrollHeight', {
    value: scrollHeight, configurable: true, writable: true
  });
  Object.defineProperty(element, 'clientHeight', {
    value: clientHeight, configurable: true, writable: true
  });
}

function fireKeydown(doc, win, key) {
  const ev = new win.KeyboardEvent('keydown', { key, bubbles: true });
  doc.dispatchEvent(ev);
}

// The gesture gap — phase 2 requires this much time after phase 1.
const GESTURE_GAP = 300;

// --------------- tests ---------------

let dom, doc, win;

beforeEach(() => {
  jest.useFakeTimers();
  ({ dom, doc, win } = buildDOM());
  loadReaderJS(win);
  enterReadingMode(doc, win);

  const pages = makeDummyPages(5);
  setReaderState(win, {
    fileName: 'test.pdf',
    pages,
    totalPages: 5,
    currentPage: 2,
  });
  win.goToPage(2);
});

afterEach(() => {
  jest.useRealTimers();
  dom.window.close();
});

// ============================================================
// Phase 1 — boundary detection (no navigation yet)
// ============================================================
describe('phase 1 — first scroll at boundary records state, does NOT navigate', () => {

  test('first scroll-down at bottom does NOT navigate', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 900, 1500, 600);

    fireWheel(win, content, 100);

    expect(win._readerState.currentPage).toBe(2);
  });

  test('first scroll-up at top does NOT navigate', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 0, 1500, 600);

    fireWheel(win, content, -100);

    expect(win._readerState.currentPage).toBe(2);
  });
});

// ============================================================
// Single-swipe bug — rapid events from one gesture must NOT navigate
// ============================================================
describe('single-swipe protection — rapid events do NOT trigger phase 2', () => {

  test('rapid scroll-down events at bottom do NOT navigate (same gesture)', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 900, 1500, 600);

    // Simulate a single swipe: many events with no time gap
    fireWheel(win, content, 100);
    fireWheel(win, content, 100);
    fireWheel(win, content, 100);

    expect(win._readerState.currentPage).toBe(2);
  });

  test('rapid scroll-up events at top do NOT navigate (same gesture)', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 0, 1500, 600);

    fireWheel(win, content, -100);
    fireWheel(win, content, -100);
    fireWheel(win, content, -100);

    expect(win._readerState.currentPage).toBe(2);
  });

  test('events just before gap expires do NOT navigate', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 900, 1500, 600);

    fireWheel(win, content, 100); // phase 1
    jest.advanceTimersByTime(GESTURE_GAP - 1); // 1ms short
    fireWheel(win, content, 100); // too soon

    expect(win._readerState.currentPage).toBe(2);
  });

  test('single swipe with momentum spanning > gesture gap does NOT navigate', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 900, 1500, 600);

    // A real trackpad swipe: events spaced ~200ms apart due to momentum,
    // total duration exceeds GESTURE_GAP (900ms)
    fireWheel(win, content, 100);
    jest.advanceTimersByTime(200);
    fireWheel(win, content, 80);
    jest.advanceTimersByTime(200);
    fireWheel(win, content, 60);
    jest.advanceTimersByTime(200);
    fireWheel(win, content, 40);
    jest.advanceTimersByTime(200);
    fireWheel(win, content, 20);
    jest.advanceTimersByTime(200);
    fireWheel(win, content, 10); // t=1000, well past 900ms from first event

    expect(win._readerState.currentPage).toBe(2);
  });

  test('single upward swipe with momentum spanning > gesture gap does NOT navigate', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 0, 1500, 600);

    fireWheel(win, content, -100);
    jest.advanceTimersByTime(200);
    fireWheel(win, content, -80);
    jest.advanceTimersByTime(200);
    fireWheel(win, content, -60);
    jest.advanceTimersByTime(200);
    fireWheel(win, content, -40);
    jest.advanceTimersByTime(200);
    fireWheel(win, content, -20);
    jest.advanceTimersByTime(200);
    fireWheel(win, content, -10);

    expect(win._readerState.currentPage).toBe(2);
  });
});

// ============================================================
// Phase 2 — second gesture at same boundary triggers navigation
// ============================================================
describe('phase 2 — second gesture after gap at boundary navigates', () => {

  test('two separate scroll-downs at bottom navigates to next page', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 900, 1500, 600);

    fireWheel(win, content, 100); // phase 1
    expect(win._readerState.currentPage).toBe(2);

    jest.advanceTimersByTime(GESTURE_GAP); // wait for gap
    fireWheel(win, content, 100); // phase 2 — navigate
    expect(win._readerState.currentPage).toBe(3);
  });

  test('two separate scroll-ups at top navigates to previous page', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 0, 1500, 600);

    fireWheel(win, content, -100); // phase 1
    expect(win._readerState.currentPage).toBe(2);

    jest.advanceTimersByTime(GESTURE_GAP);
    fireWheel(win, content, -100); // phase 2
    expect(win._readerState.currentPage).toBe(1);
  });

  test('near-bottom within tolerance — two gestures navigate', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 870, 1500, 600);

    fireWheel(win, content, 100);
    jest.advanceTimersByTime(GESTURE_GAP);
    fireWheel(win, content, 100);
    expect(win._readerState.currentPage).toBe(3);
  });

  test('near-top within tolerance — two gestures navigate', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 30, 1500, 600);

    fireWheel(win, content, -100);
    jest.advanceTimersByTime(GESTURE_GAP);
    fireWheel(win, content, -100);
    expect(win._readerState.currentPage).toBe(1);
  });

  test('content fits viewport — two scroll-down gestures navigate to next page', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 0, 600, 600);

    fireWheel(win, content, 100);
    jest.advanceTimersByTime(GESTURE_GAP);
    fireWheel(win, content, 100);
    expect(win._readerState.currentPage).toBe(3);
  });

  test('content fits viewport — two scroll-up gestures navigate to previous page', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 0, 600, 600);

    fireWheel(win, content, -100);
    jest.advanceTimersByTime(GESTURE_GAP);
    fireWheel(win, content, -100);
    expect(win._readerState.currentPage).toBe(1);
  });
});

// ============================================================
// Phase reset — boundary state clears when conditions change
// ============================================================
describe('phase reset — boundary state clears on direction change or scroll away', () => {

  test('phase 1 at bottom, then scroll away resets — need fresh two-phase', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 900, 1500, 600);
    fireWheel(win, content, 100); // phase 1 recorded

    jest.advanceTimersByTime(GESTURE_GAP);

    // User scrolls away from bottom (no longer at boundary)
    setScrollState(content, 400, 1500, 600);
    fireWheel(win, content, 100); // not at boundary — resets state

    jest.advanceTimersByTime(GESTURE_GAP);

    // Back at bottom — this is a fresh phase 1, not phase 2
    setScrollState(content, 900, 1500, 600);
    fireWheel(win, content, 100); // phase 1 again
    expect(win._readerState.currentPage).toBe(2); // still no navigation
  });

  test('phase 1 at top, then scroll away resets — need fresh two-phase', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 0, 1500, 600);
    fireWheel(win, content, -100); // phase 1 recorded

    jest.advanceTimersByTime(GESTURE_GAP);

    // User scrolls away from top
    setScrollState(content, 200, 1500, 600);
    fireWheel(win, content, -100); // not at boundary — resets state

    jest.advanceTimersByTime(GESTURE_GAP);

    // Back at top — fresh phase 1
    setScrollState(content, 0, 1500, 600);
    fireWheel(win, content, -100);
    expect(win._readerState.currentPage).toBe(2);
  });

  test('phase 1 at bottom, then opposite direction resets state', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 900, 1500, 600);
    fireWheel(win, content, 100); // phase 1 at bottom

    // Scroll in opposite direction while still at bottom
    fireWheel(win, content, -100); // resets boundary state

    jest.advanceTimersByTime(GESTURE_GAP);

    // Scroll down again at bottom — this is a fresh phase 1
    fireWheel(win, content, 100);
    expect(win._readerState.currentPage).toBe(2);
  });

  test('phase 1 at top, then opposite direction resets state', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 0, 1500, 600);
    fireWheel(win, content, -100); // phase 1 at top

    // Scroll in opposite direction
    fireWheel(win, content, 100); // resets boundary state

    jest.advanceTimersByTime(GESTURE_GAP);

    // Scroll up again at top — fresh phase 1
    fireWheel(win, content, -100);
    expect(win._readerState.currentPage).toBe(2);
  });

  test('after navigation, boundary state resets — need fresh two-phase for next nav', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 900, 1500, 600);

    fireWheel(win, content, 100); // phase 1
    jest.advanceTimersByTime(GESTURE_GAP);
    fireWheel(win, content, 100); // phase 2 → navigate to page 3
    expect(win._readerState.currentPage).toBe(3);

    // After cooldown: a single scroll is phase 1 of a new cycle, not phase 2
    jest.advanceTimersByTime(500);
    setScrollState(content, 900, 1500, 600);
    fireWheel(win, content, 100); // fresh phase 1
    expect(win._readerState.currentPage).toBe(3); // not 4
  });
});

// ============================================================
// Boundary guard — last page / first page
// ============================================================
describe('boundary guard — page limits', () => {

  test('at bottom on last page — two gestures do not go beyond', () => {
    win.goToPage(4);
    const content = doc.getElementById('readerContent');
    setScrollState(content, 900, 1500, 600);

    fireWheel(win, content, 100);
    jest.advanceTimersByTime(GESTURE_GAP);
    fireWheel(win, content, 100);
    expect(win._readerState.currentPage).toBe(4);
  });

  test('at top on first page — two gestures do not go below 0', () => {
    win.goToPage(0);
    const content = doc.getElementById('readerContent');
    setScrollState(content, 0, 1500, 600);

    fireWheel(win, content, -100);
    jest.advanceTimersByTime(GESTURE_GAP);
    fireWheel(win, content, -100);
    expect(win._readerState.currentPage).toBe(0);
  });
});

// ============================================================
// Non-boundary scrolling — no effect
// ============================================================
describe('non-boundary scrolling — no page navigation', () => {

  test('scroll down while NOT at bottom does NOT navigate', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 400, 1500, 600);

    fireWheel(win, content, 100);
    jest.advanceTimersByTime(GESTURE_GAP);
    fireWheel(win, content, 100);
    expect(win._readerState.currentPage).toBe(2);
  });

  test('scroll up while NOT at top does NOT navigate', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 200, 1500, 600);

    fireWheel(win, content, -100);
    jest.advanceTimersByTime(GESTURE_GAP);
    fireWheel(win, content, -100);
    expect(win._readerState.currentPage).toBe(2);
  });

  test('scroll UP while at bottom does NOT navigate (wrong direction)', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 900, 1500, 600);

    fireWheel(win, content, -100);
    jest.advanceTimersByTime(GESTURE_GAP);
    fireWheel(win, content, -100);
    expect(win._readerState.currentPage).toBe(2);
  });

  test('scroll DOWN while at top does NOT navigate (wrong direction)', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 0, 1500, 600);

    fireWheel(win, content, 100);
    jest.advanceTimersByTime(GESTURE_GAP);
    fireWheel(win, content, 100);
    expect(win._readerState.currentPage).toBe(2);
  });
});

// ============================================================
// Cooldown — prevents rapid navigation after phase 2
// ============================================================
describe('cooldown — prevents rapid navigation after phase 2', () => {

  test('cooldown blocks immediate second navigation cycle', () => {
    const content = doc.getElementById('readerContent');
    setScrollState(content, 900, 1500, 600);

    fireWheel(win, content, 100); // phase 1
    jest.advanceTimersByTime(GESTURE_GAP);
    fireWheel(win, content, 100); // phase 2 → page 3
    expect(win._readerState.currentPage).toBe(3);

    // Immediately try another two-phase cycle — blocked by cooldown
    setScrollState(content, 900, 1500, 600);
    fireWheel(win, content, 100);
    jest.advanceTimersByTime(GESTURE_GAP);
    fireWheel(win, content, 100);
    expect(win._readerState.currentPage).toBe(3);

    // After cooldown, a full two-phase works again
    jest.advanceTimersByTime(500);
    setScrollState(content, 900, 1500, 600);
    fireWheel(win, content, 100); // phase 1
    jest.advanceTimersByTime(GESTURE_GAP);
    fireWheel(win, content, 100); // phase 2 → page 4
    expect(win._readerState.currentPage).toBe(4);
  });
});

// ============================================================
// Single-finger swipe — no longer navigates
// ============================================================
describe('single-finger swipe — no longer navigates pages', () => {

  test('single-finger swipe down does NOT navigate', () => {
    const content = doc.getElementById('readerContent');
    fireSwipe(win, content, 200, 100, 200, 400);
    expect(win._readerState.currentPage).toBe(2);
  });

  test('single-finger swipe up does NOT navigate', () => {
    const content = doc.getElementById('readerContent');
    fireSwipe(win, content, 200, 400, 200, 100);
    expect(win._readerState.currentPage).toBe(2);
  });
});

// ============================================================
// Up/Down arrow keys — within-page scrolling
// ============================================================
describe('up/down arrow keys — within-page scrolling', () => {

  test('ArrowDown scrolls the reader content downward', () => {
    const content = doc.getElementById('readerContent');
    const initialScroll = content.scrollTop;
    fireKeydown(doc, win, 'ArrowDown');
    expect(content.scrollTop).toBeGreaterThan(initialScroll);
  });

  test('ArrowUp scrolls the reader content upward', () => {
    const content = doc.getElementById('readerContent');
    content.scrollTop = 200;
    fireKeydown(doc, win, 'ArrowUp');
    expect(content.scrollTop).toBeLessThan(200);
  });

  test('ArrowDown does NOT change the current page', () => {
    fireKeydown(doc, win, 'ArrowDown');
    expect(win._readerState.currentPage).toBe(2);
  });

  test('ArrowUp does NOT change the current page', () => {
    fireKeydown(doc, win, 'ArrowUp');
    expect(win._readerState.currentPage).toBe(2);
  });

  test('ArrowLeft still navigates to previous page', () => {
    fireKeydown(doc, win, 'ArrowLeft');
    expect(win._readerState.currentPage).toBe(1);
  });

  test('ArrowRight still navigates to next page', () => {
    fireKeydown(doc, win, 'ArrowRight');
    expect(win._readerState.currentPage).toBe(3);
  });

  test('arrow keys do nothing when reader screen is not active', () => {
    doc.getElementById('readerScreen').classList.remove('active');
    const content = doc.getElementById('readerContent');
    content.scrollTop = 100;

    fireKeydown(doc, win, 'ArrowDown');
    expect(content.scrollTop).toBe(100);

    fireKeydown(doc, win, 'ArrowUp');
    expect(content.scrollTop).toBe(100);
  });
});
