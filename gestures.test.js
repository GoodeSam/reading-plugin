/**
 * TDD tests for touchpad gesture handlers.
 *
 * Behaviour:
 *  - Two-finger tap on a sentence in "menu" mode: opens the sentence panel
 *    with translate, read aloud, and copy buttons (no auto-actions).
 *  - Two-finger tap on a sentence in "direct" mode: opens the sentence panel,
 *    auto-translates, and shows read aloud and copy as additional options.
 *  - A settings button lets users toggle between the two gesture modes.
 *  - Clicking the left margin bar of a paragraph: shows a paragraph
 *    translation popup with the full paragraph text and its translation.
 *  - Paragraph popup can be closed with its close button.
 *  - Gestures only work in reading mode on reader content.
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

/**
 * Build a rendered page with one paragraph containing two sentences.
 */
function renderTestPage(doc, win) {
  const pages = [[
    {
      text: 'The sun rose slowly. Birds began to sing their morning songs.',
      sentences: ['The sun rose slowly.', 'Birds began to sing their morning songs.']
    },
    {
      text: 'A gentle breeze carried the scent of flowers.',
      sentences: ['A gentle breeze carried the scent of flowers.']
    }
  ]];
  setReaderState(win, {
    fileName: 'test.pdf',
    pages,
    totalPages: 1,
    currentPage: 0,
  });
  win.goToPage(0);
}

/**
 * Create a TouchEvent-like object with N touches targeting `target`.
 * jsdom doesn't support TouchEvent, so we build a custom event.
 */
function fireTouchStart(win, target, touchCount) {
  const touches = [];
  for (let i = 0; i < touchCount; i++) {
    touches.push({ identifier: i, target, clientX: 100 + i * 10, clientY: 200 });
  }
  const ev = new win.Event('touchstart', { bubbles: true, cancelable: true });
  ev.touches = touches;
  ev.targetTouches = touches;
  ev.changedTouches = touches;
  target.dispatchEvent(ev);
  return ev;
}

/**
 * Simulate a click on the left margin bar of a paragraph element.
 * The margin bar is the border-left region; a click at offsetX <= bar width
 * (6px) and within the paragraph's padding zone triggers paragraph translation.
 */
function clickMarginBar(win, paraEl) {
  const rect = paraEl.getBoundingClientRect();
  const ev = new win.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + 2,  // inside the 6px margin bar
    clientY: rect.top + rect.height / 2,
  });
  paraEl.dispatchEvent(ev);
  return ev;
}

/**
 * Simulate a click in the content area of a paragraph (not the margin bar).
 */
function clickParagraphContent(win, paraEl) {
  const rect = paraEl.getBoundingClientRect();
  const ev = new win.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + 50, // well past the margin bar
    clientY: rect.top + rect.height / 2,
  });
  paraEl.dispatchEvent(ev);
  return ev;
}

// --------------- tests ---------------

let dom, doc, win;

beforeEach(() => {
  jest.useFakeTimers();
  ({ dom, doc, win } = buildDOM());
  loadReaderJS(win);
  enterReadingMode(doc, win);
  renderTestPage(doc, win);
});

afterEach(() => {
  jest.useRealTimers();
  dom.window.close();
});

