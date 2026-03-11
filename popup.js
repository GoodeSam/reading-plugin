document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const modelSelect = document.getElementById('model');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');
  const openBtn = document.getElementById('openBtn');

  if (!apiKeyInput || !modelSelect || !saveBtn || !status || !openBtn) {
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

  // Load saved settings
  getStorageValue(keyStorage, 'openaiApiKey', (val) => { apiKeyInput.value = val; });
  getStorageValue(chrome.storage.local, 'openaiModel', (val) => { modelSelect.value = val; });

  saveBtn.addEventListener('click', () => {
    let saveCount = 0;
    let saveError = false;

    function onSaved() {
      saveCount++;
      if (saveCount === 2 && !saveError) {
        status.style.display = 'block';
        setTimeout(() => status.style.display = 'none', STATUS_HIDE_MS);
      }
    }

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
});
