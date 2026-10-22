import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import nextConfig from '../next.config.ts';
import { exportShippingOrdersToExcel } from '../lib/shipping/excel-export.ts';

const WORKSPACE_DIR = process.cwd();

function readSource(relPath: string): string {
  return readFileSync(join(WORKSPACE_DIR, relPath), 'utf-8');
}

function collectNftFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectNftFiles(full, acc);
    } else if (entry.endsWith('.nft.json')) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Converts a Next.js matcher pattern (e.g. '/', '/account/:path*', '/admin/:path*')
 * into an equivalent RegExp to behaviorally test route matching.
 */
function compileNextMatcher(pattern: string): RegExp {
  if (pattern === '/') {
    return /^\/$/;
  }
  if (pattern.endsWith('/:path*')) {
    const base = pattern.slice(0, -'/:path*'.length).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${base}(?:\\/.*)?$`);
  }
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`);
}

function matchesMiddlewareConfig(pathname: string, matchers: string[]): boolean {
  return matchers.some((m) => compileNextMatcher(m).test(pathname));
}

/**
 * Compiles and loads the real `middleware.ts`, `lib/supabase/middleware.ts`,
 * `lib/auth/redirect.ts`, and `app/auth/callback/route.ts` in a behavioral VM harness.
 */
function createMiddlewareAndAuthHarness(options?: {
  user?: { id: string; email?: string } | null;
  adminRecord?: { id: string; is_active: boolean } | null;
  exchangeError?: { message: string } | null;
  verifyError?: { message: string } | null;
}) {
  let getUserCalls = 0;
  let adminQueryCalls = 0;
  let exchangeCodeCalls: string[] = [];
  let verifyOtpCalls: Array<{ token_hash: string; type: string }> = [];

  const redirectTs = readSource('lib/auth/redirect.ts');
  const supabaseMiddlewareTs = readSource('lib/supabase/middleware.ts');
  const middlewareTs = readSource('middleware.ts');
  const authCallbackTs = readSource('app/auth/callback/route.ts');

  const transpile = (code: string, filename: string) =>
    ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: filename,
    }).outputText;

  class MockNextResponse {
    type: 'next' | 'redirect';
    redirectUrl?: string;
    private cookieStore: Map<string, { name: string; value: string; options?: any }>;
    cookies: {
      set: (name: string, value: string, options?: any) => void;
      get: (name: string) => { name: string; value: string; options?: any } | undefined;
    };

    constructor(type: 'next' | 'redirect', redirectUrl?: URL | string) {
      this.type = type;
      this.redirectUrl = redirectUrl ? String(redirectUrl) : undefined;
      this.cookieStore = new Map();
      this.cookies = {
        set: (name: string, value: string, options?: any) => {
          this.cookieStore.set(name, { name, value, options });
        },
        get: (name: string) => this.cookieStore.get(name),
      };
    }

    static next(_init?: any) {
      return new MockNextResponse('next');
    }

    static redirect(url: URL | string) {
      return new MockNextResponse('redirect', url);
    }
  }

  const redirectExports: Record<string, any> = {};
  const supabaseMwExports: Record<string, any> = {};
  const mwExports: Record<string, any> = {};
  const callbackExports: Record<string, any> = {};

  const customRequire = (id: string) => {
    if (id === 'next/server') {
      return { NextResponse: MockNextResponse };
    }
    if (id === '@supabase/ssr') {
      return {
        createServerClient: (_url: string, _key: string, clientOpts: any) => {
          return {
            auth: {
              getUser: async () => {
                getUserCalls++;
                // Simulate cookie refresh on authenticated user
                if (options?.user && clientOpts?.cookies?.setAll) {
                  clientOpts.cookies.setAll([
                    { name: 'sb-access-token', value: 'refreshed-jwt-token', options: { path: '/' } },
                  ]);
                }
                return { data: { user: options?.user ?? null }, error: null };
              },
              exchangeCodeForSession: async (code: string) => {
                exchangeCodeCalls.push(code);
                if (!options?.exchangeError && clientOpts?.cookies?.setAll) {
                  clientOpts.cookies.setAll([
                    { name: 'sb-auth-token', value: `session-for-${code}`, options: { path: '/' } },
                  ]);
                }
                return { error: options?.exchangeError ?? null };
              },
              verifyOtp: async (params: { token_hash: string; type: string }) => {
                verifyOtpCalls.push(params);
                if (!options?.verifyError && clientOpts?.cookies?.setAll) {
                  clientOpts.cookies.setAll([
                    { name: 'sb-otp-token', value: `otp-for-${params.token_hash}`, options: { path: '/' } },
                  ]);
                }
                return { error: options?.verifyError ?? null };
              },
            },
            from: (table: string) => {
              assert.equal(table, 'admin_users');
              adminQueryCalls++;
              return {
                select: () => ({
                  eq: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({
                        data: options?.adminRecord ?? null,
                        error: null,
                      }),
                    }),
                  }),
                }),
              };
            },
          };
        },
      };
    }
    if (id === '@/lib/auth/redirect') return redirectExports;
    if (id === '@/lib/supabase/middleware') return supabaseMwExports;
    throw new Error(`Unexpected require("${id}") in middleware test harness`);
  };

  const evalModule = (jsCode: string, exportsObj: Record<string, any>, filename: string) => {
    const moduleObj = { exports: exportsObj };
    const sandbox = {
      module: moduleObj,
      exports: exportsObj,
      require: customRequire,
      process: {
        env: {
          NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
          NEXT_PUBLIC_SITE_URL: 'https://splender-jewel.vercel.app',
        },
      },
      URL,
      URLSearchParams,
      console: { error: () => {}, warn: () => {}, log: () => {} },
    };
    vm.runInNewContext(jsCode, sandbox, { filename });
    return moduleObj.exports;
  };

  evalModule(transpile(redirectTs, 'redirect.ts'), redirectExports, 'redirect.ts');
  evalModule(transpile(supabaseMiddlewareTs, 'supabase-middleware.ts'), supabaseMwExports, 'supabase-middleware.ts');
  evalModule(transpile(middlewareTs, 'middleware.ts'), mwExports, 'middleware.ts');
  evalModule(transpile(authCallbackTs, 'callback-route.ts'), callbackExports, 'callback-route.ts');

  function createMockRequest(urlStr: string, headersInit?: Record<string, string>) {
    const parsedUrl = new URL(urlStr, 'https://splender-jewel.vercel.app');
    const cookieJar = new Map<string, string>();
    const headerMap = new Map<string, string>();
    if (headersInit) {
      for (const [k, v] of Object.entries(headersInit)) {
        headerMap.set(k.toLowerCase(), v);
      }
    }
    return {
      url: parsedUrl.toString(),
      nextUrl: parsedUrl,
      headers: {
        has: (name: string) => headerMap.has(name.toLowerCase()),
        get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
      },
      cookies: {
        getAll: () => Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value })),
        set: (name: string, value: string) => cookieJar.set(name, value),
      },
    };
  }

  return {
    middleware: mwExports.middleware as (req: any) => Promise<InstanceType<typeof MockNextResponse>>,
    middlewareConfig: mwExports.config as { matcher: string[] },
    authCallbackGET: callbackExports.GET as (req: any) => Promise<InstanceType<typeof MockNextResponse>>,
    createMockRequest,
    getStats: () => ({
      getUserCalls,
      adminQueryCalls,
      exchangeCodeCalls,
      verifyOtpCalls,
    }),
  };
}

