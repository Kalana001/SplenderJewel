-- ==============================================================================
-- SPLENDER JEWEL — MIGRATION 00012: ATOMIC ORDER STATUS UPDATE & AUDIT HISTORY
-- ==============================================================================
-- Purpose:
-- 1. Eliminate the two-step network race condition between updating public.orders
--    and inserting into public.order_status_history.
-- 2. Provide public.update_order_status_with_audit(UUID, UUID, TEXT, TEXT):
--    - Single-transaction atomic execution.
--    - Strict administrator authorization verification (active admin user check).
--    - Row-level lock (FOR UPDATE) on target order to prevent concurrent overwrites.
--    - Business lifecycle validation: prohibits reopening cancelled orders.
--    - Seamless delegation to cancel_order_and_restock(p_order_id, p_admin_id, p_notes)
--      when target status is 'cancelled'.
--    - Idempotent: repeated identical status requests return success without duplicate history.
--    - Atomic transaction: if status update or audit insertion fails, entire transaction rolls back.
-- 3. Strict least-privilege security:
--    - SECURITY DEFINER with search_path = public, pg_temp.
--    - PostgREST service_role compatible runtime check: rejects anon and authenticated callers.
--    - Does not assume session_user = service_role (in PostgREST, session_user is 'authenticator').
--    - EXECUTE granted strictly to service_role; revoked from PUBLIC, anon, authenticated.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.update_order_status_with_audit(
  p_order_id UUID,
  p_admin_id UUID,
  p_new_status TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_email TEXT;
  v_order RECORD;
  v_previous_status TEXT;
  v_clean_status TEXT;
  v_allowed_statuses TEXT[] := ARRAY['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
BEGIN
  -- 0. Runtime role check: restrict execution strictly to trusted server-side roles
  -- Supabase PostgREST compatibility:
  -- PostgREST connects as session_user 'authenticator' and executes SET LOCAL ROLE service_role.
  -- Thus session_user is NOT 'service_role'. We check request.jwt.claim.role and current_setting('role').
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') IN ('anon', 'authenticated')
     OR (
       COALESCE(NULLIF(current_setting('role', true), 'none'), current_user) NOT IN ('service_role', 'postgres', 'supabase_admin')
       AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     )
  THEN
    RAISE EXCEPTION 'permission denied for function update_order_status_with_audit'
      USING ERRCODE = '42501';
  END IF;

  -- 1. Input validations
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order ID is required.';
  END IF;

  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'Administrator ID is required.';
  END IF;

  v_clean_status := LOWER(TRIM(COALESCE(p_new_status, '')));
  IF v_clean_status = '' OR NOT (v_clean_status = ANY(v_allowed_statuses)) THEN
    RAISE EXCEPTION 'Invalid target order status specified: %', p_new_status;
  END IF;

  -- 2. Verify active administrator
  SELECT email INTO v_admin_email
  FROM public.admin_users
  WHERE id = p_admin_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: active administrator account not found.';
  END IF;

  -- 3. Row-level lock on target order
  SELECT id, order_number, order_status INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target order not found.';
  END IF;

  v_previous_status := v_order.order_status;

  -- 4. Idempotent check: if status is already identical, return success without duplicate audit log
  IF v_previous_status = v_clean_status THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'previous_status', v_previous_status,
      'new_status', v_clean_status
    );
  END IF;

  -- 5. Terminal status guard: cancelled orders cannot be reopened or transitioned
  IF v_previous_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled orders cannot be reopened or transitioned to another status.';
  END IF;

  -- 6. Delegation for order cancellation: invoke atomic inventory restock procedure
  IF v_clean_status = 'cancelled' THEN
    RETURN public.cancel_order_and_restock(p_order_id, p_admin_id, p_notes);
  END IF;

  -- 7. Atomic update + history insert in single transaction
  UPDATE public.orders
  SET
    order_status = v_clean_status,
    updated_at = NOW()
  WHERE id = v_order.id;

  INSERT INTO public.order_status_history (
    order_id,
    previous_status,
    new_status,
    changed_by,
    notes
  ) VALUES (
    v_order.id,
    v_previous_status,
    v_clean_status,
    p_admin_id,
    COALESCE(NULLIF(TRIM(p_notes), ''), 'Status updated to ' || v_clean_status || ' by admin (' || v_admin_email || ')')
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'previous_status', v_previous_status,
    'new_status', v_clean_status
  );
END;
$$;

-- Revoke all execution permissions from public and client-facing roles
REVOKE ALL ON FUNCTION public.update_order_status_with_audit(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Grant execution strictly to service_role
GRANT EXECUTE ON FUNCTION public.update_order_status_with_audit(UUID, UUID, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.update_order_status_with_audit(UUID, UUID, TEXT, TEXT) IS 'Atomic single-transaction administrative order status transition procedure with row-level locking, state-machine validation, cancellation delegation, and audit logging. Restricted strictly to service_role.';

COMMIT;
