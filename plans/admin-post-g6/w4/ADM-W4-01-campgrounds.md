# ADM-W4-01 — 營區主檔 CRUD（K5）

| 欄位 | 內容 |
|------|------|
| **波次** | W4｜P2 |
| **狀態** | ✅ 完成 |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § ADM-W4-01 |
| **索引** | [`../README.md`](../README.md) |
| **Dependencies** | 無硬鎖；利於租借 listing 擴新營區 |
| **權限（建議）** | `booking-calendar.view`／`booking-calendar.edit`（契約寫死） |

---

## 0. 開工前必讀

- [x] 表：`campgrounds`；關聯公休、listing、zones
- [x] 禁硬刪若有 booking／listing 引用；改啟停

---

## 1. 契約

- [x] `/api/admin/campgrounds` CRUD／啟停（Admin v0.20 §11）
- [x] 與公開 `GET /api/booking/campgrounds` 對齊欄位策略甲

---

## 2. Schema

- [x] 通常不需改

---

## 3. 後端

- [x] CRUD＋引用檢查＋RBAC＋OpenAPI
- [x] 公開讀只反映 active（依契約）

---

## 4. 前端

- [x] 營區維護 UI（預約排程頁「營區維護」Modal；`booking-calendar.campgrounds`）

---

## 5. 測試與驗收

- [x] CRUD；公開列表一致；有引用禁刪（`AdminCampgroundPostgreSqlIntegrationTest`）
- [x] 前端 facade：`npm run test:admin-campgrounds`

---

## 6. 收尾

- [x] 總覽 W4-01；本檔 ✅ → 可開工 W4-02

---

## 驗收紀錄

| 日期 | 執行者 | 結果 | 備註 |
|------|--------|------|------|
| 2026-07-25 | Agent | ✅ | 契約 v0.20；後端＋預約排程 Modal；tags／zones 留 W4-02／另開 |
