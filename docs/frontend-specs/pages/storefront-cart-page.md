# StorefrontCartPage 確認購物背包規格

**狀態：** 已實作（B3 2026-07-26）  
**類別：** 頁面  
**來源：** `storefront/pages/cart.html`  
**ADR：** [`0002-checkout-stock-lock-at-entry.md`](../../adr/0002-checkout-stock-lock-at-entry.md)

## 概覽

商城商品詳情／共用購物背包 Drawer 與正式 Checkout 之間的確認頁。頁面沿用 Storefront header、footer 與 `--yc-*` 設計 token，顯示商品規格、數量、預估金額。

**不在此頁 hard lock 庫存**；僅 soft 驗量（讀 catalog `availableQuantity`）。

## 流程責任

1. 進入頁面後，依 `AppState.cart` 渲染項目；**不**呼叫 `POST /api/checkout/sessions`。
2. 調整數量時 soft 驗量；超量 Toast「僅剩 N 件」並阻擋。
3. 前往 `checkout.html` 前再跑一次 soft 驗量（K2）。
4. **Hard lock** 在 `checkout.html` 登入後由 `_initCheckoutSessionOnEntry` 建立 Session 並開始 15 分鐘倒數。
5. 結帳流程採圓形節點與連接線；商品數量可透過加減按鈕或數字輸入框調整。

## 狀態

| 狀態    | 呈現                         |
| ------- | ---------------------------- |
| Empty   | 引導回商品列表               |
| Ready   | 可前往結帳（尚未開始倒數）   |
| Warning | soft 驗量失敗，提示調整數量 |

## 驗收

- [x] 頁面不呼叫 `API.checkout.createSession`
- [x] 不含「15 分鐘庫存保留」類文案
- [x] 側欄／標題用語「購物背包」
- [x] 側欄不得出現「SSL 加密保護」或「安全付款」類空泛標語