// ============================================================
// Gesture mode settings button
// ============================================================
describe('gesture mode settings', () => {

  test('gesture mode settings button exists in the DOM', () => {
    expect(doc.getElementById('gestureModeBtn')).toBeTruthy();
  });

  test('default gesture mode is "menu"', () => {
    expect(win._readerState.gestureMode).toBe('menu');
  });

  test('clicking the settings button toggles mode from menu to direct', () => {
    doc.getElementById('gestureModeBtn').click();
    expect(win._readerState.gestureMode).toBe('direct');
  });

  test('clicking twice toggles mode back to menu', () => {
    doc.getElementById('gestureModeBtn').click();
    doc.getElementById('gestureModeBtn').click();
    expect(win._readerState.gestureMode).toBe('menu');
  });

  test('button label reflects current mode', () => {
    const btn = doc.getElementById('gestureModeBtn');
    // Default mode is menu — button shows indicator for menu mode
    expect(btn.getAttribute('title')).toContain('menu');

    btn.click();
    expect(btn.getAttribute('title')).toContain('direct');
  });

  test('clicking the top bar resets auto-hide so buttons remain clickable', () => {
    const topBar = doc.querySelector('.top-bar');
    // Simulate auto-hide kicking in
    topBar.classList.add('auto-hide');
    expect(topBar.classList.contains('auto-hide')).toBe(true);

    // A click on the top bar should remove auto-hide
    topBar.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    expect(topBar.classList.contains('auto-hide')).toBe(false);
  });

  test('touching the top bar resets auto-hide on touch devices', () => {
    const topBar = doc.querySelector('.top-bar');
    topBar.classList.add('auto-hide');

    const ev = new win.Event('touchstart', { bubbles: true, cancelable: true });
    ev.touches = [{ identifier: 0, target: topBar, clientX: 100, clientY: 10 }];
    topBar.dispatchEvent(ev);

    expect(topBar.classList.contains('auto-hide')).toBe(false);
  });

  test('button text changes to reflect current mode after toggle', () => {
    const btn = doc.getElementById('gestureModeBtn');
    // Default: menu mode icon
    expect(btn.textContent).toContain('\u2630');

    btn.click();
    // Direct mode icon
    expect(btn.textContent).toContain('\u26A1');
  });

  test('button has active class in direct mode', () => {
    const btn = doc.getElementById('gestureModeBtn');
    expect(btn.classList.contains('gesture-mode-direct')).toBe(false);

    btn.click();
    expect(btn.classList.contains('gesture-mode-direct')).toBe(true);

    btn.click();
    expect(btn.classList.contains('gesture-mode-direct')).toBe(false);
  });
});

// ============================================================
// Two-finger gesture — Mode 1: menu (default)
// ============================================================
describe('two-finger gesture — menu mode (default)', () => {

  test('two-finger tap opens the sentence panel', () => {
    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 2);

    const panel = doc.getElementById('sentencePanel');
    expect(panel.classList.contains('active')).toBe(true);
  });

  test('two-finger tap populates panelSentence with the sentence text', () => {
    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 2);

    expect(doc.getElementById('panelSentence').textContent).toBe('The sun rose slowly.');
  });

  test('menu mode does NOT auto-trigger translateSentence', () => {
    let translateCalled = false;
    win.translateSentence = () => { translateCalled = true; };

    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 2);

    expect(translateCalled).toBe(false);
  });

  test('menu mode does NOT auto-trigger speakSentence', () => {
    let speakCalled = false;
    win.speakSentence = () => { speakCalled = true; };

    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 2);

    expect(speakCalled).toBe(false);
  });

  test('panel shows translate, listen, and copy buttons', () => {
    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 2);

    expect(doc.getElementById('btnTranslate')).toBeTruthy();
    expect(doc.getElementById('btnTTS')).toBeTruthy();
    expect(doc.getElementById('btnCopy')).toBeTruthy();
  });

  test('two-finger tap outside a sentence does nothing', () => {
    const readerContent = doc.getElementById('readerContent');
    fireTouchStart(win, readerContent, 2);

    const panel = doc.getElementById('sentencePanel');
    expect(panel.classList.contains('active')).toBe(false);
  });

  test('single-finger touch does NOT trigger sentence panel', () => {
    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 1);

    const panel = doc.getElementById('sentencePanel');
    expect(panel.classList.contains('active')).toBe(false);
  });
});

