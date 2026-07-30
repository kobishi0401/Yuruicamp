# 本機啟動（組員用）

> 目標：約 **30 分鐘**跑起 **資料庫 + 後端 + 前端 + Firebase**，  
> 並用本機 **金流／物流 stub**（假付款頁、假超商地圖）做結帳煙測。  
> 真綠界沙箱（需 ngrok）見文末「路線 B」。

---

## 0. 先選模式（很重要）

| | 路線 A（日常開發，預設） | 路線 B（真沙箱驗收） |
|--|--------------------------|----------------------|
| Firebase | 真 Google 登入 | 同左 |
| 金流 `YURUICAMP_ECPAY_STUB` | `true`（預設）本機假付款頁 | `false` 跳綠界 stage |
| 物流 `YURUICAMP_ECPAY_LOGISTICS_STUB` | `true`（預設）本機假地圖／假建單 | `false` 真地圖／真出貨 |
| ngrok | **不需要** | **需要**（綠界要打公網 Notify） |
| 適合 | 寫功能、測 checkout UI | 驗綠界串接 |

`application.properties` 預設兩個 stub 都是 `true`，所以路線 A **不用額外關／開金流物流**。

---

## 1. 30 秒概覽（路線 A）

| 服務 | 在哪開 | Port | 做什麼 |
|------|--------|------|--------|
| PostgreSQL | repo 根：`docker compose up -d` | **5433** | 正式資料（schema + seed） |
| 後端 Spring Boot | `backend/`：`mvnw spring-boot:run` | **8080** | API、驗證 Firebase、金流／物流 stub |
| 前端 Vite | `frontend/`：`npm run dev` | **5173** | 商城／預約／後台 |

前端預設接真後端（`USE_MOCK_API: false`），**三個都要開**。

啟動順序（路線 A）：

```text
1. Docker 資料庫
2. 後端（設 DB_PASSWORD + Firebase env 後再 run）
3. 前端 npm run dev
```

---

## 2. 事前安裝（每人一次）

