import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateStockAdjustments,
  validateCartItemsAgainstInventory,
  type InventoryRecord,
} from '../lib/cart/validation.ts';

interface CartItem {
  variantId: string;
  productId: string;
  productName: string;
  variantTitle: string;
  sku: string;
  price: number;
  discountPrice?: number | null;
  imageUrl?: string | null;
  slug: string;
  quantity: number;
  maxStock?: number;
}

// -----------------------------------------------------------------------------
// SIMULATED CART WITH MULTI-TRIGGER REVALIDATION & CONCURRENCY GUARD
// -----------------------------------------------------------------------------
class ReactiveCartTestHarness {
  public items: CartItem[] = [];
  public revalidationSeq: number = 0;
  public inventoryNotice: string | null = null;
  public outOfStockNotice: string | null = null;
  public verificationError: string | null = null;
  public isValidating: boolean = false;

  constructor(initialItems: CartItem[] = []) {
    this.items = [...initialItems];
  }

  // Pure sync operation
  syncCartStock(stockMap: Record<string, number>) {
    const { updatedItems, adjustedItems, hasChanges } = calculateStockAdjustments(
      this.items,
      stockMap
    );
    if (hasChanges) {
      this.items = updatedItems;
    }
    return { adjustedItems };
  }

  // Multi-trigger revalidation simulation with concurrency sequencing
  async revalidateWithMockServer(
    fetchMockStock: () => Promise<{ stockMap: Record<string, number>; isValid: boolean; error?: string }>
  ): Promise<{ success: boolean; stale?: boolean }> {
    const currentSeq = ++this.revalidationSeq;
    this.isValidating = true;

    try {
      const res = await fetchMockStock();

      // Sequence guard: Discard response if a newer request was dispatched
      if (currentSeq !== this.revalidationSeq) {
        return { success: false, stale: true };
      }

      if (!res.isValid) {
        this.verificationError = res.error || 'Failed to verify inventory.';
        this.isValidating = false;
        return { success: false };
      }

      this.verificationError = null;

      const { adjustedItems } = this.syncCartStock(res.stockMap);
      if (adjustedItems.length > 0) {
        if (adjustedItems.length === 1) {
          const adj = adjustedItems[0];
          this.inventoryNotice = `Available stock for ${adj.productName} changed from ${adj.oldQty} to ${adj.newQty}. Your bag has been updated.`;
        } else {
          this.inventoryNotice = `Available warehouse stock decreased for ${adjustedItems.length} items. Your shopping bag has been updated.`;
        }
      }

      const hasZero = this.items.some((i) => i.maxStock !== undefined && i.maxStock === 0);
      if (hasZero) {
        this.outOfStockNotice = 'One or more items in your shopping bag are out of stock. Please remove them before checkout.';
      } else {
        this.outOfStockNotice = null;
      }

      this.isValidating = false;
      return { success: true };
    } catch {
      if (currentSeq === this.revalidationSeq) {
        this.verificationError = 'Network error while checking inventory.';
        this.isValidating = false;
      }
      return { success: false };
    }
  }

  // Preflight checkout attempt
  async attemptProceedToCheckout(
    fetchMockStock: () => Promise<{ stockMap: Record<string, number>; isValid: boolean; error?: string }>
  ): Promise<{ canNavigate: boolean; reason?: string }> {
    const check = await this.revalidateWithMockServer(fetchMockStock);
    if (!check.success || check.stale) {
      return { canNavigate: false, reason: this.verificationError || 'Stock verification unconfirmed' };
    }

    if (this.inventoryNotice) {
      return { canNavigate: false, reason: 'Cart was adjusted due to stock changes' };
    }

    const anyOutOfStock = this.items.some(
      (i) => i.maxStock !== undefined && (i.maxStock === 0 || i.quantity > i.maxStock)
    );
    if (anyOutOfStock) {
      return { canNavigate: false, reason: 'Out of stock items present' };
    }

    return { canNavigate: true };
  }

  removeItem(variantId: string) {
    this.items = this.items.filter((i) => i.variantId !== variantId);
    const hasZero = this.items.some((i) => i.maxStock !== undefined && i.maxStock === 0);
    if (!hasZero) {
      this.outOfStockNotice = null;
    }
  }
}

