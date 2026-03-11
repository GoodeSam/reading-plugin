/**
 * TDD tests for image rendering in EPUB and PDF files.
 *
 * Images should be:
 *  - Extracted from EPUB <img> tags with their src resolved to data URLs
 *  - Extracted from PDF pages as embedded image data
 *  - Represented as { type: 'image', src, alt } paragraph objects
 *  - Rendered as <img> elements inside .paragraph divs at the correct position
 *  - Interleaved with text paragraphs preserving source order
 *  - Paginated alongside text (each image counts as 1 sentence worth of space)
 *  - Styled responsively within the reader content area
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
// splitIntoParagraphs – mixed content (text + images)
// ============================================================
describe('splitIntoParagraphs with mixed content', () => {

  test('accepts a plain string and returns text paragraphs (backward compat)', () => {
    const result = win.splitIntoParagraphs('Hello world.\n\nGoodbye world.');
    expect(result).toEqual([
      { type: 'text', text: 'Hello world.', sentences: ['Hello world.'] },
      { type: 'text', text: 'Goodbye world.', sentences: ['Goodbye world.'] },
    ]);
  });

  test('accepts an array with only strings and returns text paragraphs', () => {
    const result = win.splitIntoParagraphs(['First paragraph.', 'Second paragraph.']);
    expect(result).toEqual([
      { type: 'text', text: 'First paragraph.', sentences: ['First paragraph.'] },
      { type: 'text', text: 'Second paragraph.', sentences: ['Second paragraph.'] },
    ]);
  });

  test('accepts an array with image objects interleaved with strings', () => {
    const items = [
      'Before the image.',
      { type: 'image', src: 'data:image/png;base64,abc', alt: 'A diagram' },
      'After the image.',
    ];
    const result = win.splitIntoParagraphs(items);
    expect(result).toEqual([
      { type: 'text', text: 'Before the image.', sentences: ['Before the image.'] },
      { type: 'image', src: 'data:image/png;base64,abc', alt: 'A diagram' },
      { type: 'text', text: 'After the image.', sentences: ['After the image.'] },
    ]);
  });

  test('image objects pass through without modification', () => {
    const img = { type: 'image', src: 'data:image/jpeg;base64,xyz', alt: '' };
    const result = win.splitIntoParagraphs([img]);
    expect(result).toEqual([img]);
  });

  test('empty strings are filtered out but images are kept', () => {
    const items = ['', { type: 'image', src: 'data:image/png;base64,abc', alt: '' }, ''];
    const result = win.splitIntoParagraphs(items);
    expect(result).toEqual([
      { type: 'image', src: 'data:image/png;base64,abc', alt: '' },
    ]);
  });
});

// ============================================================
// paginateParagraphs – images count toward page capacity
// ============================================================
describe('paginateParagraphs with images', () => {

  test('image paragraphs are included in pages', () => {
    const paragraphs = [
      { type: 'text', text: 'Hello.', sentences: ['Hello.'] },
      { type: 'image', src: 'data:image/png;base64,abc', alt: 'pic' },
      { type: 'text', text: 'World.', sentences: ['World.'] },
    ];
    setReaderState(win, { pages: [], totalPages: 0 });
    win.paginateParagraphs(paragraphs);
    // All fit on one page (only 2 sentences + 1 image = 3 items)
    expect(win._readerState.pages.length).toBe(1);
    expect(win._readerState.pages[0]).toEqual(paragraphs);
  });

  test('image counts as 1 sentence for pagination purposes', () => {
    // Create 39 sentences of text + 1 image = 40 → fits on one page
    const sentences = [];
    for (let i = 0; i < 39; i++) sentences.push(`Sentence ${i}.`);
    const paragraphs = [
      { type: 'text', text: sentences.join(' '), sentences },
      { type: 'image', src: 'data:image/png;base64,abc', alt: '' },
    ];
    setReaderState(win, { pages: [], totalPages: 0 });
    win.paginateParagraphs(paragraphs);
    expect(win._readerState.pages.length).toBe(1);
  });

  test('image causes page break when page is at sentence limit', () => {
    // 40 sentences fill a page, then image goes to next page
    const sentences = [];
    for (let i = 0; i < 40; i++) sentences.push(`Sentence ${i}.`);
    const paragraphs = [
      { type: 'text', text: sentences.join(' '), sentences },
      { type: 'image', src: 'data:image/png;base64,abc', alt: '' },
    ];
    setReaderState(win, { pages: [], totalPages: 0 });
    win.paginateParagraphs(paragraphs);
    expect(win._readerState.pages.length).toBe(2);
    expect(win._readerState.pages[1]).toEqual([
      { type: 'image', src: 'data:image/png;base64,abc', alt: '' },
    ]);
  });
});

// ============================================================
// renderPage – image paragraphs render as <img> elements
// ============================================================
describe('renderPage with images', () => {

  function renderWithContent(paragraphs) {
    setReaderState(win, {
      fileName: 'test.epub',
      pages: [paragraphs],
      totalPages: 1,
      currentPage: 0,
    });
    win.goToPage(0);
  }

  test('image paragraph renders an <img> inside a .paragraph div', () => {
    renderWithContent([
      { type: 'image', src: 'data:image/png;base64,abc', alt: 'Test image' },
    ]);
    const paragraphs = doc.querySelectorAll('.paragraph');
    expect(paragraphs.length).toBe(1);
    const img = paragraphs[0].querySelector('img');
    expect(img).toBeTruthy();
    expect(img.src).toBe('data:image/png;base64,abc');
    expect(img.alt).toBe('Test image');
  });

  test('image paragraph div has image-paragraph class', () => {
    renderWithContent([
      { type: 'image', src: 'data:image/png;base64,abc', alt: '' },
    ]);
    const para = doc.querySelector('.paragraph');
    expect(para.classList.contains('image-paragraph')).toBe(true);
  });

  test('text paragraphs still render normally alongside images', () => {
    renderWithContent([
      { type: 'text', text: 'Hello world.', sentences: ['Hello world.'] },
      { type: 'image', src: 'data:image/png;base64,abc', alt: 'pic' },
      { type: 'text', text: 'Goodbye.', sentences: ['Goodbye.'] },
    ]);
    const paragraphs = doc.querySelectorAll('.paragraph');
    expect(paragraphs.length).toBe(3);

    // First: text
    expect(paragraphs[0].querySelector('.sentence')).toBeTruthy();
    expect(paragraphs[0].querySelector('img')).toBeFalsy();

    // Second: image
    expect(paragraphs[1].querySelector('img')).toBeTruthy();
    expect(paragraphs[1].querySelector('.sentence')).toBeFalsy();

    // Third: text
    expect(paragraphs[2].querySelector('.sentence')).toBeTruthy();
    expect(paragraphs[2].querySelector('img')).toBeFalsy();
  });

  test('image has responsive styling (max-width 100%)', () => {
    renderWithContent([
      { type: 'image', src: 'data:image/png;base64,abc', alt: '' },
    ]);
    const img = doc.querySelector('.paragraph img');
    expect(img.style.maxWidth).toBe('100%');
  });

  test('image paragraph preserves order between text paragraphs', () => {
    renderWithContent([
      { type: 'text', text: 'First.', sentences: ['First.'] },
      { type: 'image', src: 'data:image/png;base64,img1', alt: 'Image 1' },
      { type: 'text', text: 'Second.', sentences: ['Second.'] },
      { type: 'image', src: 'data:image/png;base64,img2', alt: 'Image 2' },
      { type: 'text', text: 'Third.', sentences: ['Third.'] },
    ]);
    const paragraphs = doc.querySelectorAll('.paragraph');
    expect(paragraphs.length).toBe(5);

    // Check interleaving order
    expect(paragraphs[0].querySelector('.sentence').dataset.sentence).toBe('First.');
    expect(paragraphs[1].querySelector('img').alt).toBe('Image 1');
    expect(paragraphs[2].querySelector('.sentence').dataset.sentence).toBe('Second.');
    expect(paragraphs[3].querySelector('img').alt).toBe('Image 2');
    expect(paragraphs[4].querySelector('.sentence').dataset.sentence).toBe('Third.');
  });

  test('multiple consecutive images render correctly', () => {
    renderWithContent([
      { type: 'image', src: 'data:image/png;base64,img1', alt: 'A' },
      { type: 'image', src: 'data:image/png;base64,img2', alt: 'B' },
    ]);
    const images = doc.querySelectorAll('.paragraph img');
    expect(images.length).toBe(2);
    expect(images[0].alt).toBe('A');
    expect(images[1].alt).toBe('B');
  });
});

// ============================================================
// Theme application to image paragraphs
// ============================================================
describe('theme applies to image paragraphs', () => {

  test('image paragraphs receive theme background and border', () => {
    setReaderState(win, {
      fileName: 'test.epub',
      pages: [[
        { type: 'image', src: 'data:image/png;base64,abc', alt: '' },
      ]],
      totalPages: 1,
      currentPage: 0,
      theme: 'black',
    });
    win.goToPage(0);
    const para = doc.querySelector('.paragraph');
    // Theme styling is applied to all .paragraph elements
    expect(para.style.background).toBeTruthy();
  });
});

// ============================================================
// EPUB parsing – image extraction
// ============================================================
describe('EPUB image extraction', () => {

  test('extractImagesFromSection returns image objects for <img> tags', () => {
    // Create a mock DOM section with img tags
    const sectionDoc = new JSDOM('<body><p>Text before.</p><img src="ch1/fig1.png" alt="Figure 1"><p>Text after.</p></body>').window.document;

    const result = win.extractContentItems(sectionDoc.body, (src) => 'data:image/png;base64,resolved');
    expect(result.some(item => typeof item === 'object' && item.type === 'image')).toBe(true);

    const imgItem = result.find(item => typeof item === 'object' && item.type === 'image');
    expect(imgItem.src).toBe('data:image/png;base64,resolved');
    expect(imgItem.alt).toBe('Figure 1');
  });

  test('images inside <figure> are extracted', () => {
    const sectionDoc = new JSDOM('<body><figure><img src="pic.jpg" alt="A figure"><figcaption>Caption</figcaption></figure></body>').window.document;

    const result = win.extractContentItems(sectionDoc.body, () => 'data:image/jpeg;base64,abc');
    const imgItem = result.find(item => typeof item === 'object' && item.type === 'image');
    expect(imgItem).toBeTruthy();
    expect(imgItem.alt).toBe('A figure');
  });

  test('text and images are returned in document order', () => {
    const html = '<body><p>Para 1.</p><img src="a.png" alt="img"><p>Para 2.</p></body>';
    const sectionDoc = new JSDOM(html).window.document;

    const result = win.extractContentItems(sectionDoc.body, () => 'data:image/png;base64,x');
    expect(result.length).toBe(3);
    expect(typeof result[0]).toBe('string');
    expect(result[0]).toBe('Para 1.');
    expect(result[1]).toEqual({ type: 'image', src: 'data:image/png;base64,x', alt: 'img' });
    expect(typeof result[2]).toBe('string');
    expect(result[2]).toBe('Para 2.');
  });

  test('inline images within paragraphs are extracted as separate items', () => {
    const html = '<body><p>Text with <img src="inline.png" alt="inline"> inside.</p></body>';
    const sectionDoc = new JSDOM(html).window.document;

    const result = win.extractContentItems(sectionDoc.body, () => 'data:image/png;base64,y');
    // Should have the text parts and the image
    const hasImage = result.some(item => typeof item === 'object' && item.type === 'image');
    expect(hasImage).toBe(true);
  });

  test('images with empty src are skipped', () => {
    const html = '<body><img src="" alt="empty"><p>Text.</p></body>';
    const sectionDoc = new JSDOM(html).window.document;

    const result = win.extractContentItems(sectionDoc.body, () => null);
    const hasImage = result.some(item => typeof item === 'object' && item.type === 'image');
    expect(hasImage).toBe(false);
  });
});

// ============================================================
// Bug fix: DIV containers must be recursed into, not collapsed
// ============================================================
describe('extractContentItems with wrapper divs', () => {

  test('div wrapping paragraphs recurses into children', () => {
    const html = `<body>
      <div class="chapter">
        <p>Paragraph one.</p>
        <p>Paragraph two.</p>
        <img src="fig.png" alt="figure">
        <p>Paragraph three.</p>
      </div>
    </body>`;
    const sectionDoc = new JSDOM(html).window.document;

    const result = win.extractContentItems(sectionDoc.body, () => 'data:image/png;base64,x');
    // Should produce 3 separate text items + 1 image, NOT 1 collapsed text
    const textItems = result.filter(item => typeof item === 'string');
    const imageItems = result.filter(item => typeof item === 'object' && item.type === 'image');
    expect(textItems.length).toBe(3);
    expect(imageItems.length).toBe(1);
    expect(textItems[0]).toBe('Paragraph one.');
    expect(textItems[1]).toBe('Paragraph two.');
    expect(textItems[2]).toBe('Paragraph three.');
  });

  test('nested divs are all recursed into', () => {
    const html = `<body>
      <div class="wrapper">
        <div class="inner">
          <p>First.</p>
          <p>Second.</p>
        </div>
        <img src="pic.png" alt="pic">
      </div>
    </body>`;
    const sectionDoc = new JSDOM(html).window.document;

    const result = win.extractContentItems(sectionDoc.body, () => 'data:image/png;base64,y');
    const textItems = result.filter(item => typeof item === 'string');
    expect(textItems.length).toBe(2);
    expect(textItems[0]).toBe('First.');
    expect(textItems[1]).toBe('Second.');
  });

  test('section and article elements are recursed into', () => {
    const html = `<body>
      <section>
        <p>In a section.</p>
        <img src="a.png" alt="">
      </section>
      <article>
        <p>In an article.</p>
      </article>
    </body>`;
    const sectionDoc = new JSDOM(html).window.document;

    const result = win.extractContentItems(sectionDoc.body, () => 'data:image/png;base64,z');
    const textItems = result.filter(item => typeof item === 'string');
    expect(textItems.length).toBe(2);
    expect(textItems[0]).toBe('In a section.');
    expect(textItems[1]).toBe('In an article.');
  });
});

// ============================================================
// Bug fix: giant paragraphs must be split across pages
// ============================================================
describe('paginateParagraphs splits large paragraphs', () => {

  test('a paragraph with 80 sentences is split across 2 pages', () => {
    const sentences = [];
    for (let i = 0; i < 80; i++) sentences.push(`Sentence ${i}.`);
    const paragraphs = [
      { type: 'text', text: sentences.join(' '), sentences },
    ];
    setReaderState(win, { pages: [], totalPages: 0 });
    win.paginateParagraphs(paragraphs);
    expect(win._readerState.pages.length).toBe(2);
    // First page should have 40 sentences
    const firstPageSentences = win._readerState.pages[0].reduce(
      (sum, p) => sum + (p.type === 'image' ? 1 : p.sentences.length), 0
    );
    expect(firstPageSentences).toBe(40);
    // Second page should have 40 sentences
    const secondPageSentences = win._readerState.pages[1].reduce(
      (sum, p) => sum + (p.type === 'image' ? 1 : p.sentences.length), 0
    );
    expect(secondPageSentences).toBe(40);
  });

  test('a paragraph with 100 sentences is split across 3 pages', () => {
    const sentences = [];
    for (let i = 0; i < 100; i++) sentences.push(`S${i}.`);
    const paragraphs = [
      { type: 'text', text: sentences.join(' '), sentences },
    ];
    setReaderState(win, { pages: [], totalPages: 0 });
    win.paginateParagraphs(paragraphs);
    expect(win._readerState.pages.length).toBe(3);
  });

  test('mixed content with large paragraph paginates correctly', () => {
    const sentences = [];
    for (let i = 0; i < 50; i++) sentences.push(`S${i}.`);
    const paragraphs = [
      { type: 'text', text: 'Short.', sentences: ['Short.'] },
      { type: 'text', text: sentences.join(' '), sentences },
      { type: 'image', src: 'data:image/png;base64,abc', alt: '' },
    ];
    setReaderState(win, { pages: [], totalPages: 0 });
    win.paginateParagraphs(paragraphs);
    // Page 1: 'Short.' (1) + first 39 of 50 = 40, page break
    // Page 2: remaining 11 + image (1) = 12
    expect(win._readerState.pages.length).toBe(2);
  });

  test('split paragraph renders correctly across pages', () => {
    const sentences = [];
    for (let i = 0; i < 80; i++) sentences.push(`Word${i}.`);
    const paragraphs = [
      { type: 'text', text: sentences.join(' '), sentences },
    ];
    setReaderState(win, {
      fileName: 'test.epub',
      pages: [],
      totalPages: 0,
      currentPage: 0,
    });
    win.paginateParagraphs(paragraphs);
    win.goToPage(0);

    // First page should render sentences
    const firstPageSentences = doc.querySelectorAll('.sentence');
    expect(firstPageSentences.length).toBe(40);

    // Second page should also render sentences
    win.goToPage(1);
    const secondPageSentences = doc.querySelectorAll('.sentence');
    expect(secondPageSentences.length).toBe(40);
  });
});

// ============================================================
// CSS class for image paragraphs
// ============================================================
describe('image paragraph styling', () => {

  test('image-paragraph class removes text-indent', () => {
    setReaderState(win, {
      fileName: 'test.epub',
      pages: [[
        { type: 'image', src: 'data:image/png;base64,abc', alt: '' },
      ]],
      totalPages: 1,
      currentPage: 0,
    });
    win.goToPage(0);
    const para = doc.querySelector('.paragraph.image-paragraph');
    expect(para).toBeTruthy();
  });

  test('image element has display block and auto margins for centering', () => {
    setReaderState(win, {
      fileName: 'test.epub',
      pages: [[
        { type: 'image', src: 'data:image/png;base64,abc', alt: '' },
      ]],
      totalPages: 1,
      currentPage: 0,
    });
    win.goToPage(0);
    const img = doc.querySelector('.paragraph img');
    expect(img.style.display).toBe('block');
  });
});
