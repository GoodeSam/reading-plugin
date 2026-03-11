/**
 * TDD tests for word popup enhancements:
 *
 *  1. Pronunciation display: show IPA phonetic transcription in the popup
 *     below the word, with a speaker button to play TTS pronunciation.
 *  2. Definition formatting: visually separate part-of-speech tags from
 *     definition text — POS displayed as a styled badge/tag.
 *
 * The API prompt already returns:
 *   EN: (adj.) definition text here
 *   CN: Chinese definition
 *   PRON: /prəˌnʌnsiˈeɪʃən/
 *
 * Changes needed:
 *  - Add #defPronunciation element to show IPA below the word
 *  - Add #btnPronounce button to speak the word via TTS
 *  - Parse POS from the EN line (e.g. "(adj.)" or "(n.)" prefix)
 *  - Render POS as a <span class="pos-tag"> badge, definition as plain text
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
// Pronunciation display
// ============================================================
describe('word popup — pronunciation display', () => {

  test('pronunciation element exists in the DOM', () => {
    const el = doc.getElementById('defPronunciation');
    expect(el).not.toBeNull();
  });

  test('pronunciation is displayed after word lookup', async () => {
    jest.useRealTimers();
    win._stubCallOpenAI = async () => 'EN: (adj.) very large\nCN: 巨大的\nPRON: /ɪˈnɔːrməs/';

    await win.lookupWord('enormous', 'The house was enormous.');

    const pronEl = doc.getElementById('defPronunciation');
    expect(pronEl.textContent).toContain('/ɪˈnɔːrməs/');
    expect(pronEl.style.display).not.toBe('none');
  });

  test('pronunciation is hidden when not available', async () => {
    jest.useRealTimers();
    win._stubCallOpenAI = async () => 'EN: (n.) a test\nCN: 测试';

    await win.lookupWord('test', 'This is a test.');

    const pronEl = doc.getElementById('defPronunciation');
    expect(pronEl.style.display).toBe('none');
  });

  test('pronounce button exists in the DOM', () => {
    const btn = doc.getElementById('btnPronounce');
    expect(btn).not.toBeNull();
  });

  test('pronounce button calls TTS with the word', async () => {
    jest.useRealTimers();
    win._stubCallOpenAI = async () => 'EN: (v.) to run\nCN: 跑\nPRON: /rʌn/';

    await win.lookupWord('run', 'I like to run.');

    const btn = doc.getElementById('btnPronounce');
    expect(btn).not.toBeNull();

    // Stub fetch + Audio to verify TTS is called with the word
    let ttsFetchUrl = null;
    let ttsFetchBody = null;
    win.fetch = async (url, opts) => {
      ttsFetchUrl = url;
      ttsFetchBody = JSON.parse(opts.body);
      return { ok: true, blob: async () => new win.Blob(['audio']) };
    };
    win.URL.createObjectURL = () => 'blob:test';
    win.URL.revokeObjectURL = () => {};

    win._readerState.apiKey = 'sk-test';
    btn.click();

    // Allow async TTS promise chain to resolve
    for (let i = 0; i < 5; i++) {
      await new Promise(r => process.nextTick(r));
    }

    expect(ttsFetchBody).not.toBeNull();
    expect(ttsFetchBody.input).toBe('run');
  });
});

// ============================================================
// POS (part of speech) formatting
// ============================================================
describe('word popup — POS tag formatting', () => {

  test('part of speech is displayed as a styled tag', async () => {
    jest.useRealTimers();
    win._stubCallOpenAI = async () => 'EN: (adj.) very large in size\nCN: 巨大的\nPRON: /ɪˈnɔːrməs/';

    await win.lookupWord('enormous', 'The house was enormous.');

    const enSection = doc.getElementById('defEnglish');
    const posTag = enSection.querySelector('.pos-tag');
    expect(posTag).not.toBeNull();
    expect(posTag.textContent).toBe('adj.');
  });

  test('definition text is shown separately from POS', async () => {
    jest.useRealTimers();
    win._stubCallOpenAI = async () => 'EN: (adj.) very large in size\nCN: 巨大的\nPRON: /ɪˈnɔːrməs/';

    await win.lookupWord('enormous', 'The house was enormous.');

    const defText = doc.getElementById('defEnText');
    // Definition text should NOT contain the POS tag
    expect(defText.textContent).not.toContain('(adj.)');
    expect(defText.textContent).toContain('very large in size');
  });

  test('handles noun POS correctly', async () => {
    jest.useRealTimers();
    win._stubCallOpenAI = async () => 'EN: (n.) a domestic animal\nCN: 猫\nPRON: /kæt/';

    await win.lookupWord('cat', 'The cat sat on the mat.');

    const posTag = doc.getElementById('defEnglish').querySelector('.pos-tag');
    expect(posTag.textContent).toBe('n.');

    const defText = doc.getElementById('defEnText');
    expect(defText.textContent).toContain('a domestic animal');
    expect(defText.textContent).not.toContain('(n.)');
  });

  test('handles verb POS correctly', async () => {
    jest.useRealTimers();
    win._stubCallOpenAI = async () => 'EN: (v.) to move quickly on foot\nCN: 跑\nPRON: /rʌn/';

    await win.lookupWord('run', 'I like to run.');

    const posTag = doc.getElementById('defEnglish').querySelector('.pos-tag');
    expect(posTag.textContent).toBe('v.');
  });

  test('handles adverb POS correctly', async () => {
    jest.useRealTimers();
    win._stubCallOpenAI = async () => 'EN: (adv.) in a quick manner\nCN: 快速地\nPRON: /ˈkwɪkli/';

    await win.lookupWord('quickly', 'She ran quickly.');

    const posTag = doc.getElementById('defEnglish').querySelector('.pos-tag');
    expect(posTag.textContent).toBe('adv.');
  });

  test('handles no POS gracefully (no tag shown)', async () => {
    jest.useRealTimers();
    win._stubCallOpenAI = async () => 'EN: a greeting used when meeting someone\nCN: 你好\nPRON: /həˈloʊ/';

    await win.lookupWord('hello', 'Hello there.');

    const posTag = doc.getElementById('defEnglish').querySelector('.pos-tag');
    expect(posTag).toBeNull();

    const defText = doc.getElementById('defEnText');
    expect(defText.textContent).toContain('a greeting used when meeting someone');
  });

  test('pos-tag has visual styling class', async () => {
    jest.useRealTimers();
    win._stubCallOpenAI = async () => 'EN: (adj.) very large\nCN: 巨大的\nPRON: /ɪˈnɔːrməs/';

    await win.lookupWord('enormous', 'The house was enormous.');

    const posTag = doc.getElementById('defEnglish').querySelector('.pos-tag');
    expect(posTag.classList.contains('pos-tag')).toBe(true);
  });

  test('pos-tag text is rendered in bold', async () => {
    jest.useRealTimers();
    win._stubCallOpenAI = async () => 'EN: (adj.) widely liked\nCN: 流行的\nPRON: /ˈpɒpjʊlər/';

    await win.lookupWord('popular', 'She is very popular.');

    const posTag = doc.getElementById('defEnglish').querySelector('.pos-tag');
    expect(posTag.tagName).toBe('STRONG');
  });

  test('pos-tag is separated from definition by a spacer', async () => {
    jest.useRealTimers();
    win._stubCallOpenAI = async () => 'EN: (adj.) widely liked or admired by many people\nCN: 流行的\nPRON: /ˈpɒpjʊlər/';

    await win.lookupWord('popular', 'She is very popular.');

    const enSection = doc.getElementById('defEnglish');
    const spacer = enSection.querySelector('.pos-spacer');
    expect(spacer).not.toBeNull();
    // Spacer should render as 4 non-breaking spaces
    expect(spacer.innerHTML).toBe('&nbsp;&nbsp;&nbsp;&nbsp;');
  });

  test('spacer appears between pos-tag and definition text', async () => {
    jest.useRealTimers();
    win._stubCallOpenAI = async () => 'EN: (n.) a small furry animal\nCN: 猫\nPRON: /kæt/';

    await win.lookupWord('cat', 'The cat sat on the mat.');

    const enSection = doc.getElementById('defEnglish');
    const children = Array.from(enSection.children);
    const posIdx = children.findIndex(el => el.classList.contains('pos-tag'));
    const spacerIdx = children.findIndex(el => el.classList.contains('pos-spacer'));
    const defIdx = children.findIndex(el => el.id === 'defEnText');
    expect(posIdx).toBeLessThan(spacerIdx);
    expect(spacerIdx).toBeLessThan(defIdx);
  });

  test('no spacer when there is no POS', async () => {
    jest.useRealTimers();
    win._stubCallOpenAI = async () => 'EN: a greeting used when meeting someone\nCN: 你好\nPRON: /həˈloʊ/';

    await win.lookupWord('hello', 'Hello there.');

    const enSection = doc.getElementById('defEnglish');
    const spacer = enSection.querySelector('.pos-spacer');
    expect(spacer).toBeNull();
  });
});

// ============================================================
// Pronunciation cleared on new lookup
// ============================================================
describe('word popup — state reset between lookups', () => {

  test('pronunciation is cleared when starting a new lookup', () => {
    const pronEl = doc.getElementById('defPronunciation');
    pronEl.textContent = '/oʊld/';
    pronEl.style.display = 'block';

    // Opening a new word popup should reset pronunciation
    win.showWordPopup('new', 'A new word.', { clientX: 100, clientY: 100 });

    expect(pronEl.textContent).toBe('');
    expect(pronEl.style.display).toBe('none');
  });

  test('POS tag is cleared when starting a new lookup', () => {
    const enSection = doc.getElementById('defEnglish');
    const oldTag = doc.createElement('span');
    oldTag.className = 'pos-tag';
    oldTag.textContent = 'adj.';
    enSection.insertBefore(oldTag, enSection.firstChild);

    win.showWordPopup('new', 'A new word.', { clientX: 100, clientY: 100 });

    const posTag = enSection.querySelector('.pos-tag');
    expect(posTag).toBeNull();
  });

  test('POS spacer is cleared when starting a new lookup', () => {
    const enSection = doc.getElementById('defEnglish');
    const oldSpacer = doc.createElement('span');
    oldSpacer.className = 'pos-spacer';
    oldSpacer.innerHTML = '&nbsp;&nbsp;&nbsp;&nbsp;';
    enSection.insertBefore(oldSpacer, enSection.firstChild);

    win.showWordPopup('new', 'A new word.', { clientX: 100, clientY: 100 });

    const spacer = enSection.querySelector('.pos-spacer');
    expect(spacer).toBeNull();
  });
});
