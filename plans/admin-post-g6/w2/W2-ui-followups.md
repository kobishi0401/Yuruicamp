# W2 前端延後項（刻意未做／後端已可用）

| 欄位 | 內容 |
|------|------|
| **狀態** | ✅ 完成（UI 遷移＋手動驗收通過；2026-07-25） |
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
| **後端已可用** | `GET`／`PUT /api/admin/rentals/{id}/listings`；`AdminAPI.rentals.listListings`／`replaceListings`（裝備 specs／tags API 仍存在，**本 Modal 不再呼叫**） |
| **完成做法** | 正式模式顯示租借 tab；列表走 `AdminAPI.rentals.list`（含唯讀 `stockLocations`）；**點商品名稱**開上架 Modal |
| **UX 規則（2026-07-25）** | Modal 一次列出**全部規格卡**：每卡一組平日／假日價＋勾選上架營區（**C002–C009，不含主倉 C001**）；有勾的營區寫入同價、`discount` 固定 `"0"`；沒勾的規格／營區不進 PUT（既有 listing 軟停用）。不編輯裝備規格／標籤。 |

---

## 延後項 B —「調撥到租借」→ inventory-conversions ＋ 營地互轉

| 項目 | 說明 |
|------|------|
| **對應任務** | 主要屬 [`ADM-W2-05`](./ADM-W2-05-inventory-conversion.md)；營地互轉屬 G-3 |
| **程式位置** | `products.js`：`submitBranchToCampTransferBackend`／`submitCampTransferBackend`；`#transferToRentalModal` |
| **分店→營地** | `AdminAPI.inventoryConversions.createDraft` → `post`；綁定鍵為共用 **`itemId`**（不是名字） |
| **營地↔營地** | `AdminAPI.movement`：`inventoryDomain=rental`、`movementType=transfer`；createDraft → addItem → post（**契約 v0.17 例外**：post **會**改 `rental_sku_variant_stocks`） |
| **無對應商店** | Toast 顯示 `itemId=…`；仍可開 Modal 做營地互轉 |

---

## 驗收對照（給新手）

| 你想驗證什麼 | 應該怎麼驗 |
|--------------|------------|
| 租借 listing／定價 | 後台 → 商品 → 租借 → **點商品名稱**；各規格卡填價並勾營區 → 存檔 |
| 分店→營地 | 有共用 itemId 的列「調撥」→ Network 見 `inventory-conversions` |
| 營地互轉 | 同一 Modal 選「營地互轉」→ Network 見 `inventory-movements` transfer＋post |

---

## 勾選進度（UI 遷移完成後再勾）

- [x] A：`products.js` 租借整頁改用新 listing 資料模型並接真 API  
- [x] B：「調撥到租借」改打 `inventory-conversions`；正式模式移除前端假異動路徑  
- [x] B+：營地互轉打 G-3 rental transfer；無商店對應仍可互轉  
- [x] 定價 UX：規格卡＋勾選營區（C002–C009）；移除折扣／裝備規格／標籤編輯  
- [x] 手動：Backend 模式下完成「上架一筆到營區」＋「store→rental」＋「營地互轉」畫面流程  
- [x] 回總覽／本索引標註「W2 UI follow-up 完成」

---

## 變更紀錄

| 日期 | 說明 |
|------|------|
| 2026-07-23 | 建立本檔：明確標註 W2-04／W2-05 刻意延後的兩項舊 UI |
| 2026-07-23 | 完成 A／B UI 遷移：AdminAPI rentals／equipmentItems／inventoryConversions＋products.js Modal |
| 2026-07-24 | UX：一規格同步全營區價；調撥支援 conversions＋rental transfer；移除上架定價按鈕 |
| 2026-07-24 | 租借 GET 回傳唯讀庫存；前端 `mapAdminRentalResponse` 映射營區欄／調撥「目前庫存」 |
| 2026-07-24 | 後端恢復 rental transfer 過帳改庫存（W2-08 例外）；契約 v0.17 |
| 2026-07-25 | 上架 Modal：全部規格卡＋勾選 C002–C009；拿掉折扣／裝備規格／標籤與說明文字；不再呼叫 specs／tags API |
| 2026-07-25 | Amy 手動驗收通過：上架＋store→rental＋營地互轉；本檔與 W2 波次文件收斂勾完 |
