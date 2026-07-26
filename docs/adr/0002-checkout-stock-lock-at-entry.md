# ADR 0002：結帳進頁才 hard lock 庫存（B3）

| 欄位 | 內容 |
|------|------|
| **狀態** | Accepted |
| **日期** | 2026-07-26 |
| **決策者** | Product / Grilling |

## 背景

Checkout API 契約定義：購物車不鎖庫存，`POST /checkout/sessions` 建立 unpaid 訂單與 15 分鐘保留。前端 cart 頁目前進頁即建 Session，與契約及使用者期望（先選購、進結帳才計時）不一致。

## 決策

- **Soft check**（不建 Session）：商品頁加購、cart／booking-cart 調整數量、cart 前往結帳前（K2）。
- **Hard lock**（建 Session／Booking + 15 分鐘）：商城 checkout 進頁、租借 booking-checkout 進頁。
- 商城與租借**同一規則**（J2）。

## 理由

- 對齊 API 契約與文件。
- 減少使用者在 cart 長時間選購時佔用保留庫存。
- Soft + hard 雙層仍防超賣（hard 時悲觀鎖）。

## 後果

- 移除 cart／booking-cart 進頁建單邏輯。
- checkout 初始化需處理未登入、庫存不足、idempotency。
- 使用者從 cart 到 checkout 之間仍有競購窗口（可接受；K2 降低白跑機率）。
