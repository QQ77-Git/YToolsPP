(() => {
  'use strict';

const DEFAULTS = { dualSubtitles: true, subtitleLanguage: 'zh-Hant', translatedSubtitleColor: '#ffe680', rgbSubtitleMode: 'off', rgbSubtitleAnimation: false, uiLanguage: 'system' };
const RGB_MODES = new Set(['off', 'rainbow', 'gradient', 'wave', 'wave-right', 'pulse']);
const CAPTION_SELECTION_CACHE_KEY = 'manualCaptionTrackSelectionCacheV1';
const MAX_SAVED_CAPTION_SELECTIONS = 100;
  let settings = { ...DEFAULTS };
  function publishSettings() {
    window.postMessage({
      source: 'YTools++-settings',
      type: 'bilingual-subtitles-settings',
      progressLabels: window.YouTubeToolkitProgressLocale?.get(settings.uiLanguage),
      ...settings,
    }, location.origin);
  }

  chrome.storage.sync.get({ ...DEFAULTS, rgbSubtitleMode: '__legacy__' }, values => {
    if (!chrome.runtime.lastError) {
      settings = { ...DEFAULTS, ...values };
      if (!RGB_MODES.has(values.rgbSubtitleMode)) settings.rgbSubtitleMode = values.rgbSubtitleAnimation === true ? 'rainbow' : 'off';
    }
    publishSettings();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' || (!changes.dualSubtitles && !changes.subtitleLanguage && !changes.translatedSubtitleColor && !changes.rgbSubtitleMode && !changes.rgbSubtitleAnimation && !changes.uiLanguage)) return;
    if (changes.dualSubtitles) settings.dualSubtitles = changes.dualSubtitles.newValue !== false;
    if (changes.subtitleLanguage) settings.subtitleLanguage = changes.subtitleLanguage.newValue || DEFAULTS.subtitleLanguage;
    if (changes.translatedSubtitleColor) settings.translatedSubtitleColor = changes.translatedSubtitleColor.newValue || DEFAULTS.translatedSubtitleColor;
    if (changes.rgbSubtitleMode) settings.rgbSubtitleMode = RGB_MODES.has(changes.rgbSubtitleMode.newValue) ? changes.rgbSubtitleMode.newValue : 'off';
    else if (changes.rgbSubtitleAnimation) settings.rgbSubtitleMode = changes.rgbSubtitleAnimation.newValue === true ? 'rainbow' : 'off';
    if (changes.uiLanguage) settings.uiLanguage = changes.uiLanguage.newValue || DEFAULTS.uiLanguage;
    publishSettings();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'subtitle-style-preview') {
      if (/^#[\da-fA-F]{6}$/.test(message.translatedSubtitleColor || '')) settings.translatedSubtitleColor = message.translatedSubtitleColor;
      if (RGB_MODES.has(message.rgbSubtitleMode)) settings.rgbSubtitleMode = message.rgbSubtitleMode;
      publishSettings();
      sendResponse({ ok: true });
      return;
    }
    if (message?.type !== 'subtitle-translation-progress'
      || !/^[\w-]{11}$/.test(message.videoId || '')
      || typeof message.requestId !== 'string'
    || !['started', 'progress', 'model', 'completed', 'failed', 'timed-out', 'missing-key'].includes(message.status)) return;
    window.postMessage({
      source: 'YTools++-settings',
      type: 'subtitle-translation-progress',
    requestId: message.requestId,
    videoId: message.videoId,
    targetLanguage: message.targetLanguage,
    sourceTrackId: message.sourceTrackId,
      completed: message.completed,
    total: message.total,
    status: message.status,
    model: typeof message.model === 'string' ? message.model : '',
    batch: Number.isInteger(message.batch) ? message.batch : 0,
    totalBatches: Number.isInteger(message.totalBatches) ? message.totalBatches : 0,
    reason: message.reason || '',
    apiStatus: Number.isInteger(message.apiStatus) ? message.apiStatus : 0,
    alignmentFailed: message.alignmentFailed === true,
  }, location.origin);
    sendResponse({ ok: true });
    return false;
  });

window.addEventListener('message', event => {
  const message = event.data;
  if (event.source !== window || event.origin !== location.origin || message?.source !== 'YTools++-settings') return;
  if (message.type === 'subtitle-track-selection-get'
    && /^[\w-]{11}$/.test(message.videoId || '') && typeof message.requestId === 'string') {
    chrome.storage.local.get({ [CAPTION_SELECTION_CACHE_KEY]: {} }, values => {
      const track = values[CAPTION_SELECTION_CACHE_KEY]?.[message.videoId]?.track || null;
      window.postMessage({ source: 'YTools++-settings', type: 'subtitle-track-selection-result', videoId: message.videoId, requestId: message.requestId, track }, location.origin);
    });
    return;
  }
  if (message.type === 'subtitle-track-selection-save'
    && /^[\w-]{11}$/.test(message.videoId || '') && typeof message.trackId === 'string'
    && message.trackId.length <= 200 && typeof message.requestId === 'string') {
    const track = {
      trackId: message.trackId,
      vssId: typeof message.vssId === 'string' ? message.vssId.slice(0, 100) : '',
      languageCode: typeof message.languageCode === 'string' ? message.languageCode.slice(0, 32) : '',
      kind: typeof message.kind === 'string' ? message.kind.slice(0, 32) : '',
      translationLanguage: typeof message.translationLanguage === 'string' ? message.translationLanguage.slice(0, 32) : '',
    };
    chrome.storage.local.get({ [CAPTION_SELECTION_CACHE_KEY]: {} }, values => {
      const entries = values[CAPTION_SELECTION_CACHE_KEY] && typeof values[CAPTION_SELECTION_CACHE_KEY] === 'object'
        ? values[CAPTION_SELECTION_CACHE_KEY]
        : {};
      entries[message.videoId] = { track, savedAt: Date.now() };
      const oldest = Object.entries(entries).sort((left, right) => (left[1]?.savedAt || 0) - (right[1]?.savedAt || 0));
      while (oldest.length > MAX_SAVED_CAPTION_SELECTIONS) delete entries[oldest.shift()[0]];
      chrome.storage.local.set({ [CAPTION_SELECTION_CACHE_KEY]: entries });
    });
    return;
  }
  if (message.type !== 'google-translate-transcript-request' || !/^[\w-]{11}$/.test(message.videoId || '')
      || typeof message.requestId !== 'string' || typeof message.sourceTrackId !== 'string'
      || message.sourceTrackId.length > 100 || !Array.isArray(message.cues) || message.cues.length < 1
      || message.cues.length > 5000) return;

    window.postMessage({
      source: 'YTools++-settings',
      type: 'subtitle-translation-progress',
    requestId: message.requestId,
    videoId: message.videoId,
    targetLanguage: message.targetLanguage,
    sourceTrackId: message.sourceTrackId,
    completed: 0,
      total: message.cues.length,
      status: 'started',
    }, location.origin);

    chrome.runtime.sendMessage({
      type: 'google-translate-transcript',
      requestId: message.requestId,
      videoId: message.videoId,
      targetLanguage: message.targetLanguage,
      sourceLanguage: typeof message.sourceLanguage === 'string' ? message.sourceLanguage : '',
      sourceTrackId: message.sourceTrackId,
      cues: message.cues,
    }, response => {
      const result = chrome.runtime.lastError
        ? { ok: false, cues: [], reason: 'background-unavailable' }
        : response;
      window.postMessage({
      source: 'YTools++-settings',
        type: 'subtitle-translation-progress',
    requestId: message.requestId,
    videoId: message.videoId,
    targetLanguage: message.targetLanguage,
    sourceTrackId: message.sourceTrackId,
    completed: result?.ok === true ? message.cues.length : 0,
        total: message.cues.length,
        status: result?.ok === true
          ? 'completed'
          : result?.reason === 'timeout'
            ? 'timed-out'
            : result?.reason === 'missing-api-key'
              ? 'missing-key'
              : 'failed',
        reason: result?.reason || '',
        apiStatus: Number.isInteger(result?.status) ? result.status : 0,
        alignmentFailed: result?.alignmentFailed === true,
      }, location.origin);
      window.postMessage({
      source: 'YTools++-settings',
        type: 'google-translate-transcript-result',
        requestId: message.requestId,
        videoId: message.videoId,
        targetLanguage: message.targetLanguage,
        sourceTrackId: message.sourceTrackId,
        ok: result?.ok === true,
        cues: Array.isArray(result?.cues) ? result.cues : [],
      }, location.origin);
    });
  });
})();
