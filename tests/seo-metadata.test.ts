import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getCanonicalSiteUrl } from '../lib/auth/redirect.ts';

const ROOT_DIR = process.cwd();

// =============================================================================
// 1. CANONICAL SITE URL RESOLUTION
// =============================================================================

test('Canonical Site URL: resolves canonical production domain safely', () => {
  const originalEnv = { ...process.env };
  try {
    // Development mode fallback
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    (process.env as any).NODE_ENV = 'development';
    assert.strictEqual(getCanonicalSiteUrl(), 'http://localhost:3000');

    // Production mode without env variables falls back to canonical production URL
    (process.env as any).NODE_ENV = 'production';
    assert.strictEqual(getCanonicalSiteUrl(), 'https://splender-jewel.vercel.app');

    // Explicit valid production URL
    process.env.NEXT_PUBLIC_SITE_URL = 'https://splender-jewel.vercel.app';
    assert.strictEqual(getCanonicalSiteUrl(), 'https://splender-jewel.vercel.app');

    // Rejection of localhost in production
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
    assert.strictEqual(getCanonicalSiteUrl(), 'https://splender-jewel.vercel.app');
  } finally {
    process.env = originalEnv;
  }
});

// =============================================================================
// 2. ROBOTS.TS STATIC INTEGRITY & SECURITY
// =============================================================================

