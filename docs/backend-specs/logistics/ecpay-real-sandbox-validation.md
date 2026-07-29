# ECPay 物流 Phase 2 — 真實沙箱驗收（ngrok + HOME/TCAT）

| 欄位 | 內容 |
|------|------|
| **狀態** | Phase 2 驗收指南 |
| **前提** | Phase 1 stub 已過（見 [`ecpay-cvs-sandbox-validation.md`](./ecpay-cvs-sandbox-validation.md)） |
| **規格** | [`.scratch/ecpay-logistics-phase2/spec.md`](../../../.scratch/ecpay-logistics-phase2/spec.md) |
| **金流文件** | [`../payment/ecpay-sandbox-validation.md`](../payment/ecpay-sandbox-validation.md) |
| **知識庫** | `.ecpay-skill` guides/06 國內物流 |

---

## 0. 這份文件要驗收到什麼？

Phase 2 分 **兩輪**，都要在 **真綠界 stage** 跑（不是 stub）：

| 輪次 | 配送方式 | 買家流程 | Admin 出貨 |
|------|----------|----------|------------|
| **Round 1** | 超商取貨 `cvs` | 真電子地圖選全家 → 真刷卡 | 真 `/Express/Create`（CVS/FAMI） |
| **Round 2** | 宅配 `delivery` | 填地址 → 真刷卡 | 真 `/Express/Create`（HOME/TCAT） |

兩輪都需要 **ngrok**，讓綠界伺服器能 POST callback 到你的本機。

```text
Round 1 先跑完 → 再跑 Round 2（HOME 需後端實作 TCAT 建單）
```

---

## 1. 與 Phase 1 stub 的差異

| 項目 | Phase 1 stub | Phase 2 真沙箱 |
|------|--------------|----------------|
| 金流付款頁 | 本機假頁 | `payment-stage.ecpay.com.tw` 真刷卡 |
| 超商地圖 | 本機 stub 頁 | `logistics-stage.../Express/map` 真地圖 |
| 建物流單 | 回傳 `STUB...` 編號 | 綠界真實 `AllPayLogisticsID` |
| Callback | 本機 localhost 即可 | **必須** ngrok HTTPS 公網 |
| 物流 notify | 可能沒有 | 應看到後端 log（本階段不回寫 DB） |

---

## 2. 帳號不要搞混

| | 金流 AIO | 物流 |
|---|---------|------|
| MerchantID | `3002607` | `2000132` |
| 加密 | **SHA256** | **MD5** |
| 超商代碼繳費 `ecpay-cvs` | 是**付款方式** | ≠ 超商**取貨物流** `shipping.method=cvs` |

---

## 3. 前置：服務與 ngrok

### 3.1 啟動順序（重要）

```text
1. docker compose up -d          # 資料庫
2. ngrok http 8080               # 先開 tunnel，記下 HTTPS URL
3. 設 env（含 ngrok URL）         # 見 §4
4. 啟動 backend                  # env 設好後才 run
5. cd frontend && npm run dev
6. Firebase 登入（.env.local）    # 與 Phase 1 相同
```

**規則：** 同一輪驗收 **不要關 ngrok**；關掉重開 URL 會變，要重設 env + 重啟 backend。

### 3.2 ngrok 範例

```powershell
ngrok http 8080
```

記下類似：

```text
Forwarding  https://abc123.ngrok-free.app -> http://localhost:8080
```

### 3.3 三個 Callback URL（皆來自同一 base）

設 `YURUICAMP_ECPAY_PUBLIC_API_BASE_URL=https://abc123.ngrok-free.app/api` 後：

| 用途 | 完整 URL |
|------|----------|
| 金流 notify | `https://abc123.ngrok-free.app/api/payments/ecpay/notify` |
| 地圖選店結果 | `https://abc123.ngrok-free.app/api/logistics/ecpay/map-result` |
| 物流狀態 notify | `https://abc123.ngrok-free.app/api/logistics/ecpay/notify` |

---

## 4. 環境變數（後端同一 terminal）

```powershell
cd backend
$env:DB_PASSWORD = "你的 POSTGRES_PASSWORD"

# Phase 2：兩個 stub 都關
$env:YURUICAMP_ECPAY_STUB = "false"
$env:YURUICAMP_ECPAY_LOGISTICS_STUB = "false"

# ngrok HTTPS + /api 前綴
$env:YURUICAMP_ECPAY_PUBLIC_API_BASE_URL = "https://abc123.ngrok-free.app/api"
$env:YURUICAMP_FRONTEND_BASE_URL = "http://127.0.0.1:5173"

# Firebase（真登入）
$env:FIREBASE_ENABLED = "true"
$env:FIREBASE_CREDENTIALS = "C:\path\to\serviceAccount.json"
$env:FIREBASE_PROJECT_ID = "yuruicamp-2026"

.\mvnw.cmd spring-boot:run
```

