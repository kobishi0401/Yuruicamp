# 介面操作與後端互動

## storefront/pages/faq.html
* 此頁的意義：提供商城購買、付款、配送、退換貨與會員常見問題。
* 頁面網址：`/storefront/pages/faq.html`

### 載入時
- FAQ 內容直接寫在 HTML，不呼叫業務後端 API。
- 共用頁首載入時仍會初始化 Firebase Auth、登入 Modal 與購物車狀態。

### 頁面操作
- 分類切換、問題展開／收合與關鍵字搜尋都在前端完成。
- 不會新增或修改後端資料。
