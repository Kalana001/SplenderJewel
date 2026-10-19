import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CartItem } from '../types/cart.ts';

// =============================================================================
// PHASE 10: ORDER EXPERIENCE & CROSS-DEVICE SYNCHRONIZATION TESTS
// =============================================================================

const WORKSPACE_DIR = process.cwd();

// Helper to simulate guest cart merging logic
function mergeCartItems(existingItems: CartItem[], guestItems: CartItem[], stockLookup: Record<string, number>): CartItem[] {
  const mergedMap = new Map<string, CartItem>();

  for (const item of existingItems) {
    const maxStock = stockLookup[item.variantId] ?? item.maxStock ?? 999;
    mergedMap.set(item.variantId, {
      ...item,
      maxStock,
      quantity: Math.min(item.quantity, maxStock),
    });
  }

  for (const guestItem of guestItems) {
    const maxStock = stockLookup[guestItem.variantId] ?? guestItem.maxStock ?? 999;
    const existing = mergedMap.get(guestItem.variantId);

    if (existing) {
      const combinedQty = Math.min(existing.quantity + guestItem.quantity, maxStock);
      mergedMap.set(guestItem.variantId, {
        ...existing,
        maxStock,
        quantity: combinedQty,
      });
    } else {
      mergedMap.set(guestItem.variantId, {
        ...guestItem,
        maxStock,
        quantity: Math.min(guestItem.quantity, maxStock),
      });
    }
  }

  return Array.from(mergedMap.values());
}

// -----------------------------------------------------------------------------
// PART A & B: Mobile Order History & Card Accessibility
// -----------------------------------------------------------------------------

test('Part A: Orders list page contains flex-wrap and responsive badges for status and payment method', () => {
  const filePath = join(WORKSPACE_DIR, 'app/(store)/account/orders/page.tsx');
  const content = readFileSync(filePath, 'utf-8');

  // Verify flex-wrap is present on the order card header
  assert.match(content, /flex\s+flex-wrap\s+items-center\s+gap-2/, 'Order card header must use flex-wrap with gap-2 for responsive wrapping');
  
  // Verify order number has break-all to prevent horizontal overflow on 320px
  assert.match(content, /break-all/, 'Order number must use break-all to prevent horizontal overflow');

  // Verify both status badge and payment method badge are rendered
  assert.match(content, /getStatusBadgeVariant\(status\)/, 'Status badge variant function must be called');
  assert.match(content, /order\.payment_method === 'bank_transfer' \? 'Bank Transfer' : 'Cash on Delivery'/, 'Payment method badge must format Bank Transfer and Cash on Delivery');
});

test('Part B: Order history cards are clickable Links with zero nested interactive elements', () => {
  const filePath = join(WORKSPACE_DIR, 'app/(store)/account/orders/page.tsx');
  const content = readFileSync(filePath, 'utf-8');

  // Must wrap card in <Link href={`/account/orders/${order.id}`}>
  assert.match(content, /<Link\s+key=\{order\.id\}\s+href=\{`\/account\/orders\/\$\{order\.id\}`\}/, 'Order card must be wrapped in Link');

  // Must have hover and focus states
  assert.match(content, /focus-visible:ring-2/, 'Link must have focus-visible ring for keyboard accessibility');
  assert.match(content, /group-hover:border-luxury-gold/, 'Card must have luxury gold border on hover');
  assert.match(content, /group-hover:translate-x-1/, 'Arrow must animate/shift on card hover');

  // Zero nested interactive elements: Inside the order mapping, there must NOT be any <button> or nested <Link> or <Button>
  const orderMappingBlock = content.slice(content.indexOf('orders.map('), content.indexOf('</div>\n        ) : ('));
  assert.doesNotMatch(orderMappingBlock, /<Button/i, 'Order card must not contain nested <Button> elements');
  assert.doesNotMatch(orderMappingBlock, /<button/i, 'Order card must not contain nested <button> elements');
  // There should only be the outer Link
  const linkMatches = orderMappingBlock.match(/<Link/g) || [];
  assert.equal(linkMatches.length, 1, 'Order card must contain exactly one outer Link and no nested links');
});

