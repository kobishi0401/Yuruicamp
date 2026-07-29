# 會員配送地址 API 契約

| 欄位   | 內容                                                          |
| ------ | ------------------------------------------------------------- |
| 狀態   | Implemented v0.1                                              |
| 認證   | Firebase Bearer，會員本人                                     |
| 資料表 | `customer_shipping_addresses`；Email 投影自 `customers.email` |

## GET `/api/me/shipping-address`

回傳目前登入會員的預設配送地址；尚未設定時 `data` 為 `null`。

## PUT `/api/me/shipping-address`

建立或取代目前登入會員的預設配送地址。會員 ID 只取自 `CustomerPrincipal`，Request 不接受 `customerId`。

```json
{
  "recipientName": "王小明",
  "postalCode": "701",
  "city": "臺南市",
  "district": "東區",
  "addressLine": "長榮路二段200號 3樓",
  "phone": "0912345678",
  "email": "member@example.test"
}
```

規則：

- `recipientName`、縣市、行政區及地址不可空白。
- 郵遞區號為 **3 或 5 碼**數字；**前台 UI 選定行政區後應自動帶入 3 碼**（與該區一致）。宅配 checkout 會驗證 zip 與縣市／區 lookup 相符；後端 API 仍接受 3 或 5 碼，不 silent 修正不一致。
- 手機為 `09` 開頭的 10 碼數字。
- Email 必須與登入會員的 `customers.email` 相同；本端點不負責修改登入信箱。
- 成功回傳完整地址；驗證失敗回 `400 VALIDATION_ERROR`，未登入回 `401 UNAUTHORIZED`。

## 與 ECPay 宅配（TCAT）的關係

會員地址寫入後，checkout 將結構化地址序列化為 `shipping_address_snapshot`（含 zip、縣市、區、路號）。Admin 出貨時後端再正規化為綠界 `ReceiverZipCode` + `ReceiverAddress`（compact、`台` 字）。詳見 ADR 0004 與 `.scratch/ecpay-tcat-address/spec.md`。
