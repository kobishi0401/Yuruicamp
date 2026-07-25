# 介面操作與後端互動

## admin/partials/customers.html
* 此畫面的意義：查詢會員、查看訂單／預約關聯、維護資料、標籤、偏好、地址與帳號狀態。
* 載入方式：由 `admin/dashboard.html` 掛載。

### 載入時
- GET `/api/admin/customers?page=0&size=100&sort=registeredAt,desc`。
- GET `/api/admin/customer-tags` 取得啟用標籤。
- GET `/api/admin/preference-options` 取得偏好選項。
- 開啟詳情時 GET `/api/admin/customers/{customerId}`。
- 關聯頁籤會再讀 GET `/api/admin/orders` 與 GET `/api/admin/bookings`。

### 會員操作
- PATCH `/api/admin/customers/{customerId}` 更新基本資料。
- POST `/api/admin/customers/{customerId}/suspend`／`reactivate` 停用或恢復。
- PUT `/api/admin/customers/{customerId}/tags` 完整取代標籤集合。
- PUT `/api/admin/customers/{customerId}/preferences` 完整取代偏好集合。
- PUT `/api/admin/customers/{customerId}/default-shipping-address` 更新預設地址。

### 標籤池
- POST／PATCH／DELETE `/api/admin/customer-tags/{tagId}` 管理標籤；被引用時刪除可能回 409。
- 正式後端目前不開放管理員直接建立會員。