// =============================================================================
// 1 & 2. ROUTE-SPECIFIC FILE TRACING & ABSENCE OF GLOBAL XLSX TRACING
// =============================================================================

test('Task 1 & 2: next.config.ts scopes outputFileTracingIncludes strictly to /admin/print-labels and removes global /** tracing', () => {
  const tracingIncludes = (nextConfig as any).outputFileTracingIncludes;
  assert.ok(tracingIncludes, 'outputFileTracingIncludes must be configured in next.config.ts');

  const keys = Object.keys(tracingIncludes);
  assert.deepEqual(
    keys,
    ['/admin/print-labels'],
    'outputFileTracingIncludes must contain only /admin/print-labels and must NOT include /**'
  );
  assert.equal(
    tracingIncludes['/**'],
    undefined,
    'Global /** tracing rule must be completely removed'
  );
  assert.deepEqual(tracingIncludes['/admin/print-labels'], ['./lib/shipping/templates/**/*']);

  // Verify both official Sri Lanka Post templates remain untouched on disk
  const btTemplate = join(WORKSPACE_DIR, 'lib/shipping/templates/upload_format_new (3).xlsx');
  const codTemplate = join(
    WORKSPACE_DIR,
    'lib/shipping/templates/COD_PostOffice_Upload_Format_New_2023-03-20 (29).xlsx'
  );
  assert.ok(existsSync(btTemplate), 'Bank Transfer XLSX template must exist on disk');
  assert.ok(existsSync(codTemplate), 'COD XLSX template must exist on disk');
  assert.equal(statSync(btTemplate).size, 8977, 'Bank Transfer XLSX template size must remain intact');
  assert.equal(statSync(codTemplate).size, 896507, 'COD XLSX template size must remain intact');
});