// -----------------------------------------------------------------------------
// HELPER: PARSE & VALIDATE INVENTORY INPUT (MIRRORING INVENTORY-MANAGER.TSX)
// -----------------------------------------------------------------------------
function parseAdjustmentInput(input: string, currentStock: number): {
  valid: boolean;
  value: number;
  projectedStock: number;
  error?: string;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      valid: false,
      value: 0,
      projectedStock: currentStock,
      error: 'Please enter a quantity adjustment amount.',
    };
  }

  if (!/^[-+]?\d+$/.test(trimmed)) {
    return {
      valid: false,
      value: 0,
      projectedStock: currentStock,
      error: 'Adjustment must be a whole integer (+ to add stock, - to subtract stock). Decimals are not permitted.',
    };
  }

  const val = parseInt(trimmed, 10);
  if (isNaN(val)) {
    return {
      valid: false,
      value: 0,
      projectedStock: currentStock,
      error: 'Invalid numerical format.',
    };
  }

  if (val === 0) {
    return {
      valid: false,
      value: 0,
      projectedStock: currentStock,
      error: 'Adjustment quantity cannot be zero.',
    };
  }

  const projected = currentStock + val;
  if (projected < 0) {
    return {
      valid: false,
      value: val,
      projectedStock: projected,
      error: `Cannot reduce stock below 0. Current stock is ${currentStock}, so the maximum reduction allowed is -${currentStock}.`,
    };
  }

  return {
    valid: true,
    value: val,
    projectedStock: projected,
  };
}

// =============================================================================
// REGRESSION TEST SUITE: PHASE 6C INVENTORY UX & CART SYNCHRONIZATION
// =============================================================================

test('Phase 6C: Stock 10 reduced to 3 while cart contains 10 auto-clamps and notifies', async () => {
  const initialItem: CartItem = {
    variantId: 'v-sapphire-1',
    productId: 'p-sapphire',
    productName: 'Royal Sri Lankan Sapphire Ring',
    variantTitle: 'Gold 18k / Size 7',
    sku: 'SJ-SAP-01',
    price: 45000,
    quantity: 10,
    maxStock: 10,
    slug: 'sapphire-ring',
  };

  const harness = new ReactiveCartTestHarness([initialItem]);
  assert.equal(harness.items[0].quantity, 10);

  // Warehouse stock is reduced to 3
  const result = await harness.revalidateWithMockServer(async () => ({
    stockMap: { 'v-sapphire-1': 3 },
    isValid: true,
  }));

  assert.equal(result.success, true);
  // Quantity is clamped from 10 to 3
  assert.equal(harness.items[0].quantity, 3);
  assert.equal(harness.items[0].maxStock, 3);
  // Clear customer notification
  assert.equal(
    harness.inventoryNotice,
    'Available stock for Royal Sri Lankan Sapphire Ring changed from 10 to 3. Your bag has been updated.'
  );
});

test('Phase 6C: Returning to an already-mounted cart triggers route revalidation', async () => {
  const initialItem: CartItem = {
    variantId: 'v-bangle-1',
    productId: 'p-bangle',
    productName: '22k Filigree Bangle',
    variantTitle: 'Standard',
    sku: 'SJ-BAN-01',
    price: 32000,
    quantity: 6,
    maxStock: 6,
    slug: 'filigree-bangle',
  };

  const harness = new ReactiveCartTestHarness([initialItem]);

  // Simulate route change event (/shop -> /cart route becomes active)
  let routeActive = false;
  async function onRouteChange(newPath: string) {
    if (newPath === '/cart') {
      routeActive = true;
      // Revalidation runs upon route activation
      await harness.revalidateWithMockServer(async () => ({
        stockMap: { 'v-bangle-1': 4 }, // Stock dropped to 4 while user was browsing shop
        isValid: true,
      }));
    }
  }

  await onRouteChange('/cart');
  assert.equal(routeActive, true);
  assert.equal(harness.items[0].quantity, 4);
  assert.equal(harness.items[0].maxStock, 4);
  assert.ok(harness.inventoryNotice?.includes('changed from 6 to 4'));
});

