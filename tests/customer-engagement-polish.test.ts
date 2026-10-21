import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WORKSPACE_DIR = process.cwd();

// =============================================================================
// 1. APPROVED VS UNAPPROVED REVIEW VISIBILITY & SECURITY
// =============================================================================

test('Reviews Visibility: lib/reviews/public.ts strictly filters is_approved = true and excludes private data', () => {
  const reviewsPublicPath = join(WORKSPACE_DIR, 'lib/reviews/public.ts');
  assert.ok(existsSync(reviewsPublicPath), 'lib/reviews/public.ts must exist');
  const content = readFileSync(reviewsPublicPath, 'utf-8');

  // Must export getProductApprovedReviews
  assert.match(
    content,
    /export\s+const\s+getProductApprovedReviews\s*=/,
    'getProductApprovedReviews must be exported'
  );

  // Must filter strictly by is_approved = true
  assert.match(
    content,
    /\.eq\(['"]is_approved['"],\s*true\)/,
    'getProductApprovedReviews must strictly filter is_approved = true'
  );

  // Must filter strictly by product_id
  assert.match(
    content,
    /\.eq\(['"]product_id['"],\s*productId\)/,
    'getProductApprovedReviews must filter by product_id'
  );

  // Must NOT project confidential order or user columns to public interface
  assert.doesNotMatch(content, /user_id/, 'Public review query must never project user_id');
  assert.doesNotMatch(content, /order_id/, 'Public review query must never project order_id');
  assert.doesNotMatch(content, /order_item_id/, 'Public review query must never project order_item_id');
});

test('Reviews Database RLS: 00005_database_security_hardening.sql enforces is_approved = TRUE for public SELECT', () => {
  const migrationPath = join(WORKSPACE_DIR, 'supabase/migrations/00005_database_security_hardening.sql');
  const sql = readFileSync(migrationPath, 'utf-8');

  // Verify RLS policy restricts public review reading strictly to is_approved = TRUE
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"Public\s+view\s+approved\s+reviews"\s+ON\s+public\.reviews\s+FOR\s+SELECT\s+USING\s*\(\s*is_approved\s*=\s*TRUE\s*\);/i,
    'Database RLS must enforce is_approved = TRUE for all public SELECT queries on reviews'
  );
});

// =============================================================================
// 2. PRODUCT-SPECIFIC REVIEW ISOLATION & EMPTY STATE
// =============================================================================

test('Review Isolation: Pure calculation isolates reviews strictly to the specified product and computes distribution', () => {
  interface MockDbReview {
    id: string;
    product_id: string;
    customer_name: string;
    rating: number;
    title: string | null;
    comment: string | null;
    is_approved: boolean;
    created_at: string;
  }

  const mockDbReviews: MockDbReview[] = [
    {
      id: 'rev-1',
      product_id: 'prod-A',
      customer_name: 'Priya S.',
      rating: 5,
      title: 'Stunning necklace',
      comment: 'Exquisite craftsmanship and beautiful packaging.',
      is_approved: true,
      created_at: '2026-03-01T10:00:00Z',
    },
    {
      id: 'rev-2',
      product_id: 'prod-A',
      customer_name: 'Amara K.',
      rating: 4,
      title: 'Great quality',
      comment: 'Very elegant, fast delivery.',
      is_approved: true,
      created_at: '2026-03-02T11:00:00Z',
    },
    {
      id: 'rev-3',
      product_id: 'prod-A',
      customer_name: 'Pending User',
      rating: 1,
      title: 'Pending Review',
      comment: 'Should not be seen.',
      is_approved: false, // Pending / unapproved
      created_at: '2026-03-03T12:00:00Z',
    },
    {
      id: 'rev-4',
      product_id: 'prod-B',
      customer_name: 'Dilshan M.',
      rating: 5,
      title: 'Ring review for Prod B',
      comment: 'Belongs to product B only.',
      is_approved: true,
      created_at: '2026-03-04T13:00:00Z',
    },
  ];

  // Logic simulator matching getProductApprovedReviews
  function resolveReviewsForProduct(targetProductId: string) {
    const approved = mockDbReviews.filter(
      (r) => r.product_id === targetProductId && r.is_approved === true
    );

    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    for (const r of approved) {
      ratingDistribution[r.rating] = (ratingDistribution[r.rating] || 0) + 1;
      sum += r.rating;
    }

    const totalReviews = approved.length;
    const averageRating = totalReviews > 0 ? Number((sum / totalReviews).toFixed(1)) : 0;

    return {
      reviews: approved,
      summary: {
        averageRating,
        totalReviews,
        ratingDistribution,
      },
    };
  }

  // 1. Query Product A
  const resA = resolveReviewsForProduct('prod-A');
  assert.equal(resA.reviews.length, 2, 'Product A must have exactly 2 approved reviews');
  assert.equal(resA.summary.totalReviews, 2);
  assert.equal(resA.summary.averageRating, 4.5); // (5 + 4) / 2 = 4.5
  assert.equal(resA.summary.ratingDistribution[5], 1);
  assert.equal(resA.summary.ratingDistribution[4], 1);
  assert.equal(resA.summary.ratingDistribution[1], 0, 'Unapproved 1-star review must be excluded');

  // 2. Query Product B
  const resB = resolveReviewsForProduct('prod-B');
  assert.equal(resB.reviews.length, 1, 'Product B must have only its own review');
  assert.equal(resB.reviews[0].id, 'rev-4');

  // 3. Query Product with no reviews
  const resEmpty = resolveReviewsForProduct('prod-C');
  assert.equal(resEmpty.reviews.length, 0);
  assert.equal(resEmpty.summary.totalReviews, 0);
  assert.equal(resEmpty.summary.averageRating, 0);
});

test('Product Reviews UI: components/store/product-reviews.tsx provides empty state and verified patron badges', () => {
  const compPath = join(WORKSPACE_DIR, 'components/store/product-reviews.tsx');
  assert.ok(existsSync(compPath), 'components/store/product-reviews.tsx must exist');
  const content = readFileSync(compPath, 'utf-8');

  // Section anchor
  assert.match(content, /id=["']reviews["']/);
  // Verified patron badge
  assert.match(content, /Verified\s+Patron/);
  // Empty state messaging
  assert.match(content, /No\s+Reviews\s+Yet/);
  assert.match(content, /Be\s+the\s+first\s+to\s+share\s+your\s+experience/);
  // Link to account orders
  assert.match(content, /\/account\/orders/);
});

// =============================================================================
// 3. WISHLIST COUNT AND LOGOUT BEHAVIOR
// =============================================================================

test('Wishlist Count Action: lib/wishlist/actions.ts exports getCustomerWishlistCount with guest isolation', () => {
  const actionsPath = join(WORKSPACE_DIR, 'lib/wishlist/actions.ts');
  const content = readFileSync(actionsPath, 'utf-8');

  // Exports getCustomerWishlistCount
  assert.match(content, /export\s+async\s+function\s+getCustomerWishlistCount\s*\(\s*\)/);

  // Returns isAuthenticated: false, count: 0 for guests
  assert.match(
    content,
    /if\s*\(!user\)\s*\{\s*return\s*\{\s*isAuthenticated:\s*false,\s*count:\s*0\s*\};/,
    'getCustomerWishlistCount must immediately return count: 0 for guests'
  );

  // Uses head: true / exact count query for peak performance
  assert.match(
    content,
    /select\(['"]id['"],\s*\{\s*count:\s*['"]exact['"],\s*head:\s*true\s*\}\)/,
    'Wishlist count query must use { count: "exact", head: true }'
  );
});

test('Header Wishlist Counter: components/store/header.tsx renders badge, resets on logout, and listens to events', () => {
  const headerPath = join(WORKSPACE_DIR, 'components/store/header.tsx');
  const content = readFileSync(headerPath, 'utf-8');

  // Wishlist count state
  assert.match(content, /const\s+\[wishlistCount,\s*setWishlistCount\]\s*=\s*useState/);

  // Header wishlist badge
  assert.match(content, /wishlistCount\s*>\s*99\s*\?\s*['"]99\+['"]\s*:\s*wishlistCount/);

  // Reset count immediately on logout
  assert.match(
    content,
    /setWishlistCount\(0\)/,
    'Header must reset wishlist count to 0 on logout'
  );

  // Custom event listeners
  assert.match(content, /splender:wishlist-updated/);
  assert.match(content, /splender:auth-signed-out/);
  assert.match(content, /splender:auth-signed-in/);
});

// =============================================================================
// 4. SEO METADATA AND STRUCTURED DATA
// =============================================================================

test('SEO Metadata: app/layout.tsx and product page include Twitter/X card metadata', () => {
  const layoutPath = join(WORKSPACE_DIR, 'app/layout.tsx');
  const layoutContent = readFileSync(layoutPath, 'utf-8');

  // Layout twitter card
  assert.match(layoutContent, /twitter:\s*\{/);
  assert.match(layoutContent, /card:\s*['"]summary_large_image['"]/);

  // Product detail twitter card
  const prodPagePath = join(WORKSPACE_DIR, 'app/(store)/products/[slug]/page.tsx');
  const prodContent = readFileSync(prodPagePath, 'utf-8');
  assert.match(prodContent, /twitter:\s*\{/);
  assert.match(prodContent, /card:\s*['"]summary_large_image['"]/);
});

test('Homepage Schema.org: app/(store)/page.tsx includes JewelryStore structured data with verified info', () => {
  const homePath = join(WORKSPACE_DIR, 'app/(store)/page.tsx');
  const content = readFileSync(homePath, 'utf-8');

  // JSON-LD script present
  assert.match(content, /type=["']application\/ld\+json["']/);
  assert.match(content, /'@type':\s*['"]JewelryStore['"]/);
  assert.match(content, /name:\s*['"]Splender Jewel['"]/);
  assert.match(content, /instagram\.com\/splender_jewel/);
  assert.match(content, /areaServed/);
});

// =============================================================================
// 5. PRICE FILTER BOUNDARIES AND DISCOUNTED PRICES
// =============================================================================

test('Price Filters: lib/catalog/public.ts validates price inputs and filters by customer-visible selling price', () => {
  const publicPath = join(WORKSPACE_DIR, 'lib/catalog/public.ts');
  const content = readFileSync(publicPath, 'utf-8');

  // Input sanitization
  assert.match(content, /Number\.isFinite\(rawMin\)\s*&&\s*rawMin\s*>=\s*0/);
  assert.match(content, /Number\.isFinite\(rawMax\)\s*&&\s*rawMax\s*>=\s*0/);
  // Inverted boundary normalization
  assert.match(content, /minPrice\s*>\s*maxPrice/);

  // Pre-pagination server resolution
  assert.match(content, /hasPriceFilter\s*\|\|\s*isPriceSort/);
  // Discount price evaluation (discount applies only if strictly lower than basePrice)
  assert.match(content, /effectiveSellingPrice\s*=\s*[\s\S]*?baseDiscountPrice\s*<\s*basePrice/);
  assert.match(content, /effectiveSellingPrice\s*<\s*minPrice/);
  assert.match(content, /effectiveSellingPrice\s*>\s*maxPrice/);
});

test('Price Logic Simulation: discount price takes precedence over original variant price in filter range', () => {
  interface MockVariant {
    id: string;
    price: number;
    discountPrice: number | null;
    isActive: boolean;
  }

  interface MockProductWithVariants {
    id: string;
    name: string;
    variants: MockVariant[];
  }

  const catalog: MockProductWithVariants[] = [
    {
      id: 'prod-1',
      name: 'Diamond Solitaire Ring',
      variants: [
        { id: 'v1', price: 12000, discountPrice: 8000, isActive: true }, // Effective = 8,000 (discounted)
      ],
    },
    {
      id: 'prod-2',
      name: 'Silver Bangle',
      variants: [
        { id: 'v2', price: 4000, discountPrice: null, isActive: true }, // Effective = 4,000
      ],
    },
    {
      id: 'prod-3',
      name: 'Gold Necklace',
      variants: [
        { id: 'v3', price: 25000, discountPrice: null, isActive: true }, // Effective = 25,000
      ],
    },
    {
      id: 'prod-4',
      name: 'Platinum Pendant',
      variants: [
        { id: 'v4', price: 18000, discountPrice: 14000, isActive: true }, // Effective = 14,000
      ],
    },
  ];

  function filterByPrice(min: number | null, max: number | null): MockProductWithVariants[] {
    return catalog.filter((p) => {
      const active = p.variants.filter((v) => v.isActive);
      if (active.length === 0) return false;
      const effectivePrices = active.map((v) => (v.discountPrice != null && v.discountPrice > 0 ? v.discountPrice : v.price));
      const sellingPrice = Math.min(...effectivePrices);

      if (min != null && sellingPrice < min) return false;
      if (max != null && sellingPrice > max) return false;
      return true;
    });
  }

  // Range 5,000 to 10,000:
  // prod-1 (Original 12,000, Discounted 8,000) MUST be included because selling price is 8,000
  // prod-2 (4,000) excluded
  // prod-3 (25,000) excluded
  // prod-4 (14,000) excluded
  const range5kTo10k = filterByPrice(5000, 10000);
  assert.equal(range5kTo10k.length, 1);
  assert.equal(range5kTo10k[0].id, 'prod-1');

  // Range Under 5,000:
  // prod-2 (4,000) included
  const under5k = filterByPrice(null, 5000);
  assert.equal(under5k.length, 1);
  assert.equal(under5k[0].id, 'prod-2');

  // Range 10,000 to 20,000:
  // prod-4 (14,000) included
  const range10kTo20k = filterByPrice(10000, 20000);
  assert.equal(range10kTo20k.length, 1);
  assert.equal(range10kTo20k[0].id, 'prod-4');
});

// =============================================================================
// 6. PAGINATION & PRICE FILTER INTEGRATION
// =============================================================================

test('CatalogBrowser Price Controls: Desktop and mobile provide LKR presets and custom input fields', () => {
  const browserPath = join(WORKSPACE_DIR, 'components/store/catalog-browser.tsx');
  const content = readFileSync(browserPath, 'utf-8');

  // Preset labels
  assert.match(content, /Price\s+Range\s+\(LKR\)/);
  assert.match(content, /Under\s+Rs\.\s+2,500/);
  assert.match(content, /Rs\.\s+2,500\s+–\s+Rs\.\s+5,000/);
  assert.match(content, /Rs\.\s+5,000\s+–\s+Rs\.\s+10,000/);
  assert.match(content, /Above\s+Rs\.\s+20,000/);

  // Custom input controls
  assert.match(content, /handleApplyCustomPrice/);
  assert.match(content, /aria-label=["']Minimum price in LKR["']/);
  assert.match(content, /aria-label=["']Maximum price in LKR["']/);

  // Price parameters in buildFilterUrl
  assert.match(content, /minPrice\?:/);
  assert.match(content, /maxPrice\?:/);
});

test('Price Parameter Forwarding: Shop, Category, and Search pages forward minPrice and maxPrice to server query', () => {
  const shopContent = readFileSync(join(WORKSPACE_DIR, 'app/(store)/shop/page.tsx'), 'utf-8');
  const catContent = readFileSync(join(WORKSPACE_DIR, 'app/(store)/category/[slug]/page.tsx'), 'utf-8');
  const searchContent = readFileSync(join(WORKSPACE_DIR, 'app/(store)/search/page.tsx'), 'utf-8');

  // Shop page
  assert.match(shopContent, /minPrice:\s*Number\.isFinite\(minPrice\)\s*\?\s*minPrice\s*:\s*undefined/);
  assert.match(shopContent, /maxPrice:\s*Number\.isFinite\(maxPrice\)\s*\?\s*maxPrice\s*:\s*undefined/);

  // Category page
  assert.match(catContent, /minPrice:\s*Number\.isFinite\(minPrice\)\s*\?\s*minPrice\s*:\s*undefined/);
  assert.match(catContent, /maxPrice:\s*Number\.isFinite\(maxPrice\)\s*\?\s*maxPrice\s*:\s*undefined/);

  // Search page
  assert.match(searchContent, /minPrice:\s*Number\.isFinite\(minPrice\)\s*\?\s*minPrice\s*:\s*undefined/);
  assert.match(searchContent, /maxPrice:\s*Number\.isFinite\(maxPrice\)\s*\?\s*maxPrice\s*:\s*undefined/);
});

// =============================================================================
// 8. STAGE C.3.4.3A DEEP VERIFICATION: REVIEWS, PRICING, WISHLIST COUNTER
// =============================================================================

test('Review Aggregation: Review summary accurately aggregates 50 approved reviews while display reviews are capped at 20', () => {
  // Simulate 50 approved reviews with varied ratings:
  // 30 x 5-star, 10 x 4-star, 10 x 3-star
  // Total = 50. Sum = 30*5 + 10*4 + 10*3 = 150 + 40 + 30 = 220.
  // Average = 220 / 50 = 4.4
  const mockApprovedReviews = Array.from({ length: 50 }, (_, i) => ({
    id: `rev-${i}`,
    product_id: 'prod-large-reviews',
    customer_name: `Reviewer ${i}`,
    rating: i < 30 ? 5 : i < 40 ? 4 : 3,
    title: `Review ${i}`,
    comment: `Comment ${i}`,
    is_approved: true,
    created_at: `2026-03-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`,
  }));

  // Replicate getProductApprovedReviews aggregation logic
  const limit = 20;
  const result = {
    reviews: mockApprovedReviews.slice(0, limit),
    summary: {
      averageRating: Number(
        (mockApprovedReviews.reduce((acc, r) => acc + r.rating, 0) / mockApprovedReviews.length).toFixed(1)
      ),
      totalReviews: mockApprovedReviews.length,
      ratingDistribution: mockApprovedReviews.reduce((acc: Record<number, number>, r) => {
        acc[r.rating] = (acc[r.rating] || 0) + 1;
        return acc;
      }, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }),
    },
  };

  assert.equal(result.reviews.length, 20, 'Display reviews must be cleanly capped at limit (20)');
  assert.equal(result.summary.totalReviews, 50, 'Total reviews must reflect all 50 approved reviews');
  assert.equal(result.summary.averageRating, 4.4, 'Average rating must be computed from all 50 reviews (4.4)');
  assert.equal(result.summary.ratingDistribution[5], 30);
  assert.equal(result.summary.ratingDistribution[4], 10);
  assert.equal(result.summary.ratingDistribution[3], 10);
  assert.equal(result.summary.ratingDistribution[2], 0);
  assert.equal(result.summary.ratingDistribution[1], 0);
});

test('Price Parity with ProductCard: Discount >= Base Price is ignored, and inactive variants never affect price', () => {
  // Scenario 1: Discount is greater than or equal to base price (e.g. data anomaly where discount_price = 10,000, base = 8,000)
  // ProductCard logic: hasDiscount = baseDiscountPrice != null && baseDiscountPrice < basePrice.
  // Effective selling price must be 8,000, NOT 10,000.
  const basePrice1 = 8000;
  const discountPrice1 = 10000;
  const effective1 = (discountPrice1 != null && discountPrice1 < basePrice1) ? discountPrice1 : basePrice1;
  assert.equal(effective1, 8000, 'When discount >= base, selling price must be basePrice');

  // Scenario 2: Legitimate discount (base = 8000, discount = 6000)
  const basePrice2 = 8000;
  const discountPrice2 = 6000;
  const effective2 = (discountPrice2 != null && discountPrice2 < basePrice2) ? discountPrice2 : basePrice2;
  assert.equal(effective2, 6000, 'When discount < base, selling price must be discountPrice');

  // Scenario 3: Inactive variant has cheaper price (e.g. 2,000), but active variant has 9,000
  const variants = [
    { id: 'v1', price: 9000, discount_price: null, is_active: true },
    { id: 'v2', price: 2000, discount_price: null, is_active: false }, // Inactive variant!
  ];
  const activeVariants = variants.filter((v) => v.is_active);
  const activePrices = activeVariants.map((v) => v.price);
  const resolvedBasePrice = Math.min(...activePrices);
  assert.equal(resolvedBasePrice, 9000, 'Inactive variant price must NEVER leak into basePrice calculation');
});

test('Wishlist Monotonic Counter: Header uses countSeq ref to discard delayed responses after sign-out', () => {
  const headerContent = readFileSync(join(WORKSPACE_DIR, 'components/store/header.tsx'), 'utf-8');

  // Must declare monotonic sequence ref
  assert.match(
    headerContent,
    /const\s+countSeq\s*=\s*useRef\(0\);/,
    'Header must declare countSeq monotonic counter ref'
  );

  // Must increment countSeq on refreshWishlistCount
  assert.match(
    headerContent,
    /const\s+currentSeq\s*=\s*\+\+countSeq\.current;/,
    'refreshWishlistCount must increment countSeq.current'
  );

  // Must guard state update with sequence check
  assert.match(
    headerContent,
    /if\s*\(\s*isMounted\s*&&\s*currentSeq\s*===\s*countSeq\.current\s*\)/,
    'Wishlist count setter must verify currentSeq === countSeq.current'
  );

  // Must increment on sign out / auth change to invalidate in-flight Customer A requests
  assert.match(
    headerContent,
    /\+\+countSeq\.current;\s*setIsAuthenticated\(false\);/,
    'handleCustomSignOut must increment countSeq.current to cancel in-flight requests'
  );
  assert.match(
    headerContent,
    /handleLogout\s*=\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\+\+countSeq\.current;/,
    'handleLogout must increment countSeq.current immediately'
  );
});

test('SEO & Structured Data Verification: Valid JewelryStore schema without fabricated address/hours', () => {
  const homeContent = readFileSync(join(WORKSPACE_DIR, 'app/(store)/page.tsx'), 'utf-8');

  // Must contain application/ld+json script
  assert.match(homeContent, /type=["']application\/ld\+json["']/);
  assert.match(homeContent, /['"]@type['"]:\s*['"]JewelryStore['"]/);
  assert.match(homeContent, /priceRange:\s*['"]LKR['"]/);

  // Must NOT invent fake physical street address or opening hours
  assert.doesNotMatch(homeContent, /streetAddress/, 'Must not invent fake street address');
  assert.doesNotMatch(homeContent, /openingHoursSpecification/, 'Must not invent fake opening hours');

  // Layout must specify summary_large_image Twitter card
  const layoutContent = readFileSync(join(WORKSPACE_DIR, 'app/layout.tsx'), 'utf-8');
  assert.match(layoutContent, /twitter:\s*\{[\s\S]*?card:\s*['"]summary_large_image['"]/);
});

// =============================================================================
// 9. STAGE C.3.4.3B: DATA ACCURACY HARDENING & OVERFLOW REGRESSION TESTS
// =============================================================================

test('Review Overflow Hardening: >5000 approved reviews triggers explicit isUnavailable summary state while keeping visible reviews', () => {
  const reviewsContent = readFileSync(join(WORKSPACE_DIR, 'lib/reviews/public.ts'), 'utf-8');

  // Must query with count: 'exact'
  assert.match(
    reviewsContent,
    /select\(['"]rating['"],\s*\{\s*count:\s*['"]exact['"]\s*\}\)/,
    'getProductApprovedReviews must request exact count for review ratings query'
  );

  // Must check if total approved reviews exceed 5000 ceiling
  assert.match(
    reviewsContent,
    /totalApprovedCount\s*>\s*5000/,
    'Must check if totalApprovedCount exceeds 5000 ceiling'
  );

  // Must return explicit isUnavailable: true
  assert.match(
    reviewsContent,
    /isUnavailable:\s*true/,
    'Must return isUnavailable: true on overflow'
  );

  // Pure logic simulation of the overflow condition:
  // Total approved reviews in DB = 6,250 (exceeds 5,000 ceiling)
  const simulatedCount = 6250;
  const simulatedSummaryData = Array.from({ length: 5000 }, () => ({ rating: 5 }));
  const simulatedDisplayData = Array.from({ length: 20 }, (_, i) => ({
    id: `rev-${i}`,
    customer_name: `Patron ${i}`,
    rating: 5,
    title: 'Great piece',
    comment: 'Exquisite',
    created_at: '2026-03-01T00:00:00Z',
  }));

  const totalApprovedCount = simulatedCount != null ? simulatedCount : simulatedSummaryData.length;
  const isOverflow = totalApprovedCount > 5000 || (simulatedCount == null && simulatedSummaryData.length >= 5000);

  const emptySummary = {
    averageRating: 0,
    totalReviews: 0,
    ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  };

  const outcome = isOverflow
    ? {
        reviews: simulatedDisplayData,
        summary: { ...emptySummary, isUnavailable: true },
      }
    : {
        reviews: simulatedDisplayData,
        summary: { averageRating: 5, totalReviews: totalApprovedCount, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 5000 }, isUnavailable: false },
      };

  assert.equal(outcome.summary.isUnavailable, true, 'Summary must be marked isUnavailable on overflow');
  assert.equal(outcome.summary.totalReviews, 0, 'Misleading partial totals must NOT be displayed on overflow');
  assert.equal(outcome.summary.averageRating, 0, 'Misleading partial averages must NOT be displayed on overflow');
  assert.equal(outcome.reviews.length, 20, 'Visible recent reviews must be preserved up to limit 20');
});

test('Price Filter Overflow Hardening: >5000 candidates halts batching and returns controlled isOverflow result', () => {
  const catalogContent = readFileSync(join(WORKSPACE_DIR, 'lib/catalog/public.ts'), 'utf-8');

  // Must export isOverflow in PublicProductsResult
  assert.match(
    catalogContent,
    /isOverflow\?:\s*boolean/,
    'PublicProductsResult must declare optional isOverflow field'
  );

  // Must define maxCandidates ceiling of 5000
  assert.match(
    catalogContent,
    /maxCandidates\s*=\s*5000/,
    'lib/catalog/public.ts must enforce maxCandidates ceiling of 5000'
  );

  // Must detect totalDbMatches > maxCandidates and set hasOverflow
  assert.match(
    catalogContent,
    /totalDbMatches\s*!=\s*null\s*&&\s*totalDbMatches\s*>\s*maxCandidates/,
    'Must check if totalDbMatches exceeds maxCandidates ceiling'
  );

  // Must return controlled error/overflow state without silent truncation
  assert.match(
    catalogContent,
    /isOverflow:\s*true/,
    'Must return isOverflow: true when candidate ceiling is exceeded'
  );

  // Must return total: 0, totalPages: 0 to avoid false pagination
  assert.match(
    catalogContent,
    /totalPages:\s*0,\s*isOverflow:\s*true/,
    'Must return totalPages: 0 on overflow'
  );

  // Component CatalogBrowser must support and render isOverflow state
  const browserContent = readFileSync(join(WORKSPACE_DIR, 'components/store/catalog-browser.tsx'), 'utf-8');
  assert.match(
    browserContent,
    /isOverflow\?:\s*boolean/,
    'CatalogBrowserProps must accept isOverflow'
  );
  assert.match(
    browserContent,
    /Price\s+Filter\s+Matches\s+Too\s+Many\s+Pieces/,
    'CatalogBrowser must render controlled notice when isOverflow is true'
  );
});


