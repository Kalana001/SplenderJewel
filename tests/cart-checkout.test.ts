import test from 'node:test';
import assert from 'node:assert/strict';
import { SRI_LANKA_DISTRICTS, isValidDistrict, getEstimatedDeliveryFee } from '../lib/config/districts.ts';
import { PAYMENT_METHODS } from '../lib/config/constants.ts';

// -----------------------------------------------------------------------------
// 1. DISTRICT VALIDATION & DELIVERY PRICING
// -----------------------------------------------------------------------------
test('District validation: accurately validates all 25 official districts and rejects invalid values', () => {
  assert.equal(SRI_LANKA_DISTRICTS.length, 25);
  assert.equal(isValidDistrict('Colombo'), true);
  assert.equal(isValidDistrict('Kandy'), true);
  assert.equal(isValidDistrict('Galle'), true);
  assert.equal(isValidDistrict('Jaffna'), true);
  assert.equal(isValidDistrict('London'), false);
  assert.equal(isValidDistrict('California'), false);
  assert.equal(isValidDistrict(''), false);
});

test('District delivery rates: Western Province returns Rs. 350, other districts return Rs. 450', () => {
  // Western Province
  assert.equal(getEstimatedDeliveryFee('Colombo'), 350);
  assert.equal(getEstimatedDeliveryFee('Gampaha'), 350);
  assert.equal(getEstimatedDeliveryFee('Kalutara'), 350);

  // Other Provinces
  assert.equal(getEstimatedDeliveryFee('Kandy'), 450);
  assert.equal(getEstimatedDeliveryFee('Galle'), 450);
  assert.equal(getEstimatedDeliveryFee('Matara'), 450);
  assert.equal(getEstimatedDeliveryFee('Jaffna'), 450);
  assert.equal(getEstimatedDeliveryFee('Anuradhapura'), 450);
  assert.equal(getEstimatedDeliveryFee('Batticaloa'), 450);

  // Default fallback when empty or null
  assert.equal(getEstimatedDeliveryFee(null), 350);
});

// -----------------------------------------------------------------------------
// 2. CART LOGIC SIMULATION
// -----------------------------------------------------------------------------
test('Cart operations: correctly adds items, merges duplicates, updates quantity, and derives totals', () => {
  interface SimCartItem {
    variantId: string;
    productName: string;
    price: number;
    discountPrice?: number | null;
    quantity: number;
  }

  let cart: SimCartItem[] = [];

  const addItem = (item: Omit<SimCartItem, 'quantity'>, qty: number = 1) => {
    const existingIndex = cart.findIndex((i) => i.variantId === item.variantId);
    if (existingIndex > -1) {
      cart[existingIndex].quantity += qty;
    } else {
      cart.push({ ...item, quantity: qty });
    }
  };

  const updateQuantity = (variantId: string, qty: number) => {
    if (qty <= 0) {
      cart = cart.filter((i) => i.variantId !== variantId);
    } else {
      const item = cart.find((i) => i.variantId === variantId);
      if (item) item.quantity = qty;
    }
  };

  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => {
      const price = item.discountPrice != null && item.discountPrice > 0 ? item.discountPrice : item.price;
      return sum + price * item.quantity;
    }, 0);
  };

  // 1. Add first jewelry item
  addItem({
    variantId: 'var-1',
    productName: 'Royal Emerald Cut Gold Ring',
    price: 15000,
    discountPrice: 12500,
  }, 1);

  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 1);
  assert.equal(calculateSubtotal(), 12500);

  // 2. Add same variant again (should increment quantity, not duplicate line)
  addItem({
    variantId: 'var-1',
    productName: 'Royal Emerald Cut Gold Ring',
    price: 15000,
    discountPrice: 12500,
  }, 2);

  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 3);
  assert.equal(calculateSubtotal(), 37500); // 12,500 * 3

  // 3. Add second different jewelry item
  addItem({
    variantId: 'var-2',
    productName: 'Tiger Eye Beaded Bracelet',
    price: 6000,
    discountPrice: null,
  }, 1);

  assert.equal(cart.length, 2);
  assert.equal(calculateSubtotal(), 43500); // 37,500 + 6,000

  // 4. Update quantity
  updateQuantity('var-1', 1);
  assert.equal(calculateSubtotal(), 18500); // 12,500 * 1 + 6,000 * 1

  // 5. Remove item (setting qty to 0)
  updateQuantity('var-2', 0);
  assert.equal(cart.length, 1);
  assert.equal(calculateSubtotal(), 12500);
});

