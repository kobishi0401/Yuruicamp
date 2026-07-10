## v1.3.76 - 2026/07/06

- 統一主站與 booking 的 `#personalizationModal`、`#surveyCloseConfirmModal` 樣式來源，booking components 入口改載主站 `modal` 與 `auth-modal` 基底。
- `booking/js/layout.js` 不再替偏好問卷與關閉確認視窗加入 `bookingAuth*` 視覺 class，只保留 `#loginModal` 的 booking 登入差異 class。
- 精簡 `booking/css/components/_booking-auth-modal.scss`，移除 booking 問卷、stepper、tag 與確認視窗覆寫，讓偏好問卷與確認視窗回到主站共用樣式。

## v1.3.75 - 2026/07/06

- 調整共用 `floatingLineBtn` hover 動畫：提示膠囊改從 icon 原位向左展開，符合 LINE 聯絡膠囊樣式。
- LINE icon 保持固定在右側原位，不再因 hover 動畫位移；提示文字以 `clip-path`、`opacity`、`transform` 顯示，避免改變 layout 寬度。
- 主站與 booking floatingActions 的 LINE 文字、title 與 aria-label 統一為「LINE 聯絡」，並同步重新編譯主站與 booking CSS。

## v1.3.74 - 2026/07/06

- 統一主站與 booking 的 floatingActions 元件：主站 `js/main.js` 改輸出 `floatingActions`、`floatingTopBtn`、`floatingLineLabel`、`floatingLineIcon` 等 camelCase selector。
- `css/components/widgets/_floating-actions.scss` 成為主站與 booking 共用的唯一 floatingActions 樣式來源，booking components 入口改為引用此 widgets partial。
- 刪除 booking 自有 `booking/css/components/_floating-actions.scss`，並重新編譯主站與 booking CSS 輸出，讓兩邊顯示同一套回頂部與 LINE 聯絡操作。

## v1.3.73 - 2026/07/06

- 調整主站共用登入 Modal 關閉防跳頂流程：`button.modalClose.sharedAuthClose` 關閉當下會重新記錄 scroll 位置，再關閉 Modal 並還原位置與觸發按鈕焦點。
- `button.siteCartButton` 開啟購物車 Drawer 時會記錄目前頁面位置，Drawer 聚焦關閉按鈕後會還原原本 scroll。
- `button.siteCartDrawerClose` 關閉購物車 Drawer 時會記錄關閉當下位置，關閉後以 `preventScroll` 回到原觸發按鈕，避免畫面跳至頂部。

## v1.3.72 - 2026/07/06

- 修復主站 Header 的 `siteMenuButton` 開啟 / 關閉 offcanvas 時可能跳回頁首的問題，開啟前會記錄 scroll 位置，關閉後還原位置並以 `preventScroll` 回焦點。
- 修復主站 Header 的 `siteLoginButton` 開啟 / 關閉登入 Modal 時可能改變瀏覽位置的問題，登入 Modal 的關閉按鈕、背景遮罩與 Esc 關閉都會保留原 scroll。
- `js/components/header.js` 新增 Header 互動層位置還原工具與中文區塊註解，避免共用 modal 關閉事件造成頁面位移。

## v1.3.71 - 2026/07/06

- 修復分店頁合作夥伴 Modal 關閉時跳回頁面頂部的問題：`partnerModalClose`、背景遮罩與 Esc 關閉都會保留開啟前的 scroll 位置。
- `js/pages/branches.js` 新增 partner modal 專用關閉流程，先攔截共用 modal 關閉事件，再呼叫 `closeModal()` 並於下一幀還原 scroll 與觸發按鈕 focus。
- 保留既有開啟 Modal 時的防跳頂邏輯，讓開啟與關閉流程都不改變使用者原本瀏覽位置。

## v1.3.70 - 2026/07/06

- 為商品詳情頁免運進度條新增動畫：註冊 `--shipping-progress-value` 為可動畫 percentage，讓深色填滿區在購物車增加、減少或清空時平滑推進 / 回退。
- 進度條仍使用既有 `shippingProgressValue0~100` class 與 `--yc-*` token，不新增 inline style 或新色碼。
- `prefers-reduced-motion` 會套用既有 reduced motion 規則，降低進度變化動畫時間。

## v1.3.69 - 2026/07/06

- 修正商品詳情頁免運進度條在畫面上未呈現「深色目前進度 + 淺色剩餘軌道」的問題。
- 不再依賴 native `<progress>` 的瀏覽器 pseudo element 來顯示填滿色，改由 `.shippingProgressBar` 本體背景搭配 `shippingProgressValue0~100` class 繪製進度比例。
- `<progress>` 仍保留 `value` 與 `aria-valuenow` 作為語意與無障礙狀態，視覺則由 SCSS 使用既有 `--yc-*` token 控制。

## v1.3.68 - 2026/07/06

- 依 `docs/ai-style-sheet.md` 使用既有 `--yc-*` token，為商品詳情頁免運進度條新增 `isEmpty`、`isInProgress`、`isComplete` 三種狀態。
- 未滿 100% 時以深色填滿目前進度、淺色軌道表示剩餘進度；達到 100% 後整條改為較淺完成色，讓使用者更直覺分辨剩餘進度與已達標狀態。
- 進度條狀態由 `_renderShippingProgress()` 統一切換，並補齊 `prefers-reduced-motion` 對進度條本體 transition 的處理。

## v1.3.67 - 2026/07/06

- 修正商品詳情頁免運進度條渲染：`#shippingProgressBar` 不再於購物車為空時使用假進度值，改與實際購物車小計計算出的百分比同步。
- 進度條同步更新 `value` 與 `aria-valuenow`，讓清空購物車、減少數量與移除商品後，視覺填滿比例、文字百分比與輔助資訊保持一致。

## v1.3.66 - 2026/07/06

- 新增主站購物車共用事件 `yurui:cart-changed`，在加入、移除、數量異動與清空購物車後統一廣播最新購物車狀態。
- `pages/product-detail.html` 的免運進度條現在會監聽購物車變更事件，清空購物車、減少商品數量或移除商品時會即時更新 `#shippingProgressBar`、百分比文字與免運提示。
- 事件 detail 會帶出購物車小計與商品總數，後續其他頁面若需要同步購物車衍生 UI，可共用同一個事件來源。

## v1.3.65 - 2026/07/06

- 依需求將商品列表頁廣告輪播改為完整 slides + 首尾 clone 架構，取代三張視窗式重建，避免動畫結束後畫面往前再往後固定。
- clone 邊界 reset 會在 `transitionend` 同一個渲染週期內關閉 transition、重設 transform、強制 reflow，下一幀才恢復 transition，讓跳回真實 slide 的動作不被畫出。
- 保留 timer/listener 清理、transition fallback 與圖片預載，避免偏好更新、transitionend 遺失或圖片延遲載入造成輪播卡住。

## v1.3.64 - 2026/07/06

- 強化商品列表頁廣告輪播狀態機：新增 `_cleanupAdCarousel()`，偏好更新後若沒有推薦商品會清除舊 timer、transition fallback 與事件監聽。
- `adCarouselContainer` 動畫啟動改用 double `requestAnimationFrame`，並補上 transition fallback timer，避免瀏覽器合併 layout 或 transitionend 遺失時讓輪播卡在 `isAnimating`。
- 三張視窗重建前會預載上一張、目前張與下一張圖片，降低重新渲染 slide 時短暫空白的機率。

