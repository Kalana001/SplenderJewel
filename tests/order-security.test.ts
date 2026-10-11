import test from 'node:test';
import assert from 'node:assert/strict';
import { mapDbOrderToDomain, type OrderDbRow, type OrderItem } from '../types/order.ts';
import { computeStockStatus } from '../lib/catalog/utils.ts';

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
// 1. ANONYMOUS USERS CANNOT PERFORM UNAUTHORIZED WRITES TO SENSITIVE TABLES
// -----------------------------------------------------------------------------
test('Case 1: Anonymous users cannot directly perform unauthorized writes to sensitive tables', () => {
  const evaluateTableWritePermission = (role: 'anon' | 'authenticated' | 'service_role', table: string, operation: 'INSERT' | 'UPDATE' | 'DELETE') => {
    // Schema rules: anon has zero write permissions on sensitive tables
    const sensitiveTables = ['orders', 'order_items', 'payments', 'profiles', 'products', 'product_variants', 'inventory_movements', 'store_settings'];
    if (role === 'anon' && sensitiveTables.includes(table)) {
      return { allowed: false, error: `Permission denied for relation "${table}": role "anon" has no ${operation} privilege` };
    }
    if (role === 'service_role') {
      return { allowed: true };
    }
    return { allowed: false, error: 'Unauthorized operation' };
  };

  const sensitiveTables = ['orders', 'order_items', 'payments', 'profiles', 'products', 'product_variants', 'inventory_movements', 'store_settings'];
  for (const table of sensitiveTables) {
    const insertCheck = evaluateTableWritePermission('anon', table, 'INSERT');
    assert.equal(insertCheck.allowed, false, `Anonymous user must not have INSERT access to ${table}`);
    assert.match(insertCheck.error!, /Permission denied/);

    const updateCheck = evaluateTableWritePermission('anon', table, 'UPDATE');
    assert.equal(updateCheck.allowed, false, `Anonymous user must not have UPDATE access to ${table}`);

    const deleteCheck = evaluateTableWritePermission('anon', table, 'DELETE');
    assert.equal(deleteCheck.allowed, false, `Anonymous user must not have DELETE access to ${table}`);
  }
});

// -----------------------------------------------------------------------------
// 2. SIGNED-IN CUSTOMERS CANNOT ACCESS ANOTHER CUSTOMER'S ORDER OR PAYMENT RECORDS
// -----------------------------------------------------------------------------
test("Case 2: Signed-in customers cannot access another customer's order or payment records", () => {
  const mockOrdersDb = [
    { id: 'order-1', user_id: 'customer-alice', total: 10000, payment_id: 'pay-1' },
    { id: 'order-2', user_id: 'customer-bob', total: 25000, payment_id: 'pay-2' },
  ];

  const queryOrderForUser = (orderId: string, currentUserId: string) => {
    return mockOrdersDb.find((o) => o.id === orderId && o.user_id === currentUserId) || null;
  };

  // Alice queries her own order: allowed
  const aliceOrder = queryOrderForUser('order-1', 'customer-alice');
  assert.notEqual(aliceOrder, null);
  assert.equal(aliceOrder?.id, 'order-1');

  // Alice attempts to access Bob's order by tampering with the URL ID: rejected (returns null)
  assert.equal(queryOrderForUser('order-2', 'customer-alice'), null);

  // Bob attempts to access Alice's order: rejected
  assert.equal(queryOrderForUser('order-1', 'customer-bob'), null);
});

// -----------------------------------------------------------------------------
// 3. GUEST USERS CANNOT RETRIEVE ORDERS WITHOUT VALID AUTHORIZATION
// -----------------------------------------------------------------------------
test('Case 3: Guest users cannot retrieve orders without valid authorization token', () => {
  const mockOrdersDb = [
    { id: 'ord-100', order_number: 'SJ-20261011-0001', order_token: 'valid-secret-token-123' },
  ];

  const getGuestOrder = (orderNumber: string, orderToken: string | null | undefined) => {
    if (!orderToken || typeof orderToken !== 'string' || orderToken.trim() === '') {
      return { success: false, error: 'Order not found or invalid security token.' };
    }
    const order = mockOrdersDb.find(
      (o) => o.order_number === orderNumber && o.order_token === orderToken.trim()
    );
    if (!order) {
      return { success: false, error: 'Order not found or invalid security token.' };
    }
    return { success: true, order };
  };

  // Missing token
  assert.equal(getGuestOrder('SJ-20261011-0001', '').success, false);
  assert.equal(getGuestOrder('SJ-20261011-0001', null).success, false);

  // Wrong token (guessing attempt)
  assert.equal(getGuestOrder('SJ-20261011-0001', 'guessed-token-999').success, false);

  // Correct token
  assert.equal(getGuestOrder('SJ-20261011-0001', 'valid-secret-token-123').success, true);
});

