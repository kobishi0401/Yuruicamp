# 介面操作與後端互動

## booking/pages/booking-success.html
* 此頁的意義：顯示營地預約完成提示、預約編號與後續導引。
* 頁面網址：`/booking/pages/booking-success.html?bookingNum={bookingNumber}`

### 載入時
- 頁面優先讀取網址 `bookingNum`，再依序回退 `sessionStorage.lastCheckoutBooking`、`localStorage.lastCheckoutBooking` 與 Mock 最後一筆預約。
- 此頁目前沒有專屬資料查詢腳本；若需確認最新後端狀態，使用者可前往會員中心。
- 成功動畫由 `/storefront/js/components/success-effects.js` 執行。

### 頁面操作
- 可返回預約首頁、繼續瀏覽或前往會員中心查看預約。
- 不在此頁再次建立預約或重複送出付款。

### 登入
- 共用 Booking layout 會還原 Firebase 登入狀態。
