# ADM-W4-06 — Analytics 彙總 API Spec

| 欄位 | 內容 |
|------|------|
| **Triage** | `ready-for-agent` |
| **波次** | W4｜P3（K11） |
| **契約目標** | Admin API **v0.23** |
| **Checklist** | [`ADM-W4-06-analytics-api.md`](./ADM-W4-06-analytics-api.md) |
| **Grilling 日期** | 2026-07-25 |
| **Dependencies** | W3 完成（取消／退款口徑穩定）；W4-04／05 延後不阻塞 |

---

## Problem Statement

後台「分析報表」目前在前端拉取 **orders／bookings 全列表**，在瀏覽器做 KPI 與圖表聚合。資料量成長後會變慢，且只有 `analytics.view` 的帳號仍可能因缺少 `orders.view`／`bookings.view` 而無法正常載入。

W3 上線後，訂單「未出貨取消＋退款」走 `cancelled` 狀態，但現有前端退款 KPI 只數 `returned`，與實際營運行為不一致。

營運需要：**在後端以固定口徑聚合**、**僅需 `analytics.view` 即可查看**、**與現有 Dashboard 數字語意對齊**（日期欄位與 paid／shipped 規則不突變）。

---

## Solution

新增兩支 Admin 唯讀彙總 API（商城／預約各一），以 SQL 在伺服器端計算 KPI、折線序列、Top10／營地／地區聚合。Analytics 頁改打這兩支 API，**不再**為報表目的拉 orders／bookings 全列表。

口徑、日期邊界、權限、區間上限寫進 Admin 契約 v0.23。低庫存 KPI 與類別甜甜圈 v1 仍留前端（products API／rental-skus Mock）。

同時明確記錄 **W4-04 文章**、**W4-05 圖檔上傳** 延後：商品圖繼續貼 URL，等 GCP 部署後再補上傳。

---

## User Stories

1. As a **營運人員（operator）**，我 want 只憑 `analytics.view` 就能開啟分析報表， so that 我不必同時被賦予 orders／bookings 列表權限也能看彙總數字。

2. As a **營運人員**，我 want 選「近 7／30／90 天、本月、自訂區間」時數字由後端計算， so that 頁面載入不會因訂單／預約筆數變多而明顯變慢。

3. As a **營運人員**，我 want 商城「本期銷售額」只反映已出貨訂單， so that 未出貨或已取消的單不會被算成營收。

4. As a **營運人員**，我 want 商城「退貨／退款」KPI 包含 W3 以來的「未出貨取消且已退款」訂單， so that 退款數字與 Admin 取消操作一致。

5. As a **營運人員**， I want `returned` 狀態的訂單在 v1 **不**併入主要退款 KPI， so that 未來 O2「已出貨退貨」可獨立定義而不混淆現況。

6. As a **營運人員**， I want 預約收入只計 **目前仍為 paid** 的預約， so that 已取消且 payment 變 `refunded` 的不會留在收入裡。

7. As a **營運人員**， I want 預約取消率 = 期間內 cancelled 筆數 ÷ 期間內總預約筆數， so that 我能看出當期取消比例。

8. As a **營運人員**， I want 商城報表期間以 **下單日（createdAt）** 切分， so that 與現有 Dashboard 行為一致。

9. As a **營運人員**， I want 預約報表期間以 **送單日（submittedAt）** 切分， so that 與現有 Dashboard 行為一致。

10. As a **營運人員**， I want 所有「自然日」邊界以 **Asia/Taipei** 解讀， so that 日報表與本地營運日曆一致。

11. As a **營運人員**， I want 自訂區間最長 **366 天**， so that 能做近一年概覽又不致拖垮查詢。

12. As a **營運人員**， I want 超過 366 天或 `to < from` 時收到明確 400 錯誤， so that 我知道要縮小區間。

13. As a **營運人員**， I want 商城折線圖在 ≤60 天按日、>60 天按週呈現， so that X 軸不會過密（行為與現有 Chart 一致）。

14. As a **營運人員**， I want 預約折線圖同樣支援日／週粒度， so that 長區間仍可讀。

15. As a **營運人員**， I want 熱銷商品 Top10 依 productId 合併、只算已出貨， so that 與現有「Item revenue」表格一致。

16. As a **營運人員**， I want 預約報表能依 **營地** 與 **地區（region）** 聚合收入， so that 我能比較各營區表現。

17. As a **營運人員**， I want 「待出貨訂單數」與「待確認預約數」不受期間篩選影響（全量快照）， so that 與現有 KPI 卡片行為一致。

18. As a **營運人員**， I want 低庫存商品數仍由 products 列表計算， so that v1 不必等庫存彙總 API。

