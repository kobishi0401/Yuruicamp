# ECPay 真實沙箱驗收（下一步 B）

| 欄位 | 內容 |
|------|------|
| **狀態** | **已完成**（stub ✅；商城真實沙箱 ✅，2026-07-29／30） |
| **日期** | 2026-07-30（驗收完成）；原稿 2026-07-25 |
| **前提** | I-7／I-8／CK-5 stub 已完成（本機假付款頁） |
| **契約** | [`docs/api/payment-api-contract.md`](../../api/payment-api-contract.md) |
| **物流真沙箱** | [`../logistics/ecpay-real-sandbox-validation.md`](../logistics/ecpay-real-sandbox-validation.md)（Phase 2 同步完成） |
| **綠界知識庫** | [`.ecpay-skill/SKILL.md`](../../../.ecpay-skill/SKILL.md)、[`guides/00-getting-started.md`](../../../.ecpay-skill/guides/00-getting-started.md)、[`guides/24-local-development.md`](../../../.ecpay-skill/guides/24-local-development.md) |

---

## 0. 一句話

```text
stub=true  → 本機假付款頁，Notify 在同一 process 內模擬（已完成）
stub=false → 瀏覽器跳到綠界 stage 頁真刷卡；Notify 必須從公網 HTTPS 打進後端
```

**付款真相仍是 `POST /api/payments/ecpay/notify`**，不是 Return 導回前端。

---

## 1. 與 stub 的差異

| 項目 | stub=true（已完成） | stub=false（本文件） |
|------|---------------------|----------------------|
| 付款頁 | `/api/payments/ecpay/stub/aio-checkout` | `https://payment-stage.ecpay.com.tw/...` |
| Notify | stub 內部 `simulatePaid` | 綠界伺服器 POST 到你的公網 URL |
| 本機 localhost Notify | ✅ 可以 | ❌ 綠界打不進來，需 ngrok 等 |
| 測試卡 | 不用 | 4311-9522-2222-2222 等沙箱卡 |

---

## 2. 前置：服務與帳號

### 2.1 本機服務

```powershell
# 1. Postgres
docker compose up -d

# 2. 後端（另開 terminal）
cd backend
$env:DB_PASSWORD = "你的 POSTGRES_PASSWORD"
# 見 §3 設定 ECPay 環境變數後：
.\mvnw.cmd spring-boot:run

# 3. 前端（另開 terminal）
cd frontend
npm run dev
```

確認：`GET http://localhost:8080/api/health` → UP。

### 2.2 綠界沙箱帳號（預設已內建於 application.properties）

| 設定 | 預設值（測試商店） |
|------|-------------------|
| MerchantID | `3002607` |
| HashKey | `pwFHCqoQZGmho4w6` |
| HashIV | `EkRm7iFT261dpevs` |

可沿用；若你有廠商後台專屬沙箱金鑰，改環境變數即可（勿 commit 真實 HashKey）。

---

## 3. 環境變數（後端重啟前設定）

在 PowerShell **同一個** 啟動後端的 terminal 設定：

```powershell
# 關閉 stub，改走綠界 stage
$env:YURUICAMP_ECPAY_STUB = "false"

# ngrok 轉發到 localhost:8080 後，把下面換成你的 HTTPS 網址 + /api
# 例：ngrok 顯示 Forwarding https://abc123.ngrok-free.app -> localhost:8080
$env:YURUICAMP_ECPAY_PUBLIC_API_BASE_URL = "https://abc123.ngrok-free.app/api"

# 前端 Vite（通常不用改）
$env:YURUICAMP_FRONTEND_BASE_URL = "http://127.0.0.1:5173"

# 其餘可沿用預設
$env:YURUICAMP_ECPAY_MERCHANT_ID = "3002607"
$env:YURUICAMP_ECPAY_HASH_KEY = "pwFHCqoQZGmho4w6"
$env:YURUICAMP_ECPAY_HASH_IV = "EkRm7iFT261dpevs"
```

後端組出的 Notify URL 為：

```text
{YURUICAMP_ECPAY_PUBLIC_API_BASE_URL}/payments/ecpay/notify
```

必須與 ngrok 轉發路徑一致（Spring 監聽 8080，路徑含 `/api` 前綴）。

`.env.example` 有完整變數清單；**不要**把真實 HashKey 寫進 Git。

---

## 4. ngrok 設定（Windows）

### 4.1 安裝

- 下載：https://ngrok.com/download  
- 或：`winget install ngrok`  
- 首次：`ngrok config add-authtoken <你的 token>`

### 4.2 啟動隧道

```powershell
# 轉發到 Spring Boot 8080
ngrok http 8080
```

複製 **Forwarding** 的 HTTPS URL，例如 `https://abc123.ngrok-free.app`。

