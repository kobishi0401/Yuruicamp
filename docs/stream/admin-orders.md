# 介面操作與後端互動

## admin/partials/orders.html
* 此畫面的意義：查詢商城訂單、查看明細、出貨、完成及維護內部備註。
* 載入方式：由 `admin/dashboard.html` 掛載。

### 載入時
- GET `/api/admin/orders?page=0&size=100&sort=createdAt,desc`
    - 取得後台訂單列表與分頁 metadata。
- GET `/api/admin/customers`
    - 補充會員顯示資訊。
- 開啟明細時 GET `/api/admin/orders/{orderId}`。

### 訂單操作
- POST `/api/admin/orders/{orderId}/ship`
    - 執行出貨狀態轉換，可包含物流資料。
- POST `/api/admin/orders/{orderId}/complete`
    - 完成訂單。
- PATCH `/api/admin/orders/{orderId}/internal-note`
    - 覆寫只有後台可見的內部備註。
- 搜尋、狀態篩選與畫面分頁不直接修改資料。

### 注意
- 狀態轉換必須由後端驗證，不可只改前端 cache。
- 正式模式不與 Mock orders 合併。
