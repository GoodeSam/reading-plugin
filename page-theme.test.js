/**
 * TDD tests for page background color themes.
 *
 * Themes:
 *   white  — bg #ffffff, text #2d2a24
 *   black  — bg #1a1a1a, text #d4d4d4
 *   brown  — bg #f5f0e8, text #2d2a24  (default / sepia)
 *   green  — bg #e8f5e9, text #1b3a1b
 *
 * Behaviour:
 *  - A theme picker in the top bar shows four colour swatches.
 *  - Clicking a swatch applies the theme to the reader screen.
 *  - Text color adjusts automatically for readability.
 *  - Paragraph, top bar, bottom bar, and sentence hover/active
 *    colours adapt to the theme.
 *  - The selected theme persists in localStorage.
 *  - On load, the saved theme is restored.
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

function renderTestPage(doc, win) {
  const pages = [[
    {
      text: 'The sun rose slowly.',
      sentences: ['The sun rose slowly.']
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
  win.localStorage.clear();
  dom.window.close();
});

// ============================================================
// Theme picker UI
// ============================================================
describe('theme picker UI', () => {

  test('theme picker container exists in the top bar', () => {
    const picker = doc.getElementById('themePicker');
    expect(picker).toBeTruthy();
    // Should be inside top-bar-actions
    expect(picker.closest('.top-bar-actions')).toBeTruthy();
  });

  test('theme picker has four swatch buttons', () => {
    const swatches = doc.querySelectorAll('#themePicker .theme-swatch');
    expect(swatches.length).toBe(4);
  });

  test('swatches have correct data-theme attributes', () => {
    const swatches = doc.querySelectorAll('#themePicker .theme-swatch');
    const themes = Array.from(swatches).map(s => s.dataset.theme);
    expect(themes).toEqual(['white', 'black', 'brown', 'green']);
  });

  test('default theme swatch is marked active', () => {
    const active = doc.querySelector('#themePicker .theme-swatch.active');
    expect(active).toBeTruthy();
    expect(active.dataset.theme).toBe('brown'); // default is sepia/brown
  });
});

// ============================================================
// Theme application
// ============================================================
describe('theme application', () => {

  test('clicking white swatch sets reader-screen data-theme to white', () => {
    const swatch = doc.querySelector('[data-theme="white"]');
    swatch.click();
    expect(doc.getElementById('readerScreen').dataset.theme).toBe('white');
  });

  test('clicking black swatch sets reader-screen data-theme to black', () => {
    const swatch = doc.querySelector('[data-theme="black"]');
    swatch.click();
    expect(doc.getElementById('readerScreen').dataset.theme).toBe('black');
  });

  test('clicking green swatch sets reader-screen data-theme to green', () => {
    const swatch = doc.querySelector('[data-theme="green"]');
    swatch.click();
    expect(doc.getElementById('readerScreen').dataset.theme).toBe('green');
  });

  test('clicking brown swatch sets reader-screen data-theme to brown', () => {
    // First switch away then back
    doc.querySelector('[data-theme="black"]').click();
    doc.querySelector('[data-theme="brown"]').click();
    expect(doc.getElementById('readerScreen').dataset.theme).toBe('brown');
  });

  test('only the clicked swatch gets the active class', () => {
    doc.querySelector('[data-theme="black"]').click();
    const swatches = doc.querySelectorAll('#themePicker .theme-swatch');
    const activeSwatches = Array.from(swatches).filter(s => s.classList.contains('active'));
    expect(activeSwatches.length).toBe(1);
    expect(activeSwatches[0].dataset.theme).toBe('black');
  });
});

// ============================================================
// Text color adjustment
// ============================================================
describe('text color adjustment', () => {

  test('white theme: reader content has dark text', () => {
    doc.querySelector('[data-theme="white"]').click();
    const style = doc.getElementById('readerScreen').style;
    expect(style.color).toBe('rgb(45, 42, 36)');
  });

  test('black theme: reader content has light text', () => {
    doc.querySelector('[data-theme="black"]').click();
    const style = doc.getElementById('readerScreen').style;
    expect(style.color).toBe('rgb(212, 212, 212)');
  });

  test('brown theme: reader content has dark text', () => {
    doc.querySelector('[data-theme="brown"]').click();
    const style = doc.getElementById('readerScreen').style;
    expect(style.color).toBe('rgb(45, 42, 36)');
  });

  test('green theme: reader content has dark green text', () => {
    doc.querySelector('[data-theme="green"]').click();
    const style = doc.getElementById('readerScreen').style;
    expect(style.color).toBe('rgb(27, 58, 27)');
  });
});

// ============================================================
// Background color application
// ============================================================
describe('background color application', () => {

  test('white theme sets background to white', () => {
    doc.querySelector('[data-theme="white"]').click();
    expect(doc.getElementById('readerScreen').style.backgroundColor).toBe('rgb(255, 255, 255)');
  });

  test('black theme sets background to dark', () => {
    doc.querySelector('[data-theme="black"]').click();
    expect(doc.getElementById('readerScreen').style.backgroundColor).toBe('rgb(26, 26, 26)');
  });

  test('brown theme sets background to sepia', () => {
    doc.querySelector('[data-theme="brown"]').click();
    expect(doc.getElementById('readerScreen').style.backgroundColor).toBe('rgb(245, 240, 232)');
  });

  test('green theme sets background to light green', () => {
    doc.querySelector('[data-theme="green"]').click();
    expect(doc.getElementById('readerScreen').style.backgroundColor).toBe('rgb(232, 245, 233)');
  });
});

// ============================================================
// Persistence
// ============================================================
describe('theme persistence', () => {

  test('selected theme is saved to localStorage', () => {
    doc.querySelector('[data-theme="black"]').click();
    expect(win.localStorage.getItem('reader-theme')).toBe('black');
  });

  test('saved theme is restored on load', () => {
    // Close and rebuild with a saved theme
    dom.window.close();
    ({ dom, doc, win } = buildDOM());
    win.localStorage.setItem('reader-theme', 'green');
    loadReaderJS(win);
    enterReadingMode(doc, win);
    renderTestPage(doc, win);

    expect(doc.getElementById('readerScreen').dataset.theme).toBe('green');
    expect(doc.getElementById('readerScreen').style.backgroundColor).toBe('rgb(232, 245, 233)');
  });

  test('invalid saved theme falls back to brown', () => {
    dom.window.close();
    ({ dom, doc, win } = buildDOM());
    win.localStorage.setItem('reader-theme', 'rainbow');
    loadReaderJS(win);
    enterReadingMode(doc, win);
    renderTestPage(doc, win);

    expect(doc.getElementById('readerScreen').dataset.theme).toBe('brown');
  });
});

// ============================================================
// State tracking
// ============================================================
describe('theme state', () => {

  test('state.theme reflects the current theme', () => {
    doc.querySelector('[data-theme="black"]').click();
    expect(win._readerState.theme).toBe('black');
  });

  test('setTheme function is exposed on window', () => {
    expect(typeof win.setTheme).toBe('function');
  });

  test('calling setTheme programmatically applies the theme', () => {
    win.setTheme('green');
    expect(doc.getElementById('readerScreen').dataset.theme).toBe('green');
    expect(win._readerState.theme).toBe('green');
  });
});

// ============================================================
// Paragraph background adapts to theme
// ============================================================
describe('paragraph background adapts to theme', () => {

  test('white theme: paragraphs get white-appropriate background', () => {
    doc.querySelector('[data-theme="white"]').click();
    const para = doc.querySelector('.paragraph');
    expect(para.style.background).toBe('rgb(245, 245, 245)');
  });

  test('black theme: paragraphs get dark background', () => {
    doc.querySelector('[data-theme="black"]').click();
    const para = doc.querySelector('.paragraph');
    expect(para.style.background).toBe('rgb(35, 35, 35)');
  });

  test('brown theme: paragraphs get sepia background', () => {
    doc.querySelector('[data-theme="brown"]').click();
    const para = doc.querySelector('.paragraph');
    expect(para.style.background).toBe('rgb(250, 248, 244)');
  });

  test('green theme: paragraphs get light green background', () => {
    doc.querySelector('[data-theme="green"]').click();
    const para = doc.querySelector('.paragraph');
    expect(para.style.background).toBe('rgb(214, 237, 216)');
  });

  test('black theme: paragraph border-left adapts', () => {
    doc.querySelector('[data-theme="black"]').click();
    const para = doc.querySelector('.paragraph');
    expect(para.style.borderLeftColor).toBe('rgb(68, 68, 68)');
  });

  test('white theme: paragraph border-left adapts', () => {
    doc.querySelector('[data-theme="white"]').click();
    const para = doc.querySelector('.paragraph');
    expect(para.style.borderLeftColor).toBe('rgb(214, 214, 214)');
  });

  test('paragraphs update when switching themes', () => {
    doc.querySelector('[data-theme="black"]').click();
    const para = doc.querySelector('.paragraph');
    expect(para.style.background).toBe('rgb(35, 35, 35)');

    doc.querySelector('[data-theme="white"]').click();
    expect(para.style.background).toBe('rgb(245, 245, 245)');
  });

  test('top bar background adapts to black theme', () => {
    doc.querySelector('[data-theme="black"]').click();
    const topBar = doc.querySelector('.top-bar');
    expect(topBar.style.background).toBe('rgb(30, 30, 30)');
  });

  test('bottom bar background adapts to black theme', () => {
    doc.querySelector('[data-theme="black"]').click();
    const bottomBar = doc.querySelector('.bottom-bar');
    expect(bottomBar.style.background).toBe('rgb(30, 30, 30)');
  });

  test('top bar background adapts to white theme', () => {
    doc.querySelector('[data-theme="white"]').click();
    const topBar = doc.querySelector('.top-bar');
    expect(topBar.style.background).toBe('rgb(255, 255, 255)');
  });

  test('newly rendered pages pick up the current theme', () => {
    doc.querySelector('[data-theme="black"]').click();
    // Re-render
    win.goToPage(0);
    const para = doc.querySelector('.paragraph');
    expect(para.style.background).toBe('rgb(35, 35, 35)');
  });
});

// ============================================================
// Selection highlight contrast on dark backgrounds
// ============================================================
describe('selection highlight contrast', () => {

  const css = fs.readFileSync(path.join(__dirname, 'reader.css'), 'utf-8');

  test('dark theme has a distinct sentence active highlight', () => {
    const match = css.match(/\[data-theme="black"\].*\.sentence\.active\s*\{[^}]*background:\s*(#[0-9a-fA-F]+)/s);
    expect(match).toBeTruthy();
    // Should NOT be the same as the light default (#fde68a)
    expect(match[1]).not.toBe('#fde68a');
  });

  test('dark theme has a distinct sentence hover highlight', () => {
    const match = css.match(/\[data-theme="black"\].*\.sentence\.hover-active\s*\{[^}]*background:\s*(#[0-9a-fA-F]+)/s);
    expect(match).toBeTruthy();
    expect(match[1]).not.toBe('#e8dcc8');
  });

  test('dark theme has a distinct word hover highlight', () => {
    const match = css.match(/\[data-theme="black"\].*\.word\.hover-active\s*\{[^}]*background:\s*(#[0-9a-fA-F]+)/s);
    expect(match).toBeTruthy();
    expect(match[1]).not.toBe('#c7d2fe');
  });

  test('dark theme has a distinct search highlight', () => {
    const match = css.match(/\[data-theme="black"\].*\.search-highlight\s*\{[^}]*background:\s*(#[0-9a-fA-F]+)/s);
    expect(match).toBeTruthy();
    expect(match[1]).not.toBe('#fde68a');
  });

  test('dark theme sentence active sets contrasting text color', () => {
    const match = css.match(/\[data-theme="black"\].*\.sentence\.active\s*\{[^}]*color:\s*(#[0-9a-fA-F]+)/s);
    expect(match).toBeTruthy();
  });
});
