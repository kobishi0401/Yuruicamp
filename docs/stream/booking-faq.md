# 介面操作與後端互動

## booking/pages/booking-faq.html
* 此頁的意義：提供營地預約、取消、付款、入住與裝備租借常見問題。
* 頁面網址：`/booking/pages/booking-faq.html`

### 載入時
- FAQ 內容為靜態 HTML，不呼叫預約業務 API。
- Booking 共用 layout 仍會初始化 Firebase Auth 與共用導覽。

### 頁面操作
- 問題展開／收合與頁面導覽在前端完成。
- 不新增或修改後端資料。
