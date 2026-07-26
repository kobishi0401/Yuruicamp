# Booking API Contract（v1.0）

| 欄位         | 內容                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| **狀態**     | Locked（E-1～E-7 已實作；Booking Prepare／Reservation 完成，Payment Confirmation 延後至線 D）                 |
| **日期**     | 2026-07-26                                                                                                    |
| **Commerce UX** | `displayNo`、booking-checkout 進頁鎖位、ecpay contact 快照 → [`../backend-specs/commerce/display-numbers-and-checkout-ux.md`](../backend-specs/commerce/display-numbers-and-checkout-ux.md) |
| **版本**     | 1.0                                                                                                           |
| **共用**     | [`common-api-conventions.md`](./common-api-conventions.md)                                                    |
| **相關**     | [`payment-api-contract.md`](./payment-api-contract.md)、[`coupon-api-contract.md`](./coupon-api-contract.md)  |
| **路徑前綴** | 對外統一 **`/api/booking/...`**；前端 facade 因 `API_BASE_URL` 已含 `/api`，內部資源路徑固定寫 `/booking/...` |
| **策略**     | D1.A：待付款 `bookings` + 占用／租借保留；**15 分鐘**；**禁止 COD**                                           |

---

## 0. 一句話

公開讀營區／政策並查詢跨日可用性；進結帳才建 **pending + unpaid** 預約並鎖位／租借；金額後端重算。線 E 先完成待付款預約，ECPay 付款與付款後確認延後至線 D。

### 0.1 計價用語（**不是**週一～五／週六日）

| UI／文件用語 | JSON／DB 欄位（**不更名**，相容舊 client） | 何時套用 |
|--------------|-------------------------------------------|----------|
| **一般價**、**一般日**（晩） | `priceWeekday`、`pricePerDayWeekday`、`weekdayCount` | 住宿區間 `[checkIn, checkOut)` 內，該日在 `calendar_dates` **未**標 `is_holiday=true` 的每一晚 |
| **特殊節日價**、**特殊節日**（晩） | `priceHoliday`、`pricePerDayHoliday`、`holidayCount` | 同上區間內，該日在 `calendar_dates` **已**標 `is_holiday=true` 的每一晚（國定假、連假等；**不一定是週六日**） |

- **公休**（`campground_closures`）只決定能不能訂，**不**決定用哪個價格 tier。
- 後台維護假日曆 → **ADM-W4-03** `GET/PUT /api/admin/calendar-dates`；未標記的週六日仍算**一般日**、走一般價。
- 前台 Mock（`camp-detail.js` 週五週六 heuristic）僅供估價參考；**結帳以本契約＋`calendar_dates` 為準**。

---

## 1. 端點

### 1.1 公開讀

| 方法   | 路徑                              | 認證 | 說明                                |
| ------ | --------------------------------- | ---- | ----------------------------------- |
| `GET`  | `/api/booking/campgrounds`        | 公開 | 可預約營區列表（`active=true`）     |
| `GET`  | `/api/booking/campgrounds/{id}`   | 公開 | 營區詳情 + zones                    |
| `GET`  | `/api/booking/equipment`          | 公開 | 租借裝備；query `campgroundId` 必填 |
| `GET`  | `/api/booking/policy`             | 公開 | 預約政策                            |
| `GET`  | `/api/booking/closures`           | 公開 | 公休／關閉                          |
| `POST` | `/api/booking/check-availability` | 公開 | RPC：查可訂量（不鎖）               |

### 1.2 會員寫／讀

| 方法    | 路徑                                                | 認證 | 說明                   |
| ------- | --------------------------------------------------- | ---- | ---------------------- |
| `POST`  | `/api/booking/checkout/sessions`                    | 會員 | 進結帳鎖位             |
| `GET`   | `/api/booking/checkout/sessions/{bookingId}`        | 會員 | 讀結帳中預約           |
| `PATCH` | `/api/booking/checkout/sessions/{bookingId}`        | 會員 | 更新優惠券；延後至線 F |
| `POST`  | `/api/booking/checkout/sessions/{bookingId}/ecpay`  | 會員 | 綠界表單；延後至線 D   |
| `POST`  | `/api/booking/checkout/sessions/{bookingId}/cancel` | 會員 | 取消釋放               |
| `GET`   | `/api/booking/bookings`                             | 會員 | 我的預約列表           |
| `GET`   | `/api/booking/bookings/{id}`                        | 會員 | 預約詳情               |

---

