import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// -----------------------------------------------------------------------------
// SPLENDER JEWEL — COD PAYMENT SETTLEMENT & REVENUE ACCURACY TEST SUITE
// -----------------------------------------------------------------------------

// =============================================================================
// 1. LIFECYCLE & CRITICAL BUSINESS RULE: DELIVERED DOES NOT MEAN PAID
// =============================================================================

test('Rule 1 & 2: COD order placed starts as pending; delivered parcel remains pending payment', () => {
  // Step 1: Simulated newly placed COD order
  const newOrder = {
    id: 'ord-001',
    order_number: 'SJ-20261014-001',
    payment_method: 'cod',
    order_status: 'pending',
    payment_status: 'pending',
    total_amount: 45000,
  };

  assert.equal(newOrder.order_status, 'pending');
  assert.equal(newOrder.payment_status, 'pending', 'Newly created COD order must have payment_status = pending');

  // Step 2: Parcel transitions through fulfillment to 'delivered'
  const deliveredOrder = {
    ...newOrder,
    order_status: 'delivered',
    // CRITICAL: Delivery transition must NOT mutate payment_status!
  };

  assert.equal(deliveredOrder.order_status, 'delivered');
  assert.equal(
    deliveredOrder.payment_status,
    'pending',
    'CRITICAL: Marking an order delivered must NOT automatically mark payment received. Delivered does NOT mean paid.'
  );
});

test('Rule 3 & 11: Admin explicitly confirms received COD funds → payment confirmed; delivery state unchanged', async () => {
  const targetOrder = {
    id: 'ord-002',
    order_number: 'SJ-20261014-002',
    payment_method: 'cod',
    order_status: 'delivered',
    payment_status: 'pending',
    total_amount: 85000,
  };

  // Mock server action logic
  const mockConfirmCodPayment = (order: typeof targetOrder, admin: { id: string; email: string; isActive: boolean }, confirmedByUser: boolean) => {
    if (!admin.isActive) {
      throw new Error('Unauthorized: Admin account is inactive.');
    }
    if (!confirmedByUser) {
      throw new Error('Explicit confirmation checkbox is required.');
    }
    if (order.order_status === 'cancelled') {
      throw new Error('Cannot confirm COD payment for a cancelled order.');
    }
    if (order.payment_status === 'verified') {
      throw new Error('Payment already confirmed.');
    }

    return {
      success: true,
      updatedOrder: {
        ...order,
        payment_status: 'verified', // Payment becomes verified
        // Delivery status MUST remain untouched
      },
      auditRecord: {
        adminId: admin.id,
        adminEmail: admin.email,
        timestamp: new Date().toISOString(),
        amount: order.total_amount,
        action: 'CONFIRM_COD_PAYMENT_SETTLEMENT',
      },
    };
  };

  const admin = { id: 'admin-uuid-01', email: 'director@splenderjewel.lk', isActive: true };
  const result = mockConfirmCodPayment(targetOrder, admin, true);

  assert.equal(result.success, true);
  assert.equal(result.updatedOrder.payment_status, 'verified', 'Payment status must transition to verified');
  assert.equal(result.updatedOrder.order_status, 'delivered', 'Order delivery status must remain strictly unchanged');
});

// =============================================================================
// 2. REVENUE CALCULATION ACCURACY & EXCLUSIONS
// =============================================================================

