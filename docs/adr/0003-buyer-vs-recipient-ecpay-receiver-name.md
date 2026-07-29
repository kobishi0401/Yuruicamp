# ADR 0003：Buyer ≠ Recipient 與綠界 ReceiverName 硬擋

| 欄位 | 內容 |
|------|------|
| **狀態** | Accepted（**Implemented** 2026-07-29） |
| **日期** | 2026-07-29 |
| **決策者** | Product / Grilling |

## 背景

Checkout 前端曾將 Firebase **聯絡人姓名**（例如 `Po-Jung Chen`）直接寫入 `recipient_name_snapshot`。綠界物流建單 API 的 `ReceiverName` 禁止連字號、空格與特殊符號，導致 Admin 出貨時才收到 `10500070`，買家已付款卻無法出貨。

資料庫已有 `buyer_name_snapshot` 與 `recipient_name_snapshot`，但 UI 與 PATCH 邏輯把它們綁成同一欄。

## 決策

1. **語意拆分**：Step 1 為 **聯絡人（Buyer）**；Step 2 物流區為 **收件人（Recipient）**，預設勾選「同聯絡人」。
2. **驗證範圍**：`shipping.method` 為 `cvs` 或 `delivery` 時，對 recipient 套用綠界 ReceiverName 規則；`pickup` 僅驗非空。
3. **雙點硬擋**：Checkout 存檔 + Admin 出貨建單前，皆呼叫共用 `EcpayReceiverNameRules`。
4. **不 silent 清洗**：只 trim 前後空白；不自動移除 `-`、空格或轉換英文為中文。
5. **前端 proactive + 後端 authoritative**：聯絡人不符合物流格式時，取消「同聯絡人」並提示填中文收件人。

## 理由

- 金流／客服聯絡人應保留 Firebase 顯示名，不應為了物流強改 Google 個人資料。
- Silent 清洗可能產生錯誤姓名（例如 `Po-Jung` → `PoJung` 仍可能不符預期），且難以向買家解釋。
- Checkout 階段失敗比付款後 Admin 出貨失敗成本低。
- 共用規則模組避免 Checkout 與 Logistics 兩處 regex 漂移。

## 後果

- 新增 checkout 收件人欄位與「同聯絡人」勾選；PATCH 獨立送 `shipping.recipientName`。
- 舊訂單若 snapshot 仍含非法姓名，Admin 出貨會收到明確 CONFLICT（需人工聯絡買家）。
- 真沙箱 E2E 應使用中文收件人（例如 `陳柏榮`），勿依賴 Firebase 英文連字號名稱。
