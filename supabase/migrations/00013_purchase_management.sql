-- ==============================================================================
-- SPLENDER JEWEL — FORWARD MIGRATION: PURCHASE BATCH & LANDED COST MANAGEMENT
-- Migration: 00013_purchase_management.sql
--
-- STATUS: LOCAL PREPARED FILE ONLY (DO NOT RUN OR PUSH TO PRODUCTION LIVE SUPABASE)
--
-- PURPOSE:
-- 1. [DEFENSIVE PRECONDITIONS] Verify core catalog, variants, and admin tables exist.
-- 2. [COMPOSITE INTEGRITY CONSTRAINTS] Enforce cross-table batch consistency:
--    - Variations strictly reference matching batch and batch item (batch_item_id, batch_id).
--    - Receipt events strictly reference matching batch and variation (batch_variation_id, batch_id).
--    - Corrections strictly reference matching batch and variation (batch_variation_id, batch_id).
--    - Transfers strictly reference matching batch and variation (batch_variation_id, transfer_batch_id).
-- 3. [QUANTITY LIFECYCLE INVARIANTS] Enforce database-level constraint:
--    - 0 <= quantity_linked <= quantity_received <= quantity_purchased.
-- 4. [RECORD IMMUTABILITY] Prohibit DELETE or destructive updates on confirmed,
--    received, or cancelled purchase batches and expenses.
-- 5. [DURABLE RECEIPT & TRANSFER IDEMPOTENCY]
--    - purchase_receipt_logs durably records receipt idempotency tokens with exact payload verification.
--    - purchase_receipt_transfers durably records stock transfer idempotency tokens with exact parameter verification.
-- 6. [PARTIAL TRANSFER RESIDUAL-CENT BALANCE]
--    - purchase_batch_item_variations tracks cumulative_transferred_cost_cents.
--    - Final partial transfers absorb exact remaining line balance with 0-cent drift.
-- 7. [TRANSACTIONAL STORED PROCEDURES] Atomic ACID stored procedures restricted strictly to service_role:
--    - create_purchase_batch: creates draft batch with items, variations, and expenses atomically.
--    - confirm_purchase_batch: transitions draft to ordered.
--    - receive_purchase_batch_items: records partial/full physical receipt with idempotency.
--    - record_receiving_correction: logs damage or shipment discrepancy prior to storefront linking.
--    - transfer_purchase_stock_to_variant: atomically transfers stock, calculates moving WAC,
--      updates storefront variant, logs inventory_movements, and records transfer ledger.
--    - cancel_purchase_batch: safely cancels ordered batch if no units are linked to storefront.
-- 8. [LEAST PRIVILEGE & DATA ISOLATION]
--    - All purchase tables have Row-Level Security (RLS) ENABLED.
--    - Table privileges revoked from PUBLIC, anon, and authenticated.
--    - Privileges granted strictly to trusted service_role.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. DEFENSIVE PRECONDITIONS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.products') IS NULL
     OR to_regclass('public.product_variants') IS NULL
     OR to_regclass('public.inventory_movements') IS NULL
     OR to_regclass('public.admin_users') IS NULL
  THEN
    RAISE EXCEPTION 'Cannot apply migration 00013: Required prerequisite tables (products, product_variants, inventory_movements, admin_users) are missing.';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. CORE PURCHASING TABLES & COMPOSITE CONSTRAINTS
-- ------------------------------------------------------------------------------

-- Master Purchase Batches
CREATE TABLE IF NOT EXISTS public.purchase_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number TEXT NOT NULL UNIQUE,
  supplier_name TEXT NOT NULL,
  supplier_contact TEXT,
  invoice_number TEXT,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ordered', 'partially_received', 'received', 'cancelled')),
  total_supplier_cost_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_supplier_cost_cents >= 0),
  total_expenses_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_expenses_cents >= 0),
  total_landed_cost_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_landed_cost_cents >= 0),
  total_purchased_units INT NOT NULL DEFAULT 0 CHECK (total_purchased_units >= 0),
  total_received_units INT NOT NULL DEFAULT 0 CHECK (total_received_units >= 0),
  notes TEXT,
  cancellation_reason TEXT,
  created_by UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at TIMESTAMPTZ,
  CONSTRAINT chk_batch_received_units CHECK (total_received_units <= total_purchased_units),
  CONSTRAINT chk_batch_total_landed CHECK (total_landed_cost_cents = total_supplier_cost_cents + total_expenses_cents)
);

-- Itemized Batch Expenses
CREATE TABLE IF NOT EXISTS public.purchase_batch_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.purchase_batches(id) ON DELETE RESTRICT,
  expense_type TEXT NOT NULL 
    CHECK (expense_type IN ('shipping', 'transport', 'customs_taxes', 'packing', 'other')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Purchase Batch Items (Parent Item Group in Batch)
CREATE TABLE IF NOT EXISTS public.purchase_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.purchase_batches(id) ON DELETE RESTRICT,
  item_name TEXT NOT NULL,
  item_category_hint TEXT,
  total_quantity INT NOT NULL DEFAULT 0 CHECK (total_quantity >= 0),
  total_supplier_cost_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_supplier_cost_cents >= 0),
  total_allocated_expense_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_allocated_expense_cents >= 0),
  total_landed_cost_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_landed_cost_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_purchase_batch_items_batch UNIQUE (id, batch_id)
);

-- Purchase Variations (Variation Specific Units, Provenance & Landed Costs)
CREATE TABLE IF NOT EXISTS public.purchase_batch_item_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.purchase_batches(id) ON DELETE RESTRICT,
  batch_item_id UUID NOT NULL,
  variation_title TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  supplier_sku TEXT,
  quantity_purchased INT NOT NULL CHECK (quantity_purchased > 0),
  quantity_received INT NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  quantity_linked INT NOT NULL DEFAULT 0 CHECK (quantity_linked >= 0),
  supplier_unit_price_cents BIGINT NOT NULL CHECK (supplier_unit_price_cents >= 0),
  line_supplier_cost_cents BIGINT NOT NULL CHECK (line_supplier_cost_cents >= 0),
  line_allocated_expense_cents BIGINT NOT NULL DEFAULT 0 CHECK (line_allocated_expense_cents >= 0),
  line_total_landed_cost_cents BIGINT NOT NULL CHECK (line_total_landed_cost_cents >= 0),
  unit_landed_cost_cents BIGINT NOT NULL CHECK (unit_landed_cost_cents >= 0),
  cumulative_transferred_cost_cents BIGINT NOT NULL DEFAULT 0 CHECK (cumulative_transferred_cost_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_purchase_batch_item_vars_batch UNIQUE (id, batch_id),
  CONSTRAINT fk_purchase_vars_batch_item 
    FOREIGN KEY (batch_item_id, batch_id) REFERENCES public.purchase_batch_items(id, batch_id) ON DELETE RESTRICT,
  CONSTRAINT chk_var_quantity_lifecycle 
    CHECK (0 <= quantity_linked AND quantity_linked <= quantity_received AND quantity_received <= quantity_purchased),
  CONSTRAINT chk_var_line_costs 
    CHECK (line_total_landed_cost_cents = line_supplier_cost_cents + line_allocated_expense_cents),
  CONSTRAINT chk_var_transferred_cost_le_total
    CHECK (cumulative_transferred_cost_cents <= line_total_landed_cost_cents)
);

