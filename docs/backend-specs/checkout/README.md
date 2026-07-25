# Checkout C-2～C-8 整合說明

本文件是 Checkout 後端流程、規則與驗收的主要閱讀入口，整合 C-2、C-3、C-4、C-5、C-6、C-7、C-8。API 欄位仍以 [`checkout-api-contract.md`](../../api/checkout-api-contract.md) 為準。

| 欄位 | 內容 |
|------|------|
| **狀態** | C-2～C-8、商城優惠券、Checkout Read 與 COD Confirm 已實作 |
| **更新日期** | 2026-07-24 |
| **文件定位** | Checkout C-2～C-8 唯一流程與驗收文件 |
| **持久化策略** | D1.A：待付款 `orders` + `order_items` + `product_stock_reservations` |
| **保留時間** | 15 分鐘 |

## 1. 用途

Checkout 負責在會員進入結帳時建立待付款訂單、由資料庫價格重算金額並保留庫存。它同時處理重複送出、防超賣、更新收件資料、會員取消，以及 15 分鐘未付款自動釋放。

目前已實作的端點：

| 方法 | 路徑 | 用途 |
|------|------|------|
| `POST` | `/api/checkout/sessions` | 建立 Checkout、訂單快照與庫存保留 |
| `GET` | `/api/checkout/sessions/{orderId}` | 讀取本人 Checkout 最新快照 |
| `PATCH` | `/api/checkout/sessions/{orderId}` | 更新本人 Checkout 的收件資料與付款方式 |
| `POST` | `/api/checkout/sessions/{orderId}/cancel` | 取消本人未付款 Checkout 並釋放保留 |
| `POST` | `/api/checkout/sessions/{orderId}/confirm-cod` | 確認貨到付款成立並移除 Checkout 期限 |

`ecpay` 仍屬 Payment 工作，不應從契約存在誤判為已實作。

## 2. 完整流程

```text
前端購物車（不鎖庫存）
→ POST /api/checkout/sessions
→ 驗證會員、商品、數量與 idempotencyKey
→ 合併相同 variant，建立正規化請求指紋
→ 悲觀鎖定會員列，檢查同會員冪等鍵
   ├─ 相同鍵、相同內容：回傳原 Checkout
   ├─ 相同鍵、不同內容：409 CONFLICT
   └─ 新請求：悲觀鎖定庫存列
→ 從 DB 取得價格、商品快照與可用量
→ 建立 unpaid 訂單、明細快照與 active 保留帳
→ checkoutExpiresAt = 建立時間 + 15 分鐘
→ 收件與付款資料不足：draft
→ 收件與付款資料完整：ready_to_pay
```

建立後可能進入三條路徑：

```text
GET 讀取最新快照
→ 依 Firebase Principal 與 orderId 查詢本人訂單
→ 回傳後端金額、商品、收件、優惠券與期限
→ 不修改訂單、期限或庫存保留

PATCH 更新資料
→ 鎖定本人訂單
→ 確認 unpaid、未取消、未逾時
→ 部分更新收件快照與付款方式
→ 回傳最新 CheckoutSession

COD 確認
→ 僅接受 paymentMethod=cod 且仍可編輯的 Ready Session
→ 有套券時鎖定 claim 並改為 consumed，寫入 consumed_at
→ paymentStatus 維持 unpaid
→ checkoutExpiresAt 與 active 保留帳 expiresAt 清為 null
→ 回傳 checkoutStep=completed

會員取消
→ 訂單 cancelled
→ 有套券時 claim 改為 revoked
→ active 保留帳改為 released
→ 寫入 Cancelled by customer 歷程

排程逾時
→ 每分鐘尋找 checkoutExpiresAt <= now 的未付款訂單
→ 鎖定並重新檢查
→ 訂單 cancelled
→ 有套券時 claim 改為 expired
→ active 保留帳改為 expired
→ 寫入 Checkout expired 歷程
```

## 3. 分層責任

