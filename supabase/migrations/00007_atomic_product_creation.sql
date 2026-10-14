-- ==============================================================================
-- SPLENDER JEWEL — FORWARD MIGRATION: ATOMIC PRODUCT CREATION TRANSACTION RPC
-- Migration: 00007_atomic_product_creation.sql
--
-- PURPOSE:
-- 1. [DEFENSIVE PRECONDITIONS] Verify all catalog, inventory, and admin tables exist.
-- 2. [AUDIT CONSTRAINT INTEGRITY] Preserves ON DELETE RESTRICT on inventory_movements.variant_id
--    established in migration 00002. Under no circumstances is this constraint weakened.
-- 3. [CASE-INSENSITIVE SKU INTEGRITY & CONCURRENCY]
--    - Performs defensive check for existing SKUs in public.product_variants that differ only by letter case.
--      If any case-colliding SKUs exist, the migration safely aborts without deleting or modifying any records.
--    - Creates unique index idx_product_variants_sku_lower ON public.product_variants (LOWER(TRIM(sku))).
--    - Guarantees database-engine level concurrency protection: prevents race conditions where concurrent
--      transactions attempt to insert the same SKU with different letter casing.
-- 4. [ATOMIC PRODUCT CREATION RPC] Creates public.create_product_with_variations to
--    guarantee 100% single-transaction ACID execution across products, product_variants,
--    inventory_movements, and product_images:
--    - Enforces active administrator authorization (p_admin_id in public.admin_users WHERE is_active = true).
--    - Strictly validates product slug, category, and product_code uniqueness upfront.
--    - Validates in-batch and database SKU uniqueness for all variations (case-insensitive).
--    - Validates pricing constraints (price >= 0, discount_price < price, non-NaN, non-Infinity).
--    - Validates stock quantities (stock_quantity >= 0, integer).
--    - Validates low-stock thresholds (strictly rejects negative thresholds instead of defaulting).
--    - Respects individual variation active/inactive states (is_active).
--    - Validates image payloads (rejects non-array, malformed objects, invalid URLs, negative display order).
--    - Strictly validates variation-specific image references: rejects any image whose nonempty
--      variant_sku does not match a variation in the current product; never silently converts to product-level.
--    - Automatically sets deterministic stock_status ('in_stock', 'low_stock', 'out_of_stock').
--    - Atomically creates initial audit inventory_movements ('stock_added', 'INITIAL_PRODUCT_SETUP').
--    - Atomically associates gallery images with product and variant references.
--    - Any failure automatically triggers PostgreSQL transaction abort; no partial
--      or unlinked rows are ever written, and ON DELETE RESTRICT is never encountered.
-- 5. [LEAST PRIVILEGE & SECURITY BOUNDARY]
--    - Declared SECURITY DEFINER with fixed search_path = public, pg_temp.
--    - Owned by postgres.
--    - Execution explicitly revoked from PUBLIC, anon, and authenticated.
--    - Execution granted strictly to trusted service_role.
--
-- EXECUTION STATUS: DRAFTED FOR REVIEW ONLY (NOT YET APPLIED TO LIVE DATABASE)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. DEFENSIVE PRECONDITIONS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.products') IS NULL
     OR to_regclass('public.product_variants') IS NULL
     OR to_regclass('public.product_images') IS NULL
     OR to_regclass('public.inventory_movements') IS NULL
     OR to_regclass('public.admin_users') IS NULL
     OR to_regclass('public.categories') IS NULL
  THEN
    RAISE EXCEPTION 'Cannot apply migration 00007: one or more required catalog tables are missing.';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. CASE-INSENSITIVE SKU DEFENSIVE CHECK & UNIQUE INDEX
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_conflict_count INT;
  v_conflict_skus TEXT;
