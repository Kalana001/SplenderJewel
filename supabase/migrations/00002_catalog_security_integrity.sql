-- ==============================================================================
-- SPLENDER JEWEL — PHASE 2B CATALOG SECURITY & INTEGRITY MIGRATION
-- Migration: 00002_catalog_security_integrity.sql
--
-- PURPOSE:
-- 1. [DEFENSIVE PRECONDITIONS] Verify schema data integrity (no discount_price >= price,
--    no orphaned inventory_movements) BEFORE executing any DDL or privilege alterations.
-- 2. [SEC-CAT-01 / SEC-REV-01] Explicitly revoke all column-level privileges on public.product_variants
--    from anon, authenticated, and PUBLIC, reset table permissions, regrant ONLY customer-safe
--    columns, and recreate public_product_variants view with security_invoker = true.
-- 3. [SEC-CAT-04] Enforce discount_price < price CHECK constraint on product_variants.
-- 4. [SEC-CAT-03] Change inventory_movements.variant_id foreign key from ON DELETE CASCADE
--    to ON DELETE RESTRICT to preserve historical audit logs.
-- 5. [SEC-CAT-02 / SEC-REV-02] Create atomic stored procedure adjust_variant_stock() with
--    FOR UPDATE row-level locking, admin identity verification, and transactional movement auditing,
--    restricted strictly to manual catalog adjustments ('stock_added', 'manual_adjustment', 'correction').
--
-- EXECUTION STATUS: DRAFTED FOR REVIEW ONLY (NOT YET APPLIED TO LIVE DATABASE)
--
-- TRANSACTION NOTE:
-- In Supabase CLI migrations, each migration script executes inside an implicit transaction.
-- If applying manually via psql or the Supabase SQL Editor, wrap this script in BEGIN; ... COMMIT;
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. MIGRATION PRECONDITIONS (ABORT SAFELY BEFORE ANY DDL OR PRIVILEGE CHANGES)
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
    RAISE EXCEPTION 'Cannot apply migration 00002: % variant(s) have discount_price >= price. Manual data correction required prior to migration.', v_violating_count;
  END IF;

  -- Precondition 2: Verify no orphaned inventory movements exist
  SELECT COUNT(*)
  INTO v_orphan_count
  FROM public.inventory_movements im
  WHERE NOT EXISTS (
    SELECT 1 FROM public.product_variants pv WHERE pv.id = im.variant_id
  );

  IF v_orphan_count > 0 THEN
    RAISE EXCEPTION 'Cannot apply migration 00002: % orphaned inventory movement(s) found without matching variants. Manual audit resolution required prior to migration.', v_orphan_count;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. SEC-CAT-01 / SEC-REV-01: REVOKE PUBLIC ACCESS TO STOCK QUANTITIES AND THRESHOLDS
-- ------------------------------------------------------------------------------

-- Explicitly revoke ALL previously granted column-level SELECT privileges on public.product_variants
-- from public roles (anon, authenticated, PUBLIC) across all 14 table columns.
-- In PostgreSQL, table-level REVOKE does not remove independent column-level grants;
-- explicit column-level revocation guarantees no residual or inherited column access persists.
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
) ON public.product_variants FROM anon, authenticated, PUBLIC;

-- Fully reset table-level permissions on product_variants for public roles
REVOKE ALL ON public.product_variants FROM anon, authenticated, PUBLIC;

-- Grant ONLY customer-safe columns to anon and authenticated
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

-- Service role retains necessary operational privileges (least privilege: avoid ALL)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO service_role;

-- Recreate public_product_variants view without raw stock columns
-- (DROP VIEW required in PostgreSQL because columns cannot be dropped via CREATE OR REPLACE VIEW)
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

-- Revoke default PUBLIC privileges and grant safe SELECT access
REVOKE ALL ON public.public_product_variants FROM PUBLIC;
GRANT SELECT ON public.public_product_variants TO anon, authenticated, service_role;

COMMENT ON VIEW public.public_product_variants IS 'Customer-safe product variants view: omits purchase_cost, stock_quantity, and low_stock_threshold.';

-- ------------------------------------------------------------------------------
-- 3. SEC-CAT-04: DISCOUNT PRICE CONSTRAINT (discount_price < price)
-- ------------------------------------------------------------------------------

ALTER TABLE public.product_variants
  DROP CONSTRAINT IF EXISTS chk_discount_price_valid;

