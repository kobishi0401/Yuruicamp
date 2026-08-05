# Staging 部署手冊（單一入口）

給新手的**完整**說明：雲端資源、本機腳本、自訂網域、煙測、GitHub Actions Secrets、Demo、常見錯誤。  
`deploy/staging/` 裡的腳本細節都在這裡對齊；**平常只讀這一份即可**。

| 項目 | 值 |
|------|-----|
| 用途 | Staging／Demo（綠界**沙箱**，非正式收錢） |
| GCP／Firebase | `yuruicamp-2026` |
| 區域 | `asia-east1` |
| 前端 | Firebase Hosting → **https://yuruicamp.com**（`www` 301 → apex；舊 `*.web.app` 仍可用） |
| API | Cloud Run `yuruicamp-api-staging` → `https://yuruicamp-api-staging-952948108890.asia-east1.run.app` |
| DB | Cloud SQL `yuruicamp-pg-staging`（Postgres 16）／DB `yuruicamp`／user `yuruicamp_app` |
| 媒體 | GCS `yuruicamp-media-2026`（如 hero 影片公開 URL） |
| 金流／物流 | `stub=false`；Notify **直打 Cloud Run**（不必 ngrok） |
| 第一波不做 | n8n |

架構（兩個 origin）：

```text
瀏覽器 → https://yuruicamp.com          （Hosting 靜態）
       → https://…run.app/api/…         （Cloud Run）
綠界 Notify／地圖 callback → 只打 Cloud Run
```

---

## 目錄

