-- ==============================================================================
-- SPLENDER JEWEL — PHASE 3B STAGE 4 COMPLETE DATABASE SECURITY REMEDIATION
-- Migration: 00003_phase3b_security_remediation.sql
--
-- PURPOSE:
-- 1. [DEFENSIVE PRECONDITIONS] Verify schema data integrity (no discount_price >= price,
--    no orphaned inventory_movements) BEFORE executing any DDL or privilege alterations.
-- 2. [ORDER NUMBER & SEQUENCE HARDENING] Revoke direct sequence manipulation on
--    public.order_number_seq and direct execution of public.generate_order_number()
--    from anon and authenticated roles. Retain access strictly for service_role.
-- 3. [CUSTOMER ORDER PRIVACY] Revoke table-level access on public.orders from client roles.
--    Grant SELECT on safe customer columns to authenticated users, strictly omitting
--    admin_notes and order_token from client-side visibility.
-- 4. [LINE ITEMS & PURCHASE COST PROTECTION] Revoke table-level access on public.order_items
--    from client roles. Grant SELECT on safe line item columns to authenticated users,
--    strictly omitting confidential wholesale purchase_cost.
-- 5. [PAYMENTS & AUDIT ISOLATION] Revoke all table-level privileges on public.payments and
--    public.inventory_movements from anon and authenticated roles.
-- 6. [PROFILES PRIVILEGE MINIMIZATION] Revoke direct client write access on public.profiles.
--    Grant SELECT and restricted UPDATE (full_name, phone1, phone2, avatar_url, updated_at)
--    to authenticated users. Protect account_status, id, and email via existing triggers.
-- 7. [STORE SETTINGS & PRODUCTS HARDENING] Revoke write access on public.products and
--    public.store_settings. Harden store_settings RLS policy to public setting keys only.
-- 8. [CATALOG HARMONIZATION (PHASE 2B IDEMPOTENCY)] Recreate public_product_variants view
--    with security_invoker = true omitting stock_quantity and low_stock_threshold;
--    enforce discount_price < price constraint and inventory movements ON DELETE RESTRICT;
--    ensure atomic adjust_variant_stock() stored procedure is restricted to service_role.
--
-- EXECUTION STATUS: DRAFTED FOR REVIEW ONLY (PREPARED FOR CONTROLLED ROLLOUT)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. MIGRATION PRECONDITIONS (ABORT SAFELY BEFORE ANY PRIVILEGE OR DDL CHANGES)
-- ------------------------------------------------------------------------------

DO $$
DECLARE
  v_violating_count INT;
  v_orphan_count INT;
BEGIN
  -- Precondition 1: Verify no product variants violate discount_price < price
  SELECT COUNT(*)
  INTO v_violating_count
  FROM public.product_variants
  WHERE discount_price IS NOT NULL AND discount_price >= price;

  IF v_violating_count > 0 THEN
    RAISE EXCEPTION 'Cannot apply migration 00003: % variant(s) have discount_price >= price. Manual data correction required prior to migration.', v_violating_count;
  END IF;

  -- Precondition 2: Verify no orphaned inventory movements exist
  SELECT COUNT(*)
  INTO v_orphan_count
  FROM public.inventory_movements im
  WHERE NOT EXISTS (
    SELECT 1 FROM public.product_variants pv WHERE pv.id = im.variant_id
  );

  IF v_orphan_count > 0 THEN
    RAISE EXCEPTION 'Cannot apply migration 00003: % orphaned inventory movement(s) found without matching variants.', v_orphan_count;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. ORDER NUMBER GENERATOR & SEQUENCE HARDENING
-- ------------------------------------------------------------------------------

-- Ensure function is SECURITY DEFINER with fixed search path
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TEXT AS $$
DECLARE
  today_str TEXT;
  seq_val INT;
BEGIN
  today_str := to_char(NOW(), 'YYYYMMDD');
  seq_val := nextval('public.order_number_seq');
  RETURN 'SJ-' || today_str || '-' || lpad(seq_val::text, 4, '0');
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp;

ALTER FUNCTION public.generate_order_number() OWNER TO postgres;

-- Revoke direct execution of order number generator from public client roles
REVOKE ALL ON FUNCTION public.generate_order_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_order_number() TO service_role;

