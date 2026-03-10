/**
 * TDD tests for touchpad gesture handlers.
 *
 * Behaviour:
 *  - Two-finger tap on a sentence: opens the sentence panel and
 *    auto-triggers translation and pronunciation (TTS).
 *  - Three-finger tap on a paragraph: shows a paragraph translation popup
 *    with the full paragraph text and its translation.
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
// Two-finger gesture → sentence translate + TTS
// ============================================================
describe('two-finger gesture — sentence translate and pronounce', () => {

  test('two-finger tap on a sentence opens the sentence panel', () => {
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

  test('two-finger tap auto-triggers translateSentence', () => {
    // Stub translateSentence to track calls
    let translateCalled = false;
    win.translateSentence = () => { translateCalled = true; };

    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 2);

    expect(translateCalled).toBe(true);
  });

  test('two-finger tap auto-triggers speakSentence', () => {
    let speakCalled = false;
    win.speakSentence = () => { speakCalled = true; };

    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 2);

    expect(speakCalled).toBe(true);
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
// Three-finger gesture → paragraph translation popup
// ============================================================
describe('three-finger gesture — paragraph translation popup', () => {

  test('paragraph popup element exists in the DOM', () => {
    expect(doc.getElementById('paraPopup')).toBeTruthy();
  });

  test('three-finger tap on a paragraph shows the paragraph popup', () => {
    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 3);

    const popup = doc.getElementById('paraPopup');
    expect(popup.classList.contains('active')).toBe(true);
  });

  test('popup displays the full paragraph text', () => {
    // Tap on the first paragraph (which has two sentences)
    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 3);

    const paraText = doc.getElementById('paraPopupText');
    expect(paraText.textContent).toContain('The sun rose slowly.');
    expect(paraText.textContent).toContain('Birds began to sing their morning songs.');
  });

  test('popup auto-triggers paragraph translation', () => {
    let translateMsg = null;
    win._stubCallOpenAI = async (msgs) => {
      translateMsg = msgs;
      return 'Translated paragraph text.';
    };

    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 3);

    // translateMsg should have been called
    expect(translateMsg).toBeTruthy();
  });

  test('three-finger tap outside a paragraph does nothing', () => {
    const readerContent = doc.getElementById('readerContent');
    fireTouchStart(win, readerContent, 3);

    const popup = doc.getElementById('paraPopup');
    expect(popup.classList.contains('active')).toBe(false);
  });

  test('close button hides the paragraph popup', () => {
    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 3);

    const popup = doc.getElementById('paraPopup');
    expect(popup.classList.contains('active')).toBe(true);

    doc.getElementById('paraPopupClose').click();
    expect(popup.classList.contains('active')).toBe(false);
  });

  test('clicking the overlay hides the paragraph popup', () => {
    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 3);

    doc.getElementById('paraPopupOverlay').click();
    expect(doc.getElementById('paraPopup').classList.contains('active')).toBe(false);
  });

  test('single-finger touch does NOT trigger paragraph popup', () => {
    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 1);

    expect(doc.getElementById('paraPopup').classList.contains('active')).toBe(false);
  });

  test('two-finger touch does NOT trigger paragraph popup', () => {
    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 2);

    expect(doc.getElementById('paraPopup').classList.contains('active')).toBe(false);
  });
});

// ============================================================
// Paragraph popup — translation result display
// ============================================================
describe('paragraph popup — translation display', () => {

  test('shows loading state while translating', () => {
    // Use a stub that never resolves immediately
    win._stubCallOpenAI = () => new Promise(() => {});

    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 3);

    const result = doc.getElementById('paraPopupTranslation');
    expect(result.textContent).toContain('Translating');
  });

  test('displays translation result once resolved', async () => {
    jest.useRealTimers();
    win._stubCallOpenAI = async () => '\u592a\u9633\u6162\u6162\u5347\u8d77\u3002\u9e1f\u513f\u5f00\u59cb\u5531\u6b4c\u3002';

    const sentenceEl = doc.querySelector('.sentence');
    fireTouchStart(win, sentenceEl, 3);

    // Wait for the async translation to complete
    await new Promise(r => setTimeout(r, 50));

    const result = doc.getElementById('paraPopupTranslation');
    expect(result.textContent).toContain('\u592a\u9633\u6162\u6162\u5347\u8d77');
  });
});
