# 介面操作與後端互動

## booking/pages/member-center.html
* 此頁的意義：在預約站外殼中顯示與商城共用的會員中心。
* 頁面網址：`/booking/pages/member-center.html`
* 此頁需要 Firebase 登入。

### 載入時
- 動態載入 `/components/member-center.partial` 與 `/components/shipping-address-modal.partial`。
- GET `/api/me`、`/api/me/shipping-address`、`/api/me/orders`。
- GET `/api/booking/bookings?page=0&size=20`。
- GET `/api/me/coupons`、`/api/me/reviews`。

### 會員操作
- 與 `storefront/pages/member-center.html` 共用 `components/member-center.js`。
- 可管理個人資料、預設地址、商城訂單、營地預約、優惠券與評論。
- 取消預約使用 POST `/api/booking/checkout/sessions/{bookingId}/cancel`。

### 差異
- 頁首、頁尾與返回導覽採 Booking layout；資料契約與商城會員中心相同。
