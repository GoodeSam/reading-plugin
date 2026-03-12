/**
 * TDD tests for image rendering in the reading plugin.
 *
 * Images from EPUB and PDF files should be rendered inline with
 * text paragraphs in the correct position.
 *
 * Data model:
 *   Text paragraph: { type: 'text', text: '...', sentences: [...] }
 *   Image entry:    { type: 'image', src: 'data:...' | 'blob:...', alt: '...' }
 *
 * Rendering:
 *   Image entries render as <div class="paragraph paragraph-image"><img ...></div>
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
// Rendering — image paragraphs
// ============================================================
describe('image paragraph rendering', () => {

  test('image entry renders as an img element inside a paragraph-image div', () => {
    const pages = [[
      { type: 'image', src: 'data:image/png;base64,ABC123', alt: 'Figure 1' }
    ]];
    setReaderState(win, { fileName: 'test.epub', pages, totalPages: 1, currentPage: 0 });
    win.goToPage(0);

    const imgDiv = doc.querySelector('.paragraph-image');
    expect(imgDiv).toBeTruthy();
    const img = imgDiv.querySelector('img');
    expect(img).toBeTruthy();
    expect(img.src).toBe('data:image/png;base64,ABC123');
    expect(img.alt).toBe('Figure 1');
  });

  test('image paragraph does NOT have the text paragraph class', () => {
    const pages = [[
      { type: 'image', src: 'data:image/png;base64,X', alt: '' }
    ]];
    setReaderState(win, { fileName: 'test.epub', pages, totalPages: 1, currentPage: 0 });
    win.goToPage(0);

    const imgDiv = doc.querySelector('.paragraph-image');
    expect(imgDiv).toBeTruthy();
    // Should not have the text-indent styling paragraph class applied with sentences
    expect(imgDiv.querySelectorAll('.sentence').length).toBe(0);
  });

  test('image renders between text paragraphs in correct position', () => {
    const pages = [[
      { type: 'text', text: 'First paragraph.', sentences: ['First paragraph.'] },
      { type: 'image', src: 'data:image/png;base64,IMG', alt: 'Middle image' },
      { type: 'text', text: 'Last paragraph.', sentences: ['Last paragraph.'] },
    ]];
    setReaderState(win, { fileName: 'test.epub', pages, totalPages: 1, currentPage: 0 });
    win.goToPage(0);

    const children = doc.getElementById('readerContent').children;
    expect(children.length).toBe(3);

    // First is text paragraph
    expect(children[0].classList.contains('paragraph')).toBe(true);
    expect(children[0].classList.contains('paragraph-image')).toBe(false);
    expect(children[0].textContent).toContain('First paragraph.');

    // Second is image
    expect(children[1].classList.contains('paragraph-image')).toBe(true);
    expect(children[1].querySelector('img').alt).toBe('Middle image');

    // Third is text paragraph
    expect(children[2].classList.contains('paragraph')).toBe(true);
    expect(children[2].textContent).toContain('Last paragraph.');
  });

  test('multiple consecutive images render correctly', () => {
    const pages = [[
      { type: 'image', src: 'data:image/png;base64,A', alt: 'Image A' },
      { type: 'image', src: 'data:image/png;base64,B', alt: 'Image B' },
    ]];
    setReaderState(win, { fileName: 'test.epub', pages, totalPages: 1, currentPage: 0 });
    win.goToPage(0);

    const imgs = doc.querySelectorAll('.paragraph-image img');
    expect(imgs.length).toBe(2);
    expect(imgs[0].alt).toBe('Image A');
    expect(imgs[1].alt).toBe('Image B');
  });

  test('image with empty alt renders with empty alt attribute', () => {
    const pages = [[
      { type: 'image', src: 'data:image/png;base64,X', alt: '' }
    ]];
    setReaderState(win, { fileName: 'test.epub', pages, totalPages: 1, currentPage: 0 });
    win.goToPage(0);

    const img = doc.querySelector('.paragraph-image img');
    expect(img.alt).toBe('');
  });

  test('image has reader-image CSS class for styling', () => {
    const pages = [[
      { type: 'image', src: 'data:image/png;base64,X', alt: 'test' }
    ]];
    setReaderState(win, { fileName: 'test.epub', pages, totalPages: 1, currentPage: 0 });
    win.goToPage(0);

    const img = doc.querySelector('.paragraph-image img');
    expect(img.classList.contains('reader-image')).toBe(true);
  });
});

// ============================================================
// Backward compatibility — text paragraphs without explicit type
// ============================================================
describe('backward compatibility', () => {

  test('paragraphs without type field still render as text', () => {
    const pages = [[
      { text: 'No type field here.', sentences: ['No type field here.'] }
    ]];
    setReaderState(win, { fileName: 'test.pdf', pages, totalPages: 1, currentPage: 0 });
    win.goToPage(0);

    const para = doc.querySelector('.paragraph');
    expect(para).toBeTruthy();
    expect(para.textContent).toContain('No type field here.');
  });

  test('paragraphs with type "text" render normally', () => {
    const pages = [[
      { type: 'text', text: 'Explicit text type.', sentences: ['Explicit text type.'] }
    ]];
    setReaderState(win, { fileName: 'test.pdf', pages, totalPages: 1, currentPage: 0 });
    win.goToPage(0);

    const para = doc.querySelector('.paragraph');
    expect(para).toBeTruthy();
    expect(para.textContent).toContain('Explicit text type.');
  });
});

// ============================================================
// Pagination — images count toward page content
// ============================================================
describe('image pagination', () => {

  test('images are included in pagination', () => {
    const paragraphs = [
      { type: 'text', text: 'Hello.', sentences: ['Hello.'] },
      { type: 'image', src: 'data:image/png;base64,X', alt: 'pic' },
      { type: 'text', text: 'World.', sentences: ['World.'] },
    ];
    setReaderState(win, { fileName: 'test.epub' });
    win.paginateParagraphs(paragraphs);
    // All should be on one page (only 2 sentences, well under limit)
    expect(win._readerState.pages.length).toBe(1);
    expect(win._readerState.pages[0].length).toBe(3);
  });

  test('image entries have 0 sentence count for pagination purposes', () => {
    // Create enough text paragraphs to nearly fill a page, then add an image
    const paragraphs = [];
    for (let i = 0; i < 39; i++) {
      paragraphs.push({ type: 'text', text: `Sentence ${i}.`, sentences: [`Sentence ${i}.`] });
    }
    // Add an image — should NOT push to next page by itself
    paragraphs.push({ type: 'image', src: 'data:image/png;base64,X', alt: '' });
    // Add one more sentence to hit the threshold
    paragraphs.push({ type: 'text', text: 'Final.', sentences: ['Final.'] });

    setReaderState(win, { fileName: 'test.epub' });
    win.paginateParagraphs(paragraphs);
    // 40 sentences = exactly the threshold, so should be 1 page (40 text + 1 image + 1 text on next)
    expect(win._readerState.pages[0]).toContainEqual(
      expect.objectContaining({ type: 'image' })
    );
  });
});

// ============================================================
// Theme application to image paragraphs
// ============================================================
describe('image paragraph theming', () => {

  test('image paragraphs do NOT get text paragraph background', () => {
    const pages = [[
      { type: 'image', src: 'data:image/png;base64,X', alt: 'test' }
    ]];
    setReaderState(win, { fileName: 'test.epub', pages, totalPages: 1, currentPage: 0 });
    win.goToPage(0);

    const imgDiv = doc.querySelector('.paragraph-image');
    // paragraph-image should not have the paragraph background applied
    expect(imgDiv.style.background).toBe('');
  });
});

// ============================================================
// EPUB image extraction
// ============================================================
describe('EPUB image extraction', () => {

  test('extractImagesFromEPUBBlock returns image entries for img tags', () => {
    const div = doc.createElement('div');
    div.innerHTML = '<p>Some text</p><img src="data:image/png;base64,ABC" alt="Fig 1"><p>More text</p>';

    const results = win.extractImagesFromBlock(div.querySelector('img'));
    expect(results.length).toBe(1);
    expect(results[0].type).toBe('image');
    expect(results[0].src).toBe('data:image/png;base64,ABC');
    expect(results[0].alt).toBe('Fig 1');
  });

  test('extractImagesFromBlock with no src returns empty array', () => {
    const img = doc.createElement('img');
    // No src attribute
    const results = win.extractImagesFromBlock(img);
    expect(results.length).toBe(0);
  });
});
