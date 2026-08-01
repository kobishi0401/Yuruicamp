# n8n LINE 客服 API Contract（v1.1）

| 欄位 | 內容 |
|------|------|
| **狀態** | Implemented |
| **日期** | 2026-08-01 |
| **版本** | 1.1 |
| **共用** | [`common-api-conventions.md`](./common-api-conventions.md) |
| **整合指南** | [`../backend-specs/integration/n8n-line-customer-service.md`](../backend-specs/integration/n8n-line-customer-service.md) |
| **產品 Spec** | [`.scratch/line-n8n-customer-service/spec.md`](../../.scratch/line-n8n-customer-service/spec.md) |
| **DB** | `customers.line_user_id`、`orders`（物流快照欄位） |

---

## 0. 一句話

n8n（或同等 server-to-server）用 **共用 API Key** + **LINE User ID**（Messaging `source.userId`）查會員是否已綁定、最近商城訂單、或依顯示單號查一張精簡客服卡；**不是**會員 Firebase Bearer，也**不是** Admin RBAC。

---

## 1. 端點一覽

Base（本機）：`http://localhost:8080`

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| `GET` | `/api/integrations/n8n/customers/by-line-user-id/{lineUserId}` | `X-Api-Key` | 是否已綁定會員 |
| `GET` | `/api/integrations/n8n/customers/by-line-user-id/{lineUserId}/orders` | `X-Api-Key` | 最近商城訂單 CS 卡列表 |
| `GET` | `/api/integrations/n8n/customers/by-line-user-id/{lineUserId}/orders/by-display-no/{displayNo}` | `X-Api-Key` | 依顯示單號查單一訂單（僅該會員） |

> OpenAPI／Swagger：**刻意 Hidden**（不當公開瀏覽文件）；以本契約為準。

---

## 2. 授權（必讀）

### 2.1 Header（唯一正式方式）

| Header | 必填 | 說明 |
|--------|------|------|
| `X-Api-Key` | **是** | 與後端設定 `yuruicamp.n8n.api-key`（環境變數 `YURUICAMP_N8N_API_KEY`）完全相同 |

```http
GET /api/integrations/n8n/customers/by-line-user-id/Uxxxxxxxx HTTP/1.1
Host: localhost:8080
X-Api-Key: <與後端相同的密鑰>
Accept: application/json
```

### 2.2 什麼不能用

| 方式 | 結果 |
|------|------|
| 無 `X-Api-Key` | `401` `UNAUTHORIZED` |
| 錯誤 API Key | `401` `UNAUTHORIZED` |
| 後端未設定 API Key（空字串） | **全部** n8n 路徑拒絕（fail-closed） |
| 會員 `Authorization: Bearer <Firebase ID Token>` | **無效**；此路徑略過 Firebase Filter，不給 `ROLE_CUSTOMER` |
| Admin Bearer／RBAC | **無效**；不走 `/api/admin/**` |

### 2.3 誰可以呼叫

- 僅 **後端 → 後端**（n8n Cloud／自架、內網服務）
- **禁止**把 API Key 寫進前端、瀏覽器、LINE LIFF、公開 repo

### 2.4 設定

| 項目 | 值 |
|------|-----|
| Spring property | `yuruicamp.n8n.api-key` |
| 環境變數 | `YURUICAMP_N8N_API_KEY` |
| 本機 IT 固定值 | `n8n-it-test-key`（僅 `src/test`，非正式） |

PowerShell 範例：

```powershell
$env:YURUICAMP_N8N_API_KEY = "請換成夠長的隨機密鑰"
```

---

## 3. 路徑參數與查詢參數

### 3.1 `{lineUserId}`

| 項目 | 說明 |
|------|------|
| 意義 | LINE 平台使用者 ID（通常以 `U` 開頭） |
| 來源（n8n） | Messaging API webhook：`events[].source.userId` |
| 來源（本系統綁定） | 會員在網站 LINE 登入／Account Linking 後，由**已驗證** Firebase ID Token 的 `identities`（如 `oidc.line`）寫入 `customers.line_user_id` |
| 前提 | Login Channel 與 Messaging OA 必須在**同一個 LINE Provider**，否則 Login 的 U… 與 Messaging userId 對不上 |

### 3.2 `{displayNo}`

| 項目 | 說明 |
|------|------|
| 意義 | 商城訂單**顯示單號**（`orders.display_no`），不是內部 `orders.id` |
| 範圍 | **只**查該 `lineUserId` 對應 Customer 的訂單；別人的單號 → 一律 `NOT_FOUND`（不洩漏是否存在） |

### 3.3 `limit`（僅列表）

