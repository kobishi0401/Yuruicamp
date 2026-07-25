# Checkout API Contract（v0.7）

| 欄位 | 內容 |
|------|------|
| **狀態** | Implemented（Prepare、Read、Update、COD Confirm、Cancel、ECPay Launch） |
| **日期** | 2026-07-23 |
| **版本** | 0.8 |
| **共用** | [`common-api-conventions.md`](./common-api-conventions.md) |
| **相關** | [`order-api-contract.md`](./order-api-contract.md)、[`payment-api-contract.md`](./payment-api-contract.md)、[`coupon-api-contract.md`](./coupon-api-contract.md) |
| **實作說明** | [`../backend-specs/checkout/README.md`](../backend-specs/checkout/README.md) |
| **策略** | **D1.A**：待付款 `orders` + `product_stock_reservations`；**不**另建 `checkout_sessions` 表 |
| **保留時間** | **15 分鐘**（`orders.checkout_expires_at` 與保留帳 `expires_at` 對齊） |

---

## 0. 一句話

購物車（前端 localStorage）**不鎖庫存**；進結帳才建 **unpaid 訂單 + 保留帳**，金額**以後端重算為準**。

---

## 1. 端點

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| `POST` | `/api/checkout/sessions` | 會員 | 進結帳：建草稿單 + 鎖庫 |
| `GET` | `/api/checkout/sessions/{orderId}` | 會員（本人） | 讀取結帳中訂單 |
| `PATCH` | `/api/checkout/sessions/{orderId}` | 會員（本人） | 更新收件／付款方式／套券 |
| `POST` | `/api/checkout/sessions/{orderId}/confirm-cod` | 會員 | 確認 COD（不走 ECPay） |
| `POST` | `/api/checkout/sessions/{orderId}/ecpay` | 會員 | 取得／刷新綠界付款表單參數 |
| `POST` | `/api/checkout/sessions/{orderId}/cancel` | 會員 | 取消並釋放保留 |

> `{orderId}` = `orders.id`。路徑用 sessions 語意，持久化用 orders。

---

## 2. 建立結帳 — `POST /api/checkout/sessions`

### 2.1 Request

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `items` | array | 是 | 至少 1 筆 |
| `items[].variantId` | string | 是 | `product_variants.id` |
| `items[].quantity` | integer | 是 | `> 0` |
| `couponClaimId` | number \| null | 否 | 要用的 `coupon_claims.id` |
| `paymentMethod` | string \| null | 否 | 初值可後 PATCH；見 ENUM |
| `shipping` | object \| null | 否 | 未填可用佔位，PATCH 後再送出付款 |
| `shipping.method` | string | 否 | `delivery`（預設）或 `pickup` |
| `shipping.recipientName` | string | 條件 | |
| `shipping.phone` | string | 條件 | |
| `shipping.address` | string | 條件 | |
| `shipping.pickupBranchId` | string \| null | 條件 | `pickup` 必填，後端依 `branches` 主檔取得地址 |
| `idempotencyKey` | string | 是 | 1～128 字元；防重複建單 |

**忽略（不可當真相）：** 前端傳的 `unitPrice`／`total`／`discount`（可選帶入僅供對照；不符 → `CONFLICT`）。

### 2.2 伺服器行為（寫死）

1. 驗證會員 active  
2. 依 `variantId` 讀可賣價與庫存（交易內悲觀鎖）  
3. 建立 `orders`：`payment_status=unpaid`，`status` 依實作（建議草稿可視為尚未履約的 `unshipped` 或文件化佔位規則）  
4. 建立 `order_items`（快照欄位從 DB 填）  
5. 建立 `product_stock_reservations`（`status=active`，`expires_at=now+15m`）  
6. 若有券：驗證資格後寫入關聯（見 Coupon 契約）；金額重算  
7. 回傳 `CheckoutSession`

### 2.2.1 冪等與空值規則

