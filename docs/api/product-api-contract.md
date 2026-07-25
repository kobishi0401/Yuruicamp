# Product API Contract（v0.8）

| 欄位 | 內容 |
|------|------|
| **狀態** | Locked（B-1～B-5b 真相來源） |
| **日期** | 2026-07-20 |
| **版本** | 0.8 |
| **誰要遵守** | Spring 後端、前端 Mock、OpenAPI／Swagger |
| **相關清單** | [`plans/backend-implementation-checklist.md`](../../plans/backend-implementation-checklist.md) 線 B |
| **共用慣例** | [`common-api-conventions.md`](./common-api-conventions.md) |
| **索引** | [`README.md`](./README.md) |

> **為什麼要這份文件？**  
> 目前前端 `products.json` 是「頁面好用的胖物件」，資料庫則把名稱／圖／品牌拆在 `equipment_*`，販售身分在 `products`／`product_variants`。  
> **兩邊本來就不一致。** 這份契約是中間的寫死規格：Mock 與後端都改成輸出同一形狀，前端再慢慢接。

---

## 0. 一句話

公開商品 API 回傳 **Envelope + 精簡 Product（含 active variants）**；金額一律 **字串**；來源對齊 DB（`products` + `equipment_items` + `product_variants` + 主圖）。

Envelope／錯誤／金額規則見 **common**；本文件只鎖商品欄位。

---

## 1. 現況對齊說明（讀完再寫程式）

| 來源 | 現況 | 與契約關係 |
|------|------|------------|
| DB `products` | 只有 `id`／`status`／`item_id`／時間 | 契約的販售身分 |
| DB `equipment_items` + brand／category／images | 名稱、說明、品牌、分類、圖 | 契約的展示欄位 |
| DB `product_variants` | SKU、規格、**真正售價** | 契約的 `variants[]` |
| View `sellable_product_variants` | 可賣 variant 扁平列 | 結帳重算時可用；列表先組 SPU |
| 前端舊 Mock `products.json` | 另有 `rentalId`、`branch`、`totalStock`、`interestTags`… | **不在 v0.3**；UI 衍生欄位另算 |

**結論：** 舊 Mock ≠ DB ≠ 本契約。接線時以**本文件**為準，不要再以 `products.json` 的胖欄位當 API 真相。

---

## 2. HTTP 端點（寫死）

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| `GET` | `/api/products?page=0&size=20&sort=id,asc` | **公開**（不必 Token） | 可販售商品分頁列表 |
| `GET` | `/api/products?page=0&size=12&sort=createdAt,desc` | **公開**（不必 Token） | 首頁最新商品；依商品販售身分建立時間降序 |
| `GET` | `/api/products/bestsellers?limit=100` | **公開**（不必 Token） | 帶有「熱銷」標籤的商品，依有效訂單銷量排序 |
| `GET` | `/api/products/{id}` | **公開** | 單筆詳情；`id` = `products.id`（如 `P001`） |

### 列表規則

- 只回 `products.status = 'active'`
- 且對應 `equipment_items.active = true`
- `variants` 只含 `product_variants.status = 'active'`
- 若某商品沒有任何 active variant → **整筆不出現在列表**（詳情則 404）

### 詳情規則

- 同上過濾；找不到或不符資格 → HTTP **404**，錯誤碼 `NOT_FOUND`
- 成功時 `data` 為**單一物件**（不是陣列）

### 熱銷規則

- `limit` 預設為 `6`，必須介於 `1` 至 `100`。
- 只回傳 `equipment_tags.tag = '熱銷'` 的商品；開發 Seed 依有效訂單商品數量前 6 名重建此標籤。
- 只統計訂單狀態不是 `cancelled`、`returned` 的 `order_items.quantity`。
- 有效銷量合計為 `0` 的商品不屬於熱銷清單，不回傳。
- 依銷量降序排列；銷量相同時依商品 ID 升序，確保結果穩定。
- 回傳欄位與公開商品列表的 Product 物件相同，但不回傳分頁 `meta`。
- 非法 `limit` → HTTP `400`，錯誤碼 `VALIDATION_ERROR`。

