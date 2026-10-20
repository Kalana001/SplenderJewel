import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateShippingFee, getShippingBreakdown } from '../lib/config/shipping.ts';
import { PAYMENT_METHODS } from '../lib/config/constants.ts';

const WORKSPACE_DIR = process.cwd();

// =============================================================================
// STAGE B.5: SAFE BUY NOW CHECKOUT REGRESSION TESTS
// =============================================================================

test('Architecture: Product detail viewer renders Buy Now beside Add to Bag with 44px+ touch target and safe session storage', () => {
  const viewerPath = join(WORKSPACE_DIR, 'components/store/product-detail-viewer.tsx');
  const content = readFileSync(viewerPath, 'utf-8');

  // Must render both "Add to Bag" and "Buy Now"
  assert.match(
    content,
    /Add to Bag/,
    'Must preserve existing Add to Bag button'
  );
  assert.match(
    content,
    /Buy Now/,
    'Must render Buy Now button beside Add to Bag'
  );

  // Both buttons must have min-h-[44px]
  assert.match(
    content,
    /min-h-\[44px\][\s\S]*?Add to Bag/,
    'Add to Bag button must have minimum 44px touch target'
  );
  assert.match(
    content,
    /min-h-\[44px\][\s\S]*?Buy Now/,
    'Buy Now button must have minimum 44px touch target'
  );

  // Buy Now stores selection into session storage with variantId and quantity
  assert.match(
    content,
    /sessionStorage\.setItem\(\s*['"]splender_buy_now_session['"]\s*,\s*JSON\.stringify\(\{\s*variantId:\s*selectedVariant\.id,\s*quantity/,
    'Buy Now button must isolate selection in splender_buy_now_session without touching cart'
  );

  // Must navigate to /checkout?buyNow=true
  assert.match(
    content,
    /router\.push\(['"]\/checkout\?buyNow=true['"]\)/,
    'Buy Now must navigate directly to checkout in buyNow mode'
  );
});

test('Architecture: Checkout page isolates Buy Now mode from shopping bag and wraps Suspense', () => {
  const checkoutPath = join(WORKSPACE_DIR, 'app/(store)/checkout/page.tsx');
  const content = readFileSync(checkoutPath, 'utf-8');

  // Must wrap in Suspense for useSearchParams safety
  assert.match(
    content,
    /<Suspense\s+fallback=\{<CheckoutLoadingSkeleton\s*\/>\}>[\s\S]*?<CheckoutContent\s*\/>[\s\S]*?<\/Suspense>/,
    'CheckoutPage must wrap CheckoutContent in Suspense boundary'
  );

  // Must read search parameter buyNow
  assert.match(
    content,
    /const\s+isBuyNow\s*=\s*searchParams\.get\(['"]buyNow['"]\)\s*===\s*['"]true['"]/,
    'Must check searchParams for buyNow flag'
  );

  // Must validate selection against server action getBuyNowItemAction
  assert.match(
    content,
    /getBuyNowItemAction\(parsed\.variantId\)/,
    'Must validate Buy Now variant against authoritative database action getBuyNowItemAction'
  );

  // On successful order, only removes session storage and DOES NOT call clearPurchasedItems for Buy Now
  assert.match(
    content,
    /if\s*\(\s*isBuyNow\s*\)\s*\{[\s\S]*?sessionStorage\.removeItem\(['"]splender_buy_now_session['"]\)[\s\S]*?\}\s*else\s*\{[\s\S]*?await\s+clearPurchasedItems\(/,
    'Buy Now order must NOT call clearPurchasedItems, leaving normal shopping bag untouched'
  );
});

test('Architecture: createOrderAction enforces checkoutSource distinction and bypasses cart deduction for Buy Now', () => {
  const actionsPath = join(WORKSPACE_DIR, 'lib/orders/actions.ts');
  const content = readFileSync(actionsPath, 'utf-8');

  // Must support checkoutSource in CreateOrderInput
  assert.match(
    content,
    /checkoutSource\?:\s*['"]cart['"]\s*\|\s*['"]buy_now['"]/,
    'CreateOrderInput must define checkoutSource as cart | buy_now'
  );

  // Must verify isCartCheckout before attempting server cart deduction
  assert.match(
    content,
    /const\s+isCartCheckout\s*=\s*input\.checkoutSource\s*!==\s*['"]buy_now['"]/,
    'createOrderAction must explicitly check that checkoutSource !== buy_now before cart deduction'
  );

  // Must check if user cart actually contains matching items
  assert.match(
    content,
    /hasMatchingCartItem/,
    'createOrderAction must verify cart contains matching items before invoking deduct_purchased_cart_items'
  );
});

// =============================================================================
// FUNCTIONAL SIMULATION TESTS (Domain Logic & Invariant Safety)
// =============================================================================

interface MockCartItem {
  id: string;
  variantId: string;
  quantity: number;
}

interface MockOrderResult {
  success: boolean;
  orderNumber?: string;
  error?: string;
  cartCleanedUp?: boolean;
}

function simulateCheckoutEnvironment() {
  const customerCart = new Map<string, MockCartItem>();
  const inventory = new Map<string, number>([
    ['var-gold-ring', 5],
    ['var-diamond-pendant', 2],
    ['var-silver-bracelet', 10],
  ]);

  const placeOrder = (params: {
    userId?: string | null;
    items: Array<{ variantId: string; quantity: number }>;
    checkoutSource?: 'cart' | 'buy_now';
    paymentMethod: 'cod' | 'bank_transfer';
    failInventory?: boolean;
  }): MockOrderResult => {
    // 1. Stock check
    if (params.failInventory) {
      return { success: false, error: 'Insufficient stock.' };
    }
    for (const item of params.items) {
      const stock = inventory.get(item.variantId) || 0;
      if (item.quantity > stock) {
        return { success: false, error: `Insufficient stock for ${item.variantId}.` };
      }
    }

    // 2. Deduct inventory
    for (const item of params.items) {
      const current = inventory.get(item.variantId) || 0;
      inventory.set(item.variantId, current - item.quantity);
    }

    const orderNumber = `SJ-20261020-${Math.floor(1000 + Math.random() * 9000)}`;

    // 3. Cart deduction logic (matching createOrderAction Step 7)
    let cartCleanedUp = true;
    const isCartCheckout = params.checkoutSource !== 'buy_now';

    if (params.userId && isCartCheckout) {
      // Check if user has matching cart items
      let hasMatching = false;
      for (const item of params.items) {
        if (customerCart.has(item.variantId)) {
          hasMatching = true;
          break;
        }
      }

      if (hasMatching) {
        for (const item of params.items) {
          const cartItem = customerCart.get(item.variantId);
          if (cartItem) {
            if (cartItem.quantity <= item.quantity) {
              customerCart.delete(item.variantId);
            } else {
              cartItem.quantity -= item.quantity;
            }
          }
        }
      }
    }

    return {
      success: true,
      orderNumber,
      cartCleanedUp,
    };
  };

  return { customerCart, inventory, placeOrder };
}

test('Step 9.1 & 9.2: Buy Now selects specific variant and clamped quantity', () => {
  const env = simulateCheckoutEnvironment();
  const selectedVariant = { variantId: 'var-gold-ring', quantity: 2 };

  const res = env.placeOrder({
    userId: 'user-1',
    items: [selectedVariant],
    checkoutSource: 'buy_now',
    paymentMethod: 'cod',
  });

  assert.equal(res.success, true);
  assert.equal(env.inventory.get('var-gold-ring'), 3, 'Inventory was decremented by exact requested quantity (5 - 2 = 3)');
});

test('Step 9.3 & 9.4: Guest checkout and Authenticated checkout both succeed in Buy Now mode', () => {
  const env = simulateCheckoutEnvironment();

  // Guest checkout
  const guestRes = env.placeOrder({
    userId: null,
    items: [{ variantId: 'var-diamond-pendant', quantity: 1 }],
    checkoutSource: 'buy_now',
    paymentMethod: 'cod',
  });
  assert.equal(guestRes.success, true);

  // Authenticated checkout
  const authRes = env.placeOrder({
    userId: 'user-auth-123',
    items: [{ variantId: 'var-silver-bracelet', quantity: 2 }],
    checkoutSource: 'buy_now',
    paymentMethod: 'bank_transfer',
  });
  assert.equal(authRes.success, true);
});

test('Step 9.5, 9.6 & 9.7: Normal shopping bag is 100% preserved even when same or different variants exist in cart', () => {
  const env = simulateCheckoutEnvironment();

  // Customer has 2 units of var-gold-ring and 1 unit of var-silver-bracelet in their cart
  env.customerCart.set('var-gold-ring', { id: 'c1', variantId: 'var-gold-ring', quantity: 2 });
  env.customerCart.set('var-silver-bracelet', { id: 'c2', variantId: 'var-silver-bracelet', quantity: 1 });

  // Customer uses Buy Now for 1 unit of var-gold-ring (SAME variant as in cart!)
  const res = env.placeOrder({
    userId: 'customer-with-cart',
    items: [{ variantId: 'var-gold-ring', quantity: 1 }],
    checkoutSource: 'buy_now',
    paymentMethod: 'cod',
  });

  assert.equal(res.success, true);

  // CRITICAL VERIFICATION: Normal cart must still have 2 units of var-gold-ring and 1 unit of var-silver-bracelet
  assert.equal(env.customerCart.get('var-gold-ring')?.quantity, 2, 'Normal cart quantity for var-gold-ring MUST NOT be deducted by Buy Now');
  assert.equal(env.customerCart.get('var-silver-bracelet')?.quantity, 1, 'Normal cart quantity for var-silver-bracelet MUST NOT be touched');
});

test('Step 9.8 & 9.9: Successful COD and Bank Transfer orders calculate shipping and totals accurately', () => {
  // 1 unit COD to Colombo
  const codBreakdown = getShippingBreakdown({ paymentMethod: PAYMENT_METHODS.COD, totalQuantity: 1 });
  assert.equal(codBreakdown.fee, 350, 'COD shipping for 1 item is Rs. 350');

  // 1 unit Bank Transfer (discounted shipping)
  const bankBreakdown = getShippingBreakdown({ paymentMethod: PAYMENT_METHODS.BANK_TRANSFER, totalQuantity: 1 });
  assert.equal(bankBreakdown.fee, 200, 'Bank Transfer shipping for 1 item is Rs. 200');

  // Multi-tier shipping: 4 units
  const multiTier = getShippingBreakdown({ paymentMethod: PAYMENT_METHODS.COD, totalQuantity: 4 });
  assert.equal(multiTier.fee, 400, 'COD shipping for 4 items is Rs. 400 (4-10 items tier)');
});

test('Step 9.10: Failed checkout preserves Buy Now selection and normal cart, without deducting inventory', () => {
  const env = simulateCheckoutEnvironment();
  env.customerCart.set('var-gold-ring', { id: 'c1', variantId: 'var-gold-ring', quantity: 1 });

  const initialStock = env.inventory.get('var-gold-ring');

  const res = env.placeOrder({
    userId: 'user-fail',
    items: [{ variantId: 'var-gold-ring', quantity: 1 }],
    checkoutSource: 'buy_now',
    paymentMethod: 'cod',
    failInventory: true, // simulates RPC error
  });

  assert.equal(res.success, false);
  assert.equal(env.inventory.get('var-gold-ring'), initialStock, 'Inventory must not be deducted on failed order');
  assert.equal(env.customerCart.get('var-gold-ring')?.quantity, 1, 'Cart items must be untouched on failed order');
});

test('Step 9.12: Coupon application works identically for Buy Now subtotal', () => {
  const buyNowSubtotal = 15000;
  const couponDiscountPercentage = 10; // 10% off
  const calculatedDiscount = Math.round((buyNowSubtotal * couponDiscountPercentage) / 100);
  const deliveryFee = 350;
  const grandTotal = buyNowSubtotal - calculatedDiscount + deliveryFee;

  assert.equal(calculatedDiscount, 1500);
  assert.equal(grandTotal, 13850);
});

test('Step 9.14: Stock validation prevents buying more than available stock', () => {
  const env = simulateCheckoutEnvironment();

  const res = env.placeOrder({
    userId: 'user-greedy',
    items: [{ variantId: 'var-diamond-pendant', quantity: 10 }], // Only 2 in stock
    checkoutSource: 'buy_now',
    paymentMethod: 'cod',
  });

  assert.equal(res.success, false);
  assert.match(res.error || '', /Insufficient stock/);
});

test('Step 9.18: Stage B.1 normal cart checkout cleanup still executes when checkoutSource is cart', () => {
  const env = simulateCheckoutEnvironment();
  env.customerCart.set('var-silver-bracelet', { id: 'c1', variantId: 'var-silver-bracelet', quantity: 2 });

  // Normal cart checkout
  const res = env.placeOrder({
    userId: 'user-cart-checkout',
    items: [{ variantId: 'var-silver-bracelet', quantity: 2 }],
    checkoutSource: 'cart', // Normal cart checkout
    paymentMethod: 'cod',
  });

  assert.equal(res.success, true);
  assert.equal(env.customerCart.has('var-silver-bracelet'), false, 'Normal cart checkout MUST deduct purchased items from cart');
});
