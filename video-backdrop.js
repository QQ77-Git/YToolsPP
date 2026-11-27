(() => {
  'use strict';

  const defaults = { playerBackground: 'black' };
  let background = defaults.playerBackground;
  let lastVideo = null;
  let canvas = null;
  let context = null;
let drawTimer = 0;
  let cropCandidateKey = '';
  let cropCandidateCount = 0;
let appliedCropKey = '';
let cropVideo = null;
let cropDetectionVideoKey = '';
const analysisCanvas = document.createElement('canvas');
analysisCanvas.width = 160;
analysisCanvas.height = 90;
const analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true });
let backdropCrop = { left: 0, right: analysisCanvas.width };
let backdropCropCandidateKey = '';
let backdropCropCandidateCount = 0;
let stateSyncTimer = 0;
let syncFallbackTimer = 0;
let observedFlexy = null;
let observedPlayer = null;
let observedMiniPlayer = null;
let cropPlaybackVideo = null;
const playerStateObserver = new MutationObserver(scheduleSync);

  chrome.storage.sync.get(defaults, settings => {
    if (!chrome.runtime.lastError) background = settings.playerBackground || defaults.playerBackground;
    syncBackdrop();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.playerBackground) return;
    background = changes.playerBackground.newValue || defaults.playerBackground;
    syncBackdrop();
  });

document.addEventListener('yt-navigate-finish', syncBackdrop);
document.addEventListener('yt-page-data-updated', syncBackdrop);
document.addEventListener('loadedmetadata', syncBackdrop, true);
document.addEventListener('loadeddata', syncBackdrop, true);
window.addEventListener('resize', scheduleSync, { passive: true });
document.addEventListener('click', event => {
  if (event.target.closest?.('.ytp-size-button, .ytp-miniplayer-button')) scheduleSync();
}, true);

function scheduleSync() {
  if (stateSyncTimer) return;
  stateSyncTimer = window.setTimeout(() => {
    stateSyncTimer = 0;
    syncBackdrop();
  }, 80);
}

