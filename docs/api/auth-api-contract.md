# Auth API Contract（v0.1）

| 欄位 | 內容 |
|------|------|
| **狀態** | Implemented（線 A + LINE User ID 綁定） |
| **日期** | 2026-07-31 |
| **版本** | 0.3 |
| **共用** | [`common-api-conventions.md`](./common-api-conventions.md) |
| **DB** | `customers`、`admin_users` |

---

## 0. 一句話

前端用 Firebase 登入拿 **ID Token** → 打 session 綁定／upsert DB → 之後請求帶同一個 Bearer Token；**後端不簽發 JWT**。

---

## 1. 端點

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| `POST` | `/api/auth/firebase/session` | 公開（body／可另帶 Bearer） | 會員建立／綁定 session |
| `GET` | `/api/me` | 會員 Bearer | 目前會員 profile |
| `POST` | `/api/admin/auth/firebase/session` | 公開 | 後台綁定；email 必須已在白名單 |

---

## 2. 請求

### 2.1 `FirebaseSessionRequest`

```json
{
  "idToken": "dev:uid-amy:amy@example.com:google:Amy"
}
```

| 欄位 | 型別 | 必填 |
|------|------|------|
| `idToken` | string | 是 |

真環境：Firebase SDK 取得的 ID Token。  
Dev：`dev:<uid>:<email>:<provider>[:displayName[:lineUserId]]`  
（可選第六段 LINE User ID，供測試寫入 `customers.line_user_id`。）

---

## 3. 回應

### 3.1 會員 session — `CustomerSessionResponse`

| JSON | 型別 | DB 來源 |
|------|------|---------|
| `customerId` | string | `customers.id` |
| `email` | string | `customers.email` |
| `name` | string | `customers.name` |
| `authProvider` | string | `customers.auth_provider`（`google`\|`facebook`\|`line`） |
| `firebaseUid` | string | `customers.firebase_uid` |
| `status` | string | `customers.status` |
| `registeredAt` | string (ISO-8601) | `customers.registered_at` |
| `created` | boolean | 本次是否新建會員列 |
| `lineBound` | boolean | `customers.line_user_id` 是否已有值（**不**回傳完整 LINE User ID） |

範例（session）：

```json
{
  "success": true,
  "data": {
    "customerId": "…",
    "email": "amy@example.com",
    "name": "Amy",
    "authProvider": "google",
    "firebaseUid": "uid-amy",
    "status": "active",
    "registeredAt": "2026-07-20T03:00:00Z",
    "created": true,
    "lineBound": false
  }
}
```

> `GET /api/me` 仍是精簡 principal（`customerId`／`email`／`firebaseUid`），**不含**完整 session 欄位；是否已綁 LINE 以 session 的 `lineBound` 或再打 session 為準。

### 3.2 後台 session — `AdminSession`

| JSON | 型別 | DB 來源 |
|------|------|---------|
| `adminUserId` | string | `admin_users.id` |
| `email` | string | `admin_users.email` |
| `name` | string | `admin_users.name` |
| `role` | string | `admin_users.role`（`admin`\|`operator`\|`warehouse`） |
| `firebaseUid` | string \| null | `admin_users.firebase_uid` |
| `firebaseUidBound` | boolean | 本次是否完成／已有綁定 |
| `effectivePermissions` | string[] | 角色預設套用個別覆寫後的有效權限 |

### 3.3 後台帳號生命週期

| `active` | `firebase_uid` | 意義 |
|----------|----------------|------|
| `true` | `NULL` | 已建白名單、待首次登入綁定 |
| `true` | 有值 | 正常使用 |
| `false` | 任意 | **停用**（拒絕登入） |

失敗：`ADMIN_NOT_WHITELISTED`／`ADMIN_INACTIVE`。

---

## 4. 業務規則

1. 會員：依 `firebase_uid` 找人；沒有則依 email／新建並綁定。  
2. `status=suspended` 或 `deleted` → 拒絕後續 API（`CUSTOMER_SUSPENDED`／未授權）。  
3. 後台：email 必須預先存在於 `admin_users`；登入與每次 Admin API 都檢查 `active` 及 Firebase UID 綁定，細 RBAC 見 Admin 契約。
4. **不**回傳任何後端自簽 JWT。
5. **LINE User ID**：僅從已驗證 Firebase ID Token 的 identities（如 `oidc.line`）寫入／更新 `customers.line_user_id`；**不**信任客戶端自填 raw id。Token 沒有 LINE 身分時**不清掉**既有綁定。
6. 同一 `line_user_id` 最多一個 Customer；撞到別人 → `LINE_USER_ID_CONFLICT`（409）。Account Linking 保持同一 `firebase_uid` → 同一 Customer。
7. LINE 客服機器人查訂單：見 [`n8n-cs-api-contract.md`](./n8n-cs-api-contract.md)。

---

## 5. 相關錯誤碼

| code | HTTP | 說明 |
|------|------|------|
| `LINE_USER_ID_CONFLICT` | 409 | 此 LINE 已綁其他會員 |
| `CONFLICT` | 409 | email 已綁其他 Firebase 帳號（既有） |

---

## 6. v0.1 不做

| 項目 | 原因 |
|------|------|
| 密碼登入 | 產品僅 OAuth |
| Refresh token API | Firebase 客戶端處理 |
| 回傳完整 LINE User ID 給瀏覽器 | 隱私；僅 `lineBound` |
| 帳號解除／轉移 LINE 綁定 | 產品延後 |

---

## Changelog

| 版本 | 日期 | 說明 |
|------|------|------|
| 0.1 | 2026-07-20 | 對齊線 A 實作 |
| 0.2 | 2026-07-21 | Admin session 回傳有效權限，並鎖定 Firebase UID 一致性 |
| 0.3 | 2026-07-31 | session `lineBound`、Dev token 可選 LINE User ID、綁定衝突碼；連到 n8n CS 契約 |
