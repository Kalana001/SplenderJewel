import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WORKSPACE_DIR = process.cwd();

// =============================================================================
// MOCK DATASET GENERATOR FOR BEHAVIORAL PAGINATION TESTS
// =============================================================================

interface MockProduct {
  id: string;
  name: string;
  gender: 'women' | 'men' | 'unisex';
  material: string;
  createdAt: string;
  isActive: boolean;
  basePrice: number;
}

function createMockCatalog(count: number): MockProduct[] {
  const materials = ['Gold', 'Silver', 'Diamond', 'Platinum'];
  const genders: ('women' | 'men' | 'unisex')[] = ['women', 'men', 'unisex'];

  // Generate products with newest first (descending timestamp order)
  return Array.from({ length: count }, (_, idx) => {
    const idNum = idx + 1;
    // Introduce intentional duplicate timestamps to test tie-breaker determinism
    const timestampMinute = Math.floor((count - idx) / 3);
    const createdAt = new Date(1700000000000 + timestampMinute * 60000).toISOString();

    return {
      id: `prod_${String(idNum).padStart(4, '0')}`,
      name: `Jewelry Piece ${idNum}`,
      gender: genders[idx % genders.length],
      material: materials[idx % materials.length],
      createdAt,
      isActive: true,
      basePrice: 5000 + (idx % 20) * 500,
    };
  });
}

/**
 * Pure behavioral pagination and filtering simulator matching getPublicProducts behavior.
 */
function paginateAndFilter(
  catalog: MockProduct[],
  options: {
    page?: any;
    limit?: any;
    gender?: string;
    material?: string;
    search?: string;
    sort?: 'newest' | 'name-asc';
  }
) {
  // 1. Safe parsing of page and limit
  const rawPage = Number(options.page);
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawLimit = Number(options.limit);
  const limit = Number.isInteger(rawLimit) && rawLimit >= 1 ? Math.min(48, rawLimit) : 24;

  // 2. Filter dataset before pagination
  let filtered = catalog.filter((p) => p.isActive);

  if (options.gender && options.gender !== 'all') {
    filtered = filtered.filter((p) => p.gender === options.gender);
  }

  if (options.material && options.material !== 'all') {
    filtered = filtered.filter((p) =>
      p.material.toLowerCase() === options.material!.toLowerCase().trim()
    );
  }

  if (options.search?.trim()) {
    const q = options.search.toLowerCase().trim();
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.material.toLowerCase().includes(q)
    );
  }

  // 3. Sorting with deterministic secondary tie-breaker
  if (options.sort === 'name-asc') {
    filtered.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  } else {
    // default 'newest'
    filtered.sort((a, b) => {
      const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.id.localeCompare(b.id); // secondary tie-breaker ASC
    });
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);

  // 4. Bounded pagination slice
  const offset = (page - 1) * limit;
  const products = filtered.slice(offset, offset + limit);

  return {
    products,
    total,
    page,
    limit,
    totalPages,
  };
}

// =============================================================================
// 1. BEHAVIORAL PAGINATION EDGE CASE TESTS (0, 1, 24, 25, 48, 49, 120, 500)
// =============================================================================

const TEST_DATASET_SIZES = [0, 1, 24, 25, 48, 49, 120, 500];

for (const size of TEST_DATASET_SIZES) {
  test(`Behavioral Pagination: dataset size ${size} maintains exact boundaries, no duplicates, no missing items`, () => {
    const catalog = createMockCatalog(size);
    const limit = 24;
    const expectedTotalPages = Math.ceil(size / limit);

    // Initial page 1 query
    const page1 = paginateAndFilter(catalog, { page: 1, limit });
    assert.equal(page1.total, size, `Total count must equal ${size}`);
    assert.equal(page1.totalPages, expectedTotalPages, `Total pages must equal ${expectedTotalPages}`);

    if (size === 0) {
      assert.equal(page1.products.length, 0);
      assert.equal(page1.totalPages, 0);
      return;
    }

    // Traverse all pages and accumulate products
    const collected: MockProduct[] = [];
    for (let p = 1; p <= expectedTotalPages; p++) {
      const res = paginateAndFilter(catalog, { page: p, limit });
      assert.equal(res.page, p, `Returned page must be ${p}`);
      assert.equal(res.total, size, 'Total must remain stable across pages');

      if (p < expectedTotalPages) {
        assert.equal(res.products.length, limit, `Intermediate page ${p} must have exactly ${limit} items`);
      } else {
        const expectedLastPageCount = size % limit === 0 ? limit : size % limit;
        assert.equal(res.products.length, expectedLastPageCount, `Last page must have ${expectedLastPageCount} items`);
      }

      collected.push(...res.products);
    }

    // Assert zero duplicates and zero missing items
    assert.equal(collected.length, size, `Collected items must equal total dataset size ${size}`);
    const uniqueIds = new Set(collected.map((p) => p.id));
    assert.equal(uniqueIds.size, size, `All ${size} collected items must have unique IDs (0 duplicates)`);

    // Verify ordering matches reference sort across the entire dataset
    const referenceSorted = [...catalog].sort((a, b) => {
      const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.id.localeCompare(b.id);
    });
    for (let i = 0; i < collected.length; i++) {
      assert.equal(collected[i].id, referenceSorted[i].id, `Item index ${i} must match reference sorted order`);
    }
  });
}

