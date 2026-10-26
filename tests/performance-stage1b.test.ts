import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {
  isWishlistRowOwnedByUser,
  mapWishlistRowsForUser,
  type RawWishlistRow,
} from '../lib/wishlist/wishlist-view.ts';
import {
  CUSTOMER_ORDERS_PAGE_SIZE,
  parseOrdersPageParam,
  calculateOrdersPaginationRange,
  buildOrdersPaginationMeta,
} from '../lib/orders/customer-orders.ts';

const WORKSPACE_DIR = process.cwd();
const readSource = (relPath: string) => readFileSync(join(WORKSPACE_DIR, relPath), 'utf-8');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(ticks = 8) {
  for (let i = 0; i < ticks; i++) {
    await Promise.resolve();
  }
}

// =============================================================================
// STATEFUL REACT + DOM HARNESS FOR REAL RUNTIME EXECUTION OF TSX MODULES
// =============================================================================

interface VNode {
  type: any;
  props: Record<string, any>;
  children: any[];
}

function createTestHarness(customMocks: Record<string, any> = {}) {
  const windowListeners = new Map<string, Set<(...args: any[]) => any>>();
  const documentListeners = new Map<string, Set<(...args: any[]) => any>>();
  const storageMap = new Map<string, string>();
  let storageSetCalls = 0;
  let cartUpdatedEvents = 0;
  let visibilityState: 'visible' | 'hidden' = 'visible';
  let currentNow = 100_000;

  const localStorageMock = {
    getItem(key: string) {
      return storageMap.has(key) ? storageMap.get(key)! : null;
    },
    setItem(key: string, value: string) {
      storageSetCalls++;
      storageMap.set(key, String(value));
    },
    removeItem(key: string) {
      storageMap.delete(key);
    },
    clear() {
      storageMap.clear();
    },
    get setCalls() {
      return storageSetCalls;
    },
    resetCounters() {
      storageSetCalls = 0;
      cartUpdatedEvents = 0;
    },
  };

  const windowMock: Record<string, any> = {
    addEventListener(event: string, handler: (...args: any[]) => any) {
      if (!windowListeners.has(event)) windowListeners.set(event, new Set());
      windowListeners.get(event)!.add(handler);
    },
    removeEventListener(event: string, handler: (...args: any[]) => any) {
      windowListeners.get(event)?.delete(handler);
    },
    dispatchEvent(eventObj: { type?: string }) {
      const eventName = eventObj?.type || String(eventObj);
      if (eventName === 'splender:cart-updated') {
        cartUpdatedEvents++;
      }
      const handlers = windowListeners.get(eventName);
      if (handlers) {
        for (const h of Array.from(handlers)) {
          h(eventObj);
        }
      }
      return true;
    },
    get cartUpdatedEvents() {
      return cartUpdatedEvents;
    },
  };

  const documentMock: Record<string, any> = {
    get visibilityState() {
      return visibilityState;
    },
    set visibilityState(val: 'visible' | 'hidden') {
      visibilityState = val;
    },
    addEventListener(event: string, handler: (...args: any[]) => any) {
      if (!documentListeners.has(event)) documentListeners.set(event, new Set());
      documentListeners.get(event)!.add(handler);
    },
    removeEventListener(event: string, handler: (...args: any[]) => any) {
      documentListeners.get(event)?.delete(handler);
    },
    dispatchEvent(eventObj: { type?: string }) {
      const eventName = eventObj?.type || String(eventObj);
      const handlers = documentListeners.get(eventName);
      if (handlers) {
        for (const h of Array.from(handlers)) {
          h(eventObj);
        }
      }
      return true;
    },
  };

  // Minimal stateful React runtime for mounting hooks & inspecting VNodes
  let activeInstance: {
    hooks: any[];
    effects: { deps?: any[]; cleanup?: (() => void) | void; create: () => (() => void) | void }[];
    pendingEffects: number[];
    hookIndex: number;
    renderFn: () => any;
    lastOutput: any;
    renderCount: number;
    needsRerender?: boolean;
  } | null = null;

  const contexts = new Map<any, any>();

  function depsChanged(prev: any[] | undefined, next: any[] | undefined): boolean {
    if (!prev || !next) return true;
    if (prev.length !== next.length) return true;
    for (let i = 0; i < prev.length; i++) {
      if (!Object.is(prev[i], next[i])) return true;
    }
    return false;
  }

  let isRendering = false;

  function runInstanceRender(instance: NonNullable<typeof activeInstance>) {
    if (isRendering) {
      instance.needsRerender = true;
      return;
    }
    isRendering = true;
    try {
      do {
        instance.needsRerender = false;
        instance.hookIndex = 0;
        instance.pendingEffects = [];
        instance.renderCount++;
        const prev = activeInstance;
        activeInstance = instance;
        try {
          instance.lastOutput = instance.renderFn();
        } finally {
          activeInstance = prev;
        }
        const effectsToRun = [...instance.pendingEffects];
        instance.pendingEffects = [];
        for (const idx of effectsToRun) {
          const eff = instance.effects[idx];
          if (typeof eff.cleanup === 'function') {
            eff.cleanup();
          }
          eff.cleanup = eff.create();
        }
      } while (instance.needsRerender);
    } finally {
      isRendering = false;
    }
  }

  const ReactMock: Record<string, any> = {
    createElement(type: any, props: Record<string, any> | null, ...children: any[]): VNode {
      const normalizedProps = {
        ...(props || {}),
        children: children.length === 1 ? children[0] : children,
      };
      if (typeof type === 'function' && (type as any)._isContextProvider) {
        type(normalizedProps);
      }
      return {
        type,
        props: normalizedProps,
        children,
      };
    },
    Fragment: Symbol.for('react.fragment'),
    createContext(defaultValue: any) {
      const Provider: any = function Provider(props: { value: any; children: any }) {
        contexts.set(ctx, props.value);
        return props.children;
      };
      Provider._isContextProvider = true;
      const ctx: any = {
        _defaultValue: defaultValue,
        Provider,
      };
      contexts.set(ctx, defaultValue);
      return ctx;
    },
    useContext(ctx: any) {
      return contexts.get(ctx);
    },
    useState(initialValue: any) {
      const inst = activeInstance!;
      const idx = inst.hookIndex++;
      if (idx >= inst.hooks.length) {
        inst.hooks[idx] = typeof initialValue === 'function' ? initialValue() : initialValue;
      }
      const setState = (updater: any) => {
        const nextVal = typeof updater === 'function' ? updater(inst.hooks[idx]) : updater;
        if (!Object.is(inst.hooks[idx], nextVal)) {
          inst.hooks[idx] = nextVal;
          runInstanceRender(inst);
        }
      };
      return [inst.hooks[idx], setState];
    },
    useRef(initialValue: any) {
      const inst = activeInstance!;
      const idx = inst.hookIndex++;
      if (idx >= inst.hooks.length) {
        inst.hooks[idx] = { current: initialValue };
      }
      return inst.hooks[idx];
    },
    useEffect(create: () => (() => void) | void, deps?: any[]) {
      const inst = activeInstance!;
      const idx = inst.hookIndex++;
      const prev = inst.effects[idx];
      if (!prev || depsChanged(prev.deps, deps)) {
        inst.effects[idx] = { create, deps, cleanup: prev?.cleanup };
        inst.pendingEffects.push(idx);
      }
      if (idx >= inst.hooks.length) {
        inst.hooks[idx] = inst.effects[idx];
      }
    },
    useCallback(fn: any, deps?: any[]) {
      return ReactMock.useMemo(() => fn, deps);
    },
    useMemo(factory: () => any, deps?: any[]) {
      const inst = activeInstance!;
      const idx = inst.hookIndex++;
      const prev = inst.hooks[idx];
      if (!prev || depsChanged(prev.deps, deps)) {
        const value = factory();
        inst.hooks[idx] = { deps, value };
        return value;
      }
      return prev.value;
    },
  };
  ReactMock.default = ReactMock;

  function mountComponent(renderFn: () => any) {
    const instance = {
      hooks: [] as any[],
      effects: [] as { deps?: any[]; cleanup?: (() => void) | void; create: () => (() => void) | void }[],
      pendingEffects: [] as number[],
      hookIndex: 0,
      renderFn,
      lastOutput: null as any,
      renderCount: 0,
    };
    runInstanceRender(instance);
    return {
      get output() {
        return instance.lastOutput;
      },
      get renderCount() {
        return instance.renderCount;
      },
      rerender() {
        runInstanceRender(instance);
      },
      unmount() {
        for (const eff of instance.effects) {
          if (typeof eff?.cleanup === 'function') {
            eff.cleanup();
          }
        }
      },
    };
  }

  function loadTsxModule(relPath: string, extraModules: Record<string, any> = {}) {
    const absPath = join(WORKSPACE_DIR, relPath);
    const source = readFileSync(absPath, 'utf-8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
      fileName: absPath,
    });

    const moduleExports: Record<string, any> = {};
    const moduleObj = { exports: moduleExports };

    const IconStub = (props: any) => ReactMock.createElement('svg', props);
    const defaultModules: Record<string, any> = {
      react: ReactMock,
      'next/link': {
        __esModule: true,
        default: function LinkMock(props: any) {
          return ReactMock.createElement('a', props, props.children);
        },
      },
      'next/navigation': {
        usePathname: () => '/',
        useRouter: () => ({ push: () => {}, refresh: () => {} }),
      },
      'lucide-react': new Proxy(
        {},
        {
          get: () => IconStub,
        }
      ),
      'tailwind-merge': {
        twMerge: (...args: string[]) => args.filter(Boolean).join(' '),
      },
      '@/components/ui/container': {
        Container: (props: any) => ReactMock.createElement('div', props, props.children),
      },
      '@/components/ui/card': {
        Card: (props: any) => ReactMock.createElement('div', props, props.children),
        CardHeader: (props: any) => ReactMock.createElement('div', props, props.children),
        CardTitle: (props: any) => ReactMock.createElement('h3', props, props.children),
        CardDescription: (props: any) => ReactMock.createElement('p', props, props.children),
        CardContent: (props: any) => ReactMock.createElement('div', props, props.children),
      },
      '@/components/ui/button': {
        Button: (props: any) => ReactMock.createElement('button', props, props.children),
      },
      '@/components/ui/badge': {
        Badge: (props: any) => ReactMock.createElement('span', props, props.children),
      },
      '@/components/icons/instagram': {
        InstagramIcon: IconStub,
      },
      '@/components/store/product-image-gallery': {
        ProductImageGallery: (props: any) => ReactMock.createElement('div', props),
      },
      '@/lib/catalog/image-loader': {
        getThumbnailImageUrl: (url: string) => url,
        getMasterImageUrl: (url: string) => url,
      },
      '@/lib/config/store': {
        getStoreConfig: () => ({
          storeName: 'Splender Jewel',
          logoUrl: '/images/logo.png',
          announcementBanner: { enabled: false, text: '' },
        }),
        getInstagramLink: () => 'https://instagram.com/splender_jewel',
        getWhatsAppLink: () => 'https://wa.me/94771234567',
        formatCurrency: (n: number) => `LKR ${n}`,
      },
      './validation': {
        calculateStockAdjustments: (items: any[], stockMap: Record<string, number>) => ({
          updatedItems: items,
          adjustedItems: [],
          hasChanges: false,
          stockMap,
        }),
      },
      ...customMocks,
      ...extraModules,
    };

    const customRequire = (id: string) => {
      if (id in defaultModules) return defaultModules[id];
      throw new Error(`Unexpected module import in test harness: ${id}`);
    };

    const sandbox = {
      module: moduleObj,
      exports: moduleExports,
      require: customRequire,
      window: windowMock,
      document: documentMock,
      localStorage: localStorageMock,
      Event: class CustomEventMock {
        type: string;
        constructor(type: string) {
          this.type = type;
        }
      },
      crypto: {
        randomUUID: () => 'test-merge-uuid-1234',
      },
      Date: class MockDate extends Date {
        static now() {
          return currentNow;
        }
      },
      console,
      setTimeout: (fn: (...args: any[]) => void, ms?: number) => {
        const timer = setTimeout(fn, Math.min(ms ?? 0, 20));
        if (typeof timer.unref === 'function') timer.unref();
        return timer;
      },
      clearTimeout,
      Promise,
    };

    vm.runInNewContext(transpiled.outputText, sandbox, { filename: absPath });
    return moduleObj.exports;
  }

  return {
    windowMock,
    documentMock,
    localStorageMock,
    ReactMock,
    mountComponent,
    loadTsxModule,
    getNow: () => currentNow,
    setNow: (ms: number) => {
      currentNow = ms;
    },
    advanceTime: (deltaMs: number) => {
      currentNow += deltaMs;
    },
  };
}

