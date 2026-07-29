-- Yuruicamp latest operational schema (archive and reconciliation objects excluded).
-- DESTRUCTIVE: applying this file deletes every object and all data in the
-- public and migration schemas, then recreates the latest application schema.
-- This project does not run schema migrations; apply this file before starting the backend.

--
-- PostgreSQL database dump
--

\restrict hByqopxLyaSGhhtkX6cZdF3Rcf7Ez3ga7gOCchUwh1Y4BdXsQiWE7UbicEIFm6K

-- Dumped from database version 16.14 (Debian 16.14-1.pgdg13+1)
-- Dumped by pg_dump version 16.14 (Debian 16.14-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Rebuild application-owned schemas. PostgreSQL cannot drop the currently
-- connected database, but this removes all application tables and data within it.
-- Fresh Docker init already has an empty `public` schema, so DROP first.
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;


--
-- Name: article_block_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.article_block_type AS ENUM (
    'text',
    'heading',
    'product'
);


--
-- Name: auth_provider; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.auth_provider AS ENUM (
    'google',
    'facebook',
    'line'
);


--
-- Name: booking_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.booking_status AS ENUM (
    'pending',
    'confirmed',
    'completed',
    'cancelled'
);


--
-- Name: closure_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.closure_type AS ENUM (
    'date_range',
    'weekly'
);


--
-- Name: coupon_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.coupon_category AS ENUM (
    'promotion',
    'birthday',
    'firstPurchase'
);


--
-- Name: coupon_claim_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.coupon_claim_status AS ENUM (
    'claimed',
    'consumed',
    'revoked',
    'expired'
);


--
-- Name: coupon_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.coupon_status AS ENUM (
    'active',
    'disabled'
);


--
-- Name: coupon_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.coupon_type AS ENUM (
    'fixed',
    'percent'
);


--
-- Name: min_stock_target_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.min_stock_target_type AS ENUM (
    'store',
    'rental'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'unshipped',
    'shipped',
    'completed',
    'returned',
    'cancelled'
);


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'ecpay-credit',
    'ecpay-atm',
    'ecpay-cvs',
    'ecpay-other',
    'cod'
);


--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_status AS ENUM (
    'unpaid',
    'paid',
    'refunded'
);


--
-- Name: product_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_status AS ENUM (
    'active',
    'inactive'
);


--
-- Name: customer_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.customer_status AS ENUM (
    'active',
    'suspended',
    'deleted'
);


--
-- Name: refund_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.refund_status AS ENUM (
    'none',
    'requested',
    'approved',
    'processing',
    'refunded',
    'rejected',
    'failed'
);


--
-- Name: shipping_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.shipping_method AS ENUM (
    'delivery',
    'pickup',
    'cvs'
);


--
-- Name: allocate_coupon_claim_capacity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.allocate_coupon_claim_capacity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status IN ('claimed', 'consumed') THEN
    UPDATE public.coupons
    SET claimed_quantity = claimed_quantity + 1,
        updated_at = now()
    WHERE id = NEW.coupon_id
      AND status = 'active'::public.coupon_status
      AND now() >= valid_from
      AND now() < valid_until
      AND claimed_quantity < issue_quantity;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Coupon % is unavailable, expired, or fully claimed', NEW.coupon_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END
$$;


--
-- Name: get_zone_availability(date, date, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_zone_availability(p_from date, p_to date, p_campground_id character varying DEFAULT NULL::character varying, p_zone_id character varying DEFAULT NULL::character varying) RETURNS TABLE(zone_id character varying, stay_date date, total_sites integer, booked_quantity bigint, blocked_quantity bigint, available_quantity bigint, is_closed boolean)
    LANGUAGE sql STABLE
    AS $$
  WITH dates AS (
    SELECT day_value::date AS stay_date
    FROM generate_series(p_from, p_to, interval '1 day') day_value
    WHERE p_to >= p_from
  ), candidates AS (
    SELECT zone.id AS zone_id, zone.campground_id, zone.total_sites, dates.stay_date
    FROM campground_zones zone
    CROSS JOIN dates
    WHERE (p_campground_id IS NULL OR zone.campground_id = p_campground_id)
      AND (p_zone_id IS NULL OR zone.id = p_zone_id)
  )
  SELECT candidate.zone_id, candidate.stay_date, candidate.total_sites,
         CASE WHEN closure.is_closed THEN 0::bigint
              ELSE occupied.booked_quantity END AS booked_quantity,
         CASE WHEN closure.is_closed THEN 0::bigint
              ELSE blocked.blocked_quantity END AS blocked_quantity,
         CASE WHEN closure.is_closed THEN 0::bigint
              ELSE greatest(
                candidate.total_sites::bigint
                - occupied.booked_quantity - blocked.blocked_quantity,
                0::bigint
              )
          END AS available_quantity,
          closure.is_closed
  FROM candidates candidate
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(selected.quantity), 0)::bigint AS booked_quantity
    FROM bookings booking
    JOIN booking_selected_zones selected ON selected.booking_id = booking.id
    JOIN booking_policy_occupying_statuses status
      ON status.policy_id = 1 AND status.status = booking.status
    WHERE selected.zone_id = candidate.zone_id
      AND candidate.stay_date >= booking.check_in
      AND candidate.stay_date < booking.check_out
  ) occupied
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(block.blocked_quantity), 0)::bigint AS blocked_quantity
    FROM zone_blocks block
    WHERE block.zone_id = candidate.zone_id
      AND block.campground_id = candidate.campground_id
      AND candidate.stay_date >= block.start_date
      AND candidate.stay_date < block.end_date
  ) blocked
  CROSS JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1 FROM campground_closures value
      WHERE value.campground_id = candidate.campground_id
        AND (
          (value.closure_type = 'date_range'
            AND candidate.stay_date >= value.start_date
            AND candidate.stay_date < value.end_date)
          OR
          (value.closure_type = 'weekly'
            AND extract(dow FROM candidate.stay_date)::smallint = value.weekday
            AND candidate.stay_date BETWEEN value.effective_from AND value.effective_to)
        )
    ) AS is_closed
  ) closure
  ORDER BY candidate.zone_id, candidate.stay_date
$$;


--
-- Name: FUNCTION get_zone_availability(p_from date, p_to date, p_campground_id character varying, p_zone_id character varying); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_zone_availability(p_from date, p_to date, p_campground_id character varying, p_zone_id character varying) IS 'P5 inclusive calendar-range query; booking occupancy is [check_in, check_out), closures force zero, and availability never becomes negative.';


--
-- Name: reject_customer_hard_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_customer_hard_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'customers must be soft deleted with soft_delete_customer(%)', OLD.id
    USING ERRCODE = '23000';
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


--
-- Name: validate_zone_block_capacity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_zone_block_capacity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  zone_capacity integer;
BEGIN
  SELECT zone.total_sites
  INTO zone_capacity
  FROM public.campground_zones zone
  WHERE zone.id = NEW.zone_id
    AND zone.campground_id = NEW.campground_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Campground zone %/% does not exist', NEW.campground_id, NEW.zone_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.blocked_quantity > zone_capacity THEN
    RAISE EXCEPTION
      'Blocked quantity % exceeds total sites % for campground zone %/%',
      NEW.blocked_quantity, zone_capacity, NEW.campground_id, NEW.zone_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM generate_series(
      NEW.start_date,
      NEW.end_date - 1,
      interval '1 day'
    ) AS blocked_day(stay_date)
    WHERE NEW.blocked_quantity + COALESCE((
      SELECT sum(existing.blocked_quantity)
      FROM public.zone_blocks existing
      WHERE existing.campground_id = NEW.campground_id
        AND existing.zone_id = NEW.zone_id
        AND blocked_day.stay_date::date >= existing.start_date
        AND blocked_day.stay_date::date < existing.end_date
        AND (TG_OP = 'INSERT' OR existing.id <> NEW.id)
    ), 0) > zone_capacity
  ) THEN
    RAISE EXCEPTION
      'Overlapping zone blocks exceed total sites % for campground zone %/%',
      zone_capacity, NEW.campground_id, NEW.zone_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$$;


--
-- Name: soft_delete_customer(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.soft_delete_customer(p_customer_id character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE customers
  SET status = 'deleted'::public.customer_status,
      deleted_at = now(),
      updated_at = now()
  WHERE id = p_customer_id
    AND status <> 'deleted'::public.customer_status;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows = 1;
END;
$$;


--
-- Name: sync_coupon_claim_capacity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_coupon_claim_capacity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.status IN ('claimed', 'consumed') THEN
    UPDATE public.coupons
    SET claimed_quantity = claimed_quantity - 1,
        updated_at = now()
    WHERE id = OLD.coupon_id
      AND claimed_quantity > 0;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Coupon % claim counter cannot be released', OLD.coupon_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN OLD;
END
$$;


CREATE FUNCTION public.suspend_customer(p_customer_id character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE customers
  SET status = 'suspended'::public.customer_status,
      deleted_at = NULL,
      updated_at = now()
  WHERE id = p_customer_id
    AND status = 'active'::public.customer_status;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows = 1;
END;
$$;


CREATE FUNCTION public.reactivate_customer(p_customer_id character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE customers
  SET status = 'active'::public.customer_status,
      deleted_at = NULL,
      updated_at = now()
  WHERE id = p_customer_id
    AND status IN ('suspended'::public.customer_status, 'deleted'::public.customer_status);

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows = 1;
END;
$$;


--
-- Name: FUNCTION sync_coupon_claim_capacity(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sync_coupon_claim_capacity() IS 'Synchronizes coupons.claimed_quantity when an allocated claim is deleted.';


--
-- Name: touch_equipment_item_from_child(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_equipment_item_from_child() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE equipment_items SET updated_at = NOW() WHERE id = OLD.item_id;
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    UPDATE equipment_items SET updated_at = NOW() WHERE id = NEW.item_id;
    RETURN NEW;
  END IF;

  UPDATE equipment_items
  SET updated_at = NOW()
  WHERE id = OLD.item_id OR id = NEW.item_id;
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id character varying(32) DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text) NOT NULL,
    name character varying(100) NOT NULL,
    phone character varying(32),
    email character varying(255) NOT NULL,
    birthday date,
    registered_at timestamp with time zone NOT NULL,
    tier character varying(32),
    tier_name character varying(64),
    points integer DEFAULT 0 NOT NULL,
    first_purchase_used boolean DEFAULT false NOT NULL,
    auth_provider character varying(32) NOT NULL,
    firebase_uid character varying(128),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    avatar_url text,
    deleted_at timestamp with time zone,
    status public.customer_status DEFAULT 'active'::public.customer_status NOT NULL,
    CONSTRAINT ck_customers_auth_provider CHECK (((auth_provider)::text = ANY ((ARRAY['google'::character varying, 'facebook'::character varying, 'line'::character varying])::text[]))),
    CONSTRAINT ck_customers_points CHECK ((points >= 0)),
    CONSTRAINT ck_customers_status_deleted_at CHECK ((((status = 'deleted'::public.customer_status) AND (deleted_at IS NOT NULL)) OR ((status = ANY (ARRAY['active'::public.customer_status, 'suspended'::public.customer_status])) AND (deleted_at IS NULL)))),

    CONSTRAINT pk_customers PRIMARY KEY (id),
    CONSTRAINT uq_customers_email UNIQUE (email)
);


--
-- Name: TABLE customers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.customers IS '會員主檔 / Customers (OAuth only, no password). JSON: data/customers/customers.json';


--
-- Name: COLUMN customers.first_purchase_used; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.first_purchase_used IS '是否已用過首購券資格 / firstPurchase coupon eligibility flag';


--
-- Name: COLUMN customers.firebase_uid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.firebase_uid IS 'Firebase Auth UID; NULL until first successful OAuth bind.';


--
-- Name: active_customers; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.active_customers AS
 SELECT id,
    name,
    phone,
    email,
    birthday,
    registered_at,
    tier,
    tier_name,
    points,
    first_purchase_used,
    auth_provider,
    created_at,
    updated_at,
    avatar_url,
    deleted_at,
    status
   FROM public.customers
  WHERE ((status = 'active'::public.customer_status) AND (deleted_at IS NULL));


--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_users (
    id character varying(32) NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(254) NOT NULL,
    role character varying(32) NOT NULL,
    active boolean DEFAULT true NOT NULL,
    firebase_uid character varying(128),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_admin_users_role CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'operator'::character varying, 'warehouse'::character varying])::text[]))),

    CONSTRAINT pk_admin_users PRIMARY KEY (id)
);


--
-- Name: COLUMN admin_users.firebase_uid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.admin_users.firebase_uid IS 'Firebase Google UID. active=true + uid NULL = invite pending bind; active=false = disabled.';


--
-- Name: admin_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_permissions (
    code character varying(64) NOT NULL,
    section character varying(32) NOT NULL,
    action character varying(16) NOT NULL,
    CONSTRAINT ck_admin_permissions_action CHECK (((action)::text = ANY ((ARRAY['view'::character varying, 'edit'::character varying])::text[]))),

    CONSTRAINT pk_admin_permissions PRIMARY KEY (code),
    CONSTRAINT uq_admin_permissions_section_action UNIQUE (section, action)
);


--
-- Name: admin_role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_role_permissions (
    role character varying(32) NOT NULL,
    permission_code character varying(64) NOT NULL,
    CONSTRAINT ck_admin_role_permissions_role CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'operator'::character varying, 'warehouse'::character varying])::text[]))),

    CONSTRAINT pk_admin_role_permissions PRIMARY KEY (role, permission_code),
    CONSTRAINT fk_admin_role_permissions_permission_code FOREIGN KEY (permission_code) REFERENCES public.admin_permissions(code) ON UPDATE CASCADE ON DELETE CASCADE
);


