# Coupon API Contract（v0.4）

| 欄位 | 內容 |
|------|------|
| **狀態** | Partially Implemented（商城套券、消耗與取消失效完成；Booking 關聯 Schema 待決定） |
| **日期** | 2026-07-24 |
| **版本** | 0.4 |
| **共用** | [`common-api-conventions.md`](./common-api-conventions.md) |
| **DB** | `coupons`、`coupon_claims`、`order_coupons`（及預約側對應若有） |
| **ENUM** | `coupon_category`、`coupon_status`、`coupon_claim_status`；折扣型別 `fixed`\|`percent` |

---

## 0. 一句話

三種券（`promotion`／`birthday`／`firstPurchase`）皆做；**領取占名額、結帳才消耗**；折扣金額**後端重算**，與 DB Trigger 不打架。

---

## 1. 端點

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| `GET` | `/api/coupons` | 公開或會員 | 可領／展示用券主檔列表（見規則） |
| `GET` | `/api/me/coupons` | 會員 | 我的領券（claims） |
| `POST` | `/api/me/coupons/claims` | 會員 | 領券 |
| （結帳） | Checkout／Booking PATCH／POST | 會員 | 以 `couponClaimId` 套用；見各契約 |

後台 CRUD 見 Admin 契約。

---

## 2. `Coupon`（主檔，公開列表）

| JSON | 型別 | DB |
|------|------|-----|
| `id` | number | `coupons.id` |
| `code` | string | `code`（大寫、trim） |
| `name` | string | `name` |
| `discountType` | string | `fixed` \| `percent` |
| `discountValue` | string | `discount_value` |
| `minimumAmount` | string | `minimum_amount` |
| `category` | string | `promotion` \| `birthday` \| `firstPurchase` |
| `status` | string | `active` \| `disabled` |
| `validFrom` | string | ISO-8601 |
| `validUntil` | string | ISO-8601 |
| `issueQuantity` | integer | `issue_quantity` |
| `claimedQuantity` | integer | `claimed_quantity`（或 view 統計） |
| `remainingClaimable` | integer | 衍生：`issue - claimed`（≥0） |

### 列表規則（公開）

- 僅 `status=active`
- 且目前時間在 `[validFrom, validUntil]`
- 可不回已領完的券（`remainingClaimable=0`）— 建議隱藏

---

## 3. `CouponClaim`（我的券）

| JSON | 型別 | DB |
|------|------|-----|
| `id` | number | `coupon_claims.id` |
| `couponId` | number | `coupon_id` |
| `status` | string | `claimed` \| `consumed` \| `revoked` \| `expired` |
| `claimedAt` | string | |
| `consumedAt` | string \| null | |
| `coupon` | object | 可嵌精簡 `Coupon`（code／name／折扣欄位） |

同一會員同一 `coupon_id` 僅一筆 claim（DB UNIQUE）。

---

## 4. 領券 — `POST /api/me/coupons/claims`

### Request

```json
{ "couponId": 1 }
```

或 `{ "code": "WELCOME100" }`（二擇一；實作鎖定一種，建議 `couponId`）。

### 行為

1. 驗券可領（active、期間、名額、會員資格）  
2. Insert `coupon_claims`；Trigger／計數增加 `claimed_quantity`  
3. 名額滿 → `CONFLICT`（`COUPON_SOLD_OUT`）  
4. **不**在領券時把訂單折扣寫死

### 資格（三種 category，Service）

| category | 規則摘要 |
|----------|----------|
| `promotion` | 一般活動；期間＋名額 |
| `birthday` | 會員生日月／日規則（實作時鎖死並寫進 Changelog） |
| `firstPurchase` | `customers.first_purchase_used = false`；用掉後標記 |

生日券固定依 `Asia/Taipei` 判斷，會員生日月份等於目前月份時可領取與套用。

---

## 5. 結帳套用

- 客戶端只傳 `couponClaimId`（狀態須為 `claimed`）  
- 後端重算 `discount`／`total`（或 booking `applied_discount`／`final_amount`）  
- 付款成功／COD 確認成立後：claim → `consumed`  
- 會員主動取消已綁券訂單：claim → `revoked`，設定 `revokedAt`，不退回 `claimed`
- Checkout 自動逾時取消：claim → `expired`，以 `revokedAt` 保存失效時間，不退回 `claimed`
- 兩種取消都不退還領券名額；`claimedQuantity` 不會減少

若與 Trigger 衝突，**以 DB 約束為準**，並修 Service。

---

## 6. v0.1 不做

| 項目 | 原因 |
|------|------|
| 前端自算折扣當真相 | 竄改風險 |
| 一單多張券 | 先一單一個 `couponClaimId` |
| Mock 裡與 DB 不符的自由欄位 | 正規化掉 |

---

## Changelog

| 版本 | 日期 | 說明 |
|------|------|------|
| 0.4 | 2026-07-24 | 主動取消將已綁 claim 改為 `revoked`；Checkout 逾時改為 `expired` |
| 0.3 | 2026-07-24 | COD 成立時消耗 claim 並設定 `consumed_at`；重複消耗保留第一次時間 |
| 0.2 | 2026-07-21 | F-1、F-3、F-4 與商城 F-2 完成；Booking 套券待關聯 Schema，付款後消耗保留給線 D |
| 0.1 | 2026-07-20 | 三種 category；claim／consume 分離 |
