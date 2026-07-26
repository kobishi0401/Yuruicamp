# 顯示編號與結帳 UX（Commerce UX）

| 欄位 | 內容 |
|------|------|
| **狀態** | Spec ready（待實作） |
| **Spec** | [`.scratch/commerce-ux-display-checkout/spec.md`](../../../.scratch/commerce-ux-display-checkout/spec.md) |
| **ADR** | [`0001-display-no-separate-from-uuid.md`](../../adr/0001-display-no-separate-from-uuid.md)、[`0002-checkout-stock-lock-at-entry.md`](../../adr/0002-checkout-stock-lock-at-entry.md) |
| **日期** | 2026-07-26 |

---

## 1. 一句話

對外顯示 **`ORD-0001`／`BK-0042`**；對內與金流仍用 **UUID**。商城 **checkout 進頁才鎖庫存**；ECPay **按一次**跳綠界。商品 **列表＋詳情** 顯示剩餘數量。

---

## 2. 與現況差異（實作時必改）

| 區域 | 現況 | 目標 |
|------|------|------|
| cart.js | 進頁 `createSession` | 僅 soft 驗量 |
| checkout.js | ECPay 兩段按鈕 | M2 一次跳轉 |
| booking-cart.js | 進頁 `createBooking` | 僅 soft 驗量 |
| booking-checkout.js | ECPay 無 contact body | O2 帶 contact |
| booking-success.html | 讀 `bookingNum` | 讀 `bookingId` + displayNo |
| formatters | UUID → 原樣顯示 | 讀 API `displayNo` |
| Admin booking API | 無 lineTotal／contact | 補齊 |

---

## 3. 實作批次建議

### 批次 A — Hotfix（無 migration）

- 成功頁 `bookingId` query
- Admin API `lineTotal`、history 中文 label
- Admin Modal 綁定修正

### 批次 B — displayNo

- DB migration + sequence + 回填
- 建單發號；API 增 `displayNo`
- 前後台 formatter

### 批次 C — B3 + M2

- 商城／租借鎖庫存時點
- ECPay 單次提交、按鈕文案 V2

### 批次 D — 庫存 UX + 會員帶入

- 列表／詳情「剩餘 N 件」
- 加購 D1+D2
- N3 自動帶入 + O2 contact

---

## 4. 驗收速查

見 spec **Testing Decisions** 與 `.scratch/.../spec.md` User Stories 1–20。

---

## 5. 相關契約

- [`checkout-api-contract.md`](../../api/checkout-api-contract.md)
- [`booking-api-contract.md`](../../api/booking-api-contract.md)
- [`admin-api-contract.md`](../../api/admin-api-contract.md)
- [`checkout/README.md`](../checkout/README.md)
