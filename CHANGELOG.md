# 更新紀錄 / Changelog

本紀錄只列出可確認的版本變更；不推測更早版本內容。

This log lists only changes that can be verified; earlier history is not inferred.

## 1.0

- 修正手動切換字幕軌後 YouTube 延遲套用選取狀態時未觸發翻譯的問題；避免將 YouTube 自動翻譯字幕誤認為原文來源。

- Fixed missed translation requests when YouTube applies a manually selected caption track late; avoid treating YouTube auto-translated captions as the source transcript.

## 1.17.31

- 修正同一影片快速切換原生 CC 時，舊請求可能被丟棄並重複抓取／翻譯的問題；相同字幕軌的進行中結果可供重新開啟後沿用。
- 字幕逐段到達時先送出可用片段；完整字幕稿到達後，只補送尚未翻譯的時間區段。

- Fixed rapid native CC toggles discarding in-flight results and causing duplicate transcript fetches/translations; reuse valid in-flight results for the same track after re-enabling.
- Start translating available caption chunks as they arrive, then submit only untranslated time ranges when the complete transcript becomes available.

## 1.17.30

- 穩定所有影片的自動黑邊裁切：需連續 3 次確認新狀態才套用或取消，避免短暫畫面變化造成裁切閃爍。

- Stabilized automatic black-bar cropping for all videos: require three consecutive detections before applying or removing a crop to prevent flicker from transient frame changes.

## 1.17.29

- 原生 CC 開啟後立即開始取得完整字幕稿，不再固定等待 3 秒；保留同一事件週期的防抖與逐段字幕回退。

- Start fetching the full transcript immediately after native CC is enabled instead of waiting a fixed 3 seconds; retain same-event debounce and progressive-caption fallback.

## 1.17.28

- 降低 Gemini 請求併發為每次一批；模型備援與整輪重試改採指數退避並加入隨機等待，減少服務繁忙時連續送出請求。

- Limited Gemini requests to one batch at a time and added exponential backoff with jitter for model fallback and whole-translation retries to reduce request bursts during service overload.

## 1.17.27

- Gemini 字幕翻譯每批改為 40 條；預設模型改為 gemini-3.5-flash-lite，備援為 gemini-3.1-flash-lite。

- Gemini subtitle batches now contain 40 cues; gemini-3.5-flash-lite is the default model, with gemini-3.1-flash-lite as fallback.

## 1.17.26

- 降低快速裁切偵測的播放負擔：定時工作只執行裁切偵測，不再每 250 毫秒重跑完整播放器同步。
- 修正 YouTube 原生字幕關閉後重新開啟時可能被舊翻譯嘗試紀錄擋住的問題；字幕重新啟用時清除該字幕軌的失敗／未完成紀錄並重試，保留已完成翻譯快取。

- Reduced playback overhead during fast crop detection by running crop analysis alone instead of a full player sync every 250 ms.
- Fixed native YouTube caption re-enabling being blocked by stale translation-attempt markers; clear stale/incomplete markers and retry while preserving completed translation cache.

## 1.17.25

- 調整 Gemini 模型順序：預設使用 gemini-3.1-flash-lite，暫時性錯誤時改用 gemini-3.5-flash-lite，移除 gemini-3.6-flash。

- Changed Gemini model order to use gemini-3.1-flash-lite by default and gemini-3.5-flash-lite as the transient-error fallback; removed gemini-3.6-flash.

## 1.17.24

- 綜合快速裁切與安全確認：播放前 10 秒每 250 毫秒偵測、連續 3 次確認後裁切；之後每秒持續監看，偵測改變即解除舊裁切。保留黑邊嚴格度與對稱檢查。

- Combined fast cropping with safer validation: sample every 250 ms during the first 10 seconds and crop after 3 consistent detections; continue monitoring every second afterward and clear stale crops immediately. Strict black-bar and symmetry checks remain enabled.

## 1.17.23

- Gemini 翻譯改為每批 20 條字幕、單模型逾時 15 秒，並在進度提示顯示目前模型與批次。
- 自動裁切改用更嚴格的黑邊判定、持續監看播放畫面；偵測結果變動時先解除裁切，避免沿用舊裁切誤傷畫面文字。

- Gemini translation now processes 20 cues per batch, uses a 15-second timeout per model, and shows the active model and batch in progress.
- Auto-crop now uses stricter black-bar detection and keeps monitoring playback; it clears the crop as soon as detection changes instead of retaining a potentially unsafe crop.

## 1.17.22

- Gemini 字幕翻譯新增自動模型備援：依序使用 gemini-3.6-flash、gemini-3.5-flash-lite、gemini-3.1-flash-lite，遇暫時性服務錯誤、逾時或網路錯誤時切換；失敗提示會區分金鑰、權限、配額、模型繁忙、請求格式、網路及回覆格式問題。

