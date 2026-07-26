# 本機啟動（組員用 · 路線 A）

> **路線 A**：Firebase 真登入 + ECPay stub（本機假付款頁，不用 ngrok）。  
> 目標：約 **30 分鐘**內跑起資料庫、後端、前端，並完成 Google 登入煙測。

---

## 30 秒概覽

| 服務 | 在哪開 | Port |
|------|--------|------|
| 資料庫 PostgreSQL | repo 根：`docker compose up -d` | **5433** |
| 後端 Spring Boot | `backend/`：`mvnw spring-boot:run` | **8080** |
| 前端 Vite | `frontend/`：`npm run dev` | **5173** |

前端預設已接後端（`USE_MOCK_API: false`），**三個服務都要開**才會有登入、結帳、後台。

---

## 事前安裝（每人一次）

- [ ] [Docker Desktop](https://www.docker.com/products/docker-desktop/)（狀態 Running）
- [ ] [Node.js](https://nodejs.org/) **18+**
- [ ] **JDK 25**（後端 `pom.xml` 指定）
- [ ] Git

向 **Lead** 索取（勿 commit 到 git）：

- Firebase Web 的 `VITE_FIREBASE_*` 各欄位值
- Firebase **Service Account** JSON 檔

---

## 第一次設定（只做一次）

### 1. 資料庫密碼

```powershell
# 在 repo 根目錄 Yuruicamp/
Copy-Item .env.example .env
```

用編輯器打開 `.env`，**必改**：

```env
POSTGRES_PASSWORD=你的本機密碼
```

### 2. Firebase 前端

```powershell
cd frontend
Copy-Item .env.example .env.local
```

填入 Lead 提供的 `VITE_FIREBASE_API_KEY`、`VITE_FIREBASE_AUTH_DOMAIN`、`VITE_FIREBASE_PROJECT_ID` 等（見 `.env.example` 全欄位）。

> 改完 `.env.local` 後，之後每次改動都要 **重啟** `npm run dev`。

### 3. 前端依賴

```powershell
cd frontend
npm install
```

### 4. 後台 Google 白名單

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

## 每天啟動（開 3 個 Terminal）

### Terminal 1 — 資料庫（repo 根）

```powershell
cd Yuruicamp
docker compose up -d
docker ps   # 應看到 yuruicamp-db，PORTS 含 5433
```

### Terminal 2 — 後端

```powershell
cd Yuruicamp\backend

$env:DB_PASSWORD = "與 .env 的 POSTGRES_PASSWORD 相同"
$env:FIREBASE_ENABLED = "true"
$env:FIREBASE_CREDENTIALS = "C:\path\to\serviceAccount.json"
$env:FIREBASE_PROJECT_ID = "yuruicamp-2026"   # 與 frontend/.env.local 的 PROJECT_ID 一致

.\mvnw.cmd spring-boot:run
```

ECPay 本路線 **不用額外設定**（預設 stub 假付款頁）。

### Terminal 3 — 前端

```powershell
cd Yuruicamp\frontend
npm run dev
```

瀏覽器開：**http://127.0.0.1:5173**

| 要看什麼 | 網址 |
|----------|------|
| 主站首頁 | http://127.0.0.1:5173/storefront/pages/home.html |
| 營地預約 | http://127.0.0.1:5173/booking/pages/camp-search.html |
| 賣家後台 | http://127.0.0.1:5173/admin/login.html |
| Swagger | http://localhost:8080/swagger-ui.html |
| Health | http://localhost:8080/api/health |

> **常見錯誤**：在 repo 根跑 `npm run dev` → 沒有 CSS／JS。npm 根目錄一定是 **`frontend/`**。

---

## 我成功了嗎？（5 項全勾就 OK）

- [ ] `docker ps` 有容器 `yuruicamp-db`
- [ ] 瀏覽器或 `curl http://localhost:8080/api/health` → **UP**
- [ ] 前端 DevTools Console 有 `✓ AppConfig 已初始化`，且有 `✓ AppAuth 已注入 Firebase Auth`（或 YuruiFirebase 已初始化）
- [ ] Swagger `GET /api/products` 回有商品資料
- [ ] 商城用 **Google 登入** → Network 有 `POST /api/auth/firebase/session` 與 `GET /api/me` 且 **200**

後台煙測：用白名單 Gmail 登入 http://127.0.0.1:5173/admin/login.html → 進 dashboard。

---

## 常見 5 錯

| 現象 | 原因 | 處理 |
|------|------|------|
| 頁面沒 CSS／JS | Vite 根目錄錯 | 一定要在 `frontend/` 執行 `npm run dev` |
| 後端 `password authentication failed` | `DB_PASSWORD` 與 `.env` 不一致 | 對齊後 **重啟** 後端 |
| Console 警告 Firebase 未設定 | 缺 `.env.local` 或未重啟 Vite | 複製 `.env.example` → `.env.local` 填值，重啟 dev |
| 後台 Google 登入失敗 | email 不在白名單 | 重做 §4 的 SQL |
| `docker compose down -v` 後資料不見 | `-v` 會刪 volume | 預期行為；重做白名單，會員需重新登入 |

---

## 下一步（進階才看）

| 主題 | 文件 |
|------|------|
| Firebase 協作注意 | [`docs/frontend-specs/firebase-merge-into-main-notes.md`](./frontend-specs/firebase-merge-into-main-notes.md) |
| ECPay 真沙箱（需 ngrok） | [`docs/backend-specs/payment/ecpay-sandbox-validation.md`](./backend-specs/payment/ecpay-sandbox-validation.md) |
| 手動驗收清單 | [`docs/frontend-specs/test/README.md`](./frontend-specs/test/README.md) |
| Seed 與測試資料 | [`docs/seed/README.md`](./seed/README.md) |
| 完整 README（百科） | [`README.md`](../README.md) |

---

## 重建資料庫（會清光資料）

只有 schema／seed 改版、或環境壞掉時才做：

```powershell
docker compose down -v
docker compose up -d
# 重做 §4 Admin 白名單
```
