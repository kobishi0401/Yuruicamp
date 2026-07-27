# Yuruicamp Backend（線 A 骨架）

Spring Boot **4.1.0** / Java **25** / PostgreSQL 16。

## 認證定案（重要）

- 前端使用 **Firebase Auth** 登入後取得 **ID Token**。
- 後端用 **Firebase Admin SDK**（或本機 `dev:` stub）**只驗證** Token。
- 後端**不簽發**自家 JWT。
- 後續 API：`Authorization: Bearer <Firebase ID Token>`。

## 啟動前

1. 本機 Postgres（repo 根目錄）：

   ```powershell
   docker compose up -d
   ```

2. 設定 DB 密碼環境變數（與 `.env` 的 `POSTGRES_PASSWORD` 一致），例如：

   ```powershell
   $env:DB_PASSWORD = "你的密碼"
   ```

3. （可選）啟用真 Firebase：

   ```powershell
   $env:FIREBASE_ENABLED = "true"
   $env:FIREBASE_CREDENTIALS = "C:\path\to\serviceAccount.json"
   $env:FIREBASE_PROJECT_ID = "yuruicamp-2026"   # 建議與前端／service account 一致
   # 合併 Firebase 進 main 後的前端協作注意事項：
   # docs/frontend-specs/firebase-merge-into-main-notes.md
   ```

## 啟動

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

- Health：`GET http://localhost:8080/api/health`
- Swagger：`http://localhost:8080/swagger-ui.html`

## Dev stub Token（`FIREBASE_ENABLED=false`，預設）

格式：

```text
dev:<uid>:<email>:<provider>:<displayName>
```

`provider` 只能是 `google` / `facebook` / `line`。

範例：

```powershell
# 建立／綁定會員 session
curl -X POST http://localhost:8080/api/auth/firebase/session `
  -H "Content-Type: application/json" `
  -d "{\"idToken\":\"dev:uid-amy:amy@example.com:google:Amy\"}"

# 之後帶同一個 token
curl http://localhost:8080/api/me `
  -H "Authorization: Bearer dev:uid-amy:amy@example.com:google:Amy"
```

## 後台 session

- Email 必須**事先**存在於 `admin_users`（白名單）。
- `active=true`；首次登入綁定 `firebase_uid`。
- 端點：`POST /api/admin/auth/firebase/session`

## 測試

```powershell
# 單元測試（不需 DB）
.\mvnw.cmd test