設：

```powershell
$env:YURUICAMP_ECPAY_PUBLIC_API_BASE_URL = "https://abc123.ngrok-free.app/api"
```

**重啟後端**（環境變數只在 process 啟動時讀取）。

### 4.3 驗證隧道

```powershell
curl https://abc123.ngrok-free.app/api/health
```

應回 `{"success":true,"data":{"status":"UP"}}`。

> ngrok 免費版 URL 每次重啟會變 → 更新 `PUBLIC_API_BASE_URL` 並重啟後端。

---

## 5. 瀏覽器驗收步驟

與 I-8 相同流程，但付款頁變**真綠界**。

### 5.1 商城 ECPay

1. Firebase Google 登入 → 加購物車（seed SKU 如 `V001`）
2. `cart.html` → `checkout.html` → 填表 → **信用卡（ECPay）** → 確認
3. 瀏覽器跳到 **綠界 stage 付款頁**
4. 測試卡（沙箱）：
   - 卡號：`4311-9522-2222-2222`
   - 有效期限：任意未來月年
   - 安全碼：任意 3 碼
5. 付完後導回 `checkout-success.html`
6. Network：`GET /api/checkout/sessions/{orderId}` → **`paymentStatus=paid`**

### 5.2 預約 ECPay

1. `C002`、營位 `Z001` 或 `Z002`、避開公休 9/1～9/2
2. `booking-cart` → `booking-checkout` → **前往 ECPay**
3. 綠界付完 → `booking-success.html`
4. `GET /api/booking/bookings/{id}` → **`paid`** + **`status=pending`**

### 5.3 COD（可選）

COD **不走綠界**，stub 關閉不影響；行為應與 I-8 相同。

---

## 6. 後端／DB 驗證

付款成功後可在 DB 查：

```sql
-- 商城
SELECT payment_status, status FROM orders WHERE id = '你的 orderId';
SELECT result, merchant_trade_no FROM payment_notifications WHERE order_id = '你的 orderId';

-- 預約
SELECT payment_status, status FROM bookings WHERE id = '你的 bookingId';
SELECT result FROM payment_notifications WHERE booking_id = '你的 bookingId';
```

預期：`payment_status=paid`、`payment_notifications.result=success`。

---

## 7. 常見問題

| 現象 | 原因 | 處理 |
|------|------|------|
| 付完仍 Unpaid | Notify 沒進來 | 查 ngrok URL、重啟後端 env、`PUBLIC_API_BASE_URL` 是否含 `/api` |
| Notify 400 CheckMacValueInvalid | HashKey/IV 不符 | 對齊 3002607 測試向量或廠商後台 |
| 404 stub disabled | 仍打 stub URL | 確認 `YURUICAMP_ECPAY_STUB=false` 且重啟 |
| 綠界頁打不开 | actionUrl 錯 | 看 `POST .../ecpay` 回應的 `actionUrl` |
| ngrok 502 | 後端沒跑 | 先 localhost:8080 health |

Notify 成功時後端 log 不應出現 `CheckMacValue invalid`；response body 為純文字 `1|OK`。

---

## 8. 完成標準（勾選後可更新 checklist）

- [x] ngrok（或 Cloudflare Tunnel）公網 HTTPS → 8080 通（2026-07-29／30 手動）
- [x] `YURUICAMP_ECPAY_STUB=false` 重啟後端
- [x] 商城：綠界 stage 真刷卡 → `paymentStatus=paid`（例：`O3aa85274…`，`payment_notifications.result=success`）
- [ ] 預約：同上 → `paid` + `pending`（與商城共用 Notify；可選補驗）
- [x] `payment_notifications` 有 `result=success` 列
- [ ] （部署前）真實綠界退款 HTTP — 目前非 stub 時 Admin 退款 port 仍回失敗，另開任務

> **2026-07-30：** 商城金流真沙箱＋物流 Phase 2（ngrok）已手動過關。預約走同一 `POST /api/payments/ecpay/notify`，未另開一輪時視為可選。

---

## 9. 相關設定檔

| 檔案 | 用途 |
|------|------|
| [`backend/src/main/resources/application.properties`](../../../backend/src/main/resources/application.properties) | 預設 stub=true、stage URL |
| [`.env.example`](../../../.env.example) | 本機 env 範本 |
| [`plans/post-firebase-roadmap-checklist.md`](../../../plans/post-firebase-roadmap-checklist.md) §5 步驟 10 | 路線圖索引 |
| [`../logistics/ecpay-real-sandbox-validation.md`](../logistics/ecpay-real-sandbox-validation.md) | Phase 2 物流真沙箱（CVS + HOME/TCAT，需 ngrok + 雙 stub false） |