## 2. 公開資源（甲：對齊 DB）

### 2.1 `Campground`

| JSON              | 型別           | DB                                                                                 |
| ----------------- | -------------- | ---------------------------------------------------------------------------------- |
| `id`              | string         | `campgrounds.id`                                                                   |
| `name`            | string         | `name`                                                                             |
| `region`          | string         | `region`                                                                           |
| `description`     | string \| null | `description`                                                                      |
| `active`          | boolean        | `active`                                                                           |
| `environmentTags` | string[]       | `campground_environment_tags` → active `environment_tags.label`，依 `sort_order`、`id` 排序 |
| `facilityTags`    | string[]       | `campground_facility_tags` → active `facility_tags.label`，依 `sort_order`、`id` 排序       |
| `zones`           | array          | 詳情必含；列表可省略或精簡                                                         |

### 2.2 `Zone`（嵌在營區詳情）

| JSON              | 型別    | DB                    |
| ----------------- | ------- | --------------------- |
| `id`              | string  | `campground_zones.id` |
| `type`            | string  | `type`                |
| `capacityPerSite` | integer | `capacity_per_site`   |
| `priceWeekday`    | string  | `price_weekday`（UI：**一般價**）       |
| `priceHoliday`    | string  | `price_holiday`（UI：**特殊節日價**）   |
| `totalSites`      | integer | `total_sites`         |
| `active`          | boolean | `active`              |

### 2.3 `RentalEquipment`（列表項，精簡）

| JSON                 | 型別    | 說明                                      |
| -------------------- | ------- | ----------------------------------------- |
| `id`                 | string  | 固定對應 `rental_listings.id`             |
| `rentalSkuVariantId` | string  | `rental_sku_variants.id`                  |
| `campgroundId`       | string  | `rental_listings.campground_id`           |
| `name`               | string  | `equipment_items.name`                    |
| `pricePerDayWeekday` | string  | `rental_listings.price_per_day_weekday`（UI：**一般價／日**）   |
| `pricePerDayHoliday` | string  | `rental_listings.price_per_day_holiday`（UI：**特殊節日價／日**） |
| `active`             | boolean | listing、SKU 與 variant 都可用才為 `true` |

> `id` 是營區上架項目，不是 SKU variant。建立預約時同時傳 `rentalListingId` 與 `rentalSkuVariantId`，後端必須驗證兩者確實屬於同一筆有效上架資料。

### 2.4 `BookingPolicy`

| JSON                       | 型別     | DB                                                               |
| -------------------------- | -------- | ---------------------------------------------------------------- |
| `bookingWindowDays`        | integer  | `booking_policies.booking_window_days`                           |
| `advanceDays`              | integer  | `advance_days`                                                   |
| `maxNights`                | integer  | `max_nights`                                                     |
| `timezone`                 | string   | `timezone`                                                       |
| `dateBoundaryHour`         | integer  | `date_boundary_hour`                                             |
| `lowAvailabilityThreshold` | integer  | `low_availability_threshold`                                     |
| `occupyingStatuses`        | string[] | `booking_policy_occupying_statuses`；預期 `pending`、`confirmed` |

政策固定讀取 `booking_policies.id=1`；不存在時回 `404 NOT_FOUND`。

### 2.5 `CampgroundClosure`

| JSON                           | 型別            | DB                       |
| ------------------------------ | --------------- | ------------------------ |
| `id`                           | integer         | `campground_closures.id` |
| `campgroundId`                 | string          | `campground_id`          |
| `closureType`                  | string          | `date_range` \| `weekly` |
| `startDate`／`endDate`         | string \| null  | 日期區間規則             |
| `weekday`                      | integer \| null | 每週規則，0–6            |
| `effectiveFrom`／`effectiveTo` | string \| null  | 每週規則有效區間         |
| `reason`                       | string          | 關閉原因                 |

列表端點沿用共用 Envelope，回傳 `data[]` 與單頁 `meta`。只公開 active 營區的 closure。

### 2.6 `check-availability` Request／Response

**Request：**

| 欄位               | 型別                  | 必填        |
| ------------------ | --------------------- | ----------- |
| `campgroundId`     | string                | 是          |
| `checkIn`          | string (`YYYY-MM-DD`) | 是          |
| `checkOut`         | string (`YYYY-MM-DD`) | 是          |
| `zones`            | array                 | 否（與 `rentals` 至少一項） |
| `zones[].zoneId`   | string                | 是          |
| `zones[].quantity` | integer               | 是（`> 0`） |
| `rentals`          | array                 | 否          |
| `rentals[].rentalListingId` | string       | 是          |
| `rentals[].quantity` | integer             | 否（預設 1，`> 0`） |

