# Mock JSON → SQL Seed 對照表

> 用途：把目前 `/data/**` 假資料對應到 [`schema.sql`](./schema.sql) 的表，方便 bootcamp 寫 seed script 或手動 INSERT。  
> 規格：[`../plans/data-integration-spec.md`](../plans/data-integration-spec.md)

## 總覽

| JSON 檔案 | SQL 表 | 陣列／巢狀 → 子表 |
|-----------|--------|-------------------|
| `data/customers/customers.json` | `customers` | `preferences` → JSONB 或拆表；`shippingAddress` → JSONB；`tags` → JSONB 或 `customer_tags` |
| `data/catalog/products.json` | `products` | `variants[]` → `product_variants`；`variants[].branch` → `product_variant_branch_stocks`（可選正規化） |
| `data/catalog/campgrounds.json` | `campgrounds` | `zones[]` → `campground_zones`；tags → JSONB |
| `data/catalog/camp-equipment.json` | `rental_listings` | **衍生表**；`stock` 來自 rental sku variant camp stock |
| `data/commerce/orders.json` | `orders` | `items[]` → `order_items`；`history[]` → `order_history`；`coupons[]` → `order_coupons` |
| `data/commerce/camp-bookings.json` | `bookings` | `selectedZones[]` → `booking_selected_zones`；`selectedRentals[]` → `booking_selected_rentals`；`bookingInfo` 展開到 bookings 欄位；`summary` 展開；`history[]` → `booking_history` |
| `data/admin/rental-skus.json` | `rental_skus` | `variants[]` + `camp` map → `rental_sku_variant_stocks`；頂層 `camp[]` 可作加總檢核 |
| `data/promotions/coupons.json` | `coupons` | （扁平，一列一券） |
| `data/admin/reviews.json` | `reviews` | `photos[]` → JSONB 或 `review_photos` |
| `data/admin/movement.json` | `movements` | `items[]` → `movement_items` |
| `data/admin/min-stock.json` | `min_stocks` | 巢狀 map 展平成列 |
| `data/admin/booking-policy.json` | `booking_policies` | 通常一列（singleton） |
| `data/admin/zone-blocks.json` | `zone_blocks` | （扁平） |
| `data/admin/campground-closures.json` | `campground_closures` | （扁平） |
| `data/marketing/articles.json` | `articles` | `content[]` → `article_content_blocks`；`relatedProducts[]` → `article_related_products` |
| `data/marketing/branches.json` | `branches` | `features[]` → `branch_features` |
| `data/marketing/brands.json` | `brands` | （扁平） |

---

## 逐檔說明（給新手）

### 1. `customers.json` → `customers`

| JSON 欄位 | SQL 欄位 | 備註 |
|-----------|----------|------|
| `id` | `id` | 例 `U001` |
| `name`, `email`, `phone`… | 同名 snake_case | |
| `authProvider` | `auth_provider` | OAuth only，**無 password** |
| `shippingAddress` | `shipping_address` JSONB | 結構見 `js/shipping-address.js` |
| `preferences` | `preferences` JSONB | `{ styles, equipment }` |
| `tags` | `tags` JSONB | 字串陣列 |
| ~~`orders[]`~~ | — | **已刪除**，改查 `orders.customer_id` |
| ~~`rentals[]`~~ | — | **已刪除**，改查 `bookings.customer_id` |
| ~~`password`~~ | — | **不存在** |

### 2. `products.json` → `products` + `product_variants`

| JSON | SQL | 備註 |
|------|-----|------|
| 頂層一筆 SPU | `products` 一列 | `name` 不含規格 |
| `variants[]` | `product_variants` | `id` = `sku`（例 `v-P001-0`） |
| `variants[].branch` | 可留 JSONB，或拆 `product_variant_branch_stocks(variant_id, branch_key, quantity)` | |
| `totalStock` / 頂層 `branch` | **不要當真相寫入** | 由 variants 加總衍生 |

### 3. `campgrounds.json` → `campgrounds` + `campground_zones`

| JSON | SQL |
|------|-----|
| `campgroundId` | `campgrounds.id`（C002–C009） |
| `zones[]` | `campground_zones` |
| `environmentTags` / `facilityTags` | JSONB |

**注意**：C001（租借主倉）**不在此檔**，也不進 `campgrounds` 表。

### 4. `rental-skus.json` → `rental_skus` + `rental_sku_variant_stocks`

這是**租借庫存唯一寫入來源（權威）**。

| JSON | SQL |
|------|-----|
| 頂層 `id`（R001） | `rental_skus.id` |
| `productId` | `rental_skus.product_id` |
| `variants[].id` | `rental_sku_variant_stocks.variant_id` |
| `variants[].camp.C00x` | 每對 `(variant_id, campground_id)` 一列 `quantity` |

