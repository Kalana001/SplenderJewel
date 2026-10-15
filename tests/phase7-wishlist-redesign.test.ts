import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildWishlistCartInput,
  formatSavedCount,
  getWishlistCartEligibility,
  getWishlistImageAlt,
  getWishlistPricing,
  getWishlistProductHref,
  getWishlistStockDisplay,
  moveWishlistItemToCart,
  removeWishlistItem,
  toSafeWishlistError,
  MOVE_TO_CART_MESSAGES,
  WISHLIST_SESSION_EXPIRED_MESSAGE,
  WISHLIST_SERVICE_UNAVAILABLE_MESSAGE,
  WISHLIST_ITEM_MISSING_MESSAGE,
  type MoveToCartDependencies,
} from '../lib/wishlist/wishlist-view.ts';
import {
  INITIAL_CONFIRM_DIALOG_STATE,
  canDismissDialog,
  confirmDialogReducer,
  executeGuardedConfirm,
  getNextFocusIndex,
  isBackdropDismissal,
  isDialogOpen,
  isEscapeKey,
  isTabKey,
  selectFocusReturnTarget,
  canRestoreFocusTo,
  FOCUSABLE_SELECTOR,
  type ConfirmDialogEvent,
  type ConfirmDialogState,
  type ConfirmDismissReason,
} from '../lib/ui/confirm-dialog-logic.ts';
import type { WishlistProduct } from '../types/wishlist.ts';

// =============================================================================
// TEST SUITE: PHASE 7 WISHLIST REDESIGN & CLEAR ALL CONFIRMATION
// =============================================================================

const ROOT = process.cwd();
const readSource = (relativePath: string) => readFileSync(join(ROOT, relativePath), 'utf8');

const VARIANT_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';

