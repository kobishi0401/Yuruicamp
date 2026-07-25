# orders
* order_items
    訂單內的商品明細。
* order_status_history
    保存訂單狀態變更紀錄。
* order_event_history
    保存付款、退款等非訂單生命週期事件紀錄。
* coupons
    優惠券主檔。
* order_coupons
    記錄訂單套用的優惠券。
* coupon_claims
    管理使用者持有的優惠卷狀態



## 關聯與資料流
customers
└─ 1:N orders
      ├─ 1:N order_items
      │     └─ N:1 product_variants
      ├─ 1:N order_status_history
      │     └─ N:1 admin_users（actor_id 可空）
      ├─ 1:N order_event_history
      │     └─ N:1 admin_users（actor_id 可空）
      └─ 1:N order_coupons
            ├─ N:1 coupons（coupon_id 可空）
            └─ 1:1 coupon_claims

coupons
└─ 1:N coupon_claims
       └─ 1:0..1 order_coupons

### 關聯
* order_items：訂單明細。一張訂單多個商品項目。
* order_status_history：訂單狀態歷程。一張訂單多次狀態變更。
* order_event_history：訂單非生命週期事件歷程。一張訂單可有多筆付款、退款或其他操作事件；與 order_status_history 的履約狀態分開保存。
* coupons：優惠券主檔，保存券碼、折扣方式、發行量及有效期間。
* order_coupons：訂單實際使用的優惠券紀錄，也是交易快照表。
* coupon_claims：會員領券及優惠券額度的現行權威來源。
### 資料流程
* 優惠券領取
    - 在 coupon_claims 建立領券紀錄。
    - 只有啟用中、有效期間內、尚未歸零的優惠券能成功領取。
    - 同一會員對同一張優惠券只能有一筆 coupon_claims。

* 會員下單後：
    - 在 orders 建立訂單主檔及買家、收件、金額快照。
    - 在 order_items 建立每項商品的名稱、規格、品牌、價格快照。
    - 在 order_status_history 建立第一筆 unshipped 歷程。
    - 若有用券：
        - 將 coupon_claims.status 由 claimed 改為 consumed。
        - 在 order_coupons 保存券碼、折扣種類、折扣值和實際折抵金額。
    - orders.discount 應等於所有 order_coupons.amount 合計。
    - orders.total 必須等於 subtotal + shipping_fee - discount，最低為 0。

* 訂單狀態改變後：
    - 更新 orders.status。
    - 同時新增 order_status_history，不能只改主檔而不留下歷程。
    - 若由後台人員操作，可在 actor_id 保存 admin_users.id。

* 發生非訂單生命週期事件後：
    - 在 order_event_history 新增事件類型、發生時間與備註。
    - 若由後台人員操作，可在 actor_id 保存 admin_users.id；系統自動事件可為空。
    - 付款、退款等事件不應寫入 order_status_history。

* 取消、退款或重新認列優惠券後：
    - 可以更新 orders.status、payment_status、refund_status。
    - 已消耗的 coupon_claims 不得回到 claimed。
    - 不會退回優惠券。
    - 會員主動取消時，已綁定 claim 改為 revoked。
    - Checkout 自動逾時時，已綁定 claim 改為 expired。



## 欄位說明
### orders
* id                         訂單識別碼
* customer_id                下單會員 ID
  checkout_idempotency_key   建立結帳的客戶端冪等鍵，可空；同一會員不可重複。
                             *UNIQUE (customer_id, checkout_idempotency_key)*
  checkout_request_hash      正規化建立請求的 SHA-256 指紋，可空；用來拒絕同鍵異內容。
* buyer_name_snapshot        下單當時的購買人姓名快照
* buyer_email_snapshot       下單當時的購買人 Email 快照
* recipient_name_snapshot    收件人姓名快照
* shipping_address_snapshot  配送地址快照
* shipping_phone_snapshot    收件電話快照
* subtotal                   商品小計，必須大於等於 0。
* shipping_fee               運費，必須大於等於 0。
* discount                   整張訂單折扣總額，必須大於等於 0。
* total                      訂單實付總額
                             GREATEST(subtotal + shipping_fee - discount, 0)

* payment_method             付款方式 ENUM：
                             ecpay-credit、ecpay-atm、ecpay-cvs、ecpay-other、cod。
                             線上付走綠界 ECPay；COD 不呼叫 ECPay，建立時 unpaid，
                             履約完成後再標 paid。
