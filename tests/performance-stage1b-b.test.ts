import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { DEFAULT_STORE_CATEGORIES, DEFAULT_DEV_STORE_CONFIG } from '../lib/config/store.ts';

const WORKSPACE_DIR = process.cwd();

function readSource(relPath: string): string {
  return readFileSync(join(WORKSPACE_DIR, relPath), 'utf-8');
}

/**
 * Compiles and loads the real `lib/catalog/public.ts` and `lib/catalog/categories.ts`
 * inside a controllable VM harness with stateful `unstable_cache`, `revalidateTag`,
 * `revalidatePath`, `React.cache`, and controllable clock (`nowMs`).
 */
function createCatalogTestHarness(options?: {
  initialNowMs?: number;
  getPublicSupabaseClient?: () => any;
  getAdminClient?: () => any;
  requireAdminAuthImpl?: () => Promise<any>;
}) {
  let nowMs = options?.initialNowMs ?? 1_700_000_000_000;
  let currentRequestBucket = new Map<Function, Map<string, any>>();

  const nextDataCache = new Map<
    string,
    {
      value: any;
      expiresAt: number;
      tags: string[];
    }
  >();

  const revalidatedTags: string[] = [];
  const revalidatedPaths: Array<{ path: string; type?: string }> = [];
  const unstableCacheConfigs: Array<{ keyParts?: string[]; revalidate?: number | false; tags?: string[] }> = [];

  const CustomDate = class extends Date {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(nowMs);
      } else {
        // @ts-ignore
        super(...args);
      }
    }
    static now() {
      return nowMs;
    }
  };

  // Request-scoped React.cache simulation (cleared on `newRequest()`)
  function reactCache<T extends (...args: any[]) => any>(fn: T): T {
    const wrapped = (...args: any[]) => {
      let fnMap = currentRequestBucket.get(fn);
      if (!fnMap) {
        fnMap = new Map<string, any>();
        currentRequestBucket.set(fn, fnMap);
      }
      const key =
        args.length === 0
          ? '__no_args__'
          : args
              .map((arg) => {
                if (arg && typeof arg === 'object' && ('from' in arg || '__mockClientId' in arg)) {
                  return `__client_${arg.__mockClientId || 'custom'}__`;
                }
                try {
                  return JSON.stringify(arg);
                } catch {
                  return String(arg);
                }
              })
              .join('|');

      if (fnMap.has(key)) {
        return fnMap.get(key);
      }
      const result = fn(...args);
      fnMap.set(key, result);
      return result;
    };
    return wrapped as unknown as T;
  }

  // Next.js 15 `unstable_cache` simulation with TTL and tag invalidation
  function unstableCache<T extends (...args: any[]) => Promise<any>>(
    cb: T,
    keyParts?: string[],
    cacheOptions?: { revalidate?: number | false; tags?: string[] }
  ): T {
    unstableCacheConfigs.push({
      keyParts: cacheOptions && keyParts ? Array.from(keyParts) : undefined,
      revalidate: cacheOptions?.revalidate,
      tags: cacheOptions?.tags ? Array.from(cacheOptions.tags) : undefined,
    });

    const baseKey = (keyParts || ['default']).join(':');
    const ttlMs =
      typeof cacheOptions?.revalidate === 'number'
        ? cacheOptions.revalidate * 1000
        : 365 * 24 * 60 * 60 * 1000;
    const tags = cacheOptions?.tags || [];

    const cachedFn = async (...args: any[]) => {
      const callKey = `${baseKey}:${JSON.stringify(args)}`;
      const existing = nextDataCache.get(callKey);
      if (existing && nowMs < existing.expiresAt) {
        return JSON.parse(JSON.stringify(existing.value));
      }

      // If `cb` throws (e.g. Supabase DB error or unconfigured error), do NOT store in nextDataCache
      const freshValue = await cb(...args);
      nextDataCache.set(callKey, {
        value: JSON.parse(JSON.stringify(freshValue)),
        expiresAt: nowMs + ttlMs,
        tags,
      });
      return JSON.parse(JSON.stringify(freshValue));
    };

    return cachedFn as unknown as T;
  }

  function revalidateTag(tag: string) {
    revalidatedTags.push(tag);
    for (const [key, entry] of nextDataCache.entries()) {
      if (entry.tags.includes(tag)) {
        nextDataCache.delete(key);
      }
    }
  }

  function revalidatePath(path: string, type?: string) {
    revalidatedPaths.push({ path, type });
  }

  const publicTsCode = readSource('lib/catalog/public.ts');
  const categoriesTsCode = readSource('lib/catalog/categories.ts');

  const transpile = (code: string, filename: string) =>
    ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: filename,
    }).outputText;

  const publicExports: Record<string, any> = {};
  const categoriesExports: Record<string, any> = {};

  const customRequire = (id: string) => {
    if (id === 'server-only') return {};
    if (id === 'react') return { cache: reactCache };
    if (id === 'next/cache') {
      return {
        unstable_cache: unstableCache,
        revalidateTag,
        revalidatePath,
      };
    }
    if (id === '@/lib/supabase/server') {
      return {
        createPublicSupabaseClient: () =>
          options?.getPublicSupabaseClient ? options.getPublicSupabaseClient() : null,
      };
    }
    if (id === '@/lib/supabase/admin') {
      return {
        createAdminClient: () =>
          options?.getAdminClient ? options.getAdminClient() : null,
      };
    }
    if (id === '@/lib/auth/server') {
      return {
        requireAdminAuth: async () =>
          options?.requireAdminAuthImpl ? options.requireAdminAuthImpl() : { id: 'admin-1', role: 'admin' },
      };
    }
    if (id === '@/lib/config/store') {
      return {
        DEFAULT_STORE_CATEGORIES,
        DEFAULT_DEV_STORE_CONFIG,
      };
    }
    if (id === './public' || id === '@/lib/catalog/public') {
      return publicExports;
    }
    throw new Error(`Unexpected require("${id}") in catalog test harness`);
  };

  const evalModule = (jsCode: string, exportsObj: Record<string, any>, filename: string) => {
    const moduleObj = { exports: exportsObj };
    const sandbox = {
      module: moduleObj,
      exports: exportsObj,
      require: customRequire,
      Date: CustomDate,
      console: {
        error: () => {},
        warn: () => {},
        log: () => {},
      },
      Promise,
      Set,
      Map,
      Math,
      Number,
      Boolean,
      String,
      Array,
      Object,
      Error,
      RegExp,
      JSON,
    };
    vm.runInNewContext(jsCode, sandbox, { filename });
    return moduleObj.exports;
  };

  const loadedPublic = evalModule(transpile(publicTsCode, 'public.ts'), publicExports, 'public.ts');
  const loadedCategories = evalModule(transpile(categoriesTsCode, 'categories.ts'), categoriesExports, 'categories.ts');

  return {
    publicModule: loadedPublic as typeof import('../lib/catalog/public'),
    categoriesModule: loadedCategories as typeof import('../lib/catalog/categories'),
    advanceTimeMs(deltaMs: number) {
      nowMs += deltaMs;
    },
    newRequest() {
      currentRequestBucket = new Map();
    },
    getNextDataCacheSize() {
      return nextDataCache.size;
    },
    revalidatedTags,
    revalidatedPaths,
    unstableCacheConfigs,
  };
}

