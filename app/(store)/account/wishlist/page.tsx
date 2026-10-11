import React from 'react';
import Link from 'next/link';
import { Heart, ArrowLeft, Sparkles, ShoppingBag } from 'lucide-react';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';

export default function AccountWishlistPage() {
  return (
    <Container size="xl" className="py-10 sm:py-16">
      <div className="space-y-8">
        {/* Header Breadcrumb & Title */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-wide">
              Saved Wishlist
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1">
              Your curated list of jewelry pieces saved for later
            </p>
          </div>

          <Link
            href="/shop"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-400 hover:text-luxury-gold transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Browse Catalog</span>
          </Link>
        </div>

        {/* Empty Wishlist State */}
        <div className="max-w-md mx-auto text-center py-12 sm:py-16 space-y-6">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-luxury-gold/10 border border-luxury-gold/30 text-luxury-gold mb-2">
            <Heart className="h-9 w-9 stroke-[1.5]" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
              Your Wishlist is Empty
            </h2>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Explore our handcrafted earrings, necklaces, rings, and fine jewelry pieces to save your favorites for future purchase.
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
      </div>
    </Container>
  );
}