--
-- Name: admin_user_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_user_permissions (
    admin_user_id character varying(32) NOT NULL,
    permission_code character varying(64) NOT NULL,
    allowed boolean NOT NULL,

    CONSTRAINT pk_admin_user_permissions PRIMARY KEY (admin_user_id, permission_code),
    CONSTRAINT fk_admin_user_permissions_admin_user_id FOREIGN KEY (admin_user_id) REFERENCES public.admin_users(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_admin_user_permissions_permission_code FOREIGN KEY (permission_code) REFERENCES public.admin_permissions(code) ON UPDATE CASCADE ON DELETE CASCADE
);


--
-- Name: article_content_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.article_content_blocks (
    id bigint NOT NULL,
    article_id character varying(32) NOT NULL,
    sort_order integer NOT NULL,
    block_type character varying(16) NOT NULL,
    text_content text,
    product_id character varying(32),
    CONSTRAINT ck_article_content_blocks_payload CHECK (((((block_type)::text = ANY ((ARRAY['text'::character varying, 'heading'::character varying])::text[])) AND (text_content IS NOT NULL) AND (product_id IS NULL)) OR (((block_type)::text = 'product'::text) AND (text_content IS NULL) AND (product_id IS NOT NULL)))),
    CONSTRAINT ck_article_content_blocks_sort_order CHECK ((sort_order >= 0)),

    CONSTRAINT pk_article_content_blocks PRIMARY KEY (id),
    CONSTRAINT uq_article_content_blocks_article_id_sort_order UNIQUE (article_id, sort_order)
);


--
-- Name: article_content_blocks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.article_content_blocks ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.article_content_blocks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: article_related_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.article_related_products (
    article_id character varying(32) NOT NULL,
    product_id character varying(32) NOT NULL,
    sort_order integer NOT NULL,
    CONSTRAINT ck_article_related_products_sort_order CHECK ((sort_order >= 0)),

    CONSTRAINT pk_article_related_products PRIMARY KEY (article_id, product_id),
    CONSTRAINT uq_article_related_products_article_id_sort_order UNIQUE (article_id, sort_order)
);


--
-- Name: article_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.article_tags (
    article_id character varying(32) NOT NULL,
    tag character varying(100) NOT NULL,
    CONSTRAINT ck_article_tags_tag CHECK ((btrim((tag)::text) <> ''::text)),

    CONSTRAINT pk_article_tags PRIMARY KEY (article_id, tag)
);


--
-- Name: articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.articles (
    id character varying(32) NOT NULL,
    title character varying(250) NOT NULL,
    category character varying(64) NOT NULL,
    published_at timestamp with time zone,
    summary text NOT NULL,
    cover_image_url text,
    featured boolean DEFAULT false NOT NULL,
    status character varying(16) DEFAULT 'draft'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_articles_published CHECK ((((status)::text <> 'published'::text) OR (published_at IS NOT NULL))),
    CONSTRAINT ck_articles_status CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'archived'::character varying])::text[]))),

    CONSTRAINT pk_articles PRIMARY KEY (id)
);


--
-- Name: article_dto_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.article_dto_view AS
 SELECT id,
    jsonb_build_object('id', id, 'title', title, 'category', category, 'publishedDate', to_char((published_at AT TIME ZONE 'Asia/Taipei'::text), 'YYYY-MM-DD'::text), 'image', cover_image_url, 'excerpt', summary, 'tags', COALESCE(( SELECT jsonb_agg(tag.tag ORDER BY tag.tag) AS jsonb_agg
           FROM public.article_tags tag
          WHERE ((tag.article_id)::text = (article.id)::text)), '[]'::jsonb), 'isFeatured', featured, 'relatedProducts', COALESCE(( SELECT jsonb_agg(related.product_id ORDER BY related.sort_order) AS jsonb_agg
           FROM public.article_related_products related
          WHERE ((related.article_id)::text = (article.id)::text)), '[]'::jsonb), 'content', COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('type', block.block_type, 'value', block.text_content, 'productId', block.product_id)) ORDER BY block.sort_order) AS jsonb_agg
           FROM public.article_content_blocks block
          WHERE ((block.article_id)::text = (article.id)::text)), '[]'::jsonb)) AS payload
   FROM public.articles article;


--
-- Name: booking_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_policies (
    id smallint NOT NULL,
    booking_window_days integer NOT NULL,
    advance_days integer NOT NULL,
    max_nights integer NOT NULL,
    timezone character varying(64) DEFAULT 'Asia/Taipei'::character varying NOT NULL,
    date_boundary_hour smallint DEFAULT 0 NOT NULL,
    low_availability_threshold integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_booking_policies_ranges CHECK (((booking_window_days > 0) AND (advance_days >= 0) AND (max_nights > 0) AND ((date_boundary_hour >= 0) AND (date_boundary_hour <= 23)) AND ((low_availability_threshold >= 0) AND (low_availability_threshold <= 100)))),
    CONSTRAINT ck_booking_policies_singleton CHECK ((id = 1)),
    CONSTRAINT ck_booking_policies_timezone CHECK (((timezone)::text = 'Asia/Taipei'::text)),

    CONSTRAINT pk_booking_policies PRIMARY KEY (id)
);


--
-- Name: COLUMN booking_policies.low_availability_threshold; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.booking_policies.low_availability_threshold IS 'Integer percent. Compatibility DTO divides by 100 to reproduce lowThresholdRatio.';


--
-- Name: booking_policy_availability_statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_policy_availability_statuses (
    policy_id smallint NOT NULL,
    status public.booking_status NOT NULL,

    CONSTRAINT pk_booking_policy_availability_statuses PRIMARY KEY (policy_id, status),

    CONSTRAINT fk_booking_policy_availability_statuses_policy_id FOREIGN KEY (policy_id) REFERENCES public.booking_policies(id) ON UPDATE CASCADE ON DELETE CASCADE
);


--
-- Name: booking_policy_occupying_statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_policy_occupying_statuses (
    policy_id smallint NOT NULL,
    status public.booking_status NOT NULL,
    CONSTRAINT ck_booking_policy_occupying_statuses_status CHECK ((status = ANY (ARRAY['pending'::public.booking_status, 'confirmed'::public.booking_status]))),

    CONSTRAINT pk_booking_policy_occupying_statuses PRIMARY KEY (policy_id, status),

    CONSTRAINT fk_booking_policy_occupying_statuses_policy_id FOREIGN KEY (policy_id) REFERENCES public.booking_policies(id) ON UPDATE CASCADE ON DELETE CASCADE
);


--
-- Name: booking_selected_rentals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_selected_rentals (
    id bigint NOT NULL,
    booking_id character varying(32) NOT NULL,
    rental_listing_id character varying(64) NOT NULL,
    rental_sku_variant_id character varying(64) NOT NULL,
    sku_snapshot character varying(64) NOT NULL,
    name_snapshot character varying(200) NOT NULL,
    specification_snapshot character varying(200) NOT NULL,
    price_weekday_snapshot numeric(12,2) NOT NULL,
    price_holiday_snapshot numeric(12,2) NOT NULL,
    discount_snapshot numeric(12,2) NOT NULL,
    quantity integer NOT NULL,
    CONSTRAINT ck_booking_selected_rentals_money CHECK (((price_weekday_snapshot >= (0)::numeric) AND (price_holiday_snapshot >= (0)::numeric) AND (discount_snapshot >= (0)::numeric))),
    CONSTRAINT ck_booking_selected_rentals_quantity CHECK ((quantity > 0)),

    CONSTRAINT pk_booking_selected_rentals PRIMARY KEY (id),
    CONSTRAINT uq_booking_selected_rentals_id_rental_sku_variant_id UNIQUE (id, rental_sku_variant_id)
);


--
-- Name: booking_selected_rentals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.booking_selected_rentals ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.booking_selected_rentals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: booking_selected_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_selected_zones (
    id bigint NOT NULL,
    booking_id character varying(32) NOT NULL,
    zone_id character varying(32) NOT NULL,
    zone_type_snapshot character varying(64) NOT NULL,
    price_weekday_snapshot numeric(12,2) NOT NULL,
    price_holiday_snapshot numeric(12,2) NOT NULL,
    quantity integer NOT NULL,
    CONSTRAINT ck_booking_selected_zones_prices CHECK (((price_weekday_snapshot >= (0)::numeric) AND (price_holiday_snapshot >= (0)::numeric))),
    CONSTRAINT ck_booking_selected_zones_quantity CHECK ((quantity > 0)),

    CONSTRAINT pk_booking_selected_zones PRIMARY KEY (id)
);


--
-- Name: booking_selected_zones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.booking_selected_zones ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.booking_selected_zones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: booking_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_status_history (
    id bigint NOT NULL,
    booking_id character varying(32) NOT NULL,
    status public.booking_status NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    actor_id character varying(32),
    note text,

    CONSTRAINT pk_booking_status_history PRIMARY KEY (id),

    CONSTRAINT fk_booking_status_history_actor_id FOREIGN KEY (actor_id) REFERENCES public.admin_users(id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: booking_status_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.booking_status_history ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.booking_status_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id character varying(32) NOT NULL,
    display_no character varying(16) NOT NULL,
    customer_id character varying(32) NOT NULL,
    checkout_idempotency_key character varying(128),
    checkout_request_hash character varying(64),
    campground_id character varying(32) NOT NULL,
    campground_name_snapshot character varying(150) NOT NULL,
    region_snapshot character varying(100) NOT NULL,
    check_in date NOT NULL,
    check_out date NOT NULL,
    guest_count integer NOT NULL,
    weekday_count integer NOT NULL,
    holiday_count integer NOT NULL,
    zone_total numeric(14,2) NOT NULL,
    rental_total numeric(14,2) NOT NULL,
    applied_discount numeric(14,2) NOT NULL,
    final_amount numeric(14,2) NOT NULL,
    payment_method public.payment_method NOT NULL,
    payment_status public.payment_status NOT NULL,
    paid_at timestamp with time zone,
    checkout_expires_at timestamp with time zone,
    status public.booking_status NOT NULL,
    internal_note text,
    contact_name_snapshot character varying(100),
    contact_phone_snapshot character varying(32),
    contact_email_snapshot character varying(254),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_bookings_dates CHECK ((check_out > check_in)),
    CONSTRAINT ck_bookings_day_counts CHECK (((weekday_count >= 0) AND (holiday_count >= 0) AND ((weekday_count + holiday_count) = (check_out - check_in)))),
    CONSTRAINT ck_bookings_guests CHECK ((guest_count > 0)),
    CONSTRAINT ck_bookings_money CHECK (((zone_total >= (0)::numeric) AND (rental_total >= (0)::numeric) AND (applied_discount >= (0)::numeric) AND (final_amount = GREATEST(((zone_total + rental_total) - applied_discount), (0)::numeric)))),
    CONSTRAINT ck_bookings_no_cod CHECK ((payment_method <> 'cod'::public.payment_method)),

    CONSTRAINT pk_bookings PRIMARY KEY (id),
    CONSTRAINT uq_bookings_display_no UNIQUE (display_no),
    CONSTRAINT uq_bookings_customer_checkout_idempotency UNIQUE (customer_id, checkout_idempotency_key),

    CONSTRAINT fk_bookings_customer_id FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: COLUMN bookings.internal_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.internal_note IS 'Admin-only internal note; not a fulfillment status field.';


--
-- Name: COLUMN bookings.payment_method; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.payment_method IS 'Online ECPay only; COD is forbidden (ck_bookings_no_cod).';


--
-- Name: COLUMN bookings.checkout_expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.checkout_expires_at IS 'Unpaid checkout hold deadline (typically now + 15 minutes). Align with rental reservation release.';


--
-- Name: COLUMN bookings.checkout_idempotency_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.checkout_idempotency_key IS 'Client key for idempotent booking checkout creation; unique per customer when present.';


--
-- Name: COLUMN bookings.checkout_request_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.checkout_request_hash IS 'SHA-256 fingerprint of normalized booking checkout input; detects key reuse with a different payload.';


--
-- Name: booking_display_no_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.booking_display_no_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branch_features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch_features (
    id bigint NOT NULL,
    branch_id character varying(32) NOT NULL,
    feature character varying(100) NOT NULL,

    CONSTRAINT pk_branch_features PRIMARY KEY (id),
    CONSTRAINT uq_branch_features_branch_id_feature UNIQUE (branch_id, feature)
);


--
-- Name: branch_features_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.branch_features ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.branch_features_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id character varying(32) NOT NULL,
    name character varying(120) NOT NULL,
    address character varying(300) NOT NULL,
    phone character varying(32) NOT NULL,
    latitude numeric(10,6),
    longitude numeric(10,6),
    map_query text,
    business_hours character varying(200) NOT NULL,
    image_url text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_branches_latitude CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)))),
    CONSTRAINT ck_branches_longitude CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))),

    CONSTRAINT pk_branches PRIMARY KEY (id)
);


--
-- Name: brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brands (
    id character varying(32) NOT NULL,
    name character varying(120) NOT NULL,
    logo_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_brands_name CHECK ((btrim((name)::text) <> ''::text)),
    CONSTRAINT ck_brands_sort_order CHECK ((sort_order >= 0)),

    CONSTRAINT pk_brands PRIMARY KEY (id)
);


--
-- Name: calendar_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_dates (
    calendar_date date NOT NULL,
    is_holiday boolean NOT NULL,
    holiday_name character varying(120),
    source_version character varying(64) NOT NULL,
    effective_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_calendar_dates_holiday_name CHECK ((is_holiday OR (holiday_name IS NULL))),
    CONSTRAINT ck_calendar_dates_source CHECK ((btrim((source_version)::text) <> ''::text)),

    CONSTRAINT pk_calendar_dates PRIMARY KEY (calendar_date)
);