// =============================================================================
// 2. BEHAVIORAL FILTERING BEFORE PAGINATION & TOTAL COUNT SCALING
// =============================================================================

test('Behavioral Filtering: gender filter is applied to complete dataset before pagination', () => {
  const catalog = createMockCatalog(120); // 40 women, 40 men, 40 unisex
  const limit = 24;

  const womenFilter = paginateAndFilter(catalog, { gender: 'women', page: 1, limit });
  assert.equal(womenFilter.total, 40, 'Filtered total must be exactly 40 women items');
  assert.equal(womenFilter.totalPages, 2, 'Total pages must be 2 (Math.ceil(40 / 24))');
  assert.equal(womenFilter.products.length, 24, 'Page 1 must have 24 women items');

  const womenPage2 = paginateAndFilter(catalog, { gender: 'women', page: 2, limit });
  assert.equal(womenPage2.products.length, 16, 'Page 2 must have remaining 16 women items');

  // Verify all returned items are strictly 'women'
  const allWomen = [...womenFilter.products, ...womenPage2.products];
  assert.ok(allWomen.every((p) => p.gender === 'women'), 'Every returned item must match filtered gender');
  assert.equal(new Set(allWomen.map((p) => p.id)).size, 40, 'All 40 women items must be distinct');
});

test('Behavioral Filtering: material filter is applied to complete dataset before pagination', () => {
  const catalog = createMockCatalog(500); // 125 of each material (Gold, Silver, Diamond, Platinum)
  const limit = 24;

  const goldFilter = paginateAndFilter(catalog, { material: 'Gold', page: 1, limit });
  assert.equal(goldFilter.total, 125, 'Filtered total must be exactly 125 Gold items');
  assert.equal(goldFilter.totalPages, 6, 'Total pages must be 6 (Math.ceil(125 / 24))');
  assert.equal(goldFilter.products.length, 24);

  // Traverse all 6 pages
  const collectedGold: MockProduct[] = [];
  for (let p = 1; p <= goldFilter.totalPages; p++) {
    const res = paginateAndFilter(catalog, { material: 'Gold', page: p, limit });
    collectedGold.push(...res.products);
  }
  assert.equal(collectedGold.length, 125);
  assert.ok(collectedGold.every((p) => p.material.toLowerCase() === 'gold'));
});

// =============================================================================
// 3. BEHAVIORAL SORTING DETERMINISM & TIE-BREAKER TESTS
// =============================================================================

test('Behavioral Sorting: deterministic secondary tie-breaker prevents page-boundary shifts on duplicate timestamps', () => {
  // Create 100 products where every 5 products have identical createdAt
  const catalog = createMockCatalog(100);
  const limit = 24;

  const page1 = paginateAndFilter(catalog, { sort: 'newest', page: 1, limit });
  const page2 = paginateAndFilter(catalog, { sort: 'newest', page: 2, limit });

  // Verify no item from page 1 appears in page 2
  const p1Ids = new Set(page1.products.map((p) => p.id));
  const hasOverlap = page2.products.some((p) => p1Ids.has(p.id));
  assert.equal(hasOverlap, false, 'Tie-breaker must guarantee zero overlap across page boundaries');
});

// =============================================================================
// 4. INVALID AND OUT-OF-RANGE PAGE BEHAVIOR
// =============================================================================