// =============================================================================
// 1 & 2. SHARED CACHE REUSE across requests & 300-SECOND BOUNDED EXPIRY
// =============================================================================

test('Task 1 & 2 (Behavioral): Repeated getPublicCategories() reads across requests use the shared cache (300s TTL, tag "public-categories") and refresh after 300s expiry', async () => {
  let dbCategoryQueryCount = 0;
  let currentDbRows = [
    { id: 'cat-1', name: 'Rings', slug: 'rings', description: 'Fine rings', image_url: null, display_order: 1, is_active: true, created_at: '2026-01-01T00:00:00Z' },
    { id: 'cat-2', name: 'Anklet', slug: 'anklet', description: 'Gold anklets', image_url: null, display_order: 2, is_active: true, created_at: '2026-01-02T00:00:00Z' },
  ];

  const mockPublicClient = {
    from(table: string) {
      assert.equal(table, 'categories');
      dbCategoryQueryCount++;
      return {
        select() {
          return {
            eq(col: string, val: any) {
              assert.equal(col, 'is_active');
              assert.equal(val, true);
              return {
                order() {
                  return {
                    order: async () => ({
                      data: currentDbRows,
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const harness = createCatalogTestHarness({
    getPublicSupabaseClient: () => mockPublicClient,
  });

  // Verify unstable_cache configuration
  assert.equal(harness.publicModule.PUBLIC_CATEGORIES_CACHE_TAG, 'public-categories');
  assert.equal(harness.publicModule.PUBLIC_CATEGORIES_REVALIDATE_SECONDS, 300);
  assert.equal(harness.unstableCacheConfigs.length, 1);
  assert.equal(harness.unstableCacheConfigs[0].revalidate, 300);
  assert.deepEqual(harness.unstableCacheConfigs[0].tags, ['public-categories']);

  // Request 1 (e.g. StoreLayout + HomePage calling getPublicCategories)
  const req1Layout = await harness.publicModule.getPublicCategories();
  const req1Page = await harness.publicModule.getPublicCategories();
  assert.equal(dbCategoryQueryCount, 1, 'First request must query Supabase exactly once');
  assert.equal(req1Layout.length, 2);
  assert.equal(req1Page.length, 2);

  // Request 2 (e.g. Customer navigates to /account/orders 10 seconds later)
  harness.newRequest();
  harness.advanceTimeMs(10_000);
  const req2AccountOrders = await harness.publicModule.getPublicCategories();
  assert.equal(dbCategoryQueryCount, 1, 'Cross-request navigation within 300s must serve from shared cache with 0 new DB queries');
  assert.equal(req2AccountOrders[1].slug, 'anklet');

  // Request 3 (e.g. Customer navigates to /account/wishlist at t = 299s)
  harness.newRequest();
  harness.advanceTimeMs(289_000); // Total elapsed = 299s (< 300s)
  await harness.publicModule.getPublicCategories();
  assert.equal(dbCategoryQueryCount, 1, 'At 299s (< 300s TTL), cache must still hit without querying DB');

  // Advance past 300s TTL (total elapsed = 301s)
  currentDbRows = [
    ...currentDbRows,
    { id: 'cat-3', name: 'Bracelets', slug: 'bracelets', description: 'Cuffs', image_url: null, display_order: 3, is_active: true, created_at: '2026-01-03T00:00:00Z' },
  ];
  harness.newRequest();
  harness.advanceTimeMs(2_000); // Total elapsed = 301s (> 300s)
  const afterExpiry = await harness.publicModule.getPublicCategories();
  assert.equal(dbCategoryQueryCount, 2, 'After 300s TTL expires, next request must fetch fresh categories from DB');
  assert.equal(afterExpiry.length, 3);
  assert.equal(afterExpiry[2].slug, 'bracelets');
});

// =============================================================================
// 3 & 4. ADMIN MUTATION CACHE INVALIDATION (SUCCESS vs FAILURE)
// =============================================================================

test('Task 3 & 4 (Behavioral): Successful admin category mutations invalidate "public-categories" immediately; failed mutations never invalidate it', async () => {
  let publicQueryCount = 0;
  let dbCategories: any[] = [
    { id: 'cat-1', name: 'Rings', slug: 'rings', description: 'Rings', image_url: null, display_order: 1, is_active: true, created_at: '2026-01-01T00:00:00Z' },
  ];

  let nextAdminInsertError: any = null;
  let nextAdminUpdateError: any = null;
  let nextAdminToggleError: any = null;
  let nextAdminDeleteError: any = null;
  let dependentProductsCount = 0;

  const mockPublicClient = {
    from(table: string) {
      assert.equal(table, 'categories');
      publicQueryCount++;
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              order: async () => ({
                data: dbCategories.filter((c) => c.is_active),
                error: null,
              }),
            }),
          }),
        }),
      };
    },
  };

  const mockAdminClient = {
    from(table: string) {
      if (table === 'products') {
        return {
          select: () => ({
            eq: async () => ({
              count: dependentProductsCount,
              error: null,
            }),
          }),
        };
      }

      return {
        select: () => ({
          eq: (_col: string, val: string) => ({
            maybeSingle: async () => ({
              data: dbCategories.find((c) => c.slug === val) || null,
              error: null,
            }),
            neq: (_col2: string, idVal: string) => ({
              maybeSingle: async () => ({
                data: dbCategories.find((c) => c.slug === val && c.id !== idVal) || null,
                error: null,
              }),
            }),
          }),
        }),
        insert: (payload: any) => ({
          select: () => ({
            single: async () => {
              if (nextAdminInsertError) {
                return { data: null, error: nextAdminInsertError };
              }
              const created = {
                id: `cat-${dbCategories.length + 1}`,
                ...payload,
                created_at: '2026-01-05T00:00:00Z',
              };
              dbCategories.push(created);
              return { data: created, error: null };
            },
          }),
        }),
        update: (payload: any) => ({
          eq: (_col: string, idVal: string) => {
            // toggleCategoryActiveAction awaits .eq() directly; updateCategoryAction chains .select().single()
            const applyUpdate = () => {
              const idx = dbCategories.findIndex((c) => c.id === idVal);
              if (idx >= 0) {
                dbCategories[idx] = { ...dbCategories[idx], ...payload };
                return dbCategories[idx];
              }
              return null;
            };

            return {
              then(resolve: any) {
                if (nextAdminToggleError) {
                  resolve({ error: nextAdminToggleError });
                } else {
                  applyUpdate();
                  resolve({ error: null });
                }
              },
              select: () => ({
                single: async () => {
                  if (nextAdminUpdateError) {
                    return { data: null, error: nextAdminUpdateError };
                  }
                  const updated = applyUpdate();
                  return { data: updated, error: null };
                },
              }),
            };
          },
        }),
        delete: () => ({
          eq: async (_col: string, idVal: string) => {
            if (nextAdminDeleteError) {
              return { error: nextAdminDeleteError };
            }
            dbCategories = dbCategories.filter((c) => c.id !== idVal);
            return { error: null };
          },
        }),
      };
    },
  };

  const harness = createCatalogTestHarness({
    getPublicSupabaseClient: () => mockPublicClient,
    getAdminClient: () => mockAdminClient,
  });

  // Prime the public category cache
  const initial = await harness.publicModule.getPublicCategories();
  assert.equal(initial.length, 1);
  assert.equal(publicQueryCount, 1);

  // 1. FAILED createCategoryAction (validation failure: empty name) -> must NOT invalidate cache
  const failValidation = await harness.categoriesModule.createCategoryAction({ name: '   ' });
  assert.equal(failValidation.success, false);
  assert.equal(harness.revalidatedTags.length, 0, 'Validation failure must not call revalidateTag');

  // 2. FAILED createCategoryAction (duplicate slug) -> must NOT invalidate cache
  const failDuplicate = await harness.categoriesModule.createCategoryAction({ name: 'Rings', slug: 'rings' });
  assert.equal(failDuplicate.success, false);
  assert.equal(harness.revalidatedTags.length, 0, 'Slug collision failure must not call revalidateTag');

  // 3. FAILED createCategoryAction (DB insert error) -> must NOT invalidate cache
  nextAdminInsertError = { message: 'DB write failed' };
  const failDbInsert = await harness.categoriesModule.createCategoryAction({ name: 'Anklet', slug: 'anklet' });
  nextAdminInsertError = null;
  assert.equal(failDbInsert.success, false);
  assert.equal(harness.revalidatedTags.length, 0, 'DB insert failure must not call revalidateTag');

  // Verify cache is still warm after failed mutations
  harness.newRequest();
  await harness.publicModule.getPublicCategories();
  assert.equal(publicQueryCount, 1, 'Cache must remain warm when admin mutations fail');

  // 4. SUCCESSFUL createCategoryAction -> MUST invalidate cache and expose new category immediately
  const createRes = await harness.categoriesModule.createCategoryAction({
    name: 'Anklet',
    slug: 'anklet',
    displayOrder: 2,
    isActive: true,
  });
  assert.equal(createRes.success, true);
  assert.equal(harness.revalidatedTags.length, 1);
  assert.equal(harness.revalidatedTags[0], 'public-categories');

  harness.newRequest();
  const afterCreate = await harness.publicModule.getPublicCategories();
  assert.equal(publicQueryCount, 2, 'Storefront must re-query immediately after admin category creation');
  assert.equal(afterCreate.length, 2);
  assert.equal(afterCreate[1].slug, 'anklet');

  // 5. FAILED updateCategoryAction -> must NOT invalidate cache
  nextAdminUpdateError = { message: 'Update failed' };
  const failUpdate = await harness.categoriesModule.updateCategoryAction('cat-2', { name: 'Luxury Anklets', slug: 'anklet' });
  nextAdminUpdateError = null;
  assert.equal(failUpdate.success, false);
  assert.equal(harness.revalidatedTags.length, 1);

  // 6. SUCCESSFUL updateCategoryAction -> MUST invalidate cache
  const updateRes = await harness.categoriesModule.updateCategoryAction('cat-2', {
    name: 'Luxury Anklets',
    slug: 'anklet',
    displayOrder: 2,
    isActive: true,
  });
  assert.equal(updateRes.success, true);
  assert.equal(harness.revalidatedTags.length, 2);

  harness.newRequest();
  const afterUpdate = await harness.publicModule.getPublicCategories();
  assert.equal(publicQueryCount, 3);
  assert.equal(afterUpdate[1].name, 'Luxury Anklets');

  // 7. FAILED toggleCategoryActiveAction -> must NOT invalidate cache
  nextAdminToggleError = { message: 'Toggle error' };
  const failToggle = await harness.categoriesModule.toggleCategoryActiveAction('cat-2', false);
  nextAdminToggleError = null;
  assert.equal(failToggle.success, false);
  assert.equal(harness.revalidatedTags.length, 2);

  // 8. SUCCESSFUL toggleCategoryActiveAction (deactivate 'anklet') -> MUST invalidate cache
  const toggleRes = await harness.categoriesModule.toggleCategoryActiveAction('cat-2', false);
  assert.equal(toggleRes.success, true);
  assert.equal(harness.revalidatedTags.length, 3);

  harness.newRequest();
  const afterToggle = await harness.publicModule.getPublicCategories();
  assert.equal(publicQueryCount, 4);
  assert.equal(afterToggle.length, 1, 'Deactivated category must immediately disappear from public categories');

  // 9. FAILED deleteCategoryAction (dependent products > 0) -> must NOT invalidate cache
  dependentProductsCount = 3;
  const failDeleteDeps = await harness.categoriesModule.deleteCategoryAction('cat-2');
  dependentProductsCount = 0;
  assert.equal(failDeleteDeps.success, false);
  assert.equal(harness.revalidatedTags.length, 3, 'Blocked category deletion must not invalidate cache');

  // 10. SUCCESSFUL deleteCategoryAction -> MUST invalidate cache
  const deleteRes = await harness.categoriesModule.deleteCategoryAction('cat-2');
  assert.equal(deleteRes.success, true);
  assert.equal(harness.revalidatedTags.length, 4);
});

// =============================================================================
// 5 & 6. MISSING SUPABASE CONFIG & DB ERRORS DO NOT POISON CACHE
// =============================================================================

test('Task 5 & 6 (Behavioral): Missing Supabase config returns DEFAULT_STORE_CATEGORIES without poisoning cache, and DB errors throw without caching empty/fallback data', async () => {
  let isSupabaseConfigured = false;
  let shouldReturnDbError = false;
  let dbCalls = 0;

  const mockClient = {
    from() {
      dbCalls++;
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              order: async () => {
                if (shouldReturnDbError) {
                  return {
                    data: null,
                    error: { message: 'Connection reset by peer', code: '08006', details: 'Network drop' },
                  };
                }
                return {
                  data: [
                    { id: 'live-1', name: 'Bespoke Chokers', slug: 'chokers', description: 'Live DB', image_url: null, display_order: 1, is_active: true, created_at: '2026-01-01T00:00:00Z' },
                  ],
                  error: null,
                };
              },
            }),
          }),
        }),
      };
    },
  };

  const harness = createCatalogTestHarness({
    getPublicSupabaseClient: () => (isSupabaseConfigured ? mockClient : null),
  });

  // 1. Unconfigured Supabase returns DEFAULT_STORE_CATEGORIES and writes 0 entries to shared cache
  const unconfiguredResult = await harness.publicModule.getPublicCategories();
  assert.equal(unconfiguredResult.length, DEFAULT_STORE_CATEGORIES.length);
  assert.equal(unconfiguredResult[0].slug, DEFAULT_STORE_CATEGORIES[0].slug);
  assert.equal(harness.getNextDataCacheSize(), 0, 'Fallback categories must NEVER be persisted in shared cache');
  assert.equal(dbCalls, 0);

  // 2. Supabase becomes configured, but experiences a transient DB error -> must throw and NOT cache
  isSupabaseConfigured = true;
  shouldReturnDbError = true;
  harness.newRequest();

  await assert.rejects(
    async () => {
      await harness.publicModule.getPublicCategories();
    },
    (err: any) => {
      assert.match(err.message, /Database error querying categories: Connection reset by peer/);
      assert.equal(err.code, '08006');
      return true;
    }
  );
  assert.equal(harness.getNextDataCacheSize(), 0, 'Database error must NEVER be cached in shared cache');
  assert.equal(dbCalls, 1);

  // 3. Next request succeeds -> fetches live DB categories cleanly (proving neither fallback nor error poisoned cache)
  shouldReturnDbError = false;
  harness.newRequest();
  const liveResult = await harness.publicModule.getPublicCategories();
  assert.equal(dbCalls, 2);
  assert.equal(liveResult.length, 1);
  assert.equal(liveResult[0].slug, 'chokers');
  assert.equal(harness.getNextDataCacheSize(), 1);
});

