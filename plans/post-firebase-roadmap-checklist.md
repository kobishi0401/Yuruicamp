# Firebase 主線完成後：後續工作 Checklist

| 欄位 | 內容 |
|------|------|
| **狀態** | 生效中（2026-07-25） |
| **Firebase 主線** | **已完成**（見下方「已完成」） |
| **定位** | 登入／Auth 之後的業務債與加固；**不是**再重做 Firebase 接線 |
| **相關** | [`docs/frontend-specs/firebase-merge-into-main-notes.md`](../docs/frontend-specs/firebase-merge-into-main-notes.md) |

---

## 0. 一句話

```text
Firebase 登入 → session → AppAuth／ApiClient Bearer ＝ 已通
Checkout／預約「建立訂單失敗」＝ 業務／種子／庫存問題（先診斷，勿先怪 Firebase）
```

分辨方式（Network 看失敗那筆 `POST`）：

| 回應大概 | 跟 Firebase？ | 處理方向 |
|----------|----------------|----------|
| `401` Invalid token／`AUTH_TOKEN_UNAVAILABLE` | 有關 | Auth 加固／重新登入 |
| `403`／Customer not found（剛 `docker compose down -v` 後） | 半有關 | 再登入重建 `customers`；後台重加白名單 |
| `400`／`404`／`STOCK_*`／`ZONE_*`／`VARIANT_*`／`BOOKING_DATE_*`／`409` | **無關** | 業務診斷（BK／CK） |

---

## 1. 已完成（Firebase 主線）— 勿重做

- [x] **F-A** 後端真 Firebase 驗證＋會員／Admin session API  
- [x] **F-B** 前端 `YuruiFirebase`＋Google／LINE（FB 本機暫跳過）  
- [x] **F-C** 合併 B 方案：`AppAuth`＋`ApiClient` 為唯一 HTTP 主幹  
- [x] **F-D** 階段 1：收斂／移除 `YuruiApiHttp`（`api-http.js` 已刪）  
- [x] **F-E** 階段 3：後台 Google Firebase 登入＋白名單範例 SQL  
- [x] **F-F** 階段 4：拿掉業務頁 `U001`／假會員 fallback（真實 `customerId`）

驗收證據（本機已手動過）：

- Console：`✓ GET /api/me OK (ApiClient)`（Google／LINE）  
- `typeof window.YuruiApiHttp === 'undefined'`  
- 後台 Google 登入進 dashboard（白名單 email 須在本機 DB）

---

## 2. 非 Firebase 業務

### 2.1 預約建立失敗診斷（優先）

| ID | 項目 | 狀態 | 說明 |
|----|------|------|------|
| **BK-1** | 記錄失敗的 HTTP／`error.code`／`message` | 待做 | Network：`POST /api/booking/checkout/sessions` |
| **BK-2** | 確認 payload 對齊 seed | 待做 | 營區／營位／租借要用 seed（如 `C002`、`C002-Z-A`、`RL-DEV-C002-001`）；勿用舊 mock ID |
| **BK-3** | 對照後端錯誤碼修資料或前端組裝 | 待做 | 例：`ZONE_UNAVAILABLE`、`RENTAL_STOCK_INSUFFICIENT`、`BOOKING_DATE_INVALID`、`VALIDATION_ERROR` |

手動驗收入口：[`docs/frontend-specs/test/commerce-booking-validation.md`](../docs/frontend-specs/test/commerce-booking-validation.md)

### 2.2 Checkout 建立失敗（先記錄，暫不改程式）

| ID | 項目 | 狀態 | 說明 |
|----|------|------|------|
| **CK-1** | 記錄 `POST /api/checkout/sessions` 的錯誤碼 | **先記錄** | 暫不改 code；貼 Network 結果到 issue／本 checklist 備註 |
| **CK-2** | `variantId` 必須是 DB 可賣 SKU | **先記錄** | `docker compose down -v` 後請清空購物車再加商品 |
| **CK-3** | 庫存／保留帳 | **先記錄** | `STOCK_INSUFFICIENT`、`VARIANT_NOT_SELLABLE` 等 |

契約／流程：[`docs/backend-specs/checkout/README.md`](../docs/backend-specs/checkout/README.md)

