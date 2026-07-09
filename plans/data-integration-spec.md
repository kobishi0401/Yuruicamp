# Yuruicamp 假資料整合規格

> **Schema 整合任務清單**（可勾選進度）：[`schema-migration-checklist.md`](./schema-migration-checklist.md)  
> **ER / 欄位說明**：[`../docs/database-er.md`](../docs/database-er.md)  
> **DDL 草案**：[`../docs/schema.sql`](../docs/schema.sql) · [`../docs/schema-enums.md`](../docs/schema-enums.md) · [`../docs/snapshot-fields.md`](../docs/snapshot-fields.md)

## 定案摘要（2026-07-09）

| 項目 | 決策 |
|------|------|
| 會員訂單查詢 | 刪 `customers.orders[]` / `rentals[]`，改 `orders.customerId` / `camp-bookings.customerId` FK |
| 租借庫存權威 | `data/admin/rental-skus.json` 為唯一寫入來源 → `sync-rental-listings.cjs` 衍生 `camp-equipment.stock` |
| 預約窗口 | `bookingWindowDays = 90` |
| 折價券 | 會員中心僅 `birthday` + `firstPurchase`；結帳可輸入 `promotion` |
| 訂單 / 預約 | **下單當下寫快照（B）** + 保留 `productId` / `variantId` 等 FK |
| 會員登入 | 僅 OAuth，**無 `password`** |
| 部落格 | `productId` 統一 `P001` 格式、camelCase |
| 靜態內容（不進 DB） | FAQ、夥伴營地 `PARTNER_DATA`、`rental-guide.html` |

## 目錄結構

```
/data/catalog/          products.json, campgrounds.json, camp-equipment.json
/data/commerce/         orders.json, camp-bookings.json
/data/customers/        customers.json
/data/marketing/        articles.json, branches.json, brands.json
/data/promotions/       coupons.json
/data/admin/            reviews.json, movement.json, min-stock.json, rental-skus.json,
                        booking-policy.json, zone-blocks.json, campground-closures.json
```

> `camp-equipment.json` 的 **stock 為唯讀衍生**，請勿手改；改庫存請改 `rental-skus.json` 後執行 `npm run sync:listings`。  
> `products.totalStock` / `products.branch` 亦為衍生（由 `variants[].branch` 加總）。

## API 層

| 全域物件 | 用途 |
|---------|------|
| `window.DataPaths` | 所有 JSON 絕對路徑 |
| `window.API` | 買家 Mock API |
| `window.BookingAPI` | 預約 Mock API（含 `getAvailability`） |
| `window.BookingAvailability` | Zone 可用性計算（mock = 未來 SQL 查詢契約） |
| `AdminAPI` | 後台 CRUD（mock 模式讀 DataPaths；`configure({ useBackend: true })` 接真後端） |
| `MockStorageMerge` | localStorage overlay 合併（**暫時層**，後端以 DB transaction 取代） |

## 營區與租借庫存 ID

| ID | 說明 |
|----|------|
| C001 | 租借主倉（僅 rental-skus / 後台庫存，**不在** campgrounds.json） |
| C002–C009 | 可預約營區（`campgrounds.json`） |

`rental-skus.camp[]`：`{ campgroundId, name, quantity }`，名稱與 campgrounds 一致（C001 固定「租借主倉」）。

`camp-equipment.campgroundId` 僅能為 C002–C009。  
`camp-bookings.bookingInfo.campgroundId` 同上。

## 預約可用性（Zone 級）

| 檔案 | 對應未來 DB 表 | 說明 |
|------|----------------|------|
| `campgrounds.json > zones[]` | `campground_zones` | `totalSites` = 庫存上限 |
| `camp-bookings.json` | `bookings` + `booking_selected_zones` | 佔用來源；區間 `[checkIn, checkOut)` |
| `booking-policy.json` | `booking_policies` | `bookingWindowDays: 90`、佔用狀態枚舉 |
| `zone-blocks.json` | `zone_blocks` | 維修停售例外（扣減可賣數） |
| `campground-closures.json` | `campground_closures` | 營區公休（`date_range` 或 `weekly`） |

