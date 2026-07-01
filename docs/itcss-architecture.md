# ITCSS 架構規範

本文記錄 `css/main.scss` 的分層契約，新增或搬移 SCSS 時需依照此順序判斷責任邊界。

## 載入順序

```scss
@use 'settings/settings';
@use 'generic/generic';
@use 'elements/elements';
@use 'objects/objects';
@use 'components/components';
@use 'pages/pages';
@use 'utilities/utilities';
```

## 分層責任

- `settings`：全站設計 token、Sass 設定值與不綁定 UI 的基礎變數。目前 `--yui-*` runtime token 放在 `css/settings/_tokens.scss`。
- `generic`：reset、normalize 與瀏覽器預設一致化規則。
- `elements`：`body`、`a`、`button`、`img` 等原生元素基礎樣式。
- `objects`：container、grid、stack 等不帶品牌視覺的版面物件。
- `components`：跨頁可重用 UI，例如 header、drawer、modal、button、footer、floating actions。
- `pages`：單一頁面專屬樣式，例如 `home`、`products`、`checkout`、`faq`。
- `utilities`：單一職責工具類，權重最高，應保持少量且可預期。

## 新增樣式規則

- 新增頁面樣式時放在 `css/pages/_頁面.scss`，並從 `css/pages/_pages.scss` 以 `@use` 載入。
- 頁面樣式需盡量用頁面根 class 限定範圍，例如 `.homePage`、`.productsPage`、`.checkoutPage`。
- 原生元素的全站基底與互動狀態放在 `elements`，例如 `body`、`a`、`a:hover`、`a:focus-visible`。
- 可跨頁重用的 UI 才放進 `components`，避免讓 components 混入單一頁面規則。
- 新增色彩、間距、圓角、陰影時，優先使用 `--yui-*` token；需要新 token 時先補在 `settings`。
- `css/abstracts/_abstracts.scss` 只保留舊路徑相容，不再作為新設定入口。
- `css/base/_base.scss` 只保留舊路徑相容，新的原生元素基礎樣式需放在 `css/elements/`。
- `css/layouts/_layouts.scss` 只保留舊路徑相容，新的版面物件需放在 `css/objects/`。
- `css/components/content/_content.scss` 已移除，不再作為新的共用內容入口。
- Components 層的共用元件應直接使用 `--yui-*` token，避免依賴其他 partial 先宣告的 Sass 變數。
- Components 層目前不保留 Sass `$...` alias；若需要新 token，先回到 `settings` 定義 runtime custom property。

## 樣式歸層判斷表

| 新增 selector 或規則 | 放置層級 | 判斷理由 |
| --- | --- | --- |
| `:root`、全站 `--yui-*` token | `settings` | 只提供設計設定或 runtime token，不直接描述元件外觀。 |
| `*`、`*::before`、reset、normalize | `generic` | 用來消除瀏覽器預設差異，權重應低於所有專案樣式。 |
| `body`、`a`、`button`、`img`、`a:hover` | `elements` | 直接套用原生 HTML 元素，沒有綁定 component class。 |
| `.container`、`.stack`、`.cluster`、`.grid` | `objects` | 只管理寬度、排列、節奏與結構，不放品牌顏色或元件狀態。 |
| `.btn`、`.modal`、`.drawer`、`.siteHeader`、`.siteFooter` | `components` | 可跨頁重用，具備明確 UI 語意與互動狀態。 |
| `.homePage`、`.productsPage`、`.checkoutPage` 底下的區塊 | `pages` | 只服務單一頁面流程或單一頁面的視覺組合。 |
| `.sr-only`、`.isHidden` 這類單一職責工具 | `utilities` | 用途小且明確，通常需要最高優先權或跨層覆寫能力。 |

## 本輪尚未處理

- `booking/css/*.css` 與 `admin/css/admin.css` 仍是獨立 CSS 系統，後續可再拆成各自的 ITCSS entry。
- `css/pages/*.scss` 仍保留頁面局部 Sass alias，用來讓大型頁面 partial 維持可讀性；後續若要收斂，可逐頁改成直接使用 `--yui-*`。
