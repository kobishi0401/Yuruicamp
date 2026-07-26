-- Commerce UX：displayNo 序號、預約聯絡人快照（開發期補丁；新庫請用 docs/latest_schema.sql）
-- English: Human-readable ORD-/BK- display numbers + booking contact snapshots.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.order_display_no_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.booking_display_no_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS display_no character varying(16);

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS display_no character varying(16);

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS contact_name_snapshot character varying(100);

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS contact_phone_snapshot character varying(32);

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS contact_email_snapshot character varying(254);

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

ALTER TABLE public.orders
    DROP CONSTRAINT IF EXISTS uq_orders_display_no;

ALTER TABLE public.orders
    ADD CONSTRAINT uq_orders_display_no UNIQUE (display_no);

ALTER TABLE public.bookings
    DROP CONSTRAINT IF EXISTS uq_bookings_display_no;

ALTER TABLE public.bookings
    ADD CONSTRAINT uq_bookings_display_no UNIQUE (display_no);

COMMENT ON COLUMN public.orders.display_no IS 'Human-readable order number (ORD-0001); separate from internal UUID id.';

COMMENT ON COLUMN public.bookings.display_no IS 'Human-readable booking number (BK-0001); separate from internal UUID id.';

COMMENT ON COLUMN public.bookings.contact_name_snapshot IS 'Contact name captured at ECPay launch (O2).';

COMMENT ON COLUMN public.bookings.contact_phone_snapshot IS 'Contact phone captured at ECPay launch (O2).';

COMMENT ON COLUMN public.bookings.contact_email_snapshot IS 'Contact email captured at ECPay launch (O2).';

COMMIT;
