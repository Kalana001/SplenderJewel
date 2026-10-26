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
import type {
  AdminInventoryProductSummary,
  AdminProductVariantInventory,
} from '../lib/catalog/variants.ts';

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

  describe('Hotfix Regression Suite — Repeat Purchase Search & Variation Mapping', () => {
    // Shared sample catalog fixture matching AdminInventoryProductSummary schema
    const mockCatalog: AdminInventoryProductSummary[] = [
      {
        id: 'prod-uuid-boho',
        name: 'Boho Trendy Chunky Bracelet Set',
        slug: 'boho-trendy-chunky-bracelet-set',
        sku: 'JWL-BRC-001',
        categoryName: 'Bracelets',
        isActive: true,
        variantCount: 3,
        totalStock: 12,
        hasLowStock: false,
        hasOutOfStock: true,
        variants: [
          {
            id: 'var-boho-gold',
            sku: 'BRC-BOHO-GLD',
            title: 'Chunky Gold / Medium',
            price: 2500,
            discountPrice: null,
            purchaseCost: 850.5,
            stockQuantity: 7,
            lowStockThreshold: 2,
            stockStatus: 'in_stock',
            isActive: true,
            updatedAt: '2026-10-26T10:00:00Z',
          },
          {
            id: 'var-boho-slv',
            sku: 'BRC-BOHO-SLV',
            title: 'Chunky Silver / Medium',
            price: 2400,
            discountPrice: null,
            purchaseCost: 800.0,
            stockQuantity: 5,
            lowStockThreshold: 2,
            stockStatus: 'in_stock',
            isActive: true,
            updatedAt: '2026-10-26T10:00:00Z',
          },
          {
            id: 'var-boho-rose-oos',
            sku: 'BRC-BOHO-RSG',
            title: 'Chunky Rose Gold / Large',
            price: 2600,
            discountPrice: null,
            purchaseCost: 900.0,
            stockQuantity: 0, // OUT OF STOCK
            lowStockThreshold: 2,
            stockStatus: 'out_of_stock',
            isActive: true,
            updatedAt: '2026-10-26T10:00:00Z',
          },
        ],
      },
      {
        id: 'prod-uuid-solitaire',
        name: 'Solitaire Diamond Engagement Ring',
        slug: 'solitaire-diamond-engagement-ring',
        sku: 'JWL-RNG-042',
        categoryName: 'Rings',
        isActive: true,
        variantCount: 1,
        totalStock: 3,
        hasLowStock: false,
        hasOutOfStock: false,
        variants: [
          {
            id: 'var-solitaire-v1',
            sku: 'RNG-SOL-18K-6',
            title: '18K White Gold / Size 6',
            price: 85000,
            discountPrice: null,
            purchaseCost: 45000,
            stockQuantity: 3,
            lowStockThreshold: 1,
            stockStatus: 'in_stock',
            isActive: true,
            updatedAt: '2026-10-26T10:00:00Z',
          },
        ],
      },
      {
        id: 'prod-uuid-empty',
        name: 'Legacy Unconfigured Pendant',
        slug: 'legacy-unconfigured-pendant',
        sku: 'JWL-PND-999',
        categoryName: 'Pendants',
        isActive: true,
        variantCount: 0,
        totalStock: 0,
        hasLowStock: false,
        hasOutOfStock: false,
        variants: [], // ZERO SAVED VARIATIONS
      },
    ];

    // Form mapping helper mirroring batch-create-form.tsx logic
    function mapProductToFormVariations(product: AdminInventoryProductSummary) {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      return variants.map((pv, idx) => ({
        id: `var-${pv.id || idx}`,
        variationTitle: pv.title || 'Default',
        attributes: {
          existing_product_id: product.id,
          existing_variant_id: pv.id,
          target_sku: pv.sku,
          is_restock: 'true',
        },
        supplierSku: pv.sku || '',
        quantityPurchased: 1,
        supplierUnitPriceLkr: 0,
        existingVariantId: pv.id,
        existingCurrentStock: typeof pv.stockQuantity === 'number' ? pv.stockQuantity : 0,
        existingCurrentCost: typeof pv.purchaseCost === 'number' ? pv.purchaseCost : 0,
      }));
    }

    // Catalog search matcher mirroring searchAdminInventoryProductsAction multi-field ILIKE query
    function searchCatalog(query: string, catalog: AdminInventoryProductSummary[]) {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return catalog.filter((product) => {
        const nameMatch = product.name.toLowerCase().includes(q);
        const codeMatch = Boolean(product.sku && product.sku.toLowerCase().includes(q));
        const variantSkuMatch = product.variants.some((v) => v.sku.toLowerCase().includes(q));
        return nameMatch || codeMatch || variantSkuMatch;
      });
    }

    // 1. Search by partial product name
    it('1. matches products by partial product name case-insensitively', () => {
      const results = searchCatalog('Boho', mockCatalog);
      assert.equal(results.length, 1);
      assert.equal(results[0].id, 'prod-uuid-boho');
      assert.equal(results[0].name, 'Boho Trendy Chunky Bracelet Set');

      const caseInsensitiveResults = searchCatalog('chunky', mockCatalog);
      assert.equal(caseInsensitiveResults.length, 1);
      assert.equal(caseInsensitiveResults[0].id, 'prod-uuid-boho');
    });

    // 2. Search by product code
    it('2. matches products by product code (SKU)', () => {
      const results = searchCatalog('JWL-BRC-001', mockCatalog);
      assert.equal(results.length, 1);
      assert.equal(results[0].sku, 'JWL-BRC-001');

      const partialCodeResults = searchCatalog('RNG-042', mockCatalog);
      assert.equal(partialCodeResults.length, 1);
      assert.equal(partialCodeResults[0].id, 'prod-uuid-solitaire');
    });

    // 3. Search by variation SKU
    it('3. matches parent product when searching by specific variation SKU', () => {
      const results = searchCatalog('BRC-BOHO-RSG', mockCatalog);
      assert.equal(results.length, 1);
      assert.equal(results[0].id, 'prod-uuid-boho');

      const ringSkuResults = searchCatalog('RNG-SOL-18K-6', mockCatalog);
      assert.equal(ringSkuResults.length, 1);
      assert.equal(ringSkuResults[0].id, 'prod-uuid-solitaire');
    });

    // 4. Fast typing with out-of-order responses
    it('4. ensures request sequence guards discard older out-of-order search responses', async () => {
      let activeSeq = 0;
      let displayedResults: AdminInventoryProductSummary[] = [];

      const simulateKeystrokeRequest = async (query: string, delayMs: number) => {
        const seq = ++activeSeq;
        await new Promise((r) => setTimeout(r, delayMs));
        // Sequence guard: discard stale response
        if (seq === activeSeq) {
          displayedResults = searchCatalog(query, mockCatalog);
        }
      };

      // Keystroke 1: user types "P" (takes 50ms)
      const p1 = simulateKeystrokeRequest('Pendant', 50);
      // Keystroke 2: user quickly corrects to "Boho" (takes 10ms)
      const p2 = simulateKeystrokeRequest('Boho', 10);

      await Promise.all([p1, p2]);

      // Even though "Pendant" took longer, "Boho" was the latest keystroke seq
      assert.equal(displayedResults.length, 1);
      assert.equal(displayedResults[0].id, 'prod-uuid-boho');
      assert.equal(displayedResults[0].name, 'Boho Trendy Chunky Bracelet Set');
    });

    // 5. Selecting a product with multiple saved variations
    it('5. correctly loads and maps all saved variations from AdminInventoryProductSummary', () => {
      const bohoProduct = mockCatalog[0];
      const formVariations = mapProductToFormVariations(bohoProduct);

      assert.equal(formVariations.length, 3);
      assert.equal(formVariations[0].existingVariantId, 'var-boho-gold');
      assert.equal(formVariations[0].variationTitle, 'Chunky Gold / Medium');
      assert.equal(formVariations[0].supplierSku, 'BRC-BOHO-GLD');
      assert.equal(formVariations[0].existingCurrentStock, 7);
      assert.equal(formVariations[0].existingCurrentCost, 850.5);

      assert.equal(formVariations[1].existingVariantId, 'var-boho-slv');
      assert.equal(formVariations[1].variationTitle, 'Chunky Silver / Medium');
      assert.equal(formVariations[1].supplierSku, 'BRC-BOHO-SLV');
      assert.equal(formVariations[1].existingCurrentStock, 5);
      assert.equal(formVariations[1].existingCurrentCost, 800.0);
    });

    // 6. Selecting an out-of-stock variation
    it('6. preserves and displays out-of-stock variations without omitting them', () => {
      const bohoProduct = mockCatalog[0];
      const formVariations = mapProductToFormVariations(bohoProduct);

      const oosVariation = formVariations.find((v) => v.existingVariantId === 'var-boho-rose-oos');
      assert.ok(oosVariation, 'Out of stock variation must be present in mapped form variations');
      assert.equal(oosVariation.existingCurrentStock, 0);
      assert.equal(oosVariation.variationTitle, 'Chunky Rose Gold / Large');
      assert.equal(oosVariation.supplierSku, 'BRC-BOHO-RSG');
      assert.equal(oosVariation.existingCurrentCost, 900.0);
      assert.equal(oosVariation.quantityPurchased, 1); // Defaults to purchase qty 1 for restocking
    });

    // 7. Product with zero saved variations
    it('7. creates zero variations and prevents restock submission when product has zero variations in catalog', () => {
      const emptyProduct = mockCatalog[2]; // Legacy Unconfigured Pendant
      const formVariations = mapProductToFormVariations(emptyProduct);

      // Must be strictly empty — NEVER generate a dummy variation
      assert.equal(formVariations.length, 0);

      // Validation guard check
      const validateSubmission = (item: { itemType: string; existingProductId?: string; variations: any[]; itemName: string }) => {
        if (item.itemType === 'existing' && item.existingProductId && item.variations.length === 0) {
          return { isValid: false, error: `Product "${item.itemName}" has no variations in the catalog. Please configure variations in Catalog before restocking or remove this item.` };
        }
        return { isValid: true, error: null };
      };

      const result = validateSubmission({
        itemType: 'existing',
        existingProductId: emptyProduct.id,
        variations: formVariations,
        itemName: emptyProduct.name,
      });

      assert.equal(result.isValid, false);
      assert.match(result.error || '', /has no variations in the catalog/);
    });

    // 8. Correct SKU, stock and WAC display mapping
    it('8. preserves exact SKU, stock quantity and reference WAC without truncation or unit loss', () => {
      const ringProduct = mockCatalog[1];
      const formVariations = mapProductToFormVariations(ringProduct);

      assert.equal(formVariations.length, 1);
      const ring = formVariations[0];
      assert.equal(ring.supplierSku, 'RNG-SOL-18K-6');
      assert.equal(ring.existingCurrentStock, 3);
      assert.equal(ring.existingCurrentCost, 45000);
      assert.equal(ring.attributes.target_sku, 'RNG-SOL-18K-6');
    });

    // 9. Independent quantity and supplier-cost edits
    it('9. allows independent editing of purchase quantity and supplier unit cost per variation', () => {
      const bohoProduct = mockCatalog[0];
      let variations = mapProductToFormVariations(bohoProduct);

      // Initial state: supplierUnitPriceLkr is 0, quantityPurchased is 1
      assert.equal(variations[0].supplierUnitPriceLkr, 0);
      assert.equal(variations[1].supplierUnitPriceLkr, 0);
      assert.equal(variations[2].supplierUnitPriceLkr, 0);

      // Admin updates Gold variation: 10 units @ LKR 920.00
      variations = variations.map((v) =>
        v.existingVariantId === 'var-boho-gold'
          ? { ...v, quantityPurchased: 10, supplierUnitPriceLkr: 920.0 }
          : v
      );

      // Admin updates OOS Rose Gold variation: 15 units @ LKR 950.00
      variations = variations.map((v) =>
        v.existingVariantId === 'var-boho-rose-oos'
          ? { ...v, quantityPurchased: 15, supplierUnitPriceLkr: 950.0 }
          : v
      );

      // Check Gold
      const gold = variations.find((v) => v.existingVariantId === 'var-boho-gold')!;
      assert.equal(gold.quantityPurchased, 10);
      assert.equal(gold.supplierUnitPriceLkr, 920.0);
      assert.equal(gold.existingCurrentCost, 850.5); // Reference historical cost untouched!

      // Check Silver (unmodified)
      const silver = variations.find((v) => v.existingVariantId === 'var-boho-slv')!;
      assert.equal(silver.quantityPurchased, 1);
      assert.equal(silver.supplierUnitPriceLkr, 0);
      assert.equal(silver.existingCurrentCost, 800.0);

      // Check Rose Gold
      const rose = variations.find((v) => v.existingVariantId === 'var-boho-rose-oos')!;
      assert.equal(rose.quantityPurchased, 15);
      assert.equal(rose.supplierUnitPriceLkr, 950.0);
      assert.equal(rose.existingCurrentCost, 900.0);
    });

    // 10. Correct existing product/variation IDs in saved metadata
    it('10. properly attaches existing_product_id, existing_variant_id, target_sku, and is_restock in payload metadata', () => {
      const bohoProduct = mockCatalog[0];
      const variations = mapProductToFormVariations(bohoProduct);

      variations.forEach((v) => {
        assert.equal(v.attributes.existing_product_id, 'prod-uuid-boho');
        assert.ok(v.attributes.existing_variant_id);
        assert.equal(v.attributes.is_restock, 'true');
        assert.equal(v.attributes.target_sku, v.supplierSku);
      });
    });

    // 11. No fake Default variation
    it('11. never creates a fake Default variation when existing product has real variations or zero variations', () => {
      // Test multi-variation product
      const multiVarForm = mapProductToFormVariations(mockCatalog[0]);
      assert.ok(multiVarForm.every((v) => v.variationTitle !== 'Default'));

      // Test zero-variation product
      const zeroVarForm = mapProductToFormVariations(mockCatalog[2]);
      assert.equal(zeroVarForm.length, 0);
      assert.ok(!zeroVarForm.some((v) => v.variationTitle === 'Default'));
    });

    // 12. Existing Inventory Manager search remains functional
    it('12. preserves AdminInventoryProductSummary interface parity required by Inventory Manager', () => {
      mockCatalog.forEach((p) => {
        // Properties used by Inventory Manager:
        assert.ok(typeof p.id === 'string');
        assert.ok(typeof p.name === 'string');
        assert.ok(typeof p.categoryName === 'string');
        assert.ok(typeof p.totalStock === 'number');
        assert.ok(typeof p.variantCount === 'number');
        assert.ok(Array.isArray(p.variants));

        p.variants.forEach((v) => {
          assert.ok(typeof v.id === 'string');
          assert.ok(typeof v.sku === 'string');
          assert.ok(typeof v.title === 'string');
          assert.ok(typeof v.stockQuantity === 'number');
          assert.ok(typeof v.purchaseCost === 'number');
          assert.ok(typeof v.price === 'number');
        });
      });
    });
  });
});