// =============================================================================
// 3. ACTUAL BUILD TRACE (.nft.json) CONTENTS VERIFICATION
// =============================================================================

test('Task 3: Built .nft.json manifests include XLSX templates in /admin/print-labels and exclude them from all 53 unrelated customer and admin routes', () => {
  const appServerDir = join(WORKSPACE_DIR, '.next/server/app');
  assert.ok(existsSync(appServerDir), '.next/server/app build output must exist');

  const nftFiles = collectNftFiles(appServerDir);
  assert.ok(nftFiles.length >= 50, `Expected at least 50 route .nft.json files, found ${nftFiles.length}`);

  const printLabelsNftPath = join(appServerDir, 'admin', 'print-labels', 'page.js.nft.json');
  assert.ok(existsSync(printLabelsNftPath), '/admin/print-labels/page.js.nft.json must exist');

  const printLabelsNft = JSON.parse(readFileSync(printLabelsNftPath, 'utf-8'));
  const printLabelsTemplates = Array.from(
    new Set(
      (printLabelsNft.files as string[])
        .map((f) => f.replace(/\\/g, '/'))
        .filter((f) => f.includes('shipping/templates') || f.endsWith('.xlsx'))
    )
  );

  assert.equal(
    printLabelsTemplates.length,
    2,
    '/admin/print-labels/page.js.nft.json must include both unique XLSX templates'
  );
  assert.ok(
    printLabelsTemplates.some((f) => f.includes('upload_format_new (3).xlsx')),
    '/admin/print-labels trace must include Bank Transfer XLSX template'
  );
  assert.ok(
    printLabelsTemplates.some((f) => f.includes('COD_PostOffice_Upload_Format_New_2023-03-20 (29).xlsx')),
    '/admin/print-labels trace must include COD XLSX template'
  );

  // Verify all other route .nft.json files (customer storefront routes & other admin routes) have 0 XLSX templates
  const unrelatedRoutesWithTemplates: string[] = [];
  for (const nftFile of nftFiles) {
    if (nftFile === printLabelsNftPath) continue;
    const data = JSON.parse(readFileSync(nftFile, 'utf-8'));
    const leaked = (data.files as string[]).filter(
      (f) => f.includes('shipping/templates') || f.includes('shipping\\templates') || f.endsWith('.xlsx')
    );
    if (leaked.length > 0) {
      unrelatedRoutesWithTemplates.push(relative(appServerDir, nftFile));
    }
  }

  assert.deepEqual(
    unrelatedRoutesWithTemplates,
    [],
    `Unrelated customer and admin routes must have 0 traced XLSX templates, but found in: ${unrelatedRoutesWithTemplates.join(', ')}`
  );
});

