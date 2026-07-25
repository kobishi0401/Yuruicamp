# B-4／B-5b／B-7／首頁最新與熱銷 Catalog 公開讀

## 用途

完成商品篩選、規格即時可售量、公開門市列表、首頁合作品牌列表、最新上架與熱銷商品排序。

## 商品篩選

`GET /api/products` 可搭配 `category`、`brand`、`minPrice`、`maxPrice`，並繼續支援分頁與排序。分類與品牌採完整名稱、忽略大小寫；價格條件採包含邊界，只要商品至少一個 active variant 落在區間內就會保留。

負數價格或 `minPrice > maxPrice` 回傳 `400 VALIDATION_ERROR`。

未傳 `category`／`brand` 時，Service 會使用空字串代表不篩選；未傳價格時使用 `0.00` 到 `9999999999.99`。Repository 因此不會收到無型別的 `null`，可避免 PostgreSQL 將 `lower()` 參數誤判成 `bytea`，同時保留四種可選篩選的組合能力。

## 規格可售量

後端以 variant 為粒度加總 `inventory_stocks.on_hand_quantity`，再扣除 `product_stock_reservations.status = active` 的數量。結果最低為 `0`，並回傳：

- `availableQuantity`：目前可售數量。
- `inStock`：可售數量大於 `0` 時為 `true`。

此查詢是 Catalog 唯讀模型；Checkout 仍會在交易內重新鎖定庫存，不能以公開讀取結果取代防超賣檢查。

## 門市列表

`GET /api/branches` 讀取 `branches`，依 `id` 遞增回傳。Controller 只包裝 Envelope，Service 負責 Entity 到 DTO 的轉換。

## 合作品牌列表

`GET /api/brands` 為不需登入的公開端點，依 `sort_order`、`id` 遞增回傳 `id`、`name`、`logoUrl`。首頁 Backend 模式透過 `ApiClient` 以 `auth: 'none'` 呼叫，不會因本機存在失效 Token 而讓公開品牌資料被 `401` 阻斷。

## 首頁熱銷商品

`GET /api/products/bestsellers?limit=6` 是不需登入的公開端點。Repository 加總非 `cancelled`、非 `returned` 訂單中的 `order_items.quantity`，只保留有效銷量大於 `0` 的商品，再依銷量降序及商品 ID 升序回傳可販售商品。`limit` 支援 `1`～`100`，首頁維持取展示筆數，商品列表可取完整熱銷分類清單。

首頁 Backend 模式直接讀取此端點，不再呼叫受保護或不存在的 `/api/orders`。商品展示補強也只在 Mock 模式讀取本機訂單，因此公開首頁不會因訂單請求的 `401` 被誤判為登入過期。

商品列表 Backend 模式使用 `limit=100` 取得全部有銷量的熱銷商品，前端篩選不再只看到前 20 名。

## 首頁最新商品

首頁 Backend 模式呼叫 `GET /api/products?page=0&size=12&sort=createdAt,desc`。`createdAt` 由後端白名單映射至 `products.created_at`，代表商品販售身分建立／首次上架時間；一般編輯只會改 `updated_at`，不會讓舊商品錯排成新品。

Repository 先在 PostgreSQL 完成排序與分頁，時間相同時再依商品 ID 降序。前端只顯示後端順序，不再解析 `P001` 之類的商品編號推算上架先後。

## 驗證結果

- `mvnw.cmd clean test -DskipTests=false`：通過，共 `190` 項；`60` 項一般測試執行成功，`130` 項 PostgreSQL 整合測試因未設定 `RUN_BACKEND_IT=true` 而跳過。
- 實際 PostgreSQL API：無篩選回 `200`；`brand=Coleman` 回 `2` 筆；`minPrice=3000&maxPrice=3500` 回 `2` 筆；反向價格區間回 `400`。
- 上述無篩選請求未再出現 `lower(bytea)`，B-4 已完成實際端點驗收。
- 完整 PostgreSQL 情境仍應依 Swagger 文件手動驗證商品篩選、保留量與門市資料。
- 公開 Product DTO 回傳 `equipment_tags`；開發 Seed 將最新可售商品前 10 標為新品、有效訂單數量前 6 標為熱銷。
- 熱銷端點的 PostgreSQL 整合測試會比較帶有「熱銷」標籤商品的資料庫加總結果、排除零銷量商品，並驗證 `limit=0`、`limit=101` 回傳 `400 VALIDATION_ERROR`。
- 管理標籤、公開 DTO 與前端篩選的完整手動流程見 [`Catalog 商品標籤 Swagger 驗證`](../test/catalog-product-tags-swagger-validation.md)。
- `createdAt,desc` 的 PostgreSQL 整合測試會直接比較 `products.created_at desc, products.id desc` 的商品 ID 順序。
- 本機啟用 `RUN_BACKEND_IT=true` 後，`ProductPaginationIntegrationTest` 共 `9` 項全部通過，已實際驗證 PostgreSQL 熱銷加總排序、公開端點回應與 `limit` 參數邊界。
