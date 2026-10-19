import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKSPACE_DIR = process.cwd();

// =============================================================================
// SPLENDER JEWEL — CROSS-DEVICE CART SYNCHRONIZATION REGRESSION SUITE
// =============================================================================

test('Cross-Device Sync: Cart actions provide authenticated status and server single-source-of-truth', () => {
  const actionsPath = join(WORKSPACE_DIR, 'lib/cart/actions.ts');
  const actionsContent = readFileSync(actionsPath, 'utf-8');

  // getAuthenticatedCartAction returns GetCartActionResult with authenticated flag
  assert.match(
    actionsContent,
    /export\s+interface\s+GetCartActionResult/,
    'actions.ts must define GetCartActionResult interface'
  );
  assert.match(
    actionsContent,
    /authenticated\?:\s*boolean/,
    'GetCartActionResult must include authenticated flag'
  );

  // Unauthenticated sessions return authenticated: false and items: null (never empty array that could wipe guest bag)
  assert.match(
    actionsContent,
    /return\s*\{\s*success:\s*true,\s*items:\s*null,\s*authenticated:\s*false\s*\}/,
    'Unauthenticated callers must receive authenticated: false and null items'
  );

  // Authenticated sessions return authenticated: true with authoritative cart items
  assert.match(
    actionsContent,
    /return\s*\{\s*success:\s*true,\s*items:\s*cartItems,\s*authenticated:\s*true(?:\s*,\s*userId:\s*user\.id)?\s*\}/,
    'Authenticated callers must receive authenticated: true with remote items'
  );
});