公休效果：該營區**所有 zone** 當晚 `status: closed`、`remaining: 0`。

## 折價券規則

| category | 會員中心列表 | 結帳輸入 | 資格 |
|----------|--------------|----------|------|
| `birthday` | ✅ | ✅ | 當月生日 |
| `firstPurchase` | ✅ | ✅ | `firstPurchaseUsed === false` |
| `promotion` | ❌ | ✅ | 活動碼（如 `YURUIKAMP20`） |

預設：`type: "fixed"`、`minOrder: 0`（缺欄時前端 / 腳本補齊）。

## 訂單 / 預約快照（策略 B）

下單當下寫入顯示用快照，並保留 FK 供關聯：

- 訂單表頭：`buyerName`、`address`、`buyerPhone`（可選）…
- 訂單明細：`name`、`specLabel`、`productId`、`variantId`、`sku`
- 預約：`bookingInfo.campgroundName` / `region`；`selectedRentals[].specLabel` 等
- 券：`order.coupons[]` 快照（code / type / discount / amount）

`specLabel` 統一分隔符：` / `（非 `、`）。

## localStorage Keys（Mock overlay）

| Key | 用途 | 後台 merge |
|-----|------|------------|
| `mockOrders` | 結帳新訂單 | orders.js ✅ |
| `mockBookings` | 預約結帳 | bookings.js ✅ |
| `mockReviews` | 會員評價 | reviews.js ✅ |
| `mockCustomerOverlay` | 點數 / 首購 / 個資 patch（語意 ≈ 未來 `PATCH /customers/:id`） | API only |
| `mockCampgroundClosures` | 公休規則 overlay | booking-calendar.js ✅ |
| `adminEmployees` | 後台員工帳號 | permissions.js |

可用性為**查詢結果**，不另存日曆矩陣 JSON。

## 靜態內容（不進 schema / 不進 DB）

| 內容 | 位置 |
|------|------|
| FAQ | `pages/faq.html`、`booking/pages/booking-faq.html` |
| 夥伴營地 | `js/pages/branches.js` → `PARTNER_DATA` |
| 租借指南 | `booking/pages/rental-guide.html` |

## 測試資料 Amy (U001)

- 訂單：依 `orders.customerId === "U001"` 查詢（不再寫在 customers 上）
- 預約：依 `camp-bookings.customerId === "U001"`
- 訂單 `id: 1`（畫面顯示 `ORD-0001`，見 `formatOrderDisplayId`）地址快照：台南市東區長榮路二段200號

## 維護腳本

```bash
npm run validate:data          # FK + schema 規則
npm run sync:listings          # rental-skus → camp-equipment.stock
npm run fix:articles           # prod-xxx → Pxxx（已遷移後通常 0 變更）
node admin/scripts/normalize-phase1-data.cjs   # specLabel / coupons / movement / stock
node admin/scripts/run-variant-integration-v2.cjs  # @deprecated 一次性整合
node admin/scripts/run-data-alignment.cjs          # 預約 FK + 庫存拆分
node admin/scripts/seed-booking-window.cjs
node admin/scripts/seed-zone-coverage.cjs
node admin/scripts/seed-summer-2026.cjs
```

## 多規格資料契約

| 層級 | JSON | 說明 |
|------|------|------|
| SPU | `products.json` | `name` 為主名（不含規格） |
| SKU | `products.variants[]` | `id` = `sku`（例 `v-P004-0`） |
| Listing | `camp-equipment.json` | 每列一個 `equipmentId` + `variantId` + 營區 `stock`（衍生） |
| 訂單 | `orders.items[]` | `name` + `specLabel` + `variantId` / `sku` |

## 已移除的舊路徑

以下舊 Mock 路徑已刪除（內容已併入 `/data/**`；需要對照時查 git 歷史）：

- `admin/data/*.json`（含舊檔名 `reantal.json`）
- `booking/data/*.json`
- 根目錄扁平 `data/*.json`、`users.json`
- `equipment-id-map.json`
- `_archive/pre-integration/`（過渡歸檔目錄，已清空）

正式資料只改 `/data/**`（路徑見 `js/data-paths.js`）。
