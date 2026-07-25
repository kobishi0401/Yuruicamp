## 專案地圖（先看這裡）

接 Spring Boot 前已將前端整包收進 `frontend/`，根目錄邊界如下：

| 路徑                                                                            | 放什麼                                        | 你要改…時來這裡                                                                             |
| ------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [`frontend/`](./frontend/)                                                      | 主站、booking、admin、mock `data/`、Vite／npm | 網頁、樣式、假資料、前端腳本                                                                |
| [`backend/`](./backend/)                                                        | Spring Boot                                   | Java API（線 A 骨架：Firebase ID Token；見 [`backend/README.md`](./backend/README.md)）     |
| [`docs/`](./docs/)                                                              | Schema、前端規格、資料表說明                  | DB／規格文件                                                                                |
| [`plans/`](./plans/)                                                            | 規劃與遷移規格                                | 例如 [`plans/frontend-folder-migration-spec.md`](./plans/frontend-folder-migration-spec.md) |
| [`docker-compose.yml`](./docker-compose.yml) + [`.env.example`](./.env.example) | 本機 PostgreSQL                               | 資料庫基礎設施                                                                              |

### 後端實作狀態

後端程式使用簡短中文註解；流程文件集中在 `docs/backend-specs/`，只保留用途、主要流程與驗證結果。

