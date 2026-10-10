-- ==============================================================================
-- SPLENDER JEWEL — PHASE 1: PRODUCTION DATABASE SCHEMA & SECURITY MIGRATION
-- ==============================================================================
-- HARDENED VERSION (Audited & Corrected in Phase 1B)
--
-- HOW TO APPLY ON A FRESH SUPABASE PROJECT:
--   1. Open Supabase Dashboard → SQL Editor (https://supabase.com/dashboard/project/wztwulijwsgjjrabvtek/sql/new)
--   2. Paste this entire script into the SQL Editor
--   3. Click "Run"
--   4. Verify: Output displays "Phase 1 migration completed successfully!" with zero errors
-- ==============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- SECTION 1: PRE-REQUISITE FUNCTIONS & SEQUENCES
-- ==============================================================================

-- Sequential Order Number Generator (SJ-YYYYMMDD-XXXX)
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 1;

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

-- Automated updated_at timestamp trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- ==============================================================================
-- SECTION 2: TABLES
-- ==============================================================================

-- ── 1. Delivery Districts (Canonical 25 Sri Lankan Districts) ──────────────────
CREATE TABLE IF NOT EXISTS public.delivery_districts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  province TEXT NOT NULL,
  delivery_fee NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── 2. Customer Profiles ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone1 TEXT,
  phone2 TEXT,
  avatar_url TEXT,
  account_status TEXT DEFAULT 'active' NOT NULL
    CHECK (account_status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON COLUMN public.profiles.phone1 IS 'Primary contact telephone number';
COMMENT ON COLUMN public.profiles.phone2 IS 'Optional secondary telephone number';
COMMENT ON COLUMN public.profiles.account_status IS 'Managed exclusively by admin; customers cannot self-modify';

-- ── 3. Customer Saved Addresses ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.addresses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  label TEXT,
  full_name TEXT NOT NULL,
  phone1 TEXT NOT NULL,
  phone2 TEXT,
  address_line TEXT NOT NULL,
  city TEXT,
  district TEXT NOT NULL REFERENCES public.delivery_districts(name) ON UPDATE CASCADE,
  province TEXT,
  postal_code TEXT,
  delivery_notes TEXT,
  is_default BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── 4. Admin Users (Role-Based Access Control) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'super_admin' NOT NULL
    CHECK (role IN ('super_admin', 'admin', 'staff')),
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON TABLE public.admin_users IS 'Admin RBAC — strictly isolated from public.profiles. Only records here possess admin authority.';

-- ── 5. Admin Security Audit Logs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── 6. Product Categories ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  image_url TEXT,
  display_order INT DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  meta_title TEXT,
  meta_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── 7. Products ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  product_code TEXT,
  short_description TEXT,
  description TEXT,
  material TEXT,
  gender TEXT DEFAULT 'women' NOT NULL
    CHECK (gender IN ('women', 'men', 'unisex')),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  is_featured BOOLEAN DEFAULT FALSE NOT NULL,
  is_new_arrival BOOLEAN DEFAULT FALSE NOT NULL,
  is_best_seller BOOLEAN DEFAULT FALSE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  meta_title TEXT,
  meta_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── 8. Product Variants ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  attributes JSONB DEFAULT '{}'::jsonb NOT NULL,
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  discount_price NUMERIC(12, 2) CHECK (discount_price >= 0),
  purchase_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (purchase_cost >= 0),
  stock_quantity INT DEFAULT 0 NOT NULL CHECK (stock_quantity >= 0),
  low_stock_threshold INT DEFAULT 5 NOT NULL CHECK (low_stock_threshold >= 0),
  stock_status TEXT DEFAULT 'in_stock' NOT NULL
    CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock')),
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
COMMENT ON COLUMN public.product_variants.purchase_cost IS 'CRITICAL BUSINESS CONFIDENTIAL: Wholesale purchase cost. Protected by column privileges.';

-- ── 9. Product Images ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  alt_text TEXT,
  display_order INT DEFAULT 0 NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── 10. Inventory Movements ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE NOT NULL,
  quantity_change INT NOT NULL,
  previous_quantity INT NOT NULL,
  new_quantity INT NOT NULL,
  reason TEXT NOT NULL
    CHECK (reason IN ('stock_added', 'manual_adjustment', 'order_sold', 'order_cancelled_restock', 'correction')),
  reference_id TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── 11. Shopping Carts & Cart Items ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.carts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.cart_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cart_id UUID REFERENCES public.carts(id) ON DELETE CASCADE NOT NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE NOT NULL,
  quantity INT DEFAULT 1 NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(cart_id, variant_id)
);

-- ── 12. Wishlists & Wishlist Items ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wishlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wishlist_id UUID REFERENCES public.wishlists(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(wishlist_id, product_id, variant_id)
);

-- ── 13. Orders ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL DEFAULT public.generate_order_number(),
  order_token UUID DEFAULT gen_random_uuid() NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  email TEXT,
  phone1 TEXT NOT NULL,
  phone2 TEXT,
  address_line TEXT NOT NULL,
  city TEXT,
  district TEXT NOT NULL REFERENCES public.delivery_districts(name) ON UPDATE CASCADE,
  province TEXT,
  postal_code TEXT,
  delivery_notes TEXT,
  delivery_fee NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  coupon_code TEXT,
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  payment_method TEXT NOT NULL
    CHECK (payment_method IN ('cod', 'bank_transfer')),
  payment_status TEXT DEFAULT 'pending' NOT NULL
    CHECK (payment_status IN ('pending', 'verified', 'failed', 'refunded')),
  order_status TEXT DEFAULT 'pending' NOT NULL
    CHECK (order_status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
  tracking_number TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── 14. Order Items ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT NOT NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE RESTRICT NOT NULL,
  product_name TEXT NOT NULL,
  variant_title TEXT NOT NULL,
  sku TEXT NOT NULL,
  image_url TEXT,
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  quantity INT NOT NULL CHECK (quantity > 0),
  total_price NUMERIC(12, 2) NOT NULL CHECK (total_price >= 0),
  purchase_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (purchase_cost >= 0)
);
COMMENT ON COLUMN public.order_items.purchase_cost IS 'CRITICAL BUSINESS CONFIDENTIAL: Snapshot of wholesale purchase cost at sale. Protected by column privileges.';

-- ── 15. Order Status History ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── 16. Payments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cod', 'bank_transfer')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  status TEXT DEFAULT 'pending' NOT NULL
    CHECK (status IN ('pending', 'verified', 'failed', 'refunded')),
  reference_number TEXT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── 17. Coupons & Coupon Usage ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(12, 2) NOT NULL CHECK (discount_value > 0),
  min_order_amount NUMERIC(12, 2) DEFAULT 0 CHECK (min_order_amount >= 0),
  max_discount_amount NUMERIC(12, 2) CHECK (max_discount_amount >= 0),
  total_usage_limit INT CHECK (total_usage_limit >= 0),
  per_customer_limit INT DEFAULT 1 CHECK (per_customer_limit >= 0),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.coupon_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id UUID REFERENCES public.coupons(id) ON DELETE CASCADE NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  discount_amount NUMERIC(12, 2) NOT NULL CHECK (discount_amount >= 0),
  used_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── 18. Verified Product Reviews ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  comment TEXT,
  is_verified_purchase BOOLEAN DEFAULT TRUE NOT NULL,
  is_approved BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT uq_reviews_order_item UNIQUE (order_item_id)
);
COMMENT ON TABLE public.reviews IS 'Reviews require verified delivered purchase; restricted to 1 review per purchased order item.';

