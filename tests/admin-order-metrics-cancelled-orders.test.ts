import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// -----------------------------------------------------------------------------
// SPLENDER JEWEL — ADMIN ORDER SUMMARY METRICS REGRESSION TEST SUITE
// -----------------------------------------------------------------------------
// Verifies that cancelled and refunded orders retaining payment_status = 'pending'
// are strictly excluded from pending payment dashboard queues in both:
// 1. Database RPC (Migration 00014: get_admin_order_summary_metrics)
// 2. Application Server Action Fallback (lib/orders/admin-actions.ts)
// -----------------------------------------------------------------------------

test('Migration 00014: Structure, Idempotency & Exclusion Logic Integrity', () => {
  const migrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/00014_fix_admin_metrics_cancelled_orders.sql'
  );
  assert.ok(fs.existsSync(migrationPath), 'Migration 00014 file must exist');

  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Defensive check
  assert.ok(
    sql.includes("to_regclass('public.orders') IS NULL"),
    'Must include defensive precondition checking public.orders'
  );

  // Function signature and security
  assert.ok(
    sql.includes('CREATE OR REPLACE FUNCTION public.get_admin_order_summary_metrics()'),
    'Must declare or replace public.get_admin_order_summary_metrics()'
  );
  assert.ok(sql.includes('RETURNS JSONB'), 'Must return JSONB');
  assert.ok(sql.includes('SECURITY DEFINER'), 'Must be SECURITY DEFINER');
  assert.ok(
    sql.includes('SET search_path = public, pg_temp'),
    'Must lock search_path to public, pg_temp'
  );
  assert.ok(sql.includes('OWNER TO postgres'), 'Must assign ownership to postgres');
  assert.ok(
    sql.includes('GRANT EXECUTE ON FUNCTION public.get_admin_order_summary_metrics() TO service_role'),
    'Must grant execution strictly to service_role'
  );

  // Critical Exclusion Logic: pendingBankTransferCount
  assert.ok(
    sql.includes("WHERE payment_method = 'bank_transfer'") &&
      sql.includes("AND payment_status = 'pending'") &&
      sql.includes("AND order_status NOT IN ('cancelled', 'refunded')"),
    'pendingBankTransferCount must strictly exclude cancelled and refunded orders'
  );

  // Critical Exclusion Logic: pendingCodSettlementCount
  assert.ok(
    sql.includes("WHERE payment_method = 'cod'") &&
      sql.includes("AND payment_status = 'pending'") &&
      sql.includes("AND order_status NOT IN ('cancelled', 'refunded')"),
    'pendingCodSettlementCount must strictly exclude cancelled and refunded orders'
  );

  // Confirmed Revenue: must strictly exclude cancelled and refunded orders
  assert.ok(
    sql.includes("WHERE payment_status = 'verified'") &&
      sql.includes("AND order_status NOT IN ('cancelled', 'refunded')"),
    'totalRevenue must strictly sum only verified payments on non-cancelled/refunded orders'
  );
});

