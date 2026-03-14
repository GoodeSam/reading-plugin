// ===== Constants =====
const DEFAULT_MODEL = 'gpt-4o-mini';
const TTS_MODEL = 'tts-1';
const TTS_VOICE = 'alloy';
const SENTENCES_PER_PAGE = 40;
const GOOGLE_TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';
const MS_AUTH_URL = 'https://edge.microsoft.com/translate/auth';
const MS_TRANSLATE_URL = 'https://api.cognitive.microsofttranslator.com/translate';
const MS_DICT_URL = 'https://api.cognitive.microsofttranslator.com/dictionary/lookup';

// ===== State =====
let state = {
  pages: [],        // Array of pages, each page is array of paragraphs, each paragraph is array of sentences
  currentPage: 0,
  totalPages: 0,
  apiKey: '',
  model: DEFAULT_MODEL,
  translationProvider: 'chatgpt',  // 'chatgpt' | 'google' | 'microsoft' | 'offline'
  offlineDict: null,  // loaded from dict-en.json
  msAuthToken: '',
  msAuthExpiry: 0,
  notes: [],
  activeSentenceEl: null,
  fileName: '',
  // Search state
  searchMatches: [],   // [{pageIndex, paraIndex, sentIndex, wordIndex, offset, length}]
  searchCurrent: -1,
  // Hover state
  hoveredWord: null,
  hoveredSentence: null,
  // Font size
  fontSize: 18,
  // Content width
  contentWidth: 800,
  // Theme
  theme: 'brown',
  // Gesture mode: 'menu' (show action buttons) or 'direct' (auto-translate)
  gestureMode: 'menu',
};

// Expose state for testing
window._readerState = state;

// ===== DOM Elements =====
const $ = (sel) => document.querySelector(sel);
const uploadScreen = $('#uploadScreen');
const readerScreen = $('#readerScreen');
const dropZone = $('#dropZone');
const fileInput = $('#fileInput');
const browseBtn = $('#browseBtn');
const backBtn = $('#backBtn');
const bookTitle = $('#bookTitle');
const pageInfo = $('#pageInfo');
const readerContent = $('#readerContent');
const prevPageBtn = $('#prevPage');
const nextPageBtn = $('#nextPage');
const pageIndicator = $('#pageIndicator');

// Sentence panel
const panelOverlay = $('#panelOverlay');
const sentencePanel = $('#sentencePanel');
const panelClose = $('#panelClose');
const panelSentence = $('#panelSentence');
const btnTranslate = $('#btnTranslate');
const btnGrammar = $('#btnGrammar');
const btnTTS = $('#btnTTS');
const btnCopy = $('#btnCopy');
const panelTranslation = $('#panelTranslation');
const translationText = $('#translationText');
const panelGrammar = $('#panelGrammar');
const grammarText = $('#grammarText');

// Word popup
const wordPopup = $('#wordPopup');
const popupWord = $('#popupWord');
const wordPopupClose = $('#wordPopupClose');
const defLoading = $('#defLoading');
const defEnglish = $('#defEnglish');
const defEnText = $('#defEnText');
const defChineseSection = $('#defChineseSection');
const toggleChinese = $('#toggleChinese');
const defCnText = $('#defCnText');
const defPronunciation = $('#defPronunciation');
const btnPronounce = $('#btnPronounce');

// Paragraph popup
const paraPopup = $('#paraPopup');
const paraPopupOverlay = $('#paraPopupOverlay');
const paraPopupClose = $('#paraPopupClose');
const paraPopupText = $('#paraPopupText');
const paraTranslateBtn = $('#paraTranslateBtn');
const paraTTSBtn = $('#paraTTSBtn');
const paraCopyBtn = $('#paraCopyBtn');
const paraPopupTranslation = $('#paraPopupTranslation');

// Gesture mode button
const gestureModeBtn = $('#gestureModeBtn');

// Selection toolbar
const selectionToolbar = $('#selectionToolbar');
const selCopy = $('#selCopy');
const selNote = $('#selNote');

// Notes
const notesToggle = $('#notesToggle');
const notesPanel = $('#notesPanel');
const notesClose = $('#notesClose');
const notesList = $('#notesList');
const notesExport = $('#notesExport');

// Search
const searchToggle = $('#searchToggle');
const searchBar = $('#searchBar');
const searchInput = $('#searchInput');
const searchCount = $('#searchCount');
const searchPrev = $('#searchPrev');
const searchNext = $('#searchNext');
const searchClose = $('#searchClose');

// Bookmark
const bookmarkBtn = $('#bookmarkBtn');

// Font size
const fontDecrease = $('#fontDecrease');
const fontIncrease = $('#fontIncrease');
const fontSizeLabel = $('#fontSizeLabel');

// Width
const widthDecrease = $('#widthDecrease');
const widthIncrease = $('#widthIncrease');
const widthLabel = $('#widthLabel');

// ===== Init =====
document.addEventListener('DOMContentLoaded', init);

let _initialized = false;
function init() {
  if (_initialized) return;
  _initialized = true;
  loadSettings();
  loadNotes();
  loadFontSize();
  loadContentWidth();
  loadTheme();
  bindEvents();
  if (readerScreen.classList.contains('active')) {
    startAutoHideTimer();
    historyToggle.classList.add('visible');
    notesToggle.classList.add('visible');
    wordListToggle.classList.add('visible');
  }
}

function loadFontSize() {
  const saved = localStorage.getItem('reader-font-size');
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (Number.isFinite(parsed)) state.fontSize = Math.min(32, Math.max(12, parsed));
  }
  applyFontSize();
}

function applyFontSize() {
  readerContent.style.fontSize = state.fontSize + 'px';
  fontSizeLabel.textContent = state.fontSize;
}

function changeFontSize(delta) {
  state.fontSize = Math.min(32, Math.max(12, state.fontSize + delta));
  localStorage.setItem('reader-font-size', state.fontSize);
  applyFontSize();
}

function loadContentWidth() {
  const saved = localStorage.getItem('reader-content-width');
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (Number.isFinite(parsed)) state.contentWidth = Math.min(1600, Math.max(500, parsed));
  }
  applyContentWidth();
}

function applyContentWidth() {
  readerContent.style.maxWidth = state.contentWidth + 'px';
  widthLabel.textContent = state.contentWidth;
}

function changeContentWidth(delta) {
  state.contentWidth = Math.min(1600, Math.max(500, state.contentWidth + delta));
  localStorage.setItem('reader-content-width', state.contentWidth);
  applyContentWidth();
}

// ===== Page Theme =====
const THEMES = {
  white:  { bg: '#ffffff', text: '#2d2a24', paraBg: '#f5f5f5', paraBorder: '#d6d6d6', barBg: '#ffffff' },
  black:  { bg: '#1a1a1a', text: '#d4d4d4', paraBg: '#232323', paraBorder: '#444444', barBg: '#1e1e1e' },
  brown:  { bg: '#f5f0e8', text: '#2d2a24', paraBg: '#faf8f4', paraBorder: '#d6cdbf', barBg: '#ffffff' },
  green:  { bg: '#e8f5e9', text: '#1b3a1b', paraBg: '#d6edd8', paraBorder: '#a3d1a7', barBg: '#dff0e0' },
};

function loadTheme() {
  const saved = localStorage.getItem('reader-theme');
  const theme = (saved && THEMES[saved]) ? saved : 'brown';
  applyTheme(theme);
}

function applyTheme(theme) {
  if (!THEMES[theme]) theme = 'brown';
  const t = THEMES[theme];
  state.theme = theme;
  readerScreen.dataset.theme = theme;
  readerScreen.style.backgroundColor = t.bg;
  readerScreen.style.color = t.text;

  // Update paragraphs
  document.querySelectorAll('.paragraph').forEach(p => {
    p.style.background = t.paraBg;
    p.style.borderLeftColor = t.paraBorder;
  });

  // Update bars
  const topBar = document.querySelector('.top-bar');
  const bottomBar = document.querySelector('.bottom-bar');
  if (topBar) topBar.style.background = t.barBg;
  if (bottomBar) bottomBar.style.background = t.barBg;

  // Update swatch active state
  const swatches = document.querySelectorAll('#themePicker .theme-swatch');
  swatches.forEach(s => {
    s.classList.toggle('active', s.dataset.theme === theme);
  });
}

function setTheme(theme) {
  applyTheme(theme);
  localStorage.setItem('reader-theme', theme);
}
window.setTheme = setTheme;

function loadSettings() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    const keyStorage = chrome.storage.session || chrome.storage.local;
    keyStorage.get(['openaiApiKey'], (data) => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
        console.error('Failed to load API key:', chrome.runtime.lastError.message);
        return;
      }
      state.apiKey = data.openaiApiKey || '';
    });
    chrome.storage.local.get(['openaiModel', 'translationProvider'], (data) => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
        console.error('Failed to load settings:', chrome.runtime.lastError.message);
        return;
      }
      state.model = data.openaiModel || DEFAULT_MODEL;
      state.translationProvider = data.translationProvider || 'chatgpt';
      state._settingsLoaded = true;
    });
  }
}

function safeParseJSON(str, fallback) {
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(fallback) && !Array.isArray(parsed) ? fallback : parsed;
  } catch (e) {
    return fallback;
  }
}

function loadNotes() {
  const saved = localStorage.getItem('reader-notes');
  if (saved) state.notes = safeParseJSON(saved, []);
}

function saveNotes() {
  localStorage.setItem('reader-notes', JSON.stringify(state.notes));
}

// ===== Bookmark Persistence =====
function getBookmarkKey() {
  return 'reader-bookmark-' + state.fileName;
}

function saveBookmark() {
  const data = {
    page: state.currentPage,
    scrollTop: readerContent.scrollTop,
  };
  localStorage.setItem(getBookmarkKey(), JSON.stringify(data));
  updateBookmarkIcon();
}

function loadBookmark() {
  const raw = localStorage.getItem(getBookmarkKey());
  return raw ? safeParseJSON(raw, null) : null;
}

function removeBookmark() {
  localStorage.removeItem(getBookmarkKey());
  updateBookmarkIcon();
}

function updateBookmarkIcon() {
  const bm = loadBookmark();
  if (bm) {
    bookmarkBtn.innerHTML = '&#9733;';
    bookmarkBtn.classList.add('bookmarked');
    bookmarkBtn.title = `Bookmarked at page ${bm.page + 1} — click to update, long-press to remove`;
  } else {
    bookmarkBtn.innerHTML = '&#9734;';
    bookmarkBtn.classList.remove('bookmarked');
    bookmarkBtn.title = 'Bookmark this position';
  }
}

function restoreBookmark() {
  const bm = loadBookmark();
  if (bm && Number.isInteger(bm.page) && bm.page >= 0 && bm.page < state.totalPages) {
    goToPage(bm.page, false);
    // Restore scroll after render
    const scrollTop = Number.isFinite(bm.scrollTop) ? bm.scrollTop : 0;
    requestAnimationFrame(() => {
      readerContent.scrollTop = scrollTop;
    });
    return true;
  }
  return false;
}

// ===== Event Binding =====
function bindFileUploadEvents() {
  browseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFile(e.dataTransfer.files[0]);
  });
}

function bindNavigationEvents() {
  backBtn.addEventListener('click', () => {
    readerScreen.classList.remove('active');
    uploadScreen.classList.add('active');
    notesToggle.classList.remove('visible');
    historyToggle.classList.remove('visible');
    wordListToggle.classList.remove('visible');
  });
  prevPageBtn.addEventListener('click', () => goToPage(state.currentPage - 1));
  nextPageBtn.addEventListener('click', () => goToPage(state.currentPage + 1));

  document.addEventListener('keydown', (e) => {
    if (!readerScreen.classList.contains('active')) return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      openSearch();
      return;
    }
    if (e.key === 'Escape') {
      if (searchBar.classList.contains('active')) {
        closeSearch();
      } else {
        closeSentencePanel();
        closeWordPopup();
      }
      return;
    }
    if (searchBar.classList.contains('active') && e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) navigateSearch(-1);
      else navigateSearch(1);
      return;
    }
    if (e.key === 'ArrowLeft') goToPage(state.currentPage - 1);
    if (e.key === 'ArrowRight') goToPage(state.currentPage + 1);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      readerContent.scrollTop += 80;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      readerContent.scrollTop -= 80;
    }
  });

  // Two-phase scroll-based page navigation.
  // Phase 1: scrolling hits a boundary → record that boundary was reached.
  // Phase 2: user scrolls again in the same direction at that boundary → navigate.
  // State resets when scrolling away from boundary or changing direction.
  const SCROLL_EDGE_TOLERANCE = 40;
  const WHEEL_NAV_COOLDOWN = 500;
  const GESTURE_GAP = 300;
  let lastWheelNav = 0;
  let boundaryReached = null; // null | 'top' | 'bottom'
  let lastBoundaryWheelAt = 0;  // timestamp of most recent boundary wheel event

  readerContent.addEventListener('wheel', (e) => {
    const now = Date.now();
    if (now - lastWheelNav < WHEEL_NAV_COOLDOWN) return;

    const atBottom = readerContent.scrollTop + readerContent.clientHeight
                     >= readerContent.scrollHeight - SCROLL_EDGE_TOLERANCE;
    const atTop = readerContent.scrollTop <= SCROLL_EDGE_TOLERANCE;

    if (atBottom && e.deltaY > 0) {
      if (boundaryReached === 'bottom' && now - lastBoundaryWheelAt >= GESTURE_GAP) {
        // Phase 2 — gap since last boundary event means this is a new gesture
        goToPage(state.currentPage + 1);
        lastWheelNav = now;
        boundaryReached = null;
      } else {
        // Phase 1, or continued momentum from same gesture
        boundaryReached = 'bottom';
        lastBoundaryWheelAt = now;
      }
    } else if (atTop && e.deltaY < 0) {
      if (boundaryReached === 'top' && now - lastBoundaryWheelAt >= GESTURE_GAP) {
        // Phase 2 — gap since last boundary event means this is a new gesture
        goToPage(state.currentPage - 1);
        lastWheelNav = now;
        boundaryReached = null;
      } else {
        // Phase 1, or continued momentum from same gesture
        boundaryReached = 'top';
        lastBoundaryWheelAt = now;
      }
    } else {
      // Not at a matching boundary — reset
      boundaryReached = null;
    }
  });
}