`zones` 與 `rentals` 至少需有一項非空；兩者皆空回 `400 VALIDATION_ERROR`。

同一個 `zoneId` 或 `rentalListingId` 不可重複傳入；重複時回 `400 VALIDATION_ERROR`。

**Response `data`：**

| JSON        | 型別     |
| ----------- | -------- | ----------------------------------------------- |
| `available` | boolean  |
| `reasons`   | string[] | 不可訂原因（可空）                              |
| `zones`     | array    | 各區 `zoneId`、`requested`、`availableQuantity` |
| `rentals`   | array    | 各 listing `rentalListingId`、`requested`、`availableQuantity` |

可用性規則：

- 住宿區間固定採 `[checkIn, checkOut)`，退房日不占用營位。
- **營位** `availableQuantity` 是該 zone 在整段住宿期間「每天剩餘量的最小值」，不可只看入住日。
- **租借** `availableQuantity = on_hand_quantity − 重疊 active 保留量`（與 checkout 建單公式一致）。
- 任一住宿日晚間命中營區公休，整筆結果 `available=false`。
- 任一 zone 的 `requested > availableQuantity`，整筆結果 `available=false`。
- 任一 rental 的 `requested > availableQuantity`，整筆結果 `available=false`。
- 正常完成查詢時固定回 HTTP 200；即使不可訂，也以 `available=false` 與 `reasons` 表示，不用 409。
- `reasons` 使用穩定代碼，順序固定為 `CAMPGROUND_CLOSED`、`ZONE_UNAVAILABLE`、`RENTAL_UNAVAILABLE`；可能同時出現。
- 日期格式錯誤或 `checkOut <= checkIn` 回 `400 BOOKING_DATE_INVALID`。
- `checkIn` 早於 `today + advanceDays`、晚於 `today + bookingWindowDays`，或晚數超過 `maxNights`，回 `400 BOOKING_WINDOW_EXCEEDED`。窗口邊界日可預約。
- 「今天」依 policy 的 `Asia/Taipei` 時區判斷。
- 找不到有效營區，或 zone 停用／不屬於該營區時回 `404 NOT_FOUND`。
- 本端點不寫預約、不鎖營位，也不建立租借保留帳。

查詢優先呼叫 DB 函式 `get_zone_availability` 或行為完全相同的查詢。

---

## 3. 進結帳 — `POST /api/booking/checkout/sessions`

### 3.1 Request

| 欄位                           | 型別           | 必填                                         |
| ------------------------------ | -------------- | -------------------------------------------- |
| `campgroundId`                 | string         | 是                                           |
| `checkIn`                      | string         | 是                                           |
| `checkOut`                     | string         | 是                                           |
| `guestCount`                   | integer        | 是（`> 0`）                                  |
| `zones`                        | array          | 是（至少 1）                                 |
| `zones[].zoneId`               | string         | 是                                           |
| `zones[].quantity`             | integer        | 是                                           |
| `rentals`                      | array          | 否                                           |
| `rentals[].rentalListingId`    | string         | 是（有 rentals 時）                          |
| `rentals[].rentalSkuVariantId` | string         | 是（有 rentals 時）                          |
| `rentals[].quantity`           | integer        | 是（有 rentals 時，`> 0`）                   |
| `couponClaimId`                | number \| null | 線 F 前不得傳非 null                         |
| `paymentMethod`                | string         | 是（**不得** `cod`；建議 `ecpay-credit` 等） |
| `idempotencyKey`               | string         | 是                                           |

忽略前端自算的 `finalAmount`。

`rentals` 可省略或傳空陣列。同一個 `rentalListingId` 或 `rentalSkuVariantId` 不可重複；重複時回 `400 VALIDATION_ERROR`。

`idempotencyKey` 以會員為範圍唯一。同一會員以相同 key 重送相同 payload 時回放原結果；相同 key 搭配不同 payload 時回 `409 IDEMPOTENCY_CONFLICT`。`bookings` 已具備對等的 key、request hash 與唯一約束；E-3 Service 仍必須比較指紋，不能只靠資料庫唯一約束判斷。

### 3.2 E-3～E-4 建立規則