| 項目 | 說明 |
|------|------|
| Query | `?limit=` 可選 |
| 省略／`< 1` | 視為 **1** |
| 上限 | **5**（超過則截成 5） |
| 排序 | `placed_at` **新到舊** |

---

## 4. 回應欄位

成功皆為共用 Envelope：`{ "success": true, "data": ... }`（見 common conventions）。

### 4.1 綁定查詢 — `N8nCustomerLinkResponse`

`GET .../customers/by-line-user-id/{lineUserId}`

| JSON | 型別 | 說明 |
|------|------|------|
| `linked` | boolean | `true`＝DB 有此 `line_user_id` |
| `customerId` | string \| （省略） | 僅 `linked=true` 時回傳內部會員 id；`false` 時因 `NON_NULL` **不出現** |

已綁定：

```json
{
  "success": true,
  "data": {
    "linked": true,
    "customerId": "a1b2c3d4e5f6…"
  }
}
```

未綁定（**穩定 200**，不是錯誤）：

```json
{
  "success": true,
  "data": {
    "linked": false
  }
}
```

> 聊天話術建議：`linked=false` → 請用戶先到官網點「聯繫客服／LINE 客服」完成綁定。

### 4.2 客服訂單卡 — `N8nOrderCsCardResponse`

列表與單筆查詢共用此形狀。

| JSON | 型別 | DB／來源 | 說明 |
|------|------|----------|------|
| `displayNo` | string | `orders.display_no` | 顯示單號（給客人看） |
| `status` | string | `orders.status` | `unshipped` \| `shipped` \| `completed` \| `returned` \| `cancelled` |
| `paymentStatus` | string | `orders.payment_status` | `unpaid` \| `paid` \| `refunded` |
| `shippingMethod` | string | `orders.shipping_method` | `delivery` \| `pickup` \| `cvs` |
| `logisticsId` | string \| null | `orders.ecpay_logistics_id` | 綠界物流單號（若有） |
| `logisticsRtnCode` | string \| null | `orders.ecpay_logistics_rtn_code` | 最新物流狀態碼 |
| `logisticsRtnMsg` | string \| null | `orders.ecpay_logistics_rtn_msg` | 最新物流狀態訊息 |
| `logisticsStatusAt` | string (ISO-8601) \| null | `orders.ecpay_logistics_status_at` | 物流快照更新時間 |
| `cvsStoreName` | string \| null | `orders.cvs_store_name` | 超商門市名（CVS 時可能有） |
| `placedAt` | string (ISO-8601) | `orders.placed_at` | 下單時間 |

範例（列表 `limit` 省略 → 1 筆）：

```json
{
  "success": true,
  "data": [
    {
      "displayNo": "YC20260731001",
      "status": "shipped",
      "paymentStatus": "paid",
      "shippingMethod": "cvs",
      "logisticsId": "1234567890",
      "logisticsRtnCode": "3003",
      "logisticsRtnMsg": "商品已送達門市",
      "logisticsStatusAt": "2026-07-31T04:00:00Z",
      "cvsStoreName": "全家測試店",
      "placedAt": "2026-07-30T10:15:00Z"
    }
  ]
}
```

已綁定但尚無訂單：

```json
{
  "success": true,
  "data": []
}
```

### 4.3 刻意不回傳（PII／噪音）

下列欄位**不會**出現在 CS card（請勿依賴）：

| 不回傳 | 原因 |
|--------|------|
| 完整收件地址 | 隱私 |
| 完整電話 | 隱私 |
| `internalNote`／後台內部備註 | 僅 Admin |
| 訂單明細 `items[]` | 聊天卡過重 |
| 買家 email、金額明細全展開 | 非 v1 必要 |
| 完整 `lineUserId` 以外的帳號密鑰 | — |

---

## 5. 錯誤碼（本契約）

| `error.code` | HTTP | 何時 | n8n 建議話術 |
|--------------|------|------|----------------|
| `UNAUTHORIZED` | 401 | 缺／錯 API Key，或後端未設定 key | 檢查 n8n Credential／後端 env（勿對客人說） |
| `LINE_NOT_LINKED` | 404 | 列表／單號查詢時，LINE 尚未綁定會員 | 請先到官網完成 LINE 綁定 |
| `NOT_FOUND` | 404 | 顯示單號不存在，或不屬於此會員 | 查無此訂單（勿暗示別人有這張單） |
| `VALIDATION_ERROR` | 400 | `lineUserId`／`displayNo` 空白等 | 參數錯誤 |
| `INTERNAL_ERROR` | 500 | 未預期 | 稍後再試 |

未綁定時：