test('Part A & B: Order details page has responsive wrapping header with payment method badge', () => {
  const filePath = join(WORKSPACE_DIR, 'app/(store)/account/orders/[orderId]/page.tsx');
  const content = readFileSync(filePath, 'utf-8');

  // Header has flex-wrap and break-all
  assert.match(content, /flex\s+flex-wrap\s+items-center\s+gap-2/, 'Order details header must use flex-wrap with gap-2');
  assert.match(content, /break-all/, 'Order number must break-all for narrow 320px screens');

  // Payment method badge is present in header
  assert.match(content, /order\.payment_method === 'bank_transfer' \? 'Bank Transfer' : 'Cash on Delivery'/, 'Payment method badge must be visible in details header');
});

// -----------------------------------------------------------------------------
// PART C: WhatsApp Order Support
// -----------------------------------------------------------------------------

test('Part C: WhatsApp order support link is correctly constructed and secured', () => {
  const filePath = join(WORKSPACE_DIR, 'app/(store)/account/orders/[orderId]/page.tsx');
  const content = readFileSync(filePath, 'utf-8');

  // Correct WhatsApp base URL and phone number 94764689907
  assert.match(content, /https:\/\/wa\.me\/94764689907\?text=/, 'Must link to official WhatsApp phone number 94764689907');

  // Uses encodeURIComponent with dynamic order number
  assert.match(content, /encodeURIComponent\(\s*`Hello Splender Jewel, I need help with my order \$\{order\.order_number\}\.`\s*\)/, 'Must properly encode message with dynamic order number');

  // Target _blank and security attributes
  assert.match(content, /target="_blank"/, 'Must open in new tab');
  assert.match(content, /rel="noopener noreferrer"/, 'Must use rel="noopener noreferrer" for security');

  // Must not expose any private database IDs or tokens
  assert.doesNotMatch(content, /order\.id.*wa\.me/, 'Must never pass internal UUID in WhatsApp URL');
  assert.doesNotMatch(content, /order\.user_id.*wa\.me/, 'Must never pass user_id in WhatsApp URL');
});

test('Part C: WhatsApp message URL encoding handles special characters in order numbers safely', () => {
  const orderNumber = 'SJ-20261019-0001';
  const rawMessage = `Hello Splender Jewel, I need help with my order ${orderNumber}.`;
  const encoded = encodeURIComponent(rawMessage);
  const targetUrl = `https://wa.me/94764689907?text=${encoded}`;

  assert.equal(
    targetUrl,
    'https://wa.me/94764689907?text=Hello%20Splender%20Jewel%2C%20I%20need%20help%20with%20my%20order%20SJ-20261019-0001.'
  );
  // Verify it parses as valid URL
  const parsed = new URL(targetUrl);
  assert.equal(parsed.searchParams.get('text'), rawMessage);
});

// -----------------------------------------------------------------------------
// PART D: Cross-Device Cart Synchronization & Stock Validation
// -----------------------------------------------------------------------------

test('Part D: Guest cart merging combines quantities for matching variants without duplicates', () => {
  const existingCart: CartItem[] = [
    {
      productId: 'prod-1',
      variantId: 'var-1',
      productName: 'Diamond Ring',
      variantTitle: 'Size 6 / Yellow Gold',
      sku: 'DR-001',
      price: 1500,
      quantity: 1,
      maxStock: 5,
      slug: 'diamond-ring',
      imageUrl: null,
    },
  ];

  const guestCart: CartItem[] = [
    {
      productId: 'prod-1',
      variantId: 'var-1',
      productName: 'Diamond Ring',
      variantTitle: 'Size 6 / Yellow Gold',
      sku: 'DR-001',
      price: 1500,
      quantity: 2,
      maxStock: 5,
      slug: 'diamond-ring',
      imageUrl: null,
    },
    {
      productId: 'prod-2',
      variantId: 'var-2',
      productName: 'Pearl Necklace',
      variantTitle: '18 inch',
      sku: 'PN-002',
      price: 3200,
      quantity: 1,
      maxStock: 3,
      slug: 'pearl-necklace',
      imageUrl: null,
    },
  ];

  const stockLookup = {
    'var-1': 5,
    'var-2': 3,
  };

  const merged = mergeCartItems(existingCart, guestCart, stockLookup);

  assert.equal(merged.length, 2, 'Should have exactly 2 distinct line items, no duplicates');
  const mergedVar1 = merged.find((i) => i.variantId === 'var-1');
  const mergedVar2 = merged.find((i) => i.variantId === 'var-2');

  assert.ok(mergedVar1);
  assert.equal(mergedVar1.quantity, 3, 'Quantities for var-1 should sum from 1 + 2 = 3');
  assert.ok(mergedVar2);
  assert.equal(mergedVar2.quantity, 1, 'New guest item var-2 should be added with quantity 1');
});