-- Revoke direct access to sequence from public client roles
REVOKE ALL ON SEQUENCE public.order_number_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.order_number_seq TO service_role;

-- ------------------------------------------------------------------------------
-- 3. CUSTOMER ORDERS TABLE PRIVILEGE HARDENING
-- ------------------------------------------------------------------------------

-- Reset all table-level permissions on public.orders for client roles
REVOKE ALL ON public.orders FROM PUBLIC, anon, authenticated;

-- Grant SELECT only on customer-safe columns to authenticated users
-- Strictly omits: admin_notes (internal staff) and order_token (guest lookup secret)
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

-- Service role retains full administrative access for checkout and back-office
GRANT ALL ON public.orders TO service_role;

-- ------------------------------------------------------------------------------
-- 4. ORDER ITEMS TABLE PRIVILEGE HARDENING
-- ------------------------------------------------------------------------------

-- Reset all table-level permissions on public.order_items for client roles
REVOKE ALL ON public.order_items FROM PUBLIC, anon, authenticated;

-- Grant SELECT only on safe line item columns to authenticated users
-- Strictly omits: purchase_cost (confidential wholesale price)
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

-- Service role retains full administrative access for checkout order creation
GRANT ALL ON public.order_items TO service_role;

-- ------------------------------------------------------------------------------
-- 5. PAYMENTS & INVENTORY MOVEMENTS TABLE ISOLATION
-- ------------------------------------------------------------------------------

REVOKE ALL ON public.payments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.payments TO service_role;

REVOKE ALL ON public.inventory_movements FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.inventory_movements TO service_role;

-- ------------------------------------------------------------------------------
-- 6. PROFILES PRIVILEGE MINIMIZATION & FIELD PROTECTION
-- ------------------------------------------------------------------------------

-- Reset table-level permissions on public.profiles
REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;

-- Authenticated users can read profiles (scoped by RLS to own profile)
GRANT SELECT ON public.profiles TO authenticated;

-- Authenticated users can update ONLY permitted customer contact fields
GRANT UPDATE (
  full_name,
  phone1,
  phone2,
  avatar_url,
  updated_at
) ON public.profiles TO authenticated;

-- Service role retains full administrative access
GRANT ALL ON public.profiles TO service_role;

-- Ensure profile tamper protection trigger function is hardened
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.account_status := OLD.account_status;
    NEW.id := OLD.id;
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ------------------------------------------------------------------------------
-- 7. PRODUCTS & STORE SETTINGS READ-ONLY ACCESS
-- ------------------------------------------------------------------------------

REVOKE ALL ON public.products FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;

REVOKE ALL ON public.store_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.store_settings TO anon, authenticated;
GRANT ALL ON public.store_settings TO service_role;

-- Harden public store settings RLS policy to explicitly public keys
DROP POLICY IF EXISTS "Public view store settings" ON public.store_settings;
CREATE POLICY "Public view store settings" ON public.store_settings
  FOR SELECT USING (
    key IN ('general', 'contact', 'delivery', 'shipping', 'social', 'store_info')
    OR public.is_admin()
  );

-- ------------------------------------------------------------------------------
-- 8. PRODUCT VARIANTS & CATALOG VIEW HARMONIZATION
-- ------------------------------------------------------------------------------

-- Explicitly revoke column-level SELECT on sensitive inventory columns
REVOKE SELECT (
  id,
  product_id,
  sku,
  title,
  attributes,
  price,
  discount_price,
  purchase_cost,
  stock_quantity,
  low_stock_threshold,
  stock_status,
  is_active,
  created_at,
  updated_at
) ON public.product_variants FROM PUBLIC, anon, authenticated;

REVOKE ALL ON public.product_variants FROM PUBLIC, anon, authenticated;

-- Grant SELECT only on customer-safe variant columns
GRANT SELECT (
  id,
  product_id,
  sku,
  title,
  attributes,
  price,
  discount_price,
  stock_status,
  is_active,
  created_at,
  updated_at
) ON public.product_variants TO anon, authenticated;

GRANT ALL ON public.product_variants TO service_role;

-- Recreate customer-safe public_product_variants view omitting raw stock quantities
DROP VIEW IF EXISTS public.public_product_variants;