* payment_status             付款狀態，(unpaid、paid、refunded)
* refund_status              退款狀態，預設 'none'，
                             (requested、approved、processing、refunded、rejected、failed。)

* status                     訂單履約狀態，
                             (unshipped, shipped, completed, cancelled, returned)
* internal_note              後台內部備註，可空；非履約狀態欄位。空白寫入時存 null。

* placed_at                  正式下單時間
  paid_at                    實際付款時間，可空
  checkout_expires_at        待付款結帳逾時（通常 now+15 分鐘），可空。
                             應與同交易內 `product_stock_reservations.expires_at` 對齊。
                             *idx_orders_checkout_expiry*（unpaid 且 expires 非空）
* created_at                 建立時間，預設 now()
* updated_at                 更新時間，預設 now()
*idx_orders_customer_placed：(customer_id, placed_at)*
*idx_orders_status_payment：(status, payment_status)*

### order_items
* id                         自動流水號，IDENTITY
* order_id                   所屬訂單 ID
                             *idx_order_items_order：order_id*

* product_id                 商品 ID
* variant_id                 商品規格／SKU ID
                             *idx_order_items_variant：variant_id*

* sku_snapshot               SKU 快照
* product_name_snapshot      商品名稱快照
* specification_snapshot     規格文字快照
* brand_name_snapshot        品牌名稱快照
  image_url_snapshot         商品圖片網址，可空
* unit_price_snapshot        單價，必須大於等於 0
* quantity                   購買數量，必須大於 0
*刪除訂單主檔時，自動刪除對應的訂單明細*
*UNIQUE (id, variant_id)*
*idx_order_items_product_variant：(product_id, variant_id)*

### order_status_history
* id            自動流水號，IDENTITY
* order_id      所屬訂單 ID
* status        這次狀態變更後的訂單狀態
* occurred_at   狀態發生時間
  actor_id      操作者 ID，可空
                *idx_order_status_history_actor：actor_id*

  note          狀態變更備註，可空
*刪除訂單主檔時，自動刪除對應的訂單歷程*
*idx_order_status_history_order_time：(order_id, occurred_at)*

### order_event_history
* id                        自動流水號，IDENTITY
* source_history_id         原 order_status_history.id；UNIQUE，

* order_id                  所屬訂單 ID；
                            ON UPDATE CASCADE、ON DELETE CASCADE。
                            *idx_order_event_history_order_time：(order_id, occurred_at)*

* event_type                事件類型；不可為空白字串。
* occurred_at               事件發生時間；

* actor_id                  操作者 ID，可空；
                            ON UPDATE CASCADE、ON DELETE RESTRICT。
                            *idx_order_event_history_actor：(actor_id)*

* note                      事件備註，可空。

### coupons
* id               自動流水號，IDENTITY
* code             優惠券代碼，UNIQUE
* name             優惠券顯示名稱
* discount_type    折扣類型，(fixed, percent)
* discount_value   折扣數值，
                   discount_value <= 100 (percent)
                   discount_value > 0

* minimum_amount   最低訂單金額，預設 0，不可為負數。
* issue_quantity   發行數量，不可為負數。
* valid_from       生效時間
* valid_until      失效時間，必須晚於 valid_from
* status           優惠券狀態，(active、disabled)
* category         優惠券分類，(promotion、birthday、firstPurchase)
* created_at       建立時間，預設 now()
* updated_at       更新時間，預設 now()
* claimed_quantity 已領券數量，介於 0 和 issue_quantity 之間，由 coupon_claims 維護。
*idx_coupons_status_validity：(status, valid_from, valid_until)*

### order_coupons
* id                      自動流水號，IDENTITY
* order_id                套用優惠券的訂單 ID
  coupon_id               優惠券ID；刪除優惠券時設為 NULL，交易快照會保留。
                          *idx_order_coupons_coupon：coupon_id*

* code_snapshot           券碼快照
* discount_type_snapshot  折扣類型快照
* discount_value_snapshot 折扣數值快照，不可為負數。
* amount                  此券實際折抵金額，不可為負數。
* applied_at              套用時間
* coupon_claim_id         實際被消耗的會員領券紀錄，必填，UNIQUE
*刪除訂單主檔時，自動刪除對應的訂單紀錄優惠卷*
*UNIQUE (order_id, code_snapshot)*


## coupon_claims
* id            流水號，由資料庫自動產生
* coupon_id     被領取的優惠券 ID
                ON UPDATE CASCADE，ON DELETE RESTRICT
                UNIQUE(coupon_id, customer_id)
                idx_coupon_claims_coupon_status(coupon_id, status)

