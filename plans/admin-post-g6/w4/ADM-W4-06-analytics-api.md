# ADM-W4-06 — Analytics 專用彙總 API（K11）

| 欄位 | 內容 |
|------|------|
| **波次** | W4｜P3 |
| **狀態** | ✅ 完成 |
| **Spec** | [`ADM-W4-06-analytics-api-spec.md`](./ADM-W4-06-analytics-api-spec.md) |
| **Tickets** | [`.scratch/w4-06-analytics/`](../../../.scratch/w4-06-analytics/README.md)（4 張） |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § ADM-W4-06 |
| **索引** | [`../README.md`](../README.md) |
| **Dependencies** | W3 ✅；W4-04／05 ⏭️ 不阻塞 |

---

## 0. 開工前必讀

- [x] Grilling 口徑已定 → 見 **Spec**
- [x] 現況：Dashboard 用 Orders／Bookings 列表在瀏覽器聚合
- [x] 目標：伺服器端彙總 + 僅 `analytics.view`

---

## 1. 契約

- [x] Admin **v0.23**：`GET /api/admin/analytics/shop-summary`、`booking-summary`
- [x] 口徑／366 天／Asia/Taipei — 見 Spec
- [x] RBAC：`analytics.view`

---

## 2. Schema

- [x] 不需改表

---

## 3. 後端

- [x] Controller／Service／Repository（JDBC 聚合）
- [x] OpenAPI

---

## 4. 前端

- [x] `AdminAPI.analytics.*`；`analytics.summary=true`
- [x] `analytics.js` 改打 summary；低庫存／甜甜圈 v1 仍前端

---

## 5. 測試與驗收

- [x] `AdminAnalyticsPostgreSqlIntegrationTest`（主接縫；需 `RUN_BACKEND_IT=true` + PostgreSQL）
- [x] `npm run test:admin-analytics` facade

---

## 6. 收尾

- [x] 總覽 W4-06；本檔 ✅
- [x] W4 收尾說明（04／05 延後、06 完成）

---

## 驗收紀錄

| 日期 | 執行者 | 結果 | 備註 |
|------|--------|------|------|
| 2026-07-25 | Agent | 📋 | Spec 已寫入；待實作 |
| 2026-07-25 | Agent | ✅ | 後端 summary API + 前端改打 + facade；IT 需本機 Postgres |
