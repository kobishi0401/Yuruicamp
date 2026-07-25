# CheckoutPage 結帳頁規格

**狀態：** 已實作
**類別：** 頁面
**設計參考：** 無－依據既有原始檔 `pages/checkout.html` 整理

---

## 概覽

買家結帳流程頁面，包含買家資訊、物流、付款、折扣碼、購物車摘要與訂單確認功能。此頁只使用前一頁 `storefront/pages/cart.html` 已建立的 Draft Checkout Session。

`cart.html` 建立 Session 並鎖庫後，此頁以 `PATCH /api/checkout/sessions/{orderId}` 補齊配送、付款資料與 `couponClaimId`。頁面只以後端 `CheckoutSession.pricing` 顯示成交金額。

買家資訊、物流選擇與付款方式三個 `checkoutPanel` 進入頁面時預設全部展開；面板仍可由標題按鈕個別收合，`isOpen`、`aria-expanded` 與內容 `hidden` 狀態必須同步。

## TypeScript 介面

```typescript
export type PageShellVariant = "main" | "booking" | "admin";

export interface NavigationPayload {
  href: string;
  label: string;
  source: "CheckoutPage";
}

export interface UserSummary {
  id: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
}

export interface ContentBlock {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  href?: string;
}

export interface CheckoutPageData {
  title: string;
  sourcePath: "pages/checkout.html";
  keyAreas: string[];
  blocks?: ContentBlock[];
}

export interface CheckoutPageProps {
  // 必填 Props
  shell: "main"; // 此原始頁面所使用的頁面外殼類型。
  data: CheckoutPageData; // 初始頁面內容、資料紀錄或掛載區塊的中繼資料。

  // 選填 Props
  currentUser?: UserSummary | null; // 已登入使用者資訊。預設值：null
  loading?: boolean; // 顯示 Skeleton 或載入狀態。預設值：false
  errorMessage?: string | null; // 顯示給使用者的錯誤訊息。預設值：null

  // 事件處理函式
  onNavigate?: (payload: NavigationPayload) => void;
  onRefresh?: (sourcePath: "pages/checkout.html") => void;

  // Render Props／插槽
  headerSlot?: React.ReactNode;
  footerSlot?: React.ReactNode;
  actionSlot?: React.ReactNode;
}
```

## 版本狀態

| 版本    | Props                         | 說明                                                  |
| ------- | ----------------------------- | ----------------------------------------------------- |
| 預設    | `shell="main"`                | 符合目前 `pages/checkout.html` 的版面與共用 CSS。     |
| 載入中  | `loading={true}`              | 當資料或 partial 內容載入時，保持頁面 Skeleton 穩定。 |
| 空狀態  | `data.blocks=[]`              | 顯示有幫助的空狀態畫面，但不可讓頁面框架塌陷。        |
| 錯誤    | `errorMessage="..."`          | 顯示已在地化的錯誤訊息與重試途徑。                    |
| Draft   | `checkoutStep="draft"`        | 視為正常填表階段，不顯示資料不完整的 Session 面板。   |
| Ready   | `checkoutStep="ready_to_pay"` | 顯示後端 pricing 與 15 分倒數。                       |
| Expired | `CHECKOUT_EXPIRED`            | 停止倒數、清除 Session、顯示庫存已釋放並允許重建。    |

## 互動狀態

| 狀態     | 觸發條件                                   | 視覺變化                                                      |
| -------- | ------------------------------------------ | ------------------------------------------------------------- |
| 預設     | 頁面已載入                                 | 主要內容區以 Yuruicamp 綠色 Token 與既有間距呈現。            |
| Hover    | 卡片、資料列、分頁標籤或按鈕被滑鼠移入     | 改變邊框、陰影或背景，不可造成版面位移。                      |
| Active   | 已選取的分頁標籤、篩選器、導覽項目或表格列 | 使用 `--yc-sage-action` 或 `--yc-sage-soft`，並搭配文字標示。 |
| Disabled | 無法使用的操作或未完成的表單               | 降低透明度、禁止指標操作、保留元素尺寸。                      |
| 載入中   | `loading={true}`                           | 使用 Skeleton 列、停用送出按鈕或穩定的預留區塊。              |
| 錯誤     | 存在 `errorMessage`                        | 在失敗區域附近顯示行內警示，並在可行時提供重試操作。          |

