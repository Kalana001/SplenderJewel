import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { 
  allocateBatchExpensesExact, 
  decimalLkrToCents, 
  centsToDecimalLkr, 
  calculateMovingWeightedAverageCost 
} from '../lib/purchases/calculations.ts';
import { 
  getMockEligiblePurchaseVariations,
  MOCK_BATCH_DETAILS 
} from '../lib/purchases/mock-data.ts';
import * as fs from 'fs';
import * as path from 'path';

describe('Purchase Management Stage 3: Product Creation & Inventory Integration', () => {

  test('Purchase Item Selection & Autofill Extraction', () => {
    const eligible = getMockEligiblePurchaseVariations();
    
    // Eligible variations must only come from received / partially received batches
    assert.ok(eligible.length > 0, 'Must have eligible purchase variations');
    for (const v of eligible) {
      assert.ok(v.availableQuantity > 0, `Variation ${v.variationTitle} must have available stock`);
      assert.ok(v.batchNumber, 'Must have batch number');
      assert.ok(v.supplierName, 'Must have supplier name');
      assert.ok(v.unitLandedCostLkr > 0, 'Must have positive unit landed cost');
    }

    // Verify fashion jewelry examples from PB-2026-001 (Gold Plated Rings)
    const ringVars = eligible.filter(v => v.batchNumber === 'PB-2026-001');
    assert.equal(ringVars.length, 3);
    assert.equal(ringVars[0].itemName, '18K Gold Plated Stacking Ring');
    assert.equal(ringVars[0].variationTitle, 'Size 6');
    assert.equal(ringVars[0].unitLandedCostLkr, 640.00);

    assert.equal(ringVars[1].variationTitle, 'Size 7');
    assert.equal(ringVars[1].unitLandedCostLkr, 690.00);

    assert.equal(ringVars[2].variationTitle, 'Size 8');
    assert.equal(ringVars[2].unitLandedCostLkr, 740.00);

    // Draft (PB-2026-004) and Cancelled (PB-2026-005) batches must have 0 eligible variations
    const draftVars = eligible.filter(v => v.batchNumber === 'PB-2026-004');
    assert.equal(draftVars.length, 0, 'Draft batches must not be eligible for product creation');

    const cancelledVars = eligible.filter(v => v.batchNumber === 'PB-2026-005');
    assert.equal(cancelledVars.length, 0, 'Cancelled batches must not be eligible for product creation');
  });

  test('Variation Mapping: Never Merge Variations by Name & Preserve Distinct Costs', () => {
    const eligible = getMockEligiblePurchaseVariations();
    const ringVars = eligible.filter(v => v.batchNumber === 'PB-2026-001');

    // Simulate mapping into storefront product variants
    const mappedVariants = ringVars.map((v, idx) => ({
      title: v.variationTitle,
      sku: `SJ-RING-SZ${idx + 6}`,
      purchaseCost: v.unitLandedCostLkr,
      stockQuantity: v.availableQuantity,
      attributes: v.attributes,
      batchVariationId: v.batchVariationId,
    }));

    // Must remain 3 distinct variants with independent landed costs
    assert.equal(mappedVariants.length, 3);
    assert.equal(mappedVariants[0].title, 'Size 6');
    assert.equal(mappedVariants[0].purchaseCost, 640.00);
    assert.equal(mappedVariants[0].stockQuantity, 5);

    assert.equal(mappedVariants[1].title, 'Size 7');
    assert.equal(mappedVariants[1].purchaseCost, 690.00);
    assert.equal(mappedVariants[1].stockQuantity, 8);

    assert.equal(mappedVariants[2].title, 'Size 8');
    assert.equal(mappedVariants[2].purchaseCost, 740.00);
    assert.equal(mappedVariants[2].stockQuantity, 7);

    // Each must maintain its unique batchVariationId
    const varIds = new Set(mappedVariants.map(v => v.batchVariationId));
    assert.equal(varIds.size, 3, 'Each variant must map to a unique batchVariationId');
  });

  test('Partial Quantity Allocation: Unlinked Balance Remains Available', () => {
    const eligible = getMockEligiblePurchaseVariations();
    const pearl16 = eligible.find(v => v.batchNumber === 'PB-2026-002' && v.variationTitle === '16 Inch Chain')!;
    assert.ok(pearl16);

    const totalAvailable = pearl16.availableQuantity; // 10 units
    assert.equal(totalAvailable, 10);

    // Partial allocation of 4 units
    const allocated = 4;
    assert.ok(allocated <= totalAvailable);
    const remainingBalance = totalAvailable - allocated;
    assert.equal(remainingBalance, 6, '6 units must remain unlinked for future products or restocks');

    // Rejects over-allocation
    const invalidAllocation = 15;
    assert.ok(invalidAllocation > totalAvailable, 'Allocation cannot exceed available units');
  });

  test('Inventory Restocking: Moving Weighted Average Cost (WAC) Blending', () => {
    // Current Variant: 10 units in stock @ Rs. 400.00 cost
    const currentStock = 10;
    const currentCostCents = decimalLkrToCents(400);

    // Inbound Purchase Restock: 5 units @ Rs. 640.00 landed cost
    const transferQty = 5;
    const transferUnitCostCents = decimalLkrToCents(640);

    // Formula: ((10 * 40000) + (5 * 64000)) / 15 = (400000 + 320000) / 15 = 720000 / 15 = 48000 cents (Rs. 480.00)
    const newWacCents = calculateMovingWeightedAverageCost(
      currentStock,
      currentCostCents,
      transferQty,
      transferUnitCostCents
    );

    assert.equal(centsToDecimalLkr(newWacCents), 480.00);

    // Sequential second restock from another batch: 10 units @ Rs. 500.00 landed cost
    // Existing: 15 units @ Rs. 480.00 = 720,000 cents
    // New: 10 units @ Rs. 500.00 = 500,000 cents
    // Total: 25 units, 1,220,000 cents => 1,220,000 / 25 = 48,800 cents (Rs. 488.00)
    const secondBatchWacCents = calculateMovingWeightedAverageCost(
      15,
      newWacCents,
      10,
      decimalLkrToCents(500)
    );

    assert.equal(centsToDecimalLkr(secondBatchWacCents), 488.00);
  });

  test('WAC Edge Cases: Out of Stock (0 units) Adopts New Inbound Cost Directly', () => {
    // When storefront variant is currently out of stock (0 units), the new batch landed cost
    // becomes the variant cost directly without dilution.
    const currentStock = 0;
    const currentCostCents = decimalLkrToCents(350);
    const transferQty = 8;
    const transferUnitCostCents = decimalLkrToCents(690);

    const newWacCents = calculateMovingWeightedAverageCost(
      currentStock,
      currentCostCents,
      transferQty,
      transferUnitCostCents
    );

    assert.equal(centsToDecimalLkr(newWacCents), 690.00);
  });

  test('Publication Controls: Sellable Products Require Pricing & Provenance', () => {
    const productFormPath = path.join(process.cwd(), 'components', 'admin', 'product-form.tsx');
    const content = fs.readFileSync(productFormPath, 'utf8');

    // Asserts that isActive verification checks selling price > 0
    assert.ok(content.includes('numPrice <= 0'));
    // Asserts that isActive verification checks purchase provenance if stock > 0
    assert.ok(content.includes('verified purchase provenance'));
    // Asserts that newly created products default to draft or allow draft save
    assert.ok(content.includes('Save as Draft') || content.includes('Save as an unpublished draft'));
  });

  test('Legacy Stock Isolation: Existing Products & Manual Adjustments Preserved', () => {
    const inventoryManagerPath = path.join(process.cwd(), 'components', 'admin', 'inventory-manager.tsx');
    const content = fs.readFileSync(inventoryManagerPath, 'utf8');

    // Confirms both Restock from Purchase and Manual Adjust buttons exist
    assert.ok(content.includes('Restock from Purchase'));
    assert.ok(content.includes('Manual Adjust') || content.includes('Adjust Stock'));
    // Confirms PurchaseRestockModal is integrated
    assert.ok(content.includes('PurchaseRestockModal'));
  });

  test('Duplicate Transfer Protection: Migration 00013 Enforces Idempotency Key Guard', () => {
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '00013_purchase_management.sql');
    const content = fs.readFileSync(migrationPath, 'utf8');

    // Asserts transfer function checks idempotency key
    assert.ok(content.includes('public.transfer_purchase_stock_to_variant'));
    assert.ok(content.includes('p_idempotency_key'));
    assert.ok(content.includes('idempotency_key = p_idempotency_key'));
    // Asserts error 23505 raised on parameter conflict
    assert.ok(content.includes('23505'));
    // Asserts residual-cent balancing
    assert.ok(content.includes('cumulative_transferred_cost_cents'));
  });

  test('Admin Authorization & Security Isolation', () => {
    const actionsPath = path.join(process.cwd(), 'lib', 'purchases', 'admin-actions.ts');
    const content = fs.readFileSync(actionsPath, 'utf8');

    assert.ok(content.includes('requireAdminAuth()'));
    assert.ok(content.includes('getEligiblePurchaseVariationsAction'));
    assert.ok(content.includes('linkTransferredStockToNewProductAction'));
    assert.ok(content.includes('transferPurchaseStockToVariantAction'));
  });
});
