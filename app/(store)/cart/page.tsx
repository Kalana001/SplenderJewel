'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShoppingBag,
  ArrowRight,
  Trash2,
  Plus,
  Minus,
  ShieldCheck,
  Truck,
  ArrowLeft,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { useCart } from '@/lib/cart/cart-context';
import { formatCurrency } from '@/lib/config/store';
import { validateCartStockAction } from '@/lib/cart/actions';

export default function CartPage() {
  const { items, isLoaded, totalCount, subtotal, updateQuantity, removeItem, syncCartStock } =
    useCart();
  const [inventoryNotice, setInventoryNotice] = useState<string | null>(null);
  const [outOfStockNotice, setOutOfStockNotice] = useState<string | null>(null);

  // Synchronize cart quantities with authoritative database inventory on mount
  useEffect(() => {
    if (!isLoaded || items.length === 0) return;

    let isMounted = true;
    async function verifyCartStock() {
      try {
        const res = await validateCartStockAction(
          items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }))
        );

        if (!isMounted) return;

        if (res && res.stockMap) {
          const { adjustedItems } = syncCartStock(res.stockMap);
          if (adjustedItems.length > 0) {
            setInventoryNotice(
              'Some item quantities were adjusted to match current warehouse inventory availability.'
            );
          }
        }

        const outOfStockItems = (res?.items || []).filter((i) => i.availableStock === 0);
        if (outOfStockItems.length > 0) {
          setOutOfStockNotice(
            'One or more items in your shopping bag are currently out of stock. Please remove them before checkout.'
          );
        } else {
          setOutOfStockNotice(null);
        }
      } catch (e) {
        console.warn('[Cart] Live inventory verification deferred:', e);
      }
    }

    verifyCartStock();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  if (!isLoaded) {
    return (
      <Container size="xl" className="py-12 sm:py-16">
        <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
          <div className="h-8 bg-neutral-800 rounded w-48" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 h-64 bg-neutral-900 rounded-lg border border-neutral-800" />
            <div className="h-64 bg-neutral-900 rounded-lg border border-neutral-800" />
          </div>
        </div>
      </Container>
    );
  }

  if (items.length === 0) {
    return (
      <Container size="xl" className="py-16 sm:py-24">
        <div className="max-w-md mx-auto text-center space-y-6">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-luxury-gold/10 border border-luxury-gold/30 text-luxury-gold mb-2">
            <ShoppingBag className="h-10 w-10 stroke-[1.5]" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-wide">
              Your Shopping Bag is Empty
            </h1>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Discover our curated collections of fine gold-plated jewelry, necklaces, rings, and statement pieces.
            </p>
          </div>

          <div className="pt-2">
            <Link href="/shop">
              <Button variant="gold" size="lg" className="w-full sm:w-auto px-8 font-semibold">
                Explore Jewelry Collection
              </Button>
            </Link>
          </div>
        </div>
      </Container>
    );
  }

  const hasOutOfStockItems = items.some(
    (i) => i.maxStock !== undefined && (i.maxStock === 0 || i.quantity > i.maxStock)
  );

  return (
    <Container size="xl" className="py-10 sm:py-16">
      <div className="space-y-8">
        {/* Page Title & Item Count */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-wide">
              Shopping Bag
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1">
              {totalCount} {totalCount === 1 ? 'item' : 'items'} in your order
            </p>
          </div>

          <Link
            href="/shop"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-400 hover:text-luxury-gold transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Continue Shopping</span>
          </Link>
        </div>

        {/* Inventory Adjustment Notification Banner */}
        {inventoryNotice && (
          <div className="flex items-center gap-3 bg-amber-950/70 border border-amber-800/70 text-amber-200 px-4 py-3 rounded-lg text-xs sm:text-sm shadow-md animate-fadeIn">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
            <span>{inventoryNotice}</span>
          </div>
        )}

        {/* Out of Stock Alert Banner */}
        {outOfStockNotice && (
          <div className="flex items-center gap-3 bg-rose-950/80 border border-rose-800/70 text-rose-200 px-4 py-3 rounded-lg text-xs sm:text-sm shadow-md animate-fadeIn">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
            <span>{outOfStockNotice}</span>
          </div>
        )}

        {/* Cart Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Left Column: Cart Items List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg divide-y divide-neutral-800">
              {items.map((item) => {
                const itemEffectivePrice =
                  item.discountPrice != null && item.discountPrice > 0
                    ? item.discountPrice
                    : item.price;
                const lineTotal = itemEffectivePrice * item.quantity;
                const isAtMaxStock =
                  item.maxStock !== undefined && item.quantity >= item.maxStock;
                const isOutOfStock = item.maxStock === 0;

                return (
                  <div
                    key={item.variantId}
                    className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 transition-colors hover:bg-neutral-900/90"
                  >
                    {/* Item Thumbnail */}
                    <Link
                      href={`/products/${item.slug}`}
                      className="relative h-20 w-20 sm:h-24 sm:w-24 rounded bg-neutral-950 border border-neutral-800 overflow-hidden shrink-0"
                    >
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageUrl}
                          alt={item.productName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-neutral-600">
                          <ShoppingBag className="h-6 w-6" />
                        </div>
                      )}
                    </Link>

                    {/* Item Details */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <Link
                        href={`/products/${item.slug}`}
                        className="text-sm sm:text-base font-medium text-white hover:text-luxury-gold transition-colors line-clamp-1"
                      >
                        {item.productName}
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-neutral-400">
                        <span>Variant: <strong className="text-neutral-200">{item.variantTitle}</strong></span>
                        <span>•</span>
                        <span>SKU: {item.sku}</span>
                      </div>
                      <div className="pt-1 flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-luxury-gold">
                          {formatCurrency(itemEffectivePrice)}
                        </span>
                        {item.discountPrice != null && item.discountPrice > 0 && item.discountPrice < item.price && (
                          <span className="text-xs text-neutral-500 line-through">
                            {formatCurrency(item.price)}
                          </span>
                        )}
                      </div>

                      {/* Stock Warning Badge */}
                      {isOutOfStock ? (
                        <span className="inline-block text-[11px] font-semibold text-rose-400 bg-rose-950/70 border border-rose-800/40 px-2 py-0.5 rounded mt-1">
                          Out of Stock — Please remove to checkout
                        </span>
                      ) : isAtMaxStock ? (
                        <span className="inline-block text-[11px] font-medium text-amber-400 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded mt-1">
                          Max available stock in bag ({item.maxStock})
                        </span>
                      ) : null}
                    </div>

                    {/* Quantity Controls & Line Total */}
                    <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4 sm:gap-6 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-800/80">
                      {/* Quantity Controller */}
                      <div className="flex items-center border border-neutral-700 rounded bg-neutral-950 h-9 px-1.5">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                          className="p-1 text-neutral-400 hover:text-white transition-colors"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-8 text-center text-xs font-semibold text-white select-none">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                          disabled={isAtMaxStock || isOutOfStock}
                          className="p-1 text-neutral-400 hover:text-white disabled:opacity-30 transition-colors"
                          aria-label="Increase quantity"
                          title={isAtMaxStock ? `Maximum stock reached (${item.maxStock})` : 'Increase quantity'}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Line Total */}
                      <div className="text-right min-w-[5rem]">
                        <span className="block text-sm font-bold text-white">
                          {formatCurrency(lineTotal)}
                        </span>
                      </div>

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => removeItem(item.variantId)}
                        className="p-1.5 text-neutral-400 hover:text-rose-400 transition-colors"
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Order Summary Card */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-6 space-y-6 sticky top-24">
              <h2 className="text-lg font-serif font-bold text-white tracking-wide border-b border-neutral-800 pb-3">
                Order Summary
              </h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-neutral-300">
                  <span>Bag Subtotal</span>
                  <span className="font-semibold text-white">{formatCurrency(subtotal)}</span>
                </div>

                <div className="flex justify-between text-neutral-300">
                  <span>Delivery Fee</span>
                  <span className="text-xs text-neutral-400">Calculated at checkout</span>
                </div>

                <div className="pt-3 border-t border-neutral-800 flex justify-between items-baseline">
                  <span className="text-base font-bold text-white">Estimated Total</span>
                  <span className="text-xl font-bold text-luxury-gold">{formatCurrency(subtotal)}</span>
                </div>
              </div>

              {/* Checkout CTA */}
              <div className="space-y-3 pt-2">
                {hasOutOfStockItems ? (
                  <div>
                    <Button
                      variant="gold"
                      size="lg"
                      disabled={true}
                      className="w-full text-base font-semibold py-4 flex items-center justify-center gap-2 opacity-50 cursor-not-allowed"
                    >
                      <span>Proceed to Checkout</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    <p className="text-[11px] text-rose-400 text-center mt-2 leading-relaxed">
                      Please adjust or remove items exceeding warehouse stock to proceed.
                    </p>
                  </div>
                ) : (
                  <Link href="/checkout" className="block">
                    <Button variant="gold" size="lg" className="w-full text-base font-semibold py-4 flex items-center justify-center gap-2 shadow-lg shadow-luxury-gold/15 hover:shadow-luxury-gold/25">
                      <span>Proceed to Checkout</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                )}

                <p className="text-[11px] text-neutral-400 text-center leading-relaxed">
                  Cash on Delivery & Bank Transfer via WhatsApp accepted.
                </p>
              </div>

              {/* Trust Features */}
              <div className="border-t border-neutral-800 pt-4 space-y-2.5 text-xs text-neutral-400">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-luxury-gold shrink-0" />
                  <span>Islandwide home delivery across all 25 districts</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-luxury-gold shrink-0" />
                  <span>Secure server order verification & receipt</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Container>
  );
}
