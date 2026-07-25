# Brand API Contract（v0.1）

| 欄位 | 內容 |
|------|------|
| **狀態** | Implemented |
| **日期** | 2026-07-24 |
| **版本** | 0.1 |
| **共用慣例** | [`common-api-conventions.md`](./common-api-conventions.md) |

## 用途

首頁品牌跑馬燈以公開 API 讀取品牌主檔，品牌順序由資料庫 `sort_order` 與 `id` 決定。前端 Backend 模式不得改讀靜態 JSON，也不應為這個公開請求附帶 Firebase Token。

## HTTP 端點

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| `GET` | `/api/brands` | 公開 | 取得全部合作品牌 |

## 成功回應

回應使用共用 Envelope，`data` 為陣列：

```json
{
  "success": true,
  "data": [
    {
      "id": "coleman",
      "name": "Coleman",
      "logoUrl": null
    }
  ]
}
```

| 欄位 | 型別 | 必填 | DB 來源 |
|------|------|------|---------|
| `id` | string | 是 | `brands.id` |
| `name` | string | 是 | `brands.name` |
| `logoUrl` | string \| null | 是 | `brands.logo_url` |

## 前端行為

- `USE_MOCK_API = true`：讀取 `/data/marketing/brands.json`。
- `USE_MOCK_API = false`：透過 `ApiClient._restRequest('/brands', { auth: 'none' })` 讀取本端點。
- 有品牌時建立兩組相同項目，第二組加上 `aria-hidden="true"` 供無限動畫銜接。
- 空陣列或 API 失敗時保留可見狀態文字，不讓 `.brandMarqueeTrack` 縮成 `0px`。
