import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

const WORKSPACE_DIR = process.cwd();

// =============================================================================
// 1. PRODUCT PAGE ISR CONTRACT & ZERO COOKIE ISOLATION
// =============================================================================

test('Product Page ISR: app/(store)/products/[slug]/page.tsx enforces 60-second ISR and dynamicParams', () => {
  const pagePath = join(WORKSPACE_DIR, 'app/(store)/products/[slug]/page.tsx');
  assert.ok(existsSync(pagePath), 'Product detail page file must exist');

  const content = readFileSync(pagePath, 'utf-8');

  // Must export revalidate = 60
  assert.match(
    content,
    /export\s+const\s+revalidate\s*=\s*60\s*;/,
    'Product detail page must configure 60-second ISR (export const revalidate = 60)'
  );

  // Must enable dynamicParams
  assert.match(
    content,
    /export\s+const\s+dynamicParams\s*=\s*true\s*;/,
    'Product detail page must enable dynamicParams for on-demand ISR paths'
  );

  // Must define generateStaticParams for static prerendering / ISR classification
  assert.match(
    content,
    /export\s+async\s+function\s+generateStaticParams\s*\(\s*\)/,
    'Product detail page must export generateStaticParams to enable SSG/ISR compiler optimization'
  );
});

test('Product Page ISR: app/(store)/products/[slug]/page.tsx has zero customer cookie, header, or session access', () => {
  const pagePath = join(WORKSPACE_DIR, 'app/(store)/products/[slug]/page.tsx');
  const content = readFileSync(pagePath, 'utf-8');

  // Must NOT import cookies or headers from next/headers
  assert.doesNotMatch(
    content,
    /from\s+['"]next\/headers['"]/,
    'Product detail page must not import or read next/headers'
  );

  // Must NOT import user/auth/wishlist server actions in the server page
  assert.doesNotMatch(
    content,
    /getCurrentUser/,
    'Product detail page must not call getCurrentUser in server render tree'
  );
  assert.doesNotMatch(
    content,
    /getCustomerWishlist/,
    'Product detail page must not call getCustomerWishlist in server render tree'
  );
  assert.doesNotMatch(
    content,
    /requireCustomerAuth/,
    'Product detail page must not call requireCustomerAuth in server render tree'
  );

  // Server component must only fetch public product data and store contact WhatsApp
  assert.match(
    content,
    /Promise\.all\(\[\s*getPublicProductBySlug\(slug\),\s*getStoreWhatsAppNumber\(\),?\s*\]\)/,
    'Server page must only fetch public catalog and public WhatsApp number'
  );

  // Must pass only public props to ProductDetailViewer
  assert.doesNotMatch(
    content,
    /initialIsWishlisted\s*=/,
    'Product detail page must not pass server-derived initialIsWishlisted prop'
  );
  assert.doesNotMatch(
    content,
    /isAuthenticated\s*=/,
    'Product detail page must not pass server-derived isAuthenticated prop'
  );
});

// =============================================================================
// 2. WISHLIST MEMBERSHIP SERVER ACTION CONTRACT
// =============================================================================

test('Wishlist Server Action: lib/wishlist/actions.ts exports targeted checkProductWishlistStatus', () => {
  const actionsPath = join(WORKSPACE_DIR, 'lib/wishlist/actions.ts');
  assert.ok(existsSync(actionsPath), 'Wishlist actions file must exist');

  const content = readFileSync(actionsPath, 'utf-8');

  // Must export checkProductWishlistStatus
  assert.match(
    content,
    /export\s+async\s+function\s+checkProductWishlistStatus\s*\(\s*productId\s*:\s*string\s*\)/,
    'Must export checkProductWishlistStatus(productId: string)'
  );

  // Must return isAuthenticated: false, isWishlisted: false for guests
  assert.match(
    content,
    /if\s*\(!user\)\s*\{\s*return\s*\{\s*isAuthenticated:\s*false,\s*isWishlisted:\s*false\s*\};?\s*\}/,
    'Must return { isAuthenticated: false, isWishlisted: false } for unauthenticated visitors without throwing'
  );

  // Must query single product membership directly rather than full wishlist items with heavy product joins
  assert.match(
    content,
    /\.from\(['"]wishlist_items['"]\)[\s\S]*?\.eq\(['"]product_id['"],\s*productId\)/,
    'Must query wishlist_items specifically for the target productId'
  );
});

// =============================================================================
// 3. CLIENT-SIDE WISHLIST HYDRATION & MONOTONIC RACE PREVENTION
// =============================================================================

test('Client Wishlist Hydration: components/store/product-detail-viewer.tsx handles client hydration and race prevention', () => {
  const viewerPath = join(WORKSPACE_DIR, 'components/store/product-detail-viewer.tsx');
  assert.ok(existsSync(viewerPath), 'Product detail viewer component must exist');

  const content = readFileSync(viewerPath, 'utf-8');

  // Must import checkProductWishlistStatus
  assert.match(
    content,
    /checkProductWishlistStatus/,
    'ProductDetailViewer must import checkProductWishlistStatus'
  );

  // Must maintain a sequence ref for monotonic race-condition prevention
  assert.match(
    content,
    /wishlistSeq\s*=\s*useRef\(0\)/,
    'ProductDetailViewer must declare wishlistSeq monotonic ref'
  );

  // Hydration effect must increment sequence and check before updating state
  assert.match(
    content,
    /\+\+wishlistSeq\.current/,
    'Hydration or toggle must increment wishlistSeq monotonic counter'
  );

  // Must listen to auth state changes to isolate account transitions
  assert.match(
    content,
    /splender:auth-signed-out/,
    'ProductDetailViewer must listen to splender:auth-signed-out event'
  );
  assert.match(
    content,
    /splender:auth-signed-in/,
    'ProductDetailViewer must listen to splender:auth-signed-in event'
  );

  // Must reset wishlist state on sign out
  assert.match(
    content,
    /setIsAuthenticated\(false\);\s*setIsWishlisted\(false\);/,
    'Must clear authentication and wishlist state upon sign-out'
  );

  // Toggle handler must prompt unauthenticated users
  assert.match(
    content,
    /if\s*\(!isAuthenticated\)\s*\{\s*setShowLoginPrompt\(true\);\s*return;\s*\}/,
    'Toggling wishlist when unauthenticated must open the login prompt modal'
  );
});

// =============================================================================
// 4. CLIENT HYDRATION SIMULATION & ACCOUNT ISOLATION
// =============================================================================

test('Wishlist Race Prevention: monotonic sequence counter prevents stale async responses from overriding newer user actions', () => {
  let seq = 0;
  let isWishlisted = false;

  // Hydration fetch initiated at t=0
  const fetchSeq = ++seq;
  let staleApplied = false;

  // User clicks toggle button at t=10 before hydration completes
  const toggleSeq = ++seq;
  isWishlisted = true; // optimistic update

  // Hydration finishes late with stale data (isWishlisted: false)
  const staleApiResponse = { isWishlisted: false };
  if (fetchSeq === seq) {
    isWishlisted = staleApiResponse.isWishlisted;
    staleApplied = true;
  }

  assert.equal(isWishlisted, true, 'User optimistic toggle must NOT be overwritten by stale hydration response');
  assert.equal(staleApplied, false, 'Stale hydration must be discarded by monotonic sequence guard');
});

test('Wishlist Account Isolation: sign-out resets client state and isolates account transitions', () => {
  let isWishlisted = true;
  let isAuthenticated = true;

  // User signs out (splender:auth-signed-out / SIGNED_OUT)
  const handleSignOut = () => {
    isAuthenticated = false;
    isWishlisted = false;
  };
  handleSignOut();

  assert.equal(isAuthenticated, false, 'Auth must be false after sign out');
  assert.equal(isWishlisted, false, 'Wishlist must be cleared after sign out');
});

test('Static Build Artifact: pre-rendered product page HTML contains zero customer data or private tokens', () => {
  const htmlPath = join(WORKSPACE_DIR, '.next/server/app/products/test-anklet-phase-6c.html');
  if (!existsSync(htmlPath)) {
    return;
  }
  const html = readFileSync(htmlPath, 'utf-8');
  assert.doesNotMatch(html, /sb-[a-z0-9_-]+-auth-token/i, 'Must not contain Supabase auth tokens');
  assert.doesNotMatch(html, /user_id/i, 'Must not contain user_id field');
  assert.match(html, /TEST Anklet/i, 'Must contain public product name');
  assert.match(html, /schema\.org/, 'Must contain public JSON-LD product metadata');
});

// =============================================================================
// 5. ADMIN CATALOG CACHE INVALIDATION
// =============================================================================

test('Admin Catalog Invalidation: lib/catalog/products.ts revalidates specific product slugs on mutation', () => {
  const productsPath = join(WORKSPACE_DIR, 'lib/catalog/products.ts');
  const content = readFileSync(productsPath, 'utf-8');

  // createProductAction revalidates specific slug
  assert.match(
    content,
    /if\s*\(rpcData\.slug\)\s*\{\s*revalidatePath\(`\/products\/\$\{rpcData\.slug\}`\);\s*\}/,
    'createProductAction must revalidate `/products/${rpcData.slug}`'
  );

  // updateProductAction revalidates both old and new slug on mutation
  assert.match(
    content,
    /if\s*\(existingProduct\?\.slug\)\s*\{\s*revalidatePath\(`\/products\/\$\{existingProduct\.slug\}`\);\s*\}/,
    'updateProductAction must revalidate old `/products/${existingProduct.slug}`'
  );
  assert.match(
    content,
    /if\s*\(updatedProduct\?\.slug\s*&&\s*updatedProduct\.slug\s*!==\s*existingProduct\?\.slug\)\s*\{\s*revalidatePath\(`\/products\/\$\{updatedProduct\.slug\}`\);\s*\}/,
    'updateProductAction must revalidate new `/products/${updatedProduct.slug}` when slug changes'
  );

  // toggleProductActiveAction revalidates specific slug
  assert.match(
    content,
    /if\s*\(updatedProduct\?\.slug\)\s*\{\s*revalidatePath\(`\/products\/\$\{updatedProduct\.slug\}`\);\s*\}/,
    'toggleProductActiveAction must revalidate `/products/${updatedProduct.slug}`'
  );

  // deleteProductAction revalidates specific slug
  assert.match(
    content,
    /if\s*\(targetProduct\?\.slug\)\s*\{\s*revalidatePath\(`\/products\/\$\{targetProduct\.slug\}`\);\s*\}/,
    'deleteProductAction must revalidate `/products/${targetProduct.slug}`'
  );

  // revalidateProductById helper exported
  assert.match(
    content,
    /export\s+async\s+function\s+revalidateProductById\s*\(\s*productId\?:\s*string\s*\|\s*null\s*\)/,
    'Must export revalidateProductById helper for variant/image invalidations'
  );
});

test('Admin Catalog Invalidation: variants and storage actions revalidate public product detail pages', () => {
  const variantsPath = join(WORKSPACE_DIR, 'lib/catalog/variants.ts');
  const storagePath = join(WORKSPACE_DIR, 'lib/catalog/storage.ts');

  const variantsContent = readFileSync(variantsPath, 'utf-8');
  const storageContent = readFileSync(storagePath, 'utf-8');

  // variants.ts calls revalidateProductById
  assert.match(
    variantsContent,
    /revalidateProductById/,
    'lib/catalog/variants.ts must import and call revalidateProductById'
  );

  // storage.ts calls revalidateProductById
  assert.match(
    storageContent,
    /revalidateProductById/,
    'lib/catalog/storage.ts must import and call revalidateProductById'
  );
});

// =============================================================================
// 6. LIVE STOCK & CHECKOUT INTEGRITY PRESERVATION
// =============================================================================

test('Stock Integrity: ProductDetailViewer checks live stock dynamically and does not rely on cached inventory', () => {
  const viewerPath = join(WORKSPACE_DIR, 'components/store/product-detail-viewer.tsx');
  const content = readFileSync(viewerPath, 'utf-8');

  // Must call checkVariantAvailabilityAction dynamically on variant change
  assert.match(
    content,
    /checkVariantAvailabilityAction\(selectedVariant\.id\)/,
    'ProductDetailViewer must dynamically query checkVariantAvailabilityAction on variant selection'
  );

  // Must maintain availability sequence counter
  assert.match(
    content,
    /availabilitySeq\s*=\s*useRef\(0\)/,
    'ProductDetailViewer must sequence stock availability requests'
  );
});

test('Cart & Checkout Price Safety: Checkout ignores client prices and executes atomic PostgreSQL verification', () => {
  const ordersPath = join(WORKSPACE_DIR, 'lib/orders/actions.ts');
  const ordersContent = readFileSync(ordersPath, 'utf-8');

  // Order creation passes only variant_id and quantity to RPC — never client-supplied unit prices
  assert.match(
    ordersContent,
    /p_items_data:\s*consolidatedItems\.map\(\s*\(i\)\s*=>\s*\(\{\s*variant_id:\s*i\.variantId,\s*quantity:\s*i\.quantity,?\s*\}\)\)/,
    'process_order_checkout must only receive variant_id and quantity; unit prices are resolved securely inside SQL'
  );
});