- `idempotencyKey` 以會員為範圍唯一，保存於 `orders.checkout_idempotency_key`。
- 相同會員使用相同鍵與相同正規化 Payload 重送時，回傳原本的 `CheckoutSession`，不得建立第二張訂單或第二組庫存保留。
- 相同會員重用相同鍵但 Payload 不同時，回傳 `409 CONFLICT`。
- 正規化 Payload 的 SHA-256 指紋保存於 `orders.checkout_request_hash`。
- `items`、`items[]`、`variantId`、正整數 `quantity` 與 `idempotencyKey` 不得為空；空 Body 或無效 JSON 回傳 `400 VALIDATION_ERROR`。
- `shipping` 可空；收件人、電話或地址不足時以 `PENDING_CHECKOUT` 建立草稿，避免違反訂單快照的 `NOT NULL`，並回傳 `checkoutStep=draft`。

### 2.3 Response — `CheckoutSession`

| JSON | 型別 | 說明／DB |
|------|------|----------|
| `orderId` | string | `orders.id` |
| `paymentStatus` | string | `unpaid`（建立時） |
| `paymentMethod` | string \| null | `orders.payment_method` |
| `status` | string | `orders.status` |
| `checkoutExpiresAt` | string \| null | ISO-8601；COD 確認成立後為 `null` |
| `pricing` | object | **後端重算**（見下） |
| `items` | array | 見 Order 契約精簡版 |
| `shipping` | object \| null | 收件快照 |
| `couponClaimId` | number \| null | 已套用的領券 id |
| `checkoutStep` | string | `draft` \| `ready_to_pay` \| `completed`；COD 確認後為 `completed` |

#### `pricing`（寫死）

| JSON | 型別 | DB |
|------|------|-----|
| `subtotal` | string | `orders.subtotal` |
| `shippingFee` | string | `orders.shipping_fee` |
| `discount` | string | `orders.discount` |
| `total` | string | `orders.total` |

必須滿足：`total = max(subtotal + shippingFee - discount, 0)`（與 DB CHECK 一致）。

#### `items[]`（結帳回傳）

| JSON | 型別 | DB |
|------|------|-----|
| `orderItemId` | number | `order_items.id` |
| `productId` | string | `order_items.product_id` |
| `variantId` | string | `order_items.variant_id` |
| `sku` | string | `sku_snapshot` |
| `productName` | string | `product_name_snapshot` |
| `specification` | string | `specification_snapshot` |
| `brandName` | string | `brand_name_snapshot` |
| `imageUrl` | string \| null | `image_url_snapshot` |
| `unitPrice` | string | `unit_price_snapshot` |
| `quantity` | integer | `quantity` |
| `lineTotal` | string | `unitPrice * quantity`（後端算） |

---

## 3. PATCH — 更新結帳

可更新欄位（僅 `payment_status=unpaid`、未取消且未過期）：

| 欄位 | 說明 |
|------|------|
| `shipping.*` | 更新收件快照 |
| `paymentMethod` | `ecpay-credit` \| `ecpay-atm` \| `ecpay-cvs` \| `ecpay-other` \| `cod` |
| `couponClaimId` | 已完成；非空值套用或切換會員 claim，空 JSON `{}` 清除目前套券 |

Request 範例：

```json
{
  "shipping": {
    "recipientName": "王小明",
    "phone": "0912345678",
    "address": "台北市信義區"
  },
  "paymentMethod": "ecpay-credit",
  "couponClaimId": null
}
```

- `shipping` 與 `paymentMethod` 採部分更新；未提供的欄位保留原值。
- Request 至少要提供一個收件欄位或 `paymentMethod`。
- 收件欄位若有提供，不可為空白；長度上限分別為姓名 `100`、電話 `32`、地址 `500`。
- 更新交易使用訂單悲觀鎖，避免與付款、取消或 C-6 逾時排程互相覆蓋。
- 回應中的 `couponClaimId` 為目前訂單已套用的 claim；未套券時為 `null`。
- 不可修改 `items` 數量；要改商品請先 cancel 再重新建立 Checkout。

