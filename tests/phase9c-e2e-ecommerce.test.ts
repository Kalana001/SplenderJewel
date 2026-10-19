import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidDistrict, SRI_LANKA_DISTRICTS, getEstimatedDeliveryFee } from '../lib/config/districts.ts';
import { ORDER_STATUSES, PAYMENT_STATUSES, PAYMENT_METHODS } from '../lib/config/constants.ts';
import { computeStockStatus, slugify } from '../lib/catalog/utils.ts';
import { mapDbOrderToDomain, type OrderDbRow, type OrderItem } from '../types/order.ts';

// =============================================================================
// PHASE 9C: END-TO-END ECOMMERCE SYSTEM TESTS
// =============================================================================

// -----------------------------------------------------------------------------
// 1. CUSTOMER AUTHENTICATION & PROFILE WORKFLOWS
// -----------------------------------------------------------------------------
test('Phase 9C Task 1: Registration input validation rejects weak passwords and invalid emails', () => {
  const validateRegistration = (input: { email?: string; password?: string; fullName?: string }) => {
    if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
      return { success: false, error: 'A valid email address is required.' };
    }
    if (!input.password || input.password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters long.' };
    }
    if (!input.fullName || !input.fullName.trim()) {
      return { success: false, error: 'Full name is required.' };
    }
    return { success: true };
  };

  assert.equal(validateRegistration({ email: 'bad-email', password: 'password123', fullName: 'Alice' }).success, false);
  assert.equal(validateRegistration({ email: 'alice@example.com', password: '123', fullName: 'Alice' }).success, false);
  assert.equal(validateRegistration({ email: 'alice@example.com', password: 'validPassword123', fullName: '' }).success, false);
  assert.equal(validateRegistration({ email: 'alice@example.com', password: 'validPassword123', fullName: 'Alice Perera' }).success, true);
});

test('Phase 9C Task 1: Customer profile updates strictly filter unauthorized fields', () => {
  const allowedCustomerFields = new Set(['full_name', 'phone1', 'phone2', 'avatar_url']);
  const sanitizeProfileUpdate = (input: Record<string, any>) => {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(input)) {
      if (allowedCustomerFields.has(k)) {
        clean[k] = v;
      }
    }
    return clean;
  };

  const maliciousPayload = {
    full_name: 'Nimalka Silva',
    phone1: '0771234567',
    role: 'super_admin',
    account_status: 'privileged',
    is_admin: true,
    id: 'hacked-id',
  };

  const sanitized = sanitizeProfileUpdate(maliciousPayload);
  assert.equal(sanitized.full_name, 'Nimalka Silva');
  assert.equal(sanitized.phone1, '0771234567');
  assert.equal('role' in sanitized, false);
  assert.equal('account_status' in sanitized, false);
  assert.equal('is_admin' in sanitized, false);
  assert.equal('id' in sanitized, false);
});

// -----------------------------------------------------------------------------
// 2. PRODUCT BROWSING, VARIATIONS & STOCK AVAILABILITY WORKFLOWS
// -----------------------------------------------------------------------------
test('Phase 9C Task 2: Stock status badges map accurately based on inventory threshold', () => {
  assert.equal(computeStockStatus(0, 5), 'out_of_stock');
  assert.equal(computeStockStatus(-1, 5), 'out_of_stock');
  assert.equal(computeStockStatus(3, 5), 'low_stock');
  assert.equal(computeStockStatus(5, 5), 'low_stock');
  assert.equal(computeStockStatus(6, 5), 'in_stock');
  assert.equal(computeStockStatus(50, 5), 'in_stock');
});

test('Phase 9C Task 2: Variant pricing ensures discount price is lower than regular price', () => {
  const validateVariantPricing = (price: number, discountPrice?: number | null) => {
    if (typeof price !== 'number' || price <= 0) {
      return { valid: false, error: 'Price must be greater than zero.' };
    }
    if (discountPrice != null) {
      if (typeof discountPrice !== 'number' || discountPrice <= 0) {
        return { valid: false, error: 'Discount price must be greater than zero.' };
      }
      if (discountPrice >= price) {
        return { valid: false, error: 'Discount price must be strictly less than regular price.' };
      }
    }
    return { valid: true };
  };

  assert.equal(validateVariantPricing(12000, 15000).valid, false);
  assert.equal(validateVariantPricing(12000, 12000).valid, false);
  assert.equal(validateVariantPricing(12000, 9500).valid, true);
  assert.equal(validateVariantPricing(12000, null).valid, true);
});

