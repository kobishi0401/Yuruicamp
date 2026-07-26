# 介面操作與後端互動

## booking/pages/booking-success.html

* 此頁的意義：顯示營地預約完成提示、**displayNo 顯示編號**（如 `BK-0042`）與後續導引。
* 頁面網址：`/booking/pages/booking-success.html?bookingId={internalId}`（ECPay Return 帶入）；向後相容 `bookingNum`。

### 載入時

- 頁面優先讀取網址 **`bookingId`**（綠界導回），其次 `bookingNum`、再依序回退 `sessionStorage.lastCheckoutBooking` 等。
- 顯示編號應為 **`displayNo`**（`BK-0042`），**不加 `#` 前綴**；需自 API 或 session 解析，不可直接顯示 UUID。
- 若需確認最新後端狀態，使用者可前往會員中心。
- 成功動畫由 `/storefront/js/components/success-effects.js` 執行。

### 頁面操作

- 可返回預約首頁、繼續瀏覽或前往會員中心查看預約。
- 不在此頁再次建立預約或重複送出付款。

### 登入

- 共用 Booking layout 會還原 Firebase 登入狀態。

### 相關 spec

- Commerce UX spec：`.scratch/commerce-ux-display-checkout/spec.md`
