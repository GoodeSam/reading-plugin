// ===== Constants =====
const DEFAULT_MODEL = 'gpt-4o-mini';
const TTS_MODEL = 'tts-1';
const TTS_VOICE = 'alloy';
const SENTENCES_PER_PAGE = 40;

// ===== State =====
let state = {
  pages: [],        // Array of pages, each page is array of paragraphs, each paragraph is array of sentences
  currentPage: 0,
  totalPages: 0,
  apiKey: '',
  model: DEFAULT_MODEL,
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
const btnTTS = $('#btnTTS');
const btnCopy = $('#btnCopy');
const panelTranslation = $('#panelTranslation');
const translationText = $('#translationText');

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
const paraPopupTranslation = $('#paraPopupTranslation');

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

function init() {
  loadSettings();
  loadNotes();
  loadFontSize();
  loadContentWidth();
  loadTheme();
  bindEvents();
}

function loadFontSize() {
  const saved = localStorage.getItem('reader-font-size');
  if (saved) state.fontSize = parseInt(saved, 10);
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
  if (saved) state.contentWidth = parseInt(saved, 10);
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
      state.apiKey = data.openaiApiKey || '';
    });
    chrome.storage.local.get(['openaiModel'], (data) => {
      state.model = data.openaiModel || DEFAULT_MODEL;
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
    timestamp: Date.now(),
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
  if (bm && bm.page < state.totalPages) {
    goToPage(bm.page, false);
    // Restore scroll after render
    requestAnimationFrame(() => {
      readerContent.scrollTop = bm.scrollTop;
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
  });
}

function bindPanelEvents() {
  panelClose.addEventListener('click', closeSentencePanel);
  panelOverlay.addEventListener('click', closeSentencePanel);
  btnTranslate.addEventListener('click', translateSentence);
  btnTTS.addEventListener('click', speakSentence);
  btnCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(panelSentence.textContent);
    btnCopy.textContent = '\u2713 Copied';
    setTimeout(() => btnCopy.textContent = '\ud83d\udccb Copy', 1500);
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
    navigator.clipboard.writeText(sel);
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
  }
}

function handleReaderTouch(e) {
  const touchCount = e.touches.length;

  if (touchCount === 2) {
    const sentenceEl = e.target.closest('.sentence');
    if (!sentenceEl) return;
    e.preventDefault();
    openSentencePanel(sentenceEl);
    window.translateSentence();
    window.speakSentence();
  } else if (touchCount === 3) {
    const paraEl = e.target.closest('.paragraph');
    if (!paraEl) return;
    e.preventDefault();
    openParaPopup(paraEl);
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
    } else {
      alert('Please upload a PDF or EPUB file.');
      return;
    }

    const paragraphs = splitIntoParagraphs(text);
    paginateParagraphs(paragraphs);

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
  } catch (err) {
    console.error(err);
    alert('Failed to parse file: ' + err.message);
  }
}

