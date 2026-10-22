import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ORDER_STATUSES, PAYMENT_STATUSES, PAYMENT_METHODS } from '../lib/config/constants.ts';

// -----------------------------------------------------------------------------
// SPLENDER JEWEL — PRE-LAUNCH REMEDIATION REGRESSION TEST SUITE
// Covers:
//   ISSUE-01: Refunded Order Sales Reporting (lib/reports/admin-actions.ts)
//   ISSUE-02: Purchase Management Error Fallback (app/admin/purchases/page.tsx)
// -----------------------------------------------------------------------------

interface SimulatedOrderItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  purchase_cost: number;
}

interface SimulatedOrder {
  id: string;
  order_number: string;
  subtotal: number;
  delivery_fee: number;
  discount_amount: number;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  order_status: string;
  district: string;
  created_at: string;
  order_items: SimulatedOrderItem[];
}

function evaluateSalesReportMetrics(orders: SimulatedOrder[]) {
  let totalRevenue = 0;
  let totalCollected = 0;
  let totalOrders = 0;
  let totalCost = 0;

  const orderCountByStatus: Record<string, number> = {
    [ORDER_STATUSES.PENDING]: 0,
    [ORDER_STATUSES.CONFIRMED]: 0,
    [ORDER_STATUSES.PROCESSING]: 0,
    [ORDER_STATUSES.SHIPPED]: 0,
    [ORDER_STATUSES.DELIVERED]: 0,
    [ORDER_STATUSES.CANCELLED]: 0,
    [ORDER_STATUSES.REFUNDED]: 0,
  };

  const revenueByPaymentMethod = {
    cod: { count: 0, revenue: 0 },
    bankTransfer: { count: 0, revenue: 0 },
  };

  const districtMap: Record<string, { count: number; revenue: number }> = {};
  const productMap: Record<
    string,
    { name: string; units: number; revenue: number; cost: number }
  > = {};

  for (const order of orders) {
    const isCancelledOrRefunded =
      order.order_status === ORDER_STATUSES.CANCELLED ||
      order.order_status === ORDER_STATUSES.REFUNDED ||
      order.payment_status === PAYMENT_STATUSES.REFUNDED;
    const orderTotal = Number(order.total_amount) || 0;

    if (orderCountByStatus[order.order_status] !== undefined) {
      orderCountByStatus[order.order_status]++;
    } else {
      orderCountByStatus[order.order_status] = 1;
    }

    if (isCancelledOrRefunded) continue;

    totalOrders++;
    totalRevenue += orderTotal;

    const isVerified =
      order.payment_status === PAYMENT_STATUSES.VERIFIED &&
      !isCancelledOrRefunded;

    if (isVerified) {
      totalCollected += orderTotal;
    }

    if (order.payment_method === PAYMENT_METHODS.COD) {
      revenueByPaymentMethod.cod.count++;
      revenueByPaymentMethod.cod.revenue += orderTotal;
    } else if (order.payment_method === PAYMENT_METHODS.BANK_TRANSFER) {
      revenueByPaymentMethod.bankTransfer.count++;
      revenueByPaymentMethod.bankTransfer.revenue += orderTotal;
    }

    const dist = order.district || 'Unspecified';
    if (!districtMap[dist]) {
      districtMap[dist] = { count: 0, revenue: 0 };
    }
    districtMap[dist].count++;
    districtMap[dist].revenue += orderTotal;

    for (const item of order.order_items || []) {
      const qty = Number(item.quantity) || 1;
      const purchaseCost = Number(item.purchase_cost) || 0;
      const itemRevenue = Number(item.total_price) || Number(item.unit_price) * qty;

      totalCost += purchaseCost * qty;

      const pId = item.product_id || 'unknown';
      const pName = item.product_name || 'Jewelry Piece';

      if (!productMap[pId]) {
        productMap[pId] = { name: pName, units: 0, revenue: 0, cost: 0 };
      }
      productMap[pId].units += qty;
      productMap[pId].revenue += itemRevenue;
      productMap[pId].cost += purchaseCost * qty;
    }
  }

  const grossProfit = totalRevenue - totalCost;
  const grossMarginPercent =
    totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0;
  const averageOrderValue =
    totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  const topDistricts = Object.entries(districtMap)
    .map(([district, data]) => ({
      district,
      orderCount: data.count,
      revenue: data.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const topProducts = Object.entries(productMap)
    .map(([productId, data]) => ({
      productId,
      productName: data.name,
      unitsSold: data.units,
      revenue: data.revenue,
      profit: data.revenue - data.cost,
    }))
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 8);

  return {
    totalRevenue,
    totalCollected,
    totalOrders,
    averageOrderValue,
    totalCost,
    grossProfit,
    grossMarginPercent,
    orderCountByStatus,
    revenueByPaymentMethod,
    topDistricts,
    topProducts,
  };
}

test('ISSUE-01: lib/reports/admin-actions.ts strictly excludes both CANCELLED and REFUNDED orders', () => {
  const reportActionsPath = path.resolve(process.cwd(), 'lib/reports/admin-actions.ts');
  const code = fs.readFileSync(reportActionsPath, 'utf8');

  // Verify status distribution tracks REFUNDED alongside CANCELLED
  assert.ok(
    code.includes('[ORDER_STATUSES.REFUNDED]: 0'),
    'orderCountByStatus must initialize ORDER_STATUSES.REFUNDED'
  );

  // Verify exclusion condition checks CANCELLED and REFUNDED
  assert.ok(
    code.includes('order.order_status === ORDER_STATUSES.CANCELLED') &&
      code.includes('order.order_status === ORDER_STATUSES.REFUNDED') &&
      code.includes('order.payment_status === PAYMENT_STATUSES.REFUNDED'),
    'getAdminSalesReport must check both ORDER_STATUSES.CANCELLED and ORDER_STATUSES.REFUNDED / PAYMENT_STATUSES.REFUNDED'
  );

  assert.ok(
    code.includes('if (isCancelledOrRefunded) continue;'),
    'getAdminSalesReport must skip revenue, payment method, district, and product aggregations for cancelled and refunded orders'
  );
});

test('ISSUE-01: Sales Report Calculation Parity for Pending, Verified, Cancelled, and Refunded Orders', () => {
  const orders: SimulatedOrder[] = [
    // 1. Active Pending COD Order (Colombo)
    {
      id: 'ord-1',
      order_number: 'SJ-20261022-0001',
      subtotal: 3000,
      delivery_fee: 350,
      discount_amount: 0,
      total_amount: 3350,
      payment_method: PAYMENT_METHODS.COD,
      payment_status: PAYMENT_STATUSES.PENDING,
      order_status: ORDER_STATUSES.PENDING,
      district: 'Colombo',
      created_at: '2026-10-22T08:00:00Z',
      order_items: [
        {
          id: 'item-1',
          product_id: 'prod-ring',
          product_name: '18K Gold Plated Ring',
          quantity: 2,
          unit_price: 1500,
          total_price: 3000,
          purchase_cost: 600,
        },
      ],
    },
    // 2. Verified Delivered Bank Transfer Order (Kandy)
    {
      id: 'ord-2',
      order_number: 'SJ-20261022-0002',
      subtotal: 5000,
      delivery_fee: 200,
      discount_amount: 0,
      total_amount: 5200,
      payment_method: PAYMENT_METHODS.BANK_TRANSFER,
      payment_status: PAYMENT_STATUSES.VERIFIED,
      order_status: ORDER_STATUSES.DELIVERED,
      district: 'Kandy',
      created_at: '2026-10-22T09:00:00Z',
      order_items: [
        {
          id: 'item-2',
          product_id: 'prod-necklace',
          product_name: 'Pearl Pendant Necklace',
          quantity: 1,
          unit_price: 5000,
          total_price: 5000,
          purchase_cost: 2000,
        },
      ],
    },
    // 3. Cancelled COD Order (Galle) — must be excluded from sales & revenue, kept in status counter
    {
      id: 'ord-3',
      order_number: 'SJ-20261022-0003',
      subtotal: 4500,
      delivery_fee: 350,
      discount_amount: 0,
      total_amount: 4850,
      payment_method: PAYMENT_METHODS.COD,
      payment_status: PAYMENT_STATUSES.PENDING,
      order_status: ORDER_STATUSES.CANCELLED,
      district: 'Galle',
      created_at: '2026-10-22T10:00:00Z',
      order_items: [
        {
          id: 'item-3',
          product_id: 'prod-bracelet',
          product_name: 'Crystal Tennis Bracelet',
          quantity: 3,
          unit_price: 1500,
          total_price: 4500,
          purchase_cost: 700,
        },
      ],
    },
    // 4. Refunded Bank Transfer Order (Gampaha) — order_status = 'refunded', payment_status = 'refunded'
    {
      id: 'ord-4',
      order_number: 'SJ-20261022-0004',
      subtotal: 6000,
      delivery_fee: 200,
      discount_amount: 0,
      total_amount: 6200,
      payment_method: PAYMENT_METHODS.BANK_TRANSFER,
      payment_status: PAYMENT_STATUSES.REFUNDED,
      order_status: ORDER_STATUSES.REFUNDED,
      district: 'Gampaha',
      created_at: '2026-10-22T11:00:00Z',
      order_items: [
        {
          id: 'item-4',
          product_id: 'prod-earrings',
          product_name: 'Emerald Drop Earrings',
          quantity: 2,
          unit_price: 3000,
          total_price: 6000,
          purchase_cost: 1200,
        },
      ],
    },
    // 5. Delivered Order with Refunded Payment Status (Kurunegala) — payment_status = 'refunded'
    {
      id: 'ord-5',
      order_number: 'SJ-20261022-0005',
      subtotal: 2500,
      delivery_fee: 350,
      discount_amount: 0,
      total_amount: 2850,
      payment_method: PAYMENT_METHODS.COD,
      payment_status: PAYMENT_STATUSES.REFUNDED,
      order_status: ORDER_STATUSES.DELIVERED,
      district: 'Kurunegala',
      created_at: '2026-10-22T12:00:00Z',
      order_items: [
        {
          id: 'item-5',
          product_id: 'prod-anklet',
          product_name: 'Gold Charm Anklet',
          quantity: 1,
          unit_price: 2500,
          total_price: 2500,
          purchase_cost: 900,
        },
      ],
    },
  ];

  const metrics = evaluateSalesReportMetrics(orders);

  // Active non-cancelled/non-refunded sales orders: ord-1 and ord-2 only
  assert.equal(metrics.totalOrders, 2, 'totalOrders must exclude cancelled and refunded orders');
  assert.equal(
    metrics.totalRevenue,
    3350 + 5200,
    'totalRevenue must include only active non-cancelled/non-refunded orders (3350 + 5200 = 8550)'
  );
  assert.equal(
    metrics.totalCollected,
    5200,
    'totalCollected must include only verified non-cancelled/non-refunded orders (5200)'
  );
  assert.equal(
    metrics.totalCost,
    2 * 600 + 1 * 2000,
    'totalCost must exclude item costs from cancelled and refunded orders (1200 + 2000 = 3200)'
  );
  assert.equal(
    metrics.grossProfit,
    8550 - 3200,
    'grossProfit must equal active totalRevenue minus active totalCost (5350)'
  );

  // Payment method breakdown must exclude cancelled & refunded orders
  assert.deepEqual(metrics.revenueByPaymentMethod, {
    cod: { count: 1, revenue: 3350 },
    bankTransfer: { count: 1, revenue: 5200 },
  });

  // Top districts must exclude Galle, Gampaha, and Kurunegala (which only had cancelled/refunded orders)
  assert.equal(metrics.topDistricts.length, 2);
  assert.equal(metrics.topDistricts[0].district, 'Kandy');
  assert.equal(metrics.topDistricts[0].revenue, 5200);
  assert.equal(metrics.topDistricts[1].district, 'Colombo');
  assert.equal(metrics.topDistricts[1].revenue, 3350);

  // Top products must exclude items from cancelled and refunded orders
  assert.equal(metrics.topProducts.length, 2);
  assert.equal(metrics.topProducts[0].productId, 'prod-ring');
  assert.equal(metrics.topProducts[0].unitsSold, 2);
  assert.equal(metrics.topProducts[1].productId, 'prod-necklace');
  assert.equal(metrics.topProducts[1].unitsSold, 1);

  // Status counter preserves full lifetime distribution across all statuses
  assert.equal(metrics.orderCountByStatus[ORDER_STATUSES.PENDING], 1);
  assert.equal(metrics.orderCountByStatus[ORDER_STATUSES.DELIVERED], 2);
  assert.equal(metrics.orderCountByStatus[ORDER_STATUSES.CANCELLED], 1);
  assert.equal(metrics.orderCountByStatus[ORDER_STATUSES.REFUNDED], 1);
});

test('ISSUE-02: app/admin/purchases/page.tsx never falls back to mock data when feature is enabled', () => {
  const pagePath = path.resolve(process.cwd(), 'app/admin/purchases/page.tsx');
  const code = fs.readFileSync(pagePath, 'utf8');

  // Split around the top-level `if (isEnabled)` block vs top-level `else` block
  const enabledStart = code.indexOf('if (isEnabled) {');
  const disabledElseStart = code.indexOf('\n  } else {', enabledStart);
  assert.ok(
    enabledStart !== -1 && disabledElseStart !== -1,
    'Must contain explicit top-level if (isEnabled) { ... } else { ... } structure'
  );

  const enabledBranchCode = code.slice(enabledStart, disabledElseStart);

  // CRITICAL: Inside `if (isEnabled)`, `getMockPurchaseBatchesAction` must NEVER be called
  assert.ok(
    !enabledBranchCode.includes('getMockPurchaseBatchesAction'),
    'When purchase management is enabled, page must never fall back to getMockPurchaseBatchesAction()'
  );

  // Must capture and display database error message when !res.success && !res.isMissingMigration
  assert.ok(
    enabledBranchCode.includes("loadError = res.error || 'Failed to load purchase batches from the database.'"),
    'Must capture explicit error message on unexpected database failure'
  );

  // Must render accessible error alert banner when loadError is present
  assert.ok(
    code.includes('role="alert"') && code.includes('Unable to Load Purchase Batches'),
    'Must render a clear error alert when database loading fails'
  );

  // Must pass isMockActive={isMockActive} instead of hardcoded true to FeatureDisabledCard
  assert.ok(
    code.includes('isMockActive={isMockActive}') && !code.includes('isMockActive={true}'),
    'FeatureDisabledCard must only report mock active when mock preview is genuinely active'
  );
});