* customer_id   領取優惠券的會員 ID
                ON UPDATE CASCADE，ON DELETE RESTRICT。
                UNIQUE(coupon_id, customer_id)
                idx_coupon_claims_customer_status(customer_id, status)

* status        領券狀態，預設 claimed，
                - claimed： 已領取，尚未使用
                - consumed：已使用
                - revoked： 已撤銷
                - expired： 已失效

* claimed_at    領券時間。預設 now()。
                consumed_at、revoked_at 不得早於 claimed_at。

  consumed_at   優惠券實際使用時間，可為 NULL。
                - status = consumed 時必須有值。
                - status = claimed 時必須為 NULL。

  revoked_at    優惠券撤銷或失效時間，可為 NULL。
                - status = revoked 或 expired 時必須有值。
                - status = claimed、consumed 時必須為 NULL。



## 運作模式
* 訂單快照
    - 避免刪除資料後關聯遺失

* 訂單主檔與歷程分離
    - orders.status 是目前訂單狀態
    - order_status_history 僅紀錄履約生命週期狀態：
      unshipped、shipped、completed、cancelled、returned。
    - order_event_history 紀錄付款、退款及其他非生命週期事件。

* 非生命週期事件自狀態歷程分離
    - 舊 order_status_history 中不屬於履約生命週期狀態的資料，
      會搬移至 order_event_history。
    - source_history_id 保留原歷程 ID，並以 UNIQUE 防止同一來源重複遷移。

* 優惠券容量目前在領取時分配
    - 券未啟用、已過期或額滿時，claimed 拒絕新增。
    - 禁止同一會員領取同一張優惠券。
    - 使用時將 claim 改成 consumed(消耗)。
    - 設為consumed(消耗) 後不會再回復成 claimed(擁有)。

* 開發 Seed 現況
    - `050-coupons.sql` 先建立固定 ID 1～7 的優惠券主檔。
    - 首次載入尚無會員與 `coupon_claims`，所以主檔 `claimed_quantity` 為 0。
    - 後續會員 Seed 必須建立 claim 明細，由資料庫領券流程維護名額，不可只修改主檔計數。
    - 重跑 `050-coupons.sql` 會保留既有 `claimed_quantity`，避免破壞後續會員 claim。



## 程式碼追蹤
* 前台套用優惠券與下單
    `pages/checkout.html`
            ↓
    載入 `js/data-paths.js`
    載入 `js/api-mock.js`
    載入 `js/components/coupons.js`
    載入 `js/pages/checkout.js`
    `[pages/checkout.html 第 335～345 行]`
            ↓
    initCheckoutPage()
    `[js/pages/checkout.js 第 69 行]`
            ↓
    _initCheckoutCoupon()
    `[js/pages/checkout.js 第 86、386 行]`
            ↓
    YuruiCoupons.loadCoupons()
    `[js/components/coupons.js 第 23 行]`
            ↓
    API.coupons.getAll()
    `[js/api-mock.js 第 487 行]`
            ↓
    DataPaths.coupons
    `js/data-paths.js 第 30 行`
            ↓
    `data/promotions/coupons.json`

    * 使用者輸入折扣碼後：
    _applyCheckoutCouponCode()
    `[js/pages/checkout.js 第 409 行]`
            ↓
    YuruiCoupons.validateCoupon()
    `[js/components/coupons.js 第 97 行]`
            ↓
    檢查券碼、status、會員生日／首購資格、minimum amount
            ↓
    calculateAppliedCoupons()
    `[js/components/coupons.js 第 82 行]`
            ↓
    將套用中的券碼保存到 localStorage
    `[js/components/coupons.js 第 140 行]`

    * 建立 Checkout Session 後：
    confirmOrderBtn
            ↓
    _handleConfirmOrder()
            ↓
    _buildCheckoutRequest()
            ↓
    只建立 variantId、quantity、shipping、paymentMethod、idempotencyKey
            ↓
    API.checkout.createSession(request)
            ↓
    Spring Boot 從 PostgreSQL 建立快照並重算 pricing
            ↓
    暫存 sessionStorage.lastCheckoutSession
            ↓
    以 CheckoutSession.pricing 覆蓋摘要，等待 I-7 付款下一步

    * I-6 前端狀態：
    - `draft` 可 PATCH 收件資料與付款方式，不清空購物車。
    - `ready_to_pay` 顯示後端金額與 `checkout_expires_at` 倒數。
    - 主動取消或逾時會清除前端 Session；訂單取消與庫存釋放仍由後端交易負責。

    * Backend 模式目前實際執行時：
    - 後端建立 `orders`、`order_items` 與庫存保留，前端不建立訂單 ID 或交易快照。
    - 線 F 完成前不建立或消耗 `coupon_claims`，也不讓前端折扣覆蓋後端 pricing。
    - 不寫 `localStorage.mockOrders`，不把 CheckoutSession 當成 Legacy Order。
    - ECPay 不在本站收集卡號、到期日或 CVV；實際導向等待 I-7。

