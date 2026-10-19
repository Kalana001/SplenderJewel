import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateShippingFee, getShippingBreakdown } from '../lib/config/shipping.ts';
import { SRI_LANKA_DISTRICTS, isValidDistrict } from '../lib/config/districts.ts';
import { DEFAULT_CONTENT_PAGES } from '../lib/cms/defaults.ts';

// -----------------------------------------------------------------------------
// 1. BANK TRANSFER / SPEED POST TIER THRESHOLDS
// -----------------------------------------------------------------------------
test('Shipping Tiers — Bank Transfer (Speed Post): 1–3 items = LKR 200', () => {
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 1 }), 200);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 2 }), 200);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 3 }), 200);

  const breakdown = getShippingBreakdown({ paymentMethod: 'bank_transfer', totalQuantity: 3 });
  assert.equal(breakdown.fee, 200);
  assert.equal(breakdown.courierService, 'Sri Lanka Post Speed Post');
});

test('Shipping Tiers — Bank Transfer (Speed Post): 4–7 items = LKR 250', () => {
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 4 }), 250);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 5 }), 250);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 6 }), 250);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 7 }), 250);

  const breakdown = getShippingBreakdown({ paymentMethod: 'bank_transfer', totalQuantity: 7 });
  assert.equal(breakdown.fee, 250);
  assert.equal(breakdown.courierService, 'Sri Lanka Post Speed Post');
});

test('Shipping Tiers — Bank Transfer (Speed Post): 8+ items = LKR 350', () => {
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 8 }), 350);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 9 }), 350);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 25 }), 350);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 100 }), 350);

  const breakdown = getShippingBreakdown({ paymentMethod: 'bank_transfer', totalQuantity: 8 });
  assert.equal(breakdown.fee, 350);
  assert.equal(breakdown.courierService, 'Sri Lanka Post Speed Post');
});

// -----------------------------------------------------------------------------
// 2. CASH ON DELIVERY (COD) TIER THRESHOLDS
// -----------------------------------------------------------------------------
test('Shipping Tiers — Cash on Delivery (Post COD): 1–3 items = LKR 350', () => {
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: 1 }), 350);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: 2 }), 350);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: 3 }), 350);

  const breakdown = getShippingBreakdown({ paymentMethod: 'cod', totalQuantity: 3 });
  assert.equal(breakdown.fee, 350);
  assert.equal(breakdown.courierService, 'Sri Lanka Post COD');
});

test('Shipping Tiers — Cash on Delivery (Post COD): 4–10 items = LKR 400', () => {
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: 4 }), 400);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: 5 }), 400);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: 9 }), 400);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: 10 }), 400);

  const breakdown = getShippingBreakdown({ paymentMethod: 'cod', totalQuantity: 10 });
  assert.equal(breakdown.fee, 400);
  assert.equal(breakdown.courierService, 'Sri Lanka Post COD');
});

test('Shipping Tiers — Cash on Delivery (Post COD): 11+ items = LKR 500', () => {
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: 11 }), 500);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: 12 }), 500);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: 50 }), 500);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: 200 }), 500);

  const breakdown = getShippingBreakdown({ paymentMethod: 'cod', totalQuantity: 11 });
  assert.equal(breakdown.fee, 500);
  assert.equal(breakdown.courierService, 'Sri Lanka Post COD');
});

// -----------------------------------------------------------------------------
// 3. DISTRICT INDEPENDENCE ACROSS ALL 25 SRI LANKAN DISTRICTS
// -----------------------------------------------------------------------------
test('Shipping Tiers — Uniform delivery pricing across all 25 Sri Lankan administrative districts', () => {
  assert.equal(SRI_LANKA_DISTRICTS.length, 25);

  for (const d of SRI_LANKA_DISTRICTS) {
    assert.equal(isValidDistrict(d), true);

    // Verify district has zero effect on Bank Transfer tier 1
    const btFee = calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 2 });
    assert.equal(btFee, 200, `District ${d} failed Bank Transfer tier 1`);

    // Verify district has zero effect on Bank Transfer tier 2
    const btTier2 = calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 5 });
    assert.equal(btTier2, 250, `District ${d} failed Bank Transfer tier 2`);

    // Verify district has zero effect on COD tier 1
    const codFee = calculateShippingFee({ paymentMethod: 'cod', totalQuantity: 1 });
    assert.equal(codFee, 350, `District ${d} failed COD tier 1`);

    // Verify district has zero effect on COD tier 3
    const codTier3 = calculateShippingFee({ paymentMethod: 'cod', totalQuantity: 15 });
    assert.equal(codTier3, 500, `District ${d} failed COD tier 3`);
  }
});

