/**
 * TDD tests for auto-hiding feature buttons.
 *
 * Behaviour:
 *  - In reading mode, top bar and bottom bar auto-hide after an idle timeout.
 *  - Moving the mouse into a trigger zone near the top/bottom edge reveals them.
 *  - Moving the mouse away hides them again after the idle timeout.
 *  - The bars should NOT auto-hide on the upload screen.
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
  // reader.js uses bare `document`, `localStorage`, `navigator` etc.
  // jsdom's window.eval provides those, but we need to wrap in a function
  // that sets up the globals in case they're not auto-resolved.
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

function fireMouseMove(win, clientX, clientY) {
  const ev = new win.MouseEvent('mousemove', { clientX, clientY, bubbles: true });
  win.document.dispatchEvent(ev);
}

// --------------- tests ---------------

let dom, doc, win;

beforeEach(() => {
  jest.useFakeTimers();
  ({ dom, doc, win } = buildDOM());
  loadReaderJS(win);

  // Simulate entering reading mode
  doc.getElementById('uploadScreen').classList.remove('active');
  doc.getElementById('readerScreen').classList.add('active');
  // Manually fire DOMContentLoaded to run init()
  doc.dispatchEvent(new win.Event('DOMContentLoaded'));
});

afterEach(() => {
  jest.useRealTimers();
  dom.window.close();
});

describe('auto-hide bars in reading mode', () => {

  test('top bar gets "auto-hide" class after idle timeout', () => {
    const topBar = doc.querySelector('.top-bar');
    // After entering reading mode and idle timeout passes, bar should hide
    jest.advanceTimersByTime(3000);
    expect(topBar.classList.contains('auto-hide')).toBe(true);
  });

  test('bottom bar gets "auto-hide" class after idle timeout', () => {
    const bottomBar = doc.querySelector('.bottom-bar');
    jest.advanceTimersByTime(3000);
    expect(bottomBar.classList.contains('auto-hide')).toBe(true);
  });

  test('moving mouse to top edge reveals top bar', () => {
    const topBar = doc.querySelector('.top-bar');
    // Let bars hide
    jest.advanceTimersByTime(3000);
    expect(topBar.classList.contains('auto-hide')).toBe(true);

    // Move mouse to top edge (y < 50)
    fireMouseMove(win, 400, 20);
    expect(topBar.classList.contains('auto-hide')).toBe(false);
  });

  test('moving mouse to bottom edge reveals bottom bar', () => {
    const bottomBar = doc.querySelector('.bottom-bar');
    jest.advanceTimersByTime(3000);
    expect(bottomBar.classList.contains('auto-hide')).toBe(true);

    // Move mouse to bottom edge (y > innerHeight - 50)
    fireMouseMove(win, 400, 770);
    expect(bottomBar.classList.contains('auto-hide')).toBe(false);
  });

  test('bars hide again after mouse leaves trigger zone and idle timeout passes', () => {
    const topBar = doc.querySelector('.top-bar');
    jest.advanceTimersByTime(3000);

    // Reveal top bar
    fireMouseMove(win, 400, 20);
    expect(topBar.classList.contains('auto-hide')).toBe(false);

    // Move mouse to middle of screen (away from edge)
    fireMouseMove(win, 400, 400);

    // Should hide again after timeout
    jest.advanceTimersByTime(3000);
    expect(topBar.classList.contains('auto-hide')).toBe(true);
  });

  test('mouse movement in the middle resets the idle timer', () => {
    const topBar = doc.querySelector('.top-bar');

    // Advance partway
    jest.advanceTimersByTime(2000);
    expect(topBar.classList.contains('auto-hide')).toBe(false);

    // Move mouse in the middle — resets timer
    fireMouseMove(win, 400, 400);
    jest.advanceTimersByTime(2000);
    expect(topBar.classList.contains('auto-hide')).toBe(false);

    // After full timeout from last movement, should hide
    jest.advanceTimersByTime(1000);
    expect(topBar.classList.contains('auto-hide')).toBe(true);
  });

  test('bars do NOT auto-hide when on upload screen', () => {
    // Switch back to upload screen
    doc.getElementById('readerScreen').classList.remove('active');
    doc.getElementById('uploadScreen').classList.add('active');

    const topBar = doc.querySelector('.top-bar');
    jest.advanceTimersByTime(5000);
    expect(topBar.classList.contains('auto-hide')).toBe(false);
  });

  test('search bar also hides with top bar', () => {
    const searchBar = doc.getElementById('searchBar');
    searchBar.classList.add('active');

    jest.advanceTimersByTime(3000);
    expect(searchBar.classList.contains('auto-hide')).toBe(true);
  });

  test('moving mouse to top edge also reveals search bar if it was active', () => {
    const searchBar = doc.getElementById('searchBar');
    searchBar.classList.add('active');

    jest.advanceTimersByTime(3000);
    expect(searchBar.classList.contains('auto-hide')).toBe(true);

    fireMouseMove(win, 400, 20);
    expect(searchBar.classList.contains('auto-hide')).toBe(false);
  });
});