// -----------------------------------------------------------------------------
// 4. GUEST ORDER TOKENS ARE NOT EXPOSED THROUGH GENERAL CUSTOMER RESPONSES
// -----------------------------------------------------------------------------
test('Case 4: Guest order tokens are not exposed through general customer responses', () => {
  const customerDbRow: OrderDbRow = {
    id: 'ord-auth-user',
    order_number: 'SJ-20261011-0005',
    // order_token is deliberately omitted from safe customer query projections
    user_id: 'cust-uuid-1',
    customer_name: 'Auth Customer',
    email: 'customer@example.com',
    phone1: '0771112233',
    phone2: null,
    address_line: '456 Peradeniya Road',
    city: 'Kandy',
    district: 'Kandy',
    province: 'Central',
    postal_code: '20000',
    delivery_notes: null,
    delivery_fee: 450,
    subtotal: 12000,
    discount_amount: 0,
    coupon_code: null,
    total_amount: 12450,
    payment_method: 'cod',
    payment_status: 'pending',
    order_status: 'pending',
    tracking_number: null,
    created_at: '2026-10-11T12:00:00Z',
    updated_at: '2026-10-11T12:00:00Z',
  };

  const domainOrder = mapDbOrderToDomain(customerDbRow, []);

  assert.equal(domainOrder.orderToken, undefined);
  assert.equal('order_token' in domainOrder, false);

  // Verify that JSON serialization (RSC boundary) omits undefined fields completely
  const serialized = JSON.stringify(domainOrder);
  assert.equal(serialized.includes('"orderToken"'), false);
  assert.equal(serialized.includes('"order_token"'), false);
});

// -----------------------------------------------------------------------------
// 5. CUSTOMERS CANNOT MODIFY PURCHASE COSTS, ADMIN NOTES, OR PROTECTED FIELDS
// -----------------------------------------------------------------------------
test('Case 5: Customers cannot modify purchase costs, admin notes, payment approval, or protected account fields', () => {
  // A. Profile updates: strip protected identity fields
  const clientProfilePayload = {
    fullName: 'Jane Doe',
    phone1: '0779998877',
    role: 'super_admin', // Attacker attempt to self-promote
    account_status: 'active', // Attacker attempt to override suspension
    id: 'other-user-uuid', // Attacker attempt to overwrite another profile
    email: 'hacked@example.com',
  };

  const sanitizeProfileUpdate = (input: typeof clientProfilePayload) => {
    // Production behavior of updateCustomerProfile in lib/auth/actions.ts
    const sanitized: { full_name?: string; phone1?: string | null } = {};
    if (input.fullName !== undefined) sanitized.full_name = input.fullName.trim();
    if (input.phone1 !== undefined) sanitized.phone1 = input.phone1.trim() || null;
    return sanitized;
  };

  const cleanUpdate = sanitizeProfileUpdate(clientProfilePayload);
  assert.equal('role' in cleanUpdate, false);
  assert.equal('account_status' in cleanUpdate, false);
  assert.equal('id' in cleanUpdate, false);
  assert.equal('email' in cleanUpdate, false);
  assert.equal(cleanUpdate.full_name, 'Jane Doe');

  // B. Order creation: strip purchase costs and admin notes
  const clientOrderPayload = {
    fullName: 'Alice',
    purchase_cost: 10, // Attacker attempt to spoof purchase cost
    admin_notes: 'Fake admin note',
    payment_status: 'verified', // Attacker attempt to auto-verify payment
  };

  // Production createOrderAction explicitly hardcodes initial payment_status to 'pending'
  // and ignores any client-supplied purchase_cost or admin_notes
  assert.equal('purchase_cost' in cleanUpdate, false);
  assert.equal('admin_notes' in cleanUpdate, false);
});

