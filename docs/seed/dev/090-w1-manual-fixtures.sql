-- =============================================================================
-- 090-w1-manual-fixtures.sql — W1 本機手動驗收專用固定單
-- Easy-to-find fixtures for Admin Post-G6 W1 manual QA.
--
-- 固定 ID（後台搜尋用）：
--   商城訂單 W1-ORD-NOTE  … paid + unshipped（測備註／出貨／W3 取消退款；含 success Notify）
--   商城訂單 W1-ORD-REV   … completed（綁可刪評論 W1-REV-DEL）
--   租借預約 W1-BK-NOTE   … confirmed + 含租借裝備（測預約備註／W3 取消；含 success Notify）
--   評論     W1-REV-DEL   … 專供刪除驗收（刪了可重跑 seed 還原）
--   最低庫存 V001 @ main  … minimum_quantity = 3（測 min-stock）
-- =============================================================================

-- ── 1) 商城訂單：備註＋出貨 ───────────────────────────────────────────────
INSERT INTO public.orders (
    id, customer_id,
    buyer_name_snapshot, buyer_email_snapshot,
    recipient_name_snapshot, shipping_address_snapshot, shipping_phone_snapshot,
    subtotal, shipping_fee, discount, total,
    payment_method, payment_status, refund_status, status,
    internal_note,
    placed_at, paid_at, created_at, updated_at
)
VALUES (
    'W1-ORD-NOTE', 'U001',
    'Amy Chen', 'amy@example.com',
    'Amy Chen', '台南市東區長榮路二段200號', '0912345678',
    980.00, 0.00, 0.00, 980.00,
    'ecpay-credit', 'paid', 'none', 'unshipped',
    NULL,
    TIMESTAMPTZ '2026-07-20T10:00:00+08:00',
    TIMESTAMPTZ '2026-07-20T10:05:00+08:00',
    TIMESTAMPTZ '2026-07-20T10:00:00+08:00',
    TIMESTAMPTZ '2026-07-20T10:05:00+08:00'
)
ON CONFLICT (id) DO UPDATE SET
    customer_id = EXCLUDED.customer_id,
    buyer_name_snapshot = EXCLUDED.buyer_name_snapshot,
    recipient_name_snapshot = EXCLUDED.recipient_name_snapshot,
    shipping_address_snapshot = EXCLUDED.shipping_address_snapshot,
    shipping_phone_snapshot = EXCLUDED.shipping_phone_snapshot,
    subtotal = EXCLUDED.subtotal,
    total = EXCLUDED.total,
    payment_status = EXCLUDED.payment_status,
    status = EXCLUDED.status,
    -- 重跑 seed 時清掉手動寫過的備註，方便重複驗收
    internal_note = NULL,
    paid_at = EXCLUDED.paid_at,
    updated_at = EXCLUDED.updated_at;

INSERT INTO public.order_items (
    id, order_id, product_id, variant_id, sku_snapshot,
    product_name_snapshot, specification_snapshot, brand_name_snapshot,
    image_url_snapshot, unit_price_snapshot, quantity
) OVERRIDING SYSTEM VALUE
VALUES (
    9107011, 'W1-ORD-NOTE', 'P014', 'V014-01', 'P014-01',
    '高背月亮椅', '軍綠', 'Yuruicamp',
    '/assets/images/products/P014-1.jpg', 980.00, 1
)
ON CONFLICT (id) DO UPDATE SET
    order_id = EXCLUDED.order_id,
    product_id = EXCLUDED.product_id,
    variant_id = EXCLUDED.variant_id,
    sku_snapshot = EXCLUDED.sku_snapshot,
    product_name_snapshot = EXCLUDED.product_name_snapshot,
    unit_price_snapshot = EXCLUDED.unit_price_snapshot,
    quantity = EXCLUDED.quantity;

INSERT INTO public.order_status_history (id, order_id, status, occurred_at, actor_id, note)
OVERRIDING SYSTEM VALUE
VALUES (9107111, 'W1-ORD-NOTE', 'unshipped', TIMESTAMPTZ '2026-07-20T10:05:00+08:00', NULL, 'W1 待出貨')
ON CONFLICT (id) DO UPDATE SET
    order_id = EXCLUDED.order_id,
    status = EXCLUDED.status,
    occurred_at = EXCLUDED.occurred_at,
    note = EXCLUDED.note;

