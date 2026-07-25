# 介面操作與後端互動

## booking/pages/rental-guide.html
* 此頁的意義：說明營地與裝備租借流程、計價、取還與注意事項。
* 頁面網址：`/booking/pages/rental-guide.html`

### 載入時
- 主要內容為靜態 HTML，不呼叫預約業務 API。
- Booking 共用 layout 會載入頁首、頁尾、設定、`ApiClient` 與 Firebase 登入狀態。

### 頁面操作
- 提供前往營區搜尋與租借流程的導引連結。
- 不建立或修改預約資料。
