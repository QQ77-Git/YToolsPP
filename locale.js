(() => {
  const messages = {
    'zh-Hant': {
      subtitle: 'YouTube 播放與顯示工具', ready: '設定變更會自動儲存並套用', features: '功能開關',
 shorts: 'Shorts 連結改開一般影片', shortsHelp: '將 Shorts 連結導向一般影片播放器。', pausePrompt: '略過「繼續觀看」提示', pausePromptHelp: '自動關閉「繼續觀看」確認提示。',
  theater: '自動劇院／滿版模式', theaterHelp: '僅在影片前 10 秒偵測黑邊並裁切，之後固定裁切位置。', names: '將頻道連結的 @handle 替換為名稱', namesHelp: '以頻道名稱取代連結中的 @handle。', speedDisplay: '在播放器顯示連線速度（MB/s）', speedDisplayHelp: '在播放器顯示 YouTube 提供的連線速度。',
 sponsorBlock: 'SponsorBlock', sponsorBlockHelp: '自動略過社群標記的贊助與其他片段。',
 adSkip: '自動略過 YouTube 影片廣告', adSkipHelp: '自動略過可跳過的 YouTube 影片廣告。',
    subtitleAdvancedSettings: '字幕進階設定',
    dualSubtitles: '自動顯示雙語字幕', dualSubtitlesHelp: '同步顯示原文字幕與所選翻譯。', subtitleLanguage: '翻譯語言', translatedSubtitleColor: '翻譯字幕顏色', resetDefault: '恢復預設', rgbSubtitleMode: 'RGB 顯示模式', rgbModeOff: '單色', rgbModeRainbow: '彩虹循環', rgbModeGradient: '固定漸層', rgbModeWaveLeft: '流動漸層（向左）', rgbModeWaveRight: '流動漸層（向右）', rgbModePulse: 'RGB 呼吸光暈',
    subtitleTranslator: '翻譯引擎', translatorGoogle: 'Google 翻譯', translatorGemini: 'Gemini API', geminiApiKey: 'Gemini API 金鑰', geminiApiKeyHelp: '金鑰只存在本機，不會同步。具擴充功能檢視權限的人仍可能讀取；建議限制金鑰僅能呼叫 Gemini API。',
    saveGeminiApiKey: '保存', geminiApiKeySaved: 'Gemini API 金鑰已保存於本機。',
    translationCache: 'Gemini 翻譯快取', translationCacheHelp: '完成的字幕批次會保存在本機，供稍後重用。',
    clearTranslationCache: '清除快取', translationCacheCleared: '翻譯快取已清除。',
    translationCacheClearFailed: '清除翻譯快取失敗。', translationCacheUnavailable: '無法讀取快取狀態。',
    cacheBatches: '批', cacheCues: '條',
 playerBackground: '背景', playerBackgroundBlack: '黑色', playerBackgroundBlur: '模糊', playerBackgroundPerformanceHelp: '模糊效果可能影響效能。',
 settings: '偏好設定', close: '關閉', qualityLabel: '偏好畫質', qualityAuto: '自動', theme: '主題',
      themeAuto: '跟隨系統', themeLight: '淺色', themeDark: '深色', language: '介面語言',
      languageSystem: '跟隨系統', languageTraditional: '繁體中文', languageSimplified: '簡體中文',
      languageEnglish: '英文', apply: '儲存並套用', applyHelp: '設定會自動儲存；YouTube 變更會自動重新載入套用。',
      saving: '正在儲存設定…', savedApplying: '設定已儲存，正在套用並重新整理 YouTube…',
      savedButton: '已儲存 ✓', saved: '設定已儲存。', savedRefresh: '設定已儲存；重新整理 YouTube 後生效。',
      loadFailed: '載入設定失敗。', saveFailed: '儲存失敗，請稍後再試。',
    },
    'zh-Hans': {
      subtitle: 'YouTube 播放与显示工具', ready: '设置变更会自动保存并应用', features: '功能开关',
 shorts: 'Shorts 链接改为普通视频', shortsHelp: '将 Shorts 链接导向普通视频播放器。', pausePrompt: '跳过“继续观看”提示', pausePromptHelp: '自动关闭“继续观看”确认提示。',
  theater: '自动影院／全屏模式', theaterHelp: '仅在视频前 10 秒检测黑边并裁切，之后固定裁切位置。', names: '将频道链接的 @handle 替换为名称', namesHelp: '用频道名称替换链接中的 @handle。', speedDisplay: '在播放器显示连接速度（MB/s）', speedDisplayHelp: '在播放器显示 YouTube 提供的连接速度。',
 sponsorBlock: 'SponsorBlock', sponsorBlockHelp: '自动跳过社区标记的赞助及其他片段。',
 adSkip: '自动跳过 YouTube 视频广告', adSkipHelp: '自动跳过可跳过的 YouTube 视频广告。',
    subtitleAdvancedSettings: '字幕高级设置',
    dualSubtitles: '自动显示双语字幕', dualSubtitlesHelp: '同步显示原文字幕与所选翻译。', subtitleLanguage: '翻译语言', translatedSubtitleColor: '翻译字幕颜色', resetDefault: '恢复默认', rgbSubtitleMode: 'RGB 显示模式', rgbModeOff: '单色', rgbModeRainbow: '彩虹循环', rgbModeGradient: '固定渐变', rgbModeWaveLeft: '流动渐变（向左）', rgbModeWaveRight: '流动渐变（向右）', rgbModePulse: 'RGB 呼吸光晕',
    subtitleTranslator: '翻译引擎', translatorGoogle: 'Google 翻译', translatorGemini: 'Gemini API', geminiApiKey: 'Gemini API 密钥', geminiApiKeyHelp: '密钥仅保存在本机，不会同步。拥有扩展程序检查权限的人仍可能读取；建议限制密钥仅调用 Gemini API。',
    saveGeminiApiKey: '保存', geminiApiKeySaved: 'Gemini API 密钥已保存在本机。',
    translationCache: 'Gemini 翻译缓存', translationCacheHelp: '已完成的字幕批次会保存在本机，供稍后重用。',
    clearTranslationCache: '清除缓存', translationCacheCleared: '翻译缓存已清除。',
    translationCacheClearFailed: '清除翻译缓存失败。', translationCacheUnavailable: '无法读取缓存状态。',
    cacheBatches: '批', cacheCues: '条',
 playerBackground: '背景', playerBackgroundBlack: '黑色', playerBackgroundBlur: '模糊', playerBackgroundPerformanceHelp: '模糊效果可能影响性能。',
 settings: '偏好设置', close: '关闭', qualityLabel: '偏好画质', qualityAuto: '自动', theme: '主题',
      themeAuto: '跟随系统', themeLight: '浅色', themeDark: '深色', language: '界面语言',
      languageSystem: '跟随系统', languageTraditional: '繁体中文', languageSimplified: '简体中文',
      languageEnglish: '英语', apply: '保存并应用', applyHelp: '设置会自动保存；YouTube 变更会自动刷新应用。',
      saving: '正在保存设置…', savedApplying: '设置已保存，正在应用并刷新 YouTube…',
      savedButton: '已保存 ✓', saved: '设置已保存。', savedRefresh: '设置已保存；刷新 YouTube 后生效。',
      loadFailed: '加载设置失败。', saveFailed: '保存失败，请稍后重试。',
    },
    en: {
      subtitle: 'YouTube playback and display tools', ready: 'Changes are saved and applied automatically', features: 'Features',
      shorts: 'Open Shorts links in the regular player', shortsHelp: 'Open Shorts links in the standard video player.', pausePrompt: 'Dismiss “Continue watching” prompts', pausePromptHelp: 'Automatically dismiss the continue-watching prompt.',
      theater: 'Automatic theater / immersive mode', theaterHelp: 'Detect and crop black bars during the first 10 seconds, then keep the crop fixed.', names: 'Replace @handles in channel links with channel names', namesHelp: 'Show channel names instead of @handles in links.', speedDisplay: 'Show connection speed in player (MB/s)', speedDisplayHelp: 'Display the connection speed reported by YouTube.',
      sponsorBlock: 'SponsorBlock', sponsorBlockHelp: 'Automatically skip community-marked sponsor and other segments.',
      adSkip: 'Auto-skip YouTube video ads', adSkipHelp: 'Automatically skip YouTube ads when a skip control is available.',
    subtitleAdvancedSettings: 'Advanced subtitle settings',
    dualSubtitles: 'Show bilingual subtitles automatically', dualSubtitlesHelp: 'Show the original caption and selected translation in sync.', subtitleLanguage: 'Translation language', translatedSubtitleColor: 'Translated subtitle color', resetDefault: 'Reset default', rgbSubtitleMode: 'RGB display mode', rgbModeOff: 'Single color', rgbModeRainbow: 'Rainbow cycle', rgbModeGradient: 'Static gradient', rgbModeWaveLeft: 'Moving gradient (left)', rgbModeWaveRight: 'Moving gradient (right)', rgbModePulse: 'RGB breathing glow',
    subtitleTranslator: 'Translation engine', translatorGoogle: 'Google Translate', translatorGemini: 'Gemini API', geminiApiKey: 'Gemini API key', geminiApiKeyHelp: 'Stored locally only; it is not synced. Anyone who can inspect the extension may still be able to read it. Restrict this key to the Gemini API.',
    saveGeminiApiKey: 'Save', geminiApiKeySaved: 'Gemini API key saved locally.',
    translationCache: 'Gemini translation cache', translationCacheHelp: 'Completed caption batches are stored locally for reuse.',
    clearTranslationCache: 'Clear cache', translationCacheCleared: 'Translation cache cleared.',
    translationCacheClearFailed: 'Could not clear translation cache.', translationCacheUnavailable: 'Cache status unavailable.',
    cacheBatches: 'batches', cacheCues: 'cues',
 playerBackground: 'Background', playerBackgroundBlack: 'Black', playerBackgroundBlur: 'Blur', playerBackgroundPerformanceHelp: 'Blur may affect performance.',
 settings: 'Preferences', close: 'Close', qualityLabel: 'Preferred quality', qualityAuto: 'Auto', theme: 'Theme',
      themeAuto: 'System', themeLight: 'Light', themeDark: 'Dark', language: 'Language',
      languageSystem: 'System', languageTraditional: 'Traditional Chinese', languageSimplified: 'Simplified Chinese',
      languageEnglish: 'English', apply: 'Save and apply', applyHelp: 'Settings save automatically; YouTube reloads to apply changes.',
      saving: 'Saving settings…', savedApplying: 'Settings saved. Applying and reloading YouTube…',
      savedButton: 'Saved ✓', saved: 'Settings saved.', savedRefresh: 'Settings saved; refresh YouTube to apply.',
      loadFailed: 'Could not load settings.', saveFailed: 'Could not save settings. Try again.',
    },
  };

  function resolveLanguage(preference) {
    if (preference !== 'system') return preference;
    const locale = (navigator.language || 'en').toLowerCase();
    if (locale.startsWith('zh')) return /zh-(cn|sg)/.test(locale) ? 'zh-Hans' : 'zh-Hant';
    return 'en';
  }

  let activeLanguage = 'zh-Hant';
  function setLanguage(preference = 'system') {
    activeLanguage = resolveLanguage(preference);
    document.documentElement.lang = activeLanguage;
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const value = messages[activeLanguage][element.dataset.i18n];
    if (value) element.textContent = value;
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
    const value = messages[activeLanguage][element.dataset.i18nAriaLabel];
    if (value) element.setAttribute('aria-label', value);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(element => {
    const value = messages[activeLanguage][element.dataset.i18nTitle];
    if (value) element.title = value;
  });
}

  window.YouTubeToolkitLocale = {
    setLanguage,
    text: key => messages[activeLanguage][key] || key,
  };
})();
