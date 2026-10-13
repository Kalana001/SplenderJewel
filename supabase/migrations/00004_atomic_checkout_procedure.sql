-- ==============================================================================
-- SPLENDER JEWEL — FORWARD MIGRATION: ATOMIC CHECKOUT TRANSACTION PROCEDURE
-- Migration: 00004_atomic_checkout_procedure.sql
--
-- PURPOSE:
-- 1. [DEFENSIVE PRECONDITIONS] Verify all required order, catalog, inventory,
--    delivery, coupon, and payment tables exist before applying DDL.
-- 2. [IDEMPOTENCY COLUMN & CONSTRAINT] Adds optional idempotency_key (16..128 chars)
--    to public.orders with a UNIQUE constraint and revokes client read access on it.
-- 3. [ATOMIC CHECKOUT RPC] Creates/replaces public.process_order_checkout to
--    guarantee 100% single-transaction execution:
--    - Serializes concurrent identical idempotency keys via pg_advisory_xact_lock
--    - Verifies customer identity match on idempotent hits (preventing cross-customer
--      order_token disclosure)
--    - Verifies registered customer profile exists and account_status = 'active'
--    - Validates every raw line item (non-null variant_id, positive integer quantity >= 1)
--      before aggregating duplicate variants
--    - Acquires row locks (FOR UPDATE OF pv) in canonical variant_id ASC order to
--      prevent multi-item deadlocks
--    - Validates BOTH variant is_active AND parent product is_active
--    - Enforces authoritative delivery fee and province lookup from delivery_districts
--    - Enforces coupon status, dates, min_order_amount, total_usage_limit, and
--      per_customer_limit (across both user_id and guest phone/email) with FOR UPDATE lock
--    - Atomically snapshots unit_price, primary product image_url, and confidential
--      purchase_cost onto order_items
--    - Atomically records inventory_movements, order_status_history, coupon_usage,
--      and bank_transfer payment tracking records
--    - Strictly restricted to service_role with immutable search_path = public, pg_temp
--
-- EXECUTION STATUS: PREPARED FOR REVIEW (NOT YET APPLIED TO LIVE SUPABASE)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. DEFENSIVE PRECONDITIONS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.orders') IS NULL
     OR to_regclass('public.order_items') IS NULL
     OR to_regclass('public.product_variants') IS NULL
     OR to_regclass('public.products') IS NULL
     OR to_regclass('public.delivery_districts') IS NULL
     OR to_regclass('public.coupons') IS NULL
     OR to_regclass('public.coupon_usage') IS NULL
     OR to_regclass('public.payments') IS NULL
     OR to_regclass('public.inventory_movements') IS NULL
     OR to_regclass('public.order_status_history') IS NULL
  THEN
    RAISE EXCEPTION 'Cannot apply migration 00004: one or more required core tables are missing from schema public.';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. IDEMPOTENCY COLUMN, CONSTRAINT & LEAST-PRIVILEGE TABLE/COLUMN ISOLATION
-- ------------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS chk_orders_idempotency_key_len;

ALTER TABLE public.orders
  ADD CONSTRAINT chk_orders_idempotency_key_len
  CHECK (
    idempotency_key IS NULL
    OR (char_length(idempotency_key) >= 16 AND char_length(idempotency_key) <= 128)
  );

COMMENT ON COLUMN public.orders.idempotency_key IS 'Client retry idempotency token (16-128 chars). Confidential internal column omitted from customer SELECT grants.';

