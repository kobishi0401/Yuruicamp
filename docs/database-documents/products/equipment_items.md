# equipment_items
    裝備共用主檔。
    products(商品) 與rental_skus(租借) 都可以從 equipment_items 延伸。
* product_categories
* brands
    brands 與 product_categories 提供品牌及分類。
* equipment_images
* equipment_specifications
* equipment_tags
* equipment_interest_tags
    image、specifications(規格) 及tag 分別拆成附屬資料表。



## 關聯與資料流
product_categories
└─ 1:N equipment_items

brands
└─ 1:N equipment_items

equipment_items
├─ 1:N equipment_images
├─ 1:N equipment_specifications
├─ 1:N equipment_tags
└─ 1:N equipment_interest_tags
### 關聯
* equipment_items：裝備共用主檔，是七張表的中心。
* product_categories：裝備分類，例如帳篷、睡袋、炊具。
* brands：品牌主檔，例如 Coleman、Snow Peak。
* equipment_images：一項裝備可以有多張圖片，以 sort_order 排序。
* equipment_specifications：裝備規格的鍵值資料，例如 weight = 4.2 kg。
* equipment_tags：#特色、搜尋標籤。
* equipment_interest_tags：會員偏好比對、推薦用的興趣標籤。
### 資料流程
* 建立新裝備 :
1. 先確認 product_categories 已有分類。
2. 再確認 brands 已有品牌。
3. 在 equipment_items 建立共用名稱、分類、品牌、主圖與說明。
4. 多張圖片寫入 equipment_images。
5. 詳細規格寫入 equipment_specifications。
6. 顯示與搜尋標籤寫入 equipment_tags。
7. 個人化推薦標籤寫入 equipment_interest_tags。
8. 如果要販售，在 products 建立商城價格與狀態。
9. 如果要出租，在 rental_skus 建立租借領域資料。

* 刪除 equipment_items 時：
1. 圖片、規格、標籤會因 ON DELETE CASCADE 自動刪除。(有active 可以設定停用)
2. 若仍被 products 或 rental_skus 使用，則會因 ON DELETE RESTRICT 阻止刪除。
3. 若分類或品牌仍被裝備使用，不能直接刪除。



## 欄位說明
### product_categories
* id            但由 IDENTITY 自動產生；
* code          穩定代碼；UNIQUE (LOWER(BTRIM(code)))
* name          名稱；UNIQUE
                lower(btrim(name))

* sort_order    顯示順序；預設 0；CHECK sort_order >= 0
* created_at    建立時間；預設 now()
* updated_at    最後更新時間；預設 now()
                UPDATE 時由 trg_product_categories_set_updated_at 更新

### brands
* id            品牌識別碼；
* name          品牌名稱；UNIQUE
                lower(btrim(name))

logo_url        品牌標誌網址
* sort_order    顯示順序；預設 0；CHECK sort_order >= 0
* created_at    建立時間；預設 now()
* updated_at    最後更新時間；預設 now()
                UPDATE 時由 trg_brands_set_updated_at 更新

### equipment_items
* id                識別碼 (依靠後端提供id)
* category_id       分類；
                    ON UPDATE CASCADE
                    ON DELETE RESTRICT

brand_id            所屬品牌；
                    ON UPDATE CASCADE
                    ON DELETE RESTRICT

* name              裝備名稱；CHECK btrim(name) <> ''
description         裝備說明
* active            裝備是否啟用；預設 true
* created_at        建立時間；預設 now()
* updated_at        最後更新時間；預設 now()
                    本表 UPDATE 時自動更新，圖片、規格、標籤異動時也會自動更新
*idx_equipment_items_brand：(brand_id)*
*idx_equipment_items_category_active：(category_id, active)*

### equipment_images
* item_id           所屬裝備
                    ON UPDATE CASCADE
                    ON DELETE CASCADE

* sort_order        排序位置 ; 0 代表主圖
                    CHECK sort_order >= 0

* url               圖片網址
                    CHECK BTRIM(url) <> ''

alt_text            圖片替代文字；可為 NULL
* created_at        建立時間；預設 now()
* updated_at        最後更新時間；預設 now()
                    UPDATE 時自動更新
*(item_id, sort_order) 是複合主鍵*
*idx_equipment_images_sort_order ON (sort_order)*

### equipment_specifications
* item_id           所屬裝備；
                    ON UPDATE CASCADE
                    ON DELETE CASCADE

* spec_key          規格代碼，例如 weight、material，
                    CHECK (BTRIM(column_name) <> '')