- Catalog 線 B 已完成：商品列表／詳情支援分頁、排序、分類／品牌／價格篩選，variant 回傳可售數量，並提供公開門市 `GET /api/branches` 與首頁合作品牌 `GET /api/brands`。
- 首頁品牌跑馬燈在 Backend 模式改由公開 `GET /api/brands` 載入且不附登入 Token；空資料或請求失敗時保留可見狀態，不再讓容器縮成 `0px`。
- 首頁最新商品在 Backend 模式使用 `GET /api/products?...&sort=createdAt,desc`，由 PostgreSQL `products.created_at` 決定首次上架順序，不再依商品 ID 推算。
- 首頁熱銷商品在 Backend 模式改由公開 `GET /api/products/bestsellers` 依有效訂單銷量排序，不再呼叫 `/api/orders`，避免 `401` 被誤判為登入過期；Mock 模式才使用本機訂單展示資料。
- 商品公開 API 會回傳 `equipment_tags`；開發 Seed 將可售商品 `created_at` 前 10 標為新品、有效訂單商品數量前 6 標為熱銷。商品列表頁以標籤篩選，並分別維持建立時間／有效銷量排序。
- B-4 未指定篩選條件時會使用明確的文字與價格預設值，避免 PostgreSQL 將 `null` 文字參數推斷成 `bytea` 而中斷商品載入。
- B-3 驗收範圍與執行方式見 [`docs/backend-specs/catalog/b3-product-pagination-validation.md`](./docs/backend-specs/catalog/b3-product-pagination-validation.md)。
- B-5 商品規格已隨 Product API v0.3 落地：`variants[]` 只回 active variant，並以商城庫存扣除 active 保留帳後回傳 `availableQuantity` 與 `inStock`。
- B-5 範圍與資料來源見 [`docs/backend-specs/catalog/b5-product-variants-stock-status.md`](./docs/backend-specs/catalog/b5-product-variants-stock-status.md)。
- Checkout 線 C 的 C-1 已完成：`orders`、`order_items`、`product_stock_reservations` Entity 已通過 Docker PostgreSQL 與 Hibernate `ddl-auto=validate`。
- 會員 Order API 已完成：`GET /api/me/orders` 與 `GET /api/me/orders/{orderId}` 只使用 Firebase Principal 查詢本人資料，回傳訂單／商品快照；他人與不存在訂單統一回 `404`，PostgreSQL 整合測試 `4` 項全數通過。
- 評論已完成正式接線：會員使用 `GET/POST /api/me/reviews`，商品頁使用公開 `GET /api/products/{productId}/reviews` 取得分頁評論與評分統計。
- 商品評論以 `textContent` 建立 DOM，買家姓名、評論與日期不進入 `innerHTML`；後端限制評論最多 `1000` 字元。
- 商品列表、首頁與詳情的 `rating`、`reviewCount` 統一由正式 Product API 評論統計提供。
- 會員評論支援最多 `5` 張圖片的預覽、移除與正式上傳；商品詳細頁提供安全 URL 篩選及載入失敗狀態。
- 會員可在已完成訂單中查看、修改或刪除自己的完整評論，並重新管理評論照片。
- `MemberReviewService` 已明確指定 Spring 正式注入建構子，並以最小 Context 測試防止多建構子造成啟動失敗。
- Storefront 與 Booking 會員中心會依登入 Provider 控制 Email：Google 登入為唯讀，其他登入管道可編輯。
- 前端會員 Order 接線已完成：`API.orders.getAll/getByCustomerId` 在 Backend 模式只透過 `ApiClient` 呼叫 `/api/me/orders`，不讀寫 `mockOrders`；後端契約欄位會正規化為會員中心既有顯示欄位。
- 會員預設配送地址已完成正式接線：`GET/PUT /api/me/shipping-address` 只依 Firebase Principal 讀寫本人資料；新 Firebase 會員不再因靜態 Mock 清單缺少 ID 而出現 `Customer not found`，流程與驗證見 [`會員配送地址文件`](./docs/backend-specs/customer/member-shipping-address.md)。
- C-1 驗收流程與疑難排除見 [`docs/backend-specs/order/c1-entity-schema-validation.md`](./docs/backend-specs/order/c1-entity-schema-validation.md)。
- Checkout 線 C 的 C-2 已完成：建立結帳要求冪等鍵，相同請求重送會回放原訂單，同鍵異內容回傳衝突，空配送資料安全建立草稿。
- Checkout Session Read 已完成：`GET /api/checkout/sessions/{orderId}` 只讀取 Firebase Principal 本人的最新快照，不延長期限或修改庫存；未登入回 `401`，他人與不存在統一回 `403`。
- Checkout C-2～C-8 的完整流程、規則與驗收入口見 [`docs/backend-specs/checkout/README.md`](./docs/backend-specs/checkout/README.md)。
- Checkout 線 C 的 C-4 與 Coupon 線 F 已完成：會員可 PATCH 自己尚未到期的 Checkout 收件資料、付款方式及 `couponClaimId`，折扣由後端重算並保存 `order_coupons` 快照。
- Coupon 線 F 的 F-1、F-3、F-4 與商城 F-2 已完成：公開券、我的券、領券、三種資格、名額 Trigger、重複領券與取消規則已通過 PostgreSQL 驗證；COD 成立後 claim 改為 `consumed`，會員取消改為 `revoked`，Checkout 逾時改為 `expired`，都不會退回可用狀態。
- Checkout 線 C 的 C-3、C-5、C-7 已完成：PostgreSQL 併發防超賣、取消釋放保留帳及後端價格重算均已通過整合測試。
- Checkout 線 C 的 C-6、C-8 已完成：每分鐘掃描滿 15 分鐘的未付款訂單，交易內取消訂單、將保留帳改為 `expired` 並釋放庫存；PostgreSQL 逾時與冪等驗收已通過。
- Booking 線 E 的 E-0 已完成：`bookings` 加入 Checkout 冪等 key、request hash 與會員範圍唯一約束。
- Booking 線 E 的 E-1 已完成：公開營區列表／詳情包含環境與設施標籤，可供前台篩選；有效營位、租借裝備、policy 與 closures API 已通過 PostgreSQL／Controller 整合測試。
- Booking 線 E 的 E-2 已完成：`POST /api/booking/check-availability` 依 Asia/Taipei 政策驗證日期，並計算公休、停售及既有預約占用後的跨晚最低剩餘量。
- Booking 線 E 的 E-3 已完成：`POST /api/booking/checkout/sessions` 會以固定順序鎖位、重查可用量、後端計價，並建立 15 分鐘的 `pending`／`unpaid` 預約；冪等與並發防超賣已通過 PostgreSQL 測試。
- Booking 線 E 的 E-4 已完成：同一個 Checkout 交易會鎖定租借實體庫存、扣除住宿日期重疊的 active 保留、建立租借快照與保留帳；不同日期可共用庫存，重疊日期不可超租。
- Booking 線 E 的 E-5 已完成：會員可分頁查看自己的預約列表、完整詳情與 Checkout 快照；後端不接受任意 customerId，讀取他人與不存在的預約都回 404。
- Booking 線 E 的 E-6 已完成：會員可主動取消 pending／unpaid 預約；排程每分鐘處理逾時 Checkout，同交易恢復營位占用、釋放 active 租借保留並寫入狀態歷程，E-1～E-6 共 46 項 PostgreSQL 回歸測試通過。
- Booking 線 E 的 E-7 已完成：`BookingAPI` 在 Backend 模式統一呼叫 `/api/booking/**`，可用性、價格、Booking ID、本人列表／詳情／取消與 15 分鐘倒數都使用後端結果；不再寫入 `mockBookings` 或自行標記 paid。進入 `booking-cart.html` 即建立 Checkout Session 並顯示庫存不足提示，數量變更會重新鎖位；`booking-checkout.html` 的「前往 ECPay」只使用已建立的 `bookingId` 取得後端簽章表單，不再建立第二筆 Session。訂購人欄位預設空白且只由「帶入會員資料」填入，實際 ECPay 端點、Notify 與付款確認仍待線 D。
- 商城 Checkout 已完成確認背包、宅配／資料庫門市取貨與 COD 確認：進入 `storefront/pages/cart.html` 即建立 Draft Session 並鎖庫 15 分鐘；確認背包與結帳頁採節點式流程列，商品數量支援按鈕與直接輸入；`checkout.html` 的主要按鈕固定顯示「確認結帳」，資料不完整時只以 toast 與紅色欄位提示，送出時只 PATCH 既有 Session，再接續 `confirm-cod` 或 ECPay，不重複建單。COD 成立後仍為 `unpaid` 且不再受 Checkout 期限限制；若有套券，claim 會改為 `consumed`。
- 商城取消訂單入口已移至會員中心：待出貨且未付款的商品訂單可在訂單明細最下方取消；COD 成立頁會提示前往會員中心，購物車 Drawer 的圖層亦高於 Toast，避免提示遮住操作。
- 商品詳情頁的「立即購買」會以商品 ID 與 variant ID 檢查購物車；相同品項已存在時保留原數量並直接前往確認背包，只有「加入購物車」會繼續累加數量。
- 商品訂單的 canonical `cancelled` 狀態已與預約訂單對齊，會員中心及後台商品訂單列表、詳情與篩選器統一顯示「已取消」。
- Booking 線 E 的後端與前端人工驗證已整合至 [`公開／會員 API 驗證`](./docs/backend-specs/test/public-member-api-validation.md) 與 [`商城 Checkout 與 Booking 驗證`](./docs/frontend-specs/test/commerce-booking-validation.md)。
- Admin 線 G 的 G-1、G-5 已完成：後端依角色預設與個人覆寫計算細權限，每次 Admin API 都重新驗證啟用狀態、Firebase UID 與 authority；管理員建立、列表、詳情、更新及權限覆寫 API 已接入正式 Admin Session。
- Admin 線 G 的 G-2a Customers 已完成並通過 PostgreSQL 整合驗收：提供後台會員分頁查詢、篩選、詳情、基本資料更新、停權／恢復與 `customers.view`／`customers.edit`；消費總額與等級採資料庫 View，Customers 頁保留 Mock／Backend 雙模式。
- Admin 線 G 的 G-2b Orders／Bookings 已完成並通過 PostgreSQL 整合測試與 Swagger 驗收：提供分頁查詢、詳情、狀態歷程、訂單出貨／完成及預約確認／完成；Admin 不得人工改寫 ECPay 付款或退款結果。
- Admin 線 G 的 G-2c Products 已完成並通過 PostgreSQL 整合驗收：商品、規格與圖片以單一交易同步，庫存只讀且交由 G-3 異動；前端 Backend 模式只送契約欄位，API 成功後才更新 cache。
- G-2c 前端驗收於 2026-07-22 完成 API、Mock UI、資料庫與 build 實測；G-6 之後由正式 Admin Runtime 自動啟用 Backend，不再需要 DevTools 手動切換。
- Admin 線 G 的 G-3 Inventory 已完成並通過 PostgreSQL 併發驗收：商城與租借庫存只能透過 draft 異動單過帳，支援入庫、出庫／損耗與同領域調撥；固定順序悲觀鎖、active 保留下限與重複過帳冪等會防止負庫存及重複加減。
- Admin 線 G 的 G-4 已完成並通過 PostgreSQL 整合驗收：優惠券與營區公休均使用正式 CRUD 與細 RBAC；已領取優惠券不可硬刪，公休立即同步公開可用性，前端 Backend 模式只有 API 成功後才更新畫面。
- Admin 線 G 的 G-6 已完成：Firebase Google／development dev Token 會建立後端 Admin Session，以有效權限初始化 Sidebar；401 只強制刷新一次，未就緒的 Reviews、標籤池、seller note 與租借商品寫入由 readiness gate 阻擋，不會發出預期 404。
- Admin RBAC、Customers、Orders、Bookings、Products 與 Inventory Controller 已統一宣告 OpenAPI `firebaseBearer`，Swagger `Authorize` 會將 Firebase ID Token 加入受保護請求；正式授權仍由 Firebase Filter 與細權限 RBAC 執行。
- 前端真後端請求基礎已建立：`AppAuth.getIdToken()` 統一取得 Firebase／開發 Token，`ApiClient._restRequest()` 統一處理 Bearer、Envelope、meta 與後端錯誤。
- 前台跨分頁與站內導頁共用 `AppAuth` readiness：頁面 API 會等待 Firebase 注入並從 IndexedDB 還原 `currentUser`，再取得 Token；初始化期間不會誤判成登入失效並清除會員狀態。
- Firebase Session 只有在後端回傳 `created=true` 的首次登入才開啟共用 `#personalizationModal`；未完成問卷時偏好維持 `null`，完成後直接進入會員中心的會員資料頁，Email 與生日可由使用者編輯。
- 會員中心儲存 `#profileName` 後會同步共用登入狀態與跨分頁 storage，主站及 Booking Header 的 `.siteUserName` 會立即顯示相同姓名。
- Booking 會員中心會依登入管道控制 `#profileEmail`：Google 登入使用唯讀信箱且不送入會員更新，其他登入管道仍可編輯。
- 前端 `window.API.checkout` 已提供建立、讀取、更新、取消、COD 與 ECPay 六個契約方法；adapter 路徑不重複加入 `/api`。
- 前端正式優惠券已接線：`API.coupons.getMine/claim` 只透過 `ApiClient` 呼叫會員 API；Checkout 輸入活動碼後會取得 `couponClaimId`、PATCH 既有 Session，套用與移除都只採後端 `pricing`，一單限用一張券；輸入框選項會排除 `consumed/revoked/expired` 與本次已套用的券碼，並關閉瀏覽器 autocomplete 以免舊券碼輸入紀錄混入。
- Checkout 優惠券套用具備前後端雙層冪等保護：確認結帳不重送 Session 已綁定的 claim；後端收到同訂單、同 claim 時保留快照，只有換券才替換 `order_coupons`。
- 會員中心正式優惠券已接線：Backend 模式以 `GET /api/me/coupons` 顯示會員本人 claims，包含 Checkout 領取的 `promotion` 券；`claimed` 顯示為可用，`consumed/revoked/expired` 顯示為不可用，不再依前端靜態會員資料推算資格。
- Checkout Mock 與 Backend 共用 `CheckoutSession`：Mock 由商品契約重算價格、支援冪等並寫入獨立 `mockCheckoutSessions`；Backend 模式禁止 Legacy `orders.create()`。
- Storefront 確認背包頁呼叫 `API.checkout.createSession()`；Request 只含規格 ID、數量與冪等鍵，不傳會員 ID、商品快照、前端價格、總額、狀態或點數。正式 Checkout 頁只 PATCH 配送與付款資料。
- Checkout 冪等鍵由 `crypto.randomUUID()` 產生並暫存在 sessionStorage；網路重試與連點沿用同一 key，成功保存後端 `orderId`，購物車變更、取消或逾時才清除。
- Checkout I-5／CK-4 已完成：建立成功後摘要只採用後端 `CheckoutSession.pricing`；Backend 模式不建立 Legacy Order，優惠券以會員 claim 套用，ECPay 也不在本站收集卡號、到期日或 CVV。
- Checkout I-6 已完成：Draft 可 PATCH 補資料，Ready 顯示後端金額與 15 分鐘倒數；逾時／取消會清除 Session、保留購物車，並依後端錯誤碼提供重新登入、調整庫存或重建 Checkout 操作。
- Checkout 表單草稿會以 `sessionStorage.checkoutFormDraft` 綁定會員、購物車指紋與訂單 ID；同一分頁重新整理可還原填寫內容，換會員、換購物車、取消、逾時或完成時清除，且不保存卡號、到期日或 CVV。
- Checkout 庫存不足明細會顯示 `equipment_items.name` 與目前可用數量，不向買家顯示內部 `variantId`；操作按鈕顯示「商品剩餘數量不足請重新調整數量」。
- COD 確認成功後才清空共用購物車與本次 Checkout 暫存；成功頁以 URL 的 `orderId` 重新向後端讀取，因此下一次 Checkout 不會還原上一筆 completed Session。
- 開發 Seed 已建立 `main`、`branch-001`～`branch-003` 四個商城庫位與 156 筆 variant 庫存；扣除 98 件 active 訂單保留後，active catalog 可用量總計 399，可直接從 Swagger 驗證 Checkout。
- Reference Seed 已對齊前端展示資料：12 個公開品牌、8 個 active 營區、13 個 active zone、營區標籤與 3 個門市；品牌 JSON 已改用後端 canonical slug，詳見 [`JSON／Seed 固定 ID 對照`](./docs/data/json-seed-id-mapping.md)。
- 門市 Entity、正式 Schema 與 Reference Seed 已統一使用 `branches.active boolean DEFAULT true NOT NULL`；公開門市 API 只回傳啟用門市，既有資料庫可用非破壞性 `ALTER TABLE` 補欄位。
- 租借 Seed 已建立 28 SKU、37 canonical 規格、9 個固定租借庫位、16 筆有明確定價的 listing 與 333 筆規格庫存；租借 Mock 與預約快照也已改用 `RSV-Rxxx-xx`。
- 優惠券 Seed 已建立固定 ID 1～7 的 7 張券；目前 225 筆訂單都沒有可追溯 claim、券快照或折扣，因此 `coupon_claims`／`order_coupons` 維持空集合、已領數維持 `0`。只有確認會員、券、領券時間／狀態及 consumed 訂單後才可補建，不從資格或金額反推。
- 交易 Seed 已加入 U001～U050、Firebase 測試會員「粉紅雞」、225 筆訂單（含該會員已完成／已出貨／已退貨各 1 筆）、90 筆預訂、442 筆商城保留與 40 筆租借保留；租借 active 區間重疊超賣數為 0。
- 38 筆評論 Mock 的舊 `v-P...` 已全數轉為 canonical variant／SKU；Seed 只建立有明確 orderId 與 order item 的 `REV031`。舊庫存異動因缺 variant、單一表頭語意與員工主檔對照，維持不搬移。
- 會員周邊 Seed 已獨立補入 `020-identity.sql`：18 個偏好選項、200 筆會員偏好、50 筆預設地址、3 個會員標籤與 56 筆標籤指派；逐筆對齊 `frontend/data/customers/*.json`，不影響訂單／預訂成立條件。
- 完整 Seed 已於 2026-07-22 使用 PostgreSQL 16 全新獨立資料庫實灌，`latest_schema.sql` 與 `010`～`070` 一次成功 `COMMIT`；同一版本也已成功套用到目前 `yuruicamp`。可重做的流程與判定標準見 [`資料庫與完整 Seed 實際驗證`](./docs/backend-specs/test/database-seed-validation.md)。

### 用 npm 開啟前端（推薦／日常開發請用這個）

前端的 npm／Vite **根目錄是 `frontend/`**，必須先進入該資料夾再啟動。  
頁面使用網站根絕對路徑（`/storefront/...`、`/data/...`、`/assets/...`），因此**伺服器根必須是 `frontend/`**，用 Vite 最穩。

```powershell
# 在 repo 根 Yuruicamp/ 執行：
cd frontend
npm install          # 第一次或依賴有變時
npm run dev          # 啟動 Vite 開發伺服器
```

終端機出現類似 `http://127.0.0.1:5173` 後，用瀏覽器開啟：

| 要看什麼               | 網址                                                 |
| ---------------------- | ---------------------------------------------------- |
| 品牌入口（會導向首頁） | http://127.0.0.1:5173/                               |
| 主站首頁               | http://127.0.0.1:5173/storefront/pages/home.html     |
| 商品列表               | http://127.0.0.1:5173/storefront/pages/products.html |
| 營地預約               | http://127.0.0.1:5173/booking/pages/camp-search.html |
| 賣家後台               | http://127.0.0.1:5173/admin/login.html               |