- **Resolve** 端點 → `200` + `linked: false`（不算錯誤）
- **Orders／by-display-no** → `404` + `LINE_NOT_LINKED`

```json
{
  "success": false,
  "error": {
    "code": "LINE_NOT_LINKED",
    "message": "LINE account is not linked to a member"
  }
}
```

---

## 6. curl 驗收（本機）

假設 API Key = `local-n8n-secret`、LINE User ID = `UlineDemo001`。

```powershell
# 1) 綁定查詢
curl.exe -s -H "X-Api-Key: local-n8n-secret" `
  "http://localhost:8080/api/integrations/n8n/customers/by-line-user-id/UlineDemo001"

# 2) 最近 1 筆（預設）
curl.exe -s -H "X-Api-Key: local-n8n-secret" `
  "http://localhost:8080/api/integrations/n8n/customers/by-line-user-id/UlineDemo001/orders"

# 3) 最近最多 5 筆
curl.exe -s -H "X-Api-Key: local-n8n-secret" `
  "http://localhost:8080/api/integrations/n8n/customers/by-line-user-id/UlineDemo001/orders?limit=5"

# 4) 依顯示單號
curl.exe -s -H "X-Api-Key: local-n8n-secret" `
  "http://localhost:8080/api/integrations/n8n/customers/by-line-user-id/UlineDemo001/orders/by-display-no/YC20260731001"

# 5) 錯 key → 應 401
curl.exe -s -i -H "X-Api-Key: wrong" `
  "http://localhost:8080/api/integrations/n8n/customers/by-line-user-id/UlineDemo001"
