# Yuruicamp — Domain Context

本文件定義跨模組共用的領域詞彙，供人類與 Agent 對齊語意。

## Commerce / Checkout

| 詞彙 | 意義 | 備註 |
|------|------|------|
| **Buyer（聯絡人）** | 下單時的聯絡人姓名、電話、Email | 存於 `buyer_name_snapshot` 等；可來自 Firebase 顯示名（可含 `-`、空格） |
| **Recipient（收件人）** | 物流／取件使用的收件人姓名 | 存於 `recipient_name_snapshot`；與 Buyer 可不同 |
| **ReceiverName** | 綠界物流建單 API 的收件人姓名字段 | 由 `recipient_name_snapshot` 送出；`cvs`/`delivery` 須符合 `EcpayReceiverNameRules` |

## ECPay Logistics

| 詞彙 | 意義 |
|------|------|
| **CVS** | 超商取貨（全家 FAMI） |
| **HOME / TCAT** | 宅配到府（黑貓） |
| **10500070** | 綠界「收件人姓名不可輸入特殊符號」錯誤碼 |

## 相關文件

- ADR：`docs/adr/0003-buyer-vs-recipient-ecpay-receiver-name.md`
- 真沙箱驗收：`docs/backend-specs/logistics/ecpay-real-sandbox-validation.md`