function emptyStateHtml(message) {
  return `<p class="empty-state-msg">${escapeHtml(message)}</p>`;
}

function copyWithFeedback(btn, text, originalLabel) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '\u2713 Copied';
    setTimeout(() => btn.textContent = originalLabel, 1500);
  }).catch((err) => {
    console.error('Clipboard write failed:', err);
    btn.textContent = '\u2717 Failed';
    setTimeout(() => btn.textContent = originalLabel, 1500);
  });
}

function bindPanelEvents() {
  panelClose.addEventListener('click', closeSentencePanel);
  panelOverlay.addEventListener('click', closeSentencePanel);
  btnTranslate.addEventListener('click', translateSentence);
  btnGrammar.addEventListener('click', analyzeGrammar);
  btnTTS.addEventListener('click', speakSentence);
  btnCopy.addEventListener('click', () => {
    copyWithFeedback(btnCopy, panelSentence.textContent, '\ud83d\udccb Copy');
  });

  wordPopupClose.addEventListener('click', closeWordPopup);
  btnPronounce.addEventListener('click', () => {
    const word = popupWord.textContent;
    if (!word) return;
    if (!state.apiKey) {
      alert('Please set your OpenAI API key first.');
      return;
    }
    window.playTTS(word).catch(err => {
      console.error('Pronounce error:', err);
    });
  });
  toggleChinese.addEventListener('click', () => {
    const cnText = defCnText;
    const isVisible = cnText.style.display !== 'none';
    cnText.style.display = isVisible ? 'none' : 'block';
    toggleChinese.textContent = isVisible ? 'Show Chinese Definition' : 'Hide Chinese Definition';
  });

  selCopy.addEventListener('click', () => {
    const sel = window.getSelection().toString();
    copyWithFeedback(selCopy, sel, '\ud83d\udccb Copy');
    hideSelectionToolbar();
  });
  selNote.addEventListener('click', () => {
    const sel = window.getSelection().toString().trim();
    if (sel) addNote(sel);
    hideSelectionToolbar();
  });

  document.addEventListener('mouseup', (e) => {
    setTimeout(() => {
      const sel = window.getSelection().toString().trim();
      if (sel && sel.length > 0 && readerContent.contains(e.target)) {
        showSelectionToolbar(e.clientX, e.clientY);
      } else if (!selectionToolbar.contains(e.target)) {
        hideSelectionToolbar();
      }
    }, 10);
  });

  document.addEventListener('mousedown', (e) => {
    if (wordPopup.classList.contains('active') && !wordPopup.contains(e.target) && !e.target.classList.contains('word')) {
      closeWordPopup();
    }
  });
}

function bindToolbarEvents() {
  document.querySelectorAll('#themePicker .theme-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => setTheme(swatch.dataset.theme));
  });

  notesToggle.addEventListener('click', () => { notesPanel.classList.toggle('active'); renderNotes(); });
  notesClose.addEventListener('click', () => notesPanel.classList.remove('active'));
  notesExport.addEventListener('click', exportNotes);

  searchToggle.addEventListener('click', () => {
    if (searchBar.classList.contains('active')) closeSearch();
    else openSearch();
  });
  searchClose.addEventListener('click', closeSearch);
  searchInput.addEventListener('input', performSearch);
  searchPrev.addEventListener('click', () => navigateSearch(-1));
  searchNext.addEventListener('click', () => navigateSearch(1));

  let bookmarkLongPress = null;
  bookmarkBtn.addEventListener('mousedown', () => {
    bookmarkLongPress = setTimeout(() => {
      bookmarkLongPress = null;
      removeBookmark();
    }, 600);
  });
  bookmarkBtn.addEventListener('mouseup', () => {
    if (bookmarkLongPress !== null) {
      clearTimeout(bookmarkLongPress);
      bookmarkLongPress = null;
      saveBookmark();
    }
  });
  bookmarkBtn.addEventListener('mouseleave', () => {
    if (bookmarkLongPress !== null) {
      clearTimeout(bookmarkLongPress);
      bookmarkLongPress = null;
    }
  });

  fontDecrease.addEventListener('click', () => changeFontSize(-2));
  fontIncrease.addEventListener('click', () => changeFontSize(2));
  widthDecrease.addEventListener('click', () => changeContentWidth(-100));
  widthIncrease.addEventListener('click', () => changeContentWidth(100));

  gestureModeBtn.addEventListener('click', () => {
    state.gestureMode = state.gestureMode === 'menu' ? 'direct' : 'menu';
    gestureModeBtn.setAttribute('title', 'Gesture: ' + state.gestureMode + ' mode');
    gestureModeBtn.textContent = state.gestureMode === 'direct' ? '\u26A1' : '\u2630';
    gestureModeBtn.classList.toggle('gesture-mode-direct', state.gestureMode === 'direct');
  });
}

function handleReaderHover(e) {
  const wordEl = e.target.closest('.word');
  const sentenceEl = e.target.closest('.sentence');

  clearHover();

  if (wordEl && sentenceEl) {
    wordEl.classList.add('hover-active');
    sentenceEl.classList.add('hover-active');
    state.hoveredWord = wordEl;
    state.hoveredSentence = sentenceEl;
  } else if (sentenceEl) {
    sentenceEl.classList.add('hover-active');
    state.hoveredSentence = sentenceEl;
  }
}

function handleReaderMouseOut(e) {
  const relatedWord = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('.sentence') : null;
  const currentSentence = e.target.closest('.sentence');
  if (!relatedWord || relatedWord !== currentSentence) {
    clearHover();
  }
}