- Added Gemini subtitle model failover: tries gemini-3.6-flash, gemini-3.5-flash-lite, then gemini-3.1-flash-lite on transient service, timeout, or network failures; failure notices distinguish key, permission, quota, busy model, request format, network, and invalid response errors.

## 1.17.21

- 加快黑邊裁切偵測：影片播放初期每 250 毫秒取樣，偵測完成或播放停止後恢復低頻同步。

- Sped up black-bar crop detection with 250 ms sampling during early playback, returning to low-frequency sync after detection or pause.

## 1.17.20

- 將翻譯進度通知放入連線速度指示器的同一容器，並排顯示於左側。

- Placed translation progress in the same container as the connection-speed indicator, aligned on its left.

## 1.17.19

- 將字幕翻譯進度通知移至連線速度指示器旁上方，使用相同的播放器右下角定位區域。

- Moved subtitle translation progress above the connection-speed indicator, sharing its lower-right player anchor.

## 1.17.18

- 改用提示文字與可見浮層特徵辨識「影片播放不順嗎？」提示，降低對 YouTube 固定 CSS class 的依賴，並掃描開放式 Shadow DOM。

- Detect the “Video playback isn't smooth?” notice by its text and visible overlay traits instead of fixed YouTube CSS classes, including open Shadow DOM.

## 1.17.17

- 修正 YouTube 完整字幕請求回傳空內容時，未使用已觀察到字幕片段啟動翻譯的問題。

- Fixed translation not starting when YouTube returns an empty full transcript despite observed caption cues.

## 1.17.16

- 修正點擊 YouTube 內建字幕按鈕開啟字幕時，未直接觸發雙語翻譯的問題。

- Fixed bilingual translation not starting when enabling captions with YouTube's native CC button.

## 1.17.15

- 修正雙語字幕開關重新啟用或目標語言變更後，未重新觸發翻譯的問題。

- Fixed translation not restarting after re-enabling bilingual subtitles or changing the target language.

## 1.17.14

- 將連線速度及雙語字幕的頁面訊息來源識別字統一改為 YTools++ 名稱。

- Renamed the speed-display and bilingual-subtitle message source identifiers to the YTools++ namespace.

## 1.17.13

- 將 popup 尺寸、標頭、狀態卡、主功能卡與捲動區調整為統一的緊湊規格。

- Unified popup sizing, header, status card, feature card, and scroll area to the shared compact layout.

## 1.17.12

- 微調 popup 卡片版面與標頭尺寸，維持狀態提示、畫質及功能控制的深色圓角卡片配置。

- Refined popup card layout and header sizing while preserving the dark rounded-card arrangement for status, quality, and feature controls.

## 1.17.11

- 將 popup 主功能區改為深色圓角卡片與右側開關排列，並加強狀態列卡片與功能列間距。

- Restyled the popup's main controls as a dark rounded card with right-aligned toggles and clearer spacing around the status card.

## 1.17.10

- 將 popup 外框、標頭欄位與狀態列位置調整至更接近參考圖的比例與間距。

- Adjusted popup width, header spacing, and status placement to better match the reference proportions.

## 1.17.9

- 調整 popup 標頭、品牌圖示、設定按鈕與狀態列間距，使版面更接近參考圖。

- Adjusted popup header, brand icon, settings button, and status spacing to match the reference layout.

## 1.17.8

- 將字幕顏色、RGB、翻譯引擎、Gemini 金鑰與快取設定收進預設摺疊的進階區。

- Moved subtitle color, RGB, translation engine, Gemini key, and cache controls into a collapsed-by-default advanced section.

## 1.17.7

- 重新整理雙語字幕設定區，統一標籤與控制項對齊，並調整 Gemini 金鑰與快取欄位間距。

- Reorganized subtitle settings with consistent label/control alignment and clearer spacing for Gemini key and cache controls.

## 1.17.6

- 修正擴充功能 popup 依初始視窗尺寸自我限制，造成介面縮成窄條的問題。

- Fixed extension popup sizing feedback that collapsed the interface into a narrow strip.

## 1.17.5

- 將產品名稱更名為 YTools++，並將作者與版本號上下排列、放大作者署名字級。

- Renamed the product to YTools++, stacked the version beneath the author credit, and enlarged the author text.

## 1.17.4

- 將 popup 寬度恢復為固定 390px，避免擴充功能 popup 依視窗寬度計算時被壓縮。

- Restored a fixed 390px popup width to prevent extension popup intrinsic sizing from collapsing it.

## 1.17.3

- 恢復 popup 原本的 390px 寬度，避免窄版最大寬度限制壓縮版面。