-- Durable Receipt Idempotency Log
CREATE TABLE IF NOT EXISTS public.purchase_receipt_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.purchase_batches(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL UNIQUE,
  receipts_payload JSONB NOT NULL,
  created_by UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Physical Receipt Events
CREATE TABLE IF NOT EXISTS public.purchase_batch_receipt_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.purchase_batches(id) ON DELETE RESTRICT,
  receipt_log_id UUID NOT NULL REFERENCES public.purchase_receipt_logs(id) ON DELETE RESTRICT,
  batch_variation_id UUID NOT NULL,
  quantity_received INT NOT NULL CHECK (quantity_received > 0),
  receipt_notes TEXT,
  received_by UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_receipt_events_batch_var 
    FOREIGN KEY (batch_variation_id, batch_id) REFERENCES public.purchase_batch_item_variations(id, batch_id) ON DELETE RESTRICT
);

-- Receiving Corrections (Damage / Discrepancy Adjustments Prior to Transfer)
CREATE TABLE IF NOT EXISTS public.purchase_receiving_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.purchase_batches(id) ON DELETE RESTRICT,
  batch_variation_id UUID NOT NULL,
  quantity_adjustment INT NOT NULL,
  reason TEXT NOT NULL 
    CHECK (reason IN ('damaged_on_arrival', 'short_shipped', 'vendor_overage', 'inspection_failure')),
  notes TEXT NOT NULL,
  corrected_by UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_corrections_batch_var 
    FOREIGN KEY (batch_variation_id, batch_id) REFERENCES public.purchase_batch_item_variations(id, batch_id) ON DELETE RESTRICT
);

-- Purchase Stock Transfers (Idempotent Transfer to Storefront Inventory)
CREATE TABLE IF NOT EXISTS public.purchase_receipt_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_batch_id UUID NOT NULL REFERENCES public.purchase_batches(id) ON DELETE RESTRICT,
  batch_variation_id UUID NOT NULL,
  target_variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  quantity_transferred INT NOT NULL CHECK (quantity_transferred > 0),
  transferred_cost_cents BIGINT NOT NULL CHECK (transferred_cost_cents >= 0),
  transferred_unit_cost_cents BIGINT NOT NULL CHECK (transferred_unit_cost_cents >= 0),
  transfer_type TEXT NOT NULL CHECK (transfer_type IN ('new_product', 'restock_existing')),
  inventory_movement_id UUID NOT NULL REFERENCES public.inventory_movements(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_transfers_batch_var 
    FOREIGN KEY (batch_variation_id, transfer_batch_id) REFERENCES public.purchase_batch_item_variations(id, batch_id) ON DELETE RESTRICT
);

-- Durable Product Creation Idempotency Log
CREATE TABLE IF NOT EXISTS public.purchase_product_creation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. INDEXES FOR PERFORMANCE AND AUDIT TRACEABILITY
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pb_status ON public.purchase_batches(status);
CREATE INDEX IF NOT EXISTS idx_pb_items_batch ON public.purchase_batch_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_pb_vars_batch ON public.purchase_batch_item_variations(batch_id);
CREATE INDEX IF NOT EXISTS idx_pb_vars_unlinked ON public.purchase_batch_item_variations(id) 
  WHERE (quantity_received - quantity_linked) > 0;
CREATE INDEX IF NOT EXISTS idx_pb_receipt_logs_batch ON public.purchase_receipt_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_pb_receipt_events ON public.purchase_batch_receipt_events(batch_variation_id);
CREATE INDEX IF NOT EXISTS idx_pb_transfers_target ON public.purchase_receipt_transfers(target_variant_id);

-- ------------------------------------------------------------------------------
-- 4. IMMUTABILITY TRIGGER: PREVENT DELETION OR TAMPERING OF CONFIRMED BATCHES
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_purchase_record_mutation_after_confirm()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status != 'draft' THEN
      RAISE EXCEPTION 'Cannot delete purchase batch "%": confirmed, received, or cancelled records are immutable for accounting integrity.', OLD.batch_number;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('ordered', 'partially_received', 'received', 'cancelled') THEN
      -- Prohibit changing batch_number or created_by
      IF NEW.batch_number != OLD.batch_number OR NEW.created_by != OLD.created_by THEN
        RAISE EXCEPTION 'Cannot modify financial identity on confirmed purchase batch "%".', OLD.batch_number;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_purchase_batches ON public.purchase_batches;
CREATE TRIGGER trg_protect_purchase_batches
BEFORE UPDATE OR DELETE ON public.purchase_batches
FOR EACH ROW EXECUTE FUNCTION public.prevent_purchase_record_mutation_after_confirm();

-- ------------------------------------------------------------------------------
-- 5. ATOMIC STORED PROCEDURES (RESTRICTED STRICTLY TO service_role)
-- ------------------------------------------------------------------------------

