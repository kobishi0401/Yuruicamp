# ADM-W3-02 — 訂單退款狀態推進（O3）

| 欄位 | 內容 |
|------|------|
| **波次** | W3｜P1 |
| **狀態** | ✅ 完成（2026-07-25；本波精簡＝取消同交易全額退款） |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § ADM-W3-02 |
| **索引** | [`../README.md`](../README.md) |
| **Dependencies** | **硬依賴** Gate；與 [`ADM-W3-01`](./ADM-W3-01-order-cancel.md) 同流程 |
| **權限** | `orders.edit` |
| **不做** | O2 退貨；Admin **偽造**綠界退款成功；獨立 `POST .../refunds/*`；部分退款 |

---

## 0. 開工前必讀

- [x] `refund_status` ENUM：本波成功路徑直接 `none` → `refunded`（失敗不改本地）
- [x] 退款真相在 Payment／ECPay port；Admin cancel 先呼叫再改狀態
- [x] 與取消的銜接：已付款線上單取消＝同交易全額退款（契約寫死）

---

## 1. 契約

- [x] 本波**不**另開獨立退款端點；掛在 `POST .../orders/{id}/cancel`
- [x] 非法轉換 → 409
- [x] 成功後 `payment_status=refunded`、`refund_status=refunded`
- [x] 與 [`payment-api-contract.md`](../../../docs/api/payment-api-contract.md) §8 交叉引用
- [x] 文件註明：**O2 退貨不在本波**

---

## 2. Schema

- [x] 沿用 `refund_status`、`order_event_history`；Java `RefundStatus` 補齊 processing／failed

---

## 3. 後端

- [x] `PaymentRefundService`＋`EcpayGateway.refundFull`（stub 成功）
- [x] 失敗寫錯誤碼 `PAYMENT_REFUND_FAILED`／`PAYMENT_PROVIDER_CONFLICT`；不改訂單
- [x] 寫 `order_event_history`（`event_type=refund`）
- [x] 取消流程整合（W3-01）

---

## 4. 前端

- [x] 訂單詳情／列表顯示 refund／payment 狀態（既有欄位）
- [x] 取消即退款；禁止任意下拉改狀態

---

## 5. 測試與驗收

- [x] paid cancel → refunded
- [x] 非法狀態 409
- [x] stub 路徑；無 Notify → PROVIDER_CONFLICT（Service）
- [x] 事件歷程（order_event_history）
- [x] 與 O1 取消整合場景

---

## 6. 收尾

- [x] 總覽 W3-02；本檔 ✅

---

## 驗收紀錄

| 日期 | 執行者 | 結果 | 備註 |
|------|--------|------|------|
| 2026-07-25 | Agent | ✅ | stub 全額退款 port；與 cancel 同交易 |

---

## 變更紀錄

| 日期 | 說明 |
|------|------|
| 2026-07-25 | 定案精簡：無獨立 refund API；Payment v0.3 §8 |
