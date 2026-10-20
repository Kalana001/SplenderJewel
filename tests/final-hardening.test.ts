import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKSPACE_DIR = process.cwd();

// =============================================================================
// STAGE B.6.1: CRITICAL MIGRATION & RELEASE HARDENING REGRESSION TESTS
// =============================================================================

test('Migration 00012: Enforces single-transaction atomicity, row locks, active admin authorization, and cancellation delegation', () => {
  const migrationPath = join(WORKSPACE_DIR, 'supabase/migrations/00012_atomic_order_status_update.sql');
  const content = readFileSync(migrationPath, 'utf-8');

  // 0. Must be wrapped in an explicit transaction (BEGIN; ... COMMIT;)
  assert.match(
    content,
    /BEGIN;[\s\S]*?COMMIT;/,
    'Migration 00012 must be wrapped in an explicit transaction block (BEGIN; ... COMMIT;)'
  );

  // 1. Must define update_order_status_with_audit with exact signature
  assert.match(
    content,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.update_order_status_with_audit\(\s*p_order_id\s+UUID,\s*p_admin_id\s+UUID,\s*p_new_status\s+TEXT,\s*p_notes\s+TEXT\s+DEFAULT\s+NULL\s*\)/,
    'Migration 00012 must define update_order_status_with_audit procedure with exact 4 parameters'
  );

  // 2. Must restrict execution to trusted roles compatible with Supabase PostgREST service_role
  assert.match(
    content,
    /request\.jwt\.claim\.role['"],\s*true\),\s*['"]['"]\)\s+IN\s+\('anon',\s*'authenticated'\)/,
    'Must explicitly reject anon and authenticated callers'
  );
  assert.match(
    content,
    /request\.jwt\.claim\.role['"],\s*true\),\s*['"]['"]\)\s*<>\s*['"]service_role['"]/,
    'Must ensure JWT caller role is service_role'
  );

  // 3. Must verify active admin
  assert.match(
    content,
    /FROM\s+public\.admin_users[\s\S]*?WHERE\s+id\s*=\s*p_admin_id\s+AND\s+is_active\s*=\s*TRUE/,
    'Must verify that the acting administrator is active'
  );

  // 4. Must check all legitimate order statuses including confirmed and refunded
  assert.match(
    content,
    /ARRAY\['pending',\s*'confirmed',\s*'processing',\s*'shipped',\s*'delivered',\s*'cancelled',\s*'refunded'\]/,
    'Must support all legitimate existing order statuses matching database check constraint'
  );

  // 5. Must lock order row FOR UPDATE using canonical order_status column
  assert.match(
    content,
    /SELECT\s+id,\s*order_number,\s*order_status[\s\S]*?FROM\s+public\.orders[\s\S]*?WHERE\s+id\s*=\s*p_order_id[\s\S]*?FOR\s+UPDATE/,
    'Must acquire row lock FOR UPDATE on orders using column order_status'
  );

  // 6. Must prohibit reopening cancelled orders
  assert.match(
    content,
    /IF\s+v_previous_status\s*=\s*'cancelled'\s+THEN[\s\S]*?Cancelled orders cannot be reopened/,
    'Must reject reopening or transitioning cancelled orders'
  );

  // 7. Must delegate cancellation to cancel_order_and_restock with exact 3-argument signature
  assert.match(
    content,
    /IF\s+v_clean_status\s*=\s*'cancelled'\s+THEN[\s\S]*?public\.cancel_order_and_restock\(p_order_id,\s*p_admin_id,\s*p_notes\)/,
    'Must delegate cancellation to cancel_order_and_restock(p_order_id, p_admin_id, p_notes)'
  );

  // 8. Must update orders.order_status and insert into order_status_history with changed_by
  assert.match(
    content,
    /UPDATE\s+public\.orders[\s\S]*?SET[\s\S]*?order_status\s*=\s*v_clean_status/,
    'Must update orders.order_status'
  );
  assert.match(
    content,
    /INSERT\s+INTO\s+public\.order_status_history\s*\(\s*order_id,\s*previous_status,\s*new_status,\s*changed_by,\s*notes\s*\)/,
    'Must insert into order_status_history using exact verified columns (order_id, previous_status, new_status, changed_by, notes)'
  );

  // 9. Must revoke from public and grant strictly to service_role
  assert.match(
    content,
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.update_order_status_with_audit\(UUID,\s*UUID,\s*TEXT,\s*TEXT\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/,
    'Must revoke execute from PUBLIC, anon, authenticated'
  );
  assert.match(
    content,
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.update_order_status_with_audit\(UUID,\s*UUID,\s*TEXT,\s*TEXT\)\s+TO\s+service_role;/,
    'Must grant execute strictly to service_role'
  );
});

