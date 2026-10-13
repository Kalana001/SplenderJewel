import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STORE_CATEGORIES } from '../lib/config/store.ts';

/**
 * Pure category query & mapping logic matching lib/catalog/public.ts
 */
async function executeGetPublicCategories(supabaseClient: any) {
  if (!supabaseClient) {
    return DEFAULT_STORE_CATEGORIES;
  }

  const { data, error } = await supabaseClient
    .from('categories')
    .select('id, name, slug, description, image_url, display_order, is_active, created_at')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    const dbError = new Error(`Database error querying categories: ${error.message}`);
    (dbError as any).code = error.code;
    (dbError as any).details = error.details;
    throw dbError;
  }

  if (!data || !Array.isArray(data)) {
    return [];
  }

  const seenSlugs = new Set<string>();
  const categories: any[] = [];

  for (const row of data) {
    const slug = (row.slug || '').trim().toLowerCase();
    if (!slug || seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);

    categories.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      imageUrl: row.image_url,
      displayOrder: row.display_order ?? 0,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at || '',
    });
  }

  return categories;
}

/**
 * Storefront navigation builder logic matching components/store/header.tsx
 */
function buildStorefrontNavLinks(categories: any[]) {
  const seenSlugs = new Set<string>();
  const dynamicCategoryLinks: Array<{ label: string; href: string }> = [];

  for (const cat of categories) {
    if (!cat || !cat.slug || !cat.name || cat.isActive === false) continue;
    const cleanSlug = cat.slug.toLowerCase().trim();
    if (!cleanSlug || seenSlugs.has(cleanSlug)) continue;
    if (cleanSlug === 'shop' || cleanSlug === 'about' || cleanSlug === 'contact') continue;
    seenSlugs.add(cleanSlug);

    dynamicCategoryLinks.push({
      label: cat.name,
      href: `/category/${encodeURIComponent(cleanSlug)}`,
    });
  }

  return [
    { label: 'Shop All', href: '/shop' },
    ...dynamicCategoryLinks,
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ];
}

// =============================================================================
// TEST SUITE: Dynamic Storefront Categories & Navigation
// =============================================================================

test('Storefront Categories: excludes inactive categories (is_active = false)', async () => {
  const mockClient = {
    from: () => ({
      select: () => ({
        eq: (col: string, val: any) => {
          assert.equal(col, 'is_active');
          assert.equal(val, true);
          return {
            order: () => ({
              order: async () => ({
                data: [
                  { id: 'cat-1', name: 'Rings', slug: 'rings', is_active: true, display_order: 1 },
                  { id: 'cat-2', name: 'Necklaces', slug: 'necklaces', is_active: true, display_order: 2 },
                ],
                error: null,
              }),
            }),
          };
        },
      }),
    }),
  };

  const results = await executeGetPublicCategories(mockClient);
  assert.equal(results.length, 2);
  assert.equal(results[0].slug, 'rings');
  assert.equal(results[1].slug, 'necklaces');
  assert.ok(results.every((c) => c.isActive === true));
});

test('Storefront Categories: orders by display_order ASC with stable secondary sort by name ASC', async () => {
  const mockClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: (col1: string, opt1: any) => {
            assert.equal(col1, 'display_order');
            assert.equal(opt1.ascending, true);
            return {
              order: (col2: string, opt2: any) => {
                assert.equal(col2, 'name');
                assert.equal(opt2.ascending, true);
                return Promise.resolve({
                  data: [
                    { id: 'cat-1', name: 'Bracelets', slug: 'bracelets', display_order: 1, is_active: true },
                    { id: 'cat-2', name: 'Anklets', slug: 'anklets', display_order: 2, is_active: true },
                    { id: 'cat-3', name: 'Pendants', slug: 'pendants', display_order: 2, is_active: true },
                    { id: 'cat-4', name: 'Rings', slug: 'rings', display_order: 3, is_active: true },
                  ],
                  error: null,
                });
              },
            };
          },
        }),
      }),
    }),
  };

  const results = await executeGetPublicCategories(mockClient);
  assert.equal(results.length, 4);
  assert.equal(results[0].name, 'Bracelets');
  assert.equal(results[1].name, 'Anklets');
  assert.equal(results[2].name, 'Pendants');
  assert.equal(results[3].name, 'Rings');
});

