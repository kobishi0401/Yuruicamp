# Common API Conventions（v0.1）

| 欄位 | 內容 |
|------|------|
| **狀態** | Locked |
| **日期** | 2026-07-20 |
| **版本** | 0.1 |
| **適用** | 所有 `/api/**` 契約（除非該契約明文覆寫） |

---

## 0. 一句話

所有 REST 成功回應包在 **Envelope**；金額用 **字串**；認證用 **Firebase ID Token**（後端不簽自家 JWT）；ENUM 字串以 [`schema-enums.md`](../schema-enums.md) 為準。

---

## 1. Base URL

| 環境 | Base |
|------|------|
| 本機 | `http://localhost:8080/api` |
| 前端 `API_BASE_URL` | 同上（已含 `/api`） |
| 後台 | `http://localhost:8080/api/admin` |

路徑在契約裡寫**完整** `/api/...`；前端 `restPath` 若相對 `API_BASE_URL`，則寫 `/products` 這種短路徑。

---

## 2. 成功 Envelope

```json
{
  "success": true,
  "data": {},
  "meta": null
}
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `success` | boolean | 是 | 成功固定 `true` |
| `data` | any | 是 | 業務本體（物件或陣列） |
| `meta` | object \| null | 否 | 分頁等；未實作時可省略（Jackson `NON_NULL`） |

### 分頁 meta（有分頁的 API 才用）

```json
{
  "page": 0,
  "size": 20,
  "totalElements": 100,
  "totalPages": 5
}
```

| 查詢參數 | 預設 | 說明 |
|----------|------|------|
| `page` | `0` | 從 0 起算 |
| `size` | `20` | 上限 `100` |
| `sort` | 各資源自訂 | 僅允許白名單欄位，格式 `field,asc\|desc` |

---

## 3. 錯誤 Envelope

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Human-readable message",
    "details": [
      { "field": "email", "reason": "must not be blank" }
    ]
  }
}
```

| 欄位 | 說明 |
|------|------|
| `error.code` | 機器可讀；穩定字串 |
| `error.message` | 給人看 |
| `error.details` | 可選；驗證錯誤用 |

### 常用 `error.code` ↔ HTTP

| code | HTTP | 何時 |
|------|------|------|
| `VALIDATION_ERROR` | 400 | Bean Validation／格式錯 |
| `UNAUTHORIZED` | 401 | 無／無效 Token |
| `FORBIDDEN` | 403 | 有登入但無權（含後台白名單失敗） |
| `NOT_FOUND` | 404 | 資源不存在或不符公開條件 |
| `CONFLICT` | 409 | 庫存不足、狀態不允許、金額不符等 |
| `ADMIN_NOT_WHITELISTED` | 403 | 後台 email 不在白名單 |
| `ADMIN_INACTIVE` | 403 | 後台 `active=false` |
| `CUSTOMER_SUSPENDED` | 403 | 會員停權 |
| `LINE_USER_ID_CONFLICT` | 409 | 此 LINE User ID 已綁其他會員（session／綁定） |
| `LINE_NOT_LINKED` | 404 | n8n：LINE User ID 尚未綁定會員（訂單查詢） |
| `INTERNAL_ERROR` | 500 | 未預期錯誤（不回堆疊） |

業務契約可再補領域 code（例如 `STOCK_INSUFFICIENT`），但須寫進該契約 Changelog。

---

## 4. 認證與授權

| 角色 | Header | 說明 |
|------|--------|------|
| 會員 | `Authorization: Bearer <Firebase ID Token>` | 後端只驗證、不換發 JWT |
| 後台 | 同上 | 另查 `admin_users` 白名單 + `active` |
| 公開 GET | 無 | 如商品列表 |
| ECPay Notify | **無**使用者 Token | 改驗綠界簽章 |
| **n8n 客服整合** | **`X-Api-Key: <shared secret>`** | 僅 `/api/integrations/n8n/**`；**不是** Firebase Bearer。契約見 [`n8n-cs-api-contract.md`](./n8n-cs-api-contract.md) |

本機 Dev stub（`FIREBASE_ENABLED=false`）：

```text
dev:<uid>:<email>:<provider>[:displayName[:lineUserId]]
```

`provider` ∈ `google` \| `facebook` \| `line`。  
可選第六段 `lineUserId`（如 `U…`）供測試寫入 `customers.line_user_id`；舊的 4～5 段格式仍可用。

---

## 5. 金額與時間

| 項目 | 規範 |
|------|------|
| JSON 金額 | **字串**，兩位小數，如 `"3200.00"` |
| Java | `BigDecimal`；禁止 `double` 當真相 |
| 結帳 | **後端依 DB 重算**；前端 total 僅顯示／可對照 |
| 日期（入住日等） | `YYYY-MM-DD`（業務日 `Asia/Taipei`） |
| 時間戳 | ISO-8601（建議帶 offset，如 `2026-07-20T03:00:00Z`） |

---

## 6. JSON 命名

- 回應／請求：**camelCase**
- DB 欄位：**snake_case**（契約表會寫對照）
- ENUM：與 [`schema-enums.md`](../schema-enums.md) **完全相同字串**（如 `ecpay-credit`、`unpaid`）

---

## 7. Idempotency（寫入）

進結帳、Webhook 等關鍵寫入：

| Header／欄位 | 說明 |
|--------------|------|
| `Idempotency-Key`（建議） | 客戶端產生的唯一字串；重複送回同一結果 |
| DB | 保留帳／`payment_notifications` 有唯一鍵時必須尊重 |

各契約寫明是否必填。

---

## 8. 個資與 Log

- 不 log：完整電話、地址、Firebase token、ECPay 金鑰
- 會員刪除：軟刪（`status=deleted` + `deleted_at`），禁止硬刪

---

## 9. 舊 Mock 對齊規則

| 模式 | 行為 |
|------|------|
| `USE_MOCK_API=true` | 讀 JSON 後 **正規化成契約形狀** |
| `USE_MOCK_API=false` | 呼叫 REST → **先解 Envelope 取 `data`** |

頁面若仍需要 `number` 價錢，只允許在 UI enrich 層 `Number(price)`。

---

## Changelog

| 版本 | 日期 | 說明 |
|------|------|------|
| 0.1 | 2026-07-20 | 初版：Envelope／錯誤／認證／金額／分頁 |
| 0.2 | 2026-07-31 | 補 n8n `X-Api-Key`、Dev token 可選 LINE User ID、`LINE_*` 錯誤碼 |