## v1.3.63 - 2026/07/06

- 移除商品列表頁廣告輪播在 clone slide 後瞬間跳回第一張的重定位流程，避免無縫接軌後又出現可見回跳。
- `adCarouselContainer` 改為三張視窗式循環渲染：每次只渲染上一張、目前張、下一張，動畫結束後重建視窗並維持在中間位置。
- 自動播放、上一張 / 下一張與 dot 切換仍維持循環，但不再使用「跳回真實第一張」的 reset 行為。

## v1.3.62 - 2026/07/06

- 修復商品列表頁 `adCarouselContainer` 廣告輪播循環：改為首尾雙 clone，最後一張往第一張與第一張往最後一張都透過無動畫重定位完成，避免出現倒回式瞬間切換。
- `js/pages/product-list.js` 的輪播控制新增有界 index 與 `AbortController`，重新初始化偏好推薦輪播時會中止舊事件監聽，避免多次綁定後 index 持續位移到不存在的 slide。
- 自動輪播、上一張 / 下一張、dot 切換與點擊商品導頁共用同一套循環狀態，降低第十次切換後圖片全部消失的風險。

## v1.3.61 - 2026/07/06

- 依 `.agents/agents.md` 調整首頁 CTA token：`heroPrimaryLink` 改用 `--yc-cta` / `--yc-on-cta`，hover 改用 `--yc-cta-hover` / `--yc-on-cta-hover`。
- `heroSecondaryLink` 的 border 與文字同步改用 CTA token，hover 狀態改用 CTA hover token，維持透明背景不改動版面。
- `homeProductAddButton` 改用 CTA token 作為背景、邊線與文字色，並補上 `--yc-on-cta-hover` 至主站、booking 與 AI token 文件。

## v1.3.60 - 2026/07/06

- 將 `booking/booking-style-tokens.md` 的 booking token、互動規則、z-index、元件規則與 AI 檢查清單整併進 `docs/ai-style-sheet.md`，讓 AI 樣式規範成為單一 source of truth。
- 刪除已整併的 `booking/booking-style-tokens.md`，並更新 `docs/ai-style-tokens.css` 與 `plans/booking-itcss-scss-plan.md` 的現行參考路徑。
- `docs/ai-style-sheet.md` 的實作 prompt 改為要求閱讀 `docs/ai-style-sheet.md` 與 `docs/ai-style-tokens.css`，並明確禁止新增 `--bk-*` / `--yui-*` alias。

## v1.3.59 - 2026/07/04

- 第四輪殘留清理：將剩餘 `:first-child` / `:last-child` 結構 selector 改為相鄰兄弟 selector 或明確語意 class，降低清單尾端與 DOM 順序相依。
- 清理 booking button 殘留註解與重複 selector，並將 `transition: all` 改為明確 transition property，避免尺寸與 spacing 被動畫化。
- 更新 booking SCSS 入口與 settings 註解，不再描述相容 alias，維持 `--yc-*` 為唯一 runtime token source。

## v1.3.58 - 2026/07/04

- 第三輪殘留清理：移除 `css/settings/_tokens.scss` 與 `booking/css/settings/_tokens.scss` 中的 `--yui-*` / `--bk-*` 相容 alias，runtime token source 統一只保留 `--yc-*`。
- 更新 `booking/booking-style-tokens.md`、`docs/ai-style-tokens.css`、`docs/ai-style-sheet.md`、`docs/itcss-architecture.md` 與 `booking/css/semantic-selector-map.md`，不再把舊 alias 當成可用規格。
- 清理 `bookingToast` 動畫 keyframes 與 booking cart spec 的 `bk*` 文件殘留，讓新規範掃描聚焦在正式命名。

## v1.3.57 - 2026/07/04

- 第二輪殘留清理：`docs/frontend-specs` 與結帳成功頁內嵌腳本改用 `--yc-*` token，來源檔不再直接引用舊 `--yui-*`。
- 商品列表頁狀態 class 從 `active` 收斂為 `isSelected` / `isOpen`，並調整輪播指示器為固定尺寸，避免狀態切換造成版面位移。
- booking 表單、篩選 chip、價格滑桿與搜尋列補回透明 outline 加可見 focus ring；LINE、成功、表面白與刪除線色彩改為共用 token 引用。

## v1.3.56 - 2026/07/04

- 將主站與 booking 的設計 token source 統一到 `--yc-*`：`css/settings/_tokens.scss` 與 `booking/css/settings/_tokens.scss` 皆定義同一套 base、status、layout、typography、spacing、radius、shadow、motion 與 z-index token。
- 保留 `--yui-*` 與 `--bk-*` 相容 alias；主站 SCSS 使用點已從 `--yui-*` 逐步改為 `--yc-*`，舊 selector 仍可透過 alias 過渡。
- `booking/booking-style-tokens.md` 補齊 alias mapping，`docs/ai-style-tokens.css` 改為 alias 文件，`docs/ai-style-sheet.md` 與 `docs/itcss-architecture.md` 同步標明 `--yc-*` 為新的樣式規格來源。
- 驗證：`npm.cmd run stylelint`、`npx.cmd sass css/main.scss:css/main.css booking/css/booking-main.scss:booking/css/booking-main.css --style=expanded --source-map`、`npm.cmd run smoke`、`npm.cmd run build` 通過；dev server 在本環境可短暫回應 `/`，但後續頁面 HTTP 批次讀取時 port 未保持 listening，完整瀏覽器頁面 QA 未完成。

## v1.3.55 - 2026/07/03

- 租借頁靜態區塊補齊 base + Booking variant 雙 class：`summaryBar summaryBarBooking`、`recommendationBanner recommendationBannerBooking`、`rentalLayout rentalLayoutBooking`、`rentalCartSidebar rentalCartSidebarBooking` 等。
- `camp-rental.js` 產生的摘要分隔符與推薦橫幅內容同步改為 `summarySeparator*`、`recommendationBannerContent*`、`recommendationTag*` 語意命名，並保留既有 ID 作為資料與事件掛點。
- `booking/css/pages/_camp-rental.scss` 改由 `*Booking` selector 管理租借頁外殼、推薦橫幅、列表 grid、右側背包與略過連結，避免 page style 綁在可共用 base class 上。

## v1.3.54 - 2026/07/03

- 延續 booking 動態 HTML 語意化：營位卡片改為 `zoneCard zoneCardBooking`、`zoneCardInfo zoneCardInfoBooking` 等 base + Booking variant 雙 class，事件代理同步改抓 Booking 變體。
- 租借裝備卡片改為 `rentalItemCard*` 共通語意搭配 `rentalItemCard*Booking` 變體，並將 `rentalItemCardImg` / `rentalItemCardDesc` 收斂為較完整的 `Image` / `Description` 命名。
- 租借背包 empty state 與品項列改用 `rentalCartEmpty*`、`rentalCartItemName*`、`rentalCartItemPrice*`，SCSS 不再依賴 `span:first-child` / `span:nth-child(2)` 結構 selector。

## v1.3.53 - 2026/07/03

