先讀文件:
* `doc/ai-style-sheet.md`
* `doc/ai-style-token.md`
* `css/components/content/pages/_header.scss`
* `css/components/content/pages/_product-detail.scss`
* `css/components/content/pages/_checkout.scss`
* `css/components/content/pages/_checkout-success.scss`
* `css/components/content/pages/_home.scss`
* `css/components/content/pages/_branches.scss`

## 任務:
* `header.parital` 的div.siteUserDropdown 應該也是權重被覆蓋了沒有隱藏。
* `header.parital` 在每個頁面都要使用黏性特性在下拉時固定在上方，但現在沒有發揮功能，修正此問題。
* `header.parital` 的logo 和Yuruicamp 要始終在header 置中對齊。
* 購物車系統的button.siteCartRemoveButton 以垃圾桶的svg 替代而不是顯示移除。
* 根據`doc/ai-style-sheet.md` 使用$frontend-design skill，給`pages/product-detail.html` 的button.qtyBtn套用適當的樣式。
* `pages/checkout.html` 的button#confirmOrderBtn 、button#fillProfileBtn、button#checkoutApplyCouponBtn 套用`pages/home.html` 的button.homeProductAddButton 的樣式。
* 在`pages/checkout.html`的main.checkoutPage 使用左右留白的佈局格式。
* 在`pages/checkout-success.html`的時候，header 的button.siteMenuButton 的i 元素沒有套用到漢堡選單內容、button.siteSearchToggle 的i 元素沒有套用到搜尋按鈕的icon、button.siteCartButton 的i 元素沒有用到購物車的icon。
* 在`pages/branches.html` 時，點擊button.partnerCardTrigger 不要將畫面跳轉至最上方。

## 技術限制：
- 保留現有 Vite 專案結構。
- 使用目前的 HTML、SCSS、JavaScript 架構。
- 遵守 ITCSS 分層。
- 不可修改與此任務無關的檔案。
- 不可新增未定義的新色碼、字體、間距系統。
- 不可自行增加 docs/frontend-specs 中沒有的功能。
- 所有互動需可由鍵盤操作。
- 手機版寬度 375px 不可水平捲動。
- 不可使用 inline style。
- 不可使用 !important。
- 所有class 和id 命名都要使用駝峰式命名法，且都要語意化。
- CSS、SCSS 同一個元件功能的區塊要用「中文」註解標註功能及套用在哪個元件。
- HTML 每個元件區塊都要用「中文」註解標註功能。
- Javascript 每個函式都要「中文」註解功能及套用在哪個元件。
- 將更新的程式內容簡述到根目錄的README.md。