1. [檔案一覽](#1-檔案一覽)
2. [本機手動部署](#2-本機手動部署第一次或救急)
3. [自訂網域（yuruicamp.com + GoDaddy）](#3-自訂網域yuruicampcom--godaddy)
4. [驗收與煙測](#4-驗收與煙測)
5. [Seed](#5-seed)
6. [CI／CD（GitHub Actions）](#6-cicdgithub-actions)
7. [Demo 當天](#7-demo-當天)
8. [常見問題](#8-常見問題)
9. [相關文件](#9-相關文件)

舊檔名導向（避免壞連）：

- [`custom-domain-godaddy.md`](./custom-domain-godaddy.md) → 本文件 §3  
- [`github-actions-secrets.md`](./github-actions-secrets.md) → 本文件 §6  

---

## 1. 檔案一覽

| 檔案 | 做什麼 |
|------|--------|
| `01-provision.ps1` | Cloud SQL／Artifact Registry／Secret／IAM（可重跑） |
| `02-deploy-api.ps1` | Docker build／push → Cloud Run（stub=false） |
| `03-seed.ps1` | 灌 `docs/seed`（需 cloud-sql-proxy） |
| `04-hosting.ps1` | Vite build + assemble + `firebase deploy --only hosting` |
| `assemble-hosting.ps1` | 合併 `dist` + 經典 JS／booking／admin（含打包 firebase-app；Windows） |
| `assemble-hosting.sh` | 同上（Linux／GitHub Actions；避免 `booking/booking` 巢狀） |
| `05-smoke-af.ps1` | 自動化煙測（health／商品／CORS／Secret 長度…） |
| `06-check-custom-domain.ps1` | 查 `yuruicamp.com`／`www` SSL／ownership |
| `07-setup-github-secrets.ps1` | 把 GCP SA JSON＋`VITE_FIREBASE_*` 寫進 GitHub Secrets |
| 根目錄 `.firebaserc`、`firebase.json` | Hosting 指向 `deploy/staging/hosting-out` |
| `.github/workflows/ci.yml` | PR／push：後端測試、前端基本檢查 |
| `.github/workflows/deploy-staging.yml` | **手動**部署 API 與／或 Hosting |

驗收筆記（打勾用，可選）：`.scratch/staging-af-acceptance/`。

---

## 2. 本機手動部署（第一次或救急）

前置：`gcloud auth login`、專案 `yuruicamp-2026`、Docker Desktop、Node、（Hosting）`firebase login`。

在 **repo 根目錄**：

```powershell
# 1) 基礎設施（已存在會跳過／加 secret 版本）
.\deploy\staging\01-provision.ps1 `
  -FirebaseCredentialsPath "C:\path\to\firebase-service-account.json"

# 2) 後端映像 → Cloud Run
.\deploy\staging\02-deploy-api.ps1

# 3)（可選）seed
gcloud auth application-default login   # 一次
.\deploy\staging\03-seed.ps1

# 4) 前端 Hosting（會讀 frontend/.env.local 的 VITE_FIREBASE_*）
.\deploy\staging\04-hosting.ps1
```

`02-deploy-api.ps1` 預設：

- `YURUICAMP_FRONTEND_BASE_URL=https://yuruicamp.com`
- CORS 含 `yuruicamp.com`／`www`／`*.web.app`／本機 5173  
- 自動設 `YURUICAMP_ECPAY_PUBLIC_API_BASE_URL=https://…run.app/api`
- Hikari：`MAXIMUM_POOL_SIZE=3`（配合 `db-f1-micro` 連線額度）
- `max-instances=2`

### Hosting 為什麼不能只丟 `frontend/dist`？

Vite 只產出部分 HTML／CSS；頁面仍載入經典 `/storefront/js/**`、`/booking/**`、`/admin/**`。  
`assemble-hosting.ps1`／`.sh` 會合併這些目錄，並用 **Vite 打包後的** `firebase-app.js` 覆蓋原始檔（瀏覽器無法解析 `import 'firebase/app'`）。

### Hero 影片

`frontend/assets/videos/*.mp4` 被 gitignore（超過 GitHub 100MB）。  
**現行做法**：首頁／搜尋頁改載 GCS 公開 URL  
`https://storage.googleapis.com/yuruicamp-media-2026/hero_video.mp4`  
因此 CI Hosting **不必**帶 mp4。若要換片：上傳到同一 bucket（或新公開 URL）並改 HTML。

```powershell
.\deploy\staging\04-hosting.ps1 -SkipDeploy   # 只組裝
.\deploy\staging\04-hosting.ps1               # 組裝 + deploy
```

---

## 3. 自訂網域（yuruicamp.com + GoDaddy）

目標：**apex 當主站**，`www` **301 → apex**；API 仍用 `.run.app`。

### 3.1 Firebase（已做過可略）

Hosting site `yuruicamp-2026` 已綁：

- `yuruicamp.com`（主站）
- `www.yuruicamp.com`（`redirectTarget=yuruicamp.com`）

### 3.2 GoDaddy DNS（應已改完）

| 類型 | 名稱 | 值 |
|------|------|-----|
| A | `@` | `199.36.158.100` |
| TXT | `@` | `hosting-site=yuruicamp-2026` |
| TXT | `_acme-challenge` | （以 Firebase Console／`06-check` 當下為準） |
| CNAME | `www` | `yuruicamp-2026.web.app` |
| TXT | `_acme-challenge.www` | （同上） |

刪光舊的 GitHub Pages（`185.199.*`、`kobishi0401.github.io`）。

### 3.3 Firebase Auth

[Authorized domains](https://console.firebase.google.com/project/yuruicamp-2026/authentication/settings) 需含：

- `yuruicamp.com`
- `www.yuruicamp.com`
- （可留）`yuruicamp-2026.web.app`

### 3.4 查狀態

```powershell
.\deploy\staging\06-check-custom-domain.ps1
```

期望：`OWNERSHIP_ACTIVE`、`HOST_ACTIVE`；憑證 `CERT_ACTIVE` 或短暫的 `CERT_PROPAGATING`。

官方：[Connect a custom domain](https://firebase.google.com/docs/hosting/custom-domain)

---

## 4. 驗收與煙測

```powershell
curl.exe https://yuruicamp-api-staging-952948108890.asia-east1.run.app/api/health
# → {"success":true,"data":{"status":"UP"}}

.\deploy\staging\05-smoke-af.ps1
```

瀏覽器手測（登入／綠界／物流／預約／COD／Admin）：  
`.scratch/staging-af-acceptance/human-runbook.md`（可選）

建議路徑：`https://yuruicamp.com` → Google 登入 → 購物 → 綠界沙箱卡 → 成功頁。

---

## 5. Seed

Cloud Run 啟動只跑 Flyway（建表）。商品資料另灌：

```powershell
.\deploy\staging\03-seed.ps1
curl.exe "https://yuruicamp-api-staging-952948108890.asia-east1.run.app/api/products?page=0&size=1"
# totalElements 應 > 0
```

---

## 6. CI／CD（GitHub Actions）

選 **GitHub Actions → 部署到現有 GCP／Firebase**（不必另開 Cloud Build）。

| Workflow | 觸發 | 做什麼 |
|----------|------|--------|
| `.github/workflows/ci.yml` | PR／push | 後端 `mvn test`、前端依賴安裝＋基本檢查 |
| `.github/workflows/deploy-staging.yml` | **手動** `workflow_dispatch` | 可選部署 API 與／或 Hosting |

### 6.1 需要哪些 Secrets／Variables

| 名稱 | 類型 | 內容 |
|------|------|------|
| `GCP_SA_KEY` | Secret | 部署用 SA 的 JSON 金鑰整份 |
| `VITE_FIREBASE_API_KEY` 等六個 | Secret | 與 `frontend/.env.local` 相同 |
| `STAGING_API_BASE_URL` | Variable（可選） | Cloud Run `/api`；workflow 已有預設 |

GCP 部署 SA（已建立、**勿 commit**）：

- SA：`github-deploy-staging@yuruicamp-2026.iam.gserviceaccount.com`
- 金鑰本機路徑：`C:\Users\Amy\Desktop\java_bootcamp\yurui-secret\github-deploy-staging.json`

已綁角色（摘要）：`run.admin`、`artifactregistry.writer`、`iam.serviceAccountUser`、`secretmanager.secretAccessor`、`cloudsql.client`、`firebasehosting.admin`、`firebase.viewer`，以及可冒充 Cloud Run runtime SA。

### 6.2 最快路徑：腳本上傳（約 5 分鐘）

#### （1）確認本機有 Firebase Web 設定

檔案：`frontend/.env.local`（不要 commit）。至少：

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=yuruicamp-2026.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=yuruicamp-2026
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

沒有的話：

```powershell
cd frontend
Copy-Item .env.example .env.local
# 用記事本貼上 Firebase Console → Project settings → Your apps → Web → firebaseConfig
```

#### （2）登入 GitHub CLI（一次）

```powershell
gh auth login
# 建議：GitHub.com → HTTPS → Login with a web browser
gh auth status
```

#### （3）一鍵上傳 Secrets

在 **repo 根目錄**：

```powershell
.\deploy\staging\07-setup-github-secrets.ps1
```

腳本會：

1. 讀取 `yurui-secret\github-deploy-staging.json` → `GCP_SA_KEY`
2. 讀取 `frontend\.env.local` 的六個 `VITE_FIREBASE_*` → 同名 Secrets
3. 設定 Variable `STAGING_API_BASE_URL`（可選）

確認：

```powershell
gh secret list --repo kobishi0401/Yuruicamp
```

應看到：`GCP_SA_KEY`、`VITE_FIREBASE_API_KEY` … `VITE_FIREBASE_APP_ID`。

### 6.3 不用 CLI：網頁手動貼 Secrets

1. 用記事本打開  
   `C:\Users\Amy\Desktop\java_bootcamp\yurui-secret\github-deploy-staging.json`  
   → **全選複製**（整份 JSON）。
2. 開 https://github.com/kobishi0401/Yuruicamp/settings/secrets/actions  
3. **New repository secret**，逐一新增：

| Name | Value |
|------|--------|
| `GCP_SA_KEY` | 上面整份 JSON |
| `VITE_FIREBASE_API_KEY` | `.env.local` 同名值 |
| `VITE_FIREBASE_AUTH_DOMAIN` | 同上 |
| `VITE_FIREBASE_PROJECT_ID` | 同上 |
| `VITE_FIREBASE_STORAGE_BUCKET` | 同上 |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | 同上 |
| `VITE_FIREBASE_APP_ID` | 同上 |

4.（可選）**Variables** → Name=`STAGING_API_BASE_URL`  
   Value=`https://yuruicamp-api-staging-952948108890.asia-east1.run.app/api`

### 6.4 試跑／日常部署

1. 開 https://github.com/kobishi0401/Yuruicamp/actions  
2. 左側 **Deploy Staging** → **Run workflow**  
   - 可只勾 `deploy_api` 或 `deploy_hosting`  
3. 綠燈後開 https://yuruicamp.com 煙測登入／結帳  

### 6.5 金鑰外洩時重做

```powershell
# 在 GCP Console → IAM → Service accounts → Keys 刪舊 key，再：
gcloud iam service-accounts keys create `
  "C:\Users\Amy\Desktop\java_bootcamp\yurui-secret\github-deploy-staging.json" `
  --iam-account=github-deploy-staging@yuruicamp-2026.iam.gserviceaccount.com `
  --project=yuruicamp-2026
.\deploy\staging\07-setup-github-secrets.ps1
```

### 6.6 安全注意

- CI **不會**把綠界 HashKey 寫進 log；金鑰只在 Secret Manager。  
- **不要**把 `github-deploy-staging.json` 或 `.env.local` 放進 git／Discord／截圖全文。  
- GitHub Secrets 設定後**無法再查看內容**，只能覆寫。  
- `GCP_SA_KEY` 權限保持最小；進階可改 Workload Identity Federation（第一版用 SA JSON 較好上手）。

---

## 7. Demo 當天

```powershell
gcloud run services update yuruicamp-api-staging `
  --project=yuruicamp-2026 --region=asia-east1 --min-instances=1
curl.exe https://yuruicamp-api-staging-952948108890.asia-east1.run.app/api/health
```

結束可改回 `--min-instances=0`。

彩排：`https://yuruicamp.com` → Google 登入 → 購物 → 綠界沙箱卡 → 成功頁。

---

## 8. 常見問題

### 8.1 Cloud Run「PORT=8080」啟動失敗

GitHub Actions／`gcloud` 顯示：

> container failed to start and listen on the port … PORT=8080

**多半不是埠號設錯。** 到 Cloud Console → Logging 搜該 revision，若看到：

`remaining connection slots are reserved for … pg_use_reserved_connections`

代表 **Cloud SQL（db-f1-micro）連線額度用完**。部署時舊 revision 還在、新 revision 又要開 Flyway／Hikari，兩邊搶連線就會啟動失敗。

處理：

1. 部署腳本／workflow 已設 Hikari `MAXIMUM_POOL_SIZE=3`、`max-instances=2`。  
2. 仍失敗時重啟 SQL 再部署：

```powershell
gcloud sql instances restart yuruicamp-pg-staging --project=yuruicamp-2026
# 等 Instance 變 RUNNABLE（約數分鐘）後：
.\deploy\staging\02-deploy-api.ps1
# 或重跑 Actions「Deploy Staging」且勾 deploy_api
```

3. 長期可升級 Cloud SQL tier，或調高 `max_connections`（需較大機型）。

### 8.2 綠界 `10200073` CheckMacValue Error

Secret Manager 的 MerchantID／HashKey／HashIV **尾端不可有換行（CRLF）**。  
官方沙箱長度：MerchantID=7、Key/IV=16。  
修完 secret 後必須對 Cloud Run **發新修訂**（`:latest` 在新 revision 才重讀）。

### 8.3 GitHub Actions／Secrets

| 現象 | 怎麼辦 |
|------|--------|
| `gh: not logged into` | 先 `gh auth login` |
| `Missing VITE_FIREBASE_*` | 補齊 `frontend/.env.local` 與 GitHub Secrets |
| Hosting deploy 權限不足 | 確認 SA 有 `firebasehosting.admin` |
| Cloud Run `Permission denied on service account` | runtime SA 的 `serviceAccountUser` |
| Docker push 失敗 | 確認 Artifact Registry repo `yuruicamp`（`01-provision`） |
| Secret 貼上後仍 403 | 等 1～2 分鐘；確認 repo 是 `kobishi0401/Yuruicamp` |

### 8.4 Hosting 路徑變成 `/booking/booking/...`

Linux／CI 用 `assemble-hosting.sh`（`cp src/. dest/`），不要用會巢狀複製的寫法。  
Workflow 已呼叫 `.sh`；本機 Windows 用 `assemble-hosting.ps1`。

---

## 9. 相關文件

| 文件 | 用途 |
|------|------|
| [`docs/local-dev-setup.md`](../../docs/local-dev-setup.md) | 本機 Vite＋Spring＋Postgres＋stub／真沙箱 |
| [`docs/backend-specs/payment/ecpay-sandbox-validation.md`](../../docs/backend-specs/payment/ecpay-sandbox-validation.md) | 綠界金流驗收 |
| [`docs/backend-specs/logistics/ecpay-real-sandbox-validation.md`](../../docs/backend-specs/logistics/ecpay-real-sandbox-validation.md) | 物流真沙箱 |
| [`.scratch/staging-af-acceptance/`](../../.scratch/staging-af-acceptance/) | A–F 驗收打勾（可選、通常 gitignore） |
| [`AGENTS.md`](../../AGENTS.md) | Agent 入口：指向本手冊 |
