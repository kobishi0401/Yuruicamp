# Admin G-6 之後 — 實作 Checklist 索引

| 欄位 | 內容 |
|------|------|
| **狀態** | Active（W1～W3 ✅；W4-01～03 ✅；W4-06 ✅；W4-04／05 ⏭️ 延後） |
| **日期** | 2026-07-25 |
| **總覽（需求／波次／依賴）** | [`../admin-post-g6-task-list.md`](../admin-post-g6-task-list.md) |
| **契約** | [`../../docs/api/admin-api-contract.md`](../../docs/api/admin-api-contract.md) |
| **Schema 變更流程** | [`../backend-schema-change-checklist.md`](../backend-schema-change-checklist.md) |

---

## 這資料夾是做什麼的？

- [`admin-post-g6-task-list.md`](../admin-post-g6-task-list.md)＝**為什麼做、波次、依賴、DoD 摘要**（產品／規劃視角）
- **本資料夾**＝每個 `ADM-W*` 任務拆成可勾選的**實作步驟**（契約 → Schema → 後端 → 前端 → 測試 → 收尾）

> 驗收通過後：先勾本檔 checklist，再回總覽把該任務／波次標完成。

---

## 每個 checklist 固定結構（給新手）

| 章節 | 意義 |
|------|------|
| **0. 開工前** | 依賴、Blocked、刻意不做 |
| **1. 契約** | 先改文件升版，禁止直接寫 code |
| **2. Schema** | 有欄位／表變更才做；走 schema checklist |
| **3. 後端** | Controller／Service／RBAC／OpenAPI |
| **4. 前端** | AdminAPI、readiness、頁面 |
| **5. 測試與驗收** | 單元／整合／手動 |
| **6. 收尾** | README、契約索引、總覽勾選 |

**統一改約流程（強制）**

```text
契約升版 → Schema（若需要）→ 後端 → 前端 → 測試驗收 → 更新總覽
```

---

## 波次與檔案一覽

### W1 — P0 營運半套補齊 ✅

| ID | 檔案 | 摘要 |
|----|------|------|
| ADM-W1-01 | [`w1/ADM-W1-01-internal-note.md`](./w1/ADM-W1-01-internal-note.md) | ✅ 訂單／預約 `internal_note` |
| ADM-W1-02 | [`w1/ADM-W1-02-customer-tag-pool.md`](./w1/ADM-W1-02-customer-tag-pool.md) | ✅ 會員標籤池 CRUD |
| ADM-W1-03 | [`w1/ADM-W1-03-customer-tag-assign.md`](./w1/ADM-W1-03-customer-tag-assign.md) | ✅ 標籤指派（依賴 W1-02） |
| ADM-W1-04 | [`w1/ADM-W1-04-customer-address.md`](./w1/ADM-W1-04-customer-address.md) | ✅ 預設地址可編 |
| ADM-W1-05 | [`w1/ADM-W1-05-customer-preferences.md`](./w1/ADM-W1-05-customer-preferences.md) | ✅ 偏好可編 |
| ADM-W1-06 | [`w1/ADM-W1-06-reviews.md`](./w1/ADM-W1-06-reviews.md) | ✅ Reviews 列表／詳情／刪除 |
| ADM-W1-07 | [`w1/ADM-W1-07-min-stock.md`](./w1/ADM-W1-07-min-stock.md) | ✅ 最低庫存閾值 |

> 本機手動點測：[`w1/W1-manual-qa.md`](./w1/W1-manual-qa.md)（固定 ID：`W1-ORD-NOTE`／`W1-BK-NOTE`／`W1-REV-DEL`）

### W2 — P1 目錄與庫存進階 ✅

| ID | 檔案 | 摘要 |
|----|------|------|
| ADM-W2-01 | [`w2/ADM-W2-01-categories.md`](./w2/ADM-W2-01-categories.md) | ✅ 分類主檔（UI：商品頁「分類／品牌」Modal → 分類 tab） |
| ADM-W2-02 | [`w2/ADM-W2-02-brands.md`](./w2/ADM-W2-02-brands.md) | ✅ 品牌主檔（UI：同上 Modal → 品牌 tab） |
| ADM-W2-03 | [`w2/ADM-W2-03-rental-skus.md`](./w2/ADM-W2-03-rental-skus.md) | ✅ 租借 SKU／規格 |
| ADM-W2-04 | [`w2/ADM-W2-04-rental-listings.md`](./w2/ADM-W2-04-rental-listings.md) | ✅ listing＋上架定價（裝備規格／標籤：後端可用、Admin Modal 刻意不做） |
| ADM-W2-05 | [`w2/ADM-W2-05-inventory-conversion.md`](./w2/ADM-W2-05-inventory-conversion.md) | ✅ 跨領域轉換 |
| ADM-W2-06 | [`w2/ADM-W2-06-inventory-locations.md`](./w2/ADM-W2-06-inventory-locations.md) | ✅ 庫位主檔 |
| ADM-W2-07 | [`w2/ADM-W2-07-branches.md`](./w2/ADM-W2-07-branches.md) | ✅ 門市主檔 |
| ADM-W2-08 | [`w2/ADM-W2-08-product-stock-update.md`](./w2/ADM-W2-08-product-stock-update.md) | ✅ 商品寫商城庫存＋`product_stock_update` 稽核 |