# 含 contextLoads（需 Docker Postgres + 密碼）
$env:RUN_BACKEND_IT = "true"
$env:DB_PASSWORD = "你的 POSTGRES_PASSWORD"
.\mvnw.cmd test
```

## 後端進度

後端流程文件放在 `docs/backend-specs/`，使用「用途、流程、規則、驗證結果」的簡短格式。

| 項目                                | 狀態                                                                                                                                                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| package 分層、CORS、OpenAPI         | ✅                                                                                                                                                                                                                                                       |
| 統一 Envelope／錯誤                 | ✅                                                                                                                                                                                                                                                       |
| Firebase ID Token Security          | ✅ 受保護的會員與 Admin Controller 皆以 `firebaseBearer` 描述 OpenAPI 認證需求，Swagger `Authorize` 會自動加入 Firebase Bearer Token；實際驗證仍由 Spring Security Filter 與 RBAC 負責                                                                 |
| Customer／Admin session             | ✅                                                                                                                                                                                                                                                       |
| **會員本人配送地址**                | ✅ `GET/PUT /api/me/shipping-address`，只依 Firebase Principal 讀寫本人預設地址；見 [`流程`](../docs/backend-specs/customer/member-shipping-address.md) 與 [`Swagger 驗證`](../docs/backend-specs/test/member-shipping-address-api-validation.md) |
| **會員已購商品評論**                | ✅ `GET/POST /api/me/reviews`，只允許本人已完成訂單明細且一項一評；見 [`流程`](../docs/backend-specs/review/h3-member-reviews.md) 與 [`Swagger 驗證`](../docs/backend-specs/test/member-review-api-validation.md) |
| **商品公開評論**                    | ✅ `GET /api/products/{productId}/reviews`，支援分頁、排序、星等／照片篩選與評分統計；見 [`流程`](../docs/backend-specs/review/h3-public-product-reviews.md) |
| **商品評分統計**                    | ✅ Product 列表與詳情回傳正式評論衍生的 `rating`、`reviewCount`，列表使用批次聚合 |
| **會員評論圖片**                    | ✅ Firebase 會員可上傳最多 `5` 張 JPEG／PNG／WebP，後端驗證特徵碼並寫入 `review_photos` |
| **會員評論管理**                    | ✅ `PATCH/DELETE /api/me/reviews/{reviewId}`，限制本人修改或刪除並支援照片重排 |
| MapStruct                           | ✅                                                                                                                                                                                                                                                       |
| **B-1～B-4 商品公開讀**             | ✅ 列表、詳情、分頁、排序及分類／品牌／價格篩選；未指定篩選會使用明確型別預設值，避免 PostgreSQL `lower(bytea)`；見 [`Catalog 文件`](../docs/backend-specs/catalog/b4-b5b-b7-catalog-public-read.md)                                                      |
| **商品標籤／熱銷公開讀**            | ✅ Product 回傳 `equipment_tags`；開發 Seed 將 `created_at` 前 10 標為新品、有效訂單數量前 6 標為熱銷；`GET /api/products/bestsellers?limit=6` 只回熱銷標籤商品並依銷量排序 |
| **B-5a 基本商品規格**               | ✅ `variants[]` 已隨商品列表／詳情回傳；只含 active variant 與字串價格                                                                                                                                                                                   |
| **B-5b 規格可售庫存**               | ✅ variant 層級加總商城庫存並扣除 active 保留量；回傳 `availableQuantity`／`inStock`                                                                                                                                                                  |
| **B-7 門市公開讀**                  | ✅ `GET /api/branches` 只回傳 `active=true` 門市；Entity 與 `latest_schema.sql` 已對齊 `branches.active boolean DEFAULT true NOT NULL`；見 [`Branch 契約`](../docs/api/branch-api-contract.md) 與 [`公開／會員 API 驗證`](../docs/backend-specs/test/public-member-api-validation.md) |
| **C-1 訂單／明細／庫存保留 Entity** | ✅ Hibernate `ddl-auto=validate` 已通過；見 [`C-1 驗收文件`](../docs/backend-specs/order/c1-entity-schema-validation.md)                                                                                                                                 |
| **Order 會員唯讀 API**              | ✅ 本人列表、詳情、訂單與商品快照、他人／不存在統一 404；見 [`會員訂單文件`](../docs/backend-specs/order/member-order-read.md) 與 [`Swagger 驗證`](../docs/backend-specs/test/member-order-api-validation.md)                                                                  |
| **C-2～C-8 Checkout**               | ✅ 建立、本人讀取、配送／取貨門市、冪等、防超賣、更新、COD 確認、取消、後端計價與 15 分鐘逾時均完成；F-2 已補齊優惠券套用；見 [`Checkout 整合文件`](../docs/backend-specs/checkout/README.md)                                                                |
| **D Payment（ECPay + COD）**        | ✅ stub 全流程（I-7／I-8／CK-5）；真實沙箱待驗收 → [`ECPay 沙箱驗收`](../docs/backend-specs/payment/ecpay-sandbox-validation.md) |
| **F Coupon**                        | 🔄 F-1、F-3、F-4 與商城 F-2 完成；COD／ECPay Notify 已接線；Booking Coupon 尚待 F-2 Schema；見 [`Coupon 流程`](../docs/backend-specs/coupon/README.md)                                              |
| **E-0 Booking 冪等 Schema**         | ✅ `bookings` 已具備 Checkout key、request hash 與會員範圍唯一約束；見 [`E-0 文件`](../docs/backend-specs/booking/e0-booking-idempotency-schema.md)                                                                                                      |
| **E-1 Booking 公開讀**              | ✅ 營區（含環境／設施標籤）、有效營位、租借裝備、policy、closures；見 [`E-1 文件`](../docs/backend-specs/booking/e1-booking-public-read.md) 與 [`標籤篩選驗證`](../docs/backend-specs/test/booking-campground-tag-filter-validation.md)                   |
| **E-2 Booking 可用性**              | ✅ 公開 POST 查詢跨晚最低剩餘量；包含日期窗口、公休、zone block 與 pending／confirmed 占用；見 [`E-2 文件`](../docs/backend-specs/booking/e2-booking-availability.md) 與 [`公開／會員 API 驗證`](../docs/backend-specs/test/public-member-api-validation.md) |
| **E-3 Booking Checkout**            | ✅ 會員冪等、固定順序悲觀鎖、跨晚重查、後端平假日計價與 pending／unpaid 快照；見 [`E-3 文件`](../docs/backend-specs/booking/e3-booking-checkout.md) 與 [`公開／會員 API 驗證`](../docs/backend-specs/test/public-member-api-validation.md)           |
| **E-4 Booking 租借保留**            | ✅ 營區庫位解析、跨日 active 保留、後端租借計價與並發防超租；見 [`E-4 文件`](../docs/backend-specs/booking/e4-booking-rental-reservation.md) 與 [`公開／會員 API 驗證`](../docs/backend-specs/test/public-member-api-validation.md)            |
| **E-5 會員預約讀取**                | ✅ 本人列表、分頁、詳情與 Checkout 快照；他人與不存在統一 404；見 [`E-5 文件`](../docs/backend-specs/booking/e5-booking-member-read.md) 與 [`公開／會員 API 驗證`](../docs/backend-specs/test/public-member-api-validation.md)                 |
| **E-6 Booking 取消與逾時**          | ✅ 主動取消、每分鐘逾時掃描、營位恢復、租借保留釋放與鎖定競爭；見 [`E-6 文件`](../docs/backend-specs/booking/e6-booking-cancellation-expiration.md) 與 [`公開／會員 API 驗證`](../docs/backend-specs/test/public-member-api-validation.md)       |
| **E-7 Booking 前端接線**            | ✅ B3：cart soft／checkout hard lock；ECPay + contact O2；Notify 由線 D（stub ✅）；見 [`E-7 文件`](../docs/backend-specs/booking/e7-booking-frontend-integration.md) |
| API 契約索引（P0+P1）               | [`docs/api/README.md`](../docs/api/README.md)                                                                                                                                                                                                            |
| 商品契約（已實作）                  | [`docs/api/product-api-contract.md`](../docs/api/product-api-contract.md)                                                                                                                                                                                |
| 代辦清單 A～J                       | [`plans/backend-implementation-checklist.md`](../plans/backend-implementation-checklist.md)                                                                                                                                                              |
| **G-1／G-5 Admin RBAC**             | ✅ 細權限、管理員白名單 CRUD、個別覆寫、每請求授權與正式 Admin Session 接線完成；見 [`G-1／G-5 文件`](../docs/backend-specs/admin/g1-g5-admin-rbac.md)                                                                                                   |
| **G-2a Admin Customers**            | ✅ 列表、篩選、詳情、基本資料更新、停權／恢復、RBAC、前端雙模式與 PostgreSQL 整合驗收已完成                                                                                                                                                       |
| **G-2b Admin Orders／Bookings**     | ✅ 列表、詳情、履約狀態命令、RBAC、前端雙模式、PostgreSQL 整合測試與 Swagger 驗收完成                                                                                                                                                       |
| **G-2c Admin Products**             | ✅ 商品／規格／圖片正規化交易、上下架、RBAC、前端乾淨 Request 與 PostgreSQL 整合驗收完成；**庫存寫入語意見契約 v0.17／ADM-W2-08（已驗收）**；見 [`G-2c 文件`](../docs/backend-specs/catalog/g2c-admin-products.md) |
| **G-3 Admin Inventory**             | ✅ 異動 draft／明細／過帳／作廢等當日完成；**v0.17 通用 post 改稽核＋列級 `lineNature`（ADM-W2-08 已驗收）**；conversion store→rental 仍改庫存；見 [`G-3 文件`](../docs/backend-specs/inventory/g3-admin-inventory-movements.md) |
| **G-4 Admin Coupons／Closures**     | ✅ 優惠券與營區公休 CRUD、安全刪除、建立者紀錄、RBAC、前端 backend-first 與 PostgreSQL 整合驗收完成；見 [`Coupon`](../docs/backend-specs/coupon/g4-admin-coupons.md)／[`Closures`](../docs/backend-specs/booking/g4-admin-campground-closures.md) |
| **G-6 Admin Runtime**               | ✅ Firebase Google／dev Session、有效權限初始化、401 Token 刷新、readiness gate 與全站 Backend 切換完成；見 [`G-6 文件`](../docs/backend-specs/admin/g6-admin-runtime.md)                                                                                |
| 結帳／ECPay／Admin CRUD             | ✅ 線 C／D stub／G post-G6／Commerce UX polish；下一步：真實綠界沙箱、Booking Coupon Schema |

### Schema 整合驗證

`RUN_BACKEND_IT=true` 時，`BackendApplicationTests` 會連線 Docker PostgreSQL 並載入完整 Spring Context；因 `ddl-auto=validate`，Context 成功即代表目前所有 JPA Entity 已通過 Schema 驗證。

G 線於 2026-07-22 同批執行 RBAC、Customers、Orders／Bookings、Products、Inventory 與 G-4 六個 PostgreSQL 類別，結果為 **14 tests、0 failure、0 error、0 skipped**。

`DB_PASSWORD` 必須與 Docker `.env` 的 `POSTGRES_PASSWORD` 相同。若出現 `password authentication failed`，先修正連線密碼；不要修改 Entity，也不要將 `ddl-auto` 改成 `update`。

### 開發用資料種子

全新 Docker volume 會自動跑 [`docs/seed/002-dev-seed.sql`](../docs/seed/002-dev-seed.sql)，依序建立商品與 Booking E-1 參考資料，以及商城／租借開發庫存。結構與 AI／開發者維護規則見 [`docs/seed/README.md`](../docs/seed/README.md)。
既有資料庫請手動灌一次：

```powershell
# 先讓 compose 套用 runner 與 dev/ 的唯讀掛載，再執行唯一入口
docker compose up -d
docker exec yuruicamp-db psql -U postgres -d yuruicamp -f /docker-entrypoint-initdb.d/002-dev-seed.sql
```

重跑會將 `main`、`branch-001`～`branch-003` 的 156 筆商城庫存與 435 筆訂單保留還原為固定 Seed 狀態，請先確認不需要保留同 ID 的手動測試資料。

驗收：

```powershell
curl.exe http://localhost:8080/api/products
curl.exe http://localhost:8080/api/products/P001
```

## 設定鍵

見 `src/main/resources/application.properties`：

- `DB_URL` / `DB_USERNAME` / `DB_PASSWORD`
- `FIREBASE_ENABLED` / `FIREBASE_CREDENTIALS`
- `YURUICAMP_CHECKOUT_EXPIRATION_SCAN_MS` 對應 `yuruicamp.checkout.expiration-scan-ms`（預設 `60000` 毫秒）
- `YURUICAMP_CHECKOUT_EXPIRATION_ENABLED` 對應 `yuruicamp.checkout.expiration-enabled`（預設 `true`）
- `YURUICAMP_BOOKING_EXPIRATION_SCAN_MS` 對應 `yuruicamp.booking.expiration-scan-ms`（預設 `60000` 毫秒）
- `YURUICAMP_BOOKING_EXPIRATION_ENABLED` 對應 `yuruicamp.booking.expiration-enabled`（預設 `true`）
- `CORS_ALLOWED_ORIGINS`
