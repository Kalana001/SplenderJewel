-- ==============================================================================
-- SPLENDER JEWEL — FORWARD MIGRATION: ATOMIC CHECKOUT TRANSACTION PROCEDURE
-- Migration: 00004_atomic_checkout_procedure.sql
--
-- PURPOSE:
-- 1. [IDEMPOTENCY COLUMN] Adds optional idempotency_key to public.orders table
--    to prevent duplicate submissions or race conditions.
-- 2. [ATOMIC CHECKOUT RPC] Replaces and enhances public.process_order_checkout
--    to ensure 100% single-transaction execution:
--    - Row locks variants (FOR UPDATE OF pv) and coupon (FOR UPDATE)
--    - Aggregates duplicate variant items in p_items_data before stock checks
--    - Validates BOTH variant is_active AND parent product is_active
--    - Enforces authoritative delivery fee lookup directly from delivery_districts
--    - Enforces per_customer_limit coupon restriction when user_id is provided
--    - Atomically captures wholesale purchase_cost snapshot onto order_items
--    - Atomically logs inventory movements and updates stock_status
--    - Strictly restricted to service_role with immutable search_path
--
-- EXECUTION STATUS: PREPARED FOR APPLICANT (ZERO UNAPPROVED EXECUTION)
-- ==============================================================================

-- 1. Add idempotency_key column to orders if not exists
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