function handleReaderClick(e) {
  if (window.getSelection().toString().trim().length > 0) return;

  // Check for margin bar click (left border zone) on a paragraph
  const paraEl = e.target.closest('.paragraph');
  if (paraEl) {
    const rect = paraEl.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    if (offsetX <= 6) {
      e.stopPropagation();
      openParaPopup(paraEl);
      return;
    }
  }

  const wordEl = e.target.closest('.word');
  if (wordEl) {
    e.stopPropagation();
    const sentenceEl = wordEl.closest('.sentence');
    const sentenceText = sentenceEl ? sentenceEl.dataset.sentence : '';
    const raw = wordEl.textContent;
    const cleanWord = raw.replace(/[^a-zA-Z'\u2019-]/g, '');
    if (cleanWord.length > 0) {
      showWordPopup(cleanWord, sentenceText, e);
    }
    return;
  }
}

function handleReaderContextMenu(e) {
  const sentenceEl = e.target.closest('.sentence');
  if (sentenceEl) {
    e.preventDefault();
    openSentencePanel(sentenceEl);
    if (state.gestureMode === 'direct') {
      window.translateSentence();
    }
  }
}

function handleReaderTouch(e) {
  const touchCount = e.touches.length;

  if (touchCount === 2) {
    const sentenceEl = e.target.closest('.sentence');
    if (!sentenceEl) return;
    e.preventDefault();
    openSentencePanel(sentenceEl);
    if (state.gestureMode === 'direct') {
      window.translateSentence();
    }
  }
}

function bindReaderContentEvents() {
  readerContent.addEventListener('mouseover', handleReaderHover);
  readerContent.addEventListener('mouseout', handleReaderMouseOut);
  readerContent.addEventListener('click', handleReaderClick);
  readerContent.addEventListener('contextmenu', handleReaderContextMenu);
  readerContent.addEventListener('touchstart', handleReaderTouch);
}

function bindEvents() {
  bindFileUploadEvents();
  bindNavigationEvents();
  bindPanelEvents();
  bindToolbarEvents();
  bindReaderContentEvents();
}

function clearHover() {
  if (state.hoveredWord) {
    state.hoveredWord.classList.remove('hover-active');
    state.hoveredWord = null;
  }
  if (state.hoveredSentence) {
    state.hoveredSentence.classList.remove('hover-active');
    state.hoveredSentence = null;
  }
}

// ===== File Handling =====
async function handleFile(file) {
  if (!file) return;
  state.fileName = file.name;
  const ext = file.name.split('.').pop().toLowerCase();

  try {
    let text;
    if (ext === 'pdf') {
      text = await parsePDF(file);
    } else if (ext === 'epub') {
      text = await parseEPUB(file);
    } else if (ext === 'txt') {
      text = await parseTXT(file);
    } else if (ext === 'docx') {
      text = await parseDOCX(file);
    } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      text = await parseImage(file);
    } else if (ext === 'doc') {
      alert('Legacy .doc format is not supported. Please convert to .docx first.');
      return;
    } else {
      alert('Unsupported file format. Please upload a PDF, EPUB, DOCX, TXT, or image file.');
      return;
    }

    const paragraphs = splitIntoParagraphs(text);
    paginateParagraphs(paragraphs);

    if (state.totalPages === 0) {
      alert('No readable content found in this file.');
      return;
    }

    bookTitle.textContent = file.name.replace(/\.[^.]+$/, '');
    uploadScreen.classList.remove('active');
    readerScreen.classList.add('active');
    notesToggle.classList.add('visible');
    historyToggle.classList.add('visible');
    wordListToggle.classList.add('visible');

    updateBookmarkIcon();

    // Try restoring bookmark, else go to page 0
    if (!restoreBookmark()) {
      goToPage(0);
    }

    startAutoHideTimer();
  } catch (err) {
    console.error(err);
    alert('Failed to parse file: ' + err.message);
  }
}

async function extractPDFPageImages(page, pageNum) {
  const images = [];
  const OPS = pdfjsLib.OPS;
  const IMAGE_OPS = new Set([
    OPS.paintImageXObject,          // 85
    OPS.paintImageMaskXObject,      // 83
    OPS.paintInlineImageXObject,    // 86
    OPS.paintImageXObjectRepeat,    // 88
  ]);

  try {
    const ops = await page.getOperatorList();

    // Collect image object names that need resolving
    const imageNames = [];
    for (let k = 0; k < ops.fnArray.length; k++) {
      const op = ops.fnArray[k];
      if (op === OPS.paintImageXObject || op === OPS.paintImageXObjectRepeat) {
        const name = ops.argsArray[k][0];
        if (typeof name === 'string') imageNames.push(name);
      }
    }

    // Wait for all image objects to be resolved by rendering the page
    // This forces PDF.js to decode all images before we access them
    if (imageNames.length > 0) {
      const viewport = page.getViewport({ scale: 1 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(viewport.width, 1);
      canvas.height = Math.min(viewport.height, 1);
      const ctx = canvas.getContext('2d');
      try {
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (e) {
        // Render may fail in some contexts but images should still be resolved
      }
    }

    // Track the current transform matrix (CTM) to compute absolute Y positions.
    // PDF transforms are cumulative: each `transform` op multiplies onto the CTM.
    // save/restore push/pop the CTM stack.
    // CTM is [a, b, c, d, e, f] where (e, f) is the translation.
    let ctm = [1, 0, 0, 1, 0, 0]; // identity
    const ctmStack = [];

    function multiplyMatrix(m1, m2) {
      return [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
      ];
    }

    for (let k = 0; k < ops.fnArray.length; k++) {
      const op = ops.fnArray[k];

      if (op === OPS.save) {
        ctmStack.push(ctm.slice());
      } else if (op === OPS.restore) {
        ctm = ctmStack.pop() || [1, 0, 0, 1, 0, 0];
      } else if (op === OPS.transform && ops.argsArray[k]) {
        const args = ops.argsArray[k];
        ctm = multiplyMatrix(ctm, [args[0], args[1], args[2], args[3], args[4], args[5]]);
      }

      if (!IMAGE_OPS.has(op)) continue;
      // In PDF image transforms, ctm[5] is the bottom-left Y and ctm[3] is
      // the image height in page units. Use the vertical midpoint for sorting
      // so images interleave correctly with text baselines.
      const currentY = ctm[5] + ctm[3] / 2;

      try {
        let imgData;
        if (op === OPS.paintInlineImageXObject) {
          // Inline images have data directly in args
          imgData = ops.argsArray[k][0];
        } else {
          // Named images — get from page objects
          const imgName = ops.argsArray[k][0];
          if (typeof imgName !== 'string') continue;

          imgData = page.objs.has(imgName) ? page.objs.get(imgName) : null;
          // Also try common objects (shared across pages)
          if (!imgData && page.commonObjs && page.commonObjs.has(imgName)) {
            imgData = page.commonObjs.get(imgName);
          }
        }

        if (!imgData) continue;

        const w = imgData.width;
        const h = imgData.height;
        if (!w || !h || w <= 50 || h <= 50) continue;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        if (imgData.bitmap) {
          // PDF.js 3.x may return ImageBitmap
          ctx.drawImage(imgData.bitmap, 0, 0);
        } else if (imgData.data) {
          const imageData = ctx.createImageData(w, h);
          const pixelCount = w * h;
          if (imgData.data.length === pixelCount * 4) {
            imageData.data.set(imgData.data);
          } else if (imgData.data.length === pixelCount * 3) {
            for (let p = 0, q = 0; p < imgData.data.length; p += 3, q += 4) {
              imageData.data[q] = imgData.data[p];
              imageData.data[q + 1] = imgData.data[p + 1];
              imageData.data[q + 2] = imgData.data[p + 2];
              imageData.data[q + 3] = 255;
            }
          } else if (imgData.data.length === pixelCount) {
            // Grayscale
            for (let p = 0, q = 0; p < imgData.data.length; p++, q += 4) {
              imageData.data[q] = imgData.data[p];
              imageData.data[q + 1] = imgData.data[p];
              imageData.data[q + 2] = imgData.data[p];
              imageData.data[q + 3] = 255;
            }
          } else {
            continue;
          }
          ctx.putImageData(imageData, 0, 0);
        } else {
          continue;
        }

        const dataUrl = canvas.toDataURL('image/png');
        images.push({ type: 'image', src: dataUrl, alt: `Page ${pageNum} image`, y: Math.round(currentY) });
      } catch (imgErr) {
        console.warn(`PDF image extraction failed (page ${pageNum}):`, imgErr.message);
      }
    }
  } catch (opsErr) {
    console.warn(`PDF operator list extraction failed (page ${pageNum}):`, opsErr.message);
  }
  return images;
}

function buildStructuredLines(contentItems) {
  const structuredLines = [];
  let currentLine = [];
  let lastY = null;
  for (const item of contentItems) {
    if (!item.transform || item.str == null) continue;
    const y = Math.round(item.transform[5]);
    if (lastY !== null && Math.abs(y - lastY) > 2) {
      if (currentLine.length) {
        const firstX = currentLine[0].transform[4];
        structuredLines.push({
          text: currentLine.map(it => it.str).join(''),
          x: Math.round(firstX),
          y: lastY,
        });
      }
      currentLine = [];
    }
    currentLine.push(item);
    lastY = y;
  }
  if (currentLine.length) {
    const firstX = currentLine[0].transform[4];
    structuredLines.push({
      text: currentLine.map(it => it.str).join(''),
      x: Math.round(firstX),
      y: lastY,
    });
  }
  return structuredLines;
}

function mergeLinesToParagraphs(structuredLines) {
  const xCounts = {};
  for (const ln of structuredLines) {
    if (!ln.text.trim()) continue;
    const rx = Math.round(ln.x / 3) * 3;
    xCounts[rx] = (xCounts[rx] || 0) + 1;
  }
  const baselineX = Number(Object.entries(xCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 0);

  const gaps = [];
  for (let j = 1; j < structuredLines.length; j++) {
    const gap = Math.abs(structuredLines[j - 1].y - structuredLines[j].y);
    if (gap > 0) gaps.push(gap);
  }
  gaps.sort((a, b) => a - b);
  const typicalGap = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : 14;

  const textParas = [];
  let para = '';
  let paraY = 0;
  for (let j = 0; j < structuredLines.length; j++) {
    const ln = structuredLines[j];
    const trimmed = ln.text.trim();

    if (!trimmed) {
      if (para.trim()) { textParas.push({ text: para.trim(), y: paraY }); }
      para = '';
      continue;
    }

    const isIndented = ln.x > baselineX + 6;
    const hasLargeGap = j > 0 && Math.abs(structuredLines[j - 1].y - ln.y) > typicalGap * 1.4;

    if (para && (isIndented || hasLargeGap)) {
      textParas.push({ text: para.trim(), y: paraY });
      para = '';
    }

    if (!para) paraY = ln.y;
    para += (para && !para.endsWith('-') ? ' ' : '') + trimmed;
  }
  if (para.trim()) { textParas.push({ text: para.trim(), y: paraY }); }
  return textParas;
}

async function parsePDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const contentItems = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    const pageImages = await extractPDFPageImages(page, i);

    const structuredLines = buildStructuredLines(content.items);
    if (structuredLines.length === 0 && pageImages.length === 0) continue;

    const textParas = mergeLinesToParagraphs(structuredLines);

    const allItems = [
      ...textParas.map(p => ({ content: p.text, y: p.y })),
      ...pageImages.map(img => ({ content: img, y: img.y })),
    ];
    allItems.sort((a, b) => b.y - a.y);
    for (const item of allItems) {
      contentItems.push(item.content);
    }
  }

  const filtered = contentItems.filter(item =>
    typeof item === 'object' ? true : item.length > 0
  );

  return filtered;
}

async function resolveEPUBImageSrcs(items) {
  for (const item of items) {
    if (typeof item === 'object' && item.type === 'image' && item.src && typeof item.src.then === 'function') {
      try {
        item.src = await item.src;
      } catch (e) {
        item.src = null;
      }
    }
  }
  return items.filter(item => typeof item === 'string' || (item && item.src));
}

async function extractEPUBSectionItems(section, book, archive) {
  const items = [];
  const doc = await section.load(book.load.bind(book));
  if (!doc) return items;
  const body = (doc.querySelector && doc.querySelector('body')) || doc;

  const hasImages = body.querySelectorAll('img').length > 0;
  if (hasImages) {
    const sectionHref = section.href || '';
    const extracted = extractContentItems(body, (src) => {
      try {
        const basePath = sectionHref.replace(/[^/]*$/, '');
        const fullPath = normalizeImagePath(basePath ? basePath + src : src);
        if (archive && archive.createUrl) {
          // archive.createUrl() returns a Promise; getBlob() expects a leading '/'
          // and strips it before zip lookup. Try the resolved path and a common
          // 'OEBPS/' prefixed variant to handle different EPUB structures.
          const primary = '/' + fullPath;
          const withOEBPS = '/OEBPS/' + fullPath;
          return archive.createUrl(primary).catch(() => archive.createUrl(withOEBPS));
        }
        return src;
      } catch (e) {
        return src;
      }
    });
    // Resolve any Promise-based image srcs from archive.createUrl()
    const resolved = await resolveEPUBImageSrcs(extracted);
    for (const item of resolved) items.push(item);
  } else {
    const blocks = body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
    if (blocks.length > 0) {
      for (const block of blocks) {
        const parts = extractPartsWithBr(block);
        for (const part of parts) {
          const text = part.trim();
          if (text) items.push(text);
        }
      }
    } else {
      const raw = body.innerHTML || '';
      if (raw.includes('<br')) {
        const chunks = splitHtmlOnBr(body);
        for (const chunk of chunks) {
          const text = chunk.trim();
          if (text) items.push(text);
        }
      } else {
        const text = body.textContent.trim();
        if (text) {
          const paras = text.split(/\n[ \t]+/);
          for (const p of paras) {
            const cleaned = p.replace(/\s+/g, ' ').trim();
            if (cleaned) items.push(cleaned);
          }
        }
      }
    }
  }
  return items;
}

async function parseEPUB(file) {
  const arrayBuffer = await file.arrayBuffer();
  const book = ePub(arrayBuffer);
  await book.ready;

  const spine = book.spine;
  const contentItems = []; // mixed: strings and { type: 'image', src, alt }

  if (!spine || !spine.spineItems) {
    throw new Error('Could not read EPUB spine.');
  }

  // Pre-load resources archive for image resolution
  const archive = book.archive;

  for (const section of spine.spineItems) {
    if (!section.href && !section.url && !section.canonical) continue;
    try {
      const items = await extractEPUBSectionItems(section, book, archive);
      for (const item of items) contentItems.push(item);
    } catch (e) {
      console.warn('Skipping EPUB section:', section.href || section.index, e);
    } finally {
      try { section.unload(); } catch (_) {}
    }
  }

  if (contentItems.length === 0) {
    throw new Error('No readable text found in EPUB.');
  }

  return contentItems;
}

async function parseTXT(file) {
  return await file.text();
}

window.parseTXT = parseTXT;

async function parseDOCX(file) {
  const arrayBuffer = await file.arrayBuffer();
  const _JSZip = (typeof JSZip !== 'undefined') ? JSZip : window.JSZip;
  const zip = await _JSZip.loadAsync(arrayBuffer);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    throw new Error('Invalid DOCX file: missing word/document.xml');
  }
  const xmlStr = await docXmlFile.async('string');
  const _DOMParser = (typeof DOMParser !== 'undefined') ? DOMParser : window.DOMParser;
  const parser = new _DOMParser();
  const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const paragraphs = xmlDoc.getElementsByTagNameNS(ns, 'p');
  const texts = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const runs = paragraphs[i].getElementsByTagNameNS(ns, 't');
    let paraText = '';
    for (let j = 0; j < runs.length; j++) {
      paraText += runs[j].textContent;
    }
    if (paraText.trim()) {
      texts.push(paraText.trim());
    }
  }
  return texts.join('\n\n');
}

window.parseDOCX = parseDOCX;

async function parseImage(file) {
  // Use stub for testing
  if (window._stubOCR) {
    return await window._stubOCR(file);
  }

  // Convert image file to base64 data URL
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  const mimeType = file.type || 'image/png';
  const dataUrl = `data:${mimeType};base64,${base64}`;

  await ensureSettings();
  if (!state.apiKey) {
    throw new Error('Please set your OpenAI API key in the extension popup first.');
  }

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.apiKey}`
    },
    body: JSON.stringify({
      model: state.model,
      messages: [
        {
          role: 'system',
          content: 'You are an OCR assistant. Extract all readable text from the image. Preserve paragraph structure using blank lines between paragraphs. Output only the extracted text, no commentary.'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all text from this image:' },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ],
      temperature: 0.1,
    })
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.error?.message || `API error: ${resp.status}`);
  }

  const data = await resp.json();
  return data.choices[0].message.content.trim();
}

window.parseImage = parseImage;

// ===== EPUB Helpers =====
function extractPartsWithBr(element) {
  // Split a block element's content on <br> tags into separate paragraphs
  const brs = element.querySelectorAll('br');
  if (brs.length === 0) {
    return [element.textContent];
  }
  // Clone and split on BRs
  const parts = [];
  const clone = element.cloneNode(true);
  const html = clone.innerHTML;
  const segments = html.split(/<br\s*\/?>/gi);
  const temp = document.createElement('div');
  for (const seg of segments) {
    temp.innerHTML = seg;
    const text = temp.textContent.trim();
    if (text) parts.push(text);
  }
  return parts.length > 0 ? parts : [element.textContent];
}

function splitHtmlOnBr(container) {
  // For containers with no block elements, split on <br> and detect indentation
  const html = container.innerHTML || '';
  const segments = html.split(/<br\s*\/?>/gi);
  const temp = document.createElement('div');
  const results = [];
  let current = '';

  for (const seg of segments) {
    temp.innerHTML = seg;
    const raw = temp.textContent;
    const text = raw.trim();
    if (!text) {
      // Empty line — flush
      if (current.trim()) results.push(current.trim());
      current = '';
      continue;
    }
    // Detect indentation: raw text starts with spaces/tabs
    const isIndented = /^[\s\t]{2,}/.test(raw) && raw.trimStart() !== raw;
    if (current && isIndented) {
      results.push(current.trim());
      current = '';
    }
    current += (current ? ' ' : '') + text;
  }
  if (current.trim()) results.push(current.trim());
  return results;
}

// ===== Path Utilities =====
function normalizeImagePath(filepath) {
  // Reject dangerous URL schemes — only allow data: and blob: for EPUB assets
  if (/^[a-z][a-z0-9+.-]*:/i.test(filepath)) {
    if (/^(data|blob):/i.test(filepath)) return filepath;
    // Block http:, https:, javascript:, and other remote/dangerous schemes
    return '';
  }
  if (filepath.startsWith('/')) {
    // Absolute path — normalize but preserve leading /
    const parts = filepath.split('/');
    const result = [''];
    for (let i = 1; i < parts.length; i++) {
      if (parts[i] === '..') result.pop();
      else if (parts[i] !== '.' && parts[i] !== '') result.push(parts[i]);
    }
    return result.join('/');
  }
  const parts = filepath.split('/');
  const result = [];
  for (const part of parts) {
    if (part === '..') {
      result.pop();
    } else if (part !== '.' && part !== '') {
      result.push(part);
    }
  }
  return result.join('/');
}

window.normalizeImagePath = normalizeImagePath;

// ===== Content Extraction (text + images) =====
function pushResolvedImage(items, imgEl, resolveImageSrc) {
  const src = imgEl.getAttribute('src');
  if (src) {
    const resolved = resolveImageSrc(src);
    if (resolved) {
      items.push({ type: 'image', src: resolved, alt: imgEl.getAttribute('alt') || '' });
    }
  }
}

function extractFigureItems(items, figureEl, resolveImageSrc) {
  for (const child of figureEl.childNodes) {
    if (child.nodeType === 1 && child.tagName === 'IMG') {
      pushResolvedImage(items, child, resolveImageSrc);
    } else if (child.nodeType === 1 || child.nodeType === 3) {
      const text = (child.textContent || '').trim();
      if (text) items.push(text);
    }
  }
}

function extractBlockItems(items, blockEl, resolveImageSrc) {
  for (const child of blockEl.childNodes) {
    if (child.nodeType === 1 && child.tagName === 'IMG') {
      pushResolvedImage(items, child, resolveImageSrc);
    } else if (child.nodeType === 3) {
      const text = child.textContent.trim();
      if (text) items.push(text);
    } else if (child.nodeType === 1) {
      const innerImgs = child.querySelectorAll('img');
      if (innerImgs.length > 0) {
        const text = child.textContent.trim();
        if (text) items.push(text);
        for (const img of innerImgs) {
          pushResolvedImage(items, img, resolveImageSrc);
        }
      } else {
        const text = child.textContent.trim();
        if (text) items.push(text);
      }
    }
  }
}

function extractContentItems(body, resolveImageSrc) {
  const items = [];
  const blockTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE']);

  function processNode(node) {
    if (node.nodeType !== 1) return;
    const tag = node.tagName;

    if (tag === 'IMG') {
      pushResolvedImage(items, node, resolveImageSrc);
    } else if (tag === 'FIGURE') {
      extractFigureItems(items, node, resolveImageSrc);
    } else if (blockTags.has(tag)) {
      const imgs = node.querySelectorAll('img');
      if (imgs.length > 0) {
        extractBlockItems(items, node, resolveImageSrc);
      } else {
        const text = node.textContent.trim();
        if (text) items.push(text);
      }
    } else {
      for (const child of node.childNodes) {
        processNode(child);
      }
    }
  }

  for (const child of body.childNodes) {
    processNode(child);
  }

  return items;
}

window.extractContentItems = extractContentItems;

// ===== Text Processing =====
function splitIntoSentences(text) {
  // Match sentence-ending punctuation, optionally followed by closing quotes/brackets
  const raw = text.match(/[^.!?。！？]*[.!?。！？]+["\u201d\u2019\u300b\u300d\u3009\u3011\uff09)'\]]*[\s]?|[^.!?。！？]+$/g) || [text];
  return raw.map(s => s.trim()).filter(s => s.length > 0);
}

function splitIntoParagraphs(input) {
  // Accept a plain string (backward compat) or an array of mixed items
  if (typeof input === 'string') {
    return input.split(/\n\s*\n/)
      .map(p => p.replace(/\s+/g, ' ').trim())
      .filter(p => p.length > 0)
      .map(p => ({
        type: 'text',
        text: p,
        sentences: splitIntoSentences(p)
      }));
  }
  // Array of strings and image objects
  const result = [];
  for (const item of input) {
    if (typeof item === 'object' && item.type === 'image') {
      result.push(item);
    } else if (typeof item === 'string') {
      const trimmed = item.replace(/\s+/g, ' ').trim();
      if (trimmed.length > 0) {
        result.push({ type: 'text', text: trimmed, sentences: splitIntoSentences(trimmed) });
      }
    }
  }
  return result;
}

window.splitIntoParagraphs = splitIntoParagraphs;
window.handleFile = handleFile;

function paginateParagraphs(paragraphs) {
  state.pages = [];
  let currentPage = [];
  let sentenceCount = 0;

  for (const para of paragraphs) {
    if (para.type === 'image') {
      currentPage.push(para);
      sentenceCount += 1;
      if (sentenceCount >= SENTENCES_PER_PAGE) {
        state.pages.push(currentPage);
        currentPage = [];
        sentenceCount = 0;
      }
      continue;
    }

    // Split large text paragraphs across pages
    const remaining = SENTENCES_PER_PAGE - sentenceCount;
    if (para.sentences.length <= remaining) {
      // Fits on current page
      currentPage.push(para);
      sentenceCount += para.sentences.length;
      if (sentenceCount >= SENTENCES_PER_PAGE) {
        state.pages.push(currentPage);
        currentPage = [];
        sentenceCount = 0;
      }
    } else {
      // Split the paragraph across pages
      let offset = 0;
      while (offset < para.sentences.length) {
        const space = SENTENCES_PER_PAGE - sentenceCount;
        const chunk = para.sentences.slice(offset, offset + space);
        currentPage.push({
          type: 'text',
          text: chunk.join(' '),
          sentences: chunk,
        });
        sentenceCount += chunk.length;
        offset += chunk.length;
        if (sentenceCount >= SENTENCES_PER_PAGE) {
          state.pages.push(currentPage);
          currentPage = [];
          sentenceCount = 0;
        }
      }
    }
  }
  if (currentPage.length > 0) state.pages.push(currentPage);
  state.totalPages = state.pages.length;
}

window.paginateParagraphs = paginateParagraphs;

// ===== Rendering =====
function goToPage(pageIndex, resetScroll = true) {
  if (pageIndex < 0 || pageIndex >= state.totalPages) return;
  state.currentPage = pageIndex;
  renderPage();
  updateNav();
  if (resetScroll) readerContent.scrollTop = 0;
}

window.goToPage = goToPage;

function renderPage() {
  const page = state.pages[state.currentPage];
  readerContent.innerHTML = '';

  for (const para of page) {
    const pEl = document.createElement('div');
    pEl.className = 'paragraph';

    if (para.type === 'image') {
      pEl.classList.add('image-paragraph');
      const img = document.createElement('img');
      img.src = para.src;
      img.alt = para.alt || '';
      img.style.maxWidth = '100%';
      img.style.display = 'block';
      img.style.margin = '0 auto';
      img.style.height = 'auto';
      pEl.appendChild(img);
      readerContent.appendChild(pEl);
      continue;
    }

    for (let i = 0; i < para.sentences.length; i++) {
      const sEl = document.createElement('span');
      sEl.className = 'sentence';
      sEl.dataset.sentence = para.sentences[i];

      // Wrap each word
      const words = para.sentences[i].split(/(\s+)/);
      for (const w of words) {
        if (/^\s+$/.test(w)) {
          sEl.appendChild(document.createTextNode(w));
        } else {
          const wordEl = document.createElement('span');
          wordEl.className = 'word';
          wordEl.textContent = w;
          sEl.appendChild(wordEl);
        }
      }

      pEl.appendChild(sEl);

      if (i < para.sentences.length - 1) {
        pEl.appendChild(document.createTextNode(' '));
      }
    }

    readerContent.appendChild(pEl);
  }

  // Re-apply theme to new paragraphs
  if (state.theme && THEMES[state.theme]) {
    const t = THEMES[state.theme];
    document.querySelectorAll('.paragraph').forEach(p => {
      p.style.background = t.paraBg;
      p.style.borderLeftColor = t.paraBorder;
    });
  }

  // Re-apply search highlights if search is active
  if (searchBar.classList.contains('active') && searchInput.value.trim()) {
    highlightSearchOnPage();
  }
}

function updateNav() {
  pageInfo.textContent = `Page ${state.currentPage + 1}`;
  pageIndicator.textContent = `${state.currentPage + 1} / ${state.totalPages}`;
  prevPageBtn.disabled = state.currentPage === 0;
  nextPageBtn.disabled = state.currentPage >= state.totalPages - 1;
}

// ===== Page Selection =====
pageIndicator.addEventListener('click', () => {
  // Don't create duplicate input
  if (document.getElementById('pageSelectInput')) return;

  pageIndicator.style.display = 'none';

  const input = document.createElement('input');
  input.id = 'pageSelectInput';
  input.type = 'number';
  input.className = 'page-select-input';
  input.min = 1;
  input.max = state.totalPages;
  input.value = state.currentPage + 1;

  function closeInput() {
    if (input.parentNode) input.parentNode.removeChild(input);
    pageIndicator.style.display = '';
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const num = parseInt(input.value, 10);
      if (!isNaN(num) && num >= 1 && num <= state.totalPages) {
        goToPage(num - 1);
      }
      closeInput();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeInput();
    }
  });

  input.addEventListener('blur', () => {
    closeInput();
  });

  pageIndicator.parentNode.insertBefore(input, pageIndicator.nextSibling);
  input.focus();
  input.select();
});

// ===== Sentence Panel =====
function openSentencePanel(sentenceEl) {
  if (window.getSelection().toString().trim().length > 0) return;

  if (state.activeSentenceEl) state.activeSentenceEl.classList.remove('active');
  sentenceEl.classList.add('active');
  state.activeSentenceEl = sentenceEl;

  const text = sentenceEl.dataset.sentence;
  panelSentence.textContent = text;
  panelTranslation.style.display = 'none';
  translationText.textContent = '';
  panelGrammar.style.display = 'none';
  grammarText.textContent = '';
  btnCopy.textContent = '\ud83d\udccb Copy';

  panelOverlay.classList.add('active');
  sentencePanel.classList.add('active');
}

function closeSentencePanel() {
  panelOverlay.classList.remove('active');
  sentencePanel.classList.remove('active');
  if (state.activeSentenceEl) {
    state.activeSentenceEl.classList.remove('active');
    state.activeSentenceEl = null;
  }
}

// ===== Paragraph Translation Popup =====
let _paraPopupToken = 0;

function translateParaPopup() {
  const text = paraPopupText.textContent;
  paraPopupTranslation.style.display = '';
  paraPopupTranslation.textContent = 'Translating...';

  const token = ++_paraPopupToken;

  const stubTranslate = window._stubTranslateText || window._stubCallOpenAI;
  const promise = stubTranslate
    ? stubTranslate(text)
    : translateText(text, 'en', 'zh');
  if (promise && promise.then) {
    promise.then((result) => {
      if (token !== _paraPopupToken) return;
      if (result) {
        paraPopupTranslation.textContent = result;
      } else {
        paraPopupTranslation.textContent = 'Translation unavailable.';
      }
    }).catch((err) => {
      if (token !== _paraPopupToken) return;
      paraPopupTranslation.textContent = 'Translation failed: ' + err.message;
    });
  } else {
    paraPopupTranslation.textContent = 'Translation unavailable.';
  }
}

function openParaPopup(paraEl) {
  const text = paraEl.textContent.trim();
  paraPopupText.textContent = text;
  paraPopupOverlay.classList.add('active');
  paraPopup.classList.add('active');

  if (state.gestureMode === 'direct') {
    paraPopupTranslation.style.display = '';
    translateParaPopup();
  } else {
    paraPopupTranslation.style.display = 'none';
    paraPopupTranslation.textContent = '';
  }
}

function closeParaPopup() {
  paraPopupOverlay.classList.remove('active');
  paraPopup.classList.remove('active');
}

paraPopupClose.addEventListener('click', closeParaPopup);
paraPopupOverlay.addEventListener('click', closeParaPopup);
paraTranslateBtn.addEventListener('click', translateParaPopup);
paraTTSBtn.addEventListener('click', async () => {
  const text = paraPopupText.textContent;
  paraTTSBtn.textContent = '\u23F3 Loading...';
  paraTTSBtn.disabled = true;
  try {
    await ensureSettings();
    if (state.apiKey) await playTTS(text);
  } catch (err) { console.error('TTS error:', err); }
  paraTTSBtn.textContent = '\uD83D\uDD0A Listen';
  paraTTSBtn.disabled = false;
});
paraCopyBtn.addEventListener('click', () => {
  copyWithFeedback(paraCopyBtn, paraPopupText.textContent, '\uD83D\uDCCB Copy');
});

// ===== API Calls =====
async function ensureSettings() {
  if (!state._settingsLoaded) {
    await new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const keyStorage = chrome.storage.session || chrome.storage.local;
        let done = 0;
        const check = () => { if (++done === 2) { state._settingsLoaded = true; resolve(); } };
        chrome.storage.local.get(['openaiModel', 'translationProvider'], (data) => {
          if (!(chrome.runtime && chrome.runtime.lastError)) {
            state.model = data.openaiModel || DEFAULT_MODEL;
            state.translationProvider = data.translationProvider || 'chatgpt';
          }
          check();
        });
        keyStorage.get(['openaiApiKey'], (data) => {
          if (!(chrome.runtime && chrome.runtime.lastError)) {
            state.apiKey = data.openaiApiKey || '';
          }
          check();
        });
      } else {
        state._settingsLoaded = true;
        resolve();
      }
    });
  }
  return state.translationProvider !== 'chatgpt' || !!state.apiKey;
}

// ===== Google Translate Provider =====
async function googleTranslate(text, from, to) {
  const params = new URLSearchParams({
    client: 'gtx', sl: from, tl: to, dt: 't', q: text
  });
  const resp = await window.fetch(GOOGLE_TRANSLATE_URL + '?' + params.toString());
  if (!resp.ok) throw new Error('Google Translate error: ' + resp.status);
  const data = await resp.json();
  // Response format: [[["translated text","source text",...],...],...]
  if (data && data[0]) {
    return data[0].map(seg => seg[0]).join('');
  }
  throw new Error('Unexpected Google Translate response');
}

async function googleLookupWord(word) {
  // Use dt=t (translation), dt=bd (dictionary), dt=md (definitions), dt=rm (transliteration)
  const params = new URLSearchParams({
    client: 'gtx', sl: 'en', tl: 'zh-CN', hl: 'en',
    dt: 't', q: word
  });
  // Add multiple dt params
  ['bd', 'md', 'rm'].forEach(v => params.append('dt', v));
  const resp = await window.fetch(GOOGLE_TRANSLATE_URL + '?' + params.toString());
  if (!resp.ok) throw new Error('Google Translate error: ' + resp.status);
  const data = await resp.json();

  let pos = '', enDef = '', cnDef = '', pron = '';

  // data[0] = translations: [["Chinese","English",...],...]
  if (data[0] && data[0][0]) {
    cnDef = data[0][0][0] || '';
  }

  // data[1] = dictionary entries: [["noun",["trans1","trans2",...],[[word,["back1","back2"]]],pos_label],...]
  if (data[1] && data[1].length > 0) {
    const entry = data[1][0];
    pos = entry[0] || ''; // e.g. "noun", "verb", "adjective"
    if (entry[2] && entry[2].length > 0) {
      // entry[2] = [[word, [back-translations], null, score], ...]
      // Use back-translations as definitions
      const defs = entry[2].slice(0, 3).map(e => e[0]);
      enDef = defs.join('; ');
    }
    // Combine translations from all POS entries for richer CN definition
    const allCn = data[1].map(e => e[1] ? e[1].slice(0, 2).join(', ') : '').filter(Boolean);
    if (allCn.length > 0) cnDef = allCn.join('; ');
  }

  // data[12] = definitions: [["noun",[["definition text",null,["example"],null,null],...],word],...]
  if (data[12] && data[12].length > 0) {
    const defEntry = data[12][0];
    if (!pos && defEntry[0]) pos = defEntry[0];
    if (defEntry[1] && defEntry[1].length > 0) {
      enDef = defEntry[1][0][0] || enDef;
    }
  }

  // data[0][1] = transliteration/pronunciation info at end of first segment
  // data[0][0][3] = source transliteration sometimes
  if (data[0] && data[0].length > 1 && data[0][data[0].length - 1]) {
    const lastSeg = data[0][data[0].length - 1];
    if (typeof lastSeg === 'string') pron = lastSeg;
  }

  // Supplement with IPA from offline dictionary if no pronunciation found
  if (!pron) {
    pron = await getOfflinePronunciation(word);
  }

  // Abbreviate POS
  const posAbbrev = { noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.',
    pronoun: 'pron.', preposition: 'prep.', conjunction: 'conj.', interjection: 'interj.',
    exclamation: 'interj.', determiner: 'det.' };
  const posShort = posAbbrev[pos] || (pos ? pos + '.' : '');

  const enLine = posShort ? `(${posShort}) ${enDef || word}` : (enDef || word);
  return `EN: ${enLine}\nCN: ${cnDef || word}\n${pron ? 'PRON: ' + pron : ''}`.trim();
}

// ===== Microsoft Translate Provider =====
async function msGetAuthToken() {
  if (state.msAuthToken && Date.now() < state.msAuthExpiry) {
    return state.msAuthToken;
  }
  const resp = await window.fetch(MS_AUTH_URL);
  if (!resp.ok) throw new Error('Microsoft auth error: ' + resp.status);
  const token = await resp.text();
  state.msAuthToken = token;
  state.msAuthExpiry = Date.now() + 8 * 60 * 1000; // refresh every 8 min (token valid ~10 min)
  return token;
}

async function microsoftTranslate(text, from, to) {
  const token = await msGetAuthToken();
  const params = new URLSearchParams({ 'api-version': '3.0', from, to });
  const resp = await window.fetch(MS_TRANSLATE_URL + '?' + params.toString(), {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([{ Text: text }])
  });
  if (!resp.ok) throw new Error('Microsoft Translate error: ' + resp.status);
  const data = await resp.json();
  if (data && data[0] && data[0].translations && data[0].translations[0]) {
    return data[0].translations[0].text;
  }
  throw new Error('Unexpected Microsoft Translate response');
}

async function microsoftLookupWord(word) {
  const token = await msGetAuthToken();
  // Dictionary lookup for structured word info
  const dictParams = new URLSearchParams({ 'api-version': '3.0', from: 'en', to: 'zh-Hans' });
  const dictResp = await window.fetch(MS_DICT_URL + '?' + dictParams.toString(), {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([{ Text: word }])
  });

  let pos = '', enDef = '', cnDef = '';

  if (dictResp.ok) {
    const dictData = await dictResp.json();
    if (dictData[0] && dictData[0].translations && dictData[0].translations.length > 0) {
      const translations = dictData[0].translations;
      // First translation entry has POS and target translation
      pos = translations[0].posTag || '';
      // Collect Chinese translations
      cnDef = translations.slice(0, 4).map(t => t.displayTarget).join(', ');
      // Use back-translations as English definitions
      if (translations[0].backTranslations && translations[0].backTranslations.length > 0) {
        enDef = translations[0].backTranslations.slice(0, 3).map(b => b.displayText).join(', ');
      }
    }
  }

  // Also get plain translation as fallback
  if (!cnDef) {
    cnDef = await microsoftTranslate(word, 'en', 'zh-Hans');
  }

  const posAbbrev = { NOUN: 'n.', VERB: 'v.', ADJ: 'adj.', ADV: 'adv.',
    PRON: 'pron.', PREP: 'prep.', CONJ: 'conj.', DET: 'det.', OTHER: '' };
  const posShort = posAbbrev[pos] || (pos ? pos.toLowerCase() + '.' : '');

  // Supplement with IPA from offline dictionary
  const pron = await getOfflinePronunciation(word);

  const enLine = posShort ? `(${posShort}) ${enDef || word}` : (enDef || word);
  return `EN: ${enLine}\nCN: ${cnDef || word}\n${pron ? 'PRON: ' + pron : ''}`.trim();
}

// ===== Offline Dictionary =====
async function getOfflinePronunciation(word) {
  try {
    const dict = await loadOfflineDict();
    const dictMap = getOfflineDictMap(dict);
    const entry = dictMap.get(word.toLowerCase());
    return (entry && entry.pron) ? entry.pron : '';
  } catch (e) {
    return '';
  }
}

window.getOfflinePronunciation = getOfflinePronunciation;

let _offlineDictMap = null;

async function loadOfflineDict() {
  if (state.offlineDict) return state.offlineDict;
  // Allow test injection
  if (window._offlineDict) {
    state.offlineDict = window._offlineDict;
    _offlineDictMap = null; // rebuild map on next lookup
    return state.offlineDict;
  }
  try {
    const url = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
      ? chrome.runtime.getURL('dict-en.json')
      : 'dict-en.json';
    const resp = await window.fetch(url);
    state.offlineDict = await resp.json();
  } catch (e) {
    state.offlineDict = [];
  }
  _offlineDictMap = null; // rebuild map on next lookup
  return state.offlineDict;
}

function getOfflineDictMap(dict) {
  if (!_offlineDictMap) {
    _offlineDictMap = new Map();
    for (const e of dict) {
      _offlineDictMap.set(e.word.toLowerCase(), e);
    }
  }
  return _offlineDictMap;
}

async function offlineLookupWord(word) {
  const dict = await loadOfflineDict();
  const lower = word.toLowerCase();

  // Search bundled dictionary first (O(1) via Map)
  const dictMap = getOfflineDictMap(dict);
  const entry = dictMap.get(lower);
  if (entry) {
    return `EN: (${entry.pos}) ${entry.def}\nCN: ${entry.cn}\nPRON: ${entry.pron}`;
  }

  // Fall back to cached word list in localStorage
  try {
    const cached = JSON.parse(localStorage.getItem('reader-wordlist') || '[]');
    const cachedEntry = cached.find(e => e.word.toLowerCase() === lower);
    if (cachedEntry) {
      return `EN: ${cachedEntry.englishDef}\nCN: ${cachedEntry.chineseDef}\nPRON: ${cachedEntry.pronunciation}`;
    }
  } catch (e) {
    console.warn('Malformed cached word list, ignoring:', e.message);
  }

  return null;
}

window.offlineLookupWord = offlineLookupWord;

function buildDictPrompt(word, sentenceContext) {
  return [
    {
      role: 'system',
      content: `You are a dictionary assistant. Given an English word and the sentence it appears in, provide:
1. The word's part of speech and English definition as used in this context (1-2 concise lines).
2. The Chinese definition (1 line).
3. The IPA pronunciation (1 line).

Format your response exactly as:
EN: [part of speech] [English definition]
CN: [Chinese definition]
PRON: [IPA pronunciation]`
    },
    { role: 'user', content: `Word: "${word}"\nSentence: "${sentenceContext}"` }
  ];
}

// ===== Translation Dispatch =====
async function translateText(text, from, to) {
  await ensureSettings();
  const provider = state.translationProvider;

  if (provider === 'offline') {
    return '[offline mode] Sentence/paragraph translation is not available offline.';
  }
  if (provider === 'google') {
    return await googleTranslate(text, from === 'en' ? 'en' : 'auto', to === 'zh' ? 'zh-CN' : to);
  }
  if (provider === 'microsoft') {
    return await microsoftTranslate(text, from, to === 'zh' ? 'zh-Hans' : to);
  }
  // chatgpt
  return await callOpenAI([
    { role: 'system', content: 'You are a translator. Translate the following English text to Chinese. Only output the translation, nothing else.' },
    { role: 'user', content: text }
  ]);
}

async function lookupWordByProvider(word, sentenceContext) {
  await ensureSettings();
  const provider = state.translationProvider;

  if (provider === 'offline') {
    return await offlineLookupWord(word);
  }

  // Online providers — fall back to offline dictionary on network failure
  try {
    if (provider === 'google') {
      return await googleLookupWord(word);
    }
    if (provider === 'microsoft') {
      return await microsoftLookupWord(word);
    }
    // chatgpt - use the full prompt
    const apiCall = window._stubCallOpenAI || ((msgs, onErr) => callOpenAI(msgs, onErr));
    return await apiCall(buildDictPrompt(word, sentenceContext), null);
  } catch (err) {
    // Network unavailable — try offline dictionary as fallback
    const offlineResult = await offlineLookupWord(word);
    if (offlineResult) return offlineResult;
    throw err;  // Re-throw if offline lookup also fails
  }
}

window.translateText = translateText;
window.googleTranslate = googleTranslate;
window.microsoftTranslate = microsoftTranslate;
window.googleLookupWord = googleLookupWord;
window.microsoftLookupWord = microsoftLookupWord;

async function callOpenAI(messages, onError) {
  await ensureSettings();
  if (!state.apiKey) {
    alert('Please set your OpenAI API key in the extension popup first.');
    return null;
  }

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.apiKey}`
      },
      body: JSON.stringify({
        model: state.model,
        messages: messages,
        temperature: 0.3,
      })
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error?.message || `API error: ${resp.status}`);
    }

    const data = await resp.json();
    return data.choices[0].message.content.trim();
  } catch (err) {
    console.error('OpenAI API error:', err);
    if (onError) onError(err.message);
    else alert('API error: ' + err.message);
    return null;
  }
}

