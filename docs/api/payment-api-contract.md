# Payment API Contract（v0.3）

| 欄位 | 內容 |
|------|------|
| **狀態** | Implemented（D-1～D-6）；W3 Admin 全額退款 port（stub） |
| **日期** | 2026-07-25 |
| **版本** | 0.3 |
| **共用** | [`common-api-conventions.md`](./common-api-conventions.md) |
| **DB** | `payment_method`／`payment_status` ENUM、`payment_notifications`、`orders`、`bookings` |
| **ENUM** | [`schema-enums.md`](../schema-enums.md) |

---

## 0. 一句話

線上付款**只走 ECPay**；**NotifyURL 是付款真相**；COD **僅商城**且履約後才 `paid`；預約**禁止 COD**。

---

## 1. `payment_method`（寫死）

| 值 | 用途 |
|----|------|
| `ecpay-credit` | 綠界信用卡 |
| `ecpay-atm` | 綠界 ATM |
| `ecpay-cvs` | 綠界超商 |
| `ecpay-other` | 其他綠界通道 |
| `cod` | 貨到付款（**僅 orders**；bookings CHECK 禁止） |

---

## 2. 端點

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| `POST` | `/api/checkout/sessions/{orderId}/ecpay` | 會員 | 商城：取得綠界表單欄位 |
| `POST` | `/api/booking/checkout/sessions/{bookingId}/ecpay` | 會員 | 預約：同上 |
| `POST` | `/api/payments/ecpay/notify` | **無** Bearer；驗簽 | 綠界背景通知（真相） |
| `GET`／`POST` | `/api/payments/ecpay/return` | 無 | 導回前端成功／失敗頁（**不當**付款真相） |
| `POST` | `/api/checkout/sessions/{orderId}/confirm-cod` | 會員 | 商城 COD 確認（見 Checkout） |
| `POST` | `/api/payments/ecpay/stub/simulate-paid` | 無（僅 stub） | 本機模擬 Notify 入帳 |
| `POST` | `/api/payments/ecpay/stub/aio-checkout` | 無（僅 stub） | 本機假綠界付款頁 |

---

## 3. `POST …/ecpay` 回應 — `EcpayLaunch`

| JSON | 型別 | 說明 |
|------|------|------|
| `orderId` 或 `bookingId` | string \| null | 業務單號（另一個為 null） |
| `merchantTradeNo` | string | 送綠界商店訂單編號（**≤20**；≠業務 ID） |
| `actionUrl` | string | 表單 POST URL（stub 或綠界） |
| `fields` | object | key→value，含 `CheckMacValue`、`CustomField1=order:{id}\|booking:{id}` |
| `expiresAt` | string \| null | 與結帳截止對齊 |

**不**在此回應宣告 `paymentStatus=paid`。

本機 `yuruicamp.ecpay.stub=true` 時：`actionUrl` = `/api/payments/ecpay/stub/aio-checkout`。

---

## 4. Notify — `POST /api/payments/ecpay/notify`

### 4.1 行為（寫死）

1. 驗綠界簽章；失敗 → `400` + `0|CheckMacValueInvalid`
2. 以 `CustomField1`（優先）或 `MerchantTradeNo` 對應 `orders`／`bookings`
3. 寫入 `payment_notifications`（冪等）：
   - 首次成功：`result=success` → `payment_status=paid`、`paid_at`
   - 重複：既有列／已 paid → **不**改狀態兩次；回 `1|OK`
   - 失敗：`result=failed`
4. 商城：相關 `product_stock_reservations` → `fulfilled`；有套券則 claim → `consumed`
5. 預約：維持 `status=pending`，只改 paid
6. 成功處理後 body 固定純文字 **`1|OK`**

---

## 5. Return URL

- 只負責 **302** 到前端 success／failure（帶 `orderId` 或 `bookingId`）
- UI 再呼叫 `GET /api/me/orders/{id}`（或 booking）確認 `paymentStatus`
- **禁止**只靠 Return 參數把訂單標 paid

