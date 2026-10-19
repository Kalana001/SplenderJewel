-- ==============================================================================
-- SPLENDER JEWEL — MIGRATION 00011: DURABLE CART IDEMPOTENCY & ATOMIC MUTATIONS
-- ==============================================================================
-- Purpose:
-- 1. Create public.cart_idempotency_records table to durably store idempotency tokens
--    for guest cart merges and checkout order deductions.
--    Eliminates reliance on process-local memory (which fails across Vercel serverless
--    instances, cold starts, and container restarts).
-- 2. Provide public.deduct_purchased_cart_items(UUID, TEXT) procedure:
--    - Single-transaction atomic execution with pg_advisory_xact_lock.
--    - Authoritatively derives purchased variant IDs and quantities from persisted public.order_items.
--    - Never trusts client-supplied purchased variant IDs or quantities.
--    - Verifies order belongs to the authenticated user (orders.user_id = p_user_id) to prevent cross-account attacks.
--    - Preserves unpurchased surplus quantities added concurrently from other devices.
--    - Idempotent: duplicate calls for the same (user_id, order_number) return immediately
--      with already_processed = true without over-decrementing cart items.
-- 3. Provide public.merge_guest_cart(UUID, JSONB, TEXT) procedure:
--    - Single-transaction atomic execution with pg_advisory_xact_lock.
--    - Combines guest items with existing authenticated cart up to live available inventory.
--    - Idempotent: repeated calls with the same merge_token return existing cart items
--      without inflating quantities.
-- 4. Enforce strict least-privilege security:
--    - cart_idempotency_records has RLS enabled (auth.uid() = user_id).
--    - Stored procedures are SECURITY DEFINER with search_path = public, pg_temp.
--    - EXECUTE granted strictly to service_role (invoked via trusted Next.js server actions).
-- ==============================================================================

-- ── 1. Create public.cart_idempotency_records ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cart_idempotency_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('guest_merge', 'checkout_deduction')),
  operation_key TEXT NOT NULL CHECK (char_length(operation_key) >= 8 AND char_length(operation_key) <= 255),
  payload JSONB DEFAULT '{}'::jsonb NOT NULL,
  response JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT uq_cart_idempotency UNIQUE (user_id, operation_type, operation_key)
);

CREATE INDEX IF NOT EXISTS idx_cart_idempotency_lookup
  ON public.cart_idempotency_records(user_id, operation_type, operation_key);

-- Row Level Security (Defense-in-depth)
ALTER TABLE public.cart_idempotency_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own idempotency records" ON public.cart_idempotency_records;
CREATE POLICY "Users view own idempotency records" ON public.cart_idempotency_records
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own idempotency records" ON public.cart_idempotency_records;
CREATE POLICY "Users insert own idempotency records" ON public.cart_idempotency_records
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Privilege Grants: strictly service_role only
REVOKE ALL ON public.cart_idempotency_records FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cart_idempotency_records TO service_role;

