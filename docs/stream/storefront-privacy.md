# 介面操作與後端互動

## storefront/pages/privacy.html
* 此頁的意義：顯示商城隱私權政策。
* 頁面網址：`/storefront/pages/privacy.html`

### 載入時
- 政策內容為靜態 HTML，不呼叫業務 API。
- 共用頁首仍初始化登入狀態與購物車。

### 頁面操作
- 只有頁面導覽與共用頁首／頁尾操作，不會修改後端資料。