--
-- Name: campground_closures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campground_closures (
    id bigint NOT NULL,
    campground_id character varying(32) NOT NULL,
    closure_type character varying(16) NOT NULL,
    start_date date,
    end_date date,
    weekday smallint,
    effective_from date,
    effective_to date,
    reason text NOT NULL,
    created_by character varying(32) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_campground_closures_payload CHECK (((((closure_type)::text = 'date_range'::text) AND (start_date IS NOT NULL) AND (end_date IS NOT NULL) AND (end_date >= start_date) AND (weekday IS NULL) AND (effective_from IS NULL) AND (effective_to IS NULL)) OR (((closure_type)::text = 'weekly'::text) AND (start_date IS NULL) AND (end_date IS NULL) AND ((weekday >= 0) AND (weekday <= 6)) AND (effective_from IS NOT NULL) AND (effective_to IS NOT NULL) AND (effective_to >= effective_from)))),
    CONSTRAINT ck_campground_closures_reason CHECK ((btrim(reason) <> ''::text)),
    CONSTRAINT ck_campground_closures_type CHECK (((closure_type)::text = ANY ((ARRAY['date_range'::character varying, 'weekly'::character varying])::text[]))),

    CONSTRAINT pk_campground_closures PRIMARY KEY (id),

    CONSTRAINT fk_campground_closures_created_by FOREIGN KEY (created_by) REFERENCES public.admin_users(id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: COLUMN campground_closures.effective_from; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campground_closures.effective_from IS 'Source-preserving inclusive lower bound for a weekly closure rule.';


--
-- Name: COLUMN campground_closures.effective_to; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campground_closures.effective_to IS 'Source-preserving inclusive upper bound for a weekly closure rule.';


--
-- Name: campground_closures_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.campground_closures ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.campground_closures_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: campground_environment_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campground_environment_tags (
    campground_id character varying(32) NOT NULL,
    tag_id bigint NOT NULL,

    CONSTRAINT pk_campground_environment_tags PRIMARY KEY (campground_id, tag_id)
);


--
-- Name: campground_facility_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campground_facility_tags (
    campground_id character varying(32) NOT NULL,
    tag_id bigint NOT NULL,

    CONSTRAINT pk_campground_facility_tags PRIMARY KEY (campground_id, tag_id)
);


--
-- Name: campground_rental_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campground_rental_locations (
    campground_id character varying(32) NOT NULL,
    location_id character varying(32) NOT NULL,

    CONSTRAINT pk_campground_rental_locations PRIMARY KEY (campground_id),
    CONSTRAINT uq_campground_rental_locations_location_id UNIQUE (location_id)
);


--
-- Name: campground_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campground_zones (
    id character varying(32) NOT NULL,
    campground_id character varying(32) NOT NULL,
    type character varying(64) NOT NULL,
    capacity_per_site integer DEFAULT 1 NOT NULL,
    price_weekday numeric(12,2) DEFAULT 0 NOT NULL,
    price_holiday numeric(12,2) DEFAULT 0 NOT NULL,
    total_sites integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_campground_zones_capacity CHECK ((capacity_per_site > 0)),
    CONSTRAINT ck_campground_zones_prices CHECK (((price_weekday >= (0)::numeric) AND (price_holiday >= (0)::numeric))),
    CONSTRAINT ck_campground_zones_sites CHECK ((total_sites > 0)),

    CONSTRAINT pk_campground_zones PRIMARY KEY (id),
    CONSTRAINT uq_campground_zones_id_campground_id UNIQUE (id, campground_id)
);


--
-- Name: TABLE campground_zones; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.campground_zones IS '營位區；total_sites 為每晚可賣上限 / Zones; total_sites = capacity ceiling';


--
-- Name: campgrounds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campgrounds (
    id character varying(32) NOT NULL,
    name character varying(150) NOT NULL,
    region character varying(100) NOT NULL,
    description text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pk_campgrounds PRIMARY KEY (id)
);


--
-- Name: TABLE campgrounds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.campgrounds IS '可預約營區 C002–C009（不含 C001 主倉）/ Bookable campgrounds only';


--
-- Name: coupon_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupon_claims (
    id bigint NOT NULL,
    coupon_id bigint NOT NULL,
    customer_id character varying(32) NOT NULL,
    status public.coupon_claim_status DEFAULT 'claimed'::public.coupon_claim_status NOT NULL,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL,
    consumed_at timestamp with time zone,
    revoked_at timestamp with time zone,
    CONSTRAINT ck_coupon_claims_time_order CHECK ((((consumed_at IS NULL) OR (consumed_at >= claimed_at)) AND ((revoked_at IS NULL) OR (revoked_at >= claimed_at)))),
    CONSTRAINT ck_coupon_claims_timestamps CHECK ((((status = 'claimed'::public.coupon_claim_status) AND (consumed_at IS NULL) AND (revoked_at IS NULL)) OR ((status = 'consumed'::public.coupon_claim_status) AND (consumed_at IS NOT NULL) AND (revoked_at IS NULL)) OR ((status = ANY (ARRAY['revoked'::public.coupon_claim_status, 'expired'::public.coupon_claim_status])) AND (revoked_at IS NOT NULL)))),

    CONSTRAINT pk_coupon_claims PRIMARY KEY (id),
    CONSTRAINT uq_coupon_claims_coupon_customer UNIQUE (coupon_id, customer_id),
    CONSTRAINT uq_coupon_claims_id_coupon_id UNIQUE (id, coupon_id),

    CONSTRAINT fk_coupon_claims_customer_id FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: TABLE coupon_claims; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.coupon_claims IS 'Current coupon ownership state; consumed claims are never returned after cancellation, return, or refund.';


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupons (
    id bigint NOT NULL,
    code character varying(64) NOT NULL,
    name character varying(120) NOT NULL,
    discount_type character varying(16) NOT NULL,
    discount_value numeric(12,2) NOT NULL,
    minimum_amount numeric(12,2) DEFAULT 0 NOT NULL,
    issue_quantity integer NOT NULL,
    valid_from timestamp with time zone NOT NULL,
    valid_until timestamp with time zone NOT NULL,
    status public.coupon_status NOT NULL,
    category public.coupon_category NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    claimed_quantity integer DEFAULT 0 NOT NULL,
    CONSTRAINT ck_coupons_claimed_quantity CHECK (((claimed_quantity >= 0) AND (claimed_quantity <= issue_quantity))),
    CONSTRAINT ck_coupons_code_canonical CHECK (((btrim((code)::text) <> ''::text) AND ((code)::text = btrim((code)::text)) AND ((code)::text = upper((code)::text)))),
    CONSTRAINT ck_coupons_dates CHECK ((valid_until > valid_from)),
    CONSTRAINT ck_coupons_percentage CHECK ((((discount_type)::text <> 'percent'::text) OR (discount_value <= (100)::numeric))),
    CONSTRAINT ck_coupons_type CHECK (((discount_type)::text = ANY ((ARRAY['fixed'::character varying, 'percent'::character varying])::text[]))),
    CONSTRAINT ck_coupons_values CHECK (((discount_value > (0)::numeric) AND (minimum_amount >= (0)::numeric) AND (issue_quantity >= 0))),

    CONSTRAINT pk_coupons PRIMARY KEY (id)
);


--
-- Name: COLUMN coupons.claimed_quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.coupons.claimed_quantity IS 'Atomic claim allocation counter; cannot exceed issue_quantity.';


--
-- Name: coupon_claim_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.coupon_claim_stats AS
 SELECT coupon.id AS coupon_id,
    coupon.issue_quantity,
    count(claim.id) FILTER (WHERE (claim.status = ANY (ARRAY['claimed'::public.coupon_claim_status, 'consumed'::public.coupon_claim_status]))) AS claimed_quantity,
    count(claim.id) FILTER (WHERE (claim.status = 'consumed'::public.coupon_claim_status)) AS consumed_quantity,
    (coupon.issue_quantity - count(claim.id) FILTER (WHERE (claim.status = ANY (ARRAY['claimed'::public.coupon_claim_status, 'consumed'::public.coupon_claim_status])))) AS remaining_claimable_quantity
   FROM (public.coupons coupon
     LEFT JOIN public.coupon_claims claim ON ((claim.coupon_id = coupon.id)))
  GROUP BY coupon.id, coupon.issue_quantity;


--
-- Name: VIEW coupon_claim_stats; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.coupon_claim_stats IS 'Coupon issue capacity allocated at claim time; the 51st claim of a 50-quantity coupon must fail.';


--
-- Name: coupon_claims_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.coupon_claims ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.coupon_claims_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: coupons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.coupons ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.coupons_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: customer_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_preferences (
    customer_id character varying(32) NOT NULL,
    preference_id bigint NOT NULL,

    CONSTRAINT pk_customer_preferences PRIMARY KEY (customer_id, preference_id),

    CONSTRAINT fk_customer_preferences_customer_id FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: customer_shipping_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_shipping_addresses (
    id bigint NOT NULL,
    customer_id character varying(32) NOT NULL,
    recipient_name character varying(100) NOT NULL,
    postal_code character varying(10) NOT NULL,
    city character varying(50) NOT NULL,
    district character varying(50) NOT NULL,
    address_line character varying(300) NOT NULL,
    phone character varying(32) NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,

    CONSTRAINT pk_customer_shipping_addresses PRIMARY KEY (id),

    CONSTRAINT fk_customer_shipping_addresses_customer_id FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: customer_shipping_addresses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.customer_shipping_addresses ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.customer_shipping_addresses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id character varying(32) NOT NULL,
    display_no character varying(16) NOT NULL,
    customer_id character varying(32) NOT NULL,
    checkout_idempotency_key character varying(128),
    checkout_request_hash character varying(64),
    buyer_name_snapshot character varying(100) NOT NULL,
    buyer_email_snapshot character varying(254) NOT NULL,
    recipient_name_snapshot character varying(100) NOT NULL,
    shipping_address_snapshot text NOT NULL,
    shipping_phone_snapshot character varying(32) NOT NULL,
    shipping_method public.shipping_method DEFAULT 'delivery'::public.shipping_method NOT NULL,
    pickup_branch_id character varying(32),
    cvs_store_id character varying(10),
    cvs_store_name character varying(100),
    cvs_sub_type character varying(20),
    ecpay_logistics_id character varying(20),
    ecpay_cvs_payment_no character varying(20),
    subtotal numeric(14,2) NOT NULL,
    shipping_fee numeric(12,2) NOT NULL,
    discount numeric(14,2) NOT NULL,
    total numeric(14,2) NOT NULL,
    payment_method public.payment_method NOT NULL,
    payment_status public.payment_status NOT NULL,
    refund_status public.refund_status DEFAULT 'none'::public.refund_status NOT NULL,
    status public.order_status NOT NULL,
    internal_note text,
    placed_at timestamp with time zone NOT NULL,
    paid_at timestamp with time zone,
    checkout_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_orders_money CHECK (((subtotal >= (0)::numeric) AND (shipping_fee >= (0)::numeric) AND (discount >= (0)::numeric) AND (total = GREATEST(((subtotal + shipping_fee) - discount), (0)::numeric)))),

    CONSTRAINT pk_orders PRIMARY KEY (id),
    CONSTRAINT uq_orders_display_no UNIQUE (display_no),
    CONSTRAINT uq_orders_customer_checkout_idempotency UNIQUE (customer_id, checkout_idempotency_key),

    CONSTRAINT ck_orders_shipping_target CHECK (
        (
            (shipping_method = 'delivery'::public.shipping_method)
            AND (pickup_branch_id IS NULL)
            AND (cvs_store_id IS NULL)
        )
        OR (
            (shipping_method = 'pickup'::public.shipping_method)
            AND (pickup_branch_id IS NOT NULL)
            AND (cvs_store_id IS NULL)
        )
        OR (
            (shipping_method = 'cvs'::public.shipping_method)
            AND (pickup_branch_id IS NULL)
            AND (cvs_store_id IS NOT NULL)
        )
    ),

    CONSTRAINT fk_orders_customer_id FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_orders_pickup_branch_id FOREIGN KEY (pickup_branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: COLUMN orders.internal_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.internal_note IS 'Admin-only internal note; not a fulfillment status field.';


--
-- Name: order_display_no_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_display_no_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: COLUMN orders.payment_method; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.payment_method IS 'ECPay channels (ecpay-credit/atm/cvs/other) or cod. COD skips ECPay; mark paid after fulfillment.';


--
-- Name: COLUMN orders.checkout_expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.checkout_expires_at IS 'Unpaid checkout hold deadline (typically now + 15 minutes). Align with product_stock_reservations.expires_at.';


--
-- Name: COLUMN orders.checkout_idempotency_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.checkout_idempotency_key IS 'Client key for idempotent checkout creation; unique per customer when present.';


--
-- Name: COLUMN orders.checkout_request_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.checkout_request_hash IS 'SHA-256 fingerprint of normalized checkout creation input; detects key reuse with a different payload.';


--
-- Name: ecpay_logistics_map_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ecpay_logistics_map_sessions (
    merchant_trade_no character varying(20) NOT NULL,
    order_id character varying(32) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pk_ecpay_logistics_map_sessions PRIMARY KEY (merchant_trade_no),
    CONSTRAINT fk_ecpay_logistics_map_sessions_order FOREIGN KEY (order_id) REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE CASCADE
);


--
-- Name: payment_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_notifications (
    id bigint NOT NULL,
    provider character varying(32) NOT NULL,
    merchant_trade_no character varying(64) NOT NULL,
    provider_trade_no character varying(64),
    order_id character varying(32),
    booking_id character varying(32),
    raw_payload jsonb NOT NULL,
    result character varying(32) NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_payment_notifications_provider CHECK (((provider)::text = 'ecpay'::text)),
    CONSTRAINT ck_payment_notifications_result CHECK (((result)::text = ANY ((ARRAY['success'::character varying, 'ignored_duplicate'::character varying, 'failed'::character varying])::text[]))),
    CONSTRAINT ck_payment_notifications_order_xor_booking CHECK ((((order_id IS NOT NULL) AND (booking_id IS NULL)) OR ((order_id IS NULL) AND (booking_id IS NOT NULL)))),

    CONSTRAINT pk_payment_notifications PRIMARY KEY (id),

    CONSTRAINT fk_payment_notifications_order_id FOREIGN KEY (order_id) REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_payment_notifications_booking_id FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: payment_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.payment_notifications ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.payment_notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: TABLE payment_notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payment_notifications IS 'ECPay webhook idempotency log. Business payment truth remains on orders/bookings.';


--
-- Name: customer_spending_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.customer_spending_summary AS
 SELECT customer_id,
    (sum(total))::numeric(14,2) AS total_spent
   FROM public.orders
  WHERE (((payment_status)::text = 'paid'::text) AND ((status)::text = 'completed'::text) AND ((refund_status)::text = 'none'::text))
  GROUP BY customer_id;


--
-- Name: VIEW customer_spending_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.customer_spending_summary IS 'P4 completed, paid and non-refunded order totals by customer.';


--
-- Name: customer_tag_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_tag_assignments (
    customer_id character varying(32) NOT NULL,
    tag_id bigint NOT NULL,

    CONSTRAINT pk_customer_tag_assignments PRIMARY KEY (customer_id, tag_id),

    CONSTRAINT fk_customer_tag_assignments_customer_id FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: customer_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_tags (
    id bigint NOT NULL,
    name character varying(100) NOT NULL,
    color character varying(32) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_customer_tags_sort_order CHECK ((sort_order >= 0)),

    CONSTRAINT pk_customer_tags PRIMARY KEY (id),
    CONSTRAINT uq_customer_tags_name UNIQUE (name)
);


--
-- Name: customer_tags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.customer_tags ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.customer_tags_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: customer_tier_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.customer_tier_summary AS
 SELECT customer_id,
    total_spent,
    (
        CASE
            WHEN (total_spent >= (28000)::numeric) THEN 'master'::text
            WHEN (total_spent >= (12000)::numeric) THEN 'guide'::text
            ELSE 'explorer'::text
        END)::character varying(16) AS tier_code,
    (
        CASE
            WHEN (total_spent >= (28000)::numeric) THEN '大師'::text
            WHEN (total_spent >= (12000)::numeric) THEN '嚮導'::text
            ELSE '探險家'::text
        END)::character varying(32) AS tier_name
   FROM public.customer_spending_summary spending;


--
-- Name: VIEW customer_tier_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.customer_tier_summary IS 'P4 D-001 derived explorer/guide/master tier; never persisted to customer rows.';


--
-- Name: environment_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.environment_tags (
    id bigint NOT NULL,
    code character varying(64) NOT NULL,
    label character varying(100) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    CONSTRAINT ck_environment_tags_sort_order CHECK ((sort_order >= 0)),

    CONSTRAINT pk_environment_tags PRIMARY KEY (id),
    CONSTRAINT uq_environment_tags_code UNIQUE (code),
    CONSTRAINT uq_environment_tags_label UNIQUE (label)
);


--
-- Name: environment_tags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.environment_tags ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.environment_tags_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: equipment_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment_images (
    item_id character varying(32) NOT NULL,
    sort_order integer NOT NULL,
    url text NOT NULL,
    alt_text character varying(200),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_equipment_images_sort_order CHECK ((sort_order >= 0)),
    CONSTRAINT ck_equipment_images_value CHECK ((btrim(url) <> ''::text)),

    CONSTRAINT pk_equipment_images PRIMARY KEY (item_id, sort_order)
);


--
-- Name: COLUMN equipment_images.sort_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.equipment_images.sort_order IS 'Zero-based image order; sort_order = 0 is the main image.';


--
-- Name: equipment_interest_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment_interest_tags (
    item_id character varying(32) NOT NULL,
    tag character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_equipment_interest_tags_value CHECK ((btrim((tag)::text) <> ''::text)),

    CONSTRAINT pk_equipment_interest_tags PRIMARY KEY (item_id, tag)
);


--
-- Name: equipment_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment_items (
    id character varying(32) NOT NULL,
    category_id bigint NOT NULL,
    brand_id character varying(32),
    name character varying(200) NOT NULL,
    description text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_equipment_items_name CHECK ((btrim((name)::text) <> ''::text)),

    CONSTRAINT pk_equipment_items PRIMARY KEY (id),

    CONSTRAINT fk_equipment_items_brand_id FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: equipment_specifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment_specifications (
    item_id character varying(32) NOT NULL,
    spec_key character varying(100) NOT NULL,
    value text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_equipment_specifications_spec_key CHECK ((btrim((spec_key)::text) <> ''::text)),
    CONSTRAINT ck_equipment_specifications_value CHECK ((btrim(value) <> ''::text)),

    CONSTRAINT pk_equipment_specifications PRIMARY KEY (item_id, spec_key),

    CONSTRAINT fk_equipment_specifications_item_id FOREIGN KEY (item_id) REFERENCES public.equipment_items(id) ON UPDATE CASCADE ON DELETE CASCADE
);


--
-- Name: equipment_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment_tags (
    item_id character varying(32) NOT NULL,
    tag character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_equipment_tags_value CHECK ((btrim((tag)::text) <> ''::text)),

    CONSTRAINT pk_equipment_tags PRIMARY KEY (item_id, tag),

    CONSTRAINT fk_equipment_tags_item_id FOREIGN KEY (item_id) REFERENCES public.equipment_items(id) ON UPDATE CASCADE ON DELETE CASCADE
);


--
-- Name: facility_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facility_tags (
    id bigint NOT NULL,
    code character varying(64) NOT NULL,
    label character varying(100) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    CONSTRAINT ck_facility_tags_sort_order CHECK ((sort_order >= 0)),

    CONSTRAINT pk_facility_tags PRIMARY KEY (id),
    CONSTRAINT uq_facility_tags_code UNIQUE (code),
    CONSTRAINT uq_facility_tags_label UNIQUE (label)
);


--
-- Name: facility_tags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.facility_tags ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.facility_tags_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: inventory_conversions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_conversions (
    id bigint NOT NULL,
    source_movement_id bigint NOT NULL,
    destination_movement_id bigint NOT NULL,
    source_variant_id character varying(64) NOT NULL,
    destination_rental_variant_id character varying(64) NOT NULL,
    source_location_id character varying(32) NOT NULL,
    destination_location_id character varying(32) NOT NULL,
    quantity integer NOT NULL,
    idempotency_key character varying(128) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_inventory_conversions_different_movements CHECK ((source_movement_id <> destination_movement_id)),
    CONSTRAINT ck_inventory_conversions_quantity CHECK ((quantity > 0)),

    CONSTRAINT pk_inventory_conversions PRIMARY KEY (id),
    CONSTRAINT uq_inventory_conversions_idempotency_key UNIQUE (idempotency_key),
    CONSTRAINT uq_inventory_conversions_source_destination UNIQUE (source_movement_id, destination_movement_id)
);


--
-- Name: inventory_conversions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.inventory_conversions ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.inventory_conversions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: inventory_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_locations (
    id character varying(32) NOT NULL,
    code character varying(32) NOT NULL,
    inventory_domain character varying(16) NOT NULL,
    type character varying(32) NOT NULL,
    branch_id character varying(32),
    name character varying(120) NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_inventory_locations_branch_type CHECK (((((type)::text = 'branch'::text) AND ((inventory_domain)::text = 'store'::text) AND (branch_id IS NOT NULL)) OR (((type)::text <> 'branch'::text) AND (branch_id IS NULL)))),
    CONSTRAINT ck_inventory_locations_domain CHECK (((inventory_domain)::text = ANY ((ARRAY['store'::character varying, 'rental'::character varying])::text[]))),
    CONSTRAINT ck_inventory_locations_domain_type CHECK (((((inventory_domain)::text = 'store'::text) AND ((type)::text = ANY ((ARRAY['main'::character varying, 'branch'::character varying, 'inspection'::character varying, 'repair'::character varying, 'damaged'::character varying])::text[]))) OR (((inventory_domain)::text = 'rental'::text) AND ((type)::text = ANY ((ARRAY['main'::character varying, 'campground'::character varying, 'inspection'::character varying, 'repair'::character varying, 'damaged'::character varying])::text[]))))),
    CONSTRAINT ck_inventory_locations_type CHECK (((type)::text = ANY ((ARRAY['main'::character varying, 'branch'::character varying, 'campground'::character varying, 'inspection'::character varying, 'repair'::character varying, 'damaged'::character varying])::text[]))),

    CONSTRAINT pk_inventory_locations PRIMARY KEY (id),
    CONSTRAINT uq_inventory_locations_code UNIQUE (code),
    CONSTRAINT uq_inventory_locations_id_inventory_domain UNIQUE (id, inventory_domain),

    CONSTRAINT fk_inventory_locations_branch_id FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: rental_inventory_movement_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rental_inventory_movement_items (
    id bigint NOT NULL,
    movement_id bigint NOT NULL,
    inventory_domain character varying(16) DEFAULT 'rental'::character varying NOT NULL,
    rental_sku_variant_id character varying(64) NOT NULL,
    sku_snapshot character varying(64) NOT NULL,
    item_name_snapshot character varying(200) NOT NULL,
    quantity integer NOT NULL,
    CONSTRAINT ck_rental_inventory_movement_items_domain CHECK (((inventory_domain)::text = 'rental'::text)),
    CONSTRAINT ck_rental_inventory_movement_items_quantity CHECK ((quantity > 0)),

    CONSTRAINT pk_rental_inventory_movement_items PRIMARY KEY (id)
);


--
-- Name: store_inventory_movement_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_inventory_movement_items (
    id bigint NOT NULL,
    movement_id bigint NOT NULL,
    inventory_domain character varying(16) DEFAULT 'store'::character varying NOT NULL,
    variant_id character varying(64) NOT NULL,
    sku_snapshot character varying(64) NOT NULL,
    item_name_snapshot character varying(200) NOT NULL,
    quantity integer NOT NULL,
    source_location_id character varying(32),
    destination_location_id character varying(32),
    line_reason text,
    line_nature character varying(32),
    CONSTRAINT ck_store_inventory_movement_items_domain CHECK (((inventory_domain)::text = 'store'::text)),
    CONSTRAINT ck_store_inventory_movement_items_quantity CHECK ((quantity > 0)),
    CONSTRAINT ck_store_inventory_movement_items_locations CHECK ((((source_location_id IS NOT NULL) OR (destination_location_id IS NOT NULL)) AND ((source_location_id IS NULL) OR (destination_location_id IS NULL) OR ((source_location_id)::text <> (destination_location_id)::text)))),
    CONSTRAINT ck_store_inventory_movement_items_line_nature CHECK (((line_nature IS NULL) OR ((line_nature)::text = ANY ((ARRAY['receipt'::character varying, 'transfer'::character varying, 'stocktake'::character varying, 'damage'::character varying, 'write_off'::character varying])::text[])))),

    CONSTRAINT pk_store_inventory_movement_items PRIMARY KEY (id)
);


--
-- Name: inventory_movement_items_view; Type: VIEW; Schema: public; Owner: -
--

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


--
-- Name: VIEW inventory_movement_items_view; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.inventory_movement_items_view IS 'P5 read-only UNION ALL projection; application writes only concrete domain tables.';


--
-- Name: inventory_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_movements (
    id bigint NOT NULL,
    movement_no character varying(64) NOT NULL,
    inventory_domain character varying(16) NOT NULL,
    movement_type character varying(32) NOT NULL,
    status character varying(16) NOT NULL,
    source_location_id character varying(32),
    destination_location_id character varying(32),
    employee_id character varying(32) NOT NULL,
    reason text NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    posted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_inventory_movements_domain CHECK (((inventory_domain)::text = ANY ((ARRAY['store'::character varying, 'rental'::character varying])::text[]))),
    CONSTRAINT ck_inventory_movements_locations CHECK ((((movement_type)::text = 'product_stock_update'::text) OR (source_location_id IS NOT NULL) OR (destination_location_id IS NOT NULL))),
    CONSTRAINT ck_inventory_movements_posting CHECK (((((status)::text = 'posted'::text) AND (posted_at IS NOT NULL)) OR (((status)::text = ANY ((ARRAY['draft'::character varying, 'cancelled'::character varying])::text[])) AND (posted_at IS NULL)))),
    CONSTRAINT ck_inventory_movements_reason CHECK ((btrim(reason) <> ''::text)),
    CONSTRAINT ck_inventory_movements_status CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'posted'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT ck_inventory_movements_type CHECK (((movement_type)::text = ANY ((ARRAY['receipt'::character varying, 'write_off'::character varying, 'transfer'::character varying, 'conversion_out'::character varying, 'conversion_in'::character varying, 'product_stock_update'::character varying])::text[]))),
    CONSTRAINT ck_inventory_movements_type_payload CHECK (((((movement_type)::text = 'receipt'::text) AND (source_location_id IS NULL) AND (destination_location_id IS NOT NULL)) OR (((movement_type)::text = 'write_off'::text) AND (source_location_id IS NOT NULL) AND (destination_location_id IS NULL)) OR (((movement_type)::text = 'transfer'::text) AND (source_location_id IS NOT NULL) AND (destination_location_id IS NOT NULL) AND ((source_location_id)::text <> (destination_location_id)::text)) OR (((movement_type)::text = 'conversion_out'::text) AND ((inventory_domain)::text = 'store'::text) AND (source_location_id IS NOT NULL) AND (destination_location_id IS NULL)) OR (((movement_type)::text = 'conversion_in'::text) AND ((inventory_domain)::text = 'rental'::text) AND (source_location_id IS NULL) AND (destination_location_id IS NOT NULL)) OR (((movement_type)::text = 'product_stock_update'::text) AND (source_location_id IS NULL) AND (destination_location_id IS NULL)))),

    CONSTRAINT pk_inventory_movements PRIMARY KEY (id),
    CONSTRAINT uq_inventory_movements_id_inventory_domain UNIQUE (id, inventory_domain),
    CONSTRAINT uq_inventory_movements_movement_no UNIQUE (movement_no),

    CONSTRAINT fk_inventory_movements_destination_location_domain FOREIGN KEY (destination_location_id, inventory_domain) REFERENCES public.inventory_locations(id, inventory_domain) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_inventory_movements_employee_id FOREIGN KEY (employee_id) REFERENCES public.admin_users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_inventory_movements_source_location_domain FOREIGN KEY (source_location_id, inventory_domain) REFERENCES public.inventory_locations(id, inventory_domain) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: inventory_movement_dto_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.inventory_movement_dto_view AS
 SELECT id,
    jsonb_build_object('id', id, 'movementNo', movement_no, 'inventoryDomain', inventory_domain, 'movementType', movement_type, 'status', status, 'sourceLocationId', source_location_id, 'destinationLocationId', destination_location_id, 'employeeId', employee_id, 'occurredAt', to_char((occurred_at AT TIME ZONE 'Asia/Taipei'::text), 'YYYY-MM-DD HH24:MI:SS'::text), 'items', COALESCE(( SELECT jsonb_agg(jsonb_build_object('inventoryDomain', item.inventory_domain, 'variantId', item.variant_id, 'sku', item.sku_snapshot, 'productName', item.item_name_snapshot, 'quantity', item.quantity, 'sourceLocationId', movement.source_location_id, 'destinationLocationId', movement.destination_location_id, 'type', movement.movement_type) ORDER BY item.id) AS jsonb_agg
           FROM public.inventory_movement_items_view item
          WHERE (item.movement_id = movement.id)), '[]'::jsonb)) AS payload
   FROM public.inventory_movements movement;


--
-- Name: VIEW inventory_movement_dto_view; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.inventory_movement_dto_view IS 'P6 admin/report DTO built exclusively from P5 inventory_movements and inventory_movement_items_view.';


--
-- Name: inventory_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.inventory_movements ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.inventory_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: inventory_stocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_stocks (
    location_id character varying(32) NOT NULL,
    variant_id character varying(64) NOT NULL,
    on_hand_quantity integer DEFAULT 0 NOT NULL,
    inventory_domain character varying(16) DEFAULT 'store'::character varying NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_inventory_stocks_domain CHECK (((inventory_domain)::text = 'store'::text)),
    CONSTRAINT ck_inventory_stocks_on_hand CHECK ((on_hand_quantity >= 0)),

    CONSTRAINT pk_inventory_stocks PRIMARY KEY (location_id, variant_id),

    CONSTRAINT fk_inventory_stocks_location_domain FOREIGN KEY (location_id, inventory_domain) REFERENCES public.inventory_locations(id, inventory_domain) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: order_coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_coupons (
    id bigint NOT NULL,
    order_id character varying(32) NOT NULL,
    coupon_id bigint NOT NULL,
    code_snapshot character varying(64) NOT NULL,
    discount_type_snapshot character varying(16) NOT NULL,
    discount_value_snapshot numeric(12,2) NOT NULL,
    amount numeric(12,2) NOT NULL,
    applied_at timestamp with time zone NOT NULL,
    coupon_claim_id bigint NOT NULL,
    CONSTRAINT ck_order_coupons_amounts CHECK (((discount_value_snapshot >= (0)::numeric) AND (amount >= (0)::numeric))),

    CONSTRAINT pk_order_coupons PRIMARY KEY (id),
    CONSTRAINT uq_order_coupons_order_id_code_snapshot UNIQUE (order_id, code_snapshot),

    CONSTRAINT fk_order_coupons_claim_coupon_pair FOREIGN KEY (coupon_claim_id, coupon_id) REFERENCES public.coupon_claims(id, coupon_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_order_coupons_coupon_id FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_order_coupons_order_id FOREIGN KEY (order_id) REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE CASCADE
);


--
-- Name: order_coupons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.order_coupons ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.order_coupons_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: order_event_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_event_history (
    id bigint NOT NULL,
    source_history_id bigint NOT NULL,
    order_id character varying(32) NOT NULL,
    event_type character varying(24) NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    actor_id character varying(32),
    note text,
    CONSTRAINT ck_order_event_history_type CHECK ((btrim((event_type)::text) <> ''::text)),

    CONSTRAINT pk_order_event_history PRIMARY KEY (id),
    CONSTRAINT uq_order_event_history_source_history_id UNIQUE (source_history_id),

    CONSTRAINT fk_order_event_history_actor_id FOREIGN KEY (actor_id) REFERENCES public.admin_users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_order_event_history_order_id FOREIGN KEY (order_id) REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE CASCADE
);


--
-- Name: TABLE order_event_history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.order_event_history IS 'Non-lifecycle order events moved out of order_status_history before enum enforcement.';


--
-- Name: order_event_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.order_event_history ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.order_event_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id bigint NOT NULL,
    order_id character varying(32) NOT NULL,
    product_id character varying(32) NOT NULL,
    variant_id character varying(64) NOT NULL,
    sku_snapshot character varying(64) NOT NULL,
    product_name_snapshot character varying(200) NOT NULL,
    specification_snapshot character varying(200) NOT NULL,
    brand_name_snapshot character varying(120) NOT NULL,
    image_url_snapshot text,
    unit_price_snapshot numeric(12,2) NOT NULL,
    quantity integer NOT NULL,
    CONSTRAINT ck_order_items_price CHECK ((unit_price_snapshot >= (0)::numeric)),
    CONSTRAINT ck_order_items_quantity CHECK ((quantity > 0)),

    CONSTRAINT pk_order_items PRIMARY KEY (id),
    CONSTRAINT uq_order_items_id_variant_id UNIQUE (id, variant_id),

    CONSTRAINT fk_order_items_order_id FOREIGN KEY (order_id) REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE CASCADE
);


--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.order_items ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.order_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: order_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_status_history (
    id bigint NOT NULL,
    order_id character varying(32) NOT NULL,
    status public.order_status NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    actor_id character varying(32),
    note text,

    CONSTRAINT pk_order_status_history PRIMARY KEY (id),

    CONSTRAINT fk_order_status_history_actor_id FOREIGN KEY (actor_id) REFERENCES public.admin_users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_order_status_history_order_id FOREIGN KEY (order_id) REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE CASCADE
);


--
-- Name: order_status_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.order_status_history ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.order_status_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: preference_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preference_options (
    id bigint NOT NULL,
    type character varying(32) NOT NULL,
    code character varying(64) NOT NULL,
    label character varying(100) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_preference_options_sort_order CHECK ((sort_order >= 0)),
    CONSTRAINT ck_preference_options_type CHECK (((type)::text = ANY ((ARRAY['style'::character varying, 'equipment'::character varying])::text[]))),

    CONSTRAINT pk_preference_options PRIMARY KEY (id),
    CONSTRAINT uq_preference_options_type_code UNIQUE (type, code),
    CONSTRAINT uq_preference_options_type_label UNIQUE (type, label)
);


--
-- Name: preference_options_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.preference_options ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.preference_options_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: product_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_categories (
    id bigint NOT NULL,
    code character varying(64) NOT NULL,
    name character varying(100) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_product_categories_code CHECK ((btrim((code)::text) <> ''::text)),
    CONSTRAINT ck_product_categories_name CHECK ((btrim((name)::text) <> ''::text)),
    CONSTRAINT ck_product_categories_sort_order CHECK ((sort_order >= 0)),

    CONSTRAINT pk_product_categories PRIMARY KEY (id)
);


--
-- Name: product_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.product_categories ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.product_categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: product_stock_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_stock_reservations (
    id bigint NOT NULL,
    order_item_id bigint NOT NULL,
    variant_id character varying(64) NOT NULL,
    location_id character varying(32) NOT NULL,
    quantity integer NOT NULL,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    idempotency_key character varying(128) NOT NULL,
    reserved_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    released_at timestamp with time zone,
    fulfilled_at timestamp with time zone,
    inventory_domain character varying(16) DEFAULT 'store'::character varying NOT NULL,
    CONSTRAINT ck_product_stock_reservations_domain CHECK (((inventory_domain)::text = 'store'::text)),
    CONSTRAINT ck_product_stock_reservations_expiry CHECK (((expires_at IS NULL) OR (expires_at > reserved_at))),
    CONSTRAINT ck_product_stock_reservations_quantity CHECK ((quantity > 0)),
    CONSTRAINT ck_product_stock_reservations_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'released'::character varying, 'fulfilled'::character varying, 'expired'::character varying])::text[]))),
    CONSTRAINT ck_product_stock_reservations_terminal CHECK (((((status)::text = 'active'::text) AND (released_at IS NULL) AND (fulfilled_at IS NULL)) OR (((status)::text = ANY ((ARRAY['released'::character varying, 'expired'::character varying])::text[])) AND (released_at IS NOT NULL) AND (fulfilled_at IS NULL)) OR (((status)::text = 'fulfilled'::text) AND (fulfilled_at IS NOT NULL)))),

    CONSTRAINT pk_product_stock_reservations PRIMARY KEY (id),
    CONSTRAINT uq_product_stock_reservations_idempotency_key UNIQUE (idempotency_key),

    CONSTRAINT fk_product_stock_reservations_location_domain FOREIGN KEY (location_id, inventory_domain) REFERENCES public.inventory_locations(id, inventory_domain) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_product_stock_reservations_order_item_id_variant_id FOREIGN KEY (order_item_id, variant_id) REFERENCES public.order_items(id, variant_id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: product_stock_reservations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.product_stock_reservations ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.product_stock_reservations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variants (
    id character varying(64) NOT NULL,
    product_id character varying(32) NOT NULL,
    sku character varying(64) NOT NULL,
    color character varying(100),
    size character varying(100),
    price numeric(12,2) NOT NULL,
    specification character varying(200) NOT NULL,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_product_variants_price CHECK ((price >= (0)::numeric)),
    CONSTRAINT ck_product_variants_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying])::text[]))),

    CONSTRAINT pk_product_variants PRIMARY KEY (id),
    CONSTRAINT uq_product_variants_product_color_size_specification UNIQUE NULLS NOT DISTINCT (product_id, color, size, specification),
    CONSTRAINT uq_product_variants_product_id_id UNIQUE (product_id, id),
    CONSTRAINT uq_product_variants_sku UNIQUE (sku)
);


--
-- Name: TABLE product_variants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_variants IS '商品 SKU / Product variants. JSON: products.json > variants[]';


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id character varying(32) NOT NULL,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    item_id character varying(32) NOT NULL,
    CONSTRAINT ck_products_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying])::text[]))),

    CONSTRAINT pk_products PRIMARY KEY (id),
    CONSTRAINT uq_products_item_id UNIQUE (item_id),

    CONSTRAINT fk_products_item_id FOREIGN KEY (item_id) REFERENCES public.equipment_items(id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: TABLE products; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.products IS '商城商品 SPU / Store products. JSON: data/catalog/products.json';


--
-- Name: product_stock_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.product_stock_summary AS
 WITH stock AS (
         SELECT variant.product_id,
            COALESCE(sum(inventory.on_hand_quantity), (0)::bigint) AS total_on_hand
           FROM (public.product_variants variant
             LEFT JOIN public.inventory_stocks inventory ON (((inventory.variant_id)::text = (variant.id)::text)))
          GROUP BY variant.product_id
        ), reserved AS (
         SELECT variant.product_id,
            COALESCE(sum(reservation.quantity), (0)::bigint) AS total_reserved
           FROM (public.product_stock_reservations reservation
             JOIN public.product_variants variant ON (((variant.id)::text = (reservation.variant_id)::text)))
          WHERE ((reservation.status)::text = 'active'::text)
          GROUP BY variant.product_id
        )
 SELECT product.id AS product_id,
    COALESCE(stock.total_on_hand, (0)::bigint) AS total_on_hand,
    COALESCE(reserved.total_reserved, (0)::bigint) AS total_reserved,
    (COALESCE(stock.total_on_hand, (0)::bigint) - COALESCE(reserved.total_reserved, (0)::bigint)) AS total_available
   FROM ((public.products product
     LEFT JOIN stock ON (((stock.product_id)::text = (product.id)::text)))
     LEFT JOIN reserved ON (((reserved.product_id)::text = (product.id)::text)));


--
-- Name: VIEW product_stock_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.product_stock_summary IS 'P4 physical product stock minus active product reservation ledger.';


--
-- Name: product_variant_min_stocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variant_min_stocks (
    variant_id character varying(64) NOT NULL,
    location_id character varying(32) NOT NULL,
    minimum_quantity integer NOT NULL,
    inventory_domain character varying(16) DEFAULT 'store'::character varying NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_product_variant_min_stocks_domain CHECK (((inventory_domain)::text = 'store'::text)),
    CONSTRAINT ck_product_variant_min_stocks_quantity CHECK ((minimum_quantity >= 0)),

    CONSTRAINT pk_product_variant_min_stocks PRIMARY KEY (variant_id, location_id),

    CONSTRAINT fk_product_variant_min_stocks_location_domain FOREIGN KEY (location_id, inventory_domain) REFERENCES public.inventory_locations(id, inventory_domain) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_product_variant_min_stocks_variant_id FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: rental_inventory_movement_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.rental_inventory_movement_items ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.rental_inventory_movement_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: rental_listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rental_listings (
    id character varying(64) NOT NULL,
    campground_id character varying(32) NOT NULL,
    rental_sku_variant_id character varying(64) NOT NULL,
    price_per_day_weekday numeric(12,2) NOT NULL,
    price_per_day_holiday numeric(12,2) NOT NULL,
    discount numeric(12,2) DEFAULT 0 NOT NULL,
    terrain character varying(100),
    description text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_rental_listings_prices CHECK (((price_per_day_weekday >= (0)::numeric) AND (price_per_day_holiday >= (0)::numeric) AND (discount >= (0)::numeric) AND (discount <= 0.30))),

    CONSTRAINT pk_rental_listings PRIMARY KEY (id),
    CONSTRAINT uq_rental_listings_campground_id_rental_sku_variant_id UNIQUE (campground_id, rental_sku_variant_id),

    CONSTRAINT fk_rental_listings_campground_id FOREIGN KEY (campground_id) REFERENCES public.campgrounds(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_rental_listings_campground_location FOREIGN KEY (campground_id) REFERENCES public.campground_rental_locations(campground_id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: rental_sku_variant_stocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rental_sku_variant_stocks (
    location_id character varying(32) NOT NULL,
    rental_sku_variant_id character varying(64) NOT NULL,
    on_hand_quantity integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_rental_sku_variant_stocks_on_hand CHECK ((on_hand_quantity >= 0)),

    CONSTRAINT pk_rental_sku_variant_stocks PRIMARY KEY (location_id, rental_sku_variant_id),

    CONSTRAINT fk_rental_sku_variant_stocks_location_id FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: rental_listing_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.rental_listing_view AS
 SELECT listing.id,
    listing.campground_id,
    listing.rental_sku_variant_id,
    mapping.location_id,
    listing.price_per_day_weekday,
    listing.price_per_day_holiday,
    listing.discount,
    COALESCE(stock.on_hand_quantity, 0) AS stock
   FROM ((public.rental_listings listing
     JOIN public.campground_rental_locations mapping ON (((mapping.campground_id)::text = (listing.campground_id)::text)))
     LEFT JOIN public.rental_sku_variant_stocks stock ON ((((stock.location_id)::text = (mapping.location_id)::text) AND ((stock.rental_sku_variant_id)::text = (listing.rental_sku_variant_id)::text))));


--
-- Name: VIEW rental_listing_view; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.rental_listing_view IS 'P3 read-only listing/location/physical-stock projection; reservation availability belongs to P4.';


--
-- Name: rental_sku_variant_min_stocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rental_sku_variant_min_stocks (
    rental_sku_variant_id character varying(64) NOT NULL,
    location_id character varying(32) NOT NULL,
    minimum_quantity integer NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_rental_sku_variant_min_stocks_quantity CHECK ((minimum_quantity >= 0)),

    CONSTRAINT pk_rental_sku_variant_min_stocks PRIMARY KEY (rental_sku_variant_id, location_id),

    CONSTRAINT fk_rental_sku_variant_min_stocks_location_id FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: rental_sku_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rental_sku_variants (
    id character varying(64) NOT NULL,
    rental_sku_id character varying(32) NOT NULL,
    sku character varying(64) NOT NULL,
    color character varying(100),
    size character varying(100),
    specification character varying(200) NOT NULL,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_rental_sku_variants_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying])::text[]))),

    CONSTRAINT pk_rental_sku_variants PRIMARY KEY (id),
    CONSTRAINT uq_rental_sku_variants_rental_sku_id_id UNIQUE (rental_sku_id, id),
    CONSTRAINT uq_rental_sku_variants_sku UNIQUE (sku)
);


--
-- Name: rental_skus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rental_skus (
    id character varying(32) NOT NULL,
    item_id character varying(32) NOT NULL,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_rental_skus_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying])::text[]))),

    CONSTRAINT pk_rental_skus PRIMARY KEY (id),
    CONSTRAINT uq_rental_skus_item_id UNIQUE (item_id),

    CONSTRAINT fk_rental_skus_item_id FOREIGN KEY (item_id) REFERENCES public.equipment_items(id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: TABLE rental_skus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.rental_skus IS '租借 SKU 群組＝庫存唯一寫入來源 / Rental stock authority. JSON: data/admin/rental-skus.json';


--
-- Name: active_rental_listing_view; Type: VIEW; Schema: public; Owner: -
--
-- Placed after rental_skus / rental_sku_variants so Docker init can CREATE VIEW safely.
--

CREATE VIEW public.active_rental_listing_view AS
 SELECT listing.id,
    listing.campground_id,
    listing.rental_sku_variant_id,
    mapping.location_id,
    listing.price_per_day_weekday,
    listing.price_per_day_holiday,
    listing.discount,
    COALESCE(stock.on_hand_quantity, 0) AS stock
   FROM public.rental_listings listing
     JOIN public.campground_rental_locations mapping ON (((mapping.campground_id)::text = (listing.campground_id)::text))
     JOIN public.rental_sku_variants variant ON (((variant.id)::text = (listing.rental_sku_variant_id)::text))
     JOIN public.rental_skus sku ON (((sku.id)::text = (variant.rental_sku_id)::text))
     LEFT JOIN public.rental_sku_variant_stocks stock ON ((((stock.location_id)::text = (mapping.location_id)::text) AND ((stock.rental_sku_variant_id)::text = (listing.rental_sku_variant_id)::text)))
  WHERE ((listing.active = true) AND ((sku.status)::text = 'active'::text) AND ((variant.status)::text = 'active'::text));


--
-- Name: VIEW active_rental_listing_view; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.active_rental_listing_view IS 'Canonical read-only projection of rentable active listings; filters listing, rental SKU, and variant status.';


--
-- Name: rental_stock_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rental_stock_reservations (
    id bigint NOT NULL,
    booking_selected_rental_id bigint NOT NULL,
    rental_sku_variant_id character varying(64) NOT NULL,
    location_id character varying(32) NOT NULL,
    check_in date NOT NULL,
    check_out date NOT NULL,
    quantity integer NOT NULL,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    idempotency_key character varying(128) NOT NULL,
    reserved_at timestamp with time zone DEFAULT now() NOT NULL,
    released_at timestamp with time zone,
    fulfilled_at timestamp with time zone,
    inventory_domain character varying(16) DEFAULT 'rental'::character varying NOT NULL,
    CONSTRAINT ck_rental_stock_reservations_dates CHECK ((check_out > check_in)),
    CONSTRAINT ck_rental_stock_reservations_domain CHECK (((inventory_domain)::text = 'rental'::text)),
    CONSTRAINT ck_rental_stock_reservations_quantity CHECK ((quantity > 0)),
    CONSTRAINT ck_rental_stock_reservations_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'released'::character varying, 'fulfilled'::character varying])::text[]))),
    CONSTRAINT ck_rental_stock_reservations_terminal CHECK (((((status)::text = 'active'::text) AND (released_at IS NULL) AND (fulfilled_at IS NULL)) OR (((status)::text = 'released'::text) AND (released_at IS NOT NULL) AND (fulfilled_at IS NULL)) OR (((status)::text = 'fulfilled'::text) AND (fulfilled_at IS NOT NULL)))),

    CONSTRAINT pk_rental_stock_reservations PRIMARY KEY (id),
    CONSTRAINT uq_rental_stock_reservations_idempotency_key UNIQUE (idempotency_key),

    CONSTRAINT fk_rental_stock_reservations_booking_selected_rental_id_rental_ FOREIGN KEY (booking_selected_rental_id, rental_sku_variant_id) REFERENCES public.booking_selected_rentals(id, rental_sku_variant_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_rental_stock_reservations_location_domain FOREIGN KEY (location_id, inventory_domain) REFERENCES public.inventory_locations(id, inventory_domain) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: rental_stock_reservations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.rental_stock_reservations ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.rental_stock_reservations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: review_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_photos (
    review_id character varying(32) NOT NULL,
    sort_order integer NOT NULL,
    url text NOT NULL,
    CONSTRAINT ck_review_photos_sort_order CHECK ((sort_order >= 0)),
    CONSTRAINT ck_review_photos_url CHECK ((btrim(url) <> ''::text)),

    CONSTRAINT pk_review_photos PRIMARY KEY (review_id, sort_order)
);


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id character varying(32) NOT NULL,
    order_item_id bigint NOT NULL,
    rating smallint NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_reviews_rating CHECK (((rating >= 1) AND (rating <= 5))),

    CONSTRAINT pk_reviews PRIMARY KEY (id),
    CONSTRAINT uq_reviews_order_item_id UNIQUE (order_item_id),

    CONSTRAINT fk_reviews_order_item_id FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: TABLE reviews; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reviews IS 'Formal verified-purchase reviews; order_item_id is the only authoritative relationship.';


--
-- Name: review_dto_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.review_dto_view AS
 SELECT review.id,
    true AS verified_purchase,
    jsonb_build_object('id', review.id, 'customerId', order_header.customer_id, 'productId', item.product_id, 'variantId', item.variant_id, 'sku', item.sku_snapshot, 'orderId', item.order_id, 'orderItemId', review.order_item_id, 'buyerName', order_header.buyer_name_snapshot, 'buyerAvatar', customer.avatar_url, 'productName', item.product_name_snapshot, 'rating', review.rating, 'comment', review.comment, 'photos', COALESCE(( SELECT jsonb_agg(photo.url ORDER BY photo.sort_order) AS jsonb_agg
           FROM public.review_photos photo
          WHERE ((photo.review_id)::text = (review.id)::text)), '[]'::jsonb), 'createdAt', to_char((review.created_at AT TIME ZONE 'Asia/Taipei'::text), 'YYYY-MM-DD HH24:MI:SS'::text), 'verifiedPurchase', true) AS payload
   FROM (((public.reviews review
     JOIN public.order_items item ON ((item.id = review.order_item_id)))
     JOIN public.orders order_header ON (((order_header.id)::text = (item.order_id)::text)))
     JOIN public.customers customer ON (((customer.id)::text = (order_header.customer_id)::text)));


--
-- Name: sellable_product_variants; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.sellable_product_variants AS
 SELECT product.id AS product_id,
    product.item_id,
    variant.id AS variant_id,
    variant.sku,
    variant.color,
    variant.size,
    variant.specification,
    variant.price
   FROM ((public.equipment_items item
     JOIN public.products product ON (((product.item_id)::text = (item.id)::text)))
     JOIN public.product_variants variant ON (((variant.product_id)::text = (product.id)::text)))
  WHERE ((item.active = true) AND ((product.status)::text = 'active'::text) AND ((variant.status)::text = 'active'::text));


--
-- Name: VIEW sellable_product_variants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.sellable_product_variants IS 'Canonical read model for product listing, detail, cart validation, and checkout repricing.';


--
-- Name: store_inventory_movement_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.store_inventory_movement_items ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.store_inventory_movement_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: zone_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zone_blocks (
    id bigint NOT NULL,
    campground_id character varying(32) NOT NULL,
    zone_id character varying(32) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    blocked_quantity integer NOT NULL,
    reason text NOT NULL,
    created_by character varying(32) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_zone_blocks_dates CHECK ((end_date >= start_date)),
    CONSTRAINT ck_zone_blocks_quantity CHECK ((blocked_quantity > 0)),
    CONSTRAINT ck_zone_blocks_reason CHECK ((btrim(reason) <> ''::text)),

    CONSTRAINT pk_zone_blocks PRIMARY KEY (id),

    CONSTRAINT fk_zone_blocks_campground_id_zone_id FOREIGN KEY (campground_id, zone_id) REFERENCES public.campground_zones(campground_id, id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_zone_blocks_created_by FOREIGN KEY (created_by) REFERENCES public.admin_users(id) ON UPDATE CASCADE ON DELETE RESTRICT
);


--
-- Name: zone_blocks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.zone_blocks ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.zone_blocks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);










































































































































--
































































--
-- Name: idx_admin_users_role_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_users_role_active ON public.admin_users USING btree (role, active);


--
-- Name: uq_admin_users_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_admin_users_email_lower ON public.admin_users USING btree (lower((email)::text));


--
-- Name: uq_admin_users_firebase_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_admin_users_firebase_uid ON public.admin_users USING btree (firebase_uid) NULLS DISTINCT;


--
-- Name: idx_admin_role_permissions_permission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_role_permissions_permission ON public.admin_role_permissions USING btree (permission_code);


--
-- Name: idx_admin_user_permissions_permission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_user_permissions_permission ON public.admin_user_permissions USING btree (permission_code);


--
-- Name: idx_article_content_blocks_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_article_content_blocks_product ON public.article_content_blocks USING btree (product_id);


--
-- Name: idx_article_related_products_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_article_related_products_product ON public.article_related_products USING btree (product_id);


--
-- Name: idx_article_tags_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_article_tags_tag ON public.article_tags USING btree (tag);


--
-- Name: idx_articles_category_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_category_published ON public.articles USING btree (category, published_at);


--
-- Name: idx_articles_featured_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_articles_featured_published ON public.articles USING btree (featured, published_at);


--
-- Name: idx_booking_policy_availability_statuses_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_policy_availability_statuses_status ON public.booking_policy_availability_statuses USING btree (status);


--
-- Name: idx_booking_policy_occupying_statuses_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_policy_occupying_statuses_status ON public.booking_policy_occupying_statuses USING btree (status);


--
-- Name: idx_booking_selected_rentals_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_selected_rentals_booking ON public.booking_selected_rentals USING btree (booking_id);


--
-- Name: idx_booking_selected_rentals_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_selected_rentals_listing ON public.booking_selected_rentals USING btree (rental_listing_id);


--
-- Name: idx_booking_selected_rentals_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_selected_rentals_variant ON public.booking_selected_rentals USING btree (rental_sku_variant_id);


--
-- Name: idx_booking_selected_zones_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_selected_zones_booking ON public.booking_selected_zones USING btree (booking_id);


--
-- Name: idx_booking_selected_zones_zone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_selected_zones_zone ON public.booking_selected_zones USING btree (zone_id);


--
-- Name: idx_booking_status_history_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_status_history_actor ON public.booking_status_history USING btree (actor_id);


--
-- Name: idx_booking_status_history_booking_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_status_history_booking_time ON public.booking_status_history USING btree (booking_id, occurred_at);


--
-- Name: idx_bookings_campground_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_campground_dates ON public.bookings USING btree (campground_id, check_in, check_out);


--
-- Name: idx_bookings_customer_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_customer_created ON public.bookings USING btree (customer_id, created_at);


--
-- Name: idx_bookings_checkout_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_checkout_expiry ON public.bookings USING btree (checkout_expires_at) WHERE ((status = 'pending'::public.booking_status) AND (checkout_expires_at IS NOT NULL));


--
-- Name: idx_branch_features_feature; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_branch_features_feature ON public.branch_features USING btree (feature);


--
-- Name: idx_calendar_dates_holiday_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_dates_holiday_date ON public.calendar_dates USING btree (is_holiday, calendar_date);


--
-- Name: idx_campground_closures_campground_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campground_closures_campground_dates ON public.campground_closures USING btree (campground_id, start_date, end_date);


--
-- Name: idx_campground_closures_campground_weekday; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campground_closures_campground_weekday ON public.campground_closures USING btree (campground_id, weekday);


--
-- Name: idx_campground_closures_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campground_closures_created_by ON public.campground_closures USING btree (created_by);


--
-- Name: idx_campground_environment_tags_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campground_environment_tags_tag ON public.campground_environment_tags USING btree (tag_id);


--
-- Name: idx_campground_facility_tags_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campground_facility_tags_tag ON public.campground_facility_tags USING btree (tag_id);


--
-- Name: idx_campground_zones_campground_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campground_zones_campground_active ON public.campground_zones USING btree (campground_id, active);


--
-- Name: idx_campgrounds_region_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campgrounds_region_active ON public.campgrounds USING btree (region, active);


--
-- Name: idx_coupon_claims_coupon_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupon_claims_coupon_status ON public.coupon_claims USING btree (coupon_id, status);


--
-- Name: idx_coupon_claims_customer_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupon_claims_customer_status ON public.coupon_claims USING btree (customer_id, status);


--
-- Name: idx_coupons_status_validity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_status_validity ON public.coupons USING btree (status, valid_from, valid_until);


--
-- Name: idx_customer_preferences_preference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_preferences_preference ON public.customer_preferences USING btree (preference_id);


--
-- Name: idx_customer_shipping_addresses_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_shipping_addresses_customer ON public.customer_shipping_addresses USING btree (customer_id);


--
-- Name: idx_customer_shipping_addresses_one_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_customer_shipping_addresses_one_default ON public.customer_shipping_addresses USING btree (customer_id) WHERE is_default;


--
-- Name: idx_customer_tag_assignments_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_tag_assignments_tag ON public.customer_tag_assignments USING btree (tag_id);


--
-- Name: idx_customer_tags_active_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_tags_active_sort ON public.customer_tags USING btree (active, sort_order);


--
-- Name: idx_customers_active_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_active_email ON public.customers USING btree (email) WHERE ((status = 'active'::public.customer_status) AND (deleted_at IS NULL));


--
-- Name: idx_customers_auth_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_auth_provider ON public.customers USING btree (auth_provider);


--
-- Name: uq_customers_firebase_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_customers_firebase_uid ON public.customers USING btree (firebase_uid) NULLS DISTINCT;


--
-- Name: idx_environment_tags_active_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_environment_tags_active_sort ON public.environment_tags USING btree (active, sort_order);


--
-- Name: idx_equipment_images_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_equipment_images_sort_order ON public.equipment_images USING btree (sort_order);


--
-- Name: idx_equipment_interest_tags_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_equipment_interest_tags_tag ON public.equipment_interest_tags USING btree (tag);


--
-- Name: idx_equipment_items_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_equipment_items_brand ON public.equipment_items USING btree (brand_id);


--
-- Name: idx_equipment_items_category_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_equipment_items_category_active ON public.equipment_items USING btree (category_id, active);


--
-- Name: idx_equipment_specifications_spec_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_equipment_specifications_spec_key ON public.equipment_specifications USING btree (spec_key);


--
-- Name: idx_equipment_tags_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_equipment_tags_tag ON public.equipment_tags USING btree (tag);


--
-- Name: idx_facility_tags_active_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_facility_tags_active_sort ON public.facility_tags USING btree (active, sort_order);


--
-- Name: idx_inventory_conversions_destination_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_conversions_destination_location ON public.inventory_conversions USING btree (destination_location_id);


--
-- Name: idx_inventory_conversions_destination_movement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_conversions_destination_movement ON public.inventory_conversions USING btree (destination_movement_id);


--
-- Name: idx_inventory_conversions_destination_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_conversions_destination_variant ON public.inventory_conversions USING btree (destination_rental_variant_id);


--
-- Name: idx_inventory_conversions_source_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_conversions_source_location ON public.inventory_conversions USING btree (source_location_id);


--
-- Name: idx_inventory_conversions_source_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_conversions_source_variant ON public.inventory_conversions USING btree (source_variant_id);


--
-- Name: idx_inventory_locations_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_locations_branch ON public.inventory_locations USING btree (branch_id);


--
-- Name: idx_inventory_locations_domain_type_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_locations_domain_type_active ON public.inventory_locations USING btree (inventory_domain, type, active);


--
-- Name: idx_inventory_movements_destination_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_movements_destination_domain ON public.inventory_movements USING btree (destination_location_id, inventory_domain);


--
-- Name: idx_inventory_movements_domain_status_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_movements_domain_status_time ON public.inventory_movements USING btree (inventory_domain, status, occurred_at);


--
-- Name: idx_inventory_movements_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_movements_employee ON public.inventory_movements USING btree (employee_id);


--
-- Name: idx_inventory_movements_source_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_movements_source_domain ON public.inventory_movements USING btree (source_location_id, inventory_domain);


--
-- Name: idx_inventory_stocks_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_stocks_variant ON public.inventory_stocks USING btree (variant_id);


--
-- Name: idx_order_coupons_coupon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_coupons_coupon ON public.order_coupons USING btree (coupon_id);


--
-- Name: idx_order_event_history_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_event_history_actor ON public.order_event_history USING btree (actor_id);


--
-- Name: idx_order_event_history_order_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_event_history_order_time ON public.order_event_history USING btree (order_id, occurred_at);


--
-- Name: idx_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);