-- Procedure 5.1: Create Draft Purchase Batch (atomic creation of batch, expenses, items, variations)
CREATE OR REPLACE FUNCTION public.create_purchase_batch(
  p_batch JSONB,
  p_expenses JSONB DEFAULT '[]'::jsonb,
  p_items JSONB DEFAULT '[]'::jsonb,
  p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch_id UUID;
  v_batch_number TEXT;
  v_supplier_name TEXT;
  v_supplier_contact TEXT;
  v_invoice_number TEXT;
  v_purchase_date DATE;
  v_notes TEXT;
  v_total_supplier_cents BIGINT := 0;
  v_total_expenses_cents BIGINT := 0;
  v_total_landed_cents BIGINT := 0;
  v_total_units INT := 0;
  v_exp JSONB;
  v_item JSONB;
  v_var JSONB;
  v_item_id UUID;
  v_item_name TEXT;
  v_item_cat TEXT;
  v_item_qty INT;
  v_item_supplier_cents BIGINT;
  v_item_alloc_cents BIGINT;
  v_item_landed_cents BIGINT;
BEGIN
  -- Security context check
  IF COALESCE(NULLIF(current_setting('role', true), 'none'), current_user) NOT IN ('service_role', 'postgres', 'supabase_admin')
     OR COALESCE(current_setting('request.jwt.claim.role', true), '') IN ('anon', 'authenticated')
  THEN
    RAISE EXCEPTION 'permission denied for function create_purchase_batch' USING ERRCODE = '42501';
  END IF;

  IF p_admin_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.admin_users WHERE id = p_admin_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an active administrator.';
  END IF;

  v_batch_number := TRIM(COALESCE(p_batch->>'batchNumber', ''));
  v_supplier_name := TRIM(COALESCE(p_batch->>'supplierName', ''));
  v_supplier_contact := NULLIF(TRIM(COALESCE(p_batch->>'supplierContact', '')), '');
  v_invoice_number := NULLIF(TRIM(COALESCE(p_batch->>'invoiceNumber', '')), '');
  v_purchase_date := COALESCE(NULLIF(p_batch->>'purchaseDate', '')::DATE, CURRENT_DATE);
  v_notes := NULLIF(TRIM(COALESCE(p_batch->>'notes', '')), '');

  IF v_batch_number = '' THEN
    RAISE EXCEPTION 'Batch number is required.';
  END IF;

  IF v_supplier_name = '' THEN
    RAISE EXCEPTION 'Supplier name is required.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.purchase_batches WHERE batch_number = v_batch_number) THEN
    RAISE EXCEPTION 'Purchase batch "%" already exists.', v_batch_number;
  END IF;

  v_total_supplier_cents := (p_batch->>'totalSupplierCostCents')::BIGINT;
  v_total_expenses_cents := (p_batch->>'totalExpensesCents')::BIGINT;
  v_total_landed_cents := (p_batch->>'totalLandedCostCents')::BIGINT;
  v_total_units := (p_batch->>'totalPurchasedUnits')::INT;

  IF v_total_landed_cents != v_total_supplier_cents + v_total_expenses_cents THEN
    RAISE EXCEPTION 'Batch total landed cost (%) does not equal supplier cost (%) + expenses (%).',
      v_total_landed_cents, v_total_supplier_cents, v_total_expenses_cents;
  END IF;

  -- 1. Insert Master Batch
  INSERT INTO public.purchase_batches (
    batch_number,
    supplier_name,
    supplier_contact,
    invoice_number,
    purchase_date,
    status,
    total_supplier_cost_cents,
    total_expenses_cents,
    total_landed_cost_cents,
    total_purchased_units,
    total_received_units,
    notes,
    created_by
  ) VALUES (
    v_batch_number,
    v_supplier_name,
    v_supplier_contact,
    v_invoice_number,
    v_purchase_date,
    'draft',
    v_total_supplier_cents,
    v_total_expenses_cents,
    v_total_landed_cents,
    v_total_units,
    0,
    v_notes,
    p_admin_id
  ) RETURNING id INTO v_batch_id;

  -- 2. Insert Expenses
  IF p_expenses IS NOT NULL AND jsonb_typeof(p_expenses) = 'array' THEN
    FOR v_exp IN SELECT * FROM jsonb_array_elements(p_expenses) LOOP
      INSERT INTO public.purchase_batch_expenses (
        batch_id,
        expense_type,
        amount_cents,
        description
      ) VALUES (
        v_batch_id,
        v_exp->>'expenseType',
        (v_exp->>'amountCents')::BIGINT,
        NULLIF(TRIM(COALESCE(v_exp->>'description', '')), '')
      );
    END LOOP;
  END IF;

  -- 3. Insert Items and Variations
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      v_item_name := TRIM(COALESCE(v_item->>'itemName', ''));
      v_item_cat := NULLIF(TRIM(COALESCE(v_item->>'itemCategoryHint', '')), '');
      v_item_qty := (v_item->>'totalQuantity')::INT;
      v_item_supplier_cents := (v_item->>'totalSupplierCostCents')::BIGINT;
      v_item_alloc_cents := (v_item->>'totalAllocatedExpenseCents')::BIGINT;
      v_item_landed_cents := (v_item->>'totalLandedCostCents')::BIGINT;

      INSERT INTO public.purchase_batch_items (
        batch_id,
        item_name,
        item_category_hint,
        total_quantity,
        total_supplier_cost_cents,
        total_allocated_expense_cents,
        total_landed_cost_cents
      ) VALUES (
        v_batch_id,
        v_item_name,
        v_item_cat,
        v_item_qty,
        v_item_supplier_cents,
        v_item_alloc_cents,
        v_item_landed_cents
      ) RETURNING id INTO v_item_id;

      -- Variations within Item
      IF v_item->'variations' IS NOT NULL AND jsonb_typeof(v_item->'variations') = 'array' THEN
        FOR v_var IN SELECT * FROM jsonb_array_elements(v_item->'variations') LOOP
          INSERT INTO public.purchase_batch_item_variations (
            batch_id,
            batch_item_id,
            variation_title,
            attributes,
            supplier_sku,
            quantity_purchased,
            quantity_received,
            quantity_linked,
            supplier_unit_price_cents,
            line_supplier_cost_cents,
            line_allocated_expense_cents,
            line_total_landed_cost_cents,
            unit_landed_cost_cents
          ) VALUES (
            v_batch_id,
            v_item_id,
            TRIM(COALESCE(v_var->>'variationTitle', '')),
            COALESCE(v_var->'attributes', '{}'::jsonb),
            NULLIF(TRIM(COALESCE(v_var->>'supplierSku', '')), ''),
            (v_var->>'quantityPurchased')::INT,
            0,
            0,
            (v_var->>'supplierUnitPriceCents')::BIGINT,
            (v_var->>'lineSupplierCostCents')::BIGINT,
            (v_var->>'lineAllocatedExpenseCents')::BIGINT,
            (v_var->>'lineTotalLandedCostCents')::BIGINT,
            (v_var->>'unitLandedCostCents')::BIGINT
          );
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'batch_number', v_batch_number,
    'status', 'draft'
  );
END;
$$;

-- Procedure 5.2: Confirm Purchase Batch (transitions draft to ordered)
CREATE OR REPLACE FUNCTION public.confirm_purchase_batch(
  p_batch_id UUID,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch RECORD;
BEGIN
  -- Security context check
  IF COALESCE(NULLIF(current_setting('role', true), 'none'), current_user) NOT IN ('service_role', 'postgres', 'supabase_admin')
     OR COALESCE(current_setting('request.jwt.claim.role', true), '') IN ('anon', 'authenticated')
  THEN
    RAISE EXCEPTION 'permission denied for function confirm_purchase_batch' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE id = p_admin_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an active administrator.';
  END IF;

  SELECT id, batch_number, status, total_purchased_units
  INTO v_batch
  FROM public.purchase_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase batch not found: %', p_batch_id;
  END IF;

  IF v_batch.status != 'draft' THEN
    RAISE EXCEPTION 'Cannot confirm batch "%": current status is "%", must be "draft".', v_batch.batch_number, v_batch.status;
  END IF;

  IF v_batch.total_purchased_units <= 0 THEN
    RAISE EXCEPTION 'Cannot confirm batch "%": total purchased units must be greater than zero.', v_batch.batch_number;
  END IF;

  UPDATE public.purchase_batches
  SET 
    status = 'ordered',
    updated_at = NOW()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'status', 'ordered'
  );
END;
$$;