-- ── 2. Atomic Checkout Cart Items Deduction Procedure ─────────────────────────
CREATE OR REPLACE FUNCTION public.deduct_purchased_cart_items(
  p_user_id UUID,
  p_order_number TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trimmed_order TEXT;
  v_order_record RECORD;
  v_cart_id UUID;
  v_item RECORD;
  v_item_id UUID;
  v_current_qty INT;
  v_existing_record RECORD;
BEGIN
  -- 0. Input Validations
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User identifier is required for cart deduction.';
  END IF;

  v_trimmed_order := NULLIF(TRIM(p_order_number), '');
  IF v_trimmed_order IS NULL OR char_length(v_trimmed_order) < 8 OR char_length(v_trimmed_order) > 128 THEN
    RAISE EXCEPTION 'Order identifier is required and must be between 8 and 128 characters.';
  END IF;

  -- 1. Advisory Lock to Serialize Concurrent Calls for the Same User & Order
  PERFORM pg_advisory_xact_lock(hashtext('splender_cart_deduct:' || p_user_id::text || ':' || v_trimmed_order));

  -- 2. Durable Idempotency Check
  SELECT id, response INTO v_existing_record
  FROM public.cart_idempotency_records
  WHERE user_id = p_user_id
    AND operation_type = 'checkout_deduction'
    AND operation_key = v_trimmed_order;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'message', 'Cart deduction has already been processed for this order.'
    );
  END IF;

  -- 3. Verify Referenced Order and Enforce Customer Ownership
  SELECT id, user_id INTO v_order_record
  FROM public.orders
  WHERE order_number = v_trimmed_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', v_trimmed_order;
  END IF;

  IF v_order_record.user_id IS NULL OR v_order_record.user_id <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: order does not belong to the authenticated user.';
  END IF;

  -- 4. Lock Customer Cart
  SELECT id INTO v_cart_id
  FROM public.carts
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_cart_id IS NULL THEN
    -- Cart already emptied or deleted: record idempotency and return success
    INSERT INTO public.cart_idempotency_records (user_id, operation_type, operation_key, response)
    VALUES (
      p_user_id,
      'checkout_deduction',
      v_trimmed_order,
      jsonb_build_object('success', true, 'order_id', v_order_record.id, 'cart_found', false, 'deducted_at', NOW())
    );

    RETURN jsonb_build_object('success', true, 'already_processed', false);
  END IF;

  -- 5. Authoritatively Derive Purchased Variants and Quantities from Persisted order_items
  FOR v_item IN
    SELECT variant_id, SUM(quantity)::int AS purchased_qty
    FROM public.order_items
    WHERE order_id = v_order_record.id
    GROUP BY variant_id
  LOOP
    IF v_item.variant_id IS NOT NULL AND v_item.purchased_qty IS NOT NULL AND v_item.purchased_qty > 0 THEN
      -- Lock the specific cart item row
      SELECT id, quantity INTO v_item_id, v_current_qty
      FROM public.cart_items
      WHERE cart_id = v_cart_id AND variant_id = v_item.variant_id
      FOR UPDATE;

      IF FOUND THEN
        IF v_current_qty <= v_item.purchased_qty THEN
          -- Entire quantity was purchased: remove row
          DELETE FROM public.cart_items WHERE id = v_item_id;
        ELSE
          -- Concurrent surplus: decrement quantity and preserve remaining units
          UPDATE public.cart_items
          SET quantity = v_current_qty - v_item.purchased_qty,
              updated_at = NOW()
          WHERE id = v_item_id;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Update cart timestamp
  UPDATE public.carts
  SET updated_at = NOW()
  WHERE id = v_cart_id;

  -- 6. Record Durable Idempotency Record
  INSERT INTO public.cart_idempotency_records (user_id, operation_type, operation_key, response)
  VALUES (
    p_user_id,
    'checkout_deduction',
    v_trimmed_order,
    jsonb_build_object('success', true, 'order_id', v_order_record.id, 'cart_found', true, 'deducted_at', NOW())
  );

  RETURN jsonb_build_object('success', true, 'already_processed', false);
END;
$$;