- 執行 booking 動態 HTML 語意化第一輪：`camp-detail.js` 的 `zoneSelectBtn` 改為 `zoneSelectButton zoneSelectButtonBooking`，`camp-rental.js` 的 `rentalAddBtn` / `rentalRemoveBtn` 改為 `rentalAddButton rentalAddButtonBooking` / `rentalRemoveButton rentalRemoveButtonBooking`。
- `booking/css/pages/_camp-detail.scss` 與 `_camp-rental.scss` 同步改用新 Button selector，並補上中文註解說明互動 hook 與操作責任。
- `camp-search.js` 動態營區卡片補齊 `campCard*` 共通語意與 `campCard*Booking` 變體 class，`_camp-search.scss` 改由 Booking 變體 selector 管理搜尋結果卡片視覺。

## v1.3.52 - 2026/07/03

- 將 booking header runtime ID 從 `bk*` 收斂為 `booking*` 語意命名：`bookingMenuButton`、`bookingOffcanvasPanel`、`bookingOffcanvasBackdrop`、`bookingCartButton` 與 `bookingPanelBackdrop`。
- `components/header.partial` 同步更新 `aria-controls` 與對應 ID，`booking/js/booking-header.js` 改用新 ID 查找側邊選單、預約背包面板與 backdrop。
- `booking-header.js` 在側邊選單與預約背包面板開關區塊補上中文註解，說明互動掛點與 header layer 狀態責任。

## v1.3.51 - 2026/07/03

- 清理 booking toast 舊相容命名：`booking-utils.js` 不再產生 `bkToast*` / `bkToast--type` class，統一輸出 `bookingToast`、`bookingToastInfo`、`bookingToastText`、`bookingToastClose` 等語意化 class。
- `booking/css/components/_booking-toast.scss` 移除 `#bkToastContainer`、`.bkToast*`、`.bkToastAction*` 相容 selector，只保留 `bookingToast*` 正式命名與中文區塊註解。
- 保留確認型 toast 的 `bookingToastConfirm` / `bookingToastActions` / `bookingToastAction*` 樣式作為共用操作型通知能力，但不再提供舊 `bkToast*` alias。

## v1.3.50 - 2026/07/03

- 將 booking 預約背包頁剩餘 `#bk*` ID 掛點改為 `#bookingCart*` 語意命名，例如 `bookingCartContent`、`bookingCartStayBody`、`bookingCartCostRows` 與 `bookingCartCheckoutButton`。
- `booking-cart.js` 同步改用新 ID selector，保留既有 localStorage、數量調整、刪除裝備與費用重算流程不變。
- `booking/css/pages/_booking-cart.scss` 移除 `#bkRentalCard + div` 結構相依 selector，新增 `cartClearAction cartClearActionBooking`，讓清除背包操作列有明確語意與中文註解。

## v1.3.49 - 2026/07/03

- 將 booking 結帳頁延續預約背包頁的語意化命名規則：`bkCheckout*`、`bkPanel*`、`bkSummaryCard`、`bkLoginNotice*` 改為 `checkout*` / `summaryCard*` / `loginNotice*` 共通語意加 `*Booking` 變體 class。
- `booking-checkout.html` 的頁面根 class 從 `bookingCartPage` 分離為 `bookingCheckoutPage`，避免結帳頁繼續借用背包頁語意；既有表單與流程 ID 保留作為 JS 掛點。
- `booking-checkout.js` 的手風琴事件代理改用 `checkoutPanelHeaderBooking`、`checkoutPanelBooking` 與 `checkoutPanelBodyBooking`，並在 SCSS 補上中文區塊註解說明 layout、panel、summary、login notice 與送出區責任。

## v1.3.48 - 2026/07/03

- 將 booking 預約背包頁作為語意化命名樣板：HTML、SCSS 與 JS 產生內容改用 `cart*` / `quantity*` 共通語意加上 `*Booking` 變體 class，例如 `cartItem cartItemBooking`、`quantityButton quantityButtonBooking`。
- 保留 `#bk*` ID 作為既有 JS 掛點，避免本輪命名收斂牽動 localStorage 與頁面流程；樣式與事件代理已不再依賴舊 `.bkCart*` / `.bkQty*` / `.bkRentalRemove` class。
- `booking/css/pages/_booking-cart.scss` 補上中文區塊註解，說明 cart layout、項目列、數量調整器、摘要欄與空狀態的責任邊界，供後續 booking checkout / rental 頁面套用同一命名規則。

## v1.3.47 - 2026/07/03

- 清理 booking CSS token fallback：`rental-guide`、`booking-faq`、租借、購物車與結帳頁面改用既有 `--yc-*` / `--bk-*` token，移除可替代的 `var(..., #fallback)` 與一般白色硬碼。
- Toast 與 tag/status 元件改用既有陰影、深色文字與 `color-mix()` token 表達，移除未使用的 `.bkToastInfo` / `.bkToastWarning` / `.bkToastError` / `.bkToastSuccess` 舊狀態 selector。
- 保留 LINE Pay 外部品牌綠並加上中文註解，避免把第三方品牌識別色誤併入 booking 設計 token。

## v1.3.46 - 2026/07/03

- 精修 booking ITCSS：移除已不再匯入的 `booking/css/objects/_layout.scss`、`_booking-layout.scss` 與 `utilities/_utilities.scss`，objects 層保留為低語意 layout object 的入口說明。
- 將 booking 跨頁懸浮操作移入 `booking/css/components/_floating-actions.scss`，搜尋頁 hero 樣式移入 `booking/css/pages/_camp-search.scss`，避免 component/page 樣式留在 objects 層。
- Toast 樣式與 `booking-utils.js` 改採 `bookingToast*` 新命名，同時保留舊 `bkToast*` / `bkToast--type` 相容 class，修正原本 JS type class 與 CSS 狀態 selector 不一致的問題。

## v1.3.45 - 2026/07/03

- 依 booking CSS ITCSS 收斂計畫，將 `searchPage`、`detailPage`、`rentalPage`、`bookingCartPage` 與對應 layout grid 從 objects 層移回 pages 層，objects barrel 只載入低語意版面結構。
- `booking/css/components/_modal.scss` 改載主站 modal 共用骨架，`booking-auth-modal` 保留 booking 登入側滑、OAuth 與偏好問卷差異，並移除未被 runtime 使用的 legacy OAuth / personalization selector。
- 將 booking tag/status token 從 component 上移到 `booking/css/settings/_tokens.scss`，並把唯一 `.srOnly` helper 收斂至 generic reset，booking 入口不再額外載入 utilities 層。

## v1.3.44 - 2026/07/03

- 依 `.agents/agents.md` 收斂主站與 booking 的 header/footer 樣式來源：booking header、footer、drawer 改為載入主站共用 widgets / drawer / offcanvas / cart-drawer 骨架，內容仍由 `data-layout-part` 各自分流。
- `booking/css/settings/_tokens.scss` 新增 `--yui-*` 相容 alias，對應既有 `--yc-*` token，讓共用樣式在 booking runtime 可直接使用而不新增色碼、字體或間距系統。
- 清除 booking header/footer/drawer 內未被 runtime 使用的舊 `.bk*` / `.bkFooter*` 相容樣式，保留 `#bkHamburger`、`#bkCartBtn` 等 booking JS 既有功能 hook。

## v1.3.43 - 2026/07/03