--
-- Name: idx_order_items_product_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_product_variant ON public.order_items USING btree (product_id, variant_id);


--
-- Name: idx_order_items_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_variant ON public.order_items USING btree (variant_id);


--
-- Name: idx_order_status_history_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_status_history_actor ON public.order_status_history USING btree (actor_id);


--
-- Name: idx_order_status_history_order_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_status_history_order_time ON public.order_status_history USING btree (order_id, occurred_at);


--
-- Name: idx_orders_customer_placed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_customer_placed ON public.orders USING btree (customer_id, placed_at);


--
-- Name: idx_orders_status_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status_payment ON public.orders USING btree (status, payment_status);


--
-- Name: idx_orders_checkout_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_checkout_expiry ON public.orders USING btree (checkout_expires_at) WHERE ((payment_status = 'unpaid'::public.payment_status) AND (checkout_expires_at IS NOT NULL));


--
-- Name: uq_payment_notifications_provider_trade; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_payment_notifications_provider_trade ON public.payment_notifications USING btree (provider, merchant_trade_no, (COALESCE(provider_trade_no, ''::character varying)));


--
-- Name: idx_payment_notifications_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_notifications_order ON public.payment_notifications USING btree (order_id) WHERE (order_id IS NOT NULL);


--
-- Name: idx_payment_notifications_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_notifications_booking ON public.payment_notifications USING btree (booking_id) WHERE (booking_id IS NOT NULL);