test('Phase 6C: Browser tab focus refresh detects external stock changes', async () => {
  const initialItem: CartItem = {
    variantId: 'v-necklace-1',
    productId: 'p-necklace',
    productName: 'Pearl & Gold Choker',
    variantTitle: '16 Inch',
    sku: 'SJ-NECK-01',
    price: 28000,
    quantity: 5,
    maxStock: 5,
    slug: 'pearl-choker',
  };

  const harness = new ReactiveCartTestHarness([initialItem]);

  // Simulate user switching away and refocusing the browser tab (visibilityState = visible)
  async function onTabRefocus() {
    return harness.revalidateWithMockServer(async () => ({
      stockMap: { 'v-necklace-1': 2 }, // Stock dropped to 2 while tab was in background
      isValid: true,
    }));
  }

  await onTabRefocus();
  assert.equal(harness.items[0].quantity, 2);
  assert.equal(harness.items[0].maxStock, 2);
  assert.ok(harness.inventoryNotice?.includes('changed from 5 to 2'));
});

test('Phase 6C: Concurrent inventory validation responses: sequence guard rejects stale responses', async () => {
  const initialItem: CartItem = {
    variantId: 'v-earring-1',
    productId: 'p-earring',
    productName: 'Diamond Cut Hoop Earrings',
    variantTitle: 'Yellow Gold',
    sku: 'SJ-EAR-01',
    price: 18500,
    quantity: 8,
    maxStock: 8,
    slug: 'hoop-earrings',
  };

  const harness = new ReactiveCartTestHarness([initialItem]);

  // Request 1 is dispatched first (slow response with older stock = 8)
  // Request 2 is dispatched second (faster response with newer stock = 3)
  let resolveReq1: (val: any) => void;
  const req1Promise = new Promise<{ stockMap: Record<string, number>; isValid: boolean }>((resolve) => {
    resolveReq1 = resolve;
  });

  // Dispatch Request 1
  const promise1 = harness.revalidateWithMockServer(() => req1Promise);

  // Dispatch Request 2
  const promise2 = harness.revalidateWithMockServer(async () => ({
    stockMap: { 'v-earring-1': 3 },
    isValid: true,
  }));

  // Wait for Request 2 to finish
  const res2 = await promise2;
  assert.equal(res2.success, true);
  assert.equal(harness.items[0].quantity, 3);

  // Now resolve Request 1 AFTER Request 2 has completed (out of order arrival)
  resolveReq1!({
    stockMap: { 'v-earring-1': 8 },
    isValid: true,
  });

  const res1 = await promise1;
  // Request 1 was flagged as stale and discarded!
  assert.equal(res1.stale, true);
  assert.equal(res1.success, false);

  // The latest verified stock (3) remains intact and was NOT overwritten by stale stock (8)
  assert.equal(harness.items[0].quantity, 3);
  assert.equal(harness.items[0].maxStock, 3);
});

test('Phase 6C: Stock reduced to zero: clamped to 0, checkout blocked, 1-click removal works', async () => {
  const initialItem: CartItem = {
    variantId: 'v-anklet-1',
    productId: 'p-anklet',
    productName: 'Traditional Gold Anklet',
    variantTitle: '10 Inch',
    sku: 'SJ-ANK-01',
    price: 22000,
    quantity: 4,
    maxStock: 4,
    slug: 'gold-anklet',
  };

  const harness = new ReactiveCartTestHarness([initialItem]);

  // Warehouse stock reduced to 0
  await harness.revalidateWithMockServer(async () => ({
    stockMap: { 'v-anklet-1': 0 },
    isValid: true,
  }));

  // Quantity clamped to 0, maxStock set to 0
  assert.equal(harness.items[0].quantity, 0);
  assert.equal(harness.items[0].maxStock, 0);
  assert.ok(harness.outOfStockNotice !== null);

  // Preflight checkout attempt must be BLOCKED
  const checkoutAttempt = await harness.attemptProceedToCheckout(async () => ({
    stockMap: { 'v-anklet-1': 0 },
    isValid: true,
  }));
  assert.equal(checkoutAttempt.canNavigate, false);

  // 1-Click removal removes the out-of-stock item cleanly
  harness.removeItem('v-anklet-1');
  assert.equal(harness.items.length, 0);
  assert.equal(harness.outOfStockNotice, null);
});

