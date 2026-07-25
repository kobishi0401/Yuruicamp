# ADM-W2-08 — 商品 Modal 寫入商城庫存＋異動稽核（`product_stock_update`）

| 欄位 | 內容 |
|------|------|
| **波次** | W2｜P1（追加切片；翻轉 G-2c／G-3 庫存寫入語意） |
| **狀態** | ✅ 完成（手動驗收通過；契約 v0.17／方案 B） |
| **日期** | 2026-07-24 |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § ADM-W2-08 |
| **索引** | [`../README.md`](../README.md) |
| **契約** | [`../../../docs/api/admin-api-contract.md`](../../../docs/api/admin-api-contract.md) **v0.17** |
| **Schema 流程** | [`../../backend-schema-change-checklist.md`](../../backend-schema-change-checklist.md) |
| **Dependencies** | G-2c Products、G-3 Movements（語意將被本項覆寫）；**W2-05 conversion 維持例外**（store→rental 仍改兩邊 on-hand）；**rental transfer（營地互轉）維持例外**（post 仍改 `rental_sku_variant_stocks`） |
| **權限** | 寫商城 on-hand：`products.edit`；建／post 稽核單與改原因：`movement.edit`；異動列表讀：`movement.view` |

---

## 0. 開工前必讀（鎖定規格）

### 0.1 責任分工（一句話）

> **商城** `inventory_stocks` 由 **Admin Products 建立／更新** 寫入。  
> **`inventory_movements`（`product_stock_update`）** 只保存調整歷程；**post 定稿、不再加減商城庫存**。  
> **商城→租借調撥**走 `inventory-conversions`（過帳仍改兩邊庫存）；**禁止租借→商城**。  
> **營地↔營地**走 `inventoryDomain=rental` + `movementType=transfer`（過帳仍改租借庫存）。  
> **異動頁唯讀**（不能新建 `product_stock_update` 以外的營運單；營地互轉由商品頁 Modal 呼叫 API）；前台成交／保留量邏輯不變。

### 0.2 商品 Modal → 存檔

```text
編輯各分店數量 → 存檔
  → PUT/POST /api/admin/products
  → 同交易：規格主檔 + 直接寫 inventory_stocks（鎖 variant×location）
  → 每店最終 on_hand ≥ 0，否則 4xx
  → 各店加減加總可不平衡：只 toast，不擋 PUT
  → 未出現的 location：不改（Z2）；明示 0 才清零
  → 整段庫存欄位省略：只改名／價／規格，不動庫存
  → 新增且有填主倉量：同交易建 inventory_stocks
  → 有數量變更 → sessionStorage pending；擋跳頁；提醒產異動（R1）
```

### 0.3 產生異動紀錄

```text
問表頭 reason（必填）
  → 前端算列（T1 + U3）
  → 一張 draft（movementType = product_stock_update）
  → 加明細 → 立刻 post（一鍵）
  → post 失敗：toast，可重試（庫存已改、單可能停 draft）
```

| 列規則 | 內容 |
|--------|------|
| 調撥感（主倉 -2、台北 +2） | **T1 一列**：數量 `2`，來源主倉 → 目標台北 |
| 只有 +N（U3） | 數量 `N`，來源 `NULL`（UI `---`）→ 該店 |
| 只有 -N（U3） | 數量 `N`，該店 → `NULL` |
| 數量 | **正整數**，不可 &lt; 0；方向靠 from／to |
| `lineReason` | 選填（Admin UI 標籤為「**備註**」；API 欄位名仍為 `lineReason`） |
| `lineNature` | 選填；產單時前端依 from／to 推導預設（進貨／移轉／損耗）；詳情可改為盤點／折損等；**不**連動改 from／to |
| 操作者 | session admin id（建單／post 寫入；**改原因不更新** `employee_id`） |

### 0.4 異動頁與改原因（E1）＋列表／詳情顯示（方案 B，2026-07-24）