-- Ensure Row Level Security is enabled on orders and order_items
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Scope orders and order_items RLS policies strictly TO authenticated
DROP POLICY IF EXISTS "Users view own orders" ON public.orders;
CREATE POLICY "Users view own orders" ON public.orders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage orders" ON public.orders;
CREATE POLICY "Admins manage orders" ON public.orders
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users view own order items" ON public.order_items;
CREATE POLICY "Users view own order items" ON public.order_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders WHERE id = order_items.order_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins manage order items" ON public.order_items;
CREATE POLICY "Admins manage order items" ON public.order_items
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Immediately revoke ALL column-level and table-level privileges on public.orders
-- from PUBLIC, anon, and authenticated (do NOT rely on column-level REVOKE while
-- table-level SELECT/INSERT/UPDATE/DELETE remains granted).
REVOKE ALL (
  id,
  order_number,
  order_token,
  user_id,
  customer_name,
  email,
  phone1,
  phone2,
  address_line,
  city,
  district,
  province,
  postal_code,
  delivery_notes,
  delivery_fee,
  subtotal,
  discount_amount,
  coupon_code,
  total_amount,
  payment_method,
  payment_status,
  order_status,
  admin_notes,
  tracking_number,
  idempotency_key,
  created_at,
  updated_at
) ON public.orders FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.orders FROM PUBLIC, anon, authenticated;

-- Grant authenticated read-only access ONLY to the 24 customer-safe columns of public.orders.
-- Confidential columns (idempotency_key, order_token, admin_notes) are strictly omitted.
-- Role anon receives ZERO grants on public.orders (guest order confirmation is served
-- strictly via server-side service_role action getGuestOrderConfirmation).
GRANT SELECT (
  id,
  order_number,
  user_id,
  customer_name,
  email,
  phone1,
  phone2,
  address_line,
  city,
  district,
  province,
  postal_code,
  delivery_notes,
  delivery_fee,
  subtotal,
  discount_amount,
  coupon_code,
  total_amount,
  payment_method,
  payment_status,
  order_status,
  tracking_number,
  created_at,
  updated_at
) ON public.orders TO authenticated;

GRANT ALL ON TABLE public.orders TO service_role;

-- Immediately revoke ALL column-level and table-level privileges on public.order_items
-- from PUBLIC, anon, and authenticated, and grant authenticated SELECT only on the 11
-- customer-safe columns (strictly omitting purchase_cost).
REVOKE ALL (
  id,
  order_id,
  product_id,
  variant_id,
  product_name,
  variant_title,
  sku,
  image_url,
  unit_price,
  quantity,
  total_price,
  purchase_cost
) ON public.order_items FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.order_items FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  order_id,
  product_id,
  variant_id,
  product_name,
  variant_title,
  sku,
  image_url,
  unit_price,
  quantity,
  total_price
) ON public.order_items TO authenticated;

GRANT ALL ON TABLE public.order_items TO service_role;

