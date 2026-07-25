# Catalog 商品標籤 Swagger 驗證

## 1. 驗證目標

確認管理端可依 `itemId` 維護 `equipment_tags`，公開 Product API 會回傳 `tags`，且新品與熱銷清單都以後端標籤為準。

## 2. 前置條件

1. 依本目錄 [`README.md`](./README.md) 啟動 PostgreSQL 與 Spring Boot。
2. 開啟 `http://localhost:8080/swagger-ui.html`。
3. 本機 `FIREBASE_ENABLED=false` 時，以具備 `products.view`、`products.edit` 權限的 Admin Dev Token 完成 `Authorize`。
4. 開發 Seed 已載入；預期新品 10 件、熱銷 6 件。

## 3. 查詢管理端標籤

在 **Admin Equipment Items** 執行：

```http
GET /api/admin/equipment-items/E020/tags
```

預期：

- HTTP `200`。
- `data.itemId` 為 `E020`。
- `data.tags` 包含 `新品`。

再查：

```http
GET /api/admin/equipment-items/E004/tags
```

預期 `data.tags` 包含 `熱銷`。

## 4. 驗證整組更新

`PUT` 是整組取代，測試前先保留步驟 3 查到的其他標籤。以目前 Seed 的 `E020` 為例：

```http
PUT /api/admin/equipment-items/E020/tags
Content-Type: application/json

{
  "tags": ["其他", "新品"]
}
```

預期 HTTP `200`，回應仍包含 `其他`、`新品`，且沒有重複值。不要只傳 `["新品"]`，否則既有查詢／特色標籤會被移除。

## 5. 驗證公開 Product API

公開請求不帶 Token：

```http
GET /api/products?page=0&size=100&sort=createdAt,desc
```

預期：

- 每個 Product 都有 `tags` 陣列。
- 含 `新品` 的商品正好 10 件。
- 新品順序為 `P029`、`P028`、`P027`、`P026`、`P025`、`P024`、`P023`、`P022`、`P021`、`P020`。

再執行：

```http
GET /api/products/bestsellers?limit=100
```

預期：

- 回傳 6 件。
- 每件 `tags` 都包含 `熱銷`。
- 順序為 `P004`、`P024`、`P016`、`P001`、`P006`、`P007`。
- `P024` 的 `tags` 同時包含 `新品`、`熱銷`。

## 6. 前端確認

開啟：

```text
http://127.0.0.1:5173/storefront/pages/products.html?filter=new
http://127.0.0.1:5173/storefront/pages/products.html?filter=bestseller
```

預期新品頁顯示 10 件、熱銷頁顯示 6 件；商品卡只依公開 API 的 `tags` 顯示標籤。

## 7. 為什麼需要這項驗證

管理 API、公開 DTO、Seed 與前端篩選跨越四個資料邊界。只檢查資料庫筆數無法證明公開契約與頁面已接上；這套流程可避免標籤已寫入資料庫，但 API 漏回欄位，或前端仍以列表位置、銷量自行猜測標籤。