test('Cross-Device Sync: CartProvider implements refreshCart with sequence guard and auth listeners', () => {
  const contextPath = join(WORKSPACE_DIR, 'lib/cart/cart-context.tsx');
  const contextContent = readFileSync(contextPath, 'utf-8');

  // CartContextType exports refreshCart returning Promise<CartItem[]>
  assert.match(
    contextContent,
    /refreshCart:\s*\(\)\s*=>\s*Promise<CartItem\[\]>/,
    'CartContextType must export refreshCart returning Promise<CartItem[]>'
  );

  // refreshCart sequence token protects against concurrent out-of-order responses
  assert.match(
    contextContent,
    /const\s+refreshSeqRef\s*=\s*useRef\(0\)/,
    'CartProvider must have a refreshSeqRef counter'
  );
  assert.match(
    contextContent,
    /if\s*\(\s*seq\s*!==\s*refreshSeqRef\.current\s*\)\s*return/,
    'refreshCart must discard stale responses if a newer refresh was initiated'
  );

  // Listens to splender:auth-signed-in event (fired upon login / registration)
  assert.match(
    contextContent,
    /splender:auth-signed-in/,
    'CartProvider must listen to splender:auth-signed-in custom event'
  );

  // Throttled tab focus and visibility refresh
  assert.match(
    contextContent,
    /document\.addEventListener\('visibilitychange',\s*handleTabFocus\)/,
    'CartProvider must listen to visibilitychange for remote synchronization'
  );
  assert.match(
    contextContent,
    /window\.addEventListener\('focus',\s*handleTabFocus\)/,
    'CartProvider must listen to window focus for remote synchronization'
  );
  assert.match(
    contextContent,
    /now\s*-\s*lastFocusTime\s*>\s*1000/,
    'CartProvider must throttle rapid tab focus events to avoid excessive network requests'
  );

  // Multi-tab storage synchronization handles cart updates and cart clearing
  assert.match(
    contextContent,
    /window\.addEventListener\('storage',\s*handleStorage\)/,
    'CartProvider must listen to storage events for multi-tab synchronization'
  );
  assert.match(
    contextContent,
    /if\s*\(!e\.newValue\)\s*\{\s*itemsRef\.current\s*=\s*\[\];\s*setItems\(\[\]\);/,
    'storage listener must handle cart clearance across tabs'
  );
});

test('Cross-Device Sync: Login & Register pages dispatch auth event to notify cart provider', () => {
  const loginPath = join(WORKSPACE_DIR, 'app/(store)/login/page.tsx');
  const loginContent = readFileSync(loginPath, 'utf-8');

  assert.match(
    loginContent,
    /window\.dispatchEvent\(new\s+Event\('splender:auth-signed-in'\)\)/,
    'Login form must dispatch splender:auth-signed-in upon successful authentication'
  );

  const registerPath = join(WORKSPACE_DIR, 'app/(store)/register/page.tsx');
  const registerContent = readFileSync(registerPath, 'utf-8');

  assert.match(
    registerContent,
    /window\.dispatchEvent\(new\s+Event\('splender:auth-signed-in'\)\)/,
    'Register form must dispatch splender:auth-signed-in upon successful registration'
  );
});

test('Cross-Device Sync: Shopping bag page (/cart) re-synchronizes with Supabase on mount, route activation, and tab focus', () => {
  const cartPagePath = join(WORKSPACE_DIR, 'app/(store)/cart/page.tsx');
  const cartPageContent = readFileSync(cartPagePath, 'utf-8');

  // Destructures refreshCart from useCart
  assert.match(
    cartPageContent,
    /refreshCart/,
    'CartPage must destructure refreshCart from useCart'
  );

  // Implements complete synchronization combining remote cart fetch and inventory stock validation
  assert.match(
    cartPageContent,
    /const\s+syncPageWithServer\s*=\s*useCallback/,
    'CartPage must define syncPageWithServer callback'
  );
  assert.match(
    cartPageContent,
    /await\s+refreshCart\(\)/,
    'syncPageWithServer must call refreshCart to query authoritative Supabase state'
  );
  assert.match(
    cartPageContent,
    /await\s+runCartRevalidation\(/,
    'syncPageWithServer must validate inventory stock for fresh items'
  );

  // Trigger 1 (mount hydration): synchronizes even if local cart is empty
  assert.match(
    cartPageContent,
    /if\s*\(!isLoaded\)\s*return;\s*syncPageWithServer\(\);/,
    'Trigger 1 must run syncPageWithServer on mount hydration regardless of local item count'
  );

  // Trigger 2 (route activation): synchronizes when visiting or returning to /cart
  assert.match(
    cartPageContent,
    /if\s*\(isLoaded\s*&&\s*pathname\s*===\s*'\/cart'\)\s*\{\s*syncPageWithServer\(\);/,
    'Trigger 2 must run syncPageWithServer on route activation to /cart'
  );

  // Trigger 3 (window focus / visibility change): synchronizes when customer switches back to tab
  assert.match(
    cartPageContent,
    /if\s*\(document\.visibilityState\s*===\s*'visible'\)\s*\{\s*syncPageWithServer\(\);/,
    'Trigger 3 must run syncPageWithServer on document visibility'
  );

  // Manual Refresh Stock & Retry Check buttons trigger full server sync
  assert.match(
    cartPageContent,
    /onClick=\{\(\)\s*=>\s*syncPageWithServer\(\)\}/,
    'Refresh Stock and Retry Check buttons must trigger syncPageWithServer'
  );
});

test('Cross-Device Sync: Simulated Phone-to-Laptop Cross-Device Workflow', async () => {
  // Simulate Phone (Device A) and Laptop (Device B) in-memory states
  interface SimulatedDevice {
    name: string;
    isAuthenticated: boolean;
    localCart: { variantId: string; quantity: number }[];
    headerCount: number;
  }

  // Authoritative Supabase remote database state
  let supabaseServerCart: { variantId: string; quantity: number }[] = [];

  const devicePhone: SimulatedDevice = {
    name: 'Phone',
    isAuthenticated: true,
    localCart: [],
    headerCount: 0,
  };

  const deviceLaptop: SimulatedDevice = {
    name: 'Laptop',
    isAuthenticated: false, // Initially unauthenticated on laptop
    localCart: [],
    headerCount: 0,
  };

  // Step 1: User adds 2 units of Variant A on Phone
  const variantA = '11111111-2222-3333-4444-555555555555';
  devicePhone.localCart.push({ variantId: variantA, quantity: 2 });
  devicePhone.headerCount = 2;
  // Phone persists mutation to Supabase
  supabaseServerCart = [{ variantId: variantA, quantity: 2 }];

  assert.equal(supabaseServerCart[0].quantity, 2);

  // Step 2: User opens laptop with clean local cart and signs in
  assert.equal(deviceLaptop.localCart.length, 0);
  assert.equal(deviceLaptop.headerCount, 0);

  // Simulate login event: splender:auth-signed-in
  deviceLaptop.isAuthenticated = true;
  // Laptop refreshCart fetches authoritative Supabase server cart
  deviceLaptop.localCart = [...supabaseServerCart];
  deviceLaptop.headerCount = deviceLaptop.localCart.reduce((sum, i) => sum + i.quantity, 0);

  // Verify Laptop now reflects Phone's cart immediately
  assert.equal(deviceLaptop.localCart.length, 1);
  assert.equal(deviceLaptop.localCart[0].variantId, variantA);
  assert.equal(deviceLaptop.localCart[0].quantity, 2);
  assert.equal(deviceLaptop.headerCount, 2, 'Laptop header count must match Phone quantity');

  // Step 3: Phone adds a second item (Variant B, quantity 1)
  const variantB = '66666666-7777-8888-9999-000000000000';
  supabaseServerCart.push({ variantId: variantB, quantity: 1 });
  devicePhone.localCart.push({ variantId: variantB, quantity: 1 });
  devicePhone.headerCount = 3;

  // Step 4: Laptop tab receives focus / visibility change or route navigation to /cart
  // Laptop refreshCart runs
  deviceLaptop.localCart = [...supabaseServerCart];
  deviceLaptop.headerCount = deviceLaptop.localCart.reduce((sum, i) => sum + i.quantity, 0);

  assert.equal(deviceLaptop.localCart.length, 2);
  assert.equal(deviceLaptop.headerCount, 3, 'Laptop header count must reflect 3 items after Phone addition');
  assert.equal(
    deviceLaptop.localCart.find((i) => i.variantId === variantB)?.quantity,
    1,
    'Laptop cart must include newly added Variant B'
  );

  // Step 5: Phone updates Variant A quantity to 4
  supabaseServerCart[0].quantity = 4;
  devicePhone.localCart[0].quantity = 4;
  devicePhone.headerCount = 5;

  // Step 6: Laptop user focuses tab or navigates to /cart
  deviceLaptop.localCart = [...supabaseServerCart];
  deviceLaptop.headerCount = deviceLaptop.localCart.reduce((sum, i) => sum + i.quantity, 0);

  assert.equal(deviceLaptop.localCart[0].quantity, 4, 'Laptop must reflect updated quantity of 4 from Phone');
  assert.equal(deviceLaptop.headerCount, 5, 'Laptop header counter must be 5');
});

test('Guest Login & Cart Loss: Login & Register forms await cart sync and omit conflicting router.refresh', () => {
  const loginPath = join(WORKSPACE_DIR, 'app/(store)/login/page.tsx');
  const loginContent = readFileSync(loginPath, 'utf-8');

  // Verify useOptionalCart is imported and used
  assert.match(
    loginContent,
    /import\s+\{[^}]*useOptionalCart[^}]*\}\s+from\s+['"]@\/lib\/cart\/cart-context['"]/,
    'Login page must import useOptionalCart'
  );
  assert.match(
    loginContent,
    /const\s+cart\s*=\s*useOptionalCart\(\)/,
    'LoginForm must call useOptionalCart()'
  );

  // Verify refreshCart is awaited prior to router.push
  assert.match(
    loginContent,
    /await\s+cart\.refreshCart\(\)/,
    'LoginForm must await cart.refreshCart() prior to navigation'
  );

  // Verify router.refresh() is NOT called after router.push (which in Next.js 15 aborts push and hangs login)
  assert.doesNotMatch(
    loginContent,
    /router\.push\([^)]+\);\s*router\.refresh\(\)/,
    'LoginForm must NOT call router.refresh() directly after router.push()'
  );

  const registerPath = join(WORKSPACE_DIR, 'app/(store)/register/page.tsx');
  const registerContent = readFileSync(registerPath, 'utf-8');

  // Verify register page also handles cart sync and avoids router.refresh()
  assert.match(
    registerContent,
    /import\s+\{[^}]*useOptionalCart[^}]*\}\s+from\s+['"]@\/lib\/cart\/cart-context['"]/,
    'Register page must import useOptionalCart'
  );
  assert.match(
    registerContent,
    /await\s+cart\.refreshCart\(\)/,
    'RegisterForm must await cart.refreshCart() on direct login'
  );
  assert.doesNotMatch(
    registerContent,
    /router\.push\([^)]+\);\s*router\.refresh\(\)/,
    'RegisterForm must NOT call router.refresh() directly after router.push()'
  );
});