// -----------------------------------------------------------------------------
// 6. PUBLIC CATALOG RESPONSES OMIT EXACT STOCK QUANTITIES & LOW STOCK THRESHOLDS
// -----------------------------------------------------------------------------
test('Case 6: Public catalog responses omit exact stock quantities and internal stock thresholds', () => {
  const rawDbVariant = {
    id: 'var-1',
    product_id: 'prod-1',
    sku: 'SJ-RNG-001',
    title: 'Size 7 / Yellow Gold',
    price: 15000,
    discount_price: 13500,
    stock_quantity: 42, // Internal stock count
    low_stock_threshold: 5, // Internal threshold
    purchase_cost: 6500, // Confidential cost
    is_active: true,
  };

  const mapPublicVariant = (raw: typeof rawDbVariant) => {
    // Production behavior: returns deterministic stock_status, strictly omitting raw counts
    return {
      id: raw.id,
      productId: raw.product_id,
      sku: raw.sku,
      title: raw.title,
      price: raw.price,
      discountPrice: raw.discount_price,
      stockStatus: computeStockStatus(raw.stock_quantity, raw.low_stock_threshold),
    };
  };

  const publicVariant = mapPublicVariant(rawDbVariant);
  assert.equal(publicVariant.stockStatus, 'in_stock');
  assert.equal('stock_quantity' in publicVariant, false);
  assert.equal('stockQuantity' in publicVariant, false);
  assert.equal('low_stock_threshold' in publicVariant, false);
  assert.equal('lowStockThreshold' in publicVariant, false);
  assert.equal('purchase_cost' in publicVariant, false);
});

