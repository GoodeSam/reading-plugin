document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const modelSelect = document.getElementById('model');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');
  const openBtn = document.getElementById('openBtn');

  // Load saved settings (API key in session storage for security, model in local)
  const keyStorage = chrome.storage.session || chrome.storage.local;
  keyStorage.get(['openaiApiKey'], (data) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to load API key:', chrome.runtime.lastError.message);
    } else if (data.openaiApiKey) {
      apiKeyInput.value = data.openaiApiKey;
    }
  });
  chrome.storage.local.get(['openaiModel'], (data) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to load model:', chrome.runtime.lastError.message);
    } else if (data.openaiModel) {
      modelSelect.value = data.openaiModel;
    }
  });

  saveBtn.addEventListener('click', () => {
    const keyStore = chrome.storage.session || chrome.storage.local;
    keyStore.set({ openaiApiKey: apiKeyInput.value.trim() }, () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to save API key:', chrome.runtime.lastError.message);
      }
    });
    chrome.storage.local.set({ openaiModel: modelSelect.value }, () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to save model:', chrome.runtime.lastError.message);
        return;
      }
      status.style.display = 'block';
      setTimeout(() => status.style.display = 'none', 2000);
    });
  });

  openBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('reader.html') });
  });
});