--
-- Name: idx_preference_options_type_active_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_preference_options_type_active_sort ON public.preference_options USING btree (type, active, sort_order);


--
-- Name: idx_product_stock_reservations_active_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_stock_reservations_active_lookup ON public.product_stock_reservations USING btree (variant_id, location_id) WHERE ((status)::text = 'active'::text);


--
-- Name: idx_product_stock_reservations_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_stock_reservations_expiry ON public.product_stock_reservations USING btree (expires_at) WHERE (((status)::text = 'active'::text) AND (expires_at IS NOT NULL));


--
-- Name: idx_product_stock_reservations_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_stock_reservations_location ON public.product_stock_reservations USING btree (location_id);


--
-- Name: idx_product_stock_reservations_location_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_stock_reservations_location_domain ON public.product_stock_reservations USING btree (location_id, inventory_domain);


--
-- Name: idx_product_stock_reservations_order_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_stock_reservations_order_item ON public.product_stock_reservations USING btree (order_item_id);


--
-- Name: idx_product_stock_reservations_order_item_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_stock_reservations_order_item_variant ON public.product_stock_reservations USING btree (order_item_id, variant_id);


--
-- Name: idx_product_variant_min_stocks_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_variant_min_stocks_location ON public.product_variant_min_stocks USING btree (location_id);