- [ ] [Docker Desktop](https://www.docker.com/products/docker-desktop/)（狀態 Running）
- [ ] [Node.js](https://nodejs.org/) **18+**
- [ ] **JDK 25**（後端 `pom.xml` 指定）
- [ ] Git

向 **Lead** 索取（勿 commit 到 git）：

- Firebase Web 的 `VITE_FIREBASE_*` 各欄位值
- Firebase **Service Account** JSON 檔

---

## 3. 第一次設定（只做一次）

### 3.1 資料庫密碼

```powershell
# 在 repo 根目錄 Yuruicamp/
Copy-Item .env.example .env
```

用編輯器打開 `.env`，**必改**：

```env
POSTGRES_PASSWORD=你的本機密碼
```

### 3.2 Firebase 前端

```powershell
cd frontend
Copy-Item .env.example .env.local
```

填入 Lead 提供的 `VITE_FIREBASE_API_KEY`、`VITE_FIREBASE_AUTH_DOMAIN`、`VITE_FIREBASE_PROJECT_ID` 等（見 `.env.example` 全欄位）。

```powershell
npm install
```

> 改完 `.env.local` 後，之後每次改動都要 **重啟** `npm run dev`。

### 3.3 後台 Google 白名單

正式 seed 不含你的 Gmail。把下面 `your@gmail.com` 換成 **Firebase Google 登入會用到的 email**：

```powershell
# 先確保 DB 已啟動
docker compose up -d

docker exec -i yuruicamp-db psql -U postgres -d yuruicamp -c "
INSERT INTO public.admin_users (id, name, email, role, active)
VALUES ('DEV-GOOGLE-ADMIN', 'Local Admin', 'your@gmail.com', 'admin', true)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  firebase_uid = NULL,
  updated_at = now();"
```

詳細說明：[`docs/seed/dev/021-admin-google-whitelist.example.sql`](./seed/dev/021-admin-google-whitelist.example.sql)

---

## 4. 每天啟動（路線 A · 開 3 個 Terminal）

### Terminal 1 — 資料庫（repo 根）

```powershell
cd Yuruicamp
docker compose up -d
docker ps   # 應看到 yuruicamp-db，PORTS 含 5433
```

### Terminal 2 — 後端（Firebase + 預設金流／物流 stub）

```powershell
cd Yuruicamp\backend

# 必填：與 .env 的 POSTGRES_PASSWORD 相同
$env:DB_PASSWORD = "與 .env 的 POSTGRES_PASSWORD 相同"

# 必填：真 Firebase（路線 A）
$env:FIREBASE_ENABLED = "true"
$env:FIREBASE_CREDENTIALS = "C:\path\to\serviceAccount.json"
$env:FIREBASE_PROJECT_ID = "yuruicamp-2026"   # 與 frontend/.env.local 的 PROJECT_ID 一致

# 金流／物流：預設就是 stub=true，日常開發可省略下面兩行
# $env:YURUICAMP_ECPAY_STUB = "true"
# $env:YURUICAMP_ECPAY_LOGISTICS_STUB = "true"

.\mvnw.cmd spring-boot:run
```

確認：瀏覽器或 `curl http://localhost:8080/api/health` → **UP**。

路線 A 行為速查：

| 功能 | 行為 |
|------|------|
| 綠界付款 | 開本機假付款頁 `/api/payments/ecpay/stub/aio-checkout` |
| 超商地圖 | 本機 stub 地圖 |
| Admin 出貨建物流單 | 回傳 `STUB...` 編號（不是真綠界） |
| 取貨付款 `ecpay-cvs` | 是**付款方式**，≠ 超商取貨物流 `shipping.method=cvs` |

### Terminal 3 — 前端

```powershell
cd Yuruicamp\frontend
npm run dev
```

瀏覽器開：**http://127.0.0.1:5173**

| 要看什麼 | 網址 |
|----------|------|
| 主站首頁 | http://127.0.0.1:5173/storefront/pages/home.html |
| 結帳 | http://127.0.0.1:5173/storefront/pages/checkout.html |
| 營地預約 | http://127.0.0.1:5173/booking/pages/camp-search.html |
| 賣家後台 | http://127.0.0.1:5173/admin/login.html |
| Swagger | http://localhost:8080/swagger-ui.html |
| Health | http://localhost:8080/api/health |

> **常見錯誤**：在 repo 根跑 `npm run dev` → 沒有 CSS／JS。npm 根目錄一定是 **`frontend/`**。

---

## 5. 我成功了嗎？（煙測 checklist）

- [ ] `docker ps` 有容器 `yuruicamp-db`
- [ ] `GET http://localhost:8080/api/health` → **UP**
- [ ] 前端 DevTools Console 有 `✓ AppConfig 已初始化`，且有 `✓ AppAuth 已注入 Firebase Auth`（或 YuruiFirebase 已初始化）
- [ ] Swagger `GET /api/products` 回有商品資料
- [ ] 商城用 **Google 登入** → Network 有 `POST /api/auth/firebase/session` 與 `GET /api/me` 且 **200**
- [ ]（可選）結帳選宅配或超商 → 假付款頁可模擬付清
- [ ]（可選）後台白名單 Gmail 可進 dashboard，訂單可「出貨」（stub 物流編號）

後台煙測：用白名單 Gmail 登入 http://127.0.0.1:5173/admin/login.html → 進 dashboard。

---

## 6. 常見錯誤

| 現象 | 原因 | 處理 |
|------|------|------|
| 頁面沒 CSS／JS | Vite 根目錄錯 | 一定要在 `frontend/` 執行 `npm run dev` |
| 後端 `password authentication failed` | `DB_PASSWORD` 與 `.env` 不一致 | 對齊後 **重啟** 後端 |
| Console 警告 Firebase 未設定 | 缺 `.env.local` 或未重啟 Vite | 複製 `.env.example` → `.env.local` 填值，重啟 dev |
| 後台 Google 登入失敗 | email 不在白名單 | 重做 §3.3 的 SQL |
| `docker compose down -v` 後資料不見 | `-v` 會刪 volume | 預期行為；重做白名單，會員需重新登入 |
| 想測真綠界卻還在假頁 | stub 仍為 `true` | 改走路線 B，設兩個 stub=`false` 並重啟後端 |
| 真沙箱 Notify 不到 | 沒 ngrok／URL 錯／未重啟 | 見路線 B；`PUBLIC_API_BASE_URL` 須含 `/api` |

---

## 7. 路線 B：金流＋物流真沙箱（進階）

**只有要驗綠界 stage 才開。** 詳細驗收步驟請看專文，這裡只記啟動順序。

```text
1. docker compose up -d
2. ngrok http 8080          ← 先開，記下 HTTPS
3. 同一 terminal 設 env（兩個 stub=false + PUBLIC_API_BASE_URL）
4. 再啟動 backend
5. frontend npm run dev
6. Firebase 登入後測 checkout／Admin 出貨
```

後端 env 摘要（URL 換成你的 ngrok；**環境變數只在 process 啟動時讀取，改完要重啟後端**）：

```powershell
cd Yuruicamp\backend

$env:DB_PASSWORD = "與 .env 的 POSTGRES_PASSWORD 相同"

$env:FIREBASE_ENABLED = "true"
$env:FIREBASE_CREDENTIALS = "C:\path\to\serviceAccount.json"
$env:FIREBASE_PROJECT_ID = "yuruicamp-2026"

# Phase 2：兩個 stub 都關
$env:YURUICAMP_ECPAY_STUB = "false"
$env:YURUICAMP_ECPAY_LOGISTICS_STUB = "false"

# ngrok HTTPS + /api 前綴（例）
$env:YURUICAMP_ECPAY_PUBLIC_API_BASE_URL = "https://xxxx.ngrok-free.app/api"
$env:YURUICAMP_FRONTEND_BASE_URL = "http://127.0.0.1:5173"

.\mvnw.cmd spring-boot:run
```

完整步驟：

- 金流：[`docs/backend-specs/payment/ecpay-sandbox-validation.md`](./backend-specs/payment/ecpay-sandbox-validation.md)
- 物流真沙箱：[`docs/backend-specs/logistics/ecpay-real-sandbox-validation.md`](./backend-specs/logistics/ecpay-real-sandbox-validation.md)
- 物流 stub：[`docs/backend-specs/logistics/ecpay-cvs-sandbox-validation.md`](./backend-specs/logistics/ecpay-cvs-sandbox-validation.md)

> ngrok 免費版 URL 每次重啟會變 → 更新 `YURUICAMP_ECPAY_PUBLIC_API_BASE_URL` 並重啟後端。

---

## 8. 相關文件

| 主題 | 文件 |
|------|------|
| Firebase 協作注意 | [`docs/frontend-specs/firebase-merge-into-main-notes.md`](./frontend-specs/firebase-merge-into-main-notes.md) |
| 後端簡短啟動 | [`backend/README.md`](../backend/README.md) |
| Seed 與測試資料 | [`docs/seed/README.md`](./seed/README.md) |
| 手動驗收清單 | [`docs/frontend-specs/test/README.md`](./frontend-specs/test/README.md) |
| 完整 README（百科） | [`README.md`](../README.md) |

---

## 9. 重建資料庫（會清光資料）

只有 schema／seed 改版、或環境壞掉時才做：

```powershell
docker compose down -v
docker compose up -d
# 重做 §3.3 Admin 白名單
```
