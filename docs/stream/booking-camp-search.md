# 介面操作與後端互動

## booking/pages/camp-search.html
* 此頁的意義：依地區、日期、人數與營區條件搜尋可預約營地。
* 頁面網址：`/booking/pages/camp-search.html`
* 搜尋與可用量檢查不需要登入。

### 載入時
- GET `/api/booking/campgrounds`
    - 取得公開營區列表；因列表契約不含完整 zones，正式模式會再逐筆取得營區詳情。
- GET `/api/booking/campgrounds/{campgroundId}`
    - 補齊營區、分區、價格、設施與圖片資料。
- GET `/api/booking/policy`
    - 取得最短入住、最長預約範圍等規則。
- Mock 模式另載營區、預約、封鎖與公休 seed，在瀏覽器建立 availability context。

### 搜尋
- POST `/api/booking/check-availability`
    - 依營區、入住／退房日期與 zone 數量向後端確認可用量。
- 地區、環境、設施與文字條件在前端套用。
- 點擊營區前往 `camp-detail.html?id={campgroundId}`，並保留日期與人數參數。

### 登入
- 搜尋不需要登入；真正建立預約 Checkout Session 時才要求登入。