-- active 保留：出貨流程需要；同時把 main 的 on_hand +1，避免可用量被多扣
INSERT INTO public.product_stock_reservations (
    id, order_item_id, variant_id, location_id, quantity, status,
    idempotency_key, reserved_at, expires_at, released_at, fulfilled_at, inventory_domain
) OVERRIDING SYSTEM VALUE
VALUES (
    9107211, 9107011, 'V014-01', 'main', 1, 'active',
    'seed-w1-ord-note-9107011',
    TIMESTAMPTZ '2026-07-20T10:00:00+08:00',
    NULL, NULL, NULL, 'store'
)
ON CONFLICT (id) DO UPDATE SET
    order_item_id = EXCLUDED.order_item_id,
    variant_id = EXCLUDED.variant_id,
    quantity = EXCLUDED.quantity,
    status = EXCLUDED.status,
    released_at = NULL,
    fulfilled_at = NULL;

UPDATE public.inventory_stocks
SET on_hand_quantity = GREATEST(on_hand_quantity, 6),
    updated_at = now()
WHERE location_id = 'main'
  AND variant_id = 'V014-01'
  AND inventory_domain = 'store';

-- W3：已付款取消／退款需要 success Notify（對單 merchant_trade_no）
-- Paid cancel/refund needs a success notify row for MerchantTradeNo lookup.
DELETE FROM public.payment_notifications
WHERE order_id = 'W1-ORD-NOTE'
   OR merchant_trade_no = 'W1ORDNOTE0001';

INSERT INTO public.payment_notifications (
    provider, merchant_trade_no, provider_trade_no,
    order_id, booking_id, raw_payload, result, processed_at
)
VALUES (
    'ecpay',
    'W1ORDNOTE0001',
    'TN-W1-ORD-NOTE',
    'W1-ORD-NOTE',
    NULL,
    '{"seed":"w1-ord-note","RtnCode":"1"}'::jsonb,
    'success',
    TIMESTAMPTZ '2026-07-20T10:05:00+08:00'
);

-- ── 2) 商城訂單：專供刪評論 ───────────────────────────────────────────────
INSERT INTO public.orders (
    id, customer_id,
    buyer_name_snapshot, buyer_email_snapshot,
    recipient_name_snapshot, shipping_address_snapshot, shipping_phone_snapshot,
    subtotal, shipping_fee, discount, total,
    payment_method, payment_status, refund_status, status,
    internal_note,
    placed_at, paid_at, created_at, updated_at
)
VALUES (
    'W1-ORD-REV', 'U002',
    '林美惠', 'lin@example.com',
    '林美惠', '嘉義市西區垂楊路200號（W1 評論刪除驗收）', '0923456789',
    3200.00, 0.00, 0.00, 3200.00,
    'ecpay-credit', 'paid', 'none', 'completed',
    NULL,
    TIMESTAMPTZ '2026-07-18T14:00:00+08:00',
    TIMESTAMPTZ '2026-07-18T14:10:00+08:00',
    TIMESTAMPTZ '2026-07-18T14:00:00+08:00',
    TIMESTAMPTZ '2026-07-22T14:00:00+08:00'
)
ON CONFLICT (id) DO UPDATE SET
    customer_id = EXCLUDED.customer_id,
    status = EXCLUDED.status,
    payment_status = EXCLUDED.payment_status,
    total = EXCLUDED.total,
    updated_at = EXCLUDED.updated_at;

INSERT INTO public.order_items (
    id, order_id, product_id, variant_id, sku_snapshot,
    product_name_snapshot, specification_snapshot, brand_name_snapshot,
    image_url_snapshot, unit_price_snapshot, quantity
) OVERRIDING SYSTEM VALUE
VALUES (
    9107021, 'W1-ORD-REV', 'P001', 'V001', 'TENT-OLIVE',
    'Coleman 六人帳篷', '深橄欖綠', 'Coleman',
    '/assets/images/products/P001-1.jpg', 3200.00, 1
)
ON CONFLICT (id) DO UPDATE SET
    order_id = EXCLUDED.order_id,
    product_id = EXCLUDED.product_id,
    variant_id = EXCLUDED.variant_id,
    product_name_snapshot = EXCLUDED.product_name_snapshot,
    quantity = EXCLUDED.quantity;

