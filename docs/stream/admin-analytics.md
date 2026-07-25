# 介面操作與後端互動

## admin/partials/analytics.html
* 此畫面的意義：後台營運摘要，顯示商城訂單、商品、預約的指標與圖表。
* 載入方式：由 `admin/dashboard.html` 掛載，不是獨立完整頁面。

### 載入時
- GET `/api/admin/orders` 取得訂單資料。
- GET `/api/admin/products` 取得商品與庫存相關資料。
- GET `/api/admin/bookings` 取得預約資料。
- Mock 模式改讀 orders、products 與 camp bookings JSON。

### 圖表與篩選
- 前端依日期區間、狀態與資料類型計算營收、訂單量、預約量、熱銷等摘要。
- Chart.js 負責圖表呈現；切換篩選不修改後端。
- 後端模式的金額與狀態以 API 回傳為準，不合併 Mock cache。

### 權限
- 需要後台登入及分析／對應資料讀取權限。