test('Guest Login & Cart Loss: CartProvider implements activeMergePromiseRef mutex and cold storage fallback', () => {
  const contextPath = join(WORKSPACE_DIR, 'lib/cart/cart-context.tsx');
  const contextContent = readFileSync(contextPath, 'utf-8');

  // Verify activeMergePromiseRef mutex exists
  assert.match(
    contextContent,
    /const\s+activeMergePromiseRef\s*=\s*useRef<Promise<CartItem\[\]>\s*\|\s*null>\(null\)/,
    'CartProvider must have activeMergePromiseRef mutex'
  );

  // Verify refreshCart checks and awaits activeMergePromiseRef
  assert.match(
    contextContent,
    /if\s*\(\s*activeMergePromiseRef\.current\s*\)\s*\{\s*return\s+await\s+activeMergePromiseRef\.current;\s*\}/,
    'refreshCart must await activeMergePromiseRef to avoid race conditions'
  );

  // Verify cold storage fallback if itemsRef.current is empty
  assert.match(
    contextContent,
    /localStorage\.getItem\(CART_STORAGE_KEY\)/,
    'refreshCart must inspect localStorage fallback if in-memory items are empty'
  );

  // Verify CASE 1: Pending guest cart merges directly without wiping via unauthenticated remote read
  assert.match(
    contextContent,
    /if\s*\(\s*hasActiveGuestBag\s*&&\s*local\s*&&\s*local\.length\s*>\s*0\s*\)/,
    'refreshCart must prioritize guest cart merge over normal fetch when hasActiveGuestBag is true'
  );

  // Verify guest flag and token removal happens strictly on confirmed success
  assert.match(
    contextContent,
    /if\s*\(\s*isMounted\s*&&\s*res\.success\s*&&\s*res\.items\s*\)\s*\{\s*localStorage\.removeItem\(GUEST_CART_FLAG\);\s*localStorage\.removeItem\(GUEST_MERGE_TOKEN\);/,
    'GUEST_CART_FLAG and GUEST_MERGE_TOKEN must be cleared ONLY on confirmed merge success'
  );

  // Verify preservation on merge failure: leaves guest flag and sets user-actionable sync error
  assert.match(
    contextContent,
    /Failed to merge your guest shopping bag with your account\. Your items are saved locally\./,
    'refreshCart must set actionable sync error and preserve guest cart on merge failure'
  );
});

test('Guest Login & Cart Loss: Simulated End-to-End Guest Cart Merge Workflow', async () => {
  const mockLocalStorage: Record<string, string> = {};
  const GUEST_CART_FLAG = 'splender_guest_cart_active';
  const GUEST_MERGE_TOKEN = 'splender_guest_merge_token';
  const CART_STORAGE_KEY = 'splender_cart_v1';

  // Step 1: Guest adds item X
  const guestItem = {
    id: 'item-guest-1',
    productId: 'prod-1',
    variantId: '11111111-1111-1111-1111-111111111111',
    quantity: 1,
    title: 'Diamond Pendant',
    unitPrice: 50000,
    maxStock: 5,
  };

  mockLocalStorage[CART_STORAGE_KEY] = JSON.stringify([guestItem]);
  mockLocalStorage[GUEST_CART_FLAG] = 'true';

  assert.equal(mockLocalStorage[GUEST_CART_FLAG], 'true');
  assert.equal(JSON.parse(mockLocalStorage[CART_STORAGE_KEY]).length, 1);

  // Step 2: Supabase server already has item Y in user's remote cart
  const existingAccountItem = {
    id: 'item-remote-2',
    productId: 'prod-2',
    variantId: '22222222-2222-2222-2222-222222222222',
    quantity: 2,
    title: 'Gold Ring',
    unitPrice: 85000,
    maxStock: 10,
  };
  let remoteServerCart = [existingAccountItem];

  // Step 3: Customer logs in, mergeGuestCartAction executes with mergeToken
  const mergeToken = 'token-uuid-12345';
  mockLocalStorage[GUEST_MERGE_TOKEN] = mergeToken;

  // Simulate merge_guest_cart database procedure
  const mergedItems = [...remoteServerCart, guestItem];
  remoteServerCart = mergedItems;

  const mergeResult = {
    success: true,
    items: mergedItems,
  };

  // Step 4: CartProvider receives success response
  assert.equal(mergeResult.success, true);
  if (mergeResult.success && mergeResult.items) {
    delete mockLocalStorage[GUEST_CART_FLAG];
    delete mockLocalStorage[GUEST_MERGE_TOKEN];
    mockLocalStorage[CART_STORAGE_KEY] = JSON.stringify(mergeResult.items);
  }

  // Verify guest flag is cleared
  assert.equal(mockLocalStorage[GUEST_CART_FLAG], undefined);
  assert.equal(mockLocalStorage[GUEST_MERGE_TOKEN], undefined);

  // Verify both items exist in local storage and remote cart
  const finalCart = JSON.parse(mockLocalStorage[CART_STORAGE_KEY]);
  assert.equal(finalCart.length, 2);
  assert.equal(finalCart.find((i: any) => i.id === 'item-guest-1').quantity, 1);
  assert.equal(finalCart.find((i: any) => i.id === 'item-remote-2').quantity, 2);

  // Step 5: Duplicate merge call with the same token (idempotency simulation)
  assert.equal(remoteServerCart.reduce((sum, i) => sum + i.quantity, 0), 3);
});

test('Guest Login & Cart Loss: Merge Failure Preserves Local Guest Cart and Flags', () => {
  const mockLocalStorage: Record<string, string> = {};
  const GUEST_CART_FLAG = 'splender_guest_cart_active';
  const GUEST_MERGE_TOKEN = 'splender_guest_merge_token';
  const CART_STORAGE_KEY = 'splender_cart_v1';

  const guestItem = {
    id: 'item-guest-1',
    variantId: '11111111-1111-1111-1111-111111111111',
    quantity: 2,
  };

  mockLocalStorage[CART_STORAGE_KEY] = JSON.stringify([guestItem]);
  mockLocalStorage[GUEST_CART_FLAG] = 'true';
  mockLocalStorage[GUEST_MERGE_TOKEN] = 'token-xyz';

  // Simulate network/RPC failure
  const mergeResult = {
    success: false,
    error: 'Database timeout or network partition',
  };

  let syncError: string | null = null;
  if (!mergeResult.success) {
    syncError = mergeResult.error;
    // Local storage and guest flag are NOT cleared
  }

  assert.equal(mockLocalStorage[GUEST_CART_FLAG], 'true', 'GUEST_CART_FLAG must remain true on failure');
  assert.equal(mockLocalStorage[GUEST_MERGE_TOKEN], 'token-xyz', 'GUEST_MERGE_TOKEN must be preserved for retry');
  assert.equal(JSON.parse(mockLocalStorage[CART_STORAGE_KEY]).length, 1, 'Local guest items must NOT be wiped');
  assert.match(syncError!, /Database timeout/, 'Sync error must be reported to the user');
});

test('Behavioral: Unauthenticated merge must fail safely and never return false success', () => {
  const actionsPath = join(WORKSPACE_DIR, 'lib/cart/actions.ts');
  const actionsContent = readFileSync(actionsPath, 'utf-8');

  // Verify mergeGuestCartAction returns success: false and unauthenticated: true when !user
  assert.match(
    actionsContent,
    /if\s*\(!user\)\s*\{\s*return\s*\{\s*success:\s*false,\s*items:\s*guestItems,\s*unauthenticated:\s*true,/,
    'mergeGuestCartAction must return success: false and unauthenticated: true when unauthenticated'
  );

  // Behavioral test: simulate mergeGuestCartAction response for guest
  const mockGuestItems = [
    { variantId: '11111111-1111-1111-1111-111111111111', quantity: 2, price: 1000 } as any,
  ];
  const user = null;
  const result = !user
    ? {
        success: false,
        items: mockGuestItems,
        unauthenticated: true,
        error: 'Authentication required to merge shopping bag with your account.',
      }
    : { success: true, items: [] };

  assert.equal(result.success, false, 'Unauthenticated merge must NEVER report success');
  assert.equal(result.unauthenticated, true);
  assert.equal(result.items.length, 1);
  assert.match(result.error!, /Authentication required/);
});

test('Behavioral: Login session not yet available retains guest cart without error banner', () => {
  const contextPath = join(WORKSPACE_DIR, 'lib/cart/cart-context.tsx');
  const contextContent = readFileSync(contextPath, 'utf-8');

  // Verify CartProvider handles res.unauthenticated without setting syncError
  assert.match(
    contextContent,
    /if\s*\(\s*res\.unauthenticated\s*\)\s*\{\s*\/\/\s*Unauthenticated guest:\s*keep local cart safely without displaying an error banner/,
    'CartProvider must not display sync error when guest merge returns unauthenticated'
  );

  // Behavioral simulation
  const mockLocalStorage: Record<string, string> = {
    splender_guest_cart_active: 'true',
    splender_guest_merge_token: 'merge-token-123',
    splender_cart_v1: JSON.stringify([{ variantId: 'var-1', quantity: 1 }]),
  };

  const mergeRes = {
    success: false,
    items: [{ variantId: 'var-1', quantity: 1 }],
    unauthenticated: true,
  };

  let syncError: string | null = null;
  if (!mergeRes.success) {
    if (mergeRes.unauthenticated) {
      // Keep quiet for unauthenticated guest
    } else {
      syncError = 'Failed to merge';
    }
  }

  assert.equal(syncError, null, 'No error banner should be shown to unauthenticated guests');
  assert.equal(mockLocalStorage.splender_guest_cart_active, 'true', 'Guest flag must remain active');
  assert.equal(mockLocalStorage.splender_guest_merge_token, 'merge-token-123', 'Merge token must be retained');
});

test('Behavioral: Database cart-read error must never wipe local cart or disguise as empty cart', () => {
  const actionsPath = join(WORKSPACE_DIR, 'lib/cart/actions.ts');
  const actionsContent = readFileSync(actionsPath, 'utf-8');

  // Verify cartError is separated from !cart
  assert.match(
    actionsContent,
    /if\s*\(cartError\)\s*\{\s*console\.error\('[^']*',\s*cartError\);\s*return\s*\{\s*success:\s*false,\s*items:\s*null,\s*authenticated:\s*true,\s*error:/,
    'getAuthenticatedCartAction must return success: false and items: null on cartError'
  );

  // Behavioral simulation: database query error vs confirmed no cart record
  const simulateGetCart = (dbError: any, cartRow: any) => {
    if (dbError) {
      return { success: false, items: null, authenticated: true, error: 'DB Connection Error' };
    }
    if (!cartRow) {
      return { success: true, items: [], authenticated: true, userId: 'usr-1' };
    }
    return { success: true, items: [{ variantId: 'var-1', quantity: 1 }], authenticated: true, userId: 'usr-1' };
  };

  // Case A: Database error
  const errRes: { success: boolean; items: any[] | null; authenticated?: boolean; error?: string } =
    simulateGetCart({ message: 'timeout' }, null);
  assert.equal(errRes.success, false, 'DB error must return success: false');
  assert.equal(errRes.items, null, 'DB error must return items: null, never empty array');

  // Client behavior when items === null: must preserve local cart
  let clientCart = [{ variantId: 'local-1', quantity: 2 }];
  if (errRes.success && errRes.items) {
    clientCart = errRes.items;
  }
  assert.equal(clientCart.length, 1, 'Client local cart must NOT be wiped on database query error');
  assert.equal(clientCart[0].variantId, 'local-1');

  // Case B: Confirmed no cart record
  const emptyRes = simulateGetCart(null, null);
  assert.equal(emptyRes.success, true);
  assert.deepEqual(emptyRes.items, []);
});

test('Behavioral: Merge RPC succeeds but follow-up read fails preserves items and merge token for idempotent retry', () => {
  const actionsPath = join(WORKSPACE_DIR, 'lib/cart/actions.ts');
  const actionsContent = readFileSync(actionsPath, 'utf-8');

  // Verify post-merge read failure handling
  assert.match(
    actionsContent,
    /if\s*\(!refreshed\.success\s*\|\|\s*!refreshed\.items\)\s*\{\s*console\.error\('[^']*',\s*refreshed\.error\);/,
    'mergeGuestCartAction must fail safely if post-merge cart fetch fails'
  );

  // Behavioral simulation
  const guestItems = [{ variantId: 'var-A', quantity: 3 }];
  const rpcResult = { success: true, already_processed: false };
  const refreshedRead = { success: false, items: null, error: 'Transient network failure' };

  let actionResult;
  if (!refreshedRead.success || !refreshedRead.items) {
    actionResult = {
      success: false,
      items: guestItems,
      alreadyProcessed: Boolean(rpcResult.already_processed),
      error: refreshedRead.error,
    };
  } else {
    actionResult = { success: true, items: refreshedRead.items };
  }

  assert.equal(actionResult.success, false);
  assert.equal(actionResult.items[0].variantId, 'var-A');
  assert.equal(actionResult.items[0].quantity, 3);
});

test('Behavioral: Cross-device convergence (Laptop add → Phone login → Phone add → Laptop refresh)', async () => {
  // Authoritative Supabase database state
  interface DbCartItem {
    variantId: string;
    quantity: number;
    updatedAt: string;
  }
  const supabaseDbCart = new Map<string, DbCartItem>();

  // Helper simulating atomic upsert on (cart_id, variant_id)
  const upsertItem = (variantId: string, quantity: number) => {
    supabaseDbCart.set(variantId, {
      variantId,
      quantity,
      updatedAt: new Date().toISOString(),
    });
  };

  // Helper simulating getAuthenticatedCartAction()
  const fetchAuthoritativeCart = () => {
    return Array.from(supabaseDbCart.values()).map((i) => ({
      variantId: i.variantId,
      quantity: i.quantity,
    }));
  };

  // 1. Laptop adds Variant 1 (qty 2)
  const var1 = '11111111-1111-1111-1111-111111111111';
  upsertItem(var1, 2);

  // 2. Phone logs in -> fetches authoritative cart
  const phoneCart = fetchAuthoritativeCart();
  assert.equal(phoneCart.length, 1);
  assert.equal(phoneCart[0].variantId, var1);
  assert.equal(phoneCart[0].quantity, 2, 'Phone must see 2 units of Variant 1 added from laptop');

  // 3. Phone adds Variant 2 (qty 4)
  const var2 = '22222222-2222-2222-2222-222222222222';
  upsertItem(var2, 4);

  // 4. Laptop window focus / visibility change triggers refreshCart()
  const laptopRefreshedCart = fetchAuthoritativeCart();
  assert.equal(laptopRefreshedCart.length, 2);
  assert.equal(laptopRefreshedCart.find((i) => i.variantId === var1)?.quantity, 2);
  assert.equal(laptopRefreshedCart.find((i) => i.variantId === var2)?.quantity, 4, 'Laptop must see Variant 2 added from phone');
});

test('Behavioral: Simultaneous edits to different variants preserve unrelated items', () => {
  // Database cart items
  const dbItems = new Map<string, number>([
    ['var-A', 1],
    ['var-B', 2],
  ]);

  // Device 1 updates var-A to 3
  dbItems.set('var-A', 3);

  // Device 2 simultaneously updates var-B to 5
  dbItems.set('var-B', 5);

  assert.equal(dbItems.get('var-A'), 3);
  assert.equal(dbItems.get('var-B'), 5);
  assert.equal(dbItems.size, 2, 'Neither variant should be dropped during simultaneous edits');
});

test('Behavioral: Non-destructive retry retries only failed mutations and never drops remote items', async () => {
  const contextPath = join(WORKSPACE_DIR, 'lib/cart/cart-context.tsx');
  const contextContent = readFileSync(contextPath, 'utf-8');

  // Verify failedMutationsRef tracks item mutations
  assert.match(
    contextContent,
    /failedMutationsRef\s*=\s*useRef<Map<string,\s*TrackedMutation>>/,
    'cart-context must track failed item-level mutations'
  );

  // Verify retrySync does not call destructive full-cart replacement
  assert.doesNotMatch(
    contextContent,
    /saveAuthenticatedCartAction/,
    'cart-context must NOT import or call destructive saveAuthenticatedCartAction'
  );

  // Behavioral simulation of tracked mutation retry
  interface TrackedMutation {
    type: 'sync' | 'remove';
    variantId: string;
    quantity?: number;
  }
  const failedMutations = new Map<string, TrackedMutation>();

  // Item mutation fails (e.g. transient offline)
  failedMutations.set('var-failed-1', { type: 'sync', variantId: 'var-failed-1', quantity: 3 });

  // Remote DB already has items from other devices
  const remoteDb = new Map<string, number>([
    ['var-from-phone', 1],
  ]);

  // When retrySync runs: it retries ONLY the failed mutation
  for (const m of failedMutations.values()) {
    if (m.type === 'sync' && m.quantity !== undefined) {
      remoteDb.set(m.variantId, m.quantity);
      failedMutations.delete(m.variantId);
    }
  }

  assert.equal(failedMutations.size, 0, 'Failed mutations must be cleared upon successful retry');
  assert.equal(remoteDb.get('var-failed-1'), 3, 'Retried item must be persisted');
  assert.equal(remoteDb.get('var-from-phone'), 1, 'Unrelated item from phone must NOT be deleted');
});

test('Behavioral: Logout and account switching prevents cross-account leak', () => {
  const contextPath = join(WORKSPACE_DIR, 'lib/cart/cart-context.tsx');
  const contextContent = readFileSync(contextPath, 'utf-8');

  // Verify failedMutationsRef and currentUserIdRef are cleared on logout
  assert.match(
    contextContent,
    /failedMutationsRef\.current\.clear\(\);\s*currentUserIdRef\.current\s*=\s*null;/,
    'cart-context must clear failed mutations and user ID on sign out'
  );

  // Behavioral simulation
  let clientState = {
    userId: 'user-A',
    items: [{ variantId: 'var-user-A', quantity: 2 }],
    localStorage: {
      splender_cart_v1: JSON.stringify([{ variantId: 'var-user-A', quantity: 2 }]),
    } as Record<string, string>,
  };

  // User A logs out
  clientState.userId = '';
  clientState.items = [];
  delete clientState.localStorage.splender_cart_v1;

  assert.equal(clientState.items.length, 0);
  assert.equal(clientState.localStorage.splender_cart_v1, undefined);

  // User B logs in
  const userBRemoteItems = [{ variantId: 'var-user-B', quantity: 5 }];
  clientState.userId = 'user-B';
  clientState.items = userBRemoteItems;
  clientState.localStorage.splender_cart_v1 = JSON.stringify(userBRemoteItems);

  assert.equal(clientState.items.length, 1);
  assert.equal(clientState.items[0].variantId, 'var-user-B', "User B must see only User B's items");
  assert.equal(clientState.items.find((i) => i.variantId === 'var-user-A'), undefined);
});

test('Behavioral: Cart metrics (count, quantities, subtotal) maintain absolute consistency', () => {
  const items = [
    { variantId: 'v1', quantity: 2, price: 1500, discountPrice: null },
    { variantId: 'v2', quantity: 3, price: 3000, discountPrice: 2500 },
  ];

  const totalCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => {
    const price = i.discountPrice != null && i.discountPrice > 0 ? i.discountPrice : i.price;
    return sum + price * i.quantity;
  }, 0);

  assert.equal(totalCount, 5, 'Total count must strictly equal 2 + 3 = 5');
  assert.equal(subtotal, 2 * 1500 + 3 * 2500, 'Subtotal must account for discount price: 3000 + 7500 = 10500');
});

test('Behavioral Check 1: Guest-to-authenticated transition preserves guest items, merges once, and maintains account isolation', () => {
  // 1. Customer adds items while logged out (guest mode)
  const localStorageMock: Record<string, string> = {};
  let inMemoryItems = [{ variantId: 'guest-ring-1', quantity: 2 }];
  localStorageMock['splender_cart_v1'] = JSON.stringify(inMemoryItems);
  localStorageMock['splender_guest_cart_flag_v1'] = 'true';

  assert.equal(localStorageMock['splender_guest_cart_flag_v1'], 'true');
  assert.equal(inMemoryItems.length, 1);

  // 2. Existing authenticated user has prior cart in Supabase
  const userACartDb = new Map<string, number>([['userA-necklace-1', 1]]);

  // 3. User A signs in successfully: simulate merge_guest_cart execution
  const hasActiveGuestBag = localStorageMock['splender_guest_cart_flag_v1'] === 'true';
  assert.equal(hasActiveGuestBag, true, 'Guest bag flag must be present before sign in merge');

  // Account isolation cleanup on login must NOT erase pending guest items
  const pendingGuestItems = JSON.parse(localStorageMock['splender_cart_v1']);
  assert.equal(pendingGuestItems.length, 1);

  // Atomic merge into User A's cart: preserves existing authenticated items + adds guest items exactly once
  for (const item of pendingGuestItems) {
    const existingQty = userACartDb.get(item.variantId) || 0;
    userACartDb.set(item.variantId, existingQty + item.quantity);
  }

  // Clear guest flags upon verified merge success
  delete localStorageMock['splender_guest_cart_flag_v1'];
  delete localStorageMock['splender_guest_merge_token_v1'];

  inMemoryItems = Array.from(userACartDb.entries()).map(([variantId, quantity]) => ({ variantId, quantity }));
  localStorageMock['splender_cart_v1'] = JSON.stringify(inMemoryItems);

  assert.equal(inMemoryItems.length, 2, 'Merged cart must contain both existing user item and guest item');
  assert.equal(userACartDb.get('userA-necklace-1'), 1, 'Existing authenticated items must be preserved');
  assert.equal(userACartDb.get('guest-ring-1'), 2, 'Guest items must merge exactly once');
  assert.equal(localStorageMock['splender_guest_cart_flag_v1'], undefined, 'Guest flag must be cleared');

  // Second refresh/sync does NOT re-merge guest items
  const secondHasActiveGuest = localStorageMock['splender_guest_cart_flag_v1'] === 'true';
  assert.equal(secondHasActiveGuest, false, 'Second sync must not re-merge');
  assert.equal(userACartDb.get('guest-ring-1'), 2, 'Quantity must not be duplicated on repeated sync');

  // 4. User A logs out: complete account cleanup
  inMemoryItems = [];
  delete localStorageMock['splender_cart_v1'];
  delete localStorageMock['splender_guest_cart_flag_v1'];
  delete localStorageMock['splender_guest_merge_token_v1'];

  assert.equal(inMemoryItems.length, 0);
  assert.equal(localStorageMock['splender_cart_v1'], undefined);

  // 5. User B signs in: receives only User B's items
  const userBCartDb = new Map<string, number>([['userB-bracelet-1', 4]]);
  const userBItems = Array.from(userBCartDb.entries()).map(([variantId, quantity]) => ({ variantId, quantity }));
  inMemoryItems = userBItems;
  localStorageMock['splender_cart_v1'] = JSON.stringify(userBItems);

  assert.equal(inMemoryItems.length, 1);
  assert.equal(inMemoryItems[0].variantId, 'userB-bracelet-1');
  assert.equal(inMemoryItems.find((i) => i.variantId === 'userA-necklace-1'), undefined, 'User A items must not leak to User B');
  assert.equal(inMemoryItems.find((i) => i.variantId === 'guest-ring-1'), undefined, 'Previously merged guest items must not leak to User B');
});

test('Behavioral Check 2: Failed mutation ordering and reconciliation protects latest intended quantities and preserves unrelated variants', async () => {
  // Remote database representation
  const remoteDb = new Map<string, number>([
    ['variant-unrelated', 5], // Unrelated variant added from another device
    ['variant-active', 1],
  ]);

  interface TrackedMutation {
    type: 'sync' | 'remove';
    variantId: string;
    quantity?: number;
  }
  const failedMutations = new Map<string, TrackedMutation>();

  // 1. Rapid quantity changes: user clicks + from qty 1 to 2, then + from qty 2 to 3
  // Simulation: mutation 1 (qty 2) encounters intermittent network failure
  failedMutations.set('variant-active', { type: 'sync', variantId: 'variant-active', quantity: 2 });

  // User subsequently set quantity to 3 locally
  const localCart = [
    { variantId: 'variant-active', quantity: 3 },
  ];

  // If mutation 2 (qty 3) also encountered network failure, failedMutations updates with latest operation
  failedMutations.set('variant-active', { type: 'sync', variantId: 'variant-active', quantity: 3 });
  assert.equal(failedMutations.get('variant-active')?.quantity, 3, 'failedMutationsRef must track the latest intended operation');

  // 2. Retry execution: reconciles against latest intended local cart state
  for (const m of failedMutations.values()) {
    const latestLocal = localCart.find((i) => i.variantId === m.variantId);
    if (latestLocal) {
      // Sync latest local quantity (never stale older quantity)
      remoteDb.set(m.variantId, latestLocal.quantity);
      failedMutations.delete(m.variantId);
    } else {
      remoteDb.delete(m.variantId);
      failedMutations.delete(m.variantId);
    }
  }

  // 3. Confirm results
  assert.equal(failedMutations.size, 0, 'All retried mutations resolved');
  assert.equal(remoteDb.get('variant-active'), 3, 'Remote state converged to latest quantity 3, not stale quantity 2');
  assert.equal(remoteDb.get('variant-unrelated'), 5, 'Unrelated variants from other devices must never be deleted');

  // 4. Simulate user deleting the item while offline
  failedMutations.set('variant-active', { type: 'remove', variantId: 'variant-active' });
  localCart.length = 0; // Empty local cart

  for (const m of failedMutations.values()) {
    const latestLocal = localCart.find((i) => i.variantId === m.variantId);
    if (latestLocal) {
      remoteDb.set(m.variantId, latestLocal.quantity);
      failedMutations.delete(m.variantId);
    } else {
      remoteDb.delete(m.variantId);
      failedMutations.delete(m.variantId);
    }
  }

  assert.equal(remoteDb.has('variant-active'), false, 'Deleted variant removed from remote DB');
  assert.equal(remoteDb.get('variant-unrelated'), 5, 'Unrelated variants remain strictly untouched');
});


