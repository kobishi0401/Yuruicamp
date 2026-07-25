# ADM-W3-00 — 線 D Payment Gate（W3 開工閘門）

| 欄位 | 內容 |
|------|------|
| **波次** | W3 前置｜不是 Admin 實作項 |
| **狀態** | ✅ Gate 通過（2026-07-23） |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § W3 Gate |
| **索引** | [`../README.md`](../README.md) |
| **對齊** | [`../../backend-implementation-checklist.md`](../../backend-implementation-checklist.md) 線 D；[`payment-api-contract.md`](../../../docs/api/payment-api-contract.md) v0.2 |

---

## 0. 為什麼要有這份？

W3（訂單取消／退款、預約已付款取消）會動到 **paid 真相** 與 **金流退款**。  
若 Gate 沒過就做 Admin，容易做出「只改 DB status、綠界沒退錢」的危險功能。

> **規則**：本檔所有項勾完之前，**禁止**把 W3-01～03 標為可開工。

---

## 1. 線 D 必備能力

- [x] ECPay（或 stub）付款成功後，訂單 `payment_status=paid`＋`paid_at`（D-1／D-3 stub＋notify）
- [x] 預約同樣 paid 真相寫入（D-3；status 維持 `pending`）
- [x] `POST /api/payments/ecpay/notify` **冪等**（重送不重複入帳）
- [x] Payment 契約已定義：退款／取消與 ECPay 的步驟與錯誤碼（契約 v0.2 §7；HTTP 實作屬 W3）
- [x] 優惠券 `consumed` 在取消／退款時是否回滾／維持 — **契約已定案**（全額回滾／部分不回滾）
- [x] COD 路徑與線上付款路徑差異已文件化（取消時分開寫；契約 v0.2 §6～§7）

> 2026-07-23：D-1～D-6 已落地；契約 v0.2 定案取消／退款／券規則。可開工 W3-01～03（實作時必須先打綠界退款再改本地）。

---

## 2. 建議對照驗收

- [x] 手動或整合：付一筆商城單 → Admin 可見 paid → 才能談 cancel（IT：`PaymentNotifyPostgreSqlIntegrationTest`／`EcpayLaunchReturn…`）
- [x] 手動或整合：付一筆預約 → pending+paid → 才能談 admin cancel
- [x] notify 重送兩次，訂單仍只有一次 paid

---

## 3. Gate 通過後

- [x] 本檔狀態改 ✅
- [ ] 依序開工：
  - [`ADM-W3-01-order-cancel.md`](./ADM-W3-01-order-cancel.md)
  - [`ADM-W3-02-order-refund.md`](./ADM-W3-02-order-refund.md)
  - [`ADM-W3-03-booking-cancel.md`](./ADM-W3-03-booking-cancel.md)

---

## 驗收紀錄

| 日期 | 執行者 | 結果 | 備註 |
|------|--------|------|------|
| 2026-07-23 | agent | ✅ | D-1～D-6 + 契約 v0.2；退款 HTTP 留 W3 |