-- ── 19. Store Settings ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── 20. Storefront CMS & Templates ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.homepage_sections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  section_key TEXT UNIQUE NOT NULL,
  title TEXT,
  subtitle TEXT,
  display_order INT DEFAULT 0 NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE NOT NULL,
  config_data JSONB DEFAULT '{}'::jsonb NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.banners (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  image_url TEXT NOT NULL,
  mobile_image_url TEXT,
  link_url TEXT,
  button_text TEXT,
  display_order INT DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.content_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT DEFAULT '' NOT NULL,
  meta_title TEXT,
  meta_description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.print_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT TRUE NOT NULL,
  template_config JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ==============================================================================
-- SECTION 3: PERFORMANCE INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_variants_product ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON public.product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_order_token ON public.orders(order_token);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON public.reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order_item ON public.reviews(order_item_id);

-- ==============================================================================
-- SECTION 4: AUTOMATED TIMESTAMP TRIGGERS
-- ==============================================================================
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_addresses_updated_at ON public.addresses;
CREATE TRIGGER trg_addresses_updated_at BEFORE UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_admin_users_updated_at ON public.admin_users;
CREATE TRIGGER trg_admin_users_updated_at BEFORE UPDATE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_categories_updated_at ON public.categories;
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER trg_product_variants_updated_at BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_coupons_updated_at ON public.coupons;
CREATE TRIGGER trg_coupons_updated_at BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_delivery_districts_updated_at ON public.delivery_districts;
CREATE TRIGGER trg_delivery_districts_updated_at BEFORE UPDATE ON public.delivery_districts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_store_settings_updated_at ON public.store_settings;
CREATE TRIGGER trg_store_settings_updated_at BEFORE UPDATE ON public.store_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_carts_updated_at ON public.carts;
CREATE TRIGGER trg_carts_updated_at BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_cart_items_updated_at ON public.cart_items;
CREATE TRIGGER trg_cart_items_updated_at BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_wishlists_updated_at ON public.wishlists;
CREATE TRIGGER trg_wishlists_updated_at BEFORE UPDATE ON public.wishlists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_reviews_updated_at ON public.reviews;
CREATE TRIGGER trg_reviews_updated_at BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_homepage_sections_updated_at ON public.homepage_sections;
CREATE TRIGGER trg_homepage_sections_updated_at BEFORE UPDATE ON public.homepage_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_banners_updated_at ON public.banners;
CREATE TRIGGER trg_banners_updated_at BEFORE UPDATE ON public.banners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_content_pages_updated_at ON public.content_pages;
CREATE TRIGGER trg_content_pages_updated_at BEFORE UPDATE ON public.content_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_print_templates_updated_at ON public.print_templates;
CREATE TRIGGER trg_print_templates_updated_at BEFORE UPDATE ON public.print_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- SECTION 5: SECURITY FUNCTIONS & AUTH TRIGGERS
-- ==============================================================================

-- Hardened Admin Role Verification Function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = auth.uid() AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- Hardened User Registration Profile Trigger
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Customer Profile Tamper Protection (Restricts account_status, id, and email modifications to admins)
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

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

-- ==============================================================================
-- SECTION 6: PUBLIC PRODUCT VIEWS
-- ==============================================================================

-- Customer-facing view omitting purchase_cost entirely
CREATE OR REPLACE VIEW public.public_product_variants
WITH (security_invoker = true) AS
SELECT
  id,
  product_id,
  sku,
  title,
  attributes,
  price,
  discount_price,
  stock_quantity,
  low_stock_threshold,
  stock_status,
  is_active,
  created_at,
  updated_at
FROM public.product_variants
WHERE is_active = TRUE;

-- ==============================================================================
-- SECTION 7: ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.delivery_districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_templates ENABLE ROW LEVEL SECURITY;

-- ── Profiles Policies ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- ── Addresses Policies ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users view own addresses" ON public.addresses;
CREATE POLICY "Users view own addresses" ON public.addresses
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users insert own addresses" ON public.addresses;
CREATE POLICY "Users insert own addresses" ON public.addresses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own addresses" ON public.addresses;
CREATE POLICY "Users update own addresses" ON public.addresses
  FOR UPDATE
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users delete own addresses" ON public.addresses;
CREATE POLICY "Users delete own addresses" ON public.addresses
  FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

-- ── Admin Users Policies ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins view admin_users" ON public.admin_users;
CREATE POLICY "Admins view admin_users" ON public.admin_users
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Super admin manage admin_users" ON public.admin_users;
CREATE POLICY "Super admin manage admin_users" ON public.admin_users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND role = 'super_admin' AND is_active = TRUE)
  );

