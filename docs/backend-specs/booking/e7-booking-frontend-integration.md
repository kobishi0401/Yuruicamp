# E-7 Booking 前端接線

## 用途

讓 Booking 前台在 `USE_MOCK_API=false` 時使用 E-1～E-6 的 Spring Boot API，不再把前端 JSON、價格、會員 ID 或付款狀態當成後端真相。

## 流程

```text
Booking 頁面
→ BookingAPI facade
→ ApiClient（Bearer + Envelope）
→ /api/booking/**
→ 顯示後端可用量、快照價格、bookingId 與 checkoutExpiresAt
```

## 規則

- `API_BASE_URL` 已包含 `/api`，facade 只寫 `/booking/...`，最終 URL 為 `/api/booking/...`。
- 公開營區、租借品、政策、公休與可用性不要求 Token；會員列表、詳情、Checkout、建立與取消要求 Firebase ID Token。
- Backend 模式不讀寫 `mockBookings`，也不傳 `customerId`、價格、快照、`status` 或 `paymentStatus`。
- 營區可用性固定呼叫 `POST /api/booking/check-availability`；租借數量由建立 Checkout 的後端交易最終確認。
- 列表解開 Envelope 的 `data` 並保留 `meta`；會員中心開啟明細時再讀完整 Booking 快照。
- **B3**：`booking-cart.html` 僅 soft 驗量，不建 Session。進入 `booking/pages/booking-checkout.html` 登入後才 `POST /api/booking/checkout/sessions` 完成 hard lock；數量變更在 cart 以 soft 檢查處理。
- `RENTAL_STOCK_INSUFFICIENT` 在 cart soft 驗量或 checkout 建 Session 時顯示「商品剩餘數量不足請重新調整數量」。
- 建立成功使用後端 `bookingId`、`displayNo`、`pricing`、`paymentStatus=unpaid` 與 `checkoutExpiresAt`。
- `booking/pages/booking-checkout.html` 的 ECPay 按鈕呼叫 `POST /api/booking/checkout/sessions/{bookingId}/ecpay` 並帶 `contact` body（O2）；不得在未建 Session 前 launch。
- 線 E 不收集信用卡、不產生 ECPay 表單，也不把 Booking 改成 paid／confirmed。

## 驗證結果

- `booking-api-facade.mjs`：路徑、認證、Envelope／meta、Backend 無 Mock 寫入與取消方法通過。
- `booking-checkout-request.mjs`：cart soft 驗量、checkout 進頁建 Session、精簡 Request、UUID 冪等鍵、庫存不足訊息、ECPay contact body 通過。
- ApiClient、Checkout facade、Checkout Mock、Checkout Request 與 smoke 回歸全部通過。
- 本機 Spring Boot + Vite 實頁驗證通過：營區列表、營區詳情與待付款結果頁正常載入，沒有 console error。
- Puppeteer 瀏覽器 smoke 未執行完成，原因是本機沒有測試指定版本的 Chrome；沒有為此安裝新瀏覽器。
