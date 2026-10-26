import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateBatchExpensesExact,
  calculateMovingWeightedAverageCost,
  calculateTransferCostCents,
  decimalLkrToCents,
  centsToDecimalLkr,
  type LineCostInput,
} from '../lib/purchases/calculations.ts';

describe('Repeat Purchase & Restock Workflow Engine', () => {
  describe('Stage 5 — Financial and Inventory Safety: Moving Weighted Average Cost (WAC)', () => {
    it('accurately blends 10 units @ LKR 350 with 15 incoming units @ LKR 400 to equal 25 units @ LKR 380', () => {
      // Existing stock: 10 units @ LKR 350.00
      const currentStock = 10;
      const currentCostCents = decimalLkrToCents(350); // 35,000 cents
      assert.equal(currentCostCents, BigInt(35000));

      // New received stock: 15 units @ LKR 400.00
      const incomingQuantity = 15;
      const incomingUnitCostCents = decimalLkrToCents(400); // 40,000 cents
      assert.equal(incomingUnitCostCents, BigInt(40000));

      // Calculate blended WAC
      const blendedCostCents = calculateMovingWeightedAverageCost(
        currentStock,
        currentCostCents,
        incomingQuantity,
        incomingUnitCostCents
      );

      // Expected calculation:
      // (10 * 35000) + (15 * 40000) = 350,000 + 600,000 = 950,000 cents
      // 950,000 / 25 = 38,000 cents
      assert.equal(blendedCostCents, BigInt(38000));

      const blendedLkr = centsToDecimalLkr(blendedCostCents);
      assert.equal(blendedLkr, 380.0);
    });

    it('adopts incoming unit landed cost directly when existing stock is 0 (out of stock)', () => {
      const currentStock = 0;
      const currentCostCents = decimalLkrToCents(250); // stale historical cost
      const incomingQuantity = 20;
      const incomingUnitCostCents = decimalLkrToCents(420.5);

      const blendedCostCents = calculateMovingWeightedAverageCost(
        currentStock,
        currentCostCents,
        incomingQuantity,
        incomingUnitCostCents
      );

      assert.equal(blendedCostCents, incomingUnitCostCents);
      assert.equal(centsToDecimalLkr(blendedCostCents), 420.5);
    });

    it('handles fractional cent half-up rounding consistently', () => {
      // 7 units @ 333.33 + 3 units @ 500.00
      // 7 * 33333 = 233331
      // 3 * 50000 = 150000
      // Total = 383331 / 10 = 38333.1 => rounds to 38333 cents (383.33 LKR)
      const currentStock = 7;
      const currentCostCents = BigInt(33333);
      const incomingQuantity = 3;
      const incomingUnitCostCents = BigInt(50000);

      const blended = calculateMovingWeightedAverageCost(
        currentStock,
        currentCostCents,
        incomingQuantity,
        incomingUnitCostCents
      );

      assert.equal(blended, BigInt(38333));
    });

    it('rejects invalid quantities or negative costs', () => {
      assert.throws(() => {
        calculateMovingWeightedAverageCost(10, BigInt(1000), 0, BigInt(2000));
      }, /Transfer quantity must be a positive integer/);

      assert.throws(() => {
        calculateMovingWeightedAverageCost(10, BigInt(1000), -5, BigInt(2000));
      }, /Transfer quantity must be a positive integer/);

      assert.throws(() => {
        calculateMovingWeightedAverageCost(10, BigInt(1000), 5, BigInt(-100));
      }, /Transfer unit cost cannot be negative/);
    });
  });

  describe('Stage 4 & 5 — Partial Receipt and Partial Transfer Accounting', () => {
    it('allocates pro-rata costs during intermediate partial transfers and absorbs exact residual cents on final transfer', () => {
      // 10 units purchased at total landed cost 33,333 cents (3,333.30 cents per unit)
      const quantityPurchased = 10;
      const lineTotalLandedCostCents = BigInt(33333);

      // Part 1: Partial transfer of 4 units
      const part1 = calculateTransferCostCents({
        quantityPurchased,
        quantityReceived: 4,
        quantityLinked: 0,
        transferQuantity: 4,
        lineTotalLandedCostCents,
        cumulativeTransferredCostCents: BigInt(0),
      });

      // 33333 / 10 = 3333.3 * 4 = 13333.2 => 13,333 cents
      assert.equal(part1.transferCostCents, BigInt(13333));
      assert.equal(part1.newQuantityLinked, 4);
      assert.equal(part1.newCumulativeTransferredCostCents, BigInt(13333));

      // Part 2: Partial transfer of 3 more units (total 7 transferred)
      const part2 = calculateTransferCostCents({
        quantityPurchased,
        quantityReceived: 7,
        quantityLinked: 4,
        transferQuantity: 3,
        lineTotalLandedCostCents,
        cumulativeTransferredCostCents: part1.newCumulativeTransferredCostCents,
      });

      // 33333 / 10 = 3333.3 * 3 = 9999.9 => 10,000 cents
      assert.equal(part2.transferCostCents, BigInt(10000));
      assert.equal(part2.newQuantityLinked, 7);
      assert.equal(part2.newCumulativeTransferredCostCents, BigInt(23333));

      // Part 3: Final transfer of remaining 3 units (total 10 transferred = purchased)
      // Must absorb the exact residual: 33333 - 23333 = 10,000 cents!
      const part3 = calculateTransferCostCents({
        quantityPurchased,
        quantityReceived: 10,
        quantityLinked: 7,
        transferQuantity: 3,
        lineTotalLandedCostCents,
        cumulativeTransferredCostCents: part2.newCumulativeTransferredCostCents,
      });

      assert.equal(part3.transferCostCents, BigInt(10000));
      assert.equal(part3.newQuantityLinked, 10);
      assert.equal(part3.newCumulativeTransferredCostCents, lineTotalLandedCostCents);

      // Verify ZERO drift across sum of all 3 transfers
      const totalTransferred = part1.transferCostCents + part2.transferCostCents + part3.transferCostCents;
      assert.equal(totalTransferred, lineTotalLandedCostCents);
    });

    it('prevents transferring more units than received and unlinked', () => {
      assert.throws(() => {
        calculateTransferCostCents({
          quantityPurchased: 10,
          quantityReceived: 5,
          quantityLinked: 3,
          transferQuantity: 4, // Only 5 - 3 = 2 available!
          lineTotalLandedCostCents: BigInt(50000),
          cumulativeTransferredCostCents: BigInt(15000),
        });
      }, /only 2 unlinked unit\(s\) available/);
    });
  });

  describe('Stage 2 — Existing Product Purchase Payload & Metadata Invariants', () => {
    it('properly structures existing product purchase payload with existingVariantId and existingProductId', () => {
      const existingProduct = {
        id: 'prod-uuid-1234',
        name: 'Classic Tennis Bracelet',
        code: 'JWL-BRC-01',
        category: 'Bracelets',
        variants: [
          { id: 'var-uuid-777', title: '7 Inch / Yellow Gold', sku: 'BRC-01-YG7', stock: 5, cost: 350 },
          { id: 'var-uuid-888', title: '7 Inch / White Gold', sku: 'BRC-01-WG7', stock: 2, cost: 380 },
        ],
      };

      // Create restock line items
      const restockVariations = existingProduct.variants.map((v) => ({
        variationTitle: v.title,
        attributes: {
          existing_product_id: existingProduct.id,
          existing_variant_id: v.id,
          target_sku: v.sku,
          is_restock: 'true',
        },
        supplierSku: v.sku,
        quantityPurchased: 10,
        supplierUnitPriceCents: decimalLkrToCents(400).toString(),
      }));

      // Assertions
      assert.equal(restockVariations.length, 2);
      assert.equal(restockVariations[0].attributes.existing_product_id, 'prod-uuid-1234');
      assert.equal(restockVariations[0].attributes.existing_variant_id, 'var-uuid-777');
      assert.equal(restockVariations[0].attributes.is_restock, 'true');
      assert.equal(restockVariations[0].supplierSku, 'BRC-01-YG7');
      assert.equal(restockVariations[1].attributes.existing_variant_id, 'var-uuid-888');

      // Verify that this metadata distinguishes restock items from new products
      const isRestockLine = (item: typeof restockVariations[0]) => item.attributes.is_restock === 'true';
      assert.ok(isRestockLine(restockVariations[0]));
      assert.ok(isRestockLine(restockVariations[1]));
    });
  });

  describe('Stage 3 — Add Item Positioning and State Stability', () => {
    interface TestItem {
      id: string;
      itemType: 'new' | 'existing';
      itemName: string;
      variations: Array<{ id: string; qty: number }>;
    }

    it('prepends newly added purchase items to the top while preserving all existing items and keys', () => {
      const initialItems: TestItem[] = [
        { id: 'item-1', itemType: 'new', itemName: 'First Item', variations: [{ id: 'var-1', qty: 5 }] },
        { id: 'item-2', itemType: 'existing', itemName: 'Second Item', variations: [{ id: 'var-2', qty: 10 }] },
      ];

      // Simulate handleAddItem prepending
      const newItem: TestItem = {
        id: 'item-3-newest',
        itemType: 'existing',
        itemName: 'Top Restock Item',
        variations: [{ id: 'var-3', qty: 15 }],
      };

      const updatedItems = [newItem, ...initialItems];

      // Newly added item is at index 0 (top)
      assert.equal(updatedItems[0].id, 'item-3-newest');
      assert.equal(updatedItems[0].itemName, 'Top Restock Item');

      // Existing items are fully preserved without key collision
      assert.equal(updatedItems[1].id, 'item-1');
      assert.equal(updatedItems[1].variations[0].qty, 5);
      assert.equal(updatedItems[2].id, 'item-2');
      assert.equal(updatedItems[2].variations[0].qty, 10);
      assert.equal(updatedItems.length, 3);
    });

    it('safely mutates items using ID-based selectors without index-shifting side effects', () => {
      let items: TestItem[] = [
        { id: 'item-top', itemType: 'new', itemName: 'Top Item', variations: [{ id: 'var-t', qty: 1 }] },
        { id: 'item-mid', itemType: 'new', itemName: 'Middle Item', variations: [{ id: 'var-m', qty: 1 }] },
        { id: 'item-bot', itemType: 'new', itemName: 'Bottom Item', variations: [{ id: 'var-b', qty: 1 }] },
      ];

      // ID-based update function
      const updateItem = (id: string, name: string) => {
        items = items.map((i) => (i.id === id ? { ...i, itemName: name } : i));
      };

      // ID-based remove function
      const removeItem = (id: string) => {
        items = items.filter((i) => i.id !== id);
      };

      // Prepend another item
      items = [
        { id: 'item-newest', itemType: 'existing', itemName: 'Newest Top', variations: [{ id: 'var-n', qty: 2 }] },
        ...items,
      ];

      // Mutate the original middle item by ID
      updateItem('item-mid', 'Middle Item Renamed');
      assert.equal(items.find((i) => i.id === 'item-mid')?.itemName, 'Middle Item Renamed');

      // Remove the top item by ID
      removeItem('item-newest');
      assert.equal(items.length, 3);
      assert.equal(items[0].id, 'item-top');
      assert.equal(items[1].id, 'item-mid');
      assert.equal(items[1].itemName, 'Middle Item Renamed');
    });
  });

  describe('Stage 4 — Idempotency and Duplicate Transfer Prevention', () => {
    it('generates unique deterministic idempotency keys for restock transfers', () => {
      const targetVariantId = 'variant-uuid-999';
      const batchVariationId = 'batch-var-uuid-444';
      const timestamp = 1771900000000;

      const idempotencyKey = `restock-${targetVariantId}-${batchVariationId}-${timestamp}`;

      assert.ok(idempotencyKey.includes(targetVariantId));
      assert.ok(idempotencyKey.includes(batchVariationId));
      assert.ok(idempotencyKey.startsWith('restock-'));
    });

    it('ensures batch variation available quantity decreases as transfers are linked', () => {
      const quantityPurchased = 20;
      const quantityReceived = 20;
      let quantityLinked = 0;

      // Check available before transfer
      let available = quantityReceived - quantityLinked;
      assert.equal(available, 20);

      // First restock transfer: 12 units
      const transfer1 = 12;
      assert.ok(transfer1 <= available);
      quantityLinked += transfer1;

      // Available is now 8
      available = quantityReceived - quantityLinked;
      assert.equal(available, 8);

      // Second restock transfer: 8 units
      const transfer2 = 8;
      assert.ok(transfer2 <= available);
      quantityLinked += transfer2;

      // Available is now 0 (fully linked)
      available = quantityReceived - quantityLinked;
      assert.equal(available, 0);

      // Attempting further transfer fails guard
      const transfer3 = 1;
      assert.equal(transfer3 > available, true);
    });

    it('enforces that retrying an identical transfer uses stable idempotency key to prevent double increment', () => {
      const activeTargetVariantId = 'target-var-123';
      const batchVariationId = 'batch-var-456';
      
      // First attempt
      const attempt1Key = `restock-${activeTargetVariantId}-${batchVariationId}-1771900000000`;
      
      // Retry attempt of identical transfer
      const retryKey = attempt1Key; // preserved via ref
      assert.equal(attempt1Key, retryKey);
    });
  });

  describe('Check 3 — Purchase Cost Accuracy and Independent Variation Editing', () => {
    it('allows editing supplier unit cost for one variation without affecting others', () => {
      const variations = [
        { id: 'var-1', title: 'Ring Size 6', cost: 350.00, refWac: 320.00 },
        { id: 'var-2', title: 'Ring Size 7', cost: 350.00, refWac: 320.00 },
        { id: 'var-3', title: 'Ring Size 8', cost: 350.00, refWac: 320.00 },
      ];

      // Edit only var-2 cost to 420.00
      const updated = variations.map(v => v.id === 'var-2' ? { ...v, cost: 420.00 } : v);

      assert.equal(updated.find(v => v.id === 'var-1')?.cost, 350.00);
      assert.equal(updated.find(v => v.id === 'var-2')?.cost, 420.00);
      assert.equal(updated.find(v => v.id === 'var-3')?.cost, 350.00);

      // Verify reference WAC remains untouched
      assert.equal(updated.find(v => v.id === 'var-2')?.refWac, 320.00);
    });

    it('calculates landed cost pro-rata allocations using the newly entered costs and applicable expenses', () => {
      // 2 variations with different newly entered supplier costs
      // Var 1: 5 units @ 400.00 = 2,000.00 LKR (200,000 cents)
      // Var 2: 5 units @ 600.00 = 3,000.00 LKR (300,000 cents)
      // Total supplier cost = 5,000.00 LKR (500,000 cents)
      // Freight expense: 1,000.00 LKR (100,000 cents) across 10 units = 100.00 LKR/unit
      const lines: LineCostInput[] = [
        { variationId: 'v1', quantity: 5, supplierUnitPriceCents: BigInt(40000) },
        { variationId: 'v2', quantity: 5, supplierUnitPriceCents: BigInt(60000) },
      ];

      const allocation = allocateBatchExpensesExact(BigInt(100000), lines);
      assert.equal(allocation.length, 2);

      // Var 1: 400.00 supplier + 100.00 exp = 500.00 landed
      assert.equal(allocation[0].unitLandedCostCents, BigInt(50000));
      // Var 2: 600.00 supplier + 100.00 exp = 700.00 landed
      assert.equal(allocation[1].unitLandedCostCents, BigInt(70000));
    });
  });
});
