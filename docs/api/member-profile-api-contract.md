# Member Profile API Contract

**Base path:** `/api/me/profile`  
**Auth:** Firebase Bearer（`Authorization: Bearer <token>`）  
**Status:** v0.1（2026-07-26）

---

## GET /api/me/profile

回傳登入會員的主檔欄位（不含 preferences）。

### Response `data`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `name` | string | 顯示名稱 |
| `email` | string | 登入信箱（唯讀；Google 登入不可 PATCH） |
| `phone` | string \| null | 手機，格式 `09xxxxxxxx` |
| `birthday` | `YYYY-MM-DD` \| null | 生日 |
| `authProvider` | string | 例如 `google`、`local` |
| `registeredAt` | ISO-8601 instant | 註冊時間 |

---

## PATCH /api/me/profile

更新本人允許欄位。

### Request body

| 欄位 | 型別 | 必填 | 規則 |
|------|------|------|------|
| `name` | string | 是 | 1–100 字 |
| `phone` | string | 是 | `^09\d{8}$` |
| `birthday` | `YYYY-MM-DD` | 否 | 不可為未來；須滿 18 歲 |

**不可 PATCH：** `email`、`preferences`（preferences 維持分表／後續獨立 API）。

### Errors

| HTTP | code | 情境 |
|------|------|------|
| 400 | `VALIDATION_ERROR` | phone 格式錯誤、未滿 18 歲 |
| 401 | — | 未登入 |
| 404 | `NOT_FOUND` | 會員不存在 |
| 409 | `CONFLICT` | 停權／已刪除會員 |

---

## 與 GET /api/me 的關係

`GET /api/me` 維持回傳 `CustomerPrincipal`（probe 用）。完整 profile 請走 `/api/me/profile`。
