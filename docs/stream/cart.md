# 介面操作與後端互動

## storefront/pages/cart.html
* 此頁的意義：確認商城購物車內容、數量、金額並建立 Checkout Session。
* 頁面網址：`/storefront/pages/cart.html`

### 載入時
- 前端計算商品小計與預估運費；空購物車顯示返回商品頁。
- 若存在舊的未完成 Checkout Session，購物車內容變更時會先取消舊 Session。

### 購物車操作
- 修改數量、移除或清空購物車只更新前端狀態與 localStorage。
- 同商品以 `productId + variantId` 區分購物車列。

### 載入
- 使用者必須登入。
- POST `/api/checkout/sessions`
    - 傳送商品簡易資訊、數量、價格
    - 冪等鍵: 避免使用者重複點擊建立重複訂單
    - 後端重新驗證價格，避免local storage 被修改價格
    - 商品有15分鐘的保留期
        - 15分內其他使用者不會買到這裡的商品量。
        - 15分鐘沒有完成流程，視為取消並將數量重新加回庫存。
    - 添加的數量超過庫存時回傳toast error message 

### 修改購物車
- POST `/api/checkout/sessions/{orderId}/cancel`
    - 修改數量、清除商品會取消現有的保留帳，新增新的保留帳
    - session 過期會取消保留帳
- 建立成功後把 Session 暫存在 `sessionStorage`，再前往 `checkout.html`。


