/**
 * TDD tests for navigation gestures and keyboard scrolling.
 *
 * Behaviour:
 *  - Swipe up (finger moves from bottom to top) navigates to the next page.
 *  - Swipe down (finger moves from top to bottom) navigates to the previous page.
 *  - Swipes require a minimum vertical distance (threshold) and must be
 *    predominantly vertical (not horizontal).
 *  - Only single-finger swipes trigger page navigation (multi-finger reserved
 *    for sentence/paragraph gestures).
 *  - Up/Down arrow keys scroll the reader content within the current page.
 *  - Arrow key scrolling does not trigger page navigation.
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
 * Simulate a single-finger swipe gesture (touchstart → touchend).
 * deltaY > 0 means finger moved downward; deltaY < 0 means upward.
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

function fireKeydown(doc, win, key) {
  const ev = new win.KeyboardEvent('keydown', { key, bubbles: true });
  doc.dispatchEvent(ev);
}

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
// Swipe-to-navigate — page navigation via vertical swipe
// ============================================================
describe('swipe-to-navigate — vertical swipe for page navigation', () => {

  test('swipe up (finger moves upward) navigates to the next page', () => {
    const content = doc.getElementById('readerContent');
    // Swipe up: start at y=400, end at y=100 (finger moves up, deltaY = -300)
    fireSwipe(win, content, 200, 400, 200, 100);

    expect(win._readerState.currentPage).toBe(3);
  });

  test('swipe down (finger moves downward) navigates to the previous page', () => {
    const content = doc.getElementById('readerContent');
    // Swipe down: start at y=100, end at y=400 (finger moves down, deltaY = +300)
    fireSwipe(win, content, 200, 100, 200, 400);

    expect(win._readerState.currentPage).toBe(1);
  });

  test('swipe below threshold does NOT navigate', () => {
    const content = doc.getElementById('readerContent');
    // Small swipe: only 30px (below typical 50px threshold)
    fireSwipe(win, content, 200, 200, 200, 170);

    expect(win._readerState.currentPage).toBe(2);
  });

  test('predominantly horizontal swipe does NOT navigate', () => {
    const content = doc.getElementById('readerContent');
    // Horizontal swipe: large x delta, small y delta
    fireSwipe(win, content, 100, 200, 400, 180);

    expect(win._readerState.currentPage).toBe(2);
  });

  test('swipe up on last page does not go beyond total pages', () => {
    win.goToPage(4); // last page (0-indexed)
    const content = doc.getElementById('readerContent');
    fireSwipe(win, content, 200, 400, 200, 100);

    expect(win._readerState.currentPage).toBe(4);
  });

  test('swipe down on first page does not go below page 0', () => {
    win.goToPage(0);
    const content = doc.getElementById('readerContent');
    fireSwipe(win, content, 200, 100, 200, 400);

    expect(win._readerState.currentPage).toBe(0);
  });

  test('multi-finger swipe does NOT trigger page navigation', () => {
    const content = doc.getElementById('readerContent');
    // 2-finger touchstart
    const startTouches = [
      { identifier: 0, target: content, clientX: 200, clientY: 400 },
      { identifier: 1, target: content, clientX: 250, clientY: 400 }
    ];
    const tsEvent = new win.Event('touchstart', { bubbles: true, cancelable: true });
    tsEvent.touches = startTouches;
    tsEvent.targetTouches = startTouches;
    tsEvent.changedTouches = startTouches;
    content.dispatchEvent(tsEvent);

    const endTouches = [
      { identifier: 0, target: content, clientX: 200, clientY: 100 },
      { identifier: 1, target: content, clientX: 250, clientY: 100 }
    ];
    const teEvent = new win.Event('touchend', { bubbles: true, cancelable: true });
    teEvent.touches = [];
    teEvent.targetTouches = [];
    teEvent.changedTouches = endTouches;
    content.dispatchEvent(teEvent);

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
    // Set initial scroll position so we can scroll up
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
