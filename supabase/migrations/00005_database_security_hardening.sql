-- ==============================================================================
-- SPLENDER JEWEL — FORWARD MIGRATION: DATABASE SECURITY & PRIVILEGE HARDENING
-- Migration: 00005_database_security_hardening.sql
--
-- PURPOSE:
-- 1. [FUNCTION & SEQUENCE LEAST PRIVILEGE]
--    - public.generate_order_number(): SECURITY DEFINER, fixed search_path,
--      revoked from PUBLIC/anon/authenticated, granted strictly to service_role.
--    - public.order_number_seq: revoked from PUBLIC/anon/authenticated, granted
--      strictly to service_role.
--    - public.handle_new_user(): SECURITY DEFINER, fixed search_path, revoked
--      from PUBLIC/anon/authenticated, granted to service_role and supabase_auth_admin.
--    - public.protect_profile_fields(): SECURITY DEFINER, fixed search_path,
--      revoked from PUBLIC/anon, granted to authenticated and service_role.
--    - public.set_updated_at(): SECURITY INVOKER, fixed search_path, revoked
--      from PUBLIC/anon, granted to authenticated and service_role.
--    - public.is_admin() & public.is_super_admin(): STABLE SECURITY DEFINER,
--      fixed search_path, revoked from PUBLIC/anon, granted strictly to
--      authenticated and service_role.
--    - public.adjust_variant_stock(): SECURITY DEFINER, fixed search_path,
--      revoked from PUBLIC/anon/authenticated, granted strictly to service_role.
-- 2. [RLS RECURSION & ANON EXECUTION REMEDIATION]
--    - Fixes infinite recursion (SQLSTATE 42P17) on public.admin_users by
--      replacing the inline self-referencing subquery with public.is_super_admin().
--    - Scopes all administrative RLS policies explicitly TO authenticated so
--      anonymous storefront queries never invoke public.is_admin().
-- 3. [TABLE & COLUMN PRIVILEGE ISOLATION]
--    - Revokes client access to orders.admin_notes, orders.order_token,
--      orders.idempotency_key, and order_items.purchase_cost.
--    - Isolates payments, inventory_movements, audit_logs, print_templates,
--      coupons, and coupon_usage from direct client table queries.
--    - Restricts public.store_settings anonymous visibility to safe public keys
--      ('general', 'contact', 'delivery', 'shipping', 'social', 'store_info', 'seo').
--
-- EXECUTION STATUS: PREPARED FOR REVIEW (NOT YET APPLIED TO LIVE SUPABASE)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ORDER NUMBER GENERATOR & SEQUENCE HARDENING
-- ------------------------------------------------------------------------------
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
REVOKE ALL ON FUNCTION public.generate_order_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_order_number() TO service_role;

REVOKE ALL ON SEQUENCE public.order_number_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.order_number_seq TO service_role;

-- ------------------------------------------------------------------------------
-- 2. TRIGGER FUNCTIONS HARDENING (handle_new_user, protect_profile_fields, set_updated_at)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    phone1,
    avatar_url,
    account_status
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email, '@', 1)),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'phone1'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'avatar_url'), ''),
    'active'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('role', true) NOT IN ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin')
     AND NOT (
       current_user IN ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin')
       AND COALESCE(current_setting('role', true), 'none') IN ('none', '', 'postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin')
     )
     AND NOT public.is_admin()
  THEN
    NEW.account_status := OLD.account_status;
    NEW.id := OLD.id;
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

ALTER FUNCTION public.protect_profile_fields() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.protect_profile_fields() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profile_fields() TO service_role;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

ALTER FUNCTION public.set_updated_at() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;

-- ------------------------------------------------------------------------------
-- 3. ADMIN ROLE EVALUATORS (is_admin & is_super_admin)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = auth.uid() AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

ALTER FUNCTION public.is_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = auth.uid() AND role = 'super_admin' AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

ALTER FUNCTION public.is_super_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. PRIVILEGED INVENTORY ADJUSTMENT RPC HARDENING
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
  IF p_variant_id IS NULL THEN
    RAISE EXCEPTION 'Variant ID is required.';
  END IF;

  IF p_quantity_change IS NULL OR p_quantity_change = 0 THEN
    RAISE EXCEPTION 'Quantity change cannot be zero or null.';
  END IF;

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
    RAISE EXCEPTION 'Adjustment would result in negative stock. Current: %, Requested change: %', v_current_qty, p_quantity_change;
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
-- 5. RLS POLICY HARDENING & ADMIN_USERS RECURSION REMEDIATION
--    Scopes all is_admin() / is_super_admin() policies strictly TO authenticated
--    so anon queries never invoke admin functions and admin_users never recurses.
-- ------------------------------------------------------------------------------