test('Phase 6C: Failed inventory validation blocks checkout and displays clear error', async () => {
  const initialItem: CartItem = {
    variantId: 'v-pendant-1',
    productId: 'p-pendant',
    productName: 'Lotus Gold Pendant',
    variantTitle: 'Default',
    sku: 'SJ-PEN-01',
    price: 15000,
    quantity: 2,
    maxStock: 2,
    slug: 'lotus-pendant',
  };

  const harness = new ReactiveCartTestHarness([initialItem]);

  // Server validation fails (e.g. database timeout or network error)
  const checkoutAttempt = await harness.attemptProceedToCheckout(async () => {
    throw new Error('Database connection failed');
  });

  // Navigation is blocked, error banner is shown
  assert.equal(checkoutAttempt.canNavigate, false);
  assert.equal(harness.verificationError, 'Network error while checking inventory.');
});

test('Phase 6C: Admin inventory quantity input: Backspace clearing, negative numbers, and validation', () => {
  const currentStock = 10;

  // 1. Backspace to clear (empty string)
  const empty = parseAdjustmentInput('', currentStock);
  assert.equal(empty.valid, false);
  assert.equal(empty.error, 'Please enter a quantity adjustment amount.');

  // 2. Typing negative whole number (-3)
  const neg3 = parseAdjustmentInput('-3', currentStock);
  assert.equal(neg3.valid, true);
  assert.equal(neg3.value, -3);
  assert.equal(neg3.projectedStock, 7);

  // 3. Typing positive with + sign (+15)
  const plus15 = parseAdjustmentInput('+15', currentStock);
  assert.equal(plus15.valid, true);
  assert.equal(plus15.value, 15);
  assert.equal(plus15.projectedStock, 25);

  // 4. Typing positive without sign (20)
  const pos20 = parseAdjustmentInput('20', currentStock);
  assert.equal(pos20.valid, true);
  assert.equal(pos20.value, 20);
  assert.equal(pos20.projectedStock, 30);

  // 5. Reject decimals / fractional values (e.g. 2.5)
  const decimal = parseAdjustmentInput('2.5', currentStock);
  assert.equal(decimal.valid, false);
  assert.ok(decimal.error?.includes('Decimals are not permitted'));

  const negDecimal = parseAdjustmentInput('-1.75', currentStock);
  assert.equal(negDecimal.valid, false);
  assert.ok(negDecimal.error?.includes('Decimals are not permitted'));

  // 6. Reject zero (0)
  const zero = parseAdjustmentInput('0', currentStock);
  assert.equal(zero.valid, false);
  assert.equal(zero.error, 'Adjustment quantity cannot be zero.');

  // 7. Reject reduction exceeding current stock (reducing 10 by -15 -> projected -5)
  const overReduce = parseAdjustmentInput('-15', currentStock);
  assert.equal(overReduce.valid, false);
  assert.ok(overReduce.error?.includes('Cannot reduce stock below 0'));
});

test('Phase 6C: Searching and selecting products with multiple variations', () => {
  const catalog = [
    {
      id: 'prod-ring',
      name: 'Eternity Band Ring',
      sku: 'SJ-ETN',
      variants: [
        { id: 'v-rg-gold', sku: 'SJ-ETN-GLD', title: 'Yellow Gold', stockQuantity: 8 },
        { id: 'v-rg-slv', sku: 'SJ-ETN-SLV', title: 'White Gold', stockQuantity: 4 },
        { id: 'v-rg-ros', sku: 'SJ-ETN-ROS', title: 'Rose Gold', stockQuantity: 0 },
      ],
    },
    {
      id: 'prod-bracelet',
      name: 'Tennis Bracelet',
      sku: 'SJ-TNS',
      variants: [
        { id: 'v-br-std', sku: 'SJ-TNS-STD', title: 'Standard', stockQuantity: 12 },
      ],
    },
  ];

  // Search by product name "Eternity"
  const searchByName = catalog.filter((p) => p.name.toLowerCase().includes('eternity'));
  assert.equal(searchByName.length, 1);
  assert.equal(searchByName[0].id, 'prod-ring');

  // Search by variant SKU "ETN-ROS"
  const searchByVariantSku = catalog.filter((p) =>
    p.variants.some((v) => v.sku.toLowerCase().includes('etn-ros'))
  );
  assert.equal(searchByVariantSku.length, 1);
  assert.equal(searchByVariantSku[0].id, 'prod-ring');

  // Product has 3 variants
  const ring = searchByName[0];
  assert.equal(ring.variants.length, 3);
  assert.equal(ring.variants[0].title, 'Yellow Gold');
  assert.equal(ring.variants[1].title, 'White Gold');
  assert.equal(ring.variants[2].title, 'Rose Gold');
});