* value             規格內容，例如 4.2 kg、鋁合金
                    CHECK BTRIM(value) <> ''
* created_at        建立時間，預設 now()

* updated_at        最後更新時間，預設 now()
                    UPDATE 時自動更新
*(item_id, spec_key) 是複合主鍵*
*idx_equipment_specifications_spec_key：(spec_key)*

### equipment_tags
* item_id           所屬裝備，
                    ON UPDATE CASCADE
                    ON DELETE CASCADE

* tag               # 查詢、特色標籤；(#防水 #六人用 #親子適用)
                    CHECK BTRIM(tag) <> ''
                    開發 Seed 另使用「新品」「熱銷」：
                    新品＝可售商品 created_at 前 10；
                    熱銷＝有效訂單商品數量前 6
* created_at        建立時間，預設 now()
* updated_at        最後更新時間， 預設 now()
                    UPDATE 時自動更新
*(item_id, tag) 是複合主鍵*
*idx_equipment_tags_tag：(tag)*
*UNIQUE (item_id, LOWER(BTRIM(tag)))*

### equipment_interest_tags
* item_id           所屬裝備
                    ON UPDATE CASCADE
                    ON DELETE CASCADE

* tag               興趣標籤；
                    CHECK BTRIM(tag) <> ''
* created_at        建立時間，預設 now()
* updated_at        最後更新時間，預設 now()
                    UPDATE 時自動更新
*(item_id, tag) 是複合主鍵*
*idx_equipment_interest_tags_tag：(tag)*
*UNIQUE (item_id, LOWER(BTRIM(tag)))*



## 運作模式
* 共用主檔與販售、租借分離
    equipment_items
    ├─ 裝備是什麼
    │  ├─ 名稱
    │  ├─ 品牌
    │  ├─ 分類
    │  ├─ 說明
    │  ├─ 圖片
    │  ├─ 規格
    │  └─ 標籤
    │
    ├─ products
    │  └─ 商城價格、商品狀態、variant、銷售庫存
    │
    └─ rental_skus
    └─ 租借 variant、營區 listing、租借庫存

    * 例如同一款 Coleman 帳篷：
        共用名稱、品牌、圖片、規格放在 equipment_items。
        商城售價放在 products。
        顏色與尺寸放在 product_variants。
        門市庫存放在 inventory_stocks。
        租借資料放在 rental_skus 與 rental_sku_variants。
        每個營區的出租價格放在 rental_listings。
    
* 圖片運作
    equipment_images.sort_order，0為主圖，其餘副圖

* 規格運作
    equipment_specifications 採鍵值對，不同分類可有不同規格
        帳篷：capacity、waterproof、material
        燈具：power、battery、runtime

* 查詢、特色標籤 equipment_tags
* 喜好標籤 equipment_interest_tags


## 程式碼追蹤
* 前台商品列表載入
    `pages/products.html`
            ↓
    載入 `js/data-paths.js`
    載入 `js/api-mock.js`
    載入 `js/pages/product-list.js`
            ↓
    initProductListPage()
    `[js/pages/product-list.js 第 793 行]`
            ↓
    window.API.products.getAll()
    `[js/pages/product-list.js 第 801 行]`
            ↓
    _loadProductsRaw()
    `[js/api-mock.js 第 155 行]`
            ↓
    DataPaths.products
    `[js/data-paths.js 第 12 行]`
            ↓
    `data/catalog/products.json`
            ↓
    過濾 status = active
    `[js/api-mock.js 第 353 行]`
            ↓
    分類、品牌、標籤、興趣標籤篩選
    `[js/pages/product-list.js 第 297 行]`
            ↓
    建立商品卡片
    `[js/pages/product-list.js 第 156 行]`

    * 目前實際執行時：
    - 不讀 equipment_items。
    - 不讀 product_categories。
    - 不讀 brands。
    - 不讀 equipment_images。
    - 不讀 equipment_specifications。
    - 不讀 equipment_tags。
    - 不讀 equipment_interest_tags。
    - 不寫任何資料庫。
    - 直接讀 `[data/catalog/products.json (line 1)]`
    - 分類與品牌直接從每筆商品的 category、brand 字串整理出來。