CREATE VIEW public.public_product_variants
WITH (security_invoker = true) AS
SELECT
  id,
  product_id,
  sku,
  title,
  attributes,
  price,
  discount_price,
  stock_status,
  is_active,
  created_at,
  updated_at
FROM public.product_variants
WHERE is_active = TRUE;

REVOKE ALL ON public.public_product_variants FROM PUBLIC;
GRANT SELECT ON public.public_product_variants TO anon, authenticated, service_role;

-- Ensure discount price CHECK constraint
ALTER TABLE public.product_variants
  DROP CONSTRAINT IF EXISTS chk_discount_price_valid;

ALTER TABLE public.product_variants
  ADD CONSTRAINT chk_discount_price_valid
  CHECK (discount_price IS NULL OR discount_price < price);

-- Ensure inventory movements foreign key ON DELETE RESTRICT
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_variant_id_fkey;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_variant_id_fkey
  FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;

-- Ensure atomic adjust_variant_stock stored procedure is strictly service_role only
CREATE OR REPLACE FUNCTION public.adjust_variant_stock(
  p_variant_id UUID,
  p_quantity_change INT,
  p_reason TEXT,
  p_reference_id TEXT DEFAULT NULL,
  p_admin_id UUID DEFAULT NULL
)
RETURNS TABLE (
  variant_id UUID,
  product_id UUID,
  previous_quantity INT,
  new_quantity INT,
  new_stock_status TEXT
) AS $$
DECLARE
  v_product_id UUID;
  v_current_qty INT;
  v_threshold INT;
  v_new_qty INT;
  v_status TEXT;
BEGIN
  IF p_variant_id IS NULL THEN
    RAISE EXCEPTION 'Variant ID is required.';
  END IF;

  IF p_quantity_change IS NULL OR p_quantity_change = 0 THEN
    RAISE EXCEPTION 'Quantity change cannot be zero or null.';
  END IF;

  IF p_reason IS NULL OR p_reason NOT IN ('stock_added', 'manual_adjustment', 'order_sold', 'order_cancelled_restock', 'correction') THEN
    RAISE EXCEPTION 'Invalid inventory adjustment reason: "%".', p_reason;
  END IF;

  IF p_reason IN ('stock_added', 'manual_adjustment', 'correction') THEN
    IF p_admin_id IS NULL THEN
      RAISE EXCEPTION 'An active administrator ID is required for manual stock adjustments.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE id = p_admin_id AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Invalid or inactive administrator ID: %', p_admin_id;
    END IF;
  END IF;

  SELECT pv.product_id, pv.stock_quantity, pv.low_stock_threshold
  INTO v_product_id, v_current_qty, v_threshold
  FROM public.product_variants pv
  WHERE pv.id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product variant not found: %', p_variant_id;
  END IF;

  v_new_qty := v_current_qty + p_quantity_change;

  IF v_new_qty < 0 THEN
    RAISE EXCEPTION 'Adjustment would result in negative stock. Current: %, Requested: %', v_current_qty, p_quantity_change;
  END IF;

  IF v_new_qty = 0 THEN
    v_status := 'out_of_stock';
  ELSIF v_new_qty <= v_threshold THEN
    v_status := 'low_stock';
  ELSE
    v_status := 'in_stock';
  END IF;

  UPDATE public.product_variants
  SET
    stock_quantity = v_new_qty,
    stock_status = v_status,
    updated_at = NOW()
  WHERE id = p_variant_id;

  INSERT INTO public.inventory_movements (
    variant_id,
    quantity_change,
    previous_quantity,
    new_quantity,
    reason,
    reference_id,
    created_by
  ) VALUES (
    p_variant_id,
    p_quantity_change,
    v_current_qty,
    v_new_qty,
    p_reason,
    NULLIF(TRIM(p_reference_id), ''),
    p_admin_id
  );

  RETURN QUERY SELECT p_variant_id, v_product_id, v_current_qty, v_new_qty, v_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