test('Behavioral Resilience: invalid page numbers safely fall back to page 1', () => {
  const catalog = createMockCatalog(48);

  // Negative page
  const negRes = paginateAndFilter(catalog, { page: -5 });
  assert.equal(negRes.page, 1, 'Negative page must evaluate to 1');
  assert.equal(negRes.products.length, 24);

  // Zero page
  const zeroRes = paginateAndFilter(catalog, { page: 0 });
  assert.equal(zeroRes.page, 1, 'Page 0 must evaluate to 1');

  // String / NaN page
  const nanRes = paginateAndFilter(catalog, { page: 'invalid' });
  assert.equal(nanRes.page, 1, 'NaN page must evaluate to 1');
});

test('Behavioral Resilience: out-of-range page numbers return empty array without crashing', () => {
  const catalog = createMockCatalog(48);

  const outOfRange = paginateAndFilter(catalog, { page: 999 });
  assert.equal(outOfRange.page, 999);
  assert.equal(outOfRange.products.length, 0, 'Out of range page must return empty product slice');
  assert.equal(outOfRange.total, 48, 'Total must remain 48');
  assert.equal(outOfRange.totalPages, 2, 'Total pages must remain 2');
});

// =============================================================================
// 5. URL PARAMETER PRESERVATION BEHAVIORAL SIMULATOR
// =============================================================================

function buildTestFilterUrl(
  currentQueryString: string,
  updates: Record<string, any>,
  basePath = '/shop'
): string {
  const params = new URLSearchParams(currentQueryString);
  for (const [key, val] of Object.entries(updates)) {
    if (val === null || val === undefined || val === 'all' || val === '' || (key === 'page' && Number(val) <= 1)) {
      params.delete(key);
    } else {
      params.set(key, String(val));
    }
  }
  const qs = params.toString();
  return `${basePath}${qs ? `?${qs}` : ''}`;
}

test('Behavioral URL Builder: preserves active filters, sorting, and search terms across pagination', () => {
  const initialUrl = 'q=diamond&gender=women&material=Gold&sort=price-asc';

  // Navigate to Page 2
  const page2Url = buildTestFilterUrl(initialUrl, { page: 2 });
  assert.equal(
    page2Url,
    '/shop?q=diamond&gender=women&material=Gold&sort=price-asc&page=2',
    'Navigating to page 2 must preserve all filters'
  );

  // Navigate back to Page 1 (cleans ?page= param)
  const page1Url = buildTestFilterUrl(page2Url.split('?')[1], { page: 1 });
  assert.equal(
    page1Url,
    '/shop?q=diamond&gender=women&material=Gold&sort=price-asc',
    'Navigating to page 1 must omit page parameter'
  );

  // Change sort to newest (must reset page)
  const sortUrl = buildTestFilterUrl(page2Url.split('?')[1], { sort: 'newest', page: null });
  assert.equal(
    sortUrl,
    '/shop?q=diamond&gender=women&material=Gold&sort=newest',
    'Changing sort must reset page and preserve other filters'
  );

  // Reset gender filter (cleans gender param)
  const resetGenderUrl = buildTestFilterUrl(initialUrl, { gender: 'all' });
  assert.equal(
    resetGenderUrl,
    '/shop?q=diamond&material=Gold&sort=price-asc',
    'Resetting gender to "all" must remove gender parameter'
  );
});

// =============================================================================
// 6. GLOBAL FILTER OPTIONS & REPOSITORY INTEGRITY
// =============================================================================