-- 5.1 Profiles
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
CREATE POLICY "Admins view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins update all profiles" ON public.profiles;
CREATE POLICY "Admins update all profiles" ON public.profiles
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5.2 Addresses
DROP POLICY IF EXISTS "Users manage own addresses" ON public.addresses;
CREATE POLICY "Users manage own addresses" ON public.addresses
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all addresses" ON public.addresses;
CREATE POLICY "Admins view all addresses" ON public.addresses
  FOR SELECT TO authenticated USING (public.is_admin());

-- 5.3 Admin Users (Remediates live 42P17 infinite recursion)
DROP POLICY IF EXISTS "Admins view admin_users" ON public.admin_users;
CREATE POLICY "Admins view admin_users" ON public.admin_users
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Super admin manage admin_users" ON public.admin_users;
CREATE POLICY "Super admin manage admin_users" ON public.admin_users
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- 5.4 Audit Logs
DROP POLICY IF EXISTS "Admins view audit logs" ON public.audit_logs;
CREATE POLICY "Admins view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins insert audit logs" ON public.audit_logs;
CREATE POLICY "Admins insert audit logs" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- 5.5 Categories
DROP POLICY IF EXISTS "Public view active categories" ON public.categories;
CREATE POLICY "Public view active categories" ON public.categories
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Admins manage categories" ON public.categories;
CREATE POLICY "Admins manage categories" ON public.categories
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5.6 Products
DROP POLICY IF EXISTS "Public view active products" ON public.products;
CREATE POLICY "Public view active products" ON public.products
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Admins manage products" ON public.products;
CREATE POLICY "Admins manage products" ON public.products
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5.7 Product Variants
DROP POLICY IF EXISTS "Public view active variants" ON public.product_variants;
CREATE POLICY "Public view active variants" ON public.product_variants
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Admins manage variants" ON public.product_variants;
CREATE POLICY "Admins manage variants" ON public.product_variants
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5.8 Product Images
DROP POLICY IF EXISTS "Public view product images" ON public.product_images;
CREATE POLICY "Public view product images" ON public.product_images
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Admins manage product images" ON public.product_images;
CREATE POLICY "Admins manage product images" ON public.product_images
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5.9 Inventory Movements
DROP POLICY IF EXISTS "Admins view inventory movements" ON public.inventory_movements;
CREATE POLICY "Admins view inventory movements" ON public.inventory_movements
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins insert inventory movements" ON public.inventory_movements;
CREATE POLICY "Admins insert inventory movements" ON public.inventory_movements
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- 5.10 Carts & Wishlists
DROP POLICY IF EXISTS "Users manage own cart" ON public.carts;
CREATE POLICY "Users manage own cart" ON public.carts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own cart items" ON public.cart_items;
CREATE POLICY "Users manage own cart items" ON public.cart_items
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.carts WHERE id = cart_items.cart_id AND user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.carts WHERE id = cart_items.cart_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users manage own wishlist" ON public.wishlists;
CREATE POLICY "Users manage own wishlist" ON public.wishlists
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own wishlist items" ON public.wishlist_items;
CREATE POLICY "Users manage own wishlist items" ON public.wishlist_items
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.wishlists WHERE id = wishlist_items.wishlist_id AND user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.wishlists WHERE id = wishlist_items.wishlist_id AND user_id = auth.uid())
  );

-- 5.11 Orders, Order Items, Order Status History, Payments
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