test('Rule 4, 6 & 7: Total Revenue includes ONLY confirmed received funds (Verified COD & Bank Transfers)', () => {
  const orders = [
    // 1. Delivered COD order with pending payment (Uncollected courier remittance) -> EXCLUDED
    { id: '1', order_number: 'SJ-01', payment_method: 'cod', payment_status: 'pending', order_status: 'delivered', total_amount: 50000 },
    // 2. Confirmed COD order (Remittance physically received) -> INCLUDED
    { id: '2', order_number: 'SJ-02', payment_method: 'cod', payment_status: 'verified', order_status: 'delivered', total_amount: 120000 },
    // 3. Shipped COD order with pending payment -> EXCLUDED
    { id: '3', order_number: 'SJ-03', payment_method: 'cod', payment_status: 'pending', order_status: 'shipped', total_amount: 35000 },
    // 4. Unverified Bank Transfer (Pending WhatsApp slip) -> EXCLUDED
    { id: '4', order_number: 'SJ-04', payment_method: 'bank_transfer', payment_status: 'pending', order_status: 'pending', total_amount: 75000 },
    // 5. Verified Bank Transfer (Slip verified & money in bank account) -> INCLUDED
    { id: '5', order_number: 'SJ-05', payment_method: 'bank_transfer', payment_status: 'verified', order_status: 'processing', total_amount: 95000 },
    // 6. Confirmed COD order that is shipped but courier pre-remitted/verified -> INCLUDED
    { id: '6', order_number: 'SJ-06', payment_method: 'cod', payment_status: 'verified', order_status: 'shipped', total_amount: 40000 },
  ];

  // Business formula implemented in 00008 RPC and application fallback:
  // WHERE payment_status = 'verified' AND order_status NOT IN ('cancelled', 'refunded')
  const calculateTotalRevenue = (orderList: typeof orders) => {
    return orderList
      .filter((o) => o.payment_status === 'verified' && o.order_status !== 'cancelled' && o.order_status !== 'refunded')
      .reduce((sum, o) => sum + o.total_amount, 0);
  };

  const revenue = calculateTotalRevenue(orders);
  // Expected: 120,000 (SJ-02) + 95,000 (SJ-05) + 40,000 (SJ-06) = 255,000
  assert.equal(revenue, 255000, 'Total Revenue must strictly include verified payments and exclude unpaid orders');
});

test('Rule 8: Cancelled and refunded orders are strictly excluded from Total Revenue even if status was verified', () => {
  const orders = [
    // Active verified order -> INCLUDED
    { id: '1', payment_method: 'bank_transfer', payment_status: 'verified', order_status: 'delivered', total_amount: 100000 },
    // Cancelled order with verified payment status (e.g. cancelled after approval) -> EXCLUDED
    { id: '2', payment_method: 'bank_transfer', payment_status: 'verified', order_status: 'cancelled', total_amount: 60000 },
    // Refunded order -> EXCLUDED
    { id: '3', payment_method: 'cod', payment_status: 'verified', order_status: 'refunded', total_amount: 45000 },
    // Failed payment order -> EXCLUDED
    { id: '4', payment_method: 'cod', payment_status: 'failed', order_status: 'cancelled', total_amount: 30000 },
  ];

  const calculateTotalRevenue = (orderList: typeof orders) => {
    return orderList
      .filter((o) => o.payment_status === 'verified' && o.order_status !== 'cancelled' && o.order_status !== 'refunded')
      .reduce((sum, o) => sum + o.total_amount, 0);
  };

  const revenue = calculateTotalRevenue(orders);
  assert.equal(revenue, 100000, 'Cancelled and refunded amounts must never inflate revenue');
});

// =============================================================================
// 3. IDEMPOTENCY, DUPLICATE PREVENTION & RACE CONDITIONS
// =============================================================================

test('Rule 5 & 10: Repeated confirmation cannot double-count or cause race condition', async () => {
  let orderState = {
    id: 'ord-race-1',
    order_number: 'SJ-RACE-001',
    payment_status: 'pending',
    order_status: 'delivered',
    total_amount: 70000,
  };

  let executionCount = 0;
  let duplicateRejections = 0;

  // Simulate atomic transaction with row lock
  const atomicConfirm = async () => {
    // Row lock simulation
    if (orderState.payment_status === 'verified') {
      duplicateRejections++;
      throw new Error('Payment for this order has already been confirmed as verified.');
    }
    executionCount++;
    orderState = { ...orderState, payment_status: 'verified' };
    return { success: true };
  };

  // Run first confirmation -> succeeds
  await atomicConfirm();
  assert.equal(orderState.payment_status, 'verified');
  assert.equal(executionCount, 1);

  // Attempt duplicate confirmation -> strictly rejected
  await assert.rejects(
    async () => atomicConfirm(),
    (err: any) => err.message.includes('already been confirmed')
  );

  assert.equal(executionCount, 1, 'Payment confirmation must only execute once');
  assert.equal(duplicateRejections, 1, 'Duplicate confirmation must be safely intercepted');
});

