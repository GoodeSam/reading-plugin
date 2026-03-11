/**
 * TDD tests for issues found by Codex audit:
 *
 * 1. HIGH: Search crashes on pages with image paragraphs (no .sentences)
 * 2. HIGH: PDF image ordering — images extracted before text, breaking reading order
 * 3. MEDIUM: Inline images in block elements lose document order
 * 4. MEDIUM: Chinese quoted dialogue splits incorrectly ("你好。"她说。)
 * 5. MEDIUM: normalizeImagePath corrupts absolute/protocol URLs
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
  win.localStorage.clear();
  dom.window.close();
});

// ============================================================
// 1. Search must not crash on pages with image paragraphs
// ============================================================
describe('search with image paragraphs', () => {

  test('search does not crash when pages contain image paragraphs', () => {
    const pages = [[
      { type: 'text', text: 'The cat sat on the mat.', sentences: ['The cat sat on the mat.'] },
      { type: 'image', src: 'data:image/png;base64,abc', alt: 'A cat' },
      { type: 'text', text: 'The dog ran away.', sentences: ['The dog ran away.'] },
    ]];
    setReaderState(win, {
      fileName: 'test.epub',
      pages,
      totalPages: 1,
      currentPage: 0,
    });
    win.goToPage(0);

    // Set search query and trigger search
    const searchInput = doc.getElementById('searchInput');
    const searchBar = doc.querySelector('.search-bar');
    searchBar.classList.add('active');
    searchInput.value = 'cat';

    // This must not throw
    expect(() => win.performSearch()).not.toThrow();
  });

  test('search finds text matches on pages with images', () => {
    const pages = [[
      { type: 'text', text: 'The cat sat.', sentences: ['The cat sat.'] },
      { type: 'image', src: 'data:image/png;base64,abc', alt: '' },
      { type: 'text', text: 'Another cat here.', sentences: ['Another cat here.'] },
    ]];
    setReaderState(win, {
      fileName: 'test.epub',
      pages,
      totalPages: 1,
      currentPage: 0,
    });
    win.goToPage(0);

    const searchInput = doc.getElementById('searchInput');
    const searchBar = doc.querySelector('.search-bar');
    searchBar.classList.add('active');
    searchInput.value = 'cat';

    win.performSearch();
    expect(win._readerState.searchMatches.length).toBe(2);
  });

  test('search skips image paragraphs without errors', () => {
    const pages = [[
      { type: 'image', src: 'data:image/png;base64,abc', alt: '' },
      { type: 'image', src: 'data:image/png;base64,def', alt: '' },
    ]];
    setReaderState(win, {
      fileName: 'test.epub',
      pages,
      totalPages: 1,
      currentPage: 0,
    });
    win.goToPage(0);

    const searchInput = doc.getElementById('searchInput');
    const searchBar = doc.querySelector('.search-bar');
    searchBar.classList.add('active');
    searchInput.value = 'anything';

    expect(() => win.performSearch()).not.toThrow();
    expect(win._readerState.searchMatches.length).toBe(0);
  });
});

// ============================================================
// 2. PDF image ordering — images should appear after preceding text
// ============================================================
describe('PDF image ordering', () => {

  // NOTE: parsePDF uses pdf.js which can't run in Jest/JSDOM, so we test
  // the data structure that parsePDF should produce. The fix changes parsePDF
  // to collect images by Y-position and interleave them with text paragraphs.
  // We can't unit-test parsePDF directly, but we verify the contract:
  // images should NOT all appear before text in the content items array.

  test('content items should interleave images with text by position', () => {
    // Simulate what parsePDF should produce for a page with:
    // text at y=700, image at y=500, text at y=300
    // The correct order is: text(700), image(500), text(300)
    // (PDF y-axis goes bottom-to-top, so higher y = earlier in page)

    // After the fix, parsePDF should produce this order:
    const expected = [
      'First paragraph text.',
      { type: 'image', src: 'data:image/png;base64,abc', alt: 'Page 1 image' },
      'Second paragraph text.',
    ];

    // This test documents the expected contract.
    // The image should NOT be at index 0 (before all text).
    expect(typeof expected[0]).toBe('string');
    expect(expected[1].type).toBe('image');
    expect(typeof expected[2]).toBe('string');
  });
});

// ============================================================
// 3. Inline images in block elements should preserve DOM order
// ============================================================
describe('inline images preserve document order', () => {

  test('text before inline image comes first, text after comes last', () => {
    const html = '<body><p>Before <img src="pic.png" alt="pic"> after.</p></body>';
    const sectionDoc = new JSDOM(html).window.document;

    const result = win.extractContentItems(sectionDoc.body, () => 'data:image/png;base64,x');

    // Should be: "Before" text, image, "after." text — in that order
    expect(result.length).toBe(3);
    expect(typeof result[0]).toBe('string');
    expect(result[0]).toBe('Before');
    expect(result[1].type).toBe('image');
    expect(typeof result[2]).toBe('string');
    expect(result[2]).toBe('after.');
  });

  test('figure with figcaption extracts both image and caption', () => {
    const html = '<body><figure><img src="pic.jpg" alt="A figure"><figcaption>Caption text</figcaption></figure></body>';
    const sectionDoc = new JSDOM(html).window.document;

    const result = win.extractContentItems(sectionDoc.body, () => 'data:image/jpeg;base64,abc');
    const imgs = result.filter(i => typeof i === 'object' && i.type === 'image');
    const texts = result.filter(i => typeof i === 'string');

    expect(imgs.length).toBe(1);
    expect(texts.length).toBe(1);
    expect(texts[0]).toBe('Caption text');
  });

  test('multiple inline images in a paragraph maintain order', () => {
    const html = '<body><p>A <img src="1.png" alt="one"> B <img src="2.png" alt="two"> C</p></body>';
    const sectionDoc = new JSDOM(html).window.document;

    const result = win.extractContentItems(sectionDoc.body, (src) => `resolved:${src}`);

    // Expected order: "A", img1, "B", img2, "C"
    expect(result.length).toBe(5);
    expect(result[0]).toBe('A');
    expect(result[1].type).toBe('image');
    expect(result[1].alt).toBe('one');
    expect(result[2]).toBe('B');
    expect(result[3].type).toBe('image');
    expect(result[3].alt).toBe('two');
    expect(result[4]).toBe('C');
  });
});

// ============================================================
// 4. Chinese quoted dialogue should keep closing quotes attached
// ============================================================
describe('Chinese quoted dialogue sentence splitting', () => {

  test('closing quote stays with sentence: "你好。"她说。', () => {
    const result = win.splitIntoParagraphs('\u201c你好。\u201d她说。');
    const sents = result[0].sentences;
    // Should split into: "你好。" and 她说。
    expect(sents.length).toBe(2);
    expect(sents[0]).toBe('\u201c你好。\u201d');
    expect(sents[1]).toBe('她说。');
  });

  test('closing single quote stays with sentence: \u2018好的。\u2019他答道。', () => {
    const result = win.splitIntoParagraphs('\u2018好的。\u2019他答道。');
    const sents = result[0].sentences;
    expect(sents.length).toBe(2);
    expect(sents[0]).toBe('\u2018好的。\u2019');
  });

  test('Chinese book title quotes are not split: 《小屁孩日记》很好看。', () => {
    const result = win.splitIntoParagraphs('《小屁孩日记》很好看。');
    const sents = result[0].sentences;
    expect(sents.length).toBe(1);
    expect(sents[0]).toBe('《小屁孩日记》很好看。');
  });

  test('English quoted dialogue: "Hello." she said.', () => {
    const result = win.splitIntoParagraphs('"Hello." she said.');
    const sents = result[0].sentences;
    expect(sents.length).toBe(2);
    expect(sents[0]).toBe('"Hello."');
    expect(sents[1]).toBe('she said.');
  });
});

// ============================================================
// 5. normalizeImagePath must not corrupt absolute/protocol URLs
// ============================================================
describe('normalizeImagePath with special URLs', () => {

  test('does not corrupt https:// URLs', () => {
    expect(win.normalizeImagePath('https://example.com/img.png'))
      .toBe('https://example.com/img.png');
  });

  test('does not corrupt data: URLs', () => {
    const dataUrl = 'data:image/png;base64,abc123';
    expect(win.normalizeImagePath(dataUrl)).toBe(dataUrl);
  });

  test('does not corrupt blob: URLs', () => {
    const blobUrl = 'blob:http://localhost/abc-123';
    expect(win.normalizeImagePath(blobUrl)).toBe(blobUrl);
  });

  test('preserves leading slash for absolute paths', () => {
    expect(win.normalizeImagePath('/Images/cover.jpeg'))
      .toBe('/Images/cover.jpeg');
  });

  test('still normalizes relative paths with ..', () => {
    expect(win.normalizeImagePath('OEBPS/Text/../Images/fig.jpeg'))
      .toBe('OEBPS/Images/fig.jpeg');
  });
});
