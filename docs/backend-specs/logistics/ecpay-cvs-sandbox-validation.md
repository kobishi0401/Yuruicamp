# ECPay CVS 超商取貨物流 — 本機驗收步驟（新手版）

| 欄位 | 內容 |
|------|------|
| **狀態** | 第一版：全家 FAMI B2C + Admin 出貨建單 |
| **契約** | `shipping.method=cvs` + `POST .../ecpay/cvs-map` |
| **知識庫** | [`.ecpay-skill/guides/06-logistics-domestic.md`](../../../.ecpay-skill/guides/06-logistics-domestic.md) |

---

## 第 0 步：你會驗收到什麼？

整條路徑如下：

```text
1. 套用 SQL patch（資料庫加 cvs 欄位）
2. 啟動 Docker 資料庫 + 後端 + 前端
3. 買家 checkout 選「超商取貨」→ 選門市（stub 測試店）
4. 付款（金流 stub 假付款頁）
5. Admin 後台按「出貨」→ 後端建立綠界物流單（stub 假編號）
```

---

## 第 1 步：套用 SQL patch（Windows）

### 1.1 確認 Docker 有在跑

在專案根目錄 `Yuruicamp` 開 PowerShell 或 CMD：

```powershell
docker compose ps
```

應看到 `yuruicamp-db` 狀態為 **running**。若沒有：

```powershell
docker compose up -d
```

等 10 秒再查一次。

### 1.2 執行 patch（複製貼上整行）

**PowerShell：**

```powershell
Get-Content docs\patches\093-ecpay-cvs-logistics.sql -Raw | docker compose exec -T yuruicamp-db psql -U postgres -d yuruicamp
```

**CMD（命令提示字元）：**

```cmd
type docs\patches\093-ecpay-cvs-logistics.sql | docker compose exec -T yuruicamp-db psql -U postgres -d yuruicamp
```

### 1.3 成功長什麼樣？

正常輸出類似：

```text
ALTER TYPE
BEGIN
ALTER TABLE
ALTER TABLE
ALTER TABLE
CREATE TABLE
COMMENT
COMMENT
COMMIT
```

**不應出現** `ERROR` 或 `ROLLBACK`。

若曾跑過舊版 patch 失敗，直接再跑一次修正後的 patch 即可（有 `IF NOT EXISTS` / `IF NOT EXISTS 'cvs'`）。

### 1.4 確認資料庫真的改好了（可選）

```powershell
docker compose exec yuruicamp-db psql -U postgres -d yuruicamp -c "SELECT unnest(enum_range(NULL::shipping_method));"
```

應包含三個值：`delivery`、`pickup`、**`cvs`**。

```powershell
docker compose exec yuruicamp-db psql -U postgres -d yuruicamp -c "\d orders" | findstr cvs
```

應看到 `cvs_store_id`、`ecpay_logistics_id` 等欄位。

---

## 第 2 步：設定環境變數並啟動後端

### 2.1 確認 `.env` 資料庫密碼

根目錄 `.env` 的 `POSTGRES_PASSWORD` 要與你本機一致（backend 連線用）。

### 2.2 開一個新 terminal — 啟動後端

```powershell
cd backend
$env:DB_PASSWORD = "你的 POSTGRES_PASSWORD"

# 金流 + 物流都用 stub（本機假頁，不需 ngrok）
$env:YURUICAMP_ECPAY_STUB = "true"
$env:YURUICAMP_ECPAY_LOGISTICS_STUB = "true"
$env:YURUICAMP_ECPAY_PUBLIC_API_BASE_URL = "http://localhost:8080/api"
$env:YURUICAMP_FRONTEND_BASE_URL = "http://127.0.0.1:5173"

.\mvnw.cmd spring-boot:run
```

### 2.3 確認後端健康

另開 terminal：

```powershell
curl http://localhost:8080/api/health
```

應回 `{"status":"UP"}` 或類似 UP 狀態。

若�動失敗且訊息含 `Schema-validation` / `missing column` → 回到 **第 1 步** 重跑 SQL patch。

---

## 第 3 步：啟動前端

再開一個 terminal：

```powershell
cd frontend
npm run dev
```

瀏覽器開：`http://127.0.0.1:5173`（以 Vite 顯示的網址為準）。

確認前端 `.env` 或設定為 **真後端模式**（`USE_MOCK_API=false`，依你專案慣例）。

---

## 第 4 步：買家 checkout — 超商選店

### 4.1 登入

使用 dev token 或 Firebase 測試帳號登入（依 `backend/README.md`）。

