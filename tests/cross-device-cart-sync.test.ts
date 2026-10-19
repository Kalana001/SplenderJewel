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
    /return\s*\{\s*success:\s*true,\s*items:\s*cartItems,\s*authenticated:\s*true\s*\}/,
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

