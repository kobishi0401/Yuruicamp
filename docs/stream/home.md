# 介面操作與後端互動

## home.html
* 此頁的意義: 平台的入口頁，負責品牌曝光、商品導引(新品、熱銷)。
* 登入方式採用: Firebase＋後端會員 Session API
    - Firebase 負責驗證外部身分
    - Session API 負責建立和取得會員資料
    - 大致流程: 點擊登入 > OAuth 完成登入 > 取得ID Token > 後端驗證 > 既有會員: 回傳資料，新會員: 建立 > 確認登入身分

### 載入時
- GET /api/brands
    - 取得產生品牌跑馬燈資料
- GET /api/products?page=0&size=100&sort=id,asc
    - 取100 筆商品資料，商品變多可以後端調整
    - 按照id 升序排列
    * 前端js: 將商品分類成*新品*和*熱銷*
        - 熱銷商品通過 GET /api/orders ，用訂單計算熱銷商品排序。
        - 最新商品通過資料庫創建日期排序。 (products.created_at DESC)

### 加購物車
- GET /api/products/{productId}
    - 取得product 的詳細資料，加入購物車

### 登入
- POST /api/auth/firebase/session
    - 完成登入時用Firebase ID Token 建立／同步會員
- GET /api/me
    - 成功登入後用Bearer Token 驗證，然後取得會員身分
- GET /api/orders

### 首次登入
- 會跳出喜好問卷要使用者填寫。
    - 填寫完畢或中途關閉都會導向會員中心提示使用者先填寫會員資料。
- 到member-center.html 的會員資料填寫
    - 使用者代號、手機、信箱、生日
        - 信箱在Google 登入時會鎖住不能更改，其他登入則沒有限制。
        - 手機有台灣格式驗證
    - 配送地址:
        - 限制縣市、區、詳細地址和郵區格式。
        - 可以填入當下收件人之真實姓名、電話、信箱。



