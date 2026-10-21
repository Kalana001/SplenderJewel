import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { getSafeRedirectUrl } from '../lib/auth/redirect.ts';

const WORKSPACE_DIR = process.cwd();

// =============================================================================
// 1. AUDIT-001: WISHLIST LOGIN & REGISTRATION REDIRECTS
// =============================================================================

test('Wishlist Redirect: product-detail-viewer.tsx uses redirectTo parameter for return navigation', () => {
  const viewerPath = join(WORKSPACE_DIR, 'components/store/product-detail-viewer.tsx');
  assert.ok(existsSync(viewerPath), 'product-detail-viewer.tsx must exist');

  const content = readFileSync(viewerPath, 'utf-8');

  // Verify Sign In modal link uses ?redirectTo=
  assert.match(
    content,
    /\/login\?redirectTo=\/products\/\$\{product\.slug\}/,
    'Wishlist login link must use ?redirectTo= to match auth handler'
  );

  // Verify Register modal link uses ?redirectTo=
  assert.match(
    content,
    /\/register\?redirectTo=\/products\/\$\{product\.slug\}/,
    'Wishlist register link must use ?redirectTo= to match auth handler'
  );
});

test('Auth Redirect Handling: login and register pages support both redirectTo and redirect parameters', () => {
  const loginPath = join(WORKSPACE_DIR, 'app/(store)/login/page.tsx');
  const registerPath = join(WORKSPACE_DIR, 'app/(store)/register/page.tsx');

  const loginContent = readFileSync(loginPath, 'utf-8');
  const registerContent = readFileSync(registerPath, 'utf-8');

  // Login page fallback support
  assert.match(
    loginContent,
    /searchParams\.get\(['"]redirectTo['"]\)\s*\|\|\s*searchParams\.get\(['"]redirect['"]\)/,
    'Login page must read searchParams.get("redirectTo") || searchParams.get("redirect")'
  );

  // Register page fallback support
  assert.match(
    registerContent,
    /searchParams\.get\(['"]redirectTo['"]\)\s*\|\|\s*searchParams\.get\(['"]redirect['"]\)/,
    'Register page must read searchParams.get("redirectTo") || searchParams.get("redirect")'
  );
});

test('Safe Redirect Validation: getSafeRedirectUrl preserves safe product paths and blocks open redirects', () => {
  // Safe product paths
  assert.equal(
    getSafeRedirectUrl('/products/test-anklet-phase-6c'),
    '/products/test-anklet-phase-6c'
  );
  assert.equal(
    getSafeRedirectUrl('/products/royal-solitaire-diamond-ring?variant=gold'),
    '/products/royal-solitaire-diamond-ring?variant=gold'
  );
  assert.equal(getSafeRedirectUrl('/checkout'), '/checkout');
  assert.equal(getSafeRedirectUrl('/shop'), '/shop');

  // Open redirect attempts (protocol-relative, backslash, external domains)
  assert.equal(getSafeRedirectUrl('//evil.com/phishing', '/account'), '/account');
  assert.equal(getSafeRedirectUrl('/\\evil.com', '/account'), '/account');
  assert.equal(getSafeRedirectUrl('https://evil.com', '/account'), '/account');
  assert.equal(getSafeRedirectUrl('javascript:alert(1)', '/account'), '/account');

  // Header injection attempts
  assert.equal(getSafeRedirectUrl('/products\r\nSet-Cookie:bad=1', '/account'), '/account');
  assert.equal(getSafeRedirectUrl('/products\nLocation:evil.com', '/account'), '/account');
  assert.equal(getSafeRedirectUrl('/products\t/test', '/account'), '/account');

  // Empty or invalid inputs
  assert.equal(getSafeRedirectUrl('', '/account'), '/account');
  assert.equal(getSafeRedirectUrl(null, '/account'), '/account');
  assert.equal(getSafeRedirectUrl(undefined, '/account'), '/account');
});

// =============================================================================
// 2. AUDIT-005: DARK THEME CONSISTENCY
// =============================================================================

test('Dark Theme: RootLayout enforces class="dark" and dark color-scheme on <html>', () => {
  const layoutPath = join(WORKSPACE_DIR, 'app/layout.tsx');
  const content = readFileSync(layoutPath, 'utf-8');

  // Must declare className="dark" on <html>
  assert.match(
    content,
    /<html\s+[^>]*className=["'][^"']*dark[^"']*["']/,
    'RootLayout must declare class="dark" on <html>'
  );

  // Must set colorScheme: 'dark'
  assert.match(
    content,
    /colorScheme:\s*['"]dark['"]/,
    'RootLayout must set colorScheme: "dark" style'
  );
});

test('Dark Theme: tailwind.config.ts configures darkMode: "class"', () => {
  const tailwindPath = join(WORKSPACE_DIR, 'tailwind.config.ts');
  const content = readFileSync(tailwindPath, 'utf-8');

  assert.match(
    content,
    /darkMode:\s*['"]class['"]/,
    'tailwind.config.ts must set darkMode: "class"'
  );
});

test('Dark Theme: globals.css sets luxury dark background and foreground by default', () => {
  const cssPath = join(WORKSPACE_DIR, 'app/globals.css');
  const content = readFileSync(cssPath, 'utf-8');

  // :root must define #0A0A0A background
  assert.match(
    content,
    /--background:\s*#0A0A0A/,
    'globals.css :root must default to #0A0A0A background'
  );

  // :root must define #EDEDED foreground
  assert.match(
    content,
    /--foreground:\s*#EDEDED/,
    'globals.css :root must default to #EDEDED foreground'
  );
});

// =============================================================================
// 3. AUDIT-007: MOBILE HEADER POLISH
// =============================================================================

test('Header Polish: header.tsx uses standard h-5 w-5 sizing and eliminates stray class tokens', () => {
  const headerPath = join(WORKSPACE_DIR, 'components/store/header.tsx');
  const content = readFileSync(headerPath, 'utf-8');

  // Must NOT contain invalid h-4.5 or w-4.5
  assert.doesNotMatch(
    content,
    /h-4\.5|w-4\.5/,
    'header.tsx must not use non-existent h-4.5 or w-4.5 Tailwind classes'
  );

  // Must NOT contain stray '0' class in bag badge
  assert.doesNotMatch(
    content,
    /absolute\s+0\s+top-/,
    'header.tsx badge container must not have stray "0" class token'
  );

  // Must use standard h-5 w-5 for header utility icons
  assert.match(
    content,
    /<Heart\s+className=["']h-5\s+w-5["']\s*\/>/,
    'Heart icon must use h-5 w-5'
  );
  assert.match(
    content,
    /<User\s+className=["']h-5\s+w-5["']\s*\/>/,
    'User icon must use h-5 w-5'
  );
  assert.match(
    content,
    /<ShoppingBag\s+className=["']h-5\s+w-5["']\s*\/>/,
    'ShoppingBag icon must use h-5 w-5'
  );
});

// =============================================================================
// 4. SAVED-ADDRESS AUTHENTICATION SERVICE FAILURE HANDLING
// =============================================================================

test('Saved-Address Auth Error Handling: distinguishes auth service failure from genuine guests', () => {
  const actionsPath = join(WORKSPACE_DIR, 'lib/addresses/actions.ts');
  const content = readFileSync(actionsPath, 'utf-8');

  // Catch block on getCurrentUser must return customer-safe error, not silent guest state
  assert.match(
    content,
    /error:\s*['"]Authentication service is temporarily unavailable\.['"]/,
    'getCheckoutSavedAddressesAction must return explicit error on auth service failure'
  );

  // Genuine guest (!user) returns without error
  assert.match(
    content,
    /if\s*\(!user\)\s*\{\s*return\s*\{\s*isAuthenticated:\s*false,\s*addresses:\s*\[\]\s*\};\s*\}/,
    'Genuine unauthenticated guest must return clean unauthenticated state with zero errors'
  );
});

test('Checkout Page: renders fallback notice when address load error occurs without addresses', () => {
  const checkoutPath = join(WORKSPACE_DIR, 'app/(store)/checkout/page.tsx');
  const content = readFileSync(checkoutPath, 'utf-8');

  // Must display fallback notice when addressLoadError is present and savedAddresses is empty
  assert.match(
    content,
    /addressLoadError\s*&&\s*savedAddresses\.length\s*===\s*0/,
    'Checkout page must display fallback notice when address loading or auth service failed'
  );

  // Must record load error in unauthenticated branch if present
  assert.match(
    content,
    /if\s*\(res\.error\)\s*\{\s*setAddressLoadError\(res\.error\);\s*\}/,
    'Checkout page must record res.error when unauthenticated response contains an error'
  );
});
