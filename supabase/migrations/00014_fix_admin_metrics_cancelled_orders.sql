-- ==============================================================================
-- SPLENDER JEWEL — FORWARD MIGRATION: FIX ADMIN METRICS CANCELLED ORDERS
-- Migration: 00014_fix_admin_metrics_cancelled_orders.sql
--
-- PURPOSE:
-- Update public.get_admin_order_summary_metrics() to strictly exclude
-- cancelled and refunded orders from pending payment counts:
-- - pendingBankTransferCount (bank_transfer + pending + non-cancelled/refunded)
-- - pendingCodSettlementCount (cod + pending + non-cancelled/refunded)
--
-- RATIONALE:
-- In Splender Jewel's transactional lifecycle, cancelled COD and Bank Transfer
-- orders retain payment_status = 'pending' for financial audit immutability.
-- They must NOT be counted in active administrative pending queues.
--
-- DEFENSIVE & IDEMPOTENT:
-- 1. Checks that public.orders table exists before proceeding.
-- 2. Fully idempotent via CREATE OR REPLACE FUNCTION.
-- 3. Does not alter or delete any existing table rows, orders, or payments.
-- 4. Aligns database RPC logic identically with TypeScript fallback queries.
-- 5. Strictly preserves SECURITY DEFINER, postgres ownership, search_path,
--    and service_role execution privileges.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. DEFENSIVE PRECONDITIONS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.orders') IS NULL THEN
    RAISE EXCEPTION 'Cannot apply migration 00014: public.orders table is missing.';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. DATABASE AGGREGATE FUNCTION WITH EXCLUSION OF CANCELLED / REFUNDED ORDERS
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
    'pendingReviewCount', COALESCE(
      COUNT(*) FILTER (WHERE order_status = 'pending'),
      0
    ),
    'pendingBankTransferCount', COALESCE(
      COUNT(*) FILTER (
        WHERE payment_method = 'bank_transfer'
          AND payment_status = 'pending'
          AND order_status NOT IN ('cancelled', 'refunded')
      ),
      0
    ),
    'pendingCodSettlementCount', COALESCE(
      COUNT(*) FILTER (
        WHERE payment_method = 'cod'
          AND payment_status = 'pending'
          AND order_status NOT IN ('cancelled', 'refunded')
      ),
      0
    )
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
  'High-performance database-side aggregation of lifetime order counts, confirmed received revenue (excluding unpaid COD, unverified bank transfers, and cancelled/refunded orders), and active non-cancelled pending queues.';
