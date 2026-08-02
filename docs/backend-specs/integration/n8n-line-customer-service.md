# LINE × n8n 客服介接指南（本系統側）

| 欄位 | 內容 |
|------|------|
| **狀態** | Implemented |
| **日期** | 2026-08-02 |
| **API 契約** | [`docs/api/n8n-cs-api-contract.md`](../../api/n8n-cs-api-contract.md)（欄位／錯誤碼以契約為準） |
| **產品 Spec** | [`.scratch/line-n8n-customer-service/spec.md`](../../../.scratch/line-n8n-customer-service/spec.md) |
| **本機啟動** | [`docs/local-dev-setup.md`](../../local-dev-setup.md) |

> 本文件教 **怎麼把 n8n 接到 Yuruicamp 後端**。  
> n8n 工作流節點細節、LINE Messaging webhook 託管、FAQ 知識庫 **不在本 repo**；這裡只保證「查訂單／綁定狀態」的 HTTP 契約。

---

## 0. 整體資料流（新手先看這張）

```text
[會員在官網]
  LINE 登入 或 Google 後 Account Linking LINE
       ↓
  POST /api/auth/firebase/session
       ↓
  後端從「已驗證 Firebase ID Token」寫入 customers.line_user_id
       ↓
[會員在 LINE OA 聊天]
  Messaging webhook → n8n 拿到 source.userId（= LINE User ID）
       ↓
  n8n HTTP Request + Header X-Api-Key
       ↓
  GET /api/integrations/n8n/customers/by-line-user-id/{userId}/…
       ↓
  回傳精簡訂單卡 → n8n 組話術回 LINE
```

反方向：**本系統主動推播**（後端 → n8n，完整契約見 [`n8n-cs-api-contract.md`](../../api/n8n-cs-api-contract.md) §8）：

```text
[後台人員在既有訂單管理畫面]
  點「出貨」／「完成訂單」／「取消訂單」（既有動作）
       ↓
  AdminOrderService.ship()/complete()/cancel() 狀態變更成功
       ↓
  發佈 OrderStatusChangedEvent（僅資料，不直接依賴 n8n）
       ↓
  交易 commit
       ↓（@TransactionalEventListener AFTER_COMMIT）
  N8nOrderNotifyListener 接手（@Async("n8nNotifyExecutor") 背景執行緒，
  不佔用 AdminOrderService 呼叫端的 request 執行緒，後台人員不用等 n8n）
       ↓
  交給 N8nNotifyService，查 customers.line_user_id（event.customerId() 找 Customer）
       ↓
  未綁定 LINE → 什麼都不做（no-op）
  已綁定 LINE ↓
  N8nNotifyService POST 到 n8n 推播 Webhook URL
  （Header：X-Yuruicamp-Notify-Secret）
       ↓
  n8n workflow 呼叫 LINE Push Message API 推播給該會員
```

第三方向：**會員中心主動觸發**（非狀態變更，同樣經 §8 同一個 Webhook，`event=cs_inquiry`）：

```text
[會員在會員中心訂單詳情]
  點「使用 LINE 追蹤訂單」（POST /api/me/orders/{orderId}/line-cs-notify）
       ↓
  MemberOrderService.notifyLineCsInquiry()：驗證訂單屬於本人 + 驗證 line_user_id 已綁定
       ↓
  發佈 OrderNotificationRequestedEvent（獨立型別，不是 OrderStatusChangedEvent；僅資料，不直接依賴 n8n）
       ↓
  交易 commit
       ↓（@TransactionalEventListener AFTER_COMMIT）
  N8nOrderNotificationRequestedListener 接手（@Async("n8nNotifyExecutor") 背景執行緒，
  沿用與 N8nOrderNotifyListener 相同的執行緒池，會員 API 不用等 n8n）
       ↓
  交給 N8nNotifyService（同一個 webhook URL／密鑰、同一段 HTTP 呼叫實作，只是 event="cs_inquiry"）
       ↓
  n8n workflow 對 event 欄位多加一個 cs_inquiry 分支即可，不需另建 workflow
```

