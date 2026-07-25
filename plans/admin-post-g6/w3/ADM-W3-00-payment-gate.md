# ADM-W3-00 — 線 D Payment Gate（W3 開工閘門）

| 欄位 | 內容 |
|------|------|
| **波次** | W3 前置｜不是 Admin 實作項 |
| **狀態** | ✅ 通過（2026-07-25；對齊 Payment 契約 v0.2＋線 D D-1～D-6） |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § W3 Gate |
| **索引** | [`../README.md`](../README.md) |
| **對齊** | [`../../backend-implementation-checklist.md`](../../backend-implementation-checklist.md) 線 D；[`payment-api-contract.md`](../../../docs/api/payment-api-contract.md) |

---

## 0. 為什麼要有這份？

W3（訂單取消／退款、預約已付款取消）會動到 **paid 真相** 與 **金流退款**。  
若 Gate 沒過就做 Admin，容易做出「只改 DB status、綠界沒退錢」的危險功能。

> **規則**：本檔所有項勾完之前，**禁止**把 W3-01～03 標為可開工。  
> **本檔已通過**：可依序開工 W3-01 → W3-02 → W3-03。  
> **仍屬 W3（非 Gate）**：綠界退款 HTTP 實作（契約 §8）。

---

## 1. 線 D 必備能力

- [x] ECPay（或 stub）付款成功後，訂單 `payment_status=paid`＋`paid_at`（D-1／D-3 stub＋notify）
- [x] 預約同樣 paid 真相寫入（D-3；status 維持 `pending`）
- [x] `POST /api/payments/ecpay/notify` **冪等**（重送不重複入帳）
- [x] Payment 契約已定義：退款／取消與 ECPay 的步驟與錯誤碼（[`payment-api-contract.md`](../../../docs/api/payment-api-contract.md) **§7.1～7.3**；錯誤碼預留 `PAYMENT_REFUND_FAILED`／`PAYMENT_PROVIDER_CONFLICT`）
- [x] 優惠券 `consumed` 在取消／退款時是否回滾／維持 — **契約已定案**（**§7.4**：全額退→回滾 `claimed`；部分退→維持 `consumed`）
- [x] COD 路徑與線上付款路徑差異已文件化（取消時分開寫）（**§6＋§7.3**）

> **2026-07-25 對齊**：D-1～D-6 已落地（launch／notify／return／COD／預約禁 COD；見後端 checklist 線 D）。  
> Payment 契約 v0.2 §7 已定案取消／退款／券規則；**綠界退款 HTTP 本體留 W3-02**，不擋本 Gate。

---

## 2. 建議對照驗收

- [x] 手動或整合：付一筆商城單 → Admin 可見 paid → 才能談 cancel（IT：`PaymentNotifyPostgreSqlIntegrationTest`）
- [x] 手動或整合：付一筆預約 → pending+paid → 才能談 admin cancel（同上 IT）
- [x] notify 重送兩次，訂單仍只有一次 paid

---

## 3. Gate 通過後

- [x] 本檔狀態改 ✅
- [x] 依序開工（**可開工**，尚未實作）：
  - [`ADM-W3-01-order-cancel.md`](./ADM-W3-01-order-cancel.md)
  - [`ADM-W3-02-order-refund.md`](./ADM-W3-02-order-refund.md)
  - [`ADM-W3-03-booking-cancel.md`](./ADM-W3-03-booking-cancel.md)

---

## 驗收紀錄

| 日期 | 執行者 | 結果 | 備註 |
|------|--------|------|------|
| 2026-07-25 | Amy | ✅ | 文件對齊：契約 v0.2 §6／§7；線 D D-1～D-6；既有 Notify／Launch／Return IT；Gate 通過，可開工 W3-01 |

---

## 變更紀錄

| 日期 | 說明 |
|------|------|
| 2026-07-23 | 建立 Gate；勾 D-1／D-3 paid＋notify 冪等 |
| 2026-07-25 | 對齊契約 §7 三項＋線 D D-2／D-4／D-5／D-6；本檔 ✅；解鎖 W3-01～03 |
