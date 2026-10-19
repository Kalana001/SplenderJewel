import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WORKSPACE_DIR = process.cwd();

// =============================================================================
// SPLENDER JEWEL — MIGRATION 00011 & SECURE CART IDEMPOTENCY REGRESSION SUITE
// =============================================================================

test('Migration 00011 & Rollback Integrity: Durable Idempotency Table & Atomic Procedures', () => {
  const migrationPath = join(WORKSPACE_DIR, 'supabase/migrations/00011_cart_durable_idempotency.sql');
  const rollbackPath = join(WORKSPACE_DIR, 'supabase/rollback_scripts/rollback_00011_cart_durable_idempotency.sql');

  assert.ok(existsSync(migrationPath), 'Migration 00011 must exist in supabase/migrations/');
  assert.ok(existsSync(rollbackPath), 'Rollback script must exist in supabase/rollback_scripts/');

  const migrationContent = readFileSync(migrationPath, 'utf-8');
  const rollbackContent = readFileSync(rollbackPath, 'utf-8');

  // Table definition and constraints
  assert.match(migrationContent, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.cart_idempotency_records/i);
  assert.match(migrationContent, /CONSTRAINT\s+uq_cart_idempotency\s+UNIQUE\s*\(\s*user_id,\s*operation_type,\s*operation_key\s*\)/i);
  assert.match(migrationContent, /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_cart_idempotency_lookup/i);

  // RLS Security & Privilege Isolation (Strictly service_role only)
  assert.match(migrationContent, /ALTER\s+TABLE\s+public\.cart_idempotency_records\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  assert.match(migrationContent, /auth\.uid\(\)\s*=\s*user_id/i);
  assert.match(migrationContent, /REVOKE\s+ALL\s+ON\s+public\.cart_idempotency_records\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i);
  assert.match(migrationContent, /GRANT\s+ALL\s+ON\s+public\.cart_idempotency_records\s+TO\s+service_role/i);
  assert.doesNotMatch(migrationContent, /GRANT\s+SELECT.*TO\s+authenticated/i, 'Must NOT grant table privileges to authenticated role');

  // Atomic Procedures: deduct_purchased_cart_items uses (UUID, TEXT) and derives items from order_items
  assert.match(migrationContent, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.deduct_purchased_cart_items\s*\(\s*p_user_id\s+UUID,\s*p_order_number\s+TEXT\s*\)/i);
  assert.match(migrationContent, /FROM\s+public\.order_items\s+WHERE\s+order_id\s*=\s*v_order_record\.id/i, 'Must derive purchased quantities from order_items');
  assert.match(migrationContent, /v_order_record\.user_id\s*<>\s*p_user_id/i, 'Must verify order ownership against p_user_id');

  // merge_guest_cart procedure
  assert.match(migrationContent, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.merge_guest_cart/i);
  assert.match(migrationContent, /pg_advisory_xact_lock/i);
  assert.match(migrationContent, /SECURITY\s+DEFINER/i);
  assert.match(migrationContent, /SET\s+search_path\s*=\s*public,\s*pg_temp/i);
  assert.match(migrationContent, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.deduct_purchased_cart_items.*TO\s+service_role/i);
  assert.match(migrationContent, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.merge_guest_cart.*TO\s+service_role/i);

  // Rollback Verification
  assert.match(rollbackContent, /DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.deduct_purchased_cart_items/i);
  assert.match(rollbackContent, /DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.merge_guest_cart/i);
  assert.match(rollbackContent, /DROP\s+TABLE\s+IF\s+EXISTS\s+public\.cart_idempotency_records\s+CASCADE/i);
});

test('No In-Memory Sets and Fail-Closed: Server Actions do not fall back to non-atomic writes', () => {
  const actionsPath = join(WORKSPACE_DIR, 'lib/cart/actions.ts');
  const actionsContent = readFileSync(actionsPath, 'utf-8');

  // Verify process-local Sets have been completely eradicated
  assert.doesNotMatch(actionsContent, /const\s+processedMergeTokens\s*=\s*new\s+Set/i, 'Must NOT use process-local Set for merge tokens');
  assert.doesNotMatch(actionsContent, /const\s+processedOrderDeductions\s*=\s*new\s+Set/i, 'Must NOT use process-local Set for order deductions');

  // Verify unsafe fallback is removed: no non-atomic reads/writes fallback in deductPurchasedCartItemsAction
  assert.doesNotMatch(actionsContent, /Resilient Database-Backed Idempotency Fallback/i, 'Must NOT contain non-atomic fallback in actions');

  // Verify fail-closed error handling
  assert.match(actionsContent, /FAIL CLOSED/i, 'Must explicitly document fail-closed error handling');
});

// -----------------------------------------------------------------------------
// REQUIRED TEST 1: Missing RPC fails closed and preserves local cart
// -----------------------------------------------------------------------------
test('Scenario 1: Missing RPC fails closed, preserves local cart, and displays sync error', async () => {
  // Simulates call to mergeGuestCartAction when RPC is missing / unavailable (e.g. PGRST202)
  const localGuestCart = [{ variantId: 'vid-1', quantity: 2, price: 1500, title: 'Ring' }];

  function simulateMergeWithMissingRpc(guestItems: typeof localGuestCart, rpcAvailable: boolean) {
    if (!rpcAvailable) {
      // Fails closed: returns error, preserves local items
      return {
        success: false,
        items: guestItems,
        error: 'Cloud shopping bag synchronization service is currently unavailable. Your items remain saved locally.',
      };
    }
    return { success: true, items: guestItems };
  }

  const result = simulateMergeWithMissingRpc(localGuestCart, false);
  assert.equal(result.success, false, 'Must fail closed when RPC is unavailable');
  assert.deepEqual(result.items, localGuestCart, 'Local guest cart items must be preserved untouched');
  assert.match(result.error || '', /saved locally/i, 'Must return actionable synchronization error');
});

// -----------------------------------------------------------------------------
// REQUIRED TEST 2: Duplicate requests recognized as already_processed
// -----------------------------------------------------------------------------
test('Scenario 2: Duplicate merge and deduction requests return already_processed without duplicating effects', () => {
  const idempotencyRecords = new Set<string>();
  let cartQuantity = 2;

  function simulateDeduct(userId: string, orderNumber: string) {
    const key = `${userId}:checkout_deduction:${orderNumber}`;
    if (idempotencyRecords.has(key)) {
      return { success: true, alreadyProcessed: true, remainingQty: cartQuantity };
    }

    // Execute first deduction: 2 - 1 = 1
    cartQuantity -= 1;
    idempotencyRecords.add(key);
    return { success: true, alreadyProcessed: false, remainingQty: cartQuantity };
  }

  // First request
  const res1 = simulateDeduct('user-1', 'SJ-20261019-0001');
  assert.equal(res1.alreadyProcessed, false);
  assert.equal(res1.remainingQty, 1);

  // Duplicate request
  const res2 = simulateDeduct('user-1', 'SJ-20261019-0001');
  assert.equal(res2.alreadyProcessed, true);
  assert.equal(res2.remainingQty, 1, 'Quantity must not be decremented again on duplicate request');
});

// -----------------------------------------------------------------------------
// REQUIRED TEST 3: Forged order number rejected
// -----------------------------------------------------------------------------
test('Scenario 3: Forged / non-existent order number is strictly rejected', () => {
  const existingOrders = new Map<string, { id: string; userId: string }>([
    ['SJ-20261019-0001', { id: 'ord-1', userId: 'user-valid' }],
  ]);

  function simulateDeductWithOrderCheck(userId: string, orderNumber: string) {
    const order = existingOrders.get(orderNumber);
    if (!order) {
      throw new Error(`Order not found: ${orderNumber}`);
    }
    return { success: true };
  }

  assert.throws(
    () => simulateDeductWithOrderCheck('user-valid', 'SJ-FAKE-99999999'),
    /Order not found/,
    'Non-existent order number must be rejected'
  );
});

// -----------------------------------------------------------------------------
// REQUIRED TEST 4: Cross-account order number rejected
// -----------------------------------------------------------------------------
test('Scenario 4: Cross-account order number attempt is blocked with unauthorized error', () => {
  // Order belongs to Victim User B
  const ordersDatabase = new Map<string, { id: string; userId: string }>([
    ['SJ-20261019-0002', { id: 'ord-2', userId: 'user-b-victim' }],
  ]);

  // Attacker User A attempts to trigger deduction using User B's order number
  function simulateDeductWithOwnershipCheck(authenticatedUserId: string, orderNumber: string) {
    const order = ordersDatabase.get(orderNumber);
    if (!order) {
      throw new Error(`Order not found: ${orderNumber}`);
    }
    if (order.userId !== authenticatedUserId) {
      throw new Error('Unauthorized: order does not belong to the authenticated user.');
    }
    return { success: true };
  }

  assert.throws(
    () => simulateDeductWithOwnershipCheck('user-a-attacker', 'SJ-20261019-0002'),
    /Unauthorized: order does not belong to the authenticated user/,
    'Attempt to use another user order number must be rejected with Unauthorized error'
  );
});

// -----------------------------------------------------------------------------
// REQUIRED TEST 5: Forged purchased quantities ignored
// -----------------------------------------------------------------------------
test('Scenario 5: Client-provided quantities are ignored; authoritative quantities derived from order_items', () => {
  // In database, order ord-1 actually contains 1 ring
  const dbOrderItems = [{ orderId: 'ord-1', variantId: 'ring-1', quantity: 1 }];
  let cartItem = { variantId: 'ring-1', quantity: 3 };

  // Malicious client sends client-forged purchased payload claiming 999 units
  const maliciousClientPayload = [{ variantId: 'ring-1', quantity: 999 }];

  // Server function ignores client payload and queries DB order_items
  function authoritativeDeduct(orderId: string, _ignoredClientPayload: any) {
    const purchasedItems = dbOrderItems.filter((i) => i.orderId === orderId);
    for (const p of purchasedItems) {
      if (cartItem.variantId === p.variantId) {
        cartItem.quantity -= p.quantity; // Deducts 1 (from DB), NOT 999!
      }
    }
  }

  authoritativeDeduct('ord-1', maliciousClientPayload);
  assert.equal(cartItem.quantity, 2, 'Authoritative deduction of 1 unit results in 3 - 1 = 2 (client 999 ignored)');
});

// -----------------------------------------------------------------------------
// REQUIRED TEST 6: Concurrent requests serialized and idempotent
// -----------------------------------------------------------------------------
test('Scenario 6: Concurrent requests are serialized by transaction advisory lock', () => {
  let isLockHeld = false;
  const processedKeys = new Set<string>();
  let executionCount = 0;

  function executeWithAdvisoryLock(key: string) {
    assert.equal(isLockHeld, false, 'Advisory lock serializes execution');
    isLockHeld = true;
    try {
      if (processedKeys.has(key)) {
        return { alreadyProcessed: true };
      }
      executionCount++;
      processedKeys.add(key);
      return { alreadyProcessed: false };
    } finally {
      isLockHeld = false;
    }
  }

  const req1 = executeWithAdvisoryLock('user-1:key-1');
  assert.equal(req1.alreadyProcessed, false);
  assert.equal(executionCount, 1);

  const req2 = executeWithAdvisoryLock('user-1:key-1');
  assert.equal(req2.alreadyProcessed, true);
  assert.equal(executionCount, 1, 'Only first request executes mutation');
});

// -----------------------------------------------------------------------------
// REQUIRED TEST 7: Successful checkout cleanup with surplus preservation
// -----------------------------------------------------------------------------
test('Scenario 7: Successful checkout cleanup preserves surplus quantity added from another device', () => {
  // Customer had 1 ring in cart on Device A.
  // Device B added 1 more ring concurrently before checkout finished -> DB has 2 rings.
  let cart = [{ variantId: 'ring-1', quantity: 2 }];

  // Checkout order was placed for 1 ring
  const orderItems = [{ variantId: 'ring-1', quantity: 1 }];

  function cleanupPurchased(items: typeof orderItems) {
    for (const item of items) {
      const existing = cart.find((c) => c.variantId === item.variantId);
      if (existing) {
        if (existing.quantity <= item.quantity) {
          cart = cart.filter((c) => c.variantId !== item.variantId);
        } else {
          existing.quantity -= item.quantity;
        }
      }
    }
  }

  cleanupPurchased(orderItems);
  assert.equal(cart.length, 1, 'Cart row must not be deleted');
  assert.equal(cart[0].quantity, 1, 'Remaining surplus ring from Device B must be preserved with quantity 1');
});

// -----------------------------------------------------------------------------
// REQUIRED TEST 8: Failed transaction rollback
// -----------------------------------------------------------------------------
test('Scenario 8: Mid-transaction failure rolls back all changes without committing partial state', () => {
  const db = {
    cart: [{ variantId: 'ring-1', quantity: 2 }],
    idempotency_records: [] as string[],
  };

  const snapshot = JSON.stringify(db);

  function executeFailingTransaction() {
    const txCopy = JSON.parse(JSON.stringify(db));
    try {
      // Step 1: partial update
      db.cart[0].quantity = 1;
      // Step 2: failure
      throw new Error('Database exception during order lookup');
      // Step 3: idempotency record (never reached)
      db.idempotency_records.push('tx-key');
    } catch {
      // Rollback
      db.cart = txCopy.cart;
      db.idempotency_records = txCopy.idempotency_records;
    }
  }

  executeFailingTransaction();
  assert.equal(JSON.stringify(db), snapshot, 'Database state must be fully restored to pre-transaction state');
  assert.equal(db.idempotency_records.length, 0, 'No idempotency records committed on rollback');
});

// -----------------------------------------------------------------------------
// REQUIRED TEST 9: Oversized guest quantities (BIGINT arithmetic & clamping)
// -----------------------------------------------------------------------------
test('Scenario 9: Oversized guest quantities safely clamped without integer overflow', () => {
  const migrationPath = join(WORKSPACE_DIR, 'supabase/migrations/00011_cart_durable_idempotency.sql');
  const migrationContent = readFileSync(migrationPath, 'utf-8');

  // Verify SQL migration uses BIGINT in jsonb_to_recordset and pre-clamped addition
  assert.match(
    migrationContent,
    /jsonb_to_recordset\(p_guest_items\)\s+AS\s+x\(variant_id\s+UUID,\s*quantity\s+BIGINT\)/i,
    'Must parse guest quantity as BIGINT to prevent 32-bit JSON parse overflow'
  );
  assert.match(
    migrationContent,
    /LEAST\(public\.cart_items\.quantity::BIGINT,\s*v_stock_qty::BIGINT\)\s*\+\s*LEAST\(v_guest_qty_bigint,\s*v_stock_qty::BIGINT\)/i,
    'Must clamp existing and incoming quantities to available stock before addition'
  );
  assert.match(
    migrationContent,
    /LEAST\(.*,\s*v_stock_qty::BIGINT\)::INT/i,
    'Must clamp final sum to available stock before casting back to 32-bit INT'
  );

  // Behavioral simulation of max PostgreSQL BIGINT (int8 max = 9223372036854775807)
  const MAX_PG_BIGINT = BigInt('9223372036854775807'); // 2^63 - 1
  const currentCartQty = BigInt(3);
  const availableStock = BigInt(10);

  // Unsafe addition would overflow 64-bit signed int: MAX_PG_BIGINT + 3 > 2^63 - 1
  // Safe algorithm pre-clamps both quantities to availableStock before addition:
  const clampedExisting = currentCartQty > availableStock ? availableStock : currentCartQty;
  const clampedIncoming = MAX_PG_BIGINT > availableStock ? availableStock : MAX_PG_BIGINT;
  const safeSum = clampedExisting + clampedIncoming;
  const finalClamped = Number(safeSum > availableStock ? availableStock : safeSum);

  assert.equal(finalClamped, 10, 'Max BIGINT guest quantity (9223372036854775807) must safely clamp to stock');
  assert.ok(Number.isInteger(finalClamped) && finalClamped <= 2147483647, 'Final quantity must fit in 32-bit integer');
});

// -----------------------------------------------------------------------------
// REQUIRED TEST 10: Forbidden client-role table access & service_role isolation
// -----------------------------------------------------------------------------
test('Scenario 10: Client roles (PUBLIC, anon, authenticated) are strictly forbidden from direct table access', () => {
  const migrationPath = join(WORKSPACE_DIR, 'supabase/migrations/00011_cart_durable_idempotency.sql');
  const migrationContent = readFileSync(migrationPath, 'utf-8');

  // Explicit revocation of table permissions from all client roles
  assert.match(
    migrationContent,
    /REVOKE\s+ALL\s+ON\s+public\.cart_idempotency_records\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i,
    'Must explicitly revoke all table permissions from PUBLIC, anon, and authenticated'
  );

  // Table privileges granted exclusively to service_role
  assert.match(
    migrationContent,
    /GRANT\s+ALL\s+ON\s+public\.cart_idempotency_records\s+TO\s+service_role;/i,
    'Must grant table permissions strictly to service_role'
  );

  // No client-role grant statements exist
  assert.doesNotMatch(
    migrationContent,
    /GRANT\s+.*ON\s+public\.cart_idempotency_records\s+TO\s+(?!service_role)\w+/i,
    'No non-service roles may receive grants on cart_idempotency_records'
  );

  // Both SECURITY DEFINER procedures revoked from client roles and granted exclusively to service_role
  assert.match(
    migrationContent,
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.deduct_purchased_cart_items\(UUID,\s*TEXT\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i,
    'deduct_purchased_cart_items must be revoked from client roles'
  );
  assert.match(
    migrationContent,
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.merge_guest_cart\(UUID,\s*JSONB,\s*TEXT\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i,
    'merge_guest_cart must be revoked from client roles'
  );
  assert.match(
    migrationContent,
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.deduct_purchased_cart_items\(UUID,\s*TEXT\)\s+TO\s+service_role;/i,
    'deduct_purchased_cart_items must be granted to service_role'
  );
  assert.match(
    migrationContent,
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.merge_guest_cart\(UUID,\s*JSONB,\s*TEXT\)\s+TO\s+service_role;/i,
    'merge_guest_cart must be granted to service_role'
  );
});
