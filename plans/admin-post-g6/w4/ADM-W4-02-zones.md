# ADM-W4-02 — 營位／區域主檔 CRUD（K6）

| 欄位 | 內容 |
|------|------|
| **波次** | W4｜P2 |
| **狀態** | ✅ 完成 |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § ADM-W4-02 |
| **索引** | [`../README.md`](../README.md) |
| **Dependencies** | **硬依賴** [`ADM-W4-01-campgrounds.md`](./ADM-W4-01-campgrounds.md) ✅ |

---

## 0. 開工前必讀

- [x] 表名：`campground_zones`
- [x] 容量調降：`totalSites < peak(booked+blocked)` → 409

---

## 1. 契約

- [x] Admin zones CRUD（Admin v0.21 §11.1）
- [x] 與 `check-availability` 行為文件化

---

## 2. Schema

- [x] 不需改

---

## 3. 後端

- [x] CRUD＋容量變更驗證（`get_zone_availability` 峰值）
- [x] RBAC `booking-calendar.*`

---

## 4. 前端

- [x] 營位 tab（`booking-calendar.zones`）；列表「編輯」→ PATCH 類型／價格／可賣上限

---

## 5. 測試與驗收

- [x] `AdminCampgroundZonePostgreSqlIntegrationTest`
- [x] `npm run test:admin-campgrounds`（含 zones 路徑）

---

## 6. 收尾

- [x] 總覽 W4-02；本檔 ✅ → 可開工 W4-03

---

## 驗收紀錄

| 日期 | 執行者 | 結果 | 備註 |
|------|--------|------|------|
| 2026-07-25 | Agent | ✅ | 降容量 409；公開詳情／check-availability 連動 |