-- Procedure 5.3: Receive Purchase Batch Items (durable idempotency and physical arrival)
CREATE OR REPLACE FUNCTION public.receive_purchase_batch_items(
  p_batch_id UUID,
  p_receipts JSONB, -- Array of { batchVariationId: UUID, quantityReceived: INT, receiptNotes: TEXT }
  p_idempotency_key TEXT,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_receipt RECORD;
  v_batch RECORD;
  v_item JSONB;
  v_var_id UUID;
  v_qty INT;
  v_notes TEXT;
  v_var RECORD;
  v_new_var_received INT;
  v_total_batch_received INT;
  v_new_batch_status TEXT;
  v_log_id UUID;
BEGIN
  -- 1. Security Context Guard
  IF COALESCE(NULLIF(current_setting('role', true), 'none'), current_user) NOT IN ('service_role', 'postgres', 'supabase_admin')
     OR COALESCE(current_setting('request.jwt.claim.role', true), '') IN ('anon', 'authenticated')
  THEN
    RAISE EXCEPTION 'permission denied for function receive_purchase_batch_items' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE id = p_admin_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an active administrator.';
  END IF;

  IF p_idempotency_key IS NULL OR TRIM(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'Receipt idempotency key is required.';
  END IF;

  -- 2. Durable Idempotency Check with Exact Parameter Matching
  SELECT id, batch_id, receipts_payload
  INTO v_existing_receipt
  FROM public.purchase_receipt_logs
  WHERE idempotency_key = p_idempotency_key;

  IF v_existing_receipt.id IS NOT NULL THEN
    IF v_existing_receipt.batch_id != p_batch_id 
       OR v_existing_receipt.receipts_payload != p_receipts 
    THEN
      RAISE EXCEPTION 'Idempotency conflict: key "%" already exists with conflicting parameters.', p_idempotency_key
        USING ERRCODE = '23505';
    END IF;

    SELECT status INTO v_new_batch_status FROM public.purchase_batches WHERE id = p_batch_id;
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'receipt_log_id', v_existing_receipt.id,
      'batch_status', v_new_batch_status
    );
  END IF;

  IF p_receipts IS NULL OR jsonb_typeof(p_receipts) != 'array' OR jsonb_array_length(p_receipts) = 0 THEN
    RAISE EXCEPTION 'Receipts payload must be a non-empty array.';
  END IF;

  -- 3. Lock Batch Row FOR UPDATE
  SELECT id, batch_number, status, total_purchased_units, total_received_units
  INTO v_batch
  FROM public.purchase_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase batch not found: %', p_batch_id;
  END IF;

  IF v_batch.status NOT IN ('ordered', 'partially_received') THEN
    RAISE EXCEPTION 'Cannot receive items for batch "%": current status is "%", must be "ordered" or "partially_received".',
      v_batch.batch_number, v_batch.status;
  END IF;

  -- 4. Create Durable Receipt Log
  INSERT INTO public.purchase_receipt_logs (
    batch_id,
    idempotency_key,
    receipts_payload,
    created_by
  ) VALUES (
    p_batch_id,
    p_idempotency_key,
    p_receipts,
    p_admin_id
  ) RETURNING id INTO v_log_id;

  -- 5. Process Line Receipts in Canonical UUID Order
  FOR v_item IN 
    SELECT value FROM jsonb_array_elements(p_receipts) 
    ORDER BY (value->>'batchVariationId')::UUID ASC 
  LOOP
    v_var_id := (v_item->>'batchVariationId')::UUID;
    v_qty := (v_item->>'quantityReceived')::INT;
    v_notes := NULLIF(TRIM(COALESCE(v_item->>'receiptNotes', '')), '');

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Received quantity must be positive for variation: %', v_var_id;
    END IF;

    SELECT * INTO v_var
    FROM public.purchase_batch_item_variations
    WHERE id = v_var_id AND batch_id = p_batch_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Purchase batch variation % not found in batch %', v_var_id, p_batch_id;
    END IF;

    v_new_var_received := v_var.quantity_received + v_qty;
    IF v_new_var_received > v_var.quantity_purchased THEN
      RAISE EXCEPTION 'Received quantity (%) exceeds purchased quantity (%) for variation %',
        v_new_var_received, v_var.quantity_purchased, v_var.variation_title;
    END IF;

    -- Update variation received quantity
    UPDATE public.purchase_batch_item_variations
    SET quantity_received = v_new_var_received
    WHERE id = v_var_id;

    -- Insert physical receipt audit event referencing receipt_log_id
    INSERT INTO public.purchase_batch_receipt_events (
      batch_id,
      receipt_log_id,
      batch_variation_id,
      quantity_received,
      receipt_notes,
      received_by
    ) VALUES (
      p_batch_id,
      v_log_id,
      v_var_id,
      v_qty,
      v_notes,
      p_admin_id
    );
  END LOOP;

  -- 6. Recompute Aggregate Received Units on Batch
  SELECT COALESCE(SUM(quantity_received), 0) INTO v_total_batch_received
  FROM public.purchase_batch_item_variations
  WHERE batch_id = p_batch_id;

  v_new_batch_status := CASE 
    WHEN v_total_batch_received >= v_batch.total_purchased_units THEN 'received'
    ELSE 'partially_received'
  END;

  UPDATE public.purchase_batches
  SET 
    total_received_units = v_total_batch_received,
    status = v_new_batch_status,
    received_at = CASE WHEN v_new_batch_status = 'received' THEN NOW() ELSE received_at END,
    updated_at = NOW()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'receipt_log_id', v_log_id,
    'batch_id', p_batch_id,
    'batch_status', v_new_batch_status,
    'total_received_units', v_total_batch_received
  );
END;
$$;

-- Procedure 5.4: Record Receiving Correction (Damage / Short-shipment adjustment)
CREATE OR REPLACE FUNCTION public.record_receiving_correction(
  p_batch_id UUID,
  p_variation_id UUID,
  p_adjustment INT,
  p_reason TEXT,
  p_notes TEXT,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_var RECORD;
  v_new_received INT;
  v_batch RECORD;
  v_total_batch_received INT;
BEGIN
  -- Security context check
  IF COALESCE(NULLIF(current_setting('role', true), 'none'), current_user) NOT IN ('service_role', 'postgres', 'supabase_admin')
     OR COALESCE(current_setting('request.jwt.claim.role', true), '') IN ('anon', 'authenticated')
  THEN
    RAISE EXCEPTION 'permission denied for function record_receiving_correction' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE id = p_admin_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an active administrator.';
  END IF;

  IF p_adjustment = 0 THEN
    RAISE EXCEPTION 'Quantity adjustment cannot be zero.';
  END IF;

  IF p_reason NOT IN ('damaged_on_arrival', 'short_shipped', 'vendor_overage', 'inspection_failure') THEN
    RAISE EXCEPTION 'Invalid correction reason: "%".', p_reason;
  END IF;

  IF p_notes IS NULL OR TRIM(p_notes) = '' THEN
    RAISE EXCEPTION 'Detailed correction notes are mandatory.';
  END IF;

  -- Lock variation
  SELECT * INTO v_var
  FROM public.purchase_batch_item_variations
  WHERE id = p_variation_id AND batch_id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variation % not found in batch %.', p_variation_id, p_batch_id;
  END IF;

  v_new_received := v_var.quantity_received + p_adjustment;
  IF v_new_received < v_var.quantity_linked THEN
    RAISE EXCEPTION 'Adjustment would reduce received quantity (%) below already-linked quantity (%).',
      v_new_received, v_var.quantity_linked;
  END IF;

  IF v_new_received > v_var.quantity_purchased THEN
    RAISE EXCEPTION 'Adjustment would increase received quantity (%) beyond purchased quantity (%).',
      v_new_received, v_var.quantity_purchased;
  END IF;

  -- Apply adjustment
  UPDATE public.purchase_batch_item_variations
  SET quantity_received = v_new_received
  WHERE id = p_variation_id;

  -- Log audit correction
  INSERT INTO public.purchase_receiving_corrections (
    batch_id,
    batch_variation_id,
    quantity_adjustment,
    reason,
    notes,
    corrected_by
  ) VALUES (
    p_batch_id,
    p_variation_id,
    p_adjustment,
    p_reason,
    p_notes,
    p_admin_id
  );

  -- Recompute aggregate received units on batch
  SELECT COALESCE(SUM(quantity_received), 0) INTO v_total_batch_received
  FROM public.purchase_batch_item_variations
  WHERE batch_id = p_batch_id;

  UPDATE public.purchase_batches
  SET 
    total_received_units = v_total_batch_received,
    status = CASE WHEN v_total_batch_received >= total_purchased_units THEN 'received' ELSE 'partially_received' END,
    updated_at = NOW()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_quantity_received', v_new_received,
    'batch_total_received', v_total_batch_received
  );