--
-- Name: idx_product_variants_product_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_variants_product_status ON public.product_variants USING btree (product_id, status);


--
-- Name: idx_products_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_status ON public.products USING btree (status);


--
-- Name: idx_rental_inventory_movement_items_movement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rental_inventory_movement_items_movement ON public.rental_inventory_movement_items USING btree (movement_id, inventory_domain);


--
-- Name: idx_rental_inventory_movement_items_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rental_inventory_movement_items_variant ON public.rental_inventory_movement_items USING btree (rental_sku_variant_id);


--
-- Name: idx_rental_listings_variant_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rental_listings_variant_active ON public.rental_listings USING btree (rental_sku_variant_id, active);


--
-- Name: idx_rental_sku_variant_min_stocks_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rental_sku_variant_min_stocks_location ON public.rental_sku_variant_min_stocks USING btree (location_id);


--
-- Name: idx_rental_sku_variant_stocks_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rental_sku_variant_stocks_variant ON public.rental_sku_variant_stocks USING btree (rental_sku_variant_id);


--
-- Name: idx_rental_sku_variants_sku_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rental_sku_variants_sku_status ON public.rental_sku_variants USING btree (rental_sku_id, status);


--
-- Name: idx_rental_skus_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rental_skus_status ON public.rental_skus USING btree (status);