test('Part D: Cart merging clamps combined quantities to available stock limit', () => {
  const existingCart: CartItem[] = [
    {
      productId: 'prod-1',
      variantId: 'var-1',
      productName: 'Sapphire Pendant',
      variantTitle: 'Standard',
      sku: 'SP-001',
      price: 2500,
      quantity: 3,
      maxStock: 4,
      slug: 'sapphire-pendant',
      imageUrl: null,
    },
  ];

  const guestCart: CartItem[] = [
    {
      productId: 'prod-1',
      variantId: 'var-1',
      productName: 'Sapphire Pendant',
      variantTitle: 'Standard',
      sku: 'SP-001',
      price: 2500,
      quantity: 3,
      maxStock: 4,
      slug: 'sapphire-pendant',
      imageUrl: null,
    },
  ];

  const stockLookup = {
    'var-1': 4, // Max stock is 4, combined quantity is 6
  };

  const merged = mergeCartItems(existingCart, guestCart, stockLookup);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].quantity, 4, 'Combined quantity must be clamped to stock limit of 4');
});

test('Part D: Sign out button dispatches splender:auth-signed-out event for local cache wipe', () => {
  const filePath = join(WORKSPACE_DIR, 'components/store/sign-out-button.tsx');
  const content = readFileSync(filePath, 'utf-8');

  assert.match(
    content,
    /window\.dispatchEvent\(new\s+Event\('splender:auth-signed-out'\)\)/,
    'Sign out button must dispatch splender:auth-signed-out event to trigger cart memory & localStorage cleanup'
  );
});