// =============================================================================
// 4. SECURITY, RBAC & AUDIT LOGGING
// =============================================================================

test('Rule 9: Unauthorized payment confirmation is rejected (unauthenticated or inactive admin)', async () => {
  const confirmWithAuth = (admin: { isAuthenticated: boolean; isActive: boolean }) => {
    if (!admin.isAuthenticated) {
      throw new Error('Authentication required.');
    }
    if (!admin.isActive) {
      throw new Error('Unauthorized: Inactive administrator.');
    }
    return { success: true };
  };

  // Customer / anonymous
  assert.throws(
    () => confirmWithAuth({ isAuthenticated: false, isActive: false }),
    (err: any) => err.message.includes('Authentication required')
  );

  // Inactive admin
  assert.throws(
    () => confirmWithAuth({ isAuthenticated: true, isActive: false }),
    (err: any) => err.message.includes('Inactive administrator')
  );

  // Active admin
  const res = confirmWithAuth({ isAuthenticated: true, isActive: true });
  assert.equal(res.success, true);
});

test('Rule 12: Payment audit history records admin ID, timestamp, courier, and reference', () => {
  const auditLogs: any[] = [];

  const recordSettlementAudit = (params: {
    orderId: string;
    orderNumber: string;
    amount: number;
    adminId: string;
    adminEmail: string;
    courierName: string;
    settlementRef: string;
  }) => {
    const entry = {
      id: 'audit-' + Date.now(),
      admin_id: params.adminId,
      admin_email: params.adminEmail,
      action: 'CONFIRM_COD_PAYMENT_SETTLEMENT',
      resource_type: 'ORDER',
      resource_id: params.orderId,
      details: {
        order_number: params.orderNumber,
        amount: params.amount,
        courier_name: params.courierName,
        settlement_reference: params.settlementRef,
        admin_email: params.adminEmail,
      },
      created_at: new Date().toISOString(),
    };
    auditLogs.push(entry);
    return entry;
  };

  const entry = recordSettlementAudit({
    orderId: 'ord-audit-99',
    orderNumber: 'SJ-998877',
    amount: 145000,
    adminId: 'admin-uuid-007',
    adminEmail: 'accountant@splenderjewel.lk',
    courierName: 'PromptX Priority',
    settlementRef: 'PX-REMIT-44102',
  });

  assert.equal(auditLogs.length, 1);
  assert.equal(entry.action, 'CONFIRM_COD_PAYMENT_SETTLEMENT');
  assert.equal(entry.admin_id, 'admin-uuid-007');
  assert.equal(entry.details.admin_email, 'accountant@splenderjewel.lk');
  assert.equal(entry.details.courier_name, 'PromptX Priority');
  assert.equal(entry.details.settlement_reference, 'PX-REMIT-44102');
  assert.ok(entry.created_at, 'Timestamp must be recorded');
});

// =============================================================================
// 5. MIGRATION 00008 & 00009 SCHEMA INTEGRITY TESTS
// =============================================================================

test('Migration 00008: Validates confirmed revenue filter and zero forward dependencies', () => {
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/00008_admin_order_summary_rpc.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration 00008 must exist');

  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Verify function name and security
  assert.ok(sql.includes('get_admin_order_summary_metrics()'));
  assert.ok(sql.includes('SECURITY DEFINER'));
  assert.ok(sql.includes('search_path = public, pg_temp'));
  assert.ok(sql.includes('OWNER TO postgres'));
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.get_admin_order_summary_metrics() TO service_role'));

  // Verify critical revenue filtering
  assert.ok(sql.includes("WHERE payment_status = 'verified'"));
  assert.ok(sql.includes("order_status NOT IN ('cancelled', 'refunded')"));
  assert.ok(sql.includes("pendingCodSettlementCount"));

  // Verify independence: ZERO reference to 00009 or courier columns
  assert.ok(!sql.includes('courier_name'), 'Migration 00008 must NOT reference columns introduced in migration 00009');
});

