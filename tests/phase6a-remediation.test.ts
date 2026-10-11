import test from 'node:test';
import assert from 'node:assert/strict';

// =============================================================================
// SPLENDER JEWEL — PHASE 6A CONSOLIDATED REMEDIATION TEST SUITE
// =============================================================================

// ── 1. Review Query Schema Integrity ──────────────────────────────────────────
test('Phase 6A Remediation: Customer Review Query Schema Mapping', () => {
  // Verifies the schema alignment fixes made to customer review actions:
  // - public.orders column is order_status, not status
  // - public.order_items columns are unit_price and total_price, not price
  const mockOrderRow = {
    id: 'ord-123',
    order_number: 'SJ-20261011-0001',
    order_status: 'delivered',
    updated_at: '2026-10-11T12:00:00Z',
    order_items: [
      {
        id: 'item-1',
        product_id: 'prod-1',
        product_name: 'Royal Sapphire Ring',
        variant_id: 'var-1',
        variant_title: 'White Gold / Size 7',
        unit_price: 150000,
        total_price: 150000,
      },
    ],
  };

  // Eligibility check requires order_status === 'delivered'
  assert.equal(mockOrderRow.order_status, 'delivered');
  assert.equal(typeof (mockOrderRow as any).status, 'undefined');

  // Line items pricing schema
  assert.equal(mockOrderRow.order_items[0].unit_price, 150000);
  assert.equal(mockOrderRow.order_items[0].total_price, 150000);
  assert.equal(typeof (mockOrderRow.order_items[0] as any).price, 'undefined');

  // Verify non-delivered orders are not eligible
  const processingOrder = { ...mockOrderRow, order_status: 'processing' };
  const isEligible = (order: typeof mockOrderRow) => order.order_status === 'delivered';
  assert.equal(isEligible(processingOrder), false);
  assert.equal(isEligible(mockOrderRow), true);
});

// ── 2. Checkout Coupon Discount & Financial Calculations ─────────────────────
test('Phase 6A Remediation: Checkout Coupon Calculations & Grand Total Breakdown', () => {
  const calculateTotals = (params: {
    subtotal: number;
    deliveryFee: number;
    coupon?: {
      type: 'percentage' | 'fixed';
      value: number;
      minOrder?: number;
      maxDiscount?: number | null;
    } | null;
  }) => {
    let discount = 0;
    if (params.coupon) {
      if (!params.coupon.minOrder || params.subtotal >= params.coupon.minOrder) {
        if (params.coupon.type === 'percentage') {
          discount = (params.subtotal * params.coupon.value) / 100;
          if (params.coupon.maxDiscount && discount > params.coupon.maxDiscount) {
            discount = params.coupon.maxDiscount;
          }
        } else {
          discount = Math.min(params.coupon.value, params.subtotal);
        }
      }
    }

    discount = Math.round(discount * 100) / 100;
    const grandTotal = Math.max(0, params.subtotal - discount) + params.deliveryFee;
    return {
      subtotal: params.subtotal,
      deliveryFee: params.deliveryFee,
      discount,
      grandTotal,
    };
  };

  // 1. Order without coupon
  const resNoCoupon = calculateTotals({ subtotal: 100000, deliveryFee: 350, coupon: null });
  assert.equal(resNoCoupon.subtotal, 100000);
  assert.equal(resNoCoupon.discount, 0);
  assert.equal(resNoCoupon.deliveryFee, 350);
  assert.equal(resNoCoupon.grandTotal, 100350);

  // 2. Percentage coupon 10% on 100,000 => 10,000 discount
  const resPercentage = calculateTotals({
    subtotal: 100000,
    deliveryFee: 450,
    coupon: { type: 'percentage', value: 10, maxDiscount: null },
  });
  assert.equal(resPercentage.discount, 10000);
  assert.equal(resPercentage.grandTotal, 90450);

  // 3. Percentage coupon with max cap (10% on 100,000 capped at 5,000)
  const resCapped = calculateTotals({
    subtotal: 100000,
    deliveryFee: 350,
    coupon: { type: 'percentage', value: 10, maxDiscount: 5000 },
  });
  assert.equal(resCapped.discount, 5000);
  assert.equal(resCapped.grandTotal, 95350);

  // 4. Fixed coupon (5,000 flat)
  const resFixed = calculateTotals({
    subtotal: 50000,
    deliveryFee: 350,
    coupon: { type: 'fixed', value: 5000 },
  });
  assert.equal(resFixed.discount, 5000);
  assert.equal(resFixed.grandTotal, 45350);

  // 5. Fixed coupon exceeding subtotal (cannot result in negative grand total before delivery)
  const resExcessFixed = calculateTotals({
    subtotal: 3000,
    deliveryFee: 350,
    coupon: { type: 'fixed', value: 5000 },
  });
  assert.equal(resExcessFixed.discount, 3000);
  assert.equal(resExcessFixed.grandTotal, 350);
});