停止伺服器：在該終端機按 `Ctrl + C`。

**常見錯誤（會導致沒有 CSS／JS、後台抓不到假資料）：**

- 在 **repo 根** `Yuruicamp/` 直接 `npm run dev`（這裡沒有前端的 `package.json` 工作根）
- 用 Live Server／靜態伺服器開在 **repo 根**，卻開 `frontend/storefront/pages/...`（此時 `/storefront`、`/data` 會 404）
- 用 `file://` 直接雙擊開 HTML（絕對路徑無法正確指向資源）

**假資料：** 檔案在 `frontend/data/`；瀏覽器執行期路徑是 `/data/**`（由 Vite 以 `frontend/` 為 root 提供）。

開發者改檔對照請看 [`userguide.md`](./userguide.md)。更完整的啟動說明見下方「啟動方式」。

---

## 本機資料庫（Docker + PostgreSQL）

後端開發使用 **PostgreSQL 16**。為了讓大家環境一致，資料庫用 Docker 啟動；  
Spring Boot 仍建議在本機 IDE 執行（除錯比較方便）。

相關檔案：

| 檔案                                         | 說明                                               |
| -------------------------------------------- | -------------------------------------------------- |
| [`docker-compose.yml`](./docker-compose.yml) | 只啟動 Postgres（不包前端／後端）                  |
| [`.env.example`](./.env.example)             | 環境變數範本（可進 Git）                           |
| `.env`                                       | 每人本機密碼（**不要** commit；已在 `.gitignore`） |

### 你需要先安裝

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)（啟動後狀態要是 Running）

### 第一次設定（每人做一次）

1. 在專案根目錄複製環境變數檔：

   ```powershell
   Copy-Item .env.example .env
   ```

2. 用編輯器打開 `.env`，把 `POSTGRES_PASSWORD` 改成你自己的本機密碼。  
   **不要把 `.env` commit / push 到 GitHub。**

3. 啟動資料庫：

   ```powershell
   docker compose up -d
   ```

4. 確認容器有在跑：

   ```powershell
   docker ps
   ```

   應看得到 `yuruicamp-db`，且 PORTS 類似 `0.0.0.0:5433->5432/tcp`。

### 連線資訊（給 Spring Boot / DBeaver / pgAdmin）

| 項目     | 值                                             |
| -------- | ---------------------------------------------- |
| Host     | `localhost`                                    |
| Port     | `5433`（不是 5432）                            |
| Database | `yuruicamp`                                    |
| Username | `.env` 裡的 `POSTGRES_USER`（預設 `postgres`） |
| Password | `.env` 裡的 `POSTGRES_PASSWORD`                |

Spring Boot 範例（之後放在本機設定，勿把真密碼推進 Git）：

```properties
spring.datasource.url=jdbc:postgresql://localhost:5433/yuruicamp
spring.datasource.username=postgres
spring.datasource.password=你的密碼
```

### 常用指令

```powershell
# 啟動
docker compose up -d

# 看 log（排查連線問題很有用）
docker compose logs -f yuruicamp-db

# 停止（資料還在）
docker compose down

# 停止並清空資料卷（會刪光 DB 資料，慎用）
docker compose down -v
```

### 建表（schema）

compose 在**資料卷第一次建立**時，會自動執行：

- [`docs/latest_schema.sql`](./docs/latest_schema.sql)（現行唯一 DDL；破壞性整檔重建）
- [`docs/seed/002-dev-seed.sql`](./docs/seed/002-dev-seed.sql)（開發資料唯一入口；依序載入 `docs/seed/dev/`）

說明文件：

- [`docs/database-schema-guide.md`](./docs/database-schema-guide.md)（ER／資料字典導覽）
- [`docs/schema-enums.md`](./docs/schema-enums.md)（ENUM 允許值）
- [`docs/database-documents/`](./docs/database-documents/)（各領域業務說明）

若 volume 已存在、只改了 SQL，需重建（會清資料）：`docker compose down -v` 後再 `up -d`。  
也可對空庫手動用 DBeaver / pgAdmin / `psql` 執行 `docs/latest_schema.sql`。

### 常見問題

**Q: `port is already allocated` / 5433 被占用？**  
A: 改 `.env` 的 `POSTGRES_PORT`（例如 `5434`），並同步改 Spring Boot 的連線 port。

**Q: 我改了 `.env` 密碼或需要重建最新資料庫結構，連線還是舊資料？**
A: Postgres 的帳密與 `docs/latest_schema.sql` 都只在「資料卷第一次建立」時套用。若要重建（會清資料）：

```powershell
docker compose down -v
docker compose up -d
```

**Q: 為什麼不用本機 5432？**  
A: 很多人電腦已裝過 PostgreSQL，5432 容易衝突，所以預設用 **5433**。

**Q: 可以把密碼寫在 `docker-compose.yml` 再推 GitHub 嗎？**  
A: 不行。請用 `.env`（已在 `.gitignore`），範本用 `.env.example`。

---

## Schema / 假資料

| 文件                                                                           | 說明                                                                   |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [`docs/latest_schema.sql`](./docs/latest_schema.sql)                           | PostgreSQL 現行 DDL（建庫真相來源）                                    |
| [`docs/database-schema-guide.md`](./docs/database-schema-guide.md)             | ER 圖、函式／Trigger、資料字典                                         |
| [`docs/schema-enums.md`](./docs/schema-enums.md)                               | status / category 等 ENUM 允許值                                       |
| [`docs/database-documents/`](./docs/database-documents/)                       | 各業務表領域說明                                                       |
| [`docs/seed/README.md`](./docs/seed/README.md)                                 | PostgreSQL 開發 Seed：SQL 結構、載入順序、執行方式與維護規則           |
| [`docs/data/json-seed-id-mapping.md`](./docs/data/json-seed-id-mapping.md)     | JSON／Seed 固定 ID：商品、規格、品牌、營區、zone、標籤、門市、租借 SKU |
| [`plans/data-integration-spec.md`](./plans/data-integration-spec.md)           | 前端 Mock JSON：資料語意、關聯、衍生資料與維護規則                     |
| [`plans/schema-migration-checklist.md`](./plans/schema-migration-checklist.md) | Schema 整合任務清單（歷史勾選；DDL 以 latest_schema 為準）             |

```powershell
cd frontend
npm run validate:data
npm run sync:listings
npm run normalize:data
```

## v1.3.76 - 2026/07/06

- 統一主站與 booking 的 `#personalizationModal`、`#surveyCloseConfirmModal` 樣式來源，booking components 入口改載主站 `modal` 與 `auth-modal` 基底。
- `booking/js/layout.js` 不再替偏好問卷與關閉確認視窗加入 `bookingAuth*` 視覺 class，只保留 `#loginModal` 的 booking 登入差異 class。
- 精簡 `booking/css/components/_booking-auth-modal.scss`，移除 booking 問卷、stepper、tag 與確認視窗覆寫，讓偏好問卷與確認視窗回到主站共用樣式。

## v1.3.75 - 2026/07/06

- 調整共用 `floatingLineBtn` hover 動畫：提示膠囊改從 icon 原位向左展開，符合 LINE 聯絡膠囊樣式。
- LINE icon 保持固定在右側原位，不再因 hover 動畫位移；提示文字以 `clip-path`、`opacity`、`transform` 顯示，避免改變 layout 寬度。
- 主站與 booking floatingActions 的 LINE 文字、title 與 aria-label 統一為「LINE 聯絡」，並同步重新編譯主站與 booking CSS。

## v1.3.74 - 2026/07/06

- 統一主站與 booking 的 floatingActions 元件：主站 `js/main.js` 改輸出 `floatingActions`、`floatingTopBtn`、`floatingLineLabel`、`floatingLineIcon` 等 camelCase selector。
- `css/components/widgets/_floating-actions.scss` 成為主站與 booking 共用的唯一 floatingActions 樣式來源，booking components 入口改為引用此 widgets partial。
- 刪除 booking 自有 `booking/css/components/_floating-actions.scss`，並重新編譯主站與 booking CSS 輸出，讓兩邊顯示同一套回頂部與 LINE 聯絡操作。

## v1.3.73 - 2026/07/06

- 調整主站共用登入 Modal 關閉防跳頂流程：`button.modalClose.sharedAuthClose` 關閉當下會重新記錄 scroll 位置，再關閉 Modal 並還原位置與觸發按鈕焦點。
- `button.siteCartButton` 開啟購物車 Drawer 時會記錄目前頁面位置，Drawer 聚焦關閉按鈕後會還原原本 scroll。
- `button.siteCartDrawerClose` 關閉購物車 Drawer 時會記錄關閉當下位置，關閉後以 `preventScroll` 回到原觸發按鈕，避免畫面跳至頂部。

## v1.3.72 - 2026/07/06

- 修復主站 Header 的 `siteMenuButton` 開啟 / 關閉 offcanvas 時可能跳回頁首的問題，開啟前會記錄 scroll 位置，關閉後還原位置並以 `preventScroll` 回焦點。
- 修復主站 Header 的 `siteLoginButton` 開啟 / 關閉登入 Modal 時可能改變瀏覽位置的問題，登入 Modal 的關閉按鈕、背景遮罩與 Esc 關閉都會保留原 scroll。
- `js/components/header.js` 新增 Header 互動層位置還原工具與中文區塊註解，避免共用 modal 關閉事件造成頁面位移。

## v1.3.71 - 2026/07/06

- 修復分店頁合作夥伴 Modal 關閉時跳回頁面頂部的問題：`partnerModalClose`、背景遮罩與 Esc 關閉都會保留開啟前的 scroll 位置。
- `js/pages/branches.js` 新增 partner modal 專用關閉流程，先攔截共用 modal 關閉事件，再呼叫 `closeModal()` 並於下一幀還原 scroll 與觸發按鈕 focus。
- 保留既有開啟 Modal 時的防跳頂邏輯，讓開啟與關閉流程都不改變使用者原本瀏覽位置。

## v1.3.70 - 2026/07/06

- 為商品詳情頁免運進度條新增動畫：註冊 `--shipping-progress-value` 為可動畫 percentage，讓深色填滿區在購物車增加、減少或清空時平滑推進 / 回退。
- 進度條仍使用既有 `shippingProgressValue0~100` class 與 `--yc-*` token，不新增 inline style 或新色碼。
- `prefers-reduced-motion` 會套用既有 reduced motion 規則，降低進度變化動畫時間。

## v1.3.69 - 2026/07/06

