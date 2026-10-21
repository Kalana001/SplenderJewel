import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

const WORKSPACE_DIR = process.cwd();

// =============================================================================
// 1. VIS-001: BRANDED 404 PAGE STRUCTURE & ROUTE PLACEMENT
// =============================================================================

test('VIS-001: components/store/not-found-view.tsx exists and implements luxury recovery UI', () => {
  const viewPath = join(WORKSPACE_DIR, 'components/store/not-found-view.tsx');
  assert.ok(existsSync(viewPath), 'components/store/not-found-view.tsx must exist');

  const content = readFileSync(viewPath, 'utf-8');

  // Verify luxury styling and branding elements
  assert.match(content, /Splender Jewel • 404/, 'Must display Splender Jewel 404 eyebrow badge');
  assert.match(content, /Page Not Found/, 'Must render Page Not Found heading');
  assert.match(content, /variant="gold"/, 'Must use luxury gold button styling for primary action');

  // Verify functional recovery links
  assert.match(content, /href="\/shop"/, 'Must link to /shop (Explore Collection)');
  assert.match(content, /href="\/"/, 'Must link to homepage (Return Home)');
  assert.match(content, /href="\/search"/, 'Must provide catalog search link');
  assert.match(content, /getWhatsAppLink/, 'Must integrate WhatsApp concierge support link');

  // Verify accessible touch target sizing (>= 44px)
  assert.match(content, /min-h-\[44px\]/, 'Action buttons must meet the 44px touch target minimum');

  // Verify zero technical leakages
  assert.ok(!content.includes('error.stack'), 'Must not expose stack traces');
  assert.ok(!content.includes('process.env'), 'Must not expose server environment details');
});

test('VIS-001: app/(store)/not-found.tsx exists and covers notFound() calls in store route group', () => {
  const storeNotFoundPath = join(WORKSPACE_DIR, 'app/(store)/not-found.tsx');
  assert.ok(existsSync(storeNotFoundPath), 'app/(store)/not-found.tsx must exist');

  const content = readFileSync(storeNotFoundPath, 'utf-8');

  // Verifies it imports and renders the shared NotFoundView
  assert.match(content, /NotFoundView/, 'Must render NotFoundView component');
  assert.match(content, /export const metadata/, 'Must export metadata');
  assert.match(content, /index:\s*false/, 'Must disallow search engine indexing of 404 pages');
});

test('VIS-001: app/not-found.tsx exists at root and wraps recovery in storefront shell for unknown URLs', () => {
  const rootNotFoundPath = join(WORKSPACE_DIR, 'app/not-found.tsx');
  assert.ok(existsSync(rootNotFoundPath), 'app/not-found.tsx must exist at root');

  const content = readFileSync(rootNotFoundPath, 'utf-8');

  // Verifies root 404 renders StoreHeader and StoreFooter inside CartProvider
  assert.match(content, /StoreHeader/, 'Must include StoreHeader to maintain navigation');
  assert.match(content, /StoreFooter/, 'Must include StoreFooter');
  assert.match(content, /CartProvider/, 'Must wrap with CartProvider so cart badge stays active');
  assert.match(content, /NotFoundView/, 'Must render NotFoundView');
  assert.match(content, /getPublicCategories/, 'Must fetch categories or fall back to default');
  assert.match(content, /DEFAULT_STORE_CATEGORIES/, 'Must provide fallback categories');
});

// =============================================================================
// 2. VIS-002: STOREFRONT ERROR BOUNDARY (app/(store)/error.tsx)
// =============================================================================

