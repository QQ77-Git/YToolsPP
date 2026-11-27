function limitTranslatedCommas(translatedText, sourceText) {
  let result = translatedText;
  const allowed = (sourceText.match(/[,，、､]/gu) || []).length;
  const commas = [...result.matchAll(/[,，、､]/gu)];
  for (let index = commas.length - 1; index >= allowed; index--) {
    const position = commas[index].index;
    result = result.slice(0, position) + result.slice(position + 1);
  }
  return result;
}

const GEMINI_BATCH_CACHE_KEY = 'geminiTranslationBatchCacheV1';
const GEMINI_BATCH_CACHE_MAX_BYTES = 2 * 1024 * 1024;
const GEMINI_BATCH_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const GEMINI_CACHE_OPERATION_TIMEOUT_MS = 1500;
const GOOGLE_TRANSLATION_TIMEOUT_MS = 30_000;
const GEMINI_TRANSLATION_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];
let geminiBatchCacheWriteQueue = Promise.resolve();
let geminiBatchCacheGeneration = 0;

function shouldFallbackGeminiModel(result) {
  if (result.reason === 'timeout' || result.reason === 'network-error') return true;
  return [404, 408, 425, 429, 500, 502, 503, 504].includes(result.status);
}

function getGeminiRetryDelayMs(retryIndex) {
  const baseDelayMs = 1000;
  const maxDelayMs = 8000;
  return Math.min(maxDelayMs, baseDelayMs * (2 ** retryIndex))
    + Math.floor(Math.random() * baseDelayMs);
}

function withTimeout(promise, timeoutMs, errorMessage) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function getStoredGeminiBatchCache() {
  const operation = new Promise((resolve, reject) => {
    chrome.storage.local.get(GEMINI_BATCH_CACHE_KEY, result => {
      if (chrome.runtime.lastError) reject(new Error('cache-read-failed'));
      else resolve(result[GEMINI_BATCH_CACHE_KEY] || { entries: {} });
    });
  });
  return withTimeout(operation, GEMINI_CACHE_OPERATION_TIMEOUT_MS, 'cache-read-timeout');
}

function writeStoredGeminiBatchCache(cache) {
  const operation = new Promise((resolve, reject) => {
    chrome.storage.local.set({ [GEMINI_BATCH_CACHE_KEY]: cache }, () => {
      if (chrome.runtime.lastError) reject(new Error('cache-write-failed'));
      else resolve();
    });
  });
  return withTimeout(operation, GEMINI_CACHE_OPERATION_TIMEOUT_MS, 'cache-write-timeout');
}

function enqueueGeminiBatchCacheWrite(operation) {
  const result = geminiBatchCacheWriteQueue.then(operation, operation);
  geminiBatchCacheWriteQueue = result.catch(() => {});
  return result;
}

