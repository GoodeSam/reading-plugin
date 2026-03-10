/**
 * TDD tests for page selection functionality.
 *
 * Behaviour:
 *  - Clicking the page indicator ("3 / 20") in the bottom bar turns it into
 *    a number input pre-filled with the current page number.
 *  - The user types a page number and presses Enter to jump to that page.
 *  - Pressing Escape or blurring the input cancels editing and restores the label.
 *  - Invalid input (out of range, non-numeric) is rejected; the indicator reverts.
 *  - The input field is styled to blend into the bottom bar.
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
    { text: 'Hello world.', sentences: ['Hello world.'] }
  ]);
}

// --------------- tests ---------------

let dom, doc, win;

beforeEach(() => {
  jest.useFakeTimers();
  ({ dom, doc, win } = buildDOM());
  loadReaderJS(win);
  enterReadingMode(doc, win);

  // Set up a 20-page book on page 3 (0-indexed)
  const pages = makeDummyPages(20);
  setReaderState(win, {
    fileName: 'book.pdf',
    pages,
    totalPages: 20,
    currentPage: 2,
  });
  // Call updateNav to set the indicator text
  win.goToPage(2);
});

afterEach(() => {
  jest.useRealTimers();
  dom.window.close();
});

describe('page selection — click to edit', () => {

  test('clicking the page indicator replaces it with an input field', () => {
    const indicator = doc.getElementById('pageIndicator');
    indicator.click();

    const input = doc.getElementById('pageSelectInput');
    expect(input).toBeTruthy();
    expect(input.tagName).toBe('INPUT');
  });

  test('the input is pre-filled with the current page number (1-indexed)', () => {
    const indicator = doc.getElementById('pageIndicator');
    indicator.click();

    const input = doc.getElementById('pageSelectInput');
    expect(input.value).toBe('3');
  });

  test('the indicator span is hidden while input is visible', () => {
    const indicator = doc.getElementById('pageIndicator');
    indicator.click();

    expect(indicator.style.display).toBe('none');
    const input = doc.getElementById('pageSelectInput');
    expect(input).toBeTruthy();
  });

  test('clicking indicator when already editing does not create duplicate input', () => {
    const indicator = doc.getElementById('pageIndicator');
    indicator.click();
    indicator.click(); // second click should be no-op

    const inputs = doc.querySelectorAll('#pageSelectInput');
    expect(inputs.length).toBe(1);
  });
});

describe('page selection — confirming with Enter', () => {

  test('pressing Enter with a valid page number navigates to that page', () => {
    const indicator = doc.getElementById('pageIndicator');
    indicator.click();

    const input = doc.getElementById('pageSelectInput');
    input.value = '10';
    input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // Should navigate to page 10 (0-indexed: 9)
    expect(win._readerState.currentPage).toBe(9);
    // Input should be removed, indicator restored
    expect(doc.getElementById('pageSelectInput')).toBeFalsy();
    expect(indicator.style.display).not.toBe('none');
    expect(indicator.textContent).toBe('10 / 20');
  });

  test('pressing Enter with page 1 navigates to the first page', () => {
    const indicator = doc.getElementById('pageIndicator');
    indicator.click();

    const input = doc.getElementById('pageSelectInput');
    input.value = '1';
    input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(win._readerState.currentPage).toBe(0);
  });

  test('pressing Enter with the last page navigates correctly', () => {
    const indicator = doc.getElementById('pageIndicator');
    indicator.click();

    const input = doc.getElementById('pageSelectInput');
    input.value = '20';
    input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(win._readerState.currentPage).toBe(19);
  });
});

describe('page selection — cancelling', () => {

  test('pressing Escape cancels editing and restores the indicator', () => {
    const indicator = doc.getElementById('pageIndicator');
    indicator.click();

    const input = doc.getElementById('pageSelectInput');
    input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(doc.getElementById('pageSelectInput')).toBeFalsy();
    expect(indicator.style.display).not.toBe('none');
    // Page should not change
    expect(win._readerState.currentPage).toBe(2);
  });

  test('blurring the input cancels editing', () => {
    const indicator = doc.getElementById('pageIndicator');
    indicator.click();

    const input = doc.getElementById('pageSelectInput');
    input.dispatchEvent(new win.Event('blur'));

    expect(doc.getElementById('pageSelectInput')).toBeFalsy();
    expect(indicator.style.display).not.toBe('none');
    expect(win._readerState.currentPage).toBe(2);
  });
});

describe('page selection — invalid input', () => {

  test('page number 0 is rejected, stays on current page', () => {
    const indicator = doc.getElementById('pageIndicator');
    indicator.click();

    const input = doc.getElementById('pageSelectInput');
    input.value = '0';
    input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(win._readerState.currentPage).toBe(2);
    expect(doc.getElementById('pageSelectInput')).toBeFalsy();
  });

  test('page number exceeding total pages is rejected', () => {
    const indicator = doc.getElementById('pageIndicator');
    indicator.click();

    const input = doc.getElementById('pageSelectInput');
    input.value = '21';
    input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(win._readerState.currentPage).toBe(2);
    expect(doc.getElementById('pageSelectInput')).toBeFalsy();
  });

  test('negative page number is rejected', () => {
    const indicator = doc.getElementById('pageIndicator');
    indicator.click();

    const input = doc.getElementById('pageSelectInput');
    input.value = '-5';
    input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(win._readerState.currentPage).toBe(2);
  });

  test('non-numeric input is rejected', () => {
    const indicator = doc.getElementById('pageIndicator');
    indicator.click();

    const input = doc.getElementById('pageSelectInput');
    input.value = 'abc';
    input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(win._readerState.currentPage).toBe(2);
  });

  test('empty input is rejected', () => {
    const indicator = doc.getElementById('pageIndicator');
    indicator.click();

    const input = doc.getElementById('pageSelectInput');
    input.value = '';
    input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(win._readerState.currentPage).toBe(2);
  });

  test('decimal input is truncated to integer', () => {
    const indicator = doc.getElementById('pageIndicator');
    indicator.click();

    const input = doc.getElementById('pageSelectInput');
    input.value = '5.7';
    input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(win._readerState.currentPage).toBe(4);
  });
});

describe('page selection — goToPage is exposed for testing', () => {

  test('goToPage is accessible on window', () => {
    expect(typeof win.goToPage).toBe('function');
  });
});
