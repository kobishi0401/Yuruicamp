# Yuruicamp Schema 枚舉（ENUM）

> **來源**：[`docs/latest_schema.sql`](./latest_schema.sql) 的 `CREATE TYPE ... AS ENUM`。  
> **用途**：前後端／Mock 對齊允許值時查這份；若與 SQL 不一致，以 SQL 為準。

| ENUM | 說明 | 允許值 |
| --- | --- | --- |
| `article_block_type` | 文章內容區塊類型 | `text`, `heading`, `product` |
| `auth_provider` | 會員 OAuth 登入來源 | `google`, `facebook`, `line` |
| `booking_status` | 預約狀態 | `pending`, `confirmed`, `completed`, `cancelled` |
| `closure_type` | 營區公休類型 | `date_range`, `weekly` |
| `coupon_category` | 優惠券分類 | `promotion`, `birthday`, `firstPurchase` |
| `coupon_claim_status` | 會員領券狀態 | `claimed`, `consumed`, `revoked`, `expired` |
| `coupon_status` | 優惠券主檔狀態 | `active`, `disabled` |
| `coupon_type` | 折扣計算方式（與 coupons.discount_type 對應概念） | `fixed`, `percent` |
| `min_stock_target_type` | 最低庫存目標領域 | `store`, `rental` |
| `order_status` | 訂單履約狀態 | `unshipped`, `shipped`, `completed`, `returned`, `cancelled` |
| `payment_method` | 付款方式（≠ payment_status） | `ecpay-credit`, `ecpay-atm`, `ecpay-cvs`, `ecpay-other`, `cod` |
| `payment_status` | 付款狀態（≠ payment_method） | `unpaid`, `paid`, `refunded` |
| `product_status` | 商品／規格上下架 | `active`, `inactive` |
| `customer_status` | 會員狀態（軟刪用 deleted） | `active`, `suspended`, `deleted` |
| `refund_status` | 退款狀態 | `none`, `requested`, `approved`, `processing`, `refunded`, `rejected`, `failed` |
| `shipping_method` | 配送方式 | `delivery`, `pickup`, `cvs` |

## 常見易混提醒

- `payment_method`（ecpay-credit / ecpay-atm / ecpay-cvs / ecpay-other / cod）**不是** `payment_status`（unpaid / paid / refunded）。
- **`ecpay-cvs`（付款：超商代碼繳費）≠ `shipping_method=cvs`（物流：超商取貨）**。
- `cvs` 訂單須有 `cvs_store_id`（DB `ck_orders_shipping_target`）；Admin 出貨時建綠界 CVS 物流單。`delivery` 出貨建 HOME/TCAT；`pickup` 不呼叫綠界。
- 預約禁止 `cod`（`ck_bookings_no_cod`）；商城 COD 建立為 unpaid，履約後再標 paid。
- 商品下架用 `product_status = inactive`；`disabled` 僅用於 `coupon_status`。
- `booking_status` 含 `completed`，但 `booking_policy_occupying_statuses` 的 CHECK **只允許** `pending`、`confirmed` 占用營位。
- 會員無 password；`auth_provider` 僅 google / facebook / line；`firebase_uid` 綁定 Firebase。