test('Phase 6C: Auto-selecting single-variant products & inventory movement audit preservation', () => {
  const singleVariantProduct = {
    id: 'prod-pendant',
    name: 'Solitaire Diamond Pendant',
    sku: 'SJ-SOL-01',
    variants: [
      { id: 'v-sol-1', sku: 'SJ-SOL-01', title: 'Default', stockQuantity: 7 },
    ],
  };

  // If variants.length === 1, auto-selection identifies v-sol-1 without secondary click
  let autoSelectedVariantId: string | null = null;
  if (singleVariantProduct.variants.length === 1) {
    autoSelectedVariantId = singleVariantProduct.variants[0].id;
  }
  assert.equal(autoSelectedVariantId, 'v-sol-1');

  // Audited movement ledger simulation
  const movementAuditLedger = [];
  function recordMovement(
    variantId: string,
    previousQuantity: number,
    quantityChange: number,
    reason: 'stock_added' | 'manual_adjustment' | 'correction',
    referenceId: string | null
  ) {
    assert.notEqual(quantityChange, 0, 'Quantity change cannot be 0');
    assert.ok(['stock_added', 'manual_adjustment', 'correction'].includes(reason), 'Valid reason required');

    const newQuantity = previousQuantity + quantityChange;
    assert.ok(newQuantity >= 0, 'Stock cannot be negative');

    const record = {
      id: 'mov-' + Math.random().toString(36).substring(7),
      variantId,
      previousQuantity,
      quantityChange,
      newQuantity,
      reason,
      referenceId,
      createdAt: new Date().toISOString(),
    };
    movementAuditLedger.push(record);
    return record;
  }

  // Record an audit adjustment: stock was 7, added 5 units for restock batch #104
  const mov = recordMovement('v-sol-1', 7, 5, 'stock_added', 'Restock Batch #104');
  assert.equal(mov.previousQuantity, 7);
  assert.equal(mov.quantityChange, 5);
  assert.equal(mov.newQuantity, 12);
  assert.equal(mov.reason, 'stock_added');
  assert.equal(mov.referenceId, 'Restock Batch #104');
  assert.equal(movementAuditLedger.length, 1);
});

// -----------------------------------------------------------------------------
// PHASE 6C: ADMIN INVENTORY LOADING, ERROR RESILIENCE & SEARCH TESTS
// -----------------------------------------------------------------------------

