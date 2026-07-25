# W2 前端延後項（刻意未做／後端已可用）

| 欄位 | 內容 |
|------|------|
| **狀態** | ✅ UI 遷移完成（2026-07-23） |
| **日期** | 2026-07-23 |
| **關聯** | [`ADM-W2-04`](./ADM-W2-04-rental-listings.md)、[`ADM-W2-05`](./ADM-W2-05-inventory-conversion.md) |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § W2 |
| **索引** | [`../README.md`](../README.md) |

---

## 為什麼要單獨標註？

W2 後端／契約／`AdminAPI`／readiness **可以先就緒**，但舊版商品頁 UI 的資料模型與新契約不一致。  
下列兩項曾是**刻意延後**；本檔已完成 UI 遷移後，請用下方驗收表確認畫面真的打到 API。

> 驗收後端：用 Swagger 或 `AdminAPI.*`。  
> 驗收完整營運 UX：本檔兩項 UI 遷移。

---

## 延後項 A — 租借整頁（定價／上架）→ 新資料模型

| 項目 | 說明 |
|------|------|
| **對應任務** | 主要屬 [`ADM-W2-04`](./ADM-W2-04-rental-listings.md)（依賴 W2-03 SKU） |
| **程式位置** | `frontend/admin/js/products.js`（`openRentalListingsModal`／`submitRentalListingsModal`）；`partials/products.html` `#rentalListingsModal` |
| **後端已可用** | `GET`／`PUT /api/admin/rentals/{id}/listings`；`AdminAPI.rentals.listListings`／`replaceListings`；裝備規格／標籤 `/api/admin/equipment-items/{itemId}/specs`／`tags` |
| **完成做法** | 正式模式顯示租借 tab；列表走 `AdminAPI.rentals.list`；「上架定價」Modal 用 `campgroundId` × `rentalSkuVariantId` × 日租價 × `active`；規格／標籤走 equipment-items |

---

## 延後項 B —「調撥到租借」→ inventory-conversions

| 項目 | 說明 |
|------|------|
| **對應任務** | 主要屬 [`ADM-W2-05`](./ADM-W2-05-inventory-conversion.md) |
| **程式位置** | `products.js`：`submitBranchToCampTransferBackend`；`#transferToRentalModal` |
| **後端已可用** | `/api/admin/inventory-conversions`；`AdminAPI.inventoryConversions.*`；readiness `movement.conversion` |
| **完成做法** | 正式模式：`createDraft` → `post`；地點用 `main`／`RENTAL-C00x`；規格用顏色／尺寸對齊（例：`V001` → `RSV-R001-01`）；成功後重抓商店商品。Mock 仍走舊 memory 路徑 |

---

## 驗收對照（給新手）

| 你想驗證什麼 | 應該怎麼驗 |
|--------------|------------|
| 租借 listing／定價 | 後台 → 商品 → 租借 →「上架定價」；或 `AdminAPI.rentals.*` |
| 跨領域轉換 | 租借列「調撥」→ 填數量確認；Network 應見 `inventory-conversions` POST＋`/post` |

---

## 勾選進度（UI 遷移完成後再勾）

- [x] A：`products.js` 租借整頁改用新 listing／規格／標籤資料模型並接真 API  
- [x] B：「調撥到租借」改打 `inventory-conversions`；正式模式移除前端假異動路徑  
- [ ] 手動：Backend 模式下完成「上架一筆到營區」＋「store→rental 過帳一筆」畫面流程  
- [x] 回總覽／本索引標註「W2 UI follow-up 完成」

---

## 變更紀錄

| 日期 | 說明 |
|------|------|
| 2026-07-23 | 建立本檔：明確標註 W2-04／W2-05 刻意延後的兩項舊 UI |
| 2026-07-23 | 完成 A／B UI 遷移：AdminAPI rentals／equipmentItems／inventoryConversions＋products.js Modal |