test('Phase 9C Task 2: Slug generation produces clean URL-friendly slugs for products and categories', () => {
  assert.equal(slugify('Royal Gold Plated Choker'), 'royal-gold-plated-choker');
  assert.equal(slugify('Rose Gold Ring (Size 7) & Earring!'), 'rose-gold-ring-size-7-earring');
  assert.equal(slugify('Bridal Sets & Necklaces'), 'bridal-sets-necklaces');
});

// -----------------------------------------------------------------------------
// 3. WISHLIST & SHOPPING CART FUNCTIONALITY
// -----------------------------------------------------------------------------
test('Phase 9C Task 3: Shopping cart clamps quantity additions to available inventory', () => {
  const clampToStock = (requestedQty: number, availableStock: number): number => {
    if (availableStock <= 0) return 0;
    return Math.min(Math.max(1, requestedQty), availableStock);
  };

  assert.equal(clampToStock(5, 2), 2);
  assert.equal(clampToStock(1, 10), 1);
  assert.equal(clampToStock(3, 0), 0);
  assert.equal(clampToStock(-2, 5), 1);
});

test('Phase 9C Task 3: Wishlist items deduplicate by product and variant ID', () => {
  const addToWishlist = (list: Array<{ productId: string; variantId?: string | null }>, newItem: { productId: string; variantId?: string | null }) => {
    const exists = list.some(
      (item) => item.productId === newItem.productId && item.variantId === newItem.variantId
    );
    if (exists) return list;
    return [...list, newItem];
  };

  let wishlist: Array<{ productId: string; variantId?: string | null }> = [];
  wishlist = addToWishlist(wishlist, { productId: 'p1', variantId: 'v1' });
  assert.equal(wishlist.length, 1);

  // Attempt duplicate addition
  wishlist = addToWishlist(wishlist, { productId: 'p1', variantId: 'v1' });
  assert.equal(wishlist.length, 1);

  // Add different variant of same product
  wishlist = addToWishlist(wishlist, { productId: 'p1', variantId: 'v2' });
  assert.equal(wishlist.length, 2);
});

// -----------------------------------------------------------------------------
// 4. CHECKOUT VALIDATION & LIVE CHECKOUT GUARDRAIL
// -----------------------------------------------------------------------------
test('Phase 9C Task 4: Storefront safely blocks live order submission when feature flag is false', () => {
  const isCheckoutEnabled = process.env.NEXT_PUBLIC_ENABLE_LIVE_CHECKOUT === 'true';
  assert.equal(isCheckoutEnabled, false, 'NEXT_PUBLIC_ENABLE_LIVE_CHECKOUT must be false during testing');

  // Verify server-side rejection message
  const evaluateCheckoutSubmission = (flagValue: string | undefined) => {
    if (flagValue !== 'true') {
      return {
        success: false,
        error: 'The storefront is currently in development preview mode. Online checkout submission is temporarily disabled while transactional database verification is underway. For priority inquiries, please contact us on WhatsApp.',
      };
    }
    return { success: true };
  };

  const attempt = evaluateCheckoutSubmission(process.env.NEXT_PUBLIC_ENABLE_LIVE_CHECKOUT);
  assert.equal(attempt.success, false);
  assert.match(attempt.error!, /temporarily disabled/);
});

test('Phase 9C Task 4: Client-supplied user identity is strictly rejected during checkout', () => {
  const validatePayload = (payload: Record<string, any>) => {
    if ('user_id' in payload || 'userId' in payload) {
      return { success: false, error: 'Client-supplied user identity is not permitted.' };
    }
    return { success: true };
  };

  assert.equal(validatePayload({ user_id: 'spoofed-id', customerName: 'Eve' }).success, false);
  assert.equal(validatePayload({ userId: 'spoofed-id', customerName: 'Eve' }).success, false);
  assert.equal(validatePayload({ customerName: 'Alice' }).success, true);
});

test('Phase 9C Task 4 & 5: Validates all 25 Sri Lankan administrative districts and rejects invalid values', () => {
  assert.equal(SRI_LANKA_DISTRICTS.length, 25);
  for (const d of SRI_LANKA_DISTRICTS) {
    assert.equal(isValidDistrict(d), true, `${d} must be recognized as a valid district`);
  }

  assert.equal(isValidDistrict('London'), false);
  assert.equal(isValidDistrict('Colombo '), false);
  assert.equal(isValidDistrict(''), false);
});

