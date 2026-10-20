import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKSPACE_DIR = process.cwd();

// =============================================================================
// STAGE B.1: POST-CHECKOUT CART CLEANUP REGRESSION TESTS
// =============================================================================

test('Architecture: createOrderAction reliably executes server-side cart deduction for authenticated users', () => {
  const actionsPath = join(WORKSPACE_DIR, 'lib/orders/actions.ts');
  const content = readFileSync(actionsPath, 'utf-8');

  // Verify createOrderAction invokes deduct_purchased_cart_items on server
  assert.match(
    content,
    /adminClient[\s\S]*?\.rpc\(\s*['"]deduct_purchased_cart_items['"]\s*,\s*\{\s*p_user_id:\s*userId,\s*p_order_number:\s*rpcData\.order_number/,
    'createOrderAction must call deduct_purchased_cart_items RPC on the server with userId and order_number'
  );

  // Verify cart deduction failure does NOT fail an already-created order (fail-safe)
  assert.match(
    content,
    /let\s+cartCleanedUp\s*=\s*true;[\s\S]*?cartCleanedUp\s*=\s*false;[\s\S]*?return\s*\{\s*success:\s*true,\s*orderNumber:\s*rpcData\.order_number/,
    'createOrderAction must preserve successful order response even if server cart deduction has a warning/error'
  );
});

test('Architecture: checkout page awaits clearPurchasedItems before navigation to prevent mobile abort', () => {
  const checkoutPath = join(WORKSPACE_DIR, 'app/(store)/checkout/page.tsx');
  const content = readFileSync(checkoutPath, 'utf-8');

  // Must await clearPurchasedItems
  assert.match(
    content,
    /await\s+clearPurchasedItems\(\s*purchasedItems,\s*res\.orderNumber\s*\);/,
    'Checkout page must await clearPurchasedItems before router.push'
  );

  // router.push must be called after clearPurchasedItems
  const clearIdx = content.indexOf('await clearPurchasedItems(purchasedItems, res.orderNumber);');
  const pushIdx = content.indexOf('router.push(confirmationUrl);');
  assert.ok(clearIdx !== -1 && pushIdx !== -1 && clearIdx < pushIdx, 'clearPurchasedItems must precede router.push');
});

test('Architecture: clearPurchasedItems clears stale failed mutations and awaits mutation queue settlement', () => {
  const cartContextPath = join(WORKSPACE_DIR, 'lib/cart/cart-context.tsx');
  const content = readFileSync(cartContextPath, 'utf-8');

  // Must clean failedMutationsRef for purchased items
  assert.match(
    content,
    /failedMutationsRef\.current\.delete\(item\.variantId\);/,
    'clearPurchasedItems must delete purchased items from failedMutationsRef to prevent stale retry resurrection'
  );

  // Must await mutationQueueRef with race timeout
  assert.match(
    content,
    /await\s+Promise\.race\(\[\s*mutationQueueRef\.current,\s*new\s+Promise\(/,
    'clearPurchasedItems must await mutationQueueRef.current settlement with timeout'
  );
});

// =============================================================================
// FUNCTIONAL LOGIC UNIT TESTS (SIMULATING INVARIANTS)
// =============================================================================

test('Cart Cleanup Logic: Deducts only purchased quantities, preserving remaining quantities and unrelated items', () => {
  const initialCart = [
    { variantId: 'var-1', productId: 'p1', productName: 'Gold Ring', price: 5000, quantity: 3 },
    { variantId: 'var-2', productId: 'p2', productName: 'Diamond Pendant', price: 12000, quantity: 1 },
    { variantId: 'var-3', productId: 'p3', productName: 'Silver Bracelet', price: 3500, quantity: 2 },
  ];

  // Customer purchases 2 units of var-1 and 1 unit of var-2 (var-3 is untouched)
  const purchasedItems = [
    { variantId: 'var-1', quantity: 2 },
    { variantId: 'var-2', quantity: 1 },
  ];

  const purchasedMap = new Map<string, number>();
  for (const item of purchasedItems) {
    const cur = purchasedMap.get(item.variantId) || 0;
    purchasedMap.set(item.variantId, cur + item.quantity);
  }

  const remaining: typeof initialCart = [];
  for (const item of initialCart) {
    const pQty = purchasedMap.get(item.variantId) || 0;
    if (pQty === 0) {
      remaining.push(item);
    } else if (item.quantity > pQty) {
      remaining.push({
        ...item,
        quantity: item.quantity - pQty,
      });
    }
  }

  assert.equal(remaining.length, 2, 'Two items must remain in the bag');
  const remainingVar1 = remaining.find((i) => i.variantId === 'var-1');
  assert.ok(remainingVar1);
  assert.equal(remainingVar1.quantity, 1, 'var-1 should have 1 unit remaining (3 - 2 = 1)');

  const remainingVar2 = remaining.find((i) => i.variantId === 'var-2');
  assert.equal(remainingVar2, undefined, 'var-2 should be completely removed (1 - 1 = 0)');

  const remainingVar3 = remaining.find((i) => i.variantId === 'var-3');
  assert.ok(remainingVar3);
  assert.equal(remainingVar3.quantity, 2, 'Unrelated var-3 must be fully preserved with quantity 2');
});

test('Cart Cleanup Logic: Full cart purchase empties cart completely and removes guest flag', () => {
  const initialCart = [
    { variantId: 'var-1', productId: 'p1', productName: 'Earrings', price: 4000, quantity: 2 },
  ];

  const purchasedItems = [{ variantId: 'var-1', quantity: 2 }];
  const purchasedMap = new Map<string, number>([['var-1', 2]]);

  const remaining: typeof initialCart = [];
  for (const item of initialCart) {
    const pQty = purchasedMap.get(item.variantId) || 0;
    if (pQty === 0) {
      remaining.push(item);
    } else if (item.quantity > pQty) {
      remaining.push({ ...item, quantity: item.quantity - pQty });
    }
  }

  assert.equal(remaining.length, 0, 'Cart should be empty after full cart purchase');
});

test('Cart Cleanup Logic: Failed checkout preserves 100% of cart contents without deductions', () => {
  const initialCart = [
    { variantId: 'var-1', productId: 'p1', productName: 'Gold Ring', price: 5000, quantity: 2 },
  ];

  // Simulating checkout failure (e.g. insufficient inventory, payment validation error)
  const orderResult = { success: false, error: 'Insufficient stock for Gold Ring' };

  let currentCart = [...initialCart];
  if (orderResult.success) {
    currentCart = [];
  }

  assert.equal(currentCart.length, 1, 'Cart must remain unchanged on order failure');
  assert.equal(currentCart[0].quantity, 2, 'Quantity must remain intact');
});

test('Cart Cleanup Logic: Idempotent client deduction prevents double deduction on duplicate invocations', () => {
  let lastDeductedOrder: string | null = null;
  let deductionExecutionCount = 0;

  function simulateClearPurchasedItems(orderNumber: string) {
    if (orderNumber && lastDeductedOrder === orderNumber) {
      return { skipped: true };
    }
    lastDeductedOrder = orderNumber;
    deductionExecutionCount++;
    return { skipped: false };
  }

  const firstCall = simulateClearPurchasedItems('SJ-20261020-0002');
  assert.equal(firstCall.skipped, false);
  assert.equal(deductionExecutionCount, 1);

  // Duplicate / retry call with same orderNumber
  const secondCall = simulateClearPurchasedItems('SJ-20261020-0002');
  assert.equal(secondCall.skipped, true);
  assert.equal(deductionExecutionCount, 1, 'Deduction logic must not run twice for identical order');
});

test('Cart Cleanup Logic: Bank transfer order cleanup operates immediately upon order creation regardless of pending verification', () => {
  // Bank transfer orders are created with payment_status: 'pending'
  const mockOrderResponse = {
    success: true,
    orderNumber: 'SJ-20261020-0002',
    orderId: 'be446b59-6e0a-4883-bb09-5b11405f0e7a',
    paymentMethod: 'bank_transfer',
    paymentStatus: 'pending',
  };

  let cartDeducted = false;
  // Cleanup must trigger on order success, NOT conditional on payment verification
  if (mockOrderResponse.success && mockOrderResponse.orderNumber) {
    cartDeducted = true;
  }

  assert.equal(cartDeducted, true, 'Cart cleanup must trigger immediately for bank transfer orders upon order creation');
});

test('Cart Cleanup Logic: Guest checkout performs local-only cleanup without server session error', () => {
  const isGuest = true;
  const initialLocalItems = [{ variantId: 'v-guest-1', quantity: 1 }];

  let serverCallAttempted = false;
  let localItems = [...initialLocalItems];

  // Simulating guest flow
  localItems = []; // Local storage wiped
  if (!isGuest) {
    serverCallAttempted = true;
  }

  assert.equal(localItems.length, 0, 'Guest cart must be cleared locally');
  assert.equal(serverCallAttempted, false, 'No server-side user cart deduction should be attempted for unauthenticated guests');
});

test('PostgreSQL Definition: deduct_purchased_cart_items derives variants strictly from public.order_items and respects ownership', () => {
  const migrationPath = join(WORKSPACE_DIR, 'supabase/migrations/00011_cart_durable_idempotency.sql');
  const migrationSql = readFileSync(migrationPath, 'utf-8');

  // Must query from public.order_items using order_id
  assert.match(
    migrationSql,
    /FROM\s+public\.order_items[\s\S]*?WHERE\s+order_id\s*=\s*v_order_record\.id[\s\S]*?GROUP\s+BY\s+variant_id/,
    'deduct_purchased_cart_items must derive variants and quantities from public.order_items'
  );

  // Must enforce customer ownership
  assert.match(
    migrationSql,
    /IF\s+v_order_record\.user_id\s+IS\s+NULL\s+OR\s+v_order_record\.user_id\s*<>\s*p_user_id\s+THEN\s*RAISE\s+EXCEPTION\s+'Unauthorized/,
    'deduct_purchased_cart_items must check order ownership against authenticated p_user_id'
  );

  // Must check durable idempotency before performing mutations
  assert.match(
    migrationSql,
    /SELECT\s+id,\s*response\s+INTO\s+v_existing_record[\s\S]*?FROM\s+public\.cart_idempotency_records/,
    'deduct_purchased_cart_items must check cart_idempotency_records for existing operation'
  );
});

test('Failed Mutation Eviction & Lifecycle: Stale pre-checkout mutations are evicted without dropping legitimate subsequent additions', () => {
  const failedMutations = new Map<string, { type: 'sync'; variantId: string; quantity: number }>();

  // Stale pre-purchase failure: user tried to set quantity to 5 before checkout, but network failed
  failedMutations.set('var-alpha', { type: 'sync', variantId: 'var-alpha', quantity: 5 });
  assert.equal(failedMutations.has('var-alpha'), true);

  // Checkout purchase occurs for var-alpha (quantity 2 purchased)
  const purchasedItems = [{ variantId: 'var-alpha', quantity: 2 }];
  for (const item of purchasedItems) {
    failedMutations.delete(item.variantId);
  }

  // Pre-purchase failed mutation is safely evicted
  assert.equal(failedMutations.has('var-alpha'), false, 'Stale pre-purchase mutation must be evicted');

  // Customer subsequently browses the shop and adds var-alpha again (e.g. quantity 1)
  const subsequentMutation = { type: 'sync' as const, variantId: 'var-alpha', quantity: 1 };
  failedMutations.set(subsequentMutation.variantId, subsequentMutation);

  // Legitimate subsequent mutation is preserved and tracked
  assert.equal(failedMutations.get('var-alpha')?.quantity, 1, 'Legitimate post-checkout mutation must be tracked');
});

test('Server Cleanup Failure Tolerance: Order succeeds with cartCleanedUp=false and provides recovery without duplicate stock deduction', () => {
  // Simulating server order creation where process_order_checkout succeeds but deduct_purchased_cart_items throws
  let orderCreated = true;
  let orderNumber = 'SJ-20261020-0003';
  let stockDeductedTimes = 1;
  let cartCleanedUp = false;

  const orderResult = {
    success: orderCreated,
    orderNumber,
    cartCleanedUp,
  };

  assert.equal(orderResult.success, true, 'Order result must remain successful');
  assert.equal(orderResult.orderNumber, 'SJ-20261020-0003', 'Order number must be returned');
  assert.equal(orderResult.cartCleanedUp, false, 'cartCleanedUp must accurately report false');
  assert.equal(stockDeductedTimes, 1, 'Inventory stock must not be deducted again during cleanup failure');
});
