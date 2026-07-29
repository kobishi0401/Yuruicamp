# 介面操作與後端互動

## storefront/pages/checkout.html
* 此頁的意義：填寫商城收件、配送、付款與優惠券資料，完成已建立的 Checkout Session。
* 頁面網址：`/storefront/pages/checkout.html`
* 此頁需要登入；沒有有效 Checkout Session 時會要求返回購物車重建。

### 載入時
- 透過 `POST /api/checkout/sessions` 建立結帳商品資料
    - 15 分鐘內沒有取消、更改或完成流程都會通過 session 保存結帳資訊
- GET `/api/branches` 取得門市取貨選項。
- GET `/api/me/shipping-address` 取得會員預設收件地址（與會員中心同一 Modal／資料源）。
- GET `/api/me/coupons` 取得本人已領優惠券。

### 更新結帳資料
- PUT `/api/me/shipping-address`
    - Checkout 編輯配送地址 Modal 儲存時同步寫回會員預設地址（ADR 0003）
- POST `/api/me/coupons/claims`：依優惠券主檔 ID 領券。
- PATCH `/api/checkout/sessions/{orderId}`
    - 更新收件資料、配送方式（`delivery`／`pickup`／`cvs`）、付款方式或優惠券，後端回傳最終金額。
    - 超商取貨：選店前不可寫 `shipping.method=cvs`；須先完成電子地圖。

### 超商選店（物流）
- POST `/api/checkout/sessions/{orderId}/ecpay/cvs-map`：取得綠界電子地圖表單；前端不自行簽章。
- 選店結果由綠界 callback `POST /api/logistics/ecpay/map-result` 寫入門市後導回 checkout。

### 套用優惠券
- PATCH `/api/checkout/sessions/{orderId}` 帶 `couponClaimId`（後端重算折扣）；空 `{}` 可清除。見 Checkout／Coupon 契約。

### 完成付款
- POST `/api/checkout/sessions/{orderId}/confirm-cod` 確認貨到付款，導向 `checkout-success.html`
- POST `/api/checkout/sessions/{orderId}/ecpay` 取得後端簽名的 ECPay **付款**表單；前端不自行產生簽章。
- 成功後清空購物車並導向 `checkout-success.html?orderId={orderId}`。
- Session 逾時會清除冪等狀態，但保留購物車供重新建立。

> **提醒：** 付款成功只改 `payment_status=paid`；綠界物流單在 Admin `POST /api/admin/orders/{id}/ship` 才建立。
