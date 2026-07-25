-- ADM-W2-08：讓本機已存在的 DB 對齊 product_stock_update 稽核單 schema
-- （開發期補丁；新庫請直接用 docs/latest_schema.sql）
-- English: Patch live DB for product_stock_update dual-NULL headers + line-level locations/nature.

BEGIN;

-- 1) 表頭：允許 product_stock_update，且表頭庫位必須雙 NULL
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS ck_inventory_movements_locations;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT ck_inventory_movements_locations CHECK (
    ((movement_type)::text = 'product_stock_update'::text)
    OR (source_location_id IS NOT NULL)
    OR (destination_location_id IS NOT NULL)
  );

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS ck_inventory_movements_type;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT ck_inventory_movements_type CHECK (
    ((movement_type)::text = ANY ((ARRAY[
      'receipt'::character varying,
      'write_off'::character varying,
      'transfer'::character varying,
      'conversion_out'::character varying,
      'conversion_in'::character varying,
      'product_stock_update'::character varying
    ])::text[]))
  );

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS ck_inventory_movements_type_payload;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT ck_inventory_movements_type_payload CHECK (
    (((movement_type)::text = 'receipt'::text) AND (source_location_id IS NULL) AND (destination_location_id IS NOT NULL))
    OR (((movement_type)::text = 'write_off'::text) AND (source_location_id IS NOT NULL) AND (destination_location_id IS NULL))
    OR (((movement_type)::text = 'transfer'::text) AND (source_location_id IS NOT NULL) AND (destination_location_id IS NOT NULL) AND ((source_location_id)::text <> (destination_location_id)::text))
    OR (((movement_type)::text = 'conversion_out'::text) AND ((inventory_domain)::text = 'store'::text) AND (source_location_id IS NOT NULL) AND (destination_location_id IS NULL))
    OR (((movement_type)::text = 'conversion_in'::text) AND ((inventory_domain)::text = 'rental'::text) AND (source_location_id IS NULL) AND (destination_location_id IS NOT NULL))
    OR (((movement_type)::text = 'product_stock_update'::text) AND (source_location_id IS NULL) AND (destination_location_id IS NULL))
  );

-- 2) 商城明細：列級庫位／備註／異動性質
ALTER TABLE public.store_inventory_movement_items
  ADD COLUMN IF NOT EXISTS source_location_id character varying(32);
ALTER TABLE public.store_inventory_movement_items
  ADD COLUMN IF NOT EXISTS destination_location_id character varying(32);
ALTER TABLE public.store_inventory_movement_items
  ADD COLUMN IF NOT EXISTS line_reason text;
ALTER TABLE public.store_inventory_movement_items
  ADD COLUMN IF NOT EXISTS line_nature character varying(32);

ALTER TABLE public.store_inventory_movement_items
  DROP CONSTRAINT IF EXISTS ck_store_inventory_movement_items_locations;
ALTER TABLE public.store_inventory_movement_items
  ADD CONSTRAINT ck_store_inventory_movement_items_locations CHECK (
    ((source_location_id IS NOT NULL) OR (destination_location_id IS NOT NULL))
    AND (
      (source_location_id IS NULL)
      OR (destination_location_id IS NULL)
      OR ((source_location_id)::text <> (destination_location_id)::text)
    )
  );

ALTER TABLE public.store_inventory_movement_items
  DROP CONSTRAINT IF EXISTS ck_store_inventory_movement_items_line_nature;
ALTER TABLE public.store_inventory_movement_items
  ADD CONSTRAINT ck_store_inventory_movement_items_line_nature CHECK (
    (line_nature IS NULL)
    OR ((line_nature)::text = ANY ((ARRAY[
      'receipt'::character varying,
      'transfer'::character varying,
      'stocktake'::character varying,
      'damage'::character varying,
      'write_off'::character varying
    ])::text[]))
  );

ALTER TABLE public.store_inventory_movement_items
  DROP CONSTRAINT IF EXISTS fk_store_inventory_movement_items_source_location_domain;
ALTER TABLE public.store_inventory_movement_items
  ADD CONSTRAINT fk_store_inventory_movement_items_source_location_domain
    FOREIGN KEY (source_location_id, inventory_domain)
    REFERENCES public.inventory_locations(id, inventory_domain)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.store_inventory_movement_items
  DROP CONSTRAINT IF EXISTS fk_store_inventory_movement_items_destination_location_domain;
ALTER TABLE public.store_inventory_movement_items
  ADD CONSTRAINT fk_store_inventory_movement_items_destination_location_domain
    FOREIGN KEY (destination_location_id, inventory_domain)
    REFERENCES public.inventory_locations(id, inventory_domain)
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- 3) View：明細要帶出列級欄位（dto_view 依賴 items_view，需先 drop）
DROP VIEW IF EXISTS public.inventory_movement_dto_view;
DROP VIEW IF EXISTS public.inventory_movement_items_view;

CREATE VIEW public.inventory_movement_items_view AS
 SELECT item.id,
    item.movement_id,
    item.inventory_domain,
    item.variant_id,
    item.sku_snapshot,
    item.item_name_snapshot,
    item.quantity,
    item.source_location_id,
    item.destination_location_id,
    item.line_reason,
    item.line_nature
   FROM public.store_inventory_movement_items item
UNION ALL
 SELECT item.id,
    item.movement_id,
    item.inventory_domain,
    item.rental_sku_variant_id AS variant_id,
    item.sku_snapshot,
    item.item_name_snapshot,
    item.quantity,
    NULL::character varying(32) AS source_location_id,
    NULL::character varying(32) AS destination_location_id,
    NULL::text AS line_reason,
    NULL::character varying(32) AS line_nature
   FROM public.rental_inventory_movement_items item;

COMMENT ON VIEW public.inventory_movement_items_view IS 'P5 read-only UNION ALL projection; application writes only concrete domain tables.';

CREATE VIEW public.inventory_movement_dto_view AS
 SELECT id,
    jsonb_build_object(
      'id', id,
      'movementNo', movement_no,
      'inventoryDomain', inventory_domain,
      'movementType', movement_type,
      'status', status,
      'sourceLocationId', source_location_id,
      'destinationLocationId', destination_location_id,
      'employeeId', employee_id,
      'occurredAt', to_char((occurred_at AT TIME ZONE 'Asia/Taipei'::text), 'YYYY-MM-DD HH24:MI:SS'::text),
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'inventoryDomain', item.inventory_domain,
          'variantId', item.variant_id,
          'sku', item.sku_snapshot,
          'productName', item.item_name_snapshot,
          'quantity', item.quantity,
          'sourceLocationId', movement.source_location_id,
          'destinationLocationId', movement.destination_location_id,
          'type', movement.movement_type
        ) ORDER BY item.id) AS jsonb_agg
        FROM public.inventory_movement_items_view item
        WHERE (item.movement_id = movement.id)
      ), '[]'::jsonb)
    ) AS payload
   FROM public.inventory_movements movement;

COMMENT ON VIEW public.inventory_movement_dto_view IS 'P6 admin/report DTO built exclusively from P5 inventory_movements and inventory_movement_items_view.';

COMMIT;