function collectVNodes(node: any, predicate: (vnode: VNode) => boolean, acc: VNode[] = []): VNode[] {
  if (!node || typeof node !== 'object') return acc;
  if (Array.isArray(node)) {
    for (const child of node) collectVNodes(child, predicate, acc);
    return acc;
  }
  if ('type' in node && 'props' in node) {
    if (typeof node.type === 'function') {
      const rendered = node.type(node.props);
      return collectVNodes(rendered, predicate, acc);
    }
    if (predicate(node as VNode)) {
      acc.push(node as VNode);
    }
    if (node.children) {
      collectVNodes(node.children, predicate, acc);
    }
  }
  return acc;
}

// =============================================================================
// 1 & 2. WISHLIST HEADER DEDUPLICATION, LOGIN/LOGOUT & STALE RESPONSE PROTECTION
// =============================================================================

test('Task 1 & 2 (Behavioral): StoreHeader triggers only 1 initial wishlist count request when getSession and INITIAL_SESSION both fire, deduplicates overlapping requests, and ignores stale responses', async () => {
  let wishlistCountCalls = 0;
  let authChangeCallback: ((event: string, session: any) => void) | null = null;
  let sessionUser: { id: string } | null = { id: 'customer-1' };
  const pendingResponses: Array<ReturnType<typeof deferred<{ count: number; isAuthenticated: boolean }>>> = [];

  const harness = createTestHarness({
    '@/lib/cart/cart-context': {
      useCart: () => ({ totalCount: 0, isLoaded: true }),
    },
    '@/lib/auth/actions': {
      signOutCustomer: async () => ({ success: true }),
    },
    '@/lib/wishlist/actions': {
      getCustomerWishlistCount: () => {
        wishlistCountCalls++;
        const d = deferred<{ count: number; isAuthenticated: boolean }>();
        pendingResponses.push(d);
        return d.promise;
      },
    },
    '@/lib/supabase/client': {
      createClient: () => ({
        auth: {
          getSession: async () => ({
            data: { session: sessionUser ? { user: sessionUser } : null },
          }),
          onAuthStateChange: (cb: (event: string, session: any) => void) => {
            authChangeCallback = cb;
            // Simulate Supabase v2 emitting INITIAL_SESSION immediately on registration
            cb('INITIAL_SESSION', sessionUser ? { user: sessionUser } : null);
            return { data: { subscription: { unsubscribe: () => {} } } };
          },
        },
      }),
    },
  });

  const { StoreHeader } = harness.loadTsxModule('components/store/header.tsx');
  const mounted = harness.mountComponent(() => StoreHeader({ categories: [] }));

  await flushMicrotasks();

  // Before Stage 1B-A: getSession() + onAuthStateChange('INITIAL_SESSION') caused 2 calls.
  // After Stage 1B-A: strictly 1 initial getCustomerWishlistCount() call!
  assert.equal(
    wishlistCountCalls,
    1,
    'StoreHeader must execute exactly 1 initial getCustomerWishlistCount() request when both getSession and INITIAL_SESSION fire'
  );

  // Overlapping SIGNED_IN / custom event while initial request is still in-flight is deduplicated
  authChangeCallback!('SIGNED_IN', { user: sessionUser });
  harness.windowMock.dispatchEvent({ type: 'splender:auth-signed-in' });
  await flushMicrotasks();
  assert.equal(
    wishlistCountCalls,
    1,
    'Overlapping auth events while initial wishlist count fetch is in flight must be deduplicated'
  );

  // Resolve the initial request with count = 3
  pendingResponses[0].resolve({ count: 3, isAuthenticated: true });
  await flushMicrotasks();

  const findWishlistLink = () =>
    collectVNodes(
      mounted.output,
      (n) => n.props?.href === '/account/wishlist' && Boolean(n.props?.['aria-label'])
    )[0];

  assert.equal(findWishlistLink().props['aria-label'], 'Wishlist (3 items)');

  // Stale response protection:
  // Trigger wishlist update #1 (slow, will resolve to stale count = 2)
  harness.windowMock.dispatchEvent({ type: 'splender:wishlist-updated' });
  await flushMicrotasks();
  assert.equal(wishlistCountCalls, 2);

  // Trigger wishlist update #2 (fast, resolves to newer count = 5) before #1 finishes
  harness.windowMock.dispatchEvent({ type: 'splender:wishlist-updated' });
  await flushMicrotasks();
  assert.equal(wishlistCountCalls, 3);

  // Newer request (#2, index 2) resolves first with count = 5
  pendingResponses[2].resolve({ count: 5, isAuthenticated: true });
  await flushMicrotasks();
  assert.equal(findWishlistLink().props['aria-label'], 'Wishlist (5 items)');

  // Older stale request (#1, index 1) resolves later with count = 2 — must NOT overwrite 5
  pendingResponses[1].resolve({ count: 2, isAuthenticated: true });
  await flushMicrotasks();
  assert.equal(
    findWishlistLink().props['aria-label'],
    'Wishlist (5 items)',
    'Stale wishlist count response must never overwrite a newer count'
  );

  // Logout immediately resets wishlist count to 0 and invalidates any in-flight request
  harness.windowMock.dispatchEvent({ type: 'splender:wishlist-updated' });
  await flushMicrotasks();
  assert.equal(wishlistCountCalls, 4);

  authChangeCallback!('SIGNED_OUT', null);
  await flushMicrotasks();
  assert.equal(
    findWishlistLink().props['aria-label'],
    'Wishlist',
    'Logout must immediately reset wishlist count to 0'
  );

  // Delayed in-flight response after logout must be discarded
  pendingResponses[3].resolve({ count: 9, isAuthenticated: true });
  await flushMicrotasks();
  assert.equal(
    findWishlistLink().props['aria-label'],
    'Wishlist',
    'In-flight wishlist response resolving after logout must be discarded'
  );

  // Subsequent login immediately fetches fresh count
  authChangeCallback!('SIGNED_IN', { user: { id: 'customer-2' } });
  await flushMicrotasks();
  assert.equal(wishlistCountCalls, 5);
  pendingResponses[4].resolve({ count: 4, isAuthenticated: true });
  await flushMicrotasks();
  assert.equal(findWishlistLink().props['aria-label'], 'Wishlist (4 items)');

  mounted.unmount();
});

