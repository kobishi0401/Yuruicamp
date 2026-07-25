# 介面操作與後端互動

## admin/partials/reviews.html
* 此畫面的意義：查詢商城購買評論、查看評分／圖片／內容並刪除違規評論。
* 載入方式：由 `admin/dashboard.html` 掛載。

### 載入時
- GET `/api/admin/reviews?{filters}`
    - 支援分頁、評分、關鍵字或其他後端查詢條件。
- GET `/api/admin/reviews/{reviewId}`
    - 開啟評論詳情。

### 評論操作
- DELETE `/api/admin/reviews/{reviewId}`
    - 硬刪整則評論，關聯圖片由後端一併處理。
- 搜尋、篩選及開關明細不修改資料。

### 注意
- 刪除是具破壞性的後台操作，需相應權限並以後端成功結果更新畫面。
- 會員自己的評論新增／修改走 `/api/me/reviews`，不使用後台端點。
