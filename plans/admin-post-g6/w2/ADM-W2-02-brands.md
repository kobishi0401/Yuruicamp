# ADM-W2-02 — 品牌主檔 CRUD（K2）

| 欄位 | 內容 |
|------|------|
| **波次** | W2｜P1 |
| **狀態** | ✅ 完成（手動驗收通過；2026-07-25） |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § ADM-W2-02 |
| **索引** | [`../README.md`](../README.md) |
| **Dependencies** | 建議 W2-01 先完成（僅為驗收單純，非硬鎖） |
| **權限（建議）** | `products.view`／`products.edit` |

---

## 0. 開工前必讀

- [x] `brands` 表與 G-2c `brandId` lookup
- [x] 刪除／停用策略與分類一致（有引用禁硬刪）

---

## 1. 契約

- [x] `/api/admin/brands` CRUD 升版寫死
- [x] lookups 同步規則

---

## 2. Schema

- [x] 通常不需改

---

## 3. 後端

- [x] CRUD＋引用檢查＋RBAC＋OpenAPI

---

## 4. 前端

- [x] 品牌維護 UI：與 W2-01 共用「分類／品牌」Modal 的「品牌」tab＋ AdminAPI
- [x] 商品表單 lookups 重抓

---

## 5. 測試與驗收

- [x] CRUD；有引用刪除 409；lookups 可見；RBAC

---

## 6. 收尾

- [x] 總覽 W2-02；本檔 ✅

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
