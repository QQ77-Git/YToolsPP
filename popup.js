const defaults = {
  shorts: true,
  pausePrompt: true,
  theater: true,
  quality: 'auto',
  names: true,
  speedDisplay: true,
  sponsorBlock: true,
  adSkip: true,
  dualSubtitles: true,
  subtitleLanguage: 'zh-Hant',
  translatedSubtitleColor: '#ffe680',
  rgbSubtitleMode: '__legacy__',
  rgbSubtitleAnimation: false,
  subtitleTranslator: 'google',
  playerBackground: 'black',
  theme: 'auto',
  uiLanguage: 'system',
  qualitySpeedMigrationV2: false,
};
const featureKeys = ['shorts', 'pausePrompt', 'theater', 'quality', 'names', 'speedDisplay', 'sponsorBlock', 'adSkip', 'dualSubtitles'];
const status = document.getElementById('status');
const versionLabel = document.getElementById('versionLabel');
if (versionLabel) versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;
const themeSelect = document.getElementById('theme');
const languageSelect = document.getElementById('language');
const subtitleLanguageSelect = document.getElementById('subtitleLanguage');
const translatedSubtitleColorInput = document.getElementById('translatedSubtitleColor');
const resetTranslatedSubtitleColorButton = document.getElementById('resetTranslatedSubtitleColor');
const rgbSubtitleModeSelect = document.getElementById('rgbSubtitleMode');
const rgbSubtitleModes = new Set(['off', 'rainbow', 'gradient', 'wave', 'wave-right', 'pulse', 'wave-glow', 'wave-right-glow']);
const subtitleTranslatorSelect = document.getElementById('subtitleTranslator');
const geminiKeyRow = document.getElementById('geminiKeyRow');
const geminiApiKeyInput = document.getElementById('geminiApiKey');
const saveGeminiApiKeyButton = document.getElementById('saveGeminiApiKey');
const translationCacheSize = document.getElementById('translationCacheSize');
const clearTranslationCacheButton = document.getElementById('clearTranslationCache');
const playerBackgroundSelect = document.getElementById('playerBackground');
const preferencesToggle = document.getElementById('preferencesToggle');
const preferencesPanel = document.getElementById('preferencesPanel');
const preferencesClose = document.getElementById('preferencesClose');
let saveTimer = 0;
let subtitleStyleSaveTimer = 0;
let saveRevision = 0;

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && Object.hasOwn(changes, 'geminiTranslationBatchCacheV1')) {
    refreshTranslationCacheStats();
  }
});

function applyTheme(theme) {
  const resolved = theme === 'auto'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.dataset.theme = resolved;
}

chrome.storage.sync.get(defaults, settings => {
  if (chrome.runtime.lastError) {
    status.dataset.state = 'error';
    status.textContent = window.YouTubeToolkitLocale.text('loadFailed');
    return;
  }
  if (!settings.qualitySpeedMigrationV2) {
    const updates = { qualitySpeedMigrationV2: true };
    if (settings.quality === 'hd1080') updates.quality = settings.quality = 'auto';
    chrome.storage.sync.set(updates);
  }
  for (const key of featureKeys) {
    const field = document.getElementById(key);
    field[key === 'quality' ? 'value' : 'checked'] = settings[key];
  }
  themeSelect.value = settings.theme;
  languageSelect.value = settings.uiLanguage;
  subtitleLanguageSelect.value = settings.subtitleLanguage;
  translatedSubtitleColorInput.value = /^#[\da-fA-F]{6}$/.test(settings.translatedSubtitleColor || '') ? settings.translatedSubtitleColor : defaults.translatedSubtitleColor;
  rgbSubtitleModeSelect.value = rgbSubtitleModes.has(settings.rgbSubtitleMode)
    ? settings.rgbSubtitleMode
    : settings.rgbSubtitleAnimation === true ? 'rainbow' : 'off';
  subtitleTranslatorSelect.value = settings.subtitleTranslator || 'google';
  playerBackgroundSelect.value = settings.playerBackground || 'black';
  updateGeminiKeyVisibility();
  chrome.storage.local.get({ geminiApiKey: '' }, credentials => {
    if (!chrome.runtime.lastError) geminiApiKeyInput.value = credentials.geminiApiKey || '';
  });
  window.YouTubeToolkitLocale.setLanguage(settings.uiLanguage);
  refreshTranslationCacheStats();
  applyTheme(settings.theme);
});

themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));
languageSelect.addEventListener('change', () => {
  window.YouTubeToolkitLocale.setLanguage(languageSelect.value);
  refreshTranslationCacheStats();
});
document.querySelectorAll('.panel input:not(#geminiApiKey), .panel select, #theme, #language')
  .forEach(field => {
    if (field === translatedSubtitleColorInput || field === rgbSubtitleModeSelect) return;
    field.addEventListener('change', scheduleSave);
  });
translatedSubtitleColorInput.addEventListener('input', previewSubtitleStyle);
translatedSubtitleColorInput.addEventListener('change', scheduleSubtitleStyleSave);
rgbSubtitleModeSelect.addEventListener('change', () => {
  previewSubtitleStyle();
  scheduleSubtitleStyleSave();
});
subtitleTranslatorSelect.addEventListener('change', updateGeminiKeyVisibility);
saveGeminiApiKeyButton.addEventListener('click', saveGeminiApiKey);
clearTranslationCacheButton.addEventListener('click', clearTranslationCache);
resetTranslatedSubtitleColorButton.addEventListener('click', () => {
  translatedSubtitleColorInput.value = defaults.translatedSubtitleColor;
  previewSubtitleStyle();
  scheduleSubtitleStyleSave();
});
preferencesToggle.addEventListener('click', () => {
  if (preferencesPanel.open) {
    preferencesPanel.close();
  } else {
    preferencesPanel.showModal();
    preferencesToggle.setAttribute('aria-expanded', 'true');
  }
});
preferencesClose.addEventListener('click', () => preferencesPanel.close());
preferencesPanel.addEventListener('close', () => preferencesToggle.setAttribute('aria-expanded', 'false'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (themeSelect.value === 'auto') applyTheme('auto');
});