async function translateSentence() {
  const text = panelSentence.textContent;
  const activeSentence = state.activeSentenceEl;
  btnTranslate.textContent = '\u23f3 Translating...';
  btnTranslate.disabled = true;

  try {
    const stubTranslate = window._stubTranslateText || window._stubCallOpenAI;
    let result;
    if (stubTranslate) {
      result = await stubTranslate(text);
    } else {
      result = await translateText(text, 'en', 'zh');
    }

    btnTranslate.textContent = '\ud83c\udf10 Translate';
    btnTranslate.disabled = false;

    if (result && state.activeSentenceEl === activeSentence) {
      translationText.textContent = result;
      panelTranslation.style.display = 'block';
    }
  } catch (err) {
    btnTranslate.textContent = '\ud83c\udf10 Translate';
    btnTranslate.disabled = false;
    console.error('Translation error:', err);
  }
}

async function analyzeGrammar() {
  const text = panelSentence.textContent;
  const activeSentence = state.activeSentenceEl;
  btnGrammar.textContent = '\u23f3 Analyzing...';
  btnGrammar.disabled = true;

  try {
    let result;
    if (window._stubGrammarAnalysis) {
      result = await window._stubGrammarAnalysis(text);
    } else {
      result = await callOpenAI([
        {
          role: 'system',
          content: `You are an English grammar analyst. Given a sentence, provide a clear and concise grammar analysis in Chinese. Include:

1. **句子结构** (Sentence Structure): Identify the subject, predicate, object, and any modifiers (S + V + O pattern).
2. **时态与语态** (Tense & Voice): What tense is used and whether it's active or passive.
3. **从句分析** (Clause Analysis): Identify any subordinate clauses (adverbial, relative, noun clauses) and their function.
4. **关键词性** (Key Parts of Speech): Label the part of speech for key words.
5. **难点解析** (Difficulty Notes): Explain any tricky grammar points, idiomatic usage, or common learner mistakes.

Format with clear labels. Be concise but thorough. Use Chinese for explanations.`
        },
        { role: 'user', content: text }
      ]);
    }

    btnGrammar.textContent = '\ud83d\udd2c Grammar';
    btnGrammar.disabled = false;

    if (result && state.activeSentenceEl === activeSentence) {
      grammarText.textContent = result;
      panelGrammar.style.display = 'block';
    }
  } catch (err) {
    btnGrammar.textContent = '\ud83d\udd2c Grammar';
    btnGrammar.disabled = false;
    console.error('Grammar analysis error:', err);
  }
}