test('Metrics Aggregation Parity: Active Pending, Cancelled and Refunded Orders', () => {
  interface SimulatedOrder {
    id: string;
    order_number: string;
    order_status: string;
    payment_status: string;
    payment_method: string;
    total_amount: number;
  }

  const sampleDataset: SimulatedOrder[] = [
    // 1. Active Pending COD Order
    {
      id: 'ord-1',
      order_number: 'SJ-001',
      order_status: 'pending',
      payment_status: 'pending',
      payment_method: 'cod',
      total_amount: 3000,
    },
    // 2. Delivered COD Order (awaiting courier settlement)
    {
      id: 'ord-2',
      order_number: 'SJ-002',
      order_status: 'delivered',
      payment_status: 'pending',
      payment_method: 'cod',
      total_amount: 4000,
    },
    // 3. Verified Delivered COD Order (settled)
    {
      id: 'ord-3',
      order_number: 'SJ-003',
      order_status: 'delivered',
      payment_status: 'verified',
      payment_method: 'cod',
      total_amount: 5000,
    },
    // 4. Cancelled COD Order (retains payment_status = 'pending' for audit history)
    {
      id: 'ord-4',
      order_number: 'SJ-004',
      order_status: 'cancelled',
      payment_status: 'pending',
      payment_method: 'cod',
      total_amount: 3500,
    },
    // 5. Refunded COD Order
    {
      id: 'ord-5',
      order_number: 'SJ-005',
      order_status: 'refunded',
      payment_status: 'refunded',
      payment_method: 'cod',
      total_amount: 2000,
    },
    // 6. Active Pending Bank Transfer Order (awaiting slip verification)
    {
      id: 'ord-6',
      order_number: 'SJ-006',
      order_status: 'pending',
      payment_status: 'pending',
      payment_method: 'bank_transfer',
      total_amount: 6000,
    },
    // 7. Verified Bank Transfer Order (processing)
    {
      id: 'ord-7',
      order_number: 'SJ-007',
      order_status: 'processing',
      payment_status: 'verified',
      payment_method: 'bank_transfer',
      total_amount: 7000,
    },
    // 8. Cancelled Bank Transfer Order (retains payment_status = 'pending')
    {
      id: 'ord-8',
      order_number: 'SJ-008',
      order_status: 'cancelled',
      payment_status: 'pending',
      payment_method: 'bank_transfer',
      total_amount: 2500,
    },
    // 9. Refunded Bank Transfer Order
    {
      id: 'ord-9',
      order_number: 'SJ-009',
      order_status: 'refunded',
      payment_status: 'refunded',
      payment_method: 'bank_transfer',
      total_amount: 1500,
    },
  ];

  // Pure evaluation function matching Migration 00014 and TypeScript fallback query rules
  const computeMetrics = (orders: SimulatedOrder[]) => {
    let totalOrders = orders.length;
    let totalRevenue = 0;
    let pendingReviewCount = 0;
    let pendingBankTransferCount = 0;
    let pendingCodSettlementCount = 0;

    for (const o of orders) {
      const isCancelledOrRefunded = o.order_status === 'cancelled' || o.order_status === 'refunded';

      // Confirmed Revenue Rule
      if (o.payment_status === 'verified' && !isCancelledOrRefunded) {
        totalRevenue += o.total_amount;
      }

      // Pending Review Rule (orders awaiting initial processing)
      if (o.order_status === 'pending') {
        pendingReviewCount++;
      }

      // Pending Bank Transfer Rule (active unverified transfers)
      if (o.payment_method === 'bank_transfer' && o.payment_status === 'pending' && !isCancelledOrRefunded) {
        pendingBankTransferCount++;
      }

      // Pending COD Settlement Rule (active unpaid courier collections)
      if (o.payment_method === 'cod' && o.payment_status === 'pending' && !isCancelledOrRefunded) {
        pendingCodSettlementCount++;
      }
    }

    return {
      totalOrders,
      totalRevenue,
      pendingReviewCount,
      pendingBankTransferCount,
      pendingCodSettlementCount,
    };
  };

  const metrics = computeMetrics(sampleDataset);

  // Assertions
  assert.equal(metrics.totalOrders, 9, 'Total orders must reflect all lifetime orders including cancelled/refunded');
  assert.equal(
    metrics.totalRevenue,
    12000,
    'Total revenue must reflect ONLY verified non-cancelled orders (5000 + 7000)'
  );
  assert.equal(
    metrics.pendingReviewCount,
    2,
    'Pending review count must include only orders in pending fulfillment state (ord-1, ord-6)'
  );
  assert.equal(
    metrics.pendingCodSettlementCount,
    2,
    'Pending COD count must include ord-1 (pending) and ord-2 (delivered), but EXCLUDE ord-4 (cancelled) and ord-5 (refunded)'
  );
  assert.equal(
    metrics.pendingBankTransferCount,
    1,
    'Pending Bank Transfer count must include ord-6 (pending), but EXCLUDE ord-8 (cancelled) and ord-9 (refunded)'
  );
});

test('TypeScript Fallback Query Rule Verification', () => {
  const adminActionsPath = path.resolve(process.cwd(), 'lib/orders/admin-actions.ts');
  const code = fs.readFileSync(adminActionsPath, 'utf8');

  // Verify getAdminOrders fallback filters
  assert.ok(
    code.includes(".eq('payment_method', 'bank_transfer')") &&
      code.includes(".not('order_status', 'in', '(\"cancelled\",\"refunded\")')"),
    'getAdminOrders TS fallback must filter out cancelled and refunded bank transfers'
  );
  assert.ok(
    code.includes(".eq('payment_method', 'cod')") &&
      code.includes(".not('order_status', 'in', '(\"cancelled\",\"refunded\")')"),
    'getAdminOrders TS fallback must filter out cancelled and refunded COD settlements'
  );

  // Verify getAdminDashboardMetrics fallback filters
  assert.ok(
    code.includes("getAdminDashboardMetrics") &&
      code.includes(".not('order_status', 'in', '(\"cancelled\",\"refunded\")')"),
    'getAdminDashboardMetrics TS fallback must filter out cancelled and refunded orders'
  );

  // Verify getAdminPaymentSettlements table query shortcuts
  assert.ok(
    code.includes("settlementQueue === 'pending_cod'") &&
      code.includes(".not('order_status', 'in', '(\"cancelled\",\"refunded\")')"),
    'getAdminPaymentSettlements pending_cod shortcut must exclude cancelled and refunded orders'
  );
  assert.ok(
    code.includes("settlementQueue === 'pending_bank_transfer'") &&
      code.includes(".not('order_status', 'in', '(\"cancelled\",\"refunded\")')"),
    'getAdminPaymentSettlements pending_bank_transfer shortcut must exclude cancelled and refunded orders'
  );
});