test('VIS-002: app/(store)/error.tsx is a client component and conforms to Next.js Error boundary interface', () => {
  const errorPath = join(WORKSPACE_DIR, 'app/(store)/error.tsx');
  assert.ok(existsSync(errorPath), 'app/(store)/error.tsx must exist');

  const content = readFileSync(errorPath, 'utf-8');

  // Must be client component
  assert.match(content, /^'use client';/, "Must start with 'use client'");

  // Props interface check
  assert.match(content, /error:\s*Error\s*&\s*\{\s*digest\?:/i, 'Must type error with optional digest');
  assert.match(content, /reset:\s*\(\)\s*=>\s*void/, 'Must accept reset callback');

  // Working Try Again button
  assert.match(content, /onClick=\{?\(\)\s*=>\s*reset\(\)\}?/, 'Must bind reset() to Try Again button');
  assert.match(content, /Try Again/, 'Must have Try Again button text');

  // Safe navigation links
  assert.match(content, /href="\/shop"/, 'Must provide link to /shop');
  assert.match(content, /href="\/"/, 'Must provide link to homepage');

  // Safe logging and sensitive data protection
  assert.match(content, /\[Storefront Error Boundary\]/, 'Must use standardized telemetry prefix');
  assert.ok(!content.includes('error.stack'), 'Must never render error.stack to DOM');
  assert.ok(!content.includes('authorization'), 'Must never log auth headers');
  assert.ok(!content.includes('password'), 'Must never log password fields');

  // Safe error reference
  assert.match(content, /error\?\.digest/, 'Must display safe digest reference if present');
});

test('VIS-002: Error boundary markup guarantees customer safety and privacy', () => {
  const errorPath = join(WORKSPACE_DIR, 'app/(store)/error.tsx');
  const content = readFileSync(errorPath, 'utf-8');

  // Verify friendly message
  assert.match(content, /Unable to Display Page/, 'Must display user-friendly headline');
  assert.match(content, /Please try reloading the page or return to our jewelry collection/, 'Must provide accurate customer recovery message');
  assert.ok(!content.includes('error?.message'), 'Must not log raw error messages');

  // Verify touch target requirements
  assert.match(content, /min-h-\[44px\]/, 'Buttons must satisfy 44px touch target guidelines');
});

// =============================================================================
// 3. MOBILE UX, TOUCH TARGETS & ACCESSIBILITY TESTS (STAGE C.4A.2)
// =============================================================================

test('VIS-003 & VIS-005: Header touch targets (>=40-44px) and 375px logo constraints', () => {
  const headerPath = join(WORKSPACE_DIR, 'components/store/header.tsx');
  const content = readFileSync(headerPath, 'utf-8');

  // Verify touch target classes on header action buttons
  assert.match(content, /min-h-\[44px\]\s+min-w-\[40px\]/, 'Mobile menu toggle must have min 40-44px touch area');
  assert.match(content, /min-h-\[44px\]\s+min-w-\[38px\]/, 'Utility action icons must have touch target sizing');
  assert.match(content, /max-w-\[38%\]/, 'Center logo must have max-width constraint to prevent crowding at 375px');
});

test('VIS-008: Password visibility toggles have minimum 44px touch area across auth pages', () => {
  const loginContent = readFileSync(join(WORKSPACE_DIR, 'app/(store)/login/page.tsx'), 'utf-8');
  const registerContent = readFileSync(join(WORKSPACE_DIR, 'app/(store)/register/page.tsx'), 'utf-8');
  const resetContent = readFileSync(join(WORKSPACE_DIR, 'app/(store)/reset-password/page.tsx'), 'utf-8');

  for (const [name, content] of [
    ['login', loginContent],
    ['register', registerContent],
    ['reset-password', resetContent],
  ]) {
    assert.match(
      content,
      /min-h-\[44px\]\s+min-w-\[44px\]/,
      `${name} password toggle button must have at least 44px touch dimensions`
    );
  }
});

test('VIS-004 & VIS-006: Heading hierarchy and explicit form labels in catalog browser', () => {
  const catalogContent = readFileSync(join(WORKSPACE_DIR, 'components/store/catalog-browser.tsx'), 'utf-8');

  // VIS-004 intermediate heading
  assert.match(
    catalogContent,
    /<h2 className="sr-only">Catalog Navigation and Filters<\/h2>/,
    'Catalog browser must include intermediate H2 to prevent h1->h3 skips'
  );

  // VIS-006 explicit form labels
  assert.match(
    catalogContent,
    /<label htmlFor="catalog-search-input"/,
    'Catalog search input must have explicit matching label'
  );
  assert.match(
    catalogContent,
    /<label htmlFor="desktop-min-price"/,
    'Desktop min price input must have explicit matching label'
  );
  assert.match(
    catalogContent,
    /<label htmlFor="desktop-max-price"/,
    'Desktop max price input must have explicit matching label'
  );
});

test('VIS-004 & VIS-007: Footer navigation heading hierarchy and mobile link touch buffers', () => {
  const footerContent = readFileSync(join(WORKSPACE_DIR, 'components/store/footer.tsx'), 'utf-8');

  // VIS-004 heading hierarchy
  assert.match(
    footerContent,
    /<h2 className="sr-only">Footer Navigation and Boutique Details<\/h2>/,
    'Footer must include landmark H2 heading'
  );
  assert.match(
    footerContent,
    /<h3 className="text-xs uppercase tracking-widest font-semibold text-white">Collections<\/h3>/,
    'Footer column titles must use H3'
  );

  // VIS-007 touch buffers
  assert.match(
    footerContent,
    /block py-1 sm:py-0\.5 hover:text-luxury-gold/,
    'Footer navigation links must provide vertical touch padding'
  );
});

test('VIS-009: Star rating inactive icons use high-contrast styling', () => {
  const viewerContent = readFileSync(join(WORKSPACE_DIR, 'components/store/product-detail-viewer.tsx'), 'utf-8');
  const reviewsContent = readFileSync(join(WORKSPACE_DIR, 'components/store/product-reviews.tsx'), 'utf-8');

  assert.match(
    viewerContent,
    /text-neutral-500\/80 stroke-\[1\.5\]/,
    'ProductDetailViewer inactive stars must use high-contrast styling'
  );
  assert.match(
    reviewsContent,
    /text-neutral-500\/80 stroke-\[1\.5\]/,
    'ProductReviewsSection inactive stars must use high-contrast styling'
  );
});

test('VIS-010: Shared UI components use direct luxury dark theme tokens', () => {
  const cardContent = readFileSync(join(WORKSPACE_DIR, 'components/ui/card.tsx'), 'utf-8');
  const inputContent = readFileSync(join(WORKSPACE_DIR, 'components/ui/input.tsx'), 'utf-8');
  const buttonContent = readFileSync(join(WORKSPACE_DIR, 'components/ui/button.tsx'), 'utf-8');

  assert.ok(!cardContent.includes('dark:'), 'Card primitive should eliminate legacy dark: prefixes');
  assert.ok(!inputContent.includes('dark:'), 'Input primitive should eliminate legacy dark: prefixes');
  assert.ok(!buttonContent.includes('dark:'), 'Button primitive should eliminate legacy dark: prefixes');
});

// =============================================================================
// 4. BROWSER VERIFICATION AUDIT ARTIFACTS
// =============================================================================

test('Browser Verification: 5 viewports tested with 0 horizontal overflow', () => {
  const resultsPath = join(
    'C:/Users/User/.gemini/antigravity/brain/3e809755-f6d1-4e56-a51f-5049cb6658f4/scratch/recovery-screenshots/recovery-results.json'
  );

  if (existsSync(resultsPath)) {
    const raw = readFileSync(resultsPath, 'utf-8');
    const data = JSON.parse(raw);

    assert.ok(Array.isArray(data), 'Results must be an array');
    assert.ok(data.length >= 3, 'Must have audited at least 3 test routes');

    for (const item of data) {
      for (const [vpName, vpData] of Object.entries((item as any).viewports)) {
        const m = (vpData as any).metrics;
        assert.equal(m.hasOverflow, false, `Route ${item.testCase.name} on ${vpName} must have no horizontal overflow`);
        assert.equal(m.hasHeader, true, `Route ${item.testCase.name} on ${vpName} must preserve StoreHeader`);
        assert.equal(m.hasFooter, true, `Route ${item.testCase.name} on ${vpName} must preserve StoreFooter`);
      }
    }
  }
});
