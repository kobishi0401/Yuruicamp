# 介面操作與後端互動

## admin/login.html
* 此頁的意義：賣家後台 Firebase 登入與管理員 Session 建立入口。
* 頁面網址：`/admin/login.html`

### 載入時
- `admin-runtime.js` 初始化 Firebase、`AppAuth` 與 `AdminAPI`。
- 若 Firebase 已還原登入者，仍需向後端建立／刷新 Admin Session，不能只憑前端登入狀態進後台。

### 登入
- 使用 Firebase Provider 完成 OAuth，取得 Firebase ID Token。
- POST `/api/admin/auth/firebase/session`
    - 後端驗證 Firebase Token、管理員帳號、啟用狀態、角色與權限。
- 驗證成功後導向 `dashboard.html`。
- 未授權、帳號停用或 Session 建立失敗時停留登入頁並顯示錯誤。

### 注意
- 後台正式請求統一由 `AdminAPI` → `ApiClient` → `AppAuth` 帶 Bearer Token。
- 不使用商城會員 Session 取代 Admin RBAC 驗證。
