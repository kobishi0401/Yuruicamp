# Yuruicamp Schema 整合 — 任務清單

> **範圍**：假資料結構、前端 Mock 層、文件、腳本、清理；**不含** Java Entity / REST Controller。  
> **進度**：完成後將 `- [ ]` 改為 `- [x]`。  
> **相關規格**：[`data-integration-spec.md`](./data-integration-spec.md) · **DDL**：[`../docs/schema.sql`](../docs/schema.sql) · **ER**：[`../docs/database-er.md`](../docs/database-er.md)

---

## 定案摘要（2026-07-09）

| 項目 | 決策 |
|------|------|
| 會員訂單查詢 | 刪 `customers.orders[]` / `rentals[]`，改 `customerId` FK |
| 租借庫存權威 | `admin/rental-skus.json` → 同步衍生 `camp-equipment.json` |
| 預約窗口 | `bookingWindowDays = 90` |
| 折價券 | 會員中心僅 `birthday` + `firstPurchase`；結帳可輸入 `promotion` |
| 訂單/預約 | **下單當下寫快照（B）** + 保留 `productId` / `variantId` 等 FK |
| 會員登入 | 僅 OAuth，無 `password` |
| 部落格 | `productId` 統一 `P001` 格式、camelCase |
| 靜態內容 | FAQ、夥伴營地、rental-guide 不進 DB |

---

## Phase 0 — 定案寫入規格

- [x] **0-1** 更新 `plans/data-integration-spec.md`（90 天、刪白名單、快照、券規則、rental-skus 權威）
- [x] **0-2** 重寫 `docs/database-er.md`（對齊 `/data/**`，刪 `users.json` / `userId` / `admin/data/` 舊描述）
- [x] **0-3** 本清單與 spec 互相連結（README「Schema / 假資料」區塊 + spec 頂部連結）

---

## Phase 1 — 假資料 JSON 結構修正

### 1.1 會員 `data/customers/customers.json`

- [x] **1-1** 刪除所有 `orders[]` 欄位
- [x] **1-2** 刪除所有 `rentals[]` 欄位
- [x] **1-3** 確認無 `password` 欄位（OAuth only）
- [x] **1-4** 確認 `shippingAddress` 結構與 `js/shipping-address.js` 一致
- [x] **1-5** 確認 `firstPurchaseUsed`、`birthday` 存在（券資格）

### 1.2 部落格 `data/marketing/articles.json`

- [x] **1-6** `content[].productId`：`prod-xxx` → `Pxxx`（例 `prod-001` → `P001`）
- [x] **1-7** `relatedProducts[]` 同上
- [x] **1-8** 驗證每個 `productId` 存在於 `catalog/products.json`

### 1.3 預約政策 `data/admin/booking-policy.json`

- [x] **1-9** 確認 `bookingWindowDays: 90`
- [x] **1-10** 確認 `occupyingStatuses`：`pending`, `confirmed`, `completed`
- [x] **1-11** 同步 `js/booking-availability.js` 的 `DEFAULT_POLICY.bookingWindowDays` 為 **90**

### 1.4 訂單 `data/commerce/orders.json`

- [x] **1-12** 全檔使用 `customerId`（非 `userId`）
- [x] **1-13** 表頭快照：`buyerName`、`address` 為下單當下值
- [x] **1-14** 統一 `items[].specLabel` 分隔符為 ` / `（非 `、`）
- [x] **1-15** 每筆明細有 `variantId` + `sku`
- [x] **1-16** `status` 僅用：`unshipped` | `shipped` | `completed` | `returned`
- [x] **1-17** 時間欄位統一 `createdAt`（camelCase）

### 1.5 預約 `data/commerce/camp-bookings.json`

- [x] **1-18** 保留 `bookingInfo` 快照（`campgroundName`、`region` 等）
- [x] **1-19** `selectedRentals[]` 補齊 `rentalSkuId`, `productId`, `variantId`, `sku`, `specLabel`
- [x] **1-20** 統一 `specLabel` 為 ` / ` 分隔
- [x] **1-21** `status` 僅用：`pending` | `confirmed` | `completed` | `cancelled`
- [x] **1-22** 時間用 `submittedAt`（camelCase）

### 1.6 商品 `data/catalog/products.json`

- [x] **1-23** SPU `name` 不含規格（規格在 `variants[].label`）
- [x] **1-24** `variants[].id` = sku（例 `v-P001-0`）
- [x] **1-25** 庫存真相在 `variants[].branch`；`totalStock` / `branch` 標為衍生（腳本重算）
- [x] **1-26** 使用 `interestTags`（camelCase）
- [x] **1-27** 主圖 `image` + `images[]`（非 `thumbnail`）

### 1.7 租借庫存（權威：`data/admin/rental-skus.json`）

- [x] **1-28** 確認後台僅寫入 `rental-skus`（庫存唯一寫入來源）
- [x] **1-29** `variants[].camp` 對齊 C001–C009
- [x] **1-30** `camp[].campgroundId` + `name` 與 `campgrounds.json` 一致
- [x] **1-31** 建立並執行 `sync-rental-listings.cjs`（skus → `camp-equipment.stock`）
- [x] **1-32** `camp-equipment.json` 標為**唯讀衍生**（禁止手改 stock）