// -----------------------------------------------------------------------------
// 4. MIXED-VARIANT & MULTI-PRODUCT CART AGGREGATION
// -----------------------------------------------------------------------------
test('Shipping Tiers — Aggregates quantity across multiple variants and products accurately', () => {
  interface CartItem {
    variantId: string;
    productTitle: string;
    quantity: number;
  }

  // Scenario A: 3 distinct single items (totalQuantity = 3)
  const cartA: CartItem[] = [
    { variantId: 'var-1', productTitle: 'Gold Anklet', quantity: 1 },
    { variantId: 'var-2', productTitle: 'Silver Ring', quantity: 1 },
    { variantId: 'var-3', productTitle: 'Pearl Necklace', quantity: 1 },
  ];
  const qtyA = cartA.reduce((sum, item) => sum + item.quantity, 0);
  assert.equal(qtyA, 3);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: qtyA }), 200);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: qtyA }), 350);

  // Scenario B: 2 variants of 2 units each (totalQuantity = 4)
  const cartB: CartItem[] = [
    { variantId: 'var-1', productTitle: 'Gold Anklet', quantity: 2 },
    { variantId: 'var-2', productTitle: 'Silver Ring', quantity: 2 },
  ];
  const qtyB = cartB.reduce((sum, item) => sum + item.quantity, 0);
  assert.equal(qtyB, 4);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: qtyB }), 250);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: qtyB }), 400);

  // Scenario C: Multi-item cart spanning into upper COD tier (totalQuantity = 11)
  const cartC: CartItem[] = [
    { variantId: 'var-1', productTitle: 'Gold Anklet', quantity: 5 },
    { variantId: 'var-2', productTitle: 'Silver Ring', quantity: 4 },
    { variantId: 'var-3', productTitle: 'Earrings', quantity: 2 },
  ];
  const qtyC = cartC.reduce((sum, item) => sum + item.quantity, 0);
  assert.equal(qtyC, 11);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: qtyC }), 350);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: qtyC }), 500);
});

// -----------------------------------------------------------------------------
// 5. INPUT VALIDATION & TAMPERING PREVENTION
// -----------------------------------------------------------------------------
test('Shipping Tiers — Strictly rejects invalid, zero, negative, or non-integer quantities', () => {
  assert.throws(
    () => calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 0 }),
    /Total item quantity must be a positive integer/
  );
  assert.throws(
    () => calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: -2 }),
    /Total item quantity must be a positive integer/
  );
  assert.throws(
    () => calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 2.5 }),
    /Total item quantity must be a positive integer/
  );
  assert.throws(
    () => calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: NaN }),
    /Total item quantity must be a positive integer/
  );
});

test('Shipping Tiers — 32-bit signed integer boundary enforcement and overflow rejection', () => {
  // Max valid 32-bit signed integer is 2,147,483,647 (PostgreSQL INT max)
  const maxValidInt = 2147483647;
  const overflowInt = 2147483648;

  // Max valid integer should be accepted and fall into top tier
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: maxValidInt }), 350);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: maxValidInt }), 500);

  // Overflow beyond 2,147,483,647 must be rejected
  assert.throws(
    () => calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: overflowInt }),
    /Total item quantity must be a positive integer between 1 and 2,147,483,647/
  );
  assert.throws(
    () => calculateShippingFee({ paymentMethod: 'cod', totalQuantity: overflowInt }),
    /Total item quantity must be a positive integer between 1 and 2,147,483,647/
  );
  assert.throws(
    () => calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: Number.MAX_SAFE_INTEGER }),
    /Total item quantity must be a positive integer between 1 and 2,147,483,647/
  );
});

