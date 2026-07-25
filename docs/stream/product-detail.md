# 介面操作與後端互動

## storefront/pages/product-detail.html
* 此頁的意義：顯示單一商品的圖片、價格、規格、庫存說明與購買評價。
* 頁面網址：`/storefront/pages/product-detail.html?id={productId}`

### 載入時
- 從網址讀取 `id`；缺少 ID 時顯示錯誤狀態。
- GET `/api/products/{productId}`
    - 取得商品資料: 
        - 商品多張圖片
        - 品牌、名稱、總評分、總評論數
        - 規格: 顏色、尺寸
        - 多種商品標籤、描述、特殊規格

- GET `/api/products/{productId}/reviews?page={page}&size=20&sort={sort}&hasPhotos={boolean}`
    - 取得公開評論、評分摘要與分頁資訊。
    - 支援分數查詢、高低排序和有無圖片。

### 加入購物車
- 點擊加入購物車商品數量會加一
- 直接購買，如果購物車沒有相同商品會新增並數量加一並跳轉`cart.html`，有則只會調轉頁面。

### 運費進度條
- js即時計算現在購物車的金額調整動畫
