# 介面操作與後端互動

## storefront/pages/checkout-success.html
* 此頁的意義：顯示商城訂單付款／成立狀態與訂單摘要。
* 頁面網址：`/storefront/pages/checkout-success.html?orderId={orderId}`
* 此頁需要登入，且只能讀取登入會員自己的 Checkout Session。

### 載入時
- 從網址取得 `orderId`。
- GET `/api/checkout/sessions/{orderId}`
    - 取得訂單、金額、付款方式、Checkout step 與付款狀態。
- 若缺少 ID、無權限或查詢失敗，顯示錯誤狀態與返回操作。

### 狀態呈現
- 依 `checkoutStep`、訂單狀態與付款狀態顯示成功、待付款、取消或失敗。
- ECPay 回跳仍以後端 Session 狀態為準，不信任網址參數直接判定付款成功。
- 提供返回首頁、查看會員訂單等導引。