確認：`GET http://localhost:8080/api/health` → UP。

---

## 5. Round 1：CVS 超商取貨（全真 E2E）

> **收件人姓名（重要）：** checkout 收件人來自 **會員預設配送地址**（與會員中心同一 Modal）。走 CVS／宅配時須填 **中文姓名**（例如 `陳柏榮`），**不可**使用 Firebase 英文名或含 `-`、空格的姓名，否則 Admin 出貨會得 `10500070` 或後端 CONFLICT。可在 **會員中心 → 配送地址** 先改好再下單。

### 5.1 買家 checkout

1. Firebase 登入 → **確認會員配送地址收件人為中文**（例：陳柏榮）→ 加購物車 → `/storefront/pages/checkout.html`
2. Step 1 **配送資訊**：確認收件人摘要（姓名／手機／Email）；不足時按 **編輯** 完成 Modal
3. 選 **超商取貨（全家）**
4. 按 **選擇全家門市**

**預期：** 瀏覽器跳到 **綠界 stage 電子地圖**（不是「本機物流 stub」頁）。

5. 在綠界地圖選一家測試門市 → 確認
6. **預期：** 導回 checkout，URL 可能含 `?cvsMap=ok&orderId=...`，門市名稱有顯示

### 5.2 真刷卡付款

1. 選 **信用卡（綠界）** → 結帳
2. **預期：** 跳到 `payment-stage.ecpay.com.tw` 刷卡頁（不是本機 stub）
3. 使用綠界沙箱測試卡（例如 `4311-9522-2222-2222`，依綠界文件）
4. **預期：** 付款成功；訂單 `payment_status = paid`

### 5.3 Network 檢查點

- [ ] `POST .../auth/firebase/session` → 200
- [ ] `PATCH .../checkout/sessions/...` → 200（選店前更新收件人）
- [ ] `POST .../checkout/sessions/.../ecpay/cvs-map` → 200（含 map form）
- [ ] 綠界 **server** → `POST .../logistics/ecpay/map-result`（可在 ngrok inspect 或 backend log 看到）
- [ ] 綠界 **server** → `POST .../payments/ecpay/notify` → 訂單變 paid

> 付款真相是 **notify**，不是瀏覽器 Return 回前端那一跳。

### 5.4 Admin 出貨

1. Admin Google 登入 → 訂單列表 → 找剛才訂單（paid + unshipped）
2. 按 **出貨**

**預期：**

- [ ] 成功，無 CONFLICT
- [ ] 後端 log 無 `ECPay logistics create failed`
- [ ] DB `ecpay_logistics_id` **不是** `STUB` 開頭

```powershell
docker compose exec yuruicamp-db psql -U postgres -d yuruicamp -c "
SELECT id, shipping_method, cvs_store_id, cvs_store_name, ecpay_logistics_id, status, payment_status
FROM orders ORDER BY created_at DESC LIMIT 3;"
```

### 5.5 Round 1 過關 Checklist

- [ ] 真綠界地圖選店 + 回 checkout
- [ ] 真刷卡 + payment notify → paid
- [ ] Admin 出貨 + 真 logistics id
- [ ] 後端 log 出現 `ECPay logistics notify`（見 §5.6；本階段只 log，不改狀態）

### 5.6 物流 notify 確認步驟（Round 1 / Round 2 共用）

Admin 出貨成功後，綠界會 **非同步** 推送物流狀態到 `POST /api/logistics/ecpay/notify`。本階段後端 **只驗 MD5 + log + 回 `1|OK`**，不會改訂單狀態。

#### 怎麼確認有收到？

1. **ngrok Web Interface**（預設 `http://127.0.0.1:4040`）
   - 找 `POST /api/logistics/ecpay/notify`
   - Response body 應為 `1|OK`

2. **Backend log**（出貨後等數秒～數分鐘）

   預期一行類似：

   ```text
   ECPay logistics notify: AllPayLogisticsID=1234567 MerchantTradeNo=ORD0001123456 RtnCode=300 RtnMsg=訂單處理中
   ```

   - `AllPayLogisticsID`：應與 DB `ecpay_logistics_id` 相同
   - `MerchantTradeNo`：建單時送給綠界的交易編號（可追蹤出貨請求）

#### 為什麼可能暫時看不到？

| 情況 | 說明 |
|------|------|
| **時序** | 綠界推送有延遲；出貨後先確認建單成功，再等 1～5 分鐘 |
| **ngrok 重開** | URL 變了但 backend 仍用舊 `PUBLIC_API_BASE_URL` → 綠界 POST 不到 |
| **stub 仍開** | 真沙箱必須兩個 `STUB=false` |
| **尚未出貨** | notify 在 Admin 建單後才會來；只付款、未出貨不會有 |
| **CheckMacValue 失敗** | log 不會有 notify 成功行；ngrok 可能看到 400 `Invalid CheckMacValue` |

