(() => {
  'use strict';

  const messages = {
    'zh-Hant': {
      translating: '翻譯中', modelAttempt: '正在嘗試模型', complete: '翻譯完成', failed: '翻譯失敗', retrying: '翻譯失敗，正在重試',
      retryingShort: '重試中', timedOut: 'Gemini 請求逾時', missingApiKey: '請先設定 Gemini API 金鑰',
      keyStorageError: '無法讀取本機 Gemini API 金鑰', backgroundUnavailable: 'YTools++ 翻譯服務未回應',
      networkError: '無法連線到 Gemini API', invalidApiKey: 'Gemini API 金鑰無效（401）',
      permissionDenied: 'Gemini API 權限不足（403）', billingRequired: 'Gemini 帳務或付款設定有問題（402）',
      invalidRequest: 'Gemini API 拒絕請求格式（400）', modelUnavailable: 'Gemini 模型不存在或無法使用（404）',
      rateLimited: 'Gemini 速率或配額受限（429）', serviceBusy: 'Gemini 模型目前繁忙（503）',
      serviceUnavailable: 'Gemini API 暫時無法使用', invalidResponse: 'Gemini 回覆格式無法解析',
      sourceInferred: '依影片文字推測原文語言',
    },
    'zh-Hans': {
      translating: '翻译中', modelAttempt: '正在尝试模型', complete: '翻译完成', failed: '翻译失败', retrying: '翻译失败，正在重试',
      retryingShort: '重试中', timedOut: 'Gemini 请求超时', missingApiKey: '请先设置 Gemini API 密钥',
      keyStorageError: '无法读取本机 Gemini API 密钥', backgroundUnavailable: 'YTools++ 翻译服务无响应',
      networkError: '无法连接到 Gemini API', invalidApiKey: 'Gemini API 密钥无效（401）',
      permissionDenied: 'Gemini API 权限不足（403）', billingRequired: 'Gemini 账务或付款设置有问题（402）',
      invalidRequest: 'Gemini API 拒绝了请求格式（400）', modelUnavailable: 'Gemini 模型不存在或无法使用（404）',
      rateLimited: 'Gemini 速率或配额受限（429）', serviceBusy: 'Gemini 模型目前繁忙（503）',
      serviceUnavailable: 'Gemini API 暂时不可用', invalidResponse: 'Gemini 回复格式无法解析',
      sourceInferred: '根据视频文字推测原文语言',
    },
    en: {
      translating: 'Translating', modelAttempt: 'Trying model', complete: 'Translation complete', failed: 'Translation failed',
      retrying: 'Translation failed; retrying', retryingShort: 'retrying', timedOut: 'Gemini request timed out',
      keyStorageError: 'Cannot read the locally saved Gemini API key',
      backgroundUnavailable: 'YTools++ translation service did not respond',
      networkError: 'Cannot connect to the Gemini API', invalidApiKey: 'Gemini API key rejected (401)',
      permissionDenied: 'Gemini API permission denied (403)', billingRequired: 'Gemini billing or payment required (402)',
      invalidRequest: 'Gemini API rejected the request format (400)', modelUnavailable: 'Gemini model not found or unavailable (404)',
      rateLimited: 'Gemini rate or quota limit reached (429)', serviceBusy: 'Gemini model is busy (503)',
      serviceUnavailable: 'Gemini API is temporarily unavailable', invalidResponse: 'Gemini returned an unreadable response',
      missingApiKey: 'Set a Gemini API key first',
      sourceInferred: 'Source language inferred from video text',
    },
  };

  window.YouTubeToolkitProgressLocale = {
    get(preference) {
      let language = preference;
      if (language === 'system' || !messages[language]) {
        const browserLanguage = (navigator.language || 'en').toLowerCase();
        language = browserLanguage.startsWith('zh')
          ? (/zh-(?:cn|sg)/.test(browserLanguage) ? 'zh-Hans' : 'zh-Hant')
          : 'en';
      }
      return messages[language];
    },
  };
})();
