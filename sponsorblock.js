(() => {
  'use strict';

  const DEFAULT_ENABLED = true;
  const MAX_CACHED_VIDEOS = 30;
  const segmentsByVideo = new Map();
  const pendingVideos = new Set();
  const retryAfter = new Map();
  let enabled = DEFAULT_ENABLED;
  let currentVideoId = null;
  let activeVideo = null;
  let segments = [];

  function getVideoId() {
    const fromQuery = new URLSearchParams(location.search).get('v');
    const fromPath = location.pathname.match(/^\/shorts\/([\w-]{11})/i)?.[1];
    const id = fromQuery || fromPath;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  }

  function getVideoElement() {
    return document.querySelector('video.html5-main-video, #movie_player video, video');
  }

  function skipCurrentSegment() {
    if (!enabled || !activeVideo || activeVideo.paused || activeVideo.seeking || !segments.length) return;
    if (document.querySelector('#movie_player.ad-showing')) return;

    const time = activeVideo.currentTime;
    const segment = segments.find(item => time >= item.segment[0] && time < item.segment[1]);
    if (!segment) return;

    const duration = Number.isFinite(activeVideo.duration) ? activeVideo.duration : segment.segment[1];
    const target = Math.min(segment.segment[1] + 0.05, duration);
    if (target > time) activeVideo.currentTime = target;
  }

  function requestSegments(videoId) {
    if (!enabled || !videoId || segmentsByVideo.has(videoId) || pendingVideos.has(videoId)) return;
    if ((retryAfter.get(videoId) || 0) > Date.now()) return;
    pendingVideos.add(videoId);

    chrome.runtime.sendMessage({ type: 'sponsorblock-get-segments', videoId }, response => {
      pendingVideos.delete(videoId);
      if (chrome.runtime.lastError || !response?.ok || !Array.isArray(response.segments)) {
        retryAfter.set(videoId, Date.now() + 30_000);
        return;
      }

      retryAfter.delete(videoId);
      segmentsByVideo.set(videoId, response.segments);
      if (segmentsByVideo.size > MAX_CACHED_VIDEOS) {
        segmentsByVideo.delete(segmentsByVideo.keys().next().value);
      }
      if (videoId !== currentVideoId) return;
      segments = response.segments;
      skipCurrentSegment();
    });
  }

function syncVideo() {
  const videoId = getVideoId();
  const video = videoId ? getVideoElement() : null;
    if (video !== activeVideo) {
      activeVideo?.removeEventListener('timeupdate', skipCurrentSegment);
      activeVideo = video;
      activeVideo?.addEventListener('timeupdate', skipCurrentSegment, { passive: true });
    }

    if (videoId !== currentVideoId) {
      currentVideoId = videoId;
      segments = videoId ? segmentsByVideo.get(videoId) || [] : [];
      if (videoId && !segmentsByVideo.has(videoId)) requestSegments(videoId);
      skipCurrentSegment();
      return;
    }

    if (enabled && videoId && !segmentsByVideo.has(videoId)) requestSegments(videoId);
    skipCurrentSegment();
  }

  chrome.storage.sync.get({ sponsorBlock: DEFAULT_ENABLED }, settings => {
    if (!chrome.runtime.lastError) enabled = settings.sponsorBlock !== false;
    syncVideo();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' || !changes.sponsorBlock) return;
    enabled = changes.sponsorBlock.newValue !== false;
    syncVideo();
  });

document.addEventListener('yt-navigate-finish', syncVideo);
document.addEventListener('yt-page-data-updated', syncVideo);
document.addEventListener('loadedmetadata', syncVideo, true);
window.addEventListener('popstate', syncVideo);
})();
