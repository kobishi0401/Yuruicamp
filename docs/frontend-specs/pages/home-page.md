# 首頁 - Yuruicamp 露營選物


## 1. 頁面目的
買家首頁，用hero 標題加上短視頻吸引使用者視覺效果，預設立刻探索和露營指南兩個網頁入口，在hero 下方簡單的秀出合作品牌、新品、熱銷品。

這個頁面讓使用者可以：
- 前往`paegs/products.html`
- 前往`pages/blog.html`
- 以跑馬燈的方式秀出合作品牌
- 簡單的秀出新品和熱銷品
- 可以通過`homeProductCard` 的`homeProductAddButton` 將商品加入購物車
- starRating 可以計算review 平均評分和總評論數

## 2. 目標使用者

主要使用者 :
- 想尋找露營地的一般消費者
- 對露營裝備有興趣的消費者
- 使用手機瀏覽的使用者
- 想了解此平台特色的使用者

使用情境：
- 可以依目的選擇立刻探索和露營指南兩個網頁入口
- 品牌合作方一目了然
- 簡單瀏覽新品和熱銷品
- 快速加入新品和熱銷品

## 3. 路由

頁面路徑 :

`paegs/products.html`
`pages/blog.html`
`pages/product-detail.html`
`booking/pages/camp-search.html`
`pages/branches.thml`
`pages/faq.html`

URL 參數：

## 4. 頁面內容

1. 導覽列
2. 英雄標題
3. 品牌跑馬燈
4. 最新商品卡片
5. 熱銷商品卡片
6. 商品評分與評論數量
7. 價格列表
8. 顯示服務特色
9. 頁尾

### 5. 元件規格

### 導覽列

顯示：
- 漢堡選單
- Logo
- 搜尋按鈕
- 預約營地按鈕
- 購物車按鈕
- 登入／會員選單

操作：
- 點擊`button.siteMenuButton`開啟`aside.siteOffcanvas`，顯示商品列表、露營專欄、門市據點、常見問題連結
- 點擊 `siteBrandLink` 回到`home.html`
- 點擊`button.siteSearchToggle`開啟`form.siteSearchForm`
- 點擊`button.siteCartButton`開啟`aside#siteCartDrawer`
- 點擊`button.siteLoginButton`開啟`div.sharedAuthContent`
- 點擊`button.authProviderButton`登入並開啟`div#personalizationModal`
- 點擊`button.sharedAuthClose`開啟`div.modalContent.sharedAuthContent.sharedConfirmContent`
- 登入後，點擊`siteUserTrigger`開啟`siteUserMenu`

### 英雄標題

- 背景遷入影片 (github 有容量限制不提供)

### 品牌跑馬燈

- 準備兩份一模一樣的內容，讓它們連續接在一起移動。第一份移出畫面時，第二份剛好補上，然後動畫重頭開始
- 做出無限播放的效果
- Mock 模式讀取`/data/marketing/brands.json`；Backend 模式讀取公開的`GET /api/brands`
- 公開品牌請求不附登入 Token，避免失效 Session 影響首頁公開內容
- 第二組重複品牌加上`aria-hidden="true"`，品牌名稱以`textContent`安全建立
- API 回傳空陣列或載入失敗時顯示狀態文字，跑馬燈容器不可縮成`0px`

### 最新商品 and 熱銷商品

- Backend 模式以`GET /api/products?page=0&size=12&sort=createdAt,desc`取得最新商品，順序以後端`products.created_at`為準。
- 前端不得解析商品 ID 推算上架先後；相同建立時間的穩定排序也由後端處理。
- Mock 資料目前沒有上架時間欄位，離線展示才保留既有商品 ID 排序。
- Backend 模式的熱銷商品讀取公開`GET /api/products/bestsellers?limit=20`，銷量排序以後端訂單資料為準。
- Backend 模式不讀取`/api/orders`或本機訂單資料補算熱銷，避免公開首頁收到`401`並誤觸登入過期提示。
- Mock 模式仍以`/data/commerce/orders.json`計算熱銷，供離線前端開發使用。

