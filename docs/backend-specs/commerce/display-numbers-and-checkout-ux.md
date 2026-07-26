# 顯示編號與結帳 UX（Commerce UX）

| 欄位 | 內容 |
|------|------|
| **狀態** | **已完成**（2026-07-26） |
| **Spec** | [`.scratch/commerce-ux-display-checkout/spec.md`](../../../.scratch/commerce-ux-display-checkout/spec.md) |
| **ADR** | [`0001-display-no-separate-from-uuid.md`](../../adr/0001-display-no-separate-from-uuid.md)、[`0002-checkout-stock-lock-at-entry.md`](../../adr/0002-checkout-stock-lock-at-entry.md) |
| **驗收** | `frontend/tests/commerce-ux-browser.mjs`；PostgreSQL IT（displayNo、contact 快照、Analytics breakdown） |
| **日期** | 2026-07-26 |

---

## 1. 一句話

對外顯示 **`ORD-0001`／`BK-0042`**；對內與金流仍用 **UUID**。商城 **checkout 進頁才鎖庫存**；ECPay **按一次**跳綠界。商品 **列表＋詳情＋首頁** 顯示剩餘數量。

---

## 2. 已落地行為（摘要）

| 區域 | 行為 |
|------|------|
| `cart.js` | 僅 soft 驗量；不 `createSession` |
| `checkout.js` | 進頁 hard lock；M2「結帳並前往付款」一次跳 ECPay |
| `booking-cart.js` | 僅 soft 驗量；不 `createBooking` |
| `booking-checkout.js` | 進頁 hard lock；O2 ECPay 帶 contact body |
| Admin bookings | lineTotal、contact 快照、中文 status timeline |
| Seed／Schema | `display_no` 欄位與 sequence；舊資料依 `created_at` 回填 |

詳細 ticket 清單見 [`.scratch/commerce-ux-display-checkout/README.md`](../../../.scratch/commerce-ux-display-checkout/README.md)。

---

## 3. 相關延伸（同批完成）

- [`.scratch/storefront-member-rental-ux/spec.md`](../../../.scratch/storefront-member-rental-ux/spec.md) — 會員中心 displayNo、Profile API、租借 availability
- [`.scratch/admin-storefront-polish/spec.md`](../../../.scratch/admin-storefront-polish/spec.md) — Analytics 甜甜圈、客戶預載、Blog 改名
- [`.scratch/admin-customer-display-no/spec.md`](../../../.scratch/admin-customer-display-no/spec.md) — 客戶詳情 ORD/BK 顯示與 Modal

---

## 4. 仍待（不在本 spec）

- 真實綠界沙箱（`stub=false`）— 見 [`../payment/ecpay-sandbox-validation.md`](../payment/ecpay-sandbox-validation.md)
- Booking Coupon Schema — 見 [`../coupon/README.md`](../coupon/README.md)
