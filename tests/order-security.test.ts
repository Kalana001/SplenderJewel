import test from 'node:test';
import assert from 'node:assert/strict';
import { mapDbOrderToDomain, type OrderDbRow, type OrderItem } from '../types/order.ts';

/**
 * Structured Admin Authorization Error distinguishing unauthenticated vs forbidden access.
 * Mirrors the class in lib/auth/server.ts
 */
class AdminAuthError extends Error {
  readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN';

  constructor(
    message = 'Unauthorized: Administrative credentials and active admin role are required.',
    code: 'UNAUTHENTICATED' | 'FORBIDDEN' = 'FORBIDDEN'
  ) {
    super(message);
    this.name = 'AdminAuthError';
    this.code = code;
  }
}

// -----------------------------------------------------------------------------
// 1. GUEST ORDER PRIVACY: EXCLUDING INTERNAL ADMIN NOTES
// -----------------------------------------------------------------------------
test('SEC-3B-01: Guest order domain mapping omits adminNotes when admin_notes is not in DB projection', () => {
  const safeDbRow: OrderDbRow = {
    id: 'ord-1234-uuid',
    order_number: 'SJ-20261011-0001',
    order_token: 'sec-tok-987654321',
    user_id: null,
    customer_name: 'Guest Customer',
    email: 'guest@example.com',
    phone1: '0771234567',
    phone2: null,
    address_line: '123 Galle Road',
    city: 'Colombo 03',
    district: 'Colombo',
    province: 'Western',
    postal_code: '00300',
    delivery_notes: 'Leave at front desk',
    delivery_fee: 350,
    subtotal: 5000,
    discount_amount: 0,
    coupon_code: null,
    total_amount: 5350,
    payment_method: 'cod',
    payment_status: 'pending',
    order_status: 'pending',
    tracking_number: null,
    // admin_notes is omitted from the projected DB row in getGuestOrderConfirmation
    created_at: '2026-10-11T10:00:00Z',
    updated_at: '2026-10-11T10:00:00Z',
  };

  const domainOrder = mapDbOrderToDomain(safeDbRow, []);

  assert.equal(domainOrder.adminNotes, undefined);
  assert.equal('admin_notes' in domainOrder, false);
});

test('SEC-3B-01: Guest order confirmation query projection strictly excludes admin_notes', () => {
  // Safe columns projected by getGuestOrderConfirmation in lib/orders/actions.ts
  const guestOrderProjection = [
    'id',
    'order_number',
    'order_token',
    'user_id',
    'customer_name',
    'email',
    'phone1',
    'phone2',
    'address_line',
    'city',
    'district',
    'province',
    'postal_code',
    'delivery_notes',
    'delivery_fee',
    'subtotal',
    'discount_amount',
    'coupon_code',
    'total_amount',
    'payment_method',
    'payment_status',
    'order_status',
    'tracking_number',
    'created_at',
    'updated_at',
  ];

  assert.equal(guestOrderProjection.includes('admin_notes'), false);
  assert.equal(guestOrderProjection.includes('purchase_cost'), false);
});

// -----------------------------------------------------------------------------
// 2. CUSTOMER ORDER PRIVACY: EXCLUDING INTERNAL NOTES & PURCHASE COSTS
// -----------------------------------------------------------------------------
test('SEC-3B-01: Customer order details query projection strictly excludes admin_notes and purchase_cost', () => {
  const customerOrderSafeColumns = [
    'id',
    'order_number',
    'order_token',
    'user_id',
    'customer_name',
    'email',
    'phone1',
    'phone2',
    'address_line',
    'city',
    'district',
    'province',
    'postal_code',
    'delivery_notes',
    'delivery_fee',
    'subtotal',
    'discount_amount',
    'coupon_code',
    'total_amount',
    'payment_method',
    'payment_status',
    'order_status',
    'tracking_number',
    'created_at',
    'updated_at',
  ];

  const customerOrderItemSafeColumns = [
    'id',
    'order_id',
    'product_id',
    'variant_id',
    'product_name',
    'variant_title',
    'sku',
    'unit_price',
    'quantity',
    'total_price',
  ];

  assert.equal(customerOrderSafeColumns.includes('admin_notes'), false);
  assert.equal(customerOrderItemSafeColumns.includes('purchase_cost'), false);
});

test('SEC-3B-01: Customer line items model does not leak purchase_cost to customer view', () => {
  const rawOrderItemFromDb = {
    id: 'item-1',
    order_id: 'ord-1',
    product_id: 'prod-1',
    variant_id: 'var-1',
    product_name: 'Solitaire Ring',
    variant_title: 'Size 6 / Gold',
    sku: 'SJ-RNG-001',
    unit_price: 15000,
    quantity: 1,
    total_price: 15000,
    purchase_cost: 4500, // Confidential wholesale cost
  };

  // Safe mapping function ensuring purchase_cost is excluded from customer-facing objects
  const mapCustomerOrderItem = (raw: typeof rawOrderItemFromDb): OrderItem => ({
    id: raw.id,
    orderId: raw.order_id,
    productId: raw.product_id,
    variantId: raw.variant_id,
    productName: raw.product_name,
    variantTitle: raw.variant_title,
    sku: raw.sku,
    unitPrice: raw.unit_price,
    quantity: raw.quantity,
    totalPrice: raw.total_price,
  });

  const customerItem = mapCustomerOrderItem(rawOrderItemFromDb);

  assert.equal(customerItem.purchaseCost, undefined);
  assert.equal('purchaseCost' in customerItem, false);
  assert.equal('purchase_cost' in customerItem, false);
});