**為什麼要交易 commit 後、且用 `@Async` 背景執行**：`ship()/complete()/cancel()` 都是 `@Transactional`，且會先鎖定訂單列（`SELECT ... FOR UPDATE`）。這裡疊了兩層保護：
1. **`AFTER_COMMIT`**：確保 n8n 呼叫不會在交易還沒 commit 前發生，也不會因為 n8n 失敗而 rollback 訂單。單靠這層**不夠**——`@TransactionalEventListener` 預設仍是同步呼叫，會在同一條 request 執行緒上執行，若只做到這裡，後台人員點「出貨」還是要等 n8n 回應或等到 3 秒 timeout 才會收到 API 回應。
2. **`@Async("n8nNotifyExecutor")`**：讓 `N8nOrderNotifyListener` 改在專用背景執行緒池執行，`AdminOrderService` 的方法在 DB commit 完成後就能直接回應呼叫端，不用等 n8n 呼叫結果。

兩層都要有才能達成「訂單操作不受 n8n 拖慢」；目前**沒有**額外的 outbox 或重試機制，執行緒池滿載（core 2／max 4／queue 100）或後端在推播送出前重啟，該筆通知就會遺失，只記一行 warn log，不保證一定送達 n8n。

**三個身分不要搞混：**

| 名詞 | 是什麼 | 用在哪 |
|------|--------|--------|
| **LINE User ID** | LINE 平台 `U…` | n8n 查詢鍵、DB `customers.line_user_id` |
| **Firebase UID** | Firebase Auth uid | 網站 session／`customers.firebase_uid` |
| **Customer id** | 本系統會員主鍵 | 內部關聯訂單；**不要**放進 LINE 聊天連結 |

---

## 1. 上線前 checklist（Ops）

### 1.1 LINE Provider（正確性前提）

- [ ] LINE **Login Channel** 與 **Messaging OA** 掛在**同一個 LINE Provider**
- [ ] 否則：官網綁到的 `U…` ≠ OA webhook 的 `userId`，機器人永遠 `not linked`

### 1.2 本系統後端

- [ ] DB 已有 `customers.line_user_id`（見 `docs/latest_schema.sql`；舊庫需重建或 `ALTER`）
- [ ] 設定夠長的隨機密鑰：

```powershell
$env:YURUICAMP_N8N_API_KEY = "請換成隨機長字串"
```

- [ ] 後端對 n8n **可連線**（本機／內網／HTTPS 正式網域）
- [ ] **不要**把 Key 提交進 git 或寫進前端 `.env` 給瀏覽器讀
- [ ]（可選，開啟推播才需要）設定推播 Webhook：`YURUICAMP_N8N_NOTIFY_WEBHOOK_URL`、`YURUICAMP_N8N_NOTIFY_SECRET`，空白則推播功能停用，不影響既有查詢功能

### 1.3 前端（綁定入口）

- [ ] 商店／預約浮層「LINE 客服」走 `contact-cs.js`（先綁定再開 OA）
- [ ] OA 聊天 URL：`AppConfig.LINE.OA_CHAT_URL` 或 `VITE_LINE_OA_CHAT_URL`
- [ ] **禁止**在 OA URL 加 `customerId`、訂單號、token

### 1.4 n8n

- [ ] Credential 類型建議：Header Auth／自訂 Header，名稱固定 `X-Api-Key`
- [ ] 只從 Messaging webhook 取 `userId`，不要叫用戶貼 Firebase token

---

## 2. n8n 授權設定（正確作法）

### 2.1 Credential（推薦）

1. n8n → Credentials → **Header Auth**（或 Generic Credential）
2. Name：`X-Api-Key`
3. Value：與後端 `YURUICAMP_N8N_API_KEY` **完全相同**
4. 在 HTTP Request 節點勾選此 Credential

### 2.2 或在節點 Header 手填（較不建議，易外洩）

| Name | Value |
|------|--------|
| `X-Api-Key` | `{{$credentials.n8nYuruicamp.apiKey}}` 或固定密鑰 |
| `Accept` | `application/json` |

### 2.3 常見錯誤

| 錯誤 | 原因 |
|------|------|
| 401 | Key 空白、打錯、或後端沒設 `YURUICAMP_N8N_API_KEY` |
| 401 但「有帶 Bearer」 | 本 API **不吃** Firebase Bearer；請改 `X-Api-Key` |
| 403 Access denied | 幾乎都是 Key 沒過、Security 沒拿到 `ROLE_N8N` → 先查 401／Key |

---

## 3. n8n HTTP Request 節點對照表

以下 `BASE` = `https://你的後端網域`（本機 `http://host.docker.internal:8080` 視 n8n 部署而定）。  
`{{$json.lineUserId}}` 請改成你從 LINE Trigger／Webhook 解析出的欄位。

