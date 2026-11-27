(() => {
  'use strict';

const SETTINGS_SOURCE = 'YTools++-settings';
const MAX_CUE_CACHE = 8;
const TRANSLATION_IDLE_TIMEOUT_MS = 45_000;
const CAPTION_DEBUG_ENABLED = () => window.__YT_TOOLKIT_CAPTION_DEBUG__ === true;
const RGB_MODES = new Set(['off', 'rainbow', 'gradient', 'wave', 'wave-right', 'pulse']);
  const pageFetch = window.fetch.bind(window);
  let settings = { enabled: true, language: 'zh-Hant', googleTranslateEnabled: false };
  let captionsDefaultedVideoId = '';
  let captionReloadRetryVideoId = '';
  let captionReloadRetryTimer = 0;
  let currentVideoId = '';
  let currentAudioTrackId = '';
  let currentCaptionTrackId = '';
  let translationGeneration = 0;
  const translationRequestGenerations = new Map();
  let savedCaptionSelection = null;
  let manualCaptionTrackVideoId = '';
  let manualCaptionTrackId = '';
  let manualCaptionTrack = null;
  let captionSelectionRequestId = '';
  let captionSelectionRequestSequence = 0;
  let captionSelectionRequestTimer = 0;
  let captionSelectionRequestAttempts = 0;
  let programmaticCaptionTrackId = '';
  let programmaticCaptionTrackTimer = 0;
let sourceCaptionLanguage = '';
let completeSourceTranscript = null;
let fallbackSourceTrackId = '';
let sourceSelectionUnconfirmed = false;
let sourceSelectionInferred = false;
  let player = null;
  let video = null;
  let cues = { source: [], translated: [] };
  let rawTranslatedCues = [];
let overlay = null;
let sourceLine = null;
let sourceStatus = null;
let translatedLine = null;
let translatedText = null;
  let progressElement = null;
  let progressLabel = null;
  let progressFill = null;
  let progressValue = null;
  let progressState = null;
let activeTranslationRequestId = '';
let progressHideTimer = 0;
let progressWatchdogTimer = 0;
const terminalTranslationRequestIds = new Set();
  let currentKey = '';
  let cache = new Map();
  const translationCache = new Map();
  const autoTranslationAttempts = new Map();
  let autoTranslationInFlight = false;
const googleTranslationAttempts = new Set();
const fullTranscriptAttempts = new Set();
const directTrackAttempts = new Set();
const progressiveTranscriptTrackKeys = new Set();
const translationRequestModes = new Map();
const translationRequestSourceRanges = new Map();
const translationRequestTrackIds = new Map();
const translatedSourceRanges = new Map();
const unmatchedCaptionResponses = new Map();
const observedCaptionCues = new Map();
let pendingProgressiveSourceTrackId = '';
let pendingProgressiveCues = [];
const translationSnapshots = new Map();
const translationRetryCounts = new Map();
const MAX_TRANSLATION_RETRIES = 3;
let translationRequestSequence = 0;
let googleTranslationTimer = 0;
let activeTranslationRequestKey = '';
let sourceTranscriptFetch = null;
let watchingVideo = false;
let captionTrackPollTimer = 0;

window.addEventListener('resize', () => {
  if (progressElement && !progressElement.hidden) positionProgressToast();
}, { passive: true });

  function getVideoId() {
    const id = new URLSearchParams(location.search).get('v') || location.pathname.match(/^\/shorts\/([\w-]{11})/)?.[1];
    return /^[\w-]{11}$/.test(id || '') ? id : '';
  }

function getCaptionTracks() {
    const response = window.ytInitialPlayerResponse;
    const raw = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (Array.isArray(raw)) return raw;
    try {
      const playerResponse = window.ytplayer?.config?.args?.player_response;
      return JSON.parse(playerResponse)?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  } catch { return []; }
}

function getActiveAudioTrack(targetPlayer = player) {
  try { return targetPlayer?.getAudioTrack?.() || null; } catch { return null; }
}

function getActiveAudioTrackId(audioTrack = getActiveAudioTrack()) {
  return audioTrack?.Yb?.id || audioTrack?.audioTrackId || '';
}

function getAudioTrackLanguage(audioTrack, response = window.ytInitialPlayerResponse) {
  const declaredLanguage = audioTrack?.Yb?.languageCode || audioTrack?.languageCode || audioTrack?.language;
  if (declaredLanguage) return declaredLanguage;

  const audioTrackId = String(audioTrack?.Yb?.id || audioTrack?.audioTrackId || '');
  const languageFromId = audioTrackId.match(/^([a-z]{2,3}(?:-[a-z0-9]{2,8})*)\.\d+$/i)?.[1];
  return languageFromId || response?.videoDetails?.language || '';
}

function getAudioAssociatedCaptionTracks(activeAudioTrack, audioTrack, tracks) {
  const liveCaptionTracks = activeAudioTrack?.captionTracks;
  if (Array.isArray(liveCaptionTracks) && liveCaptionTracks.length) {
    const resolvedTracks = liveCaptionTracks.map(candidate => {
      const candidateId = candidate?.vssId || candidate?.vss_id;
      return (candidateId && tracks.find(track => (track.vssId || track.vss_id) === candidateId))
        || tracks.find(track => languageMatches(track.languageCode, candidate?.languageCode)
          && (!candidate.kind || track.kind === candidate.kind))
        || tracks.find(track => languageMatches(track.languageCode, candidate?.languageCode));
    }).filter(Boolean);
    if (resolvedTracks.length) return resolvedTracks;
  }

  const indices = audioTrack?.captionTrackIndices;
  return Array.isArray(indices) ? indices.map(index => tracks[index]).filter(Boolean) : [];
}

function getNativeCaptionTrack() {
    const renderer = window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer;
    const tracks = getCaptionTracks();
    const audioTracks = renderer?.audioTracks || [];
    const activeAudioTrack = getActiveAudioTrack();
    const activeAudioTrackId = getActiveAudioTrackId(activeAudioTrack);
    const audioTrack = audioTracks.find(track => track.audioTrackId === activeAudioTrackId)
      || audioTracks[renderer?.defaultAudioTrackIndex ?? 0]
      || audioTracks[0];
    const associatedTracks = getAudioAssociatedCaptionTracks(activeAudioTrack, audioTrack, tracks);
    if (!associatedTracks.length) return null;
  const audioLanguage = getAudioTrackLanguage(activeAudioTrack) || getAudioTrackLanguage(audioTrack);
  if (audioLanguage) {
    const languageMatch = associatedTracks.find(track =>
      languageMatches(track.languageCode, audioLanguage));
    if (languageMatch) return languageMatch;
  }
  return associatedTracks.length === 1 ? associatedTracks[0] : null;
}

function getPreferredSourceTrack() {
  sourceSelectionInferred = false;
  const tracks = getCaptionTracks();
  const manualTrack = getManualCaptionSourceTrack(tracks);
  if (manualTrack !== undefined) {
    sourceSelectionUnconfirmed = false;
    return manualTrack;
  }
  if (!tracks.length) {
    sourceSelectionUnconfirmed = false;
    return null;
  }
    const response = window.ytInitialPlayerResponse;
    const renderer = response?.captions?.playerCaptionsTracklistRenderer;
    const activeAudioTrack = getActiveAudioTrack();
    const activeAudioTrackId = getActiveAudioTrackId(activeAudioTrack);
    const audioTracks = renderer?.audioTracks || [];
    const audioTrack = audioTracks.find(track => track.audioTrackId === activeAudioTrackId)
      || audioTracks[renderer?.defaultAudioTrackIndex ?? 0]
      || audioTracks[0];
    const nativeTrack = getNativeCaptionTrack();
  const audioLanguage = getAudioTrackLanguage(activeAudioTrack, response)
    || getAudioTrackLanguage(audioTrack, response);
    const videoLanguage = response?.videoDetails?.language || '';
    const associatedTracks = getAudioAssociatedCaptionTracks(activeAudioTrack, audioTrack, tracks);
    const observedTracks = sourceCaptionLanguage
      ? tracks.filter(track => languageMatches(track.languageCode, sourceCaptionLanguage))
      : [];
    const observedTrack = observedTracks.find(track => track.kind === 'asr') || observedTracks[0];
  const audioAssociatedTrack = (audioLanguage
    ? associatedTracks.find(track => languageMatches(track.languageCode, audioLanguage))
    : null)
    || (associatedTracks.length === 1 ? associatedTracks[0] : null);
    const videoLanguageTrack = videoLanguage
      ? tracks.find(track => languageMatches(track.languageCode, videoLanguage))
      : null;
    const audioLanguageTrack = audioLanguage
      ? tracks.find(track => languageMatches(track.languageCode, audioLanguage))
      : null;
  const trustedTrack = audioAssociatedTrack
    || observedTrack
    || nativeTrack
    || audioLanguageTrack
    || videoLanguageTrack;
  if (trustedTrack) {
    const id = trustedTrack.vssId || trustedTrack.vss_id || normalizeLanguage(trustedTrack.languageCode);
    sourceSelectionUnconfirmed = Boolean(id && id === fallbackSourceTrackId);
    return trustedTrack;
  }

function getManualCaptionSourceTrack(tracks = getCaptionTracks()) {
  if (manualCaptionTrackVideoId !== currentVideoId) return undefined;
  if (manualCaptionTrackId === 'off') return null;
  const selected = manualCaptionTrack || {};
  const matchingTrack = tracks.find(track => (selected.vssId || selected.vss_id)
    && (track.vssId || track.vss_id) === (selected.vssId || selected.vss_id))
    || tracks.find(track => normalizeLanguage(track.languageCode) === normalizeLanguage(selected.languageCode)
      && (!selected.kind || track.kind === selected.kind));
  if (matchingTrack) return matchingTrack;
  // A YouTube auto-translated player track is a presentation of an underlying
  // source track, not a source transcript to translate again.
  if (selected.translationLanguage?.languageCode) return undefined;
  return selected.languageCode && selected.baseUrl ? selected : null;
}

  const videoDetails = response?.videoDetails || {};
  const metadataTexts = [
    videoDetails.title,
    videoDetails.shortDescription,
    Array.isArray(videoDetails.keywords) ? videoDetails.keywords.join(' ') : '',
  ];
  for (const text of metadataTexts) {
    const guessedLanguage = guessSourceLanguageFromText(text);
    if (!guessedLanguage) continue;
    const matchingTracks = tracks.filter(track => languageMatches(track.languageCode, guessedLanguage));
    const metadataTrack = matchingTracks.find(track => track.kind !== 'asr') || matchingTracks[0];
    if (metadataTrack) {
      sourceSelectionInferred = true;
      sourceSelectionUnconfirmed = false;
      return metadataTrack;
    }
  }

  // If the original language cannot be established, use English only as an
  // explicit fallback; never silently choose an arbitrary ASR/track-list entry.
  const englishTracks = tracks.filter(track => !languageMatches(track.languageCode, settings.language)
    && languageMatches(track.languageCode, 'en'));
  const englishFallback = englishTracks.find(track => track.kind !== 'asr') || englishTracks[0] || null;
  if (!englishFallback) {
    sourceSelectionUnconfirmed = false;
    return null;
  }
  fallbackSourceTrackId = englishFallback.vssId || englishFallback.vss_id
    || normalizeLanguage(englishFallback.languageCode);
  sourceSelectionUnconfirmed = true;
  return englishFallback;
}

function logCaptionDebug(event, details = {}) {
  if (CAPTION_DEBUG_ENABLED()) console.debug('[YTools++ captions]', event, details);
}

function guessSourceLanguageFromText(text) {
  const value = String(text || '').normalize('NFKC').trim();
  if (value.length < 3) return '';
  const count = pattern => [...value.matchAll(pattern)].length;

  const kanaCount = count(/[\u3040-\u30ff]/gu);
  if (kanaCount >= 3 && (/(?:です|ます|でした|ません|する|した|して|から|まで|これは|そして|ため)/u.test(value)
    || kanaCount >= 6)) return 'ja';

  const hangulCount = count(/[\uac00-\ud7af]/gu);
  if (hangulCount >= 5 && /(?:입니다|합니다|하세요|그리고|에서|으로|은|는|이|가|을|를)/u.test(value)) return 'ko';

  const traditionalPhrases = /(?:我們|這個|這是|影片|為什麼|沒有|還是|這樣|後來|說話|這裡|什麼|可以嗎)/u;
  const simplifiedPhrases = /(?:我们|这个|这是|视频|为什么|没有|还是|这样|后来|说话|这里|什么|可以吗)/u;
  if (traditionalPhrases.test(value)) return 'zh-Hant';
  if (simplifiedPhrases.test(value)) return 'zh-Hans';

  const traditionalCharacters = count(/[體萬與會為這個後臺]/gu);
  const simplifiedCharacters = count(/[体万与会为这后台]/gu);
  if (traditionalCharacters >= 2 && traditionalCharacters > simplifiedCharacters) return 'zh-Hant';
  if (simplifiedCharacters >= 2 && simplifiedCharacters > traditionalCharacters) return 'zh-Hans';

  if (count(/[\u0e00-\u0e7f]/gu) >= 8) return 'th';
  if (count(/[\u0600-\u06ff]/gu) >= 8 && /(?:هذا|هذه|الذي|التي|لذلك|لأن|على|من)/u.test(value)) return 'ar';
  if (count(/[\u0900-\u097f]/gu) >= 6 && /(?:और|का|की|के|है|हैं|में|से|को|यह)/u.test(value)) return 'hi';
  if (count(/[\u0400-\u04ff]/gu) >= 8 && /(?:это|что|как|для|когда|чтобы|который|потому|можно)/iu.test(value)) return 'ru';
  return '';
}

  function getSourceTrackId(track = getPreferredSourceTrack()) {
    return track?.vssId || track?.vss_id
      || normalizeLanguage(track?.languageCode)
      || normalizeLanguage(sourceCaptionLanguage)
      || 'unknown';
  }

  function getTranslationCacheKey(videoId = currentVideoId, language = settings.language, trackId = getSourceTrackId()) {
    return `${videoId}|${trackId}|${language}`;
  }

  function getTrackLanguage(url) {
    try { return new URL(url, location.href).searchParams.get('lang') || ''; } catch { return ''; }
  }

  function normalizeLanguage(language) {
    return String(language || '').toLowerCase().replaceAll('_', '-');
  }

  function languageMatches(left, right) {
    const a = normalizeLanguage(left);
    const b = normalizeLanguage(right);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.startsWith('zh-') || b.startsWith('zh-')) {
      const traditional = /^(?:zh-hant|zh-(?:tw|hk|mo))(?:-|$)/;
      const simplified = /^(?:zh-hans|zh-(?:cn|sg))(?:-|$)/;
      if (traditional.test(a) || traditional.test(b)) return traditional.test(a) && traditional.test(b);
      if (simplified.test(a) || simplified.test(b)) return simplified.test(a) && simplified.test(b);
    }
    return a.split('-')[0] === b.split('-')[0];
  }

  function getDirectTargetTrack(sourceTrack) {
    const sourceId = getSourceTrackId(sourceTrack);
    return getCaptionTracks().find(track => track?.baseUrl
      && languageMatches(track.languageCode, settings.language)
      && getSourceTrackId(track) !== sourceId) || null;
  }

  function isTraditionalChinese(language) {
    return /^zh-(?:hant|tw|hk|mo)(?:-|$)/i.test(normalizeLanguage(language));
  }

function normalizeCueText(text) {
    return String(text || '').replace(/[\r\n]+/g, ' ').replace(/[\t ]{2,}/g, ' ').trim();
  }

  function parseJsonCues(data) {
    if (!Array.isArray(data?.events)) return [];
    const events = data.events.filter(event => event.aAppend !== 1 && Array.isArray(event.segs));
    return events.map((event, index) => {
      const start = Number(event.tStartMs) / 1000;
      const nextStart = Number(events[index + 1]?.tStartMs) / 1000;
      const duration = Number(event.dDurationMs) / 1000;
      const text = normalizeCueText(event.segs.map(segment => segment.utf8 || '').join('').replace(/[\u200b\ufeff]/g, ''));
      return { start, end: start + (duration > 0 ? duration : nextStart > start ? nextStart - start : 3), text };
    }).filter(cue => Number.isFinite(cue.start) && cue.text);
  }

  function parseCaptionPayload(payload) {
    if (payload && typeof payload === 'object') return parseJsonCues(payload);
    if (typeof payload !== 'string' || !payload.trim()) return [];
    try { return parseJsonCues(JSON.parse(payload)); } catch { /* try XML subtitle formats */ }

    const xml = new DOMParser().parseFromString(payload, 'text/xml');
    if (xml.querySelector('parsererror')) return [];
    const srv1 = [...xml.querySelectorAll('text')];
    if (srv1.length) {
      return srv1.map(node => {
        const start = Number(node.getAttribute('start'));
        const duration = Number(node.getAttribute('dur'));
        return { start, end: start + (duration > 0 ? duration : 3), text: normalizeCueText(node.textContent) };
      }).filter(cue => Number.isFinite(cue.start) && cue.text);
    }
    return [...xml.querySelectorAll('p')].map(node => {
      const start = Number(node.getAttribute('t')) / 1000;
      const duration = Number(node.getAttribute('d')) / 1000;
      return { start, end: start + (duration > 0 ? duration : 3), text: normalizeCueText(node.textContent) };
    }).filter(cue => Number.isFinite(cue.start) && cue.text);
  }

  function mergeCues(existing, incoming) {
    const merged = new Map(existing.map(cue => [`${cue.start}\u0000${cue.text}`, cue]));
    for (const cue of incoming) merged.set(`${cue.start}\u0000${cue.text}`, cue);
    return [...merged.values()].sort((a, b) => a.start - b.start);
  }

  function isNoiseCue(text) {
    const value = normalizeCueText(text);
    return !value || /^[\p{P}\p{S}\s♪♫♬]+$/u.test(value);
  }

  function joinCueText(left, right) {
    const a = normalizeCueText(left);
    let b = normalizeCueText(right);
    if (!a) return b;
    if (!b || a === b || a.endsWith(b)) return a;
    const leftWords = a.split(/\s+/u);
    const rightWords = b.split(/\s+/u);
    const comparable = word => word.toLocaleLowerCase().replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
    for (let overlap = Math.min(10, leftWords.length, rightWords.length); overlap >= 2; overlap--) {
      const leftTail = leftWords.slice(-overlap).map(comparable);
      const rightHead = rightWords.slice(0, overlap).map(comparable);
      if (leftTail.every((word, index) => word && word === rightHead[index])) {
        b = rightWords.slice(overlap).join(' ');
        break;
      }
    }
    if (!b) return a;
    const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u.test(a)
      && /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(b);
    return `${a}${cjk ? '' : ' '}${b}`;
  }

  function groupCues(trackCues) {
    const groups = [];
    let previousCueStart = -Infinity;
  for (const cue of trackCues) {
    const text = normalizeCueText(cue.text);
    if (!text) continue;
      if (isNoiseCue(text)) {
      // Keep music/sound-only cues as timing boundaries. Dropping them before
      // grouping can merge lyrics on either side and show the later translation early.
        groups.push({ start: cue.start, end: cue.end, text, noise: true });
        previousCueStart = cue.start;
        continue;
      }
      const previous = groups.at(-1);
      const gap = previous ? cue.start - previousCueStart : Infinity;
      const sentenceEnded = previous && /[.!?。！？…][”’"')\]]*$/u.test(previous.text);
      const canMerge = previous
        && !previous.noise
    // Keep nearby ASR fragments together, but don't collapse separate caption lines.
    && gap <= 1.25
        && gap >= 0
        && !sentenceEnded
    && cue.end - previous.start <= 8
        && previous.text.length + text.length <= 280;
      if (canMerge) {
        previous.text = joinCueText(previous.text, text);
        previous.end = Math.max(previous.end, cue.end);
      } else {
        groups.push({ start: cue.start, end: cue.end, text });
      }
      previousCueStart = cue.start;
    }
    for (let index = 0; index < groups.length - 1; index++) {
      if (groups[index].end > groups[index + 1].start) {
        groups[index].end = Math.max(groups[index].start + 0.05, groups[index + 1].start);
      }
    }
    return groups;
  }

  function groupAt(trackCues, time) {
    let low = 0;
    let high = trackCues.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (trackCues[middle].start <= time) low = middle + 1;
      else high = middle - 1;
    }
    const group = trackCues[high];
    return group && time < group.end ? group : null;
  }

function updateOverlay() {
    if (!overlay || !video || !sourceLine || !translatedLine) return;
    const ccButton = player?.querySelector('.ytp-subtitles-button');
    if (ccButton?.getAttribute('aria-pressed') !== 'true') {
      overlay.hidden = !progressState;
      player?.classList.remove('yt-toolkit-bilingual-active');
      return;
  }
  const time = video.currentTime;
    const sourceCue = groupAt(cues.source, time);
    sourceLine.textContent = sourceCue?.text || '';
    if (sourceStatus) {
      sourceStatus.textContent = sourceSelectionInferred
        ? settings.progressLabels?.sourceInferred || 'Source language inferred from video text'
        : '';
      sourceStatus.hidden = !sourceSelectionInferred;
    }
  // Keep translated cues at their original timing granularity. Grouping this
  // track independently can concatenate several lyric lines into one long cue.
    if (translatedText) translatedText.textContent = groupAt(cues.translated, time)?.text || '';
    fitLine(sourceLine);
    fitLine(translatedLine);
    translatedLine.hidden = !translatedLine.textContent;
    overlay.hidden = !sourceLine.textContent && !translatedLine.textContent && !progressState;
    overlay.setAttribute('aria-label', [translatedLine.textContent, sourceLine.textContent].filter(Boolean).join('. '));
    player?.classList.toggle('yt-toolkit-bilingual-active', !overlay.hidden);
  }

  function getTranslationFailureLabelKey(message) {
    if (message.reason === 'missing-api-key' || message.status === 'missing-key') return 'missingApiKey';
    if (message.reason === 'key-storage-error') return 'keyStorageError';
    if (message.reason === 'background-unavailable') return 'backgroundUnavailable';
    if (message.reason === 'network-error') return 'networkError';
    if (message.reason === 'timeout' || message.status === 'timed-out') return 'timedOut';
    if (message.alignmentFailed) return 'invalidResponse';

    switch (message.apiStatus) {
      case 400: return 'invalidRequest';
      case 401: return 'invalidApiKey';
      case 402: return 'billingRequired';
      case 403: return 'permissionDenied';
      case 404: return 'modelUnavailable';
      case 429: return 'rateLimited';
      case 503: return 'serviceBusy';
      default:
        return message.apiStatus >= 500 ? 'serviceUnavailable' : 'failed';
    }
  }

  function isRetryableTranslationFailure(message) {
    if (message.reason === 'timeout' || message.reason === 'network-error'
      || message.status === 'timed-out') return true;
    return [404, 408, 425, 429, 500, 502, 503, 504].includes(message.apiStatus);
  }

  function updateTranslationProgress(message) {
    if (message.videoId !== currentVideoId || message.targetLanguage !== settings.language) return;
    if (translationRequestGenerations.get(message.requestId) !== translationGeneration) return;
    const isTerminal = ['completed', 'failed', 'timed-out', 'missing-key'].includes(message.status);
    if (terminalTranslationRequestIds.has(message.requestId)) return;
    if (message.status === 'started') {
      activeTranslationRequestId = message.requestId;
      window.clearTimeout(progressHideTimer);
    } else if (!activeTranslationRequestId || message.requestId !== activeTranslationRequestId) {
      return;
    }

    if (isTerminal) {
      terminalTranslationRequestIds.add(message.requestId);
      if (terminalTranslationRequestIds.size > 100) {
        terminalTranslationRequestIds.delete(terminalTranslationRequestIds.values().next().value);
      }
      window.clearTimeout(progressWatchdogTimer);
      progressWatchdogTimer = 0;
    } else {
      scheduleTranslationWatchdog(message.requestId);
    }

    const total = Number.isFinite(message.total) ? Math.max(0, message.total) : 0;
    const completed = Number.isFinite(message.completed)
      ? Math.max(0, Math.min(total, message.completed))
      : 0;
    const retryDelay = ['failed', 'timed-out'].includes(message.status)
      && isRetryableTranslationFailure(message)
      ? scheduleTranslationRetry(message)
      : 0;
    const displayStatus = retryDelay
      ? 'retrying'
      : message.reason === 'missing-api-key' || message.status === 'missing-key'
        ? 'missing-key'
        : message.status;
    progressState = { status: displayStatus, completed, total };
    if (!overlay || !player?.contains(overlay)) createOverlay();
    if (!progressElement) return;

    const labels = settings.progressLabels || {};
    const failureText = labels[getTranslationFailureLabelKey(message)] || labels.failed || 'Translation failed';
    const statusText = displayStatus === 'model'
      ? `${labels.modelAttempt || 'Trying model'}: ${message.model || 'Gemini'} · ${message.batch || 0}/${message.totalBatches || 0}`
      : displayStatus === 'completed'
      ? labels.complete || 'Translation complete'
      : displayStatus === 'retrying'
        ? `${failureText} · ${labels.retryingShort || 'Retrying'}`
        : displayStatus === 'timed-out'
          ? failureText
          : displayStatus === 'missing-key'
            ? failureText
            : displayStatus === 'failed'
              ? failureText
              : labels.translating || 'Translating';
    const percent = message.status === 'completed' ? 100 : total ? Math.floor(completed * 100 / total) : 0;
    progressLabel.textContent = statusText;
    progressValue.textContent = `${percent}% · ${completed}/${total}`;
    progressFill.style.width = `${percent}%`;
    progressElement.hidden = false;
    positionProgressToast();
    progressElement.setAttribute('aria-label', `${statusText} ${percent}% (${completed}/${total})`);
    overlay.dataset.translationProgress = `${completed}/${total}`;
    overlay.dataset.translationStatus = displayStatus;
    updateOverlay();

    if (isTerminal) {
      progressHideTimer = window.setTimeout(() => {
        progressState = null;
        if (activeTranslationRequestId === message.requestId) activeTranslationRequestId = '';
        if (progressElement) progressElement.hidden = true;
        overlay?.removeAttribute('data-translation-progress');
        overlay?.removeAttribute('data-translation-status');
        updateOverlay();
      }, displayStatus === 'completed' ? 5000 : displayStatus === 'missing-key' ? 8000 : 6000);
    }
  }

function positionProgressToast() {
  if (!progressElement || !player) return;
  const speedWidget = document.getElementById('yt-toolkit-speed-display');
  const speedRect = speedWidget?.getBoundingClientRect();
  const targetContainer = speedWidget?.parentElement || player;
  if (progressElement.parentElement !== targetContainer) targetContainer.append(progressElement);
  const positioningParent = progressElement.offsetParent || player;
  const positioningRect = positioningParent.getBoundingClientRect();
  const playerRect = player.getBoundingClientRect();
  const hasSpeedAnchor = speedWidget && player.contains(speedWidget) && speedRect?.width && speedRect.height;
  const anchorLeft = hasSpeedAnchor ? speedRect.left : playerRect.right - 12;
  const anchorCenterY = hasSpeedAnchor
    ? speedRect.top + speedRect.height / 2
    : playerRect.bottom - 71;
  const gap = 8;
  const availableWidth = Math.max(120, anchorLeft - playerRect.left - gap - 8);

  // Keep progress in the speed widget's own container, aligned directly to its left.
  progressElement.style.left = `${anchorLeft - positioningRect.left - gap}px`;
  progressElement.style.top = `${anchorCenterY - positioningRect.top}px`;
  progressElement.style.transform = 'translate(-100%, -50%)';
  progressElement.style.maxWidth = `min(${Math.min(340, availableWidth)}px, calc(100vw - 28px))`;
}

  function scheduleTranslationWatchdog(requestId) {
    window.clearTimeout(progressWatchdogTimer);
    progressWatchdogTimer = window.setTimeout(() => {
      progressWatchdogTimer = 0;
      if (activeTranslationRequestId !== requestId) return;
      updateTranslationProgress({
        requestId,
        videoId: currentVideoId,
        targetLanguage: settings.language,
        sourceTrackId: getSourceTrackId(),
        completed: progressState?.completed || 0,
        total: progressState?.total || 0,
        status: 'timed-out',
        reason: 'idle-timeout',
      });
  }, TRANSLATION_IDLE_TIMEOUT_MS);
}

function postTranslationSnapshot(snapshot) {
  logCaptionDebug('translation-request-sent', {
    sourceLanguage: snapshot.sourceLanguage,
    targetLanguage: snapshot.targetLanguage,
    cueCount: snapshot.cues.length,
  });
  const requestId = `${snapshot.key}|${++translationRequestSequence}`;
  activeTranslationRequestId = requestId;
  translationRequestGenerations.set(requestId, translationGeneration);
  translationRequestModes.set(requestId, snapshot.appendToExisting === true);
  translationRequestSourceRanges.set(requestId, snapshot.sourceRanges || []);
  translationRequestTrackIds.set(requestId, snapshot.sourceTrackId);
  googleTranslationAttempts.add(snapshot.key);
  activeTranslationRequestKey = snapshot.key;
  window.postMessage({
    source: SETTINGS_SOURCE,
    type: 'google-translate-transcript-request',
    requestId,
    videoId: snapshot.videoId,
    targetLanguage: snapshot.targetLanguage,
    sourceLanguage: snapshot.sourceLanguage,
    sourceTrackId: snapshot.sourceTrackId,
    cues: snapshot.cues,
  }, location.origin);
}

function getUntranslatedTranscriptCues(key, transcript) {
  const translatedRanges = translatedSourceRanges.get(key) || [];
  return groupCues(transcript).map(({ start, end, text }) => ({ start, end, text }))
    .filter(cue => !translatedRanges.some(range => range.start <= cue.start + 0.01 && range.end >= cue.end - 0.01));
}

function postRemainingCompleteTranscript() {
  const complete = completeSourceTranscript;
  if (!complete || complete.videoId !== currentVideoId || !complete.cues.length) return false;
  const key = getTranslationCacheKey(currentVideoId, settings.language, complete.sourceTrackId);
  if (googleTranslationAttempts.has(key)) return false;
  const remaining = getUntranslatedTranscriptCues(key, complete.cues);
  if (!remaining.length) return false;
  const snapshot = {
    key,
    videoId: currentVideoId,
    targetLanguage: settings.language,
    sourceLanguage: complete.sourceLanguage,
    sourceTrackId: complete.sourceTrackId,
    cues: remaining,
    sourceRanges: remaining.map(({ start, end }) => ({ start, end })),
    appendToExisting: rawTranslatedCues.length > 0,
  };
  translationSnapshots.set(key, snapshot);
  postTranslationSnapshot(snapshot);
  return true;
}

  function scheduleTranslationRetry(message) {
    const key = getTranslationCacheKey(message.videoId, message.targetLanguage, message.sourceTrackId);
    const snapshot = translationSnapshots.get(key);
    const retries = translationRetryCounts.get(key) || 0;
    if (!snapshot || retries >= MAX_TRANSLATION_RETRIES) return 0;

    translationRetryCounts.set(key, retries + 1);
    googleTranslationAttempts.delete(key);
    const baseDelayMs = 1000;
    const retryDelay = Math.min(8000, baseDelayMs * (2 ** retries))
      + Math.floor(Math.random() * baseDelayMs);
    window.setTimeout(() => {
      if (!settings.enabled || currentVideoId !== snapshot.videoId || settings.language !== snapshot.targetLanguage
        || getSourceTrackId() !== snapshot.sourceTrackId) return;
      postTranslationSnapshot(snapshot);
    }, retryDelay);
    return retryDelay;
  }

function fitLine(line) {
    if (!line || !line.textContent) return;
    line.style.whiteSpace = 'nowrap';
    line.style.fontSize = '';
    line.style.transform = '';
    const playerWidth = player?.clientWidth || window.innerWidth || 800;
    const availableWidth = Math.max(120, Math.min(
      (overlay?.clientWidth || playerWidth) - 16,
      (window.visualViewport?.width || window.innerWidth || playerWidth) - 24,
      1800,
    ));
    line.style.maxWidth = 'none';
    line.style.width = 'max-content';
    const naturalWidth = line.scrollWidth;
    const baseFontSize = Number.parseFloat(getComputedStyle(line).fontSize) || 24;
    if (naturalWidth > availableWidth) {
      line.style.fontSize = `${Math.max(12, baseFontSize * availableWidth / naturalWidth)}px`;
      const fittedWidth = line.scrollWidth;
      if (fittedWidth > availableWidth + 1) {
        line.style.transform = `scaleX(${availableWidth / fittedWidth})`;
      }
    }
  }

  function applyTranslatedSubtitleMode(mode) {
    if (!translatedLine) return;
    translatedLine.classList.remove('rgb-rainbow', 'rgb-gradient', 'rgb-wave', 'rgb-wave-right', 'rgb-pulse');
    if (RGB_MODES.has(mode) && mode !== 'off') translatedLine.classList.add(`rgb-${mode}`);
  }

  function createOverlay() {
    if (!player) return;
    if (overlay && player.contains(overlay)) return;
    overlay = document.createElement('div');
    overlay.id = 'yt-toolkit-bilingual-subtitles';
    const shadow = overlay.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host { position:absolute; z-index:2200; left:50%; bottom:74px; transform:translateX(-50%); width:min(1800px,calc(100vw - 24px),calc(100% - 24px)); pointer-events:none; text-align:center; font-family:Arial,Roboto,sans-serif; }
 .line { display:table; max-width:none; margin:0 auto 5px; padding:2px 8px; color:#fff; background:rgba(0,0,0,.52); font-size:clamp(16px,2.4vw,32px); font-weight:700; line-height:1.35; white-space:nowrap; overflow-wrap:normal; text-shadow:0 1px 2px #000,1px 0 2px #000,-1px 0 2px #000,0 -1px 2px #000; }
 .source-status { margin:0 auto 3px; color:#ffe680; font:600 12px/1.2 Arial,Roboto,sans-serif; text-shadow:0 1px 2px #000; }
        .translated { color:var(--translated-subtitle-color,#ffe680); }
        .translated.rgb-rainbow { animation:translated-rgb 6s linear infinite; }
        .translated.rgb-gradient .translated-text,.translated.rgb-wave .translated-text,.translated.rgb-wave-right .translated-text { display:inline-block; text-shadow:none; filter:drop-shadow(0 1px 1px #000); background-image:linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00); background-clip:text; -webkit-background-clip:text; color:transparent; -webkit-text-fill-color:transparent; }
        .translated.rgb-wave .translated-text { background-size:200% 100%; background-position:0% 0; animation:translated-wave 3s linear infinite; }
        .translated.rgb-wave-right .translated-text { background-size:200% 100%; background-position:200% 0; animation:translated-wave-right 3s linear infinite; }
        .translated.rgb-pulse { animation:translated-rgb-pulse 2.4s ease-in-out infinite; }
        @keyframes translated-rgb { 0%,100% { color:#f00; } 17% { color:#ff0; } 33% { color:#0f0; } 50% { color:#0ff; } 67% { color:#00f; } 83% { color:#f0f; } }
        @keyframes translated-wave { from { background-position:0% 0; } to { background-position:200% 0; } }
        @keyframes translated-wave-right { from { background-position:200% 0; } to { background-position:0% 0; } }
        @keyframes translated-rgb-pulse { 0%,100% { text-shadow:0 0 2px #f00,0 0 5px #f00,0 1px 2px #000,1px 0 2px #000,-1px 0 2px #000,0 -1px 2px #000; } 33% { text-shadow:0 0 5px #0f0,0 0 12px #0f0,0 1px 2px #000,1px 0 2px #000,-1px 0 2px #000,0 -1px 2px #000; } 67% { text-shadow:0 0 5px #00f,0 0 12px #00f,0 1px 2px #000,1px 0 2px #000,-1px 0 2px #000,0 -1px 2px #000; } }
        @media (prefers-reduced-motion:reduce) { .translated.rgb-rainbow,.translated.rgb-wave,.translated.rgb-wave-right,.translated.rgb-pulse,.translated.rgb-wave .translated-text,.translated.rgb-wave-right .translated-text { animation:none; } }
 @media (max-width:600px) { :host { bottom:58px; width:calc(100vw - 16px); } .line { font-size:clamp(14px,4.2vw,24px); } }
    `;
  const wrapper = document.createElement('div');
  sourceStatus = document.createElement('div');
  sourceStatus.className = 'source-status';
  sourceStatus.hidden = true;
    sourceLine = document.createElement('div');
    translatedLine = document.createElement('div');
    translatedText = document.createElement('span');
    sourceLine.className = 'line';
    translatedLine.className = 'line translated';
    translatedText.className = 'translated-text';
    translatedLine.append(translatedText);
    translatedLine.style.setProperty('--translated-subtitle-color', settings.translatedSubtitleColor);
    applyTranslatedSubtitleMode(settings.rgbSubtitleMode);
  wrapper.append(translatedLine, sourceStatus, sourceLine);
  progressElement = document.createElement('div');
  progressElement.id = 'yt-toolkit-translation-progress';
  progressElement.className = 'yt-toolkit-translation-progress';
  progressElement.setAttribute('role', 'status');
  progressElement.setAttribute('aria-live', 'polite');
  progressLabel = document.createElement('span');
  progressLabel.className = 'yt-toolkit-translation-progress__label';
  progressFill = document.createElement('span');
  progressFill.className = 'yt-toolkit-translation-progress__fill';
  const progressTrack = document.createElement('span');
  progressTrack.className = 'yt-toolkit-translation-progress__track';
  progressTrack.append(progressFill);
  progressValue = document.createElement('span');
  progressValue.className = 'yt-toolkit-translation-progress__value';
  progressElement.append(progressLabel, progressTrack, progressValue);
  progressElement.hidden = !progressState;
  shadow.append(style, wrapper);
  player.append(overlay);
  player.append(progressElement);
}

  function removeOverlay() {
    window.clearTimeout(progressHideTimer);
  window.clearTimeout(progressWatchdogTimer);
  progressWatchdogTimer = 0;
  overlay?.remove();
  progressElement?.remove();
  overlay = null;
  sourceLine = null;
  sourceStatus = null;
  translatedLine = null;
  translatedText = null;
    progressElement = null;
    progressLabel = null;
    progressFill = null;
    progressValue = null;
    progressState = null;
    activeTranslationRequestId = '';
    player?.classList.remove('yt-toolkit-bilingual-active');
  }

  function readXhrPayload(xhr) {
    try {
      if (xhr.responseType === 'json') return xhr.response;
      return xhr.responseText;
    } catch { return ''; }
  }

  function normalizedRequestUrl(rawUrl) {
    try { return new URL(rawUrl, location.href); } catch { return null; }
  }

  function displayText(value) {
    if (typeof value === 'string') return value;
    if (value?.simpleText) return value.simpleText;
    return value?.runs?.map(run => run.text || '').join('') || '';
  }

  function getPlayerCaptionTracks() {
    try {
      if (!player?.getOptions?.().includes('captions')) return [];
      const tracks = player.getOption('captions', 'tracklist');
      return Array.isArray(tracks) ? tracks : getCaptionTracks();
    } catch { return []; }
  }

  function getPlayerCaptionTrack(targetPlayer = player) {
    try { return targetPlayer?.getOption?.('captions', 'track') || {}; } catch { return {}; }
  }

  function getCaptionTrackSelectionId(track) {
    if (!track || typeof track !== 'object') return 'off';
    const trackId = track.vssId || track.vss_id || normalizeLanguage(track.languageCode);
    if (!trackId) return 'off';
    return `${trackId}|${track.translationLanguage?.languageCode || ''}|${track.kind || ''}`;
  }

  function requestSavedCaptionSelection(videoId) {
    if (!videoId) return;
    window.clearTimeout(captionSelectionRequestTimer);
    captionSelectionRequestId = `${videoId}|${++captionSelectionRequestSequence}`;
    captionSelectionRequestAttempts = 0;
    const sendRequest = () => {
      if (videoId !== currentVideoId || captionSelectionRequestAttempts >= 6) return;
      captionSelectionRequestAttempts++;
      window.postMessage({
        source: SETTINGS_SOURCE,
        type: 'subtitle-track-selection-get',
        videoId,
        requestId: captionSelectionRequestId,
      }, location.origin);
      if (captionSelectionRequestAttempts < 6)
        captionSelectionRequestTimer = window.setTimeout(sendRequest, 250);
    };
    sendRequest();
  }

  function saveCaptionSelection(track, trackId) {
    const id = track?.vssId || track?.vss_id || '';
    window.postMessage({
      source: SETTINGS_SOURCE,
      type: 'subtitle-track-selection-save',
      videoId: currentVideoId,
      requestId: `${currentVideoId}|${++captionSelectionRequestSequence}`,
      trackId,
      languageCode: track?.languageCode || '',
      kind: track?.kind || '',
      translationLanguage: track?.translationLanguage?.languageCode || '',
      vssId: id,
    }, location.origin);
  }

  function setManualCaptionTrack(track, trackId = getCaptionTrackSelectionId(track)) {
    manualCaptionTrackVideoId = currentVideoId;
    manualCaptionTrackId = trackId;
    manualCaptionTrack = trackId === 'off' ? null : track;
    sourceCaptionLanguage = track?.languageCode || '';
  }

  function restoreSavedCaptionSelection() {
    const saved = savedCaptionSelection;
    if (!saved || saved.videoId !== currentVideoId || !player) return;
    if (saved.track?.trackId === 'off') {
      setManualCaptionTrack(null, 'off');
      const button = player.querySelector('.ytp-subtitles-button');
      if (button?.getAttribute('aria-pressed') === 'true') {
        markProgrammaticCaptionTrack('off');
        button.click();
        window.setTimeout(sync, 100);
      }
      savedCaptionSelection = null;
      return;
    }
    const tracks = getCaptionTracks();
    const wanted = saved.track || {};
    const match = tracks.find(track => getCaptionTrackSelectionId({
      ...track,
      translationLanguage: wanted.translationLanguage ? { languageCode: wanted.translationLanguage } : undefined,
    }) === wanted.trackId)
      || tracks.find(track => track.vssId === wanted.vssId || track.vss_id === wanted.vssId)
      || tracks.find(track => normalizeLanguage(track.languageCode) === normalizeLanguage(wanted.languageCode)
        && (!wanted.kind || track.kind === wanted.kind));
    if (!match) return;
    const currentTrack = getPlayerCaptionTrack();
    const matchTrackId = match.vssId || match.vss_id || '';
    const currentTrackId = currentTrack.vssId || currentTrack.vss_id || '';
    const alreadySelected = normalizeLanguage(currentTrack.languageCode) === normalizeLanguage(match.languageCode)
      && (!matchTrackId || currentTrackId === matchTrackId)
      && normalizeLanguage(currentTrack.translationLanguage?.languageCode || '') === normalizeLanguage(wanted.translationLanguage || '');
    if (alreadySelected) {
      setManualCaptionTrack(currentTrack, getCaptionTrackSelectionId(currentTrack));
      savedCaptionSelection = null;
      requestGoogleTranslation();
      return;
    }
    if (!setPlayerCaptionTrack(match, wanted.translationLanguage || '')) return;
    const restoredTrack = getPlayerCaptionTrack();
    const restoredTrackId = getCaptionTrackSelectionId(restoredTrack);
    savedCaptionSelection = null;
    handleCaptionTrackChange(restoredTrack, restoredTrackId, true);
  }

  function resolvePlayerCaptionTrack(track, playerTracks = getPlayerCaptionTracks()) {
    if (!track || !playerTracks.length) return null;
    const vssId = track.vssId || track.vss_id;
    if (vssId) {
      const match = playerTracks.find(candidate => (candidate.vssId || candidate.vss_id) === vssId);
      if (match) return match;
    }
    return playerTracks.find(candidate => normalizeLanguage(candidate.languageCode) === normalizeLanguage(track.languageCode)
      && (!track.kind || candidate.kind === track.kind))
      || playerTracks.find(candidate => normalizeLanguage(candidate.languageCode) === normalizeLanguage(track.languageCode))
      || null;
  }

  function setPlayerCaptionTrack(track, translationLanguage = '') {
    if (!track || typeof player?.setOption !== 'function') return false;
    const selected = { ...track };
    delete selected.translationLanguage;
    if (translationLanguage) {
      const language = (window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.translationLanguages || [])
        .find(item => item.languageCode === translationLanguage);
      selected.translationLanguage = {
        languageCode: translationLanguage,
        ...(language ? { languageName: displayText(language.languageName) } : {}),
      };
    }
    try {
      markProgrammaticCaptionTrack(getCaptionTrackSelectionId(selected));
      player.setOption('captions', 'track', selected);
      const applied = getPlayerCaptionTrack();
      const success = normalizeLanguage(applied.languageCode) === normalizeLanguage(track.languageCode)
        && normalizeLanguage(applied.translationLanguage?.languageCode || '') === normalizeLanguage(translationLanguage);
      if (!success) {
        programmaticCaptionTrackId = '';
        window.clearTimeout(programmaticCaptionTrackTimer);
        programmaticCaptionTrackTimer = 0;
      }
      return success;
    } catch {
      programmaticCaptionTrackId = '';
      window.clearTimeout(programmaticCaptionTrackTimer);
      programmaticCaptionTrackTimer = 0;
      return false;
    }
  }

  function markProgrammaticCaptionTrack(trackId) {
    window.clearTimeout(programmaticCaptionTrackTimer);
    programmaticCaptionTrackId = trackId;
    programmaticCaptionTrackTimer = window.setTimeout(() => {
      if (programmaticCaptionTrackId === trackId) programmaticCaptionTrackId = '';
      programmaticCaptionTrackTimer = 0;
    }, 2000);
  }

  function ensureNativeCaptionsDefault() {
    if (!currentVideoId || !player || captionsDefaultedVideoId === currentVideoId) return;
    if (manualCaptionTrackVideoId === currentVideoId) return;
    const ccButton = player.querySelector('.ytp-subtitles-button');
    if (!ccButton) return;

    const response = window.ytInitialPlayerResponse;
    if (response?.videoDetails?.videoId && response.videoDetails.videoId !== currentVideoId) return;
    const sourceLanguage = getPreferredSourceTrack()?.languageCode
      || sourceCaptionLanguage
      || response?.videoDetails?.language
      || '';
    if (!sourceLanguage) return;

    captionsDefaultedVideoId = currentVideoId;
    if (ccButton.getAttribute('aria-pressed') !== 'true') {
      const defaultTrack = resolvePlayerCaptionTrack(getPreferredSourceTrack());
      if (defaultTrack) markProgrammaticCaptionTrack(getCaptionTrackSelectionId(defaultTrack));
      ccButton.click();
    }
  scheduleNativeCaptionReloadRetry();
}

  function scheduleNativeCaptionReloadRetry() {
    if (!currentVideoId || captionReloadRetryVideoId === currentVideoId || captionReloadRetryTimer) return;
    if (manualCaptionTrackVideoId === currentVideoId) return;
    const videoId = currentVideoId;
    captionReloadRetryVideoId = videoId;
    captionReloadRetryTimer = window.setTimeout(() => {
      captionReloadRetryTimer = 0;
      if (currentVideoId !== videoId || cues.source.length || sourceCaptionLanguage) return;
      const ccButton = player?.querySelector('.ytp-subtitles-button');
      if (ccButton?.getAttribute('aria-pressed') !== 'true') return;

      // YouTube can show CC as enabled without requesting the selected track until it is toggled again.
      ccButton.click();
      window.setTimeout(() => {
        if (currentVideoId !== videoId || !ccButton.isConnected
          || ccButton.getAttribute('aria-pressed') === 'true') return;
        ccButton.click();
      }, 300);
    }, 2500);
  }

  async function ensureNativeAutoTranslation() {
    if (!settings.enabled || !currentVideoId || !player || autoTranslationInFlight) return;
    if (manualCaptionTrackVideoId === currentVideoId) return;
    const ccButton = player.querySelector('.ytp-subtitles-button');
    if (ccButton?.getAttribute('aria-pressed') !== 'true') return;
    const key = currentVideoId + '|' + settings.language;
    const state = autoTranslationAttempts.get(key) || { sourceCount: 0, sourceRetryAfter: 0 };
    await ensureOriginalCaptionTrack(key, state);
  }

  function requestGoogleTranslation() {
    if (!currentVideoId || !settings.enabled) return;
    window.clearTimeout(googleTranslationTimer);
    googleTranslationTimer = window.setTimeout(() => {
      googleTranslationTimer = 0;
      const requestGeneration = translationGeneration;
      const videoId = currentVideoId;
      const targetLanguage = settings.language;
      const tracks = getCaptionTracks();
      const sourceTrack = getPreferredSourceTrack()
        || tracks.find(track => normalizeLanguage(track.languageCode) === normalizeLanguage(sourceCaptionLanguage));
      const sourceTrackId = getSourceTrackId(sourceTrack);
      const key = getTranslationCacheKey(videoId, targetLanguage, sourceTrackId);
      const sourceLanguage = sourceTrack?.languageCode || sourceCaptionLanguage || '';
      logCaptionDebug('translation-source-selected', {
        selectedPlayerLanguage: getPlayerCaptionTrack()?.languageCode || '',
        sourceLanguage,
        targetLanguage,
        hasTrackUrl: Boolean(sourceTrack?.baseUrl),
        manualSelection: manualCaptionTrackVideoId === videoId,
      });
      if (sourceTrack?.languageCode && languageMatches(sourceTrack.languageCode, targetLanguage)) {
        logCaptionDebug('translation-skipped-same-language', { sourceLanguage: sourceTrack.languageCode, targetLanguage });
        fullTranscriptAttempts.delete(key);
    googleTranslationAttempts.delete(key);
    translationCache.delete(key);
    rawTranslatedCues = [];
    cues.translated = [];
    createOverlay();
    updateOverlay();
    return;
  }
      const cachedTranslation = translationCache.get(key);
      if (Array.isArray(cachedTranslation) && cachedTranslation.length) {
        rawTranslatedCues = cachedTranslation;
        cues.translated = cachedTranslation;
        createOverlay();
        updateOverlay();
        rememberCues();
        const hasPendingProgressive = progressiveTranscriptTrackKeys.has(key)
          && pendingProgressiveSourceTrackId === sourceTrackId && pendingProgressiveCues.length;
        const hasUntranslatedComplete = progressiveTranscriptTrackKeys.has(key)
          && completeSourceTranscript?.videoId === videoId && completeSourceTranscript.sourceTrackId === sourceTrackId;
        if (!hasPendingProgressive && !hasUntranslatedComplete) return;
      }
      if (activeTranslationRequestKey === key && activeTranslationRequestId
        && !terminalTranslationRequestIds.has(activeTranslationRequestId)) return;
      if (googleTranslationAttempts.has(key)
        || (fullTranscriptAttempts.has(key) && !progressiveTranscriptTrackKeys.has(key))) {
        logCaptionDebug('translation-source-already-attempted', {
          googleAttempted: googleTranslationAttempts.has(key),
          transcriptAttempted: fullTranscriptAttempts.has(key),
        });
        return;
      }
      fullTranscriptAttempts.add(key);
      if (pendingProgressiveSourceTrackId === sourceTrackId && pendingProgressiveCues.length) {
        progressiveTranscriptTrackKeys.add(key);
      }

      const sendTranscript = (transcript, appendToExisting = false) => {
        if (!transcript.length) {
          logCaptionDebug('translation-source-empty');
          fullTranscriptAttempts.delete(key);
          return;
        }
        if (currentVideoId !== videoId || settings.language !== targetLanguage
        || getSourceTrackId() !== sourceTrackId) {
          logCaptionDebug('translation-source-selection-changed');
          fullTranscriptAttempts.delete(key);
          return;
        }
        let semanticCues = groupCues(transcript).map(({ start, end, text }) => ({ start, end, text }));
        if (progressiveTranscriptTrackKeys.has(key)) {
          semanticCues = semanticCues.filter(cue => getUntranslatedTranscriptCues(key, [cue]).length);
        }
        if (!semanticCues.length) return;
        if (activeTranslationRequestKey === key && activeTranslationRequestId
          && !terminalTranslationRequestIds.has(activeTranslationRequestId)) return;
        const snapshot = {
          key, videoId, targetLanguage, sourceLanguage, sourceTrackId,
          cues: semanticCues,
          sourceRanges: semanticCues.map(({ start, end }) => ({ start, end })),
          appendToExisting,
        };
    translationSnapshots.set(key, snapshot);
        const requestTranslation = () => {
          if (currentVideoId !== videoId || settings.language !== targetLanguage || getSourceTrackId() !== sourceTrackId) return;
          postTranslationSnapshot(snapshot);
        };

      const getObservedFallbackCues = () => {
        if (pendingProgressiveSourceTrackId === sourceTrackId && pendingProgressiveCues.length) {
          const batch = pendingProgressiveCues;
          pendingProgressiveCues = [];
          return batch;
        }
        if (completeSourceTranscript?.videoId === videoId && completeSourceTranscript.cues.length
          && (completeSourceTranscript.sourceTrackId === sourceTrackId
            || normalizeLanguage(completeSourceTranscript.sourceLanguage) === normalizeLanguage(sourceLanguage))) {
          return completeSourceTranscript.cues;
        }
        if (cues.source.length && normalizeLanguage(sourceCaptionLanguage) === normalizeLanguage(sourceLanguage)) {
          return cues.source;
        }
        const observed = observedCaptionCues.get(normalizeLanguage(sourceLanguage));
        if (observed?.videoId === videoId && observed.cues.length) {
          logCaptionDebug('observed-caption-fallback-found', {
            sourceLanguage,
            cueCount: observed.cues.length,
          });
          return observed.cues;
        }
        logCaptionDebug('observed-caption-fallback-missing', {
          sourceLanguage,
          observedLanguage: observed ? normalizeLanguage(sourceLanguage) : '',
          observedVideoMatches: observed?.videoId === videoId,
          cueCount: observed?.cues.length || 0,
        });
        return [];
      };
        const targetTrack = getDirectTargetTrack(sourceTrack);
        if (!targetTrack) {
          requestTranslation();
          return;
        }
        const targetTrackId = getSourceTrackId(targetTrack);
        const directKey = `${videoId}|${targetLanguage}|${targetTrackId}`;
        if (directTrackAttempts.has(directKey)) {
          requestTranslation();
          return;
        }
        directTrackAttempts.add(directKey);
        const targetUrl = new URL(targetTrack.baseUrl, location.href);
        if (targetUrl.origin !== location.origin || !targetUrl.pathname.includes('/api/timedtext')) {
          requestTranslation();
          return;
        }
        targetUrl.searchParams.set('fmt', 'json3');
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 8000);
        pageFetch(targetUrl.href, { credentials: 'include', signal: controller.signal })
          .then(response => response.ok ? response.text() : '')
          .then(payload => {
          if (requestGeneration !== translationGeneration || currentVideoId !== videoId || settings.language !== targetLanguage) return false;
            const targetCues = parseCaptionPayload(payload);
            if (!targetCues.length) return false;
            cues.translated = targetCues;
            rawTranslatedCues = targetCues;
            translationCache.set(getTranslationCacheKey(videoId, targetLanguage, sourceTrackId), targetCues);
            translationRetryCounts.delete(key);
            translationSnapshots.delete(key);
            createOverlay();
            updateOverlay();
            rememberCues();
            return true;
          })
          .catch(() => false)
          .then(loaded => { if (!loaded) requestTranslation(); })
          .finally(() => window.clearTimeout(timeout));
      };

      const observedTranscript = completeSourceTranscript;
      if (observedTranscript?.videoId === videoId && observedTranscript.sourceTrackId === sourceTrackId
        && observedTranscript.cues.length) {
        logCaptionDebug('translation-source-using-observed-transcript', { cueCount: observedTranscript.cues.length });
        if (progressiveTranscriptTrackKeys.has(key)) postRemainingCompleteTranscript();
        else sendTranscript(observedTranscript.cues);
        return;
      }

      if (progressiveTranscriptTrackKeys.has(key)) {
        if (pendingProgressiveSourceTrackId === sourceTrackId && pendingProgressiveCues.length) {
          const batch = pendingProgressiveCues;
          pendingProgressiveCues = [];
          logCaptionDebug('using-progressive-caption-cues', { cueCount: batch.length });
          sendTranscript(batch, cues.translated.length > 0);
        }
      }

      if (sourceTranscriptFetch?.key === key) return;

  // Fetch the complete transcript while progressively translating observed chunks.
      if (!sourceTrack?.baseUrl) {
        logCaptionDebug('translation-stopped-no-track-url', { sourceLanguage, targetLanguage });
        fullTranscriptAttempts.delete(key);
        return;
      }

      let transcriptUrl;
      try {
        transcriptUrl = new URL(sourceTrack.baseUrl, location.href);
        if (transcriptUrl.origin !== location.origin || !transcriptUrl.pathname.includes('/api/timedtext')) {
          fullTranscriptAttempts.delete(key);
          return;
        }
        transcriptUrl.searchParams.set('fmt', 'json3');
      } catch {
      fullTranscriptAttempts.delete(key);
      return;
      }

      const controller = new AbortController();
      const fetchState = { key, controller };
      sourceTranscriptFetch = fetchState;
      const fetchTimeout = window.setTimeout(() => controller.abort(), 8000);
      logCaptionDebug('source-transcript-fetch-started', { sourceLanguage, targetLanguage });
      pageFetch(transcriptUrl.href, { credentials: 'include', signal: controller.signal })
        .then(response => {
          logCaptionDebug('source-transcript-response', { status: response.status, ok: response.ok });
          return response.ok ? response.text() : '';
        })
      .then(payload => {
        const sameSourceTrack = getSourceTrackId() === sourceTrackId
          || (currentCaptionTrackId === 'off' && sourceTranscriptFetch?.key === key);
        if (currentVideoId !== videoId || settings.language !== targetLanguage || !sameSourceTrack) return;
        const fullCues = parseCaptionPayload(payload);
        logCaptionDebug('source-transcript-parsed', { cueCount: fullCues.length });
      if (fullCues.length) {
        completeSourceTranscript = { videoId, sourceTrackId, sourceLanguage, cues: fullCues };
        cues.source = mergeCues(cues.source, fullCues);
        createOverlay();
        updateOverlay();
        rememberCues();
        if (progressiveTranscriptTrackKeys.has(key)) postRemainingCompleteTranscript();
        else sendTranscript(fullCues);
        return;
      }
      // Some YouTube tracks return an empty full transcript despite delivering caption chunks.
      progressiveTranscriptTrackKeys.add(key);
      fullTranscriptAttempts.delete(key);
      const batch = getObservedFallbackCues();
      if (batch.length) {
        logCaptionDebug('using-progressive-caption-cues', { cueCount: batch.length });
        sendTranscript(batch, cues.translated.length > 0);
      }
    })
        .catch(() => {
          if (currentVideoId === videoId && settings.language === targetLanguage
            && getSourceTrackId() === sourceTrackId) {
            progressiveTranscriptTrackKeys.add(key);
            fullTranscriptAttempts.delete(key);
          const batch = getObservedFallbackCues();
          if (batch.length) {
            logCaptionDebug('using-progressive-caption-cues', { cueCount: batch.length });
            sendTranscript(batch, cues.translated.length > 0);
          }
        }
      })
        .finally(() => {
          window.clearTimeout(fetchTimeout);
          if (sourceTranscriptFetch === fetchState) sourceTranscriptFetch = null;
        });
    }, 0);
  }

  window.addEventListener('message', event => {
    const message = event.data;
    if (event.source !== window || event.origin !== location.origin || message?.source !== SETTINGS_SOURCE) return;
    if (message.type === 'subtitle-track-selection-result') {
      if (message.videoId !== currentVideoId || message.requestId !== captionSelectionRequestId) return;
      window.clearTimeout(captionSelectionRequestTimer);
      captionSelectionRequestTimer = 0;
      savedCaptionSelection = message.track ? { videoId: message.videoId, track: message.track } : null;
      restoreSavedCaptionSelection();
      return;
    }
    if (message.type === 'subtitle-translation-progress') {
      logCaptionDebug('translation-progress', {
        status: message.status || '',
        reason: message.reason || '',
        completed: message.completed || 0,
        total: message.total || 0,
      });
      updateTranslationProgress(message);
      return;
    }
    if (message.type !== 'google-translate-transcript-result') return;
    const requestGeneration = translationRequestGenerations.get(message.requestId);
    translationRequestGenerations.delete(message.requestId);
    const sourceRanges = translationRequestSourceRanges.get(message.requestId) || [];
    translationRequestSourceRanges.delete(message.requestId);
    const requestTrackId = translationRequestTrackIds.get(message.requestId);
    translationRequestTrackIds.delete(message.requestId);
    const requestMode = translationRequestModes.get(message.requestId);
    translationRequestModes.delete(message.requestId);
    if (activeTranslationRequestId === message.requestId) activeTranslationRequestId = '';
    if (activeTranslationRequestKey === getTranslationCacheKey(message.videoId, message.targetLanguage, message.sourceTrackId)) {
      activeTranslationRequestKey = '';
    }
    const sameTranslation = message.videoId === currentVideoId
      && message.targetLanguage === settings.language
      && (message.sourceTrackId === getSourceTrackId()
        || (currentCaptionTrackId === 'off' && requestTrackId === message.sourceTrackId));
    if (!sameTranslation || requestGeneration !== translationGeneration) return;
    if (message.ok !== true || !Array.isArray(message.cues)) {
      googleTranslationAttempts.delete(getTranslationCacheKey(message.videoId, message.targetLanguage, message.sourceTrackId));
      return;
    }
    logCaptionDebug('translation-result-accepted', {
      cueCount: message.cues.length,
      staleGeneration: false,
    });
    const appendToExisting = requestMode === true;
    rawTranslatedCues = appendToExisting ? mergeCues(rawTranslatedCues, message.cues) : message.cues;
    cues.translated = rawTranslatedCues;
    const translationKey = getTranslationCacheKey(message.videoId, message.targetLanguage, message.sourceTrackId);
    if (sourceRanges.length) {
      const translatedRanges = translatedSourceRanges.get(translationKey) || [];
      translatedRanges.push(...sourceRanges);
      translatedSourceRanges.set(translationKey, translatedRanges);
    }
    googleTranslationAttempts.delete(translationKey);
    translationRetryCounts.delete(translationKey);
    translationSnapshots.delete(translationKey);
    translationCache.set(translationKey, rawTranslatedCues);
    if (currentCaptionTrackId !== 'off') {
      createOverlay();
      updateOverlay();
      rememberCues();
    }
    if (completeSourceTranscript?.videoId === currentVideoId
      && completeSourceTranscript.sourceTrackId === message.sourceTrackId) {
      postRemainingCompleteTranscript();
    } else if (progressiveTranscriptTrackKeys.has(translationKey)
      && pendingProgressiveSourceTrackId === message.sourceTrackId && pendingProgressiveCues.length) {
      requestGoogleTranslation();
    }
  });

  async function ensureOriginalCaptionTrack(key, state) {
    if (state.sourceRetryAfter > Date.now() || state.sourceCount >= 3 || autoTranslationInFlight) return;
    state.sourceCount = (state.sourceCount || 0) + 1;
    state.sourceRetryAfter = Date.now() + 5000;
    autoTranslationAttempts.set(key, state);
    autoTranslationInFlight = true;
    try {
      const currentTrack = getPlayerCaptionTrack();
      const preferredTrack = getPreferredSourceTrack();
      if (!preferredTrack) {
        state.sourceRequested = true;
        return;
      }
      const playerTrack = resolvePlayerCaptionTrack(preferredTrack);
      if (!playerTrack) return;
      if (normalizeLanguage(currentTrack.languageCode) === normalizeLanguage(playerTrack.languageCode)
        && !currentTrack.translationLanguage?.languageCode) {
        state.sourceRequested = true;
        return;
      }
      state.sourceRequested = setPlayerCaptionTrack(playerTrack);
    } finally {
      autoTranslationInFlight = false;
    }
  }

  function observeCaptionResponse(rawUrl, payload) {
    if (!settings.enabled || !currentVideoId || !rawUrl) return;
    const url = normalizedRequestUrl(rawUrl);
    if (!url || url.origin !== location.origin || !url.pathname.includes('/api/timedtext')) return;
    const requestVideoId = url.searchParams.get('v') || url.searchParams.get('video_id');
    if (requestVideoId && requestVideoId !== currentVideoId) return;
    const language = url.searchParams.get('lang') || '';
    const targetLanguage = url.searchParams.get('tlang');
    const parsedCues = parseCaptionPayload(payload);
    if (!parsedCues.length) return;

    if (targetLanguage) return;
    const observedKey = normalizeLanguage(language);
    const previousObserved = observedCaptionCues.get(observedKey);
    const observedCues = previousObserved?.videoId === currentVideoId
      ? mergeCues(previousObserved.cues, parsedCues)
      : parsedCues;
    observedCaptionCues.delete(observedKey);
    observedCaptionCues.set(observedKey, { videoId: currentVideoId, cues: observedCues });
    logCaptionDebug('observed-caption-cues-buffered', { responseLanguage: language, cueCount: observedCues.length });
    while (observedCaptionCues.size > 8) observedCaptionCues.delete(observedCaptionCues.keys().next().value);
    const preferredTrack = getPreferredSourceTrack();
    if (preferredTrack?.languageCode
      && normalizeLanguage(language) !== normalizeLanguage(preferredTrack.languageCode)) {
      const responseKey = normalizeLanguage(language);
      unmatchedCaptionResponses.delete(responseKey);
      unmatchedCaptionResponses.set(responseKey, {
        videoId: currentVideoId,
        language,
        cues: parsedCues,
        complete: !url.searchParams.has('start') && !url.searchParams.has('dur'),
        receivedAt: Date.now(),
      });
      while (unmatchedCaptionResponses.size > 8) {
        unmatchedCaptionResponses.delete(unmatchedCaptionResponses.keys().next().value);
      }
      logCaptionDebug('caption-response-ignored', {
        responseLanguage: language,
        selectedLanguage: preferredTrack.languageCode,
      });
      logCaptionDebug('caption-response-buffered', { responseLanguage: language, cueCount: parsedCues.length });
      return;
    }
    logCaptionDebug('caption-response-accepted', { responseLanguage: language });

    if (captionReloadRetryTimer) {
      window.clearTimeout(captionReloadRetryTimer);
      captionReloadRetryTimer = 0;
    }

    const trackId = url.searchParams.get('vssId') || url.searchParams.get('kind') || language;
    const key = currentVideoId + '|' + settings.language + '|' + trackId;
    if (currentKey !== key) {
      currentKey = key;
      rawTranslatedCues = translationCache.get(getTranslationCacheKey()) || [];
      cues = { source: [], translated: rawTranslatedCues };
    }
    sourceCaptionLanguage = language;
    const sourceTrackId = getSourceTrackId(preferredTrack);
    if (pendingProgressiveSourceTrackId !== sourceTrackId) {
      pendingProgressiveSourceTrackId = sourceTrackId;
      pendingProgressiveCues = [];
    }
    const previousPendingCueCount = pendingProgressiveCues.length;
    pendingProgressiveCues = mergeCues(pendingProgressiveCues, parsedCues);
    const sourceKey = getTranslationCacheKey(currentVideoId, settings.language, sourceTrackId);
    if (pendingProgressiveCues.length > previousPendingCueCount
      && (fullTranscriptAttempts.has(sourceKey) || sourceTranscriptFetch?.key === sourceKey)) {
      progressiveTranscriptTrackKeys.add(sourceKey);
      logCaptionDebug('progressive-translation-started', { cueCount: pendingProgressiveCues.length });
    }
    if (pendingProgressiveCues.length > previousPendingCueCount && progressiveTranscriptTrackKeys.has(sourceKey)) {
      logCaptionDebug('progressive-caption-cues-extended', { cueCount: pendingProgressiveCues.length });
    }
    if (!url.searchParams.has('start') && !url.searchParams.has('dur')) {
      completeSourceTranscript = {
        videoId: currentVideoId,
        sourceTrackId,
        sourceLanguage: language,
        cues: parsedCues,
      };
    }
    if (isTraditionalChinese(language)) {
      rawTranslatedCues = [];
      cues.translated = [];
      translationCache.delete(getTranslationCacheKey());
    }
    cues.source = mergeCues(cues.source, parsedCues);
    cues.translated = rawTranslatedCues;
    requestGoogleTranslation();
    createOverlay();
    updateOverlay();
    rememberCues();
  }

  function installXhrObserver() {
    const nativeOpen = XMLHttpRequest.prototype.open;
    const nativeSend = XMLHttpRequest.prototype.send;
    const requestUrls = new WeakMap();
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (watchingVideo && String(url).includes('/api/timedtext')) requestUrls.set(this, String(url));
    else requestUrls.delete(this);
    return nativeOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    const url = requestUrls.get(this) || '';
    if (watchingVideo && url.includes('/api/timedtext')) {
        this.addEventListener('load', () => observeCaptionResponse(url, readXhrPayload(this)), { once: true });
      }
      return nativeSend.apply(this, args);
    };
  }

  function installFetchObserver() {
    const nativeFetch = pageFetch;
  window.fetch = function (...args) {
    if (!watchingVideo) return nativeFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const result = nativeFetch.apply(this, args);
      if (!String(url).includes('/api/timedtext')) return result;
      return result.then(response => {
        response.clone().text().then(payload => observeCaptionResponse(String(url), payload)).catch(() => {});
        return response;
      });
    };
  }

function sync() {
  const nextVideoId = getVideoId();
  const videoChanged = nextVideoId !== currentVideoId;
  watchingVideo = Boolean(nextVideoId);
    const nextPlayer = document.querySelector('#movie_player');
    const nextVideo = nextPlayer?.querySelector('video.html5-main-video, video');
    const nextAudioTrackId = getActiveAudioTrackId(getActiveAudioTrack(nextPlayer));
    const nextCaptionTrack = getPlayerCaptionTrack(nextPlayer);
    const nextCaptionTrackId = getCaptionTrackSelectionId(nextCaptionTrack);
    if (nextVideoId === currentVideoId && nextPlayer === player && nextAudioTrackId !== currentAudioTrackId) {
      handleAudioTrackChange(nextAudioTrackId);
    }
    if (nextVideoId === currentVideoId && nextPlayer === player && nextCaptionTrackId !== currentCaptionTrackId) {
      handleCaptionTrackChange(nextCaptionTrack, nextCaptionTrackId);
    }
    if (nextVideoId !== currentVideoId || nextPlayer !== player || nextVideo !== video) {
      player?.classList.remove('yt-toolkit-bilingual-enabled');
      if (nextVideoId !== currentVideoId) {
      captionsDefaultedVideoId = '';
      fallbackSourceTrackId = '';
      sourceSelectionUnconfirmed = false;
      sourceSelectionInferred = false;
        window.clearTimeout(googleTranslationTimer);
        googleTranslationTimer = 0;
      }
      if (nextVideoId !== currentVideoId || nextPlayer !== player || nextVideo !== video) {
        window.clearTimeout(captionReloadRetryTimer);
        captionReloadRetryTimer = 0;
        captionReloadRetryVideoId = '';
        if (nextPlayer !== player || nextVideo !== video) captionsDefaultedVideoId = '';
      }
      removeOverlay();
      if (video) video.removeEventListener('timeupdate', checkActiveAudioTrack);
      currentVideoId = nextVideoId;
      currentAudioTrackId = nextAudioTrackId;
      currentCaptionTrackId = nextCaptionTrackId;
  if (videoChanged) {
    savedCaptionSelection = null;
    manualCaptionTrackVideoId = '';
    manualCaptionTrackId = '';
    manualCaptionTrack = null;
    observedCaptionCues.clear();
        progressiveTranscriptTrackKeys.clear();
        translationRequestModes.clear();
        translationRequestSourceRanges.clear();
        translationRequestTrackIds.clear();
        translatedSourceRanges.clear();
        activeTranslationRequestKey = '';
        sourceTranscriptFetch?.controller.abort();
        sourceTranscriptFetch = null;
        pendingProgressiveSourceTrackId = '';
        pendingProgressiveCues = [];
        requestSavedCaptionSelection(nextVideoId);
      }
      translationGeneration++;
      translationRequestGenerations.clear();
      translationRequestSourceRanges.clear();
      translationRequestTrackIds.clear();
      translatedSourceRanges.clear();
      activeTranslationRequestId = '';
      activeTranslationRequestKey = '';
      sourceTranscriptFetch?.controller.abort();
      sourceTranscriptFetch = null;
      sourceCaptionLanguage = '';
      completeSourceTranscript = null;
      fallbackSourceTrackId = '';
  sourceSelectionUnconfirmed = false;
  sourceSelectionInferred = false;
      player = nextPlayer;
      video = nextVideo;
      currentKey = '';
      cues = { source: [], translated: [] };
      rawTranslatedCues = translationCache.get(getTranslationCacheKey()) || [];
      video?.addEventListener('timeupdate', checkActiveAudioTrack, { passive: true });
    }
  player?.classList.toggle('yt-toolkit-bilingual-enabled', settings.enabled);
  restoreSavedCaptionSelection();
  ensureNativeCaptionsDefault();
    if (!settings.enabled || !player || !video || player.classList.contains('ad-showing')) {
      removeOverlay();
      return;
    }
    updateOverlay();
    ensureNativeAutoTranslation();
    const cacheKey = getTranslationCacheKey();
    if (cache.has(cacheKey)) {
      cues = cache.get(cacheKey);
      createOverlay();
      updateOverlay();
    }
  }

  function rememberCues() {
    if (!currentVideoId || !cues.source.length) return;
    const key = getTranslationCacheKey();
    cache.set(key, { source: cues.source, translated: cues.translated });
    if (cache.size > MAX_CUE_CACHE) cache.delete(cache.keys().next().value);
  }

  function handleAudioTrackChange(nextAudioTrackId) {
    if (!nextAudioTrackId || nextAudioTrackId === currentAudioTrackId) return false;
    currentAudioTrackId = nextAudioTrackId;
    translationGeneration++;
    translationRequestGenerations.clear();
    sourceCaptionLanguage = '';
    completeSourceTranscript = null;
    fallbackSourceTrackId = '';
    sourceSelectionUnconfirmed = false;
    sourceSelectionInferred = false;
    currentKey = '';
    cues = { source: [], translated: [] };
    rawTranslatedCues = [];
    captionsDefaultedVideoId = '';
    window.clearTimeout(googleTranslationTimer);
    googleTranslationTimer = 0;
    window.clearTimeout(captionReloadRetryTimer);
    captionReloadRetryTimer = 0;
    captionReloadRetryVideoId = '';
    autoTranslationAttempts.delete(currentVideoId + '|' + settings.language);
    removeOverlay();
    return true;
  }

function handleCaptionTrackChange(nextTrack, nextTrackId = getCaptionTrackSelectionId(nextTrack), restorePreference = false) {
    if (nextTrackId === currentCaptionTrackId) return false;
    const manualSelection = programmaticCaptionTrackId !== nextTrackId;
    const nextSourceTrackId = getSourceTrackId(nextTrack || getPreferredSourceTrack());
    const nextTranslationKey = getTranslationCacheKey(currentVideoId, settings.language, nextSourceTrackId);
    const isNativeToggle = nextTrackId === 'off' || currentCaptionTrackId === 'off';
    const preserveInFlightRequest = isNativeToggle
      && (sourceTranscriptFetch?.key === nextTranslationKey
        || activeTranslationRequestKey === nextTranslationKey
        || (completeSourceTranscript?.videoId === currentVideoId
          && completeSourceTranscript.sourceTrackId === nextSourceTrackId));
    programmaticCaptionTrackId = '';
    window.clearTimeout(programmaticCaptionTrackTimer);
    programmaticCaptionTrackTimer = 0;
    currentCaptionTrackId = nextTrackId;
    if (!preserveInFlightRequest) {
      translationGeneration++;
      translationRequestModes.clear();
      pendingProgressiveSourceTrackId = '';
      pendingProgressiveCues = [];
      completeSourceTranscript = null;
      fallbackSourceTrackId = '';
      sourceSelectionUnconfirmed = false;
      sourceSelectionInferred = false;
    }
    if (nextTrack?.languageCode) sourceCaptionLanguage = nextTrack.languageCode;
    else if (!preserveInFlightRequest) sourceCaptionLanguage = '';
    currentKey = '';
    cues = { source: [], translated: [] };
    rawTranslatedCues = [];
    window.clearTimeout(googleTranslationTimer);
    googleTranslationTimer = 0;
    window.clearTimeout(captionReloadRetryTimer);
    captionReloadRetryTimer = 0;
    captionReloadRetryVideoId = '';
    if (manualSelection || restorePreference) setManualCaptionTrack(nextTrack, nextTrackId);
    logCaptionDebug('caption-track-changed', {
      selectedLanguage: nextTrack?.languageCode || '',
      manualSelection: manualSelection || restorePreference,
      hasTrackUrl: Boolean(nextTrack?.baseUrl),
    });
    const videoKeyPrefix = `${currentVideoId}|`;
    if (!preserveInFlightRequest) {
      for (const key of googleTranslationAttempts) if (key.startsWith(videoKeyPrefix)) googleTranslationAttempts.delete(key);
      for (const key of fullTranscriptAttempts) if (key.startsWith(videoKeyPrefix)) fullTranscriptAttempts.delete(key);
      for (const key of directTrackAttempts) if (key.startsWith(videoKeyPrefix)) directTrackAttempts.delete(key);
      for (const key of translationSnapshots.keys()) if (key.startsWith(videoKeyPrefix)) translationSnapshots.delete(key);
      for (const key of translationRetryCounts.keys()) if (key.startsWith(videoKeyPrefix)) translationRetryCounts.delete(key);
    }
    const bufferedResponse = unmatchedCaptionResponses.get(normalizeLanguage(nextTrack?.languageCode));
    if (bufferedResponse?.videoId === currentVideoId && Date.now() - bufferedResponse.receivedAt < 30_000) {
      unmatchedCaptionResponses.delete(normalizeLanguage(nextTrack.languageCode));
      const sourceTrackId = getSourceTrackId(nextTrack);
      pendingProgressiveSourceTrackId = sourceTrackId;
      pendingProgressiveCues = bufferedResponse.cues;
      cues.source = mergeCues(cues.source, bufferedResponse.cues);
      if (bufferedResponse.complete) {
      completeSourceTranscript = {
        videoId: currentVideoId,
        sourceTrackId,
        sourceLanguage: nextTrack.languageCode,
        cues: bufferedResponse.cues,
      };
      } else {
        progressiveTranscriptTrackKeys.add(getTranslationCacheKey(currentVideoId, settings.language, sourceTrackId));
      }
      logCaptionDebug('caption-response-recovered', {
        selectedLanguage: nextTrack.languageCode,
        cueCount: bufferedResponse.cues.length,
        complete: bufferedResponse.complete,
      });
    }
    removeOverlay();
    if (manualSelection) saveCaptionSelection(nextTrack || {}, nextTrackId);
  if (nextTrackId !== 'off') requestGoogleTranslation();
  return true;
}

function resetTranslationAttemptsForCaptionReenable() {
  const requestId = activeTranslationRequestId;
  const sourceTrackId = getSourceTrackId(getPreferredSourceTrack());
  const key = getTranslationCacheKey(currentVideoId, settings.language, sourceTrackId);
  if (requestId && activeTranslationRequestKey === key && !terminalTranslationRequestIds.has(requestId)) return false;
  googleTranslationAttempts.delete(key);
  fullTranscriptAttempts.delete(key);
  translationRetryCounts.delete(key);
  translationSnapshots.delete(key);
  autoTranslationAttempts.delete(`${currentVideoId}|${settings.language}`);
  return true;
}

  function checkActiveAudioTrack() {
    const audioTrackId = getActiveAudioTrackId();
    if (audioTrackId && audioTrackId !== currentAudioTrackId) {
      sync();
      return;
    }
    if (getCaptionTrackSelectionId(getPlayerCaptionTrack()) !== currentCaptionTrackId) {
      sync();
      return;
    }
    updateOverlay();
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== SETTINGS_SOURCE || event.data?.type !== 'bilingual-subtitles-settings') return;
    const previousLanguage = settings.language;
    const previousEnabled = settings.enabled;
    if (previousLanguage !== event.data.subtitleLanguage) rememberCues();
    settings = {
      enabled: event.data.dualSubtitles !== false,
      language: /^[\w-]{2,12}$/.test(event.data.subtitleLanguage || '') ? event.data.subtitleLanguage : 'zh-Hant',
      translatedSubtitleColor: /^#[\da-fA-F]{6}$/.test(event.data.translatedSubtitleColor || '') ? event.data.translatedSubtitleColor : '#ffe680',
      rgbSubtitleMode: RGB_MODES.has(event.data.rgbSubtitleMode)
        ? event.data.rgbSubtitleMode
        : event.data.rgbSubtitleAnimation === true ? 'rainbow' : 'off',
      progressLabels: event.data.progressLabels || settings.progressLabels,
    };
    translatedLine?.style.setProperty('--translated-subtitle-color', settings.translatedSubtitleColor);
    applyTranslatedSubtitleMode(settings.rgbSubtitleMode);
    const languageChanged = previousLanguage !== settings.language;
    const subtitlesDisabled = previousEnabled && !settings.enabled;
    if (languageChanged || subtitlesDisabled) {
      translationGeneration++;
      translationRequestGenerations.clear();
      translationRequestModes.clear();
      window.clearTimeout(googleTranslationTimer);
      googleTranslationTimer = 0;
      window.clearTimeout(progressWatchdogTimer);
      progressWatchdogTimer = 0;
      activeTranslationRequestId = '';
    }
    if (languageChanged) {
      fallbackSourceTrackId = '';
      sourceSelectionUnconfirmed = false;
      sourceSelectionInferred = false;
      currentKey = '';
      cues = { source: [], translated: [] };
      rawTranslatedCues = translationCache.get(getTranslationCacheKey()) || [];
      autoTranslationAttempts.delete(currentVideoId + '|' + previousLanguage);
    }
    sync();
    if (settings.enabled && (languageChanged || !previousEnabled)) {
      const sourceTrack = getPreferredSourceTrack();
      const sourceTrackId = getSourceTrackId(sourceTrack);
      const translationKey = getTranslationCacheKey(currentVideoId, settings.language, sourceTrackId);
      autoTranslationAttempts.delete(currentVideoId + '|' + settings.language);
      fullTranscriptAttempts.delete(translationKey);
      googleTranslationAttempts.delete(translationKey);
      translationRetryCounts.delete(translationKey);
      requestGoogleTranslation();
    }
  });

  installXhrObserver();
  installFetchObserver();
document.addEventListener('yt-navigate-finish', sync);
document.addEventListener('yt-page-data-updated', sync);
document.addEventListener('loadedmetadata', sync, true);
document.addEventListener('click', event => {
const captionButton = event.composedPath().find(node => node instanceof Element && node.matches('.ytp-subtitles-button'));
const captionsWereEnabled = captionButton?.getAttribute('aria-pressed') === 'true';
if (!captionButton && !player?.contains(event.target)) return;
window.clearTimeout(captionTrackPollTimer);
const previousTrackId = getCaptionTrackSelectionId(getPlayerCaptionTrack());
let pollAttempts = 0;
const pollCaptionTrackChange = () => {
sync();
const currentTrackId = getCaptionTrackSelectionId(getPlayerCaptionTrack());
if (currentTrackId !== previousTrackId || ++pollAttempts >= 20) {
  captionTrackPollTimer = 0;
} else {
  captionTrackPollTimer = window.setTimeout(pollCaptionTrackChange, 100);
}
};
captionTrackPollTimer = window.setTimeout(pollCaptionTrackChange, 100);
window.setTimeout(() => {
if (captionButton?.isConnected && captionButton.getAttribute('aria-pressed') === 'true') {
if (!captionsWereEnabled) {
  const reset = resetTranslationAttemptsForCaptionReenable();
  logCaptionDebug('native-captions-enabled', { resetTranslationAttempts: reset });
}
requestGoogleTranslation();
}
}, 100);
}, true);
window.addEventListener('popstate', sync);
window.addEventListener('resize', updateOverlay, { passive: true });
sync();
})();
