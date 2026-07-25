# 介面操作與後端互動

## storefront/pages/member-center.html
* 此頁的意義：集中管理會員資料、收件地址、訂單、預約、優惠券、偏好與購買評論。
* 頁面網址：`/storefront/pages/member-center.html`
* 此頁需要 Firebase 登入，否則阻擋訪問。

### 載入時
- GET `/api/me` 取得登入會員。
- GET `/api/me/shipping-address` 取得預設收件地址。
- GET `/api/me/orders` 取得本人商城訂單。
- GET `/api/booking/bookings?page=0&size=20` 取得本人預約。
- GET `/api/me/coupons` 取得本人優惠券 claims。
- GET `/api/me/reviews` 取得本人評論。

### 會員操作
- PUT `/api/me/shipping-address` 儲存預設收件地址。
- POST `/api/booking/checkout/sessions/{bookingId}/cancel` 取消可取消的預約。
    - 顯示在訂單詳細最下方。
- POST `/api/checkout/sessions/{orderId}/cancel` 取消未付款商城 Checkout
    - 顯示在訂單詳細最下方。
- POST `/api/me/reviews` 建立購買評論。
    - 可以為獨立商品建立評論限制1000字
    - 可查看歷史評論
    - 評論會更新到後台和商品頁
- POST `/api/me/reviews/photos?orderItemId={id}` 上傳評論圖片。
    - 限制最多5張，每張5MB
- PATCH／DELETE `/api/me/reviews/{reviewId}` 修改或刪除本人評論。

### 注意
- 正式模式的會員身分由 Bearer Token 決定，不採信前端傳入的 customerId。
