-- 種子資料載入後回填 display_no（邏輯同 docs/patches/092-commerce-ux-display-no.sql）
-- Backfill display numbers after 060／070／090 INSERTs that omit display_no.
-- 必須在 seed 交易最末執行（含 W1 fixtures），再恢復 NOT NULL。

WITH numbered AS (
    SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC) AS rn
    FROM public.orders
    WHERE display_no IS NULL
)
UPDATE public.orders o
SET display_no = 'ORD-' || lpad(n.rn::text, 4, '0')
FROM numbered n
WHERE o.id = n.id;

WITH numbered AS (
    SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC) AS rn
    FROM public.bookings
    WHERE display_no IS NULL
)
UPDATE public.bookings b
SET display_no = 'BK-' || lpad(n.rn::text, 4, '0')
FROM numbered n
WHERE b.id = n.id;

SELECT setval(
    'public.order_display_no_seq',
    COALESCE((
        SELECT max((regexp_replace(display_no, '^ORD-', ''))::bigint)
        FROM public.orders
        WHERE display_no ~ '^ORD-[0-9]+$'
    ), 0));

SELECT setval(
    'public.booking_display_no_seq',
    COALESCE((
        SELECT max((regexp_replace(display_no, '^BK-', ''))::bigint)
        FROM public.bookings
        WHERE display_no ~ '^BK-[0-9]+$'
    ), 0));

ALTER TABLE public.orders
    ALTER COLUMN display_no SET NOT NULL;

ALTER TABLE public.bookings
    ALTER COLUMN display_no SET NOT NULL;