-- ── Audit Log Policies ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins view audit logs" ON public.audit_logs;
CREATE POLICY "Admins view audit logs" ON public.audit_logs
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admins insert audit logs" ON public.audit_logs;
CREATE POLICY "Admins insert audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (public.is_admin());

-- ── Category Policies ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public view active categories" ON public.categories;
CREATE POLICY "Public view active categories" ON public.categories
  FOR SELECT USING (is_active = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage categories" ON public.categories;
CREATE POLICY "Admins manage categories" ON public.categories
  FOR ALL USING (public.is_admin());

-- ── Product Policies ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public view active products" ON public.products;
CREATE POLICY "Public view active products" ON public.products
  FOR SELECT USING (is_active = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage products" ON public.products;
CREATE POLICY "Admins manage products" ON public.products
  FOR ALL USING (public.is_admin());

-- ── Product Variant Policies ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public view active variants" ON public.product_variants;
CREATE POLICY "Public view active variants" ON public.product_variants
  FOR SELECT USING (is_active = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage variants" ON public.product_variants;
CREATE POLICY "Admins manage variants" ON public.product_variants
  FOR ALL USING (public.is_admin());

-- ── Product Images Policies ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public view product images" ON public.product_images;
CREATE POLICY "Public view product images" ON public.product_images
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Admins manage product images" ON public.product_images;
CREATE POLICY "Admins manage product images" ON public.product_images
  FOR ALL USING (public.is_admin());

-- ── Inventory Movements Policies ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins view inventory movements" ON public.inventory_movements;
CREATE POLICY "Admins view inventory movements" ON public.inventory_movements
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admins insert inventory movements" ON public.inventory_movements;
CREATE POLICY "Admins insert inventory movements" ON public.inventory_movements
  FOR INSERT WITH CHECK (public.is_admin());

-- ── Cart & Cart Items Policies ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own cart" ON public.carts;
CREATE POLICY "Users manage own cart" ON public.carts
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own cart items" ON public.cart_items;
CREATE POLICY "Users manage own cart items" ON public.cart_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.carts WHERE id = cart_items.cart_id AND user_id = auth.uid())
  );

-- ── Wishlists & Wishlist Items Policies ───────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own wishlist" ON public.wishlists;
CREATE POLICY "Users manage own wishlist" ON public.wishlists
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own wishlist items" ON public.wishlist_items;
CREATE POLICY "Users manage own wishlist items" ON public.wishlist_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.wishlists WHERE id = wishlist_items.wishlist_id AND user_id = auth.uid())
  );