ALTER FUNCTION public.adjust_variant_stock(UUID, INT, TEXT, TEXT, UUID) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.adjust_variant_stock(UUID, INT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_variant_stock(UUID, INT, TEXT, TEXT, UUID) TO service_role;

-- ------------------------------------------------------------------------------
-- 9. ATOMIC ORDER CHECKOUT TRANSACTIONAL PROCEDURE
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_order_checkout(
  p_order_data JSONB,
  p_items_data JSONB,
  p_coupon_code TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_customer_name TEXT;
  v_phone1 TEXT;
  v_address_line TEXT;
  v_district TEXT;
  v_delivery_fee NUMERIC(12, 2);
  v_payment_method TEXT;
  v_email TEXT;
  v_phone2 TEXT;
  v_city TEXT;
  v_province TEXT;
  v_postal_code TEXT;
  v_delivery_notes TEXT;
  
  v_subtotal NUMERIC(12, 2) := 0;
  v_discount_amount NUMERIC(12, 2) := 0;
  v_total_amount NUMERIC(12, 2);
  v_coupon_id UUID := NULL;
  
  v_order_id UUID;
  v_order_number TEXT;
  v_order_token UUID;
  
  v_item JSONB;
  v_variant_id UUID;
  v_quantity INT;
  v_variant RECORD;
  v_item_price NUMERIC(12, 2);
  v_item_total NUMERIC(12, 2);
  v_new_qty INT;
  v_stock_status TEXT;
  
  v_coupon RECORD;
  v_usage_count INT;
BEGIN
  -- Extract and validate required order fields
  v_customer_name := TRIM(p_order_data->>'customer_name');
  v_phone1 := TRIM(p_order_data->>'phone1');
  v_address_line := TRIM(p_order_data->>'address_line');
  v_district := TRIM(p_order_data->>'district');
  v_payment_method := TRIM(p_order_data->>'payment_method');
  v_delivery_fee := COALESCE((p_order_data->>'delivery_fee')::NUMERIC, 0);

  IF v_customer_name IS NULL OR v_customer_name = '' THEN
    RAISE EXCEPTION 'Customer name is required.';
  END IF;
  IF v_phone1 IS NULL OR v_phone1 = '' THEN
    RAISE EXCEPTION 'Primary phone is required.';
  END IF;
  IF v_address_line IS NULL OR v_address_line = '' THEN
    RAISE EXCEPTION 'Address is required.';
  END IF;
  IF v_district IS NULL OR v_district = '' THEN
    RAISE EXCEPTION 'District is required.';
  END IF;
  IF v_payment_method NOT IN ('cod', 'bank_transfer') THEN
    RAISE EXCEPTION 'Invalid payment method: %', v_payment_method;
  END IF;

  IF p_order_data->>'user_id' IS NOT NULL AND TRIM(p_order_data->>'user_id') <> '' THEN
    v_user_id := (p_order_data->>'user_id')::UUID;
  END IF;
  v_email := NULLIF(TRIM(p_order_data->>'email'), '');
  v_phone2 := NULLIF(TRIM(p_order_data->>'phone2'), '');
  v_city := NULLIF(TRIM(p_order_data->>'city'), '');
  v_province := NULLIF(TRIM(p_order_data->>'province'), '');
  v_postal_code := NULLIF(TRIM(p_order_data->>'postal_code'), '');
  v_delivery_notes := NULLIF(TRIM(p_order_data->>'delivery_notes'), '');

  IF jsonb_array_length(p_items_data) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item.';
  END IF;

  -- 1. Lock and validate each variant and compute subtotal
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_data)
  LOOP
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_quantity := (v_item->>'quantity')::INT;

    IF v_quantity IS NULL OR v_quantity < 1 THEN
      RAISE EXCEPTION 'Item quantity must be at least 1.';
    END IF;

    SELECT pv.id, pv.product_id, pv.sku, pv.title, pv.price, pv.discount_price,
           pv.purchase_cost, pv.stock_quantity, pv.low_stock_threshold, pv.is_active,
           p.name AS product_name
    INTO v_variant
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = v_variant_id
    FOR UPDATE OF pv;

    IF NOT FOUND OR NOT v_variant.is_active THEN
      RAISE EXCEPTION 'Item variant % is unavailable or not found.', v_variant_id;
    END IF;

    IF v_variant.stock_quantity < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for "%". Only % available.', v_variant.title, v_variant.stock_quantity;
    END IF;

    v_item_price := COALESCE(v_variant.discount_price, v_variant.price);
    v_subtotal := v_subtotal + (v_item_price * v_quantity);
  END LOOP;

  -- 2. Process coupon if provided
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
      RAISE EXCEPTION 'This coupon is no longer active.';
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

    IF v_coupon.total_usage_limit IS NOT NULL AND v_coupon.total_usage_limit > 0 THEN
      SELECT COUNT(*)
      INTO v_usage_count
      FROM public.coupon_usage
      WHERE coupon_id = v_coupon.id;

      IF v_usage_count >= v_coupon.total_usage_limit THEN
        RAISE EXCEPTION 'This coupon has reached its maximum usage limit.';
      END IF;
    END IF;

    -- Calculate discount
    IF v_coupon.discount_type = 'percentage' THEN
      v_discount_amount := (v_subtotal * v_coupon.discount_value) / 100.0;
      IF v_coupon.max_discount_amount IS NOT NULL AND v_discount_amount > v_coupon.max_discount_amount THEN
        v_discount_amount := v_coupon.max_discount_amount;
      END IF;
    ELSE
      v_discount_amount := LEAST(v_coupon.discount_value, v_subtotal);
    END IF;

    v_discount_amount := ROUND(v_discount_amount, 2);
    v_coupon_id := v_coupon.id;
  END IF;

  v_total_amount := v_subtotal - v_discount_amount + v_delivery_fee;

  -- 3. Insert order
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
    order_status
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
    CASE WHEN v_coupon_id IS NOT NULL THEN UPPER(TRIM(p_coupon_code)) ELSE NULL END,
    v_total_amount,
    v_payment_method,
    'pending',
    'pending'
  )
  RETURNING id, order_number, order_token INTO v_order_id, v_order_number, v_order_token;

  -- 4. Deduct inventory and insert line items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_data)
  LOOP
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_quantity := (v_item->>'quantity')::INT;

    SELECT pv.id, pv.product_id, pv.sku, pv.title, pv.price, pv.discount_price,
           pv.purchase_cost, pv.stock_quantity, pv.low_stock_threshold,
           p.name AS product_name
    INTO v_variant
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = v_variant_id;

    v_item_price := COALESCE(v_variant.discount_price, v_variant.price);
    v_item_total := v_item_price * v_quantity;
    v_new_qty := v_variant.stock_quantity - v_quantity;

    IF v_new_qty = 0 THEN
      v_stock_status := 'out_of_stock';
    ELSIF v_new_qty <= v_variant.low_stock_threshold THEN
      v_stock_status := 'low_stock';
    ELSE
      v_stock_status := 'in_stock';
    END IF;

    -- Update variant stock atomically
    UPDATE public.product_variants
    SET
      stock_quantity = v_new_qty,
      stock_status = v_stock_status,
      updated_at = NOW()
    WHERE id = v_variant_id;

    -- Insert order item
    INSERT INTO public.order_items (
      order_id,
      product_id,
      variant_id,
      product_name,
      variant_title,
      sku,
      unit_price,
      quantity,
      total_price,
      purchase_cost
    ) VALUES (
      v_order_id,
      v_variant.product_id,
      v_variant_id,
      v_variant.product_name,
      v_variant.title,
      v_variant.sku,
      v_item_price,
      v_quantity,
      v_item_total,
      COALESCE(v_variant.purchase_cost, 0)
    );

    -- Record inventory movement
    INSERT INTO public.inventory_movements (
      variant_id,
      quantity_change,
      previous_quantity,
      new_quantity,
      reason,
      reference_id,
      created_by
    ) VALUES (
      v_variant_id,
      -v_quantity,
      v_variant.stock_quantity,
      v_new_qty,
      'order_sold',
      v_order_number,
      NULL
    );
  END LOOP;

  -- 5. Record initial order status history
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

  -- 6. Record coupon usage if coupon was applied
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

  -- 7. Record payment record if bank transfer
  IF v_payment_method = 'bank_transfer' THEN
    INSERT INTO public.payments (
      order_id,
      payment_method,
      amount,
      status,
      notes
    ) VALUES (
      v_order_id,
      'bank_transfer',
      v_total_amount,
      'pending',
      'Awaiting customer WhatsApp payment confirmation and manual admin verification'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'order_token', v_order_token
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

ALTER FUNCTION public.process_order_checkout(JSONB, JSONB, TEXT) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.process_order_checkout(JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_order_checkout(JSONB, JSONB, TEXT) TO service_role;