--
-- Name: idx_rental_stock_reservations_active_range; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rental_stock_reservations_active_range ON public.rental_stock_reservations USING btree (rental_sku_variant_id, location_id, check_in, check_out) WHERE ((status)::text = 'active'::text);


--
-- Name: idx_rental_stock_reservations_booking_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rental_stock_reservations_booking_item ON public.rental_stock_reservations USING btree (booking_selected_rental_id);


--
-- Name: idx_rental_stock_reservations_booking_item_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rental_stock_reservations_booking_item_variant ON public.rental_stock_reservations USING btree (booking_selected_rental_id, rental_sku_variant_id);


--
-- Name: idx_rental_stock_reservations_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rental_stock_reservations_location ON public.rental_stock_reservations USING btree (location_id);


--
-- Name: idx_rental_stock_reservations_location_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rental_stock_reservations_location_domain ON public.rental_stock_reservations USING btree (location_id, inventory_domain);


--
-- Name: idx_reviews_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_created_at ON public.reviews USING btree (created_at);


--
-- Name: idx_store_inventory_movement_items_movement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_inventory_movement_items_movement ON public.store_inventory_movement_items USING btree (movement_id, inventory_domain);


--
-- Name: idx_store_inventory_movement_items_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_inventory_movement_items_variant ON public.store_inventory_movement_items USING btree (variant_id);


--
-- Name: idx_zone_blocks_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_blocks_created_by ON public.zone_blocks USING btree (created_by);


--
-- Name: idx_zone_blocks_zone_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zone_blocks_zone_dates ON public.zone_blocks USING btree (campground_id, zone_id, start_date, end_date);


--
-- Name: uq_brands_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_brands_name ON public.brands USING btree (lower(btrim((name)::text)));


--
-- Name: uq_coupons_code_upper; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_coupons_code_upper ON public.coupons USING btree (upper((code)::text));


--
-- Name: uq_equipment_interest_tags_item_tag_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_equipment_interest_tags_item_tag_normalized ON public.equipment_interest_tags USING btree (item_id, lower(btrim((tag)::text)));


--
-- Name: uq_equipment_tags_item_tag_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_equipment_tags_item_tag_normalized ON public.equipment_tags USING btree (item_id, lower(btrim((tag)::text)));


--
-- Name: uq_order_coupons_coupon_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_order_coupons_coupon_claim ON public.order_coupons USING btree (coupon_claim_id) WHERE (coupon_claim_id IS NOT NULL);


--
-- Name: uq_product_categories_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_product_categories_code ON public.product_categories USING btree (lower(btrim((code)::text)));


--
-- Name: uq_product_categories_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_product_categories_name ON public.product_categories USING btree (lower(btrim((name)::text)));


--
-- Name: brands trg_brands_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_brands_set_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: coupon_claims trg_coupon_claims_allocate_capacity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coupon_claims_allocate_capacity BEFORE INSERT ON public.coupon_claims FOR EACH ROW EXECUTE FUNCTION public.allocate_coupon_claim_capacity();


--
-- Name: coupon_claims trg_coupon_claims_sync_capacity_on_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coupon_claims_sync_capacity_on_delete BEFORE DELETE ON public.coupon_claims FOR EACH ROW EXECUTE FUNCTION public.sync_coupon_claim_capacity();


--
-- Name: customers trg_customers_prevent_hard_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_customers_prevent_hard_delete BEFORE DELETE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.reject_customer_hard_delete();