---

## 6. COD（僅商城）— D-5

| 步驟 | `payment_status` | 說明 |
|------|------------------|------|
| `confirm-cod` 後 | `unpaid` | 已成立訂單，清掉 Checkout 倒數；庫存保留不設到期 |
| Admin `complete`（履約完成） | `paid` | `completeCod` 寫 `paid_at` |

預約任何嘗試設 `cod` → `VALIDATION_ERROR`（D-6；DB 亦有 `ck_bookings_no_cod`）。

---

## 7. 取消／退款契約（W3 開工前定案）

> 本節只鎖**規則**；實際 Admin API／綠界退款呼叫由 W3 實作。

### 7.1 線上付款（ECPay）已 paid

1. 後端先呼叫綠界退款／取消交易 API（失敗 → 業務錯誤，**不**只改本地 status）
2. 成功後：`refund_status` 更新；訂單／預約依 W3 AC 改狀態
3. 錯誤碼（預留）：`PAYMENT_REFUND_FAILED`、`PAYMENT_PROVIDER_CONFLICT`

### 7.2 線上付款未 paid

- 會員／逾時取消：釋放 reservation，**不**呼叫綠界

### 7.3 COD

| 狀態 | 取消 | 退款 |
|------|------|------|
| `confirm-cod` 後仍 unpaid | 本地取消＋釋放庫存即可（無綠界） | 不適用 |
| Admin 已 complete（paid） | 走店內退款流程；**無** ECPay API | 本地 `refund_status`；無綠界 |

### 7.4 優惠券（定案）

| 情境 | 券狀態 |
|------|--------|
| 未付款取消（僅 applied／snapshot） | 清除訂單套券；claim 保持 `claimed` |
| Notify 後已 `consumed`，之後**全額**退款／取消 | **回滾**為 `claimed`（可再用） |
| 部分退款 | **不**回滾（維持 `consumed`） |

---

## 8. Admin 全額退款 Port（W3）

> 對外 HTTP 仍走 Admin 契約的 `POST .../cancel`；本節定義 **Payment port** 行為。

| 步驟 | 說明 |
|------|------|
| 1 | 依 `payment_notifications` 成功列取得 `merchant_trade_no`／`provider_trade_no`（找不到 → `PAYMENT_PROVIDER_CONFLICT`） |
| 2 | 呼叫 `EcpayGateway.refundFull(...)`（真實環境對綠界退款 API；**stub=true 時固定成功**） |
| 3 | 失敗 → 拋業務錯誤 `PAYMENT_REFUND_FAILED`；**呼叫端不得**只改本地 `cancelled`／`refunded` |
| 4 | 成功 → 呼叫端更新 `payment_status=refunded`、`refund_status=refunded`（本波全額；不做部分退） |

錯誤碼：

| code | HTTP | 何時 |
|------|------|------|
| `PAYMENT_REFUND_FAILED` | 409 | 綠界／stub 退款失敗 |
| `PAYMENT_PROVIDER_CONFLICT` | 409 | 找不到可退款的 Notify 紀錄、或交易狀態衝突 |

---

## 9. v0.3 不做

| 項目 | 原因 |
|------|------|
| LINE Pay／舊 `credit-card` 字串 | ENUM 已移除 |
| 部分退款 | 本波只做全額（取消） |
| 獨立會員自助退款 API | 走 Admin 客服命令 |
| 信用卡號經自家 API | 全部在綠界 |

---

## Changelog

| 版本 | 日期 | 說明 |
|------|------|------|
| 0.3 | 2026-07-25 | W3：Admin 全額退款 port／錯誤碼；stub 退款；§7 規則仍有效 |
| 0.2 | 2026-07-23 | D-2／D-4 端點；COD／取消退款／券回滾定案；stub aio-checkout |
| 0.1 | 2026-07-20 | ECPay 真相在 Notify；COD 僅商城 |