// =============================================================================
// 3. PRIVATE-LINK PREFETCH DISABLED & PUBLIC CATALOG PREFETCH PRESERVED
// =============================================================================

test('Task 3 (Behavioral & Static): StoreHeader and StoreFooter disable prefetch on /account, /account/wishlist, and /account/orders while preserving public catalog prefetching', () => {
  const harness = createTestHarness({
    '@/lib/cart/cart-context': {
      useCart: () => ({ totalCount: 2, isLoaded: true }),
    },
    '@/lib/auth/actions': {
      signOutCustomer: async () => ({ success: true }),
    },
    '@/lib/wishlist/actions': {
      getCustomerWishlistCount: async () => ({ count: 1, isAuthenticated: false }),
    },
    '@/lib/supabase/client': {
      createClient: () => null,
    },
  });

  const sampleCategories = [
    {
      id: 'cat-1',
      name: 'Anklet',
      slug: 'anklet',
      isActive: true,
    },
  ];

  const { StoreHeader } = harness.loadTsxModule('components/store/header.tsx');
  const { StoreFooter } = harness.loadTsxModule('components/store/footer.tsx');

  const headerInstance = harness.mountComponent(() =>
    StoreHeader({ categories: sampleCategories })
  );

  // Open mobile drawer as well so both desktop and mobile links are rendered and inspected
  const mobileToggleBtn = collectVNodes(
    headerInstance.output,
    (n) => n.type === 'button' && n.props?.['aria-label'] === 'Toggle Navigation Menu'
  )[0];
  mobileToggleBtn.props.onClick();

  const headerLinks = collectVNodes(headerInstance.output, (n) => typeof n.props?.href === 'string');
  const accountLinks = headerLinks.filter((l) => l.props.href === '/account');
  const wishlistLinks = headerLinks.filter((l) => l.props.href === '/account/wishlist');
  const publicCatalogLinks = headerLinks.filter(
    (l) => l.props.href === '/shop' || l.props.href === '/category/anklet'
  );

  // Desktop + Mobile links for /account and /account/wishlist
  assert.equal(accountLinks.length, 2, 'Expected desktop and mobile /account links');
  assert.equal(wishlistLinks.length, 2, 'Expected desktop and mobile /account/wishlist links');
  for (const link of [...accountLinks, ...wishlistLinks]) {
    assert.equal(
      link.props.prefetch,
      false,
      `Expected prefetch={false} on private header link ${link.props.href}`
    );
  }

  // Public catalog links keep default prefetching
  assert.ok(publicCatalogLinks.length >= 4, 'Expected desktop and mobile public catalog links');
  for (const link of publicCatalogLinks) {
    assert.equal(
      link.props.prefetch,
      undefined,
      `Public catalog link ${link.props.href} must preserve default prefetching`
    );
  }

  // Inspect StoreFooter links
  const footerInstance = harness.mountComponent(() =>
    StoreFooter({ categories: sampleCategories })
  );
  const footerLinks = collectVNodes(footerInstance.output, (n) => typeof n.props?.href === 'string');
  const orderHistoryLinks = footerLinks.filter((l) => l.props.href === '/account/orders');
  const footerCategoryLinks = footerLinks.filter((l) => l.props.href === '/category/anklet');

  assert.equal(orderHistoryLinks.length, 1, 'Expected /account/orders link in StoreFooter');
  assert.equal(
    orderHistoryLinks[0].props.prefetch,
    false,
    'StoreFooter /account/orders link must have prefetch={false}'
  );
  assert.equal(footerCategoryLinks.length, 1);
  assert.equal(footerCategoryLinks[0].props.prefetch, undefined);
});

