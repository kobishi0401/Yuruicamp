# Yuruicamp 開發者使用說明書（User Guide）

> 這份文件是給**開發者**看的工作手冊。  
> 不管是新加功能、改樣式、修 bug，都可以從這裡快速找到「要動哪個檔案」。

> **重要（2026-07）：** 前端已整包搬進 `frontend/`；主站在 `storefront/`。  
> 下文路徑若未特別註明，皆**相對 `frontend/`**（例如 `storefront/pages/home.html`）。  
> 啟動請：`cd frontend` → `npm run dev`。Java 後端在 repo 根的 `backend/`（與前端分開）。  
>
> **路徑鐵律：** 瀏覽器載入的 css／js／圖片／導頁請用**網站根絕對路徑**（`/storefront/...`、`/assets/...`、`/booking/...`、`/components/...`）。  
> 假資料只透過 `window.API` / `BookingAPI` / `AdminAPI`（Mock 時讀 `/data/...`）。  
> **不要**再使用 `resolveAppUrl` 或依頁面深度算 `../`。  
> 接 Spring：`storefront/js/config.js` 設 `USE_MOCK_API: false`、`API_BASE_URL: 'http://localhost:8080/api'`。

---

## 目錄

1. [專案資料夾全覽](#1-專案資料夾全覽)
2. [我要改 HTML 頁面 → `storefront/pages/`](#2-我要改-html-頁面--storefrontpages)
3. [我要改樣式 CSS → `storefront/css/`](#3-我要改樣式-css--storefrontcss)
4. [我要改 JavaScript 邏輯 → `storefront/js/`](#4-我要改-javascript-邏輯--storefrontjs)
5. [我要改假資料 → `data/`](#5-我要改假資料--data)
6. [我要改共用 HTML 片段 → `components/`](#6-我要改共用-html-片段--components)
7. [我要改多媒體資源 → `assets/`](#7-我要改多媒體資源--assets)
8. [快速任務查找表（最常用）](#8-快速任務查找表最常用)
9. [JS 全局函數速查](#9-js-全局函數速查)
10. [CSS 設計系統速查](#10-css-設計系統速查)
11. [開發流程建議](#11-開發流程建議)
12. [常見問題 FAQ](#12-常見問題-faq)
13. [賣家後台 → `admin/`](#13-賣家後台--admin)
14. [預約子系統 → `booking/`](#14-預約子系統--booking)

---

## 1. 專案資料夾全覽

```
Yuruicamp/                         ← repo 根目錄
│
├── README.md / userguide.md / changelog.md
├── backend/                       ← Spring Boot（改 Java API 來這裡）
├── docs/                          ← Schema、規格文件
├── plans/ / thoughts/             ← 規劃與筆記
├── docker-compose.yml / .env*     ← 本機 PostgreSQL
│
└── frontend/                      ← ⭐ npm / Vite 根（以下路徑相對這裡）
    ├── package.json / vite.config.js
    ├── index.html                 ← 入口頁（跳轉 storefront/pages/home.html）
    ├── storefront/                ← ⭐ 主站（裝備商城）
    │   ├── pages/                 ← 主站 HTML
    │   ├── js/                    ← 主站 + 目前跨站共用 JS（data-paths、booking-api…）
    │   └── css/                   ← 主站 ITCSS
    ├── components/                ← 共用 HTML partial（header/footer；B2 前暫放根）
    ├── data/                      ← ⭐ 全站唯一 Mock JSON（執行期 /data/**）
    ├── assets/                    ← 圖片／icon／影片
    ├── admin/                     ← 賣家後台（login、dashboard、partials、js）
    │   └── scripts/               ← 資料驗證／同步 Node 腳本
    ├── booking/                   ← 預約子站
    │   ├── pages/                 ← 預約 HTML（camp-search、camp-detail…）
    │   ├── js/ / css/             ← 預約專屬邏輯與樣式
    │   └── （會引用 ../../storefront/js、../../components、/data）
    ├── src/                       ← Vite 樣式入口（匯入 storefront/css）
    ├── tests/                     ← smoke 等
    └── color/                     ← 色票文件

| 我想改… | 去哪裡 |
|---------|--------|
| 商城頁面／樣式／JS | `frontend/storefront/{pages,css,js}` |
| 預約流程 | `frontend/booking`（共用再看 `frontend/storefront/js`、`components`） |
| 後台 | `frontend/admin` |
| 假資料 | **只改** `frontend/data`（不要找 `admin/data` 或 `booking/data`） |
| Java API | `backend/` |
| DB schema 文件 | `docs/` |

---

## 2. 我要改 HTML 頁面 → `storefront/pages/`

每個 `.html` 對應一個網站頁面。找到對應的頁面改就好。

| 檔案路徑 | 這是什麼頁面 | 對應的 JS |
|----------|------------|-----------|
| `storefront/pages/home.html` | 首頁（Hero Banner、精選商品） | `storefront/js/pages/home.js` |
| `storefront/pages/products.html` | 商品列表（網格、篩選、分頁） | `storefront/js/pages/product-list.js` |
| `storefront/pages/product-detail.html` | 商品詳情（圖集、規格、數量） | `storefront/js/pages/product-detail.js` |
| `storefront/pages/cart.html` | 購物車（品項增刪改查） | `storefront/js/pages/cart.js` |
| `storefront/pages/checkout.html` | 結帳（收件人表單、運費計算） | `storefront/js/pages/checkout.js` |
| `storefront/pages/checkout-success.html` | 結帳成功（訂單確認畫面） | —（靜態頁，無專屬 JS）|
| `storefront/pages/member-center.html` | 會員中心（訂單/折價券/通知） | `storefront/js/pages/member-center.js` |
| `storefront/pages/blog.html` | 部落格文章列表 | `storefront/js/pages/blog.js` |
| `storefront/pages/blog-detail.html` | 單篇文章詳情 + 內嵌商品卡 | `storefront/js/pages/blog-detail.js` |
| `storefront/pages/branches.html` | 分店地圖 + 合作店家 | `storefront/js/pages/branches.js` |
| `storefront/pages/faq.html` | 常見問題（Accordion + NPS 問卷） | `storefront/js/pages/faq.js` |

> 💡 **注意**：每個 HTML 頁面底部都用 `<script>` 引入對應的 JS 檔，順序固定為：
> `config.js` → `api-mock.js` → `main.js` → `components/*.js` → `pages/xxx.js`（皆在 `storefront/js/`）

### 預約子系統頁面（`booking/pages/`）

預約子系統在 `booking/` 資料夾；**HTML 頁面在 `booking/pages/`**，不在主站 `storefront/pages/` 裡。  
會共用 `storefront/js/`、`components/`、`data/`。

| 檔案路徑 | 這是什麼頁面 | 對應的 JS |
|----------|------------|-----------|
| `booking/pages/camp-search.html` | 營區搜尋與列表（篩選地區、環境、設施）| `booking/js/camp-search.js` |
| `booking/pages/camp-detail.html` | 營區詳情（日期選擇、營位類型、費用計算）| `booking/js/camp-detail.js` |
| `booking/pages/camp-rental.html` | 裝備租借（加選租借裝備、情境推薦）| `booking/js/camp-rental.js` |
| `booking/pages/booking-cart.html` | 預約購物車結帳（確認明細、送出預約）| `booking/js/booking-cart.js` |
| `booking/pages/rental-guide.html` | 租借體驗說明（圖文流程說明）| —（靜態頁，無專屬 JS）|
| `booking/pages/booking-faq.html` | 預約系統 FAQ（退款、押金等）| —（靜態頁，無專屬 JS）|

> 💡 預約資料請走 `storefront/js/booking-api.js` + `storefront/js/data-paths.js`（讀 `/data/**`），不要再新增 `booking/data/`。

### 入口頁

| 檔案 | 說明 |
|------|------|
| `index.html` | 網站根入口，只有一行跳轉邏輯，不需要常改 |

---

## 3. 我要改樣式 CSS → `storefront/css/`

### 檔案分工

| 檔案 | 說明 | 什麼情況改這裡 |
|------|------|--------------|
| `storefront/css/variables.scss` | **所有設計 Token**：色彩、字體大小、間距、陰影、圓角、斷點 | 改品牌顏色、調整全站字體大小、修改陰影 |
| `storefront/css/base.scss` | CSS Reset + 全局基礎樣式（body、a、img、h1-h6 等） | 改全站預設字體、連結顏色、表格基礎樣式 |
| `storefront/css/components.scss` | **可重用 UI 元件**：按鈕 `.btn`、徽章 `.badge`、卡片 `.card`、Toast、Modal、表單等 | 改按鈕外觀、調整卡片陰影、修 Modal 樣式 |
| `storefront/css/layout.scss` | **佈局系統**：Navbar、Footer、Grid、Sidebar、Hero Section | 改 Navbar 高度/顏色、調整 Grid 欄位數 |
| `storefront/css/main.scss` | SCSS 入口檔，只負責 `@import` 上面四個檔，**不寫任何樣式** | 調整 import 順序時 |
| `storefront/css/main.css` | ⭐ **編譯後的最終 CSS**，瀏覽器實際讀取這個 | 直接在這裡改也可以（但建議改 .scss 後重新編譯）|
| `booking/css/booking.css` | **預約子系統專屬樣式**（Header `#F2F0EB`、Camp Card、Zone Card、Step Progress 等）| 改預約系統版面、Header/Footer 背景色 |

### 要改什麼樣式？找這裡

| 你想改… | 去哪個檔案 | 搜尋關鍵字 |
|---------|-----------|-----------|
| 品牌主色 `#244d4d` | `variables.scss` | `$primary` |
| 按鈕樣式（`.btn-primary`） | `components.scss` | `.btn-primary` |
| 商品卡片外觀 | `components.scss` | `.product-card` |
| Navbar 高度 / 背景色 | `layout.scss` | `.navbar` |
| Footer 樣式 | `layout.scss` | `.footer` |
| 手機版 RWD 斷點 | `variables.scss` | `$sm` / `$md` / `$lg` |
| Toast 提示框樣式 | `components.scss` | `.toast` |
| Modal 對話框樣式 | `components.scss` | `.modal` |
| 表單輸入框 | `components.scss` | `.form-control` |
| Hero Banner 區塊 | `layout.scss` | `.hero` |
| 全域字體設定 | `variables.scss` | `$font-family-base` |
| 頁面最大寬度 | `layout.scss` | `.container` |
| Z-index 層級 | `variables.scss` | `$z-modal` / `$z-navbar` |

### SCSS 變數對應表（最常用）

```scss
/* 色彩 */
$primary: #244d4d          /* 品牌深青綠，用於按鈕、連結 */
$secondary: #779999        /* 淺青灰綠，用於次要元素 */
$danger: #d32f2f           /* 紅色，刪除/錯誤 */
$success: #4caf50          /* 綠色，成功訊息 */

/* 斷點（手機優先 mobile-first） */
$sm: 576px                 /* 大型手機 */
$md: 768px                 /* 平板 iPad */
$lg: 992px                 /* 筆電 */
$xl: 1200px                /* 桌機 */

/* 間距 */
$spacing-sm: 0.5rem        /* 8px */
$spacing: 1rem             /* 16px（基礎單位） */
$spacing-xl: 1.5rem        /* 24px */
$spacing-2xl: 2rem         /* 32px */
```

---

## 4. 我要改 JavaScript 邏輯 → `storefront/js/`

### 核心檔案（每頁都會載入）

| 檔案 | 說明 | 什麼情況改這裡 |
|------|------|--------------|
| `storefront/js/config.js` | **全局狀態（AppState）+ 全局設定（AppConfig）**<br>包含登入狀態、購物車、API 網址、免運門檻等 | 改 API 網址、調整免運門檻金額、修改版本號 |
| `storefront/js/api-mock.js` | **Mock API 層**，所有頁面都透過 `window.API.xxx()` 取得資料，資料來源是 `data/*.json` | 改資料邏輯（篩選/排序）、日後切換真實後端 API |
| `storefront/js/main.js` | **應用初始化**，負責啟動 Navbar、Modal、購物車、Lazy Loading Fallback、Scroll Lock | 加新的全局事件監聽、修初始化順序問題 |

### 元件 JS（`storefront/js/components/`）跨頁複用

| 檔案 | 說明 | 什麼情況改這裡 |
|------|------|--------------|
| `storefront/js/components/header.js` | Header 互動（漢堡選單開關、Offcanvas 手機版） | 改 Header 點擊行為、修漢堡選單動畫 |
| `storefront/js/components/modal.js` | Modal 對話框（登入 Modal + 個人化問卷 Stepper） | 修登入流程、改問卷步驟 |
| `storefront/js/components/cart.js` | 購物車 Badge 更新、加入/移除商品邏輯 | 改購物車計算邏輯、修 Badge 不更新的 bug |
| `storefront/js/components/toast.js` | Toast 提示（右下角彈出的成功/錯誤訊息） | 改提示持續時間、修改位置 |
| `storefront/js/components/carousel.js` | 品牌輪播（CSS animation 驅動） | 改輪播速度、新增輪播項目 |
| `storefront/js/components/filter.js` | 商品篩選器（CustomEvent 驅動，解耦合） | 修篩選邏輯、新增篩選條件 |

### 頁面 JS（`storefront/js/pages/`）每頁獨立

| 檔案 | 說明 | 什麼情況改這裡 |
|------|------|--------------|
| `storefront/js/pages/home.js` | 首頁：精選商品渲染、「加入購物車」按鈕 | 改首頁商品顯示數量、修加入購物車 bug |
| `storefront/js/pages/product-list.js` | 商品列表：網格渲染、分頁切換 | 改每頁顯示幾個商品、修分頁 bug |
| `storefront/js/pages/product-detail.js` | 商品詳情：縮圖點擊切換大圖、數量 Stepper | 改圖集互動、修規格選擇 bug |
| `storefront/js/pages/cart.js` | 購物車頁：品項列表渲染、數量增減、刪除 | 改購物車 UI 邏輯、修未登入攔截行為 |
| `storefront/js/pages/checkout.js` | 結帳：手風琴表單、運費即時計算 | 改結帳表單欄位、修運費計算邏輯 |
| `storefront/js/pages/member-center.js` | 會員中心：訂單歷史、評價、折價券、通知 Tab | 改 Tab 切換邏輯、新增會員功能區塊 |
| `storefront/js/pages/blog.js` | 部落格列表：文章卡片動態渲染 | 改文章排版、新增分類篩選 |
| `storefront/js/pages/blog-detail.js` | 文章詳情：內嵌商品導購卡片 | 改文章版面、修相關商品卡片邏輯 |
| `storefront/js/pages/branches.js` | 分店地圖：Google Maps iframe 切換、合作店家 Modal | 改地圖嵌入網址、新增分店 |
| `storefront/js/pages/faq.js` | FAQ：Accordion 開關、NPS 問卷送出 | 改 Accordion 動畫、修 NPS 送出行為 |

---

## 5. 我要改假資料 → `/data/**`

全站（商城、booking、admin）共用 **`storefront/js/data-paths.js`** 定義的路徑；舊的 `admin/data/`、`booking/data/` 已移除，請勿再新增。

### 目錄對照

| 路徑 | 說明 |
|------|------|
| `data/catalog/products.json` | 商城商品 + 後台商品管理 |
| `data/catalog/campgrounds.json` | 可預約營區（**C002–C009**） |
| `data/catalog/camp-equipment.json` | 各營區可租裝備 catalog |
| `data/commerce/orders.json` | 商城訂單 + 後台訂單 |
| `data/commerce/camp-bookings.json` | 露營預約 + 後台預約管理 |
| `data/customers/customers.json` | 會員主檔 |
| `data/admin/rental-skus.json` | 後台租借 SKU 各點庫存 |
| `data/admin/reviews.json` | 評論種子 |
| `data/admin/movement.json` | 庫存異動 |
| `data/admin/min-stock.json` | 低庫存閾值 |
| `data/promotions/coupons.json` | 優惠券 |
| `data/marketing/*.json` | 文章、分店、品牌 |

### 營區 / 租借庫存 ID（方案 B）

| ID | 用途 |
|----|------|
| **C001** | **租借主倉**（僅 `rental-skus` 庫存，不可預約） |
| **C002–C009** | 可預約營區（與 `campgrounds.json` 一致） |

`rental-skus.camp[]` 每筆含 `campgroundId`、`name`、`quantity`，名稱須與 `campgrounds.json` 相同。

### localStorage overlay（前台操作會寫入，後台已 merge）

| Key | 用途 |
|-----|------|
| `mockOrders` | 結帳新訂單 |
| `mockBookings` | 預約結帳新單 |
| `mockReviews` | 會員評價（前後台共用） |
| `mockCustomerOverlay` | 點數 / 首購狀態 |

> 💡 **測試會員 Amy**：`U001`，訂單白名單 `[1,5,3]`，預約 `[25]`（BK-0025 @ C008 礁溪 + E009 睡袋）。

> 💡 **員工與權限**仍在 `localStorage.adminEmployees`（`permissions.js` 初始化）。

### 欄位命名（統一 camelCase）

- 訂單：`status`（unshipped/shipped/returned/completed）、`paymentStatus`、`customerId`
- 商品：`image`、`totalStock`
- 預約：`bookingInfo`、`selectedRentals`、`summary.finalAmount`

---

## 6. 我要改共用 HTML 片段 → `components/`

這裡放的是「所有頁面都一樣」的區塊。

| 檔案 | 說明 | 注意事項 |
|------|------|---------|
| `components/header.html` | Header 的 HTML 結構（含漢堡選單） | 改這裡，所有頁面 Header 都會變 |
| `components/footer.html` | Footer 的 HTML 結構 | 改這裡，所有頁面 Footer 都會變 |

> ⚠️ **重要**：這兩個檔案是「參考用的靜態範本」，實際上每個 `storefront/pages/*.html` 內都有直接內嵌的 Header/Footer HTML。如果要改 Header/Footer，**每個頁面都要同步手動更新**，或改用 JS 動態注入。

---

## 7. 我要改多媒體資源 → `assets/`

| 路徑 | 說明 |
|------|------|
| `assets/images/brand_icon.png` | 品牌 icon 圖片 |
| `assets/images/Gemini_Generated_Image_*.png` | 其他品牌/裝飾用靜態圖片 |

> 💡 商品圖片目前使用的是外部 CDN 網址（`picsum.photos` / `via.placeholder.com`），定義在 `data/products.json` 的 `image` 欄位。替換成真實圖片只需改 JSON 的 `image` 欄位網址。

---

## 8. 快速任務查找表（最常用）

> 直接查這張表，找到任務後去對應檔案。

### 買家前台

| 我想做的事 | 去哪裡改 |
|-----------|---------|
| 改品牌主色 | `storefront/css/variables.scss` → `$primary` |
| 改按鈕顏色/圓角 | `storefront/css/components.scss` → `.btn-primary` |
| 改 Navbar 背景色 | `storefront/css/layout.scss` → `.navbar` |
| 改 Navbar 互動行為 | `storefront/js/components/header.js` |
| 首頁精選商品顯示幾個 | `storefront/js/pages/home.js` |
| 商品列表每頁幾筆 | `storefront/js/pages/product-list.js` |
| 新增 / 修改商品資料 | `data/catalog/products.json` |
| 新增 / 修改分店資訊 | `data/marketing/branches.json` |
| 新增 / 修改文章 | `data/marketing/articles.json` |
| 改 Toast 提示樣式 | `storefront/css/components.scss` → `.toast` |
| 改 Toast 提示行為 | `storefront/js/components/toast.js` |
| 改 Modal 樣式 | `storefront/css/components.scss` → `.modal` |
| 改登入 Modal 行為 | `storefront/js/components/modal.js` |
| 改購物車計算邏輯 | `storefront/js/components/cart.js` |
| 改結帳表單欄位 | `storefront/pages/checkout.html` + `storefront/js/pages/checkout.js` |
| 改免運費門檻金額 | `storefront/js/config.js` → `AppConfig.CART.FREE_SHIPPING_THRESHOLD` |
| 改 API 伺服器網址 | `storefront/js/config.js` → `AppConfig.API_BASE_URL` |
| 切換真實後端 API | `storefront/js/api-mock.js`（把 fetch JSON 改成 fetch 真實 API）|
| 改 FAQ 內容 | `storefront/pages/faq.html`（直接改 HTML 的 Accordion 內容）|
| 改 Footer 內容 | 每個 `storefront/pages/*.html` 裡的 footer 區塊 |
| 新增一個全新頁面 | 新增 `storefront/pages/xxx.html` + `storefront/js/pages/xxx.js`，並在 Navbar 加連結 |
| 改手機版 RWD 斷點 | `storefront/css/variables.scss` → `$sm` / `$md` / `$lg` |
| 改動畫速度 | `storefront/css/variables.scss` → `$transition-base` |

### 預約系統

| 我想做的事 | 去哪裡改 |
|-----------|---------|
| 新增 / 修改營區資料 | `data/catalog/campgrounds.json` |
| 新增 / 修改租借裝備 | `data/catalog/camp-equipment.json` |
| 改預約系統 Header 背景色 | `booking/css/booking.css` → `.booking-header` |
| 改預約背包 Badge 計算邏輯 | `booking/js/booking-header.js` → `updateBookingBadge()` |
| 改營區搜尋篩選條件 | `booking/js/camp-search.js` → `filterCampgrounds()` |
| 改平日 / 假日計算規則 | `booking/js/camp-detail.js` → `calculateDays()` |
| 改裝備租借卡片渲染 | `booking/js/camp-rental.js` → `renderRentalItems()` |
| 改結帳頁費用計算 | `booking/js/booking-cart.js` → `renderBookingCartPage()` |
| 改租借說明頁內容 | `booking/rental-guide.html`（直接改 HTML 內容）|
| 改預約 FAQ 內容 | `booking/booking-faq.html`（直接改 HTML 的 Accordion 內容）|

### 賣家後台

| 我想做的事 | 去哪裡改 |
|-----------|---------|
| 改後台 Sidebar 深色背景 | `admin/css/admin.css` → `--admin-sidebar-bg`（預設 `#1e2329`）|
| 改後台品牌 Accent 色 | `admin/css/admin.css` → `--admin-brand-accent`（預設 `#244d4d`）|
| 改後台 Toast 行為 | `admin/js/core.js` → `showAdminToast()` |
| 改登入驗證邏輯 | `admin/login.html` + `admin/js/permissions.js`（員工 ID 查 `adminEmployees`，Demo：`01`/`02`）|
| 改後台登出行為 | `admin/js/core.js` → `clearAdminSession()` |
| 修改訂單資料 | `data/commerce/orders.json` |
| 修改庫存異動 | `data/admin/movement.json` + `admin/js/movement.js` |
| 修改商品庫存 | `data/catalog/products.json` → `totalStock` / `branch` |
| 修改租借商品 | `data/admin/rental-skus.json` + 商品頁「租借」頁籤 |
| 修改會員等級 / 點數 | `data/customers/customers.json` → `tier` / `points` |
| 新增 / 修改優惠券 | `data/promotions/coupons.json` |
| 新增 / 修改評論 | `data/admin/reviews.json` |
| 修改預約單 | `data/commerce/camp-bookings.json` + `admin/js/bookings.js` |
| 管理員工 / 權限 | `admin/js/permissions.js` + `localStorage.adminEmployees` |
| 改訂單篩選邏輯 | `admin/js/orders.js` → `filterOrders()` |
| 改低庫存警告閾值 | `admin/js/analytics.js` → `total-stock < 5`（改成需要的數字）|
| 改圖表樣式 / 資料 | `admin/js/analytics.js` → Chart.js 設定物件 |
| 新增後台 Sidebar 功能模組 | 見第 13 節「新增模組標準流程」（含 `permissions.js` 的 `ADMIN_SECTIONS`）|
| 後台切換真實後端 API | `admin/js/*.js` 各模組裡的 `fetch('../data/xxx.json')` 改成 fetch 真實 API |

---

## 9. JS 全局函數速查

以下函數都掛在 `window` 上，任何 JS 檔都可以直接呼叫。

### 應用狀態（定義於 `storefront/js/config.js`）

```javascript
window.AppState.isLoggedIn          // Boolean - 使用者是否已登入
window.AppState.currentUser         // Object  - 當前用戶資料（null 表示未登入）
window.AppState.cart                // Array   - 購物車商品列表
window.AppState.preferences         // Object  - 個人化問卷結果

window.saveAppState()               // 把 AppState 存進 localStorage（記得改完要呼叫）
window.resetAppState()              // 清除所有狀態 + localStorage（等同登出並清空購物車）
```

### Mock API（定義於 `storefront/js/api-mock.js`）

```javascript
// 都是 async 函數，要用 await 呼叫
await window.API.products.getAll(filters)       // 取得商品列表
await window.API.products.getById(productId)    // 取得單一商品

await window.API.users.login(email, password)   // 登入（回傳用戶資料或 null）
await window.API.users.getProfile(userId)       // 取得用戶資料

await window.API.orders.getAll(userId)          // 取得用戶的所有訂單
await window.API.orders.create(orderData)       // 建立新訂單

await window.API.articles.getAll()              // 取得所有文章
await window.API.articles.getById(articleId)   // 取得單篇文章

await window.API.branches.getAll()              // 取得所有分店資料
await window.API.marketing.getBrands()           // 取得首頁合作品牌
```

### 購物車（定義於 `storefront/js/components/cart.js`）

```javascript
window.addToCart(product, quantity)         // 加入購物車（product 是商品物件）
window.removeFromCart(productId)            // 從購物車移除
window.updateCartQuantity(productId, qty)   // 更新某商品的數量
window.clearCart()                          // 清空整個購物車
window.calculateCartTotal()                 // 計算購物車總金額（回傳數字）
window.calculateShippingFee(total)          // 計算運費（滿門檻回傳 0，否則回傳 60）
```

### UI 元件（定義於各 components JS）

```javascript
window.showToast(message, type)   // 顯示 Toast 提示
// type 可以是 'success' | 'error' | 'warning' | 'info'
// 範例：window.showToast('已加入購物車', 'success')

window.openModal(modalId)         // 開啟 Modal（帶入 HTML 元素的 id）
window.closeModal(modalId)        // 關閉 Modal
// 範例：window.openModal('loginModal')
```

### 工具函數（定義於 `storefront/js/config.js`）

```javascript
window.formatCurrency(3500)           // → 'NT$3,500'（金額格式化）
window.formatDate('2026-06-03')       // → '2026/06/03'（日期格式化）
window.generateId()                   // → 產生唯一 ID 字串
window.isValidEmail('a@b.com')        // → true / false（驗證 Email 格式）
window.isValidPhone('0912345678')     // → true / false（驗證手機號碼）
window.debounce(fn, 300)              // 防抖：連續觸發只執行最後一次（搜尋框用）
window.throttle(fn, 100)              // 節流：固定間隔最多執行一次（滾動事件用）
```

---

## 10. CSS 設計系統速查

### 常用 CSS Class 清單

> 這些 class 都已定義在 `storefront/css/components.scss` 或 `storefront/css/layout.scss`，可以直接在 HTML 裡使用。

**按鈕**

| Class | 樣式 |
|-------|------|
| `.btn` | 按鈕基礎樣式（必須搭配下面的變體） |
| `.btn-primary` | 品牌綠色實心按鈕 |
| `.btn-secondary` | 淺青灰綠按鈕 |
| `.btn-outline-primary` | 綠色外框按鈕（透明背景） |
| `.btn-danger` | 紅色刪除按鈕 |
| `.btn-sm` | 小型按鈕 |
| `.btn-lg` | 大型按鈕 |

**卡片**

| Class | 樣式 |
|-------|------|
| `.card` | 卡片容器（白色背景 + 陰影 + 圓角） |
| `.card-img` | 卡片頂部圖片 |
| `.card-body` | 卡片內容區 |
| `.product-card` | 商品專用卡片（含 hover 效果） |

**排版工具**

| Class | 說明 |
|-------|------|
| `.container` | 頁面最大寬度容器（自動水平置中） |
| `.grid-cols-2` | 2 欄 Grid |
| `.grid-cols-3` | 3 欄 Grid |
| `.grid-cols-4` | 4 欄 Grid |

**狀態顏色**

| Class | 說明 |
|-------|------|
| `.text-primary` | 品牌綠色文字 |
| `.text-danger` | 紅色文字（錯誤、必填提示） |
| `.text-muted` | 灰色淡化文字（次要資訊） |
| `.badge` | 徽章基礎（數量標示） |
| `.badge-primary` | 品牌綠色徽章 |

### 色彩規範（所有顏色定義於 `storefront/css/variables.scss`）

| 用途 | SCSS 變數 | 色碼 | 說明 |
|------|-----------|------|------|
| 主色 | `$primary` | `#244d4d` | 品牌深青綠，主要按鈕、連結 |
| 副色 | `$secondary` | `#779999` | 淺青灰綠，次要按鈕 |
| 成功 | `$success` | `#4caf50` | 成功 Toast、勾選狀態 |
| 警告 | `$warning` | `#ff9800` | 警告提示 |
| 危險 | `$danger` | `#d32f2f` | 刪除按鈕、錯誤訊息 |
| 資訊 | `$info` | `#2196f3` | 資訊提示 |
| 輕背景 | `$light-bg` | `#f6fbf6` | 頁面淺綠背景色 |
| 懸停 | `$dark-hover` | `#316868` | 按鈕 hover 狀態 |

---

## 11. 開發流程建議

### 新增一個功能的標準流程

```
1. 確認功能屬於哪個頁面
   → 找到 pages/xxx.html（HTML 結構）
   → 找到 js/pages/xxx.js（互動邏輯）

2. 需要新資料？
   → 先在 data/*.json 新增測試資料
   → 確認 api-mock.js 的對應函數能讀到資料

3. 寫 HTML 結構
   → 先在 HTML 刻好靜態版面（不用管 JS）

4. 寫 CSS 樣式
   → 純樣式 → components.scss 或 layout.scss
   → 顏色/間距用 variables.scss 的變數，不要直接寫死顏色值

5. 寫 JS 邏輯
   → 在對應的 pages/xxx.js 實作
   → 全局功能（Toast、Modal、購物車）直接呼叫 window.xxx() 函數

6. 測試
   → 手機瀏覽器或 DevTools 手機模式測試 RWD
```

### 修改 SCSS 樣式的流程

目前 `storefront/css/main.css` 是「已編譯好的 CSS」，瀏覽器讀的是這個：

- **方法 A（直接改 main.css）**：快速但不建議長期使用，下次編譯 SCSS 會被覆蓋
- **方法 B（改 .scss 後編譯）**：正確做法
  ```bash
  # 安裝 sass（只需一次）
  npm install -g sass
  
  # 在 css/ 目錄下執行，把 main.scss 編譯成 main.css
  sass main.scss main.css
  
  # 或開啟監聽模式（改 scss 自動重新編譯）
  sass --watch main.scss:main.css
  ```

---

## 12. 常見問題 FAQ

**Q：為什麼 JSON 資料讀不到？出現 CORS 錯誤？圖片／連結也壞掉？**  
A：不能直接點兩下開 HTML 檔案。要用本機伺服器，且**網站根必須是 `frontend/`**：
- **推薦：** 在 `frontend/` 執行 `npm run dev`（Vite）
- Live Server：請在 **`frontend/` 資料夾**上右鍵 → Open with Live Server（不要從 repo 根 `Yuruicamp/` 開）
- 或：`cd frontend` 後執行 `python -m http.server 8000`

若從 repo 根開啟，瀏覽器會去找 `/data`、`/assets`（根目錄已沒有這些資料夾）→ 假資料與圖片全部 404。

---

**Q：我改了 JS，但頁面沒有變化？**  
A：按 `Ctrl + Shift + R`（強制清除快取重整），或開 DevTools → Network → 勾選 Disable Cache。

---

**Q：加入購物車沒反應？**  
A：打開 DevTools → Console，看有沒有錯誤訊息。常見原因：
1. 商品資料的 `id` 欄位是 undefined → 檢查 `data/products.json` 的 id 欄位
2. `window.addToCart` 未載入 → 確認 HTML 有引入 `storefront/js/components/cart.js`

---

**Q：Header 導覽列在手機上點了沒反應？**  
A：確認 HTML 有引入 `storefront/js/components/header.js`，且 CSS 的 `.navbar-offcanvas` 樣式有正確載入。

---

**Q：要怎麼換掉 Mock 假資料，接真實後端？**  
A：只需改一個檔案：`storefront/js/api-mock.js`。  
把每個函數裡的 `fetch('../data/xxx.json')` 改成 `fetch(AppConfig.API_BASE_URL + '/xxx')`。  
頁面 JS 完全不需要動，因為它們都是透過 `window.API.xxx()` 呼叫，不管底層怎麼實作。

---

**Q：新頁面要怎麼設定？**  
A：複製任一現有的 `storefront/pages/*.html`，修改 `<title>` 和 body 內容，並在底部把頁面 JS 換成你的新 JS 檔案。注意 `<script src>` 的相對路徑要用 `../js/` 開頭（因為在 pages/ 子目錄下）。

---

**Q：後台登入一直跳回登入頁？**  
A：後台使用 `sessionStorage` 儲存登入狀態，關閉分頁後會自動清除。確認：
1. 是否直接開啟 `admin/dashboard.html` 而沒有先登入？→ 要從 `admin/login.html` 進入
2. 員工 ID 是否正確？Demo 使用 `01`（老闆）或 `02`（員工），密碼任意非空即可
3. 瀏覽器是否開了無痕模式（某些無痕設定會阻擋 `sessionStorage`）？→ 改用一般模式
4. 打開 DevTools → Application → Session Storage，確認有以下 key：
   - `adminLoggedIn: "true"`
   - `adminId`、`adminName`、`isSuperAdmin`、`adminPermissions`

---

**Q：後台圖表（Chart.js）顯示空白或報錯？**  
A：常見原因有三個：
1. **CDN 載入失敗**：確認網路連線正常，`dashboard.html` 有引入 `chart.js` CDN script
2. **`<canvas>` id 不符**：`analytics.html` 裡的 canvas id 要與 `analytics.js` 的 `getElementById()` 完全一致
3. **資料讀取失敗**：打開 DevTools → Console，若看到 `fetch` 相關錯誤，確認以本機伺服器啟動（同 JSON CORS 問題）

---

**Q：後台操作（出貨、庫存修改、回覆評論）重新整理後消失了？**  
A：後台 Mock 模式下，狀態變更存在 `window.*Cache` 與 localStorage overlay（`mockOrders` / `mockBookings` / `mockReviews`）。重整後 overlay 仍保留；種子資料來自 `/data/**` JSON。  
若想保留修改，可將資料手動寫入對應的 JSON 檔案，或日後接入真實後端。

---

**Q：如何新增一張優惠券？**  
A：有兩種方法：
- **方法 A（直接改 JSON）**：打開 `data/promotions/coupons.json`，複製一筆資料，改 `code`（優惠碼）、`discount`（折扣金額），存檔後重新整理後台
- **方法 B（後台 UI）**：在後台「折扣管理」模組填寫表單 → 點「新增優惠券」，這個操作是前端即時新增（存在記憶體，重整消失，同上方說明）

---

**Q：商城、booking、後台共用同一份資料嗎？**  
A：是。三者都讀 `/data/**`（`storefront/js/data-paths.js`）。前台結帳/評價/預約會寫入 localStorage overlay，後台載入 seed 後會 merge 顯示。

---  
A：這是權限設計的正常行為。Demo 員工 `02` 的 `adminPermissions` 可能沒有某些 section 的 `view: true`，Sidebar 會灰階 disabled。用 `01`（超級管理員）登入可看到全部功能；或在「權限管理」模組調整員工權限。

**Q：`localStorage.adminEmployees` 被清掉了怎麼辦？**  
A：重新整理 `admin/login.html` 或 `admin/dashboard.html`，`permissions.js` 的 `seedEmployeesIfNeeded()` 會自動重建 Demo 種子（員工 `01`、`02`）。

### 預約子系統資料（共用 `/data/catalog`）

| 檔案 | 說明 |
|------|------|
| `data/catalog/campgrounds.json` | 可預約營區 C002–C009 |
| `data/catalog/camp-equipment.json` | 各營區裝備 catalog（camelCase） |

> 💡 新增營區：編輯 `campgrounds.json`，`campgroundId` 使用 C010 起（勿用 C001，保留給租借主倉）。

---

---

## 13. 賣家後台 → `admin/`

> 賣家後台有自己的樣式（`admin/css`）與功能 JS（`admin/js`），但**假資料共用** `frontend/data/`，  
> 並會載入共用腳本（如 `../js/data-paths.js`、`validators.js`、`booking-api.js`）。  
> 目前共 **9 個功能模組**，含逐頁 **view / edit 權限**（RBAC Mock）。

### 後台登入流程

```
使用者開啟 admin/login.html
  ↓ 輸入員工 ID + 密碼
      Demo：ID「01」（老闆 / 超級管理員）或「02」（示範員工）
      密碼：任意非空字串即可（Mock 不驗證密碼內容）
  ↓ permissions.js 從 localStorage.adminEmployees 查詢員工
      若 ID 不存在或 isActive === false → 顯示錯誤，不登入
  ↓ 寫入 sessionStorage（5 個 key）：
      adminLoggedIn      = "true"
      adminId            = 員工 ID（例："01"）
      adminName          = 顯示名稱（例："王老板"）
      isSuperAdmin       = "true" | "false"
      adminPermissions   = JSON 字串（各 section 的 view/edit 權限）
  ↓ 0.8 秒後跳轉 admin/dashboard.html

admin/dashboard.html 載入時
  ↓ core.js 執行 Auth 守衛
      若 sessionStorage.adminLoggedIn !== "true"
      → 立即跳回 admin/login.html
  ↓ applySidebarPermissions()：無 view 權限的 Sidebar 連結灰階 disabled
  ↓ getDefaultSection()：載入第一個有 view 權限的模組（非固定 analytics）
  ↓ 使用者點 Sidebar → loadSection() 動態載入 partial + initXxx()

登出
  ↓ 點 Sidebar 底部或 Topbar 頭像 → 「登出」
  ↓ clearAdminSession() 清除 5 個 sessionStorage key
  ↓ 跳回 admin/login.html
```

> 💡 **為什麼用 sessionStorage 而不是 localStorage？**  
> 登入狀態需在關閉分頁後清除；員工主檔則持久存在 `localStorage.adminEmployees`（由 `permissions.js` 種子初始化）。

---

### 後台架構：動態載入 Partial

後台採用**單頁框架（Single Page Architecture）**：
- `dashboard.html` 是不變的外殼（Sidebar + Topbar + 空白的 `#contentArea`）
- 點擊 Sidebar 時，`core.js` 的 `loadSection()` 用 jQuery `$.load()` 把對應的 `partials/xxx.html` 注入 `#contentArea`
- 載入前先檢查 `canView(sectionName)`；無權限則 Toast 提示並阻擋
- 注入完成後，呼叫對應模組的 `initXxx()`，再執行 `applyEditPermission()` 停用無 edit 權限的按鈕

```javascript
// core.js 的 loadSection() 運作方式（簡化版）
function loadSection(sectionName) {
  if (!window.canView(sectionName)) {
    window.showAdminToast('您沒有查看權限', 'error');
    return;
  }
  $('#contentArea').load(`partials/${sectionName}.html`, function () {
    const initFunctions = {
      analytics:   window.initAnalytics,
      orders:      window.initOrders,
      movement:    window.initMovement,
      products:    window.initProducts,
      customers:   window.initCustomers,
      discounts:   window.initDiscounts,
      reviews:     window.initReviews,
      bookings:    window.initBookings,
      permissions: window.initPermissions,
    };
    if (typeof initFunctions[sectionName] === 'function') {
      initFunctions[sectionName]();
    }
    window.applyEditPermission(sectionName, $('#contentArea'));
  });
}
```

---

### 九大功能模組

| 模組名稱 | Partial HTML | JS 檔案 | 資料來源 | 主要功能 |
|---------|-------------|---------|---------|---------|
| 分析報表 | `partials/analytics.html` | `storefront/js/analytics.js` | `orders.json` + `products.json` | KPI、待出貨、低庫存預警（`total-stock < 5`）、Chart.js 圖表 |
| 訂單管理 | `partials/orders.html` | `storefront/js/orders.js` | `orders.json` | 訂單表格、狀態篩選、標記出貨、詳情 Modal |
| 庫存異動紀錄 | `partials/movement.html` | `storefront/js/movement.js` | `movement.json` | 異動主檔列表、點 ID 開啟明細 Modal |
| 商品與庫存 | `partials/products.html` | `storefront/js/products.js` | `catalog/products.json` + `admin/rental-skus.json` | 商店/租借雙頁籤、總庫存+分店庫存編輯、生產異動紀錄、新增商品 Modal |
| 客戶管理 | `partials/customers.html` | `storefront/js/customers.js` | `customers.json` | Accordion、等級/點數/優惠券行內編輯 |
| 折扣管理 | `partials/discounts.html` | `storefront/js/discounts.js` | `coupons.json` | 優惠券 CRUD、隨機碼產生 |
| 評論管理 | `partials/reviews.html` | `storefront/js/reviews.js` | `reviews.json` | 評論卡片、星等篩選、回覆 |
| 預約/租借管理 | `partials/bookings.html` | `storefront/js/bookings.js` | `commerce/camp-bookings.json` | 預約單表格、確認/取消/完成、裝備歸還勾選 |
| 權限管理 | `partials/permissions.html` | `storefront/js/permissions.js` | `localStorage.adminEmployees` | 員工 CRUD、逐頁 view/edit 勾選、超級管理員 |

> 💡 9 個 section 的順序與標題定義在 `permissions.js` 的 `window.ADMIN_SECTIONS`。

---

### 後台 CSS 變數

後台設計 Token 定義在 `admin/css/admin.css` 的 `:root` 區塊：

```css
:root {
  /* Sidebar 配色 */
  --admin-sidebar-bg:            #1e2329;
  --admin-sidebar-text:          #c9d1d9;
  --admin-sidebar-active-border: #244d4d;  /* 選中左側邊框 */
  --admin-sidebar-active-bg:     rgba(36, 77, 77, 0.25);

  /* 品牌 Accent 色 */
  --admin-brand-accent:          #244d4d;  /* 按鈕、連結、強調色 */

  /* 內容區 */
  --admin-content-bg:            #f0f2f5;
}
```

> 💡 若要更換後台主題色，修改 `--admin-brand-accent` 與 Sidebar 相關變數即可。

---

### 後台 JS 共用函數

**`admin/js/core.js`（Auth、載入、Toast、權限）**

```javascript
window.showAdminToast(message, type)   // Toast：success | error | info
loadSection(name)                      // 載入 partial + initXxx()

window.canView(section)                // 是否有該頁查看權限
window.canEdit(section)                // 是否有該頁編輯權限
window.getAdminPermissions()           // 解析 sessionStorage.adminPermissions
window.applySidebarPermissions()       // Sidebar 灰階 / disabled
window.applyEditPermission(section, $container)  // 停用編輯按鈕
window.getDefaultSection()             // 第一個有 view 權限的 section
```

**`admin/js/permissions.js`（員工資料層）**

```javascript
window.fetchEmployees()                // 讀取 localStorage.adminEmployees
window.findEmployeeById(id)            // 登入時查詢員工
window.initPermissions()               // 權限管理頁初始化
```

`loadSection(name)` 可接受的 `name`：  
`'analytics' | 'orders' | 'movement' | 'products' | 'customers' | 'discounts' | 'reviews' | 'bookings' | 'permissions'`

---

### 新增一個後台功能模組（標準流程）

```
1. 在 admin/partials/ 新增 xxx.html（只寫內容區 HTML）

2. 在 admin/js/ 新增 xxx.js：
   window.initXxx = function() { /* 讀 JSON、渲染、綁事件 */ }

3. 在 admin/dashboard.html：
   a. Sidebar 加 <a data-section="xxx" data-title="...">
   b. 底部 <script> 引入 xxx.js

4. 在 admin/js/core.js 的 initFunctions 字典加入 xxx: window.initXxx

5. 在 admin/js/permissions.js：
   a. ADMIN_SECTIONS 陣列加入 { key: 'xxx', label: '...' }
   b. EDIT_PERMISSION_SELECTORS 加入 xxx 的編輯按鈕選擇器

6. （可選）在 `/data/**` 新增 JSON，並於 `storefront/js/data-paths.js` 登錄路徑
```

---

## 14. 預約子系統 → `booking/`

> 預約子系統有自己的 `booking/pages`、`booking/js`、`booking/css`，  
> 但會共用 `frontend/components`（header/footer partial）、`frontend/js`（data-paths、booking-api、modal…）與 `/data/**`。

### 與買家前台 / 賣家後台的對照

| 項目 | 買家前台 | 賣家後台 | 預約子系統 |
|------|---------|---------|---------|
| HTML 頁面路徑 | `storefront/pages/` | `admin/` | `booking/` |
| JS 路徑 | `storefront/js/` | `admin/js/` | `booking/js/` |
| CSS 路徑 | `storefront/css/main.css` | `admin/css/admin.css` | `booking/css/booking.css` |
| Mock 資料路徑 | `/data/**`（`storefront/js/data-paths.js`） | 同左（AdminAPI） | 同左（BookingAPI） |
| Header/Footer 元件 | `components/header.html` | 無（Sidebar 取代）| `booking/components/booking-header.html` |
| 購物車儲存 | `localStorage.cart` | sessionStorage | `localStorage.bookingCart` |
| 主要技術 | Vanilla JS | jQuery + Bootstrap 5 | jQuery + Flatpickr |

### 預約流程

```
使用者點擊買家端「🏕️ 預約」按鈕
  ↓
booking/pages/camp-search.html（搜尋 + 篩選營區）
  ↓ 點擊「查看詳情」
booking/pages/camp-detail.html（選日期、選營位 → 寫入 localStorage.bookingCart）
  ↓ 點擊「下一步：選擇租借裝備」
booking/pages/camp-rental.html（加選裝備 → 更新 bookingCart.selected_rentals）
  ↓ 點擊「確認預約結帳」
booking/pages/booking-cart.html（確認明細 + 填聯絡資訊 → 送出預約 → 清除 bookingCart）
  ↓ 結帳成功後
導購按鈕 → pages/products.html（引導購買裝備）
```

### LocalStorage `bookingCart` 資料結構

```json
{
  "booking_info": {
    "campground_id":   "C001",
    "campground_name": "雲海仙境露營區",
    "check_in":        "2026-06-19",
    "check_out":       "2026-06-21",
    "total_days":      2,
    "weekday_count":   1,
    "holiday_count":   1,
    "guest_count":     4
  },
  "selected_zones": [
    { "zone_id": "Z001", "zone_type": "草皮區", "quantity": 1, "subtotal": 2500 }
  ],
  "selected_rentals": [
    { "equipment_id": "E001", "name": "極限防水黑膠帳篷", "quantity": 1, "subtotal": 1200 }
  ],
  "summary": {
    "zone_total":       2500,
    "rental_total":     1200,
    "applied_discount": 100,
    "final_amount":     3700
  }
}
```

> 💡 各頁面讀寫時機：
> - `camp-detail.html` → **寫入** `booking_info` + `selected_zones`
> - `camp-rental.html` → **讀取** `campground_id`，**更新** `selected_rentals` + `summary`
> - `booking-cart.html` → **讀取** 全部，**結帳後清除**

### Header/Footer 獨立說明

> ⚠️ **重要**：預約系統的 Header/Footer 與買家端**完全分開**，絕對禁止用 jQuery `.load()` 去抓取買家端的 `../components/header.html`。

| 項目 | 買家端 | 預約端 |
|------|--------|--------|
| Header 背景色 | `#f6fbf6`（淺綠白）| `#F2F0EB`（淺大地米色）|
| Footer 背景色 | `#244d4d`（深青綠）| `#244d4d`（相同）|
| Logo 副標題 | 無 | `｜ 營地預約`（`color: #7a8a82`，`0.75rem`）|
| 購物車 Badge | 電商購物車（`localStorage.cart`）| 預約背包（`localStorage.bookingCart`）|

各頁面的載入方式：

```html
<!-- 各 booking/*.html 頁面的 Header 載入方式 -->
<div id="booking-header"></div>
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<script>
  $(function () {
    // 注意：載入的是預約系統專屬元件，不是 ../components/header.html
    $('#booking-header').load('./components/booking-header.html');
    $('#booking-footer').load('./components/booking-footer.html');
  });
</script>
```

### 新增一個預約系統頁面（標準流程）

```
1. 在 booking/ 新增 xxx.html（使用 booking-header/footer 載入模板）

2. 在 booking/js/ 新增 xxx.js，使用 jQuery $(document).ready() 初始化

3. 如有新的 Mock 資料需求，在 `/data/**` 新增 JSON，並於 `storefront/js/data-paths.js` 登錄（勿再新增 `booking/data/`）

4. 在 booking/components/booking-header.html 的導覽列加入新頁面連結

5. 如有新樣式，在 booking/css/booking.css 末尾新增對應 class
```

> 💡 **後台預約管理**：種子資料為 `data/commerce/camp-bookings.json`（`DataPaths.campBookings`）。前台流程用 `localStorage.bookingCart`；結帳後寫入 `mockBookings` overlay，後台載入時 merge 顯示。

---

**最後更新**：2026/07/09  
**對應版本**：假資料整合後（見 `plans/data-integration-spec.md`）