ALTER FUNCTION public.deduct_purchased_cart_items(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.deduct_purchased_cart_items(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_purchased_cart_items(UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.deduct_purchased_cart_items(UUID, TEXT) IS
  'Atomic, single-transaction cart item deduction procedure with authoritative order_items derivation, customer ownership verification, advisory lock idempotency, and surplus protection.';

-- ── 3. Atomic Guest Cart Merging Procedure ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.merge_guest_cart(
  p_user_id UUID,
  p_guest_items JSONB,
  p_merge_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trimmed_token TEXT;
  v_cart_id UUID;
  v_item RECORD;
  v_variant_id UUID;
  v_guest_qty_bigint BIGINT;
  v_stock_qty INT;
  v_stock_status TEXT;
  v_clamped_insert_qty INT;
  v_existing_record RECORD;
BEGIN
  -- 0. Input Validations
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User identifier is required for guest cart merge.';
  END IF;

  v_trimmed_token := NULLIF(TRIM(p_merge_token), '');
  IF v_trimmed_token IS NULL OR char_length(v_trimmed_token) < 8 OR char_length(v_trimmed_token) > 255 THEN
    RAISE EXCEPTION 'Merge token is required and must be between 8 and 255 characters.';
  END IF;

  IF p_guest_items IS NULL OR jsonb_typeof(p_guest_items) <> 'array' THEN
    RAISE EXCEPTION 'Guest items must be a valid JSON array.';
  END IF;

  -- 1. Advisory Lock to Serialize Concurrent Merges for the Same User & Token
  PERFORM pg_advisory_xact_lock(hashtext('splender_cart_merge:' || p_user_id::text || ':' || v_trimmed_token));

  -- 2. Durable Idempotency Check
  SELECT id, response INTO v_existing_record
  FROM public.cart_idempotency_records
  WHERE user_id = p_user_id
    AND operation_type = 'guest_merge'
    AND operation_key = v_trimmed_token;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'message', 'Guest cart merge has already been processed.'
    );
  END IF;

  -- 3. Ensure User Cart Exists and Lock It
  INSERT INTO public.carts (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
  RETURNING id INTO v_cart_id;

  SELECT id INTO v_cart_id
  FROM public.carts
  WHERE id = v_cart_id
  FOR UPDATE;

  -- 4. Process Guest Items with Live Inventory Clamping & BIGINT Integer Overflow Protection
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_guest_items) AS x(variant_id UUID, quantity BIGINT)
  LOOP
    v_variant_id := v_item.variant_id;
    v_guest_qty_bigint := v_item.quantity;

    -- Validate positive non-zero quantity
    IF v_variant_id IS NOT NULL AND v_guest_qty_bigint IS NOT NULL AND v_guest_qty_bigint > 0 THEN
      -- Verify variant is active, product is active, and retrieve live stock
      SELECT pv.stock_quantity, pv.stock_status INTO v_stock_qty, v_stock_status
      FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      WHERE pv.id = v_variant_id
        AND pv.is_active = true
        AND p.is_active = true;

      IF FOUND AND v_stock_status <> 'out_of_stock' AND v_stock_qty > 0 THEN
        -- Clamp incoming guest quantity to available stock before insertion or addition
        v_clamped_insert_qty := LEAST(v_guest_qty_bigint, v_stock_qty::BIGINT)::INT;

        -- Atomic upsert using native ON CONFLICT (cart_id, variant_id)
        -- Clamp existing and incoming quantities to available stock before adding them
        -- to prevent 64-bit BIGINT overflow (e.g. max BIGINT 9223372036854775807 + existing qty)
        -- and clamp the final sum to available stock before converting to integer.
        INSERT INTO public.cart_items (cart_id, variant_id, quantity, updated_at)
        VALUES (v_cart_id, v_variant_id, v_clamped_insert_qty, NOW())
        ON CONFLICT (cart_id, variant_id) DO UPDATE
        SET quantity = LEAST(
              LEAST(public.cart_items.quantity::BIGINT, v_stock_qty::BIGINT) +
              LEAST(v_guest_qty_bigint, v_stock_qty::BIGINT),
              v_stock_qty::BIGINT
            )::INT,
            updated_at = NOW();
      END IF;
    END IF;
  END LOOP;

  -- Update cart timestamp
  UPDATE public.carts
  SET updated_at = NOW()
  WHERE id = v_cart_id;

  -- 5. Record Durable Idempotency Record
  INSERT INTO public.cart_idempotency_records (user_id, operation_type, operation_key, response)
  VALUES (
    p_user_id,
    'guest_merge',
    v_trimmed_token,
    jsonb_build_object('success', true, 'merged_at', NOW())
  );

  RETURN jsonb_build_object('success', true, 'already_processed', false);
END;
$$;

ALTER FUNCTION public.merge_guest_cart(UUID, JSONB, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.merge_guest_cart(UUID, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_guest_cart(UUID, JSONB, TEXT) TO service_role;

COMMENT ON FUNCTION public.merge_guest_cart(UUID, JSONB, TEXT) IS
  'Atomic, single-transaction guest cart merge procedure with advisory lock idempotency and inventory clamping.';