1. 驗證 active 會員、日期政策、付款方式及冪等鍵。
2. 鎖定 active 營區，再依 `zoneId` 固定排序悲觀鎖定 active zones。
3. 在同一交易內重新執行跨晚可用性查詢；不足或公休回 `409 ZONE_UNAVAILABLE`。
4. 依 `[checkIn, checkOut)` 與 `calendar_dates.is_holiday` 計算**一般日／特殊節日**晩數（→ `weekdayCount`／`holidayCount`）。
5. 使用鎖定後的營位價格計算金額並保存快照，不接受前端金額。
6. 有租借時，依 variant ID 固定排序，解析營區的 rental location 並鎖定 `rental_sku_variant_stocks`。
7. 扣除日期重疊的 active `rental_stock_reservations`；不足回 `409 RENTAL_STOCK_INSUFFICIENT`。
8. 建立 `pending`、`unpaid` Booking、營位／租借快照、租借 active 保留帳與初始狀態歷程，`checkoutExpiresAt = now + 15 分鐘`。

成功回 HTTP 200。E-3～E-4 不呼叫 ECPay、不將預約改成 `confirmed`，只回 `checkoutStep=ready_to_pay`。

### 3.3 Response — `BookingCheckoutSession`

| JSON                           | 型別    | DB／說明                                                                             |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------ |
| `bookingId`                    | string  | `bookings.id`（內部主鍵）                                                            |
| `displayNo`                    | string  | `bookings.display_no`；例 `BK-0042`（**planned**，Commerce UX spec）                  |
| `status`                       | string  | `pending`（進結帳）                                                                  |
| `paymentStatus`                | string  | `unpaid`                                                                             |
| `paymentMethod`                | string  | 非 `cod`                                                                             |
| `checkoutExpiresAt`            | string  | +15m                                                                                 |
| `campgroundId`                 | string  |                                                                                      |
| `campgroundName`               | string  | `campground_name_snapshot`                                                           |
| `region`                       | string  | `region_snapshot`                                                                    |
| `checkIn`／`checkOut`          | string  | date                                                                                 |
| `guestCount`                   | integer |                                                                                      |
| `weekdayCount`／`holidayCount` | integer | 後端依 `calendar_dates` 算（UI：**一般日／特殊節日**晩數）                               |
| `pricing`                      | object  | 見下                                                                                 |
| `zones`                        | array   | 選位快照                                                                             |
| `rentals`                      | array   | 可空                                                                                 |
| `checkoutStep`                 | string  | `draft` \| `ready_to_pay` \| `completed` \| `closed`；POST 建立時固定 `ready_to_pay` |

#### `pricing`

| JSON          | DB                 |
| ------------- | ------------------ |
| `zoneTotal`   | `zone_total`       |
| `rentalTotal` | `rental_total`     |
| `discount`    | `applied_discount` |
| `finalAmount` | `final_amount`     |

字串金額；滿足 DB CHECK：`finalAmount = max(zoneTotal + rentalTotal - discount, 0)`。

租借可用量：

```text
rental_sku_variant_stocks.on_hand_quantity
- SUM(日期重疊且 status=active 的 rental_stock_reservations.quantity)
= availableQuantity
```

日期重疊固定使用半開區間：`existing.checkIn < requested.checkOut AND existing.checkOut > requested.checkIn`。相鄰租期不重疊，可共用同一批實體庫存。

租借 listing 必須屬於 request 的營區，且 listing、equipment item、rental SKU、variant、營區 rental location 都必須有效。找不到、營區／variant 不相符或任一主檔停用時回 `404 NOT_FOUND`。

#### `zones[]`

| JSON           | 說明                     |
| -------------- | ------------------------ |
| `zoneId`       | 營位 ID                  |
| `type`         | 建立當下的營位類型快照   |
| `priceWeekday` | 建立當下的一般價字串（DB `price_weekday`）   |
| `priceHoliday` | 建立當下的特殊節日價字串（DB `price_holiday`） |
| `quantity`     | 整段住宿每晚占用數量     |
| `lineTotal`    | 後端計算的該營位小計字串 |

#### `rentals[]`

| JSON                 | 說明                                      |
| -------------------- | ----------------------------------------- |
| `rentalListingId`    | 營區租借 listing ID                       |
| `rentalSkuVariantId` | 租借 variant ID                           |
| `sku`                | 建立當下的 SKU 快照                       |
| `name`               | 建立當下的裝備名稱快照                    |
| `specification`      | 建立當下的規格快照                        |
| `priceWeekday`       | 一般價每日租金字串（DB 欄位名不變）                          |
| `priceHoliday`       | 特殊節日價每日租金字串                                      |
| `discountRate`       | listing 折扣比率字串，範圍 `0.00`～`0.30` |
| `quantity`           | 租借數量                                  |
| `lineTotal`          | 折扣後租借小計字串                        |

