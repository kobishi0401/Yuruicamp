# ADM-W2-01 — 分類主檔 CRUD（K1）

| 欄位 | 內容 |
|------|------|
| **波次** | W2｜P1 |
| **狀態** | ✅ 完成（手動驗收通過；2026-07-25） |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § ADM-W2-01 |
| **索引** | [`../README.md`](../README.md) |
| **Dependencies** | 無硬依賴（W1 建議完成） |
| **權限（建議）** | `products.view`／`products.edit` |

---

## 0. 開工前必讀

- [x] 弄清 `categories` 表欄位與 Products lookups 用法（G-2c）
- [x] 定案：被商品引用時**禁硬刪**或僅停用（契約寫死一種）
- [x] 本項只做分類，品牌見 W2-02

---

## 1. 契約

- [x] `/api/admin/categories` CRUD 寫進 Admin 契約並升版
- [x] 列表／建立／更新／刪除或停用規則
- [x] 與 `GET /api/admin/products/lookups` 的關係：新分類必須出現在 lookups

---

## 2. Schema

- [x] 通常不需改；若無 `active` 而契約要停用，才加欄位

---

## 3. 後端

- [x] AdminCategoryController＋Service
- [x] 刪除前檢查 products／equipment 引用 → 409
- [x] RBAC＋OpenAPI
- [x] lookups 查詢含新資料

---

## 4. 前端

- [x] 分類維護 UI：商品頁單一「分類／品牌」按鈕 → `#catalogMasterModal` 的「分類」tab＋ AdminAPI
- [x] 建立商品時 lookups 重抓

---

## 5. 測試與驗收

- [x] CRUD 快樂路徑
- [x] 有引用時刪除 409
- [x] 新建後 products/lookups 看得到
- [x] RBAC

---

## 6. 收尾

- [x] 總覽 W2-01；本檔 ✅

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
