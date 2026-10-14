-- ==============================================================================
-- SPLENDER JEWEL — FORWARD MIGRATION: COD PAYMENT SETTLEMENT & AUDIT RPC
-- Migration: 00009_cod_payment_settlement.sql
--
-- PURPOSE:
-- 1. [DEFENSIVE PRECONDITIONS] Verify required tables exist (orders, payments, audit_logs, admin_users).
-- 2. [SCHEMA ENHANCEMENT] Add optional courier tracking & settlement metadata columns
--    to public.payments (courier_name, settlement_date).
-- 3. [ATOMIC COD SETTLEMENT RPC] Create public.confirm_cod_payment_settlement to
--    guarantee safe, single-transaction manual confirmation of COD funds received from courier:
--    - CRITICAL BUSINESS RULE: Delivered does NOT mean Paid.
--    - Enforces active administrator authorization (p_admin_id in public.admin_users WHERE is_active = true).
--    - Acquires row-level exclusive lock (FOR UPDATE) on target order to prevent race conditions.
--    - Prevents duplicate confirmation if payment_status is already 'verified'.
--    - Strictly rejects confirmation of cancelled or refunded orders.
--    - Enforces payment_method = 'cod'.
--    - Strictly requires order_status = 'delivered' before COD payment settlement can be confirmed.
--    - Updates orders.payment_status to 'verified' without mutating order_status (delivery status preserved).
--    - Upserts payments audit record with courier name, settlement reference, receipt date, and admin ID.
--    - Writes immutable record to public.audit_logs.
-- 4. [LEAST PRIVILEGE & SECURITY BOUNDARY]
--    - SECURITY DEFINER with fixed search_path = public, pg_temp.
--    - Owned by postgres.
--    - Revoked from PUBLIC, anon, and authenticated.
--    - Granted strictly to service_role.
--
-- STATUS: PROPOSED FORWARD-ONLY MIGRATION (NOT YET APPLIED TO PRODUCTION)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. DEFENSIVE PRECONDITIONS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.orders') IS NULL
     OR to_regclass('public.payments') IS NULL
     OR to_regclass('public.audit_logs') IS NULL
     OR to_regclass('public.admin_users') IS NULL
  THEN
    RAISE EXCEPTION 'Cannot apply migration 00009: one or more required tables (orders, payments, audit_logs, admin_users) are missing.';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. SCHEMA ENHANCEMENT: PAYMENTS COURIER & SETTLEMENT COLUMNS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'courier_name'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN courier_name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'settlement_date'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN settlement_date DATE;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. ATOMIC COD SETTLEMENT STORED PROCEDURE
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_cod_payment_settlement(
  p_order_id UUID,
  p_admin_id UUID,
  p_courier_name TEXT DEFAULT NULL,
  p_settlement_reference TEXT DEFAULT NULL,
  p_receipt_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order RECORD;
  v_admin_email TEXT;
  v_payment_id UUID;
  v_settlement_notes TEXT;
BEGIN
  -- 1. Validate Admin Authorization
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'Admin ID is required.';
  END IF;

  SELECT email INTO v_admin_email
  FROM public.admin_users
  WHERE id = p_admin_id AND is_active = TRUE;

  IF v_admin_email IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Administrator account is invalid or inactive.';
  END IF;

  -- 2. Row-Level Exclusive Lock on Target Order (Prevents race conditions & concurrent confirmations)
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  -- 3. Validate Order Eligibility & Status Integrity
  IF v_order.order_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot confirm COD payment for a cancelled order.';
  END IF;

  IF v_order.order_status = 'refunded' THEN
    RAISE EXCEPTION 'Cannot confirm COD payment for a refunded order.';
  END IF;

  IF v_order.payment_method <> 'cod' THEN
    RAISE EXCEPTION 'Order payment method is not Cash on Delivery (COD).';
  END IF;

  -- Prevent duplicate confirmations
  IF v_order.payment_status = 'verified' THEN
    RAISE EXCEPTION 'Payment for order % has already been confirmed as verified.', v_order.order_number;
  END IF;

  -- Strict delivery prerequisite: COD payment confirmation requires order to be marked delivered
  IF v_order.order_status <> 'delivered' THEN
    RAISE EXCEPTION 'Cannot confirm COD payment: order % is currently "%" and must be marked as "delivered" before COD payment settlement can be confirmed.', v_order.order_number, v_order.order_status;
  END IF;

  -- 4. Construct Settlement Audit Notes
  v_settlement_notes := CONCAT_WS(' | ',
    'COD Settlement Confirmed',
    CASE WHEN p_courier_name IS NOT NULL AND TRIM(p_courier_name) <> '' THEN 'Courier: ' || TRIM(p_courier_name) END,
    CASE WHEN p_settlement_reference IS NOT NULL AND TRIM(p_settlement_reference) <> '' THEN 'Ref: ' || TRIM(p_settlement_reference) END,
    CASE WHEN p_receipt_date IS NOT NULL THEN 'Receipt Date: ' || p_receipt_date::TEXT END,
    CASE WHEN p_notes IS NOT NULL AND TRIM(p_notes) <> '' THEN 'Notes: ' || TRIM(p_notes) END,
    'Confirmed by: ' || v_admin_email
  );

  -- 5. Update Order payment_status (CRITICAL: delivery/order_status remains UNCHANGED)
  UPDATE public.orders
  SET payment_status = 'verified',
      updated_at = NOW()
  WHERE id = p_order_id;

  -- 6. Upsert/Update public.payments Record
  SELECT id INTO v_payment_id
  FROM public.payments
  WHERE order_id = p_order_id
  LIMIT 1;

  IF v_payment_id IS NOT NULL THEN
    UPDATE public.payments
    SET status = 'verified',
        approved_by = p_admin_id,
        approved_at = NOW(),
        reference_number = COALESCE(NULLIF(TRIM(p_settlement_reference), ''), reference_number),
        notes = v_settlement_notes,
        courier_name = COALESCE(NULLIF(TRIM(p_courier_name), ''), courier_name),
        settlement_date = COALESCE(p_receipt_date, settlement_date, CURRENT_DATE),
        updated_at = NOW()
    WHERE id = v_payment_id;
  ELSE
    INSERT INTO public.payments (
      order_id,
      payment_method,
      amount,
      status,
      reference_number,
      approved_by,
      approved_at,
      notes,
      courier_name,
      settlement_date,
      created_at,
      updated_at
    ) VALUES (
      p_order_id,
      'cod',
      v_order.total_amount,
      'verified',
      NULLIF(TRIM(p_settlement_reference), ''),
      p_admin_id,
      NOW(),
      v_settlement_notes,
      NULLIF(TRIM(p_courier_name), ''),
      COALESCE(p_receipt_date, CURRENT_DATE),
      NOW(),
      NOW()
    );
  END IF;

  -- 7. Record Immutable Entry in public.audit_logs
  INSERT INTO public.audit_logs (
    admin_id,
    admin_email,
    action,
    resource_type,
    resource_id,
    details,
    created_at
  ) VALUES (
    p_admin_id,
    v_admin_email,
    'CONFIRM_COD_PAYMENT_SETTLEMENT',
    'ORDER',
    p_order_id::TEXT,
    jsonb_build_object(
      'order_id', p_order_id,
      'order_number', v_order.order_number,
      'amount', v_order.total_amount,
      'courier_name', p_courier_name,
      'settlement_reference', p_settlement_reference,
      'receipt_date', p_receipt_date,
      'admin_email', v_admin_email,
      'previous_payment_status', v_order.payment_status,
      'order_status', v_order.order_status
    ),
    NOW()
  );

  -- 8. Return Atomic Success Result
  RETURN jsonb_build_object(
    'success', TRUE,
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'amount', v_order.total_amount,
    'payment_status', 'verified',
    'order_status', v_order.order_status
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. FUNCTION SECURITY & PRIVILEGE HARDENING
-- ------------------------------------------------------------------------------
ALTER FUNCTION public.confirm_cod_payment_settlement(UUID, UUID, TEXT, TEXT, DATE, TEXT) OWNER TO postgres;

-- Revoke default execute permissions
REVOKE ALL ON FUNCTION public.confirm_cod_payment_settlement(UUID, UUID, TEXT, TEXT, DATE, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_cod_payment_settlement(UUID, UUID, TEXT, TEXT, DATE, TEXT) FROM anon, authenticated;

-- Grant execution strictly to service_role
GRANT EXECUTE ON FUNCTION public.confirm_cod_payment_settlement(UUID, UUID, TEXT, TEXT, DATE, TEXT) TO service_role;

COMMENT ON FUNCTION public.confirm_cod_payment_settlement(UUID, UUID, TEXT, TEXT, DATE, TEXT) IS
  'Atomic confirmation of COD courier payment settlement with row-level locking, strict delivery requirement, duplicate prevention, delivery status preservation, and audit logging.';