- 依 `.agents/agents.md` 完成 booking ITCSS 歸層審查：將搜尋、詳情、結帳支援、裝備租借等單頁 selector 從 `booking/css/components/` 移入 `booking/css/pages/`，並新增 `booking/css/pages/_camp-rental.scss`。
- 刪除未被 booking runtime HTML/JS 引用的 legacy CSS source：`booking/css/base.css` 與 `booking/css/booking.css`；公開頁維持載入 Sass 編譯輸出 `booking/css/booking-main.css`。
- 確認 `--yc-*` 仍為 booking token source of truth、`--bk-*` 只作相容 alias，並同步更新 `docs/itcss-architecture.md`、`plans/booking-itcss-scss-plan.md` 與 README 的 booking CSS 架構描述。

## v1.3.42 - 2026/07/03

- 會員中心保留主站與 booking 兩個入口 shell：主站入口載入主站 header/footer，booking 入口載入 booking header/footer，兩邊共用 `components/member-center.partial`、`js/components/member-center.js` 與主站會員中心樣式。
- 主站與 booking header 的會員中心連結會帶入安全的 `returnTo` 參數，會員中心「返回首頁」會回到各自來源頁；若來源不在允許範圍內則回主站 `home.html` 或 booking `camp-search.html`。
- 依 `.agents/agents.md` 將會員中心樣式收斂為主站唯一來源：`pages/member-center.html` 只載入 `css/main.css`，共用會員中心 partial 補上 `.memberCenterPage` 頁面根 class，booking 入口改為載入主站會員中心樣式與 booking 自身 header/footer。
- 刪除 booking 專用會員中心樣式入口 `booking/css/member-center-main.scss`、`booking/css/member-center-main.css` 與 `booking/css/pages/_member-center.scss`；後續會員中心樣式統一從 `css/pages/_member-center.scss` 維護。
- 更新 `docs/itcss-architecture.md`、`plans/booking-itcss-scss-plan.md` 與 `package.json`，移除 booking 會員中心獨立 Sass 入口與格式化範圍中的已刪除 CSS 輸出。

## v1.3.41 - 2026/07/03

- 依 `.agents/agents.md` 產出 `plans/booking-itcss-scss-plan.md`，整理 booking CSS 漸進轉為 SCSS ITCSS 的分層目標、檔案遷移順序、命名轉換策略、編譯方式與驗收清單。
- 新增 `booking/css/booking-main.scss` 與 `booking/css/member-center-main.scss`，並建立 settings、generic、elements、objects、components、pages、overrides、utilities 的 SCSS partial；舊平面 CSS source 已移除，Sass 編譯後仍輸出既有 `booking-main.css` 與 `member-center-main.css`，保持 HTML 載入路徑相容。
- 同步將 booking 自有 class/id 改為語意化 camelCase，並修正 shared booking header/footer partial 載入、移除 booking JS inline style 寫法、補上全域 `:focus-visible` 保底；外部 Bootstrap Icons / Flatpickr 類別保留原名。
- `package.json` 的 stylelint 範圍改為檢查主站與 booking 的 SCSS source，`format` 收斂為 booking code 與本輪更新文件範圍，另保留 `format:all` 作為全專案格式檢查；驗證已通過 bundled Node 執行的 Sass 編譯、SCSS stylelint、booking 範圍 Prettier、Vite build，以及 8 個 booking 頁面在 375/768/1024/1440 viewport 無水平捲動。

## v1.3.40 - 2026/07/02

- 依 `.agents/AGENTS.md` 調整共用登入 Modal：`#loginModal` 改為右側滑出視窗並放大至視窗高度，社群登入按鈕補齊垂直間距，Facebook 使用既有 info token 混合淺藍底，LINE 使用 `--yui-success` 背景。
- 本輪遵守限制未修改 JS；`siteMenuButton` 與 `siteCartButton` 既有 HTML 已是 `type="button"`，保留原本彈出視窗方式。

## v1.3.39 - 2026/07/02

- 依 `.agents/AGENTS.md` 整理 `js/components/member-center.js`：使用 Prettier 展開壓縮式單行程式，補齊函式間空行、縮排與中文用途註解，並將折價券與通知 HTML 字串拆成逐標籤換行。
- 本輪未修改會員中心功能邏輯；驗證已通過 `node --check js/components/member-center.js`，並確認沒有 140 字以上長行。

## v1.3.31 - 2026/06/30

- 依 `.agents/agents.md` 補齊本輪 CSS 細節：商品詳情頁籤列移除右側橫向捲動，會員中心 header 品牌字體避開 booking @font-face 覆蓋，並讓浮動回頂部按鈕維持橘色 48px 共用樣式。
- 依 `.agents/agents.md` 調整前台 CSS 細節：商品詳情主內容補左右留白、header 品牌 logo 與 Yuruicamp 文字放大、全站連結 hover 改為不顯示底線、會員中心訂單明細 Modal 美化，並統一浮動回頂部按鈕 icon 尺寸。
- 修復 shared header 登入互動：主站 `_header.scss` 補齊共用 modal 基礎樣式，`js/main.js` 與 `booking/js/layout.js` 在 shared-auth 注入後載入 `modal.js`，恢復登入、社群登入、個人化問卷與會員下拉選單初始化順序。
- 修復 header 登入按鈕顯示狀態：`isLoggedIn` 為 true 時隱藏 `.siteLoginButton`，並顯示 `.siteUserMenu`；未登入時恢復登入按鈕既有 `inline-flex` 顯示，避免與會員選單同時出現。
- 修復前台共用 UI：浮動回頂部 / LINE 按鈕改用 token 圓形固定樣式，合作夥伴 modal 開啟時不再捲到頁首，商品詳情頁加入購物車與直接購買按鈕同步商品列表 CTA 視覺。
- 修復 `.agents/agents.md` 指定的前台細節：共用 header 改由掛載點維持 sticky、品牌 Logo 置中、會員下拉與購物車 badge 改成可見狀態才套用 display、購物車移除改垃圾桶 SVG、商品數量與 checkout CTA 套用 token 按鈕樣式，並補齊 checkout-success header icon 樣式來源。
- 依 `.agents/agents.md` 補齊新版 `header.partial` 互動：`js/main.js` 在 partial 注入後一律執行可重複的 header / modal / cart 初始化，`js/components/header.js` 改用現有 `keyword` 搜尋導頁、維持搜尋下拉隱藏並同步登入狀態與會員選單。
- `pages/products.html`、`js/pages/product-list.js` 與商品頁 SCSS 新增 `keyword` 搜尋結果、0.1 顆星裁切評分、廣告輪播複製首張後無縫回跳、手機篩選按鈕共用商品 CTA 視覺與價格欄位 `step="100"`。
- `pages/home.html` 相關首頁邏輯與 SCSS 補上 0.1 顆星裁切、品牌跑馬燈維持兩組品牌無限捲動、商品卡 hover 改為整卡平滑微放大 / 上移 / 加深陰影，並調整服務特色標題顯示。
- 驗證：`cmd /c "cd /d D:\GithubDesk\Yuruicamp\css && npx sass main.scss:main.css"`、受控啟動 `cmd /c "npx sass --watch main.scss:main.css"`、`node --check` 已針對 `header.js`、`home.js`、`product-list.js` 通過；`--watch` 程序已停止。

## v1.3.27 - 2026/06/30

