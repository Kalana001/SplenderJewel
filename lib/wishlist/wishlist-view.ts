import type { WishlistProduct } from '@/types/wishlist';
import type { AddToCartInput, AddToCartResult } from '@/lib/cart/cart-context';
import type { VariantAvailabilityResult } from '@/lib/cart/actions';

/**
 * Pure presentation, eligibility and orchestration logic for the customer wishlist.
 *
 * This module intentionally contains no React, JSX or runtime path-alias imports
 * (only type imports, which are erased) so that it can be shared by the client
 * component and executed directly by the Node.js test runner.
 *
 * It does NOT perform any database work itself. Server operations are injected
 * (see `moveWishlistItemToCart`) so the existing authorized Server Actions remain
 * the single source of truth for wishlist ownership and stock verification.
 */

// -----------------------------------------------------------------------------
// Pricing
// -----------------------------------------------------------------------------

export interface WishlistPricing {
  currentPrice: number;
  originalPrice: number;
  hasDiscount: boolean;
  discountPercent: number;
}

/**
 * Mirrors the storefront pricing rule: a discount applies only when the
 * discount price is a positive number strictly lower than the regular price.
 */
export function getWishlistPricing(
  item: Pick<WishlistProduct, 'price' | 'discountPrice'>
): WishlistPricing {
  const originalPrice = Number.isFinite(item.price) ? Math.max(0, item.price) : 0;
  const discount = item.discountPrice;
  const hasDiscount =
    typeof discount === 'number' &&
    Number.isFinite(discount) &&
    discount > 0 &&
    discount < originalPrice;

  const currentPrice = hasDiscount ? (discount as number) : originalPrice;
  const discountPercent =
    hasDiscount && originalPrice > 0
      ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
      : 0;

  return { currentPrice, originalPrice, hasDiscount, discountPercent };
}

// -----------------------------------------------------------------------------
// Stock display
// -----------------------------------------------------------------------------

export type WishlistStockTone = 'success' | 'warning' | 'danger';

export interface WishlistStockDisplay {
  label: string;
  tone: WishlistStockTone;
}

/**
 * Returns a customer-facing stock label, or `null` when stock cannot be stated
 * (no variant selected or an unrecognised status).
 */
export function getWishlistStockDisplay(
  item: Pick<WishlistProduct, 'variantId' | 'stockStatus'>
): WishlistStockDisplay | null {
  if (!item.variantId) return null;
  switch (item.stockStatus) {
    case 'out_of_stock':
      return { label: 'Out of Stock', tone: 'danger' };
    case 'low_stock':
      return { label: 'Low Stock', tone: 'warning' };
    case 'in_stock':
      return { label: 'In Stock', tone: 'success' };
    default:
      return null;
  }
}

// -----------------------------------------------------------------------------
// Links, labels and counts
// -----------------------------------------------------------------------------

export function getWishlistProductHref(item: Pick<WishlistProduct, 'slug'>): string | null {
  const slug = typeof item.slug === 'string' ? item.slug.trim() : '';
  return slug ? `/products/${encodeURIComponent(slug)}` : null;
}

export function getWishlistImageAlt(
  item: Pick<WishlistProduct, 'productName' | 'variantTitle'>
): string {
  const name = item.productName?.trim() || 'Jewellery piece';
  return item.variantTitle ? `${name} — ${item.variantTitle}` : name;
}

export function formatSavedCount(count: number): string {
  const safe = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (safe === 0) return 'No saved pieces';
  return safe === 1 ? '1 saved piece' : `${safe} saved pieces`;
}

export function removeWishlistItem<T extends { id: string }>(items: T[], itemId: string): T[] {
  return items.filter((item) => item.id !== itemId);
}

// -----------------------------------------------------------------------------
// Cart eligibility
// -----------------------------------------------------------------------------

export type WishlistCartEligibility =
  | { kind: 'add'; variantId: string }
  | { kind: 'select-options'; href: string }
  | { kind: 'out-of-stock' }
  | { kind: 'unavailable' };

/**
 * Decides which primary action a wishlist card may offer.
 * An item may only be added to the cart when it is linked to a concrete variant.
 * Items saved without a variant must be configured on the product page first.
 */
export function getWishlistCartEligibility(
  item: Pick<WishlistProduct, 'productId' | 'variantId' | 'stockStatus' | 'slug'>
): WishlistCartEligibility {
  if (!item.productId) return { kind: 'unavailable' };

  if (!item.variantId) {
    const href = getWishlistProductHref(item);
    return href ? { kind: 'select-options', href } : { kind: 'unavailable' };
  }

  if (item.stockStatus === 'out_of_stock') return { kind: 'out-of-stock' };

  return { kind: 'add', variantId: item.variantId };
}

/**
 * Builds the cart payload for a wishlist item using the server-verified stock
 * ceiling. Returns `null` when no valid variant exists — a product ID is never
 * substituted for a variant ID.
 */