// ============================================================
// Two-finger gesture — Mode 2: direct translation
// ============================================================
describe('two-finger gesture — direct mode', () => {

  beforeEach(() => {
    // Switch to direct mode
    setReaderState(win, { gestureMode: 'direct' });
  });

  test('two-finger tap opens the sentence panel', () => {
    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 2);

    const panel = doc.getElementById('sentencePanel');
    expect(panel.classList.contains('active')).toBe(true);
  });

  test('direct mode auto-triggers translateSentence', () => {
    let translateCalled = false;
    win.translateSentence = () => { translateCalled = true; };

    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 2);

    expect(translateCalled).toBe(true);
  });

  test('direct mode does NOT auto-trigger speakSentence', () => {
    let speakCalled = false;
    win.speakSentence = () => { speakCalled = true; };

    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 2);

    expect(speakCalled).toBe(false);
  });

  test('panel still shows listen and copy buttons', () => {
    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 2);

    expect(doc.getElementById('btnTTS')).toBeTruthy();
    expect(doc.getElementById('btnCopy')).toBeTruthy();
  });

  test('two-finger tap outside a sentence does nothing', () => {
    const readerContent = doc.getElementById('readerContent');
    fireTouchStart(win, readerContent, 2);

    const panel = doc.getElementById('sentencePanel');
    expect(panel.classList.contains('active')).toBe(false);
  });
});

// ============================================================
// Right-click (context menu) sentence — respects gesture mode
// ============================================================
describe('right-click sentence — respects gesture mode', () => {

  function fireContextMenu(win, target) {
    const ev = new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
    return ev;
  }

  test('right-click on sentence opens sentence panel in menu mode', () => {
    const sentenceEl = doc.querySelector('.sentence');
    fireContextMenu(win, sentenceEl);

    expect(doc.getElementById('sentencePanel').classList.contains('active')).toBe(true);
  });

  test('menu mode right-click does NOT auto-translate', () => {
    let translateCalled = false;
    win.translateSentence = () => { translateCalled = true; };

    const sentenceEl = doc.querySelector('.sentence');
    fireContextMenu(win, sentenceEl);

    expect(translateCalled).toBe(false);
  });

  test('direct mode right-click auto-translates', () => {
    setReaderState(win, { gestureMode: 'direct' });
    let translateCalled = false;
    win.translateSentence = () => { translateCalled = true; };

    const sentenceEl = doc.querySelector('.sentence');
    fireContextMenu(win, sentenceEl);

    expect(translateCalled).toBe(true);
  });

  test('right-click outside a sentence does nothing', () => {
    const readerContent = doc.getElementById('readerContent');
    fireContextMenu(win, readerContent);

    expect(doc.getElementById('sentencePanel').classList.contains('active')).toBe(false);
  });
});

// ============================================================
// Margin bar click → paragraph popup (shared behavior)
// ============================================================
describe('margin bar click — paragraph popup basics', () => {

  test('paragraph popup element exists in the DOM', () => {
    expect(doc.getElementById('paraPopup')).toBeTruthy();
  });

  test('margin bar is 6px wide', () => {
    const css = fs.readFileSync(path.join(__dirname, 'reader.css'), 'utf-8');
    const match = css.match(/\.paragraph\s*\{[^}]*border-left:\s*(\d+)px/);
    expect(match).toBeTruthy();
    expect(match[1]).toBe('6');
  });

  test('clicking margin bar on a paragraph shows the paragraph popup', () => {
    const paraEl = doc.querySelector('.paragraph');
    clickMarginBar(win, paraEl);

    const popup = doc.getElementById('paraPopup');
    expect(popup.classList.contains('active')).toBe(true);
  });

  test('popup displays the full paragraph text', () => {
    const paraEl = doc.querySelector('.paragraph');
    clickMarginBar(win, paraEl);

    const paraText = doc.getElementById('paraPopupText');
    expect(paraText.textContent).toContain('The sun rose slowly.');
    expect(paraText.textContent).toContain('Birds began to sing their morning songs.');
  });

  test('clicking paragraph content area does NOT trigger paragraph popup', () => {
    const paraEl = doc.querySelector('.paragraph');
    clickParagraphContent(win, paraEl);

    const popup = doc.getElementById('paraPopup');
    expect(popup.classList.contains('active')).toBe(false);
  });

  test('close button hides the paragraph popup', () => {
    const paraEl = doc.querySelector('.paragraph');
    clickMarginBar(win, paraEl);

    const popup = doc.getElementById('paraPopup');
    expect(popup.classList.contains('active')).toBe(true);

    doc.getElementById('paraPopupClose').click();
    expect(popup.classList.contains('active')).toBe(false);
  });

  test('clicking the overlay hides the paragraph popup', () => {
    const paraEl = doc.querySelector('.paragraph');
    clickMarginBar(win, paraEl);

    doc.getElementById('paraPopupOverlay').click();
    expect(doc.getElementById('paraPopup').classList.contains('active')).toBe(false);
  });

  test('three-finger touch does NOT trigger paragraph popup', () => {
    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 3);

    expect(doc.getElementById('paraPopup').classList.contains('active')).toBe(false);
  });
});