- Restored the popup's original 390px width to prevent the narrow-layout cap from shrinking it.

## 1.17.2

- 修正窄版 popup 在垂直捲軸出現時可能產生水平捲軸的問題。

- Fixed horizontal overflow in narrow popup layouts when a vertical scrollbar is present.

## 1.17.1

- 將作者署名移至標題列右側，並在其下方顯示由 manifest 動態讀取的版本號。

- Moved the author credit to the right side of the header and added a manifest-driven version label beneath it.

## 1.17.0

- 將作者署名移至介面頂端，並以更精簡的留白、分隔線與紫色點綴重新整理擴充功能 popup。

- Moved the author credit to the top and simplified the extension popup with cleaner spacing, dividers, and purple accents.

## 1.16.7

- 修正選軌更新競速造成的字幕回應遺失；手動軌道未能與字幕清單識別值匹配時使用播放器回報的手選軌。完整逐字稿不可用時，改翻譯播放中收到的字幕片段並逐批合併結果；診斷預設關閉。

- Fixed caption-response loss during track-selection races and use the player's manually selected track when it cannot be matched to the track list. If a full transcript is unavailable, translate observed playback chunks progressively and merge results; diagnostics are opt-in.

## 1.16.6

- 手動切換或還原字幕軌後，該影片以所選字幕作為翻譯來源，並略過擴充功能自動選軌。

- Manual caption selections and restored selections now take priority as the translation source, preventing automatic track selection from overriding them.

## 1.16.5

- 保留原有全播放器倒數遮罩，將純黑遮罩濃度加深至 98%。

- Kept the existing full-player countdown mask and increased its black opacity to 98%.

## 1.16.3

- 將倒數遮罩背景色恢復為原本的 90% 黑色，並強制遮罩不透明以加深影片背景遮蔽。

- Restored the countdown overlay's original 90%-black background and made the overlay fully opaque to darken the video behind it.

## 1.16.2

- 加深「下一部影片將在 X 秒後播放」倒數卡片背景為完全不透明黑色。

- Darkened the “Up next” countdown card to fully opaque black.

## 1.16.1

- 黑邊裁切只在影片播放時間前 10 秒偵測；超過 10 秒後固定當前裁切，並在新影片開始時重新判斷。

- Black-bar cropping now runs only during the video's first 10 seconds, then keeps the current crop fixed and resets for each new video.

## 1.16.0

- 記住使用者在各影片手動選擇的字幕軌，並在下次播放時優先還原；偏好僅保存在本機，最多保留 100 支影片。
- 修正手動切換字幕軌後未重新觸發翻譯，並忽略舊字幕軌的翻譯結果。

- Remember each video's manually selected caption track and restore it on later visits; preferences are stored locally for up to 100 videos.
- Restart translation after manual caption-track changes and ignore stale results from the previous track.

## 1.15.1

- 修正手動切換 YouTube 字幕軌後未重新觸發翻譯，並忽略舊字幕軌的翻譯結果。

- Fixed translation not restarting after manually switching YouTube caption tracks; stale results from the previous track are ignored.

## 1.15.0

- 多數 YouTube 設定變更可即時套用，不再自動重新載入分頁；Shorts 開關影響後續連結與導覽。
- 更新畫質、速度顯示、劇院模式、繼續觀看提示與頻道名稱替換的即時切換處理。

- Most YouTube settings now apply without reloading the tab; the Shorts toggle affects subsequent links and navigation.
- Added live setting updates for quality, speed display, theater mode, continue-watching prompts, and channel-name replacement.

## 1.14.2

- 修正向右流動漸層未套用彩色文字樣式的問題。

- Fixed right-moving gradients not receiving the gradient text styling.

## 1.14.1

- 修正選擇向右流動漸層時被設定驗證改成單色的問題。

- Fixed right-moving gradient being reset to single-color mode by popup validation.

## 1.14.0

- 流動漸層字幕新增向左與向右兩種方向。

- Added left- and right-moving directions for translated subtitle gradients.

## 1.13.2

- 修正流動漸層循環時跳色，改為完整循環一個漸層圖樣。

- Fixed the moving gradient color jump by looping through one complete gradient tile.

## 1.13.1

- 修正固定漸層與流動漸層字幕文字顯示為黑色的問題。

- Fixed static and moving gradient subtitles rendering as black text.

## 1.13.0

- 翻譯字幕新增彩虹循環、固定漸層、流動漸層與 RGB 呼吸光暈模式，並保留單色模式。

- Added rainbow cycle, static gradient, moving gradient, and RGB breathing-glow modes for translated subtitles, while retaining single-color mode.

## 1.12.0

