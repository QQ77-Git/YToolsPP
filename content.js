(() => {
  'use strict';

  const defaults = { shorts: true, pausePrompt: true, theater: true, quality: 'auto', names: true, speedDisplay: true };
  let settings = { ...defaults };
  const isTopFrame = window.top === window;
  let handledNames = new WeakSet();
  let initialized = false;

  chrome.runtime.sendMessage({ type: 'get-settings' }, value => {
    if (!chrome.runtime.lastError && value) settings = { ...defaults, ...value };
    document.documentElement.dataset.ytToolkitSpeedDisplay = String(settings.speedDisplay);
    window.postMessage({ source: 'YTools++', type: 'speed-display-setting', enabled: settings.speedDisplay }, location.origin);
    run();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;
    let changed = false;
    for (const key of Object.keys(defaults)) {
      if (!Object.hasOwn(changes, key)) continue;
      settings[key] = changes[key].newValue ?? defaults[key];
      changed = true;
    }
    if (!changed) return;
    document.documentElement.dataset.ytToolkitSpeedDisplay = String(settings.speedDisplay);
    window.postMessage({ source: 'YTools++', type: 'speed-display-setting', enabled: settings.speedDisplay }, location.origin);
    window.dispatchEvent(new CustomEvent('yt-toolkit-settings-changed', { detail: { ...settings } }));
  });

  function run() {
    if (!initialized) {
      initialized = true;
      suppressPlaybackSmoothnessNotice();
      redirectShorts();
      if (isTopFrame) suppressPausePrompts();
      if (isTopFrame) enableTheater();
      if (isTopFrame) chooseQuality();
      restoreNames();
    }
    document.addEventListener('yt-navigate-finish', run, { once: true });
  }

  function suppressPlaybackSmoothnessNotice() {
    const noticeText = /\u5f71\u7247\u64ad\u653e\u4e0d\u9806\u55ce|\u5f71\u7247\u7121\u6cd5\u9806\u66a2\u64ad\u653e\u55ce|\u89c6\u9891\u64ad\u653e\u4e0d\u6d41\u7545\u5417|\u89c6\u9891\u64ad\u653e\u4e0d\u987a\u7545\u5417|video playback (?:isn.t|is not) smooth/i;
  let observedRoots = new WeakSet();
  const rootObservers = new Set();
  const pendingNodes = new Set();
  let scanTimer = 0;

  const inspect = node => {
    const start = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    if (!start) return;
    for (let element = start, depth = 0; element && depth < 12; element = element.parentElement || element.getRootNode?.().host, depth++) {
      const text = (element.innerText || element.textContent || '').trim();
      if (text.length > 240 || !noticeText.test(text)) continue;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const role = element.getAttribute('role') || '';
      const overlayRole = /^(?:alert|dialog|status)$/i.test(role);
      const positionedOverlay = style.position === 'fixed' || style.position === 'absolute';
      const elevatedOverlay = style.zIndex !== 'auto' && Number(style.zIndex) > 0;
      const visible = style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
      const compact = rect.width <= Math.max(window.innerWidth * 0.98, 320)
        && rect.height <= Math.max(window.innerHeight * 0.8, 240);
      if (!visible || !compact || (!overlayRole && !positionedOverlay && !elevatedOverlay)) continue;
      element.hidden = true;
      element.style.setProperty('display', 'none', 'important');
      break;
    };
  };

    const observeRoot = root => {
      if (!root || observedRoots.has(root)) return;
      observedRoots.add(root);
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') inspect(mutation.target);
        for (const node of mutation.addedNodes) pendingNodes.add(node);
      }
      if (pendingNodes.size && !scanTimer) {
        scanTimer = window.setTimeout(() => {
          scanTimer = 0;
          const nodes = [...pendingNodes];
          pendingNodes.clear();
          for (const node of nodes) scanNode(node);
        }, 100);
      }
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    rootObservers.add(observer);
    scanNode(root);
  };

  const scanNode = node => {
    if (!node) return;
    inspect(node);
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (node.shadowRoot) observeRoot(node.shadowRoot);
    for (const element of node.querySelectorAll?.('*') || []) {
        inspect(element);
        if (element.shadowRoot) observeRoot(element.shadowRoot);
      }
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let textNode;
    while ((textNode = walker.nextNode())) {
      if (noticeText.test(textNode.nodeValue || '')) inspect(textNode);
    }
  };

  let active = false;
  const stopObserving = () => {
    for (const observer of rootObservers) observer.disconnect();
    rootObservers.clear();
    observedRoots = new WeakSet();
    pendingNodes.clear();
    window.clearTimeout(scanTimer);
    scanTimer = 0;
    active = false;
  };
  const syncObservation = () => {
    const videoRoute = location.pathname === '/watch' || location.pathname.startsWith('/shorts/');
    if (!videoRoute) {
      if (active) stopObserving();
      return;
    }
    if (active) return;
    active = true;
    observeRoot(document);
  };
  document.addEventListener('yt-navigate-finish', syncObservation);
  window.addEventListener('popstate', syncObservation);
  syncObservation();
}

  function redirectShorts() {
    const redirectCurrentShort = () => {
      if (!settings.shorts || !location.pathname.startsWith('/shorts/')) return;
      const id = location.pathname.split('/')[2];
      if (id) location.replace(`/watch?v=${encodeURIComponent(id)}${location.search.replace(/^\?/, '&')}`);
    };
    const onClick = event => {
      if (!settings.shorts) return;
      const link = event.target.closest?.('a[href*="/shorts/"]');
      if (!link) return;
      const url = new URL(link.href);
      const id = url.pathname.split('/')[2];
      if (id) { event.preventDefault(); location.assign(`/watch?v=${encodeURIComponent(id)}`); }
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('yt-toolkit-settings-changed', redirectCurrentShort);
    redirectCurrentShort();
  }

  function suppressPausePrompts() {
    const textOf = root => {
      let text = root?.innerText || root?.textContent || '';
      if (root?.shadowRoot) text += ` ${textOf(root.shadowRoot)}`;
      for (const node of root?.querySelectorAll?.('*') || []) {
        if (node.shadowRoot) text += ` ${textOf(node.shadowRoot)}`;
      }
      return text;
    };
    const buttonsOf = root => {
      const buttons = [...(root?.querySelectorAll?.('button, tp-yt-paper-button') || [])];
      if (root?.shadowRoot) buttons.push(...buttonsOf(root.shadowRoot));
      for (const node of root?.querySelectorAll?.('*') || []) {
        if (node.shadowRoot) buttons.push(...buttonsOf(node.shadowRoot));
      }
      return buttons;
    };
    const remove = () => {
      if (!settings.pausePrompt) return;
      for (const dialog of document.querySelectorAll('yt-confirm-dialog-renderer, ytd-enforcement-message-view-model')) {
        const text = textOf(dialog);
        if (/continue watching|still watching|繼續觀看|繼續播放/i.test(text)) {
          const button = buttonsOf(dialog).find(el => /continue|繼續/i.test(textOf(el)));
          if (button) button.click();
          dialog.remove();
        }
    }
  };
  let removeTimer = 0;
  const scheduleRemove = mutations => {
    if (removeTimer) return;
    const relevant = mutations.some(mutation =>
      (mutation.type === 'characterData' && mutation.target.parentElement?.closest('yt-confirm-dialog-renderer, ytd-enforcement-message-view-model'))
      || [...mutation.addedNodes].some(node => {
        const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        return element?.matches?.('yt-confirm-dialog-renderer, ytd-enforcement-message-view-model')
          || Boolean(element?.querySelector?.('yt-confirm-dialog-renderer, ytd-enforcement-message-view-model'));
      }));
    if (!relevant) return;
    removeTimer = window.setTimeout(() => {
      removeTimer = 0;
      remove();
    }, 50);
  };
  const promptObserver = new MutationObserver(scheduleRemove);
    const observePrompts = () => {
    if (!settings.pausePrompt || location.pathname !== '/watch') {
      promptObserver.disconnect();
      window.clearTimeout(removeTimer);
      removeTimer = 0;
      return;
    }
    promptObserver.observe(document, { childList: true, subtree: true, characterData: true });
    remove();
  };
  document.addEventListener('yt-navigate-finish', observePrompts);
  window.addEventListener('popstate', observePrompts);
  window.addEventListener('yt-toolkit-settings-changed', observePrompts);
  observePrompts();
}

function enableTheater() {
  let hideTimer;
  let currentRoute = '';
  let applyTimer = 0;
  let observing = false;
  let setByToolkit = false;
    const setImmersive = () => {
      document.documentElement.classList.add('yt-utility-immersive');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (location.pathname === '/watch' && window.scrollY < 60) {
          document.documentElement.classList.add('yt-utility-content-hidden');
        }
  }, 2000);
  };
  const scheduleApply = mutations => {
    if (location.pathname !== '/watch' || applyTimer) return;
    const relevant = mutations.some(mutation =>
      (mutation.type === 'attributes' && mutation.target.matches?.('ytd-watch-flexy'))
      || [...mutation.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE
        && (node.matches?.('ytd-watch-flexy, .ytp-size-button')
          || node.querySelector?.('ytd-watch-flexy, .ytp-size-button'))));
    if (!relevant) return;
    applyTimer = window.setTimeout(() => {
      applyTimer = 0;
      apply();
    }, 100);
  };
  const watchObserver = new MutationObserver(scheduleApply);
  const apply = () => {
      const route = `${location.pathname}${location.search}`;
      const routeChanged = route !== currentRoute;
      currentRoute = route;
    if (!settings.theater || location.pathname !== '/watch') {
      document.documentElement.classList.remove('yt-utility-immersive', 'yt-utility-content-hidden');
      clearTimeout(hideTimer);
      clearTimeout(applyTimer);
      applyTimer = 0;
      if (observing) watchObserver.disconnect();
      observing = false;
      const flexy = document.querySelector('ytd-watch-flexy');
      if (settings.theater === false && setByToolkit && flexy?.hasAttribute('theater')) {
        document.querySelector('.ytp-size-button')?.click();
        setByToolkit = false;
      }
      return;
    }
    if (!observing) {
      watchObserver.observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['theater'],
      });
      observing = true;
    }
      const flexy = document.querySelector('ytd-watch-flexy');
      if (flexy && !flexy.hasAttribute('theater')) {
        const button = document.querySelector('.ytp-size-button');
        if (button) {
          button.click();
          setByToolkit = true;
        }
      }
    if (routeChanged || !document.documentElement.classList.contains('yt-utility-immersive')) setImmersive();
    };
  document.addEventListener('yt-navigate-finish', apply);
  document.addEventListener('yt-page-data-updated', apply);
  const revealOnActivity = () => {
    if (!settings.theater || location.pathname !== '/watch') return;
    document.documentElement.classList.remove('yt-utility-content-hidden');
    clearTimeout(hideTimer);
    if (window.scrollY < 60) hideTimer = setTimeout(() => document.documentElement.classList.add('yt-utility-content-hidden'), 2000);
  };
  window.addEventListener('scroll', revealOnActivity, { passive: true });
  window.addEventListener('pointermove', revealOnActivity, { passive: true });
  window.addEventListener('yt-toolkit-settings-changed', apply);
    apply();
  }