--
-- Name: equipment_images trg_equipment_images_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_equipment_images_set_updated_at BEFORE UPDATE ON public.equipment_images FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: equipment_images trg_equipment_images_touch_item; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_equipment_images_touch_item AFTER INSERT OR DELETE OR UPDATE ON public.equipment_images FOR EACH ROW EXECUTE FUNCTION public.touch_equipment_item_from_child();


--
-- Name: equipment_interest_tags trg_equipment_interest_tags_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_equipment_interest_tags_set_updated_at BEFORE UPDATE ON public.equipment_interest_tags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: equipment_interest_tags trg_equipment_interest_tags_touch_item; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_equipment_interest_tags_touch_item AFTER INSERT OR DELETE OR UPDATE ON public.equipment_interest_tags FOR EACH ROW EXECUTE FUNCTION public.touch_equipment_item_from_child();


--
-- Name: equipment_items trg_equipment_items_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_equipment_items_set_updated_at BEFORE UPDATE ON public.equipment_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: equipment_specifications trg_equipment_specifications_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_equipment_specifications_set_updated_at BEFORE UPDATE ON public.equipment_specifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: equipment_specifications trg_equipment_specifications_touch_item; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_equipment_specifications_touch_item AFTER INSERT OR DELETE OR UPDATE ON public.equipment_specifications FOR EACH ROW EXECUTE FUNCTION public.touch_equipment_item_from_child();


--
-- Name: equipment_tags trg_equipment_tags_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_equipment_tags_set_updated_at BEFORE UPDATE ON public.equipment_tags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: equipment_tags trg_equipment_tags_touch_item; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_equipment_tags_touch_item AFTER INSERT OR DELETE OR UPDATE ON public.equipment_tags FOR EACH ROW EXECUTE FUNCTION public.touch_equipment_item_from_child();


--
-- Name: product_categories trg_product_categories_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_product_categories_set_updated_at BEFORE UPDATE ON public.product_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: product_variants trg_product_variants_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_product_variants_set_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: products trg_products_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_products_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: zone_blocks trg_zone_blocks_validate_capacity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_zone_blocks_validate_capacity BEFORE INSERT OR UPDATE OF campground_id, zone_id, start_date, end_date, blocked_quantity ON public.zone_blocks FOR EACH ROW EXECUTE FUNCTION public.validate_zone_block_capacity();


--
-- Name: article_content_blocks fk_article_content_blocks_article_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_content_blocks
    ADD CONSTRAINT fk_article_content_blocks_article_id FOREIGN KEY (article_id) REFERENCES public.articles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: article_content_blocks fk_article_content_blocks_product_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_content_blocks
    ADD CONSTRAINT fk_article_content_blocks_product_id FOREIGN KEY (product_id) REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: article_related_products fk_article_related_products_article_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_related_products
    ADD CONSTRAINT fk_article_related_products_article_id FOREIGN KEY (article_id) REFERENCES public.articles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: article_related_products fk_article_related_products_product_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_related_products
    ADD CONSTRAINT fk_article_related_products_product_id FOREIGN KEY (product_id) REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: article_tags fk_article_tags_article_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.article_tags
    ADD CONSTRAINT fk_article_tags_article_id FOREIGN KEY (article_id) REFERENCES public.articles(id) ON UPDATE CASCADE ON DELETE CASCADE;






--
-- Name: booking_selected_rentals fk_booking_selected_rentals_booking_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_selected_rentals
    ADD CONSTRAINT fk_booking_selected_rentals_booking_id FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: booking_selected_rentals fk_booking_selected_rentals_rental_listing_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_selected_rentals
    ADD CONSTRAINT fk_booking_selected_rentals_rental_listing_id FOREIGN KEY (rental_listing_id) REFERENCES public.rental_listings(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: booking_selected_rentals fk_booking_selected_rentals_rental_sku_variant_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_selected_rentals
    ADD CONSTRAINT fk_booking_selected_rentals_rental_sku_variant_id FOREIGN KEY (rental_sku_variant_id) REFERENCES public.rental_sku_variants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: booking_selected_zones fk_booking_selected_zones_booking_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_selected_zones
    ADD CONSTRAINT fk_booking_selected_zones_booking_id FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: booking_selected_zones fk_booking_selected_zones_zone_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_selected_zones
    ADD CONSTRAINT fk_booking_selected_zones_zone_id FOREIGN KEY (zone_id) REFERENCES public.campground_zones(id) ON UPDATE CASCADE ON DELETE RESTRICT;




--
-- Name: booking_status_history fk_booking_status_history_booking_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_status_history
    ADD CONSTRAINT fk_booking_status_history_booking_id FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: bookings fk_bookings_campground_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT fk_bookings_campground_id FOREIGN KEY (campground_id) REFERENCES public.campgrounds(id) ON UPDATE CASCADE ON DELETE RESTRICT;




--
-- Name: branch_features fk_branch_features_branch_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch_features
    ADD CONSTRAINT fk_branch_features_branch_id FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campground_closures fk_campground_closures_campground_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campground_closures
    ADD CONSTRAINT fk_campground_closures_campground_id FOREIGN KEY (campground_id) REFERENCES public.campgrounds(id) ON UPDATE CASCADE ON DELETE RESTRICT;




--
-- Name: campground_environment_tags fk_campground_environment_tags_campground_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campground_environment_tags
    ADD CONSTRAINT fk_campground_environment_tags_campground_id FOREIGN KEY (campground_id) REFERENCES public.campgrounds(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campground_environment_tags fk_campground_environment_tags_tag_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campground_environment_tags
    ADD CONSTRAINT fk_campground_environment_tags_tag_id FOREIGN KEY (tag_id) REFERENCES public.environment_tags(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: campground_facility_tags fk_campground_facility_tags_campground_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campground_facility_tags
    ADD CONSTRAINT fk_campground_facility_tags_campground_id FOREIGN KEY (campground_id) REFERENCES public.campgrounds(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campground_facility_tags fk_campground_facility_tags_tag_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campground_facility_tags
    ADD CONSTRAINT fk_campground_facility_tags_tag_id FOREIGN KEY (tag_id) REFERENCES public.facility_tags(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: campground_rental_locations fk_campground_rental_locations_campground_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campground_rental_locations
    ADD CONSTRAINT fk_campground_rental_locations_campground_id FOREIGN KEY (campground_id) REFERENCES public.campgrounds(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: campground_rental_locations fk_campground_rental_locations_location_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campground_rental_locations
    ADD CONSTRAINT fk_campground_rental_locations_location_id FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: campground_zones fk_campground_zones_campground_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campground_zones
    ADD CONSTRAINT fk_campground_zones_campground_id FOREIGN KEY (campground_id) REFERENCES public.campgrounds(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: coupon_claims fk_coupon_claims_coupon_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_claims
    ADD CONSTRAINT fk_coupon_claims_coupon_id FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON UPDATE CASCADE ON DELETE RESTRICT;






--
-- Name: customer_preferences fk_customer_preferences_preference_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_preferences
    ADD CONSTRAINT fk_customer_preferences_preference_id FOREIGN KEY (preference_id) REFERENCES public.preference_options(id) ON UPDATE CASCADE ON DELETE RESTRICT;






--
-- Name: customer_tag_assignments fk_customer_tag_assignments_tag_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_tag_assignments
    ADD CONSTRAINT fk_customer_tag_assignments_tag_id FOREIGN KEY (tag_id) REFERENCES public.customer_tags(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: equipment_images fk_equipment_images_item_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_images
    ADD CONSTRAINT fk_equipment_images_item_id FOREIGN KEY (item_id) REFERENCES public.equipment_items(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: equipment_interest_tags fk_equipment_interest_tags_item_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_interest_tags
    ADD CONSTRAINT fk_equipment_interest_tags_item_id FOREIGN KEY (item_id) REFERENCES public.equipment_items(id) ON UPDATE CASCADE ON DELETE CASCADE;




--
-- Name: equipment_items fk_equipment_items_category_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment_items
    ADD CONSTRAINT fk_equipment_items_category_id FOREIGN KEY (category_id) REFERENCES public.product_categories(id) ON UPDATE CASCADE ON DELETE RESTRICT;






--
-- Name: inventory_conversions fk_inventory_conversions_destination_location_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_conversions
    ADD CONSTRAINT fk_inventory_conversions_destination_location_id FOREIGN KEY (destination_location_id) REFERENCES public.inventory_locations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: inventory_conversions fk_inventory_conversions_destination_movement_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_conversions
    ADD CONSTRAINT fk_inventory_conversions_destination_movement_id FOREIGN KEY (destination_movement_id) REFERENCES public.inventory_movements(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: inventory_conversions fk_inventory_conversions_destination_rental_variant_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_conversions
    ADD CONSTRAINT fk_inventory_conversions_destination_rental_variant_id FOREIGN KEY (destination_rental_variant_id) REFERENCES public.rental_sku_variants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: inventory_conversions fk_inventory_conversions_source_location_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_conversions
    ADD CONSTRAINT fk_inventory_conversions_source_location_id FOREIGN KEY (source_location_id) REFERENCES public.inventory_locations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: inventory_conversions fk_inventory_conversions_source_movement_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_conversions
    ADD CONSTRAINT fk_inventory_conversions_source_movement_id FOREIGN KEY (source_movement_id) REFERENCES public.inventory_movements(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: inventory_conversions fk_inventory_conversions_source_variant_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_conversions
    ADD CONSTRAINT fk_inventory_conversions_source_variant_id FOREIGN KEY (source_variant_id) REFERENCES public.product_variants(id) ON UPDATE CASCADE ON DELETE RESTRICT;












--
-- Name: inventory_stocks fk_inventory_stocks_variant_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stocks
    ADD CONSTRAINT fk_inventory_stocks_variant_id FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON UPDATE CASCADE ON DELETE RESTRICT;














--
-- Name: order_items fk_order_items_product_id_variant_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT fk_order_items_product_id_variant_id FOREIGN KEY (product_id, variant_id) REFERENCES public.product_variants(product_id, id) ON UPDATE CASCADE ON DELETE RESTRICT;
















--
-- Name: product_variants fk_product_variants_product_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT fk_product_variants_product_id FOREIGN KEY (product_id) REFERENCES public.products(id) ON UPDATE CASCADE ON DELETE RESTRICT;




--
-- Name: rental_inventory_movement_items fk_rental_inventory_movement_items_movement_id_inventory_domain; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_inventory_movement_items
    ADD CONSTRAINT fk_rental_inventory_movement_items_movement_id_inventory_domain FOREIGN KEY (movement_id, inventory_domain) REFERENCES public.inventory_movements(id, inventory_domain) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: rental_inventory_movement_items fk_rental_inventory_movement_items_rental_sku_variant_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_inventory_movement_items
    ADD CONSTRAINT fk_rental_inventory_movement_items_rental_sku_variant_id FOREIGN KEY (rental_sku_variant_id) REFERENCES public.rental_sku_variants(id) ON UPDATE CASCADE ON DELETE RESTRICT;






--
-- Name: rental_listings fk_rental_listings_rental_sku_variant_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_listings
    ADD CONSTRAINT fk_rental_listings_rental_sku_variant_id FOREIGN KEY (rental_sku_variant_id) REFERENCES public.rental_sku_variants(id) ON UPDATE CASCADE ON DELETE RESTRICT;




--
-- Name: rental_sku_variant_min_stocks fk_rental_sku_variant_min_stocks_rental_sku_variant_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_sku_variant_min_stocks
    ADD CONSTRAINT fk_rental_sku_variant_min_stocks_rental_sku_variant_id FOREIGN KEY (rental_sku_variant_id) REFERENCES public.rental_sku_variants(id) ON UPDATE CASCADE ON DELETE RESTRICT;




--
-- Name: rental_sku_variant_stocks fk_rental_sku_variant_stocks_rental_sku_variant_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_sku_variant_stocks
    ADD CONSTRAINT fk_rental_sku_variant_stocks_rental_sku_variant_id FOREIGN KEY (rental_sku_variant_id) REFERENCES public.rental_sku_variants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: rental_sku_variants fk_rental_sku_variants_rental_sku_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_sku_variants
    ADD CONSTRAINT fk_rental_sku_variants_rental_sku_id FOREIGN KEY (rental_sku_id) REFERENCES public.rental_skus(id) ON UPDATE CASCADE ON DELETE RESTRICT;








--
-- Name: review_photos fk_review_photos_review_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_photos
    ADD CONSTRAINT fk_review_photos_review_id FOREIGN KEY (review_id) REFERENCES public.reviews(id) ON UPDATE CASCADE ON DELETE CASCADE;




--
-- Name: store_inventory_movement_items fk_store_inventory_movement_items_movement_id_inventory_domain; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_inventory_movement_items
    ADD CONSTRAINT fk_store_inventory_movement_items_movement_id_inventory_domain FOREIGN KEY (movement_id, inventory_domain) REFERENCES public.inventory_movements(id, inventory_domain) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: store_inventory_movement_items fk_store_inventory_movement_items_variant_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_inventory_movement_items
    ADD CONSTRAINT fk_store_inventory_movement_items_variant_id FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: store_inventory_movement_items fk_store_inventory_movement_items_source_location_domain; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_inventory_movement_items
    ADD CONSTRAINT fk_store_inventory_movement_items_source_location_domain FOREIGN KEY (source_location_id, inventory_domain) REFERENCES public.inventory_locations(id, inventory_domain) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: store_inventory_movement_items fk_store_inventory_movement_items_destination_location_domain; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_inventory_movement_items
    ADD CONSTRAINT fk_store_inventory_movement_items_destination_location_domain FOREIGN KEY (destination_location_id, inventory_domain) REFERENCES public.inventory_locations(id, inventory_domain) ON UPDATE CASCADE ON DELETE RESTRICT;






--
-- PostgreSQL database dump complete
--

\unrestrict hByqopxLyaSGhhtkX6cZdF3Rcf7Ez3ga7gOCchUwh1Y4BdXsQiWE7UbicEIFm6K