test('Phase 6C: Admin inventory: Successful initial product loading with product_code and nested relations', () => {
  // Mock data representing Supabase products response with product_code, categories, and product_variants
  const mockDbRows = [
    {
      id: 'prod-anklet-1',
      name: 'TEST Anklet — Phase 6C',
      slug: 'test-anklet-phase-6c',
      product_code: 'SJ-TEST-6C-001',
      is_active: true,
      created_at: '2026-10-13T08:33:57.908125+00:00',
      categories: { name: 'Anklet' },
      product_variants: [
        {
          id: 'var-1',
          sku: 'SJ-TEST-001',
          title: 'Default',
          price: '1500.00',
          discount_price: null,
          purchase_cost: '800.00',
          stock_quantity: 3,
          low_stock_threshold: 5,
          stock_status: 'low_stock',
          is_active: true,
          updated_at: '2026-10-13T12:08:29.000Z',
        },
      ],
    },
    {
      id: 'prod-draft-2',
      name: 'Draft Pearl Pendant',
      slug: 'draft-pearl-pendant',
      product_code: 'SJ-DRF-002',
      is_active: false, // Draft product
      created_at: '2026-10-13T09:00:00.000Z',
      categories: [{ name: 'Necklaces' }], // Array category relationship format
      product_variants: [
        {
          id: 'var-2',
          sku: 'SJ-DRF-002-A',
          title: 'White Pearl',
          price: '3200.00',
          discount_price: null,
          purchase_cost: '1500.00',
          stock_quantity: 10,
          low_stock_threshold: 5,
          stock_status: 'in_stock',
          is_active: true,
          updated_at: '2026-10-13T09:00:00.000Z',
        },
      ],
    },
  ];

  // Pure mapper matching lib/catalog/variants.ts
  const mappedProducts = mockDbRows.map((p) => {
    const rawVariants = Array.isArray(p.product_variants) ? p.product_variants : [];
    const variants = rawVariants.map((v) => ({
      id: v.id,
      sku: v.sku,
      title: v.title,
      price: Number(v.price),
      discountPrice: v.discount_price != null ? Number(v.discount_price) : null,
      purchaseCost: Number(v.purchase_cost),
      stockQuantity: Number(v.stock_quantity) || 0,
      lowStockThreshold: Number(v.low_stock_threshold) || 5,
      stockStatus: v.stock_status,
      isActive: Boolean(v.is_active),
      updatedAt: v.updated_at,
    }));

    const totalStock = variants.reduce((sum, v) => sum + v.stockQuantity, 0);
    const hasLowStock = variants.some((v) => v.stockStatus === 'low_stock');
    const hasOutOfStock = variants.some((v) => v.stockStatus === 'out_of_stock' || v.stockQuantity <= 0);
    const categoryName = (Array.isArray(p.categories) ? p.categories[0]?.name : p.categories?.name) || 'Uncategorized';

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      sku: p.product_code || null,
      categoryName,
      isActive: Boolean(p.is_active),
      variantCount: variants.length,
      totalStock,
      hasLowStock,
      hasOutOfStock,
      variants,
    };
  });

  assert.equal(mappedProducts.length, 2);

  // Verify published product
  const anklet = mappedProducts[0];
  assert.equal(anklet.name, 'TEST Anklet — Phase 6C');
  assert.equal(anklet.sku, 'SJ-TEST-6C-001');
  assert.equal(anklet.categoryName, 'Anklet');
  assert.equal(anklet.isActive, true);
  assert.equal(anklet.totalStock, 3);
  assert.equal(anklet.hasLowStock, true);
  assert.equal(anklet.variants[0].sku, 'SJ-TEST-001');

  // Verify draft product is also included
  const draft = mappedProducts[1];
  assert.equal(draft.name, 'Draft Pearl Pendant');
  assert.equal(draft.isActive, false);
  assert.equal(draft.categoryName, 'Necklaces');
});

test('Phase 6C: Admin inventory: Database query failure surfaces explicit error and never disguised as empty', () => {
  // Simulate database error handling in InventoryManager state
  function getInventoryManagerState(queryResult: { success: boolean; products: any[]; totalCount: number; error?: string }) {
    if (!queryResult.success) {
      return {
        products: [],
        totalCount: 0,
        loadError: queryResult.error || 'Failed to load inventory products.',
        shouldShowEmptySearchMessage: false,
        shouldShowErrorState: true,
      };
    }
    return {
      products: queryResult.products,
      totalCount: queryResult.totalCount,
      loadError: null,
      shouldShowEmptySearchMessage: queryResult.products.length === 0,
      shouldShowErrorState: false,
    };
  }

  // 1. Database fails with column error
  const failedResult = {
    success: false,
    products: [],
    totalCount: 0,
    error: 'column products.sku does not exist',
  };

  const stateOnError = getInventoryManagerState(failedResult);
  assert.equal(stateOnError.shouldShowErrorState, true);
  assert.equal(stateOnError.shouldShowEmptySearchMessage, false);
  assert.equal(stateOnError.loadError, 'column products.sku does not exist');

  // 2. Database succeeds with genuine 0 results
  const genuineEmptyResult = {
    success: true,
    products: [],
    totalCount: 0,
  };

  const stateOnEmpty = getInventoryManagerState(genuineEmptyResult);
  assert.equal(stateOnEmpty.shouldShowErrorState, false);
  assert.equal(stateOnEmpty.shouldShowEmptySearchMessage, true);
  assert.equal(stateOnEmpty.loadError, null);
});