### 2.3 Checkout 付款／優惠券

| ID | 項目 | 狀態 | 說明 |
|----|------|------|------|
| **CK-4** | 優惠券套用（後端 F-2） | **已完成** | Backend UI 以券碼取得會員 claim，PATCH `couponClaimId`，成交金額只採後端 `pricing`；支援空 PATCH 移除 |
| **CK-5** | 付款後續（ECPay／confirm-cod 等） | **已完成** | 2026-07-25 stub 全流程 IT：`launch`→`stub/aio-checkout`→Notify→`paid`；COD `confirm-cod`；預約 Notify 後 `paid`＋`pending`；IT 類別見 [`backend-implementation-checklist.md`](./backend-implementation-checklist.md) I-7 備註；瀏覽器 Firebase 手動可選補驗 |

---

## 3. Firebase／Auth 剩餘（可平行、不擋業務）

| ID | 項目 | 狀態 | 說明 |
|----|------|------|------|
| **FA-1** | Facebook | 本機跳過 | Meta 擋 HTTP；正式站 HTTPS／Meta 主控台再驗 |
| **FA-2** | Token 過期／401 導回登入 | **已完成** | `ApiClient`：刷新重試一次 → 清狀態＋開登入／後台導 login；見 `api/auth-rest-client.md` |
| **FA-3** | （可選）Admin `useBackend: true`＋RBAC | 可選 | 登入已走 Firebase；各模組真打 Admin API 再逐頁開 |

白名單（本機、勿 commit 真實 email）：  
[`docs/seed/dev/021-admin-google-whitelist.example.sql`](../docs/seed/dev/021-admin-google-whitelist.example.sql)

> `docker compose down -v` 後白名單與顧客列會消失，需重新登入會員、必要時重跑白名單 SQL。

---

## 4. 工程收尾

| ID | 項目 | 狀態 | 說明 |
|----|------|------|------|
| **ENG-1** | 階段 1／3／4 變更 commit／PR | 待做 | 需負責人明確下指令再 commit／開 PR（勿自動推） |
| **ENG-2** | 本 checklist 維持更新 | 進行中 | Firebase 主線勾完成；BK／CK 當業務債追蹤 |
| **ENG-3** | 協作者入口 | 已連結 | merge notes §6 指到本文件 |

---

## 5. 建議執行順序

1. 環境：DB／seed／後端 Firebase env／前端重新登入（若剛 `-v`）  
2. **BK-1～BK-3**（預約建單診斷）  
3. **CK-1～CK-3**（只記錄錯誤碼與重現步驟）  
4. ~~**FA-2**（401 加固）~~ → **已完成**  
5. **ENG-1**（commit／PR）  
6. ~~**CK-4**（商城正式優惠券 UI）~~ → **已完成**
7. ~~**CK-5**（ECPay stub 付款閉環）~~ → **已完成**（2026-07-25 IT）  
8. ~~**I-8** 瀏覽器手動（Firebase 登入＋商城 COD／ECPay＋預約 ECPay）~~ → **已完成**（2026-07-25）  
9. **BK-1～BK-3**／**CK-1～CK-3**（建單失敗診斷，遇問題再記錄；目前手動已通可略）  
10. **真實綠界沙箱**（`stub=false`＋公網 Notify URL）← **下一步 B** — 見 [`docs/backend-specs/payment/ecpay-sandbox-validation.md`](../docs/backend-specs/payment/ecpay-sandbox-validation.md)  
11. **Commerce UX**（displayNo、B3 鎖庫、M2 一次 ECPay、庫存 UI）← spec **ready-for-agent**：[`.scratch/commerce-ux-display-checkout/spec.md`](../.scratch/commerce-ux-display-checkout/spec.md)  
12. **FA-1**、**FA-3**（可平行）

---

## 6. 診斷時請貼的最小資訊

預約或 Checkout 失敗時，請提供：

1. Request URL（完整 path）  
2. HTTP status  
3. Response JSON 的 `error.code` 與 `error.message`  
4. 是否剛執行過 `docker compose down -v`  
5. 是否已重新登入且 `GET /api/me` 成功  

有以上資訊即可對症，無需先改 Firebase。