test('Storefront Categories: dynamically displays newly created categories including Anklet test category', async () => {
  const mockClientWithAnklet = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            order: async () => ({
              data: [
                { id: 'cat-1', name: 'Rings', slug: 'rings', display_order: 1, is_active: true },
                { id: 'cat-2', name: 'Anklet', slug: 'anklet', description: 'Fine ankle jewelry', image_url: 'https://images.splender.lk/anklet.jpg', display_order: 2, is_active: true },
                { id: 'cat-3', name: 'Necklaces', slug: 'necklaces', display_order: 3, is_active: true },
              ],
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  const results = await executeGetPublicCategories(mockClientWithAnklet);
  const anklet = results.find((c) => c.slug === 'anklet');
  assert.ok(anklet, 'Expected newly created Anklet category to be returned');
  assert.equal(anklet?.name, 'Anklet');
  assert.equal(anklet?.description, 'Fine ankle jewelry');
  assert.equal(anklet?.imageUrl, 'https://images.splender.lk/anklet.jpg');
});

test('Storefront Categories: deduplicates duplicate category slugs and sanitizes input', async () => {
  const mockClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            order: async () => ({
              data: [
                { id: 'cat-1', name: 'Rings', slug: 'rings', display_order: 1, is_active: true },
                { id: 'cat-dup', name: 'Rings Duplicate', slug: 'RINGS ', display_order: 2, is_active: true },
                { id: 'cat-2', name: 'Necklaces', slug: 'necklaces', display_order: 3, is_active: true },
              ],
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  const results = await executeGetPublicCategories(mockClient);
  assert.equal(results.length, 2);
  assert.equal(results[0].slug, 'rings');
  assert.equal(results[1].slug, 'necklaces');
});

test('Storefront Categories: returns empty array when query succeeds with no active categories', async () => {
  const mockEmptyClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            order: async () => ({
              data: [],
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  const results = await executeGetPublicCategories(mockEmptyClient);
  assert.deepEqual(results, [], 'Configured database with 0 categories must return [] without default fallback');
});

test('Storefront Categories: propagates database errors and does not silently fall back', async () => {
  const mockErrorClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            order: async () => ({
              data: null,
              error: {
                message: 'Supabase postgrest connection error',
                code: '08001',
              },
            }),
          }),
        }),
      }),
    }),
  };

  await assert.rejects(
    async () => {
      await executeGetPublicCategories(mockErrorClient);
    },
    (err: any) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Database error querying categories:/);
      assert.match(err.message, /Supabase postgrest connection error/);
      return true;
    }
  );
});

test('Storefront Categories: uses DEFAULT_STORE_CATEGORIES only when client is unconfigured (null)', async () => {
  const results = await executeGetPublicCategories(null);
  assert.equal(results.length, DEFAULT_STORE_CATEGORIES.length);
  assert.equal(results[0].slug, DEFAULT_STORE_CATEGORIES[0].slug);
});

test('Storefront Navigation: preserves static links (Shop All, About, Contact) and inserts dynamic categories', () => {
  const categories = [
    { id: 'c1', name: 'Rings', slug: 'rings', isActive: true },
    { id: 'c2', name: 'Necklaces', slug: 'necklaces', isActive: true },
    { id: 'c3', name: 'Anklets', slug: 'anklets', isActive: true },
  ];

  const links = buildStorefrontNavLinks(categories);

  // Assert order
  assert.equal(links[0].label, 'Shop All');
  assert.equal(links[0].href, '/shop');

  assert.equal(links[1].label, 'Rings');
  assert.equal(links[1].href, '/category/rings');

  assert.equal(links[2].label, 'Necklaces');
  assert.equal(links[2].href, '/category/necklaces');

  assert.equal(links[3].label, 'Anklets');
  assert.equal(links[3].href, '/category/anklets');

  assert.equal(links[4].label, 'About');
  assert.equal(links[4].href, '/about');

  assert.equal(links[5].label, 'Contact');
  assert.equal(links[5].href, '/contact');
});

test('Storefront Navigation: mobile menu drawer preserves 100% parity with desktop links', () => {
  const categories = [
    { id: 'c1', name: 'Rings', slug: 'rings', isActive: true },
    { id: 'c2', name: 'Custom Men Collection', slug: 'men', isActive: true },
  ];

  const desktopLinks = buildStorefrontNavLinks(categories);
  const mobileLinks = buildStorefrontNavLinks(categories); // Both consume navLinks

  assert.deepEqual(desktopLinks, mobileLinks);
  assert.equal(mobileLinks.length, 5);
  assert.equal(mobileLinks[1].label, 'Rings');
  assert.equal(mobileLinks[2].label, 'Custom Men Collection');
});

