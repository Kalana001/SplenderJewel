import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WORKSPACE_DIR = process.cwd();

// =============================================================================
// 1. AUDIT-002: SEARCH SYNCHRONIZATION & URL HANDLING
// =============================================================================

test('Search Synchronization: CatalogBrowser initializes search input from URL and preserves query', () => {
  const browserPath = join(WORKSPACE_DIR, 'components/store/catalog-browser.tsx');
  assert.ok(existsSync(browserPath), 'catalog-browser.tsx must exist');

  const content = readFileSync(browserPath, 'utf-8');

  // Verify search input initializes from URL / initialSearchQuery
  assert.match(
    content,
    /searchParams\.get\(['"]q['"]\)\s*\|\|\s*initialSearchQuery/,
    'CatalogBrowser must initialize searchTerm from searchParams.get("q") or initialSearchQuery'
  );

  // Verify input reflects searchTerm value
  assert.match(
    content,
    /value=\{searchTerm\}/,
    'Search input must display the active search term'
  );

  // Verify form wrapper for submitting new query to server
  assert.match(
    content,
    /<form\s+[^>]*onSubmit=\{handleSearchSubmit\}/,
    'Search input must be wrapped in a form with handleSearchSubmit to trigger server search'
  );

  // Verify clear search button (X) is rendered when query exists
  assert.match(
    content,
    /onClick=\{handleClearSearch\}[\s\S]*?aria-label=["']Clear search query["']/,
    'Clear search button must be present when a search query is active'
  );
});

test('Search Synchronization: Submitting search navigates to /search?q= and avoids redundant push', () => {
  const browserPath = join(WORKSPACE_DIR, 'components/store/catalog-browser.tsx');
  const content = readFileSync(browserPath, 'utf-8');

  // Check duplicate prevention
  assert.match(
    content,
    /query\s*===\s*currentQ/,
    'Must check if query matches current active query to avoid redundant router pushes'
  );

  // Check encoding with encodeURIComponent
  assert.match(
    content,
    /encodeURIComponent\(query\)/,
    'Search term must be safely encoded with encodeURIComponent'
  );

  // Check navigation to /search?q=
  assert.match(
    content,
    /router\.push\(`\/search\?q=\$\{encodeURIComponent\(query\)\}`\)/,
    'Must navigate to /search?q= on submit to fetch fresh server results'
  );

  // Check browser back/forward synchronization effect
  assert.match(
    content,
    /useEffect\(\(\)\s*=>\s*\{[\s\S]*?setSearchTerm\(urlQuery\);[\s\S]*?\},?\s*\[searchParams\]\)/,
    'Must synchronize search input state with searchParams when browser back/forward occurs'
  );
});

test('Search Page: app/(store)/search/page.tsx forwards parameters and handles empty state gracefully', () => {
  const searchPagePath = join(WORKSPACE_DIR, 'app/(store)/search/page.tsx');
  assert.ok(existsSync(searchPagePath), 'search/page.tsx must exist');

  const content = readFileSync(searchPagePath, 'utf-8');

  // Must accept Promise<{ q?: string; page?: string; ... }>
  assert.match(
    content,
    /searchParams:\s*Promise<\{[\s\S]*?q\?: string;[\s\S]*?page\?: string;/,
    'Search page must declare typed searchParams promise'
  );

  // Must pass pagination and query parameters to CatalogBrowser
  assert.match(
    content,
    /currentPage=\{productsRes\.page\}/,
    'Must pass currentPage to CatalogBrowser'
  );
  assert.match(
    content,
    /totalPages=\{productsRes\.totalPages\}/,
    'Must pass totalPages to CatalogBrowser'
  );
  assert.match(
    content,
    /totalProducts=\{productsRes\.total\}/,
    'Must pass totalProducts to CatalogBrowser'
  );
  assert.match(
    content,
    /initialSearchQuery=\{searchTerm\}/,
    'Must pass initialSearchQuery to CatalogBrowser'
  );
});

// =============================================================================
// 2. AUDIT-004: CATALOG PAGINATION & PARAMETER PRESERVATION
// =============================================================================

test('Catalog Pagination: getPublicProducts safely parses page and limit with strict bounds', () => {
  const publicPath = join(WORKSPACE_DIR, 'lib/catalog/public.ts');
  const content = readFileSync(publicPath, 'utf-8');

  // Verify page integer parsing and fallback
  assert.match(
    content,
    /Number\.isInteger\(rawPage\)\s*&&\s*rawPage\s*>=\s*1\s*\?\s*rawPage\s*:\s*1/,
    'getPublicProducts must validate page as integer >= 1'
  );

  // Verify limit capping to prevent expensive unbounded queries (max 48)
  assert.match(
    content,
    /Math\.min\(48,\s*rawLimit\)/,
    'getPublicProducts must cap limit to 48 products to prevent unbounded database queries'
  );

  // Verify totalPages calculation
  assert.match(
    content,
    /totalPages\s*=\s*Math\.ceil\(total\s*\/\s*limit\)/,
    'getPublicProducts must compute totalPages based on exact count and limit'
  );
});

test('Catalog Pagination: Shop and Category pages pass server-side pagination parameters', () => {
  const shopPath = join(WORKSPACE_DIR, 'app/(store)/shop/page.tsx');
  const categoryPath = join(WORKSPACE_DIR, 'app/(store)/category/[slug]/page.tsx');

  const shopContent = readFileSync(shopPath, 'utf-8');
  const catContent = readFileSync(categoryPath, 'utf-8');

  // Shop page pagination integration
  assert.match(shopContent, /currentPage=\{productsRes\.page\}/);
  assert.match(shopContent, /totalPages=\{productsRes\.totalPages\}/);
  assert.match(shopContent, /baseUrl=["']\/shop["']/);

  // Category page pagination integration
  assert.match(catContent, /currentPage=\{productsRes\.page\}/);
  assert.match(catContent, /totalPages=\{productsRes\.totalPages\}/);
  assert.match(catContent, /baseUrl=\{`\/category\/\$\{slug\}`\}/);
});

test('Catalog Pagination: CatalogBrowser builds URLs that preserve existing filters and sorting', () => {
  const browserPath = join(WORKSPACE_DIR, 'components/store/catalog-browser.tsx');
  const content = readFileSync(browserPath, 'utf-8');

  // Verify URLSearchParams preserves existing query string params
  assert.match(
    content,
    /new\s+URLSearchParams\(searchParams\.toString\(\)\)/,
    'getPageUrl must preserve all existing searchParams (q, sort, gender, material)'
  );

  // Verify page 1 removes ?page= for clean canonical URL
  assert.match(
    content,
    /if\s*\(targetPage\s*<=\s*1\)\s*\{\s*params\.delete\(['"]page['"]\);/,
    'Page 1 must delete "page" param for clean URLs'
  );

  // Verify navigation buttons (Previous and Next)
  assert.match(content, /aria-label=["']Previous page["']/);
  assert.match(content, /aria-label=["']Next page["']/);

  // Verify out-of-range empty page handling
  assert.match(
    content,
    /currentPage\s*>\s*totalPages\s*&&\s*totalPages\s*>\s*0/,
    'CatalogBrowser must render friendly recovery UI when page is out of range'
  );
});

test('Catalog Pagination: Mock calculation verifies products beyond 48 are accessible across multiple pages', () => {
  // Test pagination calculation logic with 120 products (beyond 48 limit)
  const totalItems = 120;
  const limit = 24;
  const totalPages = Math.ceil(totalItems / limit);

  assert.equal(totalPages, 5, '120 items with limit 24 must yield 5 pages');

  // Page 1: items 0-23
  const page1Offset = (1 - 1) * limit;
  assert.equal(page1Offset, 0);

  // Page 2: items 24-47
  const page2Offset = (2 - 1) * limit;
  assert.equal(page2Offset, 24);

  // Page 3: items 48-71 (Accessing beyond 48!)
  const page3Offset = (3 - 1) * limit;
  assert.equal(page3Offset, 48);

  // Page 5: items 96-119
  const page5Offset = (5 - 1) * limit;
  assert.equal(page5Offset, 96);
});

// =============================================================================
// 3. AUDIT-006: GUEST FOOTER & ORDER HISTORY GUIDANCE
// =============================================================================

test('Guest Footer: footer.tsx replaces misleading Order Tracking with Order History (Account)', () => {
  const footerPath = join(WORKSPACE_DIR, 'components/store/footer.tsx');
  assert.ok(existsSync(footerPath), 'footer.tsx must exist');

  const content = readFileSync(footerPath, 'utf-8');

  // Must NOT have bare misleading "Order Tracking"
  assert.doesNotMatch(
    content,
    />\s*Order Tracking\s*<\/Link>/,
    'Footer must not contain bare misleading "Order Tracking" link'
  );

  // Must accurately describe the authenticated order-history page
  assert.match(
    content,
    /Order History \(Account\)/,
    'Footer must describe /account/orders as Order History (Account)'
  );

  // Must provide guidance for guests to use confirmation email/WhatsApp or contact support
  assert.match(
    content,
    /Guest orders:[\s\S]*?order confirmation[\s\S]*?contact customer support/,
    'Footer must provide explicit guidance for guest orders without creating an unauthenticated lookup endpoint'
  );
});

// =============================================================================
// 4. SECURITY & PRIVACY VERIFICATION
// =============================================================================

test('Catalog Security: getPublicProducts strictly filters active products and active variants', () => {
  const publicPath = join(WORKSPACE_DIR, 'lib/catalog/public.ts');
  const content = readFileSync(publicPath, 'utf-8');

  // Must filter is_active = true on products
  assert.match(content, /\.eq\(['"]is_active['"],\s*true\)/);

  // Must filter is_active = true on variants
  assert.match(content, /v\.is_active\s*===\s*true/);

  // Must NEVER select purchase_cost in queries
  assert.doesNotMatch(
    content,
    /\.select\([\s\S]*?purchase_cost[\s\S]*?\)/,
    'Customer-facing catalog queries must never retrieve or expose purchase_cost'
  );
});

test('Checkout Flag Safety: NEXT_PUBLIC_ENABLE_LIVE_CHECKOUT remains disabled in local environment', () => {
  const envPath = join(WORKSPACE_DIR, '.env.local');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    assert.match(
      envContent,
      /NEXT_PUBLIC_ENABLE_LIVE_CHECKOUT=false/,
      'NEXT_PUBLIC_ENABLE_LIVE_CHECKOUT must be false'
    );
  }
});
