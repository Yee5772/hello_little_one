# 跟屁寵 Hello Little One Desktop

在 Windows 檔案總管開啟專案資料夾，雙擊 **Play.cmd**。也可以在專案目錄執行 `npm.cmd start`。本機進度儲存在 `.local/player`。

- 主畫面右上角可以切換繁體中文和英文。設定面板可分別調整音樂與音效。
- 點擊房間的門，寵物會跳到桌面。把寵物拖放到可見的遊戲房間內就能帶牠回家。檔案總管等視窗的可見上緣可以讓寵物站立。
- 點擊寵物可打開對話框。點擊鏡子會放大到換裝場景。穿上蝴蝶結、墨鏡或新生成的服裝後，可直接拖動服裝調整位置。

## AI 設定

參考專案的 AI 介面使用 AkarionHub。在專案根目錄建立自己的 `.env`，填入自己的專案 ID 和 Player 模式 API key，重新啟動後即可測試。

```dotenv
AKARION_PROJECT_ID=你的專案ID
AKARION_API_KEY=你的Player金鑰
```

傳送聊天時，聊天文字及寵物對話上下文會送到設定的 AI 服務。在鏡前請寵物換裝時，生成流程會把原本的寵物動畫拼圖送到服務，將生成服裝套用到各影格。生成結果與遊戲進度保存在本機。必要時可透過 `HLO_CHAT_MODEL` 和 `HLO_OUTFIT_MODEL` 指定專案可用的模型。

## 素材

介面、美術、音樂、音效及場景基礎來自你提供的 Hello Little One 素材與參考專案。原始署名為 Art © Bamaogi · Code © Yapi。這個版本獨立使用本機存檔。主畫面、房間、背包、換裝、信箱、設定、商店和試衣間的 PSD 及 Sample 副本在 `reference`。