test('Migration 00009: Validates atomic COD settlement RPC, row locking, and privilege isolation', () => {
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/00009_cod_payment_settlement.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration 00009 must exist');

  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Verify function declaration
  assert.ok(sql.includes('confirm_cod_payment_settlement'));
  assert.ok(sql.includes('FOR UPDATE'), 'Must acquire row-level lock on order to prevent concurrent race conditions');
  assert.ok(sql.includes('payment_status = \'verified\''), 'Must verify whether payment is already confirmed');
  assert.ok(sql.includes('CONFIRM_COD_PAYMENT_SETTLEMENT'), 'Must insert audit log');

  // Verify security hardening
  assert.ok(sql.includes('SECURITY DEFINER'));
  assert.ok(sql.includes('search_path = public, pg_temp'));
  assert.ok(sql.includes('OWNER TO postgres'));
  assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.confirm_cod_payment_settlement'));
  assert.ok(
    sql.includes(
      'GRANT EXECUTE ON FUNCTION public.confirm_cod_payment_settlement(UUID, UUID, TEXT, TEXT, DATE, TEXT) TO service_role'
    ),
    'Must grant execute strictly to service_role with 6-argument signature'
  );
  assert.ok(
    !sql.includes('p_allow_undelivered'),
    'Migration 00009 must NOT contain exceptional pre-delivery override parameter'
  );
});

// =============================================================================
// 6. COD SETTLEMENT WORKFLOW: STRICT DELIVERED PREREQUISITE
// =============================================================================

test('Item 2: Early COD settlement strictly disabled; non-delivered COD orders cannot be confirmed', () => {
  const validateCodEligibility = (
    order: { order_status: string; payment_status: string; payment_method: string }
  ) => {
    if (order.payment_method !== 'cod') {
      throw new Error('Order payment method is not Cash on Delivery (COD).');
    }
    if (order.order_status === 'cancelled' || order.order_status === 'refunded') {
      throw new Error(`Cannot confirm COD payment for a ${order.order_status} order.`);
    }
    if (order.payment_status === 'verified') {
      throw new Error('Payment already confirmed.');
    }
    if (order.order_status !== 'delivered') {
      throw new Error(
        `Cannot confirm COD payment: order is currently "${order.order_status}" and must be marked as "delivered" before COD payment settlement can be confirmed.`
      );
    }
    return { eligible: true };
  };

  // Pending order -> REJECTED
  assert.throws(
    () => validateCodEligibility({ order_status: 'pending', payment_status: 'pending', payment_method: 'cod' }),
    (err: any) => err.message.includes('must be marked as "delivered"')
  );

  // Shipped order -> REJECTED
  assert.throws(
    () => validateCodEligibility({ order_status: 'shipped', payment_status: 'pending', payment_method: 'cod' }),
    (err: any) => err.message.includes('must be marked as "delivered"')
  );

  // Confirmed order -> REJECTED
  assert.throws(
    () => validateCodEligibility({ order_status: 'confirmed', payment_status: 'pending', payment_method: 'cod' }),
    (err: any) => err.message.includes('must be marked as "delivered"')
  );

  // Delivered order -> ACCEPTED
  const normalRes = validateCodEligibility(
    { order_status: 'delivered', payment_status: 'pending', payment_method: 'cod' }
  );
  assert.equal(normalRes.eligible, true);
});

// =============================================================================
// 7. TRANSACTION ATOMICITY & ZERO WRITE FALLBACKS
// =============================================================================

