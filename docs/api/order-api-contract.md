# Order API Contract（v0.4）

| 欄位 | 內容 |
|------|------|
| **狀態** | Implemented（會員列表與詳情已完成；LINE 追蹤訂單通知已完成） |
| **日期** | 2026-08-02 |
| **版本** | 0.4 |
| **共用** | [`common-api-conventions.md`](./common-api-conventions.md) |
| **相關** | [`checkout-api-contract.md`](./checkout-api-contract.md)、[`n8n-cs-api-contract.md`](./n8n-cs-api-contract.md) §8 |
| **DB** | `orders`、`order_items`、`order_coupons`、`order_status_history` |

---

## 0. 一句話

會員**只讀自己的訂單**；建立訂單只能經 Checkout；金額與明細以 **DB 快照** 為準。

---

## 1. 端點

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| `GET` | `/api/me/orders` | 會員 | 我的訂單列表 |
| `GET` | `/api/me/orders/{orderId}` | 會員（本人） | 訂單詳情 |
| `POST` | `/api/me/orders/{orderId}/line-cs-notify` | 會員（本人） | 通知 n8n：會員主動要求以 LINE 追蹤這張訂單（非狀態變更，觸發後端 → n8n 推播 webhook 的 `cs_inquiry` 事件） |

> 不提供公開 `GET /api/orders?customerId=`（避免越權）。舊前端若用 `customerId=me`，接線時改 `/api/me/orders`。

> C-2 內部持久化：`orders.checkout_idempotency_key` 與 `checkout_request_hash` 僅用於建立 Checkout 的重送回放及衝突偵測，不屬於會員 Order 回應欄位。

後台列表／出貨見 [`admin-api-contract.md`](./admin-api-contract.md)。

### 1.1 `POST /api/me/orders/{orderId}/line-cs-notify`

會員中心訂單詳情「使用 LINE 追蹤訂單」按鈕觸發。此端點**只**發布內部事件通知 n8n，本系統**不**直接呼叫 LINE Push Message API；也**不**取代既有的 n8n 唯讀查詢流程（見 [`n8n-cs-api-contract.md`](./n8n-cs-api-contract.md) §1～§7）。

| 項目 | 說明 |
|------|------|
| 認證 | Firebase Bearer，走既有 `CustomerPrincipal`（同 `GET /api/me/orders/{orderId}`） |
| 成功回應 | 共用 Envelope，`data: null`（無業務本體） |
| `error.code=NOT_FOUND` | 訂單不存在或不屬於本人（沿用「他人／不存在統一 404」規則，不透露是否存在） |
| `error.code=LINE_NOT_LINKED` | 本人尚未完成 LINE 綁定（`customers.line_user_id` 為空） |
| `error.code=UNAUTHORIZED` | 未登入／Token 無效 |

三個 `error.code` 皆為 [`common-api-conventions.md`](./common-api-conventions.md) 既有定義，本次未新增 code。實際推播細節（payload、webhook、失敗行為）見 [`n8n-cs-api-contract.md`](./n8n-cs-api-contract.md) §8。

---

## 2. `Order` 物件（寫死）

### 2.1 訂單頭

| JSON | 型別 | DB |
|------|------|-----|
| `id` | string | `orders.id` |
| `customerId` | string | `orders.customer_id` |
| `buyerName` | string | `buyer_name_snapshot` |
| `buyerEmail` | string | `buyer_email_snapshot` |
| `recipientName` | string | `recipient_name_snapshot` |
| `shippingAddress` | string | `shipping_address_snapshot`（宅配地址或超商門市地址字串） |
| `shippingPhone` | string | `shipping_phone_snapshot` |
| `subtotal` | string | `subtotal` |
| `shippingFee` | string | `shipping_fee` |
| `discount` | string | `discount` |
| `total` | string | `total` |
| `paymentMethod` | string | `payment_method` ENUM |
| `paymentStatus` | string | `payment_status` ENUM |
| `refundStatus` | string | `refund_status` ENUM |
| `status` | string | `order_status` ENUM |
| `placedAt` | string | `placed_at` ISO-8601 |
| `paidAt` | string \| null | `paid_at` |
| `checkoutExpiresAt` | string \| null | `checkout_expires_at` |
| `items` | array | 見下（詳情必含；列表可含精簡） |

