# ADM-W4-05 — 圖檔上傳 Cloud Storage（K10）

| 欄位 | 內容 |
|------|------|
| **波次** | W4｜P3 |
| **狀態** | ⏭️ 延後（GCP 後） |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § ADM-W4-05 |
| **索引** | [`../README.md`](../README.md) |
| **Dependencies** | 線 J／GCP；本機可用 stub／本地磁碟過渡但契約需標示環境差異 |

---

## 延後決策（2026-07-25）

- **現階段**：商城商品圖在 Admin 後端模式 **直接貼 URL**（`/assets/images/products/...` 或 https），與 G-2c 一致
- **不做** Cloud Storage 上傳 API
- **GCP 部署完成後**再回來實作本 checklist；不阻塞 W4-06

---

## 0. 開工前必讀

- [ ] G-2c 目前只接受 URL／`/assets/**`
- [ ] 目標：上傳 → HTTPS URL → 既有圖片欄位引用
- [ ] 檔案類型／大小限制必寫進契約

---

## 1. 契約

- [ ] 上傳方式寫死：簽名 URL 直傳 **或** multipart 經後端
- [ ] `POST /api/admin/uploads`（或等效）回應 `{ "url": "..." }`
- [ ] 權限：`products.edit` 等（寫死）
- [ ] 錯誤：類型不符、過大

---

## 6. 收尾

- [ ] 總覽 W4-05；本檔 ✅
- [ ] 密鑰走環境變數／Secret Manager（不進 Git）

---

## 驗收紀錄

| 日期 | 執行者 | 結果 | 備註 |
|------|--------|------|------|
| 2026-07-25 | 產品 | ⏭️ | 先用商品 URL；等 GCP |
