# Checkout 優惠券冪等、消耗與取消失效 Swagger 驗證

| 欄位 | 內容 |
| --- | --- |
| 適用範圍 | Checkout 套用、COD 消耗、主動取消 revoked、逾時 expired |
| 驗證工具 | Swagger UI + PostgreSQL 查詢工具 |
| 前置條件 | 可丟棄的開發資料庫、後端已啟動、測試會員已授權 |

## 1. 準備 claim 與 Checkout

先呼叫 `GET /api/coupons` 選一張符合會員資格且未過期的券，再執行：

```http
POST /api/me/coupons/claims
```

```json
{
  "couponId": 1
}
```

記下回應的 `data.id`，以下以 `CLAIM_ID` 表示。接著用新的 `idempotencyKey` 呼叫 `POST /api/checkout/sessions` 建立一筆本人可編輯的 Checkout，記下 `orderId`。

## 2. 第一次套用

```http
PATCH /api/checkout/sessions/{orderId}
```

```json
{
  "couponClaimId": "CLAIM_ID"
}
```

實際送出時將字串換成數字。預期 HTTP 200、`data.couponClaimId` 等於該 claim，且 `pricing.discount` 大於零或符合券規則。

查詢資料庫：

```sql
SELECT order_id, coupon_claim_id, code_snapshot, amount, applied_at
FROM order_coupons
WHERE order_id = '實際 orderId';
```

預期只有一筆。記下 `applied_at`。

## 3. 重送同一 claim

對同一個 `orderId` 再送一次完全相同的 PATCH。預期：

- HTTP 200，不回 `COUPON_ALREADY_USED`。
- `couponClaimId` 與折扣金額不變。
- `order_coupons` 仍只有一筆。
- `applied_at` 不變，表示後端保留原快照，沒有先刪除再新增。

## 4. 只更新配送與付款

```json
{
  "shipping": {
    "recipientName": "測試會員",
    "phone": "0912345678",
    "address": "台北市測試路 1 號"
  },
  "paymentMethod": "cod"
}
```

預期 HTTP 200，配送與付款資料更新，但 `couponClaimId`、折扣及原快照都不變。這對應前端確認結帳不再重送已綁定 claim 的行為。

## 5. 換券

以另一張符合資格的券取得第二個 claim，再對同一筆 Checkout 傳送新的 `couponClaimId`。預期 HTTP 200，資料庫仍只有一筆 `order_coupons`，但 `coupon_claim_id`、券碼快照、折扣與 `applied_at` 已換成新券資料。

## 6. 確認 COD 並驗證消耗

確認步驟 4 已將 `paymentMethod` 更新為 `cod`，再執行：

```http
POST /api/checkout/sessions/{orderId}/confirm-cod
```

預期 HTTP 200、`checkoutStep=completed` 且 `paymentStatus=unpaid`。付款狀態維持未收款，但優惠券已被這筆成立的 COD 訂單使用。

查詢 claim：

```sql
SELECT status, consumed_at
FROM coupon_claims
WHERE id = 實際_CLAIM_ID;
```

預期 `status=consumed` 且 `consumed_at` 不為空。再呼叫 `GET /api/me/coupons`，同一筆 claim 也應回傳 `status=consumed`，前端不應再把它列為可使用選項。

若要驗證消耗方法本身的重複通知保護，執行 `CouponPostgreSqlIntegrationTest`；同一 claim 重複消耗後，第二次不得改寫第一次的 `consumed_at`。ECPay Notify endpoint 尚未實作，不可用 Swagger 偽造未驗簽通知。

## 7. 主動取消後驗證 revoked

對步驟 6 已成立、仍為 `unpaid` 的 COD 訂單執行：

```http
POST /api/checkout/sessions/{orderId}/cancel
```

預期訂單為 `cancelled`。再查詢：

```sql
SELECT status, consumed_at, revoked_at
FROM coupon_claims
WHERE id = 實際_CLAIM_ID;
```

預期 `status=revoked`、`consumed_at IS NULL`、`revoked_at IS NOT NULL`。若測試券為 `YURUIKAMP20`，會員中心應將它顯示在已失效，不得重新出現在可使用選項。

## 8. Checkout 逾時後驗證 expired

換另一位測試會員或另一張尚未領取的券，建立並套用到新的 Checkout，但不要執行 COD 確認。依 Checkout 逾時驗證流程將期限調整到過去，等待排程或執行整合測試。

查詢該 claim，預期 `status=expired`、`consumed_at IS NULL`、`revoked_at IS NOT NULL`。同時訂單應為 `cancelled`，商品保留帳應為 `expired`。

## 9. 為什麼需要這項驗證

JPA 在同一交易內同時刪除與新增快照時，SQL Flush 順序可能使新增先碰到訂單或 claim 的唯一約束。Swagger 重送可驗證 HTTP 行為，資料庫查詢則能確認系統沒有暗中刪除重建同一張券。COD、取消與逾時驗證則確保訂單和 claim 狀態在同一交易一致更新，避免已取消訂單的優惠券仍被列為可使用。
