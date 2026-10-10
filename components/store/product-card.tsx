'use client';

import React from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { formatCurrency } from '@/lib/config/store';
import type { ProductPublic } from '@/types/product';

interface ProductCardProps {
  product: ProductPublic;
}

export function ProductCard({ product }: ProductCardProps) {
  const primaryImage = product.images.find((img) => img.isPrimary) || product.images[0];
  const secondaryImage = product.images.length > 1 ? product.images[1] : null;

  // Calculate discount percentage if applicable
  const hasDiscount = product.baseDiscountPrice != null && product.baseDiscountPrice < product.basePrice;
  const discountPercent = hasDiscount
    ? Math.round(((product.basePrice - product.baseDiscountPrice!) / product.basePrice) * 100)
    : 0;

  // Check if completely out of stock across all active variants
  const isOutOfStock = product.variants.every((v) => v.stockStatus === 'out_of_stock');

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col bg-luxury-card border border-luxury-border rounded-sm overflow-hidden hover:border-luxury-gold/50 transition-all duration-300 shadow-sm hover:shadow-lg hover:shadow-black/60"
    >
      {/* Product Image Container */}
      <div className="relative aspect-square w-full bg-neutral-900 overflow-hidden">
        {primaryImage ? (
          <>
            {/* Primary Image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={primaryImage.url}
              alt={primaryImage.altText || product.name}
              className={`w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 ${
                secondaryImage ? 'group-hover:opacity-0' : ''
              }`}
              loading="lazy"
            />

            {/* Optional Secondary Image on Hover */}
            {secondaryImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={secondaryImage.url}
                alt={secondaryImage.altText || product.name}
                className="w-full h-full object-cover absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-out group-hover:scale-105"
                loading="lazy"
              />
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-luxury-surface text-neutral-600">
            <Package className="h-10 w-10 text-luxury-gold/30 mb-2" />
            <span className="text-xs uppercase tracking-widest text-neutral-500">Fine Jewelry</span>
          </div>
        )}

        {/* Badges Container */}
        <div className="absolute top-2 left-2 flex flex-col gap-1.5 z-10">
          {hasDiscount && (
            <span className="bg-luxury-gold text-luxury-black text-[10px] sm:text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm shadow-md">
              -{discountPercent}% OFF
            </span>
          )}

          {product.isNewArrival && !hasDiscount && (
            <span className="bg-luxury-black/90 text-luxury-gold border border-luxury-gold/40 text-[10px] sm:text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-sm backdrop-blur-sm shadow-md">
              New
            </span>
          )}

          {isOutOfStock && (
            <span className="bg-neutral-900/90 text-neutral-400 text-[10px] sm:text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-sm backdrop-blur-sm">
              Sold Out
            </span>
          )}
        </div>
      </div>

      {/* Product Information */}
      <div className="p-3.5 sm:p-4 flex flex-col flex-grow justify-between space-y-2">
        <div>
          {/* Category / Material Subtitle */}
          <div className="text-[11px] sm:text-xs uppercase tracking-wider text-neutral-400 font-medium mb-1 truncate">
            {product.category?.name || product.material || 'Jewelry Piece'}
          </div>

          {/* Product Title */}
          <h3 className="font-serif text-sm sm:text-base text-white font-medium group-hover:text-luxury-gold transition-colors line-clamp-2 leading-snug">
            {product.name}
          </h3>
        </div>

        {/* Price Display */}
        <div className="pt-2 border-t border-luxury-border/60 flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            {hasDiscount ? (
              <>
                <span className="text-sm sm:text-base font-semibold text-luxury-gold">
                  {formatCurrency(product.baseDiscountPrice!)}
                </span>
                <span className="text-xs text-neutral-500 line-through">
                  {formatCurrency(product.basePrice)}
                </span>
              </>
            ) : (
              <span className="text-sm sm:text-base font-semibold text-white">
                {formatCurrency(product.basePrice)}
              </span>
            )}
          </div>

          {product.variants.length > 1 && (
            <span className="text-[10px] text-neutral-400">
              {product.variants.length} options
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
