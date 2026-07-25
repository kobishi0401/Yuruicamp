# 介面操作與後端互動

## admin/partials/products.html
* 此畫面的意義：管理商城商品、variants、分類、品牌、租借品展示與最低庫存設定。
* 載入方式：由 `admin/dashboard.html` 掛載。

### 載入時
- GET `/api/admin/products?page=0&size=100&sort=id,asc` 取得商品。
- GET `/api/admin/products/lookups` 取得分類、品牌與表單選項。
- GET `/api/admin/min-stocks?inventoryDomain=store` 取得商城最低庫存門檻。

### 商品操作
- GET `/api/admin/products/{productId}` 取得單一商品詳情。
- POST `/api/admin/products` 建立商品。
- PUT `/api/admin/products/{productId}` 更新商品與規格。
- POST `/api/admin/products/{productId}/activate`／`deactivate` 切換販售狀態。

### 主檔與庫存設定
- PUT `/api/admin/min-stocks` 批次儲存最低庫存門檻；不直接修改 on-hand。
- 租借商品寫入在正式後端尚未完整開放時會回 `ADMIN_FEATURE_NOT_READY`，不可假裝儲存成功。
- 畫面程式已有品牌／分類主檔管理操作，但目前 `AdminAPI` 尚未提供 `brands`／`categories` facade；在補齊 facade 前不能視為可正常呼叫的正式功能。

### 注意
- 真正庫存異動應走庫存異動畫面，不可用商品表單直接改寫庫存歷史。