// =============================================================================
// 7, 8, 9 & 10. ORDERING, INACTIVE HIDING, SLUG FALLBACKS & PRODUCT FILTERING
// =============================================================================

test('Task 7, 8, 9 & 10 (Behavioral): Reusing cached categories in getPublicCategoryBySlug and getPublicProducts eliminates duplicate queries while preserving ordering, inactive hiding, fallback slugs, and product filtering', async () => {
  let categoryTableQueries = 0;
  let productTableQueries = 0;
  let lastFilteredCategoryId: string | null = null;

  const mockSupabase = {
    from(table: string) {
      if (table === 'categories') {
        categoryTableQueries++;
        return {
          select: () => ({
            eq: () => ({
              order: (col1: string, opt1: any) => {
                assert.equal(col1, 'display_order');
                assert.equal(opt1.ascending, true);
                return {
                  order: async (col2: string, opt2: any) => {
                    assert.equal(col2, 'name');
                    assert.equal(opt2.ascending, true);
                    return {
                      data: [
                        { id: 'cat-anklet', name: 'Anklets', slug: 'anklet', description: 'Gold anklets', image_url: null, display_order: 1, is_active: true, created_at: '2026-01-01T00:00:00Z' },
                        { id: 'cat-rings', name: 'Artisan Rings', slug: 'rings', description: 'DB Rings', image_url: null, display_order: 2, is_active: true, created_at: '2026-01-01T00:00:00Z' },
                        { id: 'cat-dup', name: 'Duplicate Rings', slug: 'RINGS ', description: 'Dup', image_url: null, display_order: 3, is_active: true, created_at: '2026-01-01T00:00:00Z' },
                        { id: 'cat-inactive', name: 'Hidden Brooches', slug: 'brooches', description: 'Inactive', image_url: null, display_order: 0, is_active: false, created_at: '2026-01-01T00:00:00Z' },
                      ],
                      error: null,
                    };
                  },
                };
              },
            }),
          }),
        };
      }

      if (table === 'products') {
        productTableQueries++;
        const queryBuilder: any = {
          select: () => queryBuilder,
          eq: (col: string, val: any) => {
            if (col === 'category_id') {
              lastFilteredCategoryId = val;
            }
            return queryBuilder;
          },
          order: () => queryBuilder,
          range: async () => ({
            data: [
              {
                id: 'prod-anklet-1',
                name: 'Royal Gold Anklet',
                slug: 'royal-gold-anklet',
                product_code: 'ANK-01',
                short_description: '22k style anklet',
                description: 'Detailed description',
                material: 'Gold',
                gender: 'women',
                category_id: lastFilteredCategoryId,
                is_featured: true,
                is_new_arrival: true,
                is_best_seller: false,
                is_active: true,
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
                categories: { id: 'cat-anklet', name: 'Anklets', slug: 'anklet' },
                product_images: [],
                product_variants: [
                  {
                    id: 'var-1',
                    product_id: 'prod-anklet-1',
                    sku: 'ANK-01-STD',
                    title: 'Standard',
                    attributes: {},
                    price: 4500,
                    discount_price: null,
                    stock_status: 'in_stock',
                    is_active: true,
                    created_at: '2026-01-01T00:00:00Z',
                    updated_at: '2026-01-01T00:00:00Z',
                  },
                ],
              },
            ],
            count: 1,
            error: null,
          }),
        };
        return queryBuilder;
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  const harness = createCatalogTestHarness({
    getPublicSupabaseClient: () => mockSupabase,
  });

  // Simulate full /category/anklet page render:
  // 1) StoreLayout -> getPublicCategories()
  // 2) generateMetadata -> getPublicCategoryBySlug('anklet')
  // 3) CategoryPage -> Promise.all([getPublicCategoryBySlug('anklet'), getPublicCategories(), getPublicProducts({ categorySlug: 'anklet' })])
  const layoutCategories = await harness.publicModule.getPublicCategories();
  const metaCategory = await harness.publicModule.getPublicCategoryBySlug('anklet');
  const [pageCategory, pageCategories, productsRes] = await Promise.all([
    harness.publicModule.getPublicCategoryBySlug('anklet'),
    harness.publicModule.getPublicCategories(),
    harness.publicModule.getPublicProducts({ categorySlug: 'anklet' }),
  ]);

  // Verify ONLY 1 query was issued to `categories` across the entire route (down from 3!)
  assert.equal(categoryTableQueries, 1, 'Entire /category/[slug] render must issue only 1 categories query on cold cache');
  assert.equal(productTableQueries, 1, 'getPublicProducts must query products once without a category lookup waterfall');
  assert.equal(lastFilteredCategoryId, 'cat-anklet');
  assert.equal(productsRes.products.length, 1);
  assert.equal(productsRes.products[0].slug, 'royal-gold-anklet');

  // Verify ordering and inactive filtering
  assert.equal(layoutCategories.length, 2, 'Inactive and duplicate-slug categories must be excluded');
  assert.equal(layoutCategories[0].slug, 'anklet');
  assert.equal(layoutCategories[1].slug, 'rings');
  assert.equal(layoutCategories[1].name, 'Artisan Rings', 'First active slug wins deduplication');
  assert.equal(metaCategory?.id, 'cat-anklet');
  assert.equal(pageCategory?.id, 'cat-anklet');
  assert.equal(pageCategories.length, 2);

  // Verify recognized curated fallback slug ('necklaces' is not in mock DB, but is a recognized fallback slug)
  const fallbackNecklaces = await harness.publicModule.getPublicCategoryBySlug('necklaces');
  assert.ok(fallbackNecklaces, 'Recognized curated slug not in DB must return fallback metadata');
  assert.equal(fallbackNecklaces?.slug, 'necklaces');

  // Verify inactive non-fallback category ('brooches') returns null in getPublicCategoryBySlug and empty products in getPublicProducts
  const inactiveCategory = await harness.publicModule.getPublicCategoryBySlug('brooches');
  assert.equal(inactiveCategory, null, 'Inactive category must return null');
  const inactiveProducts = await harness.publicModule.getPublicProducts({ categorySlug: 'brooches' });
  assert.equal(inactiveProducts.products.length, 0);
  assert.equal(inactiveProducts.total, 0);
  assert.equal(productTableQueries, 1, 'Inactive category filter must short-circuit without querying products table');

  // Verify unknown / nonexistent slug returns null and empty products
  const missingCategory = await harness.publicModule.getPublicCategoryBySlug('nonexistent-gems');
  assert.equal(missingCategory, null, 'Unknown category slug must return null');
  const missingProducts = await harness.publicModule.getPublicProducts({ categorySlug: 'nonexistent-gems' });
  assert.equal(missingProducts.products.length, 0);
  assert.equal(categoryTableQueries, 1, 'All subsequent slug and product filter lookups must reuse the cached category list');
});

// =============================================================================
// 11 & 12. CUSTOM-CLIENT COMPATIBILITY, DIRECT IMPORTS & STAGE 1A / 1B-A INTACT
// =============================================================================

test('Task 11 & 12 (Behavioral & Static): Custom-client injection works deterministically, storefront pages import directly from lib/catalog/public, and Stage 1A + 1B-A optimizations remain intact', async () => {
  const harness = createCatalogTestHarness({
    getPublicSupabaseClient: () => null,
  });

  // Custom client passed to getPublicCategories(customClient)
  const customCategoriesClient = {
    __mockClientId: 'custom-cat-client',
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            order: async () => ({
              data: [
                { id: 'cust-1', name: 'Custom Pendants', slug: 'pendants', description: 'Custom', image_url: null, display_order: 1, is_active: true, created_at: '2026-01-01T00:00:00Z' },
              ],
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  const customCats = await harness.publicModule.getPublicCategories(customCategoriesClient);
  assert.equal(customCats.length, 1);
  assert.equal(customCats[0].slug, 'pendants');
  assert.equal(harness.getNextDataCacheSize(), 0, 'Custom test client must never write to shared Data Cache');

  // Custom client passed to getPublicCategoryBySlug(slug, customClient)
  const customSlugClient = {
    __mockClientId: 'custom-slug-client',
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'cust-ring',
                name: 'Custom Ring DB',
                slug: 'rings',
                description: 'Custom desc',
                image_url: null,
                display_order: 1,
                is_active: true,
                created_at: '2026-01-01T00:00:00Z',
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  const customSlugResult = await harness.publicModule.getPublicCategoryBySlug('rings', customSlugClient);
  assert.equal(customSlugResult?.id, 'cust-ring');
  assert.equal(customSlugResult?.name, 'Custom Ring DB');

  // Verify direct imports in shop, category, and search pages (Task 4)
  const publicSource = readSource('lib/catalog/public.ts');
  const categoriesSource = readSource('lib/catalog/categories.ts');
  assert.doesNotMatch(
    publicSource,
    /publicCategoriesMemoryCache|publicCategoriesInFlight|clearPublicCategoriesMemoryCache/,
    'No process-global category cache snapshot or in-flight coalescer may remain in lib/catalog/public.ts'
  );
  assert.doesNotMatch(
    categoriesSource,
    /clearPublicCategoriesMemoryCache/,
    'lib/catalog/categories.ts must only use Next.js revalidateTag/revalidatePath without process-level cache helpers'
  );

  const shopPage = readSource('app/(store)/shop/page.tsx');
  const categoryPage = readSource('app/(store)/category/[slug]/page.tsx');
  const searchPage = readSource('app/(store)/search/page.tsx');

  for (const [name, content] of [
    ['shop/page.tsx', shopPage],
    ['category/[slug]/page.tsx', categoryPage],
    ['search/page.tsx', searchPage],
  ] as const) {
    assert.doesNotMatch(
      content,
      /from\s+['"]@\/lib\/catalog\/categories['"]/,
      `${name} must import getPublicCategories directly from @/lib/catalog/public, not @/lib/catalog/categories`
    );
    assert.match(
      content,
      /import\s+\{[^}]*getPublicCategories[^}]*\}\s+from\s+['"]@\/lib\/catalog\/public['"]/,
      `${name} must import getPublicCategories from @/lib/catalog/public`
    );
  }

  // Verify Stage 1A & Stage 1B-A optimizations remain intact
  const wishlistActions = readSource('lib/wishlist/actions.ts');
  assert.match(wishlistActions, /wishlists!inner\s*\(\s*user_id\s*\)/, 'Stage 1A single-query wishlist join must remain intact');

  const accountLayout = readSource('app/(store)/account/layout.tsx');
  assert.doesNotMatch(accountLayout, /AccountNav/, 'Clean account layout without duplicate nav must remain intact');

  const headerSource = readSource('components/store/header.tsx');
  assert.match(headerSource, /applyInitialSession/, 'Stage 1B-A header initial session deduplication must remain intact');
  assert.match(headerSource, /prefetch=\{false\}/, 'Stage 1B-A private link prefetch={false} must remain intact');

  const cartContextSource = readSource('lib/cart/cart-context.tsx');
  assert.match(cartContextSource, /CART_FOCUS_THROTTLE_MS\s*=\s*30_000/, 'Stage 1B-A 30s cart focus throttle must remain intact');
  assert.match(cartContextSource, /areCartItemsEqual/, 'Stage 1B-A cart equality guard must remain intact');
});
