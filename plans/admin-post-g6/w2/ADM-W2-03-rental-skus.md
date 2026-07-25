# ADM-W2-03 — 租借目錄寫入：SKU／規格（方案 C 前半）

| 欄位 | 內容 |
|------|------|
| **波次** | W2｜P1 |
| **狀態** | ✅ 完成（手動驗收通過；2026-07-25） |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § ADM-W2-03 |
| **索引** | [`../README.md`](../README.md) |
| **Dependencies** | 建議 [`ADM-W2-01`](./ADM-W2-01-categories.md)／[`ADM-W2-02`](./ADM-W2-02-brands.md)；參考 G-2c |
| **權限（建議）** | `products.view`／`products.edit`（或另立 rentals.* — 若另立需改 seed） |

---

## 0. 開工前必讀

- [x] 定案方案 **C 前半**：`equipment_items` → `rental_skus` → `rental_sku_variants`
- [x] **禁止**在本 API 寫 on-hand（庫存走 G-3 `inventoryDomain=rental`／W2-05 conversion；商城庫存語意見 W2-08）
- [x] 契約必須寫死路徑：獨立 `/api/admin/rentals` **或**掛在 products 下（擇一）→ **已定案獨立 `/api/admin/rentals`**
- [x] listing／裝備規格標籤屬 [`ADM-W2-04`](./ADM-W2-04-rental-listings.md)

---

## 1. 契約

- [x] 升版：列表／詳情／建立／更新／activate／deactivate（規格層）
- [x] Request 不接受 `onHand`／`totalStock`／inventory 寫入欄位
- [x] SKU 唯一、規格組合規則
- [x] 與商城 products 共用 `equipment_items` 時的建立策略（新建 item vs 重用 itemId）寫死

---

## 2. Schema

- [x] 通常不需改表；確認 FK 與 status ENUM

---

## 3. 後端

- [x] 交易內建立／同步 sku＋variants（可參考 AdminProductService 模式）
- [x] 未出現的舊 variant → inactive（不硬刪）
- [x] RBAC＋OpenAPI
- [x] lookups（若需要）

---

## 4. 前端

- [x] 租借維護 UI 接 `AdminAPI`（取代 `updateRental` unsupported 的一部分）
- [x] readiness：`products.rentalWrite`（W2-04 全開後為 true）
- [x] 隱藏／禁用直接改庫存數字（租借 on-hand 唯讀；調撥走 conversion／transfer）

> **UI**：租借列表／SKU 維護已接真 API；定價／上架見 W2-04 與 [`W2-ui-followups.md`](./W2-ui-followups.md)（已完成）。

---

## 5. 測試與驗收

- [x] 建立租借 SKU＋規格 → GET 可見
- [x] 重複 SKU → 錯誤
- [x] 帶 onHand 欄位 → 忽略或 400（與契約一致）
- [x] 下架後公開 booking equipment 不可租（若公開讀已過濾 inactive）

---

## 6. 收尾

- [x] 總覽 W2-03；本檔 ✅
- [x] 可開工 W2-04（已完成）

---

## 驗收紀錄

| 日期 | 執行者 | 結果 | 備註 |
|------|--------|------|------|
| 2026-07-25 | Amy | ✅ | 手動驗收通過；PostgreSQL IT 既有 |

---

## 變更紀錄

| 日期 | 執行者 | 結果 | 備註 |
|------|--------|------|------|
| 2026-07-25 | Amy | ✅ | 文件收斂：checklist／總覽勾完成 |