### B-3 分頁與排序規則

列表端點支援下列 query parameters；詳情端點不支援。

| 參數 | 預設 | 規則 |
|------|------|------|
| `page` | `0` | 從 0 起算，必須大於等於 0 |
| `size` | `20` | 必須介於 1 至 100 |
| `sort` | `id,asc` | 格式 `field,asc\|desc`；僅允許 `id`、`name` 或 `createdAt` |

- 非法 `page`、`size` 或 `sort` → HTTP `400`，錯誤碼 `VALIDATION_ERROR`。
- `name` 排序依 `equipment_items.name`；`price` 是 active variants 最低價的衍生欄位，**v0.3 不支援**排序。
- `createdAt` 排序依 `products.created_at`；此欄位代表商品販售身分建立／首次上架時間，一般編輯或重新上架不會重設。
- `createdAt` 相同時會以商品 ID 使用相同方向排序，避免分頁結果不穩定。
- 列表回應一定帶 `meta`：

### B-4 篩選規則

| 參數 | 規則 |
|------|------|
| `category` | 分類完整名稱，忽略大小寫；空白視為未指定 |
| `brand` | 品牌完整名稱，忽略大小寫；空白視為未指定 |
| `minPrice` | active variant 價格下限，包含邊界且不得為負數 |
| `maxPrice` | active variant 價格上限，包含邊界且不得為負數 |

多個條件採 AND。商品至少一個 active variant 同時落在價格區間內才符合；`minPrice > maxPrice` 回傳 `400 VALIDATION_ERROR`。

```json
{
  "page": 0,
  "size": 20,
  "totalElements": 100,
  "totalPages": 5
}
```

---

## 3. Envelope

成功／錯誤格式見 [`common-api-conventions.md`](./common-api-conventions.md)。  
本資源：`data` 列表＝`Product[]` 且 v0.3 必帶分頁 `meta`；詳情＝`Product` 且不帶 `meta`。

錯誤範例：`NOT_FOUND` — `"Product not found: P999"`。

---

## 4. Product 物件（寫死欄位）

> JSON 使用 **camelCase**。  
> 下表「DB 來源」方便對照；**回應裡不要出現 snake_case。**

### 4.1 商品層（SPU）

| JSON 欄位 | 型別 | 必填 | DB／規則 | 說明 |
|-----------|------|------|----------|------|
| `id` | string | 是 | `products.id` | 商品 ID，如 `"P001"` |
| `itemId` | string | 是 | `products.item_id` | 裝備主檔 ID |
| `status` | string | 是 | `products.status` | 公開 API 實際只會看到 `"active"` |
| `name` | string | 是 | `equipment_items.name` | 顯示名稱 |
| `category` | string \| null | 是* | `product_categories.name` | 分類顯示名；無則 `null` |
| `brand` | string \| null | 是* | `brands.name` | 品牌顯示名；無則 `null` |
| `description` | string \| null | 是* | `equipment_items.description` | 可含 HTML；無則 `null` |
| `image` | string \| null | 是* | `equipment_images.url`（`sort_order = 0`） | 主圖；路徑如 `/assets/...`；無則 `null` |
| `price` | string | 是 | **衍生**：active variants 的 **最低** `price` | 列表卡片用；**不是**獨立 DB 欄位 |
| `rating` | string | 是 | **衍生**：正式 `reviews.rating` 平均值 | 固定一位小數；無評論為 `"0.0"` |
| `reviewCount` | integer | 是 | **衍生**：正式評論數量 | 無評論為 `0` |
| `tags` | string[] | 是 | `equipment_tags.tag` | 商品查詢／特色標籤；`新品`、`熱銷` 也是此欄位的正式值 |
| `variants` | array | 是 | 見下節 | 至少 1 筆（否則不應出現） |

\*「必填」指鍵一定要出現；值可以是 `null`。

