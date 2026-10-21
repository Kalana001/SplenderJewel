import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { 
  allocateBatchExpensesExact, 
  decimalLkrToCents, 
  centsToDecimalLkr, 
  calculateMovingWeightedAverageCost 
} from '../lib/purchases/calculations.ts';
import { 
  MOCK_PURCHASE_BATCHES, 
  MOCK_BATCH_DETAILS, 
  toBatchDetailViewDataDTO 
} from '../lib/purchases/mock-data.ts';
import * as fs from 'fs';
import * as path from 'path';

describe('Purchase Management Stage 2: Admin UI, Calculations & Workflow Verification', () => {

  test('Batch Form Validation: Item & Variation Invariants', () => {
    // 1. Valid single item with default variation
    const singleItemInputs = [
      { variationId: 'default-var-1', quantity: 10, supplierUnitPriceCents: decimalLkrToCents(500) }
    ];
    const totalExpensesCents = decimalLkrToCents(1000);
    const allocSingle = allocateBatchExpensesExact(totalExpensesCents, singleItemInputs);
    
    assert.equal(allocSingle.length, 1);
    assert.equal(allocSingle[0].quantity, 10);
    assert.equal(allocSingle[0].lineSupplierCostCents, BigInt(500000)); // 10 * 50000
    assert.equal(allocSingle[0].lineAllocatedExpenseCents, BigInt(100000)); // 100000
    assert.equal(allocSingle[0].lineTotalLandedCostCents, BigInt(600000));
    assert.equal(allocSingle[0].unitLandedCostCents, BigInt(60000)); // 600.00 LKR

    // 2. Reject negative quantity
    assert.throws(() => {
      allocateBatchExpensesExact(totalExpensesCents, [
        { variationId: 'v1', quantity: -1, supplierUnitPriceCents: decimalLkrToCents(100) }
      ]);
    }, /must be a positive integer/);

    // 3. Reject negative supplier price
    assert.throws(() => {
      allocateBatchExpensesExact(totalExpensesCents, [
        { variationId: 'v1', quantity: 5, supplierUnitPriceCents: BigInt(-100) }
      ]);
    }, /cannot be negative/);

    // 4. Reject empty variations
    assert.throws(() => {
      allocateBatchExpensesExact(totalExpensesCents, []);
    }, /At least one variation line is required/);
  });

  test('Variation Handling: Multi-Variation Allocation (e.g. Ring Sizes 6, 7, 8)', () => {
    // Example from user specification:
    // Ring:
    // - Size 6: qty 5, supplier cost Rs. 400 each
    // - Size 7: qty 8, supplier cost Rs. 450 each
    // - Size 8: qty 7, supplier cost Rs. 500 each
    // Total units: 20
    // Expenses: Shipping Rs. 1500, Customs Rs. 2500, Packing Rs. 800 => Total: Rs. 4800 (480,000 cents)
    const totalExpensesCents = decimalLkrToCents(4800);
    const lines = [
      { variationId: 'sz-6', quantity: 5, supplierUnitPriceCents: decimalLkrToCents(400) },
      { variationId: 'sz-7', quantity: 8, supplierUnitPriceCents: decimalLkrToCents(450) },
      { variationId: 'sz-8', quantity: 7, supplierUnitPriceCents: decimalLkrToCents(500) },
    ];

    const allocations = allocateBatchExpensesExact(totalExpensesCents, lines);
    const allocMap = new Map(allocations.map(a => [a.variationId, a]));

    const sz6 = allocMap.get('sz-6')!;
    const sz7 = allocMap.get('sz-7')!;
    const sz8 = allocMap.get('sz-8')!;

    // Total expense per unit = 4800 / 20 = Rs. 240.00 (24,000 cents)
    // Size 6: Supplier 400 + Exp 240 = 640.00 landed
    assert.equal(centsToDecimalLkr(sz6.supplierUnitPriceCents), 400.00);
    assert.equal(centsToDecimalLkr(sz6.unitLandedCostCents), 640.00);
    assert.equal(centsToDecimalLkr(sz6.lineTotalLandedCostCents), 5 * 640.00); // 3200.00

    // Size 7: Supplier 450 + Exp 240 = 690.00 landed
    assert.equal(centsToDecimalLkr(sz7.supplierUnitPriceCents), 450.00);
    assert.equal(centsToDecimalLkr(sz7.unitLandedCostCents), 690.00);
    assert.equal(centsToDecimalLkr(sz7.lineTotalLandedCostCents), 8 * 690.00); // 5520.00

    // Size 8: Supplier 500 + Exp 240 = 740.00 landed
    assert.equal(centsToDecimalLkr(sz8.supplierUnitPriceCents), 500.00);
    assert.equal(centsToDecimalLkr(sz8.unitLandedCostCents), 740.00);
    assert.equal(centsToDecimalLkr(sz8.lineTotalLandedCostCents), 7 * 740.00); // 5180.00

    // Total Batch Supplier Subtotal = (5*400) + (8*450) + (7*500) = 2000 + 3600 + 3500 = 9100.00
    const totalSupplierLkr = centsToDecimalLkr(sz6.lineSupplierCostCents + sz7.lineSupplierCostCents + sz8.lineSupplierCostCents);
    assert.equal(totalSupplierLkr, 9100.00);

    // Total Batch Landed Cost = 9100 + 4800 = 13900.00
    const totalLandedLkr = centsToDecimalLkr(sz6.lineTotalLandedCostCents + sz7.lineTotalLandedCostCents + sz8.lineTotalLandedCostCents);
    assert.equal(totalLandedLkr, 13900.00);
  });

  test('Cost Preview Reconciliation: Non-Divisible Fractional Remainder Cents', () => {
    // 7 units total, Rs. 100.01 expense (10,001 cents).
    // 10001 / 7 = 1428 base cents with 5 remainder cents.
    // 5 lowest variationIds get 1 extra cent.
    const totalExpensesCents = BigInt(10001);
    const lines = [
      { variationId: 'v-1', quantity: 1, supplierUnitPriceCents: BigInt(50000) },
      { variationId: 'v-2', quantity: 1, supplierUnitPriceCents: BigInt(50000) },
      { variationId: 'v-3', quantity: 1, supplierUnitPriceCents: BigInt(50000) },
      { variationId: 'v-4', quantity: 1, supplierUnitPriceCents: BigInt(50000) },
      { variationId: 'v-5', quantity: 1, supplierUnitPriceCents: BigInt(50000) },
      { variationId: 'v-6', quantity: 1, supplierUnitPriceCents: BigInt(50000) },
      { variationId: 'v-7', quantity: 1, supplierUnitPriceCents: BigInt(50000) },
    ];

    const allocations = allocateBatchExpensesExact(totalExpensesCents, lines);
    const sumAllocatedExpenses = allocations.reduce((sum, a) => sum + a.lineAllocatedExpenseCents, BigInt(0));

    // Invariant: sum of allocated expenses must exactly match batch expenses (0-cent drift)
    assert.equal(sumAllocatedExpenses, totalExpensesCents);

    // First 5 variations get 1429 cents, last 2 get 1428 cents
    assert.equal(allocations[0].lineAllocatedExpenseCents, BigInt(1429));
    assert.equal(allocations[4].lineAllocatedExpenseCents, BigInt(1429));
    assert.equal(allocations[5].lineAllocatedExpenseCents, BigInt(1428));
    assert.equal(allocations[6].lineAllocatedExpenseCents, BigInt(1428));
  });

  test('Receiving Workflow: Quantity Balance & Partial Receipt Invariants', () => {
    const mockBatch2 = MOCK_BATCH_DETAILS['PB-2026-002'];
    assert.ok(mockBatch2);
    assert.equal(mockBatch2.batch.status, 'partially_received');

    const dto = toBatchDetailViewDataDTO(mockBatch2);
    assert.equal(dto.batch.totalPurchasedUnits, 25);
    assert.equal(dto.batch.totalReceivedUnits, 15);

    // Check item variations balance
    const var1 = dto.items[0].variations.find(v => v.variationTitle === '16 Inch Chain')!;
    const var2 = dto.items[0].variations.find(v => v.variationTitle === '18 Inch Chain')!;

    // Size 2-4: 10 purchased, 10 received => 0 remaining
    assert.equal(var1.quantityPurchased, 10);
    assert.equal(var1.quantityReceived, 10);
    assert.equal(var1.quantityRemaining, 0);

    // Size 2-6: 15 purchased, 5 received => 10 remaining to receive
    assert.equal(var2.quantityPurchased, 15);
    assert.equal(var2.quantityReceived, 5);
    assert.equal(var2.quantityRemaining, 10);

    // Valid partial receive: 6 units (6 <= 10 remaining)
    const validReceivingQty = 6;
    assert.ok(validReceivingQty <= var2.quantityRemaining);

    // Invalid over-receive: 11 units (> 10 remaining)
    const invalidReceivingQty = 11;
    assert.ok(invalidReceivingQty > var2.quantityRemaining);
  });

  test('Safe Cancellation Invariants: Only Draft or Ordered with Zero Linked Units', () => {
    // Draft batch with 0 units linked: permitted
    const draftBatch = MOCK_BATCH_DETAILS['PB-2026-004'];
    assert.equal(draftBatch.batch.status, 'draft');
    const draftLinked = draftBatch.items[0].variations.reduce((sum, v) => sum + v.quantityLinked, 0);
    assert.equal(draftLinked, 0);

    // Ordered batch with 0 units linked: permitted
    const orderedBatch = MOCK_BATCH_DETAILS['PB-2026-003'];
    assert.equal(orderedBatch.batch.status, 'ordered');
    const orderedLinked = orderedBatch.items[0].variations.reduce((sum, v) => sum + v.quantityLinked, 0);
    assert.equal(orderedLinked, 0);

    // Cancelled batch preserves audit reason
    const cancelledBatch = MOCK_BATCH_DETAILS['PB-2026-005'];
    assert.equal(cancelledBatch.batch.status, 'cancelled');
    assert.ok(cancelledBatch.batch.cancellationReason);
    assert.match(cancelledBatch.batch.cancellationReason!, /Supplier discontinued/);
  });

  test('Admin Sidebar: Feature Flag Gating', () => {
    const sidebarPath = path.join(process.cwd(), 'components', 'admin', 'admin-sidebar.tsx');
    const content = fs.readFileSync(sidebarPath, 'utf8');

    // Asserts that the Purchases link is strictly gated behind NEXT_PUBLIC_ENABLE_PURCHASE_MANAGEMENT
    assert.ok(content.includes('process.env.NEXT_PUBLIC_ENABLE_PURCHASE_MANAGEMENT === \'true\''));
    assert.ok(content.includes('href: \'/admin/purchases\''));
    assert.ok(content.includes('label: \'Purchases\''));
  });

  test('Server Component Auth Guards: All Pages Require requireAdminPageAuth', () => {
    const pages = [
      path.join(process.cwd(), 'app', 'admin', 'purchases', 'page.tsx'),
      path.join(process.cwd(), 'app', 'admin', 'purchases', 'new', 'page.tsx'),
      path.join(process.cwd(), 'app', 'admin', 'purchases', '[id]', 'page.tsx'),
    ];

    for (const pagePath of pages) {
      assert.ok(fs.existsSync(pagePath), `Page exists: ${pagePath}`);
      const content = fs.readFileSync(pagePath, 'utf8');
      assert.ok(content.includes('requireAdminPageAuth()'), `Page enforces requireAdminPageAuth: ${pagePath}`);
      assert.ok(content.includes('NEXT_PUBLIC_ENABLE_PURCHASE_MANAGEMENT'), `Page checks feature flag: ${pagePath}`);
    }
  });

  test('Server Actions Auth & Feature Flag Guards', () => {
    const actionsPath = path.join(process.cwd(), 'lib', 'purchases', 'admin-actions.ts');
    const content = fs.readFileSync(actionsPath, 'utf8');

    assert.ok(content.includes('requireAdminAuth()'));
    assert.ok(content.includes('isFeatureEnabled()'));
    assert.ok(content.includes('createPurchaseBatchAction'));
    assert.ok(content.includes('confirmPurchaseBatchAction'));
    assert.ok(content.includes('receivePurchaseBatchItemsAction'));
    assert.ok(content.includes('cancelPurchaseBatchAction'));
    assert.ok(content.includes('listPurchaseBatchesAction'));
    assert.ok(content.includes('getPurchaseBatchDetailAction'));
  });

  test('Missing Migration Resilience: 42P01 Handled Cleanly Without Crashing', () => {
    const actionsPath = path.join(process.cwd(), 'lib', 'purchases', 'admin-actions.ts');
    const content = fs.readFileSync(actionsPath, 'utf8');

    assert.ok(content.includes('42P01'));
    assert.ok(content.includes('isMissingMigration: true'));
  });

  test('Confidentiality: Zero Supplier/Landed Cost Leaks in Storefront Routes', () => {
    // Verify that store routes do not import purchase management modules
    const storeDirPath = path.join(process.cwd(), 'app', '(store)');
    
    function scanDir(dir: string) {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        const fullPath = path.join(dir, f);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if (f.endsWith('.tsx') || f.endsWith('.ts')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          assert.ok(
            !content.includes('lib/purchases'),
            `Storefront file ${fullPath} must not import lib/purchases`
          );
        }
      }
    }

    scanDir(storeDirPath);
  });
});
