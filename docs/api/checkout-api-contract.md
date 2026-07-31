# Checkout API Contract（v0.15）

| 欄位         | 內容                                                                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **狀態**     | Implemented（Prepare、Read、Update、COD Confirm、Cancel、ECPay Launch、CVS 電子地圖）                                                                              |
| **日期**     | 2026-07-30                                                                                                                                                       |
| **Commerce UX** | `displayNo`、checkout 進頁鎖庫、M2 一次 ECPay → [`../backend-specs/commerce/display-numbers-and-checkout-ux.md`](../backend-specs/commerce/display-numbers-and-checkout-ux.md) |
| **版本**     | 0.15                                                                                                                                                             |
| **共用**     | [`common-api-conventions.md`](./common-api-conventions.md)                                                                                                       |
| **相關**     | [`order-api-contract.md`](./order-api-contract.md)、[`payment-api-contract.md`](./payment-api-contract.md)、[`coupon-api-contract.md`](./coupon-api-contract.md) |
| **物流驗收** | [`../backend-specs/logistics/ecpay-cvs-sandbox-validation.md`](../backend-specs/logistics/ecpay-cvs-sandbox-validation.md)、[`../backend-specs/logistics/ecpay-real-sandbox-validation.md`](../backend-specs/logistics/ecpay-real-sandbox-validation.md) |
| **實作說明** | [`../backend-specs/checkout/README.md`](../backend-specs/checkout/README.md)                                                                                     |
| **策略**     | **D1.A**：待付款 `orders` + `product_stock_reservations`；**不**另建 `checkout_sessions` 表                                                                      |
| **保留時間** | **15 分鐘**（`orders.checkout_expires_at` 與保留帳 `expires_at` 對齊）                                                                                           |

---

## 0. 一句話

購物車（前端 localStorage）**不鎖庫存**；進結帳才建 **unpaid 訂單 + 保留帳**，金額**以後端重算為準**。超商取貨須先選店再寫入 `shipping.method=cvs`。

---

## 1. 端點

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| `POST` | `/api/checkout/sessions` | 會員 | 進結帳：建草稿單 + 鎖庫 |
| `GET` | `/api/checkout/sessions/{orderId}` | 會員（本人） | 讀取結帳中訂單 |
| `PATCH` | `/api/checkout/sessions/{orderId}` | 會員（本人） | 更新收件／配送／付款方式／套券 |
| `POST` | `/api/checkout/sessions/{orderId}/confirm-cod` | 會員 | 確認 COD（不走 ECPay） |
| `POST` | `/api/checkout/sessions/{orderId}/ecpay` | 會員 | 取得／刷新綠界**付款**表單參數 |
| `POST` | `/api/checkout/sessions/{orderId}/ecpay/cvs-map` | 會員 | 取得綠界**超商電子地圖**表單參數（物流，非付款） |
| `POST` | `/api/checkout/sessions/{orderId}/cancel` | 會員 | 取消並釋放保留 |

> `{orderId}` = `orders.id`。路徑用 sessions 語意，持久化用 orders。

> **勿混淆：** `…/ecpay`＝金流 AIO；`…/ecpay/cvs-map`＝物流選店。付款方式 `ecpay-cvs`（超商代碼繳費）≠ 配送方式 `cvs`（超商取貨）。

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
| `shipping.method` | string | 否 | `delivery`（預設）、`pickup`、或 `cvs`（須已有門市 id，見 §2.2.2） |
| `shipping.recipientName` | string | 條件 | 物流收件人（`recipient_name_snapshot`）；CVS／宅配須符合綠界 ReceiverName 規則 |
| `shipping.phone` | string | 條件 | |
| `shipping.address` | string | 條件 | `delivery` 為宅配地址；`cvs` 選店後常為門市地址字串 |
| `shipping.pickupBranchId` | string \| null | 條件 | `pickup` 必填，後端依 `branches` 主檔取得地址 |
| `shipping.cvsStoreId` | string \| null | 條件 | `cvs` 必填（選店後才有）；未選店不可寫 `method=cvs` |
| `shipping.cvsStoreName` | string \| null | 否 | 門市名稱快照 |
| `shipping.cvsSubType` | string \| null | 否 | 例 `FAMI`；空白時後端用物流設定預設 |
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

### 2.2.2 配送方式與 CVS 選店

| `shipping.method` | 必要條件 | 說明 |
|-------------------|----------|------|
| `delivery` | 收件人／電話／地址（宅配） | Admin 出貨時建綠界 **HOME/TCAT** 物流單 |
| `pickup` | `pickupBranchId` | 自家門市取貨；**不**呼叫綠界物流 |
| `cvs` | `cvsStoreId` 非空 | 綠界超商取貨（FAMI）；未選店時**不可**寫入 `method=cvs`（DB `ck_orders_shipping_target`） |

選店流程：

