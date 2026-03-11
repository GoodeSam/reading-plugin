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
      } else if (Object.prototype.hasOwnProperty.call(data, key)) {
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

  function saveTo(storage, payload, label) {
    return new Promise((resolve) => {
      storage.set(payload, () => {
        if (chrome.runtime.lastError) {
          console.error(`Failed to save ${label}:`, chrome.runtime.lastError.message);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  saveBtn.addEventListener('click', async () => {
    const results = await Promise.all([
      saveTo(chrome.storage.local, { translationProvider: providerSelect.value }, 'provider'),
      saveTo(keyStorage, { openaiApiKey: apiKeyInput.value.trim() }, 'API key'),
      saveTo(chrome.storage.local, { openaiModel: modelSelect.value }, 'model'),
    ]);

    if (results.every(Boolean)) {
      status.textContent = 'Settings saved!';
      status.style.color = '#10b981';
    } else {
      status.textContent = 'Some settings failed to save';
      status.style.color = '#ef4444';
    }
    status.style.display = 'block';
    setTimeout(() => status.style.display = 'none', STATUS_HIDE_MS);
  });

  openBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('reader.html') });
  });

  // Initialize visibility
  updateChatgptVisibility();
});