// =============================================================================
// 4, 5, 6, 7, 8 & 9. MIDDLEWARE MATCHER, ROUTE PROTECTION & AUTH CALLBACKS
// =============================================================================

test('Task 4, 5, 6, 7 & 8 (Behavioral): Middleware matcher covers /, /account/:path*, and /admin/:path*, bypasses public catalog routes, and enforces root recovery redirect, customer auth, and admin RBAC', async () => {
  const { middlewareConfig } = createMiddlewareAndAuthHarness();
  const matchers = Array.from(middlewareConfig.matcher);
  assert.deepEqual(matchers, ['/', '/account/:path*', '/admin/:path*']);

  // Verify matcher matches /, /account/*, and /admin/*
  for (const protectedPath of [
    '/',
    '/account',
    '/account/orders',
    '/account/orders/ord-123',
    '/account/wishlist',
    '/account/addresses',
    '/account/profile',
    '/account/reviews',
    '/admin',
    '/admin/login',
    '/admin/dashboard',
    '/admin/orders',
    '/admin/print-labels',
    '/admin/settings/store',
  ]) {
    assert.equal(
      matchesMiddlewareConfig(protectedPath, matchers),
      true,
      `Expected middleware matcher to match ${protectedPath}`
    );
  }

  // Verify public storefront & callback routes bypass middleware completely
  for (const publicPath of [
    '/shop',
    '/category/ankelt',
    '/category/rings',
    '/products/test-anklet-phase-6c',
    '/search',
    '/cart',
    '/checkout',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/about',
    '/contact',
    '/faq',
    '/privacy',
    '/terms',
    '/returns',
    '/auth/callback',
    '/order-confirmation/SJ-20261022-0001',
  ]) {
    assert.equal(
      matchesMiddlewareConfig(publicPath, matchers),
      false,
      `Expected public route ${publicPath} to bypass middleware invocation`
    );
  }

  // Behavioral Test A: Root password recovery redirect (`/?code=pkce-123&type=recovery`)
  const guestHarness = createMiddlewareAndAuthHarness({ user: null });
  const rootRecoveryRes = await guestHarness.middleware(
    guestHarness.createMockRequest('https://splender-jewel.vercel.app/?code=pkce-123&type=recovery')
  );
  assert.equal(rootRecoveryRes.type, 'redirect');
  assert.equal(
    rootRecoveryRes.redirectUrl,
    'https://splender-jewel.vercel.app/auth/callback?code=pkce-123&type=recovery&next=%2Freset-password'
  );
  assert.equal(guestHarness.getStats().getUserCalls, 0, 'Root redirect must not call supabase.auth.getUser()');

  // Behavioral Test B: Normal root homepage request (`/`) passes through with 0 auth network calls
  const rootNormalRes = await guestHarness.middleware(
    guestHarness.createMockRequest('https://splender-jewel.vercel.app/')
  );
  assert.equal(rootNormalRes.type, 'next');
  assert.equal(guestHarness.getStats().getUserCalls, 0, 'Public homepage / must not call supabase.auth.getUser()');

  // Behavioral Test C: Unauthenticated customer visiting /account/orders redirects to /login?redirectTo=/account/orders
  const unauthAccountRes = await guestHarness.middleware(
    guestHarness.createMockRequest('https://splender-jewel.vercel.app/account/orders')
  );
  assert.equal(unauthAccountRes.type, 'redirect');
  assert.equal(
    unauthAccountRes.redirectUrl,
    'https://splender-jewel.vercel.app/login?redirectTo=%2Faccount%2Forders'
  );

  // Behavioral Test D: Authenticated customer visiting /account/wishlist succeeds and refreshes session cookies
  const customerHarness = createMiddlewareAndAuthHarness({
    user: { id: 'cust-1', email: 'customer@example.com' },
    adminRecord: null,
  });
  const authCustomerRes = await customerHarness.middleware(
    customerHarness.createMockRequest('https://splender-jewel.vercel.app/account/wishlist')
  );
  assert.equal(authCustomerRes.type, 'next');
  assert.equal(authCustomerRes.cookies.get('sb-access-token')?.value, 'refreshed-jwt-token');

  // Behavioral Test E: Non-admin customer visiting /admin/print-labels redirects to /admin/login?error=unauthorized
  const nonAdminRes = await customerHarness.middleware(
    customerHarness.createMockRequest('https://splender-jewel.vercel.app/admin/print-labels')
  );
  assert.equal(nonAdminRes.type, 'redirect');
  assert.equal(
    nonAdminRes.redirectUrl,
    'https://splender-jewel.vercel.app/admin/login?error=unauthorized'
  );

  // Behavioral Test F: Active admin visiting /admin/print-labels succeeds
  const adminHarness = createMiddlewareAndAuthHarness({
    user: { id: 'admin-1', email: 'admin@splender.lk' },
    adminRecord: { id: 'admin-1', is_active: true },
  });
  const activeAdminRes = await adminHarness.middleware(
    adminHarness.createMockRequest('https://splender-jewel.vercel.app/admin/print-labels')
  );
  assert.equal(activeAdminRes.type, 'next');
  assert.equal(activeAdminRes.cookies.get('sb-access-token')?.value, 'refreshed-jwt-token');

  // Behavioral Test G: /admin/login remains publicly accessible without redirect or auth check
  const adminLoginRes = await guestHarness.middleware(
    guestHarness.createMockRequest('https://splender-jewel.vercel.app/admin/login')
  );
  assert.equal(adminLoginRes.type, 'next');
});

