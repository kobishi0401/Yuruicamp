# 介面操作與後端互動

## storefront/pages/blog-detail.html
* 此頁的意義：閱讀單篇露營文章，並顯示相關文章與推薦商品。
* 頁面網址：`/storefront/pages/blog-detail.html?id={articleId}`

### 載入時
- `API.articles.getAll()` 取得文章後依網址 `id` 找出本文；失敗時回退文章 Mock JSON。
- GET `/api/products?page=0&size=100&sort=id,asc`
    - 取得商品資料，用於文章內的相關商品推薦。
- 缺少文章或 ID 不存在時顯示找不到內容。
- 公開讀取不需要登入。

### 頁面操作
- 點擊推薦商品前往 `product-detail.html?id={productId}`。
- 相關文章導向另一個 `blog-detail.html?id=...`。