- 修正商品詳情頁免運進度條在畫面上未呈現「深色目前進度 + 淺色剩餘軌道」的問題。
- 不再依賴 native `<progress>` 的瀏覽器 pseudo element 來顯示填滿色，改由 `.shippingProgressBar` 本體背景搭配 `shippingProgressValue0~100` class 繪製進度比例。
- `<progress>` 仍保留 `value` 與 `aria-valuenow` 作為語意與無障礙狀態，視覺則由 SCSS 使用既有 `--yc-*` token 控制。

## v1.3.68 - 2026/07/06

- 依 `docs/ai-style-sheet.md` 使用既有 `--yc-*` token，為商品詳情頁免運進度條新增 `isEmpty`、`isInProgress`、`isComplete` 三種狀態。
- 未滿 100% 時以深色填滿目前進度、淺色軌道表示剩餘進度；達到 100% 後整條改為較淺完成色，讓使用者更直覺分辨剩餘進度與已達標狀態。
- 進度條狀態由 `_renderShippingProgress()` 統一切換，並補齊 `prefers-reduced-motion` 對進度條本體 transition 的處理。

## v1.3.67 - 2026/07/06

- 修正商品詳情頁免運進度條渲染：`#shippingProgressBar` 不再於購物車為空時使用假進度值，改與實際購物車小計計算出的百分比同步。
- 進度條同步更新 `value` 與 `aria-valuenow`，讓清空購物車、減少數量與移除商品後，視覺填滿比例、文字百分比與輔助資訊保持一致。

## v1.3.66 - 2026/07/06

- 新增主站購物車共用事件 `yurui:cart-changed`，在加入、移除、數量異動與清空購物車後統一廣播最新購物車狀態。
- `pages/product-detail.html` 的免運進度條現在會監聽購物車變更事件，清空購物車、減少商品數量或移除商品時會即時更新 `#shippingProgressBar`、百分比文字與免運提示。
- 事件 detail 會帶出購物車小計與商品總數，後續其他頁面若需要同步購物車衍生 UI，可共用同一個事件來源。

## v1.3.65 - 2026/07/06

- 依需求將商品列表頁廣告輪播改為完整 slides + 首尾 clone 架構，取代三張視窗式重建，避免動畫結束後畫面往前再往後固定。
- clone 邊界 reset 會在 `transitionend` 同一個渲染週期內關閉 transition、重設 transform、強制 reflow，下一幀才恢復 transition，讓跳回真實 slide 的動作不被畫出。
- 保留 timer/listener 清理、transition fallback 與圖片預載，避免偏好更新、transitionend 遺失或圖片延遲載入造成輪播卡住。

## v1.3.64 - 2026/07/06

- 強化商品列表頁廣告輪播狀態機：新增 `_cleanupAdCarousel()`，偏好更新後若沒有推薦商品會清除舊 timer、transition fallback 與事件監聽。
- `adCarouselContainer` 動畫啟動改用 double `requestAnimationFrame`，並補上 transition fallback timer，避免瀏覽器合併 layout 或 transitionend 遺失時讓輪播卡在 `isAnimating`。
- 三張視窗重建前會預載上一張、目前張與下一張圖片，降低重新渲染 slide 時短暫空白的機率。

## v1.3.63 - 2026/07/06

- 移除商品列表頁廣告輪播在 clone slide 後瞬間跳回第一張的重定位流程，避免無縫接軌後又出現可見回跳。
- `adCarouselContainer` 改為三張視窗式循環渲染：每次只渲染上一張、目前張、下一張，動畫結束後重建視窗並維持在中間位置。
- 自動播放、上一張 / 下一張與 dot 切換仍維持循環，但不再使用「跳回真實第一張」的 reset 行為。

## v1.3.62 - 2026/07/06

- 修復商品列表頁 `adCarouselContainer` 廣告輪播循環：改為首尾雙 clone，最後一張往第一張與第一張往最後一張都透過無動畫重定位完成，避免出現倒回式瞬間切換。
- `js/pages/product-list.js` 的輪播控制新增有界 index 與 `AbortController`，重新初始化偏好推薦輪播時會中止舊事件監聽，避免多次綁定後 index 持續位移到不存在的 slide。
- 自動輪播、上一張 / 下一張、dot 切換與點擊商品導頁共用同一套循環狀態，降低第十次切換後圖片全部消失的風險。

## v1.3.61 - 2026/07/06

- 依 `.agents/agents.md` 調整首頁 CTA token：`heroPrimaryLink` 改用 `--yc-cta` / `--yc-on-cta`，hover 改用 `--yc-cta-hover` / `--yc-on-cta-hover`。
- `heroSecondaryLink` 的 border 與文字同步改用 CTA token，hover 狀態改用 CTA hover token，維持透明背景不改動版面。
- `homeProductAddButton` 改用 CTA token 作為背景、邊線與文字色，並補上 `--yc-on-cta-hover` 至主站、booking 與 AI token 文件。

## v1.3.60 - 2026/07/06

- 將 `booking/booking-style-tokens.md` 的 booking token、互動規則、z-index、元件規則與 AI 檢查清單整併進 `docs/ai-style-sheet.md`，讓 AI 樣式規範成為單一 source of truth。
- 刪除已整併的 `booking/booking-style-tokens.md`，並更新 `docs/ai-style-tokens.css` 與 `plans/booking-itcss-scss-plan.md` 的現行參考路徑。
- `docs/ai-style-sheet.md` 的實作 prompt 改為要求閱讀 `docs/ai-style-sheet.md` 與 `docs/ai-style-tokens.css`，並明確禁止新增 `--bk-*` / `--yui-*` alias。

## v1.3.59 - 2026/07/04

- 第四輪殘留清理：將剩餘 `:first-child` / `:last-child` 結構 selector 改為相鄰兄弟 selector 或明確語意 class，降低清單尾端與 DOM 順序相依。
- 清理 booking button 殘留註解與重複 selector，並將 `transition: all` 改為明確 transition property，避免尺寸與 spacing 被動畫化。
- 更新 booking SCSS 入口與 settings 註解，不再描述相容 alias，維持 `--yc-*` 為唯一 runtime token source。

## v1.3.58 - 2026/07/04

- 第三輪殘留清理：移除 `css/settings/_tokens.scss` 與 `booking/css/settings/_tokens.scss` 中的 `--yui-*` / `--bk-*` 相容 alias，runtime token source 統一只保留 `--yc-*`。
- 更新 `booking/booking-style-tokens.md`、`docs/ai-style-tokens.css`、`docs/ai-style-sheet.md`、`docs/itcss-architecture.md` 與 `booking/css/semantic-selector-map.md`，不再把舊 alias 當成可用規格。
- 清理 `bookingToast` 動畫 keyframes 與 booking cart spec 的 `bk*` 文件殘留，讓新規範掃描聚焦在正式命名。

## v1.3.57 - 2026/07/04

- 第二輪殘留清理：`docs/frontend-specs` 與結帳成功頁內嵌腳本改用 `--yc-*` token，來源檔不再直接引用舊 `--yui-*`。
- 商品列表頁狀態 class 從 `active` 收斂為 `isSelected` / `isOpen`，並調整輪播指示器為固定尺寸，避免狀態切換造成版面位移。
- booking 表單、篩選 chip、價格滑桿與搜尋列補回透明 outline 加可見 focus ring；LINE、成功、表面白與刪除線色彩改為共用 token 引用。

## v1.3.56 - 2026/07/04

- 將主站與 booking 的設計 token source 統一到 `--yc-*`：`css/settings/_tokens.scss` 與 `booking/css/settings/_tokens.scss` 皆定義同一套 base、status、layout、typography、spacing、radius、shadow、motion 與 z-index token。
- 保留 `--yui-*` 與 `--bk-*` 相容 alias；主站 SCSS 使用點已從 `--yui-*` 逐步改為 `--yc-*`，舊 selector 仍可透過 alias 過渡。
- `booking/booking-style-tokens.md` 補齊 alias mapping，`docs/ai-style-tokens.css` 改為 alias 文件，`docs/ai-style-sheet.md` 與 `docs/itcss-architecture.md` 同步標明 `--yc-*` 為新的樣式規格來源。
- 驗證：`npm.cmd run stylelint`、`npx.cmd sass css/main.scss:css/main.css booking/css/booking-main.scss:booking/css/booking-main.css --style=expanded --source-map`、`npm.cmd run smoke`、`npm.cmd run build` 通過；dev server 在本環境可短暫回應 `/`，但後續頁面 HTTP 批次讀取時 port 未保持 listening，完整瀏覽器頁面 QA 未完成。

## v1.3.55 - 2026/07/03

- 租借頁靜態區塊補齊 base + Booking variant 雙 class：`summaryBar summaryBarBooking`、`recommendationBanner recommendationBannerBooking`、`rentalLayout rentalLayoutBooking`、`rentalCartSidebar rentalCartSidebarBooking` 等。
- `camp-rental.js` 產生的摘要分隔符與推薦橫幅內容同步改為 `summarySeparator*`、`recommendationBannerContent*`、`recommendationTag*` 語意命名，並保留既有 ID 作為資料與事件掛點。
- `booking/css/pages/_camp-rental.scss` 改由 `*Booking` selector 管理租借頁外殼、推薦橫幅、列表 grid、右側背包與略過連結，避免 page style 綁在可共用 base class 上。

## v1.3.54 - 2026/07/03

- 延續 booking 動態 HTML 語意化：營位卡片改為 `zoneCard zoneCardBooking`、`zoneCardInfo zoneCardInfoBooking` 等 base + Booking variant 雙 class，事件代理同步改抓 Booking 變體。
- 租借裝備卡片改為 `rentalItemCard*` 共通語意搭配 `rentalItemCard*Booking` 變體，並將 `rentalItemCardImg` / `rentalItemCardDesc` 收斂為較完整的 `Image` / `Description` 命名。
- 租借背包 empty state 與品項列改用 `rentalCartEmpty*`、`rentalCartItemName*`、`rentalCartItemPrice*`，SCSS 不再依賴 `span:first-child` / `span:nth-child(2)` 結構 selector。

## v1.3.53 - 2026/07/03

- 執行 booking 動態 HTML 語意化第一輪：`camp-detail.js` 的 `zoneSelectBtn` 改為 `zoneSelectButton zoneSelectButtonBooking`，`camp-rental.js` 的 `rentalAddBtn` / `rentalRemoveBtn` 改為 `rentalAddButton rentalAddButtonBooking` / `rentalRemoveButton rentalRemoveButtonBooking`。
- `booking/css/pages/_camp-detail.scss` 與 `_camp-rental.scss` 同步改用新 Button selector，並補上中文註解說明互動 hook 與操作責任。
- `camp-search.js` 動態營區卡片補齊 `campCard*` 共通語意與 `campCard*Booking` 變體 class，`_camp-search.scss` 改由 Booking 變體 selector 管理搜尋結果卡片視覺。

