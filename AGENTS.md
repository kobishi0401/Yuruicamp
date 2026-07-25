## ECPay API Skill
讀取 `.ecpay-skill/SKILL.md` 作為 ECPay 整合知識庫入口。
完整指南位於 `.ecpay-skill/guides/`（29 份），即時 API 規格索引位於 `.ecpay-skill/references/`。

## Firebase／Auth（主線已完成）
- 協作者必讀：`docs/frontend-specs/firebase-merge-into-main-notes.md`
- 後續業務債／加固 checklist：`plans/post-firebase-roadmap-checklist.md`
- 正式 HTTP 只走 `AppAuth` + `ApiClient`；不要新增第二套 fetch／Bearer 包裝。
- Checkout／預約建單失敗：先看 Network `error.code`（多半是業務／種子，不是 Firebase）。

## Agent skills

### Issue tracker

Issues live as local markdown under `.scratch/<feature>/` (not GitHub Issues). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