INSERT INTO public.order_status_history (id, order_id, status, occurred_at, actor_id, note)
OVERRIDING SYSTEM VALUE
VALUES
    (9107121, 'W1-ORD-REV', 'unshipped', TIMESTAMPTZ '2026-07-18T14:10:00+08:00', NULL, '待出貨'),
    (9107122, 'W1-ORD-REV', 'shipped', TIMESTAMPTZ '2026-07-19T10:00:00+08:00', NULL, '已出貨'),
    (9107123, 'W1-ORD-REV', 'completed', TIMESTAMPTZ '2026-07-22T14:00:00+08:00', NULL, '已完成')
ON CONFLICT (id) DO UPDATE SET
    order_id = EXCLUDED.order_id,
    status = EXCLUDED.status,
    occurred_at = EXCLUDED.occurred_at,
    note = EXCLUDED.note;

INSERT INTO public.product_stock_reservations (
    id, order_item_id, variant_id, location_id, quantity, status,
    idempotency_key, reserved_at, expires_at, released_at, fulfilled_at, inventory_domain
) OVERRIDING SYSTEM VALUE
VALUES (
    9107221, 9107021, 'V001', 'main', 1, 'fulfilled',
    'seed-w1-ord-rev-9107021',
    TIMESTAMPTZ '2026-07-18T14:00:00+08:00',
    NULL, NULL,
    TIMESTAMPTZ '2026-07-19T10:00:00+08:00',
    'store'
)
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    fulfilled_at = EXCLUDED.fulfilled_at;

-- 可安全刪除的評論（刪後重跑 seed 會回來）
INSERT INTO public.reviews (id, order_item_id, rating, comment, created_at)
VALUES (
    'W1-REV-DEL', 9107021, 1,
    '【W1 專用】請刪除此則以驗收硬刪；重跑 seed 會還原。',
    TIMESTAMPTZ '2026-07-22T15:00:00+08:00'
)
ON CONFLICT (id) DO UPDATE SET
    order_item_id = EXCLUDED.order_item_id,
    rating = EXCLUDED.rating,
    comment = EXCLUDED.comment,
    created_at = EXCLUDED.created_at;

INSERT INTO public.review_photos (review_id, sort_order, url)
VALUES ('W1-REV-DEL', 0, '/assets/images/products/P001-1.jpg')
ON CONFLICT (review_id, sort_order) DO UPDATE SET url = EXCLUDED.url;

-- ── 3) 租借預約（含裝備）：備註 ───────────────────────────────────────────
-- zone 2 天平日：1500*2=3000；租借羽絨睡袋平日 300*2=600 → 合計 3600
INSERT INTO public.bookings (
    id, customer_id, campground_id, campground_name_snapshot, region_snapshot,
    check_in, check_out, guest_count, weekday_count, holiday_count,
    zone_total, rental_total, applied_discount, final_amount,
    payment_method, payment_status, paid_at, status, internal_note,
    created_at, updated_at
)
VALUES (
    'W1-BK-NOTE', 'U001', 'C008', '宜蘭礁溪湯泉露營', '北部',
    DATE '2026-08-10', DATE '2026-08-12', 2, 2, 0,
    3000.00, 600.00, 0.00, 3600.00,
    'ecpay-credit', 'paid', TIMESTAMPTZ '2026-07-21T11:00:00+08:00', 'confirmed', NULL,
    TIMESTAMPTZ '2026-07-21T11:00:00+08:00', TIMESTAMPTZ '2026-07-21T11:30:00+08:00'
)
ON CONFLICT (id) DO UPDATE SET
    customer_id = EXCLUDED.customer_id,
    campground_id = EXCLUDED.campground_id,
    campground_name_snapshot = EXCLUDED.campground_name_snapshot,
    check_in = EXCLUDED.check_in,
    check_out = EXCLUDED.check_out,
    zone_total = EXCLUDED.zone_total,
    rental_total = EXCLUDED.rental_total,
    final_amount = EXCLUDED.final_amount,
    payment_status = EXCLUDED.payment_status,
    status = EXCLUDED.status,
    internal_note = NULL,
    updated_at = EXCLUDED.updated_at;

