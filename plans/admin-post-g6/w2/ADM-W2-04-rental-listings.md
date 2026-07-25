# ADM-W2-04 — 租借 listing＋裝備規格／標籤（方案 C 後半）

| 欄位 | 內容 |
|------|------|
| **波次** | W2｜P1 |
| **狀態** | ✅ 完成（手動驗收通過；2026-07-25） |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § ADM-W2-04 |
| **索引** | [`../README.md`](../README.md) |
| **Dependencies** | **硬依賴** [`ADM-W2-03-rental-skus.md`](./ADM-W2-03-rental-skus.md)；營區可用 seed（新營區見 W4-01） |
| **權限** | 同 W2-03 |

---

## 0. 開工前必讀

- [x] 表：`rental_listings`；`equipment_specifications`；`equipment_tags`
- [x] 契約需定義：依 `itemId` 更新規格／標籤時，**不與商城商品 PUT 互相覆蓋的規則**（同交易或明確「最後寫入勝出」並文件化）
- [x] 新營區未有 Admin 前，用既有 C00x seed 驗收即可

---

## 1. 契約

- [x] listing：campgroundId × rentalSkuVariantId × 日租價 × active
- [x] CRUD 或同步 API 寫死
- [x] 裝備規格／標籤：key-value／tag 列表更新 API（後端可用）
- [x] 公開 `GET /api/booking/equipment` 應反映 active listing

---

## 2. Schema

- [x] 通常不需改

---

## 3. 後端

- [x] listing 寫入＋驗證營區／variant 存在
- [x] 規格／標籤同步（刪除未出現的 key／tag 或軟策略寫死）
- [x] 價格非負、小數位與金額慣例一致

---

## 4. 前端

- [x] 營區定價／上架 UI（`#rentalListingsModal`：全部規格卡＋勾選 C002–C009；`discount` 固定 0）
- [x] 規格／標籤編輯（**刻意不做於本 Modal**；後端 `/equipment-items/.../specs`／`tags` 仍可用，Admin 畫面不呼叫）— **W2 定案接受**
- [x] `products.rentalWrite` **全就緒**；移除 unsupported

> **UI 現況（2026-07-25）**  
> 詳見 [`W2-ui-followups.md`](./W2-ui-followups.md) § 延後項 A。  
> 租借 tab 點商品名 → listings Modal；存檔只打 `replaceListings`。

---

## 5. 測試與驗收

- [x] 建立 listing → 公開 equipment 看得到價格
- [x] 停用 listing → 公開不可見或不予選擇
- [x] 規格／標籤：後端 API 可用；Admin Modal **刻意不做**（W2 定案接受，不擋波次完成）
- [x] 與商城同 item 的衝突案例依契約驗證

---

## 6. 收尾

- [x] 總覽 W2-04；本檔 ✅

---

## 驗收紀錄

| 日期 | 執行者 | 結果 | 備註 |
|------|--------|------|------|
| 2026-07-25 | Amy | ✅ | 手動：上架一筆到營區；listing UI＋公開讀 OK；規格／標籤 Admin UI 刻意不做 |

---

## 變更紀錄

| 日期 | 執行者 | 結果 | 備註 |
|------|--------|------|------|
| 2026-07-25 | Amy | ✅ | 文件收斂；手動驗收通過；規格／標籤 Admin UI 定案接受不做 |
