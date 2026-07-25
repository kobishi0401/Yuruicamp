# 介面操作與後端互動

## storefront/pages/branches.html
* 此頁的意義：顯示 Yuruicamp 實體分店、合作夥伴與可前往的營區資訊。
* 頁面網址：`/storefront/pages/branches.html`

### 載入時
- GET `/api/branches`
    - 取得啟用中的門市資料；失敗時可回退 Mock branch JSON。
- GET `/api/booking/campgrounds`
    - 取得營區資料；正式模式會再逐筆 GET `/api/booking/campgrounds/{id}` 補齊詳情。
- 公開讀取不需要登入。

### 頁面操作
- 依區域或類型篩選據點。
- 分店可開啟地圖／聯絡資訊；營區可導向預約詳情。
- 篩選與卡片切換在前端完成，不會修改後端資料。
