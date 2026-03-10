/**
 * TDD tests for word list feature.
 *
 * Behaviour:
 *  - Every word looked up via the word popup is recorded in a word list.
 *  - Each entry stores: word, queryCount, englishDef, chineseDef, pronunciation,
 *    and the book it was queried from.
 *  - If the same word is queried again, queryCount increments and definitions update.
 *  - Word list is persisted in localStorage under 'reader-wordlist'.
 *  - A sidebar panel displays the word list for the current book, sorted by
 *    queryCount descending (most queried first).
 *  - The word list is exportable as a Markdown file.
 *  - Individual words can be deleted from the list.
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

describe('word list — recording words', () => {

  test('recordWord() stores a word entry in localStorage', () => {
    setReaderState(win, { fileName: 'book.pdf' });

    win.recordWord({
      word: 'ephemeral',
      englishDef: '(adj.) lasting a very short time',
      chineseDef: '\u77ed\u6682\u7684',
      pronunciation: '/\u026a\u02c8f\u025bm\u0259r\u0259l/',
    });

    const raw = win.localStorage.getItem('reader-wordlist');
    expect(raw).toBeTruthy();
    const list = JSON.parse(raw);
    expect(list.length).toBe(1);
    expect(list[0].word).toBe('ephemeral');
    expect(list[0].englishDef).toBe('(adj.) lasting a very short time');
    expect(list[0].chineseDef).toBe('\u77ed\u6682\u7684');
    expect(list[0].pronunciation).toBe('/\u026a\u02c8f\u025bm\u0259r\u0259l/');
    expect(list[0].queryCount).toBe(1);
    expect(list[0].book).toBe('book.pdf');
  });

  test('querying the same word again increments queryCount', () => {
    setReaderState(win, { fileName: 'book.pdf' });

    win.recordWord({ word: 'ubiquitous', englishDef: 'def1', chineseDef: 'cn1', pronunciation: 'p1' });
    win.recordWord({ word: 'ubiquitous', englishDef: 'def2', chineseDef: 'cn2', pronunciation: 'p2' });

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    const matches = list.filter(w => w.word === 'ubiquitous' && w.book === 'book.pdf');
    expect(matches.length).toBe(1);
    expect(matches[0].queryCount).toBe(2);
    // Definitions should update to latest
    expect(matches[0].englishDef).toBe('def2');
    expect(matches[0].chineseDef).toBe('cn2');
    expect(matches[0].pronunciation).toBe('p2');
  });

  test('same word in different books creates separate entries', () => {
    setReaderState(win, { fileName: 'book-a.pdf' });
    win.recordWord({ word: 'novel', englishDef: 'def-a', chineseDef: 'cn-a', pronunciation: 'p-a' });

    setReaderState(win, { fileName: 'book-b.pdf' });
    win.recordWord({ word: 'novel', englishDef: 'def-b', chineseDef: 'cn-b', pronunciation: 'p-b' });

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    expect(list.length).toBe(2);
    expect(list.filter(w => w.word === 'novel').length).toBe(2);
  });

  test('word matching is case-insensitive', () => {
    setReaderState(win, { fileName: 'book.pdf' });

    win.recordWord({ word: 'Apple', englishDef: 'def1', chineseDef: 'cn1', pronunciation: 'p1' });
    win.recordWord({ word: 'apple', englishDef: 'def2', chineseDef: 'cn2', pronunciation: 'p2' });

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    const apples = list.filter(w => w.word.toLowerCase() === 'apple' && w.book === 'book.pdf');
    expect(apples.length).toBe(1);
    expect(apples[0].queryCount).toBe(2);
  });

  test('records date of last query', () => {
    setReaderState(win, { fileName: 'book.pdf' });
    win.recordWord({ word: 'test', englishDef: 'e', chineseDef: 'c', pronunciation: 'p' });

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    expect(list[0].lastQueried).toBeDefined();
    expect(isNaN(Date.parse(list[0].lastQueried))).toBe(false);
  });
});

describe('word list — sidebar panel UI', () => {

  test('word list panel and toggle exist in the DOM', () => {
    expect(doc.getElementById('wordListPanel')).toBeTruthy();
    expect(doc.getElementById('wordListToggle')).toBeTruthy();
  });

  test('toggle button is visible in reading mode', () => {
    const toggle = doc.getElementById('wordListToggle');
    expect(toggle.classList.contains('visible')).toBe(true);
  });

  test('clicking toggle opens the word list panel', () => {
    const toggle = doc.getElementById('wordListToggle');
    const panel = doc.getElementById('wordListPanel');
    expect(panel.classList.contains('active')).toBe(false);

    toggle.click();
    expect(panel.classList.contains('active')).toBe(true);
  });

  test('clicking close button closes the panel', () => {
    const toggle = doc.getElementById('wordListToggle');
    const panel = doc.getElementById('wordListPanel');
    const closeBtn = doc.getElementById('wordListClose');

    toggle.click();
    expect(panel.classList.contains('active')).toBe(true);

    closeBtn.click();
    expect(panel.classList.contains('active')).toBe(false);
  });
});

describe('word list — rendering', () => {

  test('renderWordList() shows only words for the current book', () => {
    const words = [
      { word: 'alpha', queryCount: 2, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', book: 'book-a.pdf', lastQueried: new Date().toISOString() },
      { word: 'beta', queryCount: 1, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', book: 'book-b.pdf', lastQueried: new Date().toISOString() },
      { word: 'gamma', queryCount: 3, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', book: 'book-a.pdf', lastQueried: new Date().toISOString() },
    ];
    win.localStorage.setItem('reader-wordlist', JSON.stringify(words));
    setReaderState(win, { fileName: 'book-a.pdf' });

    win.renderWordList();

    const items = doc.getElementById('wordListEntries').querySelectorAll('.wordlist-item');
    expect(items.length).toBe(2);
  });

  test('words are sorted by queryCount descending', () => {
    const words = [
      { word: 'rare', queryCount: 1, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', book: 'test.pdf', lastQueried: new Date().toISOString() },
      { word: 'common', queryCount: 5, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', book: 'test.pdf', lastQueried: new Date().toISOString() },
      { word: 'medium', queryCount: 3, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', book: 'test.pdf', lastQueried: new Date().toISOString() },
    ];
    win.localStorage.setItem('reader-wordlist', JSON.stringify(words));
    setReaderState(win, { fileName: 'test.pdf' });

    win.renderWordList();

    const items = doc.getElementById('wordListEntries').querySelectorAll('.wordlist-item');
    expect(items[0].querySelector('.wordlist-word').textContent).toContain('common');
    expect(items[1].querySelector('.wordlist-word').textContent).toContain('medium');
    expect(items[2].querySelector('.wordlist-word').textContent).toContain('rare');
  });

  test('each item shows word, pronunciation, query count, and Chinese definition', () => {
    const words = [
      { word: 'serendipity', queryCount: 4, englishDef: '(n.) happy accident', chineseDef: '\u610f\u5916\u53d1\u73b0', pronunciation: '/\u02ccser.\u0259n\u02c8d\u026ap.\u0259.ti/', book: 'test.pdf', lastQueried: new Date().toISOString() },
    ];
    win.localStorage.setItem('reader-wordlist', JSON.stringify(words));
    setReaderState(win, { fileName: 'test.pdf' });

    win.renderWordList();

    const item = doc.getElementById('wordListEntries').querySelector('.wordlist-item');
    expect(item.textContent).toContain('serendipity');
    expect(item.textContent).toContain('/\u02ccser.\u0259n\u02c8d\u026ap.\u0259.ti/');
    expect(item.textContent).toContain('4');
    expect(item.textContent).toContain('\u610f\u5916\u53d1\u73b0');
  });

  test('shows empty state when no words for current book', () => {
    setReaderState(win, { fileName: 'empty.pdf' });
    win.renderWordList();

    const entries = doc.getElementById('wordListEntries');
    expect(entries.textContent).toContain('No words');
  });
});

describe('word list — delete', () => {

  test('deleteWordFromList() removes a specific word entry', () => {
    const words = [
      { word: 'keep', queryCount: 1, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', book: 'test.pdf', lastQueried: new Date().toISOString() },
      { word: 'remove', queryCount: 2, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', book: 'test.pdf', lastQueried: new Date().toISOString() },
    ];
    win.localStorage.setItem('reader-wordlist', JSON.stringify(words));
    setReaderState(win, { fileName: 'test.pdf' });

    win.deleteWordFromList('remove', 'test.pdf');

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    expect(list.length).toBe(1);
    expect(list[0].word).toBe('keep');
  });

  test('delete only removes the entry for the matching book', () => {
    const words = [
      { word: 'shared', queryCount: 1, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', book: 'book-a.pdf', lastQueried: new Date().toISOString() },
      { word: 'shared', queryCount: 3, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', book: 'book-b.pdf', lastQueried: new Date().toISOString() },
    ];
    win.localStorage.setItem('reader-wordlist', JSON.stringify(words));

    win.deleteWordFromList('shared', 'book-a.pdf');

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    expect(list.length).toBe(1);
    expect(list[0].book).toBe('book-b.pdf');
  });
});

describe('word list — export', () => {

  test('exportWordList() generates markdown content with all fields', () => {
    const words = [
      { word: 'ephemeral', queryCount: 3, englishDef: '(adj.) lasting a very short time', chineseDef: '\u77ed\u6682\u7684', pronunciation: '/\u026a\u02c8f\u025bm\u0259r\u0259l/', book: 'mybook.pdf', lastQueried: '2026-03-10T14:30:00.000Z' },
      { word: 'ubiquitous', queryCount: 1, englishDef: '(adj.) present everywhere', chineseDef: '\u65e0\u5904\u4e0d\u5728\u7684', pronunciation: '/ju\u02d0\u02c8b\u026ak.w\u026a.t\u0259s/', book: 'mybook.pdf', lastQueried: '2026-03-10T15:00:00.000Z' },
    ];
    win.localStorage.setItem('reader-wordlist', JSON.stringify(words));
    setReaderState(win, { fileName: 'mybook.pdf' });

    // Capture the blob content by stubbing URL.createObjectURL and <a>.click
    let capturedBlob = null;
    win.URL.createObjectURL = (blob) => { capturedBlob = blob; return 'blob:fake'; };
    win.URL.revokeObjectURL = () => {};

    // Stub the click on the anchor
    const origCreateElement = doc.createElement.bind(doc);
    let downloadName = '';
    doc.createElement = (tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        el.click = () => {};
        const origSet = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'download') || {};
        Object.defineProperty(el, 'download', {
          set(v) { downloadName = v; },
          get() { return downloadName; },
        });
      }
      return el;
    };

    win.exportWordList();

    expect(capturedBlob).toBeTruthy();

    // Read blob content synchronously via arrayBuffer
    return capturedBlob.text().then((text) => {
      expect(text).toContain('# Word List: mybook.pdf');
      expect(text).toContain('ephemeral');
      expect(text).toContain('/\u026a\u02c8f\u025bm\u0259r\u0259l/');
      expect(text).toContain('\u77ed\u6682\u7684');
      expect(text).toContain('3'); // queryCount
      expect(text).toContain('ubiquitous');
      // Sorted by queryCount desc in export too
      const ephIdx = text.indexOf('ephemeral');
      const ubiIdx = text.indexOf('ubiquitous');
      expect(ephIdx).toBeLessThan(ubiIdx);
    });
  });

  test('exportWordList() does nothing when word list is empty', () => {
    setReaderState(win, { fileName: 'empty.pdf' });

    let blobCreated = false;
    win.URL.createObjectURL = () => { blobCreated = true; return 'blob:fake'; };

    win.exportWordList();

    expect(blobCreated).toBe(false);
  });
});

describe('word list — integration with lookupWord', () => {

  test('lookupWord records the word after receiving API result', async () => {
    setReaderState(win, { fileName: 'test.pdf', apiKey: 'test-key' });

    // Stub callOpenAI to return a formatted result with pronunciation
    win._stubCallOpenAI = async () => 'EN: (adj.) lasting a very short time\nCN: \u77ed\u6682\u7684\nPRON: /\u026a\u02c8f\u025bm\u0259r\u0259l/';

    await win.lookupWord('ephemeral', 'It was an ephemeral moment.');

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    expect(list.length).toBe(1);
    expect(list[0].word).toBe('ephemeral');
    expect(list[0].englishDef).toBe('(adj.) lasting a very short time');
    expect(list[0].chineseDef).toBe('\u77ed\u6682\u7684');
    expect(list[0].pronunciation).toBe('/\u026a\u02c8f\u025bm\u0259r\u0259l/');
    expect(list[0].queryCount).toBe(1);
  });

  test('lookupWord increments count when querying same word again', async () => {
    setReaderState(win, { fileName: 'test.pdf', apiKey: 'test-key' });

    win._stubCallOpenAI = async () => 'EN: (adj.) short-lived\nCN: \u77ed\u6682\u7684\nPRON: /\u026a\u02c8f\u025bm\u0259r\u0259l/';

    await win.lookupWord('ephemeral', 'context 1');
    await win.lookupWord('ephemeral', 'context 2');

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    expect(list.filter(w => w.word === 'ephemeral').length).toBe(1);
    expect(list[0].queryCount).toBe(2);
  });
});