async function createGeminiBatchCacheKey({ model, videoId, sourceTrackId, sourceLanguage, targetLanguage, start, contextBefore, batchCues, contextAfter }) {
  const data = JSON.stringify({ model, videoId, sourceTrackId, sourceLanguage, targetLanguage, start, contextBefore, batchCues, contextAfter });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readGeminiBatchCacheEntry(key) {
  try {
    const cache = await getStoredGeminiBatchCache();
    const entry = cache.entries?.[key];
    return entry && Date.now() - entry.savedAt <= GEMINI_BATCH_CACHE_MAX_AGE_MS ? entry : null;
  } catch {
    return null;
  }
}

async function saveGeminiBatchCacheEntry(key, translations, generation) {
  return enqueueGeminiBatchCacheWrite(async () => {
    if (generation !== geminiBatchCacheGeneration) return false;
    let cache;
    try {
      cache = await getStoredGeminiBatchCache();
    } catch {
      cache = { entries: {} };
    }
    const entries = { ...(cache.entries || {}) };
    entries[key] = {
      savedAt: Date.now(),
      translations: [...translations].map(([index, text]) => ({ index, text })),
    };

    const now = Date.now();
    for (const [entryKey, entry] of Object.entries(entries)) {
      if (!Number.isFinite(entry.savedAt) || now - entry.savedAt > GEMINI_BATCH_CACHE_MAX_AGE_MS) delete entries[entryKey];
    }
    const getSize = () => new TextEncoder().encode(JSON.stringify(entries)).byteLength;
    while (getSize() > GEMINI_BATCH_CACHE_MAX_BYTES) {
      const oldestKey = Object.keys(entries).filter(entryKey => entryKey !== key)
        .sort((left, right) => entries[left].savedAt - entries[right].savedAt)[0];
      if (!oldestKey) return false;
      delete entries[oldestKey];
    }

    try {
      await writeStoredGeminiBatchCache({ entries });
      return true;
    } catch {
      return false;
    }
  });
}

function getGeminiBatchCacheStats() {
  return Promise.all([
    getStoredGeminiBatchCache(),
    new Promise((resolve, reject) => {
      chrome.storage.local.getBytesInUse(GEMINI_BATCH_CACHE_KEY, bytes => {
        if (chrome.runtime.lastError) reject(new Error('cache-size-failed'));
        else resolve(bytes);
      });
    }),
  ]).then(([cache, bytes]) => {
    const entries = Object.values(cache.entries || {});
    return {
      ok: true,
      bytes,
      batchCount: entries.length,
      cueCount: entries.reduce((sum, entry) => sum + (Array.isArray(entry.translations) ? entry.translations.length : 0), 0),
    };
  });
}

function clearGeminiBatchCache() {
  geminiBatchCacheGeneration++;
  return enqueueGeminiBatchCacheWrite(() => new Promise((resolve, reject) => {
    chrome.storage.local.remove(GEMINI_BATCH_CACHE_KEY, () => {
      if (chrome.runtime.lastError) reject(new Error('cache-clear-failed'));
      else resolve();
    });
  }));
}

async function translateGoogleTranscript(message, senderUrl) {
  const targetLanguages = { 'zh-Hant': 'zh-TW', 'zh-Hans': 'zh-CN', en: 'en', ja: 'ja', ko: 'ko', es: 'es', fr: 'fr', de: 'de', pt: 'pt', ru: 'ru', ar: 'ar', hi: 'hi', it: 'it', th: 'th', vi: 'vi' };
  if (!/^https:\/\/(www|m)\.youtube\.com\//.test(senderUrl)
    || !/^[\w-]{11}$/.test(message.videoId || '')
    || !targetLanguages[message.targetLanguage]
    || !Array.isArray(message.cues) || message.cues.length < 1 || message.cues.length > 5000) {
    return { ok: false };
  }

  const cues = message.cues;
  if (cues.some(cue => !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.end <= cue.start
    || typeof cue.text !== 'string' || !cue.text.trim() || cue.text.length > 2000)) return { ok: false };

  const markers = cues.map((_, index) => `ZXQCUE${index}QZX`);
  const input = cues.map((cue, index) => `${markers[index]} ${cue.text}`).join('\n');
  if (input.length > 80000) return { ok: false, tooLong: true };
  const endpoint = new URL('https://translate.googleapis.com/translate_a/single');
  endpoint.search = new URLSearchParams({
    client: 'gtx', sl: 'auto', tl: targetLanguages[message.targetLanguage], dt: 't', ie: 'UTF-8', oe: 'UTF-8',
  }).toString();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GOOGLE_TRANSLATION_TIMEOUT_MS);
  let result;
  try {
    let response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8', Accept: 'application/json' },
      body: new URLSearchParams({ q: input }),
      signal: controller.signal,
    });
    if (!response.ok && input.length <= 6000) {
      const fallbackEndpoint = new URL(endpoint);
      fallbackEndpoint.searchParams.set('q', input);
      response = await fetch(fallbackEndpoint, { headers: { Accept: 'application/json' }, signal: controller.signal });
    }
    if (!response.ok) return { ok: false, status: response.status };
    result = await response.json();
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network-error' };
  } finally {
    clearTimeout(timeoutId);
  }
  const translated = Array.isArray(result?.[0])
    ? result[0].map(segment => Array.isArray(segment) ? segment[0] || '' : '').join('')
    : '';
  if (!translated) return { ok: false };

  const markerMatches = [...translated.matchAll(/ZXQCUE(\d+)QZX/gu)];
  if (!markerMatches.length) return { ok: false, alignmentFailed: true };
  const markerIndices = markerMatches.map(match => Number(match[1]));
  const markersInOrder = markerIndices.every((index, position) => position === 0 || index > markerIndices[position - 1]);
  const translatedCues = [];
  const leadingText = translated.slice(0, markerMatches[0].index).trim();
  if (leadingText && markersInOrder && markerIndices[0] > 0) {
  const sourceText = cues.slice(0, markerIndices[0]).map(cue => cue.text).join(' ');
  const displayText = /[.!?。！？…][”’"')\]]*$/u.test(sourceText.trim())
    ? leadingText
    : leadingText.replace(/[\s.!?。！？…]+$/u, '').trim();
  const punctuationLimitedText = limitTranslatedCommas(displayText, sourceText);
  if (punctuationLimitedText) translatedCues.push({ start: cues[0].start, end: cues[markerIndices[0] - 1].end, text: punctuationLimitedText });
  }

  for (let position = 0; position < markerMatches.length; position++) {
    const match = markerMatches[position];
    const cueIndex = markerIndices[position];
    if (cueIndex < 0 || cueIndex >= cues.length) continue;
    const next = markerMatches[position + 1];
    const text = translated.slice(match.index + match[0].length, next?.index ?? translated.length).trim();
    if (!text) continue;

    let startIndex = cueIndex;
    let endIndex = cueIndex;
    if (markersInOrder) {
      startIndex = cueIndex;
      endIndex = next ? Math.max(cueIndex, markerIndices[position + 1] - 1) : cues.length - 1;
    } else {
      startIndex = cueIndex;
      endIndex = cueIndex;
    }
    const sourceText = cues.slice(startIndex, endIndex + 1).map(cue => cue.text).join(' ');
    const sourceHasTerminalPunctuation = /[.!?。！？…][”’"')\]]*$/u.test(sourceText.trim());
    const displayText = sourceHasTerminalPunctuation
      ? text
      : text.replace(/[\s.!?。！？…]+$/u, '').trim();
    const punctuationLimitedText = limitTranslatedCommas(displayText, sourceText);
    if (!punctuationLimitedText) continue;
    translatedCues.push({ start: cues[startIndex].start, end: cues[endIndex].end, text: punctuationLimitedText });
  }
  if (!translatedCues.length) return { ok: false, alignmentFailed: true };
  translatedCues.sort((left, right) => left.start - right.start);
  return { ok: true, cues: translatedCues };
}

function sanitizeGeminiTranslation(text, sourceText) {
  let result = String(text || '').trim();
  const sourceHasTerminalPunctuation = /[.!?。！？…][”’"')\]]*$/u.test(sourceText.trim());
  if (!sourceHasTerminalPunctuation) result = result.replace(/[\s.!?。！？…]+$/u, '').trim();
  return limitTranslatedCommas(result, sourceText);
}

async function translateGeminiTranscript(message, senderUrl, apiKey, reportProgress = () => {}) {
  const targetLanguages = {
    'zh-Hant': 'Traditional Chinese (Taiwan)', 'zh-Hans': 'Simplified Chinese', en: 'English', ja: 'Japanese',
    ko: 'Korean', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', ru: 'Russian',
    ar: 'Arabic', hi: 'Hindi', it: 'Italian', th: 'Thai', vi: 'Vietnamese',
  };
  if (!/^https:\/\/(www|m)\.youtube\.com\//.test(senderUrl)
    || !/^[\w-]{11}$/.test(message.videoId || '')
    || !targetLanguages[message.targetLanguage]
    || !Array.isArray(message.cues) || message.cues.length < 1 || message.cues.length > 5000
    || typeof apiKey !== 'string' || !apiKey.trim()) return { ok: false, reason: 'missing-api-key' };

  const cues = message.cues;
  if (cues.some(cue => !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.end <= cue.start
    || typeof cue.text !== 'string' || !cue.text.trim() || cue.text.length > 2000)) return { ok: false };

  const cacheModel = GEMINI_TRANSLATION_MODELS.join('|');
  const batchTimeoutMs = 15_000;
  const batchSize = 40;
  const contextSize = 2;
  const maxConcurrentBatches = 1;
  const translatedByIndex = new Map();
  const batchTimings = [];
  const cacheGeneration = geminiBatchCacheGeneration;
  let completedCues = 0;
  reportProgress({ completed: 0, total: cues.length, status: 'started' });

  const batchStarts = [];
  for (let start = 0; start < cues.length; start += batchSize) batchStarts.push(start);

  async function translateBatch(start) {
    const end = Math.min(cues.length, start + batchSize);
    const batchNumber = Math.floor(start / batchSize) + 1;
    const startedAt = performance.now();
    let batchStatus = 'failed';
    let controller = null;
    let timeoutId = 0;
    let selectedModel = '';
    console.info('[YTools++] Gemini batch started', {
      batch: batchNumber,
      totalBatches: batchStarts.length,
      cueCount: end - start,
    });
    try {
    const contextBefore = cues.slice(Math.max(0, start - contextSize), start).map(cue => cue.text);
    const batchCues = cues.slice(start, end).map((cue, offset) => ({ index: start + offset, text: cue.text }));
    const contextAfter = cues.slice(end, Math.min(cues.length, end + contextSize)).map(cue => cue.text);
    let cacheKey = '';
    try {
      cacheKey = await createGeminiBatchCacheKey({
        model: cacheModel,
        videoId: message.videoId,
        sourceTrackId: message.sourceTrackId,
        sourceLanguage: message.sourceLanguage || '',
        targetLanguage: message.targetLanguage,
        start,
        contextBefore,
        batchCues,
        contextAfter,
      });
    } catch {}

    if (cacheKey) {
      const cached = await readGeminiBatchCacheEntry(cacheKey);
      if (Array.isArray(cached?.translations)) {
        const cachedTranslations = new Map(cached.translations.map(item => [item.index, item.text]));
        const isComplete = cachedTranslations.size === end - start
          && Array.from({ length: end - start }, (_, offset) => start + offset)
            .every(index => typeof cachedTranslations.get(index) === 'string' && cachedTranslations.get(index).trim());
        if (isComplete) {
          batchStatus = 'cached';
          return { ok: true, translations: cachedTranslations, cached: true };
        }
      }
    }

    const promptData = {
      task: `Translate every natural-language segment of each caption cue into ${targetLanguages[message.targetLanguage]}.`,
      sourceLanguage: message.sourceLanguage || 'Detect from the cues',
      contextBefore,
      cues: batchCues,
      contextAfter,
      rules: [
        'Use surrounding cues only to understand meaning; do not include context cues in a translation.',
        'Return exactly one translation for every cue index in cues, without merging or reordering cues.',
        'Translate all natural-language segments, including English mixed into Japanese; do not leave source-language phrases untranslated unless they are proper names.',
        'Do not add punctuation that is not present in the corresponding source cue. In particular, do not add commas.',
        'Translate naturally and preserve the original meaning; do not invent missing lyric words.',
      ],
    };

    let response = null;
    let modelFailure = null;
    for (let modelIndex = 0; modelIndex < GEMINI_TRANSLATION_MODELS.length; modelIndex++) {
      const model = GEMINI_TRANSLATION_MODELS[modelIndex];
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      reportProgress({
        completed: completedCues,
        total: cues.length,
        status: 'model',
        model,
        batch: batchNumber,
        totalBatches: batchStarts.length,
      });
      controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), batchTimeoutMs);
      response = null;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: JSON.stringify(promptData) }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  translations: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: { index: { type: 'INTEGER' }, text: { type: 'STRING' } },
                      required: ['index', 'text'],
                    },
                  },
                },
                required: ['translations'],
              },
            },
          }),
        });
      } catch {
        modelFailure = { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network-error' };
      } finally {
        clearTimeout(timeoutId);
        timeoutId = 0;
      }

      if (response?.ok) {
        selectedModel = model;
        modelFailure = null;
        break;
      }
      if (response) modelFailure = { ok: false, status: response.status, reason: 'gemini-api-error' };
      if (!modelFailure) modelFailure = { ok: false, reason: 'network-error' };
      const hasNextModel = modelIndex + 1 < GEMINI_TRANSLATION_MODELS.length;
      if (!hasNextModel || !shouldFallbackGeminiModel(modelFailure)) return modelFailure;
      const fallbackDelayMs = getGeminiRetryDelayMs(modelIndex);
      console.warn('[YTools++] Gemini model fallback', {
        batch: batchNumber,
        fromModel: model,
        toModel: GEMINI_TRANSLATION_MODELS[modelIndex + 1],
        status: modelFailure.status || 0,
        reason: modelFailure.reason || '',
        waitMs: fallbackDelayMs,
      });
      await new Promise(resolve => setTimeout(resolve, fallbackDelayMs));
    }
    if (!response?.ok) return modelFailure || { ok: false, reason: 'gemini-api-error' };

    let result;
    try {
      const data = await response.json();
      const output = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
      result = JSON.parse(output);
    } catch {
      return controller.signal.aborted
        ? { ok: false, reason: 'timeout' }
        : { ok: false, alignmentFailed: true };
    }
    if (!Array.isArray(result?.translations)) return { ok: false, alignmentFailed: true };

    const batchTranslations = new Map();
    for (const item of result.translations) {
      if (!Number.isInteger(item?.index) || item.index < start || item.index >= end
        || typeof item.text !== 'string' || !item.text.trim() || batchTranslations.has(item.index)) {
        return { ok: false, alignmentFailed: true };
      }
      batchTranslations.set(item.index, item.text.trim());
    }
    for (let index = start; index < end; index++) {
      if (!batchTranslations.has(index)) return { ok: false, alignmentFailed: true };
    }
    if (cacheKey) saveGeminiBatchCacheEntry(cacheKey, batchTranslations, cacheGeneration).catch(() => {});
    batchStatus = 'completed';
    console.info('[YTools++] Gemini model selected', { batch: batchNumber, model: selectedModel });
    return { ok: true, translations: batchTranslations };
    } finally {
      clearTimeout(timeoutId);
      const durationMs = Math.round(performance.now() - startedAt);
      batchTimings.push({ durationMs, status: batchStatus });
      console.info('[YTools++] Gemini batch timing', {
        batch: batchNumber,
        totalBatches: batchStarts.length,
        cueCount: end - start,
        status: batchStatus,
        durationMs,
      });
    }
  }

  function reportTimingSummary() {
    const completedTimings = batchTimings.filter(timing => timing.status === 'completed');
    const cachedBatches = batchTimings.filter(timing => timing.status === 'cached').length;
    const averageMs = completedTimings.length
      ? Math.round(completedTimings.reduce((sum, timing) => sum + timing.durationMs, 0) / completedTimings.length)
      : null;
    console.info('[YTools++] Gemini batch timing summary', {
      completedBatches: completedTimings.length,
      cachedBatches,
      totalBatches: batchStarts.length,
      averageMs,
    });
  }

  for (let offset = 0; offset < batchStarts.length; offset += maxConcurrentBatches) {
    const batchResults = await Promise.all(
      batchStarts.slice(offset, offset + maxConcurrentBatches).map(async start => {
        const result = await translateBatch(start);
        if (!result.ok) return result;
        for (const [index, text] of result.translations) translatedByIndex.set(index, text);
        completedCues += result.translations.size;
        reportProgress({ completed: completedCues, total: cues.length, status: 'progress' });
        return result;
      }),
    );
    const failedBatch = batchResults.find(result => !result.ok);
    if (failedBatch) {
      reportTimingSummary();
      reportProgress({
        completed: completedCues,
        total: cues.length,
      status: failedBatch.reason === 'timeout' ? 'timed-out' : 'failed',
      reason: failedBatch.reason || '',
      apiStatus: Number.isInteger(failedBatch.status) ? failedBatch.status : 0,
      alignmentFailed: failedBatch.alignmentFailed === true,
    });
      return failedBatch;
    }
  }

  reportTimingSummary();
  return {
    ok: true,
    cues: cues.map((cue, index) => ({
      start: cue.start,
      end: cue.end,
      text: sanitizeGeminiTranslation(translatedByIndex.get(index), cue.text),
    })),
  };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ quality: 'hd1080', qualitySpeedMigrationV2: false }, settings => {
    if (chrome.runtime.lastError || settings.qualitySpeedMigrationV2) return;
    const updates = { qualitySpeedMigrationV2: true };
    if (settings.quality === 'hd1080') updates.quality = 'auto';
    chrome.storage.sync.set(updates);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'gemini-translation-cache-stats' || message?.type === 'gemini-translation-cache-clear') {
    const extensionOrigin = chrome.runtime.getURL('');
    if (!(_sender.url || '').startsWith(extensionOrigin)) {
      sendResponse({ ok: false });
      return false;
    }
    if (message.type === 'gemini-translation-cache-stats') {
      getGeminiBatchCacheStats().then(sendResponse).catch(() => sendResponse({ ok: false }));
      return true;
    }
    clearGeminiBatchCache()
      .then(getGeminiBatchCacheStats)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === 'get-settings') {
    const defaults = {
      shorts: true, pausePrompt: true, theater: true, quality: 'auto', names: true,
      speedDisplay: true, adSkip: true, dualSubtitles: true, subtitleLanguage: 'zh-Hant',
      subtitleTranslator: 'google', translatedSubtitleColor: '#ffe680', rgbSubtitleMode: 'off', rgbSubtitleAnimation: false, playerBackground: 'black', qualitySpeedMigrationV2: false,
    };
    chrome.storage.sync.get(defaults, settings => {
      if (chrome.runtime.lastError) {
        sendResponse(settings);
        return;
      }
      if (settings.qualitySpeedMigrationV2) {
        delete settings.qualitySpeedMigrationV2;
        sendResponse(settings);
        return;
      }
      const updates = { qualitySpeedMigrationV2: true };
      if (settings.quality === 'hd1080') updates.quality = settings.quality = 'auto';
      chrome.storage.sync.set(updates, () => {
        delete settings.qualitySpeedMigrationV2;
        sendResponse(settings);
      });
    });
    return true;
  }

  if (message?.type === 'google-translate-transcript') {
    const senderUrl = _sender.url || _sender.tab?.url || '';
    const reportProgress = progress => {
      const tabId = _sender.tab?.id;
      if (!Number.isInteger(tabId)) return;
      chrome.tabs.sendMessage(tabId, {
        type: 'subtitle-translation-progress',
  requestId: message.requestId,
  videoId: message.videoId,
  targetLanguage: message.targetLanguage,
  ...progress,
  sourceTrackId: message.sourceTrackId,
}, Number.isInteger(_sender.frameId) ? { frameId: _sender.frameId } : {},
      () => void chrome.runtime.lastError);
    };
    chrome.storage.sync.get({ subtitleTranslator: 'google' }, settings => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false });
        return;
      }
      if (settings.subtitleTranslator !== 'gemini') {
        translateGoogleTranscript(message, senderUrl)
          .then(sendResponse)
          .catch(() => sendResponse({ ok: false }));
        return;
      }
      chrome.storage.local.get({ geminiApiKey: '' }, credentials => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, reason: 'key-storage-error' });
          return;
        }
        translateGeminiTranscript(message, senderUrl, credentials.geminiApiKey, reportProgress)
          .then(sendResponse)
          .catch(() => sendResponse({ ok: false }));
      });
    });
    return true;
  }

  if (message?.type === 'sponsorblock-get-segments') {
    const videoId = message.videoId;
    const senderUrl = _sender.url || _sender.tab?.url || '';
    if (!/^https:\/\/(www|m)\.youtube\.com\//.test(senderUrl) || !/^[\w-]{11}$/.test(videoId || '')) {
      sendResponse({ ok: false, segments: [] });
      return false;
    }

    const categories = ['sponsor', 'intro', 'outro', 'selfpromo', 'interaction'];
    const params = new URLSearchParams({
      videoID: videoId,
      categories: JSON.stringify(categories),
      actionTypes: JSON.stringify(['skip']),
    });
    fetch(`https://sponsor.ajay.app/api/skipSegments?${params}`)
      .then(async response => {
        if (response.status === 404) return { ok: true, segments: [] };
        if (!response.ok) throw new Error(`SponsorBlock returned ${response.status}`);
        const data = await response.json();
        const segments = Array.isArray(data) ? data.filter(item =>
          Array.isArray(item?.segment) && item.segment.length === 2 &&
          Number.isFinite(item.segment[0]) && Number.isFinite(item.segment[1]) &&
          item.segment[1] > item.segment[0] && (!item.actionType || item.actionType === 'skip')
        ) : [];
        return { ok: true, segments };
      })
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, segments: [] }));
    return true;
  }
});