- 重構共用 `components/header.partial` 與 `components/footer.partial`，保留 `data-layout-part`、指定 `id`、共用登入 modal、購物車 drawer、booking header/footer 入口，並將 header/footer 相關 class 統一為 camelCase。
- 更新 `js/components/header.js`、`js/components/cart.js`、`js/components/modal.js`、`booking/js/booking-header.js`，把 offcanvas、搜尋層、使用者選單、cart drawer、booking panel 與 shared modal 狀態統一為 `.isOpen` / `.isVisible` / `.isSelected`。
- 重寫 `css/components/content/pages/_header.scss` 與 `_footer.scss`，改用 `--yui-*` token，移除 header/footer 範圍內的 `.btn`、`.container`、BEM、migrated 與 `.active` 依賴；同步補上 booking 頁面載入的 `booking/css/booking.css` 相容樣式。
- 驗證：`node --check`、ESLint、Stylelint、`npm.cmd run build` 通過；build 仍保留既有非 module script 與 Sass deprecation 警告。

# Yuruicamp 露營選物品牌網站

> 探索戶外，從這裡開始 🏕️

## 📋 專案概述

Yuruicamp 是一個完整的露營選物電商網站前端實現，包含 `pages/` 下 **11 個**買家功能頁面、Mock API 層、完整 RWD 響應式設計，以及一套獨立的**賣家管理後台**（含員工 ID 登入、**九大管理模組**、逐頁 view/edit 權限、圖表儀表板）。

**開發目標**：能跑 → 看懂 → 好改 → 效能，按此優先順序逐步實現。

**技術棧**：

| 技術                                             | 用途                                 |
| ------------------------------------------------ | ------------------------------------ |
| HTML5                                            | 語義化頁面結構                       |
| SCSS / CSS3                                      | 買家前台樣式系統、約 4900 行完整 CSS |
| Vanilla JavaScript                               | 買家前台頁面互動邏輯（無框架依賴）   |
| Vite + Sass                                      | SCSS 編譯、多頁面建置、資產壓縮      |
| ESLint + Prettier + Stylelint                    | JS / HTML / CSS / SCSS 基礎品質檢查  |
| Bootstrap 5 + jQuery 3 + Chart.js                | 賣家後台 UI 框架、圖表視覺化         |
| Mock API（localStorage / sessionStorage + JSON） | 模擬前後台資料，預留真實 API 接入點  |
| Git                                              | 版本控制                             |

**建置狀態**：✅ 買家前台 14 階段完成 + 賣家後台 9 模組完成（2026/06/15，含租借多營地庫存與異動員工 ID）+ 預約子系統 6 頁面完成（2026/06/12）

---

## 📁 目錄結構

```
Yuruicamp/
├── package.json                  # Vite、lint、format、stylelint、smoke test 指令
├── vite.config.js                # Vite 多頁面建置與 SCSS entry 設定
├── eslint.config.js              # ESLint flat config
├── stylelint.config.cjs          # Stylelint SCSS/CSS 規則
├── .prettierrc.json              # Prettier 格式設定
├── src/
│   └── styles.js                 # Vite SCSS 編譯入口（import css/main.scss）
├── tests/
│   └── smoke.mjs                 # 基礎結構與共用 runtime smoke test
│
├── index.html                    # 品牌入口頁（重定向至 home）
│
├── admin/                        # ⭐ 賣家管理後台（完全獨立模組）
│   ├── login.html                # 後台登入頁（員工 ID 驗證 → sessionStorage）
│   ├── dashboard.html            # 後台主框架（Sidebar + Topbar + 動態內容區 + 新增商品 Modal）
│   ├── css/
│   │   └── admin.css             # 後台專屬樣式（炭黑 Sidebar + 品牌深青綠 Accent）
│   ├── js/
│   │   ├── permissions.js        # 權限管理：員工資料層（localStorage）+ ADMIN_SECTIONS 定義
│   │   ├── core.js               # Auth 守衛、權限 helper、loadSection()、showAdminToast()
│   │   ├── analytics.js          # 數據總覽：KPI 計算、Chart.js 折線圖 + 甜甜圈圖
│   │   ├── orders.js             # 訂單管理：表格、篩選、出貨操作、詳情 Modal
│   │   ├── movement.js           # 庫存異動紀錄：配送店 / 接收店 / 負責員工 ID 異動表格
│   │   ├── products.js           # 商品管理：商店 / 租借頁籤、庫存編輯、多營地租借庫存、新增 Modal
│   │   ├── customers.js          # 會員管理：Accordion、等級/點數/優惠券編輯
│   │   ├── discounts.js          # 折扣管理：優惠券 CRUD、隨機碼產生
│   │   ├── reviews.js            # 評論管理：評論卡片、星等篩選、回覆功能
│   │   └── bookings.js           # 預約/租借管理：預約單表格、確認/取消/完成
│   ├── partials/                 # 九個功能模組的 HTML 片段（由 core.js 動態載入）
│   │   ├── analytics.html        # 數據總覽版面（KPI 卡 + 圖表 canvas）
│   │   ├── orders.html           # 訂單管理版面
│   │   ├── movement.html         # 庫存異動紀錄版面
│   │   ├── products.html         # 商品管理版面
│   │   ├── customers.html        # 會員管理版面
│   │   ├── discounts.html        # 折扣管理版面
│   │   ├── reviews.html          # 評論管理版面
│   │   ├── bookings.html         # 預約/租借管理版面
│   │   └── permissions.html      # 權限管理版面
│   └── data/                     # 後台專用 Mock 靜態資料（與買家端 data/ 分離）
│       ├── orders.json           # 6 筆訂單（含出貨狀態、付款狀態、品項明細）
│       ├── movement.json         # 20 筆庫存異動主檔（含負責員工 ID 與異動明細清單）
│       ├── products.json         # 10 筆商品（含 total-stock 與 branch 分店庫存）
│       ├── reantal.json          # 20 筆租借商品（camp 陣列保存 2~5 個營地與各自數量）
│       ├── customers.json        # 6 位會員（含等級、點數、優惠券）
│       ├── coupons.json          # 5 張優惠券（含啟用/停用狀態）
│       ├── reviews.json          # 5 則評論（含回覆狀態）
│       └── bookings.json         # 10 筆預約單（含付款/預約狀態、營位與租借明細）
│
├── booking/                      # ⭐ 營地預約子系統（完全獨立模組）
│   ├── camp-search.html          # 營區搜尋與列表頁
│   ├── camp-detail.html          # 營區詳情與預約頁
│   ├── camp-rental.html          # 裝備租借頁
│   ├── booking-cart.html         # 預約購物車與結帳頁
│   ├── rental-guide.html         # 租借體驗說明頁
│   ├── booking-faq.html          # 預約系統專屬 FAQ
│   ├── components/
│   │   ├── booking-header.partial # 已整合至 /components/header.partial 的 booking-header 區塊
│   │   └── booking-footer.partial # 已整合至 /components/footer.partial 的 booking-footer 區塊
│   ├── css/
│   │   ├── booking-main.scss     # 預約系統 SCSS ITCSS 入口
│   │   ├── booking-main.css      # 預約系統公開頁編譯輸出
│   │   ├── settings/             # booking token 與相容 alias
│   │   ├── generic/              # reset 與 motion helper
│   │   ├── elements/             # 原生元素基底
│   │   ├── objects/              # booking layout objects
│   │   ├── components/           # booking 跨頁可重用元件
│   │   ├── pages/                # booking 單頁流程樣式
│   │   ├── overrides/            # 第三方套件覆寫
│   │   └── utilities/            # 輔助工具樣式
│   ├── js/
│   │   ├── booking-header.js     # Badge 動態更新、登入狀態判斷
│   │   ├── booking-cart.js       # 結帳頁邏輯
│   │   ├── camp-search.js        # 搜尋篩選邏輯
│   │   ├── camp-detail.js        # 日期選擇 + 庫存連動
│   │   └── camp-rental.js        # 裝備推薦 + 租借計費
│   └── data/                     # 預約系統專用 Mock 靜態資料（與買家端 data/ 分離）
│       ├── campgrounds.json      # 8 筆營區資料（含 zones 營位定價）
│       └── rentals.json          # 8 筆租借裝備資料（依 campground_id 分組）
│
├── css/
│   ├── variables.scss            # 色彩、字體、間距變量系統
│   ├── base.scss                 # CSS Reset + 全局樣式
│   ├── components.scss           # 可重用元件樣式
│   ├── layout.scss               # 佈局 + Grid 系統
│   ├── main.scss                 # SCSS 入口（引入上述四個檔案）
│   └── main.css                  # ⭐ 編譯後主樣式（約 4900 行，包含 RWD + 瀏覽器相容）
│
├── js/
│   ├── config.js                 # 全局配置（AppConfig）
│   ├── storage.js                # localStorage JSON 讀寫與指定 key 清理
│   ├── state.js                  # AppState、saveAppState、logout、resetAppState
│   ├── formatters.js             # formatCurrency、formatDate、debounce、throttle 等工具
│   ├── validators.js             # Email / phone 驗證
│   ├── cart-service.js           # 購物車小計與運費計算
│   ├── api-mock.js               # Mock API 層（window.API，預留後端接入點）
│   ├── main.js                   # 單一 initApp 入口、共用 partial 載入、Scroll Lock
│   ├── components/               # 可跨頁面複用的 UI 元件
│   │   ├── header.js             # 導航欄（PC + Offcanvas 手機版）
│   │   ├── modal.js              # Modal（登入 + 個人化問卷 Stepper）
│   │   ├── cart.js               # 共用右側購物車 Drawer、Badge、localStorage cart
│   │   ├── toast.js              # Toast 提示工廠函數
│   │   ├── carousel.js           # 品牌輪播（CSS animation）
│   │   └── filter.js             # 商品篩選（CustomEvent 驅動）
│   └── pages/                    # 各頁面獨立邏輯
│       ├── home.js               # 首頁：精選商品渲染、加入購物車
│       ├── product-list.js       # 商品列表：網格渲染、分頁
│       ├── product-detail.js     # 商品詳情：圖集、規格、數量 Stepper
│       ├── checkout.js           # 結帳：手風琴表單、運費計算
│       ├── member-center.js      # 會員中心：訂單/評價/折價券/通知
│       ├── blog.js               # 部落格列表：文章動態渲染
│       ├── blog-detail.js        # 文章詳情：內嵌商品導購卡片
│       ├── branches.js           # 分店：地圖 iframe 切換、合作店家 Modal
│       └── faq.js                # FAQ：Accordion + NPS 問卷
│
├── data/                         # Mock 靜態資料（JSON）
│   ├── products.json             # 50+ 商品資料
│   ├── users.json                # 模擬用戶資料
│   ├── orders.json               # 訂單資料
│   ├── rentalOrders.json         # 租借訂單資料
│   ├── articles.json             # 部落格文章
│   └── branches.json             # 分店 + 合作店家
│
├── pages/                        # 買家前台功能頁面（11 個）
│   ├── home.html                 # 首頁
│   ├── products.html             # 商品列表
│   ├── product-detail.html       # 商品詳情
│   ├── checkout.html             # 結帳
│   ├── checkout-success.html     # 結帳成功
│   ├── member-center.html        # 會員中心
│   ├── blog.html                 # 部落格列表
│   ├── blog-detail.html          # 文章詳情
│   ├── branches.html             # 分店地圖
│   └── faq.html                  # 常見問題
│
├── components/                   # 可重用 HTML 片段（靜態範本）
│   ├── header.partial             # 主站 / booking 共用 Header fragment，由載入端依 data-layout-part 選取
│   └── footer.partial             # 主站 / booking 共用 Footer fragment，由載入端依 data-layout-part 選取
│
├── assets/
│   └── images/                   # 靜態圖片資源（brand_icon.png 等）
│
├── color/
│   └── color.md                  # 品牌色彩規範文件
│
├── plans/
│   ├── pageForBuyer.md              # 買家前台規劃文件（14 階段 + 驗證紀錄）
│   ├── pageForSeller.md             # 賣家後台規劃文件（後台設計規格書）
│   ├── pageForBooking.md            # 預約子系統規格書（SDD v1.0.0）
│   ├── bookingHeaderFooterUpdate.md # 預約 Header/Footer 前端規格書
│   ├── adminBooking.md              # 後台預約/租借管理模組任務清單
│   └── adminPermissions.md          # 後台權限管理 SDD（員工 + 逐頁權限）
│
├── thoughts/                     # 開發思考筆記（buyer.md、seller.md）
├── README.md                     # 此文件（專案說明，給外部人看）
├── userguide.md                  # 開發者工作手冊（改檔案時查表用）
├── changelog.md                  # 版本異動紀錄
└── .gitignore
```

