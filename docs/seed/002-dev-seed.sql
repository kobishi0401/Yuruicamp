\set ON_ERROR_STOP on

-- 開發 seed 唯一入口；片段不可自行開啟或提交交易。
BEGIN;

\ir dev/010-reference.sql
\ir dev/020-identity.sql
\ir dev/030-catalog.sql
\ir dev/040-inventory.sql
\ir dev/050-coupons.sql
\ir dev/060-orders.sql
\ir dev/070-bookings.sql
\ir dev/071-display-no-backfill.sql
\ir dev/080-reviews.sql
\ir dev/090-w1-manual-fixtures.sql

COMMIT;