window.analyzeGrammar = analyzeGrammar;

async function playTTS(text) {
  const resp = await window.fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.apiKey}`
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      input: text,
      voice: TTS_VOICE,
      response_format: 'mp3'
    })
  });

  if (!resp.ok) throw new Error(`TTS error: ${resp.status}`);

  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  const revokeUrl = () => URL.revokeObjectURL(url);
  audio.onended = revokeUrl;
  audio.onerror = revokeUrl;
  audio.play().catch(revokeUrl);
}

async function speakSentence() {
  const text = panelSentence.textContent;
  btnTTS.textContent = '\u23f3 Loading...';
  btnTTS.disabled = true;

  await ensureSettings();
  if (!state.apiKey) {
    alert('Please set your OpenAI API key for TTS.');
    btnTTS.textContent = '\ud83d\udd0a Listen';
    btnTTS.disabled = false;
    return;
  }

  try {
    await playTTS(text);
  } catch (err) {
    console.error('TTS error:', err);
    alert('TTS error: ' + err.message);
  }

  btnTTS.textContent = '\ud83d\udd0a Listen';
  btnTTS.disabled = false;
}

window.playTTS = playTTS;
window.translateSentence = translateSentence;
window.speakSentence = speakSentence;

// ===== Word Definition =====
function clearPosTag() {
  const oldPosTag = defEnglish.querySelector('.pos-tag');
  if (oldPosTag) oldPosTag.remove();
  const oldSpacer = defEnglish.querySelector('.pos-spacer');
  if (oldSpacer) oldSpacer.remove();
}

function showWordPopup(word, sentenceContext, event) {
  closeWordPopup();
  popupWord.textContent = word;
  defLoading.style.display = 'block';
  defLoading.textContent = 'Looking up definition...';
  defEnglish.style.display = 'none';
  defChineseSection.style.display = 'none';
  defCnText.style.display = 'none';
  toggleChinese.textContent = 'Show Chinese Definition';
  defPronunciation.textContent = '';
  defPronunciation.style.display = 'none';
  clearPosTag();

  const x = Math.max(0, Math.min(event.clientX, window.innerWidth - 360));
  const y = event.clientY > window.innerHeight / 2
    ? event.clientY - 20
    : event.clientY + 20;

  wordPopup.style.left = x + 'px';
  if (event.clientY > window.innerHeight / 2) {
    wordPopup.style.bottom = (window.innerHeight - y) + 'px';
    wordPopup.style.top = 'auto';
  } else {
    wordPopup.style.top = y + 'px';
    wordPopup.style.bottom = 'auto';
  }

  wordPopup.classList.add('active');
  lookupWord(word, sentenceContext);
}

function closeWordPopup() {
  wordPopup.classList.remove('active');
  ++_lookupToken;
}

let _lookupToken = 0;

async function lookupWord(word, sentenceContext) {
  popupWord.textContent = word;
  const token = ++_lookupToken;
  let result;
  try {
    if (window._stubCallOpenAI) {
      result = await window._stubCallOpenAI(buildDictPrompt(word, sentenceContext));
    } else {
      result = await lookupWordByProvider(word, sentenceContext);
    }
  } catch (err) {
    defLoading.textContent = 'Error: ' + err.message;
  }

  if (token !== _lookupToken) return;

  if (!result) {
    if (state.translationProvider === 'offline') {
      defLoading.textContent = `"${word}" not found in offline dictionary`;
    } else {
      defLoading.textContent = defLoading.textContent || `"${word}" lookup failed`;
    }
    defLoading.style.display = 'block';
    return;
  }

  defLoading.style.display = 'none';

  if (result) {
    const lines = result.split('\n');
    const enLine = lines.find(l => l.trim().startsWith('EN:'));
    const cnLine = lines.find(l => l.trim().startsWith('CN:'));
    const pronLine = lines.find(l => l.trim().startsWith('PRON:'));
    const enMatch = enLine ? [null, enLine.replace(/^.*?EN:\s*/, '')] : null;
    const cnMatch = cnLine ? [null, cnLine.replace(/^.*?CN:\s*/, '')] : null;
    const pronMatch = pronLine ? [null, pronLine.replace(/^.*?PRON:\s*/, '')] : null;

    if (enMatch) {
      const enRaw = enMatch[1].trim();
      const posMatch = enRaw.match(/^\(([^)]+)\)\s*/);
      clearPosTag();
      if (posMatch) {
        const posSpan = document.createElement('strong');
        posSpan.className = 'pos-tag';
        posSpan.textContent = posMatch[1];
        const spacer = document.createElement('span');
        spacer.className = 'pos-spacer';
        spacer.innerHTML = '&nbsp;&nbsp;&nbsp;&nbsp;';
        defEnglish.insertBefore(spacer, defEnText);
        defEnglish.insertBefore(posSpan, spacer);
        defEnText.textContent = enRaw.slice(posMatch[0].length);
      } else {
        defEnText.textContent = enRaw;
      }
      defEnglish.style.display = 'block';
    }
    if (pronMatch) {
      defPronunciation.textContent = pronMatch[1].trim();
      defPronunciation.style.display = 'block';
    } else {
      defPronunciation.style.display = 'none';
    }
    if (cnMatch) {
      defCnText.textContent = cnMatch[1].trim();
      defChineseSection.style.display = 'block';
    }

    recordWord({
      word,
      englishDef: enMatch ? enMatch[1].trim() : '',
      chineseDef: cnMatch ? cnMatch[1].trim() : '',
      pronunciation: pronMatch ? pronMatch[1].trim() : '',
      sentenceContext,
    });
  }
}

window.lookupWord = lookupWord;
window.showWordPopup = showWordPopup;

// ===== Full-Text Search =====
function openSearch() {
  searchBar.classList.add('active');
  searchInput.focus();
  searchInput.select();
}

function closeSearch() {
  searchBar.classList.remove('active');
  searchInput.value = '';
  state.searchMatches = [];
  state.searchCurrent = -1;
  searchCount.textContent = '';
  // Clear highlights
  clearSearchHighlights();
}

function performSearch() {
  const query = searchInput.value.trim();
  state.searchMatches = [];
  state.searchCurrent = -1;

  if (!query) {
    searchCount.textContent = '';
    clearSearchHighlights();
    return;
  }

  // Use case-insensitive regex to handle Unicode casefolding correctly
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'gi');

  // Search across all pages → find every sentence that contains the query
  for (let pi = 0; pi < state.pages.length; pi++) {
    const page = state.pages[pi];
    for (let pai = 0; pai < page.length; pai++) {
      const para = page[pai];
      if (para.type === 'image') continue;
      for (let si = 0; si < para.sentences.length; si++) {
        const sent = para.sentences[si];
        let m;
        re.lastIndex = 0;
        while ((m = re.exec(sent)) !== null) {
          state.searchMatches.push({ pageIndex: pi, paraIndex: pai, sentIndex: si, offset: m.index, length: m[0].length });
        }
      }
    }
  }

  if (state.searchMatches.length > 0) {
    // Jump to first match on or after current page
    let firstIdx = state.searchMatches.findIndex(m => m.pageIndex >= state.currentPage);
    if (firstIdx === -1) firstIdx = 0;
    state.searchCurrent = firstIdx;
    goToSearchMatch();
  } else {
    searchCount.textContent = '0 results';
    clearSearchHighlights();
  }
}

window.performSearch = performSearch;

function navigateSearch(direction) {
  if (state.searchMatches.length === 0) return;
  state.searchCurrent = (state.searchCurrent + direction + state.searchMatches.length) % state.searchMatches.length;
  goToSearchMatch();
}

function goToSearchMatch() {
  const match = state.searchMatches[state.searchCurrent];
  if (!match) return;

  searchCount.textContent = `${state.searchCurrent + 1} / ${state.searchMatches.length}`;

  // Navigate to the page if needed
  if (state.currentPage !== match.pageIndex) {
    goToPage(match.pageIndex);
  } else {
    highlightSearchOnPage();
  }

  // Scroll the current match into view
  requestAnimationFrame(() => {
    const currentEl = readerContent.querySelector('.search-highlight.current');
    if (currentEl) {
      if (currentEl.scrollIntoView) currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

function highlightSearchOnPage() {
  // Clear existing highlights first
  clearSearchHighlights();

  if (!searchInput.value.trim()) return;

  const matchesOnPage = state.searchMatches.filter(m => m.pageIndex === state.currentPage);
  if (matchesOnPage.length === 0) return;

  // Group matches by (paraIndex, sentIndex)
  const byLocation = {};
  for (const m of matchesOnPage) {
    const key = `${m.paraIndex}-${m.sentIndex}`;
    if (!byLocation[key]) byLocation[key] = [];
    byLocation[key].push(m);
  }

  const paragraphs = readerContent.querySelectorAll('.paragraph');

  for (const key of Object.keys(byLocation)) {
    const [pai, si] = key.split('-').map(Number);
    const paraEl = paragraphs[pai];
    if (!paraEl) continue;

    // Get the sentence element (sentences are direct .sentence children)
    const sentences = paraEl.querySelectorAll('.sentence');
    const sentEl = sentences[si];
    if (!sentEl) continue;

    const matches = byLocation[key];
    const sentenceText = sentEl.dataset.sentence;

    // Rebuild the sentence innerHTML with highlights
    // We need to mark ranges in the original text
    const sortedMatches = matches.map(m => ({ offset: m.offset, length: m.length, isCurrent: state.searchMatches[state.searchCurrent] === m }))
      .sort((a, b) => a.offset - b.offset);

    // Walk through word spans and text nodes, tracking position in the flat sentence text
    rebuildSentenceWithHighlights(sentEl, sentenceText, sortedMatches);
  }
}

function rebuildSentenceWithHighlights(sentEl, sentenceText, matches) {
  // Save original HTML for restoration on clear
  if (!sentEl.dataset.originalHtml) {
    sentEl.dataset.originalHtml = sentEl.innerHTML;
  }
  // Strategy: get flat text, find character ranges, then rebuild with highlights
  // We need to map character positions in sentenceText to DOM positions
  // Collect all child nodes (word spans and text nodes)
  const fragment = document.createDocumentFragment();
  let charPos = 0;

  // Process character by character through the original sentence text
  // Build new nodes with highlight spans where needed
  const nodes = Array.from(sentEl.childNodes);

  for (const node of nodes) {
    let nodeText;
    const isWord = node.nodeType === 1 && node.classList.contains('word');

    if (node.nodeType === 3) {
      nodeText = node.textContent;
    } else if (isWord) {
      nodeText = node.textContent;
    } else {
      fragment.appendChild(node.cloneNode(true));
      continue;
    }

    // Find the position of this node's text within sentenceText
    const nodeStart = sentenceText.indexOf(nodeText, charPos);
    if (nodeStart === -1) {
      // Fallback: just append as-is
      fragment.appendChild(node.cloneNode(true));
      charPos += nodeText.length;
      continue;
    }
    charPos = nodeStart + nodeText.length;

    // Check if any match overlaps this node
    const overlapping = matches.filter(m =>
      m.offset < nodeStart + nodeText.length && m.offset + m.length > nodeStart
    );

    if (overlapping.length === 0) {
      // No highlight needed
      if (isWord) {
        const w = document.createElement('span');
        w.className = 'word';
        w.textContent = nodeText;
        fragment.appendChild(w);
      } else {
        fragment.appendChild(document.createTextNode(nodeText));
      }
    } else {
      // Need to split this node text around highlight ranges
      const pieces = splitTextWithHighlights(nodeText, nodeStart, overlapping);
      for (const piece of pieces) {
        if (piece.highlight) {
          const mark = document.createElement('mark');
          mark.className = 'search-highlight' + (piece.isCurrent ? ' current' : '');
          mark.textContent = piece.text;
          if (isWord) {
            const w = document.createElement('span');
            w.className = 'word';
            w.appendChild(mark);
            fragment.appendChild(w);
          } else {
            fragment.appendChild(mark);
          }
        } else {
          if (isWord) {
            const w = document.createElement('span');
            w.className = 'word';
            w.textContent = piece.text;
            fragment.appendChild(w);
          } else {
            fragment.appendChild(document.createTextNode(piece.text));
          }
        }
      }
    }
  }

  sentEl.innerHTML = '';
  sentEl.appendChild(fragment);
}

function splitTextWithHighlights(nodeText, nodeStart, matches) {
  const pieces = [];
  let pos = 0;

  for (const m of matches) {
    const hlStart = Math.max(0, m.offset - nodeStart);
    const hlEnd = Math.min(nodeText.length, m.offset + m.length - nodeStart);

    if (hlStart > pos) {
      pieces.push({ text: nodeText.slice(pos, hlStart), highlight: false });
    }
    if (hlEnd > hlStart) {
      pieces.push({ text: nodeText.slice(hlStart, hlEnd), highlight: true, isCurrent: m.isCurrent });
    }
    pos = hlEnd;
  }

  if (pos < nodeText.length) {
    pieces.push({ text: nodeText.slice(pos), highlight: false });
  }

  return pieces;
}

function clearSearchHighlights() {
  const saved = readerContent.querySelectorAll('.sentence[data-original-html]');
  for (const sentEl of saved) {
    sentEl.innerHTML = sentEl.dataset.originalHtml;
    delete sentEl.dataset.originalHtml;
  }
}

// ===== Selection Toolbar =====
function showSelectionToolbar(x, y) {
  selectionToolbar.style.left = Math.max(8, Math.min(x - 40, window.innerWidth - 160)) + 'px';
  selectionToolbar.style.top = (y - 45) + 'px';
  selectionToolbar.classList.add('active');
}

function hideSelectionToolbar() {
  selectionToolbar.classList.remove('active');
}

// ===== Notes =====
function addNote(text) {
  state.notes.push({
    text,
    date: new Date().toLocaleString(),
    book: state.fileName
  });
  saveNotes();
  renderNotes();
}

function deleteNote(index) {
  state.notes.splice(index, 1);
  saveNotes();
  renderNotes();
}

function renderNotes() {
  notesList.innerHTML = '';
  const bookNotes = state.notes.filter(n => n.book === state.fileName);

  if (bookNotes.length === 0) {
    notesList.innerHTML = emptyStateHtml('No notes yet. Select text and click "Note" to add.');
    return;
  }

  bookNotes.forEach((note) => {
    const realIndex = state.notes.indexOf(note);
    const el = document.createElement('div');
    el.className = 'note-item';
    el.innerHTML = `
      <div>${escapeHtml(note.text)}</div>
      <div class="note-date">${escapeHtml(note.date)}</div>
      <button class="note-delete" data-index="${realIndex}">&times;</button>
    `;
    notesList.appendChild(el);
  });

  notesList.querySelectorAll('.note-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number.parseInt(btn.dataset.index, 10);
      if (Number.isInteger(i) && i >= 0) deleteNote(i);
    });
  });
}

function downloadMarkdown(filename, content) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportToDocx() {
  const _JSZip = (typeof JSZip !== 'undefined') ? JSZip : window.JSZip;
  const zip = new _JSZip();

  // Collect all text paragraphs across all pages
  const paragraphXmls = [];
  for (const page of state.pages) {
    for (const para of page) {
      if (para.type !== 'text') continue;
      const escaped = para.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      paragraphXmls.push(
        `<w:p><w:r><w:t>${escaped}</w:t></w:r></w:p>`
      );
    }
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
            xmlns:mo="http://schemas.microsoft.com/office/mac/office/2008/main"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
            xmlns:mv="urn:schemas-microsoft-com:mac:vml"
            xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:v="urn:schemas-microsoft-com:vml"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:w10="urn:schemas-microsoft-com:office:word"
            xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml">
  <w:body>
    ${paragraphXmls.join('\n    ')}
  </w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', wordRelsXml);

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const baseName = state.fileName.replace(/\.[^.]+$/, '');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${baseName}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

window.exportToDocx = exportToDocx;

function exportNotes() {
  const bookNotes = state.notes.filter(n => n.book === state.fileName);
  if (bookNotes.length === 0) return;

  const content = `# Reading Notes: ${state.fileName}\n\n` +
    bookNotes.map(n => `- ${n.text}\n  _(${n.date})_`).join('\n\n');

  downloadMarkdown(`notes-${state.fileName.replace(/\.[^.]+$/, '')}.md`, content);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Word List =====
