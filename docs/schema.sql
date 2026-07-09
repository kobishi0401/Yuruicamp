-- =============================================================================
-- Yuruicamp Schema (PostgreSQL) — Bootcamp DDL
-- =============================================================================
-- 中文：給 Java Spring Boot 課程用的完整 DDL 草案（仍不做 Java Entity）。
-- English: Practical PostgreSQL DDL aligned with /data/** mock JSON (2026-07-09).
--
-- 為何選 PostgreSQL / Why PostgreSQL:
--   1. JSONB：適合 shipping_address、preferences、mock overlay、occupying_statuses
--   2. 原生 ENUM：對齊 order_status / booking_status / coupon_category 等
--   3. 台灣 Java 課程與 Spring Boot 生態常見（JDBC / JPA / Flyway）
--
-- 相關文件：
--   docs/database-er.md | docs/schema-enums.md | docs/snapshot-fields.md
--   docs/mock-json-to-sql-seed.md | plans/data-integration-spec.md
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ENUM types（允許值詳見 docs/schema-enums.md）
-- ---------------------------------------------------------------------------

CREATE TYPE order_status AS ENUM (
  'unshipped',
  'shipped',
  'completed',
  'returned'
);

CREATE TYPE payment_status AS ENUM (
  'unpaid',
  'paid',
  'refunded'
);

CREATE TYPE shipping_method AS ENUM (
  'delivery',
  'pickup'
);

CREATE TYPE booking_status AS ENUM (
  'pending',
  'confirmed',
  'completed',
  'cancelled'
);

CREATE TYPE coupon_category AS ENUM (
  'promotion',
  'birthday',
  'firstPurchase'
);

CREATE TYPE coupon_type AS ENUM (
  'fixed',
  'percent'
);

CREATE TYPE coupon_status AS ENUM (
  'active',
  'disabled'
);

CREATE TYPE product_status AS ENUM (
  'active',
  'inactive'
);

CREATE TYPE closure_type AS ENUM (
  'date_range',
  'weekly'
);

CREATE TYPE min_stock_target_type AS ENUM (
  'store',
  'rental'
);

CREATE TYPE article_block_type AS ENUM (
  'text',
  'heading',
  'product'
);

CREATE TYPE auth_provider AS ENUM (
  'google',
  'facebook',
  'line'
);

-- ---------------------------------------------------------------------------
-- CUSTOMERS（會員；OAuth only，無 password）
-- Source: data/customers/customers.json
-- ---------------------------------------------------------------------------

CREATE TABLE customers (
  id                VARCHAR(32) PRIMARY KEY,          -- e.g. U001
  avatar            TEXT,
  name              VARCHAR(100) NOT NULL,
  phone             VARCHAR(32),
  email             VARCHAR(255) NOT NULL UNIQUE,
  birthday          DATE,
  registered_at     DATE,
  total_spent       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tier              VARCHAR(32),                      -- e.g. guide
  tier_name         VARCHAR(64),                      -- e.g. 嚮導
  points            INTEGER NOT NULL DEFAULT 0,
  first_purchase_used BOOLEAN NOT NULL DEFAULT FALSE,
  preferences       JSONB,                            -- { styles:[], equipment:[] }
  shipping_address  JSONB,                            -- 見 js/shipping-address.js
  tags              JSONB,                            -- string[]
  auth_provider     auth_provider,                    -- OAuth；無 password 欄位
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE customers IS
  '會員主檔 / Customers (OAuth only, no password). JSON: data/customers/customers.json';
COMMENT ON COLUMN customers.shipping_address IS
  '預設配送地址快照結構（JSONB）/ Default shipping address object';
COMMENT ON COLUMN customers.first_purchase_used IS
  '是否已用過首購券資格 / firstPurchase coupon eligibility flag';

-- ---------------------------------------------------------------------------
-- PRODUCTS + PRODUCT_VARIANTS（SPU / SKU）
-- Source: data/catalog/products.json
-- ---------------------------------------------------------------------------

CREATE TABLE products (
  id                VARCHAR(32) PRIMARY KEY,          -- e.g. P001
  rental_id         VARCHAR(32),                      -- e.g. R001（FK 稍後加）
  rental_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  name              VARCHAR(200) NOT NULL,            -- SPU 名，不含規格
  category          VARCHAR(64),
  brand             VARCHAR(64),
  interest_tags     JSONB,                            -- e.g. ["tent"]
  price             NUMERIC(12, 2) NOT NULL DEFAULT 0, -- SPU 參考價；SKU 可覆寫
  status            product_status NOT NULL DEFAULT 'active',
  image             TEXT,
  images            JSONB,                            -- string[]
  description       TEXT,
  specifications    JSONB,
  tags              JSONB,
  -- 以下為衍生欄位（可選存；真相在 variants 庫存）
  -- Derived fields (optional cache; source of truth = variant branch stocks)
  total_stock       INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE products IS
  '商城商品 SPU / Store products. JSON: data/catalog/products.json';
COMMENT ON COLUMN products.name IS
  '主名稱不含規格；規格在 product_variants.label / Name without spec; specs live on variants';
COMMENT ON COLUMN products.total_stock IS
  '衍生加總，勿手改 / Derived sum of variant stocks — do not hand-edit';

CREATE TABLE product_variants (
  id                VARCHAR(64) PRIMARY KEY,          -- = sku, e.g. v-P001-0
  product_id        VARCHAR(32) NOT NULL REFERENCES products(id),
  sku               VARCHAR(64) NOT NULL,             -- 通常等於 id
  color             VARCHAR(64),
  size              VARCHAR(64),
  label             VARCHAR(128),                     -- 規格顯示
  price             NUMERIC(12, 2),                   -- 可空 = 用 SPU price
  branch_stock      JSONB,                            -- { "main": 2, "branch-001": 1, ... }
  UNIQUE (product_id, sku)
);

COMMENT ON TABLE product_variants IS
  '商品 SKU / Product variants. JSON: products.json > variants[]';
COMMENT ON COLUMN product_variants.branch_stock IS
  '各據點庫存 map；亦可再正規化成獨立表 / Per-branch qty map (optional further normalize)';

CREATE INDEX idx_product_variants_product ON product_variants(product_id);

-- ---------------------------------------------------------------------------
-- CAMPGROUNDS + ZONES
-- Source: data/catalog/campgrounds.json
-- 注意：C001 = 租借主倉，不在此表；可預約為 C002–C009
-- ---------------------------------------------------------------------------

CREATE TABLE campgrounds (
  id                VARCHAR(32) PRIMARY KEY,          -- campgroundId, C002–C009
  name              VARCHAR(200) NOT NULL,
  region            VARCHAR(32),
  description       TEXT,
  environment_tags  JSONB,
  facility_tags     JSONB
);

COMMENT ON TABLE campgrounds IS
  '可預約營區 C002–C009（不含 C001 主倉）/ Bookable campgrounds only';

CREATE TABLE campground_zones (
  id                VARCHAR(32) PRIMARY KEY,          -- zoneId, e.g. Z001
  campground_id     VARCHAR(32) NOT NULL REFERENCES campgrounds(id),
  type              VARCHAR(64) NOT NULL,             -- 草皮區、雨棚區…
  capacity_per_site INTEGER NOT NULL DEFAULT 1,
  price_weekday     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  price_holiday     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_sites       INTEGER NOT NULL DEFAULT 0        -- 庫存上限
);

COMMENT ON TABLE campground_zones IS
  '營位區；total_sites 為每晚可賣上限 / Zones; total_sites = capacity ceiling';

CREATE INDEX idx_zones_campground ON campground_zones(campground_id);

-- ---------------------------------------------------------------------------
-- RENTAL_SKUS（租借庫存權威）+ VARIANT STOCKS
-- Source: data/admin/rental-skus.json
-- ---------------------------------------------------------------------------

CREATE TABLE rental_skus (
  id                VARCHAR(32) PRIMARY KEY,          -- e.g. R001
  product_id        VARCHAR(32) NOT NULL REFERENCES products(id),
  image             TEXT,
  name              VARCHAR(200) NOT NULL,
  category          VARCHAR(64),
  brand             VARCHAR(64)
);

COMMENT ON TABLE rental_skus IS
  '租借 SKU 群組＝庫存唯一寫入來源 / Rental stock authority. JSON: data/admin/rental-skus.json';

-- 補 products.rental_id FK（建立 rental_skus 之後）
ALTER TABLE products
  ADD CONSTRAINT fk_products_rental_sku
  FOREIGN KEY (rental_id) REFERENCES rental_skus(id);

CREATE TABLE rental_sku_variant_stocks (
  id                BIGSERIAL PRIMARY KEY,
  rental_sku_id     VARCHAR(32) NOT NULL REFERENCES rental_skus(id),
  variant_id        VARCHAR(64) NOT NULL REFERENCES product_variants(id),
  campground_id     VARCHAR(32) NOT NULL,             -- C001–C009（C001 主倉無 campgrounds FK）
  quantity          INTEGER NOT NULL DEFAULT 0,
  UNIQUE (rental_sku_id, variant_id, campground_id)
);

COMMENT ON TABLE rental_sku_variant_stocks IS
  '各營區／主倉的 variant 庫存真相 / Per-camp variant qty (includes C001 warehouse)';
COMMENT ON COLUMN rental_sku_variant_stocks.campground_id IS
  'C001=warehouse (not in campgrounds); C002–C009=bookable camps';

CREATE INDEX idx_rental_variant_stock_lookup
  ON rental_sku_variant_stocks(variant_id, campground_id);

-- ---------------------------------------------------------------------------
-- RENTAL_LISTINGS（衍生自 rental stocks + 定價／文案）
-- Source: data/catalog/camp-equipment.json（唯讀衍生）
-- ---------------------------------------------------------------------------

CREATE TABLE rental_listings (
  id                VARCHAR(32) PRIMARY KEY,          -- equipmentId, e.g. E010
  rental_sku_id     VARCHAR(32) NOT NULL REFERENCES rental_skus(id),
  product_id        VARCHAR(32) NOT NULL REFERENCES products(id),
  variant_id        VARCHAR(64) NOT NULL REFERENCES product_variants(id),
  sku               VARCHAR(64) NOT NULL,
  campground_id     VARCHAR(32) NOT NULL REFERENCES campgrounds(id), -- 僅 C002–C009
  name              VARCHAR(200) NOT NULL,
  color             VARCHAR(64),
  size              VARCHAR(64),
  spec_label        VARCHAR(128),
  image_url         TEXT,
  terrain_tag       VARCHAR(128),
  description       TEXT,
  price_per_day_weekday NUMERIC(12, 2) NOT NULL DEFAULT 0,
  price_per_day_holiday NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  -- stock 為衍生：對應 rental_sku_variant_stocks.quantity（同 variant + camp）
  -- Derived: copy of rental_sku_variant_stocks.quantity for this variant+camp
  stock             INTEGER NOT NULL DEFAULT 0,
  UNIQUE (campground_id, variant_id)
);

COMMENT ON TABLE rental_listings IS
  '營區租借 listing（衍生）。stock 來自 rental_sku_variant_stocks，禁止手改。 / Derived listings; sync stock from rental SKU variant camp stock.';
COMMENT ON COLUMN rental_listings.stock IS
  'DERIVED from rental_sku_variant_stocks — run sync (npm run sync:listings) / 衍生欄位';

-- ---------------------------------------------------------------------------
-- COUPONS
-- Source: data/promotions/coupons.json
-- ---------------------------------------------------------------------------

CREATE TABLE coupons (
  code              VARCHAR(64) PRIMARY KEY,
  discount          NUMERIC(12, 2) NOT NULL,
  type              coupon_type NOT NULL DEFAULT 'fixed',
  min_order         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  quantity          INTEGER NOT NULL DEFAULT 0,
  used              INTEGER NOT NULL DEFAULT 0,
  start_date        TIMESTAMPTZ,
  end_date          TIMESTAMPTZ,
  status            coupon_status NOT NULL DEFAULT 'active',
  category          coupon_category NOT NULL
);

COMMENT ON TABLE coupons IS
  '折價券主檔。promotion 不進會員中心列表；birthday/firstPurchase 可列。 / Coupon master.';

-- ---------------------------------------------------------------------------
-- ORDERS + ORDER_ITEMS（快照 + FK）
-- Source: data/commerce/orders.json
-- ---------------------------------------------------------------------------

CREATE TABLE orders (
  id                BIGSERIAL PRIMARY KEY,
  customer_id       VARCHAR(32) NOT NULL REFERENCES customers(id),
  buyer_name        VARCHAR(100) NOT NULL,            -- 快照
  address           TEXT,                             -- 快照
  buyer_phone       VARCHAR(32),                      -- 快照（可選）
  subtotal          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  shipping_fee      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  points            INTEGER NOT NULL DEFAULT 0,
  points_awarded    BOOLEAN NOT NULL DEFAULT FALSE,
  payment_status    payment_status NOT NULL DEFAULT 'unpaid',
  status            order_status NOT NULL DEFAULT 'unshipped',
  shipping_method   shipping_method,
  tracking_number   VARCHAR(64),
  delivered_at      TIMESTAMPTZ,
  reviewed          BOOLEAN NOT NULL DEFAULT FALSE,
  customer_note     TEXT,
  seller_note       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE orders IS
  '商城訂單。buyer_name/address 為下單快照；用 customer_id 查會員訂單。 / Orders with buyer snapshots.';

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);

CREATE TABLE order_items (
  id                BIGSERIAL PRIMARY KEY,
  order_id          BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        VARCHAR(32) NOT NULL REFERENCES products(id),
  variant_id        VARCHAR(64) NOT NULL REFERENCES product_variants(id),
  sku               VARCHAR(64) NOT NULL,             -- 快照／冗餘
  name              VARCHAR(200) NOT NULL,            -- 快照 SPU 名
  spec_label        VARCHAR(128),                     -- 快照，分隔符「 / 」
  color             VARCHAR(64),
  size              VARCHAR(64),
  brand             VARCHAR(64),
  image             TEXT,                             -- 快照
  price             NUMERIC(12, 2) NOT NULL,          -- 快照單價
  quantity          INTEGER NOT NULL CHECK (quantity > 0)
);

COMMENT ON TABLE order_items IS
  '訂單明細：FK + 顯示快照（name/spec_label/price/image）/ Line items with snapshots';

CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE order_history (
  id                BIGSERIAL PRIMARY KEY,
  order_id          BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  time              TIMESTAMPTZ NOT NULL,
  action            TEXT NOT NULL
);

CREATE TABLE order_coupons (
  id                BIGSERIAL PRIMARY KEY,
  order_id          BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  code              VARCHAR(64) NOT NULL,             -- 快照
  type              coupon_type,
  discount          NUMERIC(12, 2),                   -- 券面額快照
  amount            NUMERIC(12, 2),                   -- 本單實際折抵
  coupon_code       VARCHAR(64) REFERENCES coupons(code) -- 可空：券刪除後仍靠快照
);

COMMENT ON TABLE order_coupons IS
  '訂單套用券快照 / Coupon usage snapshot on order';

-- ---------------------------------------------------------------------------
-- BOOKINGS + selected zones / rentals
-- Source: data/commerce/camp-bookings.json
-- ---------------------------------------------------------------------------

CREATE TABLE bookings (
  id                BIGSERIAL PRIMARY KEY,
  customer_id       VARCHAR(32) NOT NULL REFERENCES customers(id),
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payment_status    payment_status NOT NULL DEFAULT 'unpaid',
  status            booking_status NOT NULL DEFAULT 'pending',
  equipment_returned BOOLEAN NOT NULL DEFAULT FALSE,
  -- bookingInfo 展開（含快照）
  campground_id     VARCHAR(32) NOT NULL REFERENCES campgrounds(id),
  campground_name   VARCHAR(200) NOT NULL,            -- 快照
  region            VARCHAR(32),                      -- 快照
  check_in          DATE NOT NULL,
  check_out         DATE NOT NULL,
  total_days        INTEGER NOT NULL,
  weekday_count     INTEGER NOT NULL DEFAULT 0,
  holiday_count     INTEGER NOT NULL DEFAULT 0,
  guest_count       INTEGER NOT NULL DEFAULT 1,
  -- summary 展開
  zone_total        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  rental_total      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  applied_discount  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  final_amount      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  customer_note     TEXT,
  seller_note       TEXT,
  CHECK (check_out > check_in)
);

COMMENT ON TABLE bookings IS
  '營區預約。bookingInfo 快照 + campground_id FK。區間 [check_in, check_out)。 / Camp bookings.';

CREATE INDEX idx_bookings_customer ON bookings(customer_id);
CREATE INDEX idx_bookings_camp_dates ON bookings(campground_id, check_in, check_out);
CREATE INDEX idx_bookings_status ON bookings(status);

CREATE TABLE booking_selected_zones (
  id                BIGSERIAL PRIMARY KEY,
  booking_id        BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  zone_id           VARCHAR(32) NOT NULL REFERENCES campground_zones(id),
  zone_type         VARCHAR(64),                      -- 快照
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  subtotal          NUMERIC(12, 2) NOT NULL DEFAULT 0
);

CREATE TABLE booking_selected_rentals (
  id                BIGSERIAL PRIMARY KEY,
  booking_id        BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  equipment_id      VARCHAR(32) REFERENCES rental_listings(id),
  rental_sku_id     VARCHAR(32) REFERENCES rental_skus(id),
  product_id        VARCHAR(32) REFERENCES products(id),
  variant_id        VARCHAR(64) REFERENCES product_variants(id),
  sku               VARCHAR(64),
  name              VARCHAR(200),                     -- 快照
  spec_label        VARCHAR(128),                     -- 快照
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  subtotal          NUMERIC(12, 2) NOT NULL DEFAULT 0
);

CREATE TABLE booking_history (
  id                BIGSERIAL PRIMARY KEY,
  booking_id        BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  time              TIMESTAMPTZ NOT NULL,
  action            TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- BOOKING_POLICIES / ZONE_BLOCKS / CAMPGROUND_CLOSURES
-- ---------------------------------------------------------------------------

CREATE TABLE booking_policies (
  id                SMALLSERIAL PRIMARY KEY,
  booking_window_days INTEGER NOT NULL DEFAULT 90,  -- 定案 90 天
  min_lead_days     INTEGER NOT NULL DEFAULT 0,
  max_stay_nights   INTEGER NOT NULL DEFAULT 7,
  timezone          VARCHAR(64) NOT NULL DEFAULT 'Asia/Taipei',
  occupying_statuses JSONB NOT NULL DEFAULT '["pending","confirmed","completed"]',
  date_rule         JSONB NOT NULL DEFAULT '{"checkInInclusive":true,"checkOutExclusive":true}',
  availability_status JSONB
);

COMMENT ON TABLE booking_policies IS
  '預約政策（通常一列）。booking_window_days=90。JSON: data/admin/booking-policy.json';

CREATE TABLE zone_blocks (
  id                VARCHAR(32) PRIMARY KEY,
  campground_id     VARCHAR(32) NOT NULL REFERENCES campgrounds(id),
  zone_id           VARCHAR(32) NOT NULL REFERENCES campground_zones(id),
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  blocked_sites     INTEGER NOT NULL DEFAULT 0,
  reason            TEXT,
  created_by        VARCHAR(64),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE zone_blocks IS
  '營位維修／停售例外，扣減可賣數 / Zone maintenance blocks. JSON: zone-blocks.json';

CREATE TABLE campground_closures (
  id                VARCHAR(32) PRIMARY KEY,
  campground_id     VARCHAR(32) NOT NULL REFERENCES campgrounds(id),
  type              closure_type NOT NULL,
  start_date        DATE,                             -- date_range
  end_date          DATE,
  day_of_week       SMALLINT,                         -- weekly: 0=Sun … 6=Sat
  effective_from    DATE,
  effective_to      DATE,
  reason            TEXT,
  created_by        VARCHAR(64),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE campground_closures IS
  '營區公休；命中時該營區所有 zone 當晚 closed。JSON: campground-closures.json';

-- ---------------------------------------------------------------------------
-- MIN_STOCKS
-- Source: data/admin/min-stock.json（巢狀 map 展平）
-- ---------------------------------------------------------------------------

CREATE TABLE min_stocks (
  id                BIGSERIAL PRIMARY KEY,
  target_type       min_stock_target_type NOT NULL,
  target_id         VARCHAR(32) NOT NULL,             -- P001 or R001
  location_key      VARCHAR(64) NOT NULL,             -- main / branch-001 / C002…
  min_quantity      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (target_type, target_id, location_key)
);

COMMENT ON TABLE min_stocks IS
  '最低庫存門檻。store→products；rental→rental_skus。 / Min stock thresholds.';

-- ---------------------------------------------------------------------------
-- REVIEWS
-- Source: data/admin/reviews.json
-- ---------------------------------------------------------------------------

CREATE TABLE reviews (
  id                VARCHAR(32) PRIMARY KEY,          -- REV001
  customer_id       VARCHAR(32) NOT NULL REFERENCES customers(id),
  product_id        VARCHAR(32) NOT NULL REFERENCES products(id),
  variant_id        VARCHAR(64) REFERENCES product_variants(id),
  sku               VARCHAR(64),
  order_id          BIGINT REFERENCES orders(id),     -- 可 null
  buyer_name        VARCHAR(100),                     -- 快照
  buyer_avatar      TEXT,                             -- 快照
  product_name      VARCHAR(200),                     -- 快照（關聯以 product_id 為準）
  rating            SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment           TEXT,
  photos            JSONB,
  replied           BOOLEAN NOT NULL DEFAULT FALSE,
  reply_text        TEXT,
  reply_at          TIMESTAMPTZ,
  replied_by        VARCHAR(64),
  replied_by_name   VARCHAR(100),
  reply_updated_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE reviews IS
  '商品評價：FK 為準，product_name 僅顯示快照。 / Reviews with FK + name snapshot.';

-- ---------------------------------------------------------------------------
-- MOVEMENTS + MOVEMENT_ITEMS
-- Source: data/admin/movement.json
-- ---------------------------------------------------------------------------

CREATE TABLE movements (
  id                BIGSERIAL PRIMARY KEY,
  employee_id       VARCHAR(32),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE movements IS
  '庫存異動單頭。JSON: data/admin/movement.json';

CREATE TABLE movement_items (
  id                BIGSERIAL PRIMARY KEY,
  movement_id       BIGINT NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
  product_id        VARCHAR(32) REFERENCES products(id), -- 建議必填
  product_name      VARCHAR(200) NOT NULL,              -- 快照
  quantity          INTEGER NOT NULL,
  from_store        VARCHAR(128),
  to_store          VARCHAR(128),
  type              VARCHAR(32)                         -- 進貨／移轉／損耗…
);

COMMENT ON TABLE movement_items IS
  '異動明細：product_name 快照 + 建議 product_id FK。 / Movement lines.';

-- ---------------------------------------------------------------------------
-- ARTICLES + content / related products
-- Source: data/marketing/articles.json
-- ---------------------------------------------------------------------------

CREATE TABLE articles (
  id                VARCHAR(32) PRIMARY KEY,          -- art-001
  title             VARCHAR(300) NOT NULL,
  category          VARCHAR(64),
  author            VARCHAR(100),
  author_avatar     TEXT,
  published_date    DATE,
  read_time         INTEGER,
  image             TEXT,
  excerpt           TEXT,
  tags              JSONB,
  is_featured       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE article_content_blocks (
  id                BIGSERIAL PRIMARY KEY,
  article_id        VARCHAR(32) NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  type              article_block_type NOT NULL,
  value             TEXT,                             -- text / heading
  product_id        VARCHAR(32) REFERENCES products(id) -- type=product 時
);

CREATE TABLE article_related_products (
  article_id        VARCHAR(32) NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  product_id        VARCHAR(32) NOT NULL REFERENCES products(id),
  PRIMARY KEY (article_id, product_id)
);

-- ---------------------------------------------------------------------------
-- BRANCHES + BRANDS（行銷靜態主檔；夥伴營地 PARTNER_DATA 不進 DB）
-- Source: data/marketing/branches.json, brands.json
-- ---------------------------------------------------------------------------

CREATE TABLE brands (
  id                VARCHAR(32) PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  logo_url          TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE branches (
  id                VARCHAR(32) PRIMARY KEY,          -- branch-001
  name              VARCHAR(200) NOT NULL,
  address           TEXT,
  phone             VARCHAR(32),
  hours             VARCHAR(128),
  image             TEXT,
  latitude          NUMERIC(10, 6),
  longitude         NUMERIC(10, 6),
  map_query         TEXT,
  description       TEXT
);

CREATE TABLE branch_features (
  id                BIGSERIAL PRIMARY KEY,
  branch_id         VARCHAR(32) NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  feature           VARCHAR(128) NOT NULL
);

-- ---------------------------------------------------------------------------
-- 靜態內容（不建表）/ Static content — NOT in DB
--   FAQ          → pages/faq.html, booking/pages/booking-faq.html
--   PARTNER_DATA → js/pages/branches.js
--   rental-guide → booking/pages/rental-guide.html
-- ---------------------------------------------------------------------------

-- End of schema.sql