// ============================================================
// Paragraph popup — menu mode (default)
// ============================================================
describe('paragraph popup — menu mode', () => {

  test('menu mode does NOT auto-translate paragraph', () => {
    let translateCalled = false;
    win._stubCallOpenAI = async () => { translateCalled = true; return 'translated'; };

    const paraEl = doc.querySelector('.paragraph');
    clickMarginBar(win, paraEl);

    expect(translateCalled).toBe(false);
  });

  test('menu mode shows action buttons in paragraph popup', () => {
    const paraEl = doc.querySelector('.paragraph');
    clickMarginBar(win, paraEl);

    expect(doc.getElementById('paraTranslateBtn')).toBeTruthy();
    expect(doc.getElementById('paraTTSBtn')).toBeTruthy();
    expect(doc.getElementById('paraCopyBtn')).toBeTruthy();
  });

  test('translation area is hidden until translate button is clicked', () => {
    const paraEl = doc.querySelector('.paragraph');
    clickMarginBar(win, paraEl);

    const translation = doc.getElementById('paraPopupTranslation');
    expect(translation.style.display).toBe('none');
  });

  test('clicking translate button triggers paragraph translation', () => {
    let translateCalled = false;
    win._stubCallOpenAI = async () => { translateCalled = true; return 'translated'; };

    const paraEl = doc.querySelector('.paragraph');
    clickMarginBar(win, paraEl);

    doc.getElementById('paraTranslateBtn').click();
    expect(translateCalled).toBe(true);
  });
});

// ============================================================
// Paragraph popup — direct mode
// ============================================================
describe('paragraph popup — direct mode', () => {

  beforeEach(() => {
    setReaderState(win, { gestureMode: 'direct' });
  });

  test('direct mode auto-triggers paragraph translation', () => {
    let translateCalled = false;
    win._stubCallOpenAI = async () => { translateCalled = true; return 'translated'; };

    const paraEl = doc.querySelector('.paragraph');
    clickMarginBar(win, paraEl);

    expect(translateCalled).toBe(true);
  });

  test('direct mode shows loading state while translating', () => {
    win._stubCallOpenAI = () => new Promise(() => {});

    const paraEl = doc.querySelector('.paragraph');
    clickMarginBar(win, paraEl);

    const result = doc.getElementById('paraPopupTranslation');
    expect(result.textContent).toContain('Translating');
  });

  test('direct mode displays translation result once resolved', async () => {
    jest.useRealTimers();
    win._stubCallOpenAI = async () => '\u592a\u9633\u6162\u6162\u5347\u8d77\u3002\u9e1f\u513f\u5f00\u59cb\u5531\u6b4c\u3002';

    const paraEl = doc.querySelector('.paragraph');
    clickMarginBar(win, paraEl);

    await new Promise(r => process.nextTick(r));

    const result = doc.getElementById('paraPopupTranslation');
    expect(result.textContent).toContain('\u592a\u9633\u6162\u6162\u5347\u8d77');
  });

  test('direct mode still shows listen and copy buttons', () => {
    const paraEl = doc.querySelector('.paragraph');
    clickMarginBar(win, paraEl);

    expect(doc.getElementById('paraTTSBtn')).toBeTruthy();
    expect(doc.getElementById('paraCopyBtn')).toBeTruthy();
  });

  test('translation area is visible in direct mode', () => {
    win._stubCallOpenAI = () => new Promise(() => {});

    const paraEl = doc.querySelector('.paragraph');
    clickMarginBar(win, paraEl);

    const translation = doc.getElementById('paraPopupTranslation');
    expect(translation.style.display).not.toBe('none');
  });
});