test('Robots configuration: app/robots.ts exists and adheres to Next.js App Router metadata API', () => {
  const robotsPath = join(ROOT_DIR, 'app/robots.ts');
  assert.ok(existsSync(robotsPath), 'app/robots.ts must exist');

  const content = readFileSync(robotsPath, 'utf-8');

  // Must export default function robots() returning MetadataRoute.Robots
  assert.match(
    content,
    /export\s+default\s+function\s+robots\s*\(\s*\)\s*:\s*MetadataRoute\.Robots/,
    'app/robots.ts must export default function robots(): MetadataRoute.Robots'
  );

  // Must allow public storefront
  assert.match(content, /allow:\s*['"]\/['"]/, 'robots.ts must allow "/"');

  // Must disallow private, transactional, and administrative paths
  const requiredDisallows = [
    '/admin',
    '/admin/',
    '/account',
    '/account/',
    '/checkout',
    '/checkout/',
    '/cart',
    '/cart/',
    '/order-confirmation',
    '/order-confirmation/',
    '/api/',
    '/auth/',
  ];

  for (const path of requiredDisallows) {
    assert.ok(
      content.includes(`'${path}'`) || content.includes(`"${path}"`),
      `robots.ts must disallow ${path}`
    );
  }

  // Must reference sitemap.xml
  assert.match(content, /sitemap:\s*`\${baseUrl}\/sitemap\.xml`/, 'robots.ts must point to dynamic sitemap.xml');
});

// =============================================================================
// 3. SITEMAP.TS STATIC INTEGRITY & DYNAMIC CATALOG SAFETY
// =============================================================================

test('Sitemap generator: app/sitemap.ts exists and safely handles static & dynamic routes', () => {
  const sitemapPath = join(ROOT_DIR, 'app/sitemap.ts');
  assert.ok(existsSync(sitemapPath), 'app/sitemap.ts must exist');

  const content = readFileSync(sitemapPath, 'utf-8');

  // Must export default async function sitemap() returning Promise<MetadataRoute.Sitemap>
  assert.match(
    content,
    /export\s+default\s+async\s+function\s+sitemap\s*\(\s*\)\s*:\s*Promise<MetadataRoute\.Sitemap>/,
    'app/sitemap.ts must export default async function sitemap()'
  );

  // Must export revalidate interval
  assert.match(
    content,
    /export\s+const\s+revalidate\s*=\s*\d+/,
    'app/sitemap.ts must export revalidate interval'
  );

  // Must include all required static storefront routes
  const requiredStaticPaths = [
    'baseUrl',
    '${baseUrl}/shop',
    '${baseUrl}/about',
    '${baseUrl}/contact',
    '${baseUrl}/faq',
    '${baseUrl}/returns',
    '${baseUrl}/privacy',
    '${baseUrl}/terms',
  ];

  for (const staticPath of requiredStaticPaths) {
    assert.ok(
      content.includes(staticPath),
      `sitemap.ts must include static path ${staticPath}`
    );
  }

  // Must dynamically query categories with is_active = true and range pagination
  assert.match(
    content,
    /from\(['"]categories['"]\)[\s\S]*?\.eq\(['"]is_active['"],\s*true\)[\s\S]*?\.range\(/,
    'sitemap.ts must query active categories with range pagination'
  );

  // Must dynamically query products with is_active = true and range pagination
  assert.match(
    content,
    /from\(['"]products['"]\)[\s\S]*?\.eq\(['"]is_active['"],\s*true\)[\s\S]*?\.range\(/,
    'sitemap.ts must query active products with range pagination'
  );

  // Parity with storefront: Product must have active variants to be accessible
  assert.match(
    content,
    /product_variants\s*\(\s*id,\s*is_active\s*\)/,
    'sitemap.ts must query product_variants to verify accessibility'
  );
  assert.match(
    content,
    /hasActiveVariant/,
    'sitemap.ts must filter out products without active variants'
  );

  // Must deduplicate URLs via Set
  assert.match(
    content,
    /new\s+Set<string>\(\)/,
    'sitemap.ts must deduplicate URLs using a Set'
  );

  // Must handle errors safely without throwing unhandled exceptions or dumping error details
  assert.match(content, /try\s*\{[\s\S]*?\}\s*catch/, 'sitemap.ts must wrap catalog queries in try/catch');
  assert.ok(!content.includes('err.message'), 'sitemap.ts must not dump raw err.message');
  assert.ok(!content.includes('err.stack'), 'sitemap.ts must not dump raw err.stack');

  // Must never expose purchase_cost or admin fields
  assert.ok(!content.includes('purchase_cost'), 'sitemap.ts must never select or expose purchase_cost');
  assert.ok(!content.includes('admin_notes'), 'sitemap.ts must never select or expose admin_notes');
});

test('Sitemap generator: verifies /shipping route existence and exclusion', () => {
  const shippingPagePath = join(ROOT_DIR, 'app/(store)/shipping/page.tsx');
  const hasShippingPage = existsSync(shippingPagePath);

  const sitemapContent = readFileSync(join(ROOT_DIR, 'app/sitemap.ts'), 'utf-8');

  if (!hasShippingPage) {
    // If /shipping page does not exist in app, it must not be in sitemap
    assert.ok(
      !sitemapContent.includes('/shipping'),
      'sitemap.ts must not include /shipping when no corresponding route exists'
    );
  }
});

// =============================================================================
// 4. ROOT METADATA TEMPLATE & DOUBLE-BRANDING PREVENTIONS
// =============================================================================

test('Root layout metadata: configures template and default title cleanly', () => {
  const layoutPath = join(ROOT_DIR, 'app/layout.tsx');
  const content = readFileSync(layoutPath, 'utf-8');

  // Root title template must be %s | Splender Jewel
  assert.match(
    content,
    /template:\s*['"]%s\s*\|\s*Splender Jewel['"]/,
    'Root layout title template must be "%s | Splender Jewel"'
  );

  // Default title must be clean without double-branding
  assert.match(
    content,
    /default:\s*['"]Splender Jewel \| Fashion Jewellery & Accessories — Sri Lanka['"]/,
    'Root default title must match canonical brand title'
  );

  // metadataBase must use getCanonicalSiteUrl()
  assert.match(
    content,
    /metadataBase:\s*new\s+URL\(siteUrl\)/,
    'Root layout metadataBase must be initialized with canonical siteUrl'
  );
});

test('Public storefront pages: titles do not append duplicate brand suffix', () => {
  const publicPages = [
    { file: 'app/(store)/shop/page.tsx', expectedTitle: "'Jewellery Catalog'" },
    { file: 'app/(store)/about/page.tsx', expectedTitle: "'About Us'" },
    { file: 'app/(store)/contact/page.tsx', expectedTitle: "'Contact Us'" },
    { file: 'app/(store)/faq/page.tsx', expectedTitle: "'Frequently Asked Questions'" },
    { file: 'app/(store)/privacy/page.tsx', expectedTitle: "'Privacy Policy'" },
    { file: 'app/(store)/terms/page.tsx', expectedTitle: "'Terms & Conditions'" },
    { file: 'app/(store)/returns/page.tsx', expectedTitle: "'Returns & Exchanges'" },
    { file: 'app/(store)/search/page.tsx', expectedTitle: "'Search Jewelry'" },
  ];

  for (const { file, expectedTitle } of publicPages) {
    const fullPath = join(ROOT_DIR, file);
    assert.ok(existsSync(fullPath), `${file} must exist`);
    const content = readFileSync(fullPath, 'utf-8');
    assert.ok(
      content.includes(`title: ${expectedTitle}`),
      `${file} should have title: ${expectedTitle}`
    );
    const unquoted = expectedTitle.slice(1, -1);
    assert.ok(
      !content.includes(`${unquoted} | Splender Jewel`),
      `${file} must not contain redundant "${unquoted} | Splender Jewel"`
    );
  }
});

test('Dynamic catalog metadata: category and product pages sanitize title branding', () => {
  const categoryPageContent = readFileSync(join(ROOT_DIR, 'app/(store)/category/[slug]/page.tsx'), 'utf-8');
  assert.ok(
    categoryPageContent.includes('title: `${category.name} Collection`'),
    'Category page title must be cleanly templated without duplicate brand'
  );

  const productPageContent = readFileSync(join(ROOT_DIR, 'app/(store)/products/[slug]/page.tsx'), 'utf-8');
  assert.ok(
    productPageContent.includes('title: cleanTitle'),
    'Product page title must use cleanTitle'
  );
  assert.ok(
    productPageContent.includes('cleanTitle = rawTitle.replace'),
    'Product page must strip redundant brand suffixes from rawTitle'
  );
});

// =============================================================================
// 5. TRANSACTIONAL & ACCOUNT PAGES NOINDEX METADATA
// =============================================================================

test('Transactional and private routes: enforce robots noindex and nofollow', () => {
  const privateRoutes = [
    'app/(store)/cart/layout.tsx',
    'app/(store)/checkout/layout.tsx',
    'app/(store)/login/layout.tsx',
    'app/(store)/register/layout.tsx',
    'app/(store)/forgot-password/layout.tsx',
    'app/(store)/reset-password/layout.tsx',
    'app/(store)/account/layout.tsx',
    'app/(store)/account/page.tsx',
    'app/(store)/account/orders/page.tsx',
    'app/(store)/account/orders/[orderId]/page.tsx',
    'app/(store)/account/addresses/page.tsx',
    'app/(store)/account/profile/page.tsx',
    'app/(store)/account/reviews/page.tsx',
    'app/(store)/account/wishlist/page.tsx',
    'app/(store)/order-confirmation/[orderNumber]/page.tsx',
  ];

  for (const routePath of privateRoutes) {
    const fullPath = join(ROOT_DIR, routePath);
    assert.ok(existsSync(fullPath), `${routePath} must exist`);
    const content = readFileSync(fullPath, 'utf-8');

    assert.ok(
      content.includes('index: false'),
      `${routePath} must declare index: false`
    );
    assert.ok(
      content.includes('follow: false'),
      `${routePath} must declare follow: false`
    );
  }
});

test('Order Confirmation metadata: generic title without exposing order number or customer data', () => {
  const pagePath = join(ROOT_DIR, 'app/(store)/order-confirmation/[orderNumber]/page.tsx');
  assert.ok(existsSync(pagePath), 'order-confirmation page must exist');
  const content = readFileSync(pagePath, 'utf-8');

  // Must export metadata with generic title 'Order Confirmation'
  assert.match(
    content,
    /title:\s*['"]Order Confirmation['"]/,
    'Order confirmation page must have generic title "Order Confirmation"'
  );

  // Must NOT expose order number in metadata title or description
  assert.ok(
    !content.includes('title: `Order Confirmation #'),
    'Order confirmation must not expose orderNumber in metadata title'
  );

  // Must enforce noindex, nofollow
  assert.match(content, /index:\s*false/, 'Must declare index: false');
  assert.match(content, /follow:\s*false/, 'Must declare follow: false');
});
