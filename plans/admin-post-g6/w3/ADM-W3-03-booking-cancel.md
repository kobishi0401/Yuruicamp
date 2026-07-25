# ADM-W3-03 — 預約已付款取消（B1）

| 欄位 | 內容 |
|------|------|
| **波次** | W3｜P1 |
| **狀態** | ✅ 完成（2026-07-25） |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § ADM-W3-03 |
| **索引** | [`../README.md`](../README.md) |
| **Dependencies** | **硬依賴** Gate；可參考 E-6 未付款取消釋放邏輯 |
| **權限** | `bookings.edit` |

---

## 0. 開工前必讀

- [x] Gate ✅（[`ADM-W3-00`](./ADM-W3-00-payment-gate.md)）；預約 paid 真相可用
- [x] 定案 **B1**：取消＋觸發退款（不是只改 status）
- [x] Admin 不得把 unpaid 改成 paid
- [x] 釋放：營位占用（status→cancelled）＋ active `rental_stock_reservations` → released

---

## 1. 契約

- [x] `POST /api/admin/bookings/{id}/cancel`
- [x] 允許：paid + pending／confirmed
- [x] 與退房 complete、會員未付款 cancel 的邊界
- [x] 退款連動（Payment）
- [x] 冪等

---

## 2. Schema

- [x] 通常不需改

---

## 3. 後端

- [x] 悲觀鎖 booking
- [x] → cancelled＋payment refunded＋history
- [x] 釋放 rental 保留（對齊 E-6）
- [x] 觸發退款（先於本地狀態）
- [x] RBAC＋OpenAPI

---

## 4. 前端

- [x] Bookings 取消操作＋確認 Modal（Backend 打真 API）
- [x] 成功刷新；409 可讀
- [x] 僅 paid 顯示取消鈕

---

## 5. 測試與驗收

- [x] paid pending → cancel（單元＋IT）
- [x] 重送冪等
- [x] 非法狀態／unpaid 409
- [x] 退款連動（stub）
- [x] PostgreSQL 整合

---

## 6. 收尾

- [x] 總覽 W3-03；本檔 ✅
- [x] W3 三項＋Gate 皆完成 → 勾總覽 W3 波次門檻

---

## 驗收紀錄

| 日期 | 執行者 | 結果 | 備註 |
|------|--------|------|------|
| 2026-07-25 | Agent | ✅ | Admin booking cancel＋stub 退款 |

---

## 變更紀錄

| 日期 | 說明 |
|------|------|
| 2026-07-25 | 實作完成；前端取消改打真 API |