```text
POST …/ecpay/cvs-map → 瀏覽器 POST 綠界電子地圖
→ 綠界 callback POST /api/logistics/ecpay/map-result
→ 寫入 orders.cvs_store_* 並切 shipping_method=cvs
→ 導回前端 checkout（門市名稱可見）
```

前端在使用者已選「超商取貨」但尚未完成地圖時，PATCH 應保留原 `shipping.method`，只更新收件人／電話；等 map callback 後再帶 `cvsStoreId`。

### 2.3 Response — `CheckoutSession`

| JSON | 型別 | 說明／DB |
|------|------|----------|
| `orderId` | string | `orders.id`（內部主鍵；ECPay CustomField1） |
| `displayNo` | string | `orders.display_no`；人類可讀序號，例 `ORD-0001` |
| `paymentStatus` | string | `unpaid`（建立時） |
| `paymentMethod` | string \| null | `orders.payment_method` |
| `status` | string | `orders.status` |
| `checkoutExpiresAt` | string \| null | ISO-8601；COD 確認成立後為 `null` |
| `pricing` | object | **後端重算**（見下） |
| `items` | array | 見 Order 契約精簡版 |
| `shipping` | object \| null | 收件／配送快照（見下） |
| `couponClaimId` | number \| null | 已套用的領券 id |
| `checkoutStep` | string | `draft` \| `ready_to_pay` \| `completed`；COD 確認後為 `completed` |

#### `shipping`（結帳回傳）

| JSON | 型別 | DB／說明 |
|------|------|----------|
| `method` | string \| null | `delivery` \| `pickup` \| `cvs` |
| `recipientName` | string \| null | `recipient_name_snapshot` |
| `phone` | string \| null | `shipping_phone_snapshot` |
| `address` | string \| null | `shipping_address_snapshot` |
| `pickupBranchId` | string \| null | 門市取貨 |
| `pickupBranchName` | string \| null | 門市名稱（讀取時帶出） |
| `cvsStoreId` | string \| null | `orders.cvs_store_id` |
| `cvsStoreName` | string \| null | `orders.cvs_store_name` |
| `cvsSubType` | string \| null | `orders.cvs_sub_type`（例 `FAMI`） |

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
| `shipping.*` | 更新收件／配送快照（含 `method`、`cvsStore*`、`pickupBranchId`） |
| `paymentMethod` | `ecpay-credit` \| `ecpay-atm` \| `ecpay-cvs` \| `ecpay-other` \| `cod` |
| `couponClaimId` | 已完成；非空值套用或切換會員 claim，空 JSON `{}` 清除目前套券 |

Request 範例（宅配）：

```json
{
  "shipping": {
    "method": "delivery",
    "recipientName": "陳柏榮",
    "phone": "0912345678",
    "address": "408 台中市南屯區公益路190號"
  },
  "paymentMethod": "ecpay-credit",
  "couponClaimId": null
}
```

- `shipping` 與 `paymentMethod` 採部分更新；未提供的欄位保留原值。
- Request 至少要提供一個收件欄位或 `paymentMethod`。
- 收件欄位若有提供，不可為空白；長度上限分別為姓名 `100`、電話 `32`、地址 `500`。
- `cvs`／`delivery`：收件人姓名須通過 `EcpayReceiverNameRules`（中文約 2–5 字或英文 4–10 字，禁 `-`、空格、數字）；`pickup` 只驗非空。詳見 [ADR 0003](../adr/0003-checkout-recipient-sync-member-address.md)。
- 更新交易使用訂單悲觀鎖，避免與付款、取消或 C-6 逾時排程互相覆蓋。
- 回應中的 `couponClaimId` 為目前訂單已套用的 claim；未套券時為 `null`。
- 同一訂單重送相同 `couponClaimId` 視為冪等成功，保留既有 `order_coupons` 快照；改送另一個 claim 才先刪除舊快照再新增。
- 不可修改 `items` 數量；要改商品請先 cancel 再重新建立 Checkout。

---

## 4. confirm-cod / ecpay / cvs-map / cancel

| 動作 | 條件 | 結果 |
|------|------|------|
| `confirm-cod` | `paymentMethod=cod`，`checkoutStep=ready_to_pay` | 確認下單；**仍 unpaid**，消耗已套用 claim，清除 Checkout 與 active 保留帳期限 |
| `ecpay` | 非 `cod`，`ready_to_pay` | 回傳綠界**付款**表單欄位（見 Payment 契約）；不代表已付款 |
| `ecpay/cvs-map` | unpaid、Checkout 可編輯 | 回傳綠界電子地圖表單（形狀同 `EcpayLaunch`）；選店結果由 `/api/logistics/ecpay/map-result` 寫入訂單 |
| `cancel` | unpaid | 主動取消：claim `revoked`、保留帳 `released`；逾時：claim／保留帳 `expired` |

