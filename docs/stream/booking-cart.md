# 介面操作與後端互動

## booking/pages/booking-cart.html
* 此頁的意義：確認營區、日期、zones、租借裝備與預估總額，建立預約 Checkout Session。
* 頁面網址：`/booking/pages/booking-cart.html`

### 載入時
- 從預約購物車 localStorage 讀取 `bookingInfo`、`selectedZones`、`selectedRentals` 與摘要。
- 此頁可修改或移除租借裝備；變更後重新計算前端預估金額。

### 建立預約
- 使用者必須登入。
- POST `/api/booking/checkout/sessions`
    - 傳送營區、日期、入住人數、zones、租借 listing 與付款方式。
    - 後端重新驗證營位、租借庫存、價格與公休，並建立暫時保留的 Booking。
- 若已有被購物車內容取代的 Session：
    - POST `/api/booking/checkout/sessions/{bookingId}/cancel`
    - 取消舊 Session 並釋放保留資源。
- 成功後保存 `bookingId` 與 Session，導向 `booking-checkout.html`。

### 錯誤處理
- 建立失敗先查看 Network 回傳的 `error.code`；常見原因是營位、租借庫存、日期規則或種子資料，不應先修改 Firebase。
