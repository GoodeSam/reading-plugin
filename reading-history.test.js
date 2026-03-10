/**
 * TDD tests for reading history tracking.
 *
 * Behaviour:
 *  - Automatically saves reading position (fileName, page, scrollTop, date)
 *    when the tab/browser closes (beforeunload) or becomes hidden (visibilitychange).
 *  - Stores history in localStorage under 'reader-history' key.
 *  - Displays history entries for the current file as clickable links in a
 *    sidebar panel, allowing the user to jump to previously-read positions.
 *  - Caps history at a maximum number of entries.
 *  - Deduplicates entries for the same file+page, keeping the latest.
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

  // Stub chrome.storage
  win.chrome = { storage: { local: { get: (keys, cb) => cb({}) } } };

  // Provide innerHeight/innerWidth
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

// --------------- tests ---------------

let dom, doc, win;

beforeEach(() => {
  jest.useFakeTimers();
  ({ dom, doc, win } = buildDOM());
  loadReaderJS(win);
  enterReadingMode(doc, win);
});

afterEach(() => {
  jest.useRealTimers();
  dom.window.close();
});

describe('reading history — persistence', () => {

  test('saveReadingHistory() stores an entry in localStorage', () => {
    setReaderState(win, { fileName: 'test.pdf', currentPage: 3, totalPages: 10 });
    // Simulate a scrollTop value
    doc.getElementById('readerContent').scrollTop = 150;

    win.saveReadingHistory();

    const raw = win.localStorage.getItem('reader-history');
    expect(raw).toBeTruthy();
    const history = JSON.parse(raw);
    expect(history.length).toBe(1);
    expect(history[0].fileName).toBe('test.pdf');
    expect(history[0].page).toBe(3);
    expect(history[0].scrollTop).toBe(150);
    expect(history[0].totalPages).toBe(10);
    expect(history[0].date).toBeDefined();
  });

  test('history entry contains an ISO date string', () => {
    setReaderState(win, { fileName: 'book.epub', currentPage: 0, totalPages: 5 });
    win.saveReadingHistory();

    const history = JSON.parse(win.localStorage.getItem('reader-history'));
    // Should be a valid date string
    expect(isNaN(Date.parse(history[0].date))).toBe(false);
  });

  test('does not save if no file is open (empty fileName)', () => {
    setReaderState(win, { fileName: '', currentPage: 0, totalPages: 0 });
    win.saveReadingHistory();

    const raw = win.localStorage.getItem('reader-history');
    // Should be null or an empty array
    const history = raw ? JSON.parse(raw) : [];
    expect(history.length).toBe(0);
  });

  test('deduplicates entries for the same file+page, keeping the latest', () => {
    setReaderState(win, { fileName: 'test.pdf', currentPage: 2, totalPages: 10 });
    doc.getElementById('readerContent').scrollTop = 100;
    win.saveReadingHistory();

    // Save again with different scroll but same file+page
    doc.getElementById('readerContent').scrollTop = 250;
    win.saveReadingHistory();

    const history = JSON.parse(win.localStorage.getItem('reader-history'));
    const matching = history.filter(h => h.fileName === 'test.pdf' && h.page === 2);
    expect(matching.length).toBe(1);
    expect(matching[0].scrollTop).toBe(250);
  });

  test('keeps entries for different pages of the same file', () => {
    setReaderState(win, { fileName: 'test.pdf', currentPage: 1, totalPages: 10 });
    win.saveReadingHistory();

    setReaderState(win, { currentPage: 5 });
    win.saveReadingHistory();

    const history = JSON.parse(win.localStorage.getItem('reader-history'));
    const matching = history.filter(h => h.fileName === 'test.pdf');
    expect(matching.length).toBe(2);
  });

  test('caps history at MAX_HISTORY_ENTRIES (50)', () => {
    for (let i = 0; i < 60; i++) {
      setReaderState(win, { fileName: `file-${i}.pdf`, currentPage: 0, totalPages: 1 });
      win.saveReadingHistory();
    }

    const history = JSON.parse(win.localStorage.getItem('reader-history'));
    expect(history.length).toBe(50);
    // Most recent entries kept (file-59 should be present, file-0 should be dropped)
    expect(history.some(h => h.fileName === 'file-59.pdf')).toBe(true);
    expect(history.some(h => h.fileName === 'file-0.pdf')).toBe(false);
  });
});

describe('reading history — auto-save triggers', () => {

  test('saves history on beforeunload', () => {
    setReaderState(win, { fileName: 'book.epub', currentPage: 7, totalPages: 20 });
    doc.getElementById('readerContent').scrollTop = 300;

    win.dispatchEvent(new win.Event('beforeunload'));

    const history = JSON.parse(win.localStorage.getItem('reader-history'));
    expect(history.length).toBe(1);
    expect(history[0].fileName).toBe('book.epub');
    expect(history[0].page).toBe(7);
  });

  test('saves history on visibilitychange when hidden', () => {
    setReaderState(win, { fileName: 'novel.pdf', currentPage: 4, totalPages: 15 });

    // Simulate visibilitychange to hidden
    Object.defineProperty(doc, 'visibilityState', { value: 'hidden', configurable: true });
    doc.dispatchEvent(new win.Event('visibilitychange'));

    const history = JSON.parse(win.localStorage.getItem('reader-history'));
    expect(history.length).toBe(1);
    expect(history[0].fileName).toBe('novel.pdf');
  });

  test('does NOT save on visibilitychange when visible', () => {
    setReaderState(win, { fileName: 'novel.pdf', currentPage: 4, totalPages: 15 });

    Object.defineProperty(doc, 'visibilityState', { value: 'visible', configurable: true });
    doc.dispatchEvent(new win.Event('visibilitychange'));

    const raw = win.localStorage.getItem('reader-history');
    const history = raw ? JSON.parse(raw) : [];
    expect(history.length).toBe(0);
  });
});

describe('reading history — sidebar panel UI', () => {

  test('history panel exists in the DOM', () => {
    expect(doc.getElementById('historyPanel')).toBeTruthy();
    expect(doc.getElementById('historyToggle')).toBeTruthy();
  });

  test('history toggle button is visible in reading mode', () => {
    const toggle = doc.getElementById('historyToggle');
    expect(toggle.classList.contains('visible')).toBe(true);
  });

  test('clicking toggle opens the history panel', () => {
    const toggle = doc.getElementById('historyToggle');
    const panel = doc.getElementById('historyPanel');
    expect(panel.classList.contains('active')).toBe(false);

    toggle.click();
    expect(panel.classList.contains('active')).toBe(true);
  });

  test('clicking toggle again closes the panel', () => {
    const toggle = doc.getElementById('historyToggle');
    const panel = doc.getElementById('historyPanel');

    toggle.click(); // open
    toggle.click(); // close
    expect(panel.classList.contains('active')).toBe(false);
  });

  test('clicking close button closes the panel', () => {
    const toggle = doc.getElementById('historyToggle');
    const panel = doc.getElementById('historyPanel');
    const closeBtn = doc.getElementById('historyClose');

    toggle.click();
    expect(panel.classList.contains('active')).toBe(true);

    closeBtn.click();
    expect(panel.classList.contains('active')).toBe(false);
  });
});

describe('reading history — rendering entries', () => {

  test('renderHistory() shows entries for the current file only', () => {
    // Seed localStorage with mixed entries
    const entries = [
      { fileName: 'book-a.pdf', page: 0, scrollTop: 0, totalPages: 5, date: new Date().toISOString() },
      { fileName: 'book-a.pdf', page: 2, scrollTop: 100, totalPages: 5, date: new Date().toISOString() },
      { fileName: 'book-b.epub', page: 1, scrollTop: 50, totalPages: 3, date: new Date().toISOString() },
    ];
    win.localStorage.setItem('reader-history', JSON.stringify(entries));
    setReaderState(win, { fileName: 'book-a.pdf' });

    win.renderHistory();

    const items = doc.getElementById('historyList').querySelectorAll('.history-item');
    expect(items.length).toBe(2);
  });

  test('history items display page number and date', () => {
    const date = '2026-03-10T14:30:00.000Z';
    const entries = [
      { fileName: 'book.pdf', page: 5, scrollTop: 120, totalPages: 20, date },
    ];
    win.localStorage.setItem('reader-history', JSON.stringify(entries));
    setReaderState(win, { fileName: 'book.pdf' });

    win.renderHistory();

    const item = doc.getElementById('historyList').querySelector('.history-item');
    expect(item).toBeTruthy();
    // Should contain page info (displayed as 1-indexed)
    expect(item.textContent).toContain('Page 6');
  });

  test('shows empty state when no history for current file', () => {
    setReaderState(win, { fileName: 'no-history.pdf' });
    win.renderHistory();

    const list = doc.getElementById('historyList');
    expect(list.textContent).toContain('No reading history');
  });

  test('entries are sorted by date descending (most recent first)', () => {
    const entries = [
      { fileName: 'book.pdf', page: 1, scrollTop: 0, totalPages: 10, date: '2026-03-08T10:00:00.000Z' },
      { fileName: 'book.pdf', page: 5, scrollTop: 0, totalPages: 10, date: '2026-03-10T10:00:00.000Z' },
      { fileName: 'book.pdf', page: 3, scrollTop: 0, totalPages: 10, date: '2026-03-09T10:00:00.000Z' },
    ];
    win.localStorage.setItem('reader-history', JSON.stringify(entries));
    setReaderState(win, { fileName: 'book.pdf' });

    win.renderHistory();

    const items = doc.getElementById('historyList').querySelectorAll('.history-item');
    // First item should be the most recent (page 5)
    expect(items[0].textContent).toContain('Page 6');
    expect(items[1].textContent).toContain('Page 4');
    expect(items[2].textContent).toContain('Page 2');
  });
});

describe('reading history — navigation via click', () => {

  test('clicking a history item calls goToPage and restores scrollTop', () => {
    const entries = [
      { fileName: 'book.pdf', page: 7, scrollTop: 200, totalPages: 20, date: new Date().toISOString() },
    ];
    win.localStorage.setItem('reader-history', JSON.stringify(entries));

    // Set up state so goToPage won't bail (need pages array)
    setReaderState(win, {
      fileName: 'book.pdf',
      totalPages: 20,
      pages: Array.from({ length: 20 }, () => [{ text: 'Hello world.', sentences: ['Hello world.'] }]),
    });

    win.renderHistory();

    const item = doc.getElementById('historyList').querySelector('.history-item');
    item.click();

    // After click, currentPage should be 7
    expect(win._readerState.currentPage).toBe(7);
  });
});

describe('reading history — clear history', () => {

  test('clearHistory() removes entries for current file only', () => {
    const entries = [
      { fileName: 'book-a.pdf', page: 0, scrollTop: 0, totalPages: 5, date: new Date().toISOString() },
      { fileName: 'book-b.epub', page: 1, scrollTop: 50, totalPages: 3, date: new Date().toISOString() },
    ];
    win.localStorage.setItem('reader-history', JSON.stringify(entries));
    setReaderState(win, { fileName: 'book-a.pdf' });

    win.clearHistory();

    const history = JSON.parse(win.localStorage.getItem('reader-history'));
    expect(history.length).toBe(1);
    expect(history[0].fileName).toBe('book-b.epub');
  });
});