- 翻譯字幕顏色與 RGB 漸變動畫可即時套用，不需重新載入影片頁。

- Translated subtitle color and RGB cycling animation now apply live without reloading the video page.

## 1.11.1

- 新增翻譯字幕顏色的恢復預設按鈕。

- Added a reset-to-default button for the translated subtitle color.

## 1.11.0

- 新增翻譯字幕文字顏色自訂，預設維持原本的淺黃色。

- Added a customizable translated subtitle text color, retaining the existing light-yellow default.

## 1.10.14

- 自動播放的下一部影片提示現在會以半透明黑色遮罩覆蓋整個播放器，並提高提示文字的對比。

- The autoplay next-video prompt now dims the full player with a translucent black overlay and improves text contrast.

## 1.10.13

- 自動黑邊裁切會先裁掉影片內的黑邊，再將有效畫面等比例放至最大；剩餘空間由劇院模式背景填補。

- Automatic black-bar cropping now removes embedded bars and maximizes the remaining picture proportionally, letting the theater background fill unused space.

## 1.10.12

- 為 Google 與 Gemini 字幕翻譯加入逾時提示與重試保護；Gemini 快取不再阻塞翻譯結果。
- 顯示翻譯完成、失敗、逾時、重試中與缺少 Gemini 金鑰等狀態，並將提示移至播放器底部中央。

- Add timeout notifications and retry protection to Google and Gemini subtitle translation; Gemini cache operations no longer block translation results.
- Show completion, failure, timeout, retry, and missing Gemini key states in a toast centered at the bottom of the player.

## 1.10.11

- 劇院模式自動黑邊裁切現在會偵測並裁切上、下、左、右黑邊，並依黑邊位置對齊畫面。

- Theater-mode automatic black-bar cropping now detects bars on all four edges and aligns the crop to their position.

## 1.10.10

- 修正英文頻道名稱與 Gemini 金鑰說明，讓替換行為和金鑰儲存方式更清楚。

- Clarify the channel-name replacement behavior and local-only Gemini API key storage.

## 1.10.9

- 使用 YouTube 實際載入的完整字幕回應翻譯，避免來源字幕網址回傳空內容時中止翻譯。
- 只有原文與目標語言一致時才跳過翻譯；中文原文可翻譯成其他語言。
- 不再因原文是中文而預設關閉字幕，讓中文原文也能翻譯成不同目標語言。

- Translate from YouTube's observed full-caption response when available, avoiding silent skips when the track URL returns an empty body.
- Skip translation only when source and target languages match; Chinese source captions can be translated to other languages.
- Keep captions enabled for Chinese source videos so they can be translated to a different target language.

## 1.10.8

- 先分析影片標題，再分析簡介與關鍵字，以多字詞或連續文字推測來源語言；只在有相符字幕軌時採用，並標示為推測。
- 不用單一漢字判斷中文或日文。

- Infer source language from the title first, then description and keywords, using phrases or text runs; apply only when a matching caption track exists and label it as inferred.
- Do not classify Chinese or Japanese from a single Han character.

## 1.10.7

- 翻譯前先取得完整來源字幕再一次送出；不再把播放中觀察到的零碎字幕當完整稿。
- 翻譯失敗時使用同一份完整字幕快照重試，最多 3 次。

- Fetch the complete source transcript before submitting it once; do not treat playback fragments as a full transcript.
- On translation failure, retry using the same complete transcript snapshot up to 3 times.

## 1.10.6

- 關閉廣告略過時解除播放器 MutationObserver；重新啟用時再掛回。
- 同一來源字幕翻譯失敗後不再自動重送，避免播放途中重新啟動整段翻譯。

- Disconnect the player MutationObserver while ad skipping is disabled; reattach it when enabled.
- Do not automatically resubmit a failed full-transcript translation for the same source track.

## 1.10.5

- 將廣告期間的重查間隔由 100 毫秒調整為 300 毫秒，降低重複檢查頻率；播放器變化仍會即時觸發檢查。

- Increase the ad-state polling interval from 100 ms to 300 ms to reduce repeated checks; player changes still trigger immediate checks.

## 1.10.4

- 翻譯前先檢查頁面快取；命中時直接顯示快取字幕。
- 中文原文不再送交翻譯，並清除舊的譯文字幕。

- Check the page cache before translating and display cached captions on a hit.
- Skip translation for Chinese source captions and clear stale translated captions.

## 1.10.3

- 改善原文字幕選擇；無法判定時優先使用英文字幕，並標示來源語言未確認。
- 不再任意選取第一條自動生成字幕作為原文。

- Improve source-caption selection; use English as a labeled fallback when the source language is uncertain.
- Stop arbitrarily selecting the first auto-generated caption track as the source.
