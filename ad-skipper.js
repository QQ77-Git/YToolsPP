(() => {
  'use strict';

  const DEFAULT_ENABLED = true;
  const MAX_PLAYBACK_RATE = 16;
const AD_CHECK_MS = 300;
  let enabled = DEFAULT_ENABLED;
  let player = null;
  let video = null;
  let observer = null;
  let timer = null;
  let adActive = false;
  let originalRate = 1;
  let originalMuted = false;
  let originalVolume = 1;

  function isAdShowing() {
    if (!player) return false;
    return player.classList.contains('ad-showing') ||
      player.classList.contains('ad-interrupting') ||
      Boolean(player.querySelector('.ytp-ad-player-overlay, .ytp-ad-preview-container'));
  }

  function clickSkipButton() {
    const button = player?.querySelector(
      '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .videoAdUiSkipButton'
    );
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
    button.click();
    return true;
  }

  function beginAd() {
    if (!adActive && video) {
      originalRate = Number.isFinite(video.playbackRate) ? video.playbackRate : 1;
      originalMuted = video.muted;
      originalVolume = video.volume;
      adActive = true;
    }
    if (!video) return;

    if (clickSkipButton()) return;
    video.muted = true;
    video.volume = 0;
    if (video.playbackRate < MAX_PLAYBACK_RATE) video.playbackRate = MAX_PLAYBACK_RATE;

    const duration = video.duration;
    if (Number.isFinite(duration) && duration > 0 && video.currentTime < duration - 0.15) {
      try {
        video.currentTime = Math.max(video.currentTime, duration - 0.1);
      } catch {
        // Some ad streams reject seeking; the skip button and increased rate still apply.
      }
    }
  }

  function endAd() {
    if (!adActive) return;
    adActive = false;
    if (!video) return;
    video.playbackRate = originalRate;
    video.muted = originalMuted;
    video.volume = originalVolume;
  }

  function check() {
    const nextPlayer = document.querySelector('#movie_player');
    const nextVideo = nextPlayer?.querySelector('video.html5-main-video, video');
    if (nextPlayer !== player) {
      observer?.disconnect();
      observer = null;
      player = nextPlayer;
    }
    if (nextVideo !== video) {
      endAd();
      video = nextVideo;
    }

    if (!enabled) {
      observer?.disconnect();
      observer = null;
      endAd();
      return;
    }
    if (player && !observer) {
      observer = new MutationObserver(scheduleCheck);
      observer.observe(player, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    }
    if (isAdShowing()) beginAd();
    else endAd();
  }

function scheduleCheck() {
  check();
  window.clearTimeout(timer);
  timer = adActive ? window.setTimeout(scheduleCheck, AD_CHECK_MS) : 0;
  }

  chrome.storage.sync.get({ adSkip: DEFAULT_ENABLED }, settings => {
    if (!chrome.runtime.lastError) enabled = settings.adSkip !== false;
    scheduleCheck();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' || !changes.adSkip) return;
    enabled = changes.adSkip.newValue !== false;
    scheduleCheck();
  });

document.addEventListener('yt-navigate-finish', scheduleCheck);
document.addEventListener('yt-page-data-updated', scheduleCheck);
document.addEventListener('loadedmetadata', scheduleCheck, true);
window.addEventListener('popstate', scheduleCheck);
})();
