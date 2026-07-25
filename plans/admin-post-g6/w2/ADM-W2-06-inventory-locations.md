# ADM-W2-06 — 庫位主檔 CRUD（K3）

| 欄位 | 內容 |
|------|------|
| **波次** | W2｜P1 |
| **狀態** | ✅ 完成（手動驗收通過；2026-07-25） |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § ADM-W2-06 |
| **索引** | [`../README.md`](../README.md) |
| **Dependencies** | 無硬鎖；利於 W2-05／G-3 lookups |
| **權限（建議）** | `movement.view`／`movement.edit` |

---

## 0. 開工前必讀

- [x] 表：`inventory_locations`（domain store｜rental、type、active、可選 branch_id）
- [x] 停用規則：禁止新保留／新異動指向；既有庫存需先調撥清零（契約寫死）

---

## 1. 契約

- [x] `/api/admin/inventory-locations` CRUD／啟停
- [x] lookups 是否只回 active（寫死）
- [x] 與 branches 外鍵規則

---

## 2. Schema

- [x] 通常不需改

---

## 3. 後端

- [x] CRUD＋停用檢查（有庫存／active 保留時禁停用或回 409）
- [x] movement lookups 同步
- [x] RBAC＋OpenAPI

---

## 4. 前端

- [x] 庫位維護：`AdminAPI.inventoryLocations`＋異動／商品 lookups 重抓（可無獨立全頁；Swagger／API 可維護）

---

## 5. 測試與驗收

- [x] 建立 store／rental 庫位
- [x] 停用有庫存 → 409（或契約允許的行為）
- [x] lookups 行為符合契約

---

## 6. 收尾

- [x] 總覽 W2-06；本檔 ✅

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