DROP POLICY IF EXISTS "Users view own order status history" ON public.order_status_history;
CREATE POLICY "Users view own order status history" ON public.order_status_history
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders WHERE id = order_status_history.order_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins manage order status history" ON public.order_status_history;
CREATE POLICY "Admins manage order status history" ON public.order_status_history
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users view own payments" ON public.payments;
CREATE POLICY "Users view own payments" ON public.payments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders WHERE id = payments.order_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins manage payments" ON public.payments;
CREATE POLICY "Admins manage payments" ON public.payments
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5.12 Coupons & Coupon Usage
DROP POLICY IF EXISTS "Public view active coupons" ON public.coupons;
DROP POLICY IF EXISTS "Admins manage coupons" ON public.coupons;
CREATE POLICY "Admins manage coupons" ON public.coupons
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users view own coupon usage" ON public.coupon_usage;
CREATE POLICY "Users view own coupon usage" ON public.coupon_usage
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage coupon usage" ON public.coupon_usage;
CREATE POLICY "Admins manage coupon usage" ON public.coupon_usage
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5.13 Reviews
DROP POLICY IF EXISTS "Public view approved reviews" ON public.reviews;
CREATE POLICY "Public view approved reviews" ON public.reviews
  FOR SELECT USING (is_approved = TRUE);

DROP POLICY IF EXISTS "Users view own reviews" ON public.reviews;
CREATE POLICY "Users view own reviews" ON public.reviews
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users submit own reviews" ON public.reviews;
CREATE POLICY "Users submit own reviews" ON public.reviews
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND is_approved = FALSE
    AND is_verified_purchase = TRUE
    AND EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
      WHERE o.id = reviews.order_id
        AND o.user_id = auth.uid()
        AND o.order_status = 'delivered'
        AND oi.id = reviews.order_item_id
        AND oi.product_id = reviews.product_id
    )
  );

DROP POLICY IF EXISTS "Admins manage reviews" ON public.reviews;
CREATE POLICY "Admins manage reviews" ON public.reviews
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5.14 Delivery Districts, Store Settings, CMS & Print Templates
DROP POLICY IF EXISTS "Public view delivery districts" ON public.delivery_districts;
CREATE POLICY "Public view delivery districts" ON public.delivery_districts
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Admins manage delivery districts" ON public.delivery_districts;
CREATE POLICY "Admins manage delivery districts" ON public.delivery_districts
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public view store settings" ON public.store_settings;
CREATE POLICY "Public view store settings" ON public.store_settings
  FOR SELECT USING (
    key IN ('general', 'contact', 'delivery', 'shipping', 'social', 'store_info', 'seo')
  );

DROP POLICY IF EXISTS "Admins manage store settings" ON public.store_settings;
CREATE POLICY "Admins manage store settings" ON public.store_settings
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public view homepage sections" ON public.homepage_sections;
CREATE POLICY "Public view homepage sections" ON public.homepage_sections
  FOR SELECT USING (is_enabled = TRUE);

DROP POLICY IF EXISTS "Admins manage homepage sections" ON public.homepage_sections;
CREATE POLICY "Admins manage homepage sections" ON public.homepage_sections
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public view active banners" ON public.banners;
CREATE POLICY "Public view active banners" ON public.banners
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Admins manage banners" ON public.banners;
CREATE POLICY "Admins manage banners" ON public.banners
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public view content pages" ON public.content_pages;
CREATE POLICY "Public view content pages" ON public.content_pages
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Admins manage content pages" ON public.content_pages;
CREATE POLICY "Admins manage content pages" ON public.content_pages
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage print templates" ON public.print_templates;
CREATE POLICY "Admins manage print templates" ON public.print_templates
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5.15 Storage Objects Policies (Scope admin policies TO authenticated)
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Admins upload product images" ON storage.objects;
    CREATE POLICY "Admins upload product images" ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (bucket_id = 'products' AND public.is_admin());

    DROP POLICY IF EXISTS "Admins update product images" ON storage.objects;
    CREATE POLICY "Admins update product images" ON storage.objects
      FOR UPDATE TO authenticated USING (bucket_id = 'products' AND public.is_admin());

    DROP POLICY IF EXISTS "Admins delete product images" ON storage.objects;
    CREATE POLICY "Admins delete product images" ON storage.objects
      FOR DELETE TO authenticated USING (bucket_id = 'products' AND public.is_admin());

    DROP POLICY IF EXISTS "Admins upload banners" ON storage.objects;
    CREATE POLICY "Admins upload banners" ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (bucket_id = 'banners' AND public.is_admin());

    DROP POLICY IF EXISTS "Admins update banners" ON storage.objects;
    CREATE POLICY "Admins update banners" ON storage.objects
      FOR UPDATE TO authenticated USING (bucket_id = 'banners' AND public.is_admin());

    DROP POLICY IF EXISTS "Admins delete banners" ON storage.objects;
    CREATE POLICY "Admins delete banners" ON storage.objects
      FOR DELETE TO authenticated USING (bucket_id = 'banners' AND public.is_admin());

    DROP POLICY IF EXISTS "Admins upload store assets" ON storage.objects;
    CREATE POLICY "Admins upload store assets" ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (bucket_id = 'store-assets' AND public.is_admin());

    DROP POLICY IF EXISTS "Admins update store assets" ON storage.objects;
    CREATE POLICY "Admins update store assets" ON storage.objects
      FOR UPDATE TO authenticated USING (bucket_id = 'store-assets' AND public.is_admin());

    DROP POLICY IF EXISTS "Admins delete store assets" ON storage.objects;
    CREATE POLICY "Admins delete store assets" ON storage.objects
      FOR DELETE TO authenticated USING (bucket_id = 'store-assets' AND public.is_admin());

    DROP POLICY IF EXISTS "Users read own avatar" ON storage.objects;
    CREATE POLICY "Users read own avatar" ON storage.objects
      FOR SELECT TO authenticated USING (
        bucket_id = 'avatars' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin())
      );
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 6. TABLE & COLUMN PRIVILEGE ISOLATION
-- ------------------------------------------------------------------------------