```

Dev 模擬綁定（`FIREBASE_ENABLED=false`）：

```text
POST /api/auth/firebase/session
Body: { "idToken": "dev:uid-demo:demo@example.invalid:line:Demo:UlineDemo001" }
```

第六段 `UlineDemo001` 會寫入 `customers.line_user_id`。

---

## 7. 與會員／Admin API 的差異

| | 會員 `/api/me/orders` | Admin `/api/admin/orders` | **本 n8n API** |
|--|----------------------|---------------------------|----------------|
| 認證 | Firebase Bearer | Firebase + Admin RBAC | **`X-Api-Key`** |
| 查詢鍵 | 登入會員本人 | 後台篩選 | **LINE User ID** |
| 回應 | 含地址／電話／明細 | 後台完整 | **精簡 CS 卡** |
| 用途 | 會員中心 | 營運 | LINE 機器人 |

---

## 8. 推播 Webhook（後端 → n8n，本系統主動呼叫）

> **方向與本文件其餘章節相反**：§1～§7 是 n8n 呼叫本系統；本節是**本系統呼叫 n8n**。

### 8.1 一句話

後台人員在既有訂單管理畫面點擊「出貨」「完成訂單」「取消訂單」，訂單狀態變更**交易 commit 後**，若該訂單會員已綁定 LINE，後端會 POST 一筆事件到 n8n 設定的 Webhook URL；n8n 收到後自行呼叫 LINE Messaging API 的 Push Message 推播給該會員。本系統**不**呼叫 LINE Push Message API。

訂單交易 commit 後，事件由 `@TransactionalEventListener(phase = AFTER_COMMIT)` 接收，並透過 `@Async` 專用 executor（`n8nNotifyExecutor`）在背景執行緒呼叫 n8n webhook；n8n 慢或失敗不會 rollback 訂單，也不會讓出貨／完成／取消的 API 回應等 n8n webhook timeout。本次**未做** outbox／重試，通知不保證一定送達，executor 佇列滿載時只記 warn log 並丟棄該次通知。

### 8.2 觸發時機

| 後台動作 | `event` 值 |
|----------|-----------|
| 出貨（`AdminOrderService.ship()`） | `shipped` |
| 完成訂單（`AdminOrderService.complete()`） | `completed` |
| 取消訂單（`AdminOrderService.cancel()`） | `cancelled` |

訂單會員未綁定 LINE（`customers.line_user_id` 為空）或後端未設定 Webhook URL／密鑰時皆為 **no-op**，不發送、不報錯；冪等回放（例如重複點擊已出貨訂單）不會重複通知。

### 8.3 Request（本系統 → n8n）

| 項目 | 值 |
|------|-----|
| Method | `POST` |
| URL | 後端設定 `yuruicamp.n8n.notify-webhook-url`（環境變數 `YURUICAMP_N8N_NOTIFY_WEBHOOK_URL`） |
| Header | `X-Yuruicamp-Notify-Secret: <與後端 yuruicamp.n8n.notify-secret 相同>` |
| Timeout | 連線／讀取各 3 秒 |

Body：

```json
{
  "lineUserId": "Uxxxxxxxx",
  "orderId": "a1b2c3d4e5f6…",
  "orderDisplayNo": "YC20260731001",
  "status": "shipped",
  "paymentStatus": "paid",
  "shippingMethod": "cvs",
  "event": "shipped",
  "occurredAt": "2026-08-01T03:00:00Z"
}
```

| JSON | 型別 | 說明 |
|------|------|------|
| `lineUserId` | string | 該訂單會員的 `customers.line_user_id` |
| `orderId` | string | 內部訂單 id（僅供 log／追蹤，**不要**放進 LINE 聊天內容） |
| `orderDisplayNo` | string | `orders.display_no`（給客人看的單號） |
| `status` | string | 觸發當下的訂單狀態，與 `event` 同義（`shipped` \| `completed` \| `cancelled`） |
| `paymentStatus` | string | `unpaid` \| `paid` \| `refunded` |
| `shippingMethod` | string | `delivery` \| `pickup` \| `cvs` |
| `event` | string | `shipped` \| `completed` \| `cancelled` |
| `occurredAt` | string (ISO-8601) | 後端發送當下時間 |

Payload 刻意保持精簡（不含地址、電話、金額明細），與 §4.3 客服卡的隱私原則一致；n8n 若需要更完整資訊（例如物流狀態說明 `logisticsRtnMsg`），可用 payload 內的 `lineUserId` + `orderDisplayNo` 呼叫既有 §1 的 `by-display-no` 端點補查。

### 8.4 認證

| Header | 說明 |
|--------|------|
| `X-Yuruicamp-Notify-Secret` | 固定字串比對（比照 `N8nApiKeyAuthenticationFilter` 的簡單模式，非 HMAC）；n8n 端需在 Webhook trigger 驗證此 Header |

### 8.5 失敗行為（本系統側）

推播是 **fire-and-forget** 且**背景非同步**執行：
- HTTP 呼叫失敗（連線逾時、n8n 回非 2xx 等）只記一行 warn log，**不會**讓出貨／完成／取消動作失敗或 rollback，也不重試。
- 專用 executor（`n8nNotifyExecutor`：core 2 / max 4 / queue 100）滿載時，該次通知直接丟棄並記 warn log，同樣不影響訂單操作。
- 本次**未做** outbox 或任何持久化重試機制；若後端在通知送出前重啟，或 executor 佇列滿載丟棄，該筆通知即遺失，**不保證一定送達** n8n。

### 8.6 設定

| 項目 | Spring property | 環境變數 |
|------|------------------|----------|
| Webhook URL | `yuruicamp.n8n.notify-webhook-url` | `YURUICAMP_N8N_NOTIFY_WEBHOOK_URL` |
| 密鑰 | `yuruicamp.n8n.notify-secret` | `YURUICAMP_N8N_NOTIFY_SECRET` |

兩者預設空字串；**Webhook URL 與密鑰必須同時設定**才會送出推播，任一為空字串都視為停用（不影響訂單操作本身）。只設定 URL、未設定密鑰是常見的誤設定，此時也會停用（避免送出空密鑰 Header）。

### 8.7 n8n 端要做的事

1. 建一個 Webhook trigger，驗證 `X-Yuruicamp-Notify-Secret` Header 是否與約定密鑰相同
2. 從 body 取出 `lineUserId`，用 LINE 官方帳號的 channel access token 呼叫 LINE Messaging API 的 Push Message
3. 依 `event` 組不同話術（例如 `shipped` → 「您的訂單 {orderDisplayNo} 已出貨」）

---

## 9. v1.0 不做

| 項目 | 原因 | 現況 |
|------|------|------|
| Booking／租借查詢 | 產品延後 | 仍未做 |
| n8n 直連 Postgres | 安全／契約外 | 仍未做 |
| ~~訂單事件推送到 n8n~~ | ~~延後~~ | **已於 v1.1 補上，見 §8** |
| HMAC／mTLS | v1 不要求 | 仍未做（§8 推播用固定 Header 比對） |
| 瀏覽器呼叫本 API | 禁止暴露 Key | 仍未做 |

---

## Changelog

| 版本 | 日期 | 說明 |
|------|------|------|
| 1.0 | 2026-07-31 | 初版：授權、三端點、CS card 欄位、錯誤碼、curl／n8n 對齊 |
| 1.1 | 2026-08-01 | 新增 §8 推播 Webhook（後端 → n8n）：訂單出貨／完成／取消事件通知（`@TransactionalEventListener(AFTER_COMMIT)` + `@Async` 專用 executor 背景送出，不保證送達、無 outbox／重試），補上 §8「v1.0 不做」的訂單事件推送缺口 |
