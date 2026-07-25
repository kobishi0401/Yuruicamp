# 介面操作與後端互動

## admin/partials/movement.html
* 此畫面的意義：建立及查詢庫存異動單，管理入庫、出庫、調整、過帳與作廢。
* 載入方式：由 `admin/dashboard.html` 掛載。

### 載入時
- GET `/api/admin/inventory-movements?page=0&size=100&sort=occurredAt,desc`
    - 取得庫存異動列表。
- GET `/api/admin/inventory-movements/lookups`
    - 取得倉別、品項、規格與異動原因選項。
- GET `/api/admin/inventory-movements/{movementId}` 取得單據詳情。

### 異動操作
- POST `/api/admin/inventory-movements` 建立 draft。
- POST `/api/admin/inventory-movements/{movementId}/items` 新增異動明細。
- POST `/api/admin/inventory-movements/{movementId}/post` 過帳並改變正式庫存。
- POST `/api/admin/inventory-movements/{movementId}/cancel` 作廢單據。

### 注意
- 過帳／作廢是不可只靠前端 cache 模擬的狀態轉換，正式模式以後端交易結果為準。
- 表單試算與尚未送出的列編輯只存在前端。
