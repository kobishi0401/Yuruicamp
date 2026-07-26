# Admin API Contract（v0.23）

| 欄位 | 內容 |
|------|------|
| **狀態** | Locked（G-1～G-6 已實作；W1～W3；W4-01～03；W4-06 Analytics） |
| **日期** | 2026-07-25 |
| **版本** | 0.23 |
| **共用** | [`common-api-conventions.md`](./common-api-conventions.md) |
| **Base** | `/api/admin` |
| **認證** | Bearer Firebase ID Token + `admin_users` 白名單 + `active=true` |

---

## 0. 一句話

後台所有 API 走 `/api/admin/**`；每次請求都從角色預設與個人覆寫計算有效權限，管理員帳號管理固定使用 `permissions.view`／`permissions.edit`。

---

## 1. 認證

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/api/admin/auth/firebase/session` | 見 [`auth-api-contract.md`](./auth-api-contract.md) |

其餘 `/api/admin/**`：無有效 Admin → `401`／`403`（`ADMIN_NOT_WHITELISTED`／`ADMIN_INACTIVE`）。

### RBAC（G）

| 概念 | DB |
|------|-----|
| 權限碼 | `admin_permissions.code`（如 `orders.view`） |
| 角色映射 | `admin_role_permissions` |
| 檢查時機 | 每個寫入／敏感讀 |

每個 Admin Controller 端點都必須以 `@PreAuthorize` 標註所需 permission；`ROLE_ADMIN` 只代表白名單身分，不代表擁有全部細權限。

---

## 2. 管理員帳號

| 方法 | 路徑 | 權限（建議） | 說明 |
|------|------|--------------|------|
| `POST` | `/api/admin/users` | `permissions.edit` | 用 email 建白名單列（`active=true`，`firebase_uid=null`） |
| `GET` | `/api/admin/users` | `permissions.view` | 分頁列表 |
| `GET` | `/api/admin/users/{id}` | `permissions.view` | 詳情、個別覆寫與有效權限 |
| `PATCH` | `/api/admin/users/{id}` | `permissions.edit` | 改 `active`／`role`／`name` |
| `PUT` | `/api/admin/users/{id}/permissions` | `permissions.edit` | 以完整權限集合取代個別覆寫 |
| `GET` | `/api/admin/permissions` | `permissions.view` | 權限字典與角色預設 |

### `AdminUser`（回應）

| JSON | DB |
|------|-----|
| `id` | `admin_users.id` |
| `email` | `email` |
| `name` | `name` |
| `role` | `admin` \| `operator` \| `warehouse` |
| `active` | boolean |
| `firebaseUid` | string \| null |
| `createdAt` | string |
| `updatedAt` | string |
| `permissionOverrides` | object；詳情回傳 |
| `effectivePermissions` | string[]；詳情回傳 |

**不**回傳密鑰；無密碼欄位。

建立 Request 固定為 `name`、`email`、`role`；ID 由後端產生。Email 建立後不可由一般 PATCH 修改。個別覆寫只保存與角色預設不同的項目，`edit=true` 時同 section 的 `view` 必須也是 true。

禁止停用自己、停用或降級最後一位啟用中的 `admin`，也不提供管理員 DELETE。

---

## 3. Customers

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `GET` | `/api/admin/customers` | `customers.view` | 分頁、篩選與排序 |
| `GET` | `/api/admin/customers/{id}` | `customers.view` | 詳情與關聯摘要 |
| `PATCH` | `/api/admin/customers/{id}` | `customers.edit` | 更新姓名、電話、生日與點數 |
| `PUT` | `/api/admin/customers/{id}/tags` | `customers.edit` | **完整集合取代**會員標籤指派（W1-03） |
| `PUT` | `/api/admin/customers/{id}/default-shipping-address` | `customers.edit` | 覆寫預設收件地址（W1-04） |
| `PUT` | `/api/admin/customers/{id}/preferences` | `customers.edit` | **完整集合取代**會員偏好（W1-05） |
| `POST` | `/api/admin/customers/{id}/suspend` | `customers.edit` | `active` → `suspended` |
| `POST` | `/api/admin/customers/{id}/reactivate` | `customers.edit` | `suspended` → `active` |

列表參數：`page` 從 `0` 開始，`size` 為 `1`～`100`，並支援 `q`、`status`、`tier`、可重複的 `tagId` 及 `sort`。排序白名單為 `registeredAt`、`totalSpent`、`name`、`points`、`updatedAt`，預設 `registeredAt,desc`。

### `AdminCustomer`（甲）

| JSON | DB |
|------|-----|
| `id` | `customers.id` |
| `name` | `name` |
| `email` | `email` |
| `phone` | string \| null |
| `status` | `active` \| `suspended` \| `deleted` |
| `tier`／`tierName` | |
| `points` | integer |
| `authProvider` | |
| `firebaseUidBound` | boolean；不回傳完整 UID |
| `registeredAt` | |
| `firstPurchaseUsed` | boolean |
| `totalSpent` | `customer_tier_summary.total_spent`，無消費時為 `0.00` |
| `tags` | 詳情與列表的標籤（寫入見 W1-03） |
| `defaultShippingAddress` | 詳情的預設地址；寫入見下方 W1-04 |
| `preferences` | 詳情偏好；寫入見下方 W1-05 |

`tier`、`tierName` 與 `totalSpent` 由資料庫 View 計算，前端不得自行覆蓋。PATCH 不接受 Email、登入來源、Firebase UID、狀態、等級、消費總額或首購狀態。

本切片不提供管理員建立會員、修改 Email、刪除或恢復 deleted 會員。停權與恢復使用語意化端點，禁止硬刪。

### 會員標籤池（Customer Tags／W1-02）

前端舊 Mock 路徑名為 `tag-pool`；正式資源固定為 **`/api/admin/customer-tags`**（對應表 `customer_tags`）。

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `GET` | `/api/admin/customer-tags` | `customers.view` | 標籤池列表；預設只回 `active=true` |
| `GET` | `/api/admin/customer-tags/{id}` | `customers.view` | 單筆詳情 |
| `POST` | `/api/admin/customer-tags` | `customers.edit` | 建立標籤 |
| `PATCH` | `/api/admin/customer-tags/{id}` | `customers.edit` | 更新 name／color／sortOrder／active |
| `DELETE` | `/api/admin/customer-tags/{id}` | `customers.edit` | 硬刪；**有指派時禁止** |

列表參數：

| 參數 | 說明 |
|------|------|
| `includeInactive` | boolean，預設 `false`；`true` 時含停用標籤 |
| 排序 | 固定 `sort_order ASC, id ASC`（本版不開放自訂 sort） |

#### `AdminCustomerTag`（甲）

| JSON | DB | 規則 |
|------|-----|------|
| `id` | `customer_tags.id` | |
| `name` | `name` | 必填；trim 後 1～100 字；**UNIQUE**；重複 → `409 CONFLICT` |
| `color` | `color` | 必填；自由字串上限 **32**（常用 Bootstrap badge class，例如 `bg-success`） |
| `sortOrder` | `sort_order` | integer ≥ 0；建立時可省略，預設 `0` |
| `active` | `active` | boolean；建立時可省略，預設 `true` |
| `createdAt`／`updatedAt` | | Instant |

建立 Request：

```json
{ "name": "VIP", "color": "bg-success", "sortOrder": 10, "active": true }
```

更新 Request（皆可選；未傳的欄位保留原值）：

```json
{ "name": "高消費", "color": "bg-warning text-dark", "sortOrder": 1, "active": false }
```

| 規則 | 說明 |
|------|------|
| 刪除 | 無任何 `customer_tag_assignments` 列才允許硬刪 |
| 有指派 | `DELETE` → `409 CONFLICT`，訊息指引改 `PATCH` 設 `active=false` |
| 停用 | `active=false` 後，會員詳情／列表既有讀模型只顯示 active 標籤（與 G-2a 一致） |
| 權限 | 沿用 `customers.*`，不另開 permission code |

### 會員標籤指派（W1-03）

對單一會員做**集合取代**（replace），寫入表 `customer_tag_assignments`。標籤字典 CRUD 見上方「會員標籤池」。

```http
PUT /api/admin/customers/{id}/tags
```

Request：

```json
{ "tagIds": [1, 3] }
```

| 規則 | 說明 |
|------|------|
| 語意 | body 出現的 id → 建立指派；未出現的既有指派 → 刪除；`tagIds: []` → 清空全部 |
| 去重 | 重複 id 視為同一個（後端可去重） |
| 驗證 | 每個 id 必須存在且 `active=true`；否則 → `400 VALIDATION_ERROR` |
| 不存在會員 | `404` |
| deleted 會員 | `409 CONFLICT`（與基本資料 PATCH 一致） |
| 回應 | 成功後回**完整** `AdminCustomer` 詳情（含更新後 `tags[]`） |
| 列表篩選 | 既有 `GET /customers?tagId=` 兩段式讀模型不變；指派後立即生效 |
| 併發 | 交易內鎖定會員主檔（`FOR UPDATE`）再改 assignment |

### 會員預設地址（W1-04）

寫入表 `customer_shipping_addresses` 中該會員 `is_default=true` 的那一列。**不得**改寫既有訂單的 `shipping_*_snapshot`／`recipient_name_snapshot`。

```http
PUT /api/admin/customers/{id}/default-shipping-address
```

Request（全部必填；完整覆寫，非 PATCH 局部欄位）：

```json
{
  "recipientName": "王小華",
  "postalCode": "100",
  "city": "臺北市",
  "district": "中正區",
  "addressLine": "忠孝西路一段 1 號",
  "phone": "0912345678"
}
```

| JSON | DB | 規則 |
|------|-----|------|
| `recipientName` | `recipient_name` | trim 後 1～100 字 |
| `postalCode` | `postal_code` | trim 後 1～10 字 |
| `city` | `city` | trim 後 1～50 字 |
| `district` | `district` | trim 後 1～50 字 |
| `addressLine` | `address_line` | trim 後 1～300 字 |
| `phone` | `phone` | 必須符合 `^09\d{8}$`（台灣手機 09 開頭 10 碼） |

| 規則 | 說明 |
|------|------|
| 語意 | 有預設列 → `UPDATE`；無預設列 → `INSERT` 且 `is_default=true` |
| 不存在會員 | `404` |
| deleted 會員 | `409 CONFLICT` |
| 非法／缺必填 | `400 VALIDATION_ERROR`（含 Bean Validation） |
| 回應 | 成功後回**完整** `AdminCustomer` 詳情（含更新後 `defaultShippingAddress`） |
| 鐵則 | 本 API **只**動 `customer_shipping_addresses`；已成立訂單快照地址不變 |
| 併發 | 交易內鎖定會員主檔（`FOR UPDATE`）再改地址 |

詳情讀取形狀（`AdminCustomerAddress`）：

| JSON | DB |
|------|-----|
| `id` | `customer_shipping_addresses.id` |
| `recipientName` | `recipient_name` |
| `postalCode` | `postal_code` |
| `city` | `city` |
| `district` | `district` |
| `addressLine` | `address_line` |
| `phone` | `phone` |

### 會員偏好（W1-05）

對單一會員做**集合取代**（replace），寫入表 `customer_preferences`。偏好選項主檔 `preference_options` **本季不做 Admin CRUD**；前端只能勾選既有 active 選項（lookup 見下）。

```http
PUT /api/admin/customers/{id}/preferences
```

Request：

```json
{ "optionIds": [2, 5, 9, 11] }
```

| 規則 | 說明 |
|------|------|
| 語意 | body 出現的 id → 建立關聯；未出現的既有關聯 → 刪除；`optionIds: []` → 清空全部 |
| 去重 | 重複 id 視為同一個（後端可去重） |
| 驗證 | 每個 id 必須存在且 `active=true`；否則 → `400 VALIDATION_ERROR` |
| 不存在會員 | `404` |
| deleted 會員 | `409 CONFLICT`（與基本資料 PATCH／標籤指派一致） |
| 回應 | 成功後回**完整** `AdminCustomer` 詳情（含更新後 `preferences`） |
| 併發 | 交易內鎖定會員主檔（`FOR UPDATE`）再改關聯 |

詳情讀取形狀（`preferences`）：依 `preference_options.type` 分組，值為 **code**（不是 id／label）：

```json
{
  "styles": ["backpacking", "hiking"],
  "equipment": ["tent", "backpack"]
}
```

| JSON key | `preference_options.type` | 值 |
|----------|---------------------------|-----|
| `styles` | `style` | `code` 陣列，依 `sort_order, id` |
| `equipment` | `equipment` | 同上 |

#### 偏好選項 Lookup（唯讀）

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `GET` | `/api/admin/preference-options` | `customers.view` | 可勾選清單；預設只回 `active=true` |

列表參數：

| 參數 | 說明 |
|------|------|
| `includeInactive` | boolean，預設 `false`；`true` 時含停用選項（一般編輯 UI 不需要） |
| 排序 | 固定 `type ASC, sort_order ASC, id ASC` |

#### `AdminPreferenceOption`（甲）

| JSON | DB |
|------|-----|
| `id` | `preference_options.id` |
| `type` | `style` \| `equipment` |
| `code` | `code` |
| `label` | `label` |
| `sortOrder` | `sort_order` |
| `active` | `active` |

---

## 4. Orders

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `GET` | `/api/admin/orders` | `orders.view` | 分頁、篩選與排序；列表含 **`displayNo`**（planned） |
| `GET` | `/api/admin/orders/{id}` | `orders.view` | 收件快照、商品明細、中文狀態歷程、`internalNote` |
| `POST` | `/api/admin/orders/{id}/ship` | `orders.edit` | `unshipped` → `shipped` |
| `POST` | `/api/admin/orders/{id}/complete` | `orders.edit` | `shipped` → `completed`；COD 同交易標記 paid |
| `POST` | `/api/admin/orders/{id}/cancel` | `orders.edit` | 未出貨取消 O1（W3-01）；已付款線上單同交易退款 O3 |
| `PATCH` | `/api/admin/orders/{id}/internal-note` | `orders.edit` | 覆寫主檔內部備註；不改履約／付款狀態 |

列表支援 `q`、可重複的 `status`／`paymentStatus`／`paymentMethod`、`placedFrom`／`placedTo` 與 `sort`。排序白名單為 `placedAt`、`total`、`updatedAt`。

線上付款只有 `paid` 且 `refundStatus=none` 才可出貨；COD 可在 unpaid 時出貨，完成時才同步收款。Admin 不得直接改寫 ECPay 付款、退款、訂單內容或任意狀態。

訂單本體欄位對齊 [`order-api-contract.md`](./order-api-contract.md) 的 `Order`。  
狀態轉換必須走狀態機；禁止任意字串 PATCH。

### 未出貨取消（Orders／W3-01＋W3-02）

`POST /api/admin/orders/{id}/cancel`

Request（可省略 body；與 ship／complete 相同）：

```json
{ "note": "客人要求取消，未出貨" }
```

| 規則 | 說明 |
|------|------|
| 允許狀態 | 僅 `status=unshipped`；已 `cancelled` → **冪等回放**（200＋現況） |
| 禁止 | `shipped`／`completed`／`returned` → `409 CONFLICT`（本波不做 O2 退貨） |
| COD unpaid | 本地取消＋釋放 **active** 保留；**不**呼叫綠界；清 `order_coupons`（claim 維持 `claimed`） |
| 線上 unpaid | 同 COD unpaid（會員 Checkout cancel 只覆蓋未付款；本命令亦可由客服執行） |
| 線上 paid | **先**呼叫綠界全額退款（見 [`payment-api-contract.md`](./payment-api-contract.md) §7／§9）；成功後：`status=cancelled`、`payment_status=refunded`、`refund_status=refunded`；券若已 `consumed` → 回滾 `claimed`；**fulfilled** 保留帳維持終態（可用量只扣 `active`） |
| 退款失敗 | **不**改訂單狀態；`409`＋`PAYMENT_REFUND_FAILED`（或 `PAYMENT_PROVIDER_CONFLICT`） |
| 歷程 | 寫 `order_status_history`（cancelled）；退款另寫 `order_event_history`（`event_type=refund`，`source_history_id`＝該次 status history id） |
| 權限 | `orders.edit` |
| 交叉引用 | Payment §7；本波 **不**另開獨立 `POST .../refunds/*`（取消已付款＝同交易退款） |

### 內部備註（Orders）

Request：

```json
{ "internalNote": "已電聯客人，改週三出貨" }
```

| 規則 | 說明 |
|------|------|
| 欄位 | 只接受 `internalNote`（string｜null） |
| 長度 | 最多 **2000** 字元；超過 → `400 VALIDATION_ERROR` |
| 空白 | 空白字串或只含空白 → 存成 DB `null`（清除備註） |
| 寫入 | 只更新 `orders.internal_note` 與 `updated_at` |
| 讀取 | **詳情必回** `internalNote`（string｜null）；**列表省略** |
| 錯誤 | 不存在 → `404`；無權限 → `403` |

`internalNote` **不是** `order_status_history.note`（後者僅在 ship／complete 等狀態轉換時寫入）。

---

## 5. Bookings

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `GET` | `/api/admin/bookings` | `bookings.view` | 分頁、篩選與排序；列表含 **`displayNo`**（planned） |
| `GET` | `/api/admin/bookings/{id}` | `bookings.view` | 營位、租借快照（含 **`lineTotal`**）、**`contact` 快照**、中文 **history**、`internalNote` |
| `POST` | `/api/admin/bookings/{id}/confirm` | `bookings.edit` | 已付款 `pending` → `confirmed` |
| `POST` | `/api/admin/bookings/{id}/complete` | `bookings.edit` | 已退房 `confirmed` → `completed` |
| `POST` | `/api/admin/bookings/{id}/cancel` | `bookings.edit` | 已付款取消 B1（W3-03）；同交易退款 |
| `PATCH` | `/api/admin/bookings/{id}/internal-note` | `bookings.edit` | 覆寫主檔內部備註；不改履約／付款狀態 |

列表支援 `q`、可重複的 `status`／`paymentStatus`／`campgroundId`／`region`、`hasRental`、入住／建立日期範圍與 `sort`。排序白名單為 `createdAt`、`checkIn`、`checkOut`、`finalAmount`、`updatedAt`。

Admin 不能把 unpaid 預約改成 paid。完成預約時會將 active 租借保留標記為 fulfilled。

欄位對齊 Booking 契約精簡形狀。

### 已付款取消（Bookings／W3-03）

`POST /api/admin/bookings/{id}/cancel`

Request（可省略 body）：

```json
{ "note": "客服取消，全額退款" }
```

| 規則 | 說明 |
|------|------|
| 允許 | `payment_status=paid` 且 `status` 為 `pending` 或 `confirmed` |
| 禁止 | `unpaid`（請走會員 Checkout cancel／逾時）；`completed`／已 `cancelled` 以外非法 → `409`；已 `cancelled` → 冪等回放 |
| 退款 | 同訂單：先綠界全額退款成功，再改本地；失敗不改狀態 |
| 成功後 | `status=cancelled`、`payment_status=refunded`；釋放營位占用＋ **active** `rental_stock_reservations` → `released` |
| 權限 | `bookings.edit` |
| 交叉引用 | [`payment-api-contract.md`](./payment-api-contract.md) §7／§9 |

### 內部備註（Bookings）

規則與 Orders 相同：`PATCH .../internal-note`、最多 2000 字、空白清成 `null`、詳情必回、列表省略。  
寫入目標為 `bookings.internal_note`，**不是** `booking_status_history.note`。

---

## 6. Products（後台寫）

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `GET` | `/api/admin/products` | `products.view` | 含 inactive 商品、規格、圖片與唯讀庫存摘要 |
| `GET` | `/api/admin/products/lookups` | `products.view` | 表單分類與品牌選項，回傳正式 ID |
| `GET` | `/api/admin/products/{id}` | `products.view` | 完整詳情，包含 inactive variants |
| `POST` | `/api/admin/products` | `products.edit` | 同交易建立裝備主檔、商品、規格與圖片 |
| `PUT` | `/api/admin/products/{id}` | `products.edit` | 同交易同步商品、規格與圖片 |
| `POST` | `/api/admin/products/{id}/activate` | `products.edit` | 至少一個 active variant 才能上架 |
| `POST` | `/api/admin/products/{id}/deactivate` | `products.edit` | 下架但保留既有資料與訂單快照 |

列表支援 `page`、`size`、`q`、`status`、`categoryId`、`brandId` 與 `sort`。排序白名單為 `id`、`name`、`createdAt`、`updatedAt`，預設 `id,asc`。

### 建立／更新 Request

```json
{
  "name": "Coleman 六人帳篷",
  "description": "<p>適合露營使用。</p>",
  "categoryId": 1,
  "brandId": "coleman",
  "status": "active",
  "images": [
    {
      "url": "/assets/images/products/P001-1.jpg",
      "altText": "Coleman 六人帳篷"
    }
  ],
  "variants": [
    {
      "id": "V001",
      "sku": "TENT-OLIVE",
      "color": "深橄欖綠",
      "size": null,
      "specification": "深橄欖綠",
      "price": "3200.00",
      "status": "active"
    }
  ]
}
```

- 建立商品時不傳商品、裝備與規格 ID；ID 全由後端產生。
- 更新時既有規格必須帶回 `id`，新規格省略 `id`；DB 已存在但 Request 未出現的規格改為 `inactive`，不硬刪。
- `categoryId` 與 `brandId` 使用 lookup ID。SKU 不可重複，價格不可為負數，同一商品的規格組合不可重複。
- Request 可選 `variants[].stockLocations[]`：`{ locationId, onHandQuantity }`（ADM-W2-08）；省略整段＝不改庫存；明示 `0` 才清零。商城 on-hand 由 Products 寫入；稽核單走 `product_stock_update`（post 不定庫存）。
- 圖片依陣列順序寫入 `sort_order`，第一張是主圖；G-2c 只接受 `/assets/**` 或 HTTP(S) URL，不處理檔案上傳。
- Request **不接受** `branch`、`totalStock`、`inventory`、`rentalEnabled`、`camp`、評價或銷售衍生欄位（庫存請用 `stockLocations`）。

### 回應與資料責任

回應以 `equipment_items` → `products` → `product_variants` → `equipment_images` 組合，並多回 `itemId`、分類／品牌名稱、`createdAt`／`updatedAt`。`variants[]` 會包含 inactive variant，以及由 `inventory_stocks` 與 active reservation 計算的 `onHandQuantity`、`reservedQuantity`、`availableQuantity`、`stockLocations[]`。

庫存寫入語意以 **ADM-W2-08／契約 v0.17** 為準：商城 on-hand 可經 Products 寫入；異動頁 `product_stock_update` 只做稽核定稿。前端只有在後端成功回應後才能更新 cache，錯誤時必須保留原 cache 與 Modal 輸入。

公開讀形狀仍見 Product 契約；inactive 商品的 `GET /api/products/{id}` 回 `404`，既有訂單繼續使用自己的商品與規格快照。

### 最低庫存閾值（Min-stocks／W1-07）

> 只寫 `product_variant_min_stocks`／`rental_sku_variant_min_stocks` 的 `minimum_quantity`。  
> **不**改 `inventory_stocks`／`rental_sku_variant_stocks` 的 `on_hand`，也**不**建立庫存異動單。

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `GET` | `/api/admin/min-stocks` | `products.view` | 依 domain／規格／庫位查詢閾值 |
| `PUT` | `/api/admin/min-stocks` | `products.edit` | 批次 upsert（variant × location） |

**定案 RBAC**：讀 `products.view`、寫 `products.edit`（門檻屬商品營運；**不**用 `movement.edit`）。

#### Query（GET）

| 參數 | 必填 | 說明 |
|------|------|------|
| `inventoryDomain` | 是 | `store` \| `rental` |
| `variantId` | 否 | 商城＝`product_variants.id`；租借＝`rental_sku_variants.id` |
| `locationId` | 否 | `inventory_locations.id`（租借為 `RENTAL-C00x`，不是營區 `C00x`） |
| `productId` | 否 | 商城＝`products.id`；租借＝`rental_skus.id`（縮短列表範圍） |

#### Response item

```json
{
  "inventoryDomain": "store",
  "variantId": "V001",
  "productId": "P001",
  "locationId": "main",
  "minimumQuantity": 5,
  "updatedAt": "2026-07-23T02:00:00Z"
}
```

`GET`／`PUT` 的 `data` 皆為 item 陣列。沒有列＝尚未設定（前端可用預設值，例如 5）。

#### Upsert Request（PUT）

```json
{
  "inventoryDomain": "store",
  "items": [
    {
      "variantId": "V001",
      "locationId": "main",
      "minimumQuantity": 5
    }
  ]
}
```

| 規則 | 行為 |
|------|------|
| `minimumQuantity` | 整數且 ≥ 0；負數 → `400 VALIDATION_ERROR` |
| `items` 空白 | `400 VALIDATION_ERROR` |
| 同一請求重複 `(variantId, locationId)` | `400 VALIDATION_ERROR` |
| variant 不存在 | `404 NOT_FOUND` |
| location 不存在／停用 | `404 NOT_FOUND` |
| location 的 `inventory_domain` 與請求 domain 不符 | `400 VALIDATION_ERROR` |
| 已存在列 | 更新 `minimum_quantity` 與 `updated_at` |
| 不存在列 | INSERT |

商城寫入時固定 `inventory_domain='store'`（對齊表 CHECK）。本 API **禁止**夾帶或回寫任何 on-hand／異動欄位。

---

## 7. Inventory movements

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `GET` | `/api/admin/inventory-movements` | `movement.view` | 分頁列表，包含 draft／posted／cancelled |
| `GET` | `/api/admin/inventory-movements/lookups` | `movement.view` | active 庫位與商城／租借規格 ID |
| `GET` | `/api/admin/inventory-movements/{id}` | `movement.view` | 表頭、操作者與 SKU／品名快照明細 |
| `POST` | `/api/admin/inventory-movements` | `movement.edit` | 建立 draft，不改庫存 |
| `POST` | `/api/admin/inventory-movements/{id}/items` | `movement.edit` | 只對 draft 新增明細 |
| `POST` | `/api/admin/inventory-movements/{id}/post` | `movement.edit` | 定稿；語意依 movementType（見下） |
| `POST` | `/api/admin/inventory-movements/{id}/cancel` | `movement.edit` | 作廢 draft；重送冪等 |
| `PATCH` | `/api/admin/inventory-movements/{id}` | `movement.edit` | 改表頭 `reason`（draft／posted） |
| `PATCH` | `/api/admin/inventory-movements/{id}/items/{itemId}` | `movement.edit` | 改列 `lineReason`／`lineNature` |

列表支援 `page`、`size`、`q`、`inventoryDomain`、`status`、`movementType` 與 `sort`。排序白名單為 `occurredAt`、`createdAt`、`updatedAt`、`movementNo`，預設 `occurredAt,desc`。

### 新建允許的類型（W2-08 後）

| `inventoryDomain` | `movementType` | 表頭庫位 | `post` 行為 |
|-------------------|----------------|----------|-------------|
| `store` | `product_stock_update` | 必須雙 NULL；列級 from／to | **只定稿，不改** `inventory_stocks`（商城 on-hand 由 Products 寫） |
| `rental` | `transfer` | 必填兩個不同租借庫位 | **悲觀鎖後改** `rental_sku_variant_stocks`（營地↔營地） |

禁止新建：`receipt`／`write_off`／`store`+`transfer`／跨領域 conversion（請走 `/inventory-conversions`）。
歷史列仍可列表篩選。跨領域 store→rental 仍走 conversions；**禁止**租借→商城。

### 建立 draft — 商城稽核

```json
{
  "inventoryDomain": "store",
  "movementType": "product_stock_update",
  "reason": "門市盤點／調撥稽核",
  "occurredAt": "2026-07-22T04:00:00Z"
}
```

### 建立 draft — 營地互轉

```json
{
  "inventoryDomain": "rental",
  "movementType": "transfer",
  "sourceLocationId": "RENTAL-C001",
  "destinationLocationId": "RENTAL-C002",
  "reason": "營地互轉",
  "occurredAt": null
}
```

### 新增明細

`product_stock_update` 明細需列級 `sourceLocationId` 與／或 `destinationLocationId`（正整數 `quantity`；可選 `lineReason`／`lineNature`）。

`rental` `transfer` 明細只帶規格＋數量（庫位已在表頭）：

```json
{
  "variantId": "RSV-R001-001",
  "quantity": 5
}
```

商城使用 `product_variants.id`，租借使用 `rental_sku_variants.id`。同一異動單不得重複加入同一規格（rental transfer）。posted／cancelled 後不得新增明細。

### 過帳規則

- 交易先悲觀鎖定異動表頭；`posted` 重送回放；`cancelled` 不得過帳；posted 不可取消。
- **`product_stock_update`**：只更新 `status`／`employeeId`／`postedAt`，**不**加減 `inventory_stocks`。
- **`rental` `transfer`**：依 `variantId`、`locationId` 固定順序建立零庫存列並鎖定 → 驗證來源扣減後不得 < 0 且不得低於 active `rental_stock_reservations` → 更新兩邊 `rental_sku_variant_stocks` → 表頭改 posted。任一筆不足回 `409 CONFLICT` 並整筆 rollback。
- 租借 active 保留跨日期，採保守下限：所有 active 租借保留量都視為不可扣除。

異動單本身是不可變庫存歷程；Schema 現有 `employee_id` 保存最後執行過帳或作廢的管理員。

---

## 8. Reviews（後台／W1-06）

定案 **A**：列表＋詳情＋**硬刪整則**。不做回覆、不做軟隱藏／visible 旗標。  
讀模型可對齊線 H 公開評價（`review_dto_view` 概念）；本版 Admin 回扁平 JSON。

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `GET` | `/api/admin/reviews` | `reviews.view` | 分頁、篩選與排序 |
| `GET` | `/api/admin/reviews/{id}` | `reviews.view` | 詳情（含 photos） |
| `DELETE` | `/api/admin/reviews/{id}` | `reviews.edit` | 硬刪整則；`review_photos` 依 FK CASCADE 一併刪 |

列表參數：`page`（預設 0）、`size`（1～100，預設 20）、`q`（比對 id／買家／商品名／評論）、`productId`、`rating`（1～5 精確值）、`createdFrom`／`createdTo`（Instant，含邊界）、`sort`。  
排序白名單：`createdAt`、`rating`；預設 `createdAt,desc`。

#### `AdminReview`（甲）

| JSON | 來源 |
|------|------|
| `id` | `reviews.id` |
| `orderItemId` | `reviews.order_item_id` |
| `orderId` | `order_items.order_id` |
| `customerId` | `orders.customer_id` |
| `productId`／`variantId`／`sku` | 訂單明細快照／欄位 |
| `productName` | `order_items.product_name_snapshot` |
| `buyerName` | `orders.buyer_name_snapshot` |
| `buyerAvatar` | `customers.avatar_url`（可 null） |
| `rating` | 1～5 |
| `comment` | string｜null |
| `photos` | `string[]`（URL，依 `sort_order`） |
| `verifiedPurchase` | 固定 `true`（正式評價皆已購） |
| `createdAt` | Instant |

| 規則 | 說明 |
|------|------|
| 列表 | 兩段式：先分頁取 review id，再組 photos（避免 N:M 放大列數） |
| 刪除 | `DELETE FROM reviews`；photos 由 `ON DELETE CASCADE` 清除 |
| 不存在 | `404` |
| 本版不做 | reply、軟刪、visible、管理員代客寫評價 |

---

## 9. Coupons（後台）

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `GET` | `/api/admin/coupons` | `discounts.view` | 分頁列表；`q`、`status`、`category`、`sort` |
| `GET` | `/api/admin/coupons/{id}` | `discounts.view` | 詳情與已領取數量 |
| `POST` | `/api/admin/coupons` | `discounts.edit` | 建立 |
| `PATCH` | `/api/admin/coupons/{id}` | `discounts.edit` | 部分更新；`code` 不可修改 |
| `DELETE` | `/api/admin/coupons/{id}` | `discounts.edit` | 只刪除從未領取的優惠券 |

建立 Request：

```json
{
  "code": "SUMMER26",
  "name": "夏日優惠",
  "discountType": "percent",
  "discountValue": "15.00",
  "minimumAmount": "1000.00",
  "issueQuantity": 100,
  "validFrom": "2026-08-01T00:00:00Z",
  "validUntil": "2026-09-01T00:00:00Z",
  "status": "active",
  "category": "promotion"
}
```

回應另含 `id`、`claimedQuantity`、`remainingClaimable`、`createdAt`、`updatedAt`。`discountType` 只接受 `fixed|percent`；`category` 只接受 `promotion|birthday|firstPurchase`。後端統一將 code 正規化為大寫並驗證唯一。`issueQuantity` 不得低於既有 `claimedQuantity`，已有領取歷程時刪除回 `409`，應改用 `PATCH status=disabled`。

---

## 10. Campground closures

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `GET` | `/api/admin/campground-closures` | `booking-calendar.view` | 分頁列表；`q`、`campgroundId`、`closureType`、`sort` |
| `GET` | `/api/admin/campground-closures/{id}` | `booking-calendar.view` | 詳情與建立者 |
| `POST` | `/api/admin/campground-closures` | `booking-calendar.edit` | 建立指定期間或每週公休 |
| `PATCH` | `/api/admin/campground-closures/{id}` | `booking-calendar.edit` | 部分更新 |
| `DELETE` | `/api/admin/campground-closures/{id}` | `booking-calendar.edit` | 刪除並立即停止套用 |

指定期間 Request：

```json
{
  "campgroundId": "C001",
  "closureType": "date_range",
  "startDate": "2026-08-01",
  "endDate": "2026-08-04",
  "weekday": null,
  "effectiveFrom": null,
  "effectiveTo": null,
  "reason": "設備維護"
}
```

每週固定 Request 將 `closureType` 設為 `weekly`，提供 `weekday`（0=日、6=六）及 `effectiveFrom`／`effectiveTo`，日期區間欄位設為 null。指定期間採 `[startDate, endDate)`，結束日不公休且必須晚於開始日；每週生效邊界均包含當日。建立者固定取目前登入管理員，前端不得傳入。

---

## 11. Campgrounds（營區主檔｜ADM-W4-01）

權限：`booking-calendar.view`／`booking-calendar.edit`（與公休同一組，不另立 permission code）。

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `GET` | `/api/admin/campgrounds` | `booking-calendar.view` | 列表；**含停用**；依 `id` 升序 |
| `GET` | `/api/admin/campgrounds/{id}` | `booking-calendar.view` | 詳情 |
| `POST` | `/api/admin/campgrounds` | `booking-calendar.edit` | 建立（客戶端提供 slug `id`） |
| `PATCH` | `/api/admin/campgrounds/{id}` | `booking-calendar.edit` | 部分更新；傳 `active` 即啟停 |
| `DELETE` | `/api/admin/campgrounds/{id}` | `booking-calendar.edit` | 無引用才可硬刪；有引用 → `409`，改 `active=false` |

### 欄位策略（與公開 Booking 對齊「策略甲」）

| 欄位 | Admin | 公開 `GET /api/booking/campgrounds` |
|------|-------|--------------------------------------|
| `id`／`name`／`region`／`description`／`active` | 讀寫 | 只回 `active=true`；列表省略 `zones` |
| `createdAt`／`updatedAt` | 唯讀 | 不回 |
| `environmentTags`／`facilityTags` | **本版不做**（M:N 另開） | 公開仍回既有 seed／既有寫入 |
| `zones` | **W4-02 見 §11.1** | 詳情才回 active zones |

### 11.1 Campground zones（營位／區域｜ADM-W4-02）

路徑掛在營區底下；權限同 §11（`booking-calendar.view`／`booking-calendar.edit`）。

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `GET` | `/api/admin/campgrounds/{campgroundId}/zones` | `booking-calendar.view` | 該營區全部營位（**含停用**）；依 `id` 升序 |
| `GET` | `/api/admin/campgrounds/{campgroundId}/zones/{zoneId}` | `booking-calendar.view` | 詳情 |
| `POST` | `/api/admin/campgrounds/{campgroundId}/zones` | `booking-calendar.edit` | 建立（客戶端提供 slug `id`） |
| `PATCH` | `/api/admin/campgrounds/{campgroundId}/zones/{zoneId}` | `booking-calendar.edit` | 部分更新；傳 `active` 即啟停 |
| `DELETE` | `/api/admin/campgrounds/{campgroundId}/zones/{zoneId}` | `booking-calendar.edit` | 無引用才可硬刪；有引用 → `409`，改 `active=false` |

欄位（對齊公開 `Zone`／`campground_zones`）：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | string | 建立後不可改 |
| `campgroundId` | string | 路徑帶入；建立後不可改 |
| `type` | string | 例：草皮區 |
| `capacityPerSite` | int | `> 0`；預設 `1` |
| `priceWeekday`／`priceHoliday` | decimal string | 固定兩位小數；`≥ 0`；UI 分別顯示 **一般價**／**特殊節日價**（見 [`booking-api-contract.md`](./booking-api-contract.md) §0.1；**非**週一～日自動切換） |
| `totalSites` | int | 每晚可賣上限；`> 0` |
| `active` | boolean | 啟停 |
| `createdAt`／`updatedAt` | instant | 唯讀 |

Create Request（`campgroundId` 由路徑決定，body 不送）：

```json
{
  "id": "C010-Z1",
  "type": "草皮區",
  "capacityPerSite": 4,
  "priceWeekday": "1000.00",
  "priceHoliday": "1500.00",
  "totalSites": 5,
  "active": true
}
```

**容量調降規則（對齊 `get_zone_availability`）**

- 更新 `totalSites` 時，後端以 **Asia/Taipei 今日起** 至政策最遠可訂日，逐日計算  
  `peakUsage = max(booked_quantity + blocked_quantity)`（不含公休日）。
- 若新 `totalSites < peakUsage` → `409 CONFLICT`（避免 pending／confirmed 變成幽靈超訂）。
- 調升容量或只改價格／類型／啟停：不額外擋。

硬刪引用檢查（任一 > 0 → `409`，改 `active=false`）：

- `booking_selected_zones`
- `zone_blocks`

**與 `POST /api/booking/check-availability`**

- 只計 **active** 營位；`availableQuantity = totalSites - booked - blocked`（公休日為 0）。
- 新建 active zone 後，公開 `GET /api/booking/campgrounds/{id}` 詳情與 check-availability 應立刻反映（不需重啟）。

### 11.2 Calendar dates（特殊節日曆｜ADM-W4-03）

決定「哪一晚走**特殊節日價** tier」（見 [`booking-api-contract.md`](./booking-api-contract.md) §0.1；**不是**週六日自動切換）。與 **§10 公休**（能不能訂）無關。

權限：`booking-calendar.view`／`booking-calendar.edit`。

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `GET` | `/api/admin/calendar-dates?from=&to=` | `booking-calendar.view` | 區間內**每一天**一列；`from`／`to` 含當日；最長 366 天 |
| `PUT` | `/api/admin/calendar-dates/{date}` | `booking-calendar.edit` | 標記或更新；`isHoliday=false` → **刪除列**（恢復一般日） |
| `DELETE` | `/api/admin/calendar-dates/{date}` | `booking-calendar.edit` | 取消標記（同 `isHoliday=false`） |

Response 單日：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `calendarDate` | date | `YYYY-MM-DD` |
| `isHoliday` | boolean | `true`＝該晚走特殊節日價 |
| `holidayName` | string \| null | 顯示用；非特殊節日必為 null |
| `sourceVersion` | string \| null | 有 DB 列才有；Admin 寫入固定 `admin-manual` |
| `effectiveAt`／`updatedAt` | instant \| null | 有 DB 列才有 |

PUT Request：

```json
{
  "isHoliday": true,
  "holidayName": "國慶日"
}
```

- `isHoliday`：必填。
- `holidayName`：可省略；僅 `isHoliday=true` 時可填。
- `isHoliday=false`：忽略 `holidayName`，刪除該日列。

**與 Booking 結帳**

- `BookingCheckoutRepository.countHolidayDates` 只計 `is_holiday=true` 的住宿日。
- Admin 標記後，新建預約的 `holidayCount`／金額立刻反映；**已建立訂單快照不變**。

Create Request（營區）：

```json
{
  "id": "C010",
  "name": "新營區",
  "region": "東部",
  "description": "可選說明",
  "active": true
}
```

- `id`：必填，`varchar(32)`；建立後不可改。
- `name`／`region`：必填。
- `description`：可省略或 `null`。
- `active`：可省略，預設 `true`。

Patch：未傳欄位保留原值。`active: false`＝停用（公開列表立刻看不到）；`active: true`＝復用。

硬刪前引用檢查（任一 > 0 → `409 CONFLICT`，訊息引導 `active=false`）：

- `campground_zones`
- `bookings`
- `campground_closures`
- `rental_listings`
- `campground_rental_locations`

（環境／設施標籤為 `ON DELETE CASCADE`，不擋硬刪。）

---

### 11.3 Analytics summaries（分析報表彙總｜ADM-W4-06）

伺服器端聚合；**取代**為報表拉 orders／bookings 全列表。自然日邊界：**Asia/Taipei**。Query `from`／`to` 含當日；最長 **366** 天；`to < from` 或缺參 → 400。

權限：僅 **`analytics.view`**（唯讀；v1 不用 `analytics.edit`）。

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/api/admin/analytics/shop-summary?from=&to=` | 商城 KPI、折線 bucket、Top10 |
| `GET` | `/api/admin/analytics/booking-summary?from=&to=` | 預約 KPI、折線、營地／地區 |

#### 共通 Response

| 欄位 | 型別 | 說明 |
|------|------|------|
| `period` | object | `{ from, to }` date |
| `granularity` | string | `day` 或 `week`（區間 >60 天為 `week`） |
| `kpis` | object | 見下表 |
| `timeSeries` | array | `{ bucket, revenue }` |
| Shop | `topProducts[]` | `{ productId, name, revenue, quantity }` Top10 |
| Booking | `byCampground[]` | `{ campgroundId, campgroundName, region, revenue }` |
| Booking | `byRegion[]` | `{ region, revenue }` |

上期比較：v1 前端以等長上期再呼叫一次 summary。

#### Shop 口徑（DB 期間欄=`placed_at`）

| KPI | 規則 |
|-----|------|
| `orderCount` | 期間內所有 status |
| `pendingShipmentCount` | 全量 `unshipped` |
| `refundCount` | 期間 `cancelled` 且（`payment_status=refunded` 或 `refund_status≠none`） |
| `refundRatePercent` | 整數百分比；分母 0 → 0 |
| `soldQuantity` | 期間 `shipped`／`completed` 的 line quantity 加總 |
| 折線／Top10 | 期間 `shipped`／`completed` 的 `total`／line 金額 |
| `returned` | v1 不計入主退款 KPI |

#### Booking 口徑（DB 期間欄=`created_at`）

| KPI | 規則 |
|-----|------|
| `periodBookingCount` | 期間內所有 status |
| `pendingCount` | 全量 `pending` |
| `cancelledCount`／`cancelRatePercent` | 期間 cancelled ÷ 期間總筆數 |
| `completedCount` | 期間 `completed` |
| `revenueTotal`／折線 | 期間且目前 `payment_status=paid` 的 `final_amount` |
| `rentalAmount`／`rentalRatioPercent` | 同上 `rental_total` |

---

## 12. G-6 前端正式 Runtime

- `AppConfig.ADMIN.USE_BACKEND=true` 時，`AdminRuntime` 統一啟用 `/api/admin`，頁面不得各自切換。
- 登入只使用 Firebase Google；development 可用後端 `dev:` stub。登入後呼叫 `POST /api/admin/auth/firebase/session`，以 `effectivePermissions` 初始化 UI。
- Firebase ID Token 不寫入 Web Storage；受保護請求 401 時強制刷新並重送一次，仍失敗才重新登入。
- 新增會員、租借商品寫入等未有正式契約的子功能，必須由 readiness gate 停用且不得發出 404 請求。
- Reviews 列表／詳情／硬刪已就緒（`reviews` section ready；feature `reviews.manage=true`）。不做回覆／軟隱藏。
- 訂單／預約內部備註（`internal-note`）已就緒；前端可用 `orders.sellerNote`／`bookings.sellerNote` feature readiness。
- 會員標籤池與指派均已就緒（`customers.tagPool=true`、`customers.tagAssign=true`）。
- 會員預設地址可編已就緒（`customers.defaultAddress=true`）；成功後刷新詳情，失敗保留草稿。
- 會員偏好可編已就緒（`customers.preferences=true`）；選項來源 `GET /preference-options`。
- 最低庫存閾值已就緒（`products.minStock=true`）；閾值只改 min-stocks；商城 on-hand 經 Products `stockLocations`（W2-08）。
- 租借列表／詳情回傳唯讀庫存：`variants[].onHandQuantity`／`stockLocations[]`（`locationId` 如 `RENTAL-C002`）；寫庫存走 W2-05 conversions（store→rental）與 `rental`+`transfer`（營地互轉）。
- SessionStorage 權限只控制 UI；後端每次請求仍依資料庫 RBAC 判斷。
- W2 UI follow-up：見 [`plans/admin-post-g6/w2/W2-ui-followups.md`](../../plans/admin-post-g6/w2/W2-ui-followups.md)（上架 Modal：規格卡＋勾選 C002–C009、`discount` 固定 0、不編裝備 specs／tags；調撥＝conversions＋rental transfer）。
- 商品 Modal（正式）：規格卡可編各分店數量；存檔帶 `stockLocations`；「產生異動紀錄」打 `product_stock_update` 稽核單。
- 租借上架 Modal（正式）：一次列出全部規格；每規格一組**一般價／特殊節日價**＋勾選上架營區（不含主倉 C001）；`PUT .../listings` 只送有勾選的列；前端不呼叫 equipment specs／tags。
- 分類／品牌主檔（正式）：商品頁單一「分類／品牌」按鈕 → Modal 內 tab（`products.categoryMaster`／`products.brandMaster`）；API 仍為 `/api/admin/categories`、`/api/admin/brands`。
- 營區主檔（正式｜W4-01）：預約排程頁「營區維護」Modal（`booking-calendar.campgrounds=true`）；API `/api/admin/campgrounds`；不含 tags。
- 營位主檔（正式｜W4-02）：同上 Modal「營位」tab（`booking-calendar.zones=true`）；API `/api/admin/campgrounds/{id}/zones`；降容量低於占用 → 409。
- 特殊節日曆（正式｜W4-03）：預約排程頁「特殊節日曆」Modal（`booking-calendar.calendarDates=true`）；API `/api/admin/calendar-dates`；影響特殊節日價 tier。
- Analytics 彙總（正式｜W4-06）：分析報表 `analytics.summary=true`；API `/api/admin/analytics/*-summary`；僅需 `analytics.view`。

---

## 13. 共用列表慣例

- 分頁：`page`／`size`／`meta`（common）  
- 篩選：各資源自訂 query，白名單欄位  
- 回應 Envelope 與前台相同  

---

## 14. v0.1 不做

| 項目 | 原因 |
|------|------|
| HTML partial 當 API | 前端 `core.js` 舊路徑；後端只供 JSON |
| 圖檔上傳 Cloud Storage | P3；延後 GCP（W4-05） |
| 營區 tags／zones 寫入 | tags 另開；zones → W4-02 |

---

## Changelog

| 版本 | 日期 | 說明 |
|------|------|------|
| 0.1 | 2026-07-20 | 後台資源路徑與甲欄位；RBAC 標註要求 |
| 0.2 | 2026-07-21 | G-1、G-5：細 RBAC、管理員建立／列表／詳情與個別覆寫 |
| 0.3 | 2026-07-21 | G-2a：Customers 查詢、更新與停權／恢復 |
| 0.4 | 2026-07-21 | G-2b：Orders／Bookings 查詢與履約狀態命令 |
| 0.5 | 2026-07-22 | G-2c：Products 正規化寫入、規格／圖片同步、唯讀庫存與前端乾淨 Request |
| 0.6 | 2026-07-22 | G-3：商城／租借庫存異動 draft、明細、悲觀鎖過帳、作廢、冪等與 RBAC |
| 0.7 | 2026-07-22 | G-4：優惠券與營區公休 CRUD、安全刪除、RBAC、後端優先前端流程與 PostgreSQL 驗收 |
| 0.8 | 2026-07-22 | G-6：Firebase Admin Session、有效權限初始化、Token 刷新、Backend readiness 與全站正式切換 |
| 0.9 | 2026-07-23 | W1-01：Orders／Bookings `PATCH .../internal-note`；詳情回 `internalNote`；空白清成 null |
| 0.10 | 2026-07-23 | W1-02：`/api/admin/customer-tags` CRUD；有指派禁硬刪改停用；readiness 拆 `tagPool`／`tagAssign` |
| 0.11 | 2026-07-23 | W1-03：`PUT /api/admin/customers/{id}/tags` 集合取代指派；只能掛 active 標籤 |
| 0.12 | 2026-07-23 | W1-07：`GET`／`PUT /api/admin/min-stocks`；RBAC `products.view`／`products.edit`；不改 on_hand |
| 0.13 | 2026-07-23 | W1-04：`PUT /api/admin/customers/{id}/default-shipping-address`；不改訂單 snapshot；readiness `customers.defaultAddress` |
| 0.14 | 2026-07-23 | W1-05：`PUT /api/admin/customers/{id}/preferences` 集合取代；`GET /preference-options` lookup；只能掛 active options |
| 0.15 | 2026-07-23 | W1-06：`GET`／`DELETE /api/admin/reviews`；硬刪整則；不做回覆／軟隱藏 |
| 0.16 | 2026-07-24 | 租借列表／詳情回傳唯讀 `variants[].stockLocations`／onHand；寫庫存仍走 G-3／W2-05 |
| 0.17 | 2026-07-24 | W2-08：新建 `product_stock_update`（post 不定商城庫存）；**例外**允許 `rental`+`transfer` 過帳改 `rental_sku_variant_stocks`（營地互轉） |
| 0.18 | 2026-07-25 | 文件：租借上架 Modal UX（規格卡＋C002–C009 勾選、`discount=0`、不編裝備 specs／tags）；API 路徑不變 |
| 0.18a | 2026-07-25 | 文件：分類／品牌主檔合併為單一按鈕＋Modal tab；API 路徑不變 |
| 0.19 | 2026-07-25 | W3：`POST .../orders/{id}/cancel`（未出貨；已付款同交易退款）；`POST .../bookings/{id}/cancel`（已付款取消＋退款） |
| 0.20 | 2026-07-25 | W4-01：`/api/admin/campgrounds` CRUD／啟停；RBAC `booking-calendar.*`；有引用禁硬刪；不含 tags／zones |
| 0.21 | 2026-07-25 | W4-02：`/api/admin/campgrounds/{id}/zones` CRUD／啟停；降 `totalSites` 低於占用峰值 → 409；對齊 check-availability |
| 0.22 | 2026-07-25 | W4-03：`/api/admin/calendar-dates` 特殊節日曆；PUT 標記／DELETE 取消；Booking `holidayCount` 連動 |
| 0.23 | 2026-07-25 | W4-06：`/api/admin/analytics/shop-summary`、`booking-summary`；口徑／366 天／`analytics.view` |