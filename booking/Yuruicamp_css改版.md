# Yuruicamp｜css 全站改版規格
## 奶油鼠尾草 × 輕度莫蘭迪 × 柔霧赤陶導購

> 請以「不破壞既有 HTML 結構、JavaScript 行為與響應式版面」為最高原則，將目前網站統一成 Yuruicamp 的全站品牌設計系統。

---

# 一、遵守的修改原則

在修改  前，請先完整閱讀原始 CSS，確認：

1. 現有 CSS Variables
2. Header、Footer、Hero、Button、Card、Form 等共用選擇器
3. 是否存在 Bootstrap 或其他框架覆寫
4. 是否有 JavaScript 依賴的 class
5. 是否有頁面專屬 class
6. Media Query 與手機版規則
7. Hover、Focus、Active、Disabled 狀態
8. 是否有重複或互相覆蓋的色碼

修改時必須遵守：

- 不任意更改 HTML class 名稱
- 不刪除 JavaScript 需要的 selector
- 不更改 DOM 結構
- 不破壞 Grid、Flex、Position 與版面尺寸
- 不任意刪除既有 Media Query
- 不把全部顏色直接全域搜尋取代
- 優先建立 Design Tokens，再將元件改為使用變數
- 保留既有功能，只重新整理視覺系統
- 發現無法判斷用途的 selector 時，先保留並加註解
- 修改後需列出主要變更內容

---

# 二、最終設計方向

Yuruicamp 的最終定位：

```text
舒服、有呼吸感、帶有輕度莫蘭迪質感，
但在搜尋、預訂、加入購物車與結帳時有明確導購力。
```

不是：

```text
極度灰暗的莫蘭迪網站
全綠色的安靜形象網站
深咖啡與軍綠的傳統戶外網站
高飽和橘色的促銷型商城
```

整體設計語言：

> **奶油暖白 × 奶油鼠尾草綠 × 柔霧赤陶 × 日系生活感**

色彩分工：

```text
奶油色：舒服、空間、內容承載
鼠尾草綠：品牌、探索、信任、導覽
柔霧赤陶：搜尋、預訂、購買、結帳
```

核心原則：

> **背景可以安靜，主要行動不能安靜。**

---

# 三、目標色標 Design Tokens

請將以下變數放到 `main.css` 最前方的 `:root`。

```css
:root {
  /* ==================================================
     Yuruicamp v3 — Base / Cream
     ================================================== */

  --yc-bg: #F8F5EE;
  --yc-surface: #FFFDF9;
  --yc-surface-soft: #F0ECE3;
  --yc-oat: #E8E0D5;
  --yc-border: #D8CFC3;

  /* ==================================================
     Yuruicamp v3 — Sage Brand
     ================================================== */

  --yc-sage-mist: #EEF2EC;
  --yc-sage-soft: #DCE5DA;
  --yc-sage-light: #B7C3B3;
  --yc-sage: #8F9D8B;
  --yc-sage-action: #73816E;
  --yc-sage-dark: #62705D;

  /* ==================================================
     Yuruicamp v3 — Conversion CTA
     柔霧赤陶：介於陶土橘與咖啡棕之間
     ================================================== */

  --yc-cta: #A96352;
  --yc-cta-hover: #925342;
  --yc-cta-active: #7E4638;
  --yc-cta-soft: #F3E5DE;
  --yc-cta-line: #C38E7C;

  /* ==================================================
     Yuruicamp v3 — Text
     ================================================== */

  --yc-text: #3E473D;
  --yc-text-secondary: #625E56;
  --yc-text-muted: #7B756D;

  /* ==================================================
     Yuruicamp v3 — Status
     ================================================== */

  --yc-success: #73816E;
  --yc-success-soft: #EEF2EC;
  --yc-warning: #9A7455;
  --yc-warning-soft: #F4ECE2;
  --yc-error: #A65F58;
  --yc-error-soft: #F4E7E4;

  /* ==================================================
     Yuruicamp v3 — Header / Footer
     ================================================== */

  --yc-header-bg: #73816E;
  --yc-footer-bg: #71806D;
  --yc-footer-bottom: #62705D;
  --yc-on-dark: #FFFDF9;
  --yc-on-dark-muted: rgba(255, 253, 249, 0.76);

  /* ==================================================
     Yuruicamp v3 — Shadow
     ================================================== */

  --yc-shadow-soft: 0 5px 20px rgba(60, 70, 59, 0.065);
  --yc-shadow-hover: 0 16px 38px rgba(60, 70, 59, 0.13);
  --yc-shadow-cta: 0 9px 24px rgba(126, 70, 56, 0.17);

  /* ==================================================
     Yuruicamp v3 — Radius
     ================================================== */

  --yc-radius-sm: 10px;
  --yc-radius-control: 12px;
  --yc-radius-button: 12px;
  --yc-radius-card: 19px;
  --yc-radius-section: 24px;
  --yc-radius-pill: 999px;

  /* ==================================================
     Yuruicamp v3 — Spacing
     ================================================== */

  --yc-space-1: 4px;
  --yc-space-2: 8px;
  --yc-space-3: 12px;
  --yc-space-4: 16px;
  --yc-space-5: 24px;
  --yc-space-6: 32px;
  --yc-space-7: 48px;
  --yc-space-8: 64px;
  --yc-space-9: 80px;
  --yc-space-10: 96px;

  /* ==================================================
     Yuruicamp v3 — Typography
     ================================================== */

  --yc-font-heading: "Noto Serif TC", "Source Han Serif TC", serif;
  --yc-font-body: "Noto Sans TC", "Source Han Sans TC", sans-serif;

  /* ==================================================
     Yuruicamp v3 — Motion
     ================================================== */

  --yc-duration-fast: 180ms;
  --yc-duration-normal: 220ms;
  --yc-ease-soft: cubic-bezier(.2, .7, .2, 1);
}
```

---

# 四、色彩使用比例

全站建議比例：

```text
45% 奶油暖白與內容留白
25% 極淺鼠尾草與奶油鼠尾草區塊
12% 中階品牌綠
8% 燕麥、亞麻與霧米色
5% 深灰綠文字
5% 柔霧赤陶 CTA
```

注意：

- 不要將 25% 綠色全部做成深綠
- 品牌感主要靠淺綠區塊反覆出現
- 深綠只放在 Header、品牌按鈕、局部標題與 Footer
- 赤陶色只用在真正的重要行動

---

# 五、全站背景與文字

請將全站主要背景統一為：

```css
body {
  background: var(--yc-bg);
  color: var(--yc-text);
  font-family: var(--yc-font-body);
}
```

主要標題：

```css
h1,
h2,
h3,
.section-title,
.page-title {
  color: var(--yc-text);
  font-family: var(--yc-font-heading);
  font-weight: 600;
}
```

一般內文：

```css
p,
.body-text,
.description {
  color: var(--yc-text-secondary);
}
```

輔助資訊：

```css
small,
.muted,
.helper-text,
.meta {
  color: var(--yc-text-muted);
}
```

禁止：

- 使用純黑 `#000000`
- 大量使用 `#333333`
- 暖白背景上使用過淺灰字
- 將標題改成咖啡棕色

---

# 六、Header 設計定調

Header 使用中階鼠尾草森林綠，不使用深灰悶綠。

```css
.site-header,
.main-header,
header {
  background: rgba(115, 129, 110, 0.96);
  color: var(--yc-on-dark);
  border-bottom: 1px solid rgba(255, 253, 249, 0.14);
  backdrop-filter: blur(14px);
}
```

Logo：

```css
.logo,
.site-logo,
.brand {
  color: var(--yc-on-dark);
}
```

導覽：

```css
.nav-link,
.main-nav a {
  color: rgba(255, 253, 249, 0.82);
}

.nav-link:hover,
.nav-link.active,
.main-nav a:hover,
.main-nav a.active {
  color: var(--yc-on-dark);
}
```

Header 中最多一顆赤陶 CTA：

```css
.header-cta {
  background: var(--yc-cta);
  color: var(--yc-on-dark);
  border: 1px solid var(--yc-cta);
}
```

禁止：

- Header 使用 `#566452` 這類過深灰綠
- 導覽 Active 使用黃色或咖啡色
- 搜尋、會員、收藏、購物車 Icon 使用赤陶色
- Header 同時出現多顆赤陶色按鈕

---

# 七、Hero 設計定調

Hero 應保留：

- 奶油色遮罩
- 生活情境圖片
- 清楚的主標題
- 一顆主要 CTA
- 一顆次要 CTA 或搜尋列

建議遮罩：

```css
.hero::before,
.hero-banner::before {
  background: linear-gradient(
    90deg,
    rgba(248, 245, 238, 0.95) 0%,
    rgba(248, 245, 238, 0.78) 38%,
    rgba(248, 245, 238, 0.12) 70%
  );
}
```

Hero 主要 CTA：

```css
.hero .btn-primary,
.hero .btn-cta,
.hero-search-button {
  background: var(--yc-cta);
  color: var(--yc-on-dark);
}
```

Hero 次要 CTA：

```css
.hero .btn-secondary {
  background: var(--yc-surface);
  color: var(--yc-sage-action);
  border: 1px solid var(--yc-sage);
}
```

---

# 八、按鈕分級規範

## 8.1 第一層：Conversion CTA

只用於：

- 搜尋
- 立即預訂
- 查看可訂日期
- 加入購物車
- 立即購買
- 前往結帳
- 完成付款
- 送出表單
- 訂閱電子報

```css
.btn-cta,
.btn-primary.is-conversion,
.btn-book,
.btn-checkout,
.btn-add-cart {
  min-height: 46px;
  padding: 0 20px;
  border-radius: var(--yc-radius-button);
  background: var(--yc-cta);
  color: var(--yc-on-dark);
  border: 1px solid var(--yc-cta);
  box-shadow: var(--yc-shadow-cta);
  font-weight: 700;
  transition:
    background-color var(--yc-duration-normal) var(--yc-ease-soft),
    border-color var(--yc-duration-normal) var(--yc-ease-soft),
    transform var(--yc-duration-normal) var(--yc-ease-soft);
}
```

Hover：

```css
.btn-cta:hover,
.btn-primary.is-conversion:hover,
.btn-book:hover,
.btn-checkout:hover,
.btn-add-cart:hover {
  background: var(--yc-cta-hover);
  border-color: var(--yc-cta-hover);
  transform: translateY(-1px);
}
```

Active：

```css
.btn-cta:active,
.btn-primary.is-conversion:active {
  background: var(--yc-cta-active);
  border-color: var(--yc-cta-active);
  transform: translateY(0);
}
```

---

## 8.2 第二層：Brand Action

用於：

- 查看詳情
- 探索組合
- 閱讀指南
- 查看文章
- 了解更多
- 修改條件

```css
.btn-brand,
.btn-primary:not(.is-conversion) {
  background: var(--yc-sage-action);
  color: var(--yc-on-dark);
  border: 1px solid var(--yc-sage-action);
}
```

Hover：

```css
.btn-brand:hover,
.btn-primary:not(.is-conversion):hover {
  background: var(--yc-sage-dark);
  border-color: var(--yc-sage-dark);
}
```

---

## 8.3 第三層：Secondary Button

```css
.btn-secondary,
.btn-outline {
  background: var(--yc-surface);
  color: var(--yc-sage-action);
  border: 1px solid var(--yc-sage);
}
```

Hover：

```css
.btn-secondary:hover,
.btn-outline:hover {
  background: var(--yc-sage-soft);
}
```

---

## 8.4 第四層：Soft Conversion

用於大量商品卡、營區卡中的重複轉換按鈕。

```css
.btn-conversion-soft {
  background: var(--yc-cta-soft);
  color: var(--yc-cta);
  border: 1px solid var(--yc-cta-line);
}
```

Hover：

```css
.btn-conversion-soft:hover {
  background: var(--yc-cta);
  color: var(--yc-on-dark);
  border-color: var(--yc-cta);
}
```

使用原則：

- 熱門卡片可直接使用實心 CTA
- 一般卡片預設使用 Soft Conversion
- Hover 時才轉為實心
- 避免整頁都是赤陶實心按鈕

---

# 九、CTA 數量限制

同一個視覺區塊：

```text
最多 1 顆實心赤陶 CTA
最多 1 顆綠色或外框次要按鈕
```

商品列表或營區列表：

```text
一般卡片：
查看詳情 → 綠框
加入購物車／查看日期 → 淡赤陶

熱門卡片：
查看詳情 → 綠框
立即預訂／立即購買 → 實心赤陶
```

禁止：

- 每張卡片放兩顆實心深色按鈕
- 「查看詳情」使用赤陶色
- 「重設篩選」使用赤陶色
- 「取消」使用赤陶 CTA

---

# 十、Card 設計定調

一般卡片：

```css
.card,
.product-card,
.camp-card,
.article-card {
  background: var(--yc-surface);
  border: 1px solid rgba(216, 207, 195, 0.82);
  border-radius: var(--yc-radius-card);
  box-shadow: var(--yc-shadow-soft);
  transition:
    transform var(--yc-duration-normal) var(--yc-ease-soft),
    box-shadow var(--yc-duration-normal) var(--yc-ease-soft),
    border-color var(--yc-duration-normal) var(--yc-ease-soft);
}
```

Hover：

```css
.card:hover,
.product-card:hover,
.camp-card:hover,
.article-card:hover {
  transform: translateY(-4px);
  border-color: var(--yc-sage-light);
  box-shadow: var(--yc-shadow-hover);
}
```

圖片 Hover：

```css
.card img,
.product-card img,
.camp-card img {
  transition: transform 420ms var(--yc-ease-soft);
}

.card:hover img,
.product-card:hover img,
.camp-card:hover img {
  transform: scale(1.025);
}
```

禁止：

- 黑色厚陰影
- 所有卡片使用純白 `#FFFFFF`
- 所有分類卡片使用同一個顏色
- 過大的浮動動畫

---

# 十一、分類與導購區塊

請增加淺鼠尾草背景在全站中的可見面積。

可用於：

- 新手指南
- 快速分類
- 租借流程
- 品牌故事
- 信任資訊
- FAQ 提示
- 會員福利
- 最後導購區

```css
.section-sage {
  background: var(--yc-sage-mist);
}
```

較明顯版本：

```css
.section-sage-strong {
  background: var(--yc-sage-soft);
}
```

區塊節奏建議：

```text
奶油
→ 淺鼠尾草
→ 奶油
→ 暖白
→ 淺鼠尾草
→ 奶油
→ Footer
```

---

# 十二、標籤設計

一般品牌標籤：

```css
.tag,
.badge,
.chip {
  background: var(--yc-sage-mist);
  color: var(--yc-sage-dark);
  border: 1px solid rgba(143, 157, 139, 0.42);
}
```

適用：

```text
新手友善
森林系
適合家庭
輕鬆好收
一人也適合
```

暖色標籤：

```css
.tag-hot,
.badge-featured {
  background: var(--yc-cta-soft);
  color: #815445;
  border: 1px solid rgba(169, 99, 82, 0.34);
}
```

只用於：

```text
本週熱門
即將額滿
推薦搭配
限時可訂
```

---

# 十三、Form 設計定調

一般欄位：

```css
input,
select,
textarea,
.form-control {
  background: var(--yc-surface);
  color: var(--yc-text);
  border: 1px solid var(--yc-border);
  border-radius: var(--yc-radius-control);
}
```

Focus：

```css
input:focus,
select:focus,
textarea:focus,
.form-control:focus {
  outline: none;
  border-color: var(--yc-sage);
  box-shadow: 0 0 0 3px rgba(143, 157, 139, 0.17);
}
```

Checkbox 與 Radio：

```css
input[type="checkbox"],
input[type="radio"] {
  accent-color: var(--yc-sage-action);
}
```

錯誤：

```css
.is-invalid,
.form-error {
  border-color: var(--yc-error);
  background: var(--yc-error-soft);
}
```

---

# 十四、搜尋與篩選頁

搜尋按鈕：

```text
柔霧赤陶實心
```

篩選 Checkbox：

```text
鼠尾草綠
```

價格滑桿：

```text
#73816E
```

重設篩選：

```text
暖白底＋綠框
```

結果卡片：

- 查看詳情：綠框
- 查看可訂日期：淡赤陶
- 熱門營區立即預訂：實心赤陶
- 信任資訊：淺綠或綠色文字

---

# 十五、商品頁與購物流程

## 商品分類

- 白色商品卡
- 淺綠分類入口
- 綠色篩選
- 淡赤陶加入購物車
- Hover 轉實心赤陶

## 商品詳情

```text
立即購買 → 實心赤陶
加入購物車 → 淡赤陶或赤陶外框
收藏 → 綠框或 Icon
查看搭配 → 綠色
```

不要兩顆交易按鈕都使用實心深色。

## 購物車

```text
前往結帳 → 實心赤陶
繼續購物 → 綠框
套用優惠碼 → 綠色
刪除 → 柔磚紅文字
```

## 結帳

```text
完成付款 → 實心赤陶
返回購物車 → 文字或綠框
安全付款資訊 → 淺鼠尾草背景
```

---

# 十六、Footer 設計定調

主 Footer：

```css
.site-footer,
.main-footer,
footer {
  background: var(--yc-footer-bg);
  color: var(--yc-on-dark);
}
```

Footer Bottom：

```css
.footer-bottom {
  background: var(--yc-footer-bottom);
  color: rgba(255, 253, 249, 0.66);
}
```

一般文字：

```css
.site-footer p,
.site-footer a,
.footer-text {
  color: var(--yc-on-dark-muted);
}
```

社群按鈕預設：

```css
.social-link {
  color: var(--yc-on-dark);
  background: transparent;
  border: 1px solid rgba(255, 253, 249, 0.38);
}
```

Hover：

```css
.social-link:hover {
  background: var(--yc-on-dark);
  color: var(--yc-cta);
  border-color: var(--yc-on-dark);
}
```

禁止：

- Footer 主背景使用過深 `#566452`
- 深綠背景搭配暗咖啡 Icon
- 黃銅色社群 Icon
- 社群 Icon 永久使用赤陶色

---

# 十七、圖片與視覺素材

圖片建議比例：

```text
奶油與亞麻：35%–45%
自然綠：30%–40%
木質暖色：15%–20%
赤陶暖色：5% 以下
```

圖片應出現：

- 鼠尾草綠椅子
- 灰綠收納箱
- 綠色杯具
- 草地、森林與苔蘚
- 奶油帳篷
- 原木與亞麻
- 真實人物互動

避免：

- 圖片全部偏黃
- 圖片全部是咖啡棕與木頭
- 鮮橘帳篷
- 黑色戰術露營
- 高對比 HDR
- 冷藍色棚拍

---

# 十八、手機版規範

請保留並優化既有 Media Query。

手機版：

- Header 64px–68px
- 隱藏次要導覽
- 保留 Logo、會員、購物袋
- 搜尋欄改為單欄或 2 欄
- 日期欄全寬
- 搜尋 CTA 全寬
- 按鈕高度至少 44px
- 商品與營區卡改為單欄
- Footer 改為單欄或 Accordion
- 不要讓深色區塊高度過高

---

# 十九、可及性要求

修改後必須確認：

- 文字與背景有足夠對比
- 重要 CTA 不只靠顏色表達
- `:focus-visible` 狀態清楚
- 按鈕至少 44px 高
- Icon Button 至少 40px × 40px
- Disabled 狀態清楚
- 錯誤訊息有文字
- 選中狀態有背景、邊框或 Icon 輔助
- 深綠背景的小字使用奶油白

---

# 二十、CSS 整理要求

Claude 修改 `main.css` 時，請同步：

1. 將散落的硬編碼色碼改為 Variables
2. 合併重複的 Button 規則
3. 合併重複的 Card 規則
4. 避免過多 `!important`
5. 不使用不存在的 CSS Variable
6. 不讓舊色碼覆蓋新 Token
7. 保留頁面專屬 class
8. 保留原有動畫與響應式功能
9. 對必要的相容性覆寫加註解
10. 將 Yuruicamp 全域規則集中放置

建議結構：

```css
/* 01. Design Tokens */
/* 02. Reset / Base */
/* 03. Typography */
/* 04. Layout */
/* 05. Header */
/* 06. Hero */
/* 07. Buttons */
/* 08. Forms */
/* 09. Cards */
/* 10. Tags / Status */
/* 11. Search / Filter */
/* 12. Product / Camp */
/* 13. Cart / Checkout */
/* 14. Footer */
/* 15. Utilities */
/* 16. Responsive */
```

---

# 二十一、不可接受的修改結果

以下任一情況都視為不合格：

- 全站仍看不出鼠尾草綠品牌色
- Header 與 Footer 都過深
- 所有 CTA 都變成咖啡棕
- 全部按鈕都使用同一顏色
- 所有區塊都變成灰白
- 页面因莫蘭迪化而失去對比
- 商品價格與主要 CTA 不明顯
- 修改 CSS 後破壞 JavaScript
- 手機版溢出或按鈕過小
- 大量使用 `!important`
- 直接刪除原本 selector
- 只替換色碼，沒有整理語意層級

---

# 二十二、完成後請 Claude 輸出

Claude 完成修改後，請提供：

1. 修改完成的完整 `main.css`
2. 新增或更動的 Design Tokens
3. 主要元件修改摘要
4. 未修改或無法確認的區域
5. 可能需要同步修改的其他 CSS 檔
6. HTML class 若有必要調整，請列出，但不要直接更動 HTML
7. 手機版與桌面版檢查結果
8. 是否仍有舊色碼未被整理

---

# 二十三、可直接貼給 Claude 的執行指令

以下文字可直接貼給 Claude，並附上你的 `main.css`：

```text
請完整閱讀我提供的 main.css，以及附上的「Yuruicamp｜main.css 全站改版規格」。

你的任務是：

1. 不改 HTML 結構、不改 class 名稱、不破壞 JavaScript 行為。
2. 保留既有版面、Grid、Flex、Responsive 與功能。
3. 在 :root 建立規格文件提供的 Yuruicamp Design Tokens。
4. 將現有顏色、按鈕、卡片、表單、Header、Footer 與互動狀態，整理成規格指定的：
   - 奶油暖白
   - 奶油鼠尾草綠
   - 輕度莫蘭迪
   - 柔霧赤陶導購
5. 柔霧赤陶只用於搜尋、預訂、加入購物車、結帳、送出與訂閱。
6. 綠色用於品牌、探索、閱讀、查看詳情、篩選與信任資訊。
7. 大量重複卡片中的購買／預訂按鈕，預設使用淡赤陶，Hover 才轉實心。
8. 增加淺鼠尾草綠區塊的品牌可見度，但不要增加深綠重量。
9. Footer 主區使用中階綠，Bottom Bar 才使用較深綠。
10. 保留並檢查所有 Media Query。
11. 避免大量使用 !important。
12. 完成後輸出完整 main.css，不要只給片段。
13. 最後列出：
    - 修改摘要
    - 尚未處理的 selector
    - 仍存在的硬編碼舊色碼
    - 建議同步修改的其他 CSS 檔案

請先分析現有 CSS 的結構，再開始改寫。不要只做全域色碼替換。
```

---

# 二十四、最終設計口訣

```text
奶油色負責舒服
鼠尾草綠負責品牌與探索
柔霧赤陶負責下一步
```

最終判斷標準：

> **使用者進站時覺得舒服，瀏覽時持續感受到 Yuruicamp，做決定時不需要猜該按哪裡。**