### 4.1 自動逾時規則

- 排程預設每 `60000` 毫秒掃描一次，期限判斷包含 `checkoutExpiresAt <= now`。
- 只有 `paymentStatus=unpaid`、尚未取消且已達期限的訂單會被處理。
- 同一交易內將 `orders.status` 改為 `cancelled`、active 保留帳改為 `expired`，並設定 `releasedAt=now`。
- 訂單有套券時，同一交易將 claim 改為 `expired` 並設定 `revokedAt=now`。
- `order_status_history` 新增一筆 `cancelled`，固定 `note="Checkout expired"`。
- `checkoutExpiresAt` 保留原值供稽核；重複掃描不重複修改資料或新增歷程。
- 會員主動取消使用 claim `revoked`／保留帳 `released`；排程自動逾時兩者都使用 `expired`，語意不可混用。

### 4.2 物流 callback（非 Checkout 路徑，但結帳依賴）

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| `POST` | `/api/logistics/ecpay/map-result` | 無 Bearer；綠界／stub callback | 寫入門市並導回前端 |
| `POST` | `/api/logistics/ecpay/notify` | 無 Bearer；驗 MD5 | 物流狀態；覆寫 Logistics Status Snapshot + `1\|OK`；**不**改 Order Status（見 Admin 契約／ADR 0005） |

建物流單（寫入 `ecpay_logistics_id`）發生在 Admin `POST /api/admin/orders/{id}/ship`，**不是**付款 Notify。見 Admin 契約。

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
| 收件人姓名不符綠界物流格式 | 409 | `CONFLICT`（訊息說明 ReceiverName） |
| 未選店卻寫 `cvs`／缺門市 | 409 | `CONFLICT`（或 DB CHECK 防護） |

（實作時把新 code 加進 `ErrorCode` 與本表。）

---

## 6. v0.1 不做

| 項目 | 原因 |
|------|------|
| 伺服端購物車 CRUD | MVP 用 localStorage |
| 結帳中改明細數量 | 簡化；cancel + 重建 |
| 獨立 `checkout_sessions` 表 | 已選 D1.A |
| 預約結帳 | 見 Booking 契約 |
| 物流 notify 自動改履約狀態 | Phase 3／獨立 spec |

---

## 7. 與舊 Mock

舊 `API.orders.create` **作廢為真相路徑**；改走本契約。Mock 應模擬 `CheckoutSession` 形狀（含 `cvsStore*`），不可再信任前端自算 total。

---

## Changelog

| 版本 | 日期       | 說明                                                                                             |
| ---- | ---------- | ------------------------------------------------------------------------------------------------ |
| 0.15 | 2026-07-30 | `shipping.method=cvs`、`cvsStore*`、`POST …/ecpay/cvs-map`；物流 callback 索引；真沙箱驗收完成後文件對齊 |
| 0.14 | 2026-07-26 | Commerce UX：`displayNo`；前端 B3 checkout 進頁鎖庫；M2 ECPay 一次 launch（spec）                 |
| 0.13 | 2026-07-25 | 合併 ECPay Launch（0.8）與 coupon 生命週期（0.12）                                               |
| 0.12 | 2026-07-24 | 主動取消將已綁 claim 改為 `revoked`；Checkout 逾時將 claim 改為 `expired`                        |
| 0.11 | 2026-07-24 | COD 確認成立時於同一交易將已套用 claim 改為 `consumed` 並設定 `consumed_at`                      |
| 0.10 | 2026-07-24 | 同訂單重送相同 claim 改為冪等成功；只有換券時才替換 `order_coupons` 快照                         |
| 0.9  | 2026-07-23 | Storefront 新增確認背包頁，進頁以 items 建立 Draft 並鎖庫；正式 Checkout 只 PATCH 配送／付款資料 |
| 0.8  | 2026-07-23 | `POST …/ecpay` 已接線 D（見 Payment 契約 v0.2）                                                  |
| 0.7  | 2026-07-22 | 新增配送方式／取貨門市契約與 COD 確認                                                            |
| 0.6  | 2026-07-22 | 完成會員本人 Checkout Session 讀取、Bearer 與 PostgreSQL 驗收                                    |
| 0.5  | 2026-07-21 | F-2：建立／更新 Checkout 可套用會員 claim，後端重算折扣並保存 `order_coupons` 快照               |
| 0.4  | 2026-07-21 | C-4：完成收件資料與付款方式 PATCH；優惠券套用明確延後至 F-2                                      |
| 0.3  | 2026-07-21 | C-6：鎖定自動逾時條件、`expired` 保留帳、狀態歷程與冪等規則                                      |
| 0.2  | 2026-07-20 | C-2：冪等鍵必填、重送回放、Payload 衝突與空值保障                                                |
| 0.1  | 2026-07-20 | D1.A + 15 分 + pricing 字串金額                                                                  |
