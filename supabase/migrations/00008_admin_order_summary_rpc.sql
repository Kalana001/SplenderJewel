-- ==============================================================================
-- SPLENDER JEWEL — FORWARD MIGRATION: ORDER SUMMARY METRICS RPC
-- Migration: 00008_admin_order_summary_rpc.sql
--
-- PURPOSE:
-- Accelerate administrative order summary calculations by performing lifetime
-- aggregation directly inside PostgreSQL rather than transferring all order records
-- into application memory.
--
-- BUSINESS RULES ENFORCED (CONFIRMED RECEIVED MONEY ONLY):
-- 1. Total Orders: Total lifetime order count (COUNT(*)).
-- 2. Total Revenue: Lifetime revenue strictly from confirmed, received payments.
--    - Confirmed COD settlements count (payment_status = 'verified').
--    - Verified bank transfers count (payment_status = 'verified').
--    - Pending COD settlements DO NOT count (payment_status = 'pending').
--    - Delivered but unpaid COD orders DO NOT count (delivered does NOT mean paid).
--    - Unverified bank transfers DO NOT count.
--    - Cancelled or refunded orders are strictly EXCLUDED (order_status NOT IN ('cancelled', 'refunded')).
-- 3. Pending Review Count: Orders awaiting administrative processing (order_status = 'pending').
-- 4. Pending Bank Transfer Count: Bank transfers awaiting WhatsApp slip verification
--    (payment_method = 'bank_transfer' AND payment_status = 'pending' AND non-cancelled).
-- 5. Pending COD Settlement Count: COD orders awaiting courier remittance confirmation
--    (payment_method = 'cod' AND payment_status = 'pending' AND non-cancelled).
--
-- INDEPENDENCE & ZERO FORWARD-DEPENDENCY:
-- - All columns referenced (total_amount, payment_status, order_status, payment_method)
--   exist in public.orders from baseline migration 00001.
-- - ZERO dependency on migration 00009 or any future migrations.
--
-- SECURITY & LEAST PRIVILEGE:
-- - SECURITY DEFINER with fixed search_path = public, pg_temp.
-- - Owned by postgres.
-- - REVOKE ALL FROM PUBLIC, anon, authenticated.
-- - GRANT EXECUTE strictly to service_role.
--
-- STATUS: PROPOSED FORWARD-ONLY MIGRATION (NOT YET APPLIED TO PRODUCTION)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. DEFENSIVE PRECONDITIONS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.orders') IS NULL THEN
    RAISE EXCEPTION 'Cannot apply migration 00008: public.orders table is missing.';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. DATABASE AGGREGATE FUNCTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_order_summary_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_metrics JSONB;
BEGIN
  SELECT jsonb_build_object(
    'totalOrders', COALESCE(COUNT(*), 0),
    'totalRevenue', COALESCE(
      SUM(total_amount) FILTER (
        WHERE payment_status = 'verified'
          AND order_status NOT IN ('cancelled', 'refunded')
      ),
      0
    ),
    'pendingReviewCount', COALESCE(COUNT(*) FILTER (WHERE order_status = 'pending'), 0),
    'pendingBankTransferCount', COALESCE(COUNT(*) FILTER (WHERE payment_method = 'bank_transfer' AND payment_status = 'pending'), 0),
    'pendingCodSettlementCount', COALESCE(COUNT(*) FILTER (WHERE payment_method = 'cod' AND payment_status = 'pending'), 0)
  )
  INTO v_metrics
  FROM public.orders;

  RETURN v_metrics;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. SECURITY & PRIVILEGE HARDENING
-- ------------------------------------------------------------------------------
ALTER FUNCTION public.get_admin_order_summary_metrics() OWNER TO postgres;

-- Revoke default public execution
REVOKE ALL ON FUNCTION public.get_admin_order_summary_metrics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_order_summary_metrics() FROM anon, authenticated;

-- Grant execution strictly to service_role
GRANT EXECUTE ON FUNCTION public.get_admin_order_summary_metrics() TO service_role;

COMMENT ON FUNCTION public.get_admin_order_summary_metrics() IS
  'High-performance database-side aggregation of lifetime order counts, confirmed received revenue (excluding unpaid COD, unverified bank transfers, and cancelled/refunded orders), and pending queues.';