> **✅ W2 UI follow-up 已完成＋手動驗收**（見 [`w2/W2-ui-followups.md`](./w2/W2-ui-followups.md)）  
> 1. 租借 tab 點商品名 → 上架定價（每規格一卡：一組價＋勾選 C002–C009；不含主倉／不編折扣與裝備規格標籤）  
> 2. 「調撥」→ 分店→營地（`inventory-conversions`）＋ 營地互轉（G-3 rental `transfer`）  

### W3 — P1 付款後例外 ✅

| ID | 檔案 | 摘要 |
|----|------|------|
| Gate | [`w3/ADM-W3-00-payment-gate.md`](./w3/ADM-W3-00-payment-gate.md) | ✅ 線 D 開工閘門 |
| ADM-W3-01 | [`w3/ADM-W3-01-order-cancel.md`](./w3/ADM-W3-01-order-cancel.md) | ✅ 訂單未出貨取消 O1 |
| ADM-W3-02 | [`w3/ADM-W3-02-order-refund.md`](./w3/ADM-W3-02-order-refund.md) | ✅ 全額退款（cancel 同交易；stub port） |
| ADM-W3-03 | [`w3/ADM-W3-03-booking-cancel.md`](./w3/ADM-W3-03-booking-cancel.md) | ✅ 預約已付款取消 B1 |

### W4 — P2～P3 主檔與內容

| ID | 檔案 | 摘要 |
|----|------|------|
| ADM-W4-01 | [`w4/ADM-W4-01-campgrounds.md`](./w4/ADM-W4-01-campgrounds.md) | ✅ 營區 |
| ADM-W4-02 | [`w4/ADM-W4-02-zones.md`](./w4/ADM-W4-02-zones.md) | ✅ 營位／區域 |
| ADM-W4-03 | [`w4/ADM-W4-03-calendar-dates.md`](./w4/ADM-W4-03-calendar-dates.md) | ✅ 特殊節日曆 |
| ADM-W4-04 | [`w4/ADM-W4-04-articles.md`](./w4/ADM-W4-04-articles.md) | ⏭️ 文章（靜態） |
| ADM-W4-05 | [`w4/ADM-W4-05-image-upload.md`](./w4/ADM-W4-05-image-upload.md) | ⏭️ 圖檔（GCP 後） |
| ADM-W4-06 | [`w4/ADM-W4-06-analytics-api.md`](./w4/ADM-W4-06-analytics-api.md) | ✅ Analytics 彙總 API |

---

## 建議開工順序（精簡）

見總覽 §6。W1／W2／W3／W4-06 已完成；W4-04／05 延後至內容／GCP 就緒。

---

## 變更紀錄

| 日期 | 說明 |
|------|------|
| 2026-07-23 | 自總覽拆出本資料夾與各 ADM-W* 實作 checklist |
| 2026-07-23 | W1-01～05、W1-07 checklist 標完成；文件格式對齊 01～03（changelog／DoD／契約段落順序） |
| 2026-07-23 | 新增 [`w2/W2-ui-followups.md`](./w2/W2-ui-followups.md)：標註租借整頁／調撥 Modal 兩項刻意延後 UI |
| 2026-07-25 | **W2 波次文件收斂**：W2-01～08＋UI follow-up 手動驗收通過並勾完；索引補 W2-08；下一步 W3 Gate |
| 2026-07-25 | **W3 Gate ✅**：對齊 Payment 契約 §6／§7＋線 D D-1～D-6；解鎖 W3-01～03 |
| 2026-07-25 | **W4-02 完成**：營位 CRUD＋容量峰值 409；Admin v0.21；計價 UI 用語改為一般價／特殊節日價（方案 A）；下一步 W4-03 假日曆 |
| 2026-07-25 | **W4-03 完成**：`calendar_dates` Admin CRUD；Admin v0.22；預約排程「特殊節日曆」Modal；下一步 W4-04 文章 |
| 2026-07-25 | **W4-06 完成**：`shop-summary`／`booking-summary`；Admin v0.23；前端改打 summary API |
