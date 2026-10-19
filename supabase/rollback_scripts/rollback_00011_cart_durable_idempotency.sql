-- ==============================================================================
-- SPLENDER JEWEL — ROLLBACK SCRIPT FOR MIGRATION 00011
-- ==============================================================================
-- Target: Rollback public.deduct_purchased_cart_items, public.merge_guest_cart,
--         and public.cart_idempotency_records.
-- ==============================================================================

DROP FUNCTION IF EXISTS public.deduct_purchased_cart_items(UUID, TEXT);
DROP FUNCTION IF EXISTS public.deduct_purchased_cart_items(UUID, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.merge_guest_cart(UUID, JSONB, TEXT);
DROP TABLE IF EXISTS public.cart_idempotency_records CASCADE;
