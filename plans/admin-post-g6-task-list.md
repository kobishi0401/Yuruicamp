# Admin 模組（G-6 之後）待辦任務清單

| 欄位 | 內容 |
|------|------|
| **狀態** | Active（W1～W4 ✅；W4-04／05 ⏭️ 延後） |
| **日期** | 2026-07-25 |
| **前提** | 線 G-1～G-6 已完成；見 [`backend-implementation-checklist.md`](./backend-implementation-checklist.md) |
| **契約現況** | [`docs/api/admin-api-contract.md`](../docs/api/admin-api-contract.md) v0.23 |
| **Schema** | [`docs/latest_schema.sql`](../docs/latest_schema.sql) |
| **缺漏分析** | 本對話「Admin 模組缺漏分析報告」＋ HITL 問答定案 |
| **實作 Checklist 資料夾** | [`admin-post-g6/`](./admin-post-g6/README.md)（每個 ADM-W* 一份可勾選步驟） |

> **勾選規則**：契約寫死 → 實作 → 驗收通過後再打勾。  
> **改約流程**：改契約升版 → 後端 DTO／OpenAPI → 前端 facade／readiness → 驗收。禁止只改一邊。  
> **本文件**：需求／波次／依賴／DoD 摘要（規劃視角）。  
> **細步驟**：請到 [`admin-post-g6/`](./admin-post-g6/README.md) 對應檔案勾選（契約→Schema→後端→前端→測試→收尾）。

---

## 0. 需求定案摘要（HITL）

| # | 議題 | 定案 |
|---|------|------|
| 1 | 範圍 | **C**：盡量全收（含 P2／P3 主檔與內容） |
| 2 | 線 D 依賴項 | **進 Admin 清單**，標 `Blocked by 線 D`，排在付款之後 |
| 3 | 賣家備註 | **`orders`／`bookings` 主檔加 `internal_note`**，可 PATCH 覆蓋 |
| 4 | 會員標籤 | **標籤池 CRUD + 對會員 assign／unassign** |
| 5 | Reviews | **列表＋詳情＋刪除整則**；不做回覆、不做軟隱藏 |
| 6 | 租借寫入 | **完整**：SKU／規格／營區 listing＋裝備規格／標籤 |
| 7 | 跨領域庫存 | **完整成對轉換 API**（建立／過帳／冪等） |
| 8 | 會員擴充 | **可編預設地址／偏好**；**不**代建會員 |
| 9 | 主檔順序 | `K1>K2>K9>K3>K4>K5>K6>K7>K8>K10>K11`（見 W2／W4） |
| 10 | 庫存 draft 明細 | **維持只能新增**；打錯整單 cancel |
| 11 | 取消／退款第一版 | **O1＋O3＋B1**（不做 O2 退貨） |
| 12 | 交付波次 | **W1→W2→W3→W4**（如下） |

### 刻意不做（本清單排除）

| 項目 | 原因 |
|------|------|
| 管理員代建會員 | 會員一律 OAuth 自註冊 |
| Reviews 回覆／軟隱藏 | 需額外 Schema；本季不做 |
| 訂單退貨 O2（`returned`） | 規則複雜，留第二波另開 |
| 庫存 draft 單行刪改 | 維持作廢重開，降低稽核複雜度 |
| 任意 PATCH 訂單／預約狀態 | 一律語意化命令＋狀態機 |

---

## 1. 波次總覽

```text
W1 P0  營運半套補齊（備註／標籤／地址偏好／評論刪除／低庫存）
  ↓
W2 P1  目錄與庫存進階（分類品牌／租借寫入／跨領域轉換／庫位門市）
  ↓
W3 P1  付款後例外流程（Gate ✅；取消／退款可開工）
  ↓
W4 P2～P3  主檔與內容基建（營區營位／假日／文章／上傳／報表 API）
```

| 波次 | Priority | 目標（給新手） | 狀態 |
|------|----------|----------------|------|
| **W1** | P0 | 後台「看得見、寫得了」的日常客服缺口 | ✅ |
| **W2** | P1 | 可持續上架租借／調撥商店↔租借、維護商品維度主檔 | ✅ |
| **W3** | P1 | 付款成功後的取消與退款閉環 | ✅ |
| **W4** | P2～P3 | 少改 SQL、內容與報表可營運化 | ✅（04／05 延後） |

### 跨波次硬依賴（請先記住）

| 依賴 | 說明 |
|------|------|
| **線 D（Payment）** | W3 全部任務開工前，至少要有：ECPay notify 冪等、paid 真相、退款／取消與金流對齊的契約 |
| **G-3 庫存異動** | 跨領域轉換建立在同領域過帳規則之上；**商城** on-hand 可經 W2-08 Products 寫入；**租借** on-hand 仍只經異動／conversion／rental transfer |
| **G-2c 商城商品** | 分類／品牌 Admin CRUD 是「lookup 可新增來源」；商品 API 本身已完成 |
| **契約先於程式** | 每一任務建議拆「契約／Schema」子步驟，再實作 |