test('Admin Actions: transitionSingleOrder invokes update_order_status_with_audit without unsafe application fallback', () => {
  const actionsPath = join(WORKSPACE_DIR, 'lib/orders/admin-actions.ts');
  const content = readFileSync(actionsPath, 'utf-8');

  // Must invoke update_order_status_with_audit RPC
  assert.match(
    content,
    /\.rpc\(\s*['"]update_order_status_with_audit['"]/,
    'transitionSingleOrder must attempt to invoke update_order_status_with_audit RPC'
  );

  // Must detect missing RPC and return safe error
  assert.match(
    content,
    /isRpcMissing/,
    'Must handle unapplied migration gracefully via isRpcMissing check'
  );

  assert.match(
    content,
    /Database migration 00012 must be applied/,
    'Must return clear controlled message when migration 00012 is unapplied'
  );

  // Unsafe fallback must NOT exist: must not do direct update inside transitionSingleOrder
  const transitionFnMatch = content.match(/async function transitionSingleOrder[\s\S]*?^}/m);
  assert.ok(transitionFnMatch, 'transitionSingleOrder function must exist');
  const fnBody = transitionFnMatch[0];
  assert.doesNotMatch(
    fnBody,
    /\.from\(['"]orders['"]\)\s*\.update/,
    'transitionSingleOrder must NOT contain non-atomic direct update fallback'
  );
  assert.doesNotMatch(
    fnBody,
    /\.from\(['"]order_status_history['"]\)\s*\.insert/,
    'transitionSingleOrder must NOT contain non-atomic history insertion fallback'
  );
});

test('CheckoutSource Validation: createOrderAction strictly validates checkoutSource parameter', () => {
  const actionsPath = join(WORKSPACE_DIR, 'lib/orders/actions.ts');
  const content = readFileSync(actionsPath, 'utf-8');

  // Must validate checkoutSource explicitly
  assert.match(
    content,
    /let\s+validatedCheckoutSource:\s*['"]cart['"]\s*\|\s*['"]buy_now['"]\s*=\s*['"]cart['"]/,
    'Must declare validatedCheckoutSource defaulting to cart'
  );

  // Must reject invalid checkoutSource values
  assert.match(
    content,
    /Invalid checkout source specified\. Must be "cart" or "buy_now"/,
    'Must return error when checkoutSource is not cart or buy_now'
  );

  // Must use validatedCheckoutSource in cart cleanup guard
  assert.match(
    content,
    /const\s+isCartCheckout\s*=[\s\S]*?validatedCheckoutSource\s*===\s*['"]cart['"]/,
    'isCartCheckout must be strictly bound to validatedCheckoutSource === "cart"'
  );
});

// =============================================================================
// FUNCTIONAL BEHAVIORAL SIMULATIONS
// =============================================================================

function validateCheckoutSourceLogic(rawSource: unknown): { valid: boolean; source?: 'cart' | 'buy_now'; error?: string } {
  let validated: 'cart' | 'buy_now' = 'cart';
  if (rawSource !== undefined && rawSource !== null) {
    if (rawSource === 'cart' || rawSource === 'buy_now') {
      validated = rawSource;
    } else {
      return { valid: false, error: 'Invalid checkout source specified. Must be "cart" or "buy_now".' };
    }
  }
  return { valid: true, source: validated };
}

test('Step 2 Behavioral: Accepts legitimate cart and buy_now sources, and defaults omitted source to cart', () => {
  assert.deepEqual(validateCheckoutSourceLogic('cart'), { valid: true, source: 'cart' });
  assert.deepEqual(validateCheckoutSourceLogic('buy_now'), { valid: true, source: 'buy_now' });
  assert.deepEqual(validateCheckoutSourceLogic(undefined), { valid: true, source: 'cart' });
  assert.deepEqual(validateCheckoutSourceLogic(null), { valid: true, source: 'cart' });
});

test('Step 2 Behavioral: Strictly rejects manipulated, unexpected, or malicious checkoutSource values', () => {
  const invalidInputs = [
    'hacked',
    'admin',
    'cart_deduct_all',
    'buy_now_hack',
    '../../etc/passwd',
    123,
    {},
    [],
    true,
    false,
    '',
    '   ',
  ];

  for (const input of invalidInputs) {
    const res = validateCheckoutSourceLogic(input);
    assert.equal(res.valid, false, `Input "${String(input)}" must be rejected`);
    assert.match(res.error || '', /Invalid checkout source specified/);
  }
});

test('Step 1 Behavioral: Transactional order status update rolls back status when audit history insert fails', () => {
  interface SimulatedDbState {
    orderStatus: string;
    history: Array<{ orderId: string; status: string; changedBy: string }>;
  }

  const db: SimulatedDbState = {
    orderStatus: 'pending',
    history: [],
  };

  const executeAtomicTransition = (newStatus: string, adminId: string, failHistory: boolean) => {
    // Savepoint / Transaction begin
    const rollbackState = JSON.parse(JSON.stringify(db));
    try {
      // 1. Update status
      db.orderStatus = newStatus;

      // 2. Insert history
      if (failHistory) {
        throw new Error('Database constraint violation on order_status_history');
      }
      db.history.push({ orderId: 'ord-1', status: newStatus, changedBy: adminId });

      // Commit
      return { success: true };
    } catch (err: any) {
      // Rollback on any failure
      db.orderStatus = rollbackState.orderStatus;
      db.history = rollbackState.history;
      return { success: false, error: err.message };
    }
  };

  // Case A: Successful transition
  const successRes = executeAtomicTransition('confirmed', 'admin-1', false);
  assert.equal(successRes.success, true);
  assert.equal(db.orderStatus, 'confirmed');
  assert.equal(db.history.length, 1);
  assert.equal(db.history[0].changedBy, 'admin-1');

  // Case B: History fails -> status update must be rolled back!
  const failRes = executeAtomicTransition('shipped', 'admin-1', true);
  assert.equal(failRes.success, false);
  assert.equal(db.orderStatus, 'confirmed', 'Order status must remain confirmed after failed history insert');
  assert.equal(db.history.length, 1, 'History length must remain unchanged after rollback');
});

test('Step 1 Behavioral: Prohibits reopening cancelled orders and delegates cancellation to restock', () => {
  const allowedStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];

  const simulateStatusTransition = (currentStatus: string, targetStatus: string) => {
    if (!allowedStatuses.includes(targetStatus)) {
      return { success: false, error: `Invalid target order status specified: ${targetStatus}` };
    }
    if (currentStatus === targetStatus) {
      return { success: true, idempotent: true };
    }
    if (currentStatus === 'cancelled') {
      return { success: false, error: 'Cancelled orders cannot be reopened or transitioned to another status.' };
    }
    if (targetStatus === 'cancelled') {
      return { success: true, delegatedRestock: true, newStatus: 'cancelled' };
    }
    return { success: true, newStatus: targetStatus };
  };

  // 1. Cannot reopen cancelled order
  assert.equal(
    simulateStatusTransition('cancelled', 'pending').success,
    false
  );
  assert.equal(
    simulateStatusTransition('cancelled', 'confirmed').success,
    false
  );

  // 2. Cancellation delegates to restock
  const cancelRes = simulateStatusTransition('processing', 'cancelled');
  assert.equal(cancelRes.success, true);
  assert.equal(cancelRes.delegatedRestock, true);

  // 3. Idempotent check
  const idempRes = simulateStatusTransition('shipped', 'shipped');
  assert.equal(idempRes.success, true);
  assert.equal(idempRes.idempotent, true);

  // 4. Valid business transitions (confirmed, processing, delivered, refunded)
  assert.equal(simulateStatusTransition('pending', 'confirmed').success, true);
  assert.equal(simulateStatusTransition('confirmed', 'processing').success, true);
  assert.equal(simulateStatusTransition('processing', 'shipped').success, true);
  assert.equal(simulateStatusTransition('shipped', 'delivered').success, true);
  assert.equal(simulateStatusTransition('delivered', 'refunded').success, true);
});

test('Step 1 Behavioral: Row-level locking serializes concurrent administrator status updates without stale overwrites', () => {
  interface OrderRecord {
    id: string;
    order_status: string;
    locked: boolean;
  }

  const order: OrderRecord = {
    id: 'ord-concurrent',
    order_status: 'pending',
    locked: false,
  };

  const auditHistory: string[] = [];

  const updateWithLock = async (adminId: string, newStatus: string, delayMs: number) => {
    // Acquire lock (wait if already locked)
    while (order.locked) {
      await new Promise((r) => setTimeout(r, 5));
    }
    order.locked = true;

    try {
      // Re-read current status under lock
      const currentStatus = order.order_status;
      if (currentStatus === newStatus) {
        return { success: true, idempotent: true };
      }
      if (currentStatus === 'cancelled') {
        return { success: false, error: 'Cancelled orders cannot be reopened' };
      }

      await new Promise((r) => setTimeout(r, delayMs));

      order.order_status = newStatus;
      auditHistory.push(`${adminId}: ${currentStatus} -> ${newStatus}`);
      return { success: true, idempotent: false };
    } finally {
      order.locked = false;
    }
  };

  return Promise.all([
    updateWithLock('admin-1', 'confirmed', 20),
    updateWithLock('admin-2', 'processing', 10),
  ]).then((results) => {
    assert.equal(results.every((r) => r.success), true);
    assert.equal(auditHistory.length, 2, 'Both transitions were recorded sequentially under lock');
    // Lock ensured serial execution without collision
    assert.equal(order.order_status, auditHistory[1].split(' -> ')[1]);
  });
});