// -----------------------------------------------------------------------------
// 3. CHECKOUT INPUT VALIDATION
// -----------------------------------------------------------------------------
test('Checkout validation: enforces mandatory customer name, phone, address, district, and payment method', () => {
  const validateCheckoutPayload = (input: {
    customerName: string;
    phone1: string;
    addressLine: string;
    district: string;
    paymentMethod: string;
    itemsCount: number;
  }) => {
    if (!input.customerName?.trim()) throw new Error('Full recipient name is required');
    if (!input.phone1?.trim()) throw new Error('Primary contact phone is required');
    if (!input.addressLine?.trim()) throw new Error('Delivery address is required');
    if (!isValidDistrict(input.district)) throw new Error('Valid Sri Lankan district is required');
    if (![PAYMENT_METHODS.COD, PAYMENT_METHODS.BANK_TRANSFER].includes(input.paymentMethod as any)) {
      throw new Error('Valid payment method is required');
    }
    if (input.itemsCount <= 0) throw new Error('Bag must contain items');
    return true;
  };

  // Valid payload passes
  assert.equal(
    validateCheckoutPayload({
      customerName: 'Kasun Perera',
      phone1: '0771234567',
      addressLine: 'No. 12, Galle Road, Colombo 03',
      district: 'Colombo',
      paymentMethod: PAYMENT_METHODS.COD,
      itemsCount: 2,
    }),
    true
  );

  // Missing recipient name
  assert.throws(
    () =>
      validateCheckoutPayload({
        customerName: '',
        phone1: '0771234567',
        addressLine: 'No. 12, Galle Road',
        district: 'Colombo',
        paymentMethod: PAYMENT_METHODS.COD,
        itemsCount: 1,
      }),
    /Full recipient name is required/
  );

  // Missing phone number
  assert.throws(
    () =>
      validateCheckoutPayload({
        customerName: 'Kasun Perera',
        phone1: '   ',
        addressLine: 'No. 12, Galle Road',
        district: 'Colombo',
        paymentMethod: PAYMENT_METHODS.COD,
        itemsCount: 1,
      }),
    /Primary contact phone is required/
  );

  // Invalid district
  assert.throws(
    () =>
      validateCheckoutPayload({
        customerName: 'Kasun Perera',
        phone1: '0771234567',
        addressLine: 'No. 12, Galle Road',
        district: 'InvalidDistrict',
        paymentMethod: PAYMENT_METHODS.COD,
        itemsCount: 1,
      }),
    /Valid Sri Lankan district is required/
  );

  // Empty cart
  assert.throws(
    () =>
      validateCheckoutPayload({
        customerName: 'Kasun Perera',
        phone1: '0771234567',
        addressLine: 'No. 12, Galle Road',
        district: 'Colombo',
        paymentMethod: PAYMENT_METHODS.COD,
        itemsCount: 0,
      }),
    /Bag must contain items/
  );
});

// -----------------------------------------------------------------------------
// 4. ORDER CONFIRMATION AUTHORIZATION VERIFICATION
// -----------------------------------------------------------------------------
test('Order confirmation access control: allows access only via matching order token or session owner', () => {
  const verifyOrderAccess = (
    order: { orderNumber: string; orderToken: string; userId: string | null },
    queryToken: string | null | undefined,
    sessionUserId: string | null | undefined
  ) => {
    const isAuthorizedByToken = Boolean(queryToken && order.orderToken && queryToken === order.orderToken);
    const isAuthorizedByUser = Boolean(sessionUserId && order.userId && sessionUserId === order.userId);
    return isAuthorizedByToken || isAuthorizedByUser;
  };

  const guestOrder = {
    orderNumber: 'SJ-20261011-0001',
    orderToken: 'guest-secret-token-abc123xyz',
    userId: null,
  };

  const customerOrder = {
    orderNumber: 'SJ-20261011-0002',
    orderToken: 'customer-secret-token-def456uvw',
    userId: 'user-uuid-customer-1',
  };

  // Case 1: Guest with correct token -> ALLOWED
  assert.equal(verifyOrderAccess(guestOrder, 'guest-secret-token-abc123xyz', null), true);

  // Case 2: Guest with incorrect token -> DENIED
  assert.equal(verifyOrderAccess(guestOrder, 'wrong-token', null), false);

  // Case 3: Guest with missing token -> DENIED
  assert.equal(verifyOrderAccess(guestOrder, null, null), false);

  // Case 4: Customer accessing own order via session -> ALLOWED
  assert.equal(verifyOrderAccess(customerOrder, null, 'user-uuid-customer-1'), true);

  // Case 5: Different customer accessing another customer's order without token -> DENIED
  assert.equal(verifyOrderAccess(customerOrder, null, 'user-uuid-different-customer'), false);

  // Case 6: Anonymous visitor attempting to access customer's order without token -> DENIED
  assert.equal(verifyOrderAccess(customerOrder, null, null), false);
});
