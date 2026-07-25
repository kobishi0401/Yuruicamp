# 介面操作與後端互動

## storefront/pages/blog.html
* 此頁的意義：顯示露營文章列表、分類與精選內容。
* 頁面網址：`/storefront/pages/blog.html`

### 載入時
- `API.articles.getAll()` 取得文章列表。
- 讀取失敗時回退 `/data/content/articles.json`。
- 不需要登入。

### 頁面操作
- 分類、關鍵字與分頁在前端對已載入文章處理。
- 點擊文章前往 `blog-detail.html?id={articleId}`。
- 共用頁首仍提供登入與購物車功能。