| 層級 | 元件 | 責任 |
|------|------|------|
| Controller | `CheckoutController` | Bearer 會員、參數綁定、Validation、統一 Envelope |
| Application | `CheckoutService` | 建立、更新、取消、金額重算與交易編排 |
| Scheduler | `CheckoutExpirationScheduler` | 依設定週期觸發，不承擔交易規則 |
| Application | `CheckoutExpirationService` | 單一交易內取消逾時訂單、釋放保留與寫歷程 |
| Domain | `Order`、`ProductStockReservation` | 狀態轉換與重複呼叫保護 |
| Repository | Checkout、Order、Stock repositories | 查詢、持久化與 `PESSIMISTIC_WRITE` |
| PostgreSQL | UNIQUE、FK、CHECK、ENUM | 最後一道資料完整性防護 |

## 4. 核心規則

### 4.1 冪等與輸入

- `idempotencyKey` 必填，長度 1～128。
- 商品至少一筆，`variantId` 不可空，`quantity` 必須大於 0。
- 空 Body、錯誤 JSON 或 Validation 失敗回 `400 VALIDATION_ERROR`。
- 同會員、同鍵、相同正規化內容回放原訂單。
- 同會員、同鍵、不同內容回 `409 CONFLICT`。
- `UNIQUE (customer_id, checkout_idempotency_key)` 是併發下的資料庫防線。

### 4.2 庫存與金額

- 可用量為現有庫存扣除 `active` 商品保留量。
- 庫存列使用悲觀鎖，競爭最後一件庫存時只允許一筆成功。
- Request 不接受商品單價與總額作為計價真相。
- `subtotal`、`shippingFee`、`discount`、`total` 由後端使用 DB 價格計算並以兩位小數字串回傳。
- 訂單明細保存商品、SKU、規格、品牌、圖片與單價快照。

### 4.3 更新 Checkout

- 只能更新目前登入會員自己的 Checkout。
- 只能更新 `payment_status=unpaid`、未取消且未逾時的 Checkout。
- `shipping.recipientName`、`phone`、`address` 與 `paymentMethod` 採部分更新；未提供欄位保留原值。
- 支援 `ecpay-credit`、`ecpay-atm`、`ecpay-cvs`、`ecpay-other`、`cod`。
- 不可在 PATCH 修改商品明細；需要改商品時先取消再建立。
- 非空 `couponClaimId` 會驗證 claim 所有人、狀態、券效期、資格與最低消費，再由後端重算折扣。
- 同訂單重送相同 claim 時保留原快照並回傳成功；只有切換成另一張券時才先刪除舊快照、Flush，再新增快照。
- 空 JSON `{}` 代表清除目前套券；只更新配送或付款且未提供 `couponClaimId` 時，保留現有優惠券。

### 4.4 取消與逾時

| 情況 | 訂單 | 保留帳 | 歷程備註 |
|------|------|--------|----------|
| 會員主動取消 | `cancelled` | `released` | `Cancelled by customer` |
| 排程自動逾時 | `cancelled` | `expired` | `Checkout expired` |

- 已綁定 claim 在主動取消時改為 `revoked`，自動逾時時改為 `expired`；都不回到可用狀態。
- 期限等於 `now` 也視為到期。
- 已付款、未到期或已取消訂單不由逾時流程修改。
- `checkout_expires_at` 保留原值供稽核。
- 重複執行逾時服務不會新增第二筆相同歷程。
- PATCH、取消與逾時排程都鎖定訂單，避免互相覆寫。

## 5. 手動驗證

### swagger 驗證流程

測試前確認：

- PostgreSQL 與後端已啟動。
- `FIREBASE_ENABLED=false`。
- Seed 已建立 `main`、`branch-001`～`branch-003` 四個商城庫位與 39 個 variant 庫存；Checkout 會依庫位 ID 順序選取可用庫存。
- Swagger 網址為 `http://localhost:8080/swagger-ui.html`。
- 每次建立新 Checkout 都要使用新的 `idempotencyKey`。
- 如果先前有未取消、未逾時的 Checkout，實際可用庫存會再扣除該筆 active 保留。

#### 1. 建立開發會員並授權

先執行：

```http
POST /api/auth/firebase/session
```

Request Body：

```json
{
  "idToken": "dev:uid-c2:c2@example.com:google:C2Tester"
}
```

預期 HTTP 200，建立或取得開發會員。

接著點 Swagger 右上角綠色 `Authorize` 按鈕，輸入：

```text
dev:uid-c2:c2@example.com:google:C2Tester
```

不需要自行加上 `Bearer`。

#### 2. C-2：建立 Checkout

執行：

```http
POST /api/checkout/sessions
```

