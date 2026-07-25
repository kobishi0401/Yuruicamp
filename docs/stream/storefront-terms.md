# 介面操作與後端互動

## storefront/pages/terms.html
* 此頁的意義：顯示商城服務條款與交易規範。
* 頁面網址：`/storefront/pages/terms.html`

### 載入時
- 條款內容為靜態 HTML，不呼叫業務 API。
- 共用頁首仍初始化登入狀態與購物車。

### 頁面操作
- 只有頁面導覽與共用頁首／頁尾操作，不會修改後端資料。
