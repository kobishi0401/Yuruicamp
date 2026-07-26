# Yuruicamp API Contracts（索引）

| 欄位         | 內容                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------- |
| **狀態**     | Active                                                                                         |
| **日期**     | 2026-07-26                                                                                     |
| **欄位策略** | **甲**：對齊 DB／架構決策的精簡契約；舊 Mock 胖欄位不當真相                                    |
| **實作清單** | [`plans/backend-implementation-checklist.md`](../../plans/backend-implementation-checklist.md) |
| **ENUM**     | [`docs/schema-enums.md`](../schema-enums.md)                                                   |

> **改約流程（強制）**
>
> 1. 改契約文件並升版 → 2) 改後端 DTO／OpenAPI → 3) 改前端 Mock 正規化 → 4) 打 API 驗收。
>    **禁止**只改一邊。

---

## 契約一覽

| 優先 | 文件                                                                                   | 階段 | 狀態                                                                                            |
| ---- | -------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------- |
| 共用 | [`common-api-conventions.md`](./common-api-conventions.md)                             | 全部 | Locked v0.1                                                                                     |
| P0   | [`auth-api-contract.md`](./auth-api-contract.md)                                       | A    | Locked v0.1（已實作）                                                                           |
| P0   | [`member-shipping-address-api-contract.md`](./member-shipping-address-api-contract.md) | A/I  | Implemented v0.1（會員本人預設配送地址 GET／PUT）                                               |
| P0   | [`member-profile-api-contract.md`](./member-profile-api-contract.md) | A/I  | Implemented v0.1（會員本人 profile GET／PATCH）                                               |
| P0   | [`product-api-contract.md`](./product-api-contract.md)                                 | B    | Locked v0.8（商品公開讀、評分、equipment_tags 新品／熱銷標籤已完成）                              |
| P0   | [`branch-api-contract.md`](./branch-api-contract.md)                                   | B    | Locked v0.1（B-7 已完成）                                                                       |
| P0   | [`brand-api-contract.md`](./brand-api-contract.md)                                     | B    | Implemented v0.1（首頁合作品牌公開讀取）                                                        |
| P0   | [`checkout-api-contract.md`](./checkout-api-contract.md)                               | C/F  | Locked v0.13（ECPay Launch、COD 消耗、取消 revoked、逾時 expired）                                |
| P0   | [`order-api-contract.md`](./order-api-contract.md)                                     | C    | Locked v0.1（待實作）                                                                           |
| P0   | [`payment-api-contract.md`](./payment-api-contract.md)                                 | D    | Implemented v0.3（D-1～D-6＋W3 全額退款 port；COD claim 消耗完成）                              |
| P1   | [`booking-api-contract.md`](./booking-api-contract.md)                                 | E    | Locked v1.0（公開營區含環境／設施標籤；E-1～E-7 已實作，ECPay、優惠券分別延後至 D、F）           |
| P1   | [`coupon-api-contract.md`](./coupon-api-contract.md)                                   | F    | Partially Implemented v0.4（商城套券、消耗與取消失效完成；Booking Schema 待決定）                 |
| P1   | [`admin-api-contract.md`](./admin-api-contract.md)                                     | G    | Locked v0.23+（G＋W1～W4＋Analytics `categoryBreakdown`）                                         |
| P2   | [`member-review-api-contract.md`](./member-review-api-contract.md)、[`product-review-api-contract.md`](./product-review-api-contract.md) | H | Implemented（會員本人 GET／POST、商品公開分頁讀取與評分統計） |

### 刻意延後（P2，本輪不寫死）

| 領域                | 原因                                               |
| ------------------- | -------------------------------------------------- |
| Articles 公開／Admin | MVP 延後；Blog 仍讀 `articles.json`（ADM-W4-04 ⏭️） |
| calendar_dates 公開讀 | Admin CRUD 已完成（W4-03）；獨立公開端點未開         |
| 圖片上傳（K10）       | 等 GCP（ADM-W4-05 ⏭️）                             |
| Booking Coupon      | 缺 Schema；Checkout 仍拒非 null `couponClaimId`    |

---

## 給新手的閱讀順序

1. `common-api-conventions.md`（Envelope、金額、認證）
2. `auth-api-contract.md` + `product-api-contract.md`（已能打通的範例）
3. `checkout` → `order` → `payment`（商城能買）
4. `booking` → `coupon` → `admin`

---

## 與前端開關

| 前端       | 開關                                                                                   |
| ---------- | -------------------------------------------------------------------------------------- |
| 商城／預約 | `USE_MOCK_API = false`，`API_BASE_URL = http://localhost:8080/api`                     |
| 後台       | `AdminAPI.configure({ useBackend: true, baseUrl: 'http://localhost:8080/api/admin' })` |
