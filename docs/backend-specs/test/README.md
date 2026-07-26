# 後端實際驗證總覽

| 欄位 | 內容 |
| --- | --- |
| 適用版本 | Spring Boot 4.1、PostgreSQL 16、Firebase ID Token |
| 自動 Gate | Maven 一般測試 + 專用 PostgreSQL 完整整合測試 |
| 人工 Gate | Swagger／HTTP、RBAC、資料庫狀態交叉核對 |
| 重要原則 | 測試資料庫必須可丟棄；不可在正式或共用資料庫做寫入驗證 |
| **更新日期** | 2026-07-26 |

## 文件入口

- [資料庫與完整 Seed 驗證](./database-seed-validation.md)
- [公開／會員 API 驗證](./public-member-api-validation.md)
- [Booking 營區標籤篩選驗證](./booking-campground-tag-filter-validation.md)
- [Catalog 最新上架排序驗證](./catalog-product-created-at-sort-validation.md)
- [Catalog 熱銷商品驗證](./catalog-bestsellers-swagger-validation.md)
- [會員配送地址 API 驗證](./member-shipping-address-api-validation.md)
- [Checkout 優惠券冪等、消耗與取消失效 Swagger 驗證](./checkout-coupon-idempotency-swagger-validation.md)
- [Admin API 驗證](./admin-api-validation.md)
- 前端瀏覽器驗證見 [`docs/frontend-specs/test/README.md`](../../frontend-specs/test/README.md)（若存在）。
- Catalog 商品標籤端到端 Swagger 驗證見 [`catalog-product-tags-swagger-validation.md`](./catalog-product-tags-swagger-validation.md)。
- Commerce UX 靜態驗收：`frontend/tests/commerce-ux-browser.mjs`。

## 1. 基本啟動

```powershell
cd D:\githubdesk\Yuruicamp
docker compose up -d
docker compose ps

cd backend
$env:DB_PASSWORD = '<與根目錄 .env 相同的 POSTGRES_PASSWORD>'
.\mvnw.cmd spring-boot:run
```

確認：

- `yuruicamp-db` 為 `healthy`。
- `GET http://localhost:8080/api/health` 成功。
- Swagger：`http://localhost:8080/swagger-ui.html`。
- Schema 由 `docs/latest_schema.sql` 建立；Hibernate 維持 `ddl-auto=validate`。

## 2. 自動測試 Gate

一般測試：

```powershell
cd backend
.\mvnw.cmd test
```

完整 PostgreSQL 測試只可連到專用、可重建的測試資料庫：

```powershell
$env:RUN_BACKEND_IT = 'true'
$env:DB_PASSWORD = '<測試資料庫密碼>'
.\mvnw.cmd test
```

判定規則：

- `Failures=0`、`Errors=0`、`Skipped=0` 才能宣稱完整整合測試通過。
- 只跑一般模式時，帶 `@EnabledIfEnvironmentVariable(RUN_BACKEND_IT=true)` 的測試會跳過，不能視為 PostgreSQL 驗收。
- 整合測試會建立、更新或刪除 fixture；不得直接對保留人工資料的開發庫執行。
- 測試失敗後先檢查 fixture 清理、主鍵重複、Admin 白名單／UID 與 Seed 版本，再判斷是否為業務程式錯誤。

## 3. Swagger Token 規則

本機 `FIREBASE_ENABLED=false` 時：

1. 先呼叫會員 `POST /api/auth/firebase/session` 或 Admin `POST /api/admin/auth/firebase/session`。
2. Swagger `Authorize` 只輸入 `dev:...` Token 本體，不自行加 `Bearer`。
3. Swagger 產生的 Curl 必須含 `Authorization: Bearer ...`。

正式 Firebase 驗證使用真 ID Token；禁止將完整 Token 放入文件、截圖或 issue。

## 4. 共用完成標準

- 成功使用 `{ success: true, data, meta? }`；失敗保留穩定 `error.code`。
- 公開 API 無 Token 可讀；會員與 Admin API 依 principal 與資料庫權限隔離。
- 金額、庫存、狀態、會員 ID 與操作者由後端決定。
- 冪等重送不新增第二筆交易；衝突 payload 回明確 `409`。
- 交易失敗 rollback，不留下部分明細、保留帳或歷程。
- Swagger 驗證負責 HTTP 契約；悲觀鎖、競爭與排程競態必須由 PostgreSQL 整合測試證明。

## 5. 目前未完成邊界

### 已完成（勿再列為缺口）

- **Payment 線 D（stub）**：ECPay Gateway、launch、Notify 驗簽／冪等、Return 導頁、COD `confirm-cod`、預約禁 COD — 2026-07-25 IT＋I-8 瀏覽器手動 ✅。
- **會員訂單**：`GET /api/me/orders`、詳情、`displayNo` — 見 [`member-order-api-validation.md`](./member-order-api-validation.md)。
- **會員 Profile**：`GET/PATCH /api/me/profile`（phone／birthday）。
- **評價**：會員 `GET/POST /api/me/reviews`、公開 `GET /api/products/{id}/reviews`。
- **Admin 假日曆**：`calendar_dates` Admin CRUD（ADM-W4-03）；Booking 計價已讀 DB。
- **Analytics**：W4-06 summary API + `categoryBreakdown`（admin-storefront-polish 波次 B）。

### 仍待完成

| 項目 | 說明 |
| --- | --- |
| **真實綠界沙箱** | `stub=false` + 公網 HTTPS Notify；見 [`../payment/ecpay-sandbox-validation.md`](../payment/ecpay-sandbox-validation.md) |
| **Booking Coupon** | 缺 Booking 關聯 Schema；Checkout 仍拒絕非 null `couponClaimId` |
| **文章 API（H-2）** | ⏭️ 延後；Blog 仍讀 `articles.json` |
| **公開 calendar_dates 讀取** | Admin 維護已完成；獨立公開端點未開 |
| **線 J 部署** | Flyway、Secret Manager、Cloud Storage、production profile |
| **W4-04／05** | 文章 Admin CRUD、圖片上傳 GCP — 延後 |

## 6. 歷史實測基線（2026-07-22，僅供對照）

| Gate | 結果 |
| --- | --- |
| 一般 `mvnw test` | 115 項：33 項實跑通過、82 項 PostgreSQL 測試跳過，build 成功 |
| `RUN_BACKEND_IT=true` 完整測試 | 115 項全執行，1 failure、2 errors，build 失敗 |

> **2026-07-26 備註**：上表為早期基線；其後已新增 Payment、Admin post-G6、displayNo、Analytics 等 IT。宣稱全綠前請以**全新可重建測試庫**重跑 `RUN_BACKEND_IT=true` 完整 suite，勿沿用 2026-07-22 結論。