INSERT INTO public.booking_selected_zones (
    id, booking_id, zone_id, zone_type_snapshot,
    price_weekday_snapshot, price_holiday_snapshot, quantity
) OVERRIDING SYSTEM VALUE
VALUES (9107311, 'W1-BK-NOTE', 'Z010', '草皮區', 1500.00, 2200.00, 1)
ON CONFLICT (id) DO UPDATE SET
    booking_id = EXCLUDED.booking_id,
    zone_id = EXCLUDED.zone_id,
    quantity = EXCLUDED.quantity;

INSERT INTO public.booking_selected_rentals (
    id, booking_id, rental_listing_id, rental_sku_variant_id,
    sku_snapshot, name_snapshot, specification_snapshot,
    price_weekday_snapshot, price_holiday_snapshot, discount_snapshot, quantity
) OVERRIDING SYSTEM VALUE
VALUES (
    9107411, 'W1-BK-NOTE', 'E023', 'RSV-R005-01',
    'RSV-R005-01', '羽絨睡袋', '-10°C',
    300.00, 450.00, 0.00, 1
)
ON CONFLICT (id) DO UPDATE SET
    booking_id = EXCLUDED.booking_id,
    rental_listing_id = EXCLUDED.rental_listing_id,
    rental_sku_variant_id = EXCLUDED.rental_sku_variant_id,
    quantity = EXCLUDED.quantity;

INSERT INTO public.booking_status_history (id, booking_id, status, occurred_at, actor_id, note)
OVERRIDING SYSTEM VALUE
VALUES
    (9107511, 'W1-BK-NOTE', 'pending', TIMESTAMPTZ '2026-07-21T11:00:00+08:00', NULL, 'W1 預約已送出'),
    (9107512, 'W1-BK-NOTE', 'confirmed', TIMESTAMPTZ '2026-07-21T11:30:00+08:00', NULL, 'W1 已確認')
ON CONFLICT (id) DO UPDATE SET
    booking_id = EXCLUDED.booking_id,
    status = EXCLUDED.status,
    note = EXCLUDED.note;

-- W3：已付款預約取消同樣需要 success Notify
DELETE FROM public.payment_notifications
WHERE booking_id = 'W1-BK-NOTE'
   OR merchant_trade_no = 'W1BKNOTE00001';

INSERT INTO public.payment_notifications (
    provider, merchant_trade_no, provider_trade_no,
    order_id, booking_id, raw_payload, result, processed_at
)
VALUES (
    'ecpay',
    'W1BKNOTE00001',
    'TN-W1-BK-NOTE',
    NULL,
    'W1-BK-NOTE',
    '{"seed":"w1-bk-note","RtnCode":"1"}'::jsonb,
    'success',
    TIMESTAMPTZ '2026-07-21T11:00:00+08:00'
);

-- ── 4) 最低庫存閾值（W1-07）──────────────────────────────────────────────
INSERT INTO public.product_variant_min_stocks (
    variant_id, location_id, minimum_quantity, inventory_domain, updated_at
)
VALUES ('V001', 'main', 3, 'store', now())
ON CONFLICT (variant_id, location_id) DO UPDATE SET
    minimum_quantity = EXCLUDED.minimum_quantity,
    inventory_domain = EXCLUDED.inventory_domain,
    updated_at = now();

-- ── 5) 序列對齊（避免之後應用插入撞 ID）──────────────────────────────────
SELECT setval('public.order_items_id_seq', GREATEST((SELECT max(id) FROM public.order_items), 1), true);
SELECT setval('public.order_status_history_id_seq', GREATEST((SELECT max(id) FROM public.order_status_history), 1), true);
SELECT setval('public.product_stock_reservations_id_seq', GREATEST((SELECT max(id) FROM public.product_stock_reservations), 1), true);
SELECT setval('public.booking_selected_zones_id_seq', GREATEST((SELECT max(id) FROM public.booking_selected_zones), 1), true);
SELECT setval('public.booking_selected_rentals_id_seq', GREATEST((SELECT max(id) FROM public.booking_selected_rentals), 1), true);
SELECT setval('public.booking_status_history_id_seq', GREATEST((SELECT max(id) FROM public.booking_status_history), 1), true);