### 1.8 折價券 `data/promotions/coupons.json`

- [x] **1-33** 每筆有 `category`：`promotion` | `birthday` | `firstPurchase`
- [x] **1-34** `type` / `minOrder` 補齊或文件化預設（`fixed`）
- [x] **1-35** `YURUIHBD` → `birthday`；`YRUIFIRST` → `firstPurchase`
- [x] **1-36** 活動碼維持 `category: promotion`（結帳用，不進會員中心列表）

### 1.9 評價 `data/admin/reviews.json`

- [x] **1-37** 每筆有 `customerId` + `productId` + `variantId`
- [x] **1-38** `orderId` 能補則補（可 null）
- [x] **1-39** 顯示可保留 `productName` 快照，關聯以 FK 為準

### 1.10 庫存異動 `data/admin/movement.json`

- [x] **1-40** `created_at` → `createdAt`（全檔 camelCase）
- [x] **1-41** 每筆 movement 必有 `items[]` 陣列結構
- [x] **1-42**（可選）`items[]` 補 `productId`，保留 `productName` 快照

### 1.11 其他 JSON

- [x] **1-43** `campgrounds.json`：`campgroundId`、`zoneId`、`totalSites` 等 camelCase
- [x] **1-44** `zone-blocks.json` / `campground-closures.json` FK 對齊營區
- [x] **1-45** `min-stock.json` 對齊商品與租借 target
- [x] **1-46** `branches.json` / `brands.json` 維持現狀（靜態行銷）

---

## Phase 2 — 清理殘留與雙軌資料

- [x] **2-1** 刪除 `admin/data/**`（內容已併入 `/data/**`；過渡 `_archive` 亦已移除）
- [x] **2-2** 刪除或歸檔 `data/admin/equipment-id-map.json`（遷移完成後）
- [x] **2-3** 舊腳本（`migrate-data-integration.cjs` 等）標記 deprecated
- [x] **2-4** `grep` 確認執行時無程式讀 `admin/data/`
- [x] **2-5** `grep` 確認無程式讀根目錄舊扁平 `data/*.json`

---

## Phase 3 — 前端 Mock 層調整

### 3.1 會員中心 `js/components/member-center.js`

- [x] **3-1** 移除 `filterByCustomerIds()` 白名單；訂單改 `customerId` 篩選
- [x] **3-2** 預約同理：`booking.customerId === uid`
- [x] **3-3** 移除未使用之 `dataBasePath` / `json()` 舊路徑（若已無引用）
- [x] **3-4** 狀態顯示以 canonical enum 為準（`aliases` 僅保留一版相容或移除）

### 3.2 折價券

- [x] **3-5** `api-mock.js`：`getAvailable` 僅回 `birthday` + `firstPurchase`
- [x] **3-6** `coupons.js`：結帳 `validateCoupon` 仍驗證全池（含 `promotion`）
- [x] **3-7** 結帳成功寫入券快照（`order.coupons[]` 或等同結構）

### 3.3 訂單 / 預約建立（快照）

- [x] **3-8** `API.orders.create` 寫入完整快照（buyerName、address、items 全欄位）
- [x] **3-9** `BookingAPI.createBooking` + `buildBookingPayload` 寫入完整預約快照
- [x] **3-10** 新訂單/預約無需改 `customers.json` 即可出現在會員中心

### 3.4 Booking 雙格式（過渡）

- [x] **3-11** 短期保留 `bookingCart` localStorage snake_case → **已升級為 camelCase（見 3-13）**
- [x] **3-12** `buildBookingPayload()` 持久化僅 camelCase
- [x] **3-13**（可選）bookingCart 全面改 camelCase，刪除轉換層

### 3.5 部落格

- [x] **3-14** `blog-detail.js` / `blog.js` 經 `DataPaths` 讀取
- [x] **3-15** fallback 內 `productId` 使用 `P001` 格式

### 3.6 商品衍生欄位

- [x] **3-16** `enrichProduct`：`rating` / `salesCount` / `totalStock` 標為 API 衍生，不寫回 JSON
- [x] **3-17** `buildSpecLabel` 統一 ` / `；新單據皆用此規則

### 3.7 後台 Admin

- [x] **3-18** `admin/js/products.js`：租借庫存寫入 `rental-skus` 並觸發 listing 同步
- [x] **3-19** `admin/js/movement.js`：讀寫 `createdAt`（相容 `created_at` 可保留一版）
- [x] **3-20** `admin/js/orders.js`：以 `orders.customerId` 為準，不從 `customers.orders` 反查
- [x] **3-21** `js/booking-availability.js`：`DEFAULT_POLICY.bookingWindowDays = 90`

---

## Phase 4 — 腳本與驗證

