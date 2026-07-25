# ADM-W4-03 — 假日曆 `calendar_dates`（K7）

| 欄位 | 內容 |
|------|------|
| **波次** | W4｜P2 |
| **狀態** | ✅ 完成 |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § ADM-W4-03 |
| **索引** | [`../README.md`](../README.md) |
| **Dependencies** | 對齊線 H／架構 P2；與公休（G-4）互補 |
| **權限（建議）** | `booking-calendar.edit` |

---

## 0. 開工前必讀

- [x] 公休 = 能不能訂；假日曆 = 哪天走**特殊節日價**（見 Booking 契約 §0.1；**非**週六日自動假日）
- [x] UI 用語：**一般價**／**特殊節日價**（JSON 欄位仍為 `priceWeekday`／`priceHoliday`）
- [x] 表：`calendar_dates`

---

## 1. 契約

- [x] Admin v0.22 §11.2：`GET/PUT/DELETE /api/admin/calendar-dates`
- [x] 欄位：calendarDate、isHoliday、holidayName、sourceVersion 等依 DB
- [x] 說明 Booking 計價如何讀取（`countHolidayDates`）

---

## 2. Schema

- [x] 通常不需改

---

## 3. 後端

- [x] `AdminCalendarDateController/Service/Repository`＋RBAC
- [x] Checkout 計價讀同一來源（IT 驗 `holidayCount`）

---

## 4. 前端

- [x] 預約排程「特殊節日曆」Modal（`booking-calendar.calendarDates=true`）
- [x] `AdminAPI.calendarDates.*`；月曆底部標示特殊節日

---

## 5. 測試與驗收

- [x] `AdminCalendarDatePostgreSqlIntegrationTest`（upsert/delete + holidayCount）
- [x] `npm run test:admin-calendar-dates` facade smoke

---

## 6. 收尾

- [x] 總覽 W4-03；本檔 ✅

---

## 驗收紀錄

| 日期 | 執行者 | 結果 | 備註 |
|------|--------|------|------|
| 2026-07-25 | Agent | ✅ | Admin v0.22；後端 CRUD + IT；前端 Modal + 月曆標示 |
