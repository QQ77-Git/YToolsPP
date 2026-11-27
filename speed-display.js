(() => {
  'use strict';

  const WIDGET_ID = 'yt-toolkit-speed-display';
  // Avoid running work for every YouTube DOM mutation; live chat mutates constantly.
  const UPDATE_INTERVAL_MS = 2000;
  let enabled = document.documentElement.dataset.ytToolkitSpeedDisplay !== 'false';
let lastGoodAt = 0;
let lastValue = 'N/A';
let updateTimer = 0;

  const select = (selector) => {
    try { return document.querySelector(selector); } catch { return null; }
  };

  function parseKbps(text) {
    if (typeof text !== 'string') return null;
    const match = text.match(/(?:Connection Speed|連線速度|连接速度)\s*[:：]?\s*([\d,.]+)\s*Kbps/i);
    if (!match) return null;
    const value = Number.parseFloat(match[1].replace(/,/g, ''));
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function readKbps(player) {
    if (typeof player?.getStatsForNerds === 'function') {
      try {
        const stats = player.getStatsForNerds(0);
        if (typeof stats === 'string') {
          const value = parseKbps(stats);
          if (value) return value;
        } else if (stats && typeof stats === 'object') {
          for (const [key, value] of Object.entries(stats)) {
            if (/bandwidth|connection.*speed/i.test(key)) {
              const number = Number.parseFloat(String(value).replace(/,/g, ''));
              if (Number.isFinite(number) && number > 0) return number;
            }
          }
        }
      } catch { /* YouTube may remove or change this private method. */ }
    }

    if (typeof player?.getDebugText === 'function') {
      try {
        const value = parseKbps(player.getDebugText());
        if (value) return value;
      } catch { /* Fall back to the visible Stats for Nerds panel. */ }
    }

    const panel = select('.html5-video-info-panel, .html5-video-info-panel-content, [class*="video-info-panel"]');
    return parseKbps(panel?.textContent || '');
  }

  function mount() {
    const player = document.getElementById('movie_player');
    if (!player) return null;
    let widget = document.getElementById(WIDGET_ID);
    if (!widget) {
      widget = document.createElement('div');
      widget.id = WIDGET_ID;
      widget.setAttribute('role', 'status');
      widget.setAttribute('aria-label', 'YouTube connection speed');
      widget.textContent = 'N/A';
    }
    const controls = select('.ytp-right-controls');
    if (controls) {
      if (widget.parentElement !== controls || controls.firstElementChild !== widget) {
        controls.insertBefore(widget, controls.firstElementChild);
      }
    } else if (widget.parentElement !== player) {
      player.append(widget);
      widget.classList.add('yt-toolkit-speed-overlay');
    }
    return widget;
  }

  function update() {
    const existing = document.getElementById(WIDGET_ID);
    if (!enabled) {
      existing?.remove();
      return;
    }
    if (!location.pathname.startsWith('/watch') && !location.pathname.startsWith('/shorts/')) {
      existing?.remove();
      return;
    }

    const widget = mount();
    if (!widget) return;
    const kbps = readKbps(document.getElementById('movie_player'));
    if (kbps) {
      lastGoodAt = Date.now();
      lastValue = `${(kbps / 8 / 1024).toFixed(2)} MB/s`;
    } else if (Date.now() - lastGoodAt > 10000) {
      lastValue = 'N/A';
    }
    widget.textContent = lastValue;
    widget.title = 'Connection speed reported by YouTube Stats for Nerds';
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin) return;
  const data = event.data;
  if (data?.source !== 'YTools++' || data.type !== 'speed-display-setting') return;
  enabled = Boolean(data.enabled);
  syncSchedule();
});

function syncSchedule() {
  const isVideoRoute = location.pathname.startsWith('/watch') || location.pathname.startsWith('/shorts/');
  if (!enabled || !isVideoRoute) {
    window.clearInterval(updateTimer);
    updateTimer = 0;
    document.getElementById(WIDGET_ID)?.remove();
    return;
  }
  update();
  if (!updateTimer) updateTimer = window.setInterval(update, UPDATE_INTERVAL_MS);
}

document.addEventListener('yt-navigate-finish', syncSchedule);
window.addEventListener('popstate', syncSchedule);
syncSchedule();
})();