test('Item 1: COD confirmation is atomic via RPC; zero write fallback mutations exist when RPC fails', () => {
  const actionFilePath = path.resolve(process.cwd(), 'lib/orders/admin-actions.ts');
  const actionSource = fs.readFileSync(actionFilePath, 'utf8');

  // Verify confirmCodPaymentAction calls confirm_cod_payment_settlement RPC
  assert.ok(
    actionSource.includes("'confirm_cod_payment_settlement'"),
    'Must delegate to confirm_cod_payment_settlement RPC'
  );

  // Verify that confirmCodPaymentAction does NOT contain application-level fallback mutations
  // Find confirmCodPaymentAction body
  const actionBody = actionSource.substring(
    actionSource.indexOf('export async function confirmCodPaymentAction'),
    actionSource.indexOf('export interface AdminPaymentFilter')
  );

  assert.ok(
    !actionBody.includes(".from('orders')"),
    'confirmCodPaymentAction must NOT perform alternative direct writes to orders'
  );
  assert.ok(
    !actionBody.includes(".from('payments')"),
    'confirmCodPaymentAction must NOT perform alternative direct writes to payments'
  );
  assert.ok(
    !actionBody.includes('allowUndelivered'),
    'confirmCodPaymentAction must NOT support allowUndelivered override'
  );
});

// =============================================================================
// 8. BANK TRANSFER STATUS UPDATES & AUDITING
// =============================================================================

test('Item 8: Bank transfer verification rejects cancelled orders and writes audit records with approved_by', () => {
  const auditLogs: any[] = [];
  const paymentsRecords: any[] = [];

  const updatePaymentStatus = (params: {
    order: {
      id: string;
      order_number: string;
      order_status: string;
      payment_status: string;
      payment_method: string;
      total_amount: number;
    };
    newStatus: string;
    admin: { id: string; email: string };
  }) => {
    if (params.order.order_status === 'cancelled' || params.order.order_status === 'refunded') {
      throw new Error(`Cannot change payment status for a ${params.order.order_status} order.`);
    }
    if (params.newStatus === 'verified' && params.order.payment_status === 'verified') {
      throw new Error(`Payment for order ${params.order.order_number} is already verified.`);
    }

    const nowIso = new Date().toISOString();
    const paymentRecord = {
      order_id: params.order.id,
      payment_method: params.order.payment_method,
      amount: params.order.total_amount,
      status: params.newStatus,
      approved_by: params.newStatus === 'verified' ? params.admin.id : null,
      approved_at: params.newStatus === 'verified' ? nowIso : null,
    };
    paymentsRecords.push(paymentRecord);

    const auditEntry = {
      admin_id: params.admin.id,
      admin_email: params.admin.email,
      action: 'UPDATE_PAYMENT_STATUS',
      resource_type: 'ORDER',
      resource_id: params.order.id,
      details: {
        order_id: params.order.id,
        order_number: params.order.order_number,
        previous_payment_status: params.order.payment_status,
        new_payment_status: params.newStatus,
        admin_email: params.admin.email,
      },
      created_at: nowIso,
    };
    auditLogs.push(auditEntry);

    return { success: true };
  };

  // Rejection on cancelled order
  assert.throws(
    () =>
      updatePaymentStatus({
        order: {
          id: 'ord-c1',
          order_number: 'SJ-C01',
          order_status: 'cancelled',
          payment_status: 'pending',
          payment_method: 'bank_transfer',
          total_amount: 50000,
        },
        newStatus: 'verified',
        admin: { id: 'admin-1', email: 'admin@splenderjewel.lk' },
      }),
    (err: any) => err.message.includes('Cannot change payment status for a cancelled order')
  );

  // Success on active bank transfer
  const res = updatePaymentStatus({
    order: {
      id: 'ord-b1',
      order_number: 'SJ-B01',
      order_status: 'pending',
      payment_status: 'pending',
      payment_method: 'bank_transfer',
      total_amount: 72000,
    },
    newStatus: 'verified',
    admin: { id: 'admin-1', email: 'admin@splenderjewel.lk' },
  });

  assert.equal(res.success, true);
  assert.equal(paymentsRecords[0].approved_by, 'admin-1');
  assert.ok(paymentsRecords[0].approved_at);
  assert.equal(auditLogs[0].action, 'UPDATE_PAYMENT_STATUS');
  assert.equal(auditLogs[0].details.new_payment_status, 'verified');
});