const wordListToggle = $('#wordListToggle');
const wordListPanel = $('#wordListPanel');
const wordListClose = $('#wordListClose');
const wordListEntries = $('#wordListEntries');
const wordListExport = $('#wordListExport');

function loadWordList() {
  const raw = localStorage.getItem('reader-wordlist');
  return raw ? safeParseJSON(raw, []) : [];
}

function saveWordList(list) {
  localStorage.setItem('reader-wordlist', JSON.stringify(list));
}

function recordWord({ word, englishDef, chineseDef, pronunciation, sentenceContext }) {
  let list = loadWordList();
  const lowerWord = word.toLowerCase();
  const book = state.fileName;

  const existing = list.find(w => w.word.toLowerCase() === lowerWord && w.book === book);
  if (existing) {
    existing.queryCount += 1;
    existing.englishDef = englishDef;
    existing.chineseDef = chineseDef;
    existing.pronunciation = pronunciation;
    existing.lastQueried = new Date().toISOString();
    // Append sentence context if new and non-empty
    if (!Array.isArray(existing.sentenceContext)) existing.sentenceContext = [];
    if (sentenceContext && !existing.sentenceContext.includes(sentenceContext)) {
      existing.sentenceContext.push(sentenceContext);
    }
  } else {
    list.push({
      word,
      queryCount: 1,
      englishDef,
      chineseDef,
      pronunciation,
      sentenceContext: sentenceContext ? [sentenceContext] : [],
      book,
      lastQueried: new Date().toISOString(),
    });
  }

  saveWordList(list);
}

