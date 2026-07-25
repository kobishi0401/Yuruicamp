# 介面操作與後端互動

## admin/partials/bookings.html
* 此畫面的意義：管理營地預約、查看快照明細、確認／完成預約及內部備註。
* 載入方式：由 `admin/dashboard.html` 掛載。

### 載入時
- GET `/api/admin/bookings?page=0&size=100&sort=createdAt,desc`
    - 取得預約列表與分頁 metadata。
- GET `/api/admin/customers` 補充會員資訊。
- 開啟明細時 GET `/api/admin/bookings/{bookingId}`。

### 預約操作
- POST `/api/admin/bookings/{bookingId}/confirm` 確認預約。
- POST `/api/admin/bookings/{bookingId}/complete` 完成預約。
- PATCH `/api/admin/bookings/{bookingId}/internal-note` 儲存內部備註。
- 篩選、搜尋與列表切換在前端完成。

### 注意
- 正式模式進頁會重新向後端取資料，不與 Mock bookings 合併。
- 營區、日期、價格與租借項目應顯示訂單建立時的後端快照。
