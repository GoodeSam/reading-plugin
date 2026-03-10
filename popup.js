document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const modelSelect = document.getElementById('model');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');
  const openBtn = document.getElementById('openBtn');

  // Load saved settings
  chrome.storage.local.get(['openaiApiKey', 'openaiModel'], (data) => {
    if (data.openaiApiKey) apiKeyInput.value = data.openaiApiKey;
    if (data.openaiModel) modelSelect.value = data.openaiModel;
  });

  saveBtn.addEventListener('click', () => {
    chrome.storage.local.set({
      openaiApiKey: apiKeyInput.value.trim(),
      openaiModel: modelSelect.value
    }, () => {
      status.style.display = 'block';
      setTimeout(() => status.style.display = 'none', 2000);
    });
  });

  openBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('reader.html') });
  });
});
