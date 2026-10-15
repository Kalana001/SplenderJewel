'use client';

import React, { useCallback, useReducer, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Eye,
  Heart,
  Loader2,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatCurrency } from '@/lib/config/store';
import { useCart } from '@/lib/cart/cart-context';
import { checkVariantAvailabilityAction } from '@/lib/cart/actions';
import { removeFromWishlist, clearWishlist } from '@/lib/wishlist/actions';
import {
  formatSavedCount,
  getWishlistCartEligibility,
  getWishlistImageAlt,
  getWishlistPricing,
  getWishlistProductHref,
  getWishlistStockDisplay,
  moveWishlistItemToCart,
  removeWishlistItem,
  toSafeWishlistError,
  type WishlistStockTone,
} from '@/lib/wishlist/wishlist-view';
import {
  INITIAL_CONFIRM_DIALOG_STATE,
  confirmDialogReducer,
  executeGuardedConfirm,
  isDialogOpen,
  type ConfirmDismissReason,
} from '@/lib/ui/confirm-dialog-logic';
import type { WishlistProduct } from '@/types/wishlist';

interface WishlistManagerProps {
  initialItems: WishlistProduct[];
  /** Customer-safe message when the wishlist could not be loaded on the server. */
  loadError?: string | null;
}

type Feedback = { type: 'success' | 'error'; message: string } | null;

const CLEAR_FAILURE_MESSAGE =
  "We couldn't clear your wishlist. Your saved pieces are still here — please try again.";
const REMOVE_FAILURE_MESSAGE = "We couldn't remove this piece. Please try again.";

const STOCK_TONE_CLASSES: Record<WishlistStockTone, { dot: string; text: string }> = {
  success: { dot: 'bg-emerald-400', text: 'text-emerald-400' },
  warning: { dot: 'bg-amber-400', text: 'text-amber-400' },
  danger: { dot: 'bg-rose-400', text: 'text-rose-400' },
};

const goldLinkButtonClasses =
  'inline-flex items-center justify-center gap-2 rounded-sm bg-luxury-gold font-semibold tracking-wide text-luxury-black shadow-sm transition-colors hover:bg-luxury-gold-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luxury-gold/50';