export function buildWishlistCartInput(
  item: WishlistProduct,
  verifiedAvailableStock: number
): AddToCartInput | null {
  if (!item.variantId || !item.productId) return null;

  const maxStock = Number.isFinite(verifiedAvailableStock)
    ? Math.max(0, Math.floor(verifiedAvailableStock))
    : 0;

  return {
    productId: item.productId,
    variantId: item.variantId,
    productName: item.productName,
    variantTitle: item.variantTitle || 'Standard',
    sku: item.sku || `SJ-${item.productId.slice(0, 6)}`,
    price: item.price,
    discountPrice: item.discountPrice ?? null,
    imageUrl: item.imageUrl ?? null,
    slug: item.slug,
    maxStock,
  };
}

// -----------------------------------------------------------------------------
// Error sanitisation
// -----------------------------------------------------------------------------

export const WISHLIST_SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';
export const WISHLIST_SERVICE_UNAVAILABLE_MESSAGE =
  'Our wishlist service is temporarily unavailable. Please try again shortly.';
export const WISHLIST_ITEM_MISSING_MESSAGE =
  'This piece is no longer in your wishlist. Please refresh the page.';

/**
 * Converts any server or runtime error into a customer-safe message.
 * Raw database, network or authentication internals are never surfaced;
 * unknown messages fall back to the supplied friendly text.
 */
export function toSafeWishlistError(raw: unknown, fallback: string): string {
  const message =
    typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : '';

  switch (message) {
    case 'UNAUTHORIZED_CUSTOMER':
      return WISHLIST_SESSION_EXPIRED_MESSAGE;
    case 'Database service is currently unavailable.':
      return WISHLIST_SERVICE_UNAVAILABLE_MESSAGE;
    case 'Unauthorized or item not found.':
      return WISHLIST_ITEM_MISSING_MESSAGE;
    default:
      return fallback;
  }
}

// -----------------------------------------------------------------------------
// Move-to-cart orchestration
// -----------------------------------------------------------------------------

export interface MoveToCartDependencies {
  /** Existing server-side availability check (checkVariantAvailabilityAction). */
  checkAvailability: (variantId: string) => Promise<VariantAvailabilityResult>;
  /** Existing cart context `addItem`, which enforces stock ceilings. */
  addToCart: (input: AddToCartInput) => Pick<AddToCartResult, 'success' | 'error'>;
  /** Existing authorized wishlist removal Server Action. */
  removeFromWishlist: (wishlistItemId: string) => Promise<{ success: boolean; error?: string }>;
}

export type MoveToCartOutcome =
  | { status: 'moved' }
  | { status: 'added-not-removed'; message: string }
  | { status: 'blocked'; message: string }
  | { status: 'failed'; message: string };

export const MOVE_TO_CART_MESSAGES = {
  selectOptions: 'Please choose your preferred option on the product page before adding this piece to your cart.',
  outOfStock: 'This piece is currently out of stock.',
  unavailable: 'This piece is no longer available.',
  verifyFailed: "We couldn't verify stock right now. Please try again.",
  addFailed: 'This piece could not be added to your cart.',
  notRemoved: 'Added to your cart, but we could not remove it from your wishlist. You can remove it manually.',
} as const;

/**
 * Moves a wishlist item into the cart while preserving every existing safeguard:
 * 1. Requires a concrete variant.
 * 2. Verifies live stock on the server before touching the cart.
 * 3. Passes the verified stock ceiling to the cart, which enforces it.
 * 4. Only removes the wishlist entry after the cart accepted the item.
 */
export async function moveWishlistItemToCart(
  item: WishlistProduct,
  deps: MoveToCartDependencies
): Promise<MoveToCartOutcome> {
  const eligibility = getWishlistCartEligibility(item);
  if (eligibility.kind === 'select-options') {
    return { status: 'blocked', message: MOVE_TO_CART_MESSAGES.selectOptions };
  }
  if (eligibility.kind === 'out-of-stock') {
    return { status: 'blocked', message: MOVE_TO_CART_MESSAGES.outOfStock };
  }
  if (eligibility.kind === 'unavailable') {
    return { status: 'blocked', message: MOVE_TO_CART_MESSAGES.unavailable };
  }

  let availability: VariantAvailabilityResult;
  try {
    availability = await deps.checkAvailability(eligibility.variantId);
  } catch {
    return { status: 'failed', message: MOVE_TO_CART_MESSAGES.verifyFailed };
  }

  if (!availability || !availability.isAvailable) {
    return { status: 'blocked', message: MOVE_TO_CART_MESSAGES.unavailable };
  }
  if (!availability.inStock || availability.availableStock <= 0) {
    return { status: 'blocked', message: MOVE_TO_CART_MESSAGES.outOfStock };
  }

  const input = buildWishlistCartInput(item, availability.availableStock);
  if (!input) {
    return { status: 'blocked', message: MOVE_TO_CART_MESSAGES.selectOptions };
  }

  const cartResult = deps.addToCart(input);
  if (!cartResult.success) {
    // Cart errors are generated client-side by the cart context and are customer-safe.
    return { status: 'blocked', message: cartResult.error || MOVE_TO_CART_MESSAGES.addFailed };
  }

  try {
    const removal = await deps.removeFromWishlist(item.id);
    if (!removal.success) {
      return { status: 'added-not-removed', message: MOVE_TO_CART_MESSAGES.notRemoved };
    }
  } catch {
    return { status: 'added-not-removed', message: MOVE_TO_CART_MESSAGES.notRemoved };
  }

  return { status: 'moved' };
}