test('Task 9 (Behavioral): /auth/callback route handler exchanges PKCE codes, verifies OTP hashes, sets session cookies on redirect, and routes recovery errors safely without middleware dependency', async () => {
  const harness = createMiddlewareAndAuthHarness();

  // 1. PKCE recovery code exchange -> redirects to /reset-password with session cookie attached
  const pkceRes = await harness.authCallbackGET(
    harness.createMockRequest(
      'https://splender-jewel.vercel.app/auth/callback?code=pkce-xyz&type=recovery&next=/reset-password'
    )
  );
  assert.equal(pkceRes.type, 'redirect');
  assert.equal(pkceRes.redirectUrl, 'https://splender-jewel.vercel.app/reset-password');
  assert.equal(pkceRes.cookies.get('sb-auth-token')?.value, 'session-for-pkce-xyz');
  assert.deepEqual(harness.getStats().exchangeCodeCalls, ['pkce-xyz']);

  // 2. OTP token_hash verification -> redirects to /account with session cookie attached
  const otpRes = await harness.authCallbackGET(
    harness.createMockRequest(
      'https://splender-jewel.vercel.app/auth/callback?token_hash=hash-999&type=signup'
    )
  );
  assert.equal(otpRes.type, 'redirect');
  assert.equal(otpRes.redirectUrl, 'https://splender-jewel.vercel.app/account');
  assert.equal(otpRes.cookies.get('sb-otp-token')?.value, 'otp-for-hash-999');

  // 3. Expired recovery link -> redirects to /reset-password?error=otp_expired
  const expiredHarness = createMiddlewareAndAuthHarness({
    exchangeError: { message: 'Flow state has expired' },
  });
  const expiredRes = await expiredHarness.authCallbackGET(
    expiredHarness.createMockRequest(
      'https://splender-jewel.vercel.app/auth/callback?code=old-code&type=recovery'
    )
  );
  assert.equal(expiredRes.type, 'redirect');
  assert.equal(
    expiredRes.redirectUrl,
    'https://splender-jewel.vercel.app/reset-password?error=otp_expired'
  );
});

// =============================================================================
// 10. SHIPPING EXPORTS & STAGE 1A / 1B-A / 1B-B OPTIMIZATIONS INTACT
// =============================================================================