### 3.1 是否已綁定

| 項目 | 值 |
|------|-----|
| Method | `GET` |
| URL | `{{BASE}}/api/integrations/n8n/customers/by-line-user-id/{{$json.lineUserId}}` |
| Auth | `X-Api-Key` Credential |
| 成功 | HTTP 200；讀 `body.data.linked` |
| 分支 | `linked === false` → 請用戶官網綁定；`true` → 繼續查訂單 |

回應本體在 Envelope 的 `data`（記得先取 `data`，不要整包當業務物件）：

```text
$json.data.linked
$json.data.customerId   // 僅 linked=true；給內部 log 即可，勿回傳給聊天
```

### 3.2 最近訂單（預設最新 1 筆）

| 項目 | 值 |
|------|-----|
| Method | `GET` |
| URL | `{{BASE}}/api/integrations/n8n/customers/by-line-user-id/{{$json.lineUserId}}/orders` |
| Query（可選） | `limit=1`～`5`（省略＝1；>5 伺服器截成 5） |
| 未綁定 | HTTP 404，`error.code === "LINE_NOT_LINKED"` |
| 已綁定無單 | HTTP 200，`data: []` |

讀取範例：

```text
$json.data[0].displayNo
$json.data[0].status
$json.data[0].paymentStatus
$json.data[0].shippingMethod
$json.data[0].logisticsRtnMsg
$json.data[0].placedAt
```

### 3.3 依顯示單號查一筆

| 項目 | 值 |
|------|-----|
| Method | `GET` |
| URL | `{{BASE}}/api/integrations/n8n/customers/by-line-user-id/{{$json.lineUserId}}/orders/by-display-no/{{$json.displayNo}}` |
| 未綁定 | `LINE_NOT_LINKED` |
| 無此單／別人的單 | `NOT_FOUND`（相同回應，勿區分） |

---

## 4. 建議工作流骨架（n8n 邏輯，非正式匯出）

```text
1. LINE Trigger / Webhook
      → 取出 userId、使用者訊息文字
2. HTTP：Resolve by lineUserId
      → IF linked=false → 回「請到官網點聯繫客服完成綁定」→ 結束
3. IF 訊息像訂單顯示單號
      → HTTP：by-display-no
      → 組一句話（單號＋付款＋物流）
   ELSE
      → HTTP：orders?limit=1
      → 空陣列 →「尚無商城訂單」
      → 有資料 → 組最近一筆狀態
4. （可選）FAQ／知識庫節點 — 本系統不提供
5. 回覆 LINE
```

**預設查「最近一筆」**：省略 `limit` 或 `limit=1`。  
若要一次給機器人多筆選項：最多 `limit=5`。

---

## 5. 聊天可用欄位速查（CS card）

完整定義見契約 §4.2。話術常用：

| 欄位 | 建議中文標籤 |
|------|----------------|
| `displayNo` | 訂單編號 |
| `paymentStatus` | 付款狀態（unpaid／paid／refunded） |
| `status` | 訂單狀態（unshipped／shipped／completed／…） |
| `shippingMethod` | 配送（delivery 宅配／pickup 自取／cvs 超商） |
| `logisticsRtnMsg` | 物流進度說明 |
| `logisticsId` | 物流單號（若有） |
| `cvsStoreName` | 取件門市（超商時） |
| `placedAt` | 下單時間 |

**不要對客人念**：`customerId`、完整地址、電話、內部備註（API 也不會給後三者）。

---

## 6. 會員如何完成綁定（前端行為）

官網／預約浮層「LINE 客服」：

| 狀態 | 行為 |
|------|------|
| 未登入 | LINE 登入 → session → 寫入 `line_user_id` → 開 OA |
| 已用 Google 等登入、尚未綁 LINE | Firebase **Account Linking**（同一 Firebase UID）→ session → 開 OA |
| 已綁定 | 直接開 OA |

後端若回 `LINE_USER_ID_CONFLICT`：此 LINE 已綁其他會員 → 前端會顯示可辨識錯誤，**不會**搶綁。

Session 成功回應含 `lineBound: true|false`（見 [`auth-api-contract.md`](../../api/auth-api-contract.md)）。

---

## 7. 本機煙測步驟