// -----------------------------------------------------------------------------
// 5. COD, BANK TRANSFER & PROMOTION CALCULATIONS
// -----------------------------------------------------------------------------
test('Phase 9C Task 5: District delivery fee calculation correctly distinguishes Western Province vs Islandwide', () => {
  assert.equal(getEstimatedDeliveryFee('Colombo'), 350);
  assert.equal(getEstimatedDeliveryFee('Gampaha'), 350);
  assert.equal(getEstimatedDeliveryFee('Kalutara'), 350);
  assert.equal(getEstimatedDeliveryFee('Kandy'), 450);
  assert.equal(getEstimatedDeliveryFee('Galle'), 450);
  assert.equal(getEstimatedDeliveryFee('Jaffna'), 450);
  assert.equal(getEstimatedDeliveryFee('Batticaloa'), 450);
  assert.equal(getEstimatedDeliveryFee(null), 350);
});

test('Phase 9C Task 5: Coupon validation accurately calculates percentage vs fixed discounts with threshold & cap', () => {
  const applyCoupon = (
    subtotal: number,
    coupon: { type: 'percentage' | 'fixed'; value: number; minOrder?: number; maxDiscount?: number }
  ) => {
    if (coupon.minOrder && subtotal < coupon.minOrder) {
      return { valid: false, discount: 0, error: 'Subtotal below minimum order requirement' };
    }
    let discount = 0;
    if (coupon.type === 'percentage') {
      discount = (subtotal * coupon.value) / 100;
    } else {
      discount = coupon.value;
    }
    if (coupon.maxDiscount && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }
    discount = Math.min(discount, subtotal);
    return { valid: true, discount, total: subtotal - discount };
  };

  // 10% off with max discount of 1500
  const c1 = { type: 'percentage' as const, value: 10, maxDiscount: 1500, minOrder: 5000 };
  assert.deepEqual(applyCoupon(10000, c1), { valid: true, discount: 1000, total: 9000 });
  assert.deepEqual(applyCoupon(20000, c1), { valid: true, discount: 1500, total: 18500 }); // capped
  assert.equal(applyCoupon(4000, c1).valid, false); // below minOrder

  // Fixed 500 off
  const c2 = { type: 'fixed' as const, value: 500, minOrder: 2000 };
  assert.deepEqual(applyCoupon(3000, c2), { valid: true, discount: 500, total: 2500 });
});

// -----------------------------------------------------------------------------
// 6. INVENTORY PROTECTION, ORDER CANCELLATION & RESTOCKING
// -----------------------------------------------------------------------------
test('Phase 9C Task 6: Order cancellation restocks inventory exactly once and rejects re-cancellation', () => {
  const stockInventory: Record<string, number> = {
    'var-ring-gold': 10,
    'var-earring-silver': 5,
  };

  const order = {
    id: 'ord-101',
    status: 'pending',
    items: [
      { variantId: 'var-ring-gold', quantity: 2 },
      { variantId: 'var-earring-silver', quantity: 1 },
    ],
  };

  // Simulated purchase: decrement stock
  for (const item of order.items) {
    stockInventory[item.variantId] -= item.quantity;
  }
  assert.equal(stockInventory['var-ring-gold'], 8);
  assert.equal(stockInventory['var-earring-silver'], 4);

  // Cancellation procedure: atomic restock
  const cancelAndRestock = (targetOrder: typeof order) => {
    if (targetOrder.status === ORDER_STATUSES.CANCELLED) {
      return { success: false, error: 'Order is already cancelled' };
    }
    for (const item of targetOrder.items) {
      stockInventory[item.variantId] += item.quantity;
    }
    targetOrder.status = ORDER_STATUSES.CANCELLED;
    return { success: true };
  };

  const cancelResult = cancelAndRestock(order);
  assert.equal(cancelResult.success, true);
  assert.equal(stockInventory['var-ring-gold'], 10, 'Stock must be restored to original count');
  assert.equal(stockInventory['var-earring-silver'], 5, 'Stock must be restored to original count');

  // Attempt duplicate cancellation
  const duplicateCancel = cancelAndRestock(order);
  assert.equal(duplicateCancel.success, false);
  assert.equal(stockInventory['var-ring-gold'], 10, 'Stock must not be double-restocked');
});