export function WishlistManager({ initialItems, loadError = null }: WishlistManagerProps) {
  const router = useRouter();
  const { addItem } = useCart();

  const [items, setItems] = useState<WishlistProduct[]>(initialItems);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [dialogState, dispatchDialog] = useReducer(
    confirmDialogReducer,
    INITIAL_CONFIRM_DIALOG_STATE
  );
  const [isRetrying, startRetry] = useTransition();

  const clearTriggerRef = useRef<HTMLButtonElement>(null);
  const emptyHeadingRef = useRef<HTMLHeadingElement>(null);
  const clearInFlightRef = useRef(false);
  const itemInFlightRef = useRef<string | null>(null);

  const isClearing = dialogState.phase === 'pending';
  const isAnyOperationRunning = busyItemId !== null || isClearing;

  // ---------------------------------------------------------------------------
  // Individual item actions
  // ---------------------------------------------------------------------------

  const handleRemove = useCallback(async (item: WishlistProduct) => {
    if (itemInFlightRef.current || clearInFlightRef.current) return;
    itemInFlightRef.current = item.id;
    setBusyItemId(item.id);
    setFeedback(null);

    try {
      const res = await removeFromWishlist(item.id);
      if (res.success) {
        setItems((prev) => removeWishlistItem(prev, item.id));
        setFeedback({ type: 'success', message: `"${item.productName}" was removed from your wishlist.` });
      } else {
        setFeedback({ type: 'error', message: toSafeWishlistError(res.error, REMOVE_FAILURE_MESSAGE) });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: toSafeWishlistError(err, REMOVE_FAILURE_MESSAGE) });
    } finally {
      itemInFlightRef.current = null;
      setBusyItemId(null);
    }
  }, []);

  const handleMoveToCart = useCallback(
    async (item: WishlistProduct) => {
      if (itemInFlightRef.current || clearInFlightRef.current) return;
      itemInFlightRef.current = item.id;
      setBusyItemId(item.id);
      setFeedback(null);

      try {
        const outcome = await moveWishlistItemToCart(item, {
          checkAvailability: checkVariantAvailabilityAction,
          addToCart: (input) => addItem(input),
          removeFromWishlist,
        });

        switch (outcome.status) {
          case 'moved':
            setItems((prev) => removeWishlistItem(prev, item.id));
            setFeedback({
              type: 'success',
              message: `"${item.productName}" was added to your cart and removed from your wishlist.`,
            });
            break;
          case 'added-not-removed':
            setFeedback({ type: 'error', message: outcome.message });
            break;
          case 'blocked':
          case 'failed':
            setFeedback({ type: 'error', message: outcome.message });
            break;
        }
      } finally {
        itemInFlightRef.current = null;
        setBusyItemId(null);
      }
    },
    [addItem]
  );

  // ---------------------------------------------------------------------------
  // Clear All confirmation
  // ---------------------------------------------------------------------------

  const openClearDialog = useCallback(() => {
    if (itemInFlightRef.current) return;
    setFeedback(null);
    dispatchDialog({ type: 'OPEN' });
  }, []);

  const dismissClearDialog = useCallback((reason: ConfirmDismissReason) => {
    dispatchDialog({ type: 'DISMISS', reason });
  }, []);

  const confirmClear = useCallback(() => {
    void executeGuardedConfirm(clearInFlightRef, clearWishlist, dispatchDialog, {
      toErrorMessage: (raw) => toSafeWishlistError(raw, CLEAR_FAILURE_MESSAGE),
      onSuccess: () => {
        setItems([]);
        setFeedback({ type: 'success', message: 'Your wishlist has been cleared.' });
      },
    });
  }, []);

  const handleRetry = useCallback(() => {
    startRetry(() => router.refresh());
  }, [router]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const hasItems = items.length > 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 border-b border-neutral-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-luxury-gold">
            My Account
          </p>
          <h1 className="mt-1 font-serif text-2xl font-bold tracking-wide text-white sm:text-3xl">
            My Wishlist
          </h1>
          {!loadError && (
            <p className="mt-1 text-sm text-neutral-400" data-testid="wishlist-count">
              {formatSavedCount(items.length)}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <Link
            href="/shop"
            className="inline-flex min-h-[44px] items-center gap-1.5 text-xs uppercase tracking-wider text-neutral-400 transition-colors hover:text-luxury-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luxury-gold/50 sm:min-h-0"
          >
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            <span>Continue Shopping</span>
          </Link>
          {hasItems && !loadError && (
            <Button
              ref={clearTriggerRef}
              type="button"
              variant="outline"
              size="sm"
              onClick={openClearDialog}
              disabled={isAnyOperationRunning}
              aria-haspopup="dialog"
              className="h-10 gap-1.5 border-neutral-800 px-4 text-xs text-neutral-300 hover:border-rose-900 hover:bg-rose-950/30 hover:text-rose-300"
            >
              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Live feedback region (always mounted so updates are announced) */}
      <div aria-live="polite" aria-atomic="true">
        {feedback && (
          <div
            role={feedback.type === 'error' ? 'alert' : 'status'}
            className={`flex items-start gap-3 rounded-sm border p-3.5 text-sm sm:p-4 ${
              feedback.type === 'success'
                ? 'border-emerald-800/80 bg-emerald-950/40 text-emerald-300'
                : 'border-rose-800/80 bg-rose-950/40 text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <Check aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
            )}
            <p className="min-w-0 flex-1 break-words font-medium">{feedback.message}</p>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              aria-label="Dismiss message"
              className="-m-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luxury-gold/50"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {loadError ? (
        <WishlistErrorState message={loadError} isRetrying={isRetrying} onRetry={handleRetry} />
      ) : !hasItems ? (
        <WishlistEmptyState headingRef={emptyHeadingRef} />
      ) : (
        <ul
          role="list"
          aria-label="Saved jewellery pieces"
          className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-3 lg:gap-6 xl:grid-cols-4"
        >
          {items.map((item) => (
            <li key={item.id} className="min-w-0">
              <WishlistItemCard
                item={item}
                isBusy={busyItemId === item.id}
                isLocked={isAnyOperationRunning}
                onRemove={handleRemove}
                onMoveToCart={handleMoveToCart}
              />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={isDialogOpen(dialogState)}
        title="Clear Your Wishlist?"
        description="This will remove all saved items from your wishlist. This action cannot be undone."
        cancelLabel="Keep Items"
        confirmLabel="Clear Wishlist"
        pendingLabel="Clearing..."
        isPending={isClearing}
        error={dialogState.error}
        tone="destructive"
        onConfirm={confirmClear}
        onDismiss={dismissClearDialog}
        returnFocusRef={clearTriggerRef}
        fallbackFocusRef={emptyHeadingRef}
      />
    </div>
  );
}

// =============================================================================
// Item card
// =============================================================================

interface WishlistItemCardProps {
  item: WishlistProduct;
  isBusy: boolean;
  isLocked: boolean;
  onRemove: (item: WishlistProduct) => void;
  onMoveToCart: (item: WishlistProduct) => void;
}

function WishlistItemCard({ item, isBusy, isLocked, onRemove, onMoveToCart }: WishlistItemCardProps) {
  const pricing = getWishlistPricing(item);
  const stock = getWishlistStockDisplay(item);
  const eligibility = getWishlistCartEligibility(item);
  const productHref = getWishlistProductHref(item);
  const toneClasses = stock ? STOCK_TONE_CLASSES[stock.tone] : null;

  return (
    <article
      data-testid="wishlist-card"
      className="group flex h-full flex-col overflow-hidden rounded-sm border border-neutral-800 bg-neutral-900/40 transition-colors hover:border-luxury-gold/40"
    >
      <div className="flex flex-1 gap-3 p-3 sm:gap-4 sm:p-4 lg:flex-col lg:gap-0 lg:p-0">
        {/* Image */}
        <div className="relative aspect-square w-[100px] shrink-0 self-start overflow-hidden rounded-sm bg-neutral-950 min-[375px]:w-[110px] min-[430px]:w-[120px] md:w-[128px] lg:w-full lg:rounded-none">
          {productHref ? (
            <Link href={productHref} tabIndex={-1} aria-hidden="true" className="block h-full w-full">
              <WishlistItemImage item={item} />
            </Link>
          ) : (
            <WishlistItemImage item={item} />
          )}

          {pricing.hasDiscount && pricing.discountPercent > 0 && (
            <span className="absolute left-1.5 top-1.5 rounded-sm bg-luxury-ruby px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white shadow-sm lg:left-3 lg:top-3 lg:text-[11px]">
              -{pricing.discountPercent}%
            </span>
          )}
        </div>

        {/* Details */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:p-4 lg:pb-0">
          <h3 className="font-serif text-sm font-semibold leading-snug text-white [overflow-wrap:anywhere] sm:text-base">
            {productHref ? (
              <Link
                href={productHref}
                title={item.productName}
                className="line-clamp-2 transition-colors hover:text-luxury-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luxury-gold/50"
              >
                {item.productName}
              </Link>
            ) : (
              <span className="line-clamp-2" title={item.productName}>
                {item.productName}
              </span>
            )}
          </h3>

          {item.variantTitle ? (
            <p className="text-xs text-neutral-400 [overflow-wrap:anywhere]">
              <span className="text-neutral-500">Option:</span> {item.variantTitle}
            </p>
          ) : (
            <p className="text-xs text-amber-400/90">Choose an option on the product page</p>
          )}

          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-bold text-white sm:text-base">
              {formatCurrency(pricing.currentPrice)}
            </span>
            {pricing.hasDiscount && (
              <span className="text-xs text-neutral-500 line-through">
                <span className="sr-only">Original price </span>
                {formatCurrency(pricing.originalPrice)}
              </span>
            )}
          </div>

          {stock && toneClasses && (
            <p className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${toneClasses.text}`}>
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${toneClasses.dot}`} />
              {stock.label}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-3 pb-3 sm:px-4 sm:pb-4 lg:pt-4">
        {eligibility.kind === 'add' && (
          <Button
            type="button"
            variant="gold"
            onClick={() => onMoveToCart(item)}
            disabled={isLocked}
            aria-busy={isBusy || undefined}
            className="h-11 min-w-0 flex-1 gap-2 px-3 text-xs font-semibold sm:h-10"
          >
            {isBusy ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <ShoppingBag aria-hidden="true" className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate">{isBusy ? 'Moving...' : 'Move to Cart'}</span>
          </Button>
        )}

        {eligibility.kind === 'select-options' && (
          <Link
            href={eligibility.href}
            className={`${goldLinkButtonClasses} h-11 min-w-0 flex-1 px-3 text-xs sm:h-10`}
          >
            <span className="truncate">Select Options</span>
          </Link>
        )}

        {(eligibility.kind === 'out-of-stock' || eligibility.kind === 'unavailable') && (
          <Button
            type="button"
            variant="outline"
            disabled
            className="h-11 min-w-0 flex-1 border-neutral-800 px-3 text-xs text-neutral-500 sm:h-10"
          >
            <span className="truncate">
              {eligibility.kind === 'out-of-stock' ? 'Out of Stock' : 'Unavailable'}
            </span>
          </Button>
        )}

        {productHref && eligibility.kind !== 'select-options' && (
          <Link
            href={productHref}
            aria-label={`View ${item.productName}`}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-sm border border-neutral-700 px-3 text-xs font-medium text-neutral-200 transition-colors hover:border-luxury-gold/60 hover:text-luxury-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luxury-gold/50 sm:h-10"
          >
            <Eye aria-hidden="true" className="h-4 w-4" />
            <span className="hidden min-[430px]:inline">View</span>
          </Link>
        )}

        <button
          type="button"
          onClick={() => onRemove(item)}
          disabled={isLocked}
          aria-label={`Remove ${item.productName} from wishlist`}
          title="Remove from wishlist"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-neutral-700 text-neutral-400 transition-colors hover:border-rose-800 hover:bg-rose-950/30 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-10"
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

function WishlistItemImage({ item }: { item: WishlistProduct }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const src = item.imageUrl && item.imageUrl !== failedUrl ? item.imageUrl : null;

  if (!src) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center text-neutral-700">
        <Sparkles aria-hidden="true" className="h-8 w-8 stroke-[1] lg:h-10 lg:w-10" />
        <span className="mt-1 text-[9px] uppercase tracking-wider text-neutral-600 lg:text-[10px]">
          Splender Jewel
        </span>
        <span className="sr-only">No image available for {item.productName}</span>
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={getWishlistImageAlt(item)}
      loading="lazy"
      decoding="async"
      onError={() => setFailedUrl(src)}
      className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
    />
  );
}

// =============================================================================
// Page states
// =============================================================================

function WishlistEmptyState({ headingRef }: { headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <section
      data-testid="wishlist-empty"
      className="relative mx-auto max-w-lg overflow-hidden rounded-sm border border-luxury-gold/20 bg-neutral-900/30 px-6 py-12 text-center sm:px-10 sm:py-16"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-luxury-gold/60 to-transparent"
      />
      <div className="mx-auto mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full border border-luxury-gold/30 bg-luxury-gold/10 text-luxury-gold">
        <Heart aria-hidden="true" className="h-9 w-9 stroke-[1.5]" />
      </div>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-serif text-xl font-bold tracking-wide text-white outline-none sm:text-2xl"
      >
        Your Wishlist Is Waiting
      </h2>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-neutral-400">
        Save the pieces you love and find them here whenever you&apos;re ready.
      </p>
      <Link
        href="/shop"
        className={`${goldLinkButtonClasses} mt-8 h-12 w-full px-8 text-sm sm:w-auto`}
      >
        Explore Jewellery
      </Link>
    </section>
  );
}

function WishlistErrorState({
  message,
  isRetrying,
  onRetry,
}: {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  return (
    <section
      role="alert"
      data-testid="wishlist-error"
      className="mx-auto max-w-lg rounded-sm border border-rose-900/60 bg-rose-950/20 px-6 py-10 text-center sm:px-10 sm:py-12"
    >
      <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full border border-rose-800/60 bg-rose-950/50 text-rose-400">
        <AlertCircle aria-hidden="true" className="h-7 w-7" />
      </div>
      <h2 className="font-serif text-xl font-bold tracking-wide text-white">
        We Couldn&apos;t Load Your Wishlist
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-neutral-400">{message}</p>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <Button
          type="button"
          variant="gold"
          onClick={onRetry}
          disabled={isRetrying}
          className="h-11 gap-2 px-6 text-sm"
        >
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
          {isRetrying ? 'Retrying...' : 'Try Again'}
        </Button>
        <Link
          href="/shop"
          className="inline-flex h-11 items-center justify-center rounded-sm border border-neutral-700 px-6 text-sm text-neutral-200 transition-colors hover:border-luxury-gold/60 hover:text-luxury-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luxury-gold/50"
        >
          Continue Shopping
        </Link>
      </div>
    </section>
  );
}