## v1.3.52 - 2026/07/03

- 將 booking header runtime ID 從 `bk*` 收斂為 `booking*` 語意命名：`bookingMenuButton`、`bookingOffcanvasPanel`、`bookingOffcanvasBackdrop`、`bookingCartButton` 與 `bookingPanelBackdrop`。
- `components/header.partial` 同步更新 `aria-controls` 與對應 ID，`booking/js/booking-header.js` 改用新 ID 查找側邊選單、預約背包面板與 backdrop。
- `booking-header.js` 在側邊選單與預約背包面板開關區塊補上中文註解，說明互動掛點與 header layer 狀態責任。

## v1.3.51 - 2026/07/03

- 清理 booking toast 舊相容命名：`booking-utils.js` 不再產生 `bkToast*` / `bkToast--type` class，統一輸出 `bookingToast`、`bookingToastInfo`、`bookingToastText`、`bookingToastClose` 等語意化 class。
- `booking/css/components/_booking-toast.scss` 移除 `#bkToastContainer`、`.bkToast*`、`.bkToastAction*` 相容 selector，只保留 `bookingToast*` 正式命名與中文區塊註解。
- 保留確認型 toast 的 `bookingToastConfirm` / `bookingToastActions` / `bookingToastAction*` 樣式作為共用操作型通知能力，但不再提供舊 `bkToast*` alias。

## v1.3.50 - 2026/07/03

- 將 booking 預約背包頁剩餘 `#bk*` ID 掛點改為 `#bookingCart*` 語意命名，例如 `bookingCartContent`、`bookingCartStayBody`、`bookingCartCostRows` 與 `bookingCartCheckoutButton`。
- `booking-cart.js` 同步改用新 ID selector，保留既有 localStorage、數量調整、刪除裝備與費用重算流程不變。
- `booking/css/pages/_booking-cart.scss` 移除 `#bkRentalCard + div` 結構相依 selector，新增 `cartClearAction cartClearActionBooking`，讓清除背包操作列有明確語意與中文註解。

## v1.3.49 - 2026/07/03

- 將 booking 結帳頁延續預約背包頁的語意化命名規則：`bkCheckout*`、`bkPanel*`、`bkSummaryCard`、`bkLoginNotice*` 改為 `checkout*` / `summaryCard*` / `loginNotice*` 共通語意加 `*Booking` 變體 class。
- `booking-checkout.html` 的頁面根 class 從 `bookingCartPage` 分離為 `bookingCheckoutPage`，避免結帳頁繼續借用背包頁語意；既有表單與流程 ID 保留作為 JS 掛點。
- `booking-checkout.js` 的手風琴事件代理改用 `checkoutPanelHeaderBooking`、`checkoutPanelBooking` 與 `checkoutPanelBodyBooking`，並在 SCSS 補上中文區塊註解說明 layout、panel、summary、login notice 與送出區責任。

## v1.3.48 - 2026/07/03

- 將 booking 預約背包頁作為語意化命名樣板：HTML、SCSS 與 JS 產生內容改用 `cart*` / `quantity*` 共通語意加上 `*Booking` 變體 class，例如 `cartItem cartItemBooking`、`quantityButton quantityButtonBooking`。
- 保留 `#bk*` ID 作為既有 JS 掛點，避免本輪命名收斂牽動 localStorage 與頁面流程；樣式與事件代理已不再依賴舊 `.bkCart*` / `.bkQty*` / `.bkRentalRemove` class。
- `booking/css/pages/_booking-cart.scss` 補上中文區塊註解，說明 cart layout、項目列、數量調整器、摘要欄與空狀態的責任邊界，供後續 booking checkout / rental 頁面套用同一命名規則。

## v1.3.47 - 2026/07/03

- 清理 booking CSS token fallback：`rental-guide`、`booking-faq`、租借、購物車與結帳頁面改用既有 `--yc-*` / `--bk-*` token，移除可替代的 `var(..., #fallback)` 與一般白色硬碼。
- Toast 與 tag/status 元件改用既有陰影、深色文字與 `color-mix()` token 表達，移除未使用的 `.bkToastInfo` / `.bkToastWarning` / `.bkToastError` / `.bkToastSuccess` 舊狀態 selector。
- 保留 LINE Pay 外部品牌綠並加上中文註解，避免把第三方品牌識別色誤併入 booking 設計 token。

## v1.3.46 - 2026/07/03

- 精修 booking ITCSS：移除已不再匯入的 `booking/css/objects/_layout.scss`、`_booking-layout.scss` 與 `utilities/_utilities.scss`，objects 層保留為低語意 layout object 的入口說明。
- 將 booking 跨頁懸浮操作移入 `booking/css/components/_floating-actions.scss`，搜尋頁 hero 樣式移入 `booking/css/pages/_camp-search.scss`，避免 component/page 樣式留在 objects 層。
- Toast 樣式與 `booking-utils.js` 改採 `bookingToast*` 新命名，同時保留舊 `bkToast*` / `bkToast--type` 相容 class，修正原本 JS type class 與 CSS 狀態 selector 不一致的問題。

## v1.3.45 - 2026/07/03

- 依 booking CSS ITCSS 收斂計畫，將 `searchPage`、`detailPage`、`rentalPage`、`bookingCartPage` 與對應 layout grid 從 objects 層移回 pages 層，objects barrel 只載入低語意版面結構。
- `booking/css/components/_modal.scss` 改載主站 modal 共用骨架，`booking-auth-modal` 保留 booking 登入側滑、OAuth 與偏好問卷差異，並移除未被 runtime 使用的 legacy OAuth / personalization selector。
- 將 booking tag/status token 從 component 上移到 `booking/css/settings/_tokens.scss`，並把唯一 `.srOnly` helper 收斂至 generic reset，booking 入口不再額外載入 utilities 層。

## v1.3.44 - 2026/07/03

- 依 `.agents/agents.md` 收斂主站與 booking 的 header/footer 樣式來源：booking header、footer、drawer 改為載入主站共用 widgets / drawer / offcanvas / cart-drawer 骨架，內容仍由 `data-layout-part` 各自分流。
- `booking/css/settings/_tokens.scss` 新增 `--yui-*` 相容 alias，對應既有 `--yc-*` token，讓共用樣式在 booking runtime 可直接使用而不新增色碼、字體或間距系統。
- 清除 booking header/footer/drawer 內未被 runtime 使用的舊 `.bk*` / `.bkFooter*` 相容樣式，保留 `#bkHamburger`、`#bkCartBtn` 等 booking JS 既有功能 hook。

## v1.3.43 - 2026/07/03

- 依 `.agents/agents.md` 完成 booking ITCSS 歸層審查：將搜尋、詳情、結帳支援、裝備租借等單頁 selector 從 `booking/css/components/` 移入 `booking/css/pages/`，並新增 `booking/css/pages/_camp-rental.scss`。
- 刪除未被 booking runtime HTML/JS 引用的 legacy CSS source：`booking/css/base.css` 與 `booking/css/booking.css`；公開頁維持載入 Sass 編譯輸出 `booking/css/booking-main.css`。
- 確認 `--yc-*` 仍為 booking token source of truth、`--bk-*` 只作相容 alias，並同步更新 `docs/itcss-architecture.md`、`plans/booking-itcss-scss-plan.md` 與 README 的 booking CSS 架構描述。

## v1.3.42 - 2026/07/03

- 會員中心保留主站與 booking 兩個入口 shell：主站入口載入主站 header/footer，booking 入口載入 booking header/footer，兩邊共用 `components/member-center.partial`、`js/components/member-center.js` 與主站會員中心樣式。
- 主站與 booking header 的會員中心連結會帶入安全的 `returnTo` 參數，會員中心「返回首頁」會回到各自來源頁；若來源不在允許範圍內則回主站 `home.html` 或 booking `camp-search.html`。
- 依 `.agents/agents.md` 將會員中心樣式收斂為主站唯一來源：`pages/member-center.html` 只載入 `css/main.css`，共用會員中心 partial 補上 `.memberCenterPage` 頁面根 class，booking 入口改為載入主站會員中心樣式與 booking 自身 header/footer。
- 刪除 booking 專用會員中心樣式入口 `booking/css/member-center-main.scss`、`booking/css/member-center-main.css` 與 `booking/css/pages/_member-center.scss`；後續會員中心樣式統一從 `css/pages/_member-center.scss` 維護。
- 更新 `docs/itcss-architecture.md`、`plans/booking-itcss-scss-plan.md` 與 `package.json`，移除 booking 會員中心獨立 Sass 入口與格式化範圍中的已刪除 CSS 輸出。

## v1.3.41 - 2026/07/03

- 依 `.agents/agents.md` 產出 `plans/booking-itcss-scss-plan.md`，整理 booking CSS 漸進轉為 SCSS ITCSS 的分層目標、檔案遷移順序、命名轉換策略、編譯方式與驗收清單。
- 新增 `booking/css/booking-main.scss` 與 `booking/css/member-center-main.scss`，並建立 settings、generic、elements、objects、components、pages、overrides、utilities 的 SCSS partial；舊平面 CSS source 已移除，Sass 編譯後仍輸出既有 `booking-main.css` 與 `member-center-main.css`，保持 HTML 載入路徑相容。
- 同步將 booking 自有 class/id 改為語意化 camelCase，並修正 shared booking header/footer partial 載入、移除 booking JS inline style 寫法、補上全域 `:focus-visible` 保底；外部 Bootstrap Icons / Flatpickr 類別保留原名。
- `package.json` 的 stylelint 範圍改為檢查主站與 booking 的 SCSS source，`format` 收斂為 booking code 與本輪更新文件範圍，另保留 `format:all` 作為全專案格式檢查；驗證已通過 bundled Node 執行的 Sass 編譯、SCSS stylelint、booking 範圍 Prettier、Vite build，以及 8 個 booking 頁面在 375/768/1024/1440 viewport 無水平捲動。

## v1.3.40 - 2026/07/02

- 依 `.agents/AGENTS.md` 調整共用登入 Modal：`#loginModal` 改為右側滑出視窗並放大至視窗高度，社群登入按鈕補齊垂直間距，Facebook 使用既有 info token 混合淺藍底，LINE 使用 `--yui-success` 背景。
- 本輪遵守限制未修改 JS；`siteMenuButton` 與 `siteCartButton` 既有 HTML 已是 `type="button"`，保留原本彈出視窗方式。