// =============================================================================
// 4, 5, 6, 7 & 8. CART SYNCHRONIZATION, GUEST MERGE, FOCUS THROTTLE & DEDUP
// =============================================================================

test('Task 4, 5, 6, 7 & 8 (Behavioral): CartProvider preserves guest cart, merges on login, throttles authenticated focus refresh to 30s, skips redundant state/storage updates for identical data, and applies cart changes immediately', async () => {
  let getAuthCartCalls = 0;
  let mergeGuestCartCalls = 0;
  let syncCartItemCalls = 0;
  let removeCartItemCalls = 0;
  let clearCartCalls = 0;

  let authChangeCallback: ((event: string, session: any) => Promise<void> | void) | null = null;
  let currentSessionUser: { id: string } | null = null; // Start as unauthenticated guest
  let remoteCartItems: any[] = [];

  const harness = createTestHarness({
    '@/lib/supabase/client': {
      createClient: () => ({
        auth: {
          getSession: async () => ({
            data: { session: currentSessionUser ? { user: currentSessionUser } : null },
          }),
          onAuthStateChange: (cb: (event: string, session: any) => void) => {
            authChangeCallback = cb;
            cb('INITIAL_SESSION', currentSessionUser ? { user: currentSessionUser } : null);
            return { data: { subscription: { unsubscribe: () => {} } } };
          },
        },
      }),
    },
    './actions': {
      getAuthenticatedCartAction: async () => {
        getAuthCartCalls++;
        if (!currentSessionUser) {
          return { success: true, items: null, authenticated: false };
        }
        return {
          success: true,
          items: remoteCartItems.map((i) => ({ ...i })),
          authenticated: true,
          userId: currentSessionUser.id,
        };
      },
      mergeGuestCartAction: async (guestItems: any[]) => {
        mergeGuestCartCalls++;
        if (!currentSessionUser) {
          return {
            success: false,
            items: guestItems,
            unauthenticated: true,
            error: 'Authentication required',
          };
        }
        const mergedMap = new Map<string, any>();
        for (const item of remoteCartItems) {
          mergedMap.set(item.variantId, { ...item });
        }
        for (const g of guestItems) {
          const existing = mergedMap.get(g.variantId);
          if (existing) {
            existing.quantity += g.quantity;
          } else {
            mergedMap.set(g.variantId, { ...g });
          }
        }
        remoteCartItems = Array.from(mergedMap.values());
        return {
          success: true,
          items: remoteCartItems.map((i) => ({ ...i })),
          userId: currentSessionUser.id,
        };
      },
      syncCartItemAction: async (variantId: string, quantity: number) => {
        syncCartItemCalls++;
        const idx = remoteCartItems.findIndex((i) => i.variantId === variantId);
        if (idx > -1) {
          remoteCartItems[idx] = { ...remoteCartItems[idx], quantity };
        }
        return { success: true };
      },
      removeCartItemAction: async (variantId: string) => {
        removeCartItemCalls++;
        remoteCartItems = remoteCartItems.filter((i) => i.variantId !== variantId);
        return { success: true };
      },
      deductPurchasedCartItemsAction: async () => ({ success: true }),
      removePurchasedCartItemsAction: async () => ({ success: true }),
      clearCartAction: async () => {
        clearCartCalls++;
        remoteCartItems = [];
        return { success: true };
      },
    },
  });

  const cartModule = harness.loadTsxModule('lib/cart/cart-context.tsx');
  const { CartProvider, useCart, areCartItemsEqual, CART_FOCUS_THROTTLE_MS } = cartModule;

  assert.equal(CART_FOCUS_THROTTLE_MS, 30_000, 'Focus refresh throttle must be 30,000ms (30s)');

  let latestCart: any = null;
  let consumerRenders = 0;

  const mounted = harness.mountComponent(() => {
    const providerNode = CartProvider({ children: null });
    consumerRenders++;
    latestCart = useCart();
    return providerNode;
  });

  await flushMicrotasks();

  // ---------------------------------------------------------------------------
  // Test 4: Guest cart persistence & zero guest server requests on tab focus
  // ---------------------------------------------------------------------------
  assert.equal(getAuthCartCalls, 0, 'Unauthenticated guest mount must not call getAuthenticatedCartAction');
  assert.equal(mergeGuestCartCalls, 0, 'Unauthenticated guest mount must not call mergeGuestCartAction');

  const guestRing = {
    variantId: 'var-ring-1',
    productId: 'prod-1',
    productName: 'Ceylon Gold Ring',
    productSlug: 'ceylon-gold-ring',
    variantTitle: 'Size 7',
    sku: 'SJ-RING-7',
    price: 25000,
    discountPrice: 22000,
    imageUrl: 'https://cdn.example.com/ring.jpg',
    maxStock: 5,
  };

  // Test 8: Cart changes remain visible immediately
  const addRes = latestCart.addItem(guestRing, 2);
  assert.equal(addRes.success, true);
  assert.equal(latestCart.items.length, 1, 'Guest addItem must update cart state immediately');
  assert.equal(latestCart.totalCount, 2);
  assert.equal(latestCart.subtotal, 44000);
  assert.equal(
    harness.localStorageMock.getItem('splender_guest_cart_active'),
    'true',
    'Guest cart flag must be persisted in localStorage'
  );
  assert.equal(
    JSON.parse(harness.localStorageMock.getItem('splender_cart_v1')!).length,
    1,
    'Guest cart items must be persisted in localStorage'
  );

  // Guest tab focus / visibilitychange must NOT trigger server requests
  harness.advanceTime(60_000);
  harness.windowMock.dispatchEvent({ type: 'focus' });
  harness.documentMock.dispatchEvent({ type: 'visibilitychange' });
  await flushMicrotasks();
  assert.equal(getAuthCartCalls, 0, 'Guest tab focus must NEVER trigger getAuthenticatedCartAction');
  assert.equal(mergeGuestCartCalls, 0, 'Guest tab focus must NEVER trigger mergeGuestCartAction');

  // ---------------------------------------------------------------------------
  // Test 5: Guest cart merge after login (single merge even if SIGNED_IN + custom event fire)
  // ---------------------------------------------------------------------------
  remoteCartItems = [
    {
      variantId: 'var-anklet-2',
      productId: 'prod-2',
      productName: 'Royal Gold Anklet',
      productSlug: 'royal-gold-anklet',
      variantTitle: 'Standard',
      sku: 'SJ-ANK-2',
      price: 18000,
      discountPrice: null,
      imageUrl: 'https://cdn.example.com/anklet.jpg',
      quantity: 1,
      maxStock: 4,
    },
  ];

  currentSessionUser = { id: 'user-auth-1' };
  // Fire both Supabase SIGNED_IN and custom splender:auth-signed-in concurrently
  authChangeCallback!('SIGNED_IN', { user: currentSessionUser });
  harness.windowMock.dispatchEvent({ type: 'splender:auth-signed-in' });
  await flushMicrotasks(12);

  assert.equal(mergeGuestCartCalls, 1, 'Guest cart must be merged exactly once upon login');
  assert.equal(latestCart.items.length, 2, 'Merged cart must contain both account item and guest item');
  assert.equal(latestCart.totalCount, 3, 'Merged totalCount must be 1 + 2 = 3');
  assert.equal(
    harness.localStorageMock.getItem('splender_guest_cart_active'),
    null,
    'GUEST_CART_FLAG must be cleared after successful merge'
  );

  // ---------------------------------------------------------------------------
  // Test 7: No redundant cart updates, localStorage writes, or events for identical data
  // ---------------------------------------------------------------------------
  const itemsRefBeforeIdenticalRefresh = latestCart.items;
  const rendersBeforeIdenticalRefresh = consumerRenders;
  harness.localStorageMock.resetCounters();

  await latestCart.refreshCart();
  await flushMicrotasks();

  assert.equal(getAuthCartCalls, 1, 'refreshCart must query server');
  assert.equal(
    latestCart.items,
    itemsRefBeforeIdenticalRefresh,
    'Cart items array reference must be preserved when server returns identical cart contents'
  );
  assert.equal(
    consumerRenders,
    rendersBeforeIdenticalRefresh,
    'CartProvider must not re-render consumers when returned cart contents are identical'
  );
  assert.equal(
    harness.localStorageMock.setCalls,
    0,
    'refreshCart must not write to localStorage when cart contents are unchanged'
  );
  assert.equal(
    harness.windowMock.cartUpdatedEvents,
    0,
    'refreshCart must not dispatch splender:cart-updated when cart contents are unchanged'
  );

  // Verify areCartItemsEqual detects real changes accurately
  assert.equal(areCartItemsEqual(latestCart.items, [...latestCart.items]), true);
  assert.equal(
    areCartItemsEqual(latestCart.items, [
      { ...latestCart.items[0], quantity: 99 },
      latestCart.items[1],
    ]),
    false
  );

  // ---------------------------------------------------------------------------
  // Test 6: Authenticated cart refresh after tab focus (30-second throttle)
  // ---------------------------------------------------------------------------
  // First focus at t = 160,000ms (> 30s since lastFocusTime = 0) triggers refreshCart
  remoteCartItems = [
    ...remoteCartItems,
    {
      variantId: 'var-bracelet-3',
      productId: 'prod-3',
      productName: 'Lotus Bracelet',
      productSlug: 'lotus-bracelet',
      variantTitle: 'Standard',
      sku: 'SJ-BRC-3',
      price: 15000,
      discountPrice: null,
      imageUrl: null,
      quantity: 1,
      maxStock: 3,
    },
  ];

  harness.windowMock.dispatchEvent({ type: 'focus' });
  await flushMicrotasks();
  assert.equal(getAuthCartCalls, 2, 'First authenticated tab focus after 30s threshold must refresh cart');
  assert.equal(latestCart.items.length, 3, 'New remote item from another device must appear after focus refresh');

  // Focus again 10 seconds later (< 30s throttle) — must NOT trigger server call
  harness.advanceTime(10_000);
  harness.windowMock.dispatchEvent({ type: 'focus' });
  harness.documentMock.dispatchEvent({ type: 'visibilitychange' });
  await flushMicrotasks();
  assert.equal(
    getAuthCartCalls,
    2,
    'Tab focus within 30-second throttle window must not trigger duplicate server calls'
  );

  // Focus 25 seconds later (total +35s >= 30s throttle) — MUST trigger server call
  harness.advanceTime(25_000);
  harness.windowMock.dispatchEvent({ type: 'focus' });
  await flushMicrotasks();
  assert.equal(
    getAuthCartCalls,
    3,
    'Tab focus after 30 seconds must trigger authenticated cart refresh'
  );

  // ---------------------------------------------------------------------------
  // Test 8 (continued): Immediate cart mutations for authenticated user
  // ---------------------------------------------------------------------------
  const qtyRes = latestCart.updateQuantity('var-ring-1', 4);
  assert.equal(qtyRes.success, true);
  assert.equal(
    latestCart.items.find((i: any) => i.variantId === 'var-ring-1').quantity,
    4,
    'updateQuantity must update cart state synchronously'
  );
  await flushMicrotasks();
  assert.equal(syncCartItemCalls, 1);

  latestCart.removeItem('var- bracelet-3'.replace(' ', ''));
  assert.equal(
    latestCart.items.some((i: any) => i.variantId === 'var-bracelet-3'),
    false,
    'removeItem must remove item from cart state synchronously'
  );
  await flushMicrotasks();
  assert.equal(removeCartItemCalls, 1);

  // Logout wipes cart state and localStorage immediately
  currentSessionUser = null;
  authChangeCallback!('SIGNED_OUT', null);
  await flushMicrotasks();
  assert.equal(latestCart.items.length, 0, 'Logout must immediately clear cart items');
  assert.equal(harness.localStorageMock.getItem('splender_cart_v1'), null);
  assert.equal(clearCartCalls, 0);

  mounted.unmount();
});

