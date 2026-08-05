# Staging 部署手冊（單一入口）

給新手的完整說明：**本機腳本怎麼跑、雲端資源是什麼、自訂網域、煙測、CI/CD、常見錯誤**。  
細節腳本都在這個資料夾；平常只要讀這一份。

| 項目 | 值 |
|------|-----|
| 用途 | Staging／Demo（綠界**沙箱**，非正式收錢） |
| GCP／Firebase | `yuruicamp-2026` |
| 區域 | `asia-east1` |
| 前端 | Firebase Hosting → **https://yuruicamp.com**（`www` 301 到 apex；舊網址 `*.web.app` 仍可用） |
| API | Cloud Run `yuruicamp-api-staging` → `https://yuruicamp-api-staging-952948108890.asia-east1.run.app` |
| DB | Cloud SQL `yuruicamp-pg-staging`（Postgres 16）／DB `yuruicamp`／user `yuruicamp_app` |
| 金流／物流 | `stub=false`；Notify **直打 Cloud Run**（不必 ngrok） |
| 第一波不做 | n8n |

架構（兩個 origin）：

```text
瀏覽器 → https://yuruicamp.com          （Hosting 靜態）
       → https://…run.app/api/…         （Cloud Run）
綠界 Notify／地圖 callback → 只打 Cloud Run
```

---

## 1. 檔案一覽

| 檔案 | 做什麼 |
|------|--------|
| `01-provision.ps1` | Cloud SQL／Artifact Registry／Secret／IAM（可重跑） |
| `02-deploy-api.ps1` | Docker build／push → Cloud Run（stub=false） |
| `03-seed.ps1` | 灌 `docs/seed`（需 cloud-sql-proxy） |
| `04-hosting.ps1` | Vite build + assemble + `firebase deploy --only hosting` |
| `assemble-hosting.ps1` | 合併 `dist` + 經典 JS／booking／admin（**含打包 firebase-app**；Windows） |
| `assemble-hosting.sh` | 同上（Linux／GitHub Actions；避免 `booking/booking` 巢狀） |
| `05-smoke-af.ps1` | 自動化煙測（health／商品／CORS／Secret 長度…） |
| `06-check-custom-domain.ps1` | 查 `yuruicamp.com`／`www` SSL／ownership |
| 根目錄 `.firebaserc`、`firebase.json` | Hosting 指向 `deploy/staging/hosting-out` |

驗收筆記（打勾用）：`.scratch/staging-af-acceptance/`（可選）。

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

### Hosting 為什麼不能只丟 `frontend/dist`？

Vite 只產出部分 HTML／CSS；頁面仍載入經典 `/storefront/js/**`、`/booking/**`、`/admin/**`。  
`assemble-hosting.ps1`／`.sh` 會合併這些目錄，並用 **Vite 打包後的** `firebase-app.js` 覆蓋原始檔（瀏覽器無法解析 `import 'firebase/app'`）。

**注意：** Hero 影片 `frontend/assets/videos/*.mp4` 被 gitignore（超過 GitHub 100MB）。  
CI 部署**不會**帶影片；要含影片請在「有 mp4 的本機」跑 `04-hosting.ps1`，或改成 CDN 外連。

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

瀏覽器手測（登入／綠界／物流／預約／COD／Admin）步驟：  
`.scratch/staging-af-acceptance/human-runbook.md`

### 綠界 `10200073` CheckMacValue Error

Secret Manager 的 MerchantID／HashKey／HashIV **尾端不可有換行**。  
官方沙箱長度：MerchantID=7、Key/IV=16。  
修完 secret 後必須對 Cloud Run **發新修訂**（`:latest` 在新 revision 才重讀）。

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
工作流程檔：

| Workflow | 觸發 | 做什麼 |
|----------|------|--------|
| `.github/workflows/ci.yml` | PR／push | 後端 `mvn test`、前端依賴安裝＋基本檢查 |
| `.github/workflows/deploy-staging.yml` | **手動** `workflow_dispatch` | 可選部署 API 與／或 Hosting |

### 6.1 一次設定（維運）

**詳細圖文步驟**（含 Agent 已建好的 SA／你要跑的指令）：  
→ [`github-actions-secrets.md`](./github-actions-secrets.md)

最短路徑：

```powershell
# 1) 一次：登入 GitHub CLI（瀏覽器授權）
gh auth login

# 2) 確認 frontend/.env.local 已有 VITE_FIREBASE_*（本機開發那份即可）

# 3) 上傳 Secrets（讀本機 SA JSON + .env.local，不會印出內容）
.\deploy\staging\07-setup-github-secrets.ps1
```

GCP 部署 SA 與金鑰（已建立、勿 commit）：

- SA：`github-deploy-staging@yuruicamp-2026.iam.gserviceaccount.com`
- 金鑰：`C:\Users\Amy\Desktop\java_bootcamp\yurui-secret\github-deploy-staging.json`

| Secret | 內容 |
|--------|------|
| `GCP_SA_KEY` | 上述 JSON 整份 |
| `VITE_FIREBASE_*`（六個） | 與 `frontend/.env.local` 相同 |

（可選）Variable：`STAGING_API_BASE_URL`＝Cloud Run `/api`（workflow 已有預設）。

然後：GitHub → **Actions** → **Deploy Staging** → **Run workflow**  
（第一次可先只勾 `deploy_hosting`。）

### 6.2 安全注意

- CI **不會**把綠界 HashKey 寫進 log；金鑰只在 Secret Manager。  
- `GCP_SA_KEY` 權限保持最小；外洩立刻在 GCP 停用金鑰。  
- 進階可改 **Workload Identity Federation**（免長期 JSON）；第一版用 SA JSON 較好上手。

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

## 8. 相關文件

| 文件 | 用途 |
|------|------|
| `docs/local-dev-setup.md` | 本機 Vite＋Spring＋Postgres＋stub／真沙箱 |
| `docs/backend-specs/payment/ecpay-sandbox-validation.md` | 綠界金流驗收 |
| `docs/backend-specs/logistics/ecpay-real-sandbox-validation.md` | 物流真沙箱 |
| `.scratch/staging-af-acceptance/` | A–F 驗收打勾（可選） |