租借小計公式：`((一般價 × 一般日晩數) + (特殊節日價 × 特殊節日晩數)) × quantity × (1 - discountRate)`，最後四捨五入至兩位。

---

## 4. 會員預約讀取 — `Booking`

三個讀取端點都必須從 Firebase principal 取得 `customerId`，不可接受 query 或 body 傳入任意會員 ID。查不到或不屬於本人一律回 `404 NOT_FOUND`，避免洩漏預約 ID 是否存在。

### 4.1 列表 — `GET /api/booking/bookings`

支援 `page`（預設 0）與 `size`（預設 20、範圍 1～100），固定依 `createdAt desc, bookingId desc` 排序。回應 `data[]` 為精簡資料並帶共用 `meta`。

| JSON                  | 型別    | 說明               |
| --------------------- | ------- | ------------------ |
| `bookingId`           | string  | `bookings.id`      |
| `status`              | string  | 預約狀態           |
| `paymentStatus`       | string  | 付款狀態           |
| `campgroundName`      | string  | 營區名稱快照       |
| `region`              | string  | 地區快照           |
| `checkIn`／`checkOut` | string  | 住宿日期           |
| `guestCount`          | integer | 人數               |
| `finalAmount`         | string  | 最終金額，固定兩位 |
| `createdAt`           | string  | ISO-8601 建立時間  |

### 4.2 詳情 — `GET /api/booking/bookings/{id}`

詳情包含列表欄位，以及 `campgroundId`、`paymentMethod`、`paidAt`、`checkoutExpiresAt`、一般日／特殊節日晩數、`pricing`、`zones`、`rentals` 與 `updatedAt`。`pricing`、`zones`、`rentals` 欄位形狀與 `BookingCheckoutSession` 相同，並且全部取建立當下快照。

### 4.3 Checkout 讀取 — `GET /api/booking/checkout/sessions/{bookingId}`

回傳與建立 Checkout 相同的 `BookingCheckoutSession`。`checkoutStep` 規則：待付款為 `ready_to_pay`、已付款為 `completed`、已取消為 `closed`。

`booking_status`：`pending` \| `confirmed` \| `completed` \| `cancelled`。  
占用狀態以政策表為準（通常 `pending`／`confirmed`）。

線 D 完成前，線 E 建立的資料只會是 `status=pending`、`paymentStatus=unpaid`；不得由 Booking API 假裝付款成功或直接改成 `confirmed`。

---

## 5. 取消與逾時釋放

### 5.1 主動取消 — `POST /api/booking/checkout/sessions/{bookingId}/cancel`

- 必須鎖定本人 Booking；不存在或不屬本人回 `404 NOT_FOUND`。
- 只允許 `pending + unpaid` 進入取消；其他非 cancelled 狀態回 `409 CONFLICT`。
- 同一交易將 Booking 改為 `cancelled`、active 租借保留改為 `released` 並寫入 `releasedAt`，最後新增一次狀態歷程。
- 已 cancelled 再取消直接回放目前 Checkout，不能重複寫歷程。
- 成功回傳 `BookingCheckoutSession`，其中 `checkoutStep=closed`。

### 5.2 15 分鐘逾時排程

排程固定查詢 `checkout_expires_at <= now`、`status=pending`、`payment_status=unpaid`。每筆在同一交易內重新鎖定並檢查狀態，符合才取消、釋放 active 租借保留並新增歷程。營位不另建釋放帳；Booking 不再是政策占用狀態後，可用性查詢會自然恢復數量。

排程重跑保持冪等。若與付款通知競爭，兩邊都必須先鎖定同一筆 Booking，再以取得鎖後讀到的狀態決定是否前進。

---

## 6. 錯誤碼

