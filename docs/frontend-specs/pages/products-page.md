# ProductsPage 商品頁規格

**狀態：** 草稿
**類別：** 頁面
**設計參考：** 無－依據既有原始檔 `pages/products.html` 整理

---

## 概覽

商品列表頁，包含廣告輪播、篩選器、排序控制項、商品網格與分頁功能。

此頁用於瀏覽及篩選可購買的裝備。應保留篩選側欄，以及手機版篩選器的既有操作行為。

## TypeScript 介面

```typescript
export type PageShellVariant = 'main' | 'booking' | 'admin';

export interface NavigationPayload {
  href: string;
  label: string;
  source: 'ProductsPage';
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

export interface ProductsPageData {
  title: string;
  sourcePath: 'pages/products.html';
  keyAreas: string[];
  blocks?: ContentBlock[];
}

export interface ProductsPageProps {
  // 必填 Props
  shell: 'main'; // 此原始頁面所使用的頁面外殼類型。
  data: ProductsPageData; // 初始頁面內容、資料紀錄或掛載區塊的中繼資料。

  // 選填 Props
  currentUser?: UserSummary | null; // 已登入使用者資訊。預設值：null
  loading?: boolean; // 顯示 Skeleton 或載入狀態。預設值：false
  errorMessage?: string | null; // 顯示給使用者的錯誤訊息。預設值：null

  // 事件處理函式
  onNavigate?: (payload: NavigationPayload) => void;
  onRefresh?: (sourcePath: 'pages/products.html') => void;

  // Render Props／插槽
  headerSlot?: React.ReactNode;
  footerSlot?: React.ReactNode;
  actionSlot?: React.ReactNode;
}
```

## 版本狀態

| 版本  | Props                | 說明                                     |
| --- | -------------------- | -------------------------------------- |
| 預設  | `shell="main"`       | 符合目前 `pages/products.html` 的版面與共用 CSS。 |
| 載入中 | `loading={true}`     | 當資料或 partial 內容載入時，保持頁面 Skeleton 穩定。   |
| 空狀態 | `data.blocks=[]`     | 顯示有幫助的空狀態畫面，但不可讓頁面框架塌陷。                |
| 錯誤  | `errorMessage="..."` | 顯示已在地化的錯誤訊息與重試途徑。                      |

## 互動狀態

| 狀態       | 觸發條件                  | 視覺變化                                               |
| -------- | --------------------- | -------------------------------------------------- |
| 預設       | 頁面已載入                 | 主要內容區以 Yuruicamp 綠色 Token 與既有間距呈現。                 |
| Hover    | 卡片、資料列、分頁標籤或按鈕被滑鼠移入   | 改變邊框、陰影或背景，不可造成版面位移。                               |
| Active   | 已選取的分頁標籤、篩選器、導覽項目或表格列 | 使用 `--yc-sage-action` 或 `--yc-sage-soft`，並搭配文字標示。 |
| Disabled | 無法使用的操作或未完成的表單        | 降低透明度、禁止指標操作、保留元素尺寸。                               |
| 載入中      | `loading={true}`      | 使用 Skeleton 列、停用送出按鈕或穩定的預留區塊。                      |
| 錯誤       | 存在 `errorMessage`     | 在失敗區域附近顯示行內警示，並在可行時提供重試操作。                         |

## 設計 Token

```typescript
const spacing = {
  pagePadding: 'clamp(24px, 5vw, 64px)',
  sectionGap: '24px',
  controlGap: '8px',
};

const typography = {
  bodyFontSize: '16px',
  bodyLineHeight: '1.5',
  headingWeight: '700',
};

const colors = {
  background: 'var(--yc-bg)',
  surface: 'var(--yc-surface)',
  text: 'var(--yc-text)',
  mutedText: 'var(--yc-text-muted)',
  border: 'var(--yc-border)',
  focus: 'var(--yc-sage-action)',
};
```

## 使用範例

### 基本用法

```tsx
<ProductsPage
  shell="main"
  data={{
    title: 'ProductsPage',
    sourcePath: 'pages/products.html',
    keyAreas: 'adCarousel, filterSidebar, productsGrid, pagination'.split(', '),
  }}
/>
```

### 搭配選填 Props

```tsx
<ProductsPage
  shell="main"
  data={productspageData}
  currentUser={currentUser}
  loading={isLoading}
  errorMessage={errorMessage}
  onNavigate={(payload) => router.push(payload.href)}
  onRefresh={(sourcePath) => reloadPageData(sourcePath)}
/>
```

## 無障礙設計

* **角色：** 主要內容區使用 `main`；巢狀控制項應優先採用原生語意化 HTML 元素。
* **鍵盤操作：** Tab 順序必須符合視覺順序。Enter／Space 可觸發按鈕、分頁標籤、手風琴標題與資料列操作。
* **ARIA 屬性：** 目前導覽項目使用 `aria-current`；可收合面板使用 `aria-expanded`；錯誤訊息使用 `aria-describedby`。
* **焦點管理：** Modal 與 Offcanvas 面板開啟時必須鎖定焦點；關閉後必須將焦點返回原本的觸發元素。
* **螢幕閱讀器：** 必須以文字宣告頁面標題、載入／錯誤狀態、已選取篩選條件與狀態標籤。

## 實作說明

* 原始檔：`pages/products.html`。
* 共用 CSS 來源：`css/main.css`。
* 共用元件：`components/header.partial`、`components/footer.partial`。
* 關鍵 UI 區域：`adCarousel`、`filterSidebar`、`productsGrid`、`pagination`。
* Backend 模式以公開商品契約的 `tags` 判定 `isNew`、`isBestseller`；`API.products.getNewest(100)` 與 `API.products.getBestsellers(100)` 只提供各分類的排序順位。
* 開發 Seed 的新品為可售商品 `products.created_at desc, id desc` 前 10 件；熱銷為排除取消／退貨訂單後，依 `order_items.quantity` 合計前 6 件。
* 新品維持 `created_at` 降序，熱銷維持有效訂單數量降序。商品卡可同時顯示兩種標籤；URL 與側欄篩選不得用列表位置或前端自行推測標籤。
* 產生新 UI 前，必須先閱讀 `docs/ai-style-sheet.md` 與 `docs/ai-style-tokens.css`。
* 未解決問題：沒有提供 Figma 設計稿，因此既有程式碼是設計上的唯一依據。
* 實作本規格時，**不得**替換既有頁面外殼、storage key、mock data 資料契約，或 partial loader 的載入模式。

## 驗收標準

* [ ] 所有版本狀態都可正常渲染，且不會發生錯誤。
* [ ] 所有互動狀態在視覺上都有明確區別。
* [ ] 鍵盤導覽可正常使用。
* [ ] 螢幕閱讀器能正確宣告內容。
* [ ] 設計 Token 符合 Yuruicamp AI 樣式規範。
* [ ] 單元測試或 smoke test 已涵蓋必填 Props 與主要事件。
* [ ] 新品與熱銷商品卡有正確標籤，URL 與側欄快速篩選會顯示完整對應清單，不受首頁展示筆數限制。
