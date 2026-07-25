# 介面操作與後端互動

## admin/partials/permissions.html
* 此畫面的意義：管理後台人員、角色、啟用狀態與細部權限。
* 載入方式：由 `admin/dashboard.html` 掛載。

### 載入時
- GET `/api/admin/users?page=0&size=100` 取得管理員帳號。
- GET `/api/admin/permissions` 取得可指派權限。
- GET `/api/admin/users/{adminUserId}` 取得單一管理員詳情。

### 管理員操作
- POST `/api/admin/users` 建立管理員。
- PATCH `/api/admin/users/{adminUserId}` 更新姓名、角色或啟用狀態。
- PUT `/api/admin/users/{adminUserId}/permissions`
    - 以完整集合更新細部權限。

### 權限
- 此畫面本身需要管理員／權限管理權限。
- 前端隱藏按鈕只是操作提示；後端仍必須對每個端點執行 RBAC。
- 變更目前登入者自身權限後，後續請求以後端最新 Session／權限為準。