| HTTP  | code                        | 使用時機                                                                                 |
| ----- | --------------------------- | ---------------------------------------------------------------------------------------- |
| `400` | `BOOKING_DATE_INVALID`      | 日期格式錯誤、`checkOut <= checkIn` 或住宿天數不合法                                     |
| `400` | `BOOKING_WINDOW_EXCEEDED`   | 超出政策的提前天數、可預約窗口或最長住宿限制                                             |
| `409` | `ZONE_UNAVAILABLE`          | E-3 進結帳鎖位時，營位關閉或整段住宿期間剩餘量不足；E-2 純查詢改用 HTTP 200 結果 reasons |
| `409` | `RENTAL_STOCK_INSUFFICIENT` | 指定營區、日期區間的租借庫存不足                                                         |
| `409` | `BOOKING_EXPIRED`           | 操作已超過 `checkoutExpiresAt` 的待付款預約                                              |
| `409` | `CONFLICT`                  | 取消非 pending／unpaid 且尚未 cancelled 的預約                                           |
| `409` | `IDEMPOTENCY_CONFLICT`      | 相同 key 被用於不同建立內容                                                              |

未列出的認證、驗證與找不到資源錯誤沿用共用契約。

---

## 7. v1.0 暫不提供

| 項目                                         | 原因                                                 |
| -------------------------------------------- | ---------------------------------------------------- |
| COD                                          | DB／產品禁止                                         |
| `/booking/checkout/sessions/{id}/ecpay`      | **已實作**（線 D）；Commerce UX 將增 contact Request body |
| 優惠券套用                                   | 延後至線 F；目前 `couponClaimId` 只能省略或為 `null` |
| 付款後 `confirmed`                           | 付款真相必須由線 D 的 ECPay Notify webhook 寫入      |
| 舊 Mock 胖欄位（隨意 picsum 欄）             | 不當契約真相                                         |
| 前端直接 `POST /booking/bookings` 當建單真相 | 改走 checkout sessions                               |

線 E 的完成定義是 Booking Prepare／Reservation：前端可查詢、建立 `pending + unpaid`、讀取本人預約、主動取消並等待逾時釋放。ECPay 表單、Notify 驗簽、`paid` 與付款後導頁屬線 D；`confirmed` 仍由後台確認。

### 7.1 ECPay Launch + 聯絡快照（Commerce UX，planned）

`POST /api/booking/checkout/sessions/{bookingId}/ecpay`

Request body（新增）：

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `contact.name` | string | 是 | 寫入 `bookings.contact_name_snapshot` |
| `contact.phone` | string | 是 | 寫入 `contact_phone_snapshot` |
| `contact.email` | string | 是 | 寫入 `contact_email_snapshot` |

同一 transaction 驗證可付 → 寫快照 → 回傳 Payment Launch（與 [`payment-api-contract.md`](./payment-api-contract.md) 一致）。

**前端 B3**：`POST /booking/checkout/sessions` 改在 **booking-checkout 進頁**呼叫，不在 booking-cart 進頁。

---

## Changelog

| 版本 | 日期       | 說明                                                                                                                   |
| ---- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1.1  | 2026-07-26 | Commerce UX：`displayNo`、ecpay contact 快照、booking-checkout 進頁鎖位（spec）                                        |
| 1.0  | 2026-07-23 | 公開營區列表與詳情補回 `environmentTags`、`facilityTags`，供前台環境特徵與設施篩選使用                                 |
| 0.9  | 2026-07-21 | E-7 前端接線完成；統一 facade 路徑、Bearer／Envelope／meta、後端可用性與價格、Booking ID、倒數及 Payment Deferred 邊界 |
| 0.8  | 2026-07-21 | E-6 主動取消與 15 分鐘逾時釋放已實作；鎖定狀態競爭、租借 released 與歷程冪等                                           |
| 0.7  | 2026-07-21 | E-5 會員預約列表、詳情與 Checkout 讀取已實作；鎖定本人限制、404 隔離與分頁欄位                                         |
| 0.6  | 2026-07-21 | E-4 租借加購已實作；鎖定營區庫位解析、跨日重疊、active 保留帳、狀態過濾、折扣比率與租借快照                            |
| 0.5  | 2026-07-21 | E-3 Booking Checkout 已實作；鎖定悲觀鎖順序、冪等回放、後端日曆計價、營位快照與 E-4 前租借限制                         |
| 0.4  | 2026-07-21 | E-2 可用性查詢已實作；鎖定日期／窗口錯誤、HTTP 200 不可訂結果與 reasons 順序                                           |
| 0.3  | 2026-07-21 | 鎖定 E-1 policy／closure 欄位與列表 meta；E-1 公開讀已實作                                                             |
| 0.2  | 2026-07-21 | 鎖定租借 listing／variant 識別、建立冪等、跨日可用性、錯誤碼與線 D／F 延後邊界                                         |
| 0.1  | 2026-07-20 | 公開讀 + checkout；路徑統一 `/api/booking`                                                                             |
