/**
 * Tests for multi-provider translation support:
 * - Provider selection (google, microsoft, chatgpt)
 * - translateText() dispatches to correct provider
 * - lookupWord() dispatches to correct provider
 * - Google Translate response parsing
 * - Microsoft Translate response parsing
 * - Provider setting persists in state
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
// Provider state management
// ============================================================
describe('translation provider — state', () => {

  test('default provider is chatgpt', () => {
    expect(win._readerState.translationProvider).toBe('chatgpt');
  });

  test('provider can be set to google', () => {
    win._readerState.translationProvider = 'google';
    expect(win._readerState.translationProvider).toBe('google');
  });

  test('provider can be set to microsoft', () => {
    win._readerState.translationProvider = 'microsoft';
    expect(win._readerState.translationProvider).toBe('microsoft');
  });
});

// ============================================================
// translateText dispatch
// ============================================================
describe('translation provider — translateText dispatch', () => {

  test('uses Google Translate when provider is google', async () => {
    jest.useRealTimers();
    win._readerState.translationProvider = 'google';

    let fetchedUrl = null;
    win.fetch = async (url) => {
      fetchedUrl = url;
      // Mock Google Translate response
      return {
        ok: true,
        json: async () => [[['你好', 'hello', null, null, null, null, null, []]]]
      };
    };

    const result = await win.translateText('hello', 'en', 'zh');
    expect(fetchedUrl).toContain('translate.googleapis.com');
    expect(fetchedUrl).toContain('client=gtx');
    expect(result).toBe('你好');
  });

  test('uses Microsoft Translate when provider is microsoft', async () => {
    jest.useRealTimers();
    win._readerState.translationProvider = 'microsoft';

    const fetchedUrls = [];
    win.fetch = async (url, opts) => {
      fetchedUrls.push(url);
      // First call: auth token
      if (url.includes('edge.microsoft.com')) {
        return { ok: true, text: async () => 'mock-jwt-token' };
      }
      // Second call: translate
      return {
        ok: true,
        json: async () => [{ translations: [{ text: '你好', to: 'zh-Hans' }] }]
      };
    };

    const result = await win.translateText('hello', 'en', 'zh');
    expect(fetchedUrls.some(u => u.includes('edge.microsoft.com'))).toBe(true);
    expect(fetchedUrls.some(u => u.includes('microsofttranslator.com/translate'))).toBe(true);
    expect(result).toBe('你好');
  });

  test('does not call Google or Microsoft when provider is chatgpt', async () => {
    jest.useRealTimers();
    win._readerState.translationProvider = 'chatgpt';
    win._readerState.apiKey = 'sk-test';

    let usedGoogle = false;
    let usedMicrosoft = false;
    win.fetch = async (url) => {
      if (url.includes('googleapis.com')) usedGoogle = true;
      if (url.includes('microsofttranslator.com') || url.includes('edge.microsoft.com')) usedMicrosoft = true;
      return { ok: true, json: async () => ({ choices: [{ message: { content: '你好' } }] }) };
    };

    // translateText with chatgpt calls callOpenAI, which uses the injected fetch
    // (not window.fetch), so window.fetch won't be called for Google/MS
    try { await win.translateText('hello', 'en', 'zh'); } catch (_) {}
    expect(usedGoogle).toBe(false);
    expect(usedMicrosoft).toBe(false);
  });
});

// ============================================================
// Google Translate response parsing
// ============================================================
describe('translation provider — Google word lookup', () => {

  test('parses Google dictionary response with POS', async () => {
    jest.useRealTimers();
    win._readerState.translationProvider = 'google';

    win.fetch = async (url) => {
      return {
        ok: true,
        json: async () => {
          // Simplified Google Translate response with dictionary data
          const resp = [
            [['巨大的', 'enormous']],  // index 0: translation
            [                           // index 1: dictionary
              ['adjective', ['巨大的', '庞大的', '极大的'],
                [['enormous', ['巨大的', '庞大的'], null, 0.5]],
                'adjective'
              ]
            ]
          ];
          // Pad to index 12 for definitions
          while (resp.length < 13) resp.push(null);
          resp[12] = [
            ['adjective', [['very large in size, quantity, or extent', null, ['an enormous car']]]]
          ];
          return resp;
        }
      };
    };

    const result = await win.googleLookupWord('enormous');
    expect(result).toContain('EN:');
    expect(result).toContain('adj.');
    expect(result).toContain('CN:');
    expect(result).toContain('巨大的');
  });

  test('parses Google response without dictionary (fallback)', async () => {
    jest.useRealTimers();
    win._readerState.translationProvider = 'google';

    win.fetch = async (url) => {
      return {
        ok: true,
        json: async () => [[['你好', 'hello']]]
      };
    };

    const result = await win.googleLookupWord('hello');
    expect(result).toContain('EN:');
    expect(result).toContain('CN:');
  });

  test('supplements Google result with IPA from offline dictionary', async () => {
    jest.useRealTimers();
    win._readerState.translationProvider = 'google';

    // Inject offline dict with IPA for "happy"
    win._offlineDict = [
      { word: 'happy', pos: 'adj.', def: 'feeling pleasure', cn: '快乐的', pron: '/ˈhæpi/' }
    ];

    win.fetch = async (url) => {
      return {
        ok: true,
        json: async () => {
          const resp = [
            [['快乐的', 'happy']],
            [['adjective', ['快乐的', '高兴的'],
              [['happy', ['快乐的', '高兴的'], null, 0.5]], 'adjective']]
          ];
          while (resp.length < 13) resp.push(null);
          resp[12] = [['adjective', [['feeling or showing pleasure']]]];
          return resp;
        }
      };
    };

    const result = await win.googleLookupWord('happy');
    expect(result).toContain('PRON:');
    expect(result).toContain('/ˈhæpi/');
  });

  test('Google result has no PRON when word not in offline dict', async () => {
    jest.useRealTimers();
    win._readerState.translationProvider = 'google';

    win._offlineDict = [];

    win.fetch = async (url) => {
      return {
        ok: true,
        json: async () => [[['奇妙的', 'serendipitous']]]
      };
    };

    const result = await win.googleLookupWord('serendipitous');
    expect(result).not.toContain('PRON:');
  });
});

// ============================================================
// Microsoft Translate response parsing
// ============================================================
describe('translation provider — Microsoft word lookup', () => {

  test('parses Microsoft dictionary response with POS', async () => {
    jest.useRealTimers();
    win._readerState.translationProvider = 'microsoft';

    win.fetch = async (url, opts) => {
      if (url.includes('edge.microsoft.com')) {
        return { ok: true, text: async () => 'mock-jwt' };
      }
      if (url.includes('dictionary/lookup')) {
        return {
          ok: true,
          json: async () => [{
            translations: [
              {
                posTag: 'ADJ',
                displayTarget: '巨大的',
                backTranslations: [
                  { displayText: 'enormous' },
                  { displayText: 'huge' },
                  { displayText: 'vast' }
                ]
              },
              {
                posTag: 'ADJ',
                displayTarget: '庞大的',
                backTranslations: [{ displayText: 'large' }]
              }
            ]
          }]
        };
      }
      return { ok: true, json: async () => [{ translations: [{ text: '巨大的' }] }] };
    };

    const result = await win.microsoftLookupWord('enormous');
    expect(result).toContain('EN:');
    expect(result).toContain('adj.');
    expect(result).toContain('enormous');
    expect(result).toContain('CN:');
    expect(result).toContain('巨大的');
  });

  test('supplements Microsoft result with IPA from offline dictionary', async () => {
    jest.useRealTimers();
    win._readerState.translationProvider = 'microsoft';

    win._offlineDict = [
      { word: 'enormous', pos: 'adj.', def: 'very large', cn: '巨大的', pron: '/ɪˈnɔːrməs/' }
    ];

    win.fetch = async (url, opts) => {
      if (url.includes('edge.microsoft.com')) {
        return { ok: true, text: async () => 'mock-jwt' };
      }
      if (url.includes('dictionary/lookup')) {
        return {
          ok: true,
          json: async () => [{
            translations: [{
              posTag: 'ADJ', displayTarget: '巨大的',
              backTranslations: [{ displayText: 'enormous' }]
            }]
          }]
        };
      }
      return { ok: true, json: async () => [{ translations: [{ text: '巨大的' }] }] };
    };

    const result = await win.microsoftLookupWord('enormous');
    expect(result).toContain('PRON:');
    expect(result).toContain('/ɪˈnɔːrməs/');
  });
});

// ============================================================
// Word lookup integration with provider
// ============================================================
describe('translation provider — lookupWord integration', () => {

  test('word lookup uses Google when provider is google', async () => {
    jest.useRealTimers();
    win._readerState.translationProvider = 'google';

    let usedGoogle = false;
    win.fetch = async (url) => {
      if (url.includes('translate.googleapis.com')) usedGoogle = true;
      return {
        ok: true,
        json: async () => {
          const resp = [[['跑', 'run']]];
          while (resp.length < 13) resp.push(null);
          resp[1] = [['verb', ['跑', '运行'], [['run', ['跑', '运行'], null, 0.5]], 'verb']];
          resp[12] = [['verb', [['move at a speed faster than a walk']]]];
          return resp;
        }
      };
    };

    await win.lookupWord('run', 'I like to run.');

    expect(usedGoogle).toBe(true);
    const defText = doc.getElementById('defEnText');
    expect(defText.textContent.length).toBeGreaterThan(0);
  });

  test('word lookup uses ChatGPT stub when _stubCallOpenAI is set', async () => {
    jest.useRealTimers();
    win._readerState.translationProvider = 'google'; // provider doesn't matter with stub
    win._stubCallOpenAI = async () => 'EN: (adj.) very large\nCN: 巨大的\nPRON: /ɪˈnɔːrməs/';

    await win.lookupWord('enormous', 'The house was enormous.');

    const posTag = doc.getElementById('defEnglish').querySelector('.pos-tag');
    expect(posTag).not.toBeNull();
    expect(posTag.textContent).toBe('adj.');
  });
});

// ============================================================
// Microsoft auth token caching
// ============================================================
describe('translation provider — Microsoft auth caching', () => {

  test('caches auth token and reuses it', async () => {
    jest.useRealTimers();
    win._readerState.translationProvider = 'microsoft';

    let authCallCount = 0;
    win.fetch = async (url, opts) => {
      if (url.includes('edge.microsoft.com')) {
        authCallCount++;
        return { ok: true, text: async () => 'mock-jwt-' + authCallCount };
      }
      return {
        ok: true,
        json: async () => [{ translations: [{ text: '你好', to: 'zh-Hans' }] }]
      };
    };

    await win.microsoftTranslate('hello', 'en', 'zh-Hans');
    await win.microsoftTranslate('world', 'en', 'zh-Hans');

    // Auth should only be called once (cached)
    expect(authCallCount).toBe(1);
  });
});