## v1.3.39 - 2026/07/02

- 依 `.agents/AGENTS.md` 整理 `js/components/member-center.js`：使用 Prettier 展開壓縮式單行程式，補齊函式間空行、縮排與中文用途註解，並將折價券與通知 HTML 字串拆成逐標籤換行。
- 本輪未修改會員中心功能邏輯；驗證已通過 `node --check js/components/member-center.js`，並確認沒有 140 字以上長行。

## v1.3.31 - 2026/06/30

- 依 `.agents/agents.md` 補齊本輪 CSS 細節：商品詳情頁籤列移除右側橫向捲動，會員中心 header 品牌字體避開 booking @font-face 覆蓋，並讓浮動回頂部按鈕維持橘色 48px 共用樣式。
- 依 `.agents/agents.md` 調整前台 CSS 細節：商品詳情主內容補左右留白、header 品牌 logo 與 Yuruicamp 文字放大、全站連結 hover 改為不顯示底線、會員中心訂單明細 Modal 美化，並統一浮動回頂部按鈕 icon 尺寸。
- 修復 shared header 登入互動：主站 `_header.scss` 補齊共用 modal 基礎樣式，`js/main.js` 與 `booking/js/layout.js` 在 shared-auth 注入後載入 `modal.js`，恢復登入、社群登入、個人化問卷與會員下拉選單初始化順序。
- 修復 header 登入按鈕顯示狀態：`isLoggedIn` 為 true 時隱藏 `.siteLoginButton`，並顯示 `.siteUserMenu`；未登入時恢復登入按鈕既有 `inline-flex` 顯示，避免與會員選單同時出現。
- 修復前台共用 UI：浮動回頂部 / LINE 按鈕改用 token 圓形固定樣式，合作夥伴 modal 開啟時不再捲到頁首，商品詳情頁加入購物車與直接購買按鈕同步商品列表 CTA 視覺。
- 修復 `.agents/agents.md` 指定的前台細節：共用 header 改由掛載點維持 sticky、品牌 Logo 置中、會員下拉與購物車 badge 改成可見狀態才套用 display、購物車移除改垃圾桶 SVG、商品數量與 checkout CTA 套用 token 按鈕樣式，並補齊 checkout-success header icon 樣式來源。
- 依 `.agents/agents.md` 補齊新版 `header.partial` 互動：`js/main.js` 在 partial 注入後一律執行可重複的 header / modal / cart 初始化，`js/components/header.js` 改用現有 `keyword` 搜尋導頁、維持搜尋下拉隱藏並同步登入狀態與會員選單。
- `pages/products.html`、`js/pages/product-list.js` 與商品頁 SCSS 新增 `keyword` 搜尋結果、0.1 顆星裁切評分、廣告輪播複製首張後無縫回跳、手機篩選按鈕共用商品 CTA 視覺與價格欄位 `step="100"`。
- `pages/home.html` 相關首頁邏輯與 SCSS 補上 0.1 顆星裁切、品牌跑馬燈維持兩組品牌無限捲動、商品卡 hover 改為整卡平滑微放大 / 上移 / 加深陰影，並調整服務特色標題顯示。
- 驗證：`cmd /c "cd /d D:\GithubDesk\Yuruicamp\css && npx sass main.scss:main.css"`、受控啟動 `cmd /c "npx sass --watch main.scss:main.css"`、`node --check` 已針對 `header.js`、`home.js`、`product-list.js` 通過；`--watch` 程序已停止。

## v1.3.27 - 2026/06/30

- 重構共用 `components/header.partial` 與 `components/footer.partial`，保留 `data-layout-part`、指定 `id`、共用登入 modal、購物車 drawer、booking header/footer 入口，並將 header/footer 相關 class 統一為 camelCase。
- 更新 `js/components/header.js`、`js/components/cart.js`、`js/components/modal.js`、`booking/js/booking-header.js`，把 offcanvas、搜尋層、使用者選單、cart drawer、booking panel 與 shared modal 狀態統一為 `.isOpen` / `.isVisible` / `.isSelected`。
- 重寫 `css/components/content/pages/_header.scss` 與 `_footer.scss`，改用 `--yui-*` token，移除 header/footer 範圍內的 `.btn`、`.container`、BEM、migrated 與 `.active` 依賴；同步補上 booking 頁面載入的 `booking/css/booking.css` 相容樣式。
- 驗證：`node --check`、ESLint、Stylelint、`npm.cmd run build` 通過；build 仍保留既有非 module script 與 Sass deprecation 警告。

# Yuruicamp 露營選物品牌網站

> 探索戶外，從這裡開始 🏕️

## Schema / 假資料

假資料已整合至 `/data/**`（多在 `frontend/data/**`）；PostgreSQL 以 `docs/latest_schema.sql` 為準（給 Java bootcamp 銜接用，前端仍可走 Mock）：

| 文件                                                                       | 說明                                                                   |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [docs/latest_schema.sql](docs/latest_schema.sql)                           | PostgreSQL 現行 DDL（ENUM + 主表 PK/FK + View／Trigger）               |
| [docs/database-schema-guide.md](docs/database-schema-guide.md)             | ER 圖與資料字典導覽                                                    |
| [docs/schema-enums.md](docs/schema-enums.md)                               | 狀態／分類枚舉允許值                                                   |
| [docs/database-documents/](docs/database-documents/)                       | 各業務表領域說明（含快照欄位語意）                                     |
| [docs/seed/README.md](docs/seed/README.md)                                 | PostgreSQL 開發 Seed：SQL 結構、載入順序、執行方式與維護規則           |
| [docs/data/json-seed-id-mapping.md](docs/data/json-seed-id-mapping.md)     | JSON／Seed 固定 ID：商品、規格、品牌、營區、zone、標籤、門市、租借 SKU |
| [plans/data-integration-spec.md](plans/data-integration-spec.md)           | 前端 Mock JSON：資料語意、關聯、衍生資料與維護規則                     |
| [plans/schema-migration-checklist.md](plans/schema-migration-checklist.md) | Schema 整合任務勾選清單（歷史）                                        |

## 📋 專案概述

Yuruicamp 是一個露營選物電商專案，包含 `storefront/pages/` 下 **11 個**買家功能頁面、Mock／REST 雙模式、完整 RWD 響應式設計，以及一套獨立的**賣家管理後台**。正式後台使用 Firebase Google 登入、後端 Admin Session、細粒度 RBAC、Backend readiness 與圖表儀表板；員工 ID 登入只保留給 Mock 開發模式。

**開發目標**：能跑 → 看懂 → 好改 → 效能，按此優先順序逐步實現。

**技術棧**：

| 技術                              | 用途                                             |
| --------------------------------- | ------------------------------------------------ |
| HTML5                             | 語義化頁面結構                                   |
| SCSS / CSS3                       | 買家前台樣式系統、約 4900 行完整 CSS             |
| Vanilla JavaScript                | 買家前台頁面互動邏輯（無框架依賴）               |
| Vite + Sass                       | SCSS 編譯、多頁面建置、資產壓縮                  |
| ESLint + Prettier + Stylelint     | JS / HTML / CSS / SCSS 基礎品質檢查              |
| Bootstrap 5 + jQuery 3 + Chart.js | 賣家後台 UI 框架、圖表視覺化                     |
| REST API + Mock facade            | 正式模式以 Spring Boot 為真相，Mock 僅供離線開發 |
| Git                               | 版本控制                                         |

**建置狀態**：✅ 買家前台 14 階段完成 + 賣家後台 9 模組完成（2026/06/15，含租借多營地庫存與異動員工 ID）+ 預約子系統 6 頁面完成（2026/06/12）

---

## 📁 目錄結構

> 詳細改檔對照見 [`userguide.md`](./userguide.md)。前端路徑皆在 `frontend/` 底下。

```
Yuruicamp/
├── frontend/                     # ⭐ npm / Vite 根（三前端 + mock）
│   ├── package.json              # Vite、lint、format、stylelint、smoke
│   ├── vite.config.js
│   ├── index.html                # 品牌入口（重定向至 storefront/pages/home）
│   ├── storefront/               # 主站（裝備商城：pages/ + js/ + css/）
│   ├── components/               # 共用 HTML partial（暫放 frontend 根）
│   ├── booking/                  # 營地預約子站（pages/ + js/ + css/）
│   ├── admin/                    # 賣家後台（login / dashboard / partials / js）
│   ├── data/                     # ⭐ 全站唯一 Mock JSON（執行期 /data/**）
│   ├── assets/                   # 圖片、icon、影片
│   ├── src/styles.js             # Vite SCSS 入口（匯入 storefront/css）
│   ├── tests/                    # smoke 等
│   └── color/                    # 色票文件
│
├── backend/                      # Spring Boot（本階段架構不動）
├── docs/                         # Schema、frontend-specs、database-documents
├── plans/                        # 規劃與遷移規格（含 frontend-folder-migration-spec）
├── thoughts/                     # 開發思考筆記
├── docker-compose.yml            # 本機 PostgreSQL
├── README.md
├── userguide.md                  # 開發者工作手冊（路徑相對 frontend/）
├── changelog.md
└── .gitignore
```

---

## 🚀 快速開始

### 環境要求

- 現代瀏覽器：Chrome 90+ / Firefox 88+ / Safari 14+ / Edge 90+
- Node.js 18+（使用 Vite、Sass、lint、smoke test）
- 本地 Web 伺服器（避免 CORS 問題，因為有 fetch JSON 資料）

### 啟動方式

**方式 1：npm + Vite（強烈推薦，日常請用這個）**

1. 開啟終端機，進入前端目錄（不要停在 repo 根）：

   ```powershell
   cd frontend
   ```

2. 安裝依賴（第一次或 `package.json` 有變時）：

   ```powershell
   npm install
   ```

3. 啟動開發伺服器：

   ```powershell
   npm run dev
   ```

4. 看終端機印出的位址（預設 `http://127.0.0.1:5173`），用瀏覽器開啟例如：

   - 主站：http://127.0.0.1:5173/storefront/pages/home.html
   - 預約：http://127.0.0.1:5173/booking/pages/camp-search.html
   - 後台：http://127.0.0.1:5173/admin/login.html

為何一定要用 npm／Vite：HTML 已改成根絕對路徑（`/storefront/js/...`、`/data/...`、`/assets/...`），Vite 以 `frontend/` 當網站根，這些路徑才會對上。用錯根目錄時會出現「沒有 CSS／JS、後台沒有假資料」。

**常用品質檢查（皆在 `frontend/` 執行）**

