'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Package,
  ShieldCheck,
  Truck,
  MessageCircle,
  Sparkles,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Layers,
  Heart,
  Share2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/config/store';
import type { ProductPublic, ProductVariantPublic, ProductImage } from '@/types/product';

interface ProductDetailViewerProps {
  product: ProductPublic;
  storeWhatsAppNumber: string;
}

export function ProductDetailViewer({ product, storeWhatsAppNumber }: ProductDetailViewerProps) {
  // Variant selection: default to first active variant
  const [selectedVariant, setSelectedVariant] = useState<ProductVariantPublic>(
    product.variants[0] || null
  );

  // Gallery image selection: default to primary image or first image
  const primaryImage = product.images.find((img) => img.isPrimary) || product.images[0] || null;
  const [activeImage, setActiveImage] = useState<ProductImage | null>(primaryImage);

  // Compute pricing for selected variant
  const currentPrice = selectedVariant
    ? selectedVariant.discountPrice != null && selectedVariant.discountPrice > 0
      ? selectedVariant.discountPrice
      : selectedVariant.price
    : product.basePrice;

  const originalPrice = selectedVariant ? selectedVariant.price : product.basePrice;
  const hasDiscount = selectedVariant
    ? selectedVariant.discountPrice != null && selectedVariant.discountPrice < originalPrice
    : false;
  const discountPercent = hasDiscount
    ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
    : 0;

  // General stock availability of selected variant (computed securely server-side)
  const isOutOfStock = selectedVariant ? selectedVariant.stockStatus === 'out_of_stock' : false;
  const isLowStock = selectedVariant ? selectedVariant.stockStatus === 'low_stock' : false;

  // Handler: Change variant and auto-switch image if variant has associated image
  function handleSelectVariant(variant: ProductVariantPublic) {
    setSelectedVariant(variant);

    // If variant has mapped image, switch to it
    const variantImage = product.images.find((img) => img.variantId === variant.id);
    if (variantImage) {
      setActiveImage(variantImage);
    }
  }

  // Build safe WhatsApp pre-filled enquiry URL
  const cleanPhone = storeWhatsAppNumber.replace(/[^0-9]/g, '');
  const whatsAppMessage = encodeURIComponent(
    `Hello Splender Jewel, I'm interested in ordering:\n\n*Product:* ${product.name}\n*Variant:* ${selectedVariant?.title || 'Default'}\n*SKU:* ${selectedVariant?.sku || product.productCode || 'N/A'}\n*Price:* ${formatCurrency(currentPrice)}\n\nCould you please confirm availability and islandwide delivery details?`
  );
  const whatsAppLink = `https://wa.me/${cleanPhone}?text=${whatsAppMessage}`;

  return (
    <div className="space-y-12">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-neutral-400">
        <Link href="/" className="hover:text-white transition-colors">
          Home
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link href="/shop" className="hover:text-white transition-colors">
          Shop
        </Link>
        {product.category && (
          <>
            <ChevronRight className="h-3 w-3" />
            <Link
              href={`/category/${product.category.slug}`}
              className="hover:text-white transition-colors"
            >
              {product.category.name}
            </Link>
          </>
        )}
        <ChevronRight className="h-3 w-3" />
        <span className="text-neutral-200 truncate max-w-xs">{product.name}</span>
      </nav>

      {/* Main Product Showcase (2 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14">
        {/* LEFT COLUMN: IMAGE GALLERY */}
        <div className="space-y-4">
          {/* Main Large Image Container */}
          <div className="relative aspect-square w-full bg-neutral-900 border border-luxury-border rounded-sm overflow-hidden shadow-2xl">
            {activeImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeImage.url}
                alt={activeImage.altText || product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-luxury-surface text-neutral-600">
                <Package className="h-16 w-16 text-luxury-gold/30 mb-2" />
                <span className="text-xs uppercase tracking-widest text-neutral-500 font-mono">
                  Splender Jewel
                </span>
              </div>
            )}

            {/* Badges Overlay */}
            <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
              {hasDiscount && (
                <span className="bg-luxury-gold text-luxury-black text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-sm shadow-md">
                  -{discountPercent}% OFF
                </span>
              )}
              {product.isNewArrival && (
                <span className="bg-luxury-black/90 text-luxury-gold border border-luxury-gold/40 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-sm backdrop-blur-sm">
                  New Arrival
                </span>
              )}
            </div>
          </div>

          {/* Thumbnails Row */}
          {product.images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
              {product.images.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActiveImage(img)}
                  className={`relative aspect-square w-20 rounded-sm overflow-hidden border-2 transition-all shrink-0 ${
                    activeImage?.id === img.id
                      ? 'border-luxury-gold ring-1 ring-luxury-gold scale-105'
                      : 'border-neutral-800 hover:border-neutral-600 opacity-70 hover:opacity-100'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.altText || 'Thumbnail'} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: PRODUCT DETAILS & PURCHASE ACTIONS */}
        <div className="space-y-6 flex flex-col justify-start">
          {/* Header Info */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              {product.category && (
                <span className="text-xs uppercase tracking-widest text-luxury-gold font-semibold">
                  {product.category.name}
                </span>
              )}
              {product.gender && (
                <>
                  <span className="text-neutral-600">•</span>
                  <span className="text-xs text-neutral-400 capitalize">{product.gender}'s Collection</span>
                </>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif text-white leading-tight">
              {product.name}
            </h1>

            <div className="flex items-center gap-3 text-xs font-mono text-neutral-400 mt-2">
              <span>SKU: {selectedVariant?.sku || product.productCode || 'SJ-JWL'}</span>
              {product.material && (
                <>
                  <span>•</span>
                  <span>{product.material}</span>
                </>
              )}
            </div>
          </div>

          {/* Price Section */}
          <div className="p-4 bg-luxury-card border border-luxury-border rounded-sm flex items-baseline justify-between">
            <div className="flex items-baseline gap-3">
              <span className="text-2xl sm:text-3xl font-serif font-bold text-luxury-gold">
                {formatCurrency(currentPrice)}
              </span>

              {hasDiscount && (
                <span className="text-base text-neutral-500 line-through">
                  {formatCurrency(originalPrice)}
                </span>
              )}
            </div>

            {/* Stock Availability Indicator */}
            <div>
              {isOutOfStock ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400 bg-rose-950/60 border border-rose-800/40 px-2.5 py-1 rounded">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                  Currently Out of Stock
                </span>
              ) : isLowStock ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-950/60 border border-amber-800/40 px-2.5 py-1 rounded">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Low Stock — Order Soon
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2.5 py-1 rounded">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  In Stock & Ready for Delivery
                </span>
              )}
            </div>
          </div>

          {/* Short Description */}
          {product.shortDescription && (
            <p className="text-sm text-neutral-300 leading-relaxed">
              {product.shortDescription}
            </p>
          )}

          {/* Variant Selector */}
          {product.variants.length > 1 && (
            <div className="space-y-3 pt-2">
              <label className="block text-xs uppercase tracking-wider text-neutral-300 font-semibold">
                Select Option / Variant: <span className="text-luxury-gold font-normal">{selectedVariant?.title}</span>
              </label>

              <div className="flex flex-wrap gap-2.5">
                {product.variants.map((variant) => {
                  const isSelected = selectedVariant?.id === variant.id;
                  const isVarOut = variant.stockStatus === 'out_of_stock';

                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => handleSelectVariant(variant)}
                      className={`px-4 py-2.5 rounded-sm text-xs font-medium transition-all border flex items-center gap-2 ${
                        isSelected
                          ? 'bg-luxury-gold text-luxury-black border-luxury-gold font-bold shadow-md'
                          : 'bg-luxury-surface text-neutral-300 border-neutral-700 hover:border-neutral-500'
                      } ${isVarOut ? 'opacity-60 line-through' : ''}`}
                    >
                      <span>{variant.title}</span>
                      <span className="text-[11px] opacity-80">
                        ({formatCurrency(variant.discountPrice || variant.price)})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* WhatsApp Direct Order CTA Button */}
          <div className="space-y-3 pt-3">
            <a
              href={whatsAppLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Button
                variant="gold"
                size="lg"
                disabled={isOutOfStock}
                className="w-full text-base py-4 font-semibold flex items-center justify-center gap-3 shadow-lg shadow-luxury-gold/10 hover:shadow-luxury-gold/20"
              >
                <MessageCircle className="h-5 w-5 fill-current" />
                {isOutOfStock ? 'Currently Out of Stock' : 'Order / Enquire via WhatsApp'}
              </Button>
            </a>

            <div className="text-[11px] text-neutral-400 text-center">
              Direct verification with our boutique. Instant confirmation & dispatch details.
            </div>
          </div>

          {/* Trust Guarantees */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-luxury-border">
            <div className="flex items-center gap-2.5 text-xs text-neutral-300">
              <Truck className="h-4 w-4 text-luxury-gold shrink-0" />
              <span>Islandwide Delivery (25 Districts)</span>
            </div>

            <div className="flex items-center gap-2.5 text-xs text-neutral-300">
              <ShieldCheck className="h-4 w-4 text-luxury-gold shrink-0" />
              <span>100% Quality Inspected</span>
            </div>

            <div className="flex items-center gap-2.5 text-xs text-neutral-300">
              <Sparkles className="h-4 w-4 text-luxury-gold shrink-0" />
              <span>Cash on Delivery Available</span>
            </div>
          </div>
        </div>
      </div>

      {/* Description & Specifications Section */}
      <div className="pt-8 border-t border-luxury-border">
        <div className="bg-luxury-card border border-luxury-border rounded-sm p-6 sm:p-8 space-y-6">
          <h2 className="text-xl font-serif text-white flex items-center gap-2 border-b border-luxury-border pb-3">
            <Sparkles className="h-5 w-5 text-luxury-gold" />
            Craftsmanship & Product Specifications
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">
                Detailed Description
              </h3>
              <div className="text-sm text-neutral-300 leading-relaxed whitespace-pre-line">
                {product.description ||
                  'Each Splender Jewel creation is crafted to elevate everyday luxury. Handcrafted with fine detailing, durable plating, and thoughtful finishing for timeless elegance.'}
              </div>
            </div>

            <div className="space-y-4 bg-luxury-surface p-5 rounded border border-neutral-800">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-luxury-gold">
                Product Details
              </h3>
              <dl className="text-xs space-y-2.5 text-neutral-300">
                <div className="flex justify-between border-b border-neutral-800 pb-1.5">
                  <dt className="text-neutral-500">Material</dt>
                  <dd className="font-medium text-white">{product.material || 'Fine Plated'}</dd>
                </div>
                <div className="flex justify-between border-b border-neutral-800 pb-1.5">
                  <dt className="text-neutral-500">Gender</dt>
                  <dd className="font-medium text-white capitalize">{product.gender}</dd>
                </div>
                <div className="flex justify-between border-b border-neutral-800 pb-1.5">
                  <dt className="text-neutral-500">Category</dt>
                  <dd className="font-medium text-white">{product.category?.name || 'Jewelry'}</dd>
                </div>
                <div className="flex justify-between border-b border-neutral-800 pb-1.5">
                  <dt className="text-neutral-500">SKU Code</dt>
                  <dd className="font-mono text-neutral-300">{selectedVariant?.sku || 'N/A'}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
