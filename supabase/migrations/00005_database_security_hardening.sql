-- ==============================================================================
-- SPLENDER JEWEL — FORWARD MIGRATION: DATABASE SECURITY HARDENING
-- Migration: 00005_database_security_hardening.sql
--
-- PURPOSE:
-- Remediation of Supabase Security Advisor findings:
-- 1. [FUNCTION EXECUTION PRIVILEGES] Revoke default PUBLIC execution privileges from
--    sensitive internal functions and triggers:
--    - public.generate_order_number() (restricted strictly to service_role)
--    - public.handle_new_user() (trigger-only, revoked from client roles)
--    - public.protect_profile_fields() (trigger-only, revoked from client roles)
--    - public.set_updated_at() (trigger-only, revoked from client roles)
--    - public.adjust_variant_stock() (restricted strictly to service_role)
-- 2. [ADMIN EVALUATION PRIVILEGE] Revoke public.is_admin() from anon, granting strictly
--    to authenticated and service_role for RLS policy evaluation.
-- 3. [SEARCH PATH IMMUTABILITY] Explicitly enforce fixed search_path = public, pg_temp
--    on all security definer functions to prevent search path hijacking.
-- 4. [SEQUENCE ISOLATION] Revoke direct sequence usage on public.order_number_seq from
--    client roles, granting strictly to service_role.
--
-- EXECUTION STATUS: PREPARED FOR APPLICANT (ZERO UNAPPROVED EXECUTION)
-- ==============================================================================

-- 1. Harden public.generate_order_number()
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

-- Harden sequence permissions
REVOKE ALL ON SEQUENCE public.order_number_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.order_number_seq TO service_role;

-- 2. Harden public.handle_new_user() (Auth trigger on auth.users)
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

-- 3. Harden public.protect_profile_fields() (Trigger on public.profiles)
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

ALTER FUNCTION public.protect_profile_fields() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.protect_profile_fields() FROM PUBLIC, anon, authenticated;

-- 4. Harden public.set_updated_at() (Generic timestamp trigger)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

ALTER FUNCTION public.set_updated_at() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- 5. Harden public.is_admin() (RLS security evaluator)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = auth.uid() AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

ALTER FUNCTION public.is_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- 6. Harden public.adjust_variant_stock() (Privileged inventory adjustment)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'adjust_variant_stock'
  ) THEN
    ALTER FUNCTION public.adjust_variant_stock(UUID, INT, TEXT, TEXT, UUID) OWNER TO postgres;
    REVOKE ALL ON FUNCTION public.adjust_variant_stock(UUID, INT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.adjust_variant_stock(UUID, INT, TEXT, TEXT, UUID) TO service_role;
  END IF;
END $$;
