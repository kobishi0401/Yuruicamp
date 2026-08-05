# GitHub Actions Secrets 設定（詳細步驟）

目標：讓 repo 的 **Deploy Staging** workflow 能部署 Cloud Run + Firebase Hosting。

| 項目 | 值 |
|------|-----|
| Repo | `kobishi0401/Yuruicamp` |
| GCP 專案 | `yuruicamp-2026` |
| 部署用 SA | `github-deploy-staging@yuruicamp-2026.iam.gserviceaccount.com` |
| SA 金鑰檔（本機，勿進 git） | `C:\Users\Amy\Desktop\java_bootcamp\yurui-secret\github-deploy-staging.json` |

Agent 已幫你建好 **Service Account、角色、JSON 金鑰**。  
你還差：**登入 `gh` → 跑上傳 Secrets 腳本**（或用網頁手動貼）。

---

## A. 最快路徑（建議，約 5 分鐘）

### A1. 確認本機有 Firebase Web 設定

檔案：`frontend/.env.local`（不要 commit）

至少要有這六行（從 Firebase Console → Project settings → Your apps → Web → `firebaseConfig` 複製）：

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=yuruicamp-2026.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=yuruicamp-2026
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

若沒有 `.env.local`：

```powershell
cd frontend
Copy-Item .env.example .env.local
# 用記事本打開 .env.local，貼上 Console 的值後存檔
```

### A2. 登入 GitHub CLI（一次）

在 **PowerShell**（可互動）：

```powershell
gh auth login
```

建議選：

1. **GitHub.com**
2. **HTTPS**
3. **Login with a web browser**（依畫面指示按 Enter、貼碼）

確認：

```powershell
gh auth status
```

應看到 `Logged in to github.com`。

### A3. 一鍵上傳 Secrets

在 **repo 根目錄**：

```powershell
.\deploy\staging\07-setup-github-secrets.ps1
```

腳本會：

1. 讀取 `yurui-secret\github-deploy-staging.json` → Secret `GCP_SA_KEY`
2. 讀取 `frontend\.env.local` 的六個 `VITE_FIREBASE_*` → 同名 Secrets
3. 設定 Variable `STAGING_API_BASE_URL`（可選，有預設）

確認：

```powershell
gh secret list --repo kobishi0401/Yuruicamp
```

應看到：`GCP_SA_KEY`、`VITE_FIREBASE_API_KEY`、…、`VITE_FIREBASE_APP_ID`。

### A4. 試跑部署

1. 開 https://github.com/kobishi0401/Yuruicamp/actions  
2. 左側選 **Deploy Staging**  
3. **Run workflow**  
   - 第一次建議：只勾 **deploy_hosting**（較快）  
   - 成功後再勾 **deploy_api**（會 docker build，較久）  
4. 看 log 是否綠燈  
5. 開 https://yuruicamp.com 確認首頁／登入仍正常  

---

## B. 不用 CLI：網頁手動貼 Secrets

若 `gh auth login` 不方便，可走 Console：

### B1. GCP 金鑰（Agent 已建好）

金鑰已在本機：

`C:\Users\Amy\Desktop\java_bootcamp\yurui-secret\github-deploy-staging.json`

用記事本打開 → **全選複製**（整份 JSON）。

### B2. GitHub 新增 Secrets

1. 開 https://github.com/kobishi0401/Yuruicamp/settings/secrets/actions  
2. **New repository secret**，逐一新增：

| Name | Value |
|------|--------|
| `GCP_SA_KEY` | 上面整份 JSON |
| `VITE_FIREBASE_API_KEY` | `.env.local` 同名值 |
| `VITE_FIREBASE_AUTH_DOMAIN` | 同上 |
| `VITE_FIREBASE_PROJECT_ID` | 同上 |
| `VITE_FIREBASE_STORAGE_BUCKET` | 同上 |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | 同上 |
| `VITE_FIREBASE_APP_ID` | 同上 |

3.（可選）**Variables** 分頁 → New →  
   Name=`STAGING_API_BASE_URL`  
   Value=`https://yuruicamp-api-staging-952948108890.asia-east1.run.app/api`

然後做 **A4 試跑部署**。

---

## C. Agent 已在 GCP 做過的事（你可略過）

已建立：

- SA：`github-deploy-staging@yuruicamp-2026.iam.gserviceaccount.com`
- 專案角色：`run.admin`、`artifactregistry.writer`、`iam.serviceAccountUser`、`secretmanager.secretAccessor`、`cloudsql.client`、`firebasehosting.admin`、`firebase.viewer`
- 可冒充 Cloud Run 預設 runtime SA（`…-compute@developer.gserviceaccount.com`）
- 金鑰檔：`yurui-secret\github-deploy-staging.json`（**勿 commit、勿傳給別人**）

若要重做金鑰（外洩時）：

```powershell
# 刪舊 key（在 Console → IAM → Service accounts → Keys）
# 再建立：
gcloud iam service-accounts keys create `
  "C:\Users\Amy\Desktop\java_bootcamp\yurui-secret\github-deploy-staging.json" `
  --iam-account=github-deploy-staging@yuruicamp-2026.iam.gserviceaccount.com `
  --project=yuruicamp-2026
# 再跑 07-setup-github-secrets.ps1
```

---

## D. 常見錯誤

| 現象 | 怎麼辦 |
|------|--------|
| `gh: not logged into` | 先 `gh auth login` |
| `Missing VITE_FIREBASE_*` | 補齊 `frontend/.env.local` |
| Hosting deploy 權限不足 | 確認 SA 有 `firebasehosting.admin`（已綁） |
| Cloud Run deploy 失敗 `Permission denied on service account` | runtime SA 的 `serviceAccountUser`（已綁） |
| Docker push 失敗 | 確認 Artifact Registry repo `yuruicamp` 存在（`01-provision` 已建） |
| Secret 貼上後仍 403 | 等 1～2 分鐘；確認 repo 是 `kobishi0401/Yuruicamp` |

---

## E. 安全提醒

- **不要**把 `github-deploy-staging.json` 或 `.env.local` 放進 git／Discord／截圖全文。  
- GitHub Secrets 設定後**無法再查看內容**，只能覆寫。  
- 金鑰外洩：GCP → 刪該 key → 建新 key → 重跑 `07-setup-github-secrets.ps1`。