```powershell
cd frontend
npm run smoke      # 基礎結構與共用 runtime 檢查
npm run lint       # ESLint 檢查 JS
npm run format     # Prettier 檢查格式
npm run stylelint  # Stylelint 檢查 CSS / SCSS
npm run build      # Vite 多頁面建置與資產壓縮
```

> Vite 透過 `frontend/src/styles.js` 匯入 `storefront/css/main.scss`；既有 `storefront/css/main.css` 保留作為非 Vite 靜態伺服器 fallback。
>
> **路徑契約（2026-07）：** 靜態資源與腳本一律用網站根絕對路徑（`/assets`、`/storefront/js`、`/data`）。Mock 路徑表在 `storefront/js/api-mock.js` 的 `MockDataPaths`；接 Spring 時改 `AppConfig.USE_MOCK_API = false` 與 `API_BASE_URL`，不必再改各頁路徑。詳見 [`plans/frontend-root-absolute-path-and-api-contract-spec.md`](plans/frontend-root-absolute-path-and-api-contract-spec.md)。

**方式 2：VS Code Live Server（備援，不建議當日常主路徑）**

安裝 [Live Server 擴充套件](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer)，必須在 **`frontend/`** 目錄右鍵 → Open with Live Server。  
**不要從 repo 根 `Yuruicamp/` 開**，否則 `/storefront`、`/data` 會 404（沒樣式、沒腳本、後台抓不到資料）。日常開發請優先用上方的 `npm run dev`。

> 共用 Header / Footer 片段使用 `.partial` 副檔名，而不是 `.html`。這是為了避免 Live Server 對 HTML fragment 注入 live reload script，造成像 `components/header` 這類被 `fetch()` 載入的片段 response 截斷。

**方式 3：Python 3（備援）**

```powershell
cd frontend
python -m http.server 8000
# 瀏覽器開啟 http://localhost:8000
```

**方式 4：Node.js 靜態伺服器（備援）**

```powershell
cd frontend
npx http-server -p 8000
# 瀏覽器開啟 http://localhost:8000
```

### 首次使用建議路徑

路徑皆相對 `frontend/`（dev server root）。

**買家前台（購物流程）**

```
入口頁 → index.html
首頁   → storefront/pages/home.html
商品   → storefront/pages/products.html → storefront/pages/product-detail.html
購物   → 商品詳情／購物車 Drawer → storefront/pages/cart.html（確認背包並鎖庫）→ storefront/pages/checkout.html → storefront/pages/checkout-success.html
會員   → storefront/pages/member-center.html
內容   → storefront/pages/blog.html → storefront/pages/blog-detail.html
分店   → storefront/pages/branches.html
服務   → storefront/pages/faq.html
```