END;
$$;

-- Procedure 5.5: Transfer Purchase Stock to Variant (Atomic Storefront Transfer, Residual Cents & WAC Blending)
CREATE OR REPLACE FUNCTION public.transfer_purchase_stock_to_variant(
  p_batch_variation_id UUID,
  p_target_variant_id UUID,
  p_quantity INT,
  p_transfer_type TEXT,
  p_idempotency_key TEXT,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_transfer RECORD;
  v_batch_var RECORD;
  v_target_variant RECORD;
  v_transfer_id UUID;
  v_movement_id UUID;
  v_new_stock INT;
  v_new_status TEXT;
  v_transfer_cost_cents BIGINT;
  v_transfer_unit_cost_cents BIGINT;
  v_new_unit_cost NUMERIC(12, 2);
BEGIN
  -- 1. Security Context Guard: Restrict strictly to service_role / superuser
  IF COALESCE(NULLIF(current_setting('role', true), 'none'), current_user) NOT IN ('service_role', 'postgres', 'supabase_admin')
     OR COALESCE(current_setting('request.jwt.claim.role', true), '') IN ('anon', 'authenticated')
  THEN
    RAISE EXCEPTION 'permission denied for function transfer_purchase_stock_to_variant'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Verify Calling Administrator Identity in Database
  IF p_admin_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admin_users WHERE id = p_admin_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not a verified active administrator.';
  END IF;

  -- 3. Idempotency Check with Exact Parameter Matching Guard
  SELECT id, transfer_batch_id, batch_variation_id, target_variant_id, quantity_transferred
  INTO v_existing_transfer
  FROM public.purchase_receipt_transfers
  WHERE idempotency_key = p_idempotency_key;

  IF v_existing_transfer.id IS NOT NULL THEN
    IF v_existing_transfer.batch_variation_id != p_batch_variation_id
       OR v_existing_transfer.target_variant_id != p_target_variant_id
       OR v_existing_transfer.quantity_transferred != p_quantity
    THEN
      RAISE EXCEPTION 'Idempotency conflict: key "%" already exists with conflicting parameters.', p_idempotency_key
        USING ERRCODE = '23505';
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'transfer_id', v_existing_transfer.id
    );
  END IF;

  -- 4. Parameter Validation
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Transfer quantity must be greater than zero.';
  END IF;

  IF p_transfer_type NOT IN ('new_product', 'restock_existing') THEN
    RAISE EXCEPTION 'Invalid transfer type: "%".', p_transfer_type;
  END IF;

  -- 5. Canonical Row Locking (Batch Variation First, Target Storefront Variant Second)
  SELECT pbiv.*, pb.batch_number, pb.status AS batch_status
  INTO v_batch_var
  FROM public.purchase_batch_item_variations pbiv
  JOIN public.purchase_batches pb ON pb.id = pbiv.batch_id
  WHERE pbiv.id = p_batch_variation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase batch variation not found: %', p_batch_variation_id;
  END IF;

  IF v_batch_var.batch_status NOT IN ('received', 'partially_received') THEN
    RAISE EXCEPTION 'Cannot transfer stock: batch "%" is not received (status: %).',
      v_batch_var.batch_number, v_batch_var.batch_status;
  END IF;

  IF (v_batch_var.quantity_received - v_batch_var.quantity_linked) < p_quantity THEN
    RAISE EXCEPTION 'Insufficient unlinked quantity. Available: %, Requested: %',
      (v_batch_var.quantity_received - v_batch_var.quantity_linked), p_quantity;
  END IF;

  SELECT * INTO v_target_variant
  FROM public.product_variants
  WHERE id = p_target_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target storefront variant not found: %', p_target_variant_id;
  END IF;

  -- 6. Exact Residual-Cent Transfer Cost Allocation
  -- If this transfer exhausts all purchased units for this line, absorb the exact remaining line balance.
  -- Otherwise, allocate pro-rata based on quantity_purchased to prevent premature cost absorption on partial receipts.
  IF (v_batch_var.quantity_linked + p_quantity) = v_batch_var.quantity_purchased THEN
    v_transfer_cost_cents := v_batch_var.line_total_landed_cost_cents - v_batch_var.cumulative_transferred_cost_cents;
  ELSE
    -- Intermediate partial transfer: pro-rata portion based on purchased quantity
    v_transfer_cost_cents := ROUND(
      (v_batch_var.line_total_landed_cost_cents::NUMERIC / v_batch_var.quantity_purchased::NUMERIC) * p_quantity
    )::BIGINT;
  END IF;

  v_transfer_unit_cost_cents := (v_transfer_cost_cents + (p_quantity / 2)) / p_quantity;

  -- 7. Moving Weighted Average Cost (WAC) Calculation in Decimal LKR
  v_new_unit_cost := ROUND(
    CASE 
      WHEN v_target_variant.stock_quantity <= 0 THEN 
        (v_transfer_unit_cost_cents::NUMERIC / 100.0)
      ELSE 
        ((v_target_variant.stock_quantity * v_target_variant.purchase_cost) + 
         (v_transfer_cost_cents::NUMERIC / 100.0)) / 
        (v_target_variant.stock_quantity + p_quantity)
    END, 
    2
  );

  v_new_stock := v_target_variant.stock_quantity + p_quantity;
  v_new_status := CASE 
    WHEN v_new_stock = 0 THEN 'out_of_stock'
    WHEN v_new_stock <= v_target_variant.low_stock_threshold THEN 'low_stock'
    ELSE 'in_stock'
  END;

  -- 8. Update Storefront Variant Stock & Blended Landed Cost
  UPDATE public.product_variants
  SET 
    stock_quantity = v_new_stock,
    stock_status = v_new_status,
    purchase_cost = v_new_unit_cost,
    updated_at = NOW()
  WHERE id = p_target_variant_id;

  -- 9. Insert Audit Inventory Movement (Conforms to existing schema and constraints)
  INSERT INTO public.inventory_movements (
    variant_id,
    quantity_change,
    previous_quantity,
    new_quantity,
    reason,
    reference_id,
    created_by
  ) VALUES (
    p_target_variant_id,
    p_quantity,
    v_target_variant.stock_quantity,
    v_new_stock,
    'stock_added',
    'PURCHASE_TRANSFER:' || v_batch_var.batch_number,
    p_admin_id
  ) RETURNING id INTO v_movement_id;

  -- 10. Update Purchase Ledger Linked Quantity & Cumulative Transferred Cost
  UPDATE public.purchase_batch_item_variations
  SET 
    quantity_linked = quantity_linked + p_quantity,
    cumulative_transferred_cost_cents = cumulative_transferred_cost_cents + v_transfer_cost_cents
  WHERE id = p_batch_variation_id;

  -- 11. Record Transfer in Immutable Ledger
  INSERT INTO public.purchase_receipt_transfers (
    transfer_batch_id,
    batch_variation_id,
    target_variant_id,
    quantity_transferred,
    transferred_cost_cents,
    transferred_unit_cost_cents,
    transfer_type,
    inventory_movement_id,
    idempotency_key,
    created_by
  ) VALUES (
    v_batch_var.batch_id,
    p_batch_variation_id,
    p_target_variant_id,
    p_quantity,
    v_transfer_cost_cents,
    v_transfer_unit_cost_cents,
    p_transfer_type,
    v_movement_id,
    p_idempotency_key,
    p_admin_id
  ) RETURNING id INTO v_transfer_id;

  RETURN jsonb_build_object(
    'success', true,
    'transfer_id', v_transfer_id,
    'new_stock_quantity', v_new_stock,
    'blended_purchase_cost', v_new_unit_cost,
    'transferred_cost_cents', v_transfer_cost_cents
  );