### 4.2 規格層（SKU）— `variants[]`

| JSON 欄位 | 型別 | 必填 | DB 來源 | 說明 |
|-----------|------|------|---------|------|
| `id` | string | 是 | `product_variants.id` | 規格 ID |
| `sku` | string | 是 | `product_variants.sku` | 業務 SKU |
| `color` | string \| null | 是* | `product_variants.color` | 可空 |
| `size` | string \| null | 是* | `product_variants.size` | 可空 |
| `specification` | string | 是 | `product_variants.specification` | 規格文字（DB NOT NULL） |
| `price` | string | 是 | `product_variants.price` | **字串金額**，兩位小數，如 `"3200.00"` |
| `availableQuantity` | integer | 是 | 商城庫存合計減 active 保留量，最低為 0 | 目前可售數量 |
| `inStock` | boolean | 是 | `availableQuantity > 0` | 是否仍可販售 |

### 4.3 金額規則（寫死）

- 線上傳輸：**字串**（避免 JS `number` 浮點與竄改）
- 後端內部：`BigDecimal`
- 格式：十進位、固定兩位小數（例 `"0.00"`、`"1299.50"`）
- **禁止**在契約層用 JSON number 當價錢真相

### 4.4 完整成功範例（列表一筆）

```json
{
  "success": true,
  "data": [
    {
      "id": "P001",
      "itemId": "E001",
      "status": "active",
      "name": "Coleman 六人帳篷",
      "category": "帳篷",
      "brand": "Coleman",
      "description": "<p>適合露營使用。</p>",
      "image": "/assets/images/products/P001-1.jpg",
      "price": "3200.00",
      "rating": "4.6",
      "reviewCount": 35,
      "tags": ["Coleman", "帳篷", "熱銷"],
      "variants": [
        {
          "id": "V001",
          "sku": "TENT-OLIVE",
          "color": "深橄欖綠",
          "size": null,
          "specification": "深橄欖綠",
          "price": "3200.00",
          "availableQuantity": 8,
          "inStock": true
        },
        {
          "id": "V002",
          "sku": "TENT-SAND",
          "color": "沙漠棕",
          "size": null,
          "specification": "沙漠棕",
          "price": "3300.00",
          "availableQuantity": 0,
          "inStock": false
        }
      ]
    }
  ]
}
```

### 4.5 詳情成功範例

```json
{
  "success": true,
  "data": {
    "id": "P001",
    "itemId": "E001",
    "status": "active",
    "name": "Coleman 六人帳篷",
    "category": "帳篷",
    "brand": "Coleman",
    "description": "<p>適合露營使用。</p>",
    "image": "/assets/images/products/P001-1.jpg",
    "price": "3200.00",
    "rating": "4.6",
    "reviewCount": 35,
    "tags": ["Coleman", "帳篷", "熱銷"],
    "variants": [
      {
        "id": "V001",
        "sku": "TENT-OLIVE",
        "color": "深橄欖綠",
        "size": null,
        "specification": "深橄欖綠",
        "price": "3200.00",
        "availableQuantity": 8,
        "inStock": true
      }
    ]
  }
}
```

---

## 5. B-5 範圍與目前狀態

| 子項 | 狀態 | v0.3 行為 |
|------|------|-----------|
| B-5a 基本商品規格 | 已完成 | `variants[]` 只回 active variant，包含 `id`、`sku`、`color`、`size`、`specification`、`price` |
| B-5b 規格層級可售庫存 | 已完成 | v0.3 回傳 `availableQuantity`／`inStock` |

`sellable_product_variants` 只代表商品、器材與 variant 狀態可販售。後端另以 `variant_id` 為粒度，計算 `inventory_stocks.on_hand_quantity` 扣除 active `product_stock_reservations.quantity`；終止狀態不扣庫存，結果最低為 0。

---

## 6. v0.3 **明確不做**（之後版本再談）

以下舊 Mock／頁面欄位**不得**出現在本契約回應裡（避免前後端各寫各的）：