---

## 2. W1 — P0 營運半套補齊

> 目標：拿掉 readiness 對「客服每天會用到」功能的封鎖，且不依賴線 D。

### ADM-W1-01　訂單／預約賣家備註（`internal_note`）

> 實作 Checklist：[`admin-post-g6/w1/ADM-W1-01-internal-note.md`](./admin-post-g6/w1/ADM-W1-01-internal-note.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P0 |
| **來源** | M3／F1 |
| **Dependencies** | 無（可立即開工）；Schema 變更見 [`backend-schema-change-checklist.md`](./backend-schema-change-checklist.md) |
| **為什麼需要** | 客服／倉儲要記「已電聯、延後出貨」等資訊；這些**不是**履約狀態。現有 `*_status_history.note` 只在 ship／complete 當下寫入，不能當常駐備註。 |
| **資料流向** | Admin 開詳情 → `PATCH` 只改 `internal_note` → 寫入 `orders` 或 `bookings` 主檔 → 詳情 GET 帶回；**不**改 `status`／`payment_status`。 |
| **關聯** | G-2b Orders／Bookings；前端 `orders.sellerNote`／`bookings.sellerNote` readiness 可改為就緒。 |
| **建議子步驟** | ① Schema 加可空 `internal_note`（orders、bookings）② 升版 Admin 契約（語意化 PATCH 或 `PATCH .../note`）③ 後端＋RBAC（`orders.edit`／`bookings.edit`）④ 前端解除 gate、成功後才更新 UI |
| **DoD** | [x] 契約升版 [x] Schema／validate 通過 [x] 可讀可寫、無權限 403 [x] 不影響 ship／complete [x] readiness 關閉 `orders.sellerNote`／`bookings.sellerNote` 封鎖 [x] 整合或手動驗收記錄 |

---

### ADM-W1-02　會員標籤池 CRUD

> 實作 Checklist：[`admin-post-g6/w1/ADM-W1-02-customer-tag-pool.md`](./admin-post-g6/w1/ADM-W1-02-customer-tag-pool.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P0 |
| **來源** | M2（池） |
| **Dependencies** | 無 |
| **為什麼需要** | 列表已能用 `tagId` 篩選，但標籤字典只能靠 seed；營運無法自管名稱／顏色／啟停。 |
| **資料流向** | Admin → `customer_tags`（name／color／sort_order／active）→ 列表篩選與詳情 tags 讀取沿用現有讀模型。 |
| **關聯** | G-2a Customers 唯讀 tags；權限建議沿用 `customers.edit`（或另立 `customers.tags`——若另立需先改 permissions seed）。**建議先沿用 `customers.edit`**，減少 RBAC 擴散。 |
| **建議子步驟** | ① 契約：`/api/admin/customer-tags` 或 `/tag-pool`（與前端命名對齊並寫進契約）② CRUD＋名稱唯一 ③ 刪除策略：有 assignment 時 409 或僅允許 `active=false`（**建議：有指派則禁硬刪，改停用**） |
| **DoD** | [x] 契約 [x] CRUD＋安全刪除／停用 [x] RBAC [x] 前端標籤池可維護 [x] PostgreSQL 或文件化手動驗收 |

---

### ADM-W1-03　會員標籤指派／取消指派

> 實作 Checklist：[`admin-post-g6/w1/ADM-W1-03-customer-tag-assign.md`](./admin-post-g6/w1/ADM-W1-03-customer-tag-assign.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P0 |
| **來源** | M2（指派） |
| **Dependencies** | **ADM-W1-02**（池要先存在；或至少能指派既有 seed 標籤，但完整驗收應在池完成後） |
| **為什麼需要** | 只有池沒有指派，營運仍無法把「VIP」掛到某人身上。 |
| **資料流向** | Admin 選會員 → 寫入／刪除 `customer_tag_assignments` → 列表篩選與詳情 tags 立即反映。 |
| **關聯** | G-2a 兩段式列表（tag 篩選已存在）；勿在列表 JOIN 放大分頁。 |
| **建議子步驟** | ① 契約：`PUT/PATCH` 完整 tagId 集合，或 `POST/DELETE .../tags/{tagId}`（**建議：詳情用「完整集合取代」較不易殘留**）② 只能指派 `active=true` 標籤 ③ 前端 Customers 解除「標籤只讀」 |
| **DoD** | [x] 指派／取消正確 [x] 非 active 標籤不可新掛 [x] 列表 `tagId` 篩選仍正確 [x] readiness `customers.tagAssign` 寫入就緒 |

---

### ADM-W1-04　會員預設地址可編輯

> 實作 Checklist：[`admin-post-g6/w1/ADM-W1-04-customer-address.md`](./admin-post-g6/w1/ADM-W1-04-customer-address.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P0 |
| **來源** | M12 定案 B |
| **Dependencies** | 無（G-2a 已能唯讀預設地址） |
| **為什麼需要** | 客服常需幫客人改預設收件資料；目前只能看不能改。 |
| **資料流向** | Admin → 更新會員預設地址表（既有 shipping address 結構）→ 詳情重讀。**已成立訂單的 snapshot 地址不得被此 API 改寫。** |
| **關聯** | Checkout 之後新單才吃新預設地址；與 Order snapshot 分離是正確設計。 |
| **建議子步驟** | ① 契約寫清可寫欄位 ② 驗證電話／必填 ③ 前端打開地址編輯，成功後刷新詳情 |
| **DoD** | [x] 可更新預設地址 [x] 舊訂單詳情地址不變 [x] RBAC `customers.edit` [x] readiness `customers.defaultAddress` [x] 前端驗收 [x] PostgreSQL 或文件化手動驗收 |

---

### ADM-W1-05　會員偏好可編輯

> 實作 Checklist：[`admin-post-g6/w1/ADM-W1-05-customer-preferences.md`](./admin-post-g6/w1/ADM-W1-05-customer-preferences.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P0 |
| **來源** | M12 定案 B |
| **Dependencies** | 無；可與 ADM-W1-04 同迭代，但建議**分開契約段落**方便驗收 |
| **為什麼需要** | 偏好來自問卷／營運標註，應可由後台校正。 |
| **資料流向** | Admin → 寫入會員與 `preference_options` 的關聯（僅允許 active options）→ 詳情重讀。 |
| **關聯** | `preference_options` 主檔本季若不做 Admin CRUD，則只能從既有選項中勾選（可接受）。 |
| **DoD** | [x] 可更新偏好集合 [x] 非法／inactive optionId → 400 [x] RBAC `customers.edit`／lookup `customers.view` [x] readiness `customers.preferences` [x] 前端驗收 [x] PostgreSQL 或文件化手動驗收 |

---

### ADM-W1-06　Reviews 列表／詳情／刪除

> 實作 Checklist：[`admin-post-g6/w1/ADM-W1-06-reviews.md`](./admin-post-g6/w1/ADM-W1-06-reviews.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P0 |
| **來源** | M1；定案 A |
| **Dependencies** | 無硬依賴；**資料量**依賴 seed／未來會員評價寫入（線 H）。即使資料少，API 仍應先就緒並打開 Sidebar。 |
| **為什麼需要** | 權限碼與 UI 已有「評論管理」，但整模組被 readiness 封鎖；需能下架不當內容。 |
| **資料流向** | 讀：`reviews`＋`order_items`＋訂單／會員（可重用 `review_dto_view` 概念）→ Admin 列表／詳情。刪：刪 `review_photos` 後刪 `reviews`（或依 FK 策略）；**硬刪整則**，不做 reply。 |
| **關聯** | `reviews.view`／`reviews.edit`；公開評價讀取屬線 H，可稍後對齊同一讀模型。 |
| **建議子步驟** | ① 契約寫進 admin-api-contract ② GET list／get、DELETE ③ 打開 Reviews readiness ④ 前端接線（勿再 `unsupported`） |
| **風險** | Seed 可能幾乎沒有 verified review → 驗收需準備最少 fixture。 |
| **DoD** | [x] 契約 [x] 列表分頁／篩選（至少依 product／rating／日期擇一） [x] 刪除後公開若已接線則不可見 [x] Sidebar 不再「未接」 [x] RBAC 測試 |

---

### ADM-W1-07　最低庫存閾值（min-stock）API

> 實作 Checklist：[`admin-post-g6/w1/ADM-W1-07-min-stock.md`](./admin-post-g6/w1/ADM-W1-07-min-stock.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P0 |
| **來源** | M11／K9 |
| **Dependencies** | 無（表已存在：`product_variant_min_stocks`、`rental_sku_variant_min_stocks`） |
| **為什麼需要** | 前端商品頁有低庫存編輯 UX，正式後端無法持久化。 |
| **資料流向** | Admin 設定（variant × location → minimum）→ 存 min-stock 表 → 前端警示用；**不**改 `on_hand`。 |
| **關聯** | G-2c 庫存唯讀、G-3 異動；Analytics／補貨提示可之後吃同一資料。 |
| **DoD** | [x] 契約（store／rental 分開或統一 domain 欄位） [x] 讀寫 API＋RBAC（`products.view`／`products.edit`） [x] readiness `products.minStock` [x] 前端改打後端 [x] PostgreSQL 或文件化手動驗收 |

---

### W1 完成門檻（波次 DoD）

- [x] W1 七項皆勾選  
- [x] `admin-api-contract` 升版並更新 [`docs/api/README.md`](../docs/api/README.md)（目前 v0.15）  
- [x] G-6 readiness：備註／標籤池／指派／地址／偏好／min-stock／Reviews 已就緒  
- [x] `npm run test:admin-g6`（或後續同等）與關鍵後端測試通過（已完成項）  

---

## 3. W2 — P1 目錄與庫存進階

> 目標：營運可自己開品牌／分類、維護租借目錄，並把商店貨轉成租借貨。

### ADM-W2-01　分類主檔 CRUD（K1）

> 實作 Checklist：[`admin-post-g6/w2/ADM-W2-01-categories.md`](./admin-post-g6/w2/ADM-W2-01-categories.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P1 |
| **Dependencies** | W1 建議完成但非硬鎖；**硬依賴無** |
| **為什麼需要** | Admin Products 建立依賴 `categoryId` lookup；不能新增分類就無法長期上架。 |
| **資料流向** | Admin → `categories` → Products lookups／建立商品引用。 |
| **注意** | 已被商品引用的分類：禁硬刪或僅停用（契約寫死）。 |
| **DoD** | [x] CRUD＋安全刪除 [x] lookups 自動出現新分類 [x] RBAC（建議 `products.edit`） |

---

### ADM-W2-02　品牌主檔 CRUD（K2）

> 實作 Checklist：[`admin-post-g6/w2/ADM-W2-02-brands.md`](./admin-post-g6/w2/ADM-W2-02-brands.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P1 |
| **Dependencies** | 可緊接或與 ADM-W2-01 同 PR 切片；**建議 01 先於 02 僅為驗收單純** |
| **為什麼需要** | 同分類。 |
| **資料流向** | Admin → `brands` → Products lookups。 |
| **DoD** | [x] 同 ADM-W2-01 精神（CRUD＋安全刪除＋lookups＋RBAC） |

---

### ADM-W2-03　租借目錄寫入 — SKU／規格（方案 C 前半）

> 實作 Checklist：[`admin-post-g6/w2/ADM-W2-03-rental-skus.md`](./admin-post-g6/w2/ADM-W2-03-rental-skus.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P1 |
| **Dependencies** | **建議先有 ADM-W2-01／02**（若租借也掛分類／品牌經 `equipment_items`）；G-2c 裝備主檔建立模式可參考 |
| **為什麼需要** | 商城商品可寫、租借不可寫；預約可租清單會僵死在 seed。 |
| **資料流向** | Admin → `equipment_items`（可新建或重用）→ `rental_skus` → `rental_sku_variants`（active／inactive）→ **租借庫存數量仍只經 G-3 rental 異動／W2-05 conversion**。 |
| **關聯** | 前端 `AdminAPI.rentals`；readiness `products.rentalWrite`。 |
| **DoD** | [x] 契約（獨立 `/api/admin/rentals`） [x] 建立／更新／上下架規格 [x] SKU 唯一 [x] 不接受直接寫 on-hand [x] 前端解除 gate |

---

### ADM-W2-04　租借 listing（營區定價）＋裝備規格／標籤（方案 C 後半）

> 實作 Checklist：[`admin-post-g6/w2/ADM-W2-04-rental-listings.md`](./admin-post-g6/w2/ADM-W2-04-rental-listings.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P1 |
| **Dependencies** | **ADM-W2-03**；營區需已存在（seed 可先撐；新營區靠 W4 的 K5） |
| **為什麼需要** | 沒有 `rental_listings` 就無法把規格賣到特定營區與日租價。裝備規格／標籤影響前台展示與篩選一致性。 |
| **資料流向** | Admin → `rental_listings`（campground × variant × price × active）→ Booking 公開讀 equipment。同步維護 `equipment_specifications`／`equipment_tags`（與商城共用裝備主檔時要避免兩邊互相覆蓋，契約需定義「依 itemId 更新」）。 |
| **DoD** | [x] listing CRUD [x] 公開 booking equipment 看得到變更 [x] 規格／標籤：後端 API 可用；**Admin Modal 刻意不做（W2 定案接受）** [x] `products.rentalWrite` 全就緒 |

---

### ADM-W2-05　跨領域庫存轉換（完整成對 API）

> 實作 Checklist：[`admin-post-g6/w2/ADM-W2-05-inventory-conversion.md`](./admin-post-g6/w2/ADM-W2-05-inventory-conversion.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P1 |
| **Dependencies** | **G-3**；**建議 ADM-W2-03**（目的端 rental variant 要存在）；**建議 ADM-W2-06 庫位**若需新庫位（否則用 seed 庫位可先驗收） |
| **為什麼需要** | 同一實體貨要從「可賣」轉「可租」；Schema 已有 `inventory_conversions`，G-3 刻意未開放。 |
| **資料流向（概念）** | 一筆業務轉換 → 同交易建立 store `conversion_out`＋rental `conversion_in` 兩張異動（或 draft 後一次過帳）→ 寫 `inventory_conversions` 綁定＋冪等鍵 → 過帳時兩邊庫存一併變更；失敗整筆 rollback。 |
| **關聯** | 不可負庫、不可低於 active 保留；posted 不可改。 |
| **DoD** | [x] 契約升版（含錯誤碼） [x] 建立／過帳／重送冪等 [x] 併發與不足庫存 409 [x] 前端調撥／轉換 UI 接真 API [x] PostgreSQL 整合測試 |

---

### ADM-W2-06　庫位主檔 CRUD（K3）

> 實作 Checklist：[`admin-post-g6/w2/ADM-W2-06-inventory-locations.md`](./admin-post-g6/w2/ADM-W2-06-inventory-locations.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P1 |
| **Dependencies** | 無硬鎖；與轉換／異動 lookups 互補 |
| **為什麼需要** | 新倉庫／營區庫位不能永遠靠 SQL。 |
| **資料流向** | Admin → `inventory_locations`（domain=store｜rental、type、active、可選 branch 關聯）→ movement lookups。 |
| **注意** | 停用庫位：禁止新保留／新異動指向它；既有庫存需先調撥清零（契約寫規則）。 |
| **DoD** | [x] CRUD＋啟停規則 [x] lookups 只回 active（或含 inactive 需標示） |

---

### ADM-W2-07　門市主檔 CRUD（K4）

> 實作 Checklist：[`admin-post-g6/w2/ADM-W2-07-branches.md`](./admin-post-g6/w2/ADM-W2-07-branches.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P1 |
| **Dependencies** | 可接在 K3 後（門市常對應商店庫位／取貨） |
| **為什麼需要** | Checkout 取貨、庫位 `branch_id`、公開 branches 讀取的資料來源。 |
| **資料流向** | Admin → `branches` → 公開 `GET /api/branches` 與訂單 pickup 外鍵。 |
| **DoD** | [x] CRUD＋安全停用 [x] 公開讀與後台一致 |

---

### ADM-W2-08　商品寫商城庫存＋異動稽核（追加切片）

> 實作 Checklist：[`admin-post-g6/w2/ADM-W2-08-product-stock-update.md`](./admin-post-g6/w2/ADM-W2-08-product-stock-update.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P1（追加） |
| **Dependencies** | G-2c、G-3；W2-05 conversion／rental transfer 維持例外 |
| **為什麼需要** | 翻轉「商城 on-hand 只能經異動單」；商品 Modal 可寫分店庫存，異動頁改以 `product_stock_update` 做稽核定稿。 |
| **DoD** | [x] 契約 v0.17／方案 B [x] Products `stockLocations` [x] 稽核單 post 不改 on_hand [x] 手動驗收通過 |

---

### W2 完成門檻

- [x] W2 七項皆勾選（另含追加 **ADM-W2-08**）  
- [x] 租借可從後台完整上架到至少一個營區並被 booking 公開讀看到  
- [x] 至少一筆 store→rental 轉換過帳整合測試通過  
- [x] 契約與 readiness 更新  
- [x] UI follow-up 手動驗收：上架＋store→rental＋營地互轉（[`W2-ui-followups.md`](./admin-post-g6/w2/W2-ui-followups.md)）  

> **✅ W2 UI follow-up 已完成**（原刻意延後項已遷移並手動驗收）  
> 專檔：[`admin-post-g6/w2/W2-ui-followups.md`](./admin-post-g6/w2/W2-ui-followups.md)

---

## 4. W3 — P1 付款後例外流程（Gate ✅；可開工）

> **開工條件（Gate）**：線 D「paid 真相＋notify 冪等」＋ Payment 契約取消／退款／券規則已定案。  
> **2026-07-25**：[`ADM-W3-00`](./admin-post-g6/w3/ADM-W3-00-payment-gate.md) ✅；綠界退款 HTTP 仍屬 W3-02 實作。

### 線 D Gate 檢查清單（不是 Admin 實作項，但是 W3 前置）

> 實作 Checklist：[`admin-post-g6/w3/ADM-W3-00-payment-gate.md`](./admin-post-g6/w3/ADM-W3-00-payment-gate.md)

- [x] D：ECPay 付款成功寫入 `payment_status=paid`（訂單／預約）  
- [x] D：notify 冪等  
- [x] D：退款或取消與金流的官方步驟已定案（契約 §7）  
- [x] D：優惠券 `consumed` 與取消／退款是否回滾的規則已定案（契約 §7.4）  

---

### ADM-W3-01　訂單未出貨取消（O1）

> 實作 Checklist：[`admin-post-g6/w3/ADM-W3-01-order-cancel.md`](./admin-post-g6/w3/ADM-W3-01-order-cancel.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P1 |
| **Dependencies** | **Gate ✅**；既有 G-2b；庫存釋放需對齊 Checkout／reservation 規則 |
| **為什麼需要** | 已付款但未出貨時，客服需取消並釋放庫存；不能只改 status 字串。 |
| **資料流向** | Admin `POST .../cancel`（名稱以契約為準）→ 悲觀鎖訂單 → 僅允許 `unshipped`＋允許的付款／退款前置條件 → `cancelled`＋history → 釋放 active `product_stock_reservations`（或依已扣庫策略回補）→ 觸發退款流程（見 W3-02）或標記待退款。 |
| **注意** | COD unpaid 取消 vs 線上 paid 取消規則分開寫。會員 Checkout cancel 只覆蓋未付款場景，不取代本命令。 |
| **DoD** | [x] 契約狀態機 [x] 庫存／保留正確 [x] 冪等 [x] RBAC [x] 整合測試 |

---

### ADM-W3-02　訂單退款狀態推進（O3）

> 實作 Checklist：[`admin-post-g6/w3/ADM-W3-02-order-refund.md`](./admin-post-g6/w3/ADM-W3-02-order-refund.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P1 |
| **Dependencies** | **Gate ✅**；常與 ADM-W3-01 同一業務交易或緊接呼叫 |
| **為什麼需要** | DB 已有完整 `refund_status` ENUM，但 Admin 不能推進；金流與帳務會對不上。 |
| **資料流向** | 退款請求 → 更新 `refund_status`＋`order_event_history` → 呼叫 Payment 退款埠（ECPay）→ 成功則 `payment_status=refunded`／`refund_status=refunded`。Admin **不**偽造綠界結果。 |
| **不做** | O2 退貨（`returned`）本波不做。 |
| **DoD** | [x] 契約與 Payment 契約交叉引用 [x] 非法轉換 409 [x] 事件歷程可查 [x] 與取消命令整合驗收（本波＝cancel 同交易全額退款） |

---

### ADM-W3-03　預約已付款取消（B1）

> 實作 Checklist：[`admin-post-g6/w3/ADM-W3-03-booking-cancel.md`](./admin-post-g6/w3/ADM-W3-03-booking-cancel.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P1 |
| **Dependencies** | **Gate ✅**；E-6 會員未付款取消可參考釋放邏輯，但已付款路徑不同 |
| **為什麼需要** | 客人取消已付款行程：需釋放營位占用、租借保留，並走退款。 |
| **資料流向** | Admin 取消命令 → 鎖 booking → 允許的 status／payment 組合 → `cancelled`＋history → 釋放 zone 占用與 rental reservations → 觸發退款（對齊 Payment）。 |
| **關聯** | 不得讓 Admin 直接把 unpaid 改 paid；退款真相在 Payment。 |
| **DoD** | [x] 契約 [x] 釋放正確且冪等 [x] 與退款連動 [x] 整合測試 [x] 前端 Bookings 操作接線 |

---

### W3 完成門檻

- [x] 線 D Gate 全勾  
- [x] O1／O3／B1 皆驗收  
- [x] 明確文件寫「O2 退貨不在本波」  
- [x] Admin 契約升版（v0.19）＋Payment v0.3  

---

## 5. W4 — P2～P3 主檔與內容基建

> 目標：減少工程師改 SQL；內容與報表可營運。可與 W2 尾段平行，但優先級低於 W1～W3。

### ADM-W4-01　營區主檔 CRUD（K5）

> 實作 Checklist：[`admin-post-g6/w4/ADM-W4-01-campgrounds.md`](./admin-post-g6/w4/ADM-W4-01-campgrounds.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P2 |
| **Dependencies** | 無硬鎖；**利於** W2 listing 擴新營區 |
| **為什麼需要** | 公休、listing、預約都掛 campground。 |
| **資料流向** | Admin → `campgrounds` → 公開 booking／closures。 |
| **DoD** | [x] CRUD＋啟停 [x] 公開讀一致 |

---

### ADM-W4-02　營位／區域主檔 CRUD（K6）

> 實作 Checklist：[`admin-post-g6/w4/ADM-W4-02-zones.md`](./admin-post-g6/w4/ADM-W4-02-zones.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P2 |
| **Dependencies** | **ADM-W4-01** |
| **為什麼需要** | 容量與可訂性不能只靠 seed。 |
| **資料流向** | Admin → zones（或專案內對應表）→ availability／checkout。 |
| **注意** | 改容量不得讓已占用的 pending／confirmed 預約變成「幽靈超訂」——契約需定義是否允許降容量低於已占用。 |
| **DoD** | [x] CRUD [x] 與 check-availability 行為文件化並驗收 |

---

### ADM-W4-03　假日曆 `calendar_dates`（K7）

> 實作 Checklist：[`admin-post-g6/w4/ADM-W4-03-calendar-dates.md`](./admin-post-g6/w4/ADM-W4-03-calendar-dates.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P2 |
| **Dependencies** | 對齊架構書線 H／P2；Booking 計價讀假日 |
| **為什麼需要** | 公休 ≠ 假日價；沒有後台假日曆就只能改 DB。 |
| **資料流向** | Admin → `calendar_dates` → Booking 日曆計價 weekday／holiday。 |
| **DoD** | [x] 契約 `GET/PUT/DELETE` [x] 計價整合驗收（IT holidayCount） |

---

### ADM-W4-04　文章 Admin API（K8）

> 實作 Checklist：[`admin-post-g6/w4/ADM-W4-04-articles.md`](./admin-post-g6/w4/ADM-W4-04-articles.md)  
> **狀態：⏭️ 延後（靜態 JSON）**

| 欄位 | 內容 |
|------|------|
| **Priority** | P2 |
| **Dependencies** | 可與線 H 公開讀一起規劃；Admin 寫、公開讀可分兩任務 |
| **為什麼需要** | 內容營運。 |
| **資料流向** | Admin → `articles`（draft／published／archived）→ 公開 `GET /api/articles`（若尚未實作則本任務含公開讀或另開 H 任務並互列依賴）。 |
| **DoD** | ⏭️ 現階段不做；維持 `articles.json` |

---

### ADM-W4-05　圖檔上傳 Cloud Storage（K10）

> 實作 Checklist：[`admin-post-g6/w4/ADM-W4-05-image-upload.md`](./admin-post-g6/w4/ADM-W4-05-image-upload.md)  
> **狀態：⏭️ 延後（GCP 部署後）；商品圖先貼 URL**

| 欄位 | 內容 |
|------|------|
| **Priority** | P3 |
| **Dependencies** | 線 J／GCP 基礎；可先於正式環境用簽名 URL 方案 |
| **為什麼需要** | G-2c 只接受既有 URL；營運需要上傳。 |
| **資料流向** | Admin 選檔 → 後端發上傳憑證或代傳 → 回傳 URL → 既有 Products／Articles 圖片欄位引用。 |
| **DoD** | ⏭️ 現階段不做上傳 API |

---

### ADM-W4-06　Analytics 專用彙總 API（K11）

> 實作 Checklist：[`admin-post-g6/w4/ADM-W4-06-analytics-api.md`](./admin-post-g6/w4/ADM-W4-06-analytics-api.md)  
> **Spec（ready-for-agent）：** [`ADM-W4-06-analytics-api-spec.md`](./admin-post-g6/w4/ADM-W4-06-analytics-api-spec.md)

| 欄位 | 內容 |
|------|------|
| **Priority** | P3 |
| **Dependencies** | 訂單／預約資料穩定；建議 W3 後再做以免退款狀態影響報表口徑 |
| **為什麼需要** | 前端聚合 list API 在資料量大時慢且權限過粗。 |
| **資料流向** | Admin → `shop-summary`／`booking-summary` → Analytics 頁；RBAC **`analytics.view`** |
| **DoD** | [x] Spec 實作 [x] Admin v0.23 [x] IT + facade [x] 前端改打 summary |

---

### W4 完成門檻

- [x] K5～K7（W4-01～03）  
- [x] K8～K10：W4-04／05 **延後**（不阻塞；文章仍靜態 JSON、圖檔等 GCP）  
- [x] K11：W4-06 Analytics API（含手動驗收）  
- [ ] 營運文件：哪些主檔改後台、哪些仍需工程師  

---

## 6. 建議開工順序（一頁版）

可直接當 sprint 排列：

| 序 | ID | Priority | Dependencies |
|----|-----|----------|--------------|
| 1 | ADM-W1-01 備註 | P0 | — |
| 2 | ADM-W1-02 標籤池 | P0 | — |
| 3 | ADM-W1-03 標籤指派 | P0 | W1-02 |
| 4 | ADM-W1-04 地址 | P0 | — |
| 5 | ADM-W1-05 偏好 | P0 | —（可與 W1-04 平行） |
| 6 | ADM-W1-07 min-stock | P0 | — |
| 7 | ADM-W1-06 Reviews | P0 | —（建議備 fixture） |
| 8 | ADM-W2-01 分類 | P1 | — |
| 9 | ADM-W2-02 品牌 | P1 | — |
| 10 | ADM-W2-03 租借 SKU | P1 | 建議 01／02 |
| 11 | ADM-W2-04 租借 listing＋裝備規格標籤 | P1 | W2-03 |
| 12 | ADM-W2-06 庫位 | P1 | — |
| 13 | ADM-W2-07 門市 | P1 | 建議 W2-06 |
| 14 | ADM-W2-05 跨領域轉換 | P1 | G-3、建議 W2-03／W2-06 |
| 15 | （Gate）線 D 完成 | — | Payment 清單 |
| 16 | ADM-W3-01 訂單取消 O1 | P1 | 線 D |
| 17 | ADM-W3-02 退款 O3 | P1 | 線 D、常接 W3-01 |
| 18 | ADM-W3-03 預約取消 B1 | P1 | 線 D |
| 19 | ADM-W4-01 營區 | P2 | — |
| 20 | ADM-W4-02 營位 | P2 | W4-01 |
| 21 | ADM-W4-03 假日曆 | P2 | — |
| 22 | ADM-W4-04 文章 | P2 | 可並行線 H 公開讀 |
| 23 | ADM-W4-05 圖檔上傳 | P3 | GCP／J |
| 24 | ADM-W4-06 Analytics API | P3 | 建議 W3 後 |

並行建議：W1 內 01／02／04／05／07 可多人平行；03 等 02。W2 的 01／02／06 可平行，05 最後收斂。

---

## 7. 與既有清單的關係

| 文件 | 關係 |
|------|------|
| [`admin-post-g6/README.md`](./admin-post-g6/README.md) | **各任務細實作 checklist 索引**（本總覽的下層） |
| [`backend-implementation-checklist.md`](./backend-implementation-checklist.md) 線 G | G-1～G-6 ✅；**本文件 = G 之後擴充 backlog** |
| 同檔線 D | **W3 的硬前置**（見 [`w3/ADM-W3-00-payment-gate.md`](./admin-post-g6/w3/ADM-W3-00-payment-gate.md)） |
| 同檔線 H | 文章公開讀、會員評價寫入可與 W1-06／W4-04 協同；避免各做一套 DTO |
| 同檔線 J | W4-05 上傳依賴雲端基礎 |
| [`admin-api-contract.md`](../docs/api/admin-api-contract.md) | 每完成一波升版；§10 readiness 表同步改 |

---

## 8. 變更紀錄

| 日期 | 說明 |
|------|------|
| 2026-07-23 | 依缺漏分析＋HITL 問答建立本清單 |
| 2026-07-23 | 拆出 [`admin-post-g6/`](./admin-post-g6/README.md)：24 任務＋W3 Gate 各一份實作 checklist；本檔改為規劃總覽並互連 |
| 2026-07-23 | **ADM-W1-01 完成**：`internal_note` Schema／契約 v0.9／後端 PATCH／前端 readiness；PostgreSQL IT 通過 |
| 2026-07-23 | **ADM-W1-02 完成**：`/api/admin/customer-tags` CRUD；契約 v0.10；readiness 拆 `tagPool`／`tagAssign`；PostgreSQL IT 通過 |
| 2026-07-23 | **ADM-W1-03 完成**：`PUT /customers/{id}/tags` 集合取代；只能掛 active；`tagAssign=true`；PostgreSQL IT 通過 |
| 2026-07-23 | **ADM-W1-07 完成**：`GET`／`PUT /min-stocks`；契約 v0.12；`products.minStock=true`；PostgreSQL IT 通過 |
| 2026-07-23 | **ADM-W1-04 完成**：`PUT .../default-shipping-address`；契約 v0.13；不改訂單 snapshot；`defaultAddress=true`；PostgreSQL IT 通過 |
| 2026-07-23 | **ADM-W1-05 完成**：`PUT .../preferences`＋`GET /preference-options`；契約 v0.14；`preferences=true`；PostgreSQL IT 通過 |
| 2026-07-23 | 文件對齊：總覽 changelog／開工表／DoD；checklist 格式；契約 Customers 段落改為 W1-02→03→04→05 |
| 2026-07-23 | 標註 W2 **刻意延後 UI**：[`admin-post-g6/w2/W2-ui-followups.md`](./admin-post-g6/w2/W2-ui-followups.md)（租借整頁／調撥 Modal） |
| 2026-07-25 | **W2 波次完成（文件收斂）**：W2-01～08 DoD／checklist 全勾；UI follow-up 手動驗收通過；契約現況改記 v0.18；波次表 W1／W2 ✅；下一步 W3 Gate |
| 2026-07-25 | **W3 Gate ✅**：對齊 Payment 契約 v0.2 §6／§7；線 D D-1～D-6 勾完；解鎖 W3-01～03（綠界退款 HTTP 仍屬 W3-02） |
| 2026-07-25 | **W3 波次完成**：O1／O3／B1；Admin v0.19、Payment v0.3 stub 全額退款 port；下一步 W4 |
| 2026-07-25 | **W4-06 完成＋手動驗收**：Analytics summary API；Admin v0.23；**W4 波次收斂**（04／05 延後） |