function observePlayerState(flexy, player, miniPlayer) {
  if (flexy === observedFlexy && player === observedPlayer && miniPlayer === observedMiniPlayer) return;
  playerStateObserver.disconnect();
  observedFlexy = flexy;
  observedPlayer = player;
  observedMiniPlayer = miniPlayer;
  if (flexy) playerStateObserver.observe(flexy, { attributes: true, attributeFilter: ['theater'] });
  if (player) playerStateObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
  if (miniPlayer) playerStateObserver.observe(miniPlayer, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
}

function scheduleSyncFallback() {
window.clearTimeout(syncFallbackTimer);
const isPlayingCropDetection = cropVideo && cropVideo.readyState >= 2 && !cropVideo.paused;
const isEarlyCropDetection = isPlayingCropDetection && cropVideo.currentTime < 10;
const delay = isEarlyCropDetection ? 250 : isPlayingCropDetection ? 1000 : 3000;
syncFallbackTimer = window.setTimeout(() => {
syncFallbackTimer = 0;
const video = cropVideo;
const player = video?.closest('#movie_player');
const flexy = document.querySelector('ytd-watch-flexy');
const isImmersive = document.documentElement.classList.contains('yt-utility-immersive')
  && flexy?.matches('[theater]:not([is-live-content])');
if (!video?.isConnected || !player || !isImmersive || isMiniPlayerActive(player)) {
  syncBackdrop();
  return;
}
detectAndApplyCrop(video, player);
scheduleSyncFallback();
}, delay);
}

function observeCropPlayback(video) {
if (video === cropPlaybackVideo) return;
cropPlaybackVideo?.removeEventListener('playing', scheduleSync);
cropPlaybackVideo = video;
cropPlaybackVideo?.addEventListener('playing', scheduleSync);
}

function syncBackdrop() {
  const flexy = document.querySelector('ytd-watch-flexy');
  const miniPlayer = document.querySelector('ytd-miniplayer');
  const immersive = document.documentElement.classList.contains('yt-utility-immersive')
    && flexy?.matches('[theater]:not([is-live-content])') ? flexy : null;
  const player = immersive?.querySelector('#movie_player') || document.querySelector('#movie_player');
  const video = player?.querySelector('video');
  observePlayerState(flexy, player, miniPlayer);
  const miniPlayerActive = [...document.querySelectorAll('#movie_player')].some(isMiniPlayerActive);

  document.documentElement.classList.toggle('yt-toolkit-miniplayer', miniPlayerActive);

if (miniPlayerActive) {
observeCropPlayback(null);
window.clearTimeout(syncFallbackTimer);
    syncFallbackTimer = 0;
    clearCrop(video || lastVideo);
    cropVideo = null;
    document.documentElement.classList.remove('yt-toolkit-blur-background');
    removeBackdrop();
    lastVideo = video || null;
    return;
  }

if (!video) {
observeCropPlayback(null);
window.clearTimeout(syncFallbackTimer);
    syncFallbackTimer = 0;
    document.documentElement.classList.remove('yt-toolkit-blur-background', 'yt-toolkit-auto-crop', 'yt-toolkit-miniplayer');
      clearCrop(lastVideo);
      cropVideo = null;
    removeBackdrop();
    return;
  }
if (!immersive) {
observeCropPlayback(null);
window.clearTimeout(syncFallbackTimer);
    syncFallbackTimer = 0;
    clearCrop(video);
    cropVideo = null;
    document.documentElement.classList.remove('yt-toolkit-blur-background');
    removeBackdrop();
    lastVideo = video;
    return;
  }
 observeCropPlayback(video);
detectAndApplyCrop(video, player);
 scheduleSyncFallback();

  const blurActive = background === 'blur';
    document.documentElement.classList.toggle('yt-toolkit-blur-background', blurActive);
    if (!blurActive) {
      removeBackdrop();
      lastVideo = video;
      return;
    }
    if (video === lastVideo && canvas?.isConnected) return;

    removeBackdrop();
    lastVideo = video;
    canvas = document.createElement('canvas');
    canvas.id = 'yt-toolkit-video-backdrop';
  canvas.width = 320;
  canvas.height = 180;
    context = canvas.getContext('2d', { alpha: false });
    player.prepend(canvas);
    drawFrame();
  drawTimer = window.setInterval(drawFrame, 120);
}

function detectAndApplyCrop(video, player) {
if (!analysisContext || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
const videoId = new URLSearchParams(location.search).get('v')
  || location.pathname.match(/^\/shorts\/([\w-]{11})/)?.[1]
  || video.currentSrc
  || video.src;
if (videoId !== cropDetectionVideoKey) {
  clearCrop(cropVideo || video);
  if (cropVideo !== video) clearCrop(video);
  cropDetectionVideoKey = videoId;
  cropCandidateKey = '';
  cropCandidateCount = 0;
  cropVideo = video;
  appliedCropKey = 'none';
}
if (player.classList.contains('ad-showing')) return;
if (cropVideo !== video) {
  clearCrop(cropVideo);
  cropVideo = video;
  appliedCropKey = 'none';
}
try {
      analysisContext.drawImage(video, 0, 0, analysisCanvas.width, analysisCanvas.height);
      const pixels = analysisContext.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height).data;
      const rowIsBlack = row => {
        let darkPixels = 0;
        for (let x = 0; x < analysisCanvas.width; x++) {
          const offset = (row * analysisCanvas.width + x) * 4;
          const luminance = pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
          if (luminance <= 23) darkPixels++;
        }
      return darkPixels / analysisCanvas.width >= 0.995;
      };

      const columnIsBlack = column => {
        let darkPixels = 0;
        for (let y = 0; y < analysisCanvas.height; y++) {
          const offset = (y * analysisCanvas.width + column) * 4;
          const luminance = pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
          if (luminance <= 23) darkPixels++;
        }
      return darkPixels / analysisCanvas.height >= 0.995;
      };

      const maxBarRows = Math.floor(analysisCanvas.height * 0.24);
      const maxBarColumns = Math.floor(analysisCanvas.width * 0.30);
      let top = 0;
      let bottom = 0;
      let left = 0;
      let right = 0;
      while (top < maxBarRows && rowIsBlack(top)) top++;
      while (bottom < maxBarRows && rowIsBlack(analysisCanvas.height - 1 - bottom)) bottom++;
      while (left < maxBarColumns && columnIsBlack(left)) left++;
      while (right < maxBarColumns && columnIsBlack(analysisCanvas.width - 1 - right)) right++;
      const contentWidth = analysisCanvas.width - left - right;
      const contentHeight = analysisCanvas.height - top - bottom;
  const hasVerticalBars = top >= 2 || bottom >= 2;
  const hasHorizontalBars = left >= 2 || right >= 2;
  if ((!hasVerticalBars && !hasHorizontalBars) || contentWidth <= 0 || contentHeight <= 0) {
    considerCrop(video, null);
    return;
  }
  // Real letterboxing is normally centered. Asymmetric dark scenery at one edge
  // is more likely picture content (and may contain text), so leave it untouched.
  if (Math.abs(top - bottom) > 2 || Math.abs(left - right) > 2) {
    considerCrop(video, null);
    return;
  }

      let brightestContentRow = 0;
      for (let y = top + 1; y < analysisCanvas.height - bottom - 1; y++) {
        let luminanceTotal = 0;
        for (let x = left; x < analysisCanvas.width - right; x++) {
          const offset = (y * analysisCanvas.width + x) * 4;
          luminanceTotal += pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
        }
        brightestContentRow = Math.max(brightestContentRow, luminanceTotal / contentWidth);
      }
      if (brightestContentRow < 28) {
    considerCrop(video, null);
    return;
      }

      const topRatio = top / analysisCanvas.height;
      const bottomRatio = bottom / analysisCanvas.height;
      const leftRatio = left / analysisCanvas.width;
      const rightRatio = right / analysisCanvas.width;
const fitScale = Math.min(video.clientWidth / video.videoWidth, video.clientHeight / video.videoHeight);
const imageWidth = video.videoWidth * fitScale;
const imageHeight = video.videoHeight * fitScale;
const visibleWidth = imageWidth * (1 - leftRatio - rightRatio);
const visibleHeight = imageHeight * (1 - topRatio - bottomRatio);
const scale = Math.max(1, Math.min(player.clientWidth / visibleWidth, player.clientHeight / visibleHeight));
if (!Number.isFinite(scale)) {
 considerCrop(video, null);
 return;
}
const insetLeft = ((video.clientWidth - imageWidth) / 2 + leftRatio * imageWidth) / video.clientWidth * 100;
const insetRight = ((video.clientWidth - imageWidth) / 2 + rightRatio * imageWidth) / video.clientWidth * 100;
const insetTop = ((video.clientHeight - imageHeight) / 2 + topRatio * imageHeight) / video.clientHeight * 100;
const insetBottom = ((video.clientHeight - imageHeight) / 2 + bottomRatio * imageHeight) / video.clientHeight * 100;
const originX = insetLeft + (100 - insetLeft - insetRight) / 2;
const originY = insetTop + (100 - insetTop - insetBottom) / 2;
considerCrop(video, { scale, originX, originY, insetTop, insetRight, insetBottom, insetLeft });
  } catch {
    // A transient frame read should not undo a stable crop.
  }
}

function isMiniPlayerActive(player) {
  if (!player) return false;
  const isVisible = element => {
    if (!element || element.hidden) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const miniPlayerHost = player.closest('ytd-miniplayer');
  if (miniPlayerHost) return isVisible(miniPlayerHost);

  if (player.classList.contains('ytp-player-minimized')
    || player.classList.contains('ytp-miniplayer-active')) return true;

  return [...document.querySelectorAll('ytd-miniplayer')].some(isVisible);
}

function considerCrop(video, crop) {
  const key = crop
    ? [crop.scale, crop.originX, crop.originY, crop.insetTop, crop.insetRight, crop.insetBottom, crop.insetLeft].map(value => Math.round(value * 10) / 10).join('|')
    : 'none';
  if (key === appliedCropKey) {
    cropCandidateKey = '';
    cropCandidateCount = 0;
    return;
  }
  if (key === cropCandidateKey) cropCandidateCount++;
  else {
    cropCandidateKey = key;
    cropCandidateCount = 1;
  }
  if (cropCandidateCount < 3) return;

  appliedCropKey = key;
  cropCandidateKey = '';
  cropCandidateCount = 0;
  if (!crop) {
    clearCrop(video);
    return;
  }
  applyCrop(video, crop);
}

function applyCrop(video, crop) {
  video.style.setProperty('--yt-toolkit-crop-scale', String(crop.scale));
  video.style.setProperty('--yt-toolkit-crop-origin-x', `${crop.originX}%`);
  video.style.setProperty('--yt-toolkit-crop-origin-y', `${crop.originY}%`);
  video.style.setProperty('--yt-toolkit-crop-inset', `${crop.insetTop}% ${crop.insetRight}% ${crop.insetBottom}% ${crop.insetLeft}%`);
  appliedCropKey = [crop.scale, crop.originX, crop.originY, crop.insetTop, crop.insetRight, crop.insetBottom, crop.insetLeft]
    .map(value => Math.round(value * 10) / 10).join('|');
  document.documentElement.classList.add('yt-toolkit-auto-crop');
}

function clearCrop(video) {
    video?.style.removeProperty('--yt-toolkit-crop-scale');
    video?.style.removeProperty('--yt-toolkit-crop-origin');
    video?.style.removeProperty('--yt-toolkit-crop-origin-x');
    video?.style.removeProperty('--yt-toolkit-crop-origin-y');
video?.style.removeProperty('--yt-toolkit-crop-inset');
  document.documentElement.classList.remove('yt-toolkit-auto-crop');
  appliedCropKey = 'none';
  cropCandidateKey = '';
  cropCandidateCount = 0;
}

  function drawFrame() {
    if (!canvas?.isConnected || !context || !lastVideo || lastVideo.readyState < 2) return;
    try {
      updateBackdropCrop(lastVideo);
      const sourceX = lastVideo.videoWidth * backdropCrop.left / analysisCanvas.width;
      const sourceWidth = lastVideo.videoWidth * (backdropCrop.right - backdropCrop.left) / analysisCanvas.width;
      context.drawImage(lastVideo, sourceX, 0, sourceWidth, lastVideo.videoHeight, 0, 0, canvas.width, canvas.height);
    } catch {
      // A transient video/frame state should not interrupt playback.
    }
  }

  function updateBackdropCrop(video) {
    if (!analysisContext) return;
    try {
      analysisContext.drawImage(video, 0, 0, analysisCanvas.width, analysisCanvas.height);
      const pixels = analysisContext.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height).data;
      const columnIsBlack = x => {
        let darkPixels = 0;
        for (let y = 0; y < analysisCanvas.height; y++) {
          const offset = (y * analysisCanvas.width + x) * 4;
          const luminance = pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
          if (luminance <= 23) darkPixels++;
        }
        return darkPixels / analysisCanvas.height >= 0.96;
      };

      let left = 0;
      let right = 0;
      while (left < analysisCanvas.width * 0.3 && columnIsBlack(left)) left++;
      while (right < analysisCanvas.width * 0.3 && columnIsBlack(analysisCanvas.width - 1 - right)) right++;

      const hasPillarbox = left >= 6 && right >= 6 && Math.abs(left - right) <= 4;
      const cropLeft = hasPillarbox ? Math.round(left / 4) * 4 : 0;
      const cropRight = hasPillarbox ? analysisCanvas.width - Math.round(right / 4) * 4 : analysisCanvas.width;
      const candidateKey = `${cropLeft}:${cropRight}`;
      if (candidateKey === backdropCropCandidateKey) backdropCropCandidateCount++;
      else {
        backdropCropCandidateKey = candidateKey;
        backdropCropCandidateCount = 1;
      }

      if (backdropCropCandidateCount >= 5) {
        backdropCrop = { left: cropLeft, right: cropRight };
      }
    } catch {
      backdropCrop = { left: 0, right: analysisCanvas.width };
      backdropCropCandidateKey = '';
      backdropCropCandidateCount = 0;
    }
  }

  function removeBackdrop() {
    window.clearInterval(drawTimer);
    drawTimer = 0;
    canvas?.remove();
    canvas = null;
    context = null;
    lastVideo = null;
    backdropCrop = { left: 0, right: analysisCanvas.width };
    backdropCropCandidateKey = '';
    backdropCropCandidateCount = 0;
  }
})();