每次建立新測試時遞增 `idempotencyKey`：

```json
{
  "items": [
    {
      "variantId": "V001",
      "quantity": 1
    }
  ],
  "paymentMethod": "ecpay-credit",
  "shipping": {
    "recipientName": "王小明",
    "phone": "0912345678",
    "address": "台北市信義區測試路 1 號"
  },
  "idempotencyKey": "swagger-c2-test-001"
}
```

預期：

- HTTP 200。
- `paymentStatus` 為 `unpaid`。
- `status` 為 `unshipped`。
- `checkoutStep` 為 `ready_to_pay`。
- `checkoutExpiresAt` 約為建立時間後 15 分鐘。
- `pricing` 使用後端計算結果。
- 記下實際回傳的 `orderId`，後續 PATCH 與取消都使用這個值。

回應範例：

```json
{
  "success": true,
  "data": {
    "orderId": "O實際訂單編號",
    "paymentStatus": "unpaid",
    "paymentMethod": "ecpay-credit",
    "status": "unshipped",
    "checkoutExpiresAt": "2026-07-21T10:15:00Z",
    "pricing": {
      "subtotal": "3200.00",
      "shippingFee": "0.00",
      "discount": "0.00",
      "total": "3200.00"
    },
    "items": [
      {
        "orderItemId": 1,
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
    ],
    "shipping": {
      "recipientName": "王小明",
      "phone": "0912345678",
      "address": "台北市信義區測試路 1 號"
    },
    "couponClaimId": null,
    "checkoutStep": "ready_to_pay"
  }
}
```

若回 HTTP 409 且 `error.code=STOCK_INSUFFICIENT`，表示 `V001` 沒有足夠的可用庫存，或有其他 Checkout 正在保留庫存。
錯誤明細會以 `equipment_items.name + "商品數量剩餘: " + availableQuantity` 顯示商品名稱與目前可用數量，不顯示內部 `variantId`。

#### 3. C-2：驗證冪等重送

再次執行完全相同的 `POST /api/checkout/sessions`，Request Body 與 `idempotencyKey` 都不可改變。

預期：

- HTTP 200。
- 回傳與第一次相同的 `orderId`。
- 驗收標準:
    檢查項目	  第一次	  第二次重送
    orderId	   O123…	   同一個 O123…
    訂單數量	  1	        仍是 1
    訂單明細數	1	        仍是 1
    保留帳數量	1	        仍是 1
    保留數量	  1	        仍是 1

#### 4. C-2：驗證相同冪等鍵但內容不同

保留原本的 `idempotencyKey`，只修改數量：

```json
{
  "items": [
    {
      "variantId": "V001",
      "quantity": 2
    }
  ],
  "paymentMethod": "ecpay-credit",
  "shipping": {
    "recipientName": "王小明",
    "phone": "0912345678",
    "address": "台北市信義區測試路 1 號"
  },
  "idempotencyKey": "swagger-c2-test-001"
}
```

預期：

- HTTP 409。
- `error.code` 為 `CONFLICT`。
- 不會修改原訂單，也不會建立新訂單。

#### 5. C-4：更新 Checkout

使用步驟 2 實際回傳的 `orderId`：

```http
PATCH /api/checkout/sessions/{orderId}
```

Request Body：

```json
{
  "shipping": {
    "recipientName": "王小明",
    "phone": "0987654321",
    "address": "新北市板橋區測試路 100 號"
  },
  "paymentMethod": "cod",
  "couponClaimId": null
}
```

預期：

- HTTP 200。
- `orderId` 不變。
- `paymentMethod` 變成 `cod`。
- `shipping.phone` 與 `shipping.address` 已更新。
- `checkoutStep` 維持 `ready_to_pay`。
- 商品明細與價格不變。

目前 PATCH 支援 `ecpay-credit`、`ecpay-atm`、`ecpay-cvs`、`ecpay-other`、`cod`。

#### 6. F-2：驗證優惠券套用

對相同 Checkout 執行 PATCH：

```json
{
  "couponClaimId": 1
}
```

`1` 必須換成目前會員以 `POST /api/me/coupons/claims` 領取後取得的 claim ID。

