'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Heart, Trash2, ShoppingBag, ArrowLeft, Check, Sparkles, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/config/store';
import { useCart } from '@/lib/cart/cart-context';
import { removeFromWishlist, clearWishlist } from '@/lib/wishlist/actions';
import type { WishlistProduct } from '@/types/wishlist';

interface WishlistManagerProps {
  initialItems: WishlistProduct[];
}

export function WishlistManager({ initialItems }: WishlistManagerProps) {
  const [items, setItems] = useState<WishlistProduct[]>(initialItems);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const { addItem } = useCart();

  const handleRemove = async (itemId: string) => {
    setLoadingId(itemId);
    setFeedback(null);
    try {
      const res = await removeFromWishlist(itemId);
      if (res.success) {
        setItems((prev) => prev.filter((i) => i.id !== itemId));
        setFeedback({ type: 'success', message: 'Item removed from wishlist.' });
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to remove item.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'An error occurred.' });
    } finally {
      setLoadingId(null);
    }
  };

  const handleMoveToCart = async (item: WishlistProduct) => {
    setLoadingId(item.id);
    setFeedback(null);
    try {
      // Add to local cart
      addItem({
        productId: item.productId,
        variantId: item.variantId || item.productId,
        productName: item.productName,
        variantTitle: item.variantTitle || 'Standard',
        sku: item.sku || `SJ-${item.productId.slice(0, 6)}`,
        price: item.price,
        discountPrice: item.discountPrice,
        imageUrl: item.imageUrl,
        slug: item.slug,
      });

      // Remove from server wishlist
      await removeFromWishlist(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));

      setFeedback({
        type: 'success',
        message: `"${item.productName}" added to your cart and removed from wishlist.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to transfer to cart.' });
    } finally {
      setLoadingId(null);
    }
  };

  const handleClear = async () => {
    if (!window.confirm('Are you sure you want to clear your entire wishlist?')) {
      return;
    }
    setLoadingId('all');
    setFeedback(null);
    try {
      const res = await clearWishlist();
      if (res.success) {
        setItems([]);
        setFeedback({ type: 'success', message: 'Wishlist cleared.' });
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to clear wishlist.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'An error occurred.' });
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            Saved Wishlist
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Your curated collection of saved jewelry pieces.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/shop"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-neutral-400 hover:text-luxury-gold transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Browse Catalog</span>
          </Link>
          {items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={loadingId !== null}
              className="text-xs border-neutral-800 text-neutral-400 hover:text-rose-400 hover:border-rose-900"
            >
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`p-4 rounded-md border text-sm flex items-start gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <Check className="h-5 w-5 shrink-0 mt-0.5 text-emerald-400" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-rose-400" />
          )}
          <div className="flex-1 font-medium">{feedback.message}</div>
        </div>
      )}

      {/* Items Grid or Empty State */}
      {items.length === 0 ? (
        <div className="max-w-md mx-auto text-center py-12 sm:py-16 space-y-6">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-luxury-gold/10 border border-luxury-gold/30 text-luxury-gold mb-2">
            <Heart className="h-9 w-9 stroke-[1.5]" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
              Your Wishlist is Empty
            </h2>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Explore our handcrafted rings, necklaces, bracelets, and fine jewelry pieces to save your favorites for future purchase.
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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => {
            const hasDiscount = item.discountPrice && item.discountPrice < item.price;
            const currentPrice = hasDiscount ? item.discountPrice! : item.price;

            return (
              <Card
                key={item.id}
                className="group border border-neutral-800 bg-neutral-900/40 hover:border-neutral-700 transition-all overflow-hidden flex flex-col justify-between"
              >
                <div>
                  {/* Thumbnail / Image Container */}
                  <div className="relative aspect-square w-full overflow-hidden bg-neutral-950 flex items-center justify-center">
                    {item.imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={item.imageUrl}
                        alt={item.productName}
                        className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="text-neutral-700 flex flex-col items-center">
                        <Sparkles className="h-10 w-10 stroke-[1]" />
                        <span className="text-[10px] mt-1 text-neutral-600">Splender Jewel</span>
                      </div>
                    )}

                    {/* Stock Status Pill */}
                    <div className="absolute top-2.5 left-2.5">
                      <Badge
                        variant={item.stockStatus === 'out_of_stock' ? 'outline' : 'success'}
                        className="text-[10px] uppercase font-bold tracking-wider"
                      >
                        {item.stockStatus === 'out_of_stock' ? 'Out of Stock' : 'In Stock'}
                      </Badge>
                    </div>

                    {/* Quick Remove Button */}
                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      disabled={loadingId === item.id}
                      className="absolute top-2.5 right-2.5 h-8 w-8 rounded-full bg-black/60 border border-neutral-700 text-neutral-400 hover:text-rose-400 hover:border-rose-700 flex items-center justify-center transition-colors"
                      title="Remove from wishlist"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Details */}
                  <div className="p-4 space-y-2">
                    <Link href={`/products/${item.slug}`}>
                      <h3 className="font-serif text-sm font-semibold text-white group-hover:text-luxury-gold transition-colors line-clamp-1">
                        {item.productName}
                      </h3>
                    </Link>

                    {item.variantTitle && (
                      <p className="text-[11px] text-neutral-400">
                        {item.variantTitle}
                      </p>
                    )}

                    {/* Pricing */}
                    <div className="flex items-baseline gap-2 pt-1">
                      <span className="text-sm font-bold text-white">
                        {formatCurrency(currentPrice)}
                      </span>
                      {hasDiscount && (
                        <span className="text-xs text-neutral-500 line-through">
                          {formatCurrency(item.price)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="p-4 pt-0">
                  <Button
                    variant="gold"
                    size="sm"
                    onClick={() => handleMoveToCart(item)}
                    disabled={loadingId === item.id}
                    className="w-full text-xs font-semibold gap-2"
                  >
                    <ShoppingBag className="h-3.5 w-3.5" />
                    {loadingId === item.id ? 'Transferring...' : 'Move to Cart'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