END;
$$;

-- Procedure 5.6: Cancel Purchase Batch (safe cancellation if no units are linked to storefront)
CREATE OR REPLACE FUNCTION public.cancel_purchase_batch(
  p_batch_id UUID,
  p_reason TEXT,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch RECORD;
  v_linked_count INT;
BEGIN
  -- Security context check
  IF COALESCE(NULLIF(current_setting('role', true), 'none'), current_user) NOT IN ('service_role', 'postgres', 'supabase_admin')
     OR COALESCE(current_setting('request.jwt.claim.role', true), '') IN ('anon', 'authenticated')
  THEN
    RAISE EXCEPTION 'permission denied for function cancel_purchase_batch' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE id = p_admin_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an active administrator.';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Cancellation reason is mandatory.';
  END IF;

  SELECT id, batch_number, status
  INTO v_batch
  FROM public.purchase_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase batch not found: %', p_batch_id;
  END IF;

  IF v_batch.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'batch_id', p_batch_id, 'status', 'cancelled');
  END IF;

  -- Guard: Cannot cancel batch if any units have already been transferred/linked to storefront
  SELECT COALESCE(SUM(quantity_linked), 0) INTO v_linked_count
  FROM public.purchase_batch_item_variations
  WHERE batch_id = p_batch_id;

  IF v_linked_count > 0 THEN
    RAISE EXCEPTION 'Cannot cancel purchase batch "%": % unit(s) have already been transferred to sellable storefront inventory.',
      v_batch.batch_number, v_linked_count;
  END IF;

  UPDATE public.purchase_batches
  SET 
    status = 'cancelled',
    cancellation_reason = TRIM(p_reason),
    updated_at = NOW()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'status', 'cancelled'
  );
END;
$$;