預期 HTTP 200，回應 `couponClaimId` 為該 claim，且 `pricing.discount`、`pricing.total` 為後端重算結果。再次送出相同內容仍應 HTTP 200，且資料庫只保留一筆 `order_coupons`；換成另一個有效 claim 時才替換快照。完整步驟見 [`Checkout 優惠券冪等 Swagger 驗證`](../test/checkout-coupon-idempotency-swagger-validation.md)。

#### 7. C-3：驗證庫存不足

使用新的 `idempotencyKey`，要求超過 Seed 的 10 件庫存：

```json
{
  "items": [
    {
      "variantId": "V001",
      "quantity": 11
    }
  ],
  "paymentMethod": "ecpay-credit",
  "shipping": {
    "recipientName": "王小明",
    "phone": "0912345678",
    "address": "台北市信義區測試路 1 號"
  },
  "idempotencyKey": "swagger-c3-stock-002"
}
```

預期：

- HTTP 409。
- `error.code` 為 `STOCK_INSUFFICIENT`。
- 不會建立訂單或庫存保留。

Swagger 無法穩定製造兩個請求同時搶最後一件庫存；真正的防超賣併發行為要由 PostgreSQL 整合測試驗證。

#### 8. C-7：驗證後端金額重算

建立新的 Checkout，故意加入偽造價格：

```json
{
  "items": [
    {
      "variantId": "V001",
      "quantity": 1,
      "unitPrice": "0.01"
    }
  ],
  "paymentMethod": "ecpay-credit",
  "shipping": {
    "recipientName": "王小明",
    "phone": "0912345678",
    "address": "台北市信義區測試路 1 號"
  },
  "total": "0.01",
  "idempotencyKey": "swagger-c7-price-003"
}
```

預期：

- HTTP 200。
- 前端提供的 `unitPrice` 與 `total` 不會成為計價依據。
- `V001` 的 `unitPrice` 仍為資料庫價格 `"3200.00"`。
- `subtotal` 與 `total` 仍為 `"3200.00"`。

測試完成後，記下這張訂單的 `orderId` 並取消，避免繼續保留庫存。

#### 9. C-5：取消 Checkout

使用實際建立成功的 `orderId`：

```http
POST /api/checkout/sessions/{orderId}/cancel
```

此端點沒有 Request Body。不要使用文件中的示意訂單編號，必須使用這次建立 Checkout 真正回傳的 `orderId`。

預期：

- HTTP 200。
- `status` 為 `cancelled`。
- `paymentStatus` 仍為 `unpaid`。
- active 庫存保留改為 `released`。
- 商品庫存可以重新被其他 Checkout 保留。

取消後再對相同 `orderId` 執行 PATCH，預期 HTTP 409，`error.code` 為 `CHECKOUT_EXPIRED`。

#### 10. C-6／C-8：手動驗證逾時

建立一張新的 Checkout：

```json
{
  "items": [
    {
      "variantId": "V001",
      "quantity": 1
    }
  ],
  "paymentMethod": "ecpay-credit",
  "shipping": {
    "recipientName": "逾時測試",
    "phone": "0912345678",
    "address": "台北市測試路 15 號"
  },
  "idempotencyKey": "swagger-c6-expiration-004"
}
```

在 DBeaver 可以用 SQL 直接調整指定 Checkout，操作如下。
  - 開啟 DBeaver，連上 yuruicamp 資料庫。
  - 對資料庫按右鍵，選「SQL 編輯器 → 新增 SQL 腳本」。
  - 把下面的 你的ORDER_ID 換成 Swagger 回傳的 orderId。
先確認目標訂單：(沒有表示沒有DBeaver 沒有到5433)
```SQL
SELECT
    id,
    status,
    payment_status,
    checkout_expires_at,
    now() AS database_now
FROM orders
WHERE id = '你的ORDER_ID';
```
確認 ID 正確後，執行：
```SQL
BEGIN;

UPDATE orders
SET checkout_expires_at = now() - interval '1 second',
    updated_at = now()
WHERE id = '你的ORDER_ID'
  AND payment_status = 'unpaid'
  AND status <> 'cancelled';

UPDATE product_stock_reservations r
SET expires_at = now() - interval '1 second'
FROM order_items oi
WHERE oi.id = r.order_item_id
  AND oi.order_id = '你的ORDER_ID'
  AND r.status = 'active';

COMMIT;
```