- 列表：**唯讀**（隱藏／移除「建立異動草稿」）
- 列表：**不顯示「異動性質」欄**（性質只在詳情列上看）
- 詳情表頭：可改 `reason`（draft／posted；需 `movement.edit`）
- 詳情每一列：
  - **異動性質**：可下拉改；寫入 DB `line_nature`／API `lineNature`  
    - 白名單：`receipt`／`transfer`／`stocktake`／`damage`／`write_off`  
      （UI：進貨／移轉／盤點／折損／損耗）  
    - 產單預設：`---`→店＝進貨；店→店＝移轉；店→`---`＝損耗（盤點／折損僅手動）  
    - 改性質 **不**改 from／to／quantity  
    - 表頭 `movementType=product_stock_update` 仍表示「這張是稽核單」，與列性質分開
  - **備註**：UI 顯示名；對應 API／DB `lineReason`／`line_reason`；僅詳情可 PATCH（draft／posted）
- 不可改 quantity／from／to
- API：PATCH 表頭 reason；PATCH 列 `lineReason` 與／或 `lineNature`

### 0.5 規格說明（前端）

- Modal **不顯示**「規格說明」
- 送出時用 color／size 組字填 `specification`（schema **不動**）

### 0.6 本輪刻意不做

- [x] 租借 Modal 改營地／租借 on-hand（下一輪）
- [x] 租借→商城
- [x] 伺服器端強制補產異動（R2／R3；維持 R1 sessionStorage）
- [x] 刪除 `product_variants.specification` 欄位

### 0.7 與 W1／W2／W3 衝突處理（已對齊）

| 項目 | 處理 |
|------|------|
| W1-07 min-stock | **保留**：只改閾值；文件改「on-hand 改由 Products 寫」 |
| W2-03「租借庫存走 G-3 rental 異動」 | **改寫**：租借增加靠 **conversion**；本輪無租借盤虧 Admin 路徑 |
| W2-05「商店 ↔ 租借」 | **改為 →**；code 已是 store→rental |
| W2-06 停用庫位清零 | 同領域清庫改走 **商品 Modal 設 0**，不再靠異動頁 transfer |
| W3 取消／退款 | **無衝突**（reservation／訂單路徑） |
| G-2c 唯讀／G-3 post 改庫存 | **本項覆寫** |

---

## 契約差分大綱（v0.15 → v0.16）

> 完整條文見 [`admin-api-contract.md`](../../../docs/api/admin-api-contract.md)。此節供審閱「改了什麼」。

### §6 Products — 差分

| 項目 | v0.15（舊） | v0.16（新） |
|------|-------------|-------------|
| 庫存寫入 | 一律唯讀；不建初始庫存 | **可寫** `inventory_stocks`（`products.edit`） |
| Request | 不接受 branch／inventory | 可選 `variants[].stockLocations[]`：`{ locationId, onHandQuantity }` |
| 省略規則（Z2） | — | **單一 location 未出現＝不改**；明示 `0` 才清零；**整段省略＝不改任何庫存** |
| 下限 | — | 每個寫入後的 on_hand **≥ 0**，否則 `400`／`409` |
| 不平衡 | — | 各店加減加總可不平衡；**後端不驗證平衡** |
| 新增商品 | 無初始庫存 | 有送主倉（或任一 location）量 → 同交易 upsert `inventory_stocks` |
| 鎖 | — | 同交易鎖涉及的 `variant × location` |
| UI／契約註 | — | Admin UI 可不顯示 `specification`；前端組字後仍送出 |

### §7 Inventory movements — 差分

