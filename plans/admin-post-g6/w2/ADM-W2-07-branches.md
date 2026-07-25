# ADM-W2-07 — 門市主檔 CRUD（K4）

| 欄位 | 內容 |
|------|------|
| **波次** | W2｜P1 |
| **狀態** | ✅ 完成（手動驗收通過；2026-07-25） |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § ADM-W2-07 |
| **索引** | [`../README.md`](../README.md) |
| **Dependencies** | 建議接在 [`ADM-W2-06`](./ADM-W2-06-inventory-locations.md) 之後 |
| **權限（建議）** | `products.edit` 或另訂；契約寫死 |

---

## 0. 開工前必讀

- [x] 表：`branches`；公開 `GET /api/branches`（B-7）
- [x] 訂單 `pickup_branch_id` FK：停用門市不得讓既有取貨單壞掉（禁硬刪）

---

## 1. 契約

- [x] `/api/admin/branches` CRUD／啟停
- [x] 公開讀只回 active（或既有行為對齊）
- [x] 與庫位 `branch_id` 關聯說明

---

## 2. Schema

- [x] 通常不需改

---

## 3. 後端

- [x] Admin CRUD
- [x] 公開 Branch API 與後台資料一致
- [x] 停用／刪除安全檢查

---

## 4. 前端

- [x] 門市維護：Admin API／Swagger（可無獨立全頁；契約允許最小維護面）

---

## 5. 測試與驗收

- [x] CRUD；公開列表反映啟停
- [x] 有訂單引用時禁硬刪

---

## 6. 收尾

- [x] 總覽 W2-07；本檔 ✅

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