19. As a **超級管理員**， I want 無 `analytics.view` 的帳號呼叫彙總 API 得到 403， so that RBAC 邊界清楚。

20. As a **開發者**， I want Admin 契約 v0.23 寫死所有口徑欄位， so that 前後端與 QA 有單一真相來源。

21. As a **開發者**， I want PostgreSQL 整合測試用固定 seed 區間驗證 KPI， so that 重構 SQL 時不會 silent 改數字。

22. As a **開發者**， I want `AdminAPI.analytics.*` facade smoke test， so that 路徑與 method 不會被改壞。

23. As a **開發者**， I want `analytics.summary` readiness flag， so that 後端未就緒時 Sidebar 行為可預期。

24. As a **開發者**， I want Analytics 頁在 summary API 失敗時顯示錯誤而非空白假數字， so that 營運不會誤判。

25. As a **產品負責人**， I want W4-04 文章繼續靜態 JSON、W4-05 上傳等 GCP， so that W4-06 不被內容／基礎設施阻塞。

26. As a **營運人員**， I want 點 KPI 卡片仍導向 orders／bookings 列表並帶篩選（現有行為）， so that 從概覽鑽入明細的流程不斷。

27. As a **營運人員**， I want 商城「本期訂單數」含各狀態（期間內 createdAt）， so that 與現有卡片註解「含各狀態訂單」一致。

28. As a **營運人員**， I want 商城「已售件數」只加總已出貨訂單的 line quantity， so that 與現有 sold qty KPI 一致。

29. As a **營運人員**， I want 預約「已完成」只計期間內 status=completed， so that 與現有卡片一致。

30. As a **營運人員**， I want 預約「租借費／占比」只從 paid 預約的 summary 欄位加總， so that 與現有 rental KPI 一致。

---

## Implementation Decisions

### 延後項目（W4 波次）

| 任務 | 決策 |
|------|------|
| W4-04 文章 Admin API | ⏭️ 延後；前台／靜態 `articles.json` |
| W4-05 圖檔 Cloud Storage | ⏭️ 延後至 GCP 部署；商品圖 **貼 URL**（`/assets/...` 或 https），與現有商品表單一致 |

### API 形狀（v1）

兩支 GET，query：`from`、`to`（ISO date，`YYYY-MM-DD`，含起訖日）：

| 端點 | 用途 |
|------|------|
| `GET /api/admin/analytics/shop-summary` | 商城 KPI、折線 bucket、Top10 商品 |
| `GET /api/admin/analytics/booking-summary` | 預約 KPI、折線 bucket、營地／地區聚合 |

- **RBAC**：僅 `analytics.view`；唯讀；v1 不用 `analytics.edit`
- **區間上限**：366 天；`to < from` 或缺參 → validation 400
- **時區**：Asia/Taipei 自然日切邊界
- **Envelope**：沿用 Admin 標準 `ApiResponse`；欄位名採 camelCase 對齊既有 Admin JSON

### 統計口徑（契約必寫）

**商城 Shop**

| 指標 | 規則 |
|------|------|
| 期間訂單／折線／Top10 篩選 | `orders.created_at` 落在 `[from, to]` |
| 營收、折線值、Top10、已售件數、類別相關（若後端不算則略） | `status = shipped`（必要時含 `completed`） |
| 本期訂單數 | 期間內所有 status |
| 待出貨 | 全量 `status = unshipped`（不受 from/to 限制） |
| 退款 KPI | `status = cancelled` **且**（`payment_status = refunded` **或** `refund_status != none`）且 created_at 在期間 |
| `returned` | v1 **不**計入主退款 KPI（預留 O2） |

**預約 Booking**

| 指標 | 規則 |
|------|------|
| 期間篩選 | `submitted_at` 落在 `[from, to]` |
| 收入、折線、租借費 | **目前** `payment_status = paid` 且 submitted_at 在期間 |
| 取消率 | 期間內 `status = cancelled` ÷ 期間內總筆數 |
| 待確認 | 全量 `status = pending` |
| 已完成 | 期間內 `status = completed` |

### 回應結構（概念）

每支 summary 至少含：

- `period`：`from`、`to`
- `kpis`：各卡片純量（命名對齊現有 analytics.html 語意）
- `timeSeries`：`bucket`（date 或 weekStart）、`value`；可附 `granularity: day|week`（後端或契約註明前端依區間長度選 granularity）
- Shop 額外：`topProducts[]`（productId、name、revenue、qty）
- Booking 額外：`byCampground[]`、`byRegion[]`（id／name、revenue 或 count）

