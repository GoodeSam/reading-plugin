/**
 * TDD tests for EPUB content display issues with the Diary of a Wimpy Kid EPUB.
 *
 * Issues identified:
 *  1. Chinese sentence splitting: splitIntoSentences handles both ASCII (.!?)
 *     and Chinese (。！？) punctuation for proper sentence boundaries.
 *  2. Image path resolution: EPUB image src like "../Images/fig.jpeg" produces
 *     unresolved paths like "OEBPS/Text/../Images/fig.jpeg" — needs normalization.
 *  3. Content extraction: the illustrated book has 8,043 images interleaved with
 *     text inside <p class="illustration"><img ...></p> — all must be extracted
 *     in document order alongside text.
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
// Chinese sentence splitting
// ============================================================
describe('Chinese sentence splitting', () => {

  test('splits on Chinese period 。', () => {
    const result = win.splitIntoParagraphs('第一句话。第二句话。');
    expect(result[0].sentences.length).toBe(2);
    expect(result[0].sentences[0]).toBe('第一句话。');
    expect(result[0].sentences[1]).toBe('第二句话。');
  });

  test('splits on Chinese exclamation mark ！', () => {
    const result = win.splitIntoParagraphs('太棒了！真的很好。');
    expect(result[0].sentences.length).toBe(2);
    expect(result[0].sentences[0]).toBe('太棒了！');
    expect(result[0].sentences[1]).toBe('真的很好。');
  });

  test('splits on Chinese question mark ？', () => {
    const result = win.splitIntoParagraphs('你好吗？我很好。');
    expect(result[0].sentences.length).toBe(2);
    expect(result[0].sentences[0]).toBe('你好吗？');
    expect(result[0].sentences[1]).toBe('我很好。');
  });

  test('handles mixed Chinese and English punctuation', () => {
    const result = win.splitIntoParagraphs('Hello. 你好。Bye! 再见！');
    expect(result[0].sentences.length).toBe(4);
  });

  test('handles real Wimpy Kid Chinese paragraph', () => {
    const text = '我就开门见山，直奔主题吧：这是一本日志，可不是什么日记。我知道这个本子封面上印着什么，但我妈出门买本子的时候，我可是千叮咛万嘱咐，叫她别买写着"日记"二字的。';
    const result = win.splitIntoParagraphs(text);
    expect(result[0].sentences.length).toBe(2);
    expect(result[0].sentences[0]).toContain('日记。');
    expect(result[0].sentences[1]).toContain('二字的。');
  });

  test('single Chinese sentence without period is kept intact', () => {
    const result = win.splitIntoParagraphs('星期二');
    expect(result[0].sentences.length).toBe(1);
    expect(result[0].sentences[0]).toBe('星期二');
  });

  test('English text still splits correctly', () => {
    const result = win.splitIntoParagraphs('Hello world. Goodbye world! Really?');
    expect(result[0].sentences.length).toBe(3);
  });

  test('Chinese sentences are individually selectable in rendering', () => {
    const text = '第一句话。第二句话。第三句话。';
    const paragraphs = win.splitIntoParagraphs(text);
    setReaderState(win, {
      fileName: 'test.epub',
      pages: [paragraphs],
      totalPages: 1,
      currentPage: 0,
    });
    win.goToPage(0);

    const sentences = doc.querySelectorAll('.sentence');
    expect(sentences.length).toBe(3);
    expect(sentences[0].dataset.sentence).toBe('第一句话。');
    expect(sentences[1].dataset.sentence).toBe('第二句话。');
    expect(sentences[2].dataset.sentence).toBe('第三句话。');
  });
});

// ============================================================
// Image path normalization
// ============================================================
describe('image path normalization', () => {

  test('normalizeImagePath resolves parent directory references', () => {
    expect(win.normalizeImagePath('OEBPS/Text/../Images/fig.jpeg'))
      .toBe('OEBPS/Images/fig.jpeg');
  });

  test('normalizeImagePath handles multiple parent references', () => {
    expect(win.normalizeImagePath('a/b/c/../../d/file.png'))
      .toBe('a/d/file.png');
  });

  test('normalizeImagePath handles current directory references', () => {
    expect(win.normalizeImagePath('a/./b/./c.png'))
      .toBe('a/b/c.png');
  });

  test('normalizeImagePath leaves clean paths unchanged', () => {
    expect(win.normalizeImagePath('OEBPS/Images/fig.jpeg'))
      .toBe('OEBPS/Images/fig.jpeg');
  });

  test('normalizeImagePath handles simple relative path', () => {
    expect(win.normalizeImagePath('../Images/cover.jpeg'))
      .toBe('Images/cover.jpeg');
  });
});

// ============================================================
// Wimpy Kid EPUB content structure extraction
// ============================================================
describe('Wimpy Kid EPUB content structure', () => {

  test('extracts text and images from typical chapter section', () => {
    const html = `<body class="calibre">
      <h1 class="onetitle">Chapter Title</h1>
      <h2 class="twotitle">September</h2>
      <p class="text">Tuesday</p>
      <p class="text">First paragraph with story text here.</p>
      <p class="illustration"><img alt="" src="../Images/image01134.jpeg" class="calibre1"/></p>
      <p class="text">Second paragraph continues the story.</p>
      <p class="illustration"><img alt="" src="../Images/image01135.jpeg" class="calibre1"/></p>
      <p class="text">Third paragraph of the story.</p>
    </body>`;
    const sectionDoc = new JSDOM(html).window.document;

    const result = win.extractContentItems(sectionDoc.body, () => 'data:image/jpeg;base64,test');
    const texts = result.filter(i => typeof i === 'string');
    const imgs = result.filter(i => typeof i === 'object' && i.type === 'image');

    expect(texts.length).toBeGreaterThanOrEqual(5); // h1, h2, 3+ text paragraphs
    expect(imgs.length).toBe(2);
    expect(texts[0]).toBe('Chapter Title');
    expect(texts[1]).toBe('September');
    expect(texts[2]).toBe('Tuesday');
  });

  test('preserves interleaved order of text and illustrations', () => {
    const html = `<body>
      <p class="text">Before.</p>
      <p class="illustration"><img alt="" src="img1.jpeg"/></p>
      <p class="text">Between.</p>
      <p class="illustration"><img alt="" src="img2.jpeg"/></p>
      <p class="text">After.</p>
    </body>`;
    const sectionDoc = new JSDOM(html).window.document;

    const result = win.extractContentItems(sectionDoc.body, (src) => `resolved:${src}`);
    expect(result.length).toBe(5);
    expect(result[0]).toBe('Before.');
    expect(result[1]).toEqual({ type: 'image', src: 'resolved:img1.jpeg', alt: '' });
    expect(result[2]).toBe('Between.');
    expect(result[3]).toEqual({ type: 'image', src: 'resolved:img2.jpeg', alt: '' });
    expect(result[4]).toBe('After.');
  });

  test('handles footnote paragraphs (class="notecontent")', () => {
    const html = `<body>
      <p class="text">Main text with reference.</p>
      <p class="notetitle">Notes</p>
      <p class="notecontent"><a id="note_1" href="#">[1]</a> Translator note here.</p>
    </body>`;
    const sectionDoc = new JSDOM(html).window.document;

    const result = win.extractContentItems(sectionDoc.body, () => null);
    const texts = result.filter(i => typeof i === 'string');
    expect(texts.length).toBe(3);
    expect(texts[2]).toContain('[1]');
    expect(texts[2]).toContain('Translator note here.');
  });

  test('handles image inside h1 (combined title + illustration)', () => {
    const html = `<body>
      <h1 class="onetitle">Title <img alt="" src="logo.jpeg" class="calibre1"/> Subtitle</h1>
      <p class="text">Content here.</p>
    </body>`;
    const sectionDoc = new JSDOM(html).window.document;

    const result = win.extractContentItems(sectionDoc.body, () => 'data:image/jpeg;base64,x');
    // h1 has inline img — should extract text AND image
    const texts = result.filter(i => typeof i === 'string');
    const imgs = result.filter(i => typeof i === 'object' && i.type === 'image');
    expect(texts.length).toBeGreaterThanOrEqual(2); // h1 text + p text
    expect(imgs.length).toBe(1);
  });

  test('handles cover page with image inside <p>', () => {
    const html = `<body class="calibre">
      <p class="cover"><img alt="cover" src="../Images/cover.jpeg" class="calibre1"/></p>
    </body>`;
    const sectionDoc = new JSDOM(html).window.document;

    const result = win.extractContentItems(sectionDoc.body, () => 'data:image/jpeg;base64,cover');
    const imgs = result.filter(i => typeof i === 'object' && i.type === 'image');
    expect(imgs.length).toBe(1);
    expect(imgs[0].src).toBe('data:image/jpeg;base64,cover');
  });

  test('handles sign image paragraph', () => {
    const html = `<body>
      <p class="text">Letter content here.</p>
      <p class="signimg"><img alt="" src="signature.jpeg" class="calibre1"/></p>
      <p class="dateauthor">Jeff</p>
    </body>`;
    const sectionDoc = new JSDOM(html).window.document;

    const result = win.extractContentItems(sectionDoc.body, () => 'data:image/jpeg;base64,sig');
    const texts = result.filter(i => typeof i === 'string');
    const imgs = result.filter(i => typeof i === 'object' && i.type === 'image');
    expect(texts.length).toBe(2); // text + dateauthor
    expect(imgs.length).toBe(1);
  });

  test('handles illustrationtitle paragraphs', () => {
    const html = `<body>
      <p class="illustration"><img alt="" src="drawing.jpeg"/></p>
      <p class="illustrationtitle">Caption for the drawing</p>
    </body>`;
    const sectionDoc = new JSDOM(html).window.document;

    const result = win.extractContentItems(sectionDoc.body, () => 'data:image/jpeg;base64,x');
    const texts = result.filter(i => typeof i === 'string');
    const imgs = result.filter(i => typeof i === 'object' && i.type === 'image');
    expect(texts.length).toBe(1);
    expect(texts[0]).toBe('Caption for the drawing');
    expect(imgs.length).toBe(1);
  });
});

// ============================================================
// Full pipeline: Chinese + images render correctly together
// ============================================================
describe('full pipeline with Chinese content and images', () => {

  test('Chinese text and images paginate and render correctly', () => {
    const items = [
      '第一句话。第二句话。',
      { type: 'image', src: 'data:image/png;base64,abc', alt: 'illustration' },
      '第三句话。第四句话。',
    ];
    const paragraphs = win.splitIntoParagraphs(items);

    // Should have 3 items: 2 text paragraphs + 1 image
    expect(paragraphs.length).toBe(3);

    // Chinese text should be split into sentences
    expect(paragraphs[0].sentences.length).toBe(2);
    expect(paragraphs[2].sentences.length).toBe(2);

    // Set up and render
    setReaderState(win, {
      fileName: 'test.epub',
      pages: [paragraphs],
      totalPages: 1,
      currentPage: 0,
    });
    win.goToPage(0);

    // Verify DOM
    const allParagraphs = doc.querySelectorAll('.paragraph');
    expect(allParagraphs.length).toBe(3);

    // First paragraph: 2 Chinese sentences
    const firstSentences = allParagraphs[0].querySelectorAll('.sentence');
    expect(firstSentences.length).toBe(2);

    // Second: image
    const img = allParagraphs[1].querySelector('img');
    expect(img).toBeTruthy();

    // Third paragraph: 2 Chinese sentences
    const thirdSentences = allParagraphs[2].querySelectorAll('.sentence');
    expect(thirdSentences.length).toBe(2);
  });

  test('bilingual content with both Chinese and English sentences', () => {
    // Simulating a bilingual section from the EPUB
    const items = [
      '我就开门见山，直奔主题吧：这是一本日志，可不是什么日记。我知道封面上印着什么。',
      { type: 'image', src: 'data:image/png;base64,abc', alt: '' },
      'First of all, let me get something straight: This is a JOURNAL, not a diary. I know what it says on the cover.',
    ];
    const paragraphs = win.splitIntoParagraphs(items);

    // Chinese paragraph should split on 。
    expect(paragraphs[0].sentences.length).toBe(2);
    // English paragraph should split on .
    expect(paragraphs[2].sentences.length).toBe(2);
  });
});