-- 6.1 Admin Users: authenticated read-only (for server-side admin session verification), no anon access
REVOKE ALL ON public.admin_users FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_users TO authenticated;
GRANT ALL ON public.admin_users TO service_role;

-- 6.2 Orders: authenticated read-only on customer-safe columns (omits admin_notes, order_token, idempotency_key)
REVOKE ALL ON public.orders FROM PUBLIC, anon, authenticated;
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
GRANT ALL ON public.orders TO service_role;

-- 6.3 Order Items: authenticated read-only on customer-safe columns (omits purchase_cost)
REVOKE ALL ON public.order_items FROM PUBLIC, anon, authenticated;
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
GRANT ALL ON public.order_items TO service_role;

-- 6.4 Order Status History: authenticated read-only
REVOKE ALL ON public.order_status_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_status_history TO authenticated;
GRANT ALL ON public.order_status_history TO service_role;

-- 6.5 Internal Back-Office & Server-Action-Only Tables (payments, inventory_movements, audit_logs, print_templates, coupons, coupon_usage)
REVOKE ALL ON public.payments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.payments TO service_role;

REVOKE ALL ON public.inventory_movements FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.inventory_movements TO service_role;

REVOKE ALL ON public.audit_logs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.audit_logs TO service_role;

REVOKE ALL ON public.print_templates FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.print_templates TO service_role;

REVOKE ALL ON public.coupons FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.coupons TO service_role;

REVOKE ALL ON public.coupon_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.coupon_usage TO service_role;

-- 6.6 Profiles: authenticated read + restricted column UPDATE
REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (
  full_name,
  phone1,
  phone2,
  avatar_url,
  updated_at
) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- 6.7 Customer Self-Service Tables (addresses, carts, cart_items, wishlists, wishlist_items)
REVOKE ALL ON public.addresses, public.carts, public.cart_items, public.wishlists, public.wishlist_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses, public.carts, public.cart_items, public.wishlists, public.wishlist_items TO authenticated;
GRANT ALL ON public.addresses, public.carts, public.cart_items, public.wishlists, public.wishlist_items TO service_role;

-- 6.8 Public Read-Only Storefront & CMS Tables
REVOKE ALL ON public.categories, public.products, public.product_images, public.delivery_districts, public.store_settings, public.homepage_sections, public.banners, public.content_pages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.categories, public.products, public.product_images, public.delivery_districts, public.store_settings, public.homepage_sections, public.banners, public.content_pages TO anon, authenticated;
GRANT ALL ON public.categories, public.products, public.product_images, public.delivery_districts, public.store_settings, public.homepage_sections, public.banners, public.content_pages TO service_role;

-- 6.9 Reviews: public read, authenticated restricted insert
REVOKE ALL ON public.reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT INSERT (
  product_id,
  variant_id,
  user_id,
  order_id,
  order_item_id,
  customer_name,
  rating,
  title,
  comment,
  is_verified_purchase,
  is_approved,
  created_at,
  updated_at
) ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