* 會員中心讀取訂單
    `pages/member-center.html`
            ↓
    initMemberCenterComponent()
    `[pages/member-center.html 第 50 行]`
            ↓
    loadData()
    `[js/components/member-center.js 第 966 行]`
            ↓
    API.orders.getByCustomerId(customerId)
    `[js/components/member-center.js 第 986 行]`
            ↓
    API.orders.getAll()
    `[js/api-mock.js 第 405 行]`
            ↓
    `data/commerce/orders.json`
    ＋ localStorage.mockOrders
            ↓
    依 customerId 篩選

* 後台訂單列表與狀態變更
    AdminAPI.useBackend = false
    `[admin/js/admin-api.js 第 16～19 行]`
            ↓
    loadOrders()
            ↓
    直接讀 DataPaths.orders
    `[admin/js/orders.js 第 947 行]`
            ↓
    `data/commerce/orders.json`

    * 出貨：
    點擊 .btn-ship-order
    `[admin/js/orders.js 第 239 行]`
            ↓
    修改 ordersCache 中的 order.status = shipped
            ↓
    push 一筆 order.history
    `[admin/js/orders.js 第 247～260 行]`
            ↓
    AdminAPI.orders.ship()
    `[admin/js/orders.js 第 265 行]`
            ↓
    因 useBackend = false，只回傳 mock Promise
    `[admin/js/admin-api.js 第 31～40 行]`

    * 目前實際執行時：
    - 後台不讀 localStorage.mockOrders。
    - 前台剛建立的訂單不會出現在後台。
    - 出貨、完成狀態只修改記憶體中的 ordersCache。
    - 重新整理後狀態會恢復。
    - 不寫 orders.status。
    - 不寫 order_status_history。

* 後台優惠券管理
    initDiscounts()
    `[admin/js/discounts.js 第 91 行]`
            ↓
    useBackend = false
            ↓
    讀 `data/promotions/coupons.json`
    `[admin/js/discounts.js 第 94～101 行]`
            ↓
    新增、停用、刪除只修改 couponsCache 與畫面
            ↓
    AdminAPI.coupons.*
            ↓
    回傳 mock Promise，不寫資料庫



## 可能的問題
* 高風險：前台、後台與資料庫有三套訂單來源
    - 前台下單寫 localStorage.mockOrders。
    - 會員中心讀 orders.json + mockOrders。
    - 後台只讀 orders.json。
    - 資料庫的 orders、order_items、order_status_history 完全沒有參與。

* 高風險：前端沒有驗證優惠券有效期間與剩餘數量
    - 前端／後端問題

* 高風險：前端沒有真正消耗優惠券
    - 前端／後端問題

* 高風險：前端訂單資料不足以滿足 orders 必填欄位
    - 前端／後端整合問題

* 中風險：orders.status 與狀態歷程沒有同步保護

* 中風險：order_event_history.event_type 是自由文字
    - 目前僅限制不得為空白，可能出現同義、大小寫或拼字不一致的事件名稱。
    - 建議以 enum、CHECK 白名單或後端常數統一管理。

* 中風險：source_history_id 目前必填
    - 欄位設計用於保留由 order_status_history 搬移的來源資料。
    - 若日後需直接建立原生事件，必須先明確定義來源 ID 的產生方式，或調整欄位為可空。

* 低風險：actor_id 可空會降低人工操作的稽核完整性
    - 系統自動事件可為空；人工操作應由後端統一寫入 actor_id。
## G-2b 後台訂單履約

後台使用 `/api/admin/orders` 查詢訂單，列表先對 order ID 分頁，再載入表頭摘要；商品與狀態歷程只在詳情讀取。這可避免 `order_items` 或 `order_status_history` 將列表資料列放大。

履約狀態固定為 `unshipped → shipped → completed`。線上付款必須先由可信付款流程標記 paid；COD 可以 unpaid 出貨，完成時於同一交易標記 paid。Admin 不提供任意 payment、refund 或 status PATCH。