1. 後端設 `YURUICAMP_N8N_API_KEY` 並啟動  
2. Dev session 寫入 LINE User ID（見契約 §6）  
3. 用 curl／n8n 打 Resolve → `linked: true`  
4. 在該會員下建一張測試訂單後打 `orders` → 應看到 CS card  
5. 用錯 Key → 401  
6. 用未綁定的 `U…` 打 `orders` → `LINE_NOT_LINKED`

自動化：`N8nCsOrderPostgreSqlIntegrationTest`（需 `RUN_BACKEND_IT=true` + DB）。

---

## 8. 安全注意

- API Key = 全權讀取「知到 LINE User ID 就能查該會員訂單卡」→ 視同秘密  
- 輪替 Key：改後端 env → 重啟 → 更新 n8n Credential  
- v1 無 IP allowlist／HMAC；若對外網，務必 HTTPS + 強隨機 Key  
- Log 勿印完整 API Key、完整電話地址、Firebase token

---

## 9. 相關檔案（給開發者）

| 路徑 | 角色 |
|------|------|
| `.../integration/n8n/api/N8nCsController.java` | HTTP 入口 |
| `.../integration/n8n/application/N8nCsOrderService.java` | 查詢／limit |
| `.../order/application/OrderStatusChangedEvent.java` | 訂單狀態變更事件（交易 commit 後才派發給訂閱者） |
| `.../integration/n8n/application/N8nOrderNotifyListener.java` | `@TransactionalEventListener(AFTER_COMMIT)` + `@Async("n8nNotifyExecutor")`，交易 commit 後在背景執行緒觸發推播 |
| `.../config/AsyncConfig.java` | `@EnableAsync` + `n8nNotifyExecutor` 專用執行緒池（core 2／max 4／queue 100） |
| `.../integration/n8n/application/N8nNotifyService.java` | 訂單事件推播 Webhook（後端 → n8n，fire-and-forget）；`notifyOrderEvent` 有 `OrderStatusChangedEvent`／`OrderNotificationRequestedEvent` 兩個 overload，共用同一段 HTTP 邏輯 |
| `.../integration/n8n/security/N8nApiKeyAuthenticationFilter.java` | `X-Api-Key` |
| `CustomerAuthService` | session 寫入 `line_user_id` |
| `AdminOrderService.ship()/complete()/cancel()` | 狀態變更成功後發佈 `OrderStatusChangedEvent`（不直接依賴 n8n） |
| `.../order/application/OrderNotificationRequestedEvent.java` | 會員主動要求通知事件（非狀態變更），由 `MemberOrderService.notifyLineCsInquiry()` 發佈 |
| `.../integration/n8n/application/N8nOrderNotificationRequestedListener.java` | `@TransactionalEventListener(AFTER_COMMIT)` + `@Async("n8nNotifyExecutor")`，處理會員中心「使用 LINE 追蹤訂單」觸發的通知 |
| `frontend/storefront/js/components/contact-cs.js` | 聯繫客服綁定流程（浮動按鈕） |
| `frontend/storefront/js/components/member-center.js` | 會員中心訂單詳情「使用 LINE 追蹤訂單」按鈕，另外實作自己的 `ensureLineBound()`（不重用 `contact-cs.js`，避免其信任本地快取 `lineBound` 的既有行為） |

---

## Changelog

| 版本 | 日期 | 說明 |
|------|------|------|
| 1.0 | 2026-07-31 | 初版：資料流、授權、n8n 節點對照、工作流骨架、煙測 |
| 1.1 | 2026-08-01 | 補上反方向資料流圖：後台出貨／完成／取消成功後，透過 `OrderStatusChangedEvent` + `@TransactionalEventListener(AFTER_COMMIT)` + `@Async("n8nNotifyExecutor")` 在交易 commit 後於背景執行緒推播 n8n，訂單操作本身不受影響、API 回應也不用等 n8n；未做 outbox／重試，不保證送達；契約見 [`n8n-cs-api-contract.md`](../../api/n8n-cs-api-contract.md) §8 |
| 1.2 | 2026-08-02 | 補上第三方向資料流圖：會員中心「使用 LINE 追蹤訂單」按鈕透過 `OrderNotificationRequestedEvent`（獨立型別，非狀態變更）+ 同一套 `AFTER_COMMIT`／`@Async` 機制觸發推播，`event=cs_inquiry`，沿用同一個 Webhook／密鑰；契約見 [`n8n-cs-api-contract.md`](../../api/n8n-cs-api-contract.md) §8.2 |
