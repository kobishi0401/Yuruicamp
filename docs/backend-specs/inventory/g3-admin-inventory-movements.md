# G-3 Admin Inventory Movements

> **⚠️ 語意覆寫（2026-07-24）**  
> Admin 契約 **v0.17／ADM-W2-08**：通用 `inventory-movements` 新建以 `product_stock_update` 為主，**post 不定商城 on-hand**；異動頁改唯讀；列級 `lineNature` 可 PATCH。  
> **例外 1**：`inventory-conversions`（store→rental）過帳仍改兩邊庫存。  
> **例外 2**：`inventoryDomain=rental` + `movementType=transfer`（營地↔營地）過帳仍改 `rental_sku_variant_stocks`（G-3 鎖／409／保留量規則）。  
> 下文描述的是 **G-3 當日實作**（含 store receipt／write_off／transfer）；現況新建白名單以契約 v0.17 與 [`ADM-W2-08`](../../../plans/admin-post-g6/w2/ADM-W2-08-product-stock-update.md) 為準。

## 用途

集中所有正式庫存寫入，禁止商品編輯、前端記憶體或直接 API 欄位繞過庫存異動歷程。商城寫入 `inventory_stocks`，租借寫入 `rental_sku_variant_stocks`。

## 主要流程

```text
建立 draft
→ 驗證同領域來源／目的庫位
→ 新增規格與數量快照明細
→ 鎖定 draft 表頭
→ 依 variantId、locationId 固定順序建立並鎖定庫存列
→ 驗證扣減後不小於 0 且不低於 active 保留量
→ 更新全部庫存列
→ movement 改為 posted，記錄操作者與 postedAt
```

任何明細失敗會 rollback 整張異動單的庫存更新。posted 重送只回放結果；cancelled 不得過帳。只有 draft 能新增明細或作廢，posted 不能修改或取消。

## 支援範圍

| 領域 | 入庫 | 出庫／損耗 | 調撥 | 寫入表 |
|------|------|-------------|------|--------|
| store | `receipt` | `write_off` | `transfer` | `inventory_stocks` |
| rental | `receipt` | `write_off` | `transfer` | `rental_sku_variant_stocks` |

`transfer` 只允許同一 inventory domain 的兩個不同庫位。`conversion_out`／`conversion_in` 與 `inventory_conversions` 屬於商城轉租借的跨領域流程，需要成對異動與轉換比例契約，本切片不沿用前端記憶體換算。

商城來源扣減會保留所有 active `product_stock_reservations`；租借來源採保守策略，所有 active `rental_stock_reservations` 都視為不可扣除。這使管理員異動不會破壞既有 Checkout 或 Booking 承諾。

## 資料與操作歷程

- 表頭寫 `inventory_movements`，明細依領域寫具體 movement item 表。
- SKU 與品名在加入明細時保存快照，後續商品改名不會回寫歷史。
- Schema 的 `employee_id` 保存最後執行過帳或作廢的人，posted_at 保存過帳時間。
- 現有 Schema 沒有逐事件 audit history 表；異動單本身是不可變帳。若需要同時保存建立者、過帳者與多次審批，應另增 audit Schema，不把事件塞回前端 JSON。

## 前端接線

- Movement 頁在 Backend 模式提供建立草稿、多筆規格、草稿追加明細、過帳與作廢。
- 分類、庫位與規格都由 `/lookups` 回傳正式 ID。
- 建立草稿與新增明細不先改庫存；只有過帳 Response 成功後才更新 cache。
- Products 頁的記憶體 `addMovementRecord()` 在 Backend 模式明確拒絕，避免整包 Mock 紀錄送入正式 API。
- Mock 模式保留原本唯讀紀錄與本地流程；全站永久開關仍由 G-6 負責。

## 驗證結果

- `AdminInventoryMovementServiceTest`：列表排序白名單與異動類型庫位規則通過。
- `AdminOpenApiSecurityTest`：Inventory Controller 已宣告 Firebase Bearer security。
- `AdminInventoryMovementPostgreSqlIntegrationTest`：3 項情境通過，涵蓋商城入庫、負庫存拒絕、posted／cancelled 不可變、雙執行緒重複過帳只執行一次、商城調撥、租借入庫與 RBAC。
- `frontend/tests/admin-inventory-movements-facade.mjs`：API 路徑、Bearer、Response mapping 與 Backend 正式流程通過。

本切片重用既有 Schema 與 Seed，不新增資料表、依賴或 Seed ID。