window.recordWord = recordWord;

function renderWordList() {
  wordListEntries.innerHTML = '';
  const list = loadWordList();
  const bookWords = list
    .filter(w => w.book === state.fileName)
    .sort((a, b) => b.queryCount - a.queryCount);

  if (bookWords.length === 0) {
    wordListEntries.innerHTML = emptyStateHtml('No words queried yet.');
    return;
  }

  for (const entry of bookWords) {
    const el = document.createElement('div');
    el.className = 'wordlist-item';

    const d = new Date(entry.lastQueried);
    const timeStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const contexts = (entry.sentenceContext || []);
    const contextHtml = contexts.length > 0
      ? `<div class="wordlist-contexts">${contexts.map(s => `<div class="wordlist-ctx">${escapeHtml(s)}</div>`).join('')}</div>`
      : '';

    el.innerHTML =
      `<div><span class="wordlist-word">${escapeHtml(entry.word)}</span>` +
      `<span class="wordlist-pron">${escapeHtml(entry.pronunciation)}</span>` +
      `<span class="wordlist-count">&times;${entry.queryCount}</span></div>` +
      `<div class="wordlist-cn">${escapeHtml(entry.chineseDef)}</div>` +
      `<div class="wordlist-en">${escapeHtml(entry.englishDef)}</div>` +
      contextHtml +
      `<div class="wordlist-time">${timeStr}</div>` +
      `<button class="wordlist-delete" data-word="${escapeHtml(entry.word)}" data-book="${escapeHtml(entry.book)}">&times;</button>`;
    wordListEntries.appendChild(el);
  }

  wordListEntries.querySelectorAll('.wordlist-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteWordFromList(btn.dataset.word, btn.dataset.book);
    });
  });
}

window.renderWordList = renderWordList;

function deleteWordFromList(word, book) {
  let list = loadWordList();
  list = list.filter(w => !(w.word.toLowerCase() === word.toLowerCase() && w.book === book));
  saveWordList(list);
  renderWordList();
}

window.deleteWordFromList = deleteWordFromList;

function exportWordList() {
  const list = loadWordList();
  const bookWords = list
    .filter(w => w.book === state.fileName)
    .sort((a, b) => b.queryCount - a.queryCount);

  if (bookWords.length === 0) return;

  const lines = [`# Word List: ${state.fileName}\n`];
  for (const w of bookWords) {
    lines.push(`- **${w.word}** ${w.pronunciation} (\u00d7${w.queryCount})`);
    lines.push(`  ${w.englishDef}`);
    lines.push(`  ${w.chineseDef}`);
    const contexts = w.sentenceContext || [];
    if (contexts.length > 0) {
      for (const ctx of contexts) {
        lines.push(`  > ${ctx}`);
      }
    }
    lines.push('');
  }

  const content = lines.join('\n');
  downloadMarkdown(`wordlist-${state.fileName.replace(/\.[^.]+$/, '')}.md`, content);
}

window.exportWordList = exportWordList;

// Word list panel toggle/close
wordListToggle.addEventListener('click', () => {
  wordListPanel.classList.toggle('active');
  renderWordList();
});
wordListClose.addEventListener('click', () => {
  wordListPanel.classList.remove('active');
});
wordListExport.addEventListener('click', exportWordList);

// ===== Reading History =====
const MAX_HISTORY_ENTRIES = 50;

// History DOM elements
const historyToggle = $('#historyToggle');
const historyPanel = $('#historyPanel');
const historyClose = $('#historyClose');
const historyList = $('#historyList');
const historyClear = $('#historyClear');

function loadHistory() {
  const raw = localStorage.getItem('reader-history');
  return raw ? safeParseJSON(raw, []) : [];
}

function saveHistoryToStorage(history) {
  localStorage.setItem('reader-history', JSON.stringify(history));
}

function saveReadingHistory() {
  if (!state.fileName) return;

  const entry = {
    fileName: state.fileName,
    page: state.currentPage,
    scrollTop: readerContent.scrollTop,
    totalPages: state.totalPages,
    date: new Date().toISOString(),
  };

  let history = loadHistory();

  // Deduplicate: remove existing entry for same file+page
  history = history.filter(h => !(h.fileName === entry.fileName && h.page === entry.page));

  history.push(entry);

  // Cap at MAX_HISTORY_ENTRIES — keep the most recent
  if (history.length > MAX_HISTORY_ENTRIES) {
    history = history.slice(history.length - MAX_HISTORY_ENTRIES);
  }

  saveHistoryToStorage(history);
}

// Expose for testing
window.saveReadingHistory = saveReadingHistory;

function renderHistory() {
  historyList.innerHTML = '';
  const history = loadHistory();
  const fileHistory = history
    .filter(h => h.fileName === state.fileName)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (fileHistory.length === 0) {
    historyList.innerHTML = emptyStateHtml('No reading history yet.');
    return;
  }

  for (const entry of fileHistory) {
    const el = document.createElement('div');
    el.className = 'history-item';
    const d = new Date(entry.date);
    const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const pageDiv = document.createElement('div');
    pageDiv.className = 'history-page';
    pageDiv.textContent = `Page ${parseInt(entry.page, 10) + 1} / ${parseInt(entry.totalPages, 10)}`;
    const dateDiv = document.createElement('div');
    dateDiv.className = 'history-date';
    dateDiv.textContent = dateStr;
    el.appendChild(pageDiv);
    el.appendChild(dateDiv);
    el.addEventListener('click', () => {
      goToPage(entry.page, false);
      requestAnimationFrame(() => {
        readerContent.scrollTop = entry.scrollTop;
      });
    });
    historyList.appendChild(el);
  }
}

// Expose for testing
window.renderHistory = renderHistory;

function clearHistory() {
  let history = loadHistory();
  history = history.filter(h => h.fileName !== state.fileName);
  saveHistoryToStorage(history);
  renderHistory();
}

// Expose for testing
window.clearHistory = clearHistory;

// Auto-save triggers
window.addEventListener('beforeunload', () => {
  saveReadingHistory();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    saveReadingHistory();
  }
});

// History panel toggle/close
historyToggle.addEventListener('click', () => {
  historyPanel.classList.toggle('active');
  renderHistory();
});
historyClose.addEventListener('click', () => {
  historyPanel.classList.remove('active');
});
historyClear.addEventListener('click', clearHistory);