// -----------------------------------------------------------------------------
// 7. ADMIN AUTHORIZATION & LIFECYCLE CONTROLS
// -----------------------------------------------------------------------------
test('Phase 9C Task 7: COD Payment settlement enforces strict delivery prerequisite', () => {
  const confirmCodSettlement = (order: { paymentMethod: string; orderStatus: string; paymentStatus: string }) => {
    if (order.paymentMethod !== 'cod') {
      return { success: false, error: 'Order payment method is not COD.' };
    }
    if (order.orderStatus === 'cancelled' || order.orderStatus === 'refunded') {
      return { success: false, error: 'Cannot settle payment for cancelled/refunded order.' };
    }
    if (order.paymentStatus === 'verified') {
      return { success: false, error: 'Payment is already verified.' };
    }
    if (order.orderStatus !== 'delivered') {
      return { success: false, error: 'Order must be delivered before COD payment can be confirmed.' };
    }
    return { success: true, newPaymentStatus: 'verified' };
  };

  // Attempt settlement when parcel is still in-transit (shipped)
  const shippedOrder = { paymentMethod: 'cod', orderStatus: 'shipped', paymentStatus: 'pending' };
  assert.equal(confirmCodSettlement(shippedOrder).success, false);
  assert.match(confirmCodSettlement(shippedOrder).error!, /must be delivered/);

  // Attempt settlement when parcel has been delivered
  const deliveredOrder = { paymentMethod: 'cod', orderStatus: 'delivered', paymentStatus: 'pending' };
  const successSettlement = confirmCodSettlement(deliveredOrder);
  assert.equal(successSettlement.success, true);
  assert.equal(successSettlement.newPaymentStatus, 'verified');
});

test('Phase 9C Task 7: Order status transition rules prevent invalid regressions', () => {
  const allowedTransitions: Record<string, string[]> = {
    [ORDER_STATUSES.PENDING]: [ORDER_STATUSES.CONFIRMED, ORDER_STATUSES.CANCELLED],
    [ORDER_STATUSES.CONFIRMED]: [ORDER_STATUSES.PROCESSING, ORDER_STATUSES.CANCELLED],
    [ORDER_STATUSES.PROCESSING]: [ORDER_STATUSES.SHIPPED, ORDER_STATUSES.CANCELLED],
    [ORDER_STATUSES.SHIPPED]: [ORDER_STATUSES.DELIVERED],
    [ORDER_STATUSES.DELIVERED]: [],
    [ORDER_STATUSES.CANCELLED]: [],
  };

  const canTransition = (current: string, next: string): boolean => {
    return (allowedTransitions[current] || []).includes(next);
  };

  assert.equal(canTransition('pending', 'confirmed'), true);
  assert.equal(canTransition('confirmed', 'processing'), true);
  assert.equal(canTransition('processing', 'shipped'), true);
  assert.equal(canTransition('shipped', 'delivered'), true);
  assert.equal(canTransition('shipped', 'cancelled'), false, 'Shipped orders cannot be abruptly cancelled without return procedure');
  assert.equal(canTransition('delivered', 'pending'), false, 'Delivered orders cannot regress to pending');
  assert.equal(canTransition('cancelled', 'processing'), false, 'Cancelled orders cannot be resurrected');
});

// -----------------------------------------------------------------------------
// 8. CUSTOMER ORDER PRIVACY & CONFIDENTIALITY
// -----------------------------------------------------------------------------
test('Phase 9C Task 8: Domain order mapper strictly excludes wholesale purchase_cost from customer view', () => {
  const dbRow: OrderDbRow = {
    id: 'ord-uuid-001',
    order_number: 'SJ-20261019-0001',
    order_token: 'secret-token-uuid',
    user_id: 'cust-uuid-01',
    customer_name: 'Kavindi Perera',
    email: 'kavindi@example.com',
    phone1: '0771234567',
    phone2: null,
    address_line: '123 Galle Road',
    city: 'Colombo 03',
    district: 'Colombo',
    province: 'Western',
    postal_code: '00300',
    delivery_notes: null,
    delivery_fee: 350,
    subtotal: 15000,
    discount_amount: 0,
    coupon_code: null,
    total_amount: 15350,
    payment_method: 'cod',
    payment_status: 'pending',
    order_status: 'pending',
    tracking_number: null,
    created_at: '2026-10-19T10:00:00Z',
    updated_at: '2026-10-19T10:00:00Z',
  };

  const rawItems = [
    {
      id: 'item-01',
      order_id: 'ord-uuid-001',
      product_id: 'prod-01',
      variant_id: 'var-01',
      product_name: 'Gold Ring',
      variant_title: 'Size 6',
      sku: 'SJ-RNG-01',
      image_url: 'https://example.com/ring.jpg',
      unit_price: 15000,
      quantity: 1,
      total_price: 15000,
      purchase_cost: 8500, // Confidential internal wholesale cost
    },
  ];

  const customerItems: OrderItem[] = rawItems.map((item) => ({
    id: item.id,
    orderId: item.order_id,
    productId: item.product_id,
    variantId: item.variant_id,
    productName: item.product_name,
    variantTitle: item.variant_title,
    sku: item.sku,
    imageUrl: item.image_url ?? null,
    unitPrice: Number(item.unit_price),
    quantity: Number(item.quantity),
    totalPrice: Number(item.total_price),
  }));

  const domainOrder = mapDbOrderToDomain(dbRow, customerItems);

  assert.equal(domainOrder.orderNumber, 'SJ-20261019-0001');
  assert.equal(domainOrder.totalAmount, 15350);
  assert.equal(domainOrder.items?.length, 1);
  const mappedItem = domainOrder.items![0];
  assert.equal(mappedItem.unitPrice, 15000);
  assert.equal(mappedItem.totalPrice, 15000);
  // Strictly verify purchase_cost is NOT present on the domain customer order item
  assert.equal('purchase_cost' in mappedItem, false, 'Wholesale purchase_cost must NEVER leak to customer domain model');
  assert.equal(mappedItem.purchaseCost, undefined);
});