「上期比較」delta：v1 可由 **前端** 打兩次 API（本期＋等長上期）維持現有 `getPreviousPeriodRange` 行為，或後端 optional query `includePrevious=true` — **建議 v1 前端打兩次**，減少後端複雜度。

### 模組邊界

- **Controller**：`AdminAnalyticsController`（或同慣例命名），兩 GET mapping
- **Service**：`AdminAnalyticsService` — 驗證區間、組裝 DTO、協調 repository
- **Repository**：JDBC／NamedParameterJdbcTemplate 聚合 SQL；不經 JPA 全表載入
- **DTO**：Request 無 body；Response 分 ShopSummary／BookingSummary 及 nested types
- **Security**：`@PreAuthorize("hasAuthority('analytics.view')")`

### 前端

- `AdminAPI.analytics.shopSummary(from, to)`、`bookingSummary(from, to)`
- `admin-runtime`：`analytics.summary = true`；readiness note 改為「伺服器端彙總」
- `analytics.js`：商城／預約 Tab 改打 summary；**移除**為報表而 call `orders.list`／`bookings.list`
- **保留**：`products.list`（低庫存）、`rental-skus` Mock（租借類別甜甜圈）、min_stock Mock
- **修正**：商城退款 KPI 改跟後端口徑（不再只數 `returned`）

### Schema

- 不新增表；只讀既有 `orders`、`order_items`、`bookings`、`campgrounds` 等

### 契約

- Admin API **v0.23** 新增 Analytics 章節；§14 v0.1「不做 analytics API」移出或改為已完成
- `docs/api/README.md` changelog

---

## Testing Decisions

### 什麼算好測試

- 只測 **HTTP 對外行為** 與 **契約口徑**（給定 DB 列 → 固定 from/to → 固定 KPI／series 片段）
- 不測 SQL 字串或 private method；不 mock 整個 Spring 卻宣稱整合

### 測試接縫（Seams）— 建議 **單一主接縫**

**首選（唯一必做）**：`AdminAnalyticsPostgreSqlIntegrationTest` — MockMvc + 真 PostgreSQL（`RUN_BACKEND_IT=true`），與 W4-01～03、W3 同模式。

涵蓋：

1. Shop：seed 2 shipped + 1 cancelled/refunded + 1 unshipped → 營收／退款／待出貨 KPI
2. Booking：seed paid + cancelled/refunded + pending → 收入／取消率／待確認
3. RBAC：有 `analytics.view` 200；無 view 403
4. Validation：367 天區間 400

**次要（輕量）**：`admin-analytics-facade.mjs` — 驗證 `AdminAPI.analytics` 路徑與 method（對齊 `admin-calendar-dates-facade.mjs`）。

**不做 v1**：E2E 瀏覽器；Chart.js 像素測試；與舊 frontend 全列表聚合逐欄 bitwise 比對（改以 IT fixture 為準）。

### Prior art

- `AdminCalendarDatePostgreSqlIntegrationTest`
- `AdminFulfillmentPostgreSqlIntegrationTest`（orders cancel／refund）
- `admin-calendar-dates-facade.mjs`

---

## Out of Scope

- W4-04 文章 Admin CRUD／公開讀 API
- W4-05 Cloud Storage 上傳、簽名 URL、multipart
- 商城／租借 **類別甜甜圈** 後端化（v1 仍前端 + products／rental-skus）
- **低庫存 KPI** 後端化
- Analytics **編輯**／匯出 CSV／email 報表
- 訂單 `returned`（O2 已出貨退貨）計入退款 KPI
- 預約收入 **毛額**（曾 paid 後 refunded 仍算）或 **淨額會計**（退款日扣回）
- 以 `checkIn`／出貨日取代 createdAt／submittedAt
- Redis／物化視圖快取
- 新建 `analytics.edit` 寫入端點

---

## Further Notes

### 開工順序（強制）

```text
契約 v0.23 → 後端 shop/booking summary → IT → 前端 AdminAPI + analytics.js → facade → checklist／README
```

### W4 波次狀態（2026-07-25）

| ID | 狀態 |
|----|------|
| W4-01～03 | ✅ |
| W4-04 | ⏭️ 靜態 |
| W4-05 | ⏭️ GCP 後 |
| W4-06 | 📋 本 spec → 待實作 |

### 與現有 UI 的刻意差異（僅一處）

商城退款 KPI 從「只數 `returned`」改為「cancelled + 已退款」— 這是 **修正** W3 後的 bug，不是 silent 改規；契約與 release note 需註明。

### 確認接縫

若你同意 **PostgreSQL Integration Test 為唯一主接縫**、frontend facade 為輔，實作時依此執行；若要加上 Service 層 unit test 作第二接縫，可再說。