-- ── Orders Policies ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users view own orders" ON public.orders;
CREATE POLICY "Users view own orders" ON public.orders
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage orders" ON public.orders;
CREATE POLICY "Admins manage orders" ON public.orders
  FOR ALL USING (public.is_admin());

-- ── Order Items Policies ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users view own order items" ON public.order_items;
CREATE POLICY "Users view own order items" ON public.order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders WHERE id = order_items.order_id AND (user_id = auth.uid() OR public.is_admin()))
  );

DROP POLICY IF EXISTS "Admins manage order items" ON public.order_items;
CREATE POLICY "Admins manage order items" ON public.order_items
  FOR ALL USING (public.is_admin());

-- ── Order Status History Policies ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Users view own order status history" ON public.order_status_history;
CREATE POLICY "Users view own order status history" ON public.order_status_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders WHERE id = order_status_history.order_id AND (user_id = auth.uid() OR public.is_admin()))
  );

DROP POLICY IF EXISTS "Admins manage order status history" ON public.order_status_history;
CREATE POLICY "Admins manage order status history" ON public.order_status_history
  FOR ALL USING (public.is_admin());

-- ── Payments Policies ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users view own payments" ON public.payments;
CREATE POLICY "Users view own payments" ON public.payments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders WHERE id = payments.order_id AND (user_id = auth.uid() OR public.is_admin()))
  );

DROP POLICY IF EXISTS "Admins manage payments" ON public.payments;
CREATE POLICY "Admins manage payments" ON public.payments
  FOR ALL USING (public.is_admin());