---

## 🚀 快速開始

### 環境要求

- 現代瀏覽器：Chrome 90+ / Firefox 88+ / Safari 14+ / Edge 90+
- Node.js 18+（使用 Vite、Sass、lint、smoke test）
- 本地 Web 伺服器（避免 CORS 問題，因為有 fetch JSON 資料）

### 啟動方式

**方式 1：Vite（推薦）**

```bash
cd Yuruicamp
npm install
npm run dev
# 瀏覽器開啟 Vite 顯示的 localhost URL
```

**常用品質檢查**

```bash
npm run smoke      # 基礎結構與共用 runtime 檢查
npm run lint       # ESLint 檢查 JS
npm run format     # Prettier 檢查格式
npm run stylelint  # Stylelint 檢查 CSS / SCSS
npm run build      # Vite 多頁面建置與資產壓縮
```

> Vite 透過 `src/styles.js` 匯入 `css/main.scss`，負責 SCSS 編譯與 build 階段資產最佳化；既有 `css/main.css` 保留作為非 Vite 靜態伺服器 fallback。

**方式 2：VS Code Live Server**

安裝 [Live Server 擴充套件](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer)，在根目錄右鍵 → Open with Live Server。

> 共用 Header / Footer 片段使用 `.partial` 副檔名，而不是 `.html`。這是為了避免 Live Server 對 HTML fragment 注入 live reload script，造成像 `components/header` 這類被 `fetch()` 載入的片段 response 截斷。

**方式 3：Python 3**

```bash
cd Yuruicamp
python -m http.server 8000
# 瀏覽器開啟 http://localhost:8000
```

**方式 4：Node.js 靜態伺服器**

```bash
npx http-server -p 8000
# 瀏覽器開啟 http://localhost:8000
```

### 首次使用建議路徑

**買家前台（購物流程）**

```
入口頁 → index.html
首頁   → pages/home.html
商品   → pages/products.html → pages/product-detail.html
購物   → 任一主站頁右上角購物車 Drawer → pages/checkout.html → pages/checkout-success.html
會員   → pages/member-center.html
內容   → pages/blog.html → pages/blog-detail.html
分店   → pages/branches.html
服務   → pages/faq.html
```

