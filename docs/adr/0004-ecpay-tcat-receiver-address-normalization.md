# ADR 0004：ECPay TCAT 收件地址出站正規化

| 欄位 | 內容 |
|------|------|
| **狀態** | Accepted |
| **日期** | 2026-07-29 |
| **決策者** | Product / Grilling（ecpay-tcat-address） |

## 背景

Phase 2 宅配 Admin 出貨時，綠界 TCAT 回傳 **10500057**（黑貓無法判斷收件地址）。ORD-0235 snapshot 為 `403 臺中市 南屯區 公益路190號`：郵遞區號與南屯區（408）不符，且出站 `ReceiverAddress` 含空格與「臺」字，與綠界 7414.md 範例（緊湊、`台`）不一致。

ADR 0003 已處理 **Recipient Name**；**Recipient Address** 出站格式尚未定義。

## 決策

1. **不新增** orders 結構化地址欄位；建單前由 domain formatter 將 `shipping_address_snapshot` 正規化為 `ReceiverZipCode` + `ReceiverAddress`。
2. **出站規則**：拆 leading zip；地址段去除所有空白；`臺`→`台`；長度 >6 且 ≤60；**不** silent 修正 zip 與行政區不一致。
3. **前端**：縣市＋行政區選定後 **自動帶入 3 碼**郵遞區號；宅配 checkout 驗證 zip 與 lookup 一致。
4. **已下單** 地址錯誤：**取消重下**；不提供 Admin 改 snapshot。
5. 寄件人 `SenderAddress` 出站套用同一套 compact／臺→台。

## 理由

- 綠界 TCAT geocoder 對格式敏感；集中出站邏輯可測、可對照官方範例。
- 3 碼 zip auto-fill 在 UI 層防新單錯誤，成本低於全台 5 碼 extended。
- 與 ADR 0003「硬擋、不 silent 清洗」一致——zip 錯不後端偷改。

## 後果

- 新模組 `EcpayTcatAddressFormatter`（或等效）與 `EcpayReceiverNameRules` 對稱。
- 會員／checkout 選南屯區應看到 408，而非手 key 403。
- 舊單 ORD-0235 須取消重下後才能出貨成功。

## 相關

- [ADR 0003](./0003-checkout-recipient-sync-member-address.md)
- [`.scratch/ecpay-tcat-address/spec.md`](../../.scratch/ecpay-tcat-address/spec.md)
- [`ecpay-real-sandbox-validation.md`](../backend-specs/logistics/ecpay-real-sandbox-validation.md)