test('Task 3 (Behavioral): CartProvider deduplicates initial mount sync when getSession and INITIAL_SESSION both fire for authenticated user', async () => {
  let getAuthCartCalls = 0;
  const authUser = { id: 'user-initial-1' };

  const harness = createTestHarness({
    '@/lib/supabase/client': {
      createClient: () => ({
        auth: {
          getSession: async () => ({
            data: { session: { user: authUser } },
          }),
          onAuthStateChange: (cb: (event: string, session: any) => void) => {
            cb('INITIAL_SESSION', { user: authUser });
            return { data: { subscription: { unsubscribe: () => {} } } };
          },
        },
      }),
    },
    './actions': {
      getAuthenticatedCartAction: async () => {
        getAuthCartCalls++;
        return {
          success: true,
          items: [],
          authenticated: true,
          userId: authUser.id,
        };
      },
      mergeGuestCartAction: async () => ({ success: true, items: [] }),
      syncCartItemAction: async () => ({ success: true }),
      removeCartItemAction: async () => ({ success: true }),
      deductPurchasedCartItemsAction: async () => ({ success: true }),
      removePurchasedCartItemsAction: async () => ({ success: true }),
      clearCartAction: async () => ({ success: true }),
    },
  });

  const { CartProvider } = harness.loadTsxModule('lib/cart/cart-context.tsx');
  const mounted = harness.mountComponent(() => CartProvider({ children: null }));

  await flushMicrotasks(10);
  assert.equal(
    getAuthCartCalls,
    1,
    'CartProvider must execute only 1 initial getAuthenticatedCartAction call on mount'
  );
  mounted.unmount();
});