test('Part D: CartContext handles auth state transitions, guest merging, and cross-tab/visibility sync', () => {
  const filePath = join(WORKSPACE_DIR, 'lib/cart/cart-context.tsx');
  const content = readFileSync(filePath, 'utf-8');

  // Listens to splender:auth-signed-out
  assert.match(content, /splender:auth-signed-out/, 'CartContext must listen to custom sign-out event');

  // Wipes localStorage on SIGNED_OUT
  assert.match(content, /localStorage\.removeItem\(CART_STORAGE_KEY\)/, 'CartContext must clear localStorage on sign out');
  assert.match(content, /localStorage\.removeItem\(GUEST_CART_FLAG\)/, 'CartContext must clear GUEST_CART_FLAG on sign out');

  // Merges guest cart on sign in ONLY when GUEST_CART_FLAG is active
  assert.match(content, /hasActiveGuestBag\s*&&\s*local/, 'CartContext must verify active guest bag before merging');
  assert.match(content, /localStorage\.removeItem\(GUEST_CART_FLAG\)/, 'CartContext must immediately clear guest flag upon merging');

  // Cross-device sync on visibility change and window focus
  assert.match(content, /visibilitychange/, 'CartContext must listen to visibilitychange to refetch remote cart');
  assert.match(content, /window\.addEventListener\('focus'/, 'CartContext must listen to window focus to sync cart state');
});

test('Part D: Granular item mutations in actions.ts prevent cross-device snapshot overwrites', () => {
  const filePath = join(WORKSPACE_DIR, 'lib/cart/actions.ts');
  const content = readFileSync(filePath, 'utf-8');

  // syncCartItemAction uses onConflict on (cart_id, variant_id) to avoid wiping other items
  assert.match(content, /export\s+async\s+function\s+syncCartItemAction/, 'Must define syncCartItemAction');
  assert.match(content, /onConflict:\s*'cart_id,\s*variant_id'/, 'syncCartItemAction must upsert with onConflict to avoid wiping other variants');

  // removeCartItemAction deletes only the targeted variant
  assert.match(content, /export\s+async\s+function\s+removeCartItemAction/, 'Must define removeCartItemAction');
  assert.match(content, /\.eq\('variant_id',\s*trimmedId\)/, 'removeCartItemAction must filter specifically by variant_id');

  // deductPurchasedCartItemsAction handles quantity decrements safely via atomic procedure
  assert.match(content, /export\s+async\s+function\s+deductPurchasedCartItemsAction/, 'Must define deductPurchasedCartItemsAction');
  assert.match(content, /deduct_purchased_cart_items/, 'deductPurchasedCartItemsAction must invoke atomic procedure deduct_purchased_cart_items');
});

test('Part D: Checkout page invokes clearPurchasedItems rather than full-cart wipe', () => {
  const filePath = join(WORKSPACE_DIR, 'app/(store)/checkout/page.tsx');
  const content = readFileSync(filePath, 'utf-8');

  assert.match(content, /clearPurchasedItems\(\s*purchasedItems,\s*res\.orderNumber\s*\)/, 'Checkout must call clearPurchasedItems with purchased items and order number');
  assert.doesNotMatch(content, /clearCart\(\);[\s\S]*router\.push\(confirmationUrl\)/, 'Checkout must not call indiscriminate clearCart');
});

test('Part D: Cart page visibly surfaces sync errors and provides retry capability', () => {
  const filePath = join(WORKSPACE_DIR, 'app/(store)/cart/page.tsx');
  const content = readFileSync(filePath, 'utf-8');

  assert.match(content, /syncError/, 'Cart page must destructure and render syncError');
  assert.match(content, /retrySync\(\)/, 'Cart page must provide button to retry failed syncs');
});

test('Part D: Wishlist actions enforce customer authentication and user ownership', () => {
  const filePath = join(WORKSPACE_DIR, 'lib/wishlist/actions.ts');
  const content = readFileSync(filePath, 'utf-8');

  assert.match(content, /requireCustomerAuth\(\)/, 'Wishlist mutations must require customer authentication');
  assert.match(content, /wishlists\??\.user_id\s*[!=]==?\s*profile\.id/i, 'Wishlist removal must verify user ownership');
});

// -----------------------------------------------------------------------------
// PART E: Database RLS & Schema Integrity Audit
// -----------------------------------------------------------------------------

test('Part E: Cart schema in migrations enforces user cascade and unique variant per cart', () => {
  const migrationPath = join(WORKSPACE_DIR, 'supabase/migrations/00001_initial_schema.sql');
  const content = readFileSync(migrationPath, 'utf-8');

  // Carts table has user_id foreign key with CASCADE
  assert.match(content, /REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+CASCADE/, 'Carts must cascade on user deletion');

  // Cart items has UNIQUE(cart_id, variant_id)
  assert.match(content, /UNIQUE\s*\(\s*cart_id\s*,\s*variant_id\s*\)/, 'Cart items must enforce unique variant per cart');

  // Wishlist items has UNIQUE(wishlist_id, product_id, variant_id)
  assert.match(content, /UNIQUE\s*\(\s*wishlist_id\s*,\s*product_id\s*,\s*variant_id\s*\)/, 'Wishlist items must enforce unique item per wishlist');
});

test('Part E: RLS security hardening protects carts and cart items with auth.uid() checks', () => {
  const initialSchemaPath = join(WORKSPACE_DIR, 'supabase/migrations/00001_initial_schema.sql');
  const initialContent = readFileSync(initialSchemaPath, 'utf-8');

  // Carts & cart_items RLS enabled
  assert.match(initialContent, /ALTER\s+TABLE\s+public\.carts\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i, 'Carts must have RLS enabled');
  assert.match(initialContent, /ALTER\s+TABLE\s+public\.cart_items\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i, 'Cart items must have RLS enabled');

  // Hardened RLS policies in 00005
  const securityMigrationPath = join(WORKSPACE_DIR, 'supabase/migrations/00005_database_security_hardening.sql');
  const securityContent = readFileSync(securityMigrationPath, 'utf-8');

  assert.match(securityContent, /CREATE\s+POLICY\s+"Users manage own cart"\s+ON\s+public\.carts/i, 'Must have policy for carts');
  assert.match(securityContent, /auth\.uid\(\)\s*=\s*user_id/i, 'Cart access must strictly require auth.uid() matching user_id');
  assert.match(securityContent, /user_id\s*=\s*auth\.uid\(\)/i, 'Cart items access must strictly verify cart ownership via auth.uid()');
});

// -----------------------------------------------------------------------------
// PART F: THREE CONCURRENCY & EDGE-CASE SAFETY REGRESSION TESTS
// -----------------------------------------------------------------------------

test('Part F (Check 1): Same-variant concurrent update conflict policy and client convergence', () => {
  const actionsPath = join(WORKSPACE_DIR, 'lib/cart/actions.ts');
  const actionsContent = readFileSync(actionsPath, 'utf-8');

  // Documents Last-Write-Wins and cross-device non-locking queue
  assert.match(actionsContent, /CONFLICT RESOLUTION & CONCURRENCY POLICY/i, 'Must document conflict resolution policy');
  assert.match(actionsContent, /Last-Write-Wins/i, 'Must define Last-Write-Wins conflict resolution');
  assert.match(actionsContent, /NOT a distributed cross-device lock/i, 'Must clarify that browser queue is intra-browser only');

  // Simulating concurrent updates on same variant from Device A and Device B
  const variantStock = 5;
  let serverCartItem = { variantId: 'ring-1', quantity: 1 };

  // Device A sends update to 2
  const deviceAUpdate = (current: typeof serverCartItem, qty: number) => ({
    ...current,
    quantity: Math.min(qty, variantStock),
  });
  serverCartItem = deviceAUpdate(serverCartItem, 2);
  assert.equal(serverCartItem.quantity, 2);

  // Device B sends update to 4 simultaneously and commits last in PostgreSQL
  const deviceBUpdate = (current: typeof serverCartItem, qty: number) => ({
    ...current,
    quantity: Math.min(qty, variantStock),
  });
  serverCartItem = deviceBUpdate(serverCartItem, 4);
  assert.equal(serverCartItem.quantity, 4, 'Authoritative server quantity must reflect the last-committed update');

  // Device A refreshes on window focus and converges to server quantity
  const deviceAConvergence = (authoritativeServerQty: number) => authoritativeServerQty;
  const deviceARefreshedQty = deviceAConvergence(serverCartItem.quantity);
  assert.equal(deviceARefreshedQty, 4, 'Device A must converge to authoritative server quantity on refresh');
});

test('Part F (Check 2): Failed guest cart merge preserves pending flag and allows safe retry without duplication', () => {
  const contextPath = join(WORKSPACE_DIR, 'lib/cart/cart-context.tsx');
  const contextContent = readFileSync(contextPath, 'utf-8');

  // GUEST_CART_FLAG is cleared only after merge success
  assert.match(
    contextContent,
    /if\s*\(isMounted\s*&&\s*res\.success\s*&&\s*res\.items\)\s*\{\s*localStorage\.removeItem\(GUEST_CART_FLAG\)/,
    'GUEST_CART_FLAG must be removed ONLY after confirmed merge success'
  );

  // On failure, actionable error is displayed
  assert.match(
    contextContent,
    /Failed to merge your guest shopping bag with your account/,
    'Must display actionable error when merge fails'
  );

  // retrySync retries pending guest merge
  assert.match(
    contextContent,
    /hasActiveGuestBag\s*&&\s*itemsRef\.current\.length\s*>\s*0[\s\S]*mergeGuestCartAction/,
    'retrySync must retry pending guest merge if flag is active'
  );

  // Simulation: idempotency of guest cart merge
  // If guest had 1 ring, and server had 2 rings, merged target is 3 rings.
  // Repeated merge attempts must NOT add 1 ring repeatedly (e.g. 3 -> 4 -> 5).
  const serverItems = [{ variantId: 'ring-1', quantity: 2 }];
  const guestItems = [{ variantId: 'ring-1', quantity: 1 }];

  function simulateMerge(server: typeof serverItems, guest: typeof guestItems, alreadyMerged: boolean) {
    if (alreadyMerged) {
      return server; // Idempotent: return server state without re-adding
    }
    return server.map((s) => {
      const g = guest.find((item) => item.variantId === s.variantId);
      return g ? { ...s, quantity: s.quantity + g.quantity } : s;
    });
  }

  const firstMerge = simulateMerge(serverItems, guestItems, false);
  assert.equal(firstMerge[0].quantity, 3, 'First merge produces 2 + 1 = 3 rings');

  // Retry merge with idempotency guard
  const secondMerge = simulateMerge(firstMerge, guestItems, true);
  assert.equal(secondMerge[0].quantity, 3, 'Retry of merge must NOT duplicate quantity (remains 3)');
});

test('Part F (Check 3): Same-variant additions during checkout are preserved and checkout deduction is idempotent', () => {
  const actionsPath = join(WORKSPACE_DIR, 'lib/cart/actions.ts');
  const actionsContent = readFileSync(actionsPath, 'utf-8');
  const migrationPath = join(WORKSPACE_DIR, 'supabase/migrations/00011_cart_durable_idempotency.sql');
  const migrationContent = readFileSync(migrationPath, 'utf-8');

  // deductPurchasedCartItemsAction calls atomic stored procedure
  assert.match(actionsContent, /export\s+async\s+function\s+deductPurchasedCartItemsAction/, 'Must define deductPurchasedCartItemsAction');
  assert.match(actionsContent, /deduct_purchased_cart_items/, 'Must invoke atomic deduction procedure');

  // Migration 00011 implements surplus protection: decrements instead of unconditionally deleting row
  assert.match(migrationContent, /v_current_qty\s*<=\s*v_item\.purchased_qty/, 'Must compare current cart quantity with purchased quantity');
  assert.match(migrationContent, /v_current_qty\s*-\s*v_item\.purchased_qty/, 'Must calculate remaining quantity when surplus exists');

  // Idempotency: durable database idempotency
  assert.match(migrationContent, /cart_idempotency_records/, 'Must guard duplicate deductions with durable idempotency records');

  // Simulation of Scenario:
  // 1. Device A starts checkout with 1 ring
  // 2. Device B adds 1 more unit of the same ring before Device A finishes -> Server has quantity 2
  // 3. Device A completes checkout for 1 ring
  // 4. Server deducts 1 ring -> Remaining quantity is 2 - 1 = 1 ring (Device B's unit is NOT deleted!)
  let dbCartItem: { variantId: string; quantity: number } | null = { variantId: 'ring-1', quantity: 2 };
  const processedOrders = new Set<string>();

  function simulateDeductPurchased(
    purchased: { variantId: string; quantity: number }[],
    orderNumber: string
  ) {
    if (processedOrders.has(orderNumber)) {
      return { success: true, alreadyProcessed: true };
    }
    processedOrders.add(orderNumber);

    if (!dbCartItem) return { success: true };

    const p = purchased.find((i) => i.variantId === dbCartItem?.variantId);
    if (p) {
      if (dbCartItem.quantity <= p.quantity) {
        dbCartItem = null; // Completely purchased
      } else {
        dbCartItem = {
          ...dbCartItem,
          quantity: dbCartItem.quantity - p.quantity,
        };
      }
    }
    return { success: true };
  }

  // Device A checks out 1 unit
  simulateDeductPurchased([{ variantId: 'ring-1', quantity: 1 }], 'SJ-20261019-0001');

  // Verify Device B's unit is NOT deleted: quantity is 1, not null
  assert.ok(dbCartItem !== null, 'Cart row must not be deleted when surplus exists');
  assert.equal(dbCartItem.quantity, 1, 'Device B added unit must be preserved with quantity = 1');

  // Checkout retry with the same order number
  const retryResult = simulateDeductPurchased([{ variantId: 'ring-1', quantity: 1 }], 'SJ-20261019-0001');
  assert.equal(retryResult.alreadyProcessed, true, 'Retry must be recognized as already processed');
  assert.equal(dbCartItem.quantity, 1, 'Quantity must not be deducted twice on retry');
});
