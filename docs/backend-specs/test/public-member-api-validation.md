# 公開與會員 API 實際驗證

## 1. Catalog／Branches 公開讀

不使用 Token 驗證：

```http
GET /api/products?page=0&size=20&sort=id,asc
GET /api/products/{id}
GET /api/products?category=...&brand=...&minPrice=...&maxPrice=...
GET /api/branches
```

預期：

- 只回 active 商品／規格，列表有 `meta`。
- variant 有非負整數 `availableQuantity`，`inStock` 與數量是否大於 `0` 一致。
- `minPrice > maxPrice` 回 `400 VALIDATION_ERROR`。
- 不存在或下架商品詳情回 `404 NOT_FOUND`。
- Branches 依 ID 固定排序且不需 Token。

建立 active 庫存保留前後比較同一 variant，可售量應下降；released／expired 保留不再扣除。此項需搭配專用測試 DB，不在共用資料庫手改。

## 2. 會員 Session

本機 dev stub：

```http
POST /api/auth/firebase/session
Content-Type: application/json

{
  "idToken": "dev:member-validation:member-validation@example.test:google:MemberValidation"
}
```

將同一 Token 填入 Swagger `Authorize`，再執行 `GET /api/me`。預期 Session 建立／綁定會員，`/me` 只回目前 principal。

## 3. Checkout

使用 API 查到的可售 `variantId`，每次新案例使用唯一 `idempotencyKey`：

```http
POST /api/checkout/sessions
PATCH /api/checkout/sessions/{orderId}
POST /api/checkout/sessions/{orderId}/cancel
```

驗證：

- 建立後為待付款並有約 15 分鐘期限；價格與商品快照由後端產生。
- 相同 key／相同 payload 回放同一 order；相同 key／不同 payload 回 `409 IDEMPOTENCY_CONFLICT`。
- 偽造價格、總額、會員 ID 或狀態不會覆蓋後端。
- 超過可售量回庫存衝突，交易不留下部分訂單或保留帳。
- PATCH 只能改本人、未逾時 Session 的收件／付款方式／商城 coupon claim。
- cancel 重送冪等，active 保留只釋放一次。

Payment/ECPay 端點目前不存在，所以到 `ready_to_pay` 即停止；不可將待付款 Session 記為付款完成。

## 4. Coupon

```http
GET /api/coupons
GET /api/me/coupons
POST /api/me/coupons/claims
```

領取後以 claim ID PATCH 商城 Checkout。確認：

- 只可使用自己的 claim，折扣由後端計算並保存快照。
- 重複領取回 `409 COUPON_ALREADY_CLAIMED`。
- 清除 claim 後折扣回 `0.00`。
- 付款後 consumed 尚依賴 Payment 線，不列為完成。
- Booking coupon claim 尚未開放。

## 5. Booking 公開讀與可用性

```http
GET /api/booking/campgrounds
GET /api/booking/campgrounds/{id}
GET /api/booking/equipment?campgroundId={id}
GET /api/booking/policy
GET /api/booking/closures
POST /api/booking/check-availability
```

ID 與日期必須從當前 Seed／API 取得。驗證 active 過濾、兩位小數價格、日期窗口、公休、zone block 與剩餘量；不可用是 `200` 搭配 `available=false`，非法日期才是 4xx。可用性查詢不得建立 Booking 或保留帳。

營區列表與詳情必須回傳 `environmentTags`、`facilityTags`；前台依這兩個陣列執行「環境特徵」與「營區設施」篩選。詳細步驟見 [`booking-campground-tag-filter-validation.md`](./booking-campground-tag-filter-validation.md)。

## 6. Booking Checkout／會員讀取

```http
POST /api/booking/checkout/sessions
GET /api/booking/checkout/sessions/{bookingId}
POST /api/booking/checkout/sessions/{bookingId}/cancel
GET /api/booking/bookings?page=0&size=20
GET /api/booking/bookings/{bookingId}
```

驗證：

- 建立成功為 `pending + unpaid + ready_to_pay`，營位／租借快照與金額由後端產生。
- 相同 payload 冪等回放；衝突 payload 回 `409 IDEMPOTENCY_CONFLICT`。
- Booking 傳 `cod` 回 `400`；線上付款完成仍待 Payment 線。
- 租借超量回 `409 RENTAL_STOCK_INSUFFICIENT`，listing／variant 不相符回 `404`。
- 未授權回 `401`；第二位會員讀／取消第一位資料統一回 `404`。
- 取消重送冪等並恢復營位、釋放租借保留。
- 逾時排程、並發搶位／搶租借與付款競爭由 PostgreSQL 整合測試驗證，不用 Swagger 人工製造競態。

## 7. 已知缺口

- `/api/me/orders` 與 `/api/me/orders/{id}` 已完成；會員訂單驗收改依 [`member-order-api-validation.md`](./member-order-api-validation.md) 執行。
- **Payment stub**（launch／Notify／COD）已完成；**真實綠界沙箱**（`stub=false`）待驗收 — 見 [`../payment/ecpay-sandbox-validation.md`](../payment/ecpay-sandbox-validation.md)。
- **Booking Coupon** 關聯 Schema 尚未決定；Booking Checkout 仍拒絕非 null `couponClaimId`。
- **文章 API** 延後；Blog 仍讀靜態 JSON。
- **公開 calendar_dates 讀取** 未開；Admin 維護與 Booking 計價已用 DB。

## 8. 通過標準

- 公開權限、會員 Bearer、Envelope、錯誤碼與 meta 正確。
- 會員隔離使用 principal，不接受 Request 傳會員 ID。
- 後端價格、冪等、庫存／營位保留與取消一致。
- 所有未完成端點明確列為缺口，沒有把 404 或 Mock 成功當成 Backend 通過。