- [x] **4-1** 擴充 `admin/scripts/validate-data-fk.cjs`（articles productId、無 customers.orders[]、specLabel）
- [x] **4-2** 新增 `admin/scripts/sync-rental-listings.cjs`（rental-skus → camp-equipment.stock）
- [x] **4-3**（可選）新增 `normalize-spec-labels.cjs`（`、` → ` / `）
- [x] **4-4** 新增 `fix-articles-product-ids.cjs`（`prod-xxx` → `Pxxx`）
- [x] **4-5** 更新 `run-variant-integration-v2.cjs` 註解（camp-equipment 為衍生輸出）
- [x] **4-6** `package.json` 登錄 `validate:data`、`sync:listings` 等 scripts

### 驗收（Phase 1–4 全綠）

- [x] **4-V1** `node admin/scripts/validate-data-fk.cjs` 通過
- [x] **4-V2** `node admin/scripts/sync-rental-listings.cjs` 通過（建立後）
- [x] **4-V3** 會員中心 U001：訂單+預約依 `customerId` 顯示（不靠白名單）
- [x] **4-V4** 部落格 `art-001`：內嵌商品卡片有內容
- [x] **4-V5** 結帳輸入 `YURUIKAMP20` 可折抵；會員中心列表看不到該碼
- [x] **4-V6** 新結帳訂單出現在會員中心

```bash
node admin/scripts/validate-data-fk.cjs
node admin/scripts/sync-rental-listings.cjs   # 待建立
```

---

## Phase 5 — 靜態頁面（確認不進 schema）

- [x] **5-1** `pages/faq.html` + `booking/pages/booking-faq.html` 維持 HTML 靜態
- [x] **5-2** `js/pages/branches.js` 的 `PARTNER_DATA` 維持靜態
- [x] **5-3** `booking/pages/rental-guide.html` 維持靜態
- [x] **5-4** spec 註明靜態內容清單，避免誤加 DB

---

## Phase 6 — localStorage Mock 收斂（串 DB 前）

- [x] **6-1** 文件化 keys：`mockOrders`, `mockBookings`, `mockReviews`, `mockCustomerOverlay`, `mockCampgroundClosures`, `adminEmployees`
- [x] **6-2** `mockCustomerOverlay` 語意對齊未來 `PATCH /customers/:id`
- [x] **6-3** 標記 `MockStorageMerge` 為暫時層（後端以 DB transaction 取代）
- [x] **6-4** 文件化 `AdminAPI.configure({ useBackend: true })` 接入點

---

## Phase 7 — DDL 文件（仍不做 Java）

- [x] **7-1** 產出 `docs/schema.sql`（完整 DDL）
- [x] **7-2** 產出 `docs/schema-enums.md`（status / category 枚舉）
- [x] **7-3** 產出 `docs/snapshot-fields.md`（快照 vs FK-only 欄位）
- [x] **7-4** 產出 mock JSON → SQL seed 對照表（`docs/mock-json-to-sql-seed.md`）
- [x] **7-5** 決定 DB 產品：**PostgreSQL**（JSONB、ENUM、Spring Boot 常見；見 `docs/database-er.md` / `schema.sql` 註解）

---

## 刪除 / 不再維護

- [x] 刪 `customers.orders[]`
- [x] 刪 `customers.rentals[]`
- [x] 不新增 `customers.password`
- [x] 移除 `admin/data/**` 殘留
- [x] 移除 `equipment-id-map.json`（遷移後）
- [x] 停止手動維護 `camp-equipment.stock`
- [x] 停止手動維護 `products.totalStock` / `products.branch`（改衍生）
- [x] 移除 `articles` 的 `prod-xxx` 格式
- [x] 移除 `movement.created_at`
- [x] 移除會員中心白名單篩選
- [x] 更新 `database-er.md` 舊路徑描述

---

## 建議執行順序

| 週次 | 內容 |
|------|------|
| Week 1 | Phase 0 + Phase 1（1-1~1-8, 1-9~1-11, 1-33~1-36）+ Phase 2 |
| Week 2 | Phase 1 其餘 + Phase 3（3-1~3-10 優先） |
| Week 3 | Phase 3 其餘 + Phase 4 |
| Week 4 | Phase 5 + Phase 6 + Phase 7 |

### 最優先 5 件

- [x] **P1** 刪 `customers.orders[]` / `rentals[]` + 改 `member-center.js`（1-1, 1-2, 3-1, 3-2）
- [x] **P2** 修正 `articles.json` productId（1-6, 1-7, 1-8）
- [x] **P3** `booking-policy` + `DEFAULT_POLICY` → 90 天（1-9, 1-11, 3-21）
- [x] **P4** 建立 `sync-rental-listings.cjs`（1-31, 4-2）
- [x] **P5** 歸檔 `admin/data/`（2-1）

---

## 進度統計

| Phase | 總項 | 完成 |
|-------|------|------|
| 0 | 3 | 3 |
| 1 | 46 | 46 |
| 2 | 5 | 5 |
| 3 | 21 | 21 |
| 4 | 12 | 12 |
| 5 | 4 | 4 |
| 6 | 4 | 4 |
| 7 | 5 | 5 |
| 刪除清單 | 11 | 11 |
| 最優先 | 5 | 5 |

*最後更新：2026-07-09（Phase 0～7 完成；`admin/data/` 與 `_archive/pre-integration/` 已自工作區移除）*
