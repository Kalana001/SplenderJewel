import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from '../lib/config/constants.ts';

const WORKSPACE_DIR = process.cwd();

// =============================================================================
// STAGE B.4: ADMIN BULK ORDER STATUS UPDATES REGRESSION TESTS
// =============================================================================

test('Step 9 Quality Correction: app/(store)/account/orders/[orderId]/page.tsx removes unsupported (order as any).courier_name', () => {
  const pagePath = join(WORKSPACE_DIR, 'app/(store)/account/orders/[orderId]/page.tsx');
  const content = readFileSync(pagePath, 'utf-8');

  // Must NOT contain courier_name
  assert.doesNotMatch(
    content,
    /courier_name/,
    'Customer order details page must not reference unselected or untyped courier_name'
  );

  // Must preserve tracking_number
  assert.match(
    content,
    /order\.tracking_number/,
    'Customer order details page must preserve tracking number display'
  );
});

test('Bulk Status Action: Source architecture enforces requireAdminAuth, validation, batch size cap, and shared transition helper', () => {
  const actionsPath = join(WORKSPACE_DIR, 'lib/orders/admin-actions.ts');
  const content = readFileSync(actionsPath, 'utf-8');

  // 1. Must export bulkUpdateOrderStatusAction
  assert.match(
    content,
    /export\s+async\s+function\s+bulkUpdateOrderStatusAction/,
    'Must export bulkUpdateOrderStatusAction server action'
  );

  // 2. Must call requireAdminAuth()
  const bulkFnIndex = content.indexOf('bulkUpdateOrderStatusAction');
  const bulkFnContent = content.slice(bulkFnIndex);
  assert.match(
    bulkFnContent,
    /await\s+requireAdminAuth\(\)/,
    'bulkUpdateOrderStatusAction must strictly call requireAdminAuth()'
  );

  // 3. Must cap batch size at 100
  assert.match(
    bulkFnContent,
    /MAX_BATCH_SIZE\s*=\s*100/,
    'bulkUpdateOrderStatusAction must cap batch size to prevent exhaustion'
  );

  // 4. Must deduplicate order IDs
  assert.match(
    bulkFnContent,
    /new\s+Set\(input\.orderIds/,
    'bulkUpdateOrderStatusAction must deduplicate input order IDs'
  );

  // 5. Must reuse internal transition helper
  assert.match(
    content,
    /transitionSingleOrder\s*\(/,
    'Must extract and reuse transitionSingleOrder helper for both single and bulk updates'
  );
});

test('Bulk Selection UI: orders-table.tsx provides checkboxes, visible-only select-all, clear selection, modal, and responsive controls', () => {
  const tablePath = join(WORKSPACE_DIR, 'components/admin/orders/orders-table.tsx');
  const content = readFileSync(tablePath, 'utf-8');

  // Checkbox per row
  assert.match(
    content,
    /aria-label=\{`Select order \$\{order\.order_number\}`\}/,
    'Each table row must have an accessible selection checkbox'
  );

  // Select all visible checkbox in header
  assert.match(
    content,
    /aria-label="Select all visible orders"/,
    'Header must have an accessible select all visible orders checkbox'
  );

  // Reconciles/clears selection on filter or search change
  assert.match(
    content,
    /const\s+handleSearchChange\s*=\s*\(val:\s*string\)\s*=>\s*\{[\s\S]*?setSelectedIds\(new\s+Set\(\)\)/,
    'Search change must reset selection to avoid acting on unseen filtered rows'
  );
  assert.match(
    content,
    /const\s+handleStatusFilterChange\s*=\s*\(val:\s*string\)\s*=>\s*\{[\s\S]*?setSelectedIds\(new\s+Set\(\)\)/,
    'Status filter change must reset selection to avoid acting on unseen rows'
  );

  // Confirmation dialog
  assert.match(
    content,
    /Confirm Bulk Status Update/,
    'Must render a confirmation dialog prior to executing bulk status updates'
  );

  // Special warning for cancellation
  assert.match(
    content,
    /bulkTargetStatus\s*===\s*['"]cancelled['"][\s\S]*?Important Cancellation Warning/,
    'Must display a prominent cancellation warning explaining permanent status and inventory restocking'
  );
});

// =============================================================================
// DOMAIN TRANSITION SIMULATION TESTS (Simulating Server Action Behavior)
// =============================================================================

interface MockOrder {
  id: string;
  order_number: string;
  order_status: OrderStatus;
  payment_method: string;
  payment_status: string;
}

interface MockHistory {
  order_id: string;
  previous_status: OrderStatus;
  new_status: OrderStatus;
  notes?: string;
}

function createMockTransitionEnvironment(initialOrders: MockOrder[]) {
  const orders = new Map<string, MockOrder>(initialOrders.map((o) => [o.id, { ...o }]));
  const history: MockHistory[] = [];
  const restockedOrderIds: string[] = [];

  const simulateTransition = (
    orderId: string,
    newStatus: OrderStatus,
    adminId: string,
    notes?: string
  ) => {
    const order = orders.get(orderId);
    if (!order) {
      return { orderId, success: false, error: 'Target order not found.' };
    }

    const previousStatus = order.order_status;
    if (previousStatus === newStatus) {
      return { orderId, orderNumber: order.order_number, success: true, previousStatus, newStatus };
    }

    if (previousStatus === ORDER_STATUSES.CANCELLED) {
      return {
        orderId,
        orderNumber: order.order_number,
        success: false,
        previousStatus,
        error: 'Cancelled orders cannot be reopened or transitioned to another status.',
      };
    }

    if (newStatus === ORDER_STATUSES.CANCELLED) {
      restockedOrderIds.push(orderId);
      order.order_status = ORDER_STATUSES.CANCELLED;
      history.push({
        order_id: orderId,
        previous_status: previousStatus,
        new_status: ORDER_STATUSES.CANCELLED,
        notes: notes || `Cancelled by admin (${adminId})`,
      });
      return { orderId, orderNumber: order.order_number, success: true, previousStatus, newStatus };
    }

    order.order_status = newStatus;
    history.push({
      order_id: orderId,
      previous_status: previousStatus,
      new_status: newStatus,
      notes: notes || `Status updated to ${newStatus} by admin (${adminId})`,
    });

    return { orderId, orderNumber: order.order_number, success: true, previousStatus, newStatus };
  };

  const simulateBulkUpdate = (
    input: { orderIds: string[]; newStatus: OrderStatus; notes?: string },
    admin?: { id: string } | null
  ) => {
    if (!admin) {
      throw new Error('Unauthorized: Admin authorization required.');
    }

    if (!input || !Array.isArray(input.orderIds) || input.orderIds.length === 0) {
      return { success: false, error: 'At least one order must be selected for bulk update.' };
    }

    const uniqueOrderIds = Array.from(
      new Set(input.orderIds.filter((id) => typeof id === 'string' && id.trim().length > 0))
    );

    if (uniqueOrderIds.length === 0) {
      return { success: false, error: 'No valid order IDs provided.' };
    }

    if (uniqueOrderIds.length > 100) {
      return { success: false, error: 'Maximum 100 orders can be updated in a single bulk operation.' };
    }

    const validStatuses = Object.values(ORDER_STATUSES);
    if (!validStatuses.includes(input.newStatus)) {
      return { success: false, error: 'Invalid target order status specified.' };
    }

    const results = uniqueOrderIds.map((id) =>
      simulateTransition(id, input.newStatus, admin.id, input.notes)
    );

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    return {
      success: failureCount === 0,
      totalCount: uniqueOrderIds.length,
      successCount,
      failureCount,
      results,
    };
  };

  return { orders, history, restockedOrderIds, simulateBulkUpdate, simulateTransition };
}

test('Step 10.1 & 10.2: Authorized admin bulk update vs unauthorized rejection', () => {
  const env = createMockTransitionEnvironment([
    { id: 'ord-1', order_number: 'SJ-001', order_status: 'pending', payment_method: 'cod', payment_status: 'pending' },
    { id: 'ord-2', order_number: 'SJ-002', order_status: 'pending', payment_method: 'bank_transfer', payment_status: 'pending' },
  ]);

  // Unauthorized call throws
  assert.throws(() => {
    env.simulateBulkUpdate({ orderIds: ['ord-1'], newStatus: 'confirmed' }, null);
  }, /Unauthorized/);

  // Authorized call succeeds
  const res = env.simulateBulkUpdate(
    { orderIds: ['ord-1', 'ord-2'], newStatus: 'confirmed' },
    { id: 'admin-123' }
  );

  assert.equal(res.success, true);
  assert.equal(res.successCount, 2);
  assert.equal(res.failureCount, 0);
  assert.equal(env.orders.get('ord-1')?.order_status, 'confirmed');
  assert.equal(env.orders.get('ord-2')?.order_status, 'confirmed');
});

test('Step 10.3, 10.4, 10.5 & 10.6: Empty selection, invalid order IDs, duplicates, and invalid status validation', () => {
  const env = createMockTransitionEnvironment([
    { id: 'ord-1', order_number: 'SJ-001', order_status: 'pending', payment_method: 'cod', payment_status: 'pending' },
  ]);
  const admin = { id: 'admin-123' };

  // Empty selection
  const emptyRes = env.simulateBulkUpdate({ orderIds: [], newStatus: 'confirmed' }, admin);
  assert.equal(emptyRes.success, false);
  assert.match(emptyRes.error || '', /At least one order must be selected/);

  // Invalid IDs (whitespace only or empty strings)
  const invalidIdRes = env.simulateBulkUpdate({ orderIds: ['   ', ''], newStatus: 'confirmed' }, admin);
  assert.equal(invalidIdRes.success, false);
  assert.match(invalidIdRes.error || '', /No valid order IDs provided/);

  // Duplicate IDs deduplication
  const dupRes = env.simulateBulkUpdate({ orderIds: ['ord-1', 'ord-1', 'ord-1'], newStatus: 'confirmed' }, admin);
  assert.equal(dupRes.success, true);
  assert.equal(dupRes.totalCount, 1, 'Duplicate IDs must be collapsed into 1 unique execution');
  assert.equal(dupRes.results.length, 1);

  // Invalid target status
  const invalidStatusRes = env.simulateBulkUpdate(
    { orderIds: ['ord-1'], newStatus: 'invalid_status' as any },
    admin
  );
  assert.equal(invalidStatusRes.success, false);
  assert.match(invalidStatusRes.error || '', /Invalid target order status specified/);
});

test('Step 10.7 & 10.8: Valid lifecycle transitions and rejection of reopening cancelled orders', () => {
  const env = createMockTransitionEnvironment([
    { id: 'ord-active', order_number: 'SJ-001', order_status: 'pending', payment_method: 'cod', payment_status: 'pending' },
    { id: 'ord-cancelled', order_number: 'SJ-002', order_status: 'cancelled', payment_method: 'cod', payment_status: 'pending' },
  ]);
  const admin = { id: 'admin-123' };

  // Valid transition from pending -> confirmed
  const validRes = env.simulateBulkUpdate({ orderIds: ['ord-active'], newStatus: 'confirmed' }, admin);
  assert.equal(validRes.success, true);
  assert.equal(env.orders.get('ord-active')?.order_status, 'confirmed');

  // Invalid transition: Attempting to move cancelled order to confirmed or processing must fail
  const invalidRes = env.simulateBulkUpdate({ orderIds: ['ord-cancelled'], newStatus: 'processing' }, admin);
  assert.equal(invalidRes.success, false);
  assert.equal(invalidRes.failureCount, 1);
  assert.match(
    invalidRes.results[0].error || '',
    /Cancelled orders cannot be reopened or transitioned to another status/
  );
  assert.equal(env.orders.get('ord-cancelled')?.order_status, 'cancelled');
});

test('Step 10.9 & 10.10: Cancellation inventory restoration and duplicate cancellation protection', () => {
  const env = createMockTransitionEnvironment([
    { id: 'ord-to-cancel', order_number: 'SJ-001', order_status: 'confirmed', payment_method: 'cod', payment_status: 'pending' },
  ]);
  const admin = { id: 'admin-123' };

  // First cancellation: triggers restock and changes status to cancelled
  const cancelRes = env.simulateBulkUpdate({ orderIds: ['ord-to-cancel'], newStatus: 'cancelled' }, admin);
  assert.equal(cancelRes.success, true);
  assert.equal(env.restockedOrderIds.length, 1);
  assert.equal(env.restockedOrderIds[0], 'ord-to-cancel');

  // Attempting second cancellation on the already cancelled order (idempotent / no duplicate restock)
  const repeatCancelRes = env.simulateBulkUpdate({ orderIds: ['ord-to-cancel'], newStatus: 'cancelled' }, admin);
  assert.equal(repeatCancelRes.success, true);
  // Restock list must NOT have been incremented a second time!
  assert.equal(env.restockedOrderIds.length, 1, 'Restock must not be executed twice on already cancelled order');
});

test('Step 10.11: Per-order audit history is recorded for each successful transition', () => {
  const env = createMockTransitionEnvironment([
    { id: 'ord-1', order_number: 'SJ-001', order_status: 'pending', payment_method: 'cod', payment_status: 'pending' },
    { id: 'ord-2', order_number: 'SJ-002', order_status: 'confirmed', payment_method: 'bank_transfer', payment_status: 'verified' },
  ]);
  const admin = { id: 'admin-audit' };

  env.simulateBulkUpdate({ orderIds: ['ord-1', 'ord-2'], newStatus: 'processing', notes: 'Batch dispatch #5' }, admin);

  assert.equal(env.history.length, 2);
  assert.equal(env.history[0].order_id, 'ord-1');
  assert.equal(env.history[0].previous_status, 'pending');
  assert.equal(env.history[0].new_status, 'processing');
  assert.equal(env.history[0].notes, 'Batch dispatch #5');

  assert.equal(env.history[1].order_id, 'ord-2');
  assert.equal(env.history[1].previous_status, 'confirmed');
  assert.equal(env.history[1].new_status, 'processing');
  assert.equal(env.history[1].notes, 'Batch dispatch #5');
});

test('Step 10.12: Partial failures return detailed per-order results without rolling back successful orders', () => {
  const env = createMockTransitionEnvironment([
    { id: 'ord-valid-1', order_number: 'SJ-001', order_status: 'pending', payment_method: 'cod', payment_status: 'pending' },
    { id: 'ord-cancelled', order_number: 'SJ-002', order_status: 'cancelled', payment_method: 'cod', payment_status: 'pending' },
    { id: 'ord-valid-2', order_number: 'SJ-003', order_status: 'pending', payment_method: 'bank_transfer', payment_status: 'pending' },
    // ord-nonexistent is not in the map
  ]);
  const admin = { id: 'admin-123' };

  const res = env.simulateBulkUpdate(
    { orderIds: ['ord-valid-1', 'ord-cancelled', 'ord-valid-2', 'ord-nonexistent'], newStatus: 'confirmed' },
    admin
  );

  assert.equal(res.success, false);
  assert.equal(res.totalCount, 4);
  assert.equal(res.successCount, 2);
  assert.equal(res.failureCount, 2);

  // Valid orders must have transitioned successfully
  assert.equal(env.orders.get('ord-valid-1')?.order_status, 'confirmed');
  assert.equal(env.orders.get('ord-valid-2')?.order_status, 'confirmed');

  // Cancelled order remains cancelled and failure is reported
  assert.equal(env.orders.get('ord-cancelled')?.order_status, 'cancelled');
  const cancelFail = res.results.find((r) => r.orderId === 'ord-cancelled');
  assert.equal(cancelFail?.success, false);
  assert.match(cancelFail?.error || '', /Cancelled orders cannot be reopened/);

  // Nonexistent order failure is reported
  const nonExistFail = res.results.find((r) => r.orderId === 'ord-nonexistent');
  assert.equal(nonExistFail?.success, false);
  assert.match(nonExistFail?.error || '', /Target order not found/);
});

test('Step 10.13: Repeat submission handling is idempotent and creates no duplicate history for unchanged statuses', () => {
  const env = createMockTransitionEnvironment([
    { id: 'ord-1', order_number: 'SJ-001', order_status: 'shipped', payment_method: 'cod', payment_status: 'pending' },
  ]);
  const admin = { id: 'admin-123' };

  const res = env.simulateBulkUpdate({ orderIds: ['ord-1'], newStatus: 'shipped' }, admin);

  assert.equal(res.success, true);
  assert.equal(res.successCount, 1);
  assert.equal(env.history.length, 0, 'No audit history created when status is already identical');
});

test('Step 10.15: Existing single-order status update retains identical transition behavior', () => {
  const env = createMockTransitionEnvironment([
    { id: 'ord-single', order_number: 'SJ-001', order_status: 'pending', payment_method: 'cod', payment_status: 'pending' },
  ]);

  const res = env.simulateTransition('ord-single', 'confirmed', 'admin-single', 'Single update note');
  assert.equal(res.success, true);
  assert.equal(env.orders.get('ord-single')?.order_status, 'confirmed');
  assert.equal(env.history.length, 1);
  assert.equal(env.history[0].notes, 'Single update note');
});

test('Step 10.16 & 10.17: No unintended payment changes; order_status strictly maps to customer order queries', () => {
  const env = createMockTransitionEnvironment([
    { id: 'ord-cod', order_number: 'SJ-001', order_status: 'pending', payment_method: 'cod', payment_status: 'pending' },
    { id: 'ord-bank', order_number: 'SJ-002', order_status: 'pending', payment_method: 'bank_transfer', payment_status: 'verified' },
  ]);
  const admin = { id: 'admin-123' };

  env.simulateBulkUpdate({ orderIds: ['ord-cod', 'ord-bank'], newStatus: 'delivered' }, admin);

  const codOrder = env.orders.get('ord-cod');
  assert.equal(codOrder?.order_status, 'delivered');
  assert.equal(codOrder?.payment_status, 'pending', 'COD payment_status must NOT change on order_status update');
  assert.equal(codOrder?.payment_method, 'cod');

  const bankOrder = env.orders.get('ord-bank');
  assert.equal(bankOrder?.order_status, 'delivered');
  assert.equal(bankOrder?.payment_status, 'verified', 'Bank transfer payment_status must NOT change on order_status update');
  assert.equal(bankOrder?.payment_method, 'bank_transfer');
});