function chooseQuality() {
  let retryTimer = 0;
  let retries = 0;
  const apply = () => {
    if (!settings.quality || location.pathname !== '/watch') {
      window.clearTimeout(retryTimer);
      retryTimer = 0;
      retries = 0;
      return;
    }
    const player = document.querySelector('#movie_player');
    if (settings.quality === 'auto') {
      window.clearTimeout(retryTimer);
      retryTimer = 0;
      retries = 0;
      player?.setPlaybackQuality?.('auto');
      return;
    }
    if (!player?.getAvailableQualityLevels || !player.setPlaybackQualityRange) {
      if (retries++ < 10 && !retryTimer) {
        retryTimer = window.setTimeout(() => {
          retryTimer = 0;
          apply();
        }, 500);
      }
      return;
    }
    retries = 0;
    const available = player.getAvailableQualityLevels();
      const target = settings.quality;
      const index = available.indexOf(target);
      const chosen = index >= 0 ? target : available.find(q => q.endsWith('p') && Number.parseInt(q, 10) < Number.parseInt(target, 10));
    if (chosen) player.setPlaybackQualityRange(chosen, chosen);
  };
  document.addEventListener('yt-navigate-finish', apply);
  document.addEventListener('yt-page-data-updated', apply);
  document.addEventListener('loadedmetadata', apply, true);
  window.addEventListener('yt-toolkit-settings-changed', apply);
  apply();
}