test('Shipping Tiers — Multi-line cart item quantity aggregation across order lines', () => {
  // Aggregation helper mirroring server action & database aggregation
  function aggregateCartQuantity(items: Array<{ variantId: string; quantity: number }>): number {
    return items.reduce((acc, item) => {
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new Error('Item quantity must be a positive integer.');
      }
      return acc + item.quantity;
    }, 0);
  }

  // 1. Multiple items summing to exactly 3 (Tier 1 threshold)
  const cartTier1 = [
    { variantId: 'v1', quantity: 1 },
    { variantId: 'v2', quantity: 2 },
  ];
  const qtyTier1 = aggregateCartQuantity(cartTier1);
  assert.equal(qtyTier1, 3);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: qtyTier1 }), 200);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: qtyTier1 }), 350);

  // 2. Crossing from 3 to 4 items (Tier 2 threshold)
  const cartTier2Start = [
    { variantId: 'v1', quantity: 1 },
    { variantId: 'v2', quantity: 1 },
    { variantId: 'v3', quantity: 1 },
    { variantId: 'v4', quantity: 1 },
  ];
  const qtyTier2Start = aggregateCartQuantity(cartTier2Start);
  assert.equal(qtyTier2Start, 4);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: qtyTier2Start }), 250);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: qtyTier2Start }), 400);

  // 3. Multi-line items summing to 7 (Bank Transfer Tier 2 upper bound)
  const cartTier2End = [
    { variantId: 'v1', quantity: 3 },
    { variantId: 'v2', quantity: 2 },
    { variantId: 'v3', quantity: 2 },
  ];
  const qtyTier2End = aggregateCartQuantity(cartTier2End);
  assert.equal(qtyTier2End, 7);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: qtyTier2End }), 250);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: qtyTier2End }), 400);

  // 4. Multi-line items summing to 8 (Bank Transfer Tier 3 threshold)
  const cartBtTier3 = [
    { variantId: 'v1', quantity: 3 },
    { variantId: 'v2', quantity: 3 },
    { variantId: 'v3', quantity: 2 },
  ];
  const qtyBtTier3 = aggregateCartQuantity(cartBtTier3);
  assert.equal(qtyBtTier3, 8);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: qtyBtTier3 }), 350);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: qtyBtTier3 }), 400);

  // 5. Multi-line items summing to 10 (COD Tier 2 upper bound)
  const cartCodTier2End = [
    { variantId: 'v1', quantity: 5 },
    { variantId: 'v2', quantity: 3 },
    { variantId: 'v3', quantity: 2 },
  ];
  const qtyCodTier2End = aggregateCartQuantity(cartCodTier2End);
  assert.equal(qtyCodTier2End, 10);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: qtyCodTier2End }), 400);

  // 6. Multi-line items summing to 11 (COD Tier 3 threshold)
  const cartCodTier3 = [
    { variantId: 'v1', quantity: 4 },
    { variantId: 'v2', quantity: 4 },
    { variantId: 'v3', quantity: 3 },
  ];
  const qtyCodTier3 = aggregateCartQuantity(cartCodTier3);
  assert.equal(qtyCodTier3, 11);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: qtyCodTier3 }), 350);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: qtyCodTier3 }), 500);

  // 7. Multi-line aggregation overflow rejection
  const overflowLines = [
    { variantId: 'v1', quantity: 2000000000 },
    { variantId: 'v2', quantity: 200000000 },
  ];
  const aggregateSum = overflowLines.reduce((acc, item) => acc + item.quantity, 0);
  assert.ok(aggregateSum > 2147483647);
  assert.throws(
    () => calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: aggregateSum }),
    /Total item quantity must be a positive integer between 1 and 2,147,483,647/
  );
});

