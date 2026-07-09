# Yuruicamp Schema 枚舉一覽

> 對應 DDL：[`schema.sql`](./schema.sql) 的 `CREATE TYPE`。  
> 假資料規格：[`../plans/data-integration-spec.md`](../plans/data-integration-spec.md)  
> 定案日期：2026-07-09

本文件列出**允許寫入資料庫的枚舉值**。前端 Mock 若仍有別名（aliases），僅作過渡相容；**新資料必須用下列 canonical 值**。

---

## 1. 訂單狀態 `order_status`

| 值 | 中文 | 說明 |
|----|------|------|
| `unshipped` | 未出貨 | 已成立、尚未出貨 |
| `shipped` | 已出貨 | 物流運送中 |
| `completed` | 已完成 | 買家已收貨／流程結束 |
| `returned` | 已退貨 | 退貨結案 |

**來源 JSON**：`data/commerce/orders.json` → `status`  
**不要再用**：`delivered`、`pending`、`cancelled`（舊別名）

---

## 2. 付款狀態 `payment_status`

| 值 | 中文 | 說明 |
|----|------|------|
| `unpaid` | 未付款 | |
| `paid` | 已付款 | |
| `refunded` | 已退款 | 常見於取消預約 |

**使用處**：`ORDERS.payment_status`、`BOOKINGS.payment_status`

---

## 3. 配送方式 `shipping_method`

| 值 | 中文 |
|----|------|
| `delivery` | 宅配 |
| `pickup` | 門市自取 |

**來源**：`orders.shippingMethod`

---

## 4. 預約狀態 `booking_status`

| 值 | 中文 | 是否佔用營位庫存 |
|----|------|------------------|
| `pending` | 待確認 | ✅ 是（見 `occupyingStatuses`） |
| `confirmed` | 已確認 | ✅ 是 |
| `completed` | 已完成 | ✅ 是（歷史佔用；可用性查詢依政策） |
| `cancelled` | 已取消 | ❌ 否 |

**來源**：`data/commerce/camp-bookings.json` → `status`  
**政策**：`data/admin/booking-policy.json` → `occupyingStatuses: ["pending","confirmed","completed"]`

---

## 5. 折價券分類 `coupon_category`

| 值 | 中文 | 會員中心列表 | 結帳可輸入 |
|----|------|--------------|------------|
| `promotion` | 活動碼 | ❌ | ✅ |
| `birthday` | 生日禮 | ✅ | ✅ |
| `firstPurchase` | 首購禮 | ✅ | ✅ |

**來源**：`data/promotions/coupons.json` → `category`  
**範例**：`YURUIHBD` → `birthday`；`YRUIFIRST` → `firstPurchase`；`YURUIKAMP20` → `promotion`

---

## 6. 折價券折扣類型 `coupon_type`

| 值 | 中文 | 說明 |
|----|------|------|
| `fixed` | 固定金額 | `discount` 為新台幣金額（預設） |
| `percent` | 百分比 | `discount` 為百分比數字 |

缺欄時前端／腳本預設：`type = fixed`、`minOrder = 0`。

---

## 7. 折價券啟用狀態 `coupon_status`

| 值 | 中文 |
|----|------|
| `active` | 啟用 |
| `disabled` | 停用 |

---

## 8. 商品上架狀態 `product_status`

| 值 | 中文 |
|----|------|
| `active` | 上架 |
| `inactive` | 下架 |

**來源**：`data/catalog/products.json` → `status`

---

## 9. 營區公休類型 `closure_type`

| 值 | 中文 | 必要欄位 |
|----|------|----------|
| `date_range` | 指定日期區間 | `start_date`、`end_date` |
| `weekly` | 每週固定公休 | `day_of_week`（0=週日…6=週六）、可選 `effective_from` / `effective_to` |

**來源**：`data/admin/campground-closures.json` → `type`  
效果：該營區**所有 zone** 當晚視為 `closed`，`remaining = 0`。

---

## 10. 最低庫存目標類型 `min_stock_target_type`

| 值 | 中文 | `target_id` 指向 |
|----|------|------------------|
| `store` | 商城商品 | `PRODUCTS.id`（例 `P001`） |
| `rental` | 租借 SKU 群組 | `RENTAL_SKUS.id`（例 `R001`） |

**來源**：`data/admin/min-stock.json` 的頂層 key（`store` / `rental`）正規化後寫入此枚舉。

---

## 11. 文章內容區塊類型 `article_block_type`

| 值 | 中文 | 必要欄位 |
|----|------|----------|
| `text` | 段落文字 | `value` |
| `heading` | 小標 | `value` |
| `product` | 內嵌商品卡 | `product_id`（`P001` 格式） |

**來源**：`data/marketing/articles.json` → `content[].type`

---

## 12. 會員登入提供者 `auth_provider`（建議）

| 值 | 說明 |
|----|------|
| `google` | Google OAuth |
| `facebook` | Facebook OAuth |
| `line` | LINE Login（若未來支援） |

**注意**：會員**僅 OAuth**，資料庫**不存 `password`**。  
**來源**：`data/customers/customers.json` → `authProvider`

---

## 13. 政策常數（非 ENUM，但固定）

| 常數 | 值 | 說明 |
|------|-----|------|
| `bookingWindowDays` | `90` | 可預約未來天數 |
| `dateRule` | `[checkIn, checkOut)` | 入住含、退房不含 |
| C001 | 租借主倉 | **不在** `campgrounds` 表 |
| C002–C009 | 可預約營區 | 在 `campgrounds` |

---

## 靜態內容（不進 DB，故無 ENUM）

| 內容 | 位置 |
|------|------|
| FAQ | `pages/faq.html`、`booking/pages/booking-faq.html` |
| 夥伴營地 | `js/pages/branches.js` → `PARTNER_DATA` |
| 租借指南 | `booking/pages/rental-guide.html` |