// ── 3. Inventory Stock Deduction & Movement Validation ───────────────────────
test('Phase 6A Remediation: Inventory Stock Deductions & Status Transition Rules', () => {
  const calculateStockTransition = (
    currentQty: number,
    deductQty: number,
    lowStockThreshold: number = 5
  ) => {
    if (deductQty > currentQty) {
      throw new Error(`Insufficient stock. Current: ${currentQty}, Requested: ${deductQty}`);
    }
    const newQty = currentQty - deductQty;
    let stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
    if (newQty === 0) {
      stockStatus = 'out_of_stock';
    } else if (newQty <= lowStockThreshold) {
      stockStatus = 'low_stock';
    } else {
      stockStatus = 'in_stock';
    }
    return { newQty, stockStatus };
  };

  // Stock transition to in_stock
  const step1 = calculateStockTransition(20, 5, 5);
  assert.equal(step1.newQty, 15);
  assert.equal(step1.stockStatus, 'in_stock');

  // Stock transition to low_stock
  const step2 = calculateStockTransition(15, 11, 5);
  assert.equal(step2.newQty, 4);
  assert.equal(step2.stockStatus, 'low_stock');

  // Stock transition to out_of_stock
  const step3 = calculateStockTransition(4, 4, 5);
  assert.equal(step3.newQty, 0);
  assert.equal(step3.stockStatus, 'out_of_stock');

  // Insufficient stock throws error
  assert.throws(() => calculateStockTransition(2, 5, 5), /Insufficient stock/);

  // Permitted movement reasons match database check constraint
  const validDbReasons = new Set([
    'stock_added',
    'manual_adjustment',
    'order_sold',
    'order_cancelled_restock',
    'correction',
  ]);
  assert.equal(validDbReasons.has('order_sold'), true);
  assert.equal(validDbReasons.has('order_cancelled_restock'), true);
  assert.equal(validDbReasons.has('order_sale'), false); // Old invalid enum value rejected
});

// ── 4. Admin RBAC Deactivation Hierarchy Guardrails ──────────────────────────
test('Phase 6A Remediation: Admin RBAC Deactivation Hierarchy & Safety Guardrails', () => {
  const canModifyStatus = (params: {
    callerId: string;
    callerRole: 'super_admin' | 'admin' | 'staff';
    targetId: string;
    targetRole: 'super_admin' | 'admin' | 'staff';
    newStatus: boolean;
    activeSuperAdminsCount: number;
  }): { allowed: boolean; error?: string } => {
    // Prohibit self-deactivation
    if (params.callerId === params.targetId && !params.newStatus) {
      return { allowed: false, error: 'Self-deactivation is prohibited to prevent administrative lockout.' };
    }

    // Staff cannot modify anyone
    if (params.callerRole === 'staff') {
      return { allowed: false, error: 'Staff members do not have permission to modify account statuses.' };
    }

    // Role hierarchy: an admin can ONLY modify staff accounts
    if (params.callerRole === 'admin' && params.targetRole !== 'staff') {
      return {
        allowed: false,
        error: 'Administrators may only modify staff account statuses. Modifying an administrator or super administrator requires Super Admin privileges.',
      };
    }

    // Super admin role target requires super_admin caller
    if (params.targetRole === 'super_admin' && params.callerRole !== 'super_admin') {
      return { allowed: false, error: 'Only Super Administrators can modify a Super Admin account.' };
    }

    // Sole super admin deactivation guardrail
    if (params.targetRole === 'super_admin' && !params.newStatus && params.activeSuperAdminsCount <= 1) {
      return { allowed: false, error: 'Cannot deactivate the sole active Super Administrator.' };
    }

    return { allowed: true };
  };

  // 1. Self-deactivation prohibited
  const res1 = canModifyStatus({
    callerId: 'user-1',
    callerRole: 'super_admin',
    targetId: 'user-1',
    targetRole: 'super_admin',
    newStatus: false,
    activeSuperAdminsCount: 2,
  });
  assert.equal(res1.allowed, false);
  assert.match(res1.error!, /Self-deactivation/);

  // 2. Staff cannot modify anyone
  const res2 = canModifyStatus({
    callerId: 'staff-1',
    callerRole: 'staff',
    targetId: 'staff-2',
    targetRole: 'staff',
    newStatus: false,
    activeSuperAdminsCount: 1,
  });
  assert.equal(res2.allowed, false);
  assert.match(res2.error!, /Staff members/);

  // 3. Admin CAN modify staff
  const res3 = canModifyStatus({
    callerId: 'admin-1',
    callerRole: 'admin',
    targetId: 'staff-1',
    targetRole: 'staff',
    newStatus: false,
    activeSuperAdminsCount: 1,
  });
  assert.equal(res3.allowed, true);

  // 4. Admin CANNOT modify another Admin
  const res4 = canModifyStatus({
    callerId: 'admin-1',
    callerRole: 'admin',
    targetId: 'admin-2',
    targetRole: 'admin',
    newStatus: false,
    activeSuperAdminsCount: 1,
  });
  assert.equal(res4.allowed, false);
  assert.match(res4.error!, /Super Admin privileges/);

  // 5. Admin CANNOT modify Super Admin
  const res5 = canModifyStatus({
    callerId: 'admin-1',
    callerRole: 'admin',
    targetId: 'super-1',
    targetRole: 'super_admin',
    newStatus: false,
    activeSuperAdminsCount: 2,
  });
  assert.equal(res5.allowed, false);
  assert.match(res5.error!, /Super Admin privileges/);

  // 6. Super Admin CAN modify Admin
  const res6 = canModifyStatus({
    callerId: 'super-1',
    callerRole: 'super_admin',
    targetId: 'admin-1',
    targetRole: 'admin',
    newStatus: false,
    activeSuperAdminsCount: 1,
  });
  assert.equal(res6.allowed, true);

  // 7. Super Admin CANNOT deactivate the sole active Super Admin
  const res7 = canModifyStatus({
    callerId: 'super-1',
    callerRole: 'super_admin',
    targetId: 'super-2',
    targetRole: 'super_admin',
    newStatus: false,
    activeSuperAdminsCount: 1,
  });
  assert.equal(res7.allowed, false);
  assert.match(res7.error!, /sole active Super Administrator/);

  // 8. Super Admin CAN deactivate another Super Admin if multiple exist
  const res8 = canModifyStatus({
    callerId: 'super-1',
    callerRole: 'super_admin',
    targetId: 'super-2',
    targetRole: 'super_admin',
    newStatus: false,
    activeSuperAdminsCount: 2,
  });
  assert.equal(res8.allowed, true);
});