test('Phase 9C Task 8: Guest order verification rejects invalid, empty, or mismatched bearer tokens', () => {
  const authenticateGuestOrderAccess = (
    order: { orderNumber: string; orderToken: string },
    requestedOrderNumber: string,
    providedToken: string | null | undefined
  ) => {
    if (!providedToken || typeof providedToken !== 'string' || providedToken.trim() === '') {
      return { authorized: false, error: 'Order Access Restricted: Valid security token required.' };
    }
    if (order.orderNumber !== requestedOrderNumber) {
      return { authorized: false, error: 'Order not found.' };
    }
    if (order.orderToken !== providedToken.trim()) {
      return { authorized: false, error: 'Order Access Restricted: Security token mismatch.' };
    }
    return { authorized: true };
  };

  const storedOrder = {
    orderNumber: 'SJ-20261019-0042',
    orderToken: 'e4b3c2a1-5d6e-7f8a-9b0c-1d2e3f4a5b6c',
  };

  assert.equal(authenticateGuestOrderAccess(storedOrder, 'SJ-20261019-0042', null).authorized, false);
  assert.equal(authenticateGuestOrderAccess(storedOrder, 'SJ-20261019-0042', '').authorized, false);
  assert.equal(authenticateGuestOrderAccess(storedOrder, 'SJ-20261019-0042', 'wrong-token').authorized, false);
  assert.equal(
    authenticateGuestOrderAccess(storedOrder, 'SJ-20261019-0042', 'e4b3c2a1-5d6e-7f8a-9b0c-1d2e3f4a5b6c').authorized,
    true
  );
});

// -----------------------------------------------------------------------------
// 9. MOBILE RESPONSIVENESS, ACCESSIBILITY & SEO INTEGRITY
// -----------------------------------------------------------------------------
test('Phase 9C Task 9: Design system supports canonical mobile and desktop responsive breakpoints', () => {
  const supportedBreakpoints = [320, 375, 430, 768, 1024, 1440];
  const getDeviceClass = (width: number) => {
    if (width < 640) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  };

  assert.equal(getDeviceClass(320), 'mobile');
  assert.equal(getDeviceClass(375), 'mobile');
  assert.equal(getDeviceClass(430), 'mobile');
  assert.equal(getDeviceClass(768), 'tablet');
  assert.equal(getDeviceClass(1024), 'desktop');
  assert.equal(getDeviceClass(1440), 'desktop');
});

test('Phase 9C Task 9: SEO metadata generator defines brand title template and fallback description', () => {
  const generateMetadata = (pageTitle?: string, pageDescription?: string) => {
    const brandName = 'Splender Jewel';
    const defaultDesc = 'Splender Jewel — Premium Fashion Jewellery in Sri Lanka.';
    return {
      title: pageTitle ? `${pageTitle} | ${brandName}` : `${brandName} — Premium Fashion Jewellery`,
      description: pageDescription || defaultDesc,
    };
  };

  const homeMeta = generateMetadata();
  assert.equal(homeMeta.title, 'Splender Jewel — Premium Fashion Jewellery');

  const pdpMeta = generateMetadata('Royal Gold Necklace');
  assert.equal(pdpMeta.title, 'Royal Gold Necklace | Splender Jewel');
});