-- ------------------------------------------------------------------------------
-- 3. ATOMIC ORDER CHECKOUT STORED PROCEDURE
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_order_checkout(
  p_order_data JSONB,
  p_items_data JSONB,
  p_coupon_code TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := NULL;
  v_account_status TEXT;
  v_customer_name TEXT;
  v_email TEXT;
  v_phone1 TEXT;
  v_phone2 TEXT;
  v_address_line TEXT;
  v_city TEXT;
  v_district TEXT;
  v_province TEXT;
  v_district_province TEXT;
  v_postal_code TEXT;
  v_delivery_notes TEXT;
  v_payment_method TEXT;
  v_idempotency_key TEXT;

  v_delivery_fee NUMERIC(12, 2) := 0;
  v_district_active BOOLEAN := FALSE;
  v_subtotal NUMERIC(12, 2) := 0;
  v_discount_amount NUMERIC(12, 2) := 0;
  v_total_amount NUMERIC(12, 2) := 0;

  v_raw_item RECORD;
  v_item RECORD;
  v_variant RECORD;
  v_existing_order RECORD;
  v_coupon RECORD;
  v_coupon_id UUID := NULL;
  v_coupon_code TEXT := NULL;
  v_requested_coupon TEXT := NULL;
  v_requested_items_canonical JSONB;
  v_existing_items_canonical JSONB;
  v_usage_count INT := 0;
  v_user_usage_count INT := 0;

  v_item_price NUMERIC(12, 2);
  v_item_total NUMERIC(12, 2);
  v_item_image_url TEXT;
  v_new_qty INT;
  v_stock_status TEXT;

  v_order_id UUID;
  v_order_number TEXT;
  v_order_token UUID;
BEGIN
  -- 0A. Defense-in-depth runtime privilege check: restrict execution strictly to service_role / superuser
  IF COALESCE(NULLIF(current_setting('role', true), 'none'), current_user) NOT IN ('service_role', 'postgres', 'supabase_admin')
     OR COALESCE(current_setting('request.jwt.claim.role', true), '') IN ('anon', 'authenticated')
  THEN
    RAISE EXCEPTION 'permission denied for function process_order_checkout'
      USING ERRCODE = '42501';
  END IF;

  -- 0. Validate JSON payload containers
  IF p_order_data IS NULL OR jsonb_typeof(p_order_data) <> 'object' THEN
    RAISE EXCEPTION 'Order payload must be a valid JSON object.';
  END IF;

  IF p_items_data IS NULL OR jsonb_typeof(p_items_data) <> 'array' OR jsonb_array_length(p_items_data) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one jewelry item.';
  END IF;

  -- Extract and normalize required order fields
  v_customer_name := NULLIF(TRIM(p_order_data->>'customer_name'), '');
  v_phone1 := NULLIF(TRIM(p_order_data->>'phone1'), '');
  v_address_line := NULLIF(TRIM(p_order_data->>'address_line'), '');
  v_district := NULLIF(TRIM(p_order_data->>'district'), '');
  v_payment_method := NULLIF(TRIM(p_order_data->>'payment_method'), '');
  v_idempotency_key := NULLIF(TRIM(p_order_data->>'idempotency_key'), '');
  v_requested_coupon := UPPER(NULLIF(TRIM(p_coupon_code), ''));

  IF v_customer_name IS NULL THEN
    RAISE EXCEPTION 'Customer full name is required.';
  END IF;
  IF v_phone1 IS NULL THEN
    RAISE EXCEPTION 'Primary contact phone number is required.';
  END IF;
  IF v_address_line IS NULL THEN
    RAISE EXCEPTION 'Delivery address is required.';
  END IF;
  IF v_district IS NULL THEN
    RAISE EXCEPTION 'Delivery district is required.';
  END IF;
  IF v_payment_method IS NULL OR v_payment_method NOT IN ('cod', 'bank_transfer') THEN
    RAISE EXCEPTION 'Invalid payment method: %', COALESCE(v_payment_method, 'NULL');
  END IF;

  IF v_idempotency_key IS NOT NULL AND (char_length(v_idempotency_key) < 16 OR char_length(v_idempotency_key) > 128) THEN
    RAISE EXCEPTION 'Idempotency key must be between 16 and 128 characters.';
  END IF;

  IF p_order_data->>'user_id' IS NOT NULL AND TRIM(p_order_data->>'user_id') <> '' THEN
    v_user_id := (TRIM(p_order_data->>'user_id'))::UUID;

    -- Verify registered customer profile exists and is active
    SELECT account_status
    INTO v_account_status
    FROM public.profiles
    WHERE id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Authenticated customer profile not found.';
    END IF;

    IF v_account_status <> 'active' THEN
      RAISE EXCEPTION 'Your customer account is suspended and cannot place orders.';
    END IF;
  END IF;

  v_email := NULLIF(TRIM(p_order_data->>'email'), '');
  v_phone2 := NULLIF(TRIM(p_order_data->>'phone2'), '');
  v_city := NULLIF(TRIM(p_order_data->>'city'), '');
  v_province := NULLIF(TRIM(p_order_data->>'province'), '');
  v_postal_code := NULLIF(TRIM(p_order_data->>'postal_code'), '');
  v_delivery_notes := NULLIF(TRIM(p_order_data->>'delivery_notes'), '');

  -- 0B. Validate every raw element in p_items_data BEFORE idempotency check and aggregation
  -- Prevents negative, zero, null, or non-integer quantities from cancelling out in SUM()
  FOR v_raw_item IN
    SELECT value AS elem FROM jsonb_array_elements(p_items_data)
  LOOP
    IF v_raw_item.elem IS NULL
       OR jsonb_typeof(v_raw_item.elem) <> 'object'
       OR NULLIF(TRIM(v_raw_item.elem->>'variant_id'), '') IS NULL
       OR NULLIF(TRIM(v_raw_item.elem->>'quantity'), '') IS NULL
    THEN
      RAISE EXCEPTION 'Each order item must specify a valid variant_id and quantity.';
    END IF;

    IF (TRIM(v_raw_item.elem->>'quantity')) !~ '^[1-9][0-9]{0,5}$'
       OR (TRIM(v_raw_item.elem->>'quantity'))::INT < 1
    THEN
      RAISE EXCEPTION 'Item quantity must be a positive integer of at least 1.';
    END IF;
  END LOOP;

  -- 1. Concurrency-Safe & Full-Payload-Bound Idempotency Check
  IF v_idempotency_key IS NOT NULL THEN
    -- Serialize concurrent requests sharing the same idempotency_key so the second
    -- caller waits for the first transaction to commit before reading public.orders
    PERFORM pg_advisory_xact_lock(hashtext('splender_checkout_idem:' || v_idempotency_key));

    SELECT
      id, order_number, order_token, user_id,
      customer_name, email, phone1, phone2,
      address_line, city, district, postal_code, delivery_notes,
      payment_method, coupon_code,
      subtotal, discount_amount, delivery_fee, total_amount
    INTO v_existing_order
    FROM public.orders
    WHERE idempotency_key = v_idempotency_key;

    IF FOUND THEN
      -- Compute canonical sorted (variant_id, quantity) array for requested payload
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object('variant_id', req_agg.variant_id, 'quantity', req_agg.quantity)
          ORDER BY req_agg.variant_id ASC
        ),
        '[]'::JSONB
      )
      INTO v_requested_items_canonical
      FROM (
        SELECT
          (TRIM(elem->>'variant_id'))::UUID AS variant_id,
          SUM((TRIM(elem->>'quantity'))::INT)::INT AS quantity
        FROM jsonb_array_elements(p_items_data) elem
        GROUP BY (TRIM(elem->>'variant_id'))::UUID
      ) req_agg;

      -- Compute canonical sorted (variant_id, quantity) array for existing order
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object('variant_id', existing_agg.variant_id, 'quantity', existing_agg.quantity)
          ORDER BY existing_agg.variant_id ASC
        ),
        '[]'::JSONB
      )
      INTO v_existing_items_canonical
      FROM (
        SELECT
          oi.variant_id,
          SUM(oi.quantity)::INT AS quantity
        FROM public.order_items oi
        WHERE oi.order_id = v_existing_order.id
        GROUP BY oi.variant_id
      ) existing_agg;

      -- Verify complete order payload matches existing order; prevent cross-customer disclosure and payload mutation reuse
      IF v_existing_order.user_id IS DISTINCT FROM v_user_id
         OR LOWER(v_existing_order.customer_name) <> LOWER(v_customer_name)
         OR LOWER(COALESCE(v_existing_order.email, '')) <> LOWER(COALESCE(v_email, ''))
         OR v_existing_order.phone1 <> v_phone1
         OR COALESCE(v_existing_order.phone2, '') <> COALESCE(v_phone2, '')
         OR LOWER(v_existing_order.address_line) <> LOWER(v_address_line)
         OR LOWER(COALESCE(v_existing_order.city, '')) <> LOWER(COALESCE(v_city, ''))
         OR v_existing_order.district <> v_district
         OR LOWER(COALESCE(v_existing_order.postal_code, '')) <> LOWER(COALESCE(v_postal_code, ''))
         OR COALESCE(v_existing_order.delivery_notes, '') <> COALESCE(v_delivery_notes, '')
         OR v_existing_order.payment_method <> v_payment_method
         OR UPPER(COALESCE(v_existing_order.coupon_code, '')) <> COALESCE(v_requested_coupon, '')
         OR v_existing_items_canonical <> v_requested_items_canonical
      THEN
        RAISE EXCEPTION 'Idempotency key conflict: request parameters do not match existing order.';
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'order_id', v_existing_order.id,
        'order_number', v_existing_order.order_number,
        'order_token', v_existing_order.order_token,
        'subtotal', v_existing_order.subtotal,
        'discount_amount', v_existing_order.discount_amount,
        'delivery_fee', v_existing_order.delivery_fee,
        'total_amount', v_existing_order.total_amount,
        'is_duplicate', true,
        'idempotent', true
      );
    END IF;
  END IF;

  -- 2. Authoritative Delivery Fee & Province lookup from delivery_districts
  SELECT delivery_fee, is_active, province
  INTO v_delivery_fee, v_district_active, v_district_province
  FROM public.delivery_districts
  WHERE name = v_district;

  IF NOT FOUND OR NOT v_district_active THEN
    RAISE EXCEPTION 'Delivery to district "%" is currently unavailable.', v_district;
  END IF;

  v_delivery_fee := COALESCE(v_delivery_fee, 0);
  v_province := COALESCE(v_province, v_district_province);

  -- 3. Lock variants in deterministic UUID order (preventing multi-item deadlocks)
  -- and compute authoritative subtotal from aggregated quantities
  FOR v_item IN
    SELECT
      (TRIM(elem->>'variant_id'))::UUID AS variant_id,
      SUM((elem->>'quantity')::INT)::INT AS quantity
    FROM jsonb_array_elements(p_items_data) elem
    GROUP BY (TRIM(elem->>'variant_id'))::UUID
    ORDER BY (TRIM(elem->>'variant_id'))::UUID ASC
  LOOP
    SELECT
      pv.id, pv.product_id, pv.sku, pv.title, pv.price, pv.discount_price,
      pv.purchase_cost, pv.stock_quantity, pv.low_stock_threshold, pv.is_active,
      p.name AS product_name, p.is_active AS product_is_active
    INTO v_variant
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = v_item.variant_id
    FOR UPDATE OF pv;

    IF NOT FOUND OR NOT v_variant.is_active OR NOT v_variant.product_is_active THEN
      RAISE EXCEPTION 'One or more items in your cart are no longer available or inactive.';
    END IF;

    IF v_variant.stock_quantity < v_item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for "%". Only % available.', v_variant.title, v_variant.stock_quantity;
    END IF;

    v_item_price := COALESCE(v_variant.discount_price, v_variant.price);
    v_subtotal := v_subtotal + ROUND(v_item_price * v_item.quantity, 2);
  END LOOP;

  -- 4. Process promotional coupon atomically if provided
  IF p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) <> '' THEN
    SELECT *
    INTO v_coupon
    FROM public.coupons
    WHERE UPPER(code) = UPPER(TRIM(p_coupon_code))
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid promotional coupon code.';
    END IF;

    IF NOT v_coupon.is_active THEN
      RAISE EXCEPTION 'This promotional coupon is no longer active.';
    END IF;

    IF v_coupon.start_date IS NOT NULL AND NOW() < v_coupon.start_date THEN
      RAISE EXCEPTION 'This promotional code is not yet active.';
    END IF;

    IF v_coupon.end_date IS NOT NULL AND NOW() > v_coupon.end_date THEN
      RAISE EXCEPTION 'This promotional coupon code has expired.';
    END IF;

    IF v_subtotal < COALESCE(v_coupon.min_order_amount, 0) THEN
      RAISE EXCEPTION 'Order subtotal does not meet the minimum requirement for this coupon.';
    END IF;

    -- Total store usage limit check
    IF v_coupon.total_usage_limit IS NOT NULL AND v_coupon.total_usage_limit > 0 THEN
      SELECT COUNT(*)
      INTO v_usage_count
      FROM public.coupon_usage
      WHERE coupon_id = v_coupon.id;

      IF v_usage_count >= v_coupon.total_usage_limit THEN
        RAISE EXCEPTION 'This promotional coupon has reached its maximum total usage limit.';
      END IF;
    END IF;

    -- Per-customer usage limit check (enforced across authenticated user_id AND guest phone/email)
    IF v_coupon.per_customer_limit IS NOT NULL AND v_coupon.per_customer_limit > 0 THEN
      SELECT COUNT(*)
      INTO v_user_usage_count
      FROM public.coupon_usage cu
      LEFT JOIN public.orders o ON o.id = cu.order_id
      WHERE cu.coupon_id = v_coupon.id
        AND (
          (v_user_id IS NOT NULL AND cu.user_id = v_user_id)
          OR o.phone1 = v_phone1
          OR (v_email IS NOT NULL AND o.email IS NOT NULL AND LOWER(o.email) = LOWER(v_email))
        );

      IF v_user_usage_count >= v_coupon.per_customer_limit THEN
        RAISE EXCEPTION 'You have reached the maximum allowed usage limit for this coupon.';
      END IF;
    END IF;

    -- Calculate verified discount amount capped at subtotal
    IF v_coupon.discount_type = 'percentage' THEN
      v_discount_amount := (v_subtotal * v_coupon.discount_value) / 100.0;
      IF v_coupon.max_discount_amount IS NOT NULL AND v_discount_amount > v_coupon.max_discount_amount THEN
        v_discount_amount := v_coupon.max_discount_amount;
      END IF;
      v_discount_amount := LEAST(v_discount_amount, v_subtotal);
    ELSE
      v_discount_amount := LEAST(v_coupon.discount_value, v_subtotal);
    END IF;

    v_discount_amount := ROUND(GREATEST(0, v_discount_amount), 2);
    v_coupon_id := v_coupon.id;
    v_coupon_code := v_coupon.code;
  END IF;

  v_total_amount := ROUND(GREATEST(0, v_subtotal - v_discount_amount) + v_delivery_fee, 2);

  -- 5. Insert order header atomically
  INSERT INTO public.orders (
    user_id,
    customer_name,
    email,
    phone1,
    phone2,
    address_line,
    city,
    district,
    province,
    postal_code,
    delivery_notes,
    delivery_fee,
    subtotal,
    discount_amount,
    coupon_code,
    total_amount,
    payment_method,
    payment_status,
    order_status,
    idempotency_key
  ) VALUES (
    v_user_id,
    v_customer_name,
    v_email,
    v_phone1,
    v_phone2,
    v_address_line,
    v_city,
    v_district,
    v_province,
    v_postal_code,
    v_delivery_notes,
    v_delivery_fee,
    v_subtotal,
    v_discount_amount,
    v_coupon_code,
    v_total_amount,
    v_payment_method,
    'pending',
    'pending',
    v_idempotency_key
  )
  RETURNING id, order_number, order_token INTO v_order_id, v_order_number, v_order_token;

  -- 6. Deduct inventory, record movements, and insert order items in canonical variant order
  FOR v_item IN
    SELECT
      (TRIM(elem->>'variant_id'))::UUID AS variant_id,
      SUM((TRIM(elem->>'quantity'))::INT)::INT AS quantity
    FROM jsonb_array_elements(p_items_data) elem
    GROUP BY (TRIM(elem->>'variant_id'))::UUID
    ORDER BY (TRIM(elem->>'variant_id'))::UUID ASC
  LOOP
    SELECT
      pv.id, pv.product_id, pv.sku, pv.title, pv.price, pv.discount_price,
      pv.purchase_cost, pv.stock_quantity, pv.low_stock_threshold,
      p.name AS product_name
    INTO v_variant
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = v_item.variant_id;

    SELECT pi.url
    INTO v_item_image_url
    FROM public.product_images pi
    WHERE pi.product_id = v_variant.product_id
    ORDER BY (pi.variant_id = v_variant.id) DESC NULLS LAST, pi.is_primary DESC, pi.display_order ASC
    LIMIT 1;

    v_item_price := COALESCE(v_variant.discount_price, v_variant.price);
    v_item_total := ROUND(v_item_price * v_item.quantity, 2);
    v_new_qty := v_variant.stock_quantity - v_item.quantity;

    IF v_new_qty = 0 THEN
      v_stock_status := 'out_of_stock';
    ELSIF v_new_qty <= v_variant.low_stock_threshold THEN
      v_stock_status := 'low_stock';
    ELSE
      v_stock_status := 'in_stock';
    END IF;

    -- Update inventory stock atomically
    UPDATE public.product_variants
    SET
      stock_quantity = v_new_qty,
      stock_status = v_stock_status,
      updated_at = NOW()
    WHERE id = v_item.variant_id;

    -- Insert order item with primary image_url and wholesale purchase_cost snapshot
    INSERT INTO public.order_items (
      order_id,
      product_id,
      variant_id,
      product_name,
      variant_title,
      sku,
      image_url,
      unit_price,
      quantity,
      total_price,
      purchase_cost
    ) VALUES (
      v_order_id,
      v_variant.product_id,
      v_item.variant_id,
      v_variant.product_name,
      v_variant.title,
      v_variant.sku,
      v_item_image_url,
      v_item_price,
      v_item.quantity,
      v_item_total,
      COALESCE(v_variant.purchase_cost, 0)
    );

    -- Log inventory movement
    INSERT INTO public.inventory_movements (
      variant_id,
      quantity_change,
      previous_quantity,
      new_quantity,
      reason,
      reference_id,
      created_by
    ) VALUES (
      v_item.variant_id,
      -v_item.quantity,
      v_variant.stock_quantity,
      v_new_qty,
      'order_sold',
      v_order_number,
      NULL
    );
  END LOOP;

  -- 7. Record initial order status history
  INSERT INTO public.order_status_history (
    order_id,
    previous_status,
    new_status,
    notes
  ) VALUES (
    v_order_id,
    NULL,
    'pending',
    'Order placed by customer (Pending verification)'
  );

  -- 8. Record coupon usage if coupon was applied
  IF v_coupon_id IS NOT NULL THEN
    INSERT INTO public.coupon_usage (
      coupon_id,
      order_id,
      user_id,
      discount_amount
    ) VALUES (
      v_coupon_id,
      v_order_id,
      v_user_id,
      v_discount_amount
    );
  END IF;

  -- 9. Create payment tracking record inside the same transaction for all orders
  INSERT INTO public.payments (
    order_id,
    payment_method,
    amount,
    status,
    notes
  ) VALUES (
    v_order_id,
    v_payment_method,
    v_total_amount,
    'pending',
    CASE
      WHEN v_payment_method = 'bank_transfer' THEN 'Awaiting customer WhatsApp payment confirmation and manual admin verification'
      ELSE 'Cash on delivery — payment to be collected upon delivery'
    END
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'order_token', v_order_token,
    'subtotal', v_subtotal,
    'discount_amount', v_discount_amount,
    'delivery_fee', v_delivery_fee,
    'total_amount', v_total_amount,
    'is_duplicate', false,
    'idempotent', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ------------------------------------------------------------------------------
-- 3B. ATOMIC ORDER CANCELLATION & INVENTORY RESTOCKING STORED PROCEDURE
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_order_and_restock(
  p_order_id UUID,
  p_admin_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_order RECORD;
  v_admin_email TEXT;
  v_item RECORD;
  v_variant RECORD;
  v_new_qty INT;
  v_stock_status TEXT;
  v_already_restocked BOOLEAN := FALSE;
BEGIN
  -- 0. Defense-in-depth runtime privilege check: restrict execution strictly to service_role / superuser
  IF COALESCE(NULLIF(current_setting('role', true), 'none'), current_user) NOT IN ('service_role', 'postgres', 'supabase_admin')
     OR COALESCE(current_setting('request.jwt.claim.role', true), '') IN ('anon', 'authenticated')
  THEN
    RAISE EXCEPTION 'permission denied for function cancel_order_and_restock'
      USING ERRCODE = '42501';
  END IF;

  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order ID is required.';
  END IF;

  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'Administrator ID is required to cancel an order.';
  END IF;

  SELECT email
  INTO v_admin_email
  FROM public.admin_users
  WHERE id = p_admin_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: active administrator account not found.';
  END IF;

  -- 1. Lock target order row
  SELECT id, order_number, order_status
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target order not found.';
  END IF;

  IF v_order.order_status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', true,
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'previous_status', 'cancelled',
      'new_status', 'cancelled',
      'restocked', false,
      'idempotent', true
    );
  END IF;

  -- 2. Check idempotency guard against duplicate restock movements for this order_number
  SELECT EXISTS (
    SELECT 1
    FROM public.inventory_movements
    WHERE reason = 'order_cancelled_restock'
      AND reference_id = v_order.order_number
  )
  INTO v_already_restocked;

  -- 3. Lock variants in canonical UUID order and restore inventory stock
  IF NOT v_already_restocked THEN
    FOR v_item IN
      SELECT
        oi.variant_id,
        SUM(oi.quantity)::INT AS quantity
      FROM public.order_items oi
      WHERE oi.order_id = v_order.id
        AND oi.variant_id IS NOT NULL
      GROUP BY oi.variant_id
      ORDER BY oi.variant_id ASC
    LOOP
      SELECT id, stock_quantity, low_stock_threshold
      INTO v_variant
      FROM public.product_variants
      WHERE id = v_item.variant_id
      FOR UPDATE;

      IF FOUND THEN
        v_new_qty := v_variant.stock_quantity + v_item.quantity;

        IF v_new_qty = 0 THEN
          v_stock_status := 'out_of_stock';
        ELSIF v_new_qty <= v_variant.low_stock_threshold THEN
          v_stock_status := 'low_stock';
        ELSE
          v_stock_status := 'in_stock';
        END IF;

        UPDATE public.product_variants
        SET
          stock_quantity = v_new_qty,
          stock_status = v_stock_status,
          updated_at = NOW()
        WHERE id = v_item.variant_id;

        INSERT INTO public.inventory_movements (
          variant_id,
          quantity_change,
          previous_quantity,
          new_quantity,
          reason,
          reference_id,
          created_by
        ) VALUES (
          v_item.variant_id,
          v_item.quantity,
          v_variant.stock_quantity,
          v_new_qty,
          'order_cancelled_restock',
          v_order.order_number,
          p_admin_id
        );
      END IF;
    END LOOP;
  END IF;

  -- 4. Release coupon usage reservation for the cancelled order
  DELETE FROM public.coupon_usage
  WHERE order_id = v_order.id;

  -- 5. Update order status to cancelled
  UPDATE public.orders
  SET
    order_status = 'cancelled',
    updated_at = NOW()
  WHERE id = v_order.id;

  -- 6. Record status transition history
  INSERT INTO public.order_status_history (
    order_id,
    previous_status,
    new_status,
    notes
  ) VALUES (
    v_order.id,
    v_order.order_status,
    'cancelled',
    COALESCE(NULLIF(TRIM(p_notes), ''), 'Order cancelled and inventory restocked by admin (' || v_admin_email || ')')
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'previous_status', v_order.order_status,
    'new_status', 'cancelled',
    'restocked', NOT v_already_restocked,
    'idempotent', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ------------------------------------------------------------------------------
-- 4. PRIVILEGE ISOLATION
-- ------------------------------------------------------------------------------
ALTER FUNCTION public.process_order_checkout(JSONB, JSONB, TEXT) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.process_order_checkout(JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_order_checkout(JSONB, JSONB, TEXT) TO service_role;

COMMENT ON FUNCTION public.process_order_checkout(JSONB, JSONB, TEXT) IS 'Atomic single-transaction order checkout procedure with advisory lock idempotency, canonical variant locking, and server-side price/fee/coupon verification.';

ALTER FUNCTION public.cancel_order_and_restock(UUID, UUID, TEXT) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.cancel_order_and_restock(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_and_restock(UUID, UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.cancel_order_and_restock(UUID, UUID, TEXT) IS 'Atomic single-transaction administrative order cancellation and inventory restocking procedure restricted strictly to service_role.';
