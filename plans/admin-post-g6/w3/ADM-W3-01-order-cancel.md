# ADM-W3-01 — 訂單未出貨取消（O1）

| 欄位 | 內容 |
|------|------|
| **波次** | W3｜P1 |
| **狀態** | ✅ 完成（2026-07-25；與 W3-02 同交易退款） |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § ADM-W3-01 |
| **索引** | [`../README.md`](../README.md) |
| **Dependencies** | **硬依賴** [`ADM-W3-00-payment-gate.md`](./ADM-W3-00-payment-gate.md)；G-2b；常接 W3-02 |
| **權限** | `orders.edit` |
| **不做** | O2 退貨（`returned`） |

---

## 0. 開工前必讀

- [x] Gate ✅（[`ADM-W3-00`](./ADM-W3-00-payment-gate.md)）
- [x] 僅 `unshipped` 可走本命令（契約寫死）
- [x] 會員 Checkout cancel ≠ 本命令（本命令涵蓋已付款等客服場景）
- [x] COD unpaid vs 線上 paid 取消規則分開寫

---

## 1. 契約

- [x] `POST /api/admin/orders/{id}/cancel`（名稱可調，全文一致）
- [x] 允許前置條件表（status／paymentStatus／refundStatus）
- [x] Request 可選 `note`
- [x] 成功後 status=`cancelled`；已付款線上單**同交易**退款（見 W3-02／Payment §8）
- [x] 冪等：已 cancelled 重送回放
- [x] Admin 契約＋Payment 契約交叉引用（Admin v0.19／Payment v0.3）

---

## 2. Schema

- [x] 通常不需新欄位；沿用 `order_status`／history／reservations；`RefundStatus` Java 對齊 schema

---

## 3. 後端

- [x] 悲觀鎖訂單
- [x] 狀態機驗證 → update status＋history
- [x] 釋放 **active** `product_stock_reservations`（fulfilled 終態維持；可用量只扣 active）
- [x] 觸發退款（同交易呼叫 `PaymentRefundService`）
- [x] 優惠券規則依 Gate 定案處理（unpaid 清券；paid 回滾 consumed→claimed）
- [x] RBAC＋OpenAPI

---

## 4. 前端

- [x] Orders 詳情／列表「取消」按鈕（僅 unshipped）
- [x] 確認對話框；成功刷新詳情／列表
- [x] 錯誤 409 顯示原因

---

## 5. 測試與驗收

- [x] 線上 paid + unshipped → cancel → cancelled＋退款狀態（單元＋IT）
- [x] 非法狀態（已 shipped）→ 409
- [x] 重送冪等
- [x] 無 edit → 403（既有 RBAC 模式）
- [x] PostgreSQL 整合測試（`AdminFulfillmentPostgreSqlIntegrationTest`）

---

## 6. 收尾

- [x] 總覽 W3-01；本檔 ✅

---

## 驗收紀錄

| 日期 | 執行者 | 結果 | 備註 |
|------|--------|------|------|
| 2026-07-25 | Agent | ✅ | 契約 v0.19；單元＋IT 路徑；前端取消鈕 |

---

## 變更紀錄

| 日期 | 說明 |
|------|------|
| 2026-07-25 | 實作完成：cancel＋同交易 stub 退款；文件收斂 |
