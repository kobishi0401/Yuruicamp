# 介面操作與後端互動

## admin/partials/booking-calendar.html
* 此畫面的意義：以月曆查看營區預約、剩餘量與公休日，並管理營區公休規則。
* 載入方式：由 `admin/dashboard.html` 掛載。

### 載入時
- GET `/api/booking/campgrounds` 與 `/api/booking/campgrounds/{id}` 取得營區及 zones。
- GET `/api/booking/policy` 取得預約規則。
- GET `/api/admin/bookings` 取得後台預約。
- GET `/api/admin/customers` 補充會員顯示資料。
- GET `/api/admin/campground-closures?page=0&size=100&sort=createdAt,desc` 取得公休規則。

### 公休操作
- POST `/api/admin/campground-closures` 建立單日或週期公休。
- PATCH `/api/admin/campground-closures/{closureId}` 更新規則。
- DELETE `/api/admin/campground-closures/{closureId}` 刪除規則。
- Mock 模式將公休 overlay 儲存在 localStorage。

### 注意
- 前台正式可用量由 POST `/api/booking/check-availability` 判定；後台月曆顯示不可取代建立預約時的後端重查。
