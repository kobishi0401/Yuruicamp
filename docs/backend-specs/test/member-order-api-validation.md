# 會員訂單 API Swagger 驗證

## 1. 前置條件

- PostgreSQL 已啟動並套用 `docs/latest_schema.sql` 與開發 seed。
- Spring Boot 已啟動。
- 本機驗證使用 `FIREBASE_ENABLED=false`。
- 開啟 `http://localhost:8080/swagger-ui.html`。

## 2. 建立會員 Session

執行：

```http
POST /api/auth/firebase/session
```

Request Body：

```json
{
  "idToken": "dev:uid-c2:c2@example.com:google:C2Tester"
}
```

預期回傳 HTTP `200`。接著按 Swagger 的 `Authorize`，輸入：

```text
dev:uid-c2:c2@example.com:google:C2Tester
```

Swagger 會自動加上 `Bearer`，輸入值不需要自行加前綴。

## 3. 驗證本人訂單列表

執行：

```http
GET /api/me/orders
```

預期：

- HTTP `200`。
- `success=true`。
- `data` 只包含目前登入會員的訂單。
- 訂單依 `placedAt` 新到舊排列。
- `meta.totalElements` 等於回傳筆數。
- 金額為兩位小數字串。
- 回應不包含 Checkout 冪等鍵或請求指紋。

## 4. 驗證本人訂單詳情

從列表複製一個 `id`，執行：

```http
GET /api/me/orders/{orderId}
```

預期：

- HTTP `200`。
- 訂單頭包含收件快照、金額、付款與履約狀態。
- `items[]` 包含商品與規格快照。
- `items[].lineTotal` 等於 `unitPrice * quantity`。
- `paymentMethod` 使用 `ecpay-credit` 等契約值。

## 5. 驗證本人限制

改用另一位會員的訂單 ID，或輸入不存在的 ID：

```http
GET /api/me/orders/UNKNOWN
```

預期兩種情況都回：

- HTTP `404`。
- `error.code=NOT_FOUND`。

## 6. 驗證未登入

在 Swagger 按 `Logout` 清除授權後，再呼叫列表或詳情。

預期：

- HTTP `401`。
- `error.code=UNAUTHORIZED`。

## 7. 會員通知 n8n（LINE 追蹤訂單）

先用第六段 `lineUserId` 建立 dev session（見 [`n8n-cs-api-contract.md`](../../api/n8n-cs-api-contract.md) §6）：

```json
{
  "idToken": "dev:uid-c2:c2@example.com:google:C2Tester:Amy:UlineDemo001"
}
```

從列表複製一個屬於此會員的 `orderId`，執行：

```http
POST /api/me/orders/{orderId}/line-cs-notify
```

預期：

- 本人訂單且已綁 LINE → HTTP `200`，`data=null`。
- 換一個不屬於本會員的 `orderId` → HTTP `404`，`error.code=NOT_FOUND`。
- 用第 2 節那組**未帶** `lineUserId` 的 dev session（尚未綁 LINE）→ HTTP `404`，`error.code=LINE_NOT_LINKED`。
- 在 Swagger 按 `Logout` 清除授權後呼叫 → HTTP `401`，`error.code=UNAUTHORIZED`。

此端點只發布內部事件通知 n8n，不會同步等待 n8n 回應；若本機已設定 `YURUICAMP_N8N_NOTIFY_WEBHOOK_URL`／`YURUICAMP_N8N_NOTIFY_SECRET`，可另外起一個本機 HTTP mock 確認收到 `event="cs_inquiry"` 的 payload（見 [`n8n-cs-api-contract.md`](../../api/n8n-cs-api-contract.md) §8.3）。

## 8. 為什麼需要驗證

會員訂單包含收件資訊與消費紀錄，必須確認 API 完全依登入 principal 限定資料，而不是信任前端傳入的會員 ID。相同的 `404` 也能避免攻擊者用訂單 ID 判斷其他會員訂單是否存在。商品與金額快照驗證則確保頁面顯示的是下單當下資料，不會被後續商品改名或改價影響。LINE 追蹤訂單通知額外驗證「未綁定 LINE 就不能觸發推播」，避免把尚未完成綁定流程的會員誤導成已經可以收到 LINE 訊息。

