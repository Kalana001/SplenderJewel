import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  calculateTransferCostCents,
  calculateMovingWeightedAverageCost,
  allocateBatchExpensesExact,
} from '../lib/purchases/calculations.ts';

describe('Purchase Management Stage 4B: Critical Workflow Remediation', () => {
  // ── 1. Partial-Receipt Costing & Residual Invariants ──────────────────────
  test('Partial-Receipt Accounting: 10 purchased, 5 received & transferred, then 5 received & transferred', () => {
    const lineTotalLandedCostCents = BigInt(10000); // 10,000 cents total (10 units @ 1,000 cents/unit)
    const quantityPurchased = 10;

    // First shipment: 5 units received
    let quantityReceived = 5;
    let quantityLinked = 0;
    let cumulativeTransferredCostCents = BigInt(0);

    // Transfer 1: Transfer the 5 received units
    const transfer1 = calculateTransferCostCents({
      quantityPurchased,
      quantityReceived,
      quantityLinked,
      transferQuantity: 5,
      lineTotalLandedCostCents,
      cumulativeTransferredCostCents,
    });

    // In old buggy logic, transfer1 absorbed 100% of line cost (10,000 cents / 2,000 cents per unit)
    // In corrected logic, transfer1 takes pro-rata based on quantityPurchased: exactly 5,000 cents (1,000 cents/unit)
    assert.equal(transfer1.transferCostCents, BigInt(5000));
    assert.equal(transfer1.transferUnitCostCents, BigInt(1000));
    assert.equal(transfer1.newQuantityLinked, 5);
    assert.equal(transfer1.newCumulativeTransferredCostCents, BigInt(5000));

    // Second shipment: remaining 5 units arrive
    quantityReceived = 10;
    quantityLinked = transfer1.newQuantityLinked;
    cumulativeTransferredCostCents = transfer1.newCumulativeTransferredCostCents;

    // Transfer 2: Transfer the remaining 5 units
    const transfer2 = calculateTransferCostCents({
      quantityPurchased,
      quantityReceived,
      quantityLinked,
      transferQuantity: 5,
      lineTotalLandedCostCents,
      cumulativeTransferredCostCents,
    });

    // In old buggy logic, transfer2 received 0 cents (10,000 - 10,000)
    // In corrected logic, transfer2 absorbs remaining balance to equal exactly 5,000 cents
    assert.equal(transfer2.transferCostCents, BigInt(5000));
    assert.equal(transfer2.transferUnitCostCents, BigInt(1000));
    assert.equal(transfer2.newQuantityLinked, 10);
    assert.equal(transfer2.newCumulativeTransferredCostCents, BigInt(10000));

    // Invariant: Total transferred equals line total exactly with 0 residual cent drift
    const totalTransferred = transfer1.transferCostCents + transfer2.transferCostCents;
    assert.equal(totalTransferred, lineTotalLandedCostCents);
  });

  test('Partial-Receipt Accounting: 7 units with a non-divisible remainder cent', () => {
    // 1,000 cents across 7 units (142.857... cents/unit)
    const lineTotalLandedCostCents = BigInt(1000);
    const quantityPurchased = 7;
    const quantityReceived = 7;

    // Transfer 1: 3 units transferred first
    const transfer1 = calculateTransferCostCents({
      quantityPurchased,
      quantityReceived,
      quantityLinked: 0,
      transferQuantity: 3,
      lineTotalLandedCostCents,
      cumulativeTransferredCostCents: BigInt(0),
    });

    // 1000 * 3 / 7 = 428.57... => 429 cents
    assert.equal(transfer1.transferCostCents, BigInt(429));
    assert.equal(transfer1.transferUnitCostCents, BigInt(143));

    // Transfer 2: remaining 4 units transferred
    const transfer2 = calculateTransferCostCents({
      quantityPurchased,
      quantityReceived,
      quantityLinked: 3,
      transferQuantity: 4,
      lineTotalLandedCostCents,
      cumulativeTransferredCostCents: transfer1.newCumulativeTransferredCostCents,
    });

    // Final transfer: 1000 - 429 = 571 cents (absorbs 1-cent rounding difference)
    assert.equal(transfer2.transferCostCents, BigInt(571));
    assert.equal(transfer2.transferUnitCostCents, BigInt(143));

    // Invariant: sum of partial transfers matches 1,000 cents with 0 loss
    assert.equal(transfer1.transferCostCents + transfer2.transferCostCents, lineTotalLandedCostCents);
  });

  test('Receiving Shortage & Financial Isolation: Unreceived units do not inflate transferred unit costs', () => {
    // 10 units purchased @ 1,000 cents/unit = 10,000 cents
    const lineTotalLandedCostCents = BigInt(10000);
    const quantityPurchased = 10;
    // Supplier permanently short-ships: only 6 arrive, 4 are cancelled/credited
    const quantityReceived = 6;

    const transfer = calculateTransferCostCents({
      quantityPurchased,
      quantityReceived,
      quantityLinked: 0,
      transferQuantity: 6,
      lineTotalLandedCostCents,
      cumulativeTransferredCostCents: BigInt(0),
    });

    // Cost for 6 units is pro-rata: (10000 / 10) * 6 = 6,000 cents (1,000 cents/unit)
    assert.equal(transfer.transferCostCents, BigInt(6000));
    assert.equal(transfer.transferUnitCostCents, BigInt(1000));
    // The unreceived 4 units (4,000 cents) remain in purchase ledger for vendor credit
    const unlinkedBalanceCents = lineTotalLandedCostCents - transfer.newCumulativeTransferredCostCents;
    assert.equal(unlinkedBalanceCents, BigInt(4000));
  });

  // ── 2. SQL Migration 00013 Structural Verification ────────────────────────
  test('Migration 00013: Contains create_product_from_purchase_batch with atomic rollback and idempotency', () => {
    const migrationPath = join(process.cwd(), 'supabase', 'migrations', '00013_purchase_management.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    // Procedure existence
    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.create_product_from_purchase_batch'));
    // Security Definer & role guard
    assert.ok(sql.includes('SECURITY DEFINER'));
    assert.ok(sql.includes("role', true), 'none'), current_user) NOT IN ('service_role', 'postgres', 'supabase_admin')"));
    // Idempotency table
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.purchase_product_creation_logs'));
    assert.ok(sql.includes('purchase_product_creation_logs ENABLE ROW LEVEL SECURITY'));
    // Draft publication guarantee
    assert.ok(sql.includes('FALSE, -- ALWAYS default to draft; requires explicit publication'));
    // Exact residual transfer cost condition using quantity_purchased
    assert.ok(sql.includes('IF (v_batch_var.quantity_linked + v_transfer_qty) = v_batch_var.quantity_purchased THEN'));
    assert.ok(sql.includes('(v_batch_var.line_total_landed_cost_cents::NUMERIC / v_batch_var.quantity_purchased::NUMERIC) * v_transfer_qty'));
    // Canonical locking
    assert.ok(sql.includes('FOR UPDATE'));
    // Least privilege grants
    assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.create_product_from_purchase_batch(JSONB, JSONB, JSONB, TEXT, UUID) FROM PUBLIC, anon, authenticated;'));
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.create_product_from_purchase_batch(JSONB, JSONB, JSONB, TEXT, UUID) TO service_role;'));
  });

  test('Migration 00013: transfer_purchase_stock_to_variant corrected to use quantity_purchased', () => {
    const migrationPath = join(process.cwd(), 'supabase', 'migrations', '00013_purchase_management.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    // Ensure buggy condition checking quantity_received is eliminated
    assert.ok(!sql.includes('(v_batch_var.quantity_linked + p_quantity) = v_batch_var.quantity_received THEN'));
    // Ensure corrected condition checking quantity_purchased is present
    assert.ok(sql.includes('(v_batch_var.quantity_linked + p_quantity) = v_batch_var.quantity_purchased THEN'));
    assert.ok(sql.includes('v_batch_var.line_total_landed_cost_cents::NUMERIC / v_batch_var.quantity_purchased::NUMERIC'));
  });

  // ── 3. Trusted Boundary Provenance Enforcement ("NO PURCHASE = NO ITEM TO SELL") ──
  test('Provenance Enforcement: createProductAction strictly rejects positive stock without purchase provenance', () => {
    const productsPath = join(process.cwd(), 'lib', 'catalog', 'products.ts');
    const content = readFileSync(productsPath, 'utf8');

    assert.ok(content.includes('NO PURCHASE = NO ITEM TO SELL'));
    assert.ok(content.includes('typeof v.stockQuantity === \'number\' && v.stockQuantity > 0'));
    // Ensures no arbitrary bypass strings remain
    assert.ok(!content.includes('openingStockReconciliationKey'));
  });

  test('Provenance Enforcement: createVariantAction strictly rejects positive stock without purchase provenance', () => {
    const variantsPath = join(process.cwd(), 'lib', 'catalog', 'variants.ts');
    const content = readFileSync(variantsPath, 'utf8');

    assert.ok(content.includes('NO PURCHASE = NO ITEM TO SELL'));
    assert.ok(content.includes('stockQuantity > 0'));
    // Ensures no arbitrary bypass strings remain
    assert.ok(!content.includes('openingStockReconciliationKey'));
  });

  test('Provenance Enforcement: adjustVariantStockAction strictly rejects all positive manual adjustments', () => {
    const variantsPath = join(process.cwd(), 'lib', 'catalog', 'variants.ts');
    const content = readFileSync(variantsPath, 'utf8');

    assert.ok(content.includes('if (input.quantityChange > 0) {'));
    assert.ok(content.includes('NO PURCHASE = NO ITEM TO SELL: Positive inventory adjustments are prohibited'));
    assert.ok(content.includes('Restock from Purchase'));
    // Ensures unverified arbitrary string keys are completely eliminated
    assert.ok(!content.includes('reconciliationAuditKey'));
  });

  test('Provenance Enforcement: adjustVariantStockAction permits legitimate negative adjustments (damage/loss) with notes', () => {
    const variantsPath = join(process.cwd(), 'lib', 'catalog', 'variants.ts');
    const content = readFileSync(variantsPath, 'utf8');

    // Asserts that the provenance guard condition strictly checks `input.quantityChange > 0`
    assert.ok(content.includes('if (input.quantityChange > 0) {'));
    assert.ok(content.includes('if (input.quantityChange < 0) {'));
    assert.ok(content.includes('Negative inventory adjustments (damage, shrinkage, defect, loss) require audit notes'));
  });

  test('Publication Guard: updateProductAction checks variant price > 0 before setting isActive = true', () => {
    const productsPath = join(process.cwd(), 'lib', 'catalog', 'products.ts');
    const content = readFileSync(productsPath, 'utf8');

    assert.ok(content.includes('input.isActive === true'));
    assert.ok(content.includes('Number(v.price) <= 0'));
    assert.ok(content.includes('valid selling price greater than 0'));
  });

  // ── 4. Atomic Product Creation from Purchase Batch ────────────────────────
  test('ProductForm: Replaces separate createProductAction + transfer loop with single atomic action', () => {
    const productFormPath = join(process.cwd(), 'components', 'admin', 'product-form.tsx');
    const content = readFileSync(productFormPath, 'utf8');

    // Confirms single atomic call
    assert.ok(content.includes('createProductFromPurchaseBatchAction'));
    // Confirms unlinked products strictly enforce 0 stock
    assert.ok(content.includes('NO PURCHASE = NO ITEM TO SELL'));
    assert.ok(content.includes('stockQuantity: 0'));
  });

  test('Admin Actions: createProductFromPurchaseBatchAction exported and enforces server-side admin auth', () => {
    const adminActionsPath = join(process.cwd(), 'lib', 'purchases', 'admin-actions.ts');
    const content = readFileSync(adminActionsPath, 'utf8');

    assert.ok(content.includes('export async function createProductFromPurchaseBatchAction'));
    assert.ok(content.includes('create_product_from_purchase_batch'));
    assert.ok(content.includes('requireAdminAuth()'));
    assert.ok(content.includes('isFeatureEnabled()'));
  });
});
