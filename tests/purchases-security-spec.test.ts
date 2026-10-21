import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Purchase Management: Schema & Security Specification Audit', () => {
  const migrationPath = path.resolve('supabase/migrations/00013_purchase_management.sql');
  const actionsPath = path.resolve('lib/purchases/admin-actions.ts');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const actionsCode = fs.readFileSync(actionsPath, 'utf8');

  it('declares all 8 purchase management tables with composite cross-batch integrity constraints', () => {
    const requiredTables = [
      'purchase_batches',
      'purchase_batch_expenses',
      'purchase_batch_items',
      'purchase_batch_item_variations',
      'purchase_receipt_logs',
      'purchase_batch_receipt_events',
      'purchase_receiving_corrections',
      'purchase_receipt_transfers',
    ];

    for (const table of requiredTables) {
      assert.ok(
        migrationSql.includes(`CREATE TABLE IF NOT EXISTS public.${table}`),
        `Migration 00013 must define table public.${table}`
      );
    }

    // Composite foreign keys to prevent cross-batch contamination
    assert.ok(
      migrationSql.includes('FOREIGN KEY (batch_item_id, batch_id) REFERENCES public.purchase_batch_items(id, batch_id)'),
      'Variations must enforce composite foreign key on (batch_item_id, batch_id)'
    );
    assert.ok(
      migrationSql.includes('FOREIGN KEY (batch_variation_id, batch_id) REFERENCES public.purchase_batch_item_variations(id, batch_id)'),
      'Receipt events must enforce composite foreign key on (batch_variation_id, batch_id)'
    );
    assert.ok(
      migrationSql.includes('FOREIGN KEY (batch_variation_id, transfer_batch_id) REFERENCES public.purchase_batch_item_variations(id, batch_id)'),
      'Stock transfers must enforce composite foreign key on (batch_variation_id, transfer_batch_id)'
    );
  });

  it('enforces quantity lifecycle, financial totals, and residual cost transfer constraints', () => {
    // 0 <= linked <= received <= purchased
    assert.ok(
      migrationSql.includes('0 <= quantity_linked AND quantity_linked <= quantity_received AND quantity_received <= quantity_purchased'),
      'Migration must enforce quantity lifecycle invariant constraint'
    );

    // Batch total landed = supplier cost + expenses
    assert.ok(
      migrationSql.includes('total_landed_cost_cents = total_supplier_cost_cents + total_expenses_cents'),
      'Migration must enforce total landed cost equality constraint'
    );

    // Cumulative transferred cost cannot exceed line landed cost
    assert.ok(
      migrationSql.includes('cumulative_transferred_cost_cents <= line_total_landed_cost_cents'),
      'Migration must enforce cumulative transferred cost ceiling constraint'
    );
  });

  it('enforces confirmed purchase record immutability via database trigger', () => {
    assert.ok(
      migrationSql.includes('CREATE OR REPLACE FUNCTION public.prevent_purchase_record_mutation_after_confirm'),
      'Migration must define immutability trigger function'
    );
    assert.ok(
      migrationSql.includes('Cannot delete purchase batch "%": confirmed, received, or cancelled records are immutable'),
      'Immutability trigger must reject deletion of non-draft batches'
    );
    assert.ok(
      migrationSql.includes('CREATE TRIGGER trg_protect_purchase_batches'),
      'Migration must attach trigger trg_protect_purchase_batches'
    );
  });

  it('enforces Row Level Security and least privilege grant revocations across all 8 purchase tables', () => {
    const requiredTables = [
      'purchase_batches',
      'purchase_batch_expenses',
      'purchase_batch_items',
      'purchase_batch_item_variations',
      'purchase_receipt_logs',
      'purchase_batch_receipt_events',
      'purchase_receiving_corrections',
      'purchase_receipt_transfers',
    ];

    for (const table of requiredTables) {
      assert.ok(
        migrationSql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`),
        `Table public.${table} must have RLS enabled`
      );
      assert.ok(
        migrationSql.includes(`REVOKE ALL ON public.${table} FROM PUBLIC, anon, authenticated;`),
        `Table public.${table} must revoke privileges from PUBLIC, anon, and authenticated`
      );
      assert.ok(
        migrationSql.includes(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${table} TO service_role;`),
        `Table public.${table} must grant privileges exclusively to service_role`
      );
    }
  });

  it('restricts transactional stored procedures to service_role and validates security context', () => {
    const procedures = [
      'create_purchase_batch',
      'confirm_purchase_batch',
      'receive_purchase_batch_items',
      'record_receiving_correction',
      'transfer_purchase_stock_to_variant',
      'cancel_purchase_batch',
    ];

    for (const proc of procedures) {
      assert.ok(
        migrationSql.includes(`REVOKE ALL ON FUNCTION public.${proc}`),
        `Procedure public.${proc} must revoke execution from public/anon/authenticated`
      );
      assert.ok(
        migrationSql.includes(`GRANT EXECUTE ON FUNCTION public.${proc}`),
        `Procedure public.${proc} must grant execution to service_role`
      );
    }

    // Security context check inside stored procedures
    assert.ok(
      migrationSql.includes("COALESCE(NULLIF(current_setting('role', true), 'none'), current_user) NOT IN ('service_role', 'postgres', 'supabase_admin')"),
      'Stored procedures must enforce runtime security context check against caller role'
    );
  });

  it('protects idempotency with exact parameter matching on both receipts and stock transfers', () => {
    // Receipt idempotency in purchase_receipt_logs
    assert.ok(
      migrationSql.includes('SELECT id, batch_id, receipts_payload'),
      'Receipt procedure must query purchase_receipt_logs for existing idempotency key'
    );
    assert.ok(
      migrationSql.includes('v_existing_receipt.receipts_payload != p_receipts'),
      'Receipt procedure must verify receipts_payload parameter parity'
    );

    // Stock transfer idempotency in purchase_receipt_transfers
    assert.ok(
      migrationSql.includes('v_existing_transfer.batch_variation_id != p_batch_variation_id'),
      'Stock transfer procedure must verify batch_variation_id parity on repeated idempotency key'
    );
    assert.ok(
      migrationSql.includes('v_existing_transfer.target_variant_id != p_target_variant_id'),
      'Stock transfer procedure must verify target_variant_id parity on repeated idempotency key'
    );
    assert.ok(
      migrationSql.includes('v_existing_transfer.quantity_transferred != p_quantity'),
      'Stock transfer procedure must verify quantity_transferred parity on repeated idempotency key'
    );
  });

  it('server actions authenticate active admin and never trust client-supplied admin ID', () => {
    // Actions must import and call requireAdminAuth
    assert.ok(actionsCode.includes("import { requireAdminAuth } from '@/lib/auth/server'"));
    assert.ok(actionsCode.includes('const admin = await requireAdminAuth()'));

    // Admin ID must come from verified admin.id session object
    assert.ok(actionsCode.includes('p_admin_id: admin.id'));
    assert.ok(!actionsCode.includes('payload.adminId'));
    assert.ok(!actionsCode.includes('input.adminId'));

    // Feature flag check must guard each server action
    assert.ok(actionsCode.includes("process.env.NEXT_PUBLIC_ENABLE_PURCHASE_MANAGEMENT === 'true'"));
  });

  it('guarantees exact residual-cent balance absorption on final partial transfer', () => {
    assert.ok(
      migrationSql.includes('v_transfer_cost_cents := v_batch_var.line_total_landed_cost_cents - v_batch_var.cumulative_transferred_cost_cents'),
      'Final partial transfer must absorb exact remaining line balance'
    );
    assert.ok(
      migrationSql.includes('cumulative_transferred_cost_cents = cumulative_transferred_cost_cents + v_transfer_cost_cents'),
      'Variation must record cumulative transferred cost'
    );
  });

  // ── Stage 6C: Stock Provenance & Feature Flag Enforcement ─────────────────
  it('strictly prohibits arbitrary reconciliation key bypasses across all catalog actions', () => {
    const productsCode = fs.readFileSync(path.resolve('lib/catalog/products.ts'), 'utf8');
    const variantsCode = fs.readFileSync(path.resolve('lib/catalog/variants.ts'), 'utf8');

    // Both files must NOT accept arbitrary openingStockReconciliationKey or reconciliationAuditKey
    assert.ok(!productsCode.includes('openingStockReconciliationKey'));
    assert.ok(!variantsCode.includes('openingStockReconciliationKey'));
    assert.ok(!variantsCode.includes('reconciliationAuditKey'));

    // Both files must enforce "NO PURCHASE = NO ITEM TO SELL"
    assert.ok(productsCode.includes('NO PURCHASE = NO ITEM TO SELL'));
    assert.ok(variantsCode.includes('NO PURCHASE = NO ITEM TO SELL'));
  });

  it('adjustVariantStockAction strictly blocks all positive adjustments and preserves negative adjustments with notes', () => {
    const variantsCode = fs.readFileSync(path.resolve('lib/catalog/variants.ts'), 'utf8');

    // Positive adjustments must be unconditionally rejected
    assert.ok(variantsCode.includes('if (input.quantityChange > 0) {'));
    assert.ok(variantsCode.includes('Positive inventory adjustments are prohibited'));
    assert.ok(variantsCode.includes('Restock from Purchase'));

    // Negative adjustments must require notes
    assert.ok(variantsCode.includes('if (input.quantityChange < 0) {'));
    assert.ok(variantsCode.includes('Negative inventory adjustments (damage, shrinkage, defect, loss) require audit notes'));
  });

  it('guards every exported purchasing server action behind isFeatureEnabled()', () => {
    // Find all exported async functions in admin-actions.ts
    const exportedFunctions = actionsCode.match(/export async function ([a-zA-Z0-9_]+)/g) || [];
    assert.ok(exportedFunctions.length >= 10, 'Expected at least 10 exported purchasing actions');

    // Ensure isFeatureEnabled definition checks NEXT_PUBLIC_ENABLE_PURCHASE_MANAGEMENT
    assert.ok(actionsCode.includes("function isFeatureEnabled(): boolean"));
    assert.ok(actionsCode.includes("process.env.NEXT_PUBLIC_ENABLE_PURCHASE_MANAGEMENT === 'true'"));

    // Ensure isFeatureEnabled is checked at the top of each action
    const featureCheckMatches = actionsCode.match(/if \(!isFeatureEnabled\(\)\)/g) || [];
    assert.equal(
      featureCheckMatches.length,
      exportedFunctions.length,
      `Every exported action must call if (!isFeatureEnabled()). Found ${featureCheckMatches.length} checks for ${exportedFunctions.length} actions.`
    );
  });

  it('migration 00013 does not contain top-level BEGIN or COMMIT statements', () => {
    // Must not have unnested top-level transaction statements (SQL Editor requires manual transaction wrapper)
    const lines = migrationSql.split('\n').map((l) => l.trim());
    assert.ok(!lines.includes('BEGIN;'), 'Migration file must not contain top-level BEGIN;');
    assert.ok(!lines.includes('COMMIT;'), 'Migration file must not contain top-level COMMIT;');
  });
});