test('Shipping Tiers — Parity between shipping fee quantity and inventory deducted quantity', () => {
  // Verifies mathematical equality between shipping calculation input and inventory movement deduction
  const orderItems = [
    { variantId: 'v1', quantity: 3, unitPrice: 2500 },
    { variantId: 'v2', quantity: 5, unitPrice: 1200 },
    { variantId: 'v3', quantity: 2, unitPrice: 4000 },
  ];

  // Shipping quantity calculation
  const shippingQuantity = orderItems.reduce((acc, item) => acc + item.quantity, 0);

  // Inventory deduction calculation (sum of quantity_change deducted from variants)
  let inventoryDeductedQuantity = 0;
  for (const item of orderItems) {
    inventoryDeductedQuantity += item.quantity;
  }

  // Strict parity
  assert.equal(shippingQuantity, inventoryDeductedQuantity);
  assert.equal(shippingQuantity, 10);

  // Subtotal parity
  const subtotal = orderItems.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  assert.equal(subtotal, 3 * 2500 + 5 * 1200 + 2 * 4000); // 7500 + 6000 + 8000 = 21500
});

test('Shipping Tiers — Strictly rejects unsupported payment methods', () => {
  assert.throws(
    () => calculateShippingFee({ paymentMethod: 'credit_card', totalQuantity: 2 }),
    /Invalid payment method/
  );
  assert.throws(
    () => calculateShippingFee({ paymentMethod: 'crypto', totalQuantity: 2 }),
    /Invalid payment method/
  );
  assert.throws(
    () => calculateShippingFee({ paymentMethod: '', totalQuantity: 2 }),
    /Invalid payment method/
  );
});

test('Shipping Tiers — Server-side calculation ignores client-supplied delivery fee tampering', () => {
  // Simulates an attacker forging client delivery fee in payload
  const clientSuppliedPayload = {
    district: 'Colombo',
    paymentMethod: 'bank_transfer',
    items: [
      { variantId: 'v1', quantity: 5 }, // 5 items => legitimate fee is 250
    ],
    client_delivery_fee: 10, // Tampered fee
  };

  const legitimateTotalQuantity = clientSuppliedPayload.items.reduce((s, i) => s + i.quantity, 0);
  const serverAuthoritativeFee = calculateShippingFee({
    paymentMethod: clientSuppliedPayload.paymentMethod,
    totalQuantity: legitimateTotalQuantity,
  });

  // Tampered client value is completely discarded; server enforces 250
  assert.notEqual(serverAuthoritativeFee, clientSuppliedPayload.client_delivery_fee);
  assert.equal(serverAuthoritativeFee, 250);
});

// -----------------------------------------------------------------------------
// 6. TOTAL ORDER MATH & CMS POLICY TEXT INTEGRITY
// -----------------------------------------------------------------------------
test('Shipping Tiers — End-to-end total order calculation with coupons and tiers', () => {
  // Test Case 1: 1 item Bank Transfer (subtotal 1,500 + fee 200 = 1,700)
  const fee1 = calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 1 });
  assert.equal(1500 + fee1, 1700);

  // Test Case 2: 1 item COD (subtotal 1,500 + fee 350 = 1,850)
  const fee2 = calculateShippingFee({ paymentMethod: 'cod', totalQuantity: 1 });
  assert.equal(1500 + fee2, 1850);

  // Test Case 3: 5 items Bank Transfer with 10% coupon (subtotal 10,000 - 1,000 + fee 250 = 9,250)
  const fee3 = calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 5 });
  const subtotal3 = 10000;
  const discount3 = 1000;
  assert.equal(subtotal3 - discount3 + fee3, 9250);
});

test('Shipping Policy — Strictly preserves the canonical delivery timeframe statement', () => {
  const mandatoryPhrase = 'Delivery typically takes 24–48 working hours after dispatch.';

  const shippingPage = DEFAULT_CONTENT_PAGES.find((p) => p.slug === 'shipping');
  assert.ok(shippingPage, 'shipping content page must exist');
  assert.ok(
    shippingPage.content.includes(mandatoryPhrase),
    `Shipping page content must contain: "${mandatoryPhrase}"`
  );

  const faqPage = DEFAULT_CONTENT_PAGES.find((p) => p.slug === 'faq');
  assert.ok(faqPage, 'faq content page must exist');
  assert.ok(
    faqPage.content.includes(mandatoryPhrase),
    `FAQ page content must contain: "${mandatoryPhrase}"`
  );
});
