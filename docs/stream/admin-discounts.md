# 介面操作與後端互動

## admin/partials/discounts.html
* 此畫面的意義：管理優惠券主檔、活動期間、折扣規則與啟用狀態。
* 載入方式：由 `admin/dashboard.html` 掛載。

### 載入時
- GET `/api/admin/coupons?page=0&size=100&sort=createdAt,desc`
    - 取得優惠券列表。
- GET `/api/admin/coupons/{couponId}` 取得詳情。

### 優惠券操作
- POST `/api/admin/coupons` 建立優惠券。
- PATCH `/api/admin/coupons/{couponId}` 更新內容或狀態。
- DELETE `/api/admin/coupons/{couponId}` 刪除優惠券。
- 正式模式只有 API 成功後才更新畫面 cache。

### 注意
- 會員領券與 Checkout 套券分別走 `/api/me/coupons/claims` 與 Checkout Session，不在此畫面執行。