**賣家後台（管理流程）** — 詳見 [userguide.md 第 13 節](userguide.md#13-賣家後台--admin)

```
登入   → admin/login.html（Firebase Google；email 須在 admin_users 白名單，見 docs/seed/dev/021-admin-google-whitelist.example.sql）
後台   → admin/dashboard.html（預設載入第一個有 view 權限的模組）
         ├── 分析報表      ← Sidebar「分析報表」
         ├── 訂單管理      ← Sidebar「訂單管理」
         ├── 庫存異動紀錄  ← Sidebar「庫存異動紀錄」
         ├── 商品與庫存    ← Sidebar「商品與庫存」
         ├── 客戶管理      ← Sidebar「客戶管理」
         ├── 折扣管理      ← Sidebar「折扣管理」
         ├── 評論管理      ← Sidebar「評論管理」
         ├── 預約/租借管理 ← Sidebar「預約/租借管理」
         └── 權限管理      ← Sidebar「權限管理」
登出   → Sidebar 底部或 Topbar 頭像 → 登出（清除 5 個 sessionStorage key，返回登入頁）
```

> 💡 正式後台由 Firebase 保存登入狀態，ID Token 不寫入 Web Storage；`sessionStorage` 只快取管理員顯示資料與後端有效權限。只有 `AppConfig.ADMIN.USE_BACKEND=false` 的 Mock 模式才使用 `localStorage.adminEmployees`。

**預約系統（預約流程）**

```
搜尋   → booking/pages/camp-search.html（篩選地區、環境、設施）
詳情   → booking/pages/camp-detail.html（選日期、選營位類型，寫入 localStorage.bookingCart）
租借   → booking/pages/camp-rental.html（加選裝備，更新 bookingCart）
背包   → booking/pages/booking-cart.html（確認明細並建立 15 分鐘 Checkout Session）
結帳   → booking/pages/booking-checkout.html（填聯絡資訊並使用既有 Session 前往 ECPay）
說明   → booking/pages/rental-guide.html（租借流程圖文說明）
FAQ    → booking/pages/booking-faq.html（預約與退款常見問題）
```

搜尋頁已選擇的日期區間與入住人數會透過 `checkIn`、`checkOut`、`guests` 查詢參數帶入詳情頁，並預填詳情頁的日期與人數欄位。

> 💡 預約系統使用獨立的 `localStorage.bookingCart` 儲存跨頁資料，與電商購物車的 `localStorage.cart` 完全分離，互不干擾。

---

## 🎨 設計系統

### 色彩規範

| 用途           | 色碼      | 預覽               |
| -------------- | --------- | ------------------ |
| 主色 Primary   | `#244d4d` | 深青綠（品牌主軸） |
| 副色 Secondary | `#779999` | 淺青灰綠           |
| 成功 Success   | `#4caf50` | 綠色               |
| 危險 Danger    | `#d32f2f` | 紅色               |
| 輕背景         | `#f6fbf6` | 淺綠底             |
| 深 Hover       | `#316868` | 按鈕懸停           |

所有色彩定義於 `css/variables.scss`，並由 `main.css` 的 CSS Custom Properties 引入。

> 💡 **預約子系統色彩差異**：預約端 Header 背景使用 booking token，並由 `booking/css/settings/_tokens.scss` 管理 `--yc-*` source of truth 與 `--bk-*` 相容 alias；公開頁載入編譯後的 `booking/css/booking-main.css`。

### 響應式斷點（RWD）

| 斷點 | 寬度        | 目標裝置                |
| ---- | ----------- | ----------------------- |
| xs   | < 576px     | iPhone SE、小型 Android |
| sm   | 576–767px   | 大型手機                |
| md   | 768–991px   | iPad 直式               |
| lg   | 992–1199px  | iPad 橫式、筆電         |
| xl   | 1200–1399px | 桌上型電腦              |
| xxl  | ≥ 1400px    | 大型螢幕                |

**手機版特別處理**：

- Touch Target ≥ 44px（符合 Apple HIG 與 Material Design 規範）
- `input` / `select` 強制 `font-size: 16px` 避免 iOS Safari 頁面縮放
- Safe Area Inset 支援（iPhone 有 Home Bar 機型）
- Offcanvas 開啟時鎖定 body 捲動（iOS Safari 適配）
- Navbar Offcanvas 從左側滑入（`.navbar-offcanvas` 補齊 `position:fixed; transform:translateX(-100%)`，預設隱藏，點漢堡☰後滑入）

---

## 🔧 全局 API 速查

### 應用狀態（`js/state.js`）

```javascript
// 讀取
window.AppState.isLoggedIn; // Boolean - 是否已登入
window.AppState.currentUser; // Object  - 當前用戶資料
window.AppState.cart; // Array   - 購物車商品列表
window.AppState.preferences; // Object  - 個人化喜好

// 持久化（寫入 localStorage）
window.saveAppState();

// 重置（只清除 Yuruicamp 已知狀態 key，不清空同網域其他資料）
window.resetAppState();
```

### Mock API（`window.API`）

```javascript
// 商品
await window.API.products.getAll(filters); // 取得商品列表（支援篩選）
await window.API.products.getById(productId); // 取得單一商品詳情

// 用戶
await window.API.users.login(email, password); // 模擬登入
await window.API.users.getProfile(userId); // 取得用戶資料

// 訂單
await window.API.orders.getAll(userId); // 取得用戶訂單列表
await window.API.orders.create(orderData); // 建立訂單（模擬）

// 文章
await window.API.articles.getAll(); // 取得文章列表
await window.API.articles.getById(articleId); // 取得文章詳情

// 分店
await window.API.branches.getAll(); // 取得分店列表
```

> 💡 日後接入真實後端只需修改 `js/api-mock.js` 的實作，頁面邏輯無需改動。

### UI 元件函數

```javascript
// Toast 提示
window.showToast(message, type);
// type: 'success' | 'error' | 'warning' | 'info'
// 範例：window.showToast('已加入購物車', 'success')

// Modal 對話框
window.openModal(modalId); // 開啟 Modal
window.closeModal(modalId); // 關閉 Modal
// 範例：window.openModal('loginModal')

// 購物車操作
window.addToCart(product, quantity); // 加入購物車
window.removeFromCart(productId); // 移除商品
window.updateCartQuantity(productId, qty); // 更新數量
window.clearCart(); // 清空購物車
window.openCartDrawer(); // 開啟右側購物車視窗
window.closeCartDrawer(); // 關閉右側購物車視窗
window.renderCartDrawer(); // 依 AppState.cart 重繪 Drawer
```

### 工具函數（`formatters.js` / `validators.js` / `cart-service.js`）

```javascript
window.formatCurrency(3500); // → 'NT$3,500'
window.formatDate("2026-06-03"); // → '2026/06/03'
window.generateId(); // → 'id-1748922345-abc123xyz'
window.isValidEmail("a@b.com"); // → true / false
window.isValidPhone("0912345678"); // → true / false
window.calculateCartTotal(); // → Number（購物車總金額）
window.calculateShippingFee(total); // → 0 或 60（依免運門檻）
window.debounce(fn, 300); // 防抖（搜尋框使用）
window.throttle(fn, 100); // 節流（滾動事件使用）
```

---

## 🗄️ localStorage 結構

| 鍵                     | 型別          | 說明                                                                      |
| ---------------------- | ------------- | ------------------------------------------------------------------------- |
| `isLoggedIn`           | Boolean       | 登入狀態                                                                  |
| `currentUser`          | Object / null | 當前用戶資料                                                              |
| `cart`                 | Array         | 電商購物車商品（`[{id, name, price, quantity, ...}]`）                    |
| `preferences`          | Object        | 個人化問卷結果（風格偏好、裝備需求）                                      |
| `theme`                | String        | 主題（預留，目前固定 `'light'`）                                          |
| `memberProfile`        | Object        | 會員中心儲存的個人資料                                                    |
| `bookingCart`          | Object        | 預約購物車（`{booking_info, selected_zones, selected_rentals, summary}`） |
| `mockCheckoutSessions` | Array         | 契約化 Checkout Mock Session 與內部冪等資料                               |
| `adminEmployees`       | Array         | 僅 Mock 後台使用的員工與逐頁權限種子；正式 Backend 模式不讀取             |

> ⚠️ `cart`（電商）與 `bookingCart`（預約）是兩個**完全獨立**的 localStorage key，互不干擾。

> `resetAppState()` 只移除 Yuruicamp 已知狀態，包含 `mockOrders` 與 `mockCheckoutSessions`；不使用 `localStorage.clear()`，避免誤刪同網域其他專案資料。

### sessionStorage 結構

商城 Checkout：

| 鍵                         | 型別   | 說明                      |
| -------------------------- | ------ | ------------------------- |
| `checkoutIdempotencyKey`   | String | 建立 Checkout 使用的 UUID |
| `checkoutCartFingerprint`  | String | 購物車規格與數量指紋      |
| `checkoutCompletedOrderId` | String | 建立成功的後端訂單 ID     |
| `checkoutFormDraft`        | JSON   | 同一分頁的結帳表單草稿；綁定會員、購物車與訂單 |

後台：

| 鍵                 | 型別   | 說明                                      |
| ------------------ | ------ | ----------------------------------------- |
| `adminLoggedIn`    | String | `"true"` 表示已登入                       |
| `adminId`          | String | 員工 ID（例：`"01"`）                     |
| `adminName`        | String | 顯示名稱                                  |
| `isSuperAdmin`     | String | `"true"` / `"false"`                      |
| `adminPermissions` | String | JSON 字串，各 section 的 `{ view, edit }` |

---

## ⚡ 效能優化（第 14 階段）

所有頁面已套用以下最佳化措施：

- **`<link rel="preconnect">`**：所有 HTML 預先與外部圖片伺服器建立連線，減少 DNS 查詢延遲
- **`<script defer>`**：所有 JS 延遲載入，不阻塞 HTML 解析與首屏渲染
- **`loading="lazy"`**：非首屏圖片懶加載，減少初始請求數
- **Lazy Loading Fallback**：不支援原生 lazy 的舊瀏覽器，自動切換 `IntersectionObserver` 模擬
- **`<meta name="theme-color">`**：手機瀏覽器狀態列顯示品牌綠色 `#244d4d`
- **`will-change`**：動畫元素預先通知瀏覽器 GPU 合成，動畫更流暢
- **CSS Containment**：商品卡與部落格卡設定 `contain: layout style`，限制重排範圍
- **`@media (prefers-reduced-motion)`**：尊重使用者「減少動態效果」的無障礙偏好
- **`@media print`**：列印樣式隱藏導航、影片、Toast 等非必要元素

---

## 🌐 瀏覽器相容性（第 14 階段）

| 瀏覽器           | 最低版本 | 說明                                                 |
| ---------------- | -------- | ---------------------------------------------------- |
| Chrome / Edge    | 90+      | 完整支援                                             |
| Firefox          | 88+      | 完整支援                                             |
| Safari           | 14+      | 已加入 `-webkit-` 前綴、iOS 縮放修正、Safe Area 支援 |
| Samsung Internet | 14+      | 基於 Chromium，完整支援                              |

**已處理的相容性問題**：

- Flexbox / Transform `-webkit-` vendor prefix
- CSS Grid fallback（不支援 Grid 的瀏覽器改用 Flex）
- `select` 下拉箭頭 Safari 樣式修正
- `appearance: none` 跨瀏覽器表單樣式統一
- `scroll-behavior: smooth` 降級處理

---

## 🔐 後端接入指南

Mock API 採用適配器模式。切換真後端時，頁面仍呼叫 `window.API`／`BookingAPI`／`AdminAPI`，Token 與 REST 細節統一交給 `api-client.js`。

**目前（Mock）**：

```javascript
// js/api-mock.js 內部從 JSON 檔讀取
window.API.products.getAll = async (filters) => {
  const data = await fetch("../data/products.json").then((r) => r.json());
  return data.filter(/* ... */);
};
```

**真實 API facade**：

```javascript
// facade 呼叫共用 REST 層，pages/*.js 不自行 fetch
window.API.products.getAll = async (filters) => {
  return window.ApiClient._restRequest("/products", {
    auth: "optional",
  });
};
```

Firebase 初始化後注入 Auth：

```javascript
window.AppAuth.configure({ auth: firebaseAuth });
```

本機 `dev:` Token 只能透過開發認證設定或 `AppAuth.configure()` 提供，不可寫死在 Checkout 頁面。API Base URL 設定在 `storefront/js/config.js`：

```javascript
window.AppConfig.API_BASE_URL = "http://localhost:8080/api";
```

- 商城頁：各 HTML 直接載入 `config.js`。
- 預約頁：一律透過 `booking/js/booking-core-scripts.js`（清單見 `booking/partials/booking-core-scripts.partial`）；說明文件：[`docs/frontend-specs/booking-shared-scripts.md`](./docs/frontend-specs/booking-shared-scripts.md)。

詳細規則與驗證步驟見 [`docs/frontend-specs/api/auth-rest-client.md`](./docs/frontend-specs/api/auth-rest-client.md)。

**合併 Firebase 進 main 後，協作者請先讀：**  
[`docs/frontend-specs/firebase-merge-into-main-notes.md`](./docs/frontend-specs/firebase-merge-into-main-notes.md)  
（正式入口是 `AppAuth`／`ApiClient`；Booking 共用腳本勿每頁手貼。）

**Firebase 主線已完成；Checkout／預約建單等業務債見：**  
[`plans/post-firebase-roadmap-checklist.md`](./plans/post-firebase-roadmap-checklist.md)

---

## 📦 關鍵數字

| 項目            | 買家前台                                               | 賣家後台                                 | 預約系統                 | 合計  |
| --------------- | ------------------------------------------------------ | ---------------------------------------- | ------------------------ | ----- |
| HTML 頁面       | 11 個                                                  | 2 個（login + dashboard）+ 9 個 partials | 6 個                     | 28 個 |
| JavaScript 模組 | 19 個（6 元件 + 10 頁面 + 3 核心）                     | 10 個（permissions + core + 8 功能）     | 5 個                     | 34 個 |
| CSS 檔案        | 1 個（main.css）                                       | 1 個（admin.css）                        | 1 個（booking-main.css） | 3 個  |
| Mock 資料 JSON  | 全站共用 `/data/**`（13 檔，見 `data-paths.js`）       | —                                        | —                        | 13 個 |
| RWD 斷點        | 6 個（xs / sm / md / lg / xl / xxl）                   | Bootstrap 5 斷點（同套）                 | 768px 主要斷點           | —     |
| 儲存機制        | localStorage（8 個鍵，含 bookingCart、adminEmployees） | sessionStorage（5 個 key）               | localStorage.bookingCart | —     |

---

## ✅ 品質工具與 Smoke Test

### 商品公開評論瀏覽

- 商品詳情頁支援評分分布、星等／照片篩選、最新／最高／最低排序與載入更多。
- 評論卡片顯示已購買標章，長內容可展開／收合，載入失敗可在評論區重試。
- 正式 API 為 `GET /api/products/{productId}/reviews`，分頁總數依目前篩選條件計算。
- 會員評價 Modal 支援字數提示、欄位驗證、送出中鎖定及重複評價／非本人訂單／訂單未完成的具體錯誤訊息。

### 訂單／預訂 Backend 顯示驗證（2026-07-22）

- Admin 訂單／預訂真實 API 的基準資料為 225／90 筆；訂單 1～222 可抽查與 `frontend/data` JSON Mock 的核心欄位一致，223～225 為 Firebase 測試會員固定訂單。
- 會員 U001 的預訂 API 可查到 `25`、`55`，列表／詳情契約測試通過。
- 會員訂單與預訂均已完成 Backend 模式 REST 分流；Payment、Booking Coupon 與其他 readiness 後續功能仍依各自契約推進。
- 目前可驗證範圍與未完成邊界統一記錄於 [`前端實際驗證總覽`](./docs/frontend-specs/test/README.md)。

> 以下指令請先 `cd frontend` 再執行（`package.json` 已不在 repo 根）。

| 指令                | 目的                                                                          |
| ------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`       | 啟動 Vite 開發伺服器，支援多頁面與 SCSS entry                                 |
| `npm run build`     | 使用 Vite 建置 HTML、JS、SCSS 與資產壓縮輸出                                  |
| `npm run lint`      | 以 ESLint 檢查主站與 booking JS 語法與基礎維護風險                            |
| `npm run format`    | 以 Prettier 檢查 HTML / CSS / SCSS / JS / JSON / Markdown 格式                |
| `npm run stylelint` | 以 Stylelint 檢查 SCSS 與 booking CSS                                         |
| `npm run smoke`     | 檢查共用 header/cart drawer、拆分 runtime 載入順序、Vite/tooling 檔案是否齊全 |

---

## 🗺️ 未來擴展方向

| 方向                 | 說明                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 接入真實後端（前台） | 修改 `js/api-mock.js` 的各函數實作，頁面邏輯零改動                                                                                                     |
| 擴充後台正式契約     | G-6 已正式接線；後續補 Reviews、會員標籤池、seller note 與租借商品寫入後，再解除 readiness gate                                                        |
| 後台操作日誌         | Firebase 登入與後端細 RBAC 已完成；跨模組完整審計紀錄與工程收尾見 [`backend-implementation-checklist.md`](./plans/backend-implementation-checklist.md) |
| 升級至 SPA           | 以 Vue 3 或 React 重構，可直接複用現有 CSS 設計系統與 JSON 資料                                                                                        |
| 加入數據分析         | 在 `main.js` 的 `initGlobalListeners()` 接入 GA4 / GTM 事件追蹤                                                                                        |
| 自動化測試           | 以 Playwright 或 Cypress 撰寫自動化測試腳本                                                                                                            |
| 深色模式             | `main.css` 已預留 `@media (prefers-color-scheme: dark)` 區塊                                                                                           |
| PWA                  | 加入 `manifest.json` 與 Service Worker 支援離線瀏覽                                                                                                    |

---

## 📞 品牌聯絡資訊

- **電話**：0800-123-456
- **信箱**：support@yuruicamp.com
- **地址**：台北市信義區信義路五段 100 號
- **LINE 客服**：右下角浮動按鈕（所有頁面均可使用）

---

---

**版本**：1.3.76  
**最後更新**：2026/07/06

> 完整更新紀錄請見 [changelog.md](changelog.md)
