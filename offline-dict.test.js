/**
 * TDD tests for offline dictionary word lookup:
 *
 * 1. Bundled dictionary: a JSON dataset of common English words with
 *    part-of-speech, definition, Chinese translation, and IPA pronunciation.
 * 2. Lookup cache: previously queried words (from any provider) are saved
 *    in localStorage and reused when offline.
 * 3. Provider integration: 'offline' is a new translationProvider option
 *    that requires no network access.
 * 4. Lookup returns the standard EN:/CN:/PRON: format consumed by the
 *    existing word popup parser.
 * 5. Sentence/paragraph translation gracefully degrades in offline mode.
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// --------------- helpers ---------------
function buildDOM() {
  const html = fs.readFileSync(path.join(__dirname, 'reader.html'), 'utf-8');
  const dom = new JSDOM(html, { url: 'http://localhost' });
  const win = dom.window;

  win.chrome = { storage: { local: { get: (keys, cb) => cb({}) } } };
  Object.defineProperty(win, 'innerHeight', { value: 800, writable: true });
  Object.defineProperty(win, 'innerWidth', { value: 1200, writable: true });

  return { dom, win };
}

function loadReaderJS(win) {
  // Inject offline dictionary data for tests
  const dictData = JSON.parse(fs.readFileSync(path.join(__dirname, 'dict-en.json'), 'utf-8'));
  win._offlineDict = dictData;

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

// --------------- tests ---------------

let dom, doc, win;

beforeEach(() => {
  jest.useFakeTimers();
  ({ dom, win } = buildDOM());
  doc = win.document;
  loadReaderJS(win);
  enterReadingMode(doc, win);
  win._readerState.fileName = 'test.epub';
});

afterEach(() => {
  jest.useRealTimers();
  dom.window.close();
});

// ============================================================
// Bundled dictionary
// ============================================================
describe('offline dictionary — bundled data', () => {

  test('dict-en.json file exists and is valid JSON', () => {
    const dictPath = path.join(__dirname, 'dict-en.json');
    expect(fs.existsSync(dictPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(dictPath, 'utf-8'));
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  test('each dictionary entry has required fields', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'dict-en.json'), 'utf-8'));
    const entry = data[0];
    expect(entry).toHaveProperty('word');
    expect(entry).toHaveProperty('pos');
    expect(entry).toHaveProperty('def');
    expect(entry).toHaveProperty('cn');
    expect(entry).toHaveProperty('pron');
  });

  test('dictionary contains common words like "the", "run", "happy"', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'dict-en.json'), 'utf-8'));
    const words = data.map(e => e.word.toLowerCase());
    expect(words).toContain('the');
    expect(words).toContain('run');
    expect(words).toContain('happy');
  });
});

// ============================================================
// offlineLookupWord function
// ============================================================
describe('offline dictionary — offlineLookupWord', () => {

  test('offlineLookupWord is exposed on window', () => {
    expect(typeof win.offlineLookupWord).toBe('function');
  });

  test('returns EN:/CN:/PRON: format for a known word', async () => {
    jest.useRealTimers();
    const result = await win.offlineLookupWord('happy');
    expect(result).toContain('EN:');
    expect(result).toContain('CN:');
    expect(result).toContain('PRON:');
  });

  test('includes part of speech in EN line', async () => {
    jest.useRealTimers();
    const result = await win.offlineLookupWord('happy');
    // Should contain POS like (adj.)
    expect(result).toMatch(/EN:\s*\([^)]+\)/);
  });

  test('includes IPA pronunciation in PRON line', async () => {
    jest.useRealTimers();
    const result = await win.offlineLookupWord('happy');
    expect(result).toMatch(/PRON:\s*\/[^/]+\//);
  });

  test('lookup is case-insensitive', async () => {
    jest.useRealTimers();
    const lower = await win.offlineLookupWord('happy');
    const upper = await win.offlineLookupWord('Happy');
    const allcaps = await win.offlineLookupWord('HAPPY');
    expect(lower).toBe(upper);
    expect(lower).toBe(allcaps);
  });

  test('returns null for unknown words not in dictionary or cache', async () => {
    jest.useRealTimers();
    const result = await win.offlineLookupWord('xyznonexistent');
    expect(result).toBeNull();
  });
});

// ============================================================
// Lookup cache (localStorage)
// ============================================================
describe('offline dictionary — lookup cache', () => {

  test('falls back to cached word list entry when word not in bundled dict', async () => {
    jest.useRealTimers();

    // Simulate a previously cached word in the word list
    const cached = [{
      word: 'serendipity',
      englishDef: '(n.) the occurrence of happy discoveries by accident',
      chineseDef: '意外发现的运气',
      pronunciation: '/ˌserənˈdɪpəti/',
      sentenceContext: ['It was pure serendipity.'],
      book: 'test.epub',
      queryCount: 1,
      lastQueried: new Date().toISOString()
    }];
    win.localStorage.setItem('reader-wordlist', JSON.stringify(cached));

    const result = await win.offlineLookupWord('serendipity');
    expect(result).not.toBeNull();
    expect(result).toContain('EN:');
    expect(result).toContain('happy discoveries by accident');
    expect(result).toContain('CN:');
    expect(result).toContain('意外发现的运气');
  });

  test('cache lookup is case-insensitive', async () => {
    jest.useRealTimers();

    const cached = [{
      word: 'Ephemeral',
      englishDef: '(adj.) lasting for a very short time',
      chineseDef: '短暂的',
      pronunciation: '/ɪˈfemərəl/',
      sentenceContext: [],
      book: 'test.epub',
      queryCount: 1,
      lastQueried: new Date().toISOString()
    }];
    win.localStorage.setItem('reader-wordlist', JSON.stringify(cached));

    const result = await win.offlineLookupWord('ephemeral');
    expect(result).not.toBeNull();
    expect(result).toContain('短暂的');
  });

  test('bundled dictionary takes priority over cache', async () => {
    jest.useRealTimers();

    // Put a stale entry for 'happy' in cache
    const cached = [{
      word: 'happy',
      englishDef: 'stale cached definition',
      chineseDef: '旧缓存',
      pronunciation: '/old/',
      sentenceContext: [],
      book: 'test.epub',
      queryCount: 1,
      lastQueried: new Date().toISOString()
    }];
    win.localStorage.setItem('reader-wordlist', JSON.stringify(cached));

    const result = await win.offlineLookupWord('happy');
    expect(result).not.toContain('stale cached definition');
  });
});

// ============================================================
// Provider integration
// ============================================================
describe('offline dictionary — provider integration', () => {

  test('lookupWordByProvider uses offline when provider is offline', async () => {
    jest.useRealTimers();
    win._readerState.translationProvider = 'offline';

    // No fetch stub — should work without network
    const result = await win.lookupWord('happy', 'I am happy.');

    const defText = doc.getElementById('defEnText');
    expect(defText.textContent.length).toBeGreaterThan(0);
  });

  test('translateText returns fallback message in offline mode', async () => {
    jest.useRealTimers();
    win._readerState.translationProvider = 'offline';

    const result = await win.translateText('Hello world', 'en', 'zh');
    expect(result).toContain('offline');
  });

  test('offline provider does not make any fetch calls', async () => {
    jest.useRealTimers();
    win._readerState.translationProvider = 'offline';

    let fetchCalled = false;
    win.fetch = async () => { fetchCalled = true; return { ok: false }; };

    await win.offlineLookupWord('happy');
    expect(fetchCalled).toBe(false);
  });
});

// ============================================================
// Word popup integration with offline provider
// ============================================================
describe('offline dictionary — word popup display', () => {

  test('word popup shows definition from offline dictionary', async () => {
    jest.useRealTimers();
    win._readerState.translationProvider = 'offline';

    await win.lookupWord('happy', 'I am very happy.');

    const defEnText = doc.getElementById('defEnText');
    const defCnText = doc.getElementById('defCnText');
    expect(defEnText.textContent.length).toBeGreaterThan(0);
    expect(defCnText.textContent.length).toBeGreaterThan(0);
  });

  test('word popup shows pronunciation from offline dictionary', async () => {
    jest.useRealTimers();
    win._readerState.translationProvider = 'offline';

    await win.lookupWord('happy', 'I am very happy.');

    const pronEl = doc.getElementById('defPronunciation');
    expect(pronEl.textContent).toContain('/');
    expect(pronEl.style.display).not.toBe('none');
  });

  test('word popup shows POS tag from offline dictionary', async () => {
    jest.useRealTimers();
    win._readerState.translationProvider = 'offline';

    await win.lookupWord('happy', 'I am very happy.');

    const posTag = doc.getElementById('defEnglish').querySelector('.pos-tag');
    expect(posTag).not.toBeNull();
    expect(posTag.textContent.length).toBeGreaterThan(0);
  });

  test('word popup shows error for unknown word in offline mode', async () => {
    jest.useRealTimers();
    win._readerState.translationProvider = 'offline';

    await win.lookupWord('xyznonexistent', 'The xyznonexistent thing.');

    const defLoading = doc.getElementById('defLoading');
    expect(defLoading.textContent).toContain('not found');
  });
});
