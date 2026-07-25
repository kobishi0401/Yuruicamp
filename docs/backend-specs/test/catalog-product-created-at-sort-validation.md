# Catalog 最新上架排序 Swagger 驗證

## 用途

確認首頁最新商品由後端依 `products.created_at` 排序，不再由前端解析商品 ID 推算先後。

## 驗證前準備

1. 啟動 PostgreSQL、後端與開發 Seed。
2. 開啟 `http://localhost:8080/swagger-ui.html`。
3. 此端點是公開讀取，不需要輸入 Firebase Token。

## Swagger 驗證步驟

1. 展開 Catalog 的 `GET /api/products`。
2. 輸入 `page=0`、`size=12`、`sort=createdAt,desc`。
3. 執行後確認 HTTP 為 `200`、`success=true`，且 `data` 為商品陣列。
4. 使用資料庫查詢交叉核對：

```sql
select p.id, p.created_at
from products p
join equipment_items i on i.id = p.item_id
where p.status = 'active'
  and i.active = true
  and exists (
      select 1
      from product_variants variant
      where variant.product_id = p.id
        and variant.status = 'active'
  )
order by p.created_at desc, p.id desc
limit 12;
```

5. Swagger 回應中的商品 ID 順序必須與 SQL 相同。
6. 將 `sort` 改成 `createdAt,asc`，確認順序反轉且 HTTP 仍為 `200`。
7. 將 `sort` 改成 `publishedAt,desc`，確認回傳 `400 VALIDATION_ERROR`。

## 首頁驗證

1. 開啟 `http://127.0.0.1:5173/storefront/pages/home.html`。
2. 在瀏覽器 Network 確認請求包含 `sort=createdAt%2Cdesc`。
3. 最新商品區前 12 筆必須與 Swagger／SQL 順序一致。

## 為什麼必須驗證

Swagger 驗證可證明 HTTP 契約接受 `createdAt` 白名單排序；SQL 交叉核對可證明排序真正在 PostgreSQL 使用 `products.created_at`。首頁 Network 驗證則確保前端沒有退回商品 ID 排序，三者缺一就無法證明「最新商品」以實際建立／首次上架時間為準。
