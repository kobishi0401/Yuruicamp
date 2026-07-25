# 介面操作與後端互動

## booking/pages/camp-detail.html
* 此頁的意義：顯示單一營區詳情，選擇入住日期、分區與營位數量。
* 頁面網址：`/booking/pages/camp-detail.html?id={campgroundId}`

### 載入時
- GET `/api/booking/campgrounds/{campgroundId}` 取得營區、zones、設施與圖片。
- GET `/api/booking/policy` 取得可預約日期範圍。
- Mock 模式載入 availability context；正式模式不下載全部會員預約到瀏覽器。

### 日期與營位
- POST `/api/booking/check-availability`
    - 日期或營位數量改變時，確認各 zone 的剩餘數量與公休狀態。
- 價格依平日／假日夜數、zone 單價與數量在前端預覽；最終仍由建立預約時的後端結果為準。
- 圖片支援輪播及燈箱。

### 下一步
- 選擇結果寫入預約購物車的 localStorage。
- 若需要裝備，前往 `camp-rental.html?campgroundId=...`；也可直接前往 `booking-cart.html`。
- 此階段不需要登入。
