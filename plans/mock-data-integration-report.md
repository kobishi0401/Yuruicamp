# Yuruicamp 三系統假資料統整報告

> **文件目的**：統整買家前台、賣家後台、預約前台三個系統目前使用的假資料，釐清欄位落差、寫死值、應共用項目，以及命名與 API 整合建議。  
> **適用對象**：新手開發者，可搭配 `userguide.md` 與各 `plans/pageFor*.md` 閱讀。  
> **最後更新**：2026-07-03

---

## 目錄

1. [系統架構總覽](#1-系統架構總覽)
2. [假資料檔案清單與筆數](#2-假資料檔案清單與筆數)
3. [買家前台](#3-買家前台)
4. [賣家後台](#4-賣家後台)
5. [預約前台](#5-預約前台)
6. [三系統應共用的實體](#6-三系統應共用的實體)
7. [命名整合建議](#7-命名整合建議)
8. [API 接口整合建議](#8-api-接口整合建議)
9. [問題優先級總表](#9-問題優先級總表)
10. [建議整合路線](#10-建議整合路線)
11. [附錄：「預約」一詞的三種意思](#11-附錄預約一詞的三種意思)
12. [附錄：localStorage 鍵一覽](#12-附錄-localstorage-鍵一覽)

---

## 1. 系統架構總覽

目前專案有三條相對獨立的資料線，彼此**幾乎沒有共用同一份 JSON**：

```
┌─────────────────────────────────────────────────────────────────┐
│  買家前台（主站）                                                  │
│  資料：data/*.json                                               │
│  API：js/api-mock.js → window.API                                │
│  持久化：JSON 靜態檔 + localStorage（mockOrders、cart 等）          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  賣家後台（admin）                                                 │
│  資料：admin/data/*.json                                         │
│  API：admin/js/admin-api.js → AdminAPI（useBackend: false）      │
│  持久化：window.*Cache 記憶體快取（重新整理頁面會還原 JSON）        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  預約前台（booking）                                               │
│  資料：booking/data/*.json                                       │
│  API：無統一層，各頁直接 $.getJSON / fetch                         │
│  持久化：localStorage bookingCart；結帳目前只 console.log          │
└─────────────────────────────────────────────────────────────────┘
```

| 系統 | 資料目錄 | API 抽象層 | 持久化方式 |
|------|----------|------------|------------|
| 買家前台 | `data/*.json` | `js/api-mock.js` → `window.API` | JSON + localStorage |
| 賣家後台 | `admin/data/*.json` | `admin/js/admin-api.js` → `AdminAPI` | 記憶體快取 |
| 預約前台 | `booking/data/*.json` | 無（各頁各自讀檔） | localStorage `bookingCart` |

**重點結論**：三系統目前是「各做各的 mock」，不是同一套資料的不同視圖。

---

## 2. 假資料檔案清單與筆數

| 檔案路徑 | 所屬系統 | 約略筆數 | 主要用途 |
|----------|----------|----------|----------|
| `data/products.json` | 買家 | 18 | 商品列表、詳情、購物車 |
| `admin/data/products.json` | 賣家 | 30 | 商品管理、分店庫存 |
| `data/users.json` | 買家 | 1 | 會員、折價券、通知 |
| `admin/data/customers.json` | 賣家 | 50 | 客戶管理 |
| `data/orders.json` | 買家 | 5 | 會員中心「購買紀錄」 |
| `admin/data/orders.json` | 賣家 | 100 | 訂單管理 |
| `data/rentalOrders.json` | 買家 | 4 | 會員中心「預約與租借」Tab |
| `admin/data/bookings.json` | 賣家 | 50 | 露營區預約管理 |
| `booking/data/campgrounds.json` | 預約 | 8 | 營區搜尋、詳情 |
| `booking/data/rentals.json` | 預約 | 10+ | 營區裝備租借 |
| `admin/data/reantal.json` | 賣家 | 30 | 商品租借庫存（門市/營地）※檔名拼字錯誤 |
| `admin/data/reviews.json` | 賣家 | 多筆 | 評論管理 |
| `admin/data/coupons.json` | 賣家 | 5 | 優惠券管理 |
| `data/branches.json` | 買家 | 3 | 分店頁 |
| `data/articles.json` | 買家 | 多筆 | 部落格 |
| `admin/data/movement.json` | 賣家 | 多筆 | 庫存異動 |
| `admin/data/min_stock.json` | 賣家 | — | 各商品低庫存閾值 |

---

## 3. 買家前台

買家前台透過 `window.API`（`js/api-mock.js`）讀取 `data/*.json`，部分操作會寫入 localStorage。

### 3.1 商品 `data/products.json`

#### JSON 內有的欄位

```
id, name, category, interest_tags, brand, price, originalPrice,
image, images, description, specifications, colors, stock,
rating, reviews, isNew, isBestSeller, tags
```

#### 前端實際會讀取的欄位

| 欄位 | 使用頁面 / 元件 | 說明 |
|------|----------------|------|
| `id` | 列表、詳情、購物車、結帳 | URL 參數 `?id=prod-001` |
| `name`, `price`, `image` | 首頁、列表、購物車 | 核心顯示欄位 |
| `brand` | 詳情、購物車 drawer | |
| `originalPrice` | 首頁、列表、詳情 | 計算折扣百分比 |
| `category` | 商品列表篩選 | |
| `rating`, `reviews` | 首頁、列表、詳情 | 詳情頁若有 HTML 假評價會覆蓋計算 |
| `isNew`, `isBestSeller` | 首頁、列表 | NEW / 熱銷區塊 |
| `interest_tags` | 列表廣告輪播 | 對應問卷 `preferences` |
| `images` | 詳情 Gallery | |
| `colors` | 詳情規格選擇 | |
| `specifications` | 詳情規格表 | |
| `tags` | 詳情標籤、特色列表 | |
| `description` | 詳情商品介紹 Tab | |
| `stock` | **未使用** | JSON 有寫，但前端沒做缺貨判斷 |

#### 有資料但前端沒用到的欄位

- `stock`：沒有「庫存不足」或「已售完」邏輯

#### 寫死 / 未接 JSON 的部分

| 項目 | 位置 | 說明 |
|------|------|------|
| 商品評價 Tab | `pages/product-detail.html` | 3 張 `review-card` 直接寫在 HTML，**不是** `admin/data/reviews.json` |
| 預設商品 ID | `js/pages/product-detail.js` | URL 沒帶 `id` 時固定顯示 `prod-001` |
| 圖片 fallback | 多處 | `picsum.photos`、`placehold.co` |

#### 相關 API（`window.API.products`）

```javascript
API.products.getAll(filters)   // 讀 products.json，支援 category/minPrice/maxPrice/brand 篩選
API.products.getById(id)       // 依 id 找單筆
API.products.getCategories()   // 從商品去重 category
```

---

### 3.2 會員 `data/users.json`（目前僅 1 筆 `user-001`）

#### JSON 內有的欄位

```
id, name, email, password, phone, address, avatar,
tier, tierName, totalSpend, nextTierSpend, joinDate, points,
preferences, coupons[], notifications[]
```

#### 前端實際會讀取的欄位

| 欄位 | 使用處 | 說明 |
|------|--------|------|
| `id` | 訂單關聯、預設使用者 | 多處 fallback 為 `user-001` |
| `name`, `email`, `phone`, `address` | 結帳帶入、會員中心 | |
| `tier`, `tierName` | 會員卡顯示 | 例如「探險家」 |
| `nextTierSpend` | 升等進度條 | 實際累計用 delivered 訂單 subtotal |
| `points` | 會員卡點數 | 會合併 localStorage 點數增量 |
| `preferences` | 個人化問卷、商品推薦 | `{ styles: [], equipment: [] }` |
| `coupons[]` | 購物車 / 結帳折價券 | 透過 `js/components/coupons.js` |
| `notifications[]` | 通知 Tab | |
| `avatar` | Header | 多為 `null`，改用名字首字 |

#### 有資料但幾乎不用的欄位

| 欄位 | 說明 |
|------|------|
| `password` | 前端沒做帳密登入驗證（社群 mock 登入） |
| `totalSpend` | 升等進度改從訂單 `subtotal` 計算，不直接讀此欄 |

#### 寫死 / 未接 JSON 的部分

| 項目 | 位置 | 說明 |
|------|------|------|
| 社群登入 mock 使用者 | `js/components/auth.js` | 產生 `{ id: 'user-001', name: 'Google 會員' }`，**不讀** users.json 的 Amy Chen |
| 結帳預設 userId | `js/pages/checkout.js` | `DEFAULT_CHECKOUT_USER_ID = 'user-001'` |
| 門市取貨地址 | `js/pages/checkout.js` | `STORE_PICKUP_ADDRESS = '台北門市'` |

#### 相關 API（`window.API.users`）

```javascript
API.users.getAll()       // 讀 users.json + 合併點數增量
API.users.getById(id)    // 單一會員
API.users.addPoints()    // 寫入 localStorage mockUserPointDeltas
API.users.update()       // 只更新 AppState，不寫回 JSON
API.users.logout()       // 清除登入，保留購物車
```

---

### 3.3 訂單 `data/orders.json` + localStorage `mockOrders`

#### 靜態 JSON 欄位

```
id, userId, orderNumber, items[], subtotal, points, shippingFee,
discount, total, status, paymentStatus, shippingMethod,
shippingAddress, payment, userNote, createdAt, deliveredAt,
trackingNumber, canReview, reviewed, coupons[]
```

#### `items[]` 子欄位（買家前台使用）

```
productId, name, price, quantity, image
```

#### checkout 新建訂單會額外補上的欄位（`api-mock.js`）

```
buyerName, buyerPhone, buyerEmail, buyerNote,
canReview, review, reviewed
```

#### 會員中心 / 結帳實際使用的欄位

| 欄位 | 說明 |
|------|------|
| `status` | `unshipped` / `shipped` / `delivered` / `returned` 等 |
| `paymentStatus` | `paid` / `unpaid`（語意特殊，見 §4.3） |
| `items[]` | 訂單明細列表 |
| `orderNumber`, `createdAt` | 列表顯示 |
| `subtotal`, `total`, `points` | 金額與回饋點數 |
| `canReview`, `reviewed` | 是否可寫評價 |
| `coupons` | 有使用折價券時的快照 |

#### 缺口

- 靜態 5 筆訂單**沒有** `buyerName`、`buyerPhone` 等（僅 checkout 新建的有）
- 靜態訂單 `productId` 為 `prod-xxx`，與後台 `P024` **完全對不上**

#### 相關 API（`window.API.orders`）

```javascript
API.orders.getAll()
API.orders.getByUserId(userId, status)
API.orders.create(orderData)   // 寫入 localStorage mockOrders
```

---

### 3.4 門市租借 `data/rentalOrders.json`

會員中心「**預約與租借**」Tab 讀此檔。

> ⚠️ 注意：這是「門市裝備租借」（台北門市取還），**不是**露營區訂房預約。

#### 欄位

```
id, userId, orderNumber, items[], subtotal, deposit, total,
status, paymentStatus, createdAt, rentalStart, rentalEnd,
pickupStore, returnStore, payment, cancelReason
```

#### 狀態值（會員中心使用）

`pending` / `confirmed` / `completed` / `cancelled` / `refunded` 等

---

### 3.5 其他買家資料

#### `data/branches.json`（3 家分店）

| 欄位 | 使用處 |
|------|--------|
| `id`, `name`, `address`, `phone`, `hours` | 分店卡片 |
| `image`, `latitude`, `longitude`, `mapQuery` | 地圖 |
| `features`, `description` | 特色標籤與說明 |

**寫死部分**：`js/pages/branches.js` 內 `PARTNER_DATA` 陣列（6 家合作露營農場）完全寫死在 JS，沒有 JSON 檔。

#### `data/articles.json`（部落格）

| 欄位 | 使用處 |
|------|--------|
| `id`, `title`, `category`, `author`, `image` | 列表卡片 |
| `excerpt`, `tags`, `isFeatured` | 列表篩選、精選 |
| `relatedProducts`, `content[]` | 詳情頁內文與導購卡片 |

#### `js/config.js` → `AppConfig`（全域寫死）

| 設定 | 值 | 說明 |
|------|-----|------|
| `CART.FREE_SHIPPING_THRESHOLD` | 3000 | 免運門檻 |
| `COMPANY.NAME` | Yuruicamp | 品牌名 |
| `COMPANY.PHONE` | 0800-123-456 | 客服電話 |
| `COMPANY.ADDRESS` | 台北市信義區… | 公司地址 |
| `API_BASE_URL` | http://localhost:3000/api | 預留後端 |

---

## 4. 賣家後台

後台透過 `$.getJSON('data/xxx.json')` 載入資料，修改後存入 `window.*Cache`。  
`AdminAPI` 在 `useBackend: false` 時**不會真的寫回 JSON 檔**。

### 4.1 商品 `admin/data/products.json`

與買家 `data/products.json` 是**兩套完全獨立的商品目錄**。

#### 後台 JSON 欄位

```
id, rentalId, rentalEnabled, name, category, spec, price, status,
thumbnail, total-stock, branch{}, description, specifications, images
```

#### 與買家前台對照

| 後台欄位 | 買家欄位 | 問題 |
|----------|----------|------|
| `id` → `P001` | `prod-001` | ID 體系完全不同 |
| `thumbnail` | `image` | 命名不同 |
| `spec` | `colors` / 規格 | 語意不同 |
| `status: active/disabled` | 無 | 買家無上下架概念 |
| `total-stock`, `branch{}` | `stock`（未用） | 買家無分店庫存 |
| `rentalId`, `rentalEnabled` | 無 | 僅後台租借管理 |
| `description`（HTML 富文本） | 純文字 | 格式不同 |

#### 額外注意

- `admin/js/products.js` 會讀 `../data/products.json` **只為收集 specifications 的 key**，兩份商品資料本質仍不一致
- 分店 key `main`, `branch-001`, `branch-002`, `branch-003` 與 `data/branches.json` 的 `id` **可以對上**
- 租借營地名稱寫死在 `admin/js/products.js` 的 `ADMIN_RENTAL_CAMP_FULL_NAMES`

---

### 4.2 客戶 `admin/data/customers.json`

#### 後台 JSON 欄位

```
id, avatar, name, phone, email, birthday, registeredAt,
totalSpent, tier, points, coupons, tags[], orders[], rentals[],
shippingAddress{}
```

#### 與買家 `users.json` 對照

| 後台 | 買家 | 問題 |
|------|------|------|
| `id` → `U001` | `user-001` | 格式不同 |
| `totalSpent` | `totalSpend` | 命名不同 |
| `tier` → SVIP/VIP/一般 | `tier` → explorer + `tierName` 探險家 | **等級體系完全不同** |
| `coupons` → 數字 `9` | `coupons[]` 物件陣列 | **型別不同** |
| `orders[]` → 數字 ID 陣列 | 無 | 後台用數字關聯 orders |
| `rentals[]` → 數字 ID 陣列 | 無 | 關聯 bookings.json |
| `shippingAddress{}` 結構化 | 單一 `address` 字串 | 格式不同 |
| `tags[]` | 無 | 僅後台客戶標籤 |
| `birthday`, `registeredAt` | `joinDate` | 命名不同 |

---

### 4.3 訂單 `admin/data/orders.json`

#### 後台 JSON 欄位

```
id, createdAt, buyerName, total, paymentStatus, orderStatus,
items[], address, history[], customer_id
```

#### `items[]` 子欄位（後台使用）

```
name, qty, price, productId
```

#### 與買家 `orders.json` 對照

| 後台 | 買家 | 問題 |
|------|------|------|
| `id` → 數字 `1` | `ord-001` | 格式不同 |
| `orderStatus` | `status` | **欄位名不同** |
| `customer_id` → `U024` | `userId` → `user-001` | 關聯不同 |
| `buyerName` | 靜態 JSON 多數無 | 買家缺欄位 |
| `address` | `shippingAddress` | 命名不同 |
| `items[].qty` | `items[].quantity` | 命名不同 |
| `items[].productId` → `P024` | `prod-xxx` | 商品 ID 不同 |
| `history[]` | 無 | 僅後台有狀態歷程 |
| 無 `orderNumber` | `#ORD-20260101` | 買家有、後台無 |
| 無 `points`, `canReview` | 有 | 買家獨有 |

#### ⚠️ `paymentStatus` 語意衝突（重要）

| 系統 | `paymentStatus` 意思 |
|------|---------------------|
| **買家前台** | `unpaid` = 已付款（待出貨）；`paid` = 待付款（含貨到付款） |
| **賣家後台** | `paid` = 已付款；`unpaid` = 未付款（較直覺） |

整合時**必須統一**，否則串接後會出現狀態顛倒的 bug。

---

### 4.4 預約 `admin/data/bookings.json`

後台「預約/租借管理」讀此檔，結構與預約前台 `bookingCart` **高度相似**。

#### 欄位結構

```json
{
  "id": 1,
  "customer_id": "U022",
  "submitted_at": "2026-03-02 17:26:48",
  "payment_status": "refunded",
  "status": "cancelled",
  "equipment_returned": false,
  "booking_info": {
    "campground_id": "C008",
    "campground_name": "台中武陵溪流野營",
    "region": "中部",
    "check_in": "2026-03-31",
    "check_out": "2026-04-02",
    "total_days": 2,
    "weekday_count": 2,
    "holiday_count": 0,
    "guest_count": 5
  },
  "selected_zones": [
    { "zone_id": "Z012", "zone_type": "碎石區", "quantity": 1, "subtotal": 1900 }
  ],
  "selected_rentals": [
    { "equipment_id": "E001", "name": "極限防水黑膠帳篷", "quantity": 2, "subtotal": 1800 }
  ],
  "summary": {
    "zone_total": 1900,
    "rental_total": 1800,
    "applied_discount": 0,
    "final_amount": 3700
  },
  "history": [
    { "time": "2026-03-02 17:26:48", "action": "預約單已送出" }
  ]
}
```

#### 狀態值

| 類型 | 值 |
|------|-----|
| `payment_status` | `paid` / `refunded` |
| `status` | `pending` / `confirmed` / `completed` / `cancelled` |

#### 缺口

預約前台 checkout（`booking/js/booking-checkout.js`）目前只 `console.log`，**不寫入此檔**，所以前台下的預約後台看不到。

---

### 4.5 租借庫存 `admin/data/reantal.json`

> 檔名 `reantal` 為 `rental` 的拼字錯誤，程式碼中已註解保留。

#### 欄位

```
id, image, name, category, camp[]
```

#### `camp[]` 子欄位

```
name, quantity
```

營地名稱範例：租借主倉、湖畔星空營地、松林野營基地…

與 `booking/data/campgrounds.json` 的「雲海仙境露營區」等**名稱、ID 都不同**，是另一套營地命名。

---

### 4.6 評論 `admin/data/reviews.json`

#### 欄位

```
id, buyerName, buyerAvatar, rating, comment, photos,
productName, createdAt, replied, replyText, replyAt,
repliedBy, repliedByName, replyUpdatedAt, customer_id, productId
```

與買家商品詳情頁的 HTML 假評價、會員中心 `localStorage member_center_reviews` **三處分散，未串接**。

---

### 4.7 優惠券 `admin/data/coupons.json`

#### 欄位

```
code, discount, quantity, used, startDate, endDate, status
```

代碼範例：`YURUIKAMP20`, `CAMPFUN50`, `SUMMER100`…

買家前台折價券來自 `users.json` 內嵌：`WELCOME100`, `SUMMER10`, `CAMP200`…

**兩套代碼零重疊。**

---

### 4.8 僅後台使用的其他資料

| 檔案 | 用途 |
|------|------|
| `admin/data/movement.json` | 庫存異動紀錄（進貨、移轉、損耗） |
| `admin/data/min_stock.json` | 各商品各分店低庫存閾值（預設 5） |

---

## 5. 預約前台

預約系統在 `booking/` 目錄，直接讀 `booking/data/*.json`，沒有像主站一樣的統一 API 層。

### 5.1 營區 `booking/data/campgrounds.json`

#### 欄位

```
campground_id, name, region, description,
environment_tags[], facility_tags[],
zones[]
```

#### `zones[]` 子欄位

```
zone_id, type, capacity_per_site,
price_weekday, price_holiday, total_sites
```

#### 使用頁面

| 頁面 | 讀取方式 |
|------|----------|
| `camp-search.js` | `$.getJSON('../data/campgrounds.json')` |
| `camp-detail.js` | 同上，依 URL 參數找營區 |

#### 寫死值

`camp-search.js` 價格篩選：`TOTAL_MIN = 500`, `TOTAL_MAX = 5000`

---

### 5.2 裝備 `booking/data/rentals.json`

#### 欄位

```
equipment_id, campground_id, name, image_url, terrain_tag,
description, pricing{}, stock
```

#### `pricing` 子欄位

```
price_per_day_weekday, price_per_day_holiday, discount
```

與 `admin/data/reantal.json` 的 `R001` / `E001` **沒有對應表**。

---

### 5.3 `bookingCart`（localStorage 結構）

由 `camp-detail.js` 建立骨架，`camp-rental.js` 填入裝備，結構如下：

```javascript
{
  booking_info: {
    campground_id, campground_name, region,
    check_in, check_out, total_days,
    weekday_count, holiday_count, guest_count
  },
  selected_zones: [
    { zone_id, zone_type, quantity, subtotal }
  ],
  selected_rentals: [
    { equipment_id, name, quantity, subtotal }
  ],
  summary: {
    zone_total, rental_total, applied_discount, final_amount
  }
}
```

checkout 時會額外組：

```javascript
{
  contact: { name, phone, email },
  payment_method: 'credit' | 'linepay' | ...,
  submitted_at: ISO 字串
}
```

但**不會持久化**到任何 JSON 或後台。

---

### 5.4 預約系統主要缺口

| 項目 | 現況 |
|------|------|
| 會員中心露營預約紀錄 | **沒有**；只顯示 `rentalOrders.json`（門市租借） |
| 與 `admin/data/bookings.json` | **未連線** |
| 與 `admin/data/customers.json` | 後台用 `U0xx`，登入用 `user-001` |
| 營地名稱 | 三套命名（booking / admin bookings / reantal camps） |

---

## 6. 三系統應共用的實體

### 6.1 關係圖（概念）

```
Customer（會員）
  ├── Order（電商購物訂單）
  ├── Booking（露營區預約）
  └── RentalOrder（門市裝備租借）

Product（商品）
  ├── OrderItem
  └── RentalSku（可選，商品租借庫存）

Campground（營區）
  ├── Zone（營位類型）
  └── CampEquipment（營區裝備租借）
```

### 6.2 建議共用（Single Source of Truth）

| 實體 | 現況 | 整合建議 |
|------|------|----------|
| **會員 Customer** | `user-001` vs `U001`×50 | 統一 `customerId`，全站一份 |
| **商品 Product** | 買家 18 vs 後台 30 | 以後台為主檔，前台讀 published 子集 |
| **分店 Branch** | `branches.json` 與後台 branch key 已對齊 | ✅ 可共用 |
| **營區 Campground** | booking 8 筆 vs 後台內嵌名稱 | 獨立主檔，前後台共用 |
| **電商訂單 Order** | 兩份 orders | 合併為一份，統一 schema |
| **露營預約 Booking** | 後台有、前台 checkout 未寫 | checkout POST 寫入同一份 |
| **門市租借 RentalOrder** | `rentalOrders.json` | 可保留獨立，或用 `booking.type` 區分 |
| **評論 Review** | HTML + admin JSON + localStorage | 依 `productId` 從 API 拉 |
| **優惠券 Coupon** | users 內嵌 vs admin 獨立 | 獨立 `coupons` + `customer_coupons` 關聯 |

### 6.3 建議保持分離（不必硬共用）

| 資料 | 原因 |
|------|------|
| `movement.json` | 純後台庫存異動 |
| `min_stock.json` | 純後台閾值設定 |
| `articles.json` | 內容行銷，與交易無關 |
| `PARTNER_DATA` | 合作營地行銷（或改為 `partners.json`） |

---

## 7. 命名整合建議

### 7.1 ID 格式統一

| 現況 | 建議統一 |
|------|----------|
| `user-001` / `U001` | `customerId`: `C001` 或保留 `U001` 全站一致 |
| `prod-001` / `P001` | `productId`: `P001`（後台已有，買家改跟隨） |
| `ord-001` / 數字 `1` | `orderId`: `O20260302001` 或統一 `ord-001` |
| `C001` 營區 / `camp-001` 後台營地 | `campgroundId`: `CG001` |
| `E001` 裝備 / `R001` 租借 SKU | 分開：`equipmentId` vs `rentalSkuId` |
| `REV001` | `reviewId`: `REV001`（可保留） |

### 7.2 欄位命名（建議 camelCase）

| 現況 A | 現況 B | 統一建議 |
|--------|--------|----------|
| `orderStatus` | `status` | `status` |
| `qty` | `quantity` | `quantity` |
| `customer_id` | `userId` | `customerId` |
| `totalSpent` | `totalSpend` | `totalSpent` |
| `thumbnail` | `image` | `imageUrl`（或 `thumbnailUrl` + `imageUrl`） |
| `payment_status` | `paymentStatus` | `paymentStatus` |
| `submitted_at` | `createdAt` | `createdAt` |

### 7.3 狀態枚舉統一

#### 電商訂單 `order.status`

```
pending_payment → paid → processing → shipped → delivered
                                              ↘ cancelled / returned
```

#### 露營預約 `booking.status`

```
pending → confirmed → completed
                   ↘ cancelled
```

#### 付款狀態 `paymentStatus`（全站一致，勿用買家現有反邏輯）

```
unpaid   → 尚未付款
paid     → 已付款
refunded → 已退款
```

---

## 8. API 接口整合建議

### 8.1 買家前台（擴充現有 `window.API`）

| 方法 | 建議 REST | 說明 |
|------|-----------|------|
| `API.products.getAll()` | `GET /api/products` | 已有 mock |
| `API.products.getById()` | `GET /api/products/:id` | 已有 mock |
| — | `GET /api/products/:id/reviews` | **新增**，取代 HTML 寫死評價 |
| `API.users.getById()` | `GET /api/customers/me` | 改為「當前登入者」 |
| `API.users.update()` | `PATCH /api/customers/me` | |
| `API.orders.getByUserId()` | `GET /api/orders?customerId=` | |
| `API.orders.create()` | `POST /api/orders` | |
| `API.articles.getAll()` | `GET /api/articles` | 已有 mock |
| `API.branches.getAll()` | `GET /api/branches` | 已有 mock |
| — | `GET /api/coupons/available` | 取代從 users.json 扁平化 |

### 8.2 預約前台（建議新建 `BookingAPI`）

| 建議 REST | 說明 |
|-----------|------|
| `GET /api/campgrounds` | 營區列表（含篩選） |
| `GET /api/campgrounds/:id` | 單一營區含 zones |
| `GET /api/campgrounds/:id/equipment` | 該營區可租裝備 |
| `POST /api/bookings` | checkout 送出（目前 TODO） |
| `GET /api/bookings?customerId=` | 會員中心露營預約紀錄 |
| `GET /api/rental-orders?customerId=` | 門市租借（若保留獨立） |

### 8.3 賣家後台（已有 `AdminAPI` 骨架）

後端就緒後在登入處設定：

```javascript
AdminAPI.configure({ useBackend: true, baseUrl: '/api/admin' });
```

已定義的資源路徑：

```
GET/POST/PATCH  /api/admin/customers
GET/PATCH       /api/admin/orders
GET/POST/PUT    /api/admin/products
PUT             /api/admin/rentals/:id
GET/PUT/PATCH   /api/admin/reviews
GET/POST/PATCH  /api/admin/coupons
GET/POST        /api/admin/movement
（bookings 建議補上 GET/PATCH /api/admin/bookings）
```

---

## 9. 問題優先級總表

| 嚴重度 | 問題 | 影響 |
|--------|------|------|
| 🔴 高 | 兩套商品 catalog（18 vs 30，ID 不同） | 前後台商品永遠對不上 |
| 🔴 高 | 兩套會員（`user-001` vs `U001`×50） | 訂單、預約無法關聯真實客戶 |
| 🔴 高 | 兩套電商訂單（5 vs 100，schema 不同） | 買家下單後台看不到 |
| 🔴 高 | 預約 checkout 不寫 `bookings.json` | 前台預約後台看不到 |
| 🔴 高 | 會員中心「預約」實際是 `rentalOrders`（門市租借） | 使用者認知與資料不符 |
| 🟠 中 | 折價券兩套、代碼零重疊 | 測試與維護混亂 |
| 🟠 中 | 評價分散三處（HTML / admin / localStorage） | 無法統一管理 |
| 🟠 中 | `paymentStatus` 語意前後台相反 | 串接易產生 bug |
| 🟡 低 | `products.stock` 有資料但前端未用 | 庫存顯示不準 |
| 🟡 低 | `reantal.json` 檔名拼錯 | 長期維護困難 |
| 🟡 低 | `PARTNER_DATA` 合作營地寫死在 JS | 無法後台管理 |

---

## 10. 建議整合路線

### Phase 1：對齊「能跑」（改動最小）

1. 建立本文件或 `data/DATA_CONTRACT.md` 作為欄位契約
2. 會員 ID 對照：登入 mock 改讀 `users.json`，或建立 `user-001` ↔ `U001` 對照表
3. 預約 checkout 新增 `localStorage.mockBookings` 或 mock POST，結構對齊 `admin/data/bookings.json`
4. 會員中心分 Tab：**露營預約**（bookings）vs **門市租借**（rentalOrders）

### Phase 2：合併主檔

1. **商品**：以 `admin/data/products.json` 為主，寫轉換層給買家（補 `brand`、`rating` 等展示欄）
2. **會員**：合併 50+1 筆，保留測試帳號 Amy
3. **訂單**：統一 schema，補齊 `orderNumber`、`points`、`canReview` 等買家欄位

### Phase 3：接上真實後端

1. `api-mock.js` / `AdminAPI` 改為 `fetch(AppConfig.API_BASE_URL + ...)`
2. 刪除重複 JSON，改由後端 seed 或資料庫

---

## 11. 附錄：「預約」一詞的三種意思

專案裡「預約」其實指三件不同的事，整合時務必區分：

| 名稱 | 資料檔 | 業務內容 | 買家/預約前台是否顯示 |
|------|--------|----------|----------------------|
| **露營區訂房** | `admin/data/bookings.json` | 選營區 + 營區裝備，入住退房 | 預約站有流程；會員中心**無** |
| **門市裝備租借** | `data/rentalOrders.json` | 台北/新竹等門市取還裝備 | 會員中心「預約與租借」**有** |
| **商品租借庫存** | `admin/data/reantal.json` | 後台管理各營地/門市庫存 | 買家前台**無** |
| **營區裝備 catalog** | `booking/data/rentals.json` | 預約流程中選裝備 | 僅預約站 |

建議未來用 `booking.type` 區分：

- `camp_reservation` — 露營區訂房
- `store_rental` — 門市裝備租借
- `product_rental` — 商品租借庫存異動（偏後台）

---

## 12. 附錄：localStorage 鍵一覽

| Key | 系統 | 用途 |
|-----|------|------|
| `mockOrders` | 買家 | checkout 新增的訂單 |
| `mockUserPointDeltas` | 買家 | 會員點數增量 |
| `cart` | 買家 | 購物車 |
| `checkoutCouponCode` | 買家 | 結帳已套用折價券 |
| `member_center_reviews` | 買家 | 會員提交的訂單評價 |
| `currentUser` | 買家 + 預約 | 登入會員（主站 key） |
| `yuruiUser` | 買家 + 預約 | 登入會員（booking 相容 key） |
| `isLoggedIn` | 買家 + 預約 | 登入旗標 |
| `preferences` | 買家 | 問卷偏好 |
| `memberProfile` / `yurui_profile` | 買家 | 個人資料覆寫 |
| `lastCheckoutOrder` | 買家 | 結帳成功頁顯示訂單編號 |
| `bookingCart` | 預約 | 露營預約購物車 |
| `theme` | 買家 | 主題設定 |

---

## 相關檔案快速索引

| 想了解… | 請看 |
|---------|------|
| 買家 Mock API | `js/api-mock.js` |
| 買家全局設定 | `js/config.js` |
| 買家狀態與 storage | `js/state.js`, `js/storage.js` |
| 會員中心共用邏輯 | `js/components/member-center.js` |
| 登入 mock | `js/components/auth.js` |
| 後台 API 抽象 | `admin/js/admin-api.js` |
| 後台各模組讀檔 | `admin/js/products.js`, `orders.js`, `customers.js`, `bookings.js` |
| 預約結帳 | `booking/js/booking-checkout.js` |
| 預約購物車結構 | `booking/js/camp-detail.js`, `camp-rental.js` |
| 開發導覽 | `userguide.md` |
| 各系統頁面規格 | `plans/pageForBuyer.md`, `pageForSeller.md`, `pageForBooking.md` |

---

*本報告由程式碼盤點產出，若之後 JSON 或 JS 有更新，請同步修訂此文件。*