function makeItem(overrides: Partial<WishlistProduct> = {}): WishlistProduct {
  return {
    id: 'wi-1',
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    productName: 'Aurora Gold Ring',
    slug: 'aurora-gold-ring',
    variantTitle: 'Size 7 / Yellow Gold',
    sku: 'SJ-AUR-7',
    price: 12500,
    discountPrice: null,
    imageUrl: 'https://cdn.example.com/aurora.jpg',
    stockStatus: 'in_stock',
    addedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Simulated Clear All interaction session. Drives the exact reducer and guarded
 * executor used by WishlistManager, with an injectable fake `clearWishlist`
 * server action, and records every observable side effect.
 */
class ClearWishlistSession {
  state: ConfirmDialogState = INITIAL_CONFIRM_DIALOG_STATE;
  items: WishlistProduct[];
  feedback: { type: 'success' | 'error'; message: string } | null = null;
  readonly guard = { current: false };
  readonly events: ConfirmDialogEvent[] = [];
  serverCalls = 0;
  serverAction: () => Promise<{ success: boolean; error?: string }>;

  constructor(
    items: WishlistProduct[],
    serverAction: () => Promise<{ success: boolean; error?: string }>
  ) {
    this.items = items;
    this.serverAction = serverAction;
  }

  dispatch = (event: ConfirmDialogEvent) => {
    this.events.push(event);
    this.state = confirmDialogReducer(this.state, event);
  };

  clickClearAll() {
    this.feedback = null;
    this.dispatch({ type: 'OPEN' });
  }

  dismiss(reason: ConfirmDismissReason) {
    // The component only forwards dismissals when not pending; the reducer also guards.
    this.dispatch({ type: 'DISMISS', reason });
  }

  pressKey(key: string) {
    if (isEscapeKey(key) && this.state.phase !== 'pending') this.dismiss('escape');
  }

  confirm() {
    return executeGuardedConfirm(
      this.guard,
      async () => {
        this.serverCalls += 1;
        return this.serverAction();
      },
      this.dispatch,
      {
        toErrorMessage: (raw) => toSafeWishlistError(raw, 'CLEAR_FAILED_SAFE_MESSAGE'),
        onSuccess: () => {
          this.items = [];
          this.feedback = { type: 'success', message: 'Your wishlist has been cleared.' };
        },
      }
    );
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeCartDeps(overrides: Partial<MoveToCartDependencies> = {}) {
  const calls = { availability: [] as string[], cart: [] as any[], removed: [] as string[] };
  const deps: MoveToCartDependencies = {
    checkAvailability: async (variantId) => {
      calls.availability.push(variantId);
      return { isAvailable: true, inStock: true, availableStock: 4 };
    },
    addToCart: (input) => {
      calls.cart.push(input);
      return { success: true };
    },
    removeFromWishlist: async (id) => {
      calls.removed.push(id);
      return { success: true };
    },
    ...overrides,
  };
  return { deps, calls };
}

// -----------------------------------------------------------------------------
// 1. Mobile wishlist card rendering
// -----------------------------------------------------------------------------

test('Wishlist Card: display model exposes price, variant, stock and actions for a standard item', () => {
  const item = makeItem({ price: 15000, discountPrice: 12000 });
  const pricing = getWishlistPricing(item);
  assert.deepEqual(pricing, { currentPrice: 12000, originalPrice: 15000, hasDiscount: true, discountPercent: 20 });
  assert.deepEqual(getWishlistStockDisplay(item), { label: 'In Stock', tone: 'success' });
  assert.deepEqual(getWishlistCartEligibility(item), { kind: 'add', variantId: VARIANT_ID });
  assert.equal(getWishlistProductHref(item), '/products/aurora-gold-ring');
});

test('Wishlist Card: pricing ignores invalid, zero or higher-than-price discounts', () => {
  assert.equal(getWishlistPricing({ price: 10000, discountPrice: 0 }).hasDiscount, false);
  assert.equal(getWishlistPricing({ price: 10000, discountPrice: 12000 }).hasDiscount, false);
  assert.equal(getWishlistPricing({ price: 10000, discountPrice: 10000 }).hasDiscount, false);
  assert.equal(getWishlistPricing({ price: 10000, discountPrice: null }).currentPrice, 10000);
  assert.equal(getWishlistPricing({ price: Number.NaN, discountPrice: null }).currentPrice, 0);
});

test('Wishlist Card: stock labels map low and out-of-stock statuses', () => {
  assert.deepEqual(getWishlistStockDisplay(makeItem({ stockStatus: 'low_stock' })), { label: 'Low Stock', tone: 'warning' });
  assert.deepEqual(getWishlistStockDisplay(makeItem({ stockStatus: 'out_of_stock' })), { label: 'Out of Stock', tone: 'danger' });
  assert.equal(getWishlistStockDisplay(makeItem({ stockStatus: 'mystery' })), null);
});

test('Wishlist Layout: compact horizontal mobile cards, 2-col tablet and 3/4-col desktop grid', () => {
  const source = readSource('components/store/wishlist-manager.tsx');
  // Grid breakpoints
  assert.match(source, /grid grid-cols-1[^"]*md:grid-cols-2[^"]*lg:grid-cols-3[^"]*xl:grid-cols-4/);
  // Mobile image width ~100-120px, scaling across small-phone breakpoints, full width on desktop
  assert.match(source, /w-\[100px\][^"]*min-\[375px\]:w-\[110px\][^"]*min-\[430px\]:w-\[120px\][^"]*lg:w-full/);
  // Horizontal on mobile/tablet, vertical on desktop
  assert.match(source, /flex flex-1 gap-3[^"]*lg:flex-col/);
  // Comfortable touch targets for remove action
  assert.match(source, /h-11 w-11/);
  // Uses existing LKR currency formatter
  assert.match(source, /formatCurrency\(pricing\.currentPrice\)/);
});

// -----------------------------------------------------------------------------
// 2. Long product names
// -----------------------------------------------------------------------------

test('Wishlist Card: long product names are preserved in data and wrap/clamp safely in markup', () => {
  const longName = 'Handcrafted Eighteen-Karat Rose Gold Ethiopian Opal and Pavé Diamond Statement Cocktail Ring '.repeat(3).trim();
  const unbroken = 'Supercalifragilisticexpialidocious'.repeat(5);
  const item = makeItem({ productName: longName });

  assert.equal(getWishlistImageAlt(item), `${longName} — Size 7 / Yellow Gold`);
  assert.equal(getWishlistImageAlt(makeItem({ productName: unbroken, variantTitle: null })), unbroken);
  assert.equal(getWishlistImageAlt(makeItem({ productName: '   ', variantTitle: null })), 'Jewellery piece');

  const source = readSource('components/store/wishlist-manager.tsx');
  assert.match(source, /\[overflow-wrap:anywhere\]/, 'unbroken strings must not overflow the card');
  assert.match(source, /line-clamp-2/, 'names clamp to two lines');
  assert.match(source, /title=\{item\.productName\}/, 'full name remains available via title');
  assert.match(source, /min-w-0 flex-1 flex-col/, 'details column can shrink without forcing horizontal scroll');
});

// -----------------------------------------------------------------------------
// 3. Missing product images
// -----------------------------------------------------------------------------

test('Wishlist Card: missing or broken images fall back to a branded placeholder', () => {
  const source = readSource('components/store/wishlist-manager.tsx');
  assert.match(source, /onError=\{\(\) => setFailedUrl\(src\)\}/, 'broken URLs switch to placeholder');
  assert.match(source, /item\.imageUrl && item\.imageUrl !== failedUrl \? item\.imageUrl : null/);
  assert.match(source, /No image available for \{item\.productName\}/, 'placeholder has accessible text');
  assert.match(source, /aspect-square/, 'image container keeps a fixed aspect ratio');

  const noImage = makeItem({ imageUrl: null });
  const input = buildWishlistCartInput(noImage, 3);
  assert.equal(input?.imageUrl, null, 'cart payload tolerates missing images');
});

// -----------------------------------------------------------------------------
// 4. Variant information
// -----------------------------------------------------------------------------

test('Wishlist Variants: items without a variant require option selection and never reach the cart', () => {
  const noVariant = makeItem({ variantId: null, variantTitle: null });
  assert.deepEqual(getWishlistCartEligibility(noVariant), { kind: 'select-options', href: '/products/aurora-gold-ring' });
  assert.equal(buildWishlistCartInput(noVariant, 5), null, 'product id is never substituted for a variant id');
  assert.equal(getWishlistStockDisplay(noVariant), null, 'stock is not claimed without a variant');

  assert.deepEqual(getWishlistCartEligibility(makeItem({ variantId: null, slug: '' })), { kind: 'unavailable' });
  assert.deepEqual(getWishlistCartEligibility(makeItem({ productId: '' })), { kind: 'unavailable' });
});

test('Wishlist Variants: cart payload preserves variant data and existing fallbacks', () => {
  const input = buildWishlistCartInput(makeItem({ discountPrice: 9900 }), 7.9);
  assert.deepEqual(input, {
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    productName: 'Aurora Gold Ring',
    variantTitle: 'Size 7 / Yellow Gold',
    sku: 'SJ-AUR-7',
    price: 12500,
    discountPrice: 9900,
    imageUrl: 'https://cdn.example.com/aurora.jpg',
    slug: 'aurora-gold-ring',
    maxStock: 7,
  });

  const fallback = buildWishlistCartInput(makeItem({ variantTitle: null, sku: null }), -3);
  assert.equal(fallback?.variantTitle, 'Standard');
  assert.equal(fallback?.sku, `SJ-${PRODUCT_ID.slice(0, 6)}`);
  assert.equal(fallback?.maxStock, 0);
});

// -----------------------------------------------------------------------------
// 5. Empty wishlist state
// -----------------------------------------------------------------------------

test('Wishlist Empty State: approved copy, shop link and focus fallback target', () => {
  const source = readSource('components/store/wishlist-manager.tsx');
  assert.match(source, /Your Wishlist Is Waiting/);
  assert.match(source, /Save the pieces you love and find them here whenever you&apos;re ready\./);
  assert.match(source, /Explore Jewellery/);
  assert.match(source, /href="\/shop"/);
  assert.match(source, /ref=\{headingRef\}\s+tabIndex=\{-1\}/, 'empty heading can receive focus after clearing');
  assert.equal(formatSavedCount(0), 'No saved pieces');
});

test('Wishlist Load Error: page never forwards raw database errors and offers retry', () => {
  const page = readSource('app/(store)/account/wishlist/page.tsx');
  assert.doesNotMatch(page, /res\.error/, 'raw server error must not reach the client');
  assert.match(page, /loadError=\{loadError\}/);
  assert.match(page, /key=\{res\.success \? 'ready' : 'error'\}/, 'successful retry remounts with fresh data');

  const manager = readSource('components/store/wishlist-manager.tsx');
  assert.match(manager, /startRetry\(\(\) => router\.refresh\(\)\)/);
  assert.match(manager, /We Couldn&apos;t Load Your Wishlist/);

  const loading = readSource('app/(store)/account/wishlist/loading.tsx');
  assert.match(loading, /role="status"/);
  assert.match(loading, /md:grid-cols-2[^"]*lg:grid-cols-3[^"]*xl:grid-cols-4/, 'skeleton mirrors real grid');
});

// -----------------------------------------------------------------------------
// 6. Opening the Clear All modal
// -----------------------------------------------------------------------------

test('Clear All Modal: clicking Clear All opens the dialog without contacting the server', () => {
  const session = new ClearWishlistSession([makeItem()], async () => ({ success: true }));
  assert.equal(isDialogOpen(session.state), false);
  session.clickClearAll();
  assert.equal(session.state.phase, 'open');
  assert.equal(session.state.error, null);
  assert.equal(session.serverCalls, 0);
  // Re-opening while open is a no-op
  session.clickClearAll();
  assert.equal(session.state.phase, 'open');
});

test('Clear All Modal: native window.confirm is removed and dialog uses approved copy and semantics', () => {
  const manager = readSource('components/store/wishlist-manager.tsx');
  assert.doesNotMatch(manager, /window\.confirm|\bconfirm\(/);
  assert.match(manager, /title="Clear Your Wishlist\?"/);
  assert.match(manager, /description="This will remove all saved items from your wishlist\. This action cannot be undone\."/);
  assert.match(manager, /cancelLabel="Keep Items"/);
  assert.match(manager, /confirmLabel="Clear Wishlist"/);
  assert.match(manager, /returnFocusRef=\{clearTriggerRef\}/);

  const dialog = readSource('components/ui/confirm-dialog.tsx');
  assert.match(dialog, /role="alertdialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /aria-labelledby=\{titleId\}/);
  assert.match(dialog, /aria-describedby=\{descriptionId\}/);
  assert.match(dialog, /createPortal/);
  assert.match(dialog, /border-luxury-gold\/30 bg-luxury-charcoal/, 'charcoal panel with gold border');
});

// -----------------------------------------------------------------------------
// 7. Cancelling without deleting items
// -----------------------------------------------------------------------------

test('Clear All Modal: Keep Items and backdrop click close the dialog without modifying data', () => {
  const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
  const session = new ClearWishlistSession(items, async () => ({ success: true }));

  session.clickClearAll();
  session.dismiss('cancel');
  assert.equal(session.state.phase, 'closed');
  assert.equal(session.items.length, 2);
  assert.equal(session.serverCalls, 0);

  session.clickClearAll();
  const backdrop = { id: 'backdrop' };
  assert.equal(isBackdropDismissal(true, backdrop, backdrop), true);
  session.dismiss('backdrop');
  assert.equal(session.state.phase, 'closed');
  assert.equal(session.items.length, 2);
  assert.equal(session.serverCalls, 0);
});

test('Clear All Modal: clicks that start inside the panel or land on the panel never dismiss', () => {
  const backdrop = { id: 'backdrop' };
  const panelButton = { id: 'button' };
  assert.equal(isBackdropDismissal(false, backdrop, backdrop), false, 'drag from panel to backdrop');
  assert.equal(isBackdropDismissal(true, panelButton, backdrop), false, 'click inside panel');
  assert.equal(isBackdropDismissal(true, null, backdrop), false);
});

// -----------------------------------------------------------------------------
// 8. Confirming deletion
// -----------------------------------------------------------------------------

test('Clear All Modal: confirming clears items only after server success and closes the dialog', async () => {
  const pending = deferred<{ success: boolean }>();
  const session = new ClearWishlistSession([makeItem({ id: 'a' }), makeItem({ id: 'b' })], () => pending.promise);

  session.clickClearAll();
  const run = session.confirm();

  // While pending: loading state, items untouched, no success shown
  assert.equal(session.state.phase, 'pending');
  assert.equal(session.items.length, 2);
  assert.equal(session.feedback, null);

  pending.resolve({ success: true });
  assert.equal(await run, 'success');
  assert.equal(session.state.phase, 'closed');
  assert.deepEqual(session.items, []);
  assert.deepEqual(session.feedback, { type: 'success', message: 'Your wishlist has been cleared.' });
  assert.equal(session.serverCalls, 1);
  assert.equal(session.guard.current, false);
});

test('Clear All Server Action: deletion and lookup errors are propagated instead of reporting success', () => {
  const actions = readSource('lib/wishlist/actions.ts');
  const clearFn = actions.slice(actions.indexOf('export async function clearWishlist'));
  assert.match(clearFn, /requireCustomerAuth\(\)/, 'ownership is still enforced');
  assert.match(clearFn, /error: wishlistError/);
  assert.match(clearFn, /const \{ error: deleteError \}/);
  assert.match(clearFn, /if \(deleteError\) \{\s*return \{ success: false/);
  assert.match(clearFn, /\.eq\('wishlist_id', wishlist\.id\)/, 'deletion remains scoped to the caller wishlist');
});

// -----------------------------------------------------------------------------
// 9. Server-side deletion failure
// -----------------------------------------------------------------------------

test('Clear All Modal: server failure preserves items, shows a safe error and keeps dialog open for retry', async () => {
  const session = new ClearWishlistSession([makeItem({ id: 'a' })], async () => ({
    success: false,
    error: 'relation "wishlist_items" violates row-level security policy',
  }));

  session.clickClearAll();
  assert.equal(await session.confirm(), 'failure');
  assert.equal(session.state.phase, 'open');
  assert.equal(session.state.error, 'CLEAR_FAILED_SAFE_MESSAGE', 'raw database error is never shown');
  assert.equal(session.items.length, 1);
  assert.equal(session.feedback, null, 'no success message on failure');
  assert.equal(canDismissDialog(session.state), true, 'user can Keep Items after a failure');

  // Retry succeeds
  (session as any).serverAction = async () => ({ success: true });
  assert.equal(await session.confirm(), 'success');
  assert.deepEqual(session.items, []);
});

test('Clear All Modal: thrown errors and expired sessions map to customer-safe messages', async () => {
  const thrown = new ClearWishlistSession([makeItem()], async () => {
    throw new Error('fetch failed: ECONNRESET 10.0.0.12:5432');
  });
  thrown.clickClearAll();
  assert.equal(await thrown.confirm(), 'failure');
  assert.equal(thrown.state.error, 'CLEAR_FAILED_SAFE_MESSAGE');
  assert.equal(thrown.items.length, 1);

  const expired = new ClearWishlistSession([makeItem()], async () => ({ success: false, error: 'UNAUTHORIZED_CUSTOMER' }));
  expired.clickClearAll();
  await expired.confirm();
  assert.equal(expired.state.error, WISHLIST_SESSION_EXPIRED_MESSAGE);
});

// -----------------------------------------------------------------------------
// 10. Duplicate-click prevention
// -----------------------------------------------------------------------------

test('Clear All Modal: rapid repeated confirms trigger exactly one server call', async () => {
  const pending = deferred<{ success: boolean }>();
  const session = new ClearWishlistSession([makeItem()], () => pending.promise);
  session.clickClearAll();

  const first = session.confirm();
  const second = session.confirm();
  const third = session.confirm();

  assert.equal(await second, 'ignored');
  assert.equal(await third, 'ignored');
  assert.equal(session.serverCalls, 1);

  pending.resolve({ success: true });
  assert.equal(await first, 'success');
  assert.equal(session.events.filter((e) => e.type === 'CONFIRM_START').length, 1);
});

test('Clear All Modal: dismissal is blocked on every path while deletion is in progress', async () => {
  const pending = deferred<{ success: boolean }>();
  const session = new ClearWishlistSession([makeItem()], () => pending.promise);
  session.clickClearAll();
  const run = session.confirm();

  for (const reason of ['cancel', 'escape', 'backdrop'] as const) {
    session.dismiss(reason);
    assert.equal(session.state.phase, 'pending', `${reason} must not dismiss while pending`);
  }
  assert.equal(canDismissDialog(session.state), false);

  pending.resolve({ success: true });
  await run;
  assert.equal(session.state.phase, 'closed');

  const dialog = readSource('components/ui/confirm-dialog.tsx');
  assert.match(dialog, /if \(shouldDismiss && !isPending\) onDismiss\('backdrop'\)/);
  assert.match(dialog, /if \(!latestRef\.current\.isPending\) latestRef\.current\.onDismiss\('escape'\)/);
  assert.match(dialog, /aria-disabled=\{isPending \|\| undefined\}/, 'focus is kept while pending');
});

// -----------------------------------------------------------------------------
// 11. Keyboard Escape behaviour
// -----------------------------------------------------------------------------

test('Clear All Modal: Escape closes the open dialog but not while pending', async () => {
  assert.equal(isEscapeKey('Escape'), true);
  assert.equal(isEscapeKey('Esc'), true);
  assert.equal(isEscapeKey('Enter'), false);
  assert.equal(isTabKey('Tab'), true);

  const session = new ClearWishlistSession([makeItem()], async () => ({ success: true }));
  session.clickClearAll();
  session.pressKey('Enter');
  assert.equal(session.state.phase, 'open');
  session.pressKey('Escape');
  assert.equal(session.state.phase, 'closed');
  assert.equal(session.items.length, 1);

  const pending = deferred<{ success: boolean }>();
  const busy = new ClearWishlistSession([makeItem()], () => pending.promise);
  busy.clickClearAll();
  const run = busy.confirm();
  busy.pressKey('Escape');
  assert.equal(busy.state.phase, 'pending');
  pending.resolve({ success: false });
  await run;
});

// -----------------------------------------------------------------------------
// 12. Dialog focus management
// -----------------------------------------------------------------------------

test('Dialog Focus: Tab and Shift+Tab cycle within the dialog and never escape', () => {
  // Two buttons: Keep Items (0) and Clear Wishlist (1)
  assert.equal(getNextFocusIndex(0, 2, false), 1);
  assert.equal(getNextFocusIndex(1, 2, false), 0, 'wraps forward');
  assert.equal(getNextFocusIndex(0, 2, true), 1, 'wraps backward');
  assert.equal(getNextFocusIndex(1, 2, true), 0);
  // Focus on container / outside the trap
  assert.equal(getNextFocusIndex(-1, 2, false), 0);
  assert.equal(getNextFocusIndex(-1, 2, true), 1);
  // Nothing focusable: stay on the dialog container
  assert.equal(getNextFocusIndex(0, 0, false), -1);
  // Single element stays put
  assert.equal(getNextFocusIndex(0, 1, false), 0);
  assert.ok(FOCUSABLE_SELECTOR.includes('button:not([disabled])'));
});

test('Dialog Focus: focus returns to the trigger when present, otherwise to the fallback', () => {
  const makeEl = (connected: boolean, disabled = false) => ({
    isConnected: connected,
    focus: () => undefined,
    hasAttribute: (name: string) => name === 'disabled' && disabled,
  });

  const trigger = makeEl(true);
  const fallback = makeEl(true);
  assert.equal(selectFocusReturnTarget(trigger, fallback), trigger, 'cancel/escape returns to Clear All');

  const removedTrigger = makeEl(false);
  assert.equal(selectFocusReturnTarget(removedTrigger, fallback), fallback, 'after clearing, empty-state heading');
  assert.equal(selectFocusReturnTarget(null, fallback), fallback);
  assert.equal(selectFocusReturnTarget(makeEl(true, true), fallback), fallback, 'disabled trigger is skipped');
  assert.equal(selectFocusReturnTarget(null, null), null);
  assert.equal(canRestoreFocusTo({ isConnected: true }), false, 'non-focusable objects rejected');

  const dialog = readSource('components/ui/confirm-dialog.tsx');
  assert.match(dialog, /\(cancelButtonRef\.current \?\? panelRef\.current\)\?\.focus\(\)/, 'initial focus on safe action');
  assert.match(dialog, /document\.addEventListener\('focusin', handleFocusIn\)/, 'focus pulled back into dialog');
  assert.match(dialog, /document\.body\.style\.overflow = 'hidden'/, 'background scroll locked');
});

// -----------------------------------------------------------------------------
// 13. Individual item removal
// -----------------------------------------------------------------------------

test('Wishlist Removal: removes only the targeted item and preserves order', () => {
  const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' }), makeItem({ id: 'c' })];
  assert.deepEqual(removeWishlistItem(items, 'b').map((i) => i.id), ['a', 'c']);
  assert.deepEqual(removeWishlistItem(items, 'missing').map((i) => i.id), ['a', 'b', 'c']);
  assert.equal(items.length, 3, 'input array is not mutated');
});

test('Wishlist Removal: server errors are sanitised before display', () => {
  assert.equal(toSafeWishlistError('Unauthorized or item not found.', 'fallback'), WISHLIST_ITEM_MISSING_MESSAGE);
  assert.equal(toSafeWishlistError('Database service is currently unavailable.', 'fallback'), WISHLIST_SERVICE_UNAVAILABLE_MESSAGE);
  assert.equal(toSafeWishlistError(new Error('UNAUTHORIZED_CUSTOMER'), 'fallback'), WISHLIST_SESSION_EXPIRED_MESSAGE);
  assert.equal(toSafeWishlistError('duplicate key value violates unique constraint "wishlist_items_pkey"', 'fallback'), 'fallback');
  assert.equal(toSafeWishlistError(undefined, 'fallback'), 'fallback');
  assert.equal(toSafeWishlistError({ message: 'secret' }, 'fallback'), 'fallback');

  const manager = readSource('components/store/wishlist-manager.tsx');
  assert.match(manager, /removeFromWishlist\(item\.id\)/, 'existing authorized Server Action is reused');
  assert.match(manager, /aria-label=\{`Remove \$\{item\.productName\} from wishlist`\}/);
});

// -----------------------------------------------------------------------------
// 14. Wishlist count synchronisation
// -----------------------------------------------------------------------------

test('Wishlist Count: label stays consistent through remove, move-to-cart and clear sequences', async () => {
  let items = [makeItem({ id: 'a' }), makeItem({ id: 'b' }), makeItem({ id: 'c' })];
  assert.equal(formatSavedCount(items.length), '3 saved pieces');

  items = removeWishlistItem(items, 'a');
  assert.equal(formatSavedCount(items.length), '2 saved pieces');

  const { deps } = makeCartDeps();
  const outcome = await moveWishlistItemToCart(items[0], deps);
  if (outcome.status === 'moved') items = removeWishlistItem(items, items[0].id);
  assert.equal(formatSavedCount(items.length), '1 saved piece');

  const session = new ClearWishlistSession(items, async () => ({ success: true }));
  session.clickClearAll();
  await session.confirm();
  assert.equal(formatSavedCount(session.items.length), 'No saved pieces');

  assert.equal(formatSavedCount(-4), 'No saved pieces');
  assert.equal(formatSavedCount(Number.NaN), 'No saved pieces');

  const manager = readSource('components/store/wishlist-manager.tsx');
  assert.match(manager, /formatSavedCount\(items\.length\)/, 'count derives from live client state');
});

// -----------------------------------------------------------------------------
// 15. Add-to-cart behaviour with valid variants
// -----------------------------------------------------------------------------

test('Move to Cart: valid in-stock variant is verified, added with stock ceiling, then removed from wishlist', async () => {
  const { deps, calls } = makeCartDeps();
  const outcome = await moveWishlistItemToCart(makeItem(), deps);
  assert.deepEqual(outcome, { status: 'moved' });
  assert.deepEqual(calls.availability, [VARIANT_ID]);
  assert.equal(calls.cart.length, 1);
  assert.equal(calls.cart[0].variantId, VARIANT_ID);
  assert.equal(calls.cart[0].maxStock, 4, 'server-verified stock is enforced by the cart');
  assert.deepEqual(calls.removed, ['wi-1']);
});

test('Move to Cart: missing variant or out-of-stock items never call the server or cart', async () => {
  const noVariant = makeCartDeps();
  assert.deepEqual(await moveWishlistItemToCart(makeItem({ variantId: null }), noVariant.deps), {
    status: 'blocked',
    message: MOVE_TO_CART_MESSAGES.selectOptions,
  });
  assert.equal(noVariant.calls.availability.length + noVariant.calls.cart.length + noVariant.calls.removed.length, 0);

  const oos = makeCartDeps();
  assert.deepEqual(await moveWishlistItemToCart(makeItem({ stockStatus: 'out_of_stock' }), oos.deps), {
    status: 'blocked',
    message: MOVE_TO_CART_MESSAGES.outOfStock,
  });
  assert.equal(oos.calls.availability.length + oos.calls.cart.length, 0);
});

test('Move to Cart: live stock verification failures block the cart and keep the wishlist item', async () => {
  const soldOut = makeCartDeps({ checkAvailability: async () => ({ isAvailable: true, inStock: false, availableStock: 0 }) });
  assert.equal((await moveWishlistItemToCart(makeItem(), soldOut.deps)).status, 'blocked');
  assert.equal(soldOut.calls.cart.length + soldOut.calls.removed.length, 0);

  const unpublished = makeCartDeps({
    checkAvailability: async () => ({ isAvailable: false, inStock: false, availableStock: 0, error: 'Product option is not available.' }),
  });
  assert.deepEqual(await moveWishlistItemToCart(makeItem(), unpublished.deps), {
    status: 'blocked',
    message: MOVE_TO_CART_MESSAGES.unavailable,
  });

  const network = makeCartDeps({
    checkAvailability: async () => {
      throw new Error('network down');
    },
  });
  assert.deepEqual(await moveWishlistItemToCart(makeItem(), network.deps), {
    status: 'failed',
    message: MOVE_TO_CART_MESSAGES.verifyFailed,
  });
  assert.equal(network.calls.cart.length + network.calls.removed.length, 0);
});

test('Move to Cart: cart rejection keeps the wishlist item; failed removal is reported honestly', async () => {
  const cartFull = makeCartDeps({
    addToCart: () => ({ success: false, error: 'All 4 available units are already in your bag.' }),
  });
  assert.deepEqual(await moveWishlistItemToCart(makeItem(), cartFull.deps), {
    status: 'blocked',
    message: 'All 4 available units are already in your bag.',
  });
  assert.equal(cartFull.calls.removed.length, 0, 'wishlist untouched when cart refuses');

  const removalFails = makeCartDeps({ removeFromWishlist: async () => ({ success: false, error: 'boom' }) });
  assert.deepEqual(await moveWishlistItemToCart(makeItem(), removalFails.deps), {
    status: 'added-not-removed',
    message: MOVE_TO_CART_MESSAGES.notRemoved,
  });

  const removalThrows = makeCartDeps({
    removeFromWishlist: async () => {
      throw new Error('boom');
    },
  });
  assert.equal((await moveWishlistItemToCart(makeItem(), removalThrows.deps)).status, 'added-not-removed');

  const manager = readSource('components/store/wishlist-manager.tsx');
  assert.doesNotMatch(manager, /variantId: item\.variantId \|\| item\.productId/, 'legacy product-id fallback removed');
  assert.match(manager, /checkAvailability: checkVariantAvailabilityAction/, 'existing stock verification reused');
});

// -----------------------------------------------------------------------------
// Reducer invariants
// -----------------------------------------------------------------------------

test('Confirm Dialog Reducer: ignores out-of-order events', () => {
  const closed = INITIAL_CONFIRM_DIALOG_STATE;
  assert.equal(confirmDialogReducer(closed, { type: 'CONFIRM_START' }), closed);
  assert.equal(confirmDialogReducer(closed, { type: 'CONFIRM_SUCCESS' }), closed);
  assert.equal(confirmDialogReducer(closed, { type: 'CONFIRM_FAILURE', error: 'x' }), closed);
  assert.equal(confirmDialogReducer(closed, { type: 'DISMISS', reason: 'escape' }), closed);

  const open = confirmDialogReducer(closed, { type: 'OPEN' });
  assert.equal(confirmDialogReducer(open, { type: 'CONFIRM_SUCCESS' }), open, 'success without start is ignored');

  const failed = confirmDialogReducer(confirmDialogReducer(open, { type: 'CONFIRM_START' }), {
    type: 'CONFIRM_FAILURE',
    error: 'Safe message',
  });
  assert.deepEqual(failed, { phase: 'open', error: 'Safe message' });
  assert.deepEqual(confirmDialogReducer(failed, { type: 'CONFIRM_START' }), { phase: 'pending', error: null }, 'retry clears error');
});
