-- =============================================================================
-- 059-display-no-seed-prep.sql
-- Seed INSERT（060／070／090）刻意省略 display_no，由 071 統一回填。
-- latest_schema.sql 已將 display_no 設為 NOT NULL，載入前需暫時放寬。
-- =============================================================================

ALTER TABLE public.orders
    ALTER COLUMN display_no DROP NOT NULL;

ALTER TABLE public.bookings
    ALTER COLUMN display_no DROP NOT NULL;