**賣家後台（管理流程）** — 詳見 [userguide.md 第 13 節](userguide.md#13-賣家後台--admin)

```
登入   → admin/login.html（Demo 員工 ID：01 老闆 / 02 員工，密碼任意非空）
後台   → admin/dashboard.html（預設載入第一個有 view 權限的模組）
         ├── 分析報表      ← Sidebar「分析報表」
         ├── 訂單管理      ← Sidebar「訂單管理」
         ├── 庫存異動紀錄  ← Sidebar「庫存異動紀錄」
         ├── 商品與庫存    ← Sidebar「商品與庫存」
         ├── 客戶管理      ← Sidebar「客戶管理」
         ├── 折扣管理      ← Sidebar「折扣管理」
         ├── 評論管理      ← Sidebar「評論管理」
         ├── 預約/租借管理 ← Sidebar「預約/租借管理」
         └── 權限管理      ← Sidebar「權限管理」
登出   → Sidebar 底部或 Topbar 頭像 → 登出（清除 5 個 sessionStorage key，返回登入頁）
```

> 💡 後台登入狀態用 `sessionStorage`（5 個 key）；員工主檔用 `localStorage.adminEmployees`。關閉分頁後 session 自動清除，不影響買家前台的 `localStorage`。

**預約系統（預約流程）**

```
搜尋   → booking/camp-search.html（篩選地區、環境、設施）
詳情   → booking/camp-detail.html（選日期、選營位類型，寫入 localStorage.bookingCart）
租借   → booking/camp-rental.html（加選裝備，更新 bookingCart）
結帳   → booking/booking-cart.html（確認明細、填聯絡資訊、送出預約）
說明   → booking/rental-guide.html（租借流程圖文說明）
FAQ    → booking/booking-faq.html（預約與退款常見問題）
```

> 💡 預約系統使用獨立的 `localStorage.bookingCart` 儲存跨頁資料，與電商購物車的 `localStorage.cart` 完全分離，互不干擾。

---

## 🎨 設計系統

### 色彩規範

| 用途           | 色碼      | 預覽               |
| -------------- | --------- | ------------------ |
| 主色 Primary   | `#244d4d` | 深青綠（品牌主軸） |
| 副色 Secondary | `#779999` | 淺青灰綠           |
| 成功 Success   | `#4caf50` | 綠色               |
| 危險 Danger    | `#d32f2f` | 紅色               |
| 輕背景         | `#f6fbf6` | 淺綠底             |
| 深 Hover       | `#316868` | 按鈕懸停           |

所有色彩定義於 `css/variables.scss`，並由 `main.css` 的 CSS Custom Properties 引入。

> 💡 **預約子系統色彩差異**：預約端 Header 背景使用 booking token，並由 `booking/css/settings/_tokens.scss` 管理 `--yc-*` source of truth 與 `--bk-*` 相容 alias；公開頁載入編譯後的 `booking/css/booking-main.css`。

### 響應式斷點（RWD）

| 斷點 | 寬度        | 目標裝置                |
| ---- | ----------- | ----------------------- |
| xs   | < 576px     | iPhone SE、小型 Android |
| sm   | 576–767px   | 大型手機                |
| md   | 768–991px   | iPad 直式               |
| lg   | 992–1199px  | iPad 橫式、筆電         |
| xl   | 1200–1399px | 桌上型電腦              |
| xxl  | ≥ 1400px    | 大型螢幕                |

**手機版特別處理**：

- Touch Target ≥ 44px（符合 Apple HIG 與 Material Design 規範）
- `input` / `select` 強制 `font-size: 16px` 避免 iOS Safari 頁面縮放
- Safe Area Inset 支援（iPhone 有 Home Bar 機型）
- Offcanvas 開啟時鎖定 body 捲動（iOS Safari 適配）
- Navbar Offcanvas 從左側滑入（`.navbar-offcanvas` 補齊 `position:fixed; transform:translateX(-100%)`，預設隱藏，點漢堡☰後滑入）

---

## 🔧 全局 API 速查

### 應用狀態（`js/state.js`）

```javascript
// 讀取
window.AppState.isLoggedIn; // Boolean - 是否已登入
window.AppState.currentUser; // Object  - 當前用戶資料
window.AppState.cart; // Array   - 購物車商品列表
window.AppState.preferences; // Object  - 個人化喜好

// 持久化（寫入 localStorage）
window.saveAppState();

// 重置（只清除 Yuruicamp 已知狀態 key，不清空同網域其他資料）
window.resetAppState();
```

### Mock API（`window.API`）

```javascript
// 商品
await window.API.products.getAll(filters); // 取得商品列表（支援篩選）
await window.API.products.getById(productId); // 取得單一商品詳情

// 用戶
await window.API.users.login(email, password); // 模擬登入
await window.API.users.getProfile(userId); // 取得用戶資料

// 訂單
await window.API.orders.getAll(userId); // 取得用戶訂單列表
await window.API.orders.create(orderData); // 建立訂單（模擬）

// 文章
await window.API.articles.getAll(); // 取得文章列表
await window.API.articles.getById(articleId); // 取得文章詳情

// 分店
await window.API.branches.getAll(); // 取得分店列表
```

> 💡 日後接入真實後端只需修改 `js/api-mock.js` 的實作，頁面邏輯無需改動。

### UI 元件函數

```javascript
// Toast 提示
window.showToast(message, type);
// type: 'success' | 'error' | 'warning' | 'info'
// 範例：window.showToast('已加入購物車', 'success')

// Modal 對話框
window.openModal(modalId); // 開啟 Modal
window.closeModal(modalId); // 關閉 Modal
// 範例：window.openModal('loginModal')

// 購物車操作
window.addToCart(product, quantity); // 加入購物車
window.removeFromCart(productId); // 移除商品
window.updateCartQuantity(productId, qty); // 更新數量
window.clearCart(); // 清空購物車
window.openCartDrawer(); // 開啟右側購物車視窗
window.closeCartDrawer(); // 關閉右側購物車視窗
window.renderCartDrawer(); // 依 AppState.cart 重繪 Drawer
```

### 工具函數（`formatters.js` / `validators.js` / `cart-service.js`）

```javascript
window.formatCurrency(3500); // → 'NT$3,500'
window.formatDate('2026-06-03'); // → '2026/06/03'
window.generateId(); // → 'id-1748922345-abc123xyz'
window.isValidEmail('a@b.com'); // → true / false
window.isValidPhone('0912345678'); // → true / false
window.calculateCartTotal(); // → Number（購物車總金額）
window.calculateShippingFee(total); // → 0 或 60（依免運門檻）
window.debounce(fn, 300); // 防抖（搜尋框使用）
window.throttle(fn, 100); // 節流（滾動事件使用）
```

---

## 🗄️ localStorage 結構

| 鍵               | 型別          | 說明                                                                      |
| ---------------- | ------------- | ------------------------------------------------------------------------- |
| `isLoggedIn`     | Boolean       | 登入狀態                                                                  |
| `currentUser`    | Object / null | 當前用戶資料                                                              |
| `cart`           | Array         | 電商購物車商品（`[{id, name, price, quantity, ...}]`）                    |
| `preferences`    | Object        | 個人化問卷結果（風格偏好、裝備需求）                                      |
| `theme`          | String        | 主題（預留，目前固定 `'light'`）                                          |
| `memberProfile`  | Object        | 會員中心儲存的個人資料                                                    |
| `bookingCart`    | Object        | 預約購物車（`{booking_info, selected_zones, selected_rentals, summary}`） |
| `adminEmployees` | Array         | 後台員工清單與逐頁權限（`permissions.js` 種子初始化）                     |

> ⚠️ `cart`（電商）與 `bookingCart`（預約）是兩個**完全獨立**的 localStorage key，互不干擾。

> `resetAppState()` 現在只移除 `isLoggedIn`、`currentUser`、`yuruiUser`、`cart`、`preferences`、`theme`、`memberProfile`、`bookingCart`、`mockOrders`、`mockUserPointDeltas`，不再使用 `localStorage.clear()`，避免誤刪同網域其他專案或未來功能資料。

### sessionStorage 結構（後台）

| 鍵                 | 型別   | 說明                                      |
| ------------------ | ------ | ----------------------------------------- |
| `adminLoggedIn`    | String | `"true"` 表示已登入                       |
| `adminId`          | String | 員工 ID（例：`"01"`）                     |
| `adminName`        | String | 顯示名稱                                  |
| `isSuperAdmin`     | String | `"true"` / `"false"`                      |
| `adminPermissions` | String | JSON 字串，各 section 的 `{ view, edit }` |

---

## ⚡ 效能優化（第 14 階段）

所有頁面已套用以下最佳化措施：

- **`<link rel="preconnect">`**：所有 HTML 預先與外部圖片伺服器建立連線，減少 DNS 查詢延遲
- **`<script defer>`**：所有 JS 延遲載入，不阻塞 HTML 解析與首屏渲染
- **`loading="lazy"`**：非首屏圖片懶加載，減少初始請求數
- **Lazy Loading Fallback**：不支援原生 lazy 的舊瀏覽器，自動切換 `IntersectionObserver` 模擬
- **`<meta name="theme-color">`**：手機瀏覽器狀態列顯示品牌綠色 `#244d4d`
- **`will-change`**：動畫元素預先通知瀏覽器 GPU 合成，動畫更流暢
- **CSS Containment**：商品卡與部落格卡設定 `contain: layout style`，限制重排範圍
- **`@media (prefers-reduced-motion)`**：尊重使用者「減少動態效果」的無障礙偏好
- **`@media print`**：列印樣式隱藏導航、影片、Toast 等非必要元素

---

## 🌐 瀏覽器相容性（第 14 階段）

| 瀏覽器           | 最低版本 | 說明                                                 |
| ---------------- | -------- | ---------------------------------------------------- |
| Chrome / Edge    | 90+      | 完整支援                                             |
| Firefox          | 88+      | 完整支援                                             |
| Safari           | 14+      | 已加入 `-webkit-` 前綴、iOS 縮放修正、Safe Area 支援 |
| Samsung Internet | 14+      | 基於 Chromium，完整支援                              |

**已處理的相容性問題**：

- Flexbox / Transform `-webkit-` vendor prefix
- CSS Grid fallback（不支援 Grid 的瀏覽器改用 Flex）
- `select` 下拉箭頭 Safari 樣式修正
- `appearance: none` 跨瀏覽器表單樣式統一
- `scroll-behavior: smooth` 降級處理

---

## 🔐 後端接入指南

Mock API 採用適配器模式設計，日後切換真實後端只需改動一個檔案：

**目前（Mock）**：

```javascript
// js/api-mock.js 內部從 JSON 檔讀取
window.API.products.getAll = async (filters) => {
  const data = await fetch('../data/products.json').then((r) => r.json());
  return data.filter(/* ... */);
};
```

**日後（真實 API）**：

```javascript
// 只需修改 api-mock.js，pages/*.js 的呼叫方式完全不變
window.API.products.getAll = async (filters) => {
  const res = await fetch(`${window.AppConfig.API_BASE_URL}/products`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
  return await res.json();
};
```

API Base URL 設定在 `js/config.js`：

```javascript
window.AppConfig.API_BASE_URL = 'http://localhost:3000/api'; // 修改此處即可
```

---

## 📦 關鍵數字

| 項目            | 買家前台                                               | 賣家後台                                 | 預約系統                 | 合計  |
| --------------- | ------------------------------------------------------ | ---------------------------------------- | ------------------------ | ----- |
| HTML 頁面       | 11 個                                                  | 2 個（login + dashboard）+ 9 個 partials | 6 個                     | 28 個 |
| JavaScript 模組 | 19 個（6 元件 + 10 頁面 + 3 核心）                     | 10 個（permissions + core + 8 功能）     | 5 個                     | 34 個 |
| CSS 檔案        | 1 個（main.css）                                       | 1 個（admin.css）                        | 1 個（booking-main.css） | 3 個  |
| Mock 資料 JSON  | 6 個（data/）                                          | 8 個（admin/data/）                      | 2 個（booking/data/）    | 16 個 |
| RWD 斷點        | 6 個（xs / sm / md / lg / xl / xxl）                   | Bootstrap 5 斷點（同套）                 | 768px 主要斷點           | —     |
| 儲存機制        | localStorage（8 個鍵，含 bookingCart、adminEmployees） | sessionStorage（5 個 key）               | localStorage.bookingCart | —     |

---

## ✅ 品質工具與 Smoke Test

| 指令                | 目的                                                                          |
| ------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`       | 啟動 Vite 開發伺服器，支援多頁面與 SCSS entry                                 |
| `npm run build`     | 使用 Vite 建置 HTML、JS、SCSS 與資產壓縮輸出                                  |
| `npm run lint`      | 以 ESLint 檢查主站與 booking JS 語法與基礎維護風險                            |
| `npm run format`    | 以 Prettier 檢查 HTML / CSS / SCSS / JS / JSON / Markdown 格式                |
| `npm run stylelint` | 以 Stylelint 檢查 SCSS 與 booking CSS                                         |
| `npm run smoke`     | 檢查共用 header/cart drawer、拆分 runtime 載入順序、Vite/tooling 檔案是否齊全 |

---

## 🗺️ 未來擴展方向

| 方向                    | 說明                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 接入真實後端（前台）    | 修改 `js/api-mock.js` 的各函數實作，頁面邏輯零改動                                                                   |
| 接入真實後端（後台）    | 修改 `admin/js/*.js` 中各 `fetch('../data/xxx.json')` 及 `permissions.js` 的 localStorage 邏輯改為真實 API           |
| 後台密碼驗證 / 操作日誌 | 逐頁 view/edit 權限已完成；待辦：密碼後端驗證、審計紀錄（見 [plans/adminPermissions.md](plans/adminPermissions.md)） |
| 升級至 SPA              | 以 Vue 3 或 React 重構，可直接複用現有 CSS 設計系統與 JSON 資料                                                      |
| 加入數據分析            | 在 `main.js` 的 `initGlobalListeners()` 接入 GA4 / GTM 事件追蹤                                                      |
| 自動化測試              | 以 Playwright 或 Cypress 撰寫自動化測試腳本                                                                          |
| 深色模式                | `main.css` 已預留 `@media (prefers-color-scheme: dark)` 區塊                                                         |
| PWA                     | 加入 `manifest.json` 與 Service Worker 支援離線瀏覽                                                                  |

---

## 📞 品牌聯絡資訊

- **電話**：0800-123-456
- **信箱**：support@yuruicamp.com
- **地址**：台北市信義區信義路五段 100 號
- **LINE 客服**：右下角浮動按鈕（所有頁面均可使用）

---

---

**版本**：1.3.76  
**最後更新**：2026/07/06  

> 完整更新紀錄請見 [changelog.md](changelog.md)