#### 快速 checklist

- [ ] ngrok inspect 有 `POST .../logistics/ecpay/notify` → 200 + `1|OK`
- [ ] backend log 含 `ECPay logistics notify` 與 `AllPayLogisticsID=...`
- [ ] 訂單 `status` **仍維持** `shipped`（本階段刻意不 auto complete）

---

## 6. Round 2：宅配 delivery + HOME/TCAT

> **前提：** Round 1 已過；後端已實作 `delivery` 訂單 Admin 出貨時呼叫 HOME/TCAT 建單（見 spec Implementation Decisions）。

### 6.1 買家 checkout

1. Firebase 登入 → **配送地址收件人改中文** → 加購物車 → checkout
2. 選 **宅配到府**（不是超商、不是門市自取）
3. 在 **收件人摘要** 與 **送達地址** 完成 Modal（縣市區路號、電話 `09xxxxxxxx`）
4. 真刷卡 → 訂單 `paid`

**注意：** 宅配 **不需要** 電子地圖；比 CVS 少一個 callback。

### 6.2 Admin 出貨

1. 找 `shipping_method = delivery` 的 paid 訂單
2. 按 **出貨**

**預期：**

- [ ] 成功
- [ ] DB `shipping_method = delivery`，`ecpay_logistics_id` 有值（非 STUB）
- [ ] `cvs_store_id` 為 null

```powershell
docker compose exec yuruicamp-db psql -U postgres -d yuruicamp -c "
SELECT id, shipping_method, shipping_address_snapshot, ecpay_logistics_id, status, payment_status
FROM orders ORDER BY created_at DESC LIMIT 3;"
```

### 6.3 Round 2 過關 Checklist

- [ ] delivery 訂單真刷卡 paid
- [ ] Admin 出貨建立 HOME/TCAT 物流單
- [ ] `ecpay_logistics_id` 為綠界真實編號
- [ ] §5.6 物流 notify log 可追蹤（`AllPayLogisticsID` 與 DB 一致）

---

## 7. 常見錯誤

| 現象 | 原因 | 解法 |
|------|------|------|
| 仍看到 stub 地圖／stub 付款 | stub env 仍 true | 確認兩個 `STUB=false` 並重啟 backend |
| 選店後沒回 checkout | ngrok URL 錯或未開 | 重查 `PUBLIC_API_BASE_URL` 與 ngrok Forwarding |
| 付款完成但訂單仍 unpaid | payment notify 沒進來 | 查 ngrok inspect、`/payments/ecpay/notify` |
| 出貨 CONFLICT 建單失敗 | MD5/欄位/地址錯 | 看 backend log 的 `RtnCode`/`RtnMsg` |
| 出貨 `10500070` 或 CONFLICT「綠界物流格式」 | 收件人含 `-`、空格或 Firebase 英文名 | 會員中心改 **中文收件人**（如陳柏榮）後重下單 |
| PATCH 500 `ck_orders_shipping_target` | 未選店就寫 `cvs` | 先選店；或更新至含 defer 修正的 backend |
| `pickup` 訂單不該建綠界單 | 自家門市取貨 | 正常；只有 `cvs` 與 `delivery` 走綠界 |

---

## 8. 本階段刻意不做

- 物流 notify 自動改訂單狀態（到店、取件 → completed）
- 郵局 POST、7-11、萊爾富
- 物流代收 `IsCollection=Y`

這些留 Phase 3 或獨立 spec。

---

## 9. 相關文件

| 文件 | 用途 |
|------|------|
| [`ecpay-cvs-sandbox-validation.md`](./ecpay-cvs-sandbox-validation.md) | Phase 1 stub 驗收 |
| [`../payment/ecpay-sandbox-validation.md`](../payment/ecpay-sandbox-validation.md) | 金流真沙箱細節、測試卡 |
| [`.scratch/ecpay-logistics-phase2/spec.md`](../../../.scratch/ecpay-logistics-phase2/spec.md) | Phase 2 完整 PRD |
| [`.scratch/checkout-recipient-ecpay/CONTEXT.md`](../../../.scratch/checkout-recipient-ecpay/CONTEXT.md) | Buyer／Recipient／ReceiverName 詞彙 |
| [`../../adr/0003-checkout-recipient-sync-member-address.md`](../../adr/0003-checkout-recipient-sync-member-address.md) | Checkout 收件人決策 ADR |
| [`firebase-merge-into-main-notes.md`](../../frontend-specs/firebase-merge-into-main-notes.md) | Firebase 登入驗收 |
