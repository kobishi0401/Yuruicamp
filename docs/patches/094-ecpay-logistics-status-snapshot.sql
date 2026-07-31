-- ECPay logistics status snapshot on orders (notify overwrite; not Order Status)
-- 開發期補丁；新庫請用 docs/latest_schema.sql

BEGIN;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS ecpay_logistics_rtn_code character varying(20),
    ADD COLUMN IF NOT EXISTS ecpay_logistics_rtn_msg character varying(200),
    ADD COLUMN IF NOT EXISTS ecpay_logistics_status_at timestamp with time zone;

COMMENT ON COLUMN public.orders.ecpay_logistics_rtn_code IS
    'Latest ECPay logistics notify RtnCode (Logistics Status Snapshot).';
COMMENT ON COLUMN public.orders.ecpay_logistics_rtn_msg IS
    'Latest ECPay logistics notify RtnMsg (Logistics Status Snapshot).';
COMMENT ON COLUMN public.orders.ecpay_logistics_status_at IS
    'When the logistics status snapshot was last overwritten.';

COMMIT;
