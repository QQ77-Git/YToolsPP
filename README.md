# YToolsPP

**讓 YouTube 更符合你的觀看習慣。**

**Make YouTube fit the way you watch.**

> 瀏覽器擴充功能 · Browser extension · Chrome / Brave

---

## 繁體中文

YToolsPP 是一款以 YouTube 觀看體驗為核心的 Chromium 擴充功能。從 Shorts、播放器版面到雙語字幕，常用控制都集中在工具列彈出視窗，設定會自動儲存並即時套用。

### 功能介紹

| 功能 | 說明 |
| --- | --- |
| 🎬 **觀看體驗** | Shorts 連結可改開一般影片；設定偏好畫質、處理繼續觀看提示，並替頻道連結顯示頻道名稱。 |
| 🖥️ **播放器版面** | 劇院／滿版模式；偵測黑邊後調整畫面，並可選擇黑色或模糊背景。 |
| 💬 **雙語字幕** | 同步顯示原文與翻譯字幕，可選目標語言及字幕外觀；翻譯引擎支援 Google 翻譯與 Gemini。 |
| 🚀 **廣告與片段略過** | 嘗試略過 YouTube 可略過廣告，並自動查詢及略過 SponsorBlock 標記的片段。 |
| 📶 **連線速度** | 在播放器中顯示 YouTube Stats for Nerds 的連線速度。 |
| 🎨 **介面偏好** | 支援淺色、深色或跟隨系統主題，以及繁體中文、簡體中文與英文介面。 |

### 字幕與資料

- 可選 Google 翻譯（預設）或 Gemini 作為字幕翻譯引擎。
- Gemini API 金鑰與翻譯快取儲存在本機，不會同步。
- 翻譯時，字幕內容會送至所選的翻譯服務；SponsorBlock 會使用影片識別碼查詢片段資料。
- 可記住每支影片選用的字幕軌，並於之後播放時還原。

### 安裝方式

1. 開啟 `chrome://extensions` 或 `brave://extensions`。
2. 開啟「開發人員模式」，選擇「載入未封裝項目」。
3. 選取 YToolsPP 專案資料夾。
4. 點選工具列上的擴充功能圖示，調整功能與外觀設定。

設定會自動儲存並即時套用，不需要重新載入 YouTube 分頁。安裝或更新擴充功能後，請重新載入擴充功能，並重新整理已開啟的 YouTube 分頁一次。

字幕翻譯引擎的變更會套用至下一次翻譯請求，不會中斷進行中的翻譯。Shorts 設定只影響之後點擊的 Shorts 連結，不會強制離開目前頁面。

### 瀏覽器支援

- **已測試：** Brave（Chromium／Manifest V3）。
- **目標平台：** Google Chrome 與 Brave；最低 Chrome 版本為 111。
- **預期相容、尚未逐一測試：** Microsoft Edge、Opera 等 Chromium 瀏覽器。
- **不支援：** Firefox 與 Safari。

速度顯示使用 YouTube 內部播放器介面；若 YouTube 更新其播放器，該功能可能需要調整。

---

## English

YToolsPP is a Chromium extension focused on making YouTube more comfortable to use. From Shorts and player layout to bilingual captions, its everyday controls live in the toolbar popup, with settings saved automatically and applied live.

### Features

| Feature | Description |
| --- | --- |
| 🎬 **Viewing experience** | Open Shorts links in the regular player, choose preferred playback quality, handle continue-watching prompts, and show channel names in channel links. |
| 🖥️ **Player layout** | Theater and immersive modes; detect black bars and adjust the frame, with optional black or blurred backgrounds. |
| 💬 **Bilingual captions** | Show original and translated captions together, choose a target language and caption style, and translate with Google Translate or Gemini. |
| 🚀 **Ad and segment skipping** | Attempt to skip YouTube ads when controls are available, and automatically look up and skip SponsorBlock segments. |
| 📶 **Connection speed** | Display the connection speed reported by YouTube Stats for Nerds in the player. |
| 🎨 **Appearance** | Choose a light, dark, or system theme, with Traditional Chinese, Simplified Chinese, and English interface options. |

### Captions and data

- Choose Google Translate (default) or Gemini as the caption translation service.
- The Gemini API key and translation cache are stored locally and are not synced.
- Caption text is sent to the selected translation service when you request a translation. SponsorBlock uses the video ID to look up segment data.
- The selected caption track can be remembered per video and restored on a later visit.

### Installation

1. Open `chrome://extensions` or `brave://extensions`.
2. Enable **Developer mode**, then select **Load unpacked**.
3. Select the YToolsPP project folder.
4. Open the extension from the toolbar to adjust features and appearance.

Settings are saved automatically and applied live; YouTube tabs do not need to be reloaded. After installing or updating the extension, reload the extension and refresh any already-open YouTube tabs once.

Changing the translation service takes effect on the next translation request and does not interrupt a translation already in progress. The Shorts setting affects links clicked afterward and does not navigate away from the current page.

### Browser support

- **Tested:** Brave (Chromium / Manifest V3).
- **Targets:** Google Chrome and Brave; Chrome 111 or later is required.
- **Expected to work but not individually tested:** Microsoft Edge, Opera, and other Chromium browsers.
- **Not supported:** Firefox and Safari.

The connection-speed feature relies on YouTube's internal player interface and may need updates if YouTube changes its player.