| 項目 | v0.15（舊） | v0.16（新） |
|------|-------------|-------------|
| 誰改庫存 | **post 改** on_hand | **post 不改** on_hand（稽核定稿） |
| 新建 type | `receipt`／`write_off`／`transfer` | **新單只准** `product_stock_update`；舊格式資料可清 |
| 表頭 location | 必依 type 填 source／dest | 可 NULL（細節在列） |
| 明細 | 僅 `variantId`＋正整數 `quantity`；同單同規格唯一 | ＋`sourceLocationId`／`destinationLocationId`／`lineReason`；同規格可多列 |
| 異動頁 | 可建草稿、過帳 | **唯讀列表**；詳情可 PATCH 原因 |
| 建立入口 | 異動頁 | **商品頁「產生異動紀錄」**一鍵 create＋items＋post |
| PATCH | 無 | `PATCH /{id}`（表頭 reason）、`PATCH /{id}/items/{itemId}`（lineReason）；不更新 `employee_id` |
| Conversion | 契約寫「不在本節」 | **例外**：`/api/admin/inventory-conversions` store→rental，**post 仍改庫存**；禁止反向 |

### §7 追加（v0.16 → v0.17／方案 B）

| 項目 | v0.16／0.16.1 | v0.17（新） |
|------|---------------|-------------|
| 列異動性質 | 方案 A：前端唯讀推導，不落 DB | DB `line_nature`／API `lineNature`；白名單 receipt／transfer／stocktake／damage／write_off |
| 產單 | 不送 nature | 前端依 from／to 帶推導預設（進貨／移轉／損耗） |
| 詳情 | 性質不可改 | 下拉可改；**不**連動 from／to／quantity |
| PATCH 列 | 只 `lineReason` | `lineReason` 與／或 `lineNature` |

### 前端 Runtime（§11）— 差分

| 項目 | 舊 | 新 |
|------|----|----|
| min-stock note | on-hand 唯讀須經 G-3 | 閾值可編；on-hand 經 Products；異動為稽核 |
| 調撥 UI 延後註 | 仍寫「尚未打 conversion」 | 與 [`W2-ui-followups.md`](./W2-ui-followups.md) 對齊（已接線則刪過時句） |

---

## 1. 契約

- [x] 升版 Admin 契約 → **v0.16**（庫存寫入語意）
- [x] 升版 → **v0.17**（方案 B `lineNature`）
- [x] §6 寫入 `stockLocations` 規則（Z2、≥0、可省略）
- [x] §7 `product_stock_update`、明細 from／to／lineReason／lineNature、post 不定庫存
- [x] §7 新增 PATCH 改原因／性質；異動頁唯讀
- [x] Conversion 例外（store→rental）寫進契約
- [x] 更新 [`docs/api/README.md`](../../../docs/api/README.md) Admin 列版本
- [x] OpenAPI／DTO 與契約對齊（Products `stockLocations`、Movements 稽核＋PATCH）

---

## 2. Schema

- [x] 走 [`backend-schema-change-checklist.md`](../../backend-schema-change-checklist.md) Phase 8
- [x] 走 Phase 9（`line_nature`）
- [x] `inventory_movements.movement_type` CHECK／ENUM 加入 `product_stock_update`
- [x] 表頭 `source_location_id`／`destination_location_id`：對 `product_stock_update` 允許雙 NULL（放寬既有 type 與 location 組合 CHECK）
- [x] `store_inventory_movement_items`（必要時 rental 表對齊下一輪）：  
      `source_location_id`、`destination_location_id`（可 NULL）、`line_reason`（可 NULL）、`line_nature`（可 NULL＋白名單 CHECK）
- [x] 拿掉「同一 movement 同一 variant 只能一列」之 UNIQUE（若存在；本輪以列級 from／to 為準）
- [x] 開發環境：舊格式不符之異動資料 **可清**（seed 本來就不建 movements；rebuild 即可）
- [x] 同步 `docs/database-documents/inventory/inventory-movements.md`、`docs/database-schema-guide.md`、`docs/schema-enums.md`

---

## 3. 後端

- [x] `AdminProductService`：同交易 upsert `inventory_stocks`；鎖 variant×location；Z2；≥0
- [x] Product Request DTO 接受可選 `stockLocations`
- [x] `AdminInventoryMovementService`：  
      - 新建僅允許 `product_stock_update`  
      - create／add items 支援列級 from／to／lineReason  
      - **post 只改 status／posted_at／employee_id，不改 on_hand**  
      - 拒收異動頁式的 receipt／write_off／transfer 新建（create 僅允許 `product_stock_update`）
