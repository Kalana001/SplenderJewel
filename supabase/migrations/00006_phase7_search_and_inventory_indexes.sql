-- =============================================================================
-- SPLENDER JEWEL — PHASE 7: SEARCH & INVENTORY PERFORMANCE INDEXES
-- Migration: 00006_phase7_search_and_inventory_indexes.sql
-- Status: PROPOSED FORWARD-ONLY MIGRATION (DO NOT EXECUTE ON PRODUCTION WITHOUT APPROVAL)
-- =============================================================================
--
-- PURPOSE:
-- Accelerate search queries, pagination, and inventory movement ledger lookups
-- as the product catalog and customer traffic scale.
--
-- INDEXES INCLUDED:
-- 1. products(product_code): B-tree index for exact & prefix SKU lookups.
-- 2. products(created_at DESC): B-tree index for catalog listing and "newest" sort order.
-- 3. inventory_movements(variant_id, created_at DESC): Composite B-tree index for
--    high-performance audit trail retrieval in getVariantMovementHistoryAction.
-- 4. pg_trgm extension & GIN indexes on products(name) and product_variants(sku):
--    Enables high-speed substring (ILIKE '%query%') search without full table scans.
-- =============================================================================

-- Enable pg_trgm extension for trigram substring indexing
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Index on products.product_code
-- Accelerates searches by base product code and admin SKU filtering
CREATE INDEX IF NOT EXISTS idx_products_product_code 
  ON public.products (product_code);

-- 2. Index on products.created_at (descending)
-- Accelerates default storefront sorting (new arrivals) and admin catalog pagination
CREATE INDEX IF NOT EXISTS idx_products_created_at_desc 
  ON public.products (created_at DESC);

-- 3. Composite index on inventory_movements(variant_id, created_at DESC)
-- Dramatically speeds up the inventory ledger history queries executed when an
-- administrator selects a variant in /admin/inventory
CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant_created 
  ON public.inventory_movements (variant_id, created_at DESC);

-- 4. Trigram GIN index on products.name
-- Accelerates fuzzy and partial-match searches (ILIKE '%query%') in both the
-- admin inventory search and storefront search
CREATE INDEX IF NOT EXISTS idx_products_name_trgm 
  ON public.products USING gin (name gin_trgm_ops);

-- 5. Trigram GIN index on product_variants.sku
-- Accelerates variant SKU partial searches (e.g. searching "RNG-001" or "SZ7")
CREATE INDEX IF NOT EXISTS idx_product_variants_sku_trgm 
  ON public.product_variants USING gin (sku gin_trgm_ops);

-- =============================================================================
-- End of 00006_phase7_search_and_inventory_indexes.sql
-- =============================================================================