// =============================================================================
// 9. GUEST PRODUCT WISHLIST CHECKS AVOIDED
// =============================================================================

test('Task 9 (Behavioral): ProductDetailViewer avoids calling checkProductWishlistStatus for unauthenticated guests and fetches status on login', async () => {
  let checkStatusCalls = 0;
  let addWishlistCalls = 0;
  let removeWishlistCalls = 0;
  let authChangeCallback: ((event: string, session: any) => void) | null = null;
  let sessionUser: { id: string } | null = null; // Confirmed unauthenticated visitor

  const harness = createTestHarness({
    '@/lib/cart/cart-context': {
      useCart: () => ({ items: [], addItem: () => ({ success: true }) }),
    },
    '@/lib/cart/actions': {
      checkVariantAvailabilityAction: async () => ({
        isAvailable: true,
        inStock: true,
        availableStock: 5,
      }),
    },
    '@/lib/wishlist/actions': {
      checkProductWishlistStatus: async () => {
        checkStatusCalls++;
        return {
          isAuthenticated: Boolean(sessionUser),
          isWishlisted: true,
        };
      },
      addToWishlist: async () => {
        addWishlistCalls++;
        return { success: true };
      },
      removeProductFromWishlist: async () => {
        removeWishlistCalls++;
        return { success: true };
      },
    },
    '@/lib/supabase/client': {
      createClient: () => ({
        auth: {
          getSession: async () => ({
            data: { session: sessionUser ? { user: sessionUser } : null },
          }),
          onAuthStateChange: (cb: (event: string, session: any) => void) => {
            authChangeCallback = cb;
            cb('INITIAL_SESSION', sessionUser ? { user: sessionUser } : null);
            return { data: { subscription: { unsubscribe: () => {} } } };
          },
        },
      }),
    },
  });

  const sampleProduct = {
    id: 'prod-sapphire-1',
    name: 'Sapphire Pendant',
    slug: 'sapphire-pendant',
    description: 'Fine sapphire pendant',
    basePrice: 35000,
    images: [],
    variants: [
      {
        id: 'var-sapphire-1',
        productId: 'prod-sapphire-1',
        title: '18K Gold',
        sku: 'SJ-SAP-1',
        price: 35000,
        discountPrice: null,
        stockQuantity: 5,
        stockStatus: 'in_stock',
        isActive: true,
      },
    ],
  };

  const { ProductDetailViewer } = harness.loadTsxModule('components/store/product-detail-viewer.tsx');
  const mounted = harness.mountComponent(() =>
    ProductDetailViewer({
      product: sampleProduct,
      storeWhatsAppNumber: '+94771234567',
    })
  );

  await flushMicrotasks(10);

  // Before Stage 1B-A: checkProductWishlistStatus was called on every guest PDP mount.
  // After Stage 1B-A: 0 calls for confirmed unauthenticated guest!
  assert.equal(
    checkStatusCalls,
    0,
    'ProductDetailViewer must NOT call checkProductWishlistStatus for unauthenticated guests'
  );

  // Now customer signs in: ProductDetailViewer must fetch wishlist status once
  sessionUser = { id: 'customer-99' };
  authChangeCallback!('SIGNED_IN', { user: sessionUser });
  await flushMicrotasks(10);

  assert.equal(
    checkStatusCalls,
    1,
    'ProductDetailViewer must call checkProductWishlistStatus once when customer signs in'
  );

  // Verify add/remove wishlist toggle button remains functional
  const wishlistToggleBtn = collectVNodes(
    mounted.output,
    (n) =>
      n.type === 'button' &&
      typeof n.props?.['aria-label'] === 'string' &&
      n.props['aria-label'].toLowerCase().includes('wishlist')
  )[0];
  assert.ok(wishlistToggleBtn, 'Wishlist toggle button must be rendered');
  assert.equal(wishlistToggleBtn.props['aria-label'], 'Remove from Wishlist');

  await wishlistToggleBtn.props.onClick();
  await flushMicrotasks();
  assert.equal(removeWishlistCalls, 1, 'Clicking wishlist button when wishlisted must call removeProductFromWishlist');

  const wishlistToggleBtnAfterRemove = collectVNodes(
    mounted.output,
    (n) =>
      n.type === 'button' &&
      typeof n.props?.['aria-label'] === 'string' &&
      n.props['aria-label'].toLowerCase().includes('wishlist')
  )[0];
  assert.equal(wishlistToggleBtnAfterRemove.props['aria-label'], 'Save to Wishlist');

  await wishlistToggleBtnAfterRemove.props.onClick();
  await flushMicrotasks();
  assert.equal(addWishlistCalls, 1, 'Clicking wishlist button when not wishlisted must call addToWishlist');

  mounted.unmount();
});

