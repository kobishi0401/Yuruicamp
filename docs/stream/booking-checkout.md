# 介面操作與後端互動

## booking/pages/booking-checkout.html
* 此頁的意義：確認預約人資料、付款方式與後端已建立的 Booking Session。
* 頁面網址：`/booking/pages/booking-checkout.html`
* 此頁需要登入。

### 載入時
- 從 `sessionStorage.lastCheckoutBooking` 讀取預約背包頁剛建立的 Checkout Session。
- 以前一頁保存的購物車 fingerprint 與 `checkoutExpiresAt` 驗證 Session 是否仍可使用。
- 此頁目前不會重新 GET 後端 Session；若本機 Session 缺少、過期或購物車內容已改變，會要求返回預約購物車重新建立。

### 付款
- POST `/api/booking/checkout/sessions/{bookingId}/ecpay`
    - 取得後端簽名的 ECPay 表單並提交到金流。
- Mock 模式不提供 ECPay 表單。
- 前端不得自行組合 ECPay CheckMacValue 或付款簽章。
- 付款後的回跳位置與狀態由後端／ECPay 流程決定。