* 前台商品詳情載入
    `pages/product-detail.html?id=P001`
            ↓
    `js/pages/product-detail.js`
            ↓
    _getProductIdFromUrl()
    `[js/pages/product-detail.js 第 22 行]`
            ↓
    window.API.products.getById(productId)
    `[js/pages/product-detail.js 第 11 行]`
            ↓
    _loadProductsRaw()
    `[js/api-mock.js 第 155 行]`
            ↓
    `data/catalog/products.json`
            ↓
    依 product.id 尋找商品
    `[js/api-mock.js 第 365 行]`
            ↓
    _renderProductPage()
    `[js/pages/product-detail.js 第 37 行]`
            ├─ 顯示基本資料
            ├─ 顯示圖片
            ├─ 顯示顏色與尺寸
            └─ 顯示評價

    * 目前 JSON 欄位與七張資料表概念上的對應：(沒有把七張表組合成商品 DTO)
        products.json.category
            → product_categories.name

        products.json.brand
            → brands.name

        products.json.name、description、image
            → equipment_items

        products.json.images[]
            → equipment_images

        products.json.specifications{}
            → equipment_specifications

        products.json.tags[]
            → equipment_tags

        products.json.interestTags[]
            → equipment_interest_tags

* 商品個人化推薦
    會員問卷偏好
        ↓
    localStorage／AppState
        ↓
    `js/pages/product-list.js (line 97)`
        ↓
    讀取 surveyTags
        ↓
    比對 products.json 的 interestTags
        ↓
    挑選符合偏好的商品
        ↓
    顯示推薦輪播

    * 未來改成資料庫後，對應流程應該是：
        customer_preferences
            ↓
        preference_options.code
            ↓ 比對
        equipment_interest_tags.tag
            ↓
        equipment_items
            ↓
        products

* 後台商品列表載入
    admin 商品管理頁
        ↓
    `admin/js/admin-api.js (line 166)`
    `admin/js/core.js (line 20)`
    `admin/js/products.js (line 1031)`
        ↓
    initProducts() 商品管理區初始化
        ↓
    loadAdminJsonResource() `[admin/js/core.js 第 20 行]`
        ├─ 優先 `AdminAPI.products.list() (line 166)`
        └─ 失敗或 mock 模式回退 DataPaths.products
                ↓
        `data/catalog/products.json`
        ↓
    adminProductsCache
    `[admin/js/products.js 第 1069 行]`
        ↓
    渲染商品管理表格

* 後台新增或修改商品
    admin 商品表單
        ↓
    讀取分類與品牌 combobox
    `admin/js/products.js (line 1513)`
        ↓
    讀取 name、brand、category、price、images、description
        ↓
    建立 newProduct JSON 物件 
    `admin/js/products.js (line 1645)`
        ↓
    upsertAdminProductCache()
        ├─ 先更新瀏覽器記憶體 adminProductsCache 
        |   `admin/js/products.js(line 4935)`
        └─ 呼叫 AdminAPI.products.create() 或 update()
            `admin/js/admin-api.js (line 170)`
                ↓
        POST /api/admin/products
        PUT  /api/admin/products/:id

    * 目前要注意：
    - mock 模式只會更新頁面記憶體，不會修改 JSON 檔案。
    - 重新整理頁面後變更會消失。
    - AdminAPI 已定義後端端點，但前端不會寫入這七張表。
    - 正式後端新增商品時，應在同一個 transaction 內寫入分類／品牌查找、equipment_items、圖片、規格、標籤及 products，避免只成功一半。



## 可能的問題
* 高風險：目前資料庫與前端有兩套商品真相來源
    `[products.json (line 1)]`
    SQL 的品牌改名，但 JSON 仍是舊品牌。
    SQL 停用分類，但前台仍顯示該分類。
    SQL 刪除圖片，但前台仍從 JSON 顯示。
    後台 API 寫入資料庫後，前台仍讀舊 JSON。

* 高風險：標籤沒有中央主檔 (輸入資料時要注意大小寫)
* 中風險：規格鍵沒有定義與資料型別 (沒有搜尋規格功能無影響)

* 中風險：圖片主圖規則只有註解，沒有完整保證 
    (更新順序時前端主圖會暫時失效、設定錯誤順序主圖不會顯示)

* 低風險：equipment_images 的獨立 sort_order 索引用途有限
    只對有設定 sort_order 的搜尋有幫助

* 低風險：equipment_items 名稱沒有唯一限制
    目前不同品牌、分類可以有相同名稱 (可接受)

* 低風險：描述使用 HTML，但資料庫未標明格式與安全策略
    後端需要在寫入或輸出時處理：
        XSS 清洗。 (js 攻擊過濾)
        允許的 HTML 標籤。
        圖片或外部連結規則。
