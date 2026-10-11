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

  IF p_reason IS NULL OR p_reason NOT IN ('stock_added', 'manual_adjustment', 'correction') THEN
    RAISE EXCEPTION 'Invalid inventory adjustment reason: "%". Only manual adjustments are permitted.', p_reason;
  END IF;

  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'An active administrator ID is required for manual stock adjustments.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = p_admin_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Invalid or inactive administrator ID: %', p_admin_id;
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