async function extractPDFPageImages(page, pageNum) {
  const images = [];
  try {
    const ops = await page.getOperatorList();
    let currentY = 0;
    for (let k = 0; k < ops.fnArray.length; k++) {
      if (ops.fnArray[k] === 12 && ops.argsArray[k]) {
        currentY = ops.argsArray[k][5] || currentY;
      }
      if (ops.fnArray[k] === 85 || ops.fnArray[k] === 82) {
        const imgName = ops.argsArray[k][0];
        try {
          const imgData = await page.objs.get(imgName);
          if (imgData && imgData.data) {
            const canvas = document.createElement('canvas');
            canvas.width = imgData.width;
            canvas.height = imgData.height;
            const ctx = canvas.getContext('2d');
            const imageData = ctx.createImageData(imgData.width, imgData.height);
            if (imgData.data.length === imgData.width * imgData.height * 4) {
              imageData.data.set(imgData.data);
            } else if (imgData.data.length === imgData.width * imgData.height * 3) {
              for (let p = 0, q = 0; p < imgData.data.length; p += 3, q += 4) {
                imageData.data[q] = imgData.data[p];
                imageData.data[q + 1] = imgData.data[p + 1];
                imageData.data[q + 2] = imgData.data[p + 2];
                imageData.data[q + 3] = 255;
              }
            }
            ctx.putImageData(imageData, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            if (imgData.width > 50 && imgData.height > 50) {
              images.push({ type: 'image', src: dataUrl, alt: `Page ${pageNum} image`, y: Math.round(currentY) });
            }
          }
        } catch (imgErr) {
          console.warn(`PDF image extraction failed (page ${pageNum}):`, imgErr.message);
        }
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
  let hasImages = false;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    const pageImages = await extractPDFPageImages(page, i);
    if (pageImages.length > 0) hasImages = true;

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
  // Don't touch protocol URLs (https://, data:, blob:) or absolute paths
  if (/^[a-z][a-z0-9+.-]*:/i.test(filepath)) return filepath;
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
function openParaPopup(paraEl) {
  const text = paraEl.textContent.trim();
  paraPopupText.textContent = text;
  paraPopupTranslation.textContent = 'Translating...';
  paraPopupOverlay.classList.add('active');
  paraPopup.classList.add('active');

  // Auto-trigger translation
  const apiCall = window._stubCallOpenAI || ((msgs) => callOpenAI(msgs));
  const promise = apiCall([
    { role: 'system', content: 'You are a translator. Translate the following English text to Chinese. Only output the translation, nothing else.' },
    { role: 'user', content: text }
  ]);
  if (promise && promise.then) {
    promise.then((result) => {
      if (result) {
        paraPopupTranslation.textContent = result;
      } else {
        paraPopupTranslation.textContent = 'Translation unavailable.';
      }
    }).catch((err) => {
      paraPopupTranslation.textContent = 'Translation failed: ' + err.message;
    });
  } else {
    paraPopupTranslation.textContent = 'Translation unavailable.';
  }
}

function closeParaPopup() {
  paraPopupOverlay.classList.remove('active');
  paraPopup.classList.remove('active');
}

paraPopupClose.addEventListener('click', closeParaPopup);
paraPopupOverlay.addEventListener('click', closeParaPopup);

// ===== API Calls =====
async function ensureApiKey() {
  if (!state.apiKey) {
    await new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['openaiApiKey', 'openaiModel'], (data) => {
          state.apiKey = data.openaiApiKey || '';
          state.model = data.openaiModel || DEFAULT_MODEL;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
  return !!state.apiKey;
}

async function callOpenAI(messages, onError) {
  if (!await ensureApiKey()) {
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

  const result = await callOpenAI([
    { role: 'system', content: 'You are a translator. Translate the following English sentence to Chinese. Only output the translation, nothing else.' },
    { role: 'user', content: text }
  ]);

  btnTranslate.textContent = '\ud83c\udf10 Translate';
  btnTranslate.disabled = false;

  if (result && state.activeSentenceEl === activeSentence) {
    translationText.textContent = result;
    panelTranslation.style.display = 'block';
  }
}

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

  if (!await ensureApiKey()) {
    alert('Please set your OpenAI API key first.');
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
  const oldPosTag = defEnglish.querySelector('.pos-tag');
  if (oldPosTag) oldPosTag.remove();
  const oldSpacer = defEnglish.querySelector('.pos-spacer');
  if (oldSpacer) oldSpacer.remove();

  const x = Math.min(event.clientX, window.innerWidth - 360);
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
}

let _lookupToken = 0;

async function lookupWord(word, sentenceContext) {
  popupWord.textContent = word;
  const token = ++_lookupToken;
  const apiCall = window._stubCallOpenAI || ((msgs, onErr) => callOpenAI(msgs, onErr));
  const result = await apiCall([
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
  ], (errMsg) => {
    defLoading.textContent = 'Error: ' + errMsg;
  });

  if (token !== _lookupToken) return;
  defLoading.style.display = 'none';

  if (result) {
    const enMatch = result.match(/EN:\s*(.+)/);
    const cnMatch = result.match(/CN:\s*(.+)/);
    const pronMatch = result.match(/PRON:\s*(.+)/);

    if (enMatch) {
      const enRaw = enMatch[1].trim();
      const posMatch = enRaw.match(/^\(([^)]+)\)\s*/);
      const oldPosTag = defEnglish.querySelector('.pos-tag');
      if (oldPosTag) oldPosTag.remove();
      const oldSpacer = defEnglish.querySelector('.pos-spacer');
      if (oldSpacer) oldSpacer.remove();
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

  const query = searchInput.value.trim().toLowerCase();
  if (!query) return;

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
  selectionToolbar.style.left = Math.min(x - 40, window.innerWidth - 160) + 'px';
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
    notesList.innerHTML = '<p style="color:#999; font-size:13px; text-align:center; padding:20px; font-family:sans-serif;">No notes yet. Select text and click "Note" to add.</p>';
    return;
  }

  bookNotes.forEach((note) => {
    const realIndex = state.notes.indexOf(note);
    const el = document.createElement('div');
    el.className = 'note-item';
    el.innerHTML = `
      <div>${escapeHtml(note.text)}</div>
      <div style="font-size:11px;color:#999;margin-top:4px;">${escapeHtml(note.date)}</div>
      <button class="note-delete" data-index="${realIndex}">&times;</button>
    `;
    notesList.appendChild(el);
  });

  notesList.querySelectorAll('.note-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteNote(parseInt(btn.dataset.index)));
  });
}

function exportNotes() {
  const bookNotes = state.notes.filter(n => n.book === state.fileName);
  if (bookNotes.length === 0) return;

  const content = `# Reading Notes: ${state.fileName}\n\n` +
    bookNotes.map(n => `- ${n.text}\n  _(${n.date})_`).join('\n\n');

  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `notes-${state.fileName.replace(/\.[^.]+$/, '')}.md`;
  a.click();
  URL.revokeObjectURL(url);
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
    wordListEntries.innerHTML = '<p style="color:#999; font-size:13px; text-align:center; padding:20px; font-family:sans-serif;">No words queried yet.</p>';
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
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wordlist-${state.fileName.replace(/\.[^.]+$/, '')}.md`;
  a.click();
  URL.revokeObjectURL(url);
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
    historyList.innerHTML = '<p style="color:#999; font-size:13px; text-align:center; padding:20px; font-family:sans-serif;">No reading history yet.</p>';
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
    usage: 'Click a word in the text. A popup shows definitions. Click "Show Chinese Definition" for the Chinese meaning.'
  },
  {
    name: 'Sentence Translation',
    icon: '\ud83c\udf10',
    description: 'Translate any sentence to Chinese with one click or a two-finger tap.',
    usage: 'Right-click or two-finger tap a sentence. The sentence panel opens — click "Translate" or it auto-translates on gesture.'
  },
  {
    name: 'Paragraph Translation',
    icon: '\ud83d\udcc4',
    description: 'Translate an entire paragraph at once with a three-finger tap.',
    usage: 'Three-finger tap on any paragraph to open a popup showing the full paragraph and its Chinese translation.'
  },
  {
    name: 'Text-to-Speech',
    icon: '\ud83d\udd0a',
    description: 'Listen to any sentence read aloud with natural pronunciation.',
    usage: 'Open a sentence panel and click "Listen", or use a two-finger tap to auto-play pronunciation.'
  },
  {
    name: 'Search',
    icon: '\ud83d\udd0d',
    description: 'Search for any word or phrase across the entire book.',
    usage: 'Click the search icon in the top bar or press Ctrl+F. Type your query and use arrow buttons to navigate matches.'
  },
  {
    name: 'Bookmarks',
    icon: '\u2606',
    description: 'Bookmark your current reading position for quick access later.',
    usage: 'Click the star icon in the top bar to bookmark the current page. Click again to remove the bookmark.'
  },
  {
    name: 'Notes',
    icon: '\ud83d\udcdd',
    description: 'Highlight text and save personal notes while reading.',
    usage: 'Select text and click "Note" in the toolbar. View all notes by clicking the notes icon on the right side.'
  },
  {
    name: 'Word List',
    icon: 'Aa',
    description: 'Automatically records every word you look up with query count, definitions, pronunciation, and sentence context.',
    usage: 'Words are recorded automatically when you look them up. Click the "Aa" icon to view your word list. Export as Markdown.'
  },
  {
    name: 'Reading History',
    icon: '\ud83d\udd51',
    description: 'Automatically saves your reading position so you can resume where you left off.',
    usage: 'Click the clock icon to view your reading history. Click any entry to jump back to that position.'
  },
  {
    name: 'Page Themes',
    icon: '\ud83c\udfa8',
    description: 'Choose from four background colors (white, dark, sepia, green) for comfortable reading.',
    usage: 'Click a color swatch in the top bar to switch themes. Text and paragraph colors adjust automatically.'
  },
  {
    name: 'Font Size',
    icon: 'A',
    description: 'Adjust the reading font size for comfort.',
    usage: 'Click "A-" to decrease or "A+" to increase the font size in the top bar.'
  },
  {
    name: 'Content Width',
    icon: '\u2194',
    description: 'Adjust the content column width to your preferred reading width.',
    usage: 'Click the narrower/wider arrows in the top bar to adjust the content width.'
  },
  {
    name: 'Page Navigation',
    icon: '\ud83d\udcc3',
    description: 'Navigate between pages or jump directly to a specific page number.',
    usage: 'Use Previous/Next buttons, or click the page indicator at the bottom to type a page number and press Enter.'
  },
  {
    name: 'Auto-Hide Bars',
    icon: '\ud83d\udc41',
    description: 'Top and bottom bars hide automatically during reading to maximize screen space.',
    usage: 'Bars hide after 3 seconds of inactivity. Move mouse to the top or bottom edge of the screen to reveal them.'
  },
];

window.FEATURE_REGISTRY = FEATURE_REGISTRY;

const featureGuide = document.getElementById('featureGuide');
const featureGuideClose = document.getElementById('featureGuideClose');
const featureGuideBody = document.getElementById('featureGuideBody');
const helpBtn = document.getElementById('helpBtn');

function renderFeatureGuide() {
  featureGuideBody.innerHTML = '';
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
    card.querySelector('.guide-card-name').textContent = f.name;
    card.querySelector('.guide-card-desc').textContent = f.description;
    card.querySelector('.guide-card-usage').textContent = f.usage;
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

// Start auto-hide timer when entering reading mode
const origHandleFile = handleFile;
handleFile = async function(file) {
  await origHandleFile(file);
  startAutoHideTimer();
};

// Also start when DOMContentLoaded fires and reader is already active
document.addEventListener('DOMContentLoaded', () => {
  if (readerScreen.classList.contains('active')) {
    startAutoHideTimer();
    historyToggle.classList.add('visible');
    notesToggle.classList.add('visible');
    wordListToggle.classList.add('visible');
  }
});