驗證：
```SQL
SELECT id, status, payment_status, checkout_expires_at
FROM orders
WHERE id = '你的 orderId';

SELECT r.id, r.status, r.expires_at, r.released_at
FROM product_stock_reservations r
JOIN order_items oi ON oi.id = r.order_item_id
WHERE oi.order_id = '你的 orderId';
```

之後對該 `orderId` 執行 PATCH：

```json
{
  "paymentMethod": "cod"
}
```

預期：
- HTTP 409。
- `error.code` 為 `CHECKOUT_EXPIRED`。 (swagger 看)
- 訂單已由排程改為 `cancelled`。 (DBeaver 看)
- 保留帳已由 `active` 改為 `expired`。 (DBeaver 看)

可再呼叫 `GET /api/checkout/sessions/{orderId}` 讀取逾時後的最新 Checkout，預期 `status=cancelled` 且保留原本 `checkoutExpiresAt`。`expired`、庫存恢復與排程冪等仍應由 PostgreSQL 整合測試確認。

#### Swagger 驗收完成標準

- 建立 Checkout：HTTP 200。
- 相同鍵與相同內容：HTTP 200，`orderId` 相同。
- 相同鍵但不同內容：HTTP 409 `CONFLICT`。
- 更新本人 Checkout：HTTP 200。
- 有效優惠券首次套用與同 claim 重送：HTTP 200，且訂單只有一筆券快照。
- 庫存不足：HTTP 409 `STOCK_INSUFFICIENT`。
- 偽造價格：回應仍使用 DB 價格。
- 主動取消：HTTP 200，狀態為 `cancelled`。
- 取消或逾時後 PATCH：HTTP 409 `CHECKOUT_EXPIRED`。



## 6. 開發 Seed

[`docs/seed/002-dev-seed.sql`](../../seed/002-dev-seed.sql) 會建立：

- 商城庫位 `main`、`branch-001`～`branch-003`。
- 39 個商品規格的 156 筆 on-hand 庫存，以及展示訂單對應的 active／expired／fulfilled 保留。

既有資料庫可依 [`docs/seed/README.md`](../../seed/README.md) 手動重跑 Seed；重跑會還原 156 筆商城庫存與 435 筆展示訂單保留，執行前先確認不需要保留同 ID 的手動測試狀態。

## 7. 測試與驗收

| 項目 | 已驗證內容 |
|------|------------|
| Checkout Read | 本人完整快照、Bearer、他人／未知拒絕，不修改訂單或保留帳 |
| C-2 | 冪等回放、同鍵不同內容衝突、空值、同會員併發 |
| C-3 | 悲觀鎖、防超賣、最後一件庫存競爭 |
| C-4 | 本人限制、部分更新、期限與狀態拒絕、PATCH／排程競爭 |
| C-5 | 主動取消、保留帳 `released` |
| C-6 | 每分鐘掃描、交易內逾時取消與釋放 |
| C-7 | 偽造前端金額不會覆蓋 DB 計價 |
| C-8 | 逾時、庫存恢復與重複執行冪等 |
| F-2 | 同 claim 重送冪等、換券替換快照、折扣由後端重算 |

整合測試使用自己建立的專屬資料，不依賴共用開發 Seed。測試環境停用背景 Scheduler，使用固定 `Clock` 直接呼叫逾時服務，不需要真的等待 15 分鐘。

```powershell
cd backend
$env:RUN_BACKEND_IT = "true"
$env:DB_PASSWORD = "你的 POSTGRES_PASSWORD"
.\mvnw.cmd "-Dtest=CheckoutPostgreSqlIntegrationTest" test
```
## 8. 設定

| 設定鍵 | 預設值 | 用途 |
|--------|--------|------|
| `yuruicamp.checkout.expiration-enabled` | `true` | 是否啟用逾時排程 |
| `yuruicamp.checkout.expiration-scan-ms` | `60000` | 每次掃描完成後到下次掃描的毫秒數 |

## 9. 後續工作

- 前端／本機「建立 Checkout 失敗」追蹤（先記錄、暫不改 Firebase）：見 [`plans/post-firebase-roadmap-checklist.md`](../../../plans/post-firebase-roadmap-checklist.md) **CK-1～CK-5**。
- D：完成 ECPay Gateway、付款表單、Notify webhook、Return URL 與商城 COD（對應 checklist **CK-5**）。