test('Task 4 & 10 (Behavioral & Static): Bank Transfer and COD Excel exports generate valid workbooks and Stage 1A, 1B-A, and 1B-B optimizations remain intact', async () => {
  const sampleOrders: any[] = [
    {
      id: 'ord-bt-1',
      order_number: 'SJ-20261022-0001',
      customer_name: 'Nimali Perera',
      email: 'nimali@example.com',
      phone1: '0771234567',
      phone2: null,
      address_line: '45 Temple Road',
      city: 'Negombo',
      district: 'Gampaha',
      province: 'Western',
      postal_code: '11500',
      total_amount: 6500,
      payment_method: 'bank_transfer',
      payment_status: 'approved',
      order_status: 'confirmed',
      created_at: '2026-10-22T06:00:00Z',
      updated_at: '2026-10-22T06:00:00Z',
      confirmation_date: '2026-10-22T06:00:00Z',
      validation: { isValid: true, missingFields: [] },
    },
    {
      id: 'ord-cod-1',
      order_number: 'SJ-20261022-0002',
      customer_name: 'Kasun Silva',
      email: 'kasun@example.com',
      phone1: '0719876543',
      phone2: '0112345678',
      address_line: '12 Galle Road',
      city: 'Colombo 03',
      district: 'Colombo',
      province: 'Western',
      postal_code: '00300',
      total_amount: 8200,
      payment_method: 'cod',
      payment_status: 'pending',
      order_status: 'confirmed',
      created_at: '2026-10-22T07:00:00Z',
      updated_at: '2026-10-22T07:00:00Z',
      confirmation_date: '2026-10-22T07:00:00Z',
      validation: { isValid: true, missingFields: [] },
    },
  ];

  const btExport = await exportShippingOrdersToExcel(sampleOrders, 'bank_transfer');
  assert.equal(btExport.success, true, 'Bank Transfer Excel export must succeed');
  assert.equal(btExport.rowCount, 1);
  assert.ok(btExport.base64 && btExport.base64.length > 1000);

  const codExport = await exportShippingOrdersToExcel(sampleOrders, 'cod');
  assert.equal(codExport.success, true, 'COD Excel export must succeed');
  assert.equal(codExport.rowCount, 1);
  assert.ok(codExport.base64 && codExport.base64.length > 10000);

  // Verify Stage 1A, 1B-A, and 1B-B optimizations remain intact
  const wishlistActions = readSource('lib/wishlist/actions.ts');
  assert.match(wishlistActions, /wishlists!inner\s*\(\s*user_id\s*\)/, 'Stage 1A single-query wishlist read must remain intact');

  const headerSource = readSource('components/store/header.tsx');
  assert.match(headerSource, /applyInitialSession/, 'Stage 1B-A header initial session deduplication must remain intact');
  assert.match(headerSource, /prefetch=\{false\}/, 'Stage 1B-A private link prefetch={false} must remain intact');

  const cartSource = readSource('lib/cart/cart-context.tsx');
  assert.match(cartSource, /CART_FOCUS_THROTTLE_MS\s*=\s*30_000/, 'Stage 1B-A 30s cart focus throttle must remain intact');
  assert.match(cartSource, /areCartItemsEqual/, 'Stage 1B-A cart deep-equality check must remain intact');

  const publicCatalogSource = readSource('lib/catalog/public.ts');
  assert.match(publicCatalogSource, /PUBLIC_CATEGORIES_CACHE_TAG\s*=\s*['"]public-categories['"]/, 'Stage 1B-B public-categories tag must remain intact');
  assert.match(publicCatalogSource, /PUBLIC_CATEGORIES_REVALIDATE_SECONDS\s*=\s*300/, 'Stage 1B-B 300s revalidate must remain intact');
  assert.doesNotMatch(publicCatalogSource, /publicCategoriesMemoryCache/, 'Stage 1B-B removal of process-global category cache must remain intact');
});
