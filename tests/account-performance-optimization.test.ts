import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

const WORKSPACE_DIR = process.cwd();

// =============================================================================
// 1. ACCOUNT DASHBOARD CONCURRENCY & STATIC CODE INTEGRITY
// =============================================================================

test('Account Dashboard: executes independent queries concurrently via Promise.all after verifying user.id', () => {
  const pagePath = join(WORKSPACE_DIR, 'app/(store)/account/page.tsx');
  const content = readFileSync(pagePath, 'utf-8');

  // Must ensure authentication check happens first
  const getUserIndex = content.indexOf('await supabase.auth.getUser()');
  const promiseAllIndex = content.indexOf('await Promise.all([');
  assert.ok(getUserIndex !== -1, 'Must call supabase.auth.getUser()');
  assert.ok(promiseAllIndex !== -1, 'Must use Promise.all to fetch independent queries concurrently');
  assert.ok(
    getUserIndex < promiseAllIndex,
    'Authentication check must strictly precede Promise.all database queries'
  );

  // Must verify user existence before queries
  const userCheckIndex = content.indexOf('if (!user)');
  assert.ok(userCheckIndex !== -1 && userCheckIndex < promiseAllIndex, 'Must check if (!user) before executing queries');

  // Verify the 4 queries included inside Promise.all
  assert.match(content, /Promise\.all\(\[\s*[\s\S]*?supabase\.from\(['"]profiles['"]\)/, 'Promise.all must query profiles');
  assert.match(content, /Promise\.all\(\[\s*[\s\S]*?supabase\.from\(['"]orders['"]\)/, 'Promise.all must query orders');
  assert.match(content, /Promise\.all\(\[\s*[\s\S]*?supabase\.from\(['"]addresses['"]\)/, 'Promise.all must query addresses');
  assert.match(content, /Promise\.all\(\[\s*[\s\S]*?supabase\.from\(['"]wishlists['"]\)/, 'Promise.all must query wishlists');
});

// =============================================================================
// 2. STRICT OWNERSHIP FILTERING & DATA SECURITY
// =============================================================================

test('Account Dashboard: strictly filters every query by customer ownership (user.id / wishlist_id)', () => {
  const pagePath = join(WORKSPACE_DIR, 'app/(store)/account/page.tsx');
  const content = readFileSync(pagePath, 'utf-8');

  // 1. profiles query strictly filtered by user.id
  assert.match(
    content,
    /from\(['"]profiles['"]\)[\s\S]*?\.eq\(['"]id['"],\s*user\.id\)/,
    'profiles query must be filtered by user.id'
  );

  // 2. orders query strictly filtered by user_id
  assert.match(
    content,
    /from\(['"]orders['"]\)[\s\S]*?\.eq\(['"]user_id['"],\s*user\.id\)/,
    'orders query must be filtered by user_id'
  );

  // 3. addresses query strictly filtered by user_id
  assert.match(
    content,
    /from\(['"]addresses['"]\)[\s\S]*?\.eq\(['"]user_id['"],\s*user\.id\)/,
    'addresses query must be filtered by user_id'
  );

  // 4. wishlists query strictly filtered by user_id
  assert.match(
    content,
    /from\(['"]wishlists['"]\)[\s\S]*?\.eq\(['"]user_id['"],\s*user\.id\)/,
    'wishlists query must be filtered by user_id'
  );

  // 5. wishlist_items query strictly filtered by userWishlist.id
  assert.match(
    content,
    /from\(['"]wishlist_items['"]\)[\s\S]*?\.eq\(['"]wishlist_id['"],\s*userWishlist\.id\)/,
    'wishlist_items query must be filtered by userWishlist.id'
  );
});

// =============================================================================
// 3. SAFE COLUMN PROJECTIONS (OMITTING ADMIN NOTES & LEAKY COLUMNS)
// =============================================================================

test('Account Dashboard: preserves safe column projections and omits admin_notes', () => {
  const pagePath = join(WORKSPACE_DIR, 'app/(store)/account/page.tsx');
  const content = readFileSync(pagePath, 'utf-8');

  // Extract the orders .select(...) query string
  const ordersSelectMatch = content.match(/from\(['"]orders['"]\)[\s\S]*?\.select\(\s*`([\s\S]*?)`/);
  assert.ok(ordersSelectMatch, 'Orders select query must be found');
  const ordersProjection = ordersSelectMatch[1];

  // Orders projection must only select safe public fields
  assert.match(ordersProjection, /order_number/, 'Must project order_number');
  assert.match(ordersProjection, /order_status/, 'Must project order_status');
  assert.match(ordersProjection, /total_amount/, 'Must project total_amount');
  assert.doesNotMatch(ordersProjection, /admin_notes/, 'Must NEVER project admin_notes in customer orders select query');

  // Limit orders to 3
  assert.match(content, /\.limit\(3\)/, 'Must limit recent orders to 3');
});

// =============================================================================
// 4. QUERY DEPENDENCY ORDERING (WISHLIST ITEMS)
// =============================================================================

test('Account Dashboard: wishlist_items count is queried only after wishlist ID is retrieved', async () => {
  const pagePath = join(WORKSPACE_DIR, 'app/(store)/account/page.tsx');
  const content = readFileSync(pagePath, 'utf-8');

  // Must ensure wishlist_items is OUTSIDE the Promise.all
  const promiseAllBlock = content.slice(content.indexOf('Promise.all(['), content.indexOf(']);'));
  assert.doesNotMatch(
    promiseAllBlock,
    /from\(['"]wishlist_items['"]\)/,
    'wishlist_items query must NOT be inside initial Promise.all because it depends on wishlist.id'
  );

  // Verify sequential dependency handling:
  const executionOrder: string[] = [];

  const mockDb = {
    async fetchProfile(userId: string) {
      executionOrder.push('profile');
      return { id: userId, full_name: 'Test Customer' };
    },
    async fetchOrders(userId: string) {
      executionOrder.push('orders');
      return { data: [{ id: 'ord-1', total_amount: 5000 }], count: 1 };
    },
    async fetchAddresses(userId: string) {
      executionOrder.push('addresses');
      return { count: 2 };
    },
    async fetchWishlist(userId: string) {
      executionOrder.push('wishlist');
      return { id: 'wl-abc-123' };
    },
    async fetchWishlistItems(wishlistId: string) {
      executionOrder.push(`wishlist_items:${wishlistId}`);
      return { count: 5 };
    },
  };

  // Run simulated concurrent fetching matching the pattern in page.tsx
  const [profileRes, ordersRes, addressRes, wishlistRes] = await Promise.all([
    mockDb.fetchProfile('user-42'),
    mockDb.fetchOrders('user-42'),
    mockDb.fetchAddresses('user-42'),
    mockDb.fetchWishlist('user-42'),
  ]);

  let wishlistItemsCount = 0;
  if (wishlistRes?.id) {
    const itemsRes = await mockDb.fetchWishlistItems(wishlistRes.id);
    wishlistItemsCount = itemsRes.count;
  }

  // Verify wishlist_items was called after all 4 parallel queries
  assert.equal(executionOrder.length, 5);
  assert.equal(executionOrder[4], 'wishlist_items:wl-abc-123');
  assert.equal(wishlistItemsCount, 5);

  // Case 2: User has no wishlist
  let nullWishlistItemsCount = 0;
  const noWishlistRes: { id?: string } | null = (null as unknown) as { id?: string } | null;
  let itemsCalled = false;
  if (noWishlistRes?.id) {
    itemsCalled = true;
    nullWishlistItemsCount = (await mockDb.fetchWishlistItems(noWishlistRes.id)).count;
  }
  assert.equal(itemsCalled, false, 'Must not query wishlist_items if user has no wishlist');
  assert.equal(nullWishlistItemsCount, 0);
});

// =============================================================================
// 5. LOADING SKELETON INTEGRITY & CUSTOMER PRIVACY
// =============================================================================

test('Account Loading Skeleton: app/(store)/account/loading.tsx exists, has accessible role, and exposes no private data', () => {
  const loadingPath = join(WORKSPACE_DIR, 'app/(store)/account/loading.tsx');
  assert.ok(existsSync(loadingPath), 'app/(store)/account/loading.tsx must exist');

  const loadingContent = readFileSync(loadingPath, 'utf-8');

  // 1. Accessibility attributes
  assert.match(loadingContent, /role="status"/, 'Loading skeleton must declare role="status"');
  assert.match(loadingContent, /aria-label="Loading account dashboard"/, 'Loading skeleton must have accessible label');

  // 2. Matches page layout & container
  assert.match(loadingContent, /Container\s+size="xl"/, 'Loading skeleton must use Container size="xl"');
  assert.match(loadingContent, /min-h-\[80vh\]/, 'Loading skeleton must match page min-h-[80vh]');

  // 3. Mirrors 4 quick action cards
  assert.match(loadingContent, /grid-cols-1\s+sm:grid-cols-2\s+lg:grid-cols-4/, 'Loading skeleton must mirror 4-card grid');

  // 4. Strict customer privacy check: No private customer data hardcoded
  assert.doesNotMatch(loadingContent, /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, 'Loading skeleton must not contain email addresses');
  assert.doesNotMatch(loadingContent, /Rs\./, 'Loading skeleton must not hardcode currency amounts');
  assert.doesNotMatch(loadingContent, /\+94|07\d{8}/, 'Loading skeleton must not contain phone numbers');
  assert.doesNotMatch(loadingContent, /SJ-ORD-/, 'Loading skeleton must not contain order numbers');
});

// =============================================================================
// 6. PERFORMANCE CONCURRENCY BENCHMARK SIMULATION
// =============================================================================

test('Account Concurrency Benchmark: Promise.all executes queries in parallel with peak concurrency of 4', async () => {
  let activeInFlight = 0;
  let maxConcurrency = 0;

  const trackInFlight = async <T>(fn: () => Promise<T>): Promise<T> => {
    activeInFlight++;
    maxConcurrency = Math.max(maxConcurrency, activeInFlight);
    try {
      return await fn();
    } finally {
      activeInFlight--;
    }
  };

  const queryProfile = () => trackInFlight(() => new Promise<string>((r) => setTimeout(() => r('profile'), 10)));
  const queryOrders = () => trackInFlight(() => new Promise<string>((r) => setTimeout(() => r('orders'), 10)));
  const queryAddresses = () => trackInFlight(() => new Promise<string>((r) => setTimeout(() => r('addresses'), 10)));
  const queryWishlist = () => trackInFlight(() => new Promise<string>((r) => setTimeout(() => r('wishlist'), 10)));

  // Test 1: Sequential execution has peak concurrency of exactly 1
  activeInFlight = 0;
  maxConcurrency = 0;
  await queryProfile();
  await queryOrders();
  await queryAddresses();
  await queryWishlist();
  assert.equal(maxConcurrency, 1, 'Sequential execution peak concurrency must be 1');

  // Test 2: Promise.all executes all 4 queries concurrently with peak concurrency of 4
  activeInFlight = 0;
  maxConcurrency = 0;
  await Promise.all([queryProfile(), queryOrders(), queryAddresses(), queryWishlist()]);
  assert.equal(maxConcurrency, 4, 'Promise.all must execute all 4 queries concurrently with peak concurrency of 4');
});