| 欄位／概念 | 原因 |
|------------|------|
| `rentalId`／`rentalEnabled` | 租借領域，另 API |
| `interestTags`／`specifications` 物件 | 附屬表；不屬於目前公開契約，之後可升版擴充 |
| `images[]`（多圖） | v0.3 只主圖 `image` |
| `totalStock`／`branch`／`variants[].branch` | v0.3 只提供 variant 可售量，不公開庫位分布 |
| `salesCount` | 訂單衍生；不公開數值，熱銷排序由 `/api/products/bestsellers` 在後端完成 |
| `variants[].label` | 用 `specification` 或前端組合 color／size |
| `price` 排序 | 需以 active variants 最低價做聚合，之後版本再談 |

若要加欄位：**先改本文件版本號（v0.3…）→ 再改後端 → 再改 Mock**，禁止只改一邊。

---

## 7. 前端 Mock 對齊規則

| 模式 | 行為 |
|------|------|
| `USE_MOCK_API = true` | 讀取已是 **v0.4 契約形狀**的本地 JSON；不猜測或補齊缺漏欄位 |
| `USE_MOCK_API = false` | `GET /api/products`；必須先 **解開 Envelope**（取 `data`） |

參考實作：

- 契約樣本：[`frontend/data/catalog/products.contract.sample.json`](../../frontend/data/catalog/products.contract.sample.json)
- 驗證：`frontend/storefront/js/api-mock.js` 的 `_readProductContract`

頁面若仍需要 `number` 價錢做 `toLocaleString`，只允許在 **enrich／UI 層** `Number(price)`，不得把 number 寫回「契約真相」。

---

## 8. OpenAPI

- Controller 使用 `@Operation`／`@Schema` 描述與本文件相同的欄位、分頁參數與 `meta`
- Swagger UI：`http://localhost:8080/swagger-ui.html` → **Catalog**
- 若 Swagger 與本文件衝突：**以本文件為準**，並修正程式註解

---

## 9. 變更流程（強制）

1. 改本文件（升版號、寫 changelog）
2. 改後端 DTO／組裝
3. 改 Mock 正規化／樣本 JSON
4. 更新 checklist 線 B 勾選
5. 用 Postman 打列表＋詳情＋404 各一次

### Changelog

| 版本 | 日期 | 說明 |
|------|------|------|
| 0.8 | 2026-07-24 | Product 新增 `tags`；開發 Seed 將 `created_at` 前 10 標為新品、有效訂單數量前 6 標為熱銷 |
| 0.7 | 2026-07-24 | 熱銷端點上限調整為 100 並排除零銷量；商品列表可取得完整新品與熱銷分類清單 |
| 0.6 | 2026-07-24 | 商品列表新增 `createdAt,asc\|desc` 白名單排序；首頁最新商品改依 `products.created_at` 降序 |
| 0.5 | 2026-07-24 | 新增公開熱銷商品端點，由後端依有效訂單明細數量排序，首頁不再讀取訂單端點補算 |
| 0.4 | 2026-07-23 | 正式 Product API 加入 `rating` 與 `reviewCount`，統一商品卡與商品詳細頁評分來源 |
| 0.3 | 2026-07-21 | B-4 商品篩選與 B-5b variant 可售量已實作；加入 `availableQuantity`、`inStock` |
| 0.2 | 2026-07-20 | 文件釐清 B-5：基本 `variants[]` 已隨 B-1／B-2 完成；規格層級可售庫存尚未實作，需升版後才能加入 |
| 0.2 | 2026-07-20 | B-3 驗收：非空跨頁、PostgreSQL `id`／`name` 雙向排序、非法參數 Envelope、超頁 meta 與 Controller HTTP 整合測試通過 |
| 0.2 | 2026-07-20 | B-3：列表支援 page／size／id、name 白名單排序，並回傳分頁 meta |
| 0.1 | 2026-07-20 | 初版：B-1／B-2 精簡欄位（甲）鎖定 |