BEGIN
  -- Defensive check: detect any existing SKUs in product_variants that differ only by case or whitespace
  WITH collision_groups AS (
    SELECT LOWER(TRIM(sku)) AS norm_sku, string_agg(sku, ', ' ORDER BY sku) AS sku_list
    FROM public.product_variants
    GROUP BY LOWER(TRIM(sku))
    HAVING COUNT(*) > 1
  )
  SELECT 
    COUNT(*),
    (
      SELECT string_agg(sku_list, '; ') 
      FROM (
        SELECT sku_list 
        FROM collision_groups 
        ORDER BY norm_sku 
        LIMIT 5
      ) limited
    )
  INTO v_conflict_count, v_conflict_skus
  FROM collision_groups;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'Cannot apply migration 00007: found % case-colliding SKU group(s) in public.product_variants: [%]. Manual reconciliation required before creating case-insensitive unique index.', v_conflict_count, v_conflict_skus;
  END IF;

  -- Create case-insensitive unique index if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'product_variants' 
      AND indexname = 'idx_product_variants_sku_lower'
  ) THEN
    CREATE UNIQUE INDEX idx_product_variants_sku_lower 
      ON public.product_variants (LOWER(TRIM(sku)));
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. ATOMIC PRODUCT CREATION STORED PROCEDURE
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_product_with_variations(
  p_product JSONB,
  p_variants JSONB,
  p_images JSONB DEFAULT '[]'::jsonb,
  p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name TEXT;
  v_slug TEXT;
  v_product_code TEXT;
  v_category_id UUID;
  v_product_id UUID;
  v_variant_count INT;
  v_var_elem JSONB;
  v_sku TEXT;
  v_title TEXT;
  v_raw_val TEXT;
  v_price NUMERIC;
  v_discount_price NUMERIC;
  v_purchase_cost NUMERIC;
  v_stock_qty INT;
  v_low_stock INT;
  v_var_is_active BOOLEAN;
  v_attributes JSONB;
  v_stock_status TEXT;
  v_variant_id UUID;
  v_img_elem JSONB;
  v_img_url TEXT;
  v_img_sku TEXT;
  v_img_disp_order INT;
  v_target_variant_id UUID;
  v_dup_sku TEXT;
  v_existing_sku TEXT;
BEGIN
  -- 1. Administrator Authorization Check
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'Admin ID is required.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = p_admin_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an active administrator.';
  END IF;

  -- 2. Validate Product Payload
  IF p_product IS NULL OR jsonb_typeof(p_product) != 'object' THEN
    RAISE EXCEPTION 'Product payload must be a JSON object.';
  END IF;

  v_name := TRIM(COALESCE(p_product->>'name', ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Product name is required.';
  END IF;

  v_slug := LOWER(TRIM(COALESCE(p_product->>'slug', '')));
  IF v_slug = '' THEN
    RAISE EXCEPTION 'Product slug is required.';
  END IF;

  IF v_slug !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'Product slug "%" is invalid. Slugs may only contain lowercase letters, numbers, and hyphens.', v_slug;
  END IF;

  IF EXISTS (SELECT 1 FROM public.products WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'Product slug "%" is already in use by another product.', v_slug;
  END IF;

  v_product_code := NULLIF(TRIM(COALESCE(p_product->>'product_code', '')), '');
  IF v_product_code IS NOT NULL AND EXISTS (SELECT 1 FROM public.products WHERE product_code = v_product_code) THEN
    RAISE EXCEPTION 'Product code "%" is already assigned to another product.', v_product_code;
  END IF;

  IF p_product->>'category_id' IS NOT NULL AND TRIM(p_product->>'category_id') != '' THEN
    v_category_id := (p_product->>'category_id')::UUID;
    IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = v_category_id) THEN
      RAISE EXCEPTION 'Category not found: %', v_category_id;
    END IF;
  ELSE
    v_category_id := NULL;
  END IF;

  -- 3. Validate Variants Payload
  IF p_variants IS NULL OR jsonb_typeof(p_variants) != 'array' THEN
    RAISE EXCEPTION 'Variants payload must be a JSON array.';
  END IF;

  v_variant_count := jsonb_array_length(p_variants);
  IF v_variant_count = 0 THEN
    RAISE EXCEPTION 'At least one product variation is required.';
  END IF;

  -- In-batch SKU uniqueness verification (case-insensitive)
  SELECT UPPER(TRIM(x.sku)) INTO v_dup_sku
  FROM jsonb_to_recordset(p_variants) AS x(sku text)
  GROUP BY UPPER(TRIM(x.sku))
  HAVING count(*) > 1
  LIMIT 1;

  IF v_dup_sku IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate SKU "%" found within the variation list.', v_dup_sku;
  END IF;

  -- Database SKU uniqueness verification (case-insensitive)
  SELECT pv.sku INTO v_existing_sku
  FROM public.product_variants pv
  JOIN jsonb_to_recordset(p_variants) AS x(sku text)
    ON UPPER(TRIM(pv.sku)) = UPPER(TRIM(x.sku))
  LIMIT 1;

  IF v_existing_sku IS NOT NULL THEN
    RAISE EXCEPTION 'SKU "%" is already assigned to another product.', v_existing_sku;
  END IF;

  -- 4. Insert Product Record
  INSERT INTO public.products (
    name,
    slug,
    product_code,
    short_description,
    description,
    material,
    gender,
    category_id,
    is_featured,
    is_new_arrival,
    is_best_seller,
    is_active,
    meta_title,
    meta_description
  ) VALUES (
    v_name,
    v_slug,
    v_product_code,
    NULLIF(TRIM(COALESCE(p_product->>'short_description', '')), ''),
    NULLIF(TRIM(COALESCE(p_product->>'description', '')), ''),
    NULLIF(TRIM(COALESCE(p_product->>'material', '')), ''),
    COALESCE(NULLIF(TRIM(p_product->>'gender'), ''), 'women'),
    v_category_id,
    COALESCE((p_product->>'is_featured')::BOOLEAN, FALSE),
    COALESCE((p_product->>'is_new_arrival')::BOOLEAN, TRUE),
    COALESCE((p_product->>'is_best_seller')::BOOLEAN, FALSE),
    COALESCE((p_product->>'is_active')::BOOLEAN, TRUE),
    NULLIF(TRIM(COALESCE(p_product->>'meta_title', '')), ''),
    NULLIF(TRIM(COALESCE(p_product->>'meta_description', '')), '')
  ) RETURNING id INTO v_product_id;

  -- 5. Insert Variants and Initial Inventory Movements
  FOR v_var_elem IN SELECT * FROM jsonb_array_elements(p_variants) LOOP
    IF jsonb_typeof(v_var_elem) != 'object' THEN
      RAISE EXCEPTION 'Malformed variation payload: each variation must be a JSON object.';
    END IF;

    v_sku := UPPER(TRIM(COALESCE(v_var_elem->>'sku', '')));
    IF v_sku = '' THEN
      RAISE EXCEPTION 'SKU is required for all variations.';
    END IF;

    IF length(v_sku) > 100 THEN
      RAISE EXCEPTION 'SKU "%" exceeds maximum length of 100 characters.', v_sku;
    END IF;

    IF v_sku !~ '^[A-Z0-9_-]+$' THEN
      RAISE EXCEPTION 'SKU "%" contains invalid characters. Only alphanumeric characters, hyphens, and underscores are permitted.', v_sku;
    END IF;

    v_title := COALESCE(NULLIF(TRIM(v_var_elem->>'title'), ''), 'Default');

    -- Price validation (numeric, non-negative, non-NaN, non-Infinity)
    v_raw_val := TRIM(COALESCE(v_var_elem->>'price', ''));
    IF v_raw_val = '' OR v_raw_val ~* 'nan|infinity' THEN
      RAISE EXCEPTION 'Selling price for variant "%" must be a valid finite number.', v_sku;
    END IF;
    v_price := v_raw_val::NUMERIC;
    IF v_price < 0 OR v_price = 'NaN'::NUMERIC OR v_price IN ('Infinity'::NUMERIC, '-Infinity'::NUMERIC) THEN
      RAISE EXCEPTION 'Selling price for variant "%" must be a non-negative finite number.', v_sku;
    END IF;

    -- Discount price validation (optional, < price, non-negative, non-NaN, non-Infinity)
    IF v_var_elem->>'discount_price' IS NOT NULL AND TRIM(v_var_elem->>'discount_price') != '' THEN
      v_raw_val := TRIM(v_var_elem->>'discount_price');
      IF v_raw_val ~* 'nan|infinity' THEN
        RAISE EXCEPTION 'Discount price for variant "%" cannot be NaN or Infinity.', v_sku;
      END IF;
      v_discount_price := v_raw_val::NUMERIC;
      IF v_discount_price < 0 OR v_discount_price >= v_price OR v_discount_price = 'NaN'::NUMERIC OR v_discount_price IN ('Infinity'::NUMERIC, '-Infinity'::NUMERIC) THEN
        RAISE EXCEPTION 'Discount price for variant "%" must be non-negative and strictly less than regular selling price.', v_sku;
      END IF;
    ELSE
      v_discount_price := NULL;
    END IF;

    -- Purchase cost validation (optional, non-negative, non-NaN, non-Infinity)
    IF v_var_elem->>'purchase_cost' IS NOT NULL AND TRIM(v_var_elem->>'purchase_cost') != '' THEN
      v_raw_val := TRIM(v_var_elem->>'purchase_cost');
      IF v_raw_val ~* 'nan|infinity' THEN
        RAISE EXCEPTION 'Purchase cost for variant "%" cannot be NaN or Infinity.', v_sku;
      END IF;
      v_purchase_cost := v_raw_val::NUMERIC;
      IF v_purchase_cost < 0 OR v_purchase_cost = 'NaN'::NUMERIC OR v_purchase_cost IN ('Infinity'::NUMERIC, '-Infinity'::NUMERIC) THEN
        RAISE EXCEPTION 'Purchase cost for variant "%" cannot be negative or NaN.', v_sku;
      END IF;
    ELSE
      v_purchase_cost := 0;
    END IF;

    -- Stock quantity validation (integer, non-negative)
    IF v_var_elem->>'stock_quantity' IS NOT NULL AND TRIM(v_var_elem->>'stock_quantity') != '' THEN
      v_raw_val := TRIM(v_var_elem->>'stock_quantity');
      IF v_raw_val ~* 'nan|infinity|\.' THEN
        RAISE EXCEPTION 'Stock quantity for variant "%" must be an integer.', v_sku;
      END IF;
      v_stock_qty := v_raw_val::INT;
      IF v_stock_qty < 0 THEN
        RAISE EXCEPTION 'Stock quantity for variant "%" cannot be negative.', v_sku;
      END IF;
    ELSE
      v_stock_qty := 0;
    END IF;

    -- Low stock threshold validation (integer, non-negative; rejects negative explicitly)
    IF v_var_elem->>'low_stock_threshold' IS NOT NULL AND TRIM(v_var_elem->>'low_stock_threshold') != '' THEN
      v_raw_val := TRIM(v_var_elem->>'low_stock_threshold');
      IF v_raw_val ~* 'nan|infinity|\.' THEN
        RAISE EXCEPTION 'Low stock threshold for variant "%" must be an integer.', v_sku;
      END IF;
      v_low_stock := v_raw_val::INT;
      IF v_low_stock < 0 THEN
        RAISE EXCEPTION 'Low stock threshold for variant "%" cannot be negative.', v_sku;
      END IF;
    ELSE
      v_low_stock := 5;
    END IF;

    -- Individual variation active state
    v_var_is_active := COALESCE((v_var_elem->>'is_active')::BOOLEAN, TRUE);
    v_attributes := COALESCE(v_var_elem->'attributes', '{}'::jsonb);

    -- Compute deterministic stock status
    IF v_stock_qty = 0 THEN
      v_stock_status := 'out_of_stock';
    ELSIF v_stock_qty <= v_low_stock THEN
      v_stock_status := 'low_stock';
    ELSE
      v_stock_status := 'in_stock';
    END IF;

    -- Insert Variant
    INSERT INTO public.product_variants (
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
      is_active
    ) VALUES (
      v_product_id,
      v_sku,
      v_title,
      v_attributes,
      v_price,
      v_discount_price,
      v_purchase_cost,
      v_stock_qty,
      v_low_stock,
      v_stock_status,
      v_var_is_active
    ) RETURNING id INTO v_variant_id;

    -- Initial Audit Inventory Movement (only when initial stock > 0)
    IF v_stock_qty > 0 THEN
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
        v_stock_qty,
        0,
        v_stock_qty,
        'stock_added',
        'INITIAL_PRODUCT_SETUP',
        p_admin_id
      );
    END IF;
  END LOOP;

  -- 6. Insert Gallery Images (Product-level and Variant-specific)
  IF p_images IS NOT NULL AND jsonb_typeof(p_images) != 'null' THEN
    IF jsonb_typeof(p_images) != 'array' THEN
      RAISE EXCEPTION 'Images payload must be a JSON array.';
    END IF;

    FOR v_img_elem IN SELECT * FROM jsonb_array_elements(p_images) LOOP
      IF jsonb_typeof(v_img_elem) != 'object' THEN
        RAISE EXCEPTION 'Malformed image payload: each item must be a JSON object.';
      END IF;

      v_img_url := TRIM(COALESCE(v_img_elem->>'url', ''));
      IF v_img_url = '' THEN
        RAISE EXCEPTION 'Image URL cannot be empty.';
      END IF;

      IF v_img_url !~* '^(https?://|/)' THEN
        RAISE EXCEPTION 'Invalid image URL "%". URL must start with http://, https://, or a relative path.', v_img_url;
      END IF;

      IF v_img_elem->>'display_order' IS NOT NULL AND TRIM(v_img_elem->>'display_order') != '' THEN
        v_raw_val := TRIM(v_img_elem->>'display_order');
        IF v_raw_val ~* 'nan|infinity|\.' THEN
          RAISE EXCEPTION 'Display order for image "%" must be an integer.', v_img_url;
        END IF;
        v_img_disp_order := v_raw_val::INT;
        IF v_img_disp_order < 0 THEN
          RAISE EXCEPTION 'Display order for image "%" cannot be negative.', v_img_url;
        END IF;
      ELSE
        v_img_disp_order := 0;
      END IF;

      v_img_sku := UPPER(TRIM(COALESCE(v_img_elem->>'variant_sku', '')));
      v_target_variant_id := NULL;

      IF v_img_sku != '' THEN
        SELECT id INTO v_target_variant_id
        FROM public.product_variants
        WHERE product_id = v_product_id AND sku = v_img_sku
        LIMIT 1;

        -- Strictly reject if variant_sku does not match a variation in this product
        IF v_target_variant_id IS NULL THEN
          RAISE EXCEPTION 'Image "%" references variant SKU "%", which does not exist in this product.', v_img_url, v_img_sku;
        END IF;
      END IF;

      INSERT INTO public.product_images (
        product_id,
        variant_id,
        url,
        alt_text,
        display_order,
        is_primary
      ) VALUES (
        v_product_id,
        v_target_variant_id,
        v_img_url,
        COALESCE(NULLIF(TRIM(v_img_elem->>'alt_text'), ''), v_name),
        v_img_disp_order,
        COALESCE((v_img_elem->>'is_primary')::BOOLEAN, FALSE)
      );
    END LOOP;
  END IF;

  -- 7. Return Atomic Result
  RETURN jsonb_build_object(
    'success', TRUE,
    'product_id', v_product_id,
    'slug', v_slug,
    'variant_count', v_variant_count
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. FUNCTION SECURITY & PRIVILEGE HARDENING
-- ------------------------------------------------------------------------------
ALTER FUNCTION public.create_product_with_variations(JSONB, JSONB, JSONB, UUID) OWNER TO postgres;

-- Revoke default execute permissions from public roles
REVOKE ALL ON FUNCTION public.create_product_with_variations(JSONB, JSONB, JSONB, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_product_with_variations(JSONB, JSONB, JSONB, UUID) FROM anon, authenticated;

-- Grant execution strictly to service_role (invoked via server actions)
GRANT EXECUTE ON FUNCTION public.create_product_with_variations(JSONB, JSONB, JSONB, UUID) TO service_role;

COMMENT ON FUNCTION public.create_product_with_variations(JSONB, JSONB, JSONB, UUID) IS
  'Atomic single-transaction creation of product, variants, initial inventory movements, and gallery images with administrator authorization, strict numeric validation, and least-privilege security.';