### 4.2 加商品進購物車 → 進 checkout 頁

路徑通常是：`/storefront/pages/checkout.html`

### 4.3 填寫資料

| 項目 | 填什麼 |
|------|--------|
| 收件人姓名 | 任意，例如 `王小明` |
| 電話 | `0912345678`（09 開頭 10 碼） |
| 配送方式 | 選 **超商取貨（全家）** |

### 4.4 選門市

1. 按 **「選擇全家門市」**
2. 會跳到 stub 頁：「本機物流 stub：將使用測試全家門市」
3. 按 **「確認測試門市」**
4. 自動回到 checkout，應顯示門市名稱（例如 `Mock全家測試店` 或 stub 店名）

### 4.5 選付款方式 → 結帳

- 選 **信用卡（綠界）** 或專案預設線上付款
- 按 **結帳並前往付款**（或 ready 後的同等按鈕）
- stub 金流會進假付款頁 → 完成後訂單應為 **已付款**

### 4.6 驗收點（買家端）

- [ ] checkout 有第三個選項「超商取貨（全家）」
- [ ] 選店後門市名稱有顯示
- [ ] 付款後訂單成功（success 頁或會員訂單列表為 paid）

---

## 第 5 步：Admin 出貨（建立物流單）

### 5.1 登入 Admin 後台

開 admin 訂單列表（依專案路徑，例如 `admin/dashboard.html` → 訂單）。

### 5.2 找到剛才的訂單

狀態應為：**已付款、未出貨**（unshipped / paid）。

### 5.3 按「出貨」

成功後：

- 訂單狀態 → **已出貨**（shipped）
- 後端在 stub 模式會寫入假的 `ecpay_logistics_id`（以 `STUB` 開頭）

### 5.4 驗收點（Admin + 後端 log）

- [ ] 出貨按鈕成功，無 CONFLICT 錯誤
- [ ] 後端 log 無 `ECPay logistics create failed`
- [ ] （可選）查 DB：

```powershell
docker compose exec yuruicamp-db psql -U postgres -d yuruicamp -c "SELECT id, shipping_method, cvs_store_id, ecpay_logistics_id, status, payment_status FROM orders ORDER BY created_at DESC LIMIT 3;"
```

`shipping_method` 應為 `cvs`，`cvs_store_id` 有值，`ecpay_logistics_id` 出貨後有值。

---

## 第 6 步：進階 — 接真實綠界沙箱（可之後再做）

需要 **ngrok** 讓綠界能 POST 到你的本機：

```powershell
ngrok http 8080
```

把 ngrok 的 HTTPS 網址設進後端（**同一個** terminal 啟動 backend 前）：

```powershell
$env:YURUICAMP_ECPAY_STUB = "false"
$env:YURUICAMP_ECPAY_LOGISTICS_STUB = "false"
$env:YURUICAMP_ECPAY_PUBLIC_API_BASE_URL = "https://你的子網域.ngrok-free.app/api"
```

詳見 [`docs/backend-specs/payment/ecpay-sandbox-validation.md`](../payment/ecpay-sandbox-validation.md)。

---

## 常見錯誤對照

| 錯誤訊息 | 原因 | 解法 |
|----------|------|------|
| `unsafe use of new value "cvs" of enum type` | 舊版 patch 在同一 transaction 用新 enum | 用**修正後**的 `093-ecpay-cvs-logistics.sql` 重跑 |
| `Schema-validation: missing column cvs_store_id` | SQL patch 沒套用 | 重跑第 1 步 |
| 選店後 401 | 未登入或 session 過期 | 重新登入再 checkout |
| 出貨 CONFLICT「CVS store is not selected」 | 沒完成選店 | 回 checkout 重新選門市 |
| 後端起不來 port 8080 |  port 被佔用 | 關掉舊 process 或改 port |

---

## 與金流帳號差異（提醒）

| | 金流 AIO | 物流 CVS |
|---|---------|----------|
| MerchantID | `3002607` | `2000132` |
| 加密 | SHA256 | **MD5** |
| 超商**代碼繳費** `ecpay-cvs` | 是付款方式 | ≠ 超商**取貨物流** |

---

## 下一步：Phase 2 真沙箱 + 宅配

Stub 驗收完成後，接 **ngrok + 真綠界 stage + HOME/TCAT** 請見：

- [`ecpay-real-sandbox-validation.md`](./ecpay-real-sandbox-validation.md)
- 規格：[`.scratch/ecpay-logistics-phase2/spec.md`](../../../.scratch/ecpay-logistics-phase2/spec.md)
