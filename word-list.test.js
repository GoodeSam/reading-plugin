/**
 * TDD tests for word list feature.
 *
 * Each entry stores: word, queryCount, englishDef, chineseDef, pronunciation,
 * sentenceContext, book, and lastQueried timestamp.
 *
 * Behaviour:
 *  - Every word looked up via the word popup is recorded in a word list.
 *  - If the same word is queried again, queryCount increments, definitions
 *    update, and sentenceContext is appended (no duplicates).
 *  - Word list is persisted in localStorage under 'reader-wordlist'.
 *  - A sidebar panel displays the word list for the current book, sorted by
 *    queryCount descending, showing word, pronunciation, count, query time,
 *    Chinese definition, and sentence context.
 *  - The word list is exportable as a Markdown file including all fields.
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

// ============================================================
// Recording
// ============================================================
describe('word list — recording words', () => {

  test('recordWord() stores a word entry with all fields', () => {
    setReaderState(win, { fileName: 'book.pdf' });

    win.recordWord({
      word: 'ephemeral',
      englishDef: '(adj.) lasting a very short time',
      chineseDef: '\u77ed\u6682\u7684',
      pronunciation: '/\u026a\u02c8f\u025bm\u0259r\u0259l/',
      sentenceContext: 'It was an ephemeral moment of joy.',
    });

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    expect(list.length).toBe(1);
    expect(list[0].word).toBe('ephemeral');
    expect(list[0].englishDef).toBe('(adj.) lasting a very short time');
    expect(list[0].chineseDef).toBe('\u77ed\u6682\u7684');
    expect(list[0].pronunciation).toBe('/\u026a\u02c8f\u025bm\u0259r\u0259l/');
    expect(list[0].queryCount).toBe(1);
    expect(list[0].book).toBe('book.pdf');
    expect(list[0].sentenceContext).toEqual(['It was an ephemeral moment of joy.']);
  });

  test('querying the same word again increments queryCount and updates defs', () => {
    setReaderState(win, { fileName: 'book.pdf' });

    win.recordWord({ word: 'ubiquitous', englishDef: 'def1', chineseDef: 'cn1', pronunciation: 'p1', sentenceContext: 'ctx1' });
    win.recordWord({ word: 'ubiquitous', englishDef: 'def2', chineseDef: 'cn2', pronunciation: 'p2', sentenceContext: 'ctx2' });

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    const matches = list.filter(w => w.word === 'ubiquitous' && w.book === 'book.pdf');
    expect(matches.length).toBe(1);
    expect(matches[0].queryCount).toBe(2);
    expect(matches[0].englishDef).toBe('def2');
    expect(matches[0].chineseDef).toBe('cn2');
    expect(matches[0].pronunciation).toBe('p2');
  });

  test('same word in different books creates separate entries', () => {
    setReaderState(win, { fileName: 'book-a.pdf' });
    win.recordWord({ word: 'novel', englishDef: 'def-a', chineseDef: 'cn-a', pronunciation: 'p-a', sentenceContext: 's-a' });

    setReaderState(win, { fileName: 'book-b.pdf' });
    win.recordWord({ word: 'novel', englishDef: 'def-b', chineseDef: 'cn-b', pronunciation: 'p-b', sentenceContext: 's-b' });

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    expect(list.length).toBe(2);
  });

  test('word matching is case-insensitive', () => {
    setReaderState(win, { fileName: 'book.pdf' });

    win.recordWord({ word: 'Apple', englishDef: 'def1', chineseDef: 'cn1', pronunciation: 'p1', sentenceContext: 's1' });
    win.recordWord({ word: 'apple', englishDef: 'def2', chineseDef: 'cn2', pronunciation: 'p2', sentenceContext: 's2' });

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    const apples = list.filter(w => w.word.toLowerCase() === 'apple' && w.book === 'book.pdf');
    expect(apples.length).toBe(1);
    expect(apples[0].queryCount).toBe(2);
  });

  test('records ISO date of last query', () => {
    setReaderState(win, { fileName: 'book.pdf' });
    win.recordWord({ word: 'test', englishDef: 'e', chineseDef: 'c', pronunciation: 'p', sentenceContext: 's' });

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    expect(list[0].lastQueried).toBeDefined();
    expect(isNaN(Date.parse(list[0].lastQueried))).toBe(false);
  });
});

// ============================================================
// Sentence context accumulation
// ============================================================
describe('word list — sentence context', () => {

  test('sentenceContext is stored as an array', () => {
    setReaderState(win, { fileName: 'book.pdf' });
    win.recordWord({ word: 'run', englishDef: 'e', chineseDef: 'c', pronunciation: 'p', sentenceContext: 'I run every morning.' });

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    expect(Array.isArray(list[0].sentenceContext)).toBe(true);
    expect(list[0].sentenceContext).toEqual(['I run every morning.']);
  });

  test('querying same word with a different sentence appends it', () => {
    setReaderState(win, { fileName: 'book.pdf' });
    win.recordWord({ word: 'run', englishDef: 'e', chineseDef: 'c', pronunciation: 'p', sentenceContext: 'I run every morning.' });
    win.recordWord({ word: 'run', englishDef: 'e', chineseDef: 'c', pronunciation: 'p', sentenceContext: 'He had to run the company.' });

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    expect(list[0].sentenceContext).toEqual([
      'I run every morning.',
      'He had to run the company.',
    ]);
  });

  test('duplicate sentences are not appended again', () => {
    setReaderState(win, { fileName: 'book.pdf' });
    win.recordWord({ word: 'run', englishDef: 'e', chineseDef: 'c', pronunciation: 'p', sentenceContext: 'Same sentence.' });
    win.recordWord({ word: 'run', englishDef: 'e', chineseDef: 'c', pronunciation: 'p', sentenceContext: 'Same sentence.' });

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    expect(list[0].sentenceContext).toEqual(['Same sentence.']);
    expect(list[0].queryCount).toBe(2);
  });

  test('empty sentenceContext string is not stored', () => {
    setReaderState(win, { fileName: 'book.pdf' });
    win.recordWord({ word: 'run', englishDef: 'e', chineseDef: 'c', pronunciation: 'p', sentenceContext: '' });

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    expect(list[0].sentenceContext).toEqual([]);
  });
});

// ============================================================
// Sidebar panel UI
// ============================================================
describe('word list — sidebar panel UI', () => {

  test('word list panel and toggle exist in the DOM', () => {
    expect(doc.getElementById('wordListPanel')).toBeTruthy();
    expect(doc.getElementById('wordListToggle')).toBeTruthy();
  });

  test('toggle button is visible in reading mode', () => {
    expect(doc.getElementById('wordListToggle').classList.contains('visible')).toBe(true);
  });

  test('clicking toggle opens the word list panel', () => {
    const toggle = doc.getElementById('wordListToggle');
    const panel = doc.getElementById('wordListPanel');
    toggle.click();
    expect(panel.classList.contains('active')).toBe(true);
  });

  test('clicking close button closes the panel', () => {
    doc.getElementById('wordListToggle').click();
    doc.getElementById('wordListClose').click();
    expect(doc.getElementById('wordListPanel').classList.contains('active')).toBe(false);
  });
});

// ============================================================
// Rendering
// ============================================================
describe('word list — rendering', () => {

  test('renderWordList() shows only words for the current book', () => {
    const words = [
      { word: 'alpha', queryCount: 2, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', sentenceContext: ['s'], book: 'book-a.pdf', lastQueried: new Date().toISOString() },
      { word: 'beta', queryCount: 1, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', sentenceContext: ['s'], book: 'book-b.pdf', lastQueried: new Date().toISOString() },
      { word: 'gamma', queryCount: 3, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', sentenceContext: ['s'], book: 'book-a.pdf', lastQueried: new Date().toISOString() },
    ];
    win.localStorage.setItem('reader-wordlist', JSON.stringify(words));
    setReaderState(win, { fileName: 'book-a.pdf' });

    win.renderWordList();

    const items = doc.getElementById('wordListEntries').querySelectorAll('.wordlist-item');
    expect(items.length).toBe(2);
  });

  test('words are sorted by queryCount descending', () => {
    const words = [
      { word: 'rare', queryCount: 1, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', sentenceContext: [], book: 'test.pdf', lastQueried: new Date().toISOString() },
      { word: 'common', queryCount: 5, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', sentenceContext: [], book: 'test.pdf', lastQueried: new Date().toISOString() },
      { word: 'medium', queryCount: 3, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', sentenceContext: [], book: 'test.pdf', lastQueried: new Date().toISOString() },
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
      { word: 'serendipity', queryCount: 4, englishDef: '(n.) happy accident', chineseDef: '\u610f\u5916\u53d1\u73b0', pronunciation: '/\u02ccser.\u0259n\u02c8d\u026ap.\u0259.ti/', sentenceContext: ['A moment of serendipity.'], book: 'test.pdf', lastQueried: new Date().toISOString() },
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

  test('each item shows the sentence context', () => {
    const words = [
      { word: 'lucid', queryCount: 1, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', sentenceContext: ['She gave a lucid explanation.', 'A lucid dream.'], book: 'test.pdf', lastQueried: new Date().toISOString() },
    ];
    win.localStorage.setItem('reader-wordlist', JSON.stringify(words));
    setReaderState(win, { fileName: 'test.pdf' });

    win.renderWordList();

    const item = doc.getElementById('wordListEntries').querySelector('.wordlist-item');
    expect(item.textContent).toContain('She gave a lucid explanation.');
    expect(item.textContent).toContain('A lucid dream.');
  });

  test('each item shows the query time', () => {
    const words = [
      { word: 'lucid', queryCount: 1, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', sentenceContext: [], book: 'test.pdf', lastQueried: '2026-03-10T14:30:00.000Z' },
    ];
    win.localStorage.setItem('reader-wordlist', JSON.stringify(words));
    setReaderState(win, { fileName: 'test.pdf' });

    win.renderWordList();

    const item = doc.getElementById('wordListEntries').querySelector('.wordlist-item');
    const timeEl = item.querySelector('.wordlist-time');
    expect(timeEl).toBeTruthy();
    expect(timeEl.textContent.length).toBeGreaterThan(0);
  });

  test('shows empty state when no words for current book', () => {
    setReaderState(win, { fileName: 'empty.pdf' });
    win.renderWordList();
    expect(doc.getElementById('wordListEntries').textContent).toContain('No words');
  });
});

// ============================================================
// Delete
// ============================================================
describe('word list — delete', () => {

  test('deleteWordFromList() removes a specific word entry', () => {
    const words = [
      { word: 'keep', queryCount: 1, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', sentenceContext: [], book: 'test.pdf', lastQueried: new Date().toISOString() },
      { word: 'remove', queryCount: 2, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', sentenceContext: [], book: 'test.pdf', lastQueried: new Date().toISOString() },
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
      { word: 'shared', queryCount: 1, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', sentenceContext: [], book: 'book-a.pdf', lastQueried: new Date().toISOString() },
      { word: 'shared', queryCount: 3, englishDef: 'e', chineseDef: 'c', pronunciation: 'p', sentenceContext: [], book: 'book-b.pdf', lastQueried: new Date().toISOString() },
    ];
    win.localStorage.setItem('reader-wordlist', JSON.stringify(words));

    win.deleteWordFromList('shared', 'book-a.pdf');

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    expect(list.length).toBe(1);
    expect(list[0].book).toBe('book-b.pdf');
  });
});

// ============================================================
// Export
// ============================================================
describe('word list — export', () => {

  test('exportWordList() generates markdown with all fields including context and time', () => {
    const words = [
      { word: 'ephemeral', queryCount: 3, englishDef: '(adj.) lasting a very short time', chineseDef: '\u77ed\u6682\u7684', pronunciation: '/\u026a\u02c8f\u025bm\u0259r\u0259l/', sentenceContext: ['An ephemeral beauty.', 'Ephemeral trends fade.'], book: 'mybook.pdf', lastQueried: '2026-03-10T14:30:00.000Z' },
      { word: 'ubiquitous', queryCount: 1, englishDef: '(adj.) present everywhere', chineseDef: '\u65e0\u5904\u4e0d\u5728\u7684', pronunciation: '/ju\u02d0\u02c8b\u026ak.w\u026a.t\u0259s/', sentenceContext: ['Smartphones are ubiquitous.'], book: 'mybook.pdf', lastQueried: '2026-03-10T15:00:00.000Z' },
    ];
    win.localStorage.setItem('reader-wordlist', JSON.stringify(words));
    setReaderState(win, { fileName: 'mybook.pdf' });

    let capturedBlob = null;
    win.URL.createObjectURL = (blob) => { capturedBlob = blob; return 'blob:fake'; };
    win.URL.revokeObjectURL = () => {};

    const origCreateElement = doc.createElement.bind(doc);
    doc.createElement = (tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') { el.click = () => {}; }
      return el;
    };

    win.exportWordList();

    expect(capturedBlob).toBeTruthy();

    return capturedBlob.text().then((text) => {
      expect(text).toContain('# Word List: mybook.pdf');
      // ephemeral section
      expect(text).toContain('ephemeral');
      expect(text).toContain('/\u026a\u02c8f\u025bm\u0259r\u0259l/');
      expect(text).toContain('\u77ed\u6682\u7684');
      expect(text).toContain('3');
      // sentence contexts in export
      expect(text).toContain('An ephemeral beauty.');
      expect(text).toContain('Ephemeral trends fade.');
      expect(text).toContain('Smartphones are ubiquitous.');
      // sorted by queryCount desc
      expect(text.indexOf('ephemeral')).toBeLessThan(text.indexOf('ubiquitous'));
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

// ============================================================
// Integration with lookupWord
// ============================================================
describe('word list — integration with lookupWord', () => {

  test('lookupWord records word with sentence context after API result', async () => {
    setReaderState(win, { fileName: 'test.pdf', apiKey: 'test-key' });

    win._stubCallOpenAI = async () => 'EN: (adj.) lasting a very short time\nCN: \u77ed\u6682\u7684\nPRON: /\u026a\u02c8f\u025bm\u0259r\u0259l/';

    await win.lookupWord('ephemeral', 'It was an ephemeral moment.');

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    expect(list.length).toBe(1);
    expect(list[0].word).toBe('ephemeral');
    expect(list[0].englishDef).toBe('(adj.) lasting a very short time');
    expect(list[0].chineseDef).toBe('\u77ed\u6682\u7684');
    expect(list[0].pronunciation).toBe('/\u026a\u02c8f\u025bm\u0259r\u0259l/');
    expect(list[0].queryCount).toBe(1);
    expect(list[0].sentenceContext).toEqual(['It was an ephemeral moment.']);
  });

  test('lookupWord increments count and appends new context', async () => {
    setReaderState(win, { fileName: 'test.pdf', apiKey: 'test-key' });

    win._stubCallOpenAI = async () => 'EN: (adj.) short-lived\nCN: \u77ed\u6682\u7684\nPRON: /\u026a\u02c8f\u025bm\u0259r\u0259l/';

    await win.lookupWord('ephemeral', 'Context sentence one.');
    await win.lookupWord('ephemeral', 'Context sentence two.');

    const list = JSON.parse(win.localStorage.getItem('reader-wordlist'));
    expect(list[0].queryCount).toBe(2);
    expect(list[0].sentenceContext).toEqual(['Context sentence one.', 'Context sentence two.']);
  });
});
