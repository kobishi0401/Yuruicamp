# 首頁熱銷商品 Swagger 驗證

## 驗證目的

確認首頁與商品列表只回傳帶有「熱銷」標籤的商品，由後端訂單資料排序，且公開請求不需要 Firebase Bearer Token。

## 前置條件

1. PostgreSQL 已依 `docs/latest_schema.sql` 建立。
2. 已載入 `docs/seed/002-dev-seed.sql`。
3. Spring Boot 後端已啟動於 `http://localhost:8080`。
4. 瀏覽器開啟 `http://localhost:8080/swagger-ui.html`。

## 驗證步驟

### 一、公開取得熱銷商品

1. 不操作 Swagger 的 `Authorize`。
2. 展開 `Catalog`。
3. 選擇 `GET /api/products/bestsellers`。
4. 將 `limit` 設為 `6`。
5. 執行請求。

預期結果：

- HTTP 狀態為 `200`。
- `success` 為 `true`。
- `data` 是陣列，最多 `6` 筆。
- 每筆商品的 `tags` 都包含 `熱銷`，且有效訂單銷量大於 `0`。
- 每筆商品包含 `id`、`name`、`price`、`rating`、`reviewCount`、`variants`。
- Request Headers 不需要 `Authorization`。

### 二、確認排序穩定

1. 將 `limit` 改為 `10` 後再次執行。
2. 重新執行相同請求。
3. 比較兩次回傳的商品 ID 順序。

預期結果：

- 相同資料狀態下，兩次順序一致。
- 回傳清單不包含有效銷量為 `0` 的商品。
- 銷量相同時依商品 ID 升序排列。

### 三、取得商品列表使用的完整熱銷清單

1. 將 `limit` 改為 `100`。
2. 執行請求。
3. 對照有效訂單明細中的不同商品 ID。

預期結果：

- HTTP 狀態為 `200`。
- 開發 Seed 標記的有效訂單商品數量前 6 名都會回傳，其他商品即使有銷量也不會誤列。
- 商品仍依有效銷量降序排列。

### 四、驗證參數邊界

1. 將 `limit` 設為 `0` 後執行。
2. 將 `limit` 設為 `101` 後執行。

預期結果：

- 兩次皆回傳 HTTP `400`。
- `success` 為 `false`。
- `error.code` 為 `VALIDATION_ERROR`。

## 驗證必要性

首頁與商品列表都是公開入口，如果熱銷區依賴會員訂單端點，未登入訪客會收到 `401`，並可能被前端誤判為登入過期。這份驗證確保熱銷標籤來自 `equipment_tags`、排序由公開 Catalog API 提供，且非前 6 名商品不會被誤貼熱銷標籤。
