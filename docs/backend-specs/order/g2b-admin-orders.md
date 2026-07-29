# G-2b 後台訂單管理

## 用途

提供具備 `orders.view`／`orders.edit` 的管理員查詢訂單、讀取商品與歷程，以及執行出貨和完成命令。Admin 不得直接改寫 ECPay 付款或退款結果。

出貨（`POST …/ship`）對 `cvs`／`delivery` 會**同交易**呼叫綠界建立物流單並寫入 `ecpay_logistics_id`；`pickup` 不呼叫綠界。細節見 [`admin-api-contract.md`](../../api/admin-api-contract.md)「出貨與綠界物流」與 [`ecpay-real-sandbox-validation.md`](../logistics/ecpay-real-sandbox-validation.md)。

## 流程

```text
Admin Token → RBAC → ID 分頁 → 載入表頭摘要
開啟詳情 → 商品快照 + 狀態歷程
履約命令 → 悲觀鎖 → 驗證付款／退款／狀態 → 更新訂單 + history
```

線上付款必須是 `paid` 且 `refundStatus=none` 才能出貨。COD 可在 unpaid 時出貨，完成時於同一交易標記 paid 與 `paidAt`。重複命令採冪等回放，不重複新增歷程。CVS／宅配出貨前會驗證收件人姓名（綠界 ReceiverName）與宅配地址格式；建單失敗回 `409 CONFLICT`。

W1-01：`PATCH /api/admin/orders/{id}/internal-note` 覆寫 `orders.internal_note`；詳情回傳 `internalNote`；列表省略；空白清成 null。

列表不直接 JOIN 商品與歷程，避免一對多資料放大分頁。完整地址、商品和歷程只在詳情回傳。

`AdminOrderController` 使用 `firebaseBearer` OpenAPI Security Requirement，讓 Swagger `Authorize` 保存的 Firebase ID Token 自動加入 `Authorization: Bearer` Header。這項宣告只描述 API 認證需求，實際安全邊界仍由 Firebase Filter 與 `orders.view`／`orders.edit` RBAC 負責。

## 驗證

- Maven 完整測試通過。
- `AdminOrderServiceTest` 通過。
- `AdminOpenApiSecurityTest` 通過，確認受保護 Admin Controller 宣告 `firebaseBearer`。
- `AdminFulfillmentPostgreSqlIntegrationTest` 已連線 PostgreSQL 驗收通過。
- Admin facade 與 Vite production build 通過。
- Swagger 履約流程已驗收通過。
