/**
 * Tests for popup.js — browser action popup behavior.
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

function buildPopupDOM(sessionStore = {}, localStore = {}) {
  const html = `<!DOCTYPE html>
    <select id="provider"><option value="google">Google</option><option value="microsoft">Microsoft</option><option value="chatgpt">ChatGPT</option><option value="offline">Offline</option></select>
    <div id="chatgptSettings">
      <input id="apiKey" />
      <select id="model"><option value="gpt-4o-mini">Mini</option><option value="gpt-4o">4o</option></select>
    </div>
    <button id="saveBtn">Save</button>
    <div id="status" style="display:none">Saved</div>
    <button id="openBtn">Open Reader</button>`;

  const dom = new JSDOM(html, { url: 'http://localhost', runScripts: 'dangerously' });
  const win = dom.window;

  const chrome = {
    storage: {
      session: {
        get: jest.fn((keys, cb) => {
          const result = {};
          for (const k of keys) if (sessionStore[k] !== undefined) result[k] = sessionStore[k];
          cb(result);
        }),
        set: jest.fn((obj, cb) => {
          Object.assign(sessionStore, obj);
          if (cb) cb();
        }),
      },
      local: {
        get: jest.fn((keys, cb) => {
          const result = {};
          for (const k of keys) if (localStore[k] !== undefined) result[k] = localStore[k];
          cb(result);
        }),
        set: jest.fn((obj, cb) => {
          Object.assign(localStore, obj);
          if (cb) cb();
        }),
      },
    },
    runtime: { lastError: null, getURL: (p) => `chrome-extension://test/${p}` },
    tabs: { create: jest.fn() },
  };
  win.chrome = chrome;

  // Execute popup.js in JSDOM context
  const code = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf-8');
  win.eval(code);

  // Trigger DOMContentLoaded
  const event = new win.Event('DOMContentLoaded');
  win.document.dispatchEvent(event);

  return { dom, win, chrome };
}

describe('popup.js', () => {
  let dom, win, chrome;

  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('loads API key from session storage on init', () => {
    ({ dom, win, chrome } = buildPopupDOM({ openaiApiKey: 'sk-saved' }));
    expect(chrome.storage.session.get).toHaveBeenCalledWith(['openaiApiKey'], expect.any(Function));
    expect(win.document.getElementById('apiKey').value).toBe('sk-saved');
  });

  test('loads model from local storage on init', () => {
    ({ dom, win, chrome } = buildPopupDOM({}, { openaiModel: 'gpt-4o' }));
    expect(chrome.storage.local.get).toHaveBeenCalledWith(['openaiModel'], expect.any(Function));
    expect(win.document.getElementById('model').value).toBe('gpt-4o');
  });

  test('loads provider from local storage on init', () => {
    ({ dom, win, chrome } = buildPopupDOM({}, { translationProvider: 'microsoft' }));
    expect(chrome.storage.local.get).toHaveBeenCalledWith(['translationProvider'], expect.any(Function));
    expect(win.document.getElementById('provider').value).toBe('microsoft');
  });

  test('save button stores provider in local storage', () => {
    ({ dom, win, chrome } = buildPopupDOM());
    win.document.getElementById('provider').value = 'google';
    win.document.getElementById('saveBtn').click();
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { translationProvider: 'google' },
      expect.any(Function)
    );
  });

  test('chatgpt settings hidden when provider is not chatgpt', () => {
    ({ dom, win, chrome } = buildPopupDOM({}, { translationProvider: 'google' }));
    const settings = win.document.getElementById('chatgptSettings');
    expect(settings.classList.contains('hidden')).toBe(true);
  });

  test('chatgpt settings visible when provider is chatgpt', () => {
    ({ dom, win, chrome } = buildPopupDOM({}, { translationProvider: 'chatgpt' }));
    const settings = win.document.getElementById('chatgptSettings');
    expect(settings.classList.contains('hidden')).toBe(false);
  });

  test('save button stores API key in session storage', () => {
    ({ dom, win, chrome } = buildPopupDOM());
    win.document.getElementById('apiKey').value = 'sk-test-key';
    win.document.getElementById('saveBtn').click();
    expect(chrome.storage.session.set).toHaveBeenCalledWith(
      { openaiApiKey: 'sk-test-key' },
      expect.any(Function)
    );
  });

  test('save button stores model in local storage', () => {
    ({ dom, win, chrome } = buildPopupDOM());
    win.document.getElementById('model').value = 'gpt-4o';
    win.document.getElementById('saveBtn').click();
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { openaiModel: 'gpt-4o' },
      expect.any(Function)
    );
  });

  test('open button creates new tab with reader URL', () => {
    ({ dom, win, chrome } = buildPopupDOM());
    win.document.getElementById('openBtn').click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://test/reader.html'
    });
  });

  test('shows status message after save', async () => {
    jest.useFakeTimers();
    ({ dom, win, chrome } = buildPopupDOM());
    win.document.getElementById('saveBtn').click();
    // Wait for async Promise.all to resolve
    await Promise.resolve();
    await Promise.resolve();
    const status = win.document.getElementById('status');
    expect(status.style.display).toBe('block');
    jest.advanceTimersByTime(2000);
    expect(status.style.display).toBe('none');
    jest.useRealTimers();
  });
});
