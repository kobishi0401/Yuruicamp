-- ECPay 國內物流 CVS（全家 FAMI）— checkout 超商取貨 + Admin 出貨建單
-- 開發期補丁；新庫請用 docs/latest_schema.sql
--
-- ⚠️ PostgreSQL 限制：ALTER TYPE ADD VALUE 必須先 COMMIT，同一 transaction 內不能馬上用 'cvs' 寫 CHECK。
-- 因此本 patch 拆成兩段；請整份執行，不要只跑一半。

-- ========== 第 1 段：新增 enum 值（自動 commit）==========
ALTER TYPE public.shipping_method ADD VALUE IF NOT EXISTS 'cvs';

-- ========== 第 2 段：欄位、約束、對照表 ==========
BEGIN;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS cvs_store_id character varying(10),
    ADD COLUMN IF NOT EXISTS cvs_store_name character varying(100),
    ADD COLUMN IF NOT EXISTS cvs_sub_type character varying(20),
    ADD COLUMN IF NOT EXISTS ecpay_logistics_id character varying(20),
    ADD COLUMN IF NOT EXISTS ecpay_cvs_payment_no character varying(20);

ALTER TABLE public.orders
    DROP CONSTRAINT IF EXISTS ck_orders_shipping_target;

ALTER TABLE public.orders
    ADD CONSTRAINT ck_orders_shipping_target CHECK (
        (
            shipping_method = 'delivery'::public.shipping_method
            AND pickup_branch_id IS NULL
            AND cvs_store_id IS NULL
        )
        OR (
            shipping_method = 'pickup'::public.shipping_method
            AND pickup_branch_id IS NOT NULL
            AND cvs_store_id IS NULL
        )
        OR (
            shipping_method = 'cvs'::public.shipping_method
            AND pickup_branch_id IS NULL
            AND cvs_store_id IS NOT NULL
        )
    );

CREATE TABLE IF NOT EXISTS public.ecpay_logistics_map_sessions (
    merchant_trade_no character varying(20) NOT NULL,
    order_id character varying(32) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pk_ecpay_logistics_map_sessions PRIMARY KEY (merchant_trade_no),
    CONSTRAINT fk_ecpay_logistics_map_sessions_order FOREIGN KEY (order_id)
        REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE CASCADE
);

COMMENT ON COLUMN public.orders.cvs_store_id IS 'ECPay CVS store id (ReceiverStoreID); FAMI etc.';
COMMENT ON COLUMN public.orders.ecpay_logistics_id IS 'ECPay AllPayLogisticsID after Admin ship creates logistics order.';

COMMIT;
