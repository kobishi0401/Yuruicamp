# 介面操作與後端互動

## booking/pages/camp-rental.html
* 此頁的意義：為已選營區與日期加選租借裝備。
* 頁面網址：`/booking/pages/camp-rental.html?campgroundId={campgroundId}`

### 載入時
- GET `/api/booking/equipment?campgroundId={campgroundId}`
    - 取得該營區可租借的 listing、規格與每日價格。
- 已選營區、日期與 zone 來自預約購物車 localStorage。
- 公開讀取不需要登入。

### 裝備操作
- 分類篩選、數量增減及價格試算在前端完成。
- 正式公開 API 不揭露即時租借庫存；建立 Checkout Session 時由後端再次檢查並鎖定。
- 選取結果寫回預約購物車，接著前往 `booking-cart.html`。