-- 2. Create or replace atomic process_order_checkout function
CREATE OR REPLACE FUNCTION public.process_order_checkout(
  p_order_data JSONB,
  p_items_data JSONB,
  p_coupon_code TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := NULL;
  v_customer_name TEXT;
  v_email TEXT;
  v_phone1 TEXT;
  v_phone2 TEXT;
  v_address_line TEXT;
  v_city TEXT;
  v_district TEXT;
  v_province TEXT;
  v_postal_code TEXT;
  v_delivery_notes TEXT;
  v_payment_method TEXT;
  v_idempotency_key TEXT;

  v_delivery_fee NUMERIC(12, 2) := 0;
  v_district_active BOOLEAN := FALSE;
  v_subtotal NUMERIC(12, 2) := 0;
  v_discount_amount NUMERIC(12, 2) := 0;
  v_total_amount NUMERIC(12, 2) := 0;

  v_item RECORD;
  v_variant RECORD;
  v_coupon RECORD;
  v_coupon_id UUID := NULL;
  v_usage_count INT := 0;
  v_user_usage_count INT := 0;

  v_item_price NUMERIC(12, 2);
  v_item_total NUMERIC(12, 2);
  v_new_qty INT;
  v_stock_status TEXT;

  v_order_id UUID;
  v_order_number TEXT;
  v_order_token UUID;
BEGIN
  -- Validate required order payload fields
  v_customer_name := TRIM(p_order_data->>'customer_name');
  v_phone1 := TRIM(p_order_data->>'phone1');
  v_address_line := TRIM(p_order_data->>'address_line');
  v_district := TRIM(p_order_data->>'district');
  v_payment_method := TRIM(p_order_data->>'payment_method');
  v_idempotency_key := NULLIF(TRIM(p_order_data->>'idempotency_key'), '');

  IF v_customer_name IS NULL OR v_customer_name = '' THEN
    RAISE EXCEPTION 'Customer full name is required.';
  END IF;
  IF v_phone1 IS NULL OR v_phone1 = '' THEN
    RAISE EXCEPTION 'Primary contact phone number is required.';
  END IF;
  IF v_address_line IS NULL OR v_address_line = '' THEN
    RAISE EXCEPTION 'Delivery address is required.';
  END IF;
  IF v_district IS NULL OR v_district = '' THEN
    RAISE EXCEPTION 'Delivery district is required.';
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

  -- 1. Idempotency Check: Return existing order if client token already processed
  IF v_idempotency_key IS NOT NULL THEN
    SELECT id, order_number, order_token
    INTO v_order_id, v_order_number, v_order_token
    FROM public.orders
    WHERE idempotency_key = v_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'order_token', v_order_token,
        'is_duplicate', true
      );
    END IF;
  END IF;

  -- 2. Authoritative Delivery Fee lookup from database
  SELECT delivery_fee, is_active
  INTO v_delivery_fee, v_district_active
  FROM public.delivery_districts
  WHERE name = v_district;

  IF NOT FOUND OR NOT v_district_active THEN
    RAISE EXCEPTION 'Delivery to district "%" is currently unavailable.', v_district;
  END IF;

  IF jsonb_array_length(p_items_data) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one jewelry item.';
  END IF;

  -- 3. Lock variants and compute subtotal (aggregating duplicate variant lines)
  FOR v_item IN
    SELECT
      (elem->>'variant_id')::UUID AS variant_id,
      SUM((elem->>'quantity')::INT)::INT AS quantity
    FROM jsonb_array_elements(p_items_data) elem
    GROUP BY (elem->>'variant_id')::UUID
  LOOP
    IF v_item.quantity IS NULL OR v_item.quantity < 1 THEN
      RAISE EXCEPTION 'Item quantity must be at least 1.';
    END IF;

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
      RAISE EXCEPTION 'Item variant % is unavailable or discontinued.', v_item.variant_id;
    END IF;

    IF v_variant.stock_quantity < v_item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for "%". Only % available.', v_variant.title, v_variant.stock_quantity;
    END IF;

    v_item_price := COALESCE(v_variant.discount_price, v_variant.price);
    v_subtotal := v_subtotal + (v_item_price * v_item.quantity);
  END LOOP;

  -- 4. Process coupon atomically if provided
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

    -- Per-customer usage limit check
    IF v_user_id IS NOT NULL AND v_coupon.per_customer_limit IS NOT NULL AND v_coupon.per_customer_limit > 0 THEN
      SELECT COUNT(*)
      INTO v_user_usage_count
      FROM public.coupon_usage
      WHERE coupon_id = v_coupon.id AND user_id = v_user_id;

      IF v_user_usage_count >= v_coupon.per_customer_limit THEN
        RAISE EXCEPTION 'You have reached the maximum allowed usage limit for this coupon.';
      END IF;
    END IF;

    -- Calculate verified discount amount
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

  v_total_amount := GREATEST(0, v_subtotal - v_discount_amount) + v_delivery_fee;

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
    CASE WHEN v_coupon_id IS NOT NULL THEN UPPER(TRIM(p_coupon_code)) ELSE NULL END,
    v_total_amount,
    v_payment_method,
    'pending',
    'pending',
    v_idempotency_key
  )
  RETURNING id, order_number, order_token INTO v_order_id, v_order_number, v_order_token;

  -- 6. Deduct inventory, record movements, and insert order items
  FOR v_item IN
    SELECT
      (elem->>'variant_id')::UUID AS variant_id,
      SUM((elem->>'quantity')::INT)::INT AS quantity
    FROM jsonb_array_elements(p_items_data) elem
    GROUP BY (elem->>'variant_id')::UUID
  LOOP
    SELECT
      pv.id, pv.product_id, pv.sku, pv.title, pv.price, pv.discount_price,
      pv.purchase_cost, pv.stock_quantity, pv.low_stock_threshold,
      p.name AS product_name
    INTO v_variant
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = v_item.variant_id;

    v_item_price := COALESCE(v_variant.discount_price, v_variant.price);
    v_item_total := v_item_price * v_item.quantity;
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

    -- Insert order item with wholesale cost snapshot
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
      v_item.variant_id,
      v_variant.product_name,
      v_variant.title,
      v_variant.sku,
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

  -- 9. Record payment tracking record if Bank Transfer
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

-- 3. Privilege isolation
ALTER FUNCTION public.process_order_checkout(JSONB, JSONB, TEXT) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.process_order_checkout(JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_order_checkout(JSONB, JSONB, TEXT) TO service_role;
