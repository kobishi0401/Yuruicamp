# ADR 0001：displayNo 與 UUID 內部主鍵分離

| 欄位 | 內容 |
|------|------|
| **狀態** | Accepted（**Implemented** 2026-07-26） |
| **日期** | 2026-07-26 |
| **決策者** | Product / Grilling |

## 背景

建單時 `orders.id`、`bookings.id` 使用 `O`／`B` + UUID 片段，供 ECPay `CustomField1` 與 API 路徑使用。前端 Mock 時代假設數字 id 可格式化成 `ORD-0001`／`BK-0001`，真實環境 UUID 導致成功頁、後台列表顯示雜湊。

## 決策

- 保留 **UUID 字串** 為內部主鍵與金流對單鍵。
- 新增 **`display_no`** 欄位與獨立序號（`ORD`、`BK` 各一序列）。
- 對外 UI（成功頁、後台列表、Modal 標題、客服口述）只顯示 `displayNo`。
- 舊資料依 `created_at` 回填；seed 資料一併發號。

## 理由

- 變更 ECPay CustomField1 或全表改 numeric PK 成本高且風險大。
- 與庫存異動 `MOV-015` 模式一致：人類序號 + 穩定內部 id。

## 後果

- Migration + 建單 Service 必須取序號。
- API 契約增 `displayNo`；前端 formatter 改讀 API 欄位。
- 搜尋／篩選可選支援 displayNo（後續）；初版至少列表顯示。
