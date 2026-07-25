# Backend Schema 變更 Checklist（對齊架構 v1.0）

> **來源決策**：[`java-backend-architecture-proposal.md`](./java-backend-architecture-proposal.md) §7  
> **作法**：開發期改 [`docs/latest_schema.sql`](../docs/latest_schema.sql) → `docker compose down -v && up -d` 整檔重建  
> **同步文件**：`docs/schema-enums.md`、`docs/database-schema-guide.md`、相關 `docs/database-documents/`  
> **範圍**：Phase 1–4、6（本輪）；Phase 5 不做  
> **驗證**：2026-07-20 — Docker 重建成功（66 tables / 12 views）；`npm run validate:data` OK。2026-07-21 — 獨立暫存 PostgreSQL 以完整 `latest_schema.sql` 驗證 Booking 冪等唯一約束通過。
> **後續**：線 A 骨架見 [`backend/README.md`](../backend/README.md)；認證為 Firebase ID Token（不自簽 JWT），見架構書 v1.1。

---

## Phase 0 — 定案確認

- [x] **0-1** 確認可整檔重建（會清開發資料）
- [x] **0-2** `payment_method` 改為 ECPay 通道 + `cod`
- [x] **0-3** 會員／後台皆加 `firebase_uid`
- [x] **0-4** 進結帳 D1.A：用待付款 `orders`／`bookings`，不新建 `checkout_sessions`
- [x] **0-5** 保留時間統一 15 分鐘

---

## Phase 1 — Firebase UID

- [x] **1-1** `customers` 新增 `firebase_uid`
- [x] **1-2** UNIQUE NULLS DISTINCT + index
- [x] **1-3** COMMENT：Firebase Auth UID
- [x] **1-4** 更新 `docs/database-documents/user-and-admin/customers.md`
- [x] **1-5** `admin_users` 新增 `firebase_uid`
- [x] **1-6** UNIQUE NULLS DISTINCT + index
- [x] **1-7** COMMENT：首次 Google 登入綁定
- [x] **1-8** 更新 `admin_users.md`
- [x] **1-9** `active_customers` View **不**加入 `firebase_uid`

---

## Phase 2 — payment_method ENUM + bookings 付款

鎖定 ENUM：`ecpay-credit` | `ecpay-atm` | `ecpay-cvs` | `ecpay-other` | `cod`

- [x] **2-1** 改寫 `CREATE TYPE payment_method`
- [x] **2-2** 更新 `orders.payment_method` COMMENT
- [x] **2-3** 更新 `docs/schema-enums.md`
- [x] **2-4** 更新 `orders-and-coupons.md`
- [x] **2-5** 前端／Mock：`credit-card`／`line-pay` → 新值
- [x] **2-6** validate:data／相關腳本允許值
- [x] **2-7** `bookings.payment_method` + CHECK 禁止 `cod`
- [x] **2-8** `bookings.payment_status`
- [x] **2-9** `bookings.paid_at`
- [x] **2-10** 更新 `bookings.md`

---

## Phase 3 — checkout 逾時

- [x] **3-1** `orders.checkout_expires_at` + COMMENT
- [x] **3-2** 部分索引（unpaid + expires_at）
- [x] **3-3** `bookings.checkout_expires_at` + 部分索引（pending）
- [x] **3-4** 文件註明與保留帳 `expires_at` 同交易寫入

---

## Phase 4 — payment_notifications

- [x] **4-1** 新增 `payment_notifications` 表
- [x] **4-2** COMMENT：Webhook 冪等
- [x] **4-3** `docs/database-documents/orders-and-coupons/payment-notifications.md`

---

## Phase 4.5 — Booking Checkout 冪等

- [x] **4.5-1** `bookings.checkout_idempotency_key`（會員範圍 key）
- [x] **4.5-2** `bookings.checkout_request_hash`（正規化 payload 的 SHA-256 指紋）
- [x] **4.5-3** `UNIQUE (customer_id, checkout_idempotency_key)`
- [x] **4.5-4** 同步 Booking API 與資料庫文件
- [ ] **4.5-5** E-3 Service 實作相同 payload 回放、不同 payload 回 `IDEMPOTENCY_CONFLICT`

---

## Phase 7 — Admin W1-01 internal_note（2026-07-23）

- [x] **7-1** `orders.internal_note text`（可空）+ COMMENT
- [x] **7-2** `bookings.internal_note text`（可空）+ COMMENT
- [x] **7-3** 更新 orders／bookings database-documents
- [x] **7-4** 本機：`docker compose down -v && up -d` 重建後後端 `ddl-auto=validate` 通過（AdminFulfillment IT）

---

## Phase 5 — 可選／非本輪

- [ ] **5-1** 草稿訂單佔位（Service 常數，不改 schema）
- [ ] **5-2** Flyway（之後）
- [ ] **5-3** 圖檔 metadata 表
- [ ] **5-4** customers email UNIQUE vs 軟刪重註冊

---

## Phase 6 — 文件與驗證

- [x] **6-1** `docs/latest_schema.sql` 可被 compose 掛載執行
- [x] **6-2** `docs/schema-enums.md` 與 ENUM 一致
- [x] **6-3** `docs/database-schema-guide.md` 補說明
- [x] **6-4** 相關 `database-documents/*.md` 已同步
- [x] **6-5** 本機：`docker compose down -v && up -d` 建庫無錯
- [x] **6-6** 假資料／驗證腳本不因 ENUM 炸掉
- [x] **6-7** 架構建議書 §7 標已落地並連本清單

---

## 本輪額外修復（建庫可跑）

為讓 Docker 首次 init 能完整套用 DDL，一併修正：

- `DROP SCHEMA IF EXISTS public CASCADE` 再 `CREATE SCHEMA public`（否則空庫上 `CREATE SCHEMA public` 會失敗）
- `branch_features.id` 改為 IDENTITY（避免 sequence 在表之後建立）
- `active_rental_listing_view` 移到 `rental_skus`／`rental_sku_variants` 之後
- C-2 Checkout 冪等：`orders.checkout_idempotency_key`、`checkout_request_hash` 與 `UNIQUE (customer_id, checkout_idempotency_key)`。
- E-3 Booking Checkout 前置 Schema：`bookings.checkout_idempotency_key`、`checkout_request_hash` 與 `UNIQUE (customer_id, checkout_idempotency_key)`；payload 指紋比較留在線 E Service。
