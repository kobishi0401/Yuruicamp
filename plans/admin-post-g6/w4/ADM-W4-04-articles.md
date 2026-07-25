# ADM-W4-04 — 文章 Admin API（K8）

| 欄位 | 內容 |
|------|------|
| **波次** | W4｜P2 |
| **狀態** | ⏭️ 延後（靜態） |
| **總覽** | [`../../admin-post-g6-task-list.md`](../../admin-post-g6-task-list.md) § ADM-W4-04 |
| **索引** | [`../README.md`](../README.md) |
| **Dependencies** | 可與線 H 公開讀並行；互列依賴避免兩套 DTO |

---

## 延後決策（2026-07-25）

- 文章內容維持 **`frontend/data/marketing/articles.json`** 靜態
- 不做 Admin CRUD／公開 `GET /api/articles` 後端
- 待內容營運需要後再開工；不阻塞 W4-06

---

## 0. 開工前必讀

- [ ] 表：`articles`（draft／published／archived）及區塊結構（若有）
- [ ] 公開讀只回 published

---

## 1. 契約

- [ ] Admin CRUD＋發布／封存規則
- [ ] 公開 `GET /api/articles`（本任務含或另開 H 任務並連結）
- [ ] 欄位策略甲

---

## 6. 收尾

- [ ] 總覽 W4-04；本檔 ✅
- [ ] 與線 H checklist 互連

---

## 驗收紀錄

| 日期 | 執行者 | 結果 | 備註 |
|------|--------|------|------|
| 2026-07-25 | 產品 | ⏭️ | 刻意跳過；靜態 JSON 足夠現階段 |