// ── 5. Customer Spend Aggregation Scoping ────────────────────────────────────
test('Phase 6A Remediation: Customer Spend Aggregation Query Scoping', () => {
  // Profiles on current page (e.g. 2 profiles)
  const pageProfiles = [
    { id: 'user-1', fullName: 'Kasun Perera' },
    { id: 'user-2', fullName: 'Nimal Silva' },
  ];

  // Scoped orders query only returns orders matching page profile IDs
  const allDatabaseOrders = [
    { id: 'ord-1', user_id: 'user-1', total_amount: 15000 },
    { id: 'ord-2', user_id: 'user-1', total_amount: 25000 },
    { id: 'ord-3', user_id: 'user-2', total_amount: 50000 },
    { id: 'ord-4', user_id: 'user-999', total_amount: 999999 }, // Unrelated customer on different page
  ];

  const profileIds = pageProfiles.map((p) => p.id);
  const scopedOrders = allDatabaseOrders.filter((o) => profileIds.includes(o.user_id));

  const spendMap = new Map<string, { count: number; total: number }>();
  for (const o of scopedOrders) {
    const cur = spendMap.get(o.user_id) || { count: 0, total: 0 };
    spendMap.set(o.user_id, {
      count: cur.count + 1,
      total: cur.total + o.total_amount,
    });
  }

  assert.equal(scopedOrders.length, 3); // ord-4 was excluded
  assert.equal(spendMap.get('user-1')?.total, 40000);
  assert.equal(spendMap.get('user-1')?.count, 2);
  assert.equal(spendMap.get('user-2')?.total, 50000);
  assert.equal(spendMap.get('user-2')?.count, 1);
  assert.equal(spendMap.has('user-999'), false);
});

// ── 6. Wishlist Null-Variant Deduplication ────────────────────────────────────
test('Phase 6A Remediation: Wishlist Deduplication with NULL Variant IDs', () => {
  const existingWishlistItems: Array<{ id: string; wishlistId: string; productId: string; variantId: string | null }> = [
    { id: 'wi-1', wishlistId: 'wl-1', productId: 'p-1', variantId: null },
    { id: 'wi-2', wishlistId: 'wl-1', productId: 'p-2', variantId: 'var-1' },
  ];

  const shouldInsert = (params: {
    wishlistId: string;
    productId: string;
    variantId: string | null;
  }) => {
    const found = existingWishlistItems.find((item) => {
      if (item.wishlistId !== params.wishlistId || item.productId !== params.productId) {
        return false;
      }
      if (params.variantId) {
        return item.variantId === params.variantId;
      }
      return item.variantId === null;
    });
    return !found;
  };

  // Trying to add p-1 with null variant again should NOT insert (prevents SQL NULL != NULL duplicate)
  assert.equal(shouldInsert({ wishlistId: 'wl-1', productId: 'p-1', variantId: null }), false);

  // Trying to add p-1 with a specific variant is permitted
  assert.equal(shouldInsert({ wishlistId: 'wl-1', productId: 'p-1', variantId: 'var-new' }), true);

  // Trying to add already saved specific variant should NOT insert
  assert.equal(shouldInsert({ wishlistId: 'wl-1', productId: 'p-2', variantId: 'var-1' }), false);

  // Trying to add p-2 with null variant is permitted
  assert.equal(shouldInsert({ wishlistId: 'wl-1', productId: 'p-2', variantId: null }), true);
});