## 設計 Token

```typescript
const spacing = {
  pagePadding: "clamp(24px, 5vw, 64px)",
  sectionGap: "24px",
  controlGap: "8px",
};

const typography = {
  bodyFontSize: "16px",
  bodyLineHeight: "1.5",
  headingWeight: "700",
};

const colors = {
  background: "var(--yc-bg)",
  surface: "var(--yc-surface)",
  text: "var(--yc-text)",
  mutedText: "var(--yc-text-muted)",
  border: "var(--yc-border)",
  focus: "var(--yc-sage-action)",
};
```

## 使用範例

### 基本用法

```tsx
<CheckoutPage
  shell="main"
  data={{
    title: "CheckoutPage",
    sourcePath: "pages/checkout.html",
    keyAreas:
      "buyerPanel, shippingPanel, paymentPanel, couponPanel, orderSummary".split(
        ", ",
      ),
  }}
/>
```

### 搭配選填 Props

```tsx
<CheckoutPage
  shell="main"
  data={checkoutpageData}
  currentUser={currentUser}
  loading={isLoading}
  errorMessage={errorMessage}
  onNavigate={(payload) => router.push(payload.href)}
  onRefresh={(sourcePath) => reloadPageData(sourcePath)}
/>
```

## 無障礙設計

- **角色：** 主要內容區使用 `main`；巢狀控制項應優先採用原生語意化 HTML 元素。
- **鍵盤操作：** Tab 順序必須符合視覺順序。Enter／Space 可觸發按鈕、分頁標籤、手風琴標題與資料列操作。
- **ARIA 屬性：** 目前導覽項目使用 `aria-current`；可收合面板使用 `aria-expanded`；錯誤訊息使用 `aria-describedby`。
- **焦點管理：** Modal 與 Offcanvas 面板開啟時必須鎖定焦點；關閉後必須將焦點返回原本的觸發元素。
- **螢幕閱讀器：** 必須以文字宣告頁面標題、載入／錯誤狀態、已選取篩選條件與狀態標籤。

## 實作說明

