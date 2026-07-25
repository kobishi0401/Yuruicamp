# 介面操作與後端互動

## admin/dashboard.html
* 此頁的意義：賣家後台單頁外殼，提供側邊導覽、權限控制與各管理功能的掛載區。
* 頁面網址：`/admin/dashboard.html`
* 此頁需要已啟用的管理員身分。

### 載入時
- 初始化 Firebase、`AppAuth`、`AdminRuntime` 與 `AdminAPI`。
- POST `/api/admin/auth/firebase/session`
    - 建立／刷新後台 Session，取得目前角色與有效權限。
- 依側邊選單載入 `admin/partials/*.html`，再由對應 JS 初始化資料與事件。
- `AppConfig.USE_MOCK_API=false` 時使用正式 `/api/admin/**`；Mock 模式讀本機 JSON 與 localStorage overlay。

### 導覽
- 功能包含分析、訂單、預約、預約月曆、商品／庫存、會員、優惠券、評論與權限。
- partial 不是完整頁面；不可跳過 Dashboard 直接依賴其 DOM。
- 使用者看得到的選單與可執行操作，需同時符合前端權限顯示及後端 RBAC。

### 登出
- 清除 Firebase／前端管理狀態後返回 `login.html`。
