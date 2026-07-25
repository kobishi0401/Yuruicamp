# G-2c Admin Products

> **⚠️ 語意覆寫（2026-07-24）**  
> 商城 `inventory_stocks` 寫入改由 **ADM-W2-08／Admin 契約 v0.17** 規範（Products 可帶 `stockLocations`）。  
> 下文「庫存只讀／不建立初始庫存／隱藏庫存輸入」為 **G-2c 當日實作紀錄**；現況以契約 v0.17 與 [`ADM-W2-08`](../../../plans/admin-post-g6/w2/ADM-W2-08-product-stock-update.md)（✅ 已驗收）為準。

## 用途

讓後台商品頁在 Backend 模式安全維護商城商品、規格、圖片與上下架狀態。資料庫正規化模型是唯一真相，前端舊 Mock 的庫存、租借、評價與銷售衍生欄位不會進入寫入契約。

## 主要流程

建立或更新會在單一交易內依序處理：

1. 驗證 `products.edit`、分類、品牌、SKU、價格與規格組合。
2. 更新時以悲觀鎖鎖定既有 `products`。
3. 寫入 `equipment_items` 與 `products`。
4. 同步 `product_variants`；既有 ID 更新、新規格由後端產生 ID、未送出的既有規格改為 inactive。
5. 依 Request 順序重建 `equipment_images`，`sort_order=0` 是主圖。
6. flush 後重新查詢完整 Admin Product，使用資料庫回應更新前端 cache。

列表採兩階段查詢：先分頁取得商品 ID，再批次組合主檔、圖片、規格與庫存，避免多值關聯 JOIN 造成重複列與分頁失真。

## 資料責任

| 資料 | G-2c 權限 |
|------|-----------|
| `equipment_items`、`products` | 建立與更新 |
| `product_variants` | 建立、更新、停用；不硬刪 |
| `equipment_images` | 依送入順序同步 |
| `inventory_stocks`、active reservations | 只讀摘要 |
| 租借、評價、訂單快照 | 不寫入 |

商品 Request 只接受 `name`、`description`、`categoryId`、`brandId`、`status`、`images[]` 與 `variants[]`。不接受 `branch`、`totalStock`、`rentalEnabled`、`camp` 等前端胖物件欄位，也不建立初始庫存；庫存異動由 G-3 負責。

inactive 商品不會出現在公開 Catalog，公開 `GET /api/products/{id}` 回 `404`。下架不刪除商品、規格或訂單快照。

## 前端接線

- `mapAdminProductResponse()` 將正規化後端回應轉成現有表格與 Modal 使用的 ViewModel。
- `buildAdminProductRequestFromForm()` 明確挑選契約欄位，不使用完整商品物件或物件展開。
- Backend 模式先等待 API 成功，再用 Response 更新 `adminProductsCache`；失敗時保留原 cache 與 Modal 輸入。
- Backend 模式隱藏檔案上傳、租借操作與庫存輸入，改顯示圖片 URL 與唯讀庫存；Mock 模式維持既有流程。

## 驗證結果

- `AdminProductServiceTest`：Request 白名單與 active 商品規格規則通過。
- `AdminOpenApiSecurityTest`：Admin Products Controller 已宣告 Firebase Bearer OpenAPI security。
- `AdminProductPostgreSqlIntegrationTest`：建立、更新、圖片排序、規格停用、無初始庫存、上下架、公開 404 與 RBAC 共 2 項情境通過。
- `frontend/tests/admin-products-facade.mjs`：路徑、認證、Response mapping、乾淨 Request 與成功後才更新 cache 通過。
- Frontend Vite production build 通過。

本切片沒有修改 Schema 或 Seed；既有 category、brand、商品與庫存 ID 規則維持不變。
