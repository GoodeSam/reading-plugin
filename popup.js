document.addEventListener('DOMContentLoaded', () => {
  const providerSelect = document.getElementById('provider');
  const chatgptSettings = document.getElementById('chatgptSettings');
  const apiKeyInput = document.getElementById('apiKey');
  const modelSelect = document.getElementById('model');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');
  const openBtn = document.getElementById('openBtn');

  if (!providerSelect || !apiKeyInput || !modelSelect || !saveBtn || !status || !openBtn) {
    console.error('Popup: required DOM elements missing');
    return;
  }

  const STATUS_HIDE_MS = 2000;
  const keyStorage = chrome.storage.session || chrome.storage.local;

  function getStorageValue(storage, key, onValue) {
    storage.get([key], (data) => {
      if (chrome.runtime.lastError) {
        console.error(`Failed to load ${key}:`, chrome.runtime.lastError.message);
      } else if (data[key]) {
        onValue(data[key]);
      }
    });
  }

  function updateChatgptVisibility() {
    if (chatgptSettings) {
      chatgptSettings.classList.toggle('hidden', providerSelect.value !== 'chatgpt');
    }
  }

  // Load saved settings
  getStorageValue(chrome.storage.local, 'translationProvider', (val) => {
    providerSelect.value = val;
    updateChatgptVisibility();
  });
  getStorageValue(keyStorage, 'openaiApiKey', (val) => { apiKeyInput.value = val; });
  getStorageValue(chrome.storage.local, 'openaiModel', (val) => { modelSelect.value = val; });

  providerSelect.addEventListener('change', updateChatgptVisibility);

  saveBtn.addEventListener('click', () => {
    let saveCount = 0;
    const totalSaves = 3;
    let saveError = false;

    function onSaved() {
      saveCount++;
      if (saveCount === totalSaves && !saveError) {
        status.style.display = 'block';
        setTimeout(() => status.style.display = 'none', STATUS_HIDE_MS);
      }
    }

    chrome.storage.local.set({ translationProvider: providerSelect.value }, () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to save provider:', chrome.runtime.lastError.message);
        saveError = true;
      }
      onSaved();
    });
    keyStorage.set({ openaiApiKey: apiKeyInput.value.trim() }, () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to save API key:', chrome.runtime.lastError.message);
        saveError = true;
      }
      onSaved();
    });
    chrome.storage.local.set({ openaiModel: modelSelect.value }, () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to save model:', chrome.runtime.lastError.message);
        saveError = true;
      }
      onSaved();
    });
  });

  openBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('reader.html') });
  });

  // Initialize visibility
  updateChatgptVisibility();
});