function updateGeminiKeyVisibility() {
  geminiKeyRow.hidden = subtitleTranslatorSelect.value !== 'gemini';
}

function scheduleSave() {
  window.clearTimeout(saveTimer);
  status.dataset.state = 'pending';
  status.textContent = window.YouTubeToolkitLocale.text('saving');
  saveTimer = window.setTimeout(saveSettings, 180);
}

function getSubtitleStyleSettings() {
  return {
    translatedSubtitleColor: /^#[\da-fA-F]{6}$/.test(translatedSubtitleColorInput.value)
      ? translatedSubtitleColorInput.value
      : defaults.translatedSubtitleColor,
    rgbSubtitleMode: rgbSubtitleModes.has(rgbSubtitleModeSelect.value) ? rgbSubtitleModeSelect.value : 'off',
  };
}

function previewSubtitleStyle() {
  const styleSettings = getSubtitleStyleSettings();
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, tabs => {
    if (chrome.runtime.lastError) return;
    const tabId = tabs[0]?.id;
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, { type: 'subtitle-style-preview', ...styleSettings }, () => {
      void chrome.runtime.lastError;
    });
  });
}

function scheduleSubtitleStyleSave() {
  window.clearTimeout(subtitleStyleSaveTimer);
  status.dataset.state = 'pending';
  status.textContent = window.YouTubeToolkitLocale.text('saving');
  subtitleStyleSaveTimer = window.setTimeout(() => {
    chrome.storage.sync.set(getSubtitleStyleSettings(), () => {
      if (chrome.runtime.lastError) {
        status.dataset.state = 'error';
        status.textContent = window.YouTubeToolkitLocale.text('saveFailed');
        return;
      }
      status.dataset.state = 'success';
      status.textContent = window.YouTubeToolkitLocale.text('saved');
    });
  }, 180);
}

function saveGeminiApiKey() {
  status.dataset.state = 'pending';
  status.textContent = window.YouTubeToolkitLocale.text('saving');
  chrome.storage.local.set({ geminiApiKey: geminiApiKeyInput.value.trim() }, () => {
    if (chrome.runtime.lastError) {
      status.dataset.state = 'error';
      status.textContent = window.YouTubeToolkitLocale.text('saveFailed');
      return;
    }
    status.dataset.state = 'success';
    status.textContent = window.YouTubeToolkitLocale.text('geminiApiKeySaved');
  });
}

function refreshTranslationCacheStats() {
  chrome.runtime.sendMessage({ type: 'gemini-translation-cache-stats' }, result => {
    if (chrome.runtime.lastError || !result?.ok) {
      translationCacheSize.textContent = window.YouTubeToolkitLocale.text('translationCacheUnavailable');
      clearTranslationCacheButton.disabled = true;
      return;
    }
    const size = result.bytes < 1024 ? `${result.bytes} B` : `${(result.bytes / 1024).toFixed(1)} KB`;
    const batches = window.YouTubeToolkitLocale.text('cacheBatches');
    const cues = window.YouTubeToolkitLocale.text('cacheCues');
    translationCacheSize.textContent = `${size} · ${result.batchCount} ${batches} / ${result.cueCount} ${cues}`;
    clearTranslationCacheButton.disabled = result.bytes === 0;
  });
}

function clearTranslationCache() {
  clearTranslationCacheButton.disabled = true;
  chrome.runtime.sendMessage({ type: 'gemini-translation-cache-clear' }, result => {
    const success = !chrome.runtime.lastError && result?.ok;
    status.dataset.state = success ? 'success' : 'error';
    status.textContent = window.YouTubeToolkitLocale.text(
      success ? 'translationCacheCleared' : 'translationCacheClearFailed',
    );
    refreshTranslationCacheStats();
  });
}

function saveSettings() {
  const revision = ++saveRevision;
  status.dataset.state = 'pending';
  const settings = Object.fromEntries(featureKeys.map(key => {
    const field = document.getElementById(key);
    return [key, key === 'quality' ? field.value : field.checked];
  }));
  settings.theme = themeSelect.value;
  settings.uiLanguage = languageSelect.value;
  settings.subtitleLanguage = subtitleLanguageSelect.value;
  settings.translatedSubtitleColor = /^#[\da-fA-F]{6}$/.test(translatedSubtitleColorInput.value) ? translatedSubtitleColorInput.value : defaults.translatedSubtitleColor;
  settings.rgbSubtitleMode = rgbSubtitleModeSelect.value;
  settings.subtitleTranslator = subtitleTranslatorSelect.value;
  settings.playerBackground = playerBackgroundSelect.value;

  chrome.storage.sync.set(settings, () => {
    if (revision !== saveRevision) return;
    if (chrome.runtime.lastError) {
      status.dataset.state = 'error';
      status.textContent = window.YouTubeToolkitLocale.text('saveFailed');
      return;
    }
    status.dataset.state = 'success';
    status.textContent = window.YouTubeToolkitLocale.text('saved');
  });
}