- 原始檔：`pages/checkout.html`。
- 共用 CSS 來源：`css/main.css`。
- 共用元件：`components/header.partial`、`components/footer.partial`。
- 關鍵 UI 區域：`buyerPanel`、`shippingPanel`、`paymentPanel`、`couponPanel`、`orderSummary`。
- 本頁不得呼叫 `API.checkout.createSession()`；沒有有效 Draft 時停用「確認結帳」，並要求返回確認背包。
- 「確認結帳」只對既有 Draft 呼叫 `API.checkout.updateSession()`；會員由 Bearer principal 決定，價格與快照由後端建立。
- `idempotencyKey` 使用 `crypto.randomUUID()`；網路重試與連點沿用同一 key，購物車變更、會員中心取消或逾時才清除。
- 頁面金額在送出前只是預估；建立成功後以 `CheckoutSession.pricing.subtotal`、`shippingFee`、`discount`、`total` 覆蓋摘要。
- Backend 模式不寫 `mockOrders`、不產生前端訂單 ID、不標記付款，也不把 CheckoutSession 當成 Legacy Order。
- 完整 Session 只暫存在 `sessionStorage.lastCheckoutSession`，供目前分頁重新整理時還原。
- 尚未送出的表單內容暫存在 `sessionStorage.checkoutFormDraft`，並綁定會員 ID、購物車指紋與訂單 ID；重新整理同一分頁時可還原姓名、手機、Email、備註、地址、配送／門市與付款選擇。
- 表單草稿不寫入 `localStorage`，也不保存卡號、到期日或 CVV；換會員、購物車內容改變、取消、逾時或完成訂單時必須清除。
- `ecpay-credit` 不收集或傳送卡號、到期日與 CVV，只顯示「下一步將前往 ECPay」；實際導向等待 I-7。
- Backend 模式由 `API.coupons.getMine()` 讀會員 claims；輸入尚未領取的有效活動碼時以 `API.coupons.claim(couponId)` 領券，再將唯一一張 `couponClaimId` PATCH 至既有 Session。
- `#checkoutCouponInput` 的 datalist 以公開可領券目錄交叉比對會員 claims，只列出尚未領取或狀態仍為 `claimed` 的券；`consumed`、`revoked`、`expired` 與本次已套用的券碼不出現在選項中。
- `#checkoutCouponInput` 使用 Checkout 專用欄位名稱並關閉瀏覽器 autocomplete，避免舊輸入紀錄（例如 `YURUI100`、`CAMP200`）混入 API 產生的 datalist；後台 `CAMP200` placeholder 保持不變。
- 套券成功後只使用 response `pricing.discount/total`；空 PATCH `{}` 清除訂單套券，但不刪除會員 claim 或退還發行名額。
- 確認結帳前會比對 `lastCheckoutSession.couponClaimId`；若與目前選券相同，只 PATCH 配送與付款資料，不重送 claim。只有 Session 尚未套用或使用者換券時才附上 `couponClaimId`。
- `COUPON_SOLD_OUT`、`COUPON_NOT_ELIGIBLE`、`COUPON_NOT_APPLICABLE`、`COUPON_ALREADY_USED`、`UNAUTHORIZED` 與 `CHECKOUT_EXPIRED` 必須顯示可理解的行內錯誤。
- `#confirmOrderBtn` 在 Draft 與 Ready 狀態都固定顯示「確認結帳」；Draft 只 PATCH 收件資料與付款方式，不重新建立訂單。
- Ready to pay 依後端 `checkoutExpiresAt` 每秒顯示 `mm:ss`，倒數歸零切換 Expired 並清除舊 Session。
- 本頁不提供 `#cancelCheckoutBtn`；待出貨且未付款的訂單改由會員中心訂單明細呼叫 `API.checkout.cancelSession()`。
- 庫存、逾時與系統錯誤以行內狀態面板呈現；資料不完整只用 toast 與紅色欄位提示，後端驗證錯誤依 `error.details[].field` 標記對應欄位。
- 頁首結帳流程使用圓形節點與連接線，已完成、目前與尚未完成狀態沿用 Booking 流程列的呈現方式。
- `STOCK_INSUFFICIENT` 明細顯示「商品名稱商品數量剩餘: N」，操作按鈕顯示「商品剩餘數量不足請重新調整數量」。
- 產生新 UI 前，必須先閱讀 `docs/ai-style-sheet.md` 與 `docs/ai-style-tokens.css`。
- 未解決問題：沒有提供 Figma 設計稿，因此既有程式碼是設計上的唯一依據。
- 實作本規格時，**不得**替換既有頁面外殼、storage key、mock data 資料契約，或 partial loader 的載入模式。

## 驗收標準

- [ ] 所有版本狀態都可正常渲染，且不會發生錯誤。
- [ ] 所有互動狀態在視覺上都有明確區別。
- [ ] 鍵盤導覽可正常使用。
- [ ] 螢幕閱讀器能正確宣告內容。
- [ ] 設計 Token 符合 Yuruicamp AI 樣式規範。
- [ ] 單元測試或 smoke test 已涵蓋必填 Props 與主要事件。
- [ ] `#confirmOrderBtn` 不呼叫建立 Session，只 PATCH 既有 Draft 或接續付款動作。
- [ ] 已套用優惠券後確認結帳，不會再次傳送相同的 `couponClaimId`。
- [ ] 同會員、同購物車與同一筆 Checkout Session 重新整理後可還原表單草稿；任一識別不符時不可套用舊草稿。
