# 介面操作與後端互動

## storefront/pages/checkout.html
* 此頁的意義：填寫商城收件、配送、付款與優惠券資料，完成已建立的 Checkout Session。
* 頁面網址：`/storefront/pages/checkout.html`
* 此頁需要登入；沒有有效 Checkout Session 時會要求返回購物車重建。

### 載入時
- 透過`POST /api/checkout/sessions` 建立結帳商品資料
    - 15分鐘內沒有取消、更改或完成流程都會通過session 保存結帳資訊
- GET `/api/branches` 取得門市取貨選項。
    - 門市取貨選項通過這個api 撈取。
- GET `/api/me/shipping-address` 取得會員預設收件地址。
    - 取得會員儲存地址。
- GET `/api/me/coupons` 取得本人已領優惠券。
    - 已領優惠卷選項通過api 撈取。

### 更新結帳資料
- PUT `/api/me/shipping-address`
    - 設定當下地址也更新會員預設地址
- POST `/api/me/coupons/claims`：依優惠券主檔 ID 領券。
- PATCH `/api/checkout/sessions/{orderId}`
    - 更新收件資料、配送方式、付款方式或優惠卷，後端回傳最終金額。

### 套用優惠卷
- 待擴充

### 完成付款
- POST `/api/checkout/sessions/{orderId}/confirm-cod` 確認貨到付款，導向`checkout-success.html`
- POST `/api/checkout/sessions/{orderId}/ecpay` 取得後端簽名的 ECPay 表單；前端不自行產生簽章。
- 成功後清空購物車並導向 `checkout-success.html?orderId={orderId}`。
- Session 逾時會清除冪等狀態，但保留購物車供重新建立。
