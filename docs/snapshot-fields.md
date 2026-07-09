# 快照欄位 vs FK 欄位

> 定案（2026-07-09）：訂單／預約採**策略 B**——下單當下寫入顯示用快照，並保留 FK 供關聯查詢。  
> 相關：[`schema.sql`](./schema.sql) · [`database-er.md`](./database-er.md) · [`../plans/data-integration-spec.md`](../plans/data-integration-spec.md)

## 為什麼需要快照？

商品改名、改價、營區改名後，**歷史訂單／預約仍要顯示下單當下的內容**。  
若只存 FK，之後 JOIN 會拿到「現在」的名稱與價格，歷史畫面會錯。

規則口訣：

- **顯示給人看的字** → 快照（snapshot）
- **用來關聯／統計／庫存** → FK
- **兩者都要**：快照給 UI，FK 給後端邏輯

`specLabel` 統一分隔符：` / `（例如 `森林綠 / 45L`）。

---

## 1. 商城訂單 `ORDERS` / `ORDER_ITEMS`

### 表頭 `ORDERS`

| 欄位 | 類型 | 說明 |
|------|------|------|
| `customer_id` | **FK** → `CUSTOMERS` | 查會員訂單、會員中心篩選 |
| `buyer_name` | **快照** | 下單當下姓名（可與會員現名不同） |
| `address` | **快照** | 下單當下配送地址字串 |
| `buyer_phone` | **快照**（可選） | 下單當下電話 |
| `status` / `payment_status` / 金額欄 | 業務欄位 | 非快照、非商品 FK |

> 不要再從 `customers.orders[]` 反查；一律用 `orders.customer_id`。

### 明細 `ORDER_ITEMS`

| 欄位 | 類型 | 說明 |
|------|------|------|
| `product_id` | **FK** → `PRODUCTS` | 關聯 SPU |
| `variant_id` | **FK** → `PRODUCT_VARIANTS` | 關聯 SKU |
| `sku` | **快照＋冗餘** | 通常等於 `variant_id`；保留以免 SKU 代碼日後變更 |
| `name` | **快照** | SPU 名稱（不含規格） |
| `spec_label` | **快照** | 規格顯示（` / ` 分隔） |
| `color` / `size` / `brand` | **快照**（可選） | 明細顯示用 |
| `image` | **快照** | 下單當下主圖 URL |
| `price` | **快照** | 下單當下單價 |
| `quantity` | 業務欄位 | 購買數量 |

### 訂單上的折價券 `ORDER_COUPONS`（或 `orders.coupons[]`）

| 欄位 | 類型 | 說明 |
|------|------|------|
| `code` | **快照** | 使用當下的券碼 |
| `type` | **快照** | `fixed` / `percent` |
| `discount` | **快照** | 券面額／百分比 |
| `amount` | **快照** | 本單實際折抵金額 |
| `coupon_code`（可選） | **FK** → `COUPONS` | 若券主檔仍存在可關聯；券刪除後仍靠快照顯示 |

---

## 2. 營區預約 `BOOKINGS` 與子表

### 表頭／`booking_info` 展開欄

| 欄位 | 類型 | 說明 |
|------|------|------|
| `customer_id` | **FK** → `CUSTOMERS` | 會員中心篩選 |
| `campground_id` | **FK** → `CAMPGROUNDS` | 可用性、報表 |
| `campground_name` | **快照** | 下單當下營區名 |
| `region` | **快照** | 下單當下地區 |
| `check_in` / `check_out` / `guest_count` 等 | 業務欄位 | 預約區間與人數 |

### `BOOKING_SELECTED_ZONES`

| 欄位 | 類型 | 說明 |
|------|------|------|
| `zone_id` | **FK** → `CAMPGROUND_ZONES` | 佔用計算 |
| `zone_type` | **快照** | 區域名稱（例「草皮區」） |
| `quantity` / `subtotal` | 業務／金額 | |

### `BOOKING_SELECTED_RENTALS`

| 欄位 | 類型 | 說明 |
|------|------|------|
| `equipment_id` | **FK**（可選）→ `RENTAL_LISTINGS` | listing 列；衍生表，關聯時注意 |
| `rental_sku_id` | **FK** → `RENTAL_SKUS` | 租借庫存群組 |
| `product_id` | **FK** → `PRODUCTS` | |
| `variant_id` | **FK** → `PRODUCT_VARIANTS` | |
| `sku` | **快照＋冗餘** | |
| `name` | **快照** | SPU 名稱 |
| `spec_label` | **快照** | 規格顯示 |
| `quantity` / `subtotal` | 業務／金額 | |

---

## 3. 評價 `REVIEWS`

| 欄位 | 類型 | 說明 |
|------|------|------|
| `customer_id` | **FK** → `CUSTOMERS` | 必填 |
| `product_id` | **FK** → `PRODUCTS` | 必填；關聯以 FK 為準 |
| `variant_id` | **FK** → `PRODUCT_VARIANTS` | 建議必填 |
| `order_id` | **FK** → `ORDERS`（可 null） | 能補則補 |
| `product_name` | **快照** | 列表顯示用；**不以文字當關聯鍵** |
| `buyer_name` / `buyer_avatar` | **快照** | 顯示用 |
| `sku` | **快照**（可選） | |

---

## 4. 庫存異動明細 `MOVEMENT_ITEMS`

| 欄位 | 類型 | 說明 |
|------|------|------|
| `product_id` | **FK** → `PRODUCTS`（建議） | 能補則補 |
| `product_name` | **快照** | 異動單顯示用 |
| `quantity` / `from_store` / `to_store` / `type` | 業務欄位 | |

---

## 5. 不該快照的例子（常見錯誤）

| 錯誤做法 | 正確做法 |
|----------|----------|
| 只存 `productName`，沒有 `productId` | 一定要有 FK；名稱可另存快照 |
| 會員中心靠 `customers.orders[]` 字串陣列 | 用 `orders.customer_id` 查詢 |
| 改商品名後重算歷史訂單名稱 | 歷史用快照，不要回寫 |
| 手改 `camp-equipment.stock` | stock 為衍生；改 `rental-skus` 再同步 |

---

## 6. 衍生欄位（不是快照，也不是手維護真相）

| 欄位／表 | 來源 | 說明 |
|----------|------|------|
| `RENTAL_LISTINGS.stock` | `RENTAL_SKU_VARIANT_STOCKS` | 腳本／觸發器同步 |
| `PRODUCTS.total_stock` / 分店加總 | `PRODUCT_VARIANTS` 分店庫存 | API 衍生即可 |
| Zone 每晚 `remaining` | zones − bookings − blocks − closures | **查詢結果**，不存日曆矩陣表 |