頂層 `camp[]`（依營區加總）可在 seed 後用 SQL `SUM` 驗證，不必另存表。

### 5. `camp-equipment.json` → `rental_listings`（衍生）

| JSON | SQL | 備註 |
|------|-----|------|
| `equipmentId` | `id` | 例 `E010` |
| `stock` | `stock` | **從** `rental_sku_variant_stocks` **同步**，禁止手改 |
| `pricing.*` | 對應金額欄 | |
| `campgroundId` | 僅 C002–C009 | |

Seed 建議：先插 `rental_skus`／stocks，再跑與 `sync-rental-listings.cjs` 同等邏輯產生 listings。

### 6. `orders.json` → `orders` + `order_items` (+ history / coupons)

| JSON | SQL |
|------|-----|
| 頂層 | `orders`（`customerId` → `customer_id`） |
| `buyerName`, `address` | **快照**欄位 |
| `items[]` | `order_items`（含 `productId`/`variantId`/`sku`/`name`/`specLabel`） |
| `history[]` | `order_history` |
| `coupons[]`（若有） | `order_coupons` |

`status` 僅：`unshipped` | `shipped` | `completed` | `returned`

### 7. `camp-bookings.json` → `bookings` + 子表

| JSON | SQL |
|------|-----|
| 頂層 + `bookingInfo.*` | 展開進 `bookings` |
| `summary.*` | 展開進 `bookings`（zone_total 等） |
| `selectedZones[]` | `booking_selected_zones` |
| `selectedRentals[]` | `booking_selected_rentals` |
| `history[]` | `booking_history` |

`status` 僅：`pending` | `confirmed` | `completed` | `cancelled`

### 8. `coupons.json` → `coupons`

一列一券；必填 `category`：`promotion` | `birthday` | `firstPurchase`。

### 9. `reviews.json` → `reviews`

一列一評價；必填 `customer_id` + `product_id` + `variant_id`；`product_name` 為快照。

### 10. `movement.json` → `movements` + `movement_items`

| JSON | SQL |
|------|-----|
| 頂層 `id`, `employeeId`, `createdAt` | `movements` |
| `items[]` | `movement_items`（建議含 `product_id`） |

### 11. `min-stock.json` → `min_stocks`

JSON 形狀：

```json
{ "store": { "P001": { "main": 1, "branch-001": 1 } }, "rental": { ... } }
```

展平成：

| target_type | target_id | location_key | min_quantity |
|-------------|-----------|--------------|--------------|
| `store` | `P001` | `main` | 1 |
| `store` | `P001` | `branch-001` | 1 |

### 12. `booking-policy.json` → `booking_policies`

通常只 seed **一列**（`id = 1`），`booking_window_days = 90`，`occupying_statuses` 用 JSONB 陣列。

### 13. `zone-blocks.json` / `campground-closures.json`

直接對應同名表；注意日期區間語意與可用性查詢一致（左閉右開等，見 policy）。

### 14. `articles.json` → `articles` + 子表

| JSON | SQL |
|------|-----|
| 頂層 | `articles` |
| `content[]` | `article_content_blocks`（保留 `sort_order`） |
| `relatedProducts[]` | `article_related_products`（字串 `P001` → `product_id`） |

`productId` 必須是 `P001` 格式（不是 `prod-001`）。

### 15. `branches.json` / `brands.json`

| JSON | SQL |
|------|-----|
| branches 頂層 | `branches` |
| `features[]` | `branch_features` |
| brands | `brands` |

---

## 建議 Seed 順序（尊重 FK）

```
1. brands, branches (+ branch_features)
2. customers
3. products → product_variants
4. campgrounds → campground_zones
5. rental_skus → rental_sku_variant_stocks
6. rental_listings（衍生自 5）
7. coupons
8. booking_policies, zone_blocks, campground_closures, min_stocks
9. orders → order_items → order_history / order_coupons
10. bookings → booking_selected_zones / booking_selected_rentals → booking_history
11. reviews
12. movements → movement_items
13. articles → article_content_blocks / article_related_products
```

---

## 不進 DB 的內容（不要寫 seed）

| 內容 | 位置 |
|------|------|
| FAQ | HTML 靜態頁 |
| 夥伴營地 `PARTNER_DATA` | `js/pages/branches.js` |
| 租借指南 | `booking/pages/rental-guide.html` |
| 舊路徑 | 已移除（對照請查 git 歷史；勿再 seed） |

---

## 相關腳本（Mock 端）

```bash
npm run validate:data          # FK / 規則檢查
npm run sync:listings          # rental-skus → camp-equipment.stock
```

未來 Java 端可用 Flyway / Liquibase 跑 `docs/schema.sql`，再寫 `data.sql` 依本表對照匯入。