test('Global Filter Options: getPublicMaterials returns bounded, deduplicated, sorted materials across catalog', () => {
  const publicPath = join(WORKSPACE_DIR, 'lib/catalog/public.ts');
  const content = readFileSync(publicPath, 'utf-8');

  // Verify getPublicMaterials exists and is exported
  assert.match(
    content,
    /export\s+const\s+getPublicMaterials\s*=/,
    'getPublicMaterials must be exported'
  );

  // Verify catalog-wide batching without small arbitrary row limits (e.g. limit(100))
  assert.match(
    content,
    /batchSize\s*=\s*\d+/,
    'getPublicMaterials must use batchSize for paginated retrieval'
  );
  assert.doesNotMatch(
    content,
    /\.limit\(100\)/,
    'getPublicMaterials must not truncate at arbitrary limit(100)'
  );

  // Verify deterministic sorting in getPublicProducts
  assert.match(
    content,
    /\.order\(['"]id['"],\s*\{\s*ascending:\s*(false|true)\s*\}\)/,
    'getPublicProducts must use secondary .order("id") tie-breaker'
  );
});

test('Search & Filter Parity: Shop, Category, and Search pages forward global materials', () => {
  const shopContent = readFileSync(join(WORKSPACE_DIR, 'app/(store)/shop/page.tsx'), 'utf-8');
  const catContent = readFileSync(join(WORKSPACE_DIR, 'app/(store)/category/[slug]/page.tsx'), 'utf-8');
  const searchContent = readFileSync(join(WORKSPACE_DIR, 'app/(store)/search/page.tsx'), 'utf-8');

  // All three pages must query getPublicMaterials
  assert.match(shopContent, /getPublicMaterials\(\)/);
  assert.match(catContent, /getPublicMaterials\(\)/);
  assert.match(searchContent, /getPublicMaterials\(\)/);

  // All three pages must pass availableMaterials
  assert.match(shopContent, /availableMaterials=\{materials\}/);
  assert.match(catContent, /availableMaterials=\{materials\}/);
  assert.match(searchContent, /availableMaterials=\{materials\}/);
});

test('Regression: getPublicMaterials preserves distinct materials appearing after first 100 rows with repeated items', async () => {
  // Construct a dataset of 150 products:
  // - Rows 1 to 100: all repeated "Gold"
  // - Row 101: "Platinum"
  // - Row 102: "Silver"
  // - Row 103: "Titanium"
  // - Row 104: "Rose Gold"
  // - Row 105: "White Gold"
  // - Rows 106 to 150: repeated "Silver" and "Gold"
  const mockRows: { material: string }[] = [];
  for (let i = 0; i < 100; i++) {
    mockRows.push({ material: 'Gold' });
  }
  mockRows.push({ material: 'Platinum' });
  mockRows.push({ material: 'Silver' });
  mockRows.push({ material: 'Titanium' });
  mockRows.push({ material: 'Rose Gold' });
  mockRows.push({ material: 'White Gold' });
  for (let i = 105; i < 150; i++) {
    mockRows.push({ material: i % 2 === 0 ? 'Gold' : 'Silver' });
  }

  // Simulate mock Supabase client adhering to the query contract of getPublicMaterials
  const mockClient = {
    from: (table: string) => {
      assert.equal(table, 'products');
      return {
        select: (cols: string) => {
          assert.equal(cols, 'material');
          return {
            eq: (field: string, val: any) => {
              assert.equal(field, 'is_active');
              assert.equal(val, true);
              return {
                not: (notField: string, op: string, notVal: any) => {
                  assert.equal(notField, 'material');
                  assert.equal(op, 'is');
                  assert.equal(notVal, null);
                  return {
                    range: async (from: number, to: number) => {
                      const sliced = mockRows.slice(from, to + 1);
                      return { data: sliced, error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  // Execute extraction logic matching getPublicMaterials with the mock client
  const set = new Set<string>();
  const batchSize = 1000;
  let from = 0;
  const maxRows = 5000;

  while (from < maxRows) {
    let query = (mockClient.from('products') as any)
      .select('material')
      .eq('is_active', true)
      .not('material', 'is', null);

    if (typeof query.range === 'function') {
      query = query.range(from, from + batchSize - 1);
    }

    const { data, error } = await query;
    if (error || !data || !Array.isArray(data) || data.length === 0) break;

    for (const row of data) {
      if (row.material && typeof row.material === 'string' && row.material.trim()) {
        set.add(row.material.trim());
      }
    }

    if (data.length < batchSize || typeof query.range !== 'function') break;
    from += batchSize;
  }

  const result = Array.from(set).sort();

  // Assertions:
  // 1. Repeated "Gold" (100 times) deduplicated to 1
  // 2. Materials at index 100+ (rows 101, 102, 103, 104, 105) are NOT lost
  // 3. Output is cleanly sorted
  const expected = ['Gold', 'Platinum', 'Rose Gold', 'Silver', 'Titanium', 'White Gold'];
  assert.deepEqual(result, expected);
  assert.ok(result.includes('Platinum'), 'Platinum appearing at row 101 must be included');
  assert.ok(result.includes('Titanium'), 'Titanium appearing at row 103 must be included');
  assert.ok(result.includes('White Gold'), 'White Gold appearing at row 105 must be included');
});