---

## 4. confirm-cod / ecpay / cancel

| 動作 | 條件 | 結果 |
|------|------|------|
| `confirm-cod` | `paymentMethod=cod`，`checkoutStep=ready_to_pay` | 確認下單；**仍 unpaid**，清除 Checkout 與 active 保留帳期限，直到履約或取消 |
| `ecpay` | 非 `cod`，`ready_to_pay` | 回傳綠界表單欄位（見 Payment 契約）；不代表已付款 |
| `cancel` | unpaid | 訂單取消、保留帳 `released`／`expired` |

### 4.1 自動逾時規則

- 排程預設每 `60000` 毫秒掃描一次，期限判斷包含 `checkoutExpiresAt <= now`。
- 只有 `paymentStatus=unpaid`、尚未取消且已達期限的訂單會被處理。
- 同一交易內將 `orders.status` 改為 `cancelled`、active 保留帳改為 `expired`，並設定 `releasedAt=now`。
- `order_status_history` 新增一筆 `cancelled`，固定 `note="Checkout expired"`。
- `checkoutExpiresAt` 保留原值供稽核；重複掃描不重複修改資料或新增歷程。
- 會員主動取消使用 `released`；排程自動逾時使用 `expired`，兩者語意不可混用。

---

## 5. 錯誤（領域）

| 情況 | HTTP | code（建議） |
|------|------|--------------|
| 庫存不足 | 409 | `STOCK_INSUFFICIENT` |
| 規格下架 | 409 | `VARIANT_NOT_SELLABLE` |
| 結帳逾時 | 409 | `CHECKOUT_EXPIRED` |
| 非本人訂單 | 403 | `FORBIDDEN` |
| 券不可用 | 409 | `COUPON_NOT_APPLICABLE` |
| 缺少 Body／商品／冪等鍵 | 400 | `VALIDATION_ERROR` |
| 相同冪等鍵搭配不同 Payload | 409 | `CONFLICT` |

（實作時把新 code 加進 `ErrorCode` 與本表。）

---

## 6. v0.1 不做

| 項目 | 原因 |
|------|------|
| 伺服端購物車 CRUD | MVP 用 localStorage |
| 結帳中改明細數量 | 簡化；cancel + 重建 |
| 獨立 `checkout_sessions` 表 | 已選 D1.A |
| 預約結帳 | 見 Booking 契約 |

---

## 7. 與舊 Mock

舊 `API.orders.create` **作廢為真相路徑**；改走本契約。Mock 應模擬 `CheckoutSession` 形狀，不可再信任前端自算 total。

---

## Changelog

| 版本 | 日期 | 說明 |
|------|------|------|
| 0.8 | 2026-07-23 | `POST …/ecpay` 已接線 D（見 Payment 契約 v0.2） |
| 0.6 | 2026-07-22 | 完成會員本人 Checkout Session 讀取、Bearer 與 PostgreSQL 驗收 |
| 0.7 | 2026-07-22 | 新增配送方式／取貨門市契約與 COD 確認，ECPay 維持待實作 |
| 0.5 | 2026-07-21 | F-2：建立／更新 Checkout 可套用會員 claim，後端重算折扣並保存 `order_coupons` 快照 |
| 0.4 | 2026-07-21 | C-4：完成收件資料與付款方式 PATCH；優惠券套用明確延後至 F-2 |
| 0.3 | 2026-07-21 | C-6：鎖定自動逾時條件、`expired` 保留帳、狀態歷程與冪等規則 |
| 0.2 | 2026-07-20 | C-2：冪等鍵必填、重送回放、Payload 衝突與空值保障 |
| 0.1 | 2026-07-20 | D1.A + 15 分 + pricing 字串金額 |