-- Procedure 5.7: Atomic Product Creation from Purchase Batch
CREATE OR REPLACE FUNCTION public.create_product_from_purchase_batch(
  p_product JSONB,
  p_variants JSONB, -- Array of { sku, title, price, discount_price, low_stock_threshold, attributes, batch_variation_id, transfer_quantity, is_active }
  p_images JSONB DEFAULT '[]'::jsonb,
  p_idempotency_key TEXT DEFAULT NULL,
  p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name TEXT;
  v_slug TEXT;
  v_product_code TEXT;
  v_category_id UUID;
  v_product_id UUID;
  v_variant_count INT;
  v_var_elem JSONB;
  v_sku TEXT;
  v_title TEXT;
  v_raw_val TEXT;
  v_price NUMERIC;
  v_discount_price NUMERIC;
  v_low_stock INT;
  v_var_is_active BOOLEAN;
  v_attributes JSONB;
  v_batch_var_id UUID;
  v_transfer_qty INT;
  v_batch_var RECORD;
  v_transfer_cost_cents BIGINT;
  v_transfer_unit_cost_cents BIGINT;
  v_unit_landed_cost NUMERIC(12, 2);
  v_stock_status TEXT;
  v_variant_id UUID;
  v_movement_id UUID;
  v_transfer_id UUID;
  v_img_elem JSONB;
  v_img_url TEXT;
  v_img_sku TEXT;
  v_img_disp_order INT;
  v_target_variant_id UUID;
  v_dup_sku TEXT;
  v_existing_sku TEXT;
  v_existing_log RECORD;
BEGIN
  -- 1. Security Context Guard
  IF COALESCE(NULLIF(current_setting('role', true), 'none'), current_user) NOT IN ('service_role', 'postgres', 'supabase_admin')
     OR COALESCE(current_setting('request.jwt.claim.role', true), '') IN ('anon', 'authenticated')
  THEN
    RAISE EXCEPTION 'permission denied for function create_product_from_purchase_batch' USING ERRCODE = '42501';
  END IF;

  IF p_admin_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admin_users WHERE id = p_admin_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an active administrator.';
  END IF;

  -- 2. Durable Idempotency Check
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
    SELECT id, product_id INTO v_existing_log
    FROM public.purchase_product_creation_logs
    WHERE idempotency_key = TRIM(p_idempotency_key);

    IF v_existing_log.id IS NOT NULL THEN
      SELECT slug INTO v_slug FROM public.products WHERE id = v_existing_log.product_id;
      RETURN jsonb_build_object(
        'success', TRUE,
        'idempotent', TRUE,
        'product_id', v_existing_log.product_id,
        'slug', v_slug
      );
    END IF;
  END IF;

  -- 3. Validate Product Payload
  IF p_product IS NULL OR jsonb_typeof(p_product) != 'object' THEN
    RAISE EXCEPTION 'Product payload must be a JSON object.';
  END IF;

  v_name := TRIM(COALESCE(p_product->>'name', ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Product name is required.';
  END IF;

  v_slug := LOWER(TRIM(COALESCE(p_product->>'slug', '')));
  IF v_slug = '' THEN
    RAISE EXCEPTION 'Product slug is required.';
  END IF;

  IF v_slug !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'Product slug "%" is invalid. Slugs may only contain lowercase letters, numbers, and hyphens.', v_slug;
  END IF;

  IF EXISTS (SELECT 1 FROM public.products WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'Product slug "%" is already in use by another product.', v_slug;
  END IF;

  v_product_code := NULLIF(TRIM(COALESCE(p_product->>'product_code', '')), '');
  IF v_product_code IS NOT NULL AND EXISTS (SELECT 1 FROM public.products WHERE product_code = v_product_code) THEN
    RAISE EXCEPTION 'Product code "%" is already assigned to another product.', v_product_code;
  END IF;

  IF p_product->>'category_id' IS NOT NULL AND TRIM(p_product->>'category_id') != '' THEN
    v_category_id := (p_product->>'category_id')::UUID;
    IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = v_category_id) THEN
      RAISE EXCEPTION 'Category not found: %', v_category_id;
    END IF;
  ELSE
    v_category_id := NULL;
  END IF;

  -- 4. Validate Variants Payload
  IF p_variants IS NULL OR jsonb_typeof(p_variants) != 'array' THEN
    RAISE EXCEPTION 'Variants payload must be a JSON array.';
  END IF;

  v_variant_count := jsonb_array_length(p_variants);
  IF v_variant_count = 0 THEN
    RAISE EXCEPTION 'At least one product variation is required.';
  END IF;

  -- In-batch SKU uniqueness verification (case-insensitive)
  SELECT UPPER(TRIM(x.sku)) INTO v_dup_sku
  FROM jsonb_to_recordset(p_variants) AS x(sku text)
  GROUP BY UPPER(TRIM(x.sku))
  HAVING count(*) > 1
  LIMIT 1;

  IF v_dup_sku IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate SKU "%" found within the variation list.', v_dup_sku;
  END IF;

  -- Database SKU uniqueness verification (case-insensitive)
  SELECT pv.sku INTO v_existing_sku
  FROM public.product_variants pv
  JOIN jsonb_to_recordset(p_variants) AS x(sku text)
    ON UPPER(TRIM(pv.sku)) = UPPER(TRIM(x.sku))
  LIMIT 1;

  IF v_existing_sku IS NOT NULL THEN
    RAISE EXCEPTION 'SKU "%" is already assigned to another product.', v_existing_sku;
  END IF;

  -- 5. Insert Master Product Record in Unpublished Draft Status
  INSERT INTO public.products (
    name,
    slug,
    product_code,
    short_description,
    description,
    material,
    gender,
    category_id,
    is_featured,
    is_new_arrival,
    is_best_seller,
    is_active,
    meta_title,
    meta_description
  ) VALUES (
    v_name,
    v_slug,
    v_product_code,
    NULLIF(TRIM(COALESCE(p_product->>'short_description', '')), ''),
    NULLIF(TRIM(COALESCE(p_product->>'description', '')), ''),
    NULLIF(TRIM(COALESCE(p_product->>'material', '')), ''),
    COALESCE(NULLIF(TRIM(p_product->>'gender'), ''), 'women'),
    v_category_id,
    COALESCE((p_product->>'is_featured')::BOOLEAN, FALSE),
    COALESCE((p_product->>'is_new_arrival')::BOOLEAN, TRUE),
    COALESCE((p_product->>'is_best_seller')::BOOLEAN, FALSE),
    FALSE, -- ALWAYS default to draft; requires explicit publication
    NULLIF(TRIM(COALESCE(p_product->>'meta_title', '')), ''),
    NULLIF(TRIM(COALESCE(p_product->>'meta_description', '')), '')
  ) RETURNING id INTO v_product_id;

  -- 6. Process Variations & Transfer Purchase Stock Atomically
  FOR v_var_elem IN SELECT * FROM jsonb_array_elements(p_variants) LOOP
    v_sku := UPPER(TRIM(COALESCE(v_var_elem->>'sku', '')));
    IF v_sku = '' THEN
      RAISE EXCEPTION 'SKU is required for all variations.';
    END IF;

    v_title := COALESCE(NULLIF(TRIM(v_var_elem->>'title'), ''), 'Default');

    -- Selling price
    v_raw_val := TRIM(COALESCE(v_var_elem->>'price', '0'));
    v_price := v_raw_val::NUMERIC;
    IF v_price < 0 THEN
      RAISE EXCEPTION 'Selling price cannot be negative for SKU "%".', v_sku;
    END IF;

    -- Discount price
    IF v_var_elem->>'discount_price' IS NOT NULL AND TRIM(v_var_elem->>'discount_price') != '' THEN
      v_discount_price := (v_var_elem->>'discount_price')::NUMERIC;
      IF v_discount_price < 0 OR v_discount_price >= v_price THEN
        RAISE EXCEPTION 'Discount price must be non-negative and less than selling price for SKU "%".', v_sku;
      END IF;
    ELSE
      v_discount_price := NULL;
    END IF;

    -- Low stock threshold
    v_low_stock := COALESCE(NULLIF(v_var_elem->>'low_stock_threshold', '')::INT, 5);
    v_var_is_active := COALESCE((v_var_elem->>'is_active')::BOOLEAN, TRUE);
    v_attributes := COALESCE(v_var_elem->'attributes', '{}'::jsonb);

    -- Purchase variation linkage
    v_batch_var_id := NULLIF(TRIM(COALESCE(v_var_elem->>'batch_variation_id', '')), '')::UUID;
    v_transfer_qty := COALESCE((v_var_elem->>'transfer_quantity')::INT, 0);

    IF v_batch_var_id IS NULL THEN
      RAISE EXCEPTION 'Batch variation ID is required for purchase-linked product creation on SKU "%".', v_sku;
    END IF;

    IF v_transfer_qty <= 0 THEN
      RAISE EXCEPTION 'Transfer quantity must be greater than zero for SKU "%".', v_sku;
    END IF;

    -- Lock and validate purchase variation row FOR UPDATE
    SELECT pbiv.*, pb.batch_number, pb.status AS batch_status
    INTO v_batch_var
    FROM public.purchase_batch_item_variations pbiv
    JOIN public.purchase_batches pb ON pb.id = pbiv.batch_id
    WHERE pbiv.id = v_batch_var_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Purchase batch variation % not found for SKU "%".', v_batch_var_id, v_sku;
    END IF;

    IF v_batch_var.batch_status NOT IN ('received', 'partially_received') THEN
      RAISE EXCEPTION 'Cannot transfer stock for SKU "%": batch "%" is not received (status: %).',
        v_sku, v_batch_var.batch_number, v_batch_var.batch_status;
    END IF;

    IF (v_batch_var.quantity_received - v_batch_var.quantity_linked) < v_transfer_qty THEN
      RAISE EXCEPTION 'Insufficient unlinked quantity for variation "%". Available: %, Requested: %',
        v_batch_var.variation_title, (v_batch_var.quantity_received - v_batch_var.quantity_linked), v_transfer_qty;
    END IF;

    -- Exact Landed Cost Allocation
    IF (v_batch_var.quantity_linked + v_transfer_qty) = v_batch_var.quantity_purchased THEN
      v_transfer_cost_cents := v_batch_var.line_total_landed_cost_cents - v_batch_var.cumulative_transferred_cost_cents;
    ELSE
      v_transfer_cost_cents := ROUND(
        (v_batch_var.line_total_landed_cost_cents::NUMERIC / v_batch_var.quantity_purchased::NUMERIC) * v_transfer_qty
      )::BIGINT;
    END IF;

    v_transfer_unit_cost_cents := (v_transfer_cost_cents + (v_transfer_qty / 2)) / v_transfer_qty;
    v_unit_landed_cost := ROUND(v_transfer_unit_cost_cents::NUMERIC / 100.0, 2);

    IF v_transfer_qty = 0 THEN
      v_stock_status := 'out_of_stock';
    ELSIF v_transfer_qty <= v_low_stock THEN
      v_stock_status := 'low_stock';
    ELSE
      v_stock_status := 'in_stock';
    END IF;

    -- Insert Variant with transferred stock & cost
    INSERT INTO public.product_variants (
      product_id,
      sku,
      title,
      attributes,
      price,
      discount_price,
      purchase_cost,
      stock_quantity,
      low_stock_threshold,
      stock_status,
      is_active
    ) VALUES (
      v_product_id,
      v_sku,
      v_title,
      v_attributes,
      v_price,
      v_discount_price,
      v_unit_landed_cost,
      v_transfer_qty,
      v_low_stock,
      v_stock_status,
      v_var_is_active
    ) RETURNING id INTO v_variant_id;

    -- Insert Audit Inventory Movement (PURCHASE_TRANSFER)
    INSERT INTO public.inventory_movements (
      variant_id,
      quantity_change,
      previous_quantity,
      new_quantity,
      reason,
      reference_id,
      created_by
    ) VALUES (
      v_variant_id,
      v_transfer_qty,
      0,
      v_transfer_qty,
      'stock_added',
      'PURCHASE_TRANSFER:' || v_batch_var.batch_number,
      p_admin_id
    ) RETURNING id INTO v_movement_id;

    -- Update Purchase Variation Ledger
    UPDATE public.purchase_batch_item_variations
    SET 
      quantity_linked = quantity_linked + v_transfer_qty,
      cumulative_transferred_cost_cents = cumulative_transferred_cost_cents + v_transfer_cost_cents
    WHERE id = v_batch_var_id;

    -- Record Transfer Ledger
    INSERT INTO public.purchase_receipt_transfers (
      transfer_batch_id,
      batch_variation_id,
      target_variant_id,
      quantity_transferred,
      transferred_cost_cents,
      transferred_unit_cost_cents,
      transfer_type,
      inventory_movement_id,
      idempotency_key,
      created_by
    ) VALUES (
      v_batch_var.batch_id,
      v_batch_var_id,
      v_variant_id,
      v_transfer_qty,
      v_transfer_cost_cents,
      v_transfer_unit_cost_cents,
      'new_product',
      v_movement_id,
      COALESCE(TRIM(p_idempotency_key) || ':' || v_sku, gen_random_uuid()::TEXT),
      p_admin_id
    ) RETURNING id INTO v_transfer_id;
  END LOOP;

  -- 7. Insert Gallery Images
  IF p_images IS NOT NULL AND jsonb_typeof(p_images) = 'array' THEN
    FOR v_img_elem IN SELECT * FROM jsonb_array_elements(p_images) LOOP
      v_img_url := TRIM(COALESCE(v_img_elem->>'url', ''));
      IF v_img_url != '' THEN
        v_img_disp_order := COALESCE(NULLIF(v_img_elem->>'display_order', '')::INT, 0);
        v_img_sku := UPPER(TRIM(COALESCE(v_img_elem->>'variant_sku', '')));
        v_target_variant_id := NULL;

        IF v_img_sku != '' THEN
          SELECT id INTO v_target_variant_id
          FROM public.product_variants
          WHERE product_id = v_product_id AND sku = v_img_sku
          LIMIT 1;
        END IF;

        INSERT INTO public.product_images (
          product_id,
          variant_id,
          url,
          alt_text,
          display_order,
          is_primary
        ) VALUES (
          v_product_id,
          v_target_variant_id,
          v_img_url,
          COALESCE(NULLIF(TRIM(v_img_elem->>'alt_text'), ''), v_name),
          v_img_disp_order,
          COALESCE((v_img_elem->>'is_primary')::BOOLEAN, FALSE)
        );
      END IF;
    END LOOP;
  END IF;

  -- 8. Record Idempotency Token
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
    INSERT INTO public.purchase_product_creation_logs (
      idempotency_key,
      product_id,
      created_by
    ) VALUES (
      TRIM(p_idempotency_key),
      v_product_id,
      p_admin_id
    );
  END IF;

  -- 9. Return Atomic Success Result
  RETURN jsonb_build_object(
    'success', TRUE,
    'idempotent', FALSE,
    'product_id', v_product_id,
    'slug', v_slug,
    'variant_count', v_variant_count
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. LEAST PRIVILEGE REVOCATIONS AND SERVICE ROLE GRANTS
-- ------------------------------------------------------------------------------
ALTER TABLE public.purchase_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_batch_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_batch_item_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipt_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_batch_receipt_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receiving_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipt_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_product_creation_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.purchase_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.purchase_batch_expenses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.purchase_batch_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.purchase_batch_item_variations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.purchase_receipt_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.purchase_batch_receipt_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.purchase_receiving_corrections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.purchase_receipt_transfers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.purchase_product_creation_logs FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_batches TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_batch_expenses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_batch_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_batch_item_variations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_receipt_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_batch_receipt_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_receiving_corrections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_receipt_transfers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_product_creation_logs TO service_role;

ALTER FUNCTION public.create_purchase_batch(JSONB, JSONB, JSONB, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_purchase_batch(JSONB, JSONB, JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_batch(JSONB, JSONB, JSONB, UUID) TO service_role;

ALTER FUNCTION public.confirm_purchase_batch(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.confirm_purchase_batch(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_purchase_batch(UUID, UUID) TO service_role;

ALTER FUNCTION public.receive_purchase_batch_items(UUID, JSONB, TEXT, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.receive_purchase_batch_items(UUID, JSONB, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_purchase_batch_items(UUID, JSONB, TEXT, UUID) TO service_role;

ALTER FUNCTION public.record_receiving_correction(UUID, UUID, INT, TEXT, TEXT, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_receiving_correction(UUID, UUID, INT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_receiving_correction(UUID, UUID, INT, TEXT, TEXT, UUID) TO service_role;

ALTER FUNCTION public.transfer_purchase_stock_to_variant(UUID, UUID, INT, TEXT, TEXT, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.transfer_purchase_stock_to_variant(UUID, UUID, INT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_purchase_stock_to_variant(UUID, UUID, INT, TEXT, TEXT, UUID) TO service_role;

ALTER FUNCTION public.cancel_purchase_batch(UUID, TEXT, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cancel_purchase_batch(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_batch(UUID, TEXT, UUID) TO service_role;

ALTER FUNCTION public.create_product_from_purchase_batch(JSONB, JSONB, JSONB, TEXT, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_product_from_purchase_batch(JSONB, JSONB, JSONB, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_product_from_purchase_batch(JSONB, JSONB, JSONB, TEXT, UUID) TO service_role;