-- ── Coupons & Coupon Usage Policies ───────────────────────────────────────────
DROP POLICY IF EXISTS "Public view active coupons" ON public.coupons;
CREATE POLICY "Public view active coupons" ON public.coupons
  FOR SELECT USING (is_active = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage coupons" ON public.coupons;
CREATE POLICY "Admins manage coupons" ON public.coupons
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Users view own coupon usage" ON public.coupon_usage;
CREATE POLICY "Users view own coupon usage" ON public.coupon_usage
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage coupon usage" ON public.coupon_usage;
CREATE POLICY "Admins manage coupon usage" ON public.coupon_usage
  FOR ALL USING (public.is_admin());

-- ── Verified Product Reviews Policies ─────────────────────────────────────────
DROP POLICY IF EXISTS "Public view approved reviews" ON public.reviews;
CREATE POLICY "Public view approved reviews" ON public.reviews
  FOR SELECT USING (is_approved = TRUE OR auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users submit own reviews" ON public.reviews;
CREATE POLICY "Users submit own reviews" ON public.reviews
  FOR INSERT WITH CHECK (
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
  FOR ALL USING (public.is_admin());

-- ── Store Config & CMS Policies ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Public view delivery districts" ON public.delivery_districts;
CREATE POLICY "Public view delivery districts" ON public.delivery_districts
  FOR SELECT USING (is_active = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage delivery districts" ON public.delivery_districts;
CREATE POLICY "Admins manage delivery districts" ON public.delivery_districts
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Public view store settings" ON public.store_settings;
CREATE POLICY "Public view store settings" ON public.store_settings
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Admins manage store settings" ON public.store_settings;
CREATE POLICY "Admins manage store settings" ON public.store_settings
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Public view homepage sections" ON public.homepage_sections;
CREATE POLICY "Public view homepage sections" ON public.homepage_sections
  FOR SELECT USING (is_enabled = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage homepage sections" ON public.homepage_sections;
CREATE POLICY "Admins manage homepage sections" ON public.homepage_sections
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Public view active banners" ON public.banners;
CREATE POLICY "Public view active banners" ON public.banners
  FOR SELECT USING (is_active = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage banners" ON public.banners;
CREATE POLICY "Admins manage banners" ON public.banners
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Public view content pages" ON public.content_pages;
CREATE POLICY "Public view content pages" ON public.content_pages
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Admins manage content pages" ON public.content_pages;
CREATE POLICY "Admins manage content pages" ON public.content_pages
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins manage print templates" ON public.print_templates;
CREATE POLICY "Admins manage print templates" ON public.print_templates
  FOR ALL USING (public.is_admin());

-- ==============================================================================
-- SECTION 8: COLUMN PRIVILEGE RESTRICTIONS (PURCHASE COST CONFIDENTIALITY)
-- ==============================================================================

-- 1. Protect product_variants.purchase_cost
REVOKE SELECT ON public.product_variants FROM anon, authenticated;
GRANT SELECT (
  id, product_id, sku, title, attributes, price, discount_price,
  stock_quantity, low_stock_threshold, stock_status, is_active, created_at, updated_at
) ON public.product_variants TO anon, authenticated;

-- 2. Protect order_items.purchase_cost
REVOKE SELECT ON public.order_items FROM anon, authenticated;
GRANT SELECT (
  id, order_id, product_id, variant_id, product_name, variant_title,
  sku, image_url, unit_price, quantity, total_price
) ON public.order_items TO anon, authenticated;

-- Service role retains full administrative access for trusted back-office calculations
GRANT ALL ON public.product_variants TO service_role;
GRANT ALL ON public.order_items TO service_role;
GRANT SELECT ON public.public_product_variants TO anon, authenticated, service_role;

-- ==============================================================================
-- SECTION 9: SUPABASE STORAGE BUCKETS & POLICIES
-- ==============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('products',     'products',     true,  5242880,  ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('banners',      'banners',      true,  10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('store-assets', 'store-assets', true,  5242880,  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
  ('avatars',      'avatars',      false, 2097152,  ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Products bucket policies (Public read, admin full CRUD)
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
CREATE POLICY "Public read product images" ON storage.objects
  FOR SELECT USING (bucket_id = 'products');

DROP POLICY IF EXISTS "Admins upload product images" ON storage.objects;
CREATE POLICY "Admins upload product images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'products' AND public.is_admin());

DROP POLICY IF EXISTS "Admins update product images" ON storage.objects;
CREATE POLICY "Admins update product images" ON storage.objects
  FOR UPDATE USING (bucket_id = 'products' AND public.is_admin());

DROP POLICY IF EXISTS "Admins delete product images" ON storage.objects;
CREATE POLICY "Admins delete product images" ON storage.objects
  FOR DELETE USING (bucket_id = 'products' AND public.is_admin());

-- Banners bucket policies (Public read, admin full CRUD)
DROP POLICY IF EXISTS "Public read banners" ON storage.objects;
CREATE POLICY "Public read banners" ON storage.objects
  FOR SELECT USING (bucket_id = 'banners');

DROP POLICY IF EXISTS "Admins upload banners" ON storage.objects;
CREATE POLICY "Admins upload banners" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'banners' AND public.is_admin());

DROP POLICY IF EXISTS "Admins update banners" ON storage.objects;
CREATE POLICY "Admins update banners" ON storage.objects
  FOR UPDATE USING (bucket_id = 'banners' AND public.is_admin());

DROP POLICY IF EXISTS "Admins delete banners" ON storage.objects;
CREATE POLICY "Admins delete banners" ON storage.objects
  FOR DELETE USING (bucket_id = 'banners' AND public.is_admin());

-- Store assets bucket policies (Public read, admin full CRUD)
DROP POLICY IF EXISTS "Public read store assets" ON storage.objects;
CREATE POLICY "Public read store assets" ON storage.objects
  FOR SELECT USING (bucket_id = 'store-assets');

DROP POLICY IF EXISTS "Admins upload store assets" ON storage.objects;
CREATE POLICY "Admins upload store assets" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'store-assets' AND public.is_admin());

DROP POLICY IF EXISTS "Admins update store assets" ON storage.objects;
CREATE POLICY "Admins update store assets" ON storage.objects
  FOR UPDATE USING (bucket_id = 'store-assets' AND public.is_admin());

DROP POLICY IF EXISTS "Admins delete store assets" ON storage.objects;
CREATE POLICY "Admins delete store assets" ON storage.objects
  FOR DELETE USING (bucket_id = 'store-assets' AND public.is_admin());

-- Avatars bucket policies (User reads/uploads/updates/deletes within own folder)
DROP POLICY IF EXISTS "Users read own avatar" ON storage.objects;
CREATE POLICY "Users read own avatar" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin()));

DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar" ON storage.objects
  FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ==============================================================================
-- SECTION 10: SEED DATA (Canonical 25 Districts & Store Defaults)
-- ==============================================================================

INSERT INTO public.delivery_districts (name, province, delivery_fee, is_active)
VALUES
  ('Colombo',       'Western',        350.00, TRUE),
  ('Gampaha',       'Western',        350.00, TRUE),
  ('Kalutara',      'Western',        350.00, TRUE),
  ('Kandy',         'Central',        450.00, TRUE),
  ('Matale',        'Central',        450.00, TRUE),
  ('Nuwara Eliya',  'Central',        450.00, TRUE),
  ('Galle',         'Southern',       450.00, TRUE),
  ('Matara',        'Southern',       450.00, TRUE),
  ('Hambantota',    'Southern',       450.00, TRUE),
  ('Jaffna',        'Northern',       500.00, TRUE),
  ('Kilinochchi',   'Northern',       500.00, TRUE),
  ('Mannar',        'Northern',       500.00, TRUE),
  ('Vavuniya',      'Northern',       500.00, TRUE),
  ('Mullaitivu',    'Northern',       500.00, TRUE),
  ('Batticaloa',    'Eastern',        500.00, TRUE),
  ('Ampara',        'Eastern',        500.00, TRUE),
  ('Trincomalee',   'Eastern',        500.00, TRUE),
  ('Kurunegala',    'North Western',  450.00, TRUE),
  ('Puttalam',      'North Western',  450.00, TRUE),
  ('Anuradhapura',  'North Central',  450.00, TRUE),
  ('Polonnaruwa',   'North Central',  450.00, TRUE),
  ('Badulla',       'Uva',            450.00, TRUE),
  ('Monaragala',    'Uva',            450.00, TRUE),
  ('Ratnapura',     'Sabaragamuwa',   450.00, TRUE),
  ('Kegalle',       'Sabaragamuwa',   450.00, TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.store_settings (key, value)
VALUES
  ('general', '{
    "store_name": "Splender Jewel",
    "tagline": "Timeless Elegance & Modern Luxury Jewelry",
    "currency": "LKR",
    "currency_symbol": "Rs.",
    "contact_email": "",
    "whatsapp_number": "+94764689907"
  }'::jsonb),
  ('delivery', '{
    "free_delivery_enabled": false,
    "free_delivery_threshold": 10000,
    "default_delivery_fee": 400
  }'::jsonb),
  ('payment', '{
    "cod_enabled": true,
    "bank_transfer_enabled": true,
    "whatsapp_number": "+94764689907",
    "bank_transfer_instructions": "Please contact us on WhatsApp to verify your bank transfer payment."
  }'::jsonb),
  ('seo', '{
    "default_meta_title": "Splender Jewel | Timeless Elegance & Luxury Jewelry",
    "default_meta_description": "Curated fine fashion jewelry for women and men. Gold-plated, tiger eye, pearl jewelry with islandwide delivery in Sri Lanka."
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;

SELECT 'Phase 1 migration completed successfully!' AS status;