// ===== Feature Guide =====
const FEATURE_REGISTRY = [
  {
    name: 'Word Lookup',
    icon: '\ud83d\udcd6',
    description: 'Click any word to see its English definition, Chinese meaning, and pronunciation.',
    usage: 'Click a word in the text. A popup shows definitions. Click "Show Chinese Definition" for the Chinese meaning.',
    name_cn: '\u5355\u8bcd\u67e5\u8be2',
    description_cn: '\u70b9\u51fb\u4efb\u610f\u5355\u8bcd\uff0c\u67e5\u770b\u82f1\u6587\u91ca\u4e49\u3001\u4e2d\u6587\u610f\u601d\u548c\u53d1\u97f3\u3002',
    usage_cn: '\u70b9\u51fb\u6587\u672c\u4e2d\u7684\u5355\u8bcd\uff0c\u5f39\u51fa\u91ca\u4e49\u7a97\u53e3\u3002\u70b9\u51fb\u201c\u663e\u793a\u4e2d\u6587\u91ca\u4e49\u201d\u67e5\u770b\u4e2d\u6587\u610f\u601d\u3002'
  },
  {
    name: 'Sentence Translation',
    icon: '\ud83c\udf10',
    description: 'Translate any sentence to Chinese with one click or a two-finger tap.',
    usage: 'Right-click or two-finger tap a sentence. The sentence panel opens \u2014 click "Translate" or it auto-translates on gesture.',
    name_cn: '\u53e5\u5b50\u7ffb\u8bd1',
    description_cn: '\u4e00\u952e\u6216\u53cc\u6307\u70b9\u51fb\u5373\u53ef\u5c06\u4efb\u610f\u53e5\u5b50\u7ffb\u8bd1\u6210\u4e2d\u6587\u3002',
    usage_cn: '\u53f3\u952e\u6216\u53cc\u6307\u70b9\u51fb\u53e5\u5b50\uff0c\u6253\u5f00\u53e5\u5b50\u9762\u677f\u2014\u2014\u70b9\u51fb\u201c\u7ffb\u8bd1\u201d\u6216\u624b\u52bf\u6a21\u5f0f\u4e0b\u81ea\u52a8\u7ffb\u8bd1\u3002'
  },
  {
    name: 'Grammar Analysis',
    icon: '\ud83d\udd2c',
    description: 'Analyze the grammar structure of any sentence, including parts of speech, tense, and clauses.',
    usage: 'Open a sentence panel and click "Grammar" to see a detailed grammar breakdown in Chinese.',
    name_cn: '\u8bed\u6cd5\u5206\u6790',
    description_cn: '\u5206\u6790\u4efb\u610f\u53e5\u5b50\u7684\u8bed\u6cd5\u7ed3\u6784\uff0c\u5305\u62ec\u8bcd\u6027\u3001\u65f6\u6001\u548c\u4ece\u53e5\u3002',
    usage_cn: '\u6253\u5f00\u53e5\u5b50\u9762\u677f\uff0c\u70b9\u51fb\u201c\u8bed\u6cd5\u201d\u6309\u94ae\uff0c\u67e5\u770b\u8be6\u7ec6\u7684\u4e2d\u6587\u8bed\u6cd5\u89e3\u6790\u3002'
  },
  {
    name: 'Paragraph Translation',
    icon: '\ud83d\udcc4',
    description: 'Translate an entire paragraph by clicking its left margin bar.',
    usage: 'Click the left border of any paragraph to open a popup with the full text and translation options.',
    name_cn: '\u6bb5\u843d\u7ffb\u8bd1',
    description_cn: '\u70b9\u51fb\u6bb5\u843d\u5de6\u4fa7\u8fb9\u680f\uff0c\u7ffb\u8bd1\u6574\u4e2a\u6bb5\u843d\u3002',
    usage_cn: '\u70b9\u51fb\u4efb\u610f\u6bb5\u843d\u7684\u5de6\u4fa7\u8fb9\u6846\uff0c\u5f39\u51fa\u5305\u542b\u5168\u6587\u548c\u7ffb\u8bd1\u9009\u9879\u7684\u7a97\u53e3\u3002'
  },
  {
    name: 'Text-to-Speech',
    icon: '\ud83d\udd0a',
    description: 'Listen to any sentence read aloud with natural pronunciation.',
    usage: 'Open a sentence panel and click "Listen" to hear the sentence spoken aloud.',
    name_cn: '\u6587\u5b57\u8f6c\u8bed\u97f3',
    description_cn: '\u4ee5\u81ea\u7136\u53d1\u97f3\u6717\u8bfb\u4efb\u610f\u53e5\u5b50\u3002',
    usage_cn: '\u6253\u5f00\u53e5\u5b50\u9762\u677f\uff0c\u70b9\u51fb\u201c\u6536\u542c\u201d\u6309\u94ae\u5373\u53ef\u6717\u8bfb\u3002'
  },
  {
    name: 'Search',
    icon: '\ud83d\udd0d',
    description: 'Search for any word or phrase across the entire book.',
    usage: 'Click the search icon in the top bar or press Ctrl+F. Type your query and use arrow buttons to navigate matches.',
    name_cn: '\u641c\u7d22',
    description_cn: '\u5728\u6574\u672c\u4e66\u4e2d\u641c\u7d22\u4efb\u610f\u5355\u8bcd\u6216\u77ed\u8bed\u3002',
    usage_cn: '\u70b9\u51fb\u9876\u90e8\u680f\u7684\u641c\u7d22\u56fe\u6807\u6216\u6309 Ctrl+F\u3002\u8f93\u5165\u5173\u952e\u8bcd\uff0c\u4f7f\u7528\u7bad\u5934\u6309\u94ae\u6d4f\u89c8\u5339\u914d\u7ed3\u679c\u3002'
  },
  {
    name: 'Bookmarks',
    icon: '\u2606',
    description: 'Bookmark your current reading position for quick access later.',
    usage: 'Click the star icon in the top bar to bookmark the current page. Long-press the star to remove the bookmark.',
    name_cn: '\u4e66\u7b7e',
    description_cn: '\u6807\u8bb0\u5f53\u524d\u9605\u8bfb\u4f4d\u7f6e\uff0c\u65b9\u4fbf\u4e0b\u6b21\u5feb\u901f\u8bbf\u95ee\u3002',
    usage_cn: '\u70b9\u51fb\u9876\u90e8\u680f\u7684\u661f\u6807\u56fe\u6807\u6536\u85cf\u5f53\u524d\u9875\u9762\u3002\u957f\u6309\u661f\u6807\u53ef\u5220\u9664\u4e66\u7b7e\u3002'
  },
  {
    name: 'Notes',
    icon: '\ud83d\udcdd',
    description: 'Highlight text and save personal notes while reading.',
    usage: 'Select text and click "Note" in the toolbar. View all notes by clicking the notes icon on the right side.',
    name_cn: '\u7b14\u8bb0',
    description_cn: '\u9605\u8bfb\u65f6\u9009\u4e2d\u6587\u672c\u5e76\u4fdd\u5b58\u4e2a\u4eba\u7b14\u8bb0\u3002',
    usage_cn: '\u9009\u4e2d\u6587\u672c\u540e\u70b9\u51fb\u5de5\u5177\u680f\u4e2d\u7684\u201c\u7b14\u8bb0\u201d\u3002\u70b9\u51fb\u53f3\u4fa7\u7684\u7b14\u8bb0\u56fe\u6807\u67e5\u770b\u6240\u6709\u7b14\u8bb0\u3002'
  },
  {
    name: 'Word List',
    icon: 'Aa',
    description: 'Automatically records every word you look up with query count, definitions, pronunciation, and sentence context.',
    usage: 'Words are recorded automatically when you look them up. Click the "Aa" icon to view your word list. Export as Markdown.',
    name_cn: '\u751f\u8bcd\u672c',
    description_cn: '\u81ea\u52a8\u8bb0\u5f55\u6bcf\u4e2a\u67e5\u8be2\u7684\u5355\u8bcd\uff0c\u5305\u62ec\u67e5\u8be2\u6b21\u6570\u3001\u91ca\u4e49\u3001\u53d1\u97f3\u548c\u4e0a\u4e0b\u6587\u3002',
    usage_cn: '\u67e5\u8be2\u5355\u8bcd\u65f6\u81ea\u52a8\u8bb0\u5f55\u3002\u70b9\u51fb\u201cAa\u201d\u56fe\u6807\u67e5\u770b\u751f\u8bcd\u672c\uff0c\u53ef\u5bfc\u51fa\u4e3a Markdown \u6587\u4ef6\u3002'
  },
  {
    name: 'Reading History',
    icon: '\ud83d\udd51',
    description: 'Automatically saves your reading position so you can resume where you left off.',
    usage: 'Click the clock icon to view your reading history. Click any entry to jump back to that position.',
    name_cn: '\u9605\u8bfb\u5386\u53f2',
    description_cn: '\u81ea\u52a8\u4fdd\u5b58\u9605\u8bfb\u4f4d\u7f6e\uff0c\u65b9\u4fbf\u4e0b\u6b21\u7ee7\u7eed\u9605\u8bfb\u3002',
    usage_cn: '\u70b9\u51fb\u65f6\u949f\u56fe\u6807\u67e5\u770b\u9605\u8bfb\u5386\u53f2\u3002\u70b9\u51fb\u4efb\u610f\u8bb0\u5f55\u5373\u53ef\u8df3\u8f6c\u5230\u8be5\u4f4d\u7f6e\u3002'
  },
  {
    name: 'Page Themes',
    icon: '\ud83c\udfa8',
    description: 'Choose from four background colors (white, dark, sepia, green) for comfortable reading.',
    usage: 'Click a color swatch in the top bar to switch themes. Text and paragraph colors adjust automatically.',
    name_cn: '\u9875\u9762\u4e3b\u9898',
    description_cn: '\u63d0\u4f9b\u56db\u79cd\u80cc\u666f\u8272\uff08\u767d\u8272\u3001\u6df1\u8272\u3001\u590d\u53e4\u3001\u7eff\u8272\uff09\uff0c\u8212\u9002\u9605\u8bfb\u3002',
    usage_cn: '\u70b9\u51fb\u9876\u90e8\u680f\u7684\u989c\u8272\u8272\u5757\u5207\u6362\u4e3b\u9898\u3002\u6587\u5b57\u548c\u6bb5\u843d\u989c\u8272\u4f1a\u81ea\u52a8\u8c03\u6574\u3002'
  },
  {
    name: 'Font Size',
    icon: 'A',
    description: 'Adjust the reading font size for comfort.',
    usage: 'Click "A-" to decrease or "A+" to increase the font size in the top bar.',
    name_cn: '\u5b57\u4f53\u5927\u5c0f',
    description_cn: '\u8c03\u6574\u9605\u8bfb\u5b57\u4f53\u5927\u5c0f\uff0c\u83b7\u5f97\u8212\u9002\u7684\u9605\u8bfb\u4f53\u9a8c\u3002',
    usage_cn: '\u5728\u9876\u90e8\u680f\u70b9\u51fb\u201cA-\u201d\u7f29\u5c0f\u6216\u201cA+\u201d\u653e\u5927\u5b57\u4f53\u3002'
  },
  {
    name: 'Content Width',
    icon: '\u2194',
    description: 'Adjust the content column width to your preferred reading width.',
    usage: 'Click the narrower/wider arrows in the top bar to adjust the content width.',
    name_cn: '\u5185\u5bb9\u5bbd\u5ea6',
    description_cn: '\u8c03\u6574\u5185\u5bb9\u680f\u5bbd\u5ea6\uff0c\u9002\u5e94\u4e0d\u540c\u7684\u9605\u8bfb\u504f\u597d\u3002',
    usage_cn: '\u70b9\u51fb\u9876\u90e8\u680f\u7684\u5bbd\u7a84\u7bad\u5934\u8c03\u6574\u5185\u5bb9\u5bbd\u5ea6\u3002'
  },
  {
    name: 'Page Navigation',
    icon: '\ud83d\udcc3',
    description: 'Navigate between pages or jump directly to a specific page number.',
    usage: 'Use Previous/Next buttons, or click the page indicator at the bottom to type a page number and press Enter.',
    name_cn: '\u9875\u9762\u5bfc\u822a',
    description_cn: '\u5728\u9875\u9762\u4e4b\u95f4\u5bfc\u822a\u6216\u76f4\u63a5\u8df3\u8f6c\u5230\u6307\u5b9a\u9875\u7801\u3002',
    usage_cn: '\u4f7f\u7528\u201c\u4e0a\u4e00\u9875/\u4e0b\u4e00\u9875\u201d\u6309\u94ae\uff0c\u6216\u70b9\u51fb\u5e95\u90e8\u9875\u7801\u6307\u793a\u5668\u8f93\u5165\u9875\u7801\u540e\u6309\u56de\u8f66\u3002'
  },
  {
    name: 'Auto-Hide Bars',
    icon: '\ud83d\udc41',
    description: 'Top and bottom bars hide automatically during reading to maximize screen space.',
    usage: 'Bars hide after 3 seconds of inactivity. Move mouse to the top or bottom edge of the screen to reveal them.',
    name_cn: '\u81ea\u52a8\u9690\u85cf\u680f',
    description_cn: '\u9605\u8bfb\u65f6\u9876\u90e8\u548c\u5e95\u90e8\u680f\u81ea\u52a8\u9690\u85cf\uff0c\u6700\u5927\u5316\u5c4f\u5e55\u7a7a\u95f4\u3002',
    usage_cn: '\u505c\u6b62\u64cd\u4f5c3\u79d2\u540e\u81ea\u52a8\u9690\u85cf\u3002\u5c06\u9f20\u6807\u79fb\u5230\u5c4f\u5e55\u9876\u90e8\u6216\u5e95\u90e8\u8fb9\u7f18\u5373\u53ef\u663e\u793a\u3002'
  },
  {
    name: 'Export to Word',
    icon: '\ud83d\udce6',
    description: 'Export the current document as a Word (.docx) file.',
    usage: 'Click the export icon in the top bar to download the document content as a .docx file.',
    name_cn: '\u5bfc\u51fa\u4e3a Word',
    description_cn: '\u5c06\u5f53\u524d\u6587\u6863\u5bfc\u51fa\u4e3a Word (.docx) \u6587\u4ef6\u3002',
    usage_cn: '\u70b9\u51fb\u9876\u90e8\u680f\u7684\u5bfc\u51fa\u56fe\u6807\uff0c\u4e0b\u8f7d\u6587\u6863\u5185\u5bb9\u4e3a .docx \u6587\u4ef6\u3002'
  },
  {
    name: 'Image OCR',
    icon: '\ud83d\uddbc',
    description: 'Upload an image file and extract text using AI-powered OCR.',
    usage: 'Drop or browse for a .png, .jpg, .jpeg, or .webp image file. Text is extracted automatically via the OpenAI Vision API.',
    name_cn: '\u56fe\u7247\u6587\u5b57\u8bc6\u522b',
    description_cn: '\u4e0a\u4f20\u56fe\u7247\u6587\u4ef6\uff0c\u4f7f\u7528 AI \u9a71\u52a8\u7684 OCR \u63d0\u53d6\u6587\u5b57\u3002',
    usage_cn: '\u62d6\u653e\u6216\u6d4f\u89c8\u9009\u62e9 .png\u3001.jpg\u3001.jpeg \u6216 .webp \u56fe\u7247\u6587\u4ef6\u3002\u901a\u8fc7 OpenAI Vision API \u81ea\u52a8\u63d0\u53d6\u6587\u5b57\u3002'
  },
];

window.FEATURE_REGISTRY = FEATURE_REGISTRY;

const featureGuide = document.getElementById('featureGuide');
const featureGuideClose = document.getElementById('featureGuideClose');
const featureGuideBody = document.getElementById('featureGuideBody');
const helpBtn = document.getElementById('helpBtn');
const exportDocxBtn = document.getElementById('exportDocxBtn');

let guideLang = 'en';

function renderFeatureGuide() {
  featureGuideBody.innerHTML = '';

  // Language toggle
  const langToggle = document.createElement('div');
  langToggle.className = 'guide-lang-toggle';
  const btnEn = document.createElement('button');
  btnEn.className = 'btn btn-sm guide-lang-btn' + (guideLang === 'en' ? ' active' : '');
  btnEn.textContent = 'English';
  const btnCn = document.createElement('button');
  btnCn.className = 'btn btn-sm guide-lang-btn' + (guideLang === 'cn' ? ' active' : '');
  btnCn.textContent = '\u4e2d\u6587';
  btnEn.addEventListener('click', () => { guideLang = 'en'; renderFeatureGuide(); });
  btnCn.addEventListener('click', () => { guideLang = 'cn'; renderFeatureGuide(); });
  langToggle.appendChild(btnEn);
  langToggle.appendChild(btnCn);
  featureGuideBody.appendChild(langToggle);

  for (const f of FEATURE_REGISTRY) {
    const card = document.createElement('div');
    card.className = 'guide-card';
    card.innerHTML =
      '<div class="guide-card-icon"></div>' +
      '<div class="guide-card-content">' +
        '<div class="guide-card-name"></div>' +
        '<div class="guide-card-desc"></div>' +
        '<div class="guide-card-usage"></div>' +
      '</div>';
    card.querySelector('.guide-card-icon').textContent = f.icon;
    if (guideLang === 'cn') {
      card.querySelector('.guide-card-name').textContent = f.name_cn || f.name;
      card.querySelector('.guide-card-desc').textContent = f.description_cn || f.description;
      card.querySelector('.guide-card-usage').textContent = f.usage_cn || f.usage;
    } else {
      card.querySelector('.guide-card-name').textContent = f.name;
      card.querySelector('.guide-card-desc').textContent = f.description;
      card.querySelector('.guide-card-usage').textContent = f.usage;
    }
    featureGuideBody.appendChild(card);
  }
}

function openFeatureGuide() {
  renderFeatureGuide();
  featureGuide.classList.add('active');
}

function closeFeatureGuide() {
  featureGuide.classList.remove('active');
}

helpBtn.addEventListener('click', openFeatureGuide);
if (exportDocxBtn) exportDocxBtn.addEventListener('click', exportToDocx);
featureGuideClose.addEventListener('click', closeFeatureGuide);

// Click outside guide-inner to close
featureGuide.addEventListener('click', (e) => {
  if (e.target === featureGuide) {
    closeFeatureGuide();
  }
});

// ===== Auto-Hide Bars =====
const AUTO_HIDE_DELAY = 3000;
const EDGE_TRIGGER_PX = 50;
let autoHideTimer = null;

function startAutoHideTimer() {
  clearAutoHideTimer();
  autoHideTimer = setTimeout(() => {
    if (!readerScreen.classList.contains('active')) return;
    const topBar = document.querySelector('.top-bar');
    const bottomBar = document.querySelector('.bottom-bar');
    const searchBarEl = document.getElementById('searchBar');
    if (topBar) topBar.classList.add('auto-hide');
    if (bottomBar) bottomBar.classList.add('auto-hide');
    if (searchBarEl) searchBarEl.classList.add('auto-hide');
  }, AUTO_HIDE_DELAY);
}

function clearAutoHideTimer() {
  if (autoHideTimer !== null) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }
}

function showBars() {
  const topBar = document.querySelector('.top-bar');
  const bottomBar = document.querySelector('.bottom-bar');
  const searchBarEl = document.getElementById('searchBar');
  if (topBar) topBar.classList.remove('auto-hide');
  if (bottomBar) bottomBar.classList.remove('auto-hide');
  if (searchBarEl) searchBarEl.classList.remove('auto-hide');
}

document.addEventListener('mousemove', (e) => {
  if (!readerScreen.classList.contains('active')) return;

  const atTop = e.clientY < EDGE_TRIGGER_PX;
  const atBottom = e.clientY > (window.innerHeight - EDGE_TRIGGER_PX);

  if (atTop || atBottom) {
    showBars();
    clearAutoHideTimer();
  } else {
    showBars();
    startAutoHideTimer();
  }
});

// Clicking or touching the top bar resets auto-hide so buttons remain interactive
document.querySelector('.top-bar').addEventListener('click', () => {
  showBars();
  startAutoHideTimer();
});
document.querySelector('.top-bar').addEventListener('touchstart', () => {
  showBars();
  startAutoHideTimer();
});

// Auto-hide and side toggles handled by init() via DOMContentLoaded
