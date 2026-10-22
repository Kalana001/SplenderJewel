import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  isWishlistRowOwnedByUser,
  mapWishlistRowsForUser,
  type RawWishlistRow,
} from '../lib/wishlist/wishlist-view.ts';
import {
  CUSTOMER_ORDERS_PAGE_SIZE,
  parseOrdersPageParam,
  calculateOrdersPaginationRange,
  buildOrdersPaginationMeta,
} from '../lib/orders/customer-orders.ts';

const WORKSPACE_DIR = process.cwd();
const readSource = (relPath: string) => readFileSync(join(WORKSPACE_DIR, relPath), 'utf-8');

function extractFunctionBody(source: string, fnSignature: string): string {
  const start = source.indexOf(fnSignature);
  assert.ok(start !== -1, `Expected to find ${fnSignature}`);
  const nextExport = source.indexOf('\nexport async function ', start + fnSignature.length);
  return nextExport === -1 ? source.slice(start) : source.slice(start, nextExport);
}

// =============================================================================
// TASK 1: WISHLIST DATABASE READ OPTIMIZATION & ISOLATION
// =============================================================================

test('Task 1.1: getCustomerWishlist executes a single RLS-protected read and never inserts on read', () => {
  const actionsSource = readSource('lib/wishlist/actions.ts');
  const body = extractFunctionBody(actionsSource, 'export async function getCustomerWishlist(');

  // 1. Must reuse request-scoped getCurrentUser()
  assert.match(body, /await\s+getCurrentUser\(\)/, 'Must use request-scoped getCurrentUser()');

  // 2. Guest behavior preserved
  assert.match(
    body,
    /if\s*\(!user\)\s*\{\s*return\s*\{\s*success:\s*true,\s*items:\s*\[\]\s*\};?\s*\}/,
    'Unauthenticated callers must receive empty items without DB queries'
  );

  // 3. Must execute exactly 1 supabase.from(...) call on wishlist_items joining wishlists!inner
  const fromCalls = body.match(/supabase\.from\(/g) || [];
  assert.equal(fromCalls.length, 1, 'getCustomerWishlist must execute exactly 1 database query');
  assert.match(body, /supabase\.from\(['"]wishlist_items['"]\)/, 'Must query wishlist_items directly');
  assert.match(body, /wishlists!inner\s*\(\s*user_id\s*\)/, 'Must inner-join wishlists(user_id)');
  assert.match(
    body,
    /\.eq\(['"]wishlists\.user_id['"],\s*user\.id\)/,
    'Must filter by wishlists.user_id = user.id'
  );

  // 4. Must NEVER insert an empty wishlist record on page read
  assert.doesNotMatch(body, /\.insert\(/, 'getCustomerWishlist must NEVER perform a database write/insert on read');
});

test('Task 1.2: getCustomerWishlistCount and checkProductWishlistStatus each execute a single query', () => {
  const actionsSource = readSource('lib/wishlist/actions.ts');

  const countBody = extractFunctionBody(actionsSource, 'export async function getCustomerWishlistCount');
  const countFromCalls = countBody.match(/supabase\.from\(/g) || [];
  assert.equal(countFromCalls.length, 1, 'getCustomerWishlistCount must execute exactly 1 database query');
  assert.match(
    countBody,
    /select\(['"]id,\s*wishlists!inner\(user_id\)['"],\s*\{\s*count:\s*['"]exact['"],\s*head:\s*true\s*\}\)/,
    'getCustomerWishlistCount must use single HEAD exact count query with wishlists!inner(user_id)'
  );
  assert.match(
    countBody,
    /\.eq\(['"]wishlists\.user_id['"],\s*user\.id\)/,
    'getCustomerWishlistCount must filter by wishlists.user_id = user.id'
  );
  assert.doesNotMatch(countBody, /\.insert\(/, 'getCustomerWishlistCount must never insert');

  const statusBody = extractFunctionBody(actionsSource, 'export async function checkProductWishlistStatus');
  const statusFromCalls = statusBody.match(/supabase\.from\(/g) || [];
  assert.equal(statusFromCalls.length, 1, 'checkProductWishlistStatus must execute exactly 1 database query');
  assert.match(
    statusBody,
    /select\(['"]id,\s*wishlists!inner\(user_id\)['"]\)/,
    'checkProductWishlistStatus must join wishlists!inner(user_id)'
  );
  assert.match(
    statusBody,
    /\.eq\(['"]wishlists\.user_id['"],\s*user\.id\)/,
    'checkProductWishlistStatus must filter by wishlists.user_id = user.id'
  );
  assert.match(
    statusBody,
    /\.eq\(['"]product_id['"],\s*productId\)/,
    'checkProductWishlistStatus must filter by product_id'
  );
});

test('Task 1.3: addToWishlist preserves wishlist creation when saving a product and prevents duplicates', () => {
  const actionsSource = readSource('lib/wishlist/actions.ts');
  const addBody = extractFunctionBody(actionsSource, 'export async function addToWishlist');

  assert.match(addBody, /await\s+requireCustomerAuth\(\)/, 'addToWishlist must require customer auth');
  assert.match(
    addBody,
    /supabase\.from\(['"]wishlists['"]\)[\s\S]*?\.insert\(\{\s*user_id:\s*profile\.id\s*\}\)/,
    'addToWishlist must preserve creating the wishlist record when a customer actually saves a product'
  );
  assert.match(
    addBody,
    /existingQuery\.eq\(['"]variant_id['"],\s*targetVariantId\)/,
    'addToWishlist must check duplicate variant_id'
  );
  assert.match(
    addBody,
    /existingQuery\.is\(['"]variant_id['"],\s*null\)/,
    'addToWishlist must check duplicate NULL variant_id'
  );
});

test('Task 1.4: Wishlist row mapper enforces strict customer isolation, handles empty state, and prevents duplicates', () => {
  const customerA = 'user-aaa-111';
  const customerB = 'user-bbb-222';

  // 1. Empty wishlist (customer has no wishlist row or 0 items)
  assert.deepEqual(mapWishlistRowsForUser([], customerA), []);
  assert.deepEqual(mapWishlistRowsForUser(null, customerA), []);
  assert.equal(isWishlistRowOwnedByUser(null, customerA), false);

  // 2. Mixed rows: customer A's items, a duplicate row ID, and customer B's item
  const rawRows: RawWishlistRow[] = [
    {
      id: 'wi-1',
      created_at: '2026-10-22T10:00:00Z',
      wishlists: { user_id: customerA },
      products: {
        id: 'prod-1',
        name: 'Ceylon Sapphire Pendant',
        slug: 'ceylon-sapphire-pendant',
        product_images: [
          { url: 'https://cdn.example.com/secondary.jpg', is_primary: false },
          { url: 'https://cdn.example.com/primary.jpg', is_primary: true },
        ],
      },
      product_variants: {
        id: 'var-1',
        title: '18K Yellow Gold',
        sku: 'SJ-CSP-18K',
        price: 45000,
        discount_price: 39500,
        stock_status: 'in_stock',
      },
    },
    // Duplicate of wi-1 (must be deduplicated)
    {
      id: 'wi-1',
      created_at: '2026-10-22T10:00:00Z',
      wishlists: { user_id: customerA },
      products: { id: 'prod-1', name: 'Duplicate', slug: 'ceylon-sapphire-pendant' },
      product_variants: null,
    },
    // Another customer's item (must NEVER be exposed to customerA)
    {
      id: 'wi-foreign',
      created_at: '2026-10-22T11:00:00Z',
      wishlists: { user_id: customerB },
      products: {
        id: 'prod-secret',
        name: 'Other Customer Ring',
        slug: 'other-customer-ring',
        product_images: [{ url: 'https://cdn.example.com/secret.jpg', is_primary: true }],
      },
      product_variants: {
        id: 'var-secret',
        title: 'Size 6',
        sku: 'SJ-SEC-6',
        price: 99000,
        discount_price: null,
        stock_status: 'low_stock',
      },
    },
    // Array-shaped PostgREST join for customerA with fallback image
    {
      id: 'wi-2',
      created_at: '2026-10-21T09:00:00Z',
      wishlists: [{ user_id: customerA }],
      products: {
        id: 'prod-2',
        name: 'Lotus Gold Anklet',
        slug: 'lotus-gold-anklet',
        product_images: [{ url: 'https://cdn.example.com/fallback.jpg', is_primary: false }],
      },
      product_variants: {
        id: 'var-2',
        title: 'Standard',
        sku: 'SJ-LGA-STD',
        price: 18500,
        discount_price: null,
        stock_status: 'low_stock',
      },
    },
  ];

  const mappedForA = mapWishlistRowsForUser(rawRows, customerA);
  assert.equal(mappedForA.length, 2, 'Must return only customer A unique items and exclude customer B');
  assert.deepEqual(
    mappedForA.map((i) => i.id),
    ['wi-1', 'wi-2']
  );
  assert.equal(mappedForA[0].imageUrl, 'https://cdn.example.com/primary.jpg', 'Must select is_primary image');
  assert.equal(mappedForA[0].price, 45000);
  assert.equal(mappedForA[0].discountPrice, 39500);
  assert.equal(mappedForA[1].imageUrl, 'https://cdn.example.com/fallback.jpg', 'Must fall back to first image');

  const mappedForB = mapWishlistRowsForUser(rawRows, customerB);
  assert.equal(mappedForB.length, 1);
  assert.equal(mappedForB[0].id, 'wi-foreign');
});

// =============================================================================
// TASK 2: ORDER HISTORY OPTIMIZATION & FULL ACCESS TO OLDER ORDERS
// =============================================================================

test('Task 2.1: Order History and Order Detail pages reuse request-scoped getCurrentUser() and enforce ownership', () => {
  const ordersPage = readSource('app/(store)/account/orders/page.tsx');
  const orderDetailPage = readSource('app/(store)/account/orders/[orderId]/page.tsx');

  // Both must import and call getCurrentUser() from @/lib/auth/server
  assert.match(ordersPage, /import\s*\{\s*getCurrentUser\s*\}\s*from\s*['"]@\/lib\/auth\/server['"]/);
  assert.match(ordersPage, /const\s+user\s*=\s*await\s+getCurrentUser\(\)/);
  assert.doesNotMatch(ordersPage, /supabase\.auth\.getUser\(\)/, 'Must not call uncached supabase.auth.getUser() directly');

  assert.match(orderDetailPage, /import\s*\{\s*getCurrentUser\s*\}\s*from\s*['"]@\/lib\/auth\/server['"]/);
  assert.match(orderDetailPage, /const\s+user\s*=\s*await\s+getCurrentUser\(\)/);
  assert.doesNotMatch(orderDetailPage, /supabase\.auth\.getUser\(\)/, 'Must not call uncached supabase.auth.getUser() directly');

  // Ownership filtering preserved
  assert.match(ordersPage, /\.eq\(['"]user_id['"],\s*user\.id\)/);
  assert.match(orderDetailPage, /\.eq\(['"]id['"],\s*orderId\)/);
  assert.match(orderDetailPage, /\.eq\(['"]user_id['"],\s*user\.id\)/);

  // Order details & payment info preserved
  assert.match(ordersPage, /payment_method/);
  assert.match(ordersPage, /payment_status/);
  assert.match(ordersPage, /order_status/);
  assert.match(ordersPage, /total_amount/);
  assert.match(ordersPage, /tracking_number/);
});

test('Task 2.2: Order History pagination provides full access to older orders and clamps out-of-range pages', () => {
  // 1. Page param parsing
  assert.equal(parseOrdersPageParam(undefined), 1);
  assert.equal(parseOrdersPageParam(null), 1);
  assert.equal(parseOrdersPageParam(''), 1);
  assert.equal(parseOrdersPageParam('-3'), 1);
  assert.equal(parseOrdersPageParam('0'), 1);
  assert.equal(parseOrdersPageParam('abc'), 1);
  assert.equal(parseOrdersPageParam('2'), 2);
  assert.equal(parseOrdersPageParam(['3', '1']), 3);

  // 2. Range calculation for PostgREST .range(from, to)
  assert.deepEqual(calculateOrdersPaginationRange(1, 10), {
    page: 1,
    pageSize: 10,
    from: 0,
    to: 9,
  });
  assert.deepEqual(calculateOrdersPaginationRange(2, 10), {
    page: 2,
    pageSize: 10,
    from: 10,
    to: 19,
  });
  assert.deepEqual(calculateOrdersPaginationRange(3, 10), {
    page: 3,
    pageSize: 10,
    from: 20,
    to: 29,
  });

  // 3. Pagination metadata for 25 orders across 3 pages (10 per page)
  const page1Meta = buildOrdersPaginationMeta(25, 1, CUSTOMER_ORDERS_PAGE_SIZE);
  assert.deepEqual(page1Meta, {
    totalCount: 25,
    totalPages: 3,
    currentPage: 1,
    pageSize: 10,
    hasPreviousPage: false,
    hasNextPage: true,
    startItem: 1,
    endItem: 10,
  });

  const page2Meta = buildOrdersPaginationMeta(25, 2, CUSTOMER_ORDERS_PAGE_SIZE);
  assert.deepEqual(page2Meta, {
    totalCount: 25,
    totalPages: 3,
    currentPage: 2,
    pageSize: 10,
    hasPreviousPage: true,
    hasNextPage: true,
    startItem: 11,
    endItem: 20,
  });

  const page3Meta = buildOrdersPaginationMeta(25, 3, CUSTOMER_ORDERS_PAGE_SIZE);
  assert.deepEqual(page3Meta, {
    totalCount: 25,
    totalPages: 3,
    currentPage: 3,
    pageSize: 10,
    hasPreviousPage: true,
    hasNextPage: false,
    startItem: 21,
    endItem: 25,
  });

  // Out-of-range page (e.g. ?page=99) clamps to page 3 so older orders are never hidden
  const clampedMeta = buildOrdersPaginationMeta(25, 99, CUSTOMER_ORDERS_PAGE_SIZE);
  assert.equal(clampedMeta.currentPage, 3);
  assert.equal(clampedMeta.startItem, 21);
  assert.equal(clampedMeta.endItem, 25);

  // Verify orders/page.tsx renders Older Orders & Newer Orders links
  const ordersPage = readSource('app/(store)/account/orders/page.tsx');
  assert.match(ordersPage, /aria-label="Order history pagination"/);
  assert.match(ordersPage, /Older Orders/);
  assert.match(ordersPage, /Newer Orders/);
});

// =============================================================================
// TASK 3: LOADING SKELETONS & ACCOUNT NAVIGATION FEEDBACK
// =============================================================================

test('Task 3.1: Order History and Order Details loading skeletons exist, match design, and expose no private data', () => {
  const ordersLoadingPath = 'app/(store)/account/orders/loading.tsx';
  const detailLoadingPath = 'app/(store)/account/orders/[orderId]/loading.tsx';

  assert.ok(existsSync(join(WORKSPACE_DIR, ordersLoadingPath)), 'orders/loading.tsx must exist');
  assert.ok(existsSync(join(WORKSPACE_DIR, detailLoadingPath)), 'orders/[orderId]/loading.tsx must exist');

  const ordersLoading = readSource(ordersLoadingPath);
  const detailLoading = readSource(detailLoadingPath);

  // Accessibility & layout matching
  assert.match(ordersLoading, /role="status"/);
  assert.match(ordersLoading, /aria-label="Loading order history"/);
  assert.match(ordersLoading, /Container\s+size="xl"/);
  assert.match(ordersLoading, /min-h-\[80vh\]/);
  assert.match(ordersLoading, /luxury-gold/);

  assert.match(detailLoading, /role="status"/);
  assert.match(detailLoading, /aria-label="Loading order details"/);
  assert.match(detailLoading, /Container\s+size="xl"/);
  assert.match(detailLoading, /lg:grid-cols-3/);
  assert.match(detailLoading, /luxury-gold/);

  // Zero private customer data in skeletons
  for (const content of [ordersLoading, detailLoading]) {
    assert.doesNotMatch(content, /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    assert.doesNotMatch(content, /Rs\./);
    assert.doesNotMatch(content, /\+94|07\d{8}/);
    assert.doesNotMatch(content, /SJ-ORD-/);
  }
});

test('Task 3.2: AccountLayout and AccountNav provide active indicators, immediate pending feedback, and avoid aggressive private prefetching', () => {
  const layoutSource = readSource('app/(store)/account/layout.tsx');
  const navSource = readSource('components/store/account-nav.tsx');

  // AccountLayout renders AccountNav and preserves robots noindex/nofollow
  assert.match(layoutSource, /<AccountNav\s*\/>/);
  assert.match(layoutSource, /index:\s*false/);
  assert.match(layoutSource, /follow:\s*false/);

  // AccountNav includes key customer routes, aria-current, pending state, and prefetch={false}
  assert.match(navSource, /aria-label="Customer account navigation"/);
  assert.match(navSource, /href:\s*['"]\/account\/orders['"]/);
  assert.match(navSource, /href:\s*['"]\/account\/wishlist['"]/);
  assert.match(navSource, /aria-current=\{isCurrent \? 'page' : undefined\}/);
  assert.match(navSource, /aria-busy=\{isPending \? 'true' : undefined\}/);
  assert.match(navSource, /prefetch=\{false\}/, 'Must disable aggressive background prefetching of private account pages');
});