function restoreNames() {
  const channelNames = new Map();
  const originalText = new Map();
  const nameRequests = new Map();
  const anchorsByHandle = new Map();
  const handleByAnchor = new WeakMap();
  const pendingRoots = new Set();
  let scanTimer = 0;
  let activeNameRequests = 0;
  let nameObserver = null;
  const nameQueue = [];
  const queuedNames = new Set();
  const MAX_NAME_REQUESTS = 2;

  const replaceVisibleHandle = (anchor, handle, name) => {
    if (!settings.names || !name || !anchor.isConnected) return;
    const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    const visibleHandle = `@${handle}`;
    for (const node of textNodes) {
      const text = node.nodeValue || '';
      const index = text.indexOf(visibleHandle);
      if (index < 0) continue;
      const before = text[index - 1] || '';
      const after = text[index + visibleHandle.length] || '';
      if ((!before || /\s/.test(before)) && (!after || /\s/.test(after))) {
        if (!originalText.has(node)) originalText.set(node, node.nodeValue);
        node.nodeValue = text.slice(0, index) + name + text.slice(index + visibleHandle.length);
      }
    }
  };

  const pumpNameQueue = () => {
    while (activeNameRequests < MAX_NAME_REQUESTS && nameQueue.length) {
      const handle = nameQueue.shift();
      queuedNames.delete(handle);
      if (nameRequests.get(handle) === 'inflight' || channelNames.has(handle)) continue;
      nameRequests.set(handle, 'inflight');
      activeNameRequests++;
      fetch(`${location.origin}/@${handle}`, { credentials: 'include' })
        .then(response => response.ok ? response.text() : '')
        .then(html => {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const name = doc.querySelector('meta[property="og:title"]')?.content?.trim();
          if (!name || name.startsWith('@')) return;
          channelNames.set(handle, name);
          for (const anchor of anchorsByHandle.get(handle) || []) replaceVisibleHandle(anchor, handle, name);
          anchorsByHandle.delete(handle);
        })
        .catch(() => {})
        .finally(() => {
          activeNameRequests--;
          nameRequests.delete(handle);
          pumpNameQueue();
        });
    }
  };

  const queueNameRequest = (anchor, handle) => {
    const cachedName = channelNames.get(handle);
    if (cachedName) {
      replaceVisibleHandle(anchor, handle, cachedName);
      return;
    }
    if (!anchorsByHandle.has(handle)) anchorsByHandle.set(handle, new Set());
    anchorsByHandle.get(handle).add(anchor);
    if (!nameRequests.has(handle) && !queuedNames.has(handle)) {
      nameRequests.set(handle, 'queued');
      nameQueue.push(handle);
      queuedNames.add(handle);
      pumpNameQueue();
    }
  };

  if ('IntersectionObserver' in window) {
    nameObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        nameObserver.unobserve(entry.target);
        const handle = handleByAnchor.get(entry.target);
        if (handle && entry.target.isConnected) queueNameRequest(entry.target, handle);
      }
    }, { rootMargin: '200px' });
  }

  const findAnchors = roots => {
    for (const root of roots) {
      const anchors = [];
      if (root?.matches?.('a[href^="/@"]')) anchors.push(root);
      anchors.push(...(root?.querySelectorAll?.('a[href^="/@"]') || []));
      for (const anchor of anchors) {
      if (handledNames.has(anchor)) continue;
      const handle = anchor.pathname.split('/')[1]?.replace(/^@/, '');
      if (!handle) continue;
      if (!anchor.textContent?.includes(`@${handle}`)) continue;
      handledNames.add(anchor);
      const cachedName = channelNames.get(handle);
      if (cachedName) {
        replaceVisibleHandle(anchor, handle, cachedName);
        continue;
      }
      if (nameObserver) {
        handleByAnchor.set(anchor, handle);
        nameObserver.observe(anchor);
      } else queueNameRequest(anchor, handle);
      }
    }
  };

  const scheduleScan = nodes => {
    for (const node of nodes) {
      const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
      if (!element) continue;
      const anchor = element.matches('a[href^="/@"]') ? element : element.closest('a[href^="/@"]');
      if (anchor) pendingRoots.add(anchor);
      else if (element.querySelector?.('a[href^="/@"]')) pendingRoots.add(element);
    }
    if (scanTimer || !pendingRoots.size) return;
    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      const roots = [...pendingRoots];
      pendingRoots.clear();
      findAnchors(roots);
    }, 100);
  };

  const observer = new MutationObserver(mutations => {
    if (!settings.names) return;
    const nodes = [];
    for (const mutation of mutations) {
      if (mutation.type === 'characterData' && mutation.target.parentElement) nodes.push(mutation.target.parentElement);
      else nodes.push(...mutation.addedNodes);
    }
    scheduleScan(nodes);
  });
  observer.observe(document, { childList: true, subtree: true, characterData: true });
  window.addEventListener('yt-toolkit-settings-changed', event => {
    if (event.detail.names) {
      handledNames = new WeakSet();
      findAnchors([document]);
      observer.observe(document, { childList: true, subtree: true, characterData: true });
    } else {
      observer.disconnect();
      nameObserver?.disconnect();
      window.clearTimeout(scanTimer);
      scanTimer = 0;
      pendingRoots.clear();
      for (const [node, value] of originalText) {
        if (node.isConnected) node.nodeValue = value;
      }
      originalText.clear();
    }
  });
  findAnchors([document]);
}
})();
