# Coupon 後端流程

## 完成範圍

- `GET /api/coupons`：公開有效且仍有名額的優惠券。
- `GET /api/me/coupons`：會員自己的領券紀錄。
- `POST /api/me/coupons/claims`：依優惠券 `id` 領券。
- Checkout 建立與更新可傳 `couponClaimId`，後端重新計算折扣並寫入 `order_coupons` 快照。
- Checkout 更新傳空內容 `{}` 時清除目前套用的券；claim 仍保留為 `claimed`。
- COD 確認成立時，在同一交易將訂單已套用的 claim 改為 `consumed` 並設定 `consumed_at`。
- 會員主動取消已綁券訂單時改為 `revoked`；系統逾時取消時改為 `expired`，兩者都設定 `revoked_at`。

## 三種資格

- `promotion`：有效期間與名額符合即可。
- `birthday`：固定使用 `Asia/Taipei`，會員生日月份等於目前月份。
- `firstPurchase`：`customers.first_purchase_used=false`。

## Trigger 分工

Service 負責會員資格、最低消費、折扣計算及訂單歸屬。既有 `trg_coupon_claims_allocate_capacity` 只負責原子配置名額，避免多人同時領取超過 `issue_quantity`。

套券時 claim 不會提前改成 `consumed`。`CouponService.consumeAppliedClaim` 會鎖定 claim，只允許 `claimed → consumed`；重複呼叫時保留第一次 `consumed_at`，因此可供 COD 與未來 ECPay Notify 共用。取消或逾時不退還已占用的領券名額。

`CouponService.invalidateAppliedClaim` 同樣鎖定 claim。會員取消使用 `revoked`，排程逾時使用 `expired`；已是終止狀態時不覆寫第一次失效時間。兩者都不回到 `claimed`，也不減少優惠券的 `claimed_quantity`。

目前 COD 已在 `confirm-cod` 交易內接線。ECPay Gateway／Notify 尚未實作；未來只有在 Notify 驗簽且付款成功後才能呼叫同一消耗方法，Return URL 不得改變 claim。

目前 Schema 只有 `order_coupons`，沒有 Booking 對應的 Coupon 關聯表。為避免只改金額卻沒有 claim 歸屬與折扣快照，Booking 仍拒絕非 `null couponClaimId`；完整 F-2 需先完成 Schema 決策。

## 自動驗證

`CouponPostgreSqlIntegrationTest` 使用真正 PostgreSQL 驗證名額 Trigger、重複領券、售罄、資格、後端折扣快照、主動取消 `revoked`、逾時 `expired`，以及重複消耗不覆寫第一次 `consumed_at`。
