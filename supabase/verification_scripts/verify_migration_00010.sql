-- ==============================================================================
-- SPLENDER JEWEL — POST-MIGRATION 00010 VERIFICATION SCRIPT (READ-ONLY)
-- File: supabase/verification_scripts/verify_migration_00010.sql
-- Description: Diagnostic queries to verify successful application of Migration 00010.
-- ==============================================================================

-- 1. Verify procedure existence, exact 3-argument signature, and security definer
SELECT
  p.proname AS procedure_name,
  pg_get_function_arguments(p.oid) AS argument_signature,
  pg_get_function_result(p.oid) AS return_type,
  p.prosecdef AS is_security_definer,
  r.rolname AS owner_role
FROM pg_proc p
JOIN pg_roles r ON r.oid = p.proowner
WHERE p.proname = 'process_order_checkout'
  AND p.pronamespace = 'public'::regnamespace;

-- Expected:
--   proname: process_order_checkout
--   argument_signature: p_order_data jsonb, p_items_data jsonb, p_coupon_code text DEFAULT NULL::text
--   return_type: jsonb
--   is_security_definer: true
--   owner_role: postgres

-- 2. Verify absence of invalid 2-argument overloaded procedure
SELECT
  to_regprocedure('public.process_order_checkout(jsonb,jsonb)') AS two_arg_overload_must_be_null;

-- 3. Verify strict execution privilege isolation (service_role ONLY)
SELECT
  has_function_privilege('anon', 'public.process_order_checkout(jsonb,jsonb,text)', 'EXECUTE') AS anon_has_execute,
  has_function_privilege('authenticated', 'public.process_order_checkout(jsonb,jsonb,text)', 'EXECUTE') AS authenticated_has_execute,
  has_function_privilege('service_role', 'public.process_order_checkout(jsonb,jsonb,text)', 'EXECUTE') AS service_role_has_execute;

-- Expected:
--   anon_has_execute: false
--   authenticated_has_execute: false
--   service_role_has_execute: true

-- 4. Verify presence of tier pricing calculation logic and inventory parity in procedure body
SELECT
  p.proname,
  (p.prosrc ILIKE '%v_payment_method = ''bank_transfer''%') AS has_bank_transfer_rule,
  (p.prosrc ILIKE '%v_delivery_fee := 200.00%') AS has_speed_post_tier1,
  (p.prosrc ILIKE '%v_delivery_fee := 250.00%') AS has_speed_post_tier2,
  (p.prosrc ILIKE '%v_delivery_fee := 350.00%') AS has_speed_post_tier3,
  (p.prosrc ILIKE '%v_delivery_fee := 400.00%') AS has_cod_tier2,
  (p.prosrc ILIKE '%v_delivery_fee := 500.00%') AS has_cod_tier3,
  (p.prosrc ILIKE '%v_total_quantity_bigint%') AS has_bigint_quantity_aggregation,
  (p.prosrc ILIKE '%v_total_quantity_bigint <> v_inventory_deducted_quantity%') AS has_inventory_parity_assertion,
  (p.prosrc ILIKE '%SELECT delivery_fee%FROM public.delivery_districts%') AS has_old_district_fee_lookup_must_be_false,
  md5(p.prosrc) AS installed_function_prosrc_md5
FROM pg_proc p
WHERE p.proname = 'process_order_checkout'
  AND p.pronamespace = 'public'::regnamespace;
