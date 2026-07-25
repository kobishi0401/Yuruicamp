# ADM-W2-05 — 跨領域庫存轉換（商店 ↔ 租借）

| 欄位 | 內容 |
|------|------|
| **波次** | W2｜P1 |
| **狀態** | ✅ 完成（手動驗收通過；2026-07-25） |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § ADM-W2-05 |
| **索引** | [`../README.md`](../README.md) |
| **Dependencies** | **G-3**；建議 [`ADM-W2-03`](./ADM-W2-03-rental-skus.md)、[`ADM-W2-06`](./ADM-W2-06-inventory-locations.md) |
| **權限** | `movement.edit`（讀 `movement.view`） |

---

## 0. 開工前必讀

- [x] 讀 `docs/database-documents/inventory/inventory-conversions.md`
- [x] 定案：**完整成對** `conversion_out`＋`conversion_in`＋`inventory_conversions`＋冪等
- [x] draft 明細仍維持「只能加、不能改刪」（總覽定案）
- [x] 不可負庫、不可低於 active 保留；失敗整筆 rollback

---

## 1. 契約

- [x] 升版 Admin／Inventory 契約：轉換專用端點或擴充 movement type
- [x] 建立 draft（兩端 location、source store variant、dest rental variant、quantity、idempotencyKey）
- [x] 過帳 API；重送冪等
- [x] 錯誤碼：庫存不足 `409`、domain 不符、variant 不存在
- [x] 明確：單邊假轉換不允許

---

## 2. Schema

- [x] 表已存在則不改；確認 `inventory_conversions` 欄位與 FK
- [x] movement_type 是否已含 `conversion_out`／`conversion_in`（否則 ENUM／CHECK 變更）

---

## 3. 後端

- [x] 同交易建立兩邊異動表頭／明細＋ conversions 列
- [x] post：固定順序鎖庫存 → 扣 store → 加 rental → 兩邊標 posted
- [x] cancel draft：兩邊一併作廢
- [x] 冪等鍵防重
- [x] 併發測試案例設計

---

## 4. 前端

- [x] 轉換／調撥 UI 改打真 API（勿只產前端假異動）
- [x] 成功後刷新庫存唯讀摘要
- [x] 錯誤訊息可讀

> **UI**：商品頁「調撥」→ `inventory-conversions`（分店→營地）；營地互轉走 G-3 rental `transfer`。  
> 詳見 [`W2-ui-followups.md`](./W2-ui-followups.md) § 延後項 B（已完成＋手動驗收）。

---

## 5. 測試與驗收（必要）

- [x] PostgreSQL 整合：成功轉換後兩邊 on_hand 正確
- [x] 庫存不足 → 全 rollback
- [x] 重複 idempotencyKey → 回放不雙重扣加
- [x] 併發兩筆搶最後數量 → 僅一筆成功

---

## 6. 收尾

- [x] 總覽 W2-05；本檔 ✅
- [x] 若 W2 其他項也完成：勾 W2 波次門檻

---

## 驗收紀錄

| 日期 | 執行者 | 結果 | 備註 |
|------|--------|------|------|
| 2026-07-25 | Amy | ✅ | 手動：store→rental＋營地互轉畫面流程；PostgreSQL IT 既有 |

---

## 變更紀錄

| 日期 | 執行者 | 結果 | 備註 |
|------|--------|------|------|
| 2026-07-25 | Amy | ✅ | 文件收斂；手動驗收通過；UI follow-up 已完成 |