// =============================================================================
// 10. CUSTOMER OWNERSHIP AND REQUEST-SCOPED AUTHENTICATION PRESERVED
// =============================================================================

test('Task 10: Account pages and read actions reuse request-scoped getCurrentUser() while preserving strict customer ownership and mutation auth', () => {
  const accountPages = [
    'app/(store)/account/page.tsx',
    'app/(store)/account/addresses/page.tsx',
    'app/(store)/account/profile/page.tsx',
    'app/(store)/account/reviews/page.tsx',
    'app/(store)/account/orders/page.tsx',
    'app/(store)/account/orders/[orderId]/page.tsx',
  ];

  for (const pagePath of accountPages) {
    const source = readSource(pagePath);
    assert.match(
      source,
      /import\s*\{[^}]*getCurrentUser[^}]*\}\s*from\s*['"]@\/lib\/auth\/server['"]/,
      `${pagePath} must import getCurrentUser from @/lib/auth/server`
    );
    assert.match(
      source,
      /const\s+user\s*=\s*await\s+getCurrentUser\(\)/,
      `${pagePath} must call request-scoped getCurrentUser()`
    );
  }

  // Verify lib/addresses/actions.ts reuses getCurrentUser() for getCustomerAddresses read and requireCustomerAuth() for mutations
  const addressActions = readSource('lib/addresses/actions.ts');
  const getAddrBody = addressActions.slice(
    addressActions.indexOf('export async function getCustomerAddresses'),
    addressActions.indexOf('export async function createCustomerAddress')
  );
  assert.match(getAddrBody, /await\s+getCurrentUser\(\)/, 'getCustomerAddresses must reuse getCurrentUser()');
  assert.match(getAddrBody, /\.eq\(['"]user_id['"],\s*user\.id\)/, 'getCustomerAddresses must filter by user.id');

  const createAddrBody = addressActions.slice(
    addressActions.indexOf('export async function createCustomerAddress'),
    addressActions.indexOf('export async function updateCustomerAddress')
  );
  assert.match(createAddrBody, /await\s+requireCustomerAuth\(\)/, 'Address mutations must enforce requireCustomerAuth()');

  // Verify lib/reviews/customer-actions.ts reuses getCurrentUser() for reads and requireCustomerAuth() for submitCustomerReview
  const reviewActions = readSource('lib/reviews/customer-actions.ts');
  const getReviewsBody = reviewActions.slice(
    reviewActions.indexOf('export async function getCustomerReviews'),
    reviewActions.indexOf('export async function getEligibleReviewProducts')
  );
  assert.match(getReviewsBody, /await\s+getCurrentUser\(\)/, 'getCustomerReviews must reuse getCurrentUser()');
  assert.match(getReviewsBody, /\.eq\(['"]user_id['"],\s*user\.id\)/, 'getCustomerReviews must filter by user.id');

  const getEligibleBody = reviewActions.slice(
    reviewActions.indexOf('export async function getEligibleReviewProducts'),
    reviewActions.indexOf('export async function submitCustomerReview')
  );
  assert.match(getEligibleBody, /await\s+getCurrentUser\(\)/, 'getEligibleReviewProducts must reuse getCurrentUser()');
  assert.match(getEligibleBody, /\.eq\(['"]user_id['"],\s*user\.id\)/, 'getEligibleReviewProducts must filter by user.id');

  const submitReviewBody = reviewActions.slice(
    reviewActions.indexOf('export async function submitCustomerReview')
  );
  assert.match(submitReviewBody, /await\s+requireCustomerAuth\(\)/, 'submitCustomerReview mutation must enforce requireCustomerAuth()');

  // Verify lib/auth/actions.ts updateCustomerProfile reuses getCurrentUser() and scopes update to user.id
  const authActions = readSource('lib/auth/actions.ts');
  const updateProfileBody = authActions.slice(
    authActions.indexOf('export async function updateCustomerProfile')
  );
  assert.match(updateProfileBody, /await\s+getCurrentUser\(\)/, 'updateCustomerProfile must use getCurrentUser()');
  assert.match(updateProfileBody, /\.eq\(['"]id['"],\s*user\.id\)/, 'updateCustomerProfile must scope update to user.id');
});

// =============================================================================
// 11. LOADING SKELETONS RENDER CORRECTLY
// =============================================================================

test('Task 11 (Behavioral & Static): Account and Wishlist loading skeletons render accessible placeholders, expose no private data, and add no duplicate navigation bar', () => {
  assert.ok(existsSync(join(WORKSPACE_DIR, 'app/(store)/account/loading.tsx')));
  assert.ok(existsSync(join(WORKSPACE_DIR, 'app/(store)/account/wishlist/loading.tsx')));

  const harness = createTestHarness();
  const AccountLoading = harness.loadTsxModule('app/(store)/account/loading.tsx').default;
  const WishlistLoading = harness.loadTsxModule('app/(store)/account/wishlist/loading.tsx').default;

  const accountTree = harness.mountComponent(() =>
    harness.ReactMock.createElement(AccountLoading, null)
  );
  const wishlistTree = harness.mountComponent(() =>
    harness.ReactMock.createElement(WishlistLoading, null)
  );

  const accountStatusNodes = collectVNodes(accountTree.output, (n) => n.props?.role === 'status');
  assert.equal(accountStatusNodes.length, 1, 'Account loading skeleton must render role="status"');
  assert.equal(accountStatusNodes[0].props['aria-label'], 'Loading account dashboard');

  const wishlistStatusNodes = collectVNodes(wishlistTree.output, (n) => n.props?.role === 'status');
  assert.equal(wishlistStatusNodes.length, 1, 'Wishlist loading skeleton must render role="status"');
  assert.equal(wishlistStatusNodes[0].props['aria-label'], 'Loading your wishlist');

  // Ensure neither skeleton renders a <nav> element or private data
  const navNodes = [
    ...collectVNodes(accountTree.output, (n) => n.type === 'nav'),
    ...collectVNodes(wishlistTree.output, (n) => n.type === 'nav'),
  ];
  assert.equal(navNodes.length, 0, 'Loading skeletons must not render any navigation bar');
});

// =============================================================================
// 12. STAGE 1A IMPROVEMENTS REMAIN FUNCTIONAL
// =============================================================================

test('Task 12: Stage 1A wishlist single-query read, customer isolation, order history pagination, and clean AccountLayout remain intact', () => {
  // 1. Wishlist single-query read & strict user isolation
  const wishlistActions = readSource('lib/wishlist/actions.ts');
  assert.match(wishlistActions, /wishlists!inner\s*\(\s*user_id\s*\)/);
  assert.match(wishlistActions, /\.eq\(['"]wishlists\.user_id['"],\s*user\.id\)/);

  const rows: RawWishlistRow[] = [
    {
      id: 'wi-own',
      created_at: '2026-10-22T10:00:00Z',
      wishlists: { user_id: 'cust-1' },
      products: { id: 'p-1', name: 'Gold Ring', slug: 'gold-ring' },
      product_variants: { id: 'v-1', title: 'Standard', sku: 'SKU-1', price: 10000, discount_price: null, stock_status: 'in_stock' },
    },
    {
      id: 'wi-other',
      created_at: '2026-10-22T10:00:00Z',
      wishlists: { user_id: 'cust-2' },
      products: { id: 'p-2', name: 'Other Ring', slug: 'other-ring' },
      product_variants: null,
    },
  ];
  assert.equal(isWishlistRowOwnedByUser(rows[0], 'cust-1'), true);
  assert.equal(isWishlistRowOwnedByUser(rows[1], 'cust-1'), false);
  assert.equal(mapWishlistRowsForUser(rows, 'cust-1').length, 1);

  // 2. Order history pagination (10 per page)
  assert.equal(CUSTOMER_ORDERS_PAGE_SIZE, 10);
  assert.equal(parseOrdersPageParam('2'), 2);
  assert.deepEqual(calculateOrdersPaginationRange(2, 10), {
    page: 2,
    pageSize: 10,
    from: 10,
    to: 19,
  });
  const meta = buildOrdersPaginationMeta(25, 2, 10);
  assert.equal(meta.hasPreviousPage, true);
  assert.equal(meta.hasNextPage, true);

  // 3. No duplicate AccountNav bar in app/(store)/account/layout.tsx
  const accountLayout = readSource('app/(store)/account/layout.tsx');
  assert.doesNotMatch(accountLayout, /AccountNav/);
  assert.equal(existsSync(join(WORKSPACE_DIR, 'components/store/account-nav.tsx')), false);
});
