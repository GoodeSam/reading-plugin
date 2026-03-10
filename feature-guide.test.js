/**
 * TDD tests for the Feature Guide overlay.
 *
 * A help button ("?") in the top bar opens a full-screen overlay listing
 * every feature with its name, description, and usage instructions.
 *
 * Features are defined in a central FEATURE_REGISTRY array so that the
 * guide content updates automatically when entries are added or removed.
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

function renderTestPage(doc, win) {
  const pages = [[
    {
      text: 'The sun rose slowly.',
      sentences: ['The sun rose slowly.']
    }
  ]];
  setReaderState(win, {
    fileName: 'test.pdf',
    pages,
    totalPages: 1,
    currentPage: 0,
  });
  win.goToPage(0);
}

// --------------- tests ---------------

let dom, doc, win;

beforeEach(() => {
  jest.useFakeTimers();
  ({ dom, doc, win } = buildDOM());
  loadReaderJS(win);
  enterReadingMode(doc, win);
  renderTestPage(doc, win);
});

afterEach(() => {
  jest.useRealTimers();
  dom.window.close();
});

// ============================================================
// Feature registry
// ============================================================
describe('feature registry', () => {

  test('FEATURE_REGISTRY is exposed on window', () => {
    expect(Array.isArray(win.FEATURE_REGISTRY)).toBe(true);
  });

  test('registry has at least 10 features', () => {
    expect(win.FEATURE_REGISTRY.length).toBeGreaterThanOrEqual(10);
  });

  test('each feature entry has name, icon, description, and usage', () => {
    for (const f of win.FEATURE_REGISTRY) {
      expect(typeof f.name).toBe('string');
      expect(f.name.length).toBeGreaterThan(0);
      expect(typeof f.icon).toBe('string');
      expect(typeof f.description).toBe('string');
      expect(f.description.length).toBeGreaterThan(0);
      expect(typeof f.usage).toBe('string');
      expect(f.usage.length).toBeGreaterThan(0);
    }
  });

  test('registry feature names are unique', () => {
    const names = win.FEATURE_REGISTRY.map(f => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('registry includes known features', () => {
    const names = win.FEATURE_REGISTRY.map(f => f.name);
    expect(names).toContain('Word Lookup');
    expect(names).toContain('Sentence Translation');
    expect(names).toContain('Paragraph Translation');
    expect(names).toContain('Text-to-Speech');
    expect(names).toContain('Search');
    expect(names).toContain('Bookmarks');
    expect(names).toContain('Notes');
    expect(names).toContain('Word List');
    expect(names).toContain('Reading History');
    expect(names).toContain('Page Themes');
    expect(names).toContain('Font Size');
    expect(names).toContain('Content Width');
    expect(names).toContain('Page Navigation');
    expect(names).toContain('Auto-Hide Bars');
  });
});

// ============================================================
// Help button UI
// ============================================================
describe('help button', () => {

  test('help button exists in the top bar', () => {
    const btn = doc.getElementById('helpBtn');
    expect(btn).toBeTruthy();
    expect(btn.closest('.top-bar-actions')).toBeTruthy();
  });

  test('help button has accessible title', () => {
    const btn = doc.getElementById('helpBtn');
    expect(btn.title).toBe('Feature Guide');
  });

  test('help button displays "?" text', () => {
    const btn = doc.getElementById('helpBtn');
    expect(btn.textContent.trim()).toBe('?');
  });
});

// ============================================================
// Guide overlay UI
// ============================================================
describe('guide overlay', () => {

  test('guide overlay element exists in the DOM', () => {
    expect(doc.getElementById('featureGuide')).toBeTruthy();
  });

  test('guide overlay is hidden by default', () => {
    const guide = doc.getElementById('featureGuide');
    expect(guide.classList.contains('active')).toBe(false);
  });

  test('clicking help button opens the guide', () => {
    doc.getElementById('helpBtn').click();
    expect(doc.getElementById('featureGuide').classList.contains('active')).toBe(true);
  });

  test('guide has a close button', () => {
    expect(doc.getElementById('featureGuideClose')).toBeTruthy();
  });

  test('close button hides the guide', () => {
    doc.getElementById('helpBtn').click();
    expect(doc.getElementById('featureGuide').classList.contains('active')).toBe(true);

    doc.getElementById('featureGuideClose').click();
    expect(doc.getElementById('featureGuide').classList.contains('active')).toBe(false);
  });

  test('guide has a title', () => {
    doc.getElementById('helpBtn').click();
    const title = doc.querySelector('#featureGuide .guide-title');
    expect(title).toBeTruthy();
    expect(title.textContent).toContain('Feature Guide');
  });
});

// ============================================================
// Guide content — rendered from FEATURE_REGISTRY
// ============================================================
describe('guide content from registry', () => {

  test('guide renders one card per registry entry', () => {
    doc.getElementById('helpBtn').click();
    const cards = doc.querySelectorAll('#featureGuide .guide-card');
    expect(cards.length).toBe(win.FEATURE_REGISTRY.length);
  });

  test('each card shows the feature name', () => {
    doc.getElementById('helpBtn').click();
    const cards = doc.querySelectorAll('#featureGuide .guide-card');
    const names = win.FEATURE_REGISTRY.map(f => f.name);
    cards.forEach((card, i) => {
      expect(card.querySelector('.guide-card-name').textContent).toBe(names[i]);
    });
  });

  test('each card shows the feature icon', () => {
    doc.getElementById('helpBtn').click();
    const cards = doc.querySelectorAll('#featureGuide .guide-card');
    cards.forEach((card, i) => {
      expect(card.querySelector('.guide-card-icon').textContent).toBe(win.FEATURE_REGISTRY[i].icon);
    });
  });

  test('each card shows the feature description', () => {
    doc.getElementById('helpBtn').click();
    const cards = doc.querySelectorAll('#featureGuide .guide-card');
    cards.forEach((card, i) => {
      expect(card.querySelector('.guide-card-desc').textContent).toBe(win.FEATURE_REGISTRY[i].description);
    });
  });

  test('each card shows the usage instructions', () => {
    doc.getElementById('helpBtn').click();
    const cards = doc.querySelectorAll('#featureGuide .guide-card');
    cards.forEach((card, i) => {
      expect(card.querySelector('.guide-card-usage').textContent).toContain(win.FEATURE_REGISTRY[i].usage);
    });
  });
});

// ============================================================
// Dynamic update — adding a feature to registry updates guide
// ============================================================
describe('dynamic registry updates', () => {

  test('adding a feature to the registry and reopening shows the new feature', () => {
    const countBefore = win.FEATURE_REGISTRY.length;

    win.FEATURE_REGISTRY.push({
      name: 'Test Feature',
      icon: 'T',
      description: 'A test feature for testing.',
      usage: 'Do the test thing.'
    });

    // Close and reopen guide to re-render
    doc.getElementById('helpBtn').click();
    const cards = doc.querySelectorAll('#featureGuide .guide-card');
    expect(cards.length).toBe(countBefore + 1);

    const lastCard = cards[cards.length - 1];
    expect(lastCard.querySelector('.guide-card-name').textContent).toBe('Test Feature');

    // Clean up
    win.FEATURE_REGISTRY.pop();
  });

  test('removing a feature from the registry and reopening hides it', () => {
    const removed = win.FEATURE_REGISTRY.pop();
    doc.getElementById('helpBtn').click();

    const names = Array.from(doc.querySelectorAll('.guide-card-name')).map(el => el.textContent);
    expect(names).not.toContain(removed.name);

    // Restore
    win.FEATURE_REGISTRY.push(removed);
  });
});

// ============================================================
// Overlay click-outside closes
// ============================================================
describe('guide overlay interactions', () => {

  test('clicking the overlay background closes the guide', () => {
    doc.getElementById('helpBtn').click();
    expect(doc.getElementById('featureGuide').classList.contains('active')).toBe(true);

    // Click the overlay itself (not the inner content)
    const guide = doc.getElementById('featureGuide');
    guide.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    expect(guide.classList.contains('active')).toBe(false);
  });

  test('clicking inside guide content does NOT close it', () => {
    doc.getElementById('helpBtn').click();
    const inner = doc.querySelector('#featureGuide .guide-inner');
    inner.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    expect(doc.getElementById('featureGuide').classList.contains('active')).toBe(true);
  });
});