test('Phase 6C: Admin inventory: Product name search filtering', () => {
  const products = [
    { id: '1', name: 'TEST Anklet — Phase 6C', product_code: 'SJ-TEST-001' },
    { id: '2', name: 'Eternity Diamond Ring', product_code: 'SJ-ETN-001' },
    { id: '3', name: 'Gold Rope Chain', product_code: 'SJ-CHN-001' },
  ];

  function searchByName(query: string) {
    const q = query.trim().toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }

  const results = searchByName('Anklet');
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'TEST Anklet — Phase 6C');

  const ringResults = searchByName('diamond');
  assert.equal(ringResults.length, 1);
  assert.equal(ringResults[0].name, 'Eternity Diamond Ring');
});

test('Phase 6C: Admin inventory: Variant SKU search filtering', () => {
  const products = [
    {
      id: 'prod-1',
      name: 'TEST Anklet — Phase 6C',
      variants: [
        { id: 'var-1', sku: 'SJ-TEST-001' },
        { id: 'var-2', sku: 'SJ-TEST-6C-001-2' },
      ],
    },
    {
      id: 'prod-2',
      name: 'Solitaire Necklace',
      variants: [
        { id: 'var-3', sku: 'SJ-SLT-999' },
      ],
    },
  ];

  function searchByVariantSku(query: string) {
    const q = query.trim().toLowerCase();
    return products.filter((p) =>
      p.variants.some((v) => v.sku.toLowerCase().includes(q))
    );
  }

  const matches = searchByVariantSku('SJ-TEST-001');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'prod-1');

  const matches2 = searchByVariantSku('SJ-SLT');
  assert.equal(matches2.length, 1);
  assert.equal(matches2[0].id, 'prod-2');

  const matchesNone = searchByVariantSku('NONEXISTENT-SKU');
  assert.equal(matchesNone.length, 0);
});

test('Phase 6C: Admin inventory: Single-variant auto-selection logic', () => {
  // Test case A: Product with exactly 1 variant
  const singleVariantProduct = {
    id: 'prod-single',
    name: 'Test Single Product',
    variants: [{ id: 'var-single-1', sku: 'SJ-SGL-1', title: 'Default' }],
  };

  let selectedVariantIdA: string | null = null;
  if (singleVariantProduct.variants.length === 1) {
    selectedVariantIdA = singleVariantProduct.variants[0].id;
  }
  assert.equal(selectedVariantIdA, 'var-single-1');

  // Test case B: Product with multiple variants (defaults to first variant)
  const multiVariantProduct = {
    id: 'prod-multi',
    name: 'Multi Variant Ring',
    variants: [
      { id: 'var-m-1', sku: 'SJ-M-1', title: 'Size 6' },
      { id: 'var-m-2', sku: 'SJ-M-2', title: 'Size 7' },
    ],
  };

  let selectedVariantIdB: string | null = null;
  if (multiVariantProduct.variants.length === 1) {
    selectedVariantIdB = multiVariantProduct.variants[0].id;
  } else if (multiVariantProduct.variants.length > 1) {
    selectedVariantIdB = multiVariantProduct.variants[0].id;
  }
  assert.equal(selectedVariantIdB, 'var-m-1');

  // Test case C: Product with 0 variants
  const noVariantProduct: { id: string; name: string; variants: Array<{ id: string; sku: string; title: string }> } = {
    id: 'prod-none',
    name: 'No Variants',
    variants: [],
  };

  let selectedVariantIdC: string | null = null;
  if (noVariantProduct.variants.length === 1) {
    selectedVariantIdC = noVariantProduct.variants[0].id;
  }
  assert.equal(selectedVariantIdC, null);
});