ALTER TABLE public.product_variants
  ADD CONSTRAINT chk_discount_price_valid
  CHECK (discount_price IS NULL OR discount_price < price);

COMMENT ON CONSTRAINT chk_discount_price_valid ON public.product_variants IS 'Enforces that discount price must be strictly less than the regular selling price.';

-- ------------------------------------------------------------------------------
-- 4. SEC-CAT-03: PRESERVE INVENTORY MOVEMENTS AUDIT HISTORY
-- ------------------------------------------------------------------------------

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_variant_id_fkey;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_variant_id_fkey
  FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;

COMMENT ON CONSTRAINT inventory_movements_variant_id_fkey ON public.inventory_movements IS 'Restricts variant deletion if historical inventory audit movements exist.';

-- ------------------------------------------------------------------------------
-- 5. SEC-CAT-02 / SEC-REV-02: ATOMIC INVENTORY ADJUSTMENT STORED PROCEDURE
-- ------------------------------------------------------------------------------

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
  -- 1. Input validation
  IF p_variant_id IS NULL THEN
    RAISE EXCEPTION 'Variant ID is required.';
  END IF;

  IF p_quantity_change IS NULL OR p_quantity_change = 0 THEN
    RAISE EXCEPTION 'Quantity change cannot be zero or null.';
  END IF;

  -- 2. Scope & reason validation
  -- ARCHITECTURAL BOUNDARY & DESIGN SPECIFICATION:
  -- This procedure is strictly scoped to manual administrative inventory adjustments ('stock_added', 'manual_adjustment', 'correction').
  -- Order-related reasons ('order_sold', 'order_cancelled_restock') are intentionally excluded from this procedure.
  -- E-commerce order inventory adjustments require full transactional verification of the order record, line items, and quantities
  -- (e.g. via a dedicated order fulfillment function in a subsequent phase).
  -- Every manual adjustment strictly requires p_admin_id matching an active administrator in public.admin_users.
  IF p_reason IS NULL OR p_reason NOT IN ('stock_added', 'manual_adjustment', 'correction') THEN
    RAISE EXCEPTION 'Invalid inventory adjustment reason: "%". Only manual adjustment reasons ("stock_added", "manual_adjustment", "correction") are accepted by this procedure.', p_reason;
  END IF;

  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'An active administrator ID is required for manual stock adjustments (reason: %).', p_reason;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = p_admin_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Invalid or inactive administrator ID: %', p_admin_id;
  END IF;

  -- 3. Row-level lock on variant to prevent concurrent race conditions
  SELECT pv.product_id, pv.stock_quantity, pv.low_stock_threshold
  INTO v_product_id, v_current_qty, v_threshold
  FROM public.product_variants pv
  WHERE pv.id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product variant not found: %', p_variant_id;
  END IF;

  -- 4. Compute new quantity and prevent negative stock
  v_new_qty := v_current_qty + p_quantity_change;

  IF v_new_qty < 0 THEN
    RAISE EXCEPTION 'Adjustment would result in negative stock. Current: %, Requested change: %', v_current_qty, p_quantity_change;
  END IF;

  -- 5. Determine deterministic stock status
  IF v_new_qty = 0 THEN
    v_status := 'out_of_stock';
  ELSIF v_new_qty <= v_threshold THEN
    v_status := 'low_stock';
  ELSE
    v_status := 'in_stock';
  END IF;

  -- 6. Update variant stock and status
  UPDATE public.product_variants
  SET
    stock_quantity = v_new_qty,
    stock_status = v_status,
    updated_at = NOW()
  WHERE id = p_variant_id;

  -- 7. Insert audit movement record in same transaction
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

  -- 8. Return atomic result
  RETURN QUERY SELECT p_variant_id, v_product_id, v_current_qty, v_new_qty, v_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Explicitly establish intended function owner
ALTER FUNCTION public.adjust_variant_stock(UUID, INT, TEXT, TEXT, UUID) OWNER TO postgres;

-- Restrict function execution: Only trusted service_role (invoked via server actions) can call this
REVOKE ALL ON FUNCTION public.adjust_variant_stock(UUID, INT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_variant_stock(UUID, INT, TEXT, TEXT, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_variant_stock(UUID, INT, TEXT, TEXT, UUID) TO service_role;

COMMENT ON FUNCTION public.adjust_variant_stock(UUID, INT, TEXT, TEXT, UUID) IS 'Atomic variant inventory adjustment with row-level locking (FOR UPDATE), administrator validation, and transactional movement audit logging.';