- [x] 新增 PATCH reason／lineReason／lineNature（不更新 employee_id）
- [x] Conversion：**維持** post 改庫存；文件／錯誤訊息強調单向 store→rental
- [x] RBAC＋OpenAPI
- [x] 整合測試：Products 寫庫存；movements post 後 on_hand 不變；PATCH 原因（10 tests green）

---

## 4. 前端

- [x] 商品 Modal：Backend 顯示各分店數量輸入；**隱藏規格說明**
- [x] 存檔：有庫存變更才帶 `stockLocations`；算 pending → `sessionStorage`
- [x] 擋跳頁／提醒「尚未產生異動紀錄」；「產生異動紀錄」問 reason → 一鍵 create＋items＋post；失敗 toast 重試
- [x] 異動頁：隱藏建立草稿／過帳／作廢（或僅 view）；詳情可編原因（`movement.edit`）
- [x] 調撥商城→租借：續用 conversion API（來源可選分店／主倉）
- [x] readiness／註解更新（products note：on-hand 可經商品寫入）
- [x] **方案 A UI**：列表隱藏「異動性質」；「列原因」改標「備註」
- [x] **方案 B**：產單帶 `lineNature` 推導預設；詳情下拉可改；PATCH `lineNature`；改性質不改 from／to
---

## 5. 測試與驗收

- [x] PUT 改兩店數量 → DB on_hand 立刻變；尚無異動單亦可（R1）
- [x] 產生異動 → 一張 `product_stock_update` posted；on_hand **不再變**
- [x] 明示 location=`0` 清零；省略 location 不改
- [x] 整段省略 stockLocations → 只改名價
- [x] on_hand 欲變負 → 4xx
- [x] 異動頁無法新建；詳情可改 reason／備註
- [x] 詳情可改 `lineNature`（如移轉→盤點）；from／to 不變
- [x] conversion store→rental 仍改兩邊庫存；嘗試反向被拒（若 API 已拒）
- [x] W1-07 min-stock 設定後 on_hand 仍不因 min-stock 改變

---

## 6. 收尾

- [x] 總覽勾 ADM-W2-08；本檔 ✅
- [x] 更新 g2c／g3 backend-specs 頂部「已被 W2-08 覆寫」註記
- [x] 更新 W2-03／W2-05／W2-06 checklist 過時句（指向本檔）
- [x] README／backend README 狀態句

---

## 驗收紀錄

| 日期 | 執行者 | 結果 | 備註 |
|------|--------|------|------|
| 2026-07-24 | — | 契約定案 | Admin API v0.16 |
| 2026-07-24 | agent | Schema＋後端通過 | Phase 8-6 validate；IT Products／Movements／Conversion 10 green |
| 2026-07-24 | agent | 前端接線 | Modal 寫庫存、pending／一鍵稽核、異動頁唯讀＋PATCH；手動驗收主線 OK |
| 2026-07-24 | — | 方案 A 文件定案 | 列表不顯示異動性質；詳情列性質唯讀推導；列原因 UI＝備註 |
| 2026-07-24 | agent | 方案 A 前端完成 | movement 列表 5 欄；詳情推導進貨／移轉／損耗；備註＝lineReason |
| 2026-07-24 | — | 方案 B 定案 | 列級可改性質；白名單 receipt／transfer／stocktake／damage／write_off；產單帶預設 |
| 2026-07-24 | agent | 方案 B 實作 | Schema `line_nature`；API v0.17；FE 產單預設＋詳情下拉；Phase 9 IT green |
| 2026-07-24 | Amy | ✅ 手動驗收通過 | 產單預設＋詳情改性質（from／to 不變）；主線庫存寫入／稽核 OK |
