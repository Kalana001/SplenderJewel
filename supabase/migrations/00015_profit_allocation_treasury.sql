-- -----------------------------------------------------------------------------
-- SPLENDER JEWEL — MIGRATION 00015: PROFIT ALLOCATION & TREASURY
-- -----------------------------------------------------------------------------
-- Documents the Profit Allocation & Treasury system.
-- Stores category percentage allocations (max 100%) and logged disbursements
-- inside public.store_settings (key: 'profit_allocation_treasury').
-- -----------------------------------------------------------------------------

-- Pre-seed default profit allocation categories if not already present
INSERT INTO public.store_settings (key, value)
VALUES (
  'profit_allocation_treasury',
  jsonb_build_object(
    'categories', jsonb_build_array(
      jsonb_build_object('id', 'cat-inv-reinvest', 'name', 'Inventory & Stock Reinvestment', 'percentage', 55, 'color', '#d4af37', 'createdAt', now()),
      jsonb_build_object('id', 'cat-marketing', 'name', 'Marketing & Advertisements', 'percentage', 15, 'color', '#3b82f6', 'createdAt', now()),
      jsonb_build_object('id', 'cat-owner-draw', 'name', 'Owner Drawings / Profit', 'percentage', 10, 'color', '#10b981', 'createdAt', now()),
      jsonb_build_object('id', 'cat-emergency-res', 'name', 'Emergency & Reserve Fund', 'percentage', 10, 'color', '#f59e0b', 'createdAt', now()),
      jsonb_build_object('id', 'cat-church-fees', 'name', 'Church Fees', 'percentage', 10, 'color', '#8b5cf6', 'createdAt', now())
    ),
    'expenses', jsonb_build_array()
  )
)
ON CONFLICT (key) DO NOTHING;