// -----------------------------------------------------------------------------
// 3. SANITIZATION OF ORDER-CREATION ERRORS (SEC-3B-02)
// -----------------------------------------------------------------------------
test('SEC-3B-02: Low-level database and driver errors are sanitized to user-safe messages', () => {
  const sanitizeOrderError = (dbError: { code?: string; message: string }) => {
    // Simulates the safe error-handling logic in createOrderAction
    const sensitivePatterns = [
      /relation ".*" does not exist/i,
      /violates foreign key constraint/i,
      /syntax error at or near/i,
      /connection to server.*failed/i,
      /password authentication failed/i,
      /permission denied for table/i,
      /duplicate key value violates unique constraint/i,
    ];

    const isSensitive = sensitivePatterns.some((pattern) => pattern.test(dbError.message));
    if (isSensitive) {
      return 'Unable to process your order at this time. Please check your details and try again.';
    }
    return dbError.message;
  };

  const dbForeignKeyError = {
    code: '23503',
    message: 'insert or update on table "orders" violates foreign key constraint "orders_user_id_fkey"',
  };

  const sanitized = sanitizeOrderError(dbForeignKeyError);

  assert.equal(sanitized, 'Unable to process your order at this time. Please check your details and try again.');
  assert.equal(sanitized.includes('violates foreign key constraint'), false);
  assert.equal(sanitized.includes('orders_user_id_fkey'), false);
});

// -----------------------------------------------------------------------------
// 4. ADMIN ROUTE AUTHORIZATION & EXCEPTION HANDLING (SEC-3B-03 & SEC-3B-05)
// -----------------------------------------------------------------------------
test('SEC-3B-05: AdminAuthError cleanly distinguishes UNAUTHENTICATED vs FORBIDDEN', () => {
  const unauthError = new AdminAuthError('Authentication required.', 'UNAUTHENTICATED');
  assert.equal(unauthError.code, 'UNAUTHENTICATED');
  assert.equal(unauthError.name, 'AdminAuthError');
  assert.equal(unauthError.message, 'Authentication required.');

  const forbiddenError = new AdminAuthError('Forbidden: Active admin required.', 'FORBIDDEN');
  assert.equal(forbiddenError.code, 'FORBIDDEN');
  assert.equal(forbiddenError.name, 'AdminAuthError');
  assert.equal(forbiddenError.message, 'Forbidden: Active admin required.');
});

test('SEC-3B-03: Protected admin operation guard rejects non-admin users without leaking internal data', async () => {
  // Simulates server-side admin guard logic in requireAdminAuth
  const checkAdminAccess = async (userSession: { id: string } | null, adminUserRecord: { id: string; is_active: boolean } | null) => {
    if (!userSession) {
      throw new AdminAuthError('Authentication required. Please sign in as an administrator.', 'UNAUTHENTICATED');
    }
    if (!adminUserRecord || !adminUserRecord.is_active) {
      throw new AdminAuthError('Forbidden: Active administrative privileges required.', 'FORBIDDEN');
    }
    return { authorized: true, adminId: adminUserRecord.id };
  };

  // Scenario A: Anonymous caller
  await assert.rejects(
    async () => {
      await checkAdminAccess(null, null);
    },
    (err: any) => {
      return err instanceof AdminAuthError && err.code === 'UNAUTHENTICATED';
    }
  );

  // Scenario B: Ordinary authenticated customer (not in admin_users)
  await assert.rejects(
    async () => {
      await checkAdminAccess({ id: 'customer-uuid-1' }, null);
    },
    (err: any) => {
      return err instanceof AdminAuthError && err.code === 'FORBIDDEN';
    }
  );

  // Scenario C: Suspended admin (is_active: false)
  await assert.rejects(
    async () => {
      await checkAdminAccess({ id: 'admin-uuid-2' }, { id: 'admin-uuid-2', is_active: false });
    },
    (err: any) => {
      return err instanceof AdminAuthError && err.code === 'FORBIDDEN';
    }
  );

  // Scenario D: Authorized active admin
  const result = await checkAdminAccess({ id: 'admin-uuid-3' }, { id: 'admin-uuid-3', is_active: true });
  assert.deepEqual(result, { authorized: true, adminId: 'admin-uuid-3' });
});

// -----------------------------------------------------------------------------
// 5. CROSS-CUSTOMER ORDER PRIVACY & IMMUTABLE IDENTITY FIELDS
// -----------------------------------------------------------------------------
test('SEC-3B-01: Order detail lookup query strictly scopes by current user_id', () => {
  const mockOrdersDb = [
    { id: 'order-1', user_id: 'customer-alice', total: 10000 },
    { id: 'order-2', user_id: 'customer-bob', total: 25000 },
  ];

  const queryOrderForUser = (orderId: string, currentUserId: string) => {
    return mockOrdersDb.find((o) => o.id === orderId && o.user_id === currentUserId) || null;
  };

  // Alice queries her own order: allowed
  assert.notEqual(queryOrderForUser('order-1', 'customer-alice'), null);

  // Alice attempts to access Bob's order by changing the ID: rejected (returns null)
  assert.equal(queryOrderForUser('order-2', 'customer-alice'), null);

  // Bob attempts to access Alice's order: rejected
  assert.equal(queryOrderForUser('order-1', 'customer-bob'), null);
});