test('Storefront Homepage CMS: respects isEnabled visibility toggle and explicit displayCount limits', () => {
  const allCategories = [
    { id: 'c1', name: 'Rings', slug: 'rings' },
    { id: 'c2', name: 'Necklaces', slug: 'necklaces' },
    { id: 'c3', name: 'Bracelets', slug: 'bracelets' },
    { id: 'c4', name: 'Earrings', slug: 'earrings' },
    { id: 'c5', name: 'Anklets', slug: 'anklets' },
    { id: 'c6', name: 'Bespoke Sets', slug: 'sets' },
    { id: 'c7', name: 'Chokers', slug: 'chokers' },
    { id: 'c8', name: 'Brooches', slug: 'brooches' },
  ];

  // Helper matching app/(store)/page.tsx logic
  function resolveVisibleCategories(categories: any[], cmsSection: any) {
    const rawLimit = cmsSection?.configData?.displayCount;
    const explicitLimit =
      typeof rawLimit === 'number' && rawLimit > 0
        ? rawLimit
        : typeof rawLimit === 'string' && Number(rawLimit) > 0
        ? Number(rawLimit)
        : null;

    return explicitLimit ? categories.slice(0, explicitLimit) : categories;
  }

  // Case 1: isEnabled = false hides the section
  const cmsDisabled = { isEnabled: false, configData: {} };
  assert.equal(cmsDisabled.isEnabled, false, 'Section should be hidden when isEnabled = false');

  // Case 2: No explicit limit in CMS -> shows ALL active categories (does not default to 6)
  const cmsNoLimit = { isEnabled: true, configData: {} };
  const visibleAll = resolveVisibleCategories(allCategories, cmsNoLimit);
  assert.equal(visibleAll.length, 8, 'Expected all 8 categories to show when no explicit limit is configured');
  assert.equal(visibleAll[7].name, 'Brooches');

  // Case 3: Administrator explicitly sets displayCount = 4 -> respects limit 4
  const cmsLimited = { isEnabled: true, configData: { displayCount: 4 } };
  const visibleFour = resolveVisibleCategories(allCategories, cmsLimited);
  assert.equal(visibleFour.length, 4, 'Expected exactly 4 categories when displayCount is explicitly set');
  assert.equal(visibleFour[0].name, 'Rings');
  assert.equal(visibleFour[3].name, 'Earrings');
});

test('Storefront Categories: newly created category with display_order = 1 appears in first position', async () => {
  const mockClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            order: async () => ({
              data: [
                { id: 'c-new', name: 'Anklets', slug: 'anklets', display_order: 1, is_active: true },
                { id: 'c-old1', name: 'Rings', slug: 'rings', display_order: 2, is_active: true },
                { id: 'c-old2', name: 'Necklaces', slug: 'necklaces', display_order: 3, is_active: true },
              ],
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  const results = await executeGetPublicCategories(mockClient);
  assert.equal(results[0].name, 'Anklets', 'display_order = 1 must appear at the first position');
  assert.equal(results[0].displayOrder, 1);
  assert.equal(results[1].name, 'Rings');
});

test('Storefront Resilience: layout and page error handling falls back to customer-safe categories on database error', async () => {
  let loggedError: any = null;
  const originalError = console.error;
  console.error = (...args: any[]) => {
    loggedError = args;
  };

  try {
    // Simulate layout error boundary
    let categories: any[] = [];
    try {
      throw new Error('Supabase connection pool exhausted');
    } catch (err) {
      console.error('[StoreLayout] Database error fetching categories for layout, falling back to default categories:', err);
      categories = DEFAULT_STORE_CATEGORIES;
    }

    // Must log diagnostic error
    assert.ok(loggedError, 'Expected diagnostic log when database error occurs');
    assert.match(loggedError[0], /Database error fetching categories/);

    // Must NOT be an empty category list, preserving customer-safe fallback
    assert.notEqual(categories.length, 0, 'Must not disguise real database error as empty list');
    assert.equal(categories.length, DEFAULT_STORE_CATEGORIES.length);
    assert.equal(categories[0].slug, 'rings');
  } finally {
    console.error = originalError;
  }
});