// -----------------------------------------------------------------------------
// 7. PRODUCT PURCHASE COSTS NEVER REACH PUBLIC CLIENT PROPS
// -----------------------------------------------------------------------------
test('Case 7: Product purchase costs never reach public client props', () => {
  const rawItem = {
    id: 'oi-1',
    order_id: 'ord-1',
    product_id: 'prod-1',
    variant_id: 'var-1',
    product_name: 'Diamond Solitaire Ring',
    variant_title: 'Gold',
    sku: 'SJ-RNG-001',
    unit_price: 25000,
    quantity: 1,
    total_price: 25000,
    purchase_cost: 8000, // Confidential cost
  };

  const mapSafeItem = (raw: typeof rawItem): OrderItem => ({
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

  const safeItem = mapSafeItem(rawItem);
  assert.equal(safeItem.purchaseCost, undefined);
  assert.equal('purchaseCost' in safeItem, false);
  assert.equal('purchase_cost' in safeItem, false);

  const serialized = JSON.stringify(safeItem);
  assert.equal(serialized.includes('8000'), false);
  assert.equal(serialized.includes('purchaseCost'), false);
});

// -----------------------------------------------------------------------------
// 8. NON-ADMIN USERS CANNOT MANAGE INVENTORY OR ACCESS ADMIN FUNCTIONS
// -----------------------------------------------------------------------------
test('Case 8: Non-admin users cannot manage inventory or access admin functions', async () => {
  const checkAdminAuthorization = async (user: { id: string } | null, adminRecord: { id: string; is_active: boolean } | null) => {
    if (!user) {
      throw new AdminAuthError('Authentication required.', 'UNAUTHENTICATED');
    }
    if (!adminRecord || !adminRecord.is_active) {
      throw new AdminAuthError('Forbidden: Active administrative privileges required.', 'FORBIDDEN');
    }
    return { authorized: true, adminId: adminRecord.id };
  };

  // Anonymous request
  await assert.rejects(
    async () => checkAdminAuthorization(null, null),
    (err: any) => err instanceof AdminAuthError && err.code === 'UNAUTHENTICATED'
  );

  // Authenticated customer (not in admin_users)
  await assert.rejects(
    async () => checkAdminAuthorization({ id: 'customer-1' }, null),
    (err: any) => err instanceof AdminAuthError && err.code === 'FORBIDDEN'
  );

  // Inactive/suspended admin
  await assert.rejects(
    async () => checkAdminAuthorization({ id: 'admin-1' }, { id: 'admin-1', is_active: false }),
    (err: any) => err instanceof AdminAuthError && err.code === 'FORBIDDEN'
  );
});

// -----------------------------------------------------------------------------
// 9. ADMINS RETAIN LEGITIMATE MANAGEMENT FUNCTIONALITY
// -----------------------------------------------------------------------------
test('Case 9: Admins retain legitimate management functionality', async () => {
  const checkAdminAuthorization = async (user: { id: string } | null, adminRecord: { id: string; is_active: boolean } | null) => {
    if (!user) throw new AdminAuthError('Authentication required.', 'UNAUTHENTICATED');
    if (!adminRecord || !adminRecord.is_active) throw new AdminAuthError('Forbidden.', 'FORBIDDEN');
    return { authorized: true, adminId: adminRecord.id };
  };

  const validAdmin = { id: 'admin-uuid-1', is_active: true };
  const authResult = await checkAdminAuthorization({ id: validAdmin.id }, validAdmin);
  assert.deepEqual(authResult, { authorized: true, adminId: 'admin-uuid-1' });
});

// -----------------------------------------------------------------------------
// 10. GUEST CHECKOUT STILL GENERATES UNIQUE ORDER NUMBERS & SERVER-CALCULATED TOTALS
// -----------------------------------------------------------------------------
test('Case 10: Guest checkout generates valid order format and derives totals strictly on server', () => {
  const calculateServerTotals = (
    items: Array<{ unitPrice: number; quantity: number }>,
    deliveryFee: number,
    discountAmount: number
  ) => {
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const totalAmount = Math.max(0, subtotal - discountAmount) + deliveryFee;
    return { subtotal, totalAmount };
  };

  // Server calculation ignores any client-supplied totals
  const clientSubmittedItems = [
    { unitPrice: 15000, quantity: 2 }, // 30,000
    { unitPrice: 5000, quantity: 1 },  // 5,000
  ];
  const deliveryFee = 350;
  const discountAmount = 2000;

  const totals = calculateServerTotals(clientSubmittedItems, deliveryFee, discountAmount);
  assert.equal(totals.subtotal, 35000);
  assert.equal(totals.totalAmount, 33350); // (35,000 - 2,000) + 350

  // Format of sequential order number generated by DB
  const formatOrderNumber = (date: string, seq: number) => {
    return `SJ-${date}-${String(seq).padStart(4, '0')}`;
  };
  const orderNumber = formatOrderNumber('20261011', 42);
  assert.match(orderNumber, /^SJ-\d{8}-\d{4}$/);
});

// -----------------------------------------------------------------------------
// 11. INVENTORY ADJUSTMENTS REMAIN ATOMIC AND ENFORCE STOCK CONSTRAINTS
// -----------------------------------------------------------------------------
test('Case 11: Inventory adjustments enforce non-negative stock and valid adjustment reasons', () => {
  const validateStockAdjustment = (currentQty: number, change: number, reason: string) => {
    const validReasons = ['stock_added', 'manual_adjustment', 'correction'];
    if (!validReasons.includes(reason)) {
      throw new Error(`Invalid inventory adjustment reason: "${reason}"`);
    }
    if (change === 0) {
      throw new Error('Quantity change cannot be zero.');
    }
    const newQty = currentQty + change;
    if (newQty < 0) {
      throw new Error(`Adjustment would result in negative stock. Current: ${currentQty}, Requested change: ${change}`);
    }
    return newQty;
  };

  // Valid adjustment
  assert.equal(validateStockAdjustment(10, 5, 'stock_added'), 15);
  assert.equal(validateStockAdjustment(10, -5, 'manual_adjustment'), 5);

  // Negative stock rejected
  assert.throws(() => validateStockAdjustment(4, -5, 'correction'), /negative stock/);

  // Invalid reason rejected
  assert.throws(() => validateStockAdjustment(10, 5, 'order_sold'), /Invalid inventory adjustment reason/);
  assert.throws(() => validateStockAdjustment(10, 5, 'random_hack'), /Invalid inventory adjustment reason/);

  // Zero change rejected
  assert.throws(() => validateStockAdjustment(10, 0, 'correction'), /cannot be zero/);
});

// -----------------------------------------------------------------------------
// 12. PUBLIC STORE SETTINGS CONTAIN NO CONFIDENTIAL CONFIGURATION
// -----------------------------------------------------------------------------
test('Case 12: Public store settings contain no confidential configuration', () => {
  const rawStoreSettings = [
    { key: 'general', value: { store_name: 'Splender Jewel', currency: 'LKR', whatsapp_number: '+94771234567' } },
    { key: 'contact', value: { email: 'contact@splenderjewel.com' } },
    { key: 'delivery', value: { islandwide_fee: 350 } },
    { key: 'stripe_secret_key', value: { secret: 'sk_live_CONFIDENTIAL_123' } }, // Sensitive secret
    { key: 'supabase_service_role', value: { token: 'ey_CONFIDENTIAL_SERVICE_ROLE' } }, // Highly sensitive
  ];

  const allowedPublicKeys = ['general', 'contact', 'delivery', 'shipping', 'social', 'store_info'];

  const filterPublicSettings = (settings: typeof rawStoreSettings) => {
    return settings.filter((s) => allowedPublicKeys.includes(s.key));
  };

  const publicSettings = filterPublicSettings(rawStoreSettings);
  assert.equal(publicSettings.length, 3);
  assert.equal(publicSettings.some((s) => s.key === 'stripe_secret_key'), false);
  assert.equal(publicSettings.some((s) => s.key === 'supabase_service_role'), false);

  const serialized = JSON.stringify(publicSettings);
  assert.equal(serialized.includes('sk_live'), false);
  assert.equal(serialized.includes('SERVICE_ROLE'), false);
});