### 2.2 `items[]`

| JSON | 型別 | DB |
|------|------|-----|
| `id` | number | `order_items.id` |
| `productId` | string | `product_id` |
| `variantId` | string | `variant_id` |
| `sku` | string | `sku_snapshot` |
| `productName` | string | `product_name_snapshot` |
| `specification` | string | `specification_snapshot` |
| `brandName` | string | `brand_name_snapshot` |
| `imageUrl` | string \| null | `image_url_snapshot` |
| `unitPrice` | string | `unit_price_snapshot` |
| `quantity` | integer | `quantity` |
| `lineTotal` | string | 後端算 `unitPrice * quantity` |

### 2.3 範例（詳情）

```json
{
  "success": true,
  "data": {
    "id": "O1001",
    "customerId": "…",
    "buyerName": "Amy",
    "buyerEmail": "amy@example.com",
    "recipientName": "Amy",
    "shippingAddress": "台北市…",
    "shippingPhone": "09xxxxxxxx",
    "subtotal": "3200.00",
    "shippingFee": "0.00",
    "discount": "0.00",
    "total": "3200.00",
    "paymentMethod": "ecpay-credit",
    "paymentStatus": "paid",
    "refundStatus": "none",
    "status": "unshipped",
    "placedAt": "2026-07-20T03:00:00Z",
    "paidAt": "2026-07-20T03:05:00Z",
    "checkoutExpiresAt": null,
    "items": [
      {
        "id": 1,
        "productId": "P001",
        "variantId": "V001",
        "sku": "TENT-OLIVE",
        "productName": "Coleman 六人帳篷",
        "specification": "深橄欖綠",
        "brandName": "Coleman",
        "imageUrl": "/assets/images/products/P001-1.jpg",
        "unitPrice": "3200.00",
        "quantity": 1,
        "lineTotal": "3200.00"
      }
    ]
  }
}
```

---

## 3. 列表規則

- 僅 `customer_id = 目前登入會員`
- 建議新到舊：`placedAt desc`
- v0.1 可不做分頁；加上時用 common `meta`

---

## 4. 狀態機（精簡，Service 執行）

| `order_status` | 意義 |
|----------------|------|
| `unshipped` | 待出貨（含已付款或 COD 待履約） |
| `shipped` | 已出貨 |
| `completed` | 完成 |
| `returned` | 退貨 |
| `cancelled` | 取消（含結帳逾時） |

會員 API **不可**任意 PATCH 狀態；出貨／完成走後台。Admin 出貨對 `cvs`／`delivery` 會建立綠界物流單（寫 `ecpay_logistics_id`）；見 Admin 契約。DB `shipping_method` 含 `delivery`／`pickup`／`cvs`（見 [`schema-enums.md`](../schema-enums.md)）；會員 Order 回應目前以地址／門市字串呈現，Checkout Session 才回完整 `shipping.method`／`cvsStore*`。

付款狀態見 Payment 契約：`unpaid` → `paid`／`refunded`。

> **勿混淆：** 付款方式 `ecpay-cvs` ≠ 配送方式 `cvs`（超商取貨）。

---

## 5. v0.1 不做

| 項目 | 原因 |
|------|------|
| `POST /api/orders` 直接建單 | 必須走 Checkout |
| 前端自帶 total | 竄改風險 |
| 評價欄位嵌在訂單 | Reviews 延後 |
| Mock 的 localStorage 合併細節 | 接線時用正規化對齊本契約 |

---

## Changelog

| 版本 | 日期 | 說明 |
|------|------|------|
| 0.1 | 2026-07-20 | 會員唯讀訂單；對齊 orders／order_items 快照 |
| 0.2 | 2026-07-22 | 完成會員本人列表、詳情、統一 404 與 PostgreSQL 驗收 |
| 0.3 | 2026-07-30 | 文件：`shippingMethod`／cvs 與 Admin 出貨物流交叉說明 |
| 0.4 | 2026-08-02 | 新增 `POST /api/me/orders/{orderId}/line-cs-notify`：會員中心「使用 LINE 追蹤訂單」觸發，驗證本人訂單與 LINE 綁定後發布 `cs_inquiry` 事件通知 n8n；見 [`n8n-cs-api-contract.md`](./n8n-cs-api-contract.md) §8 |
