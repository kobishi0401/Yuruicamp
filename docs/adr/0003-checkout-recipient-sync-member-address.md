# ADR 0003：Checkout 收件人與會員配送地址同步

| 欄位 | 內容 |
|------|------|
| **狀態** | Accepted（Implemented 2026-07-29） |
| **日期** | 2026-07-29 |
| **決策者** | Product / Grilling（checkout-recipient-ecpay） |

## 背景

商城 checkout Step 1「聯絡資訊」與會員中心配送地址重複，且前端曾把 `buyerName` 誤當 `recipientName`。Firebase 英文名（如 `Po-Jung Chen`）寫入訂單後，Admin 出貨時綠界回傳 **10500070**。後端建單時 `buyer_*` 本已來自會員帳號，表單聯絡區對建單幾乎無效。

## 決策

1. **移除** checkout「聯絡資訊」整區（含備註、「帶入會員資料」）。
2. 三種配送方式共用 **收件人摘要**（姓名、手機、Email），透過與會員中心相同的配送地址 Modal 編輯。
3. Checkout Modal 儲存 **同步寫回** `/me/shipping-address`（決策 A：預設同步）。
4. `recipient_*` 快照 **只** 來自配送地址；**不再** fallback Firebase display name。
5. 綠界 `ReceiverName` 規則集中於 `EcpayReceiverNameRules`；Checkout PATCH 與 Admin 出貨 **雙層硬擋**；**不 silent 清洗**姓名。

## 理由

- Buyer（金流）與 Recipient（物流）職責分離，降低客訴與真沙箱驗收失敗率。
- 單一資料源（會員配送地址）避免 checkout／會員中心不一致。
- 硬擋優於付完款或 Admin 出貨才失敗；前端 proactive 提示為第二道防線。

## 後果

- 前端 checkout 線框改為「配送資訊 → 付款方式」兩步。
- 既有英文 Firebase 名稱使用者須在配送地址改 **中文收件人** 才能走 CVS／宅配。
- `pickup` 不受綠界 ReceiverName 字元規則約束。

## 相關

- [`.scratch/checkout-recipient-ecpay/CONTEXT.md`](../../.scratch/checkout-recipient-ecpay/CONTEXT.md)
- [`ecpay-real-sandbox-validation.md`](../backend-specs/logistics/ecpay-real-sandbox-validation.md)
