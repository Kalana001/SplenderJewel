'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  ShoppingBag,
  Plus,
  Minus,
  Check,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/config/store';
import { useCart } from '@/lib/cart/cart-context';
import { checkVariantAvailabilityAction } from '@/lib/cart/actions';
import { addToWishlist, removeProductFromWishlist } from '@/lib/wishlist/actions';
import type { ProductPublic, ProductVariantPublic, ProductImage } from '@/types/product';
import { ProductImageGallery } from '@/components/store/product-image-gallery';

interface ProductDetailViewerProps {
  product: ProductPublic;
  storeWhatsAppNumber: string;
  initialIsWishlisted?: boolean;
  isAuthenticated?: boolean;
}

export function ProductDetailViewer({
  product,
  storeWhatsAppNumber,
  initialIsWishlisted = false,
  isAuthenticated = false,
}: ProductDetailViewerProps) {
  // Wishlist state
  const [isWishlisted, setIsWishlisted] = useState(Boolean(initialIsWishlisted));
  const [isTogglingWishlist, setIsTogglingWishlist] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [wishlistMessage, setWishlistMessage] = useState<string | null>(null);

  // Variant selection: default to first active variant
  const [selectedVariant, setSelectedVariant] = useState<ProductVariantPublic>(
    product.variants[0] || null
  );

  const [quantity, setQuantity] = useState(1);
  const [addedToBag, setAddedToBag] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [serverStock, setServerStock] = useState<number | null>(null);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const availabilitySeq = useRef(0);

  const { items: cartItems, addItem } = useCart();

  // Query server-controlled availability strictly for selected active variant
  useEffect(() => {
    if (!selectedVariant?.id) {
      setIsLoadingAvailability(false);
      return;
    }

    let isMounted = true;
    const currentSeq = ++availabilitySeq.current;
    setIsLoadingAvailability(true);
    setAvailabilityError(null);
    setServerStock(null);

    async function loadAvailability() {
      try {
        const res = await checkVariantAvailabilityAction(selectedVariant.id);
        if (!isMounted || currentSeq !== availabilitySeq.current) return;

        if (res && res.isAvailable) {
          setServerStock(res.availableStock);
          setIsLoadingAvailability(false);
        } else {
          setServerStock(0);
          setAvailabilityError(res?.error || 'Product option is not available.');
          setIsLoadingAvailability(false);
        }
      } catch {
        if (!isMounted || currentSeq !== availabilitySeq.current) return;
        setServerStock(null);
        setAvailabilityError('Unable to verify live stock. Please try again.');
        setIsLoadingAvailability(false);
      }
    }

    loadAvailability();
    return () => {
      isMounted = false;
    };
  }, [selectedVariant?.id]);

  // Gallery image selection: default to primary image or first image
  const primaryImage = product.images.find((img) => img.isPrimary) || product.images[0] || null;
  const [activeImage, setActiveImage] = useState<ProductImage | null>(primaryImage);

  // Memoized callback to prevent recreating on every render and avoid redundant parent state updates
  const handleActiveImageChange = useCallback((img: ProductImage | null) => {
    setActiveImage((prev) => {
      if (prev?.id === img?.id && prev?.url === img?.url) return prev;
      return img;
    });
  }, []);

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

  // General stock availability and quantity limits of selected variant (Strictly 0 if unverified)
  const availableStock =
    serverStock !== null
      ? serverStock
      : typeof selectedVariant?.stockQuantity === 'number'
      ? Math.max(0, selectedVariant.stockQuantity)
      : 0;

  const existingCartItem = cartItems.find((i) => i.variantId === selectedVariant?.id);
  const alreadyInCart = existingCartItem ? existingCartItem.quantity : 0;
  const remainingAvailable = Math.max(0, availableStock - alreadyInCart);

  const isOutOfStock =
    !isLoadingAvailability &&
    ((selectedVariant ? selectedVariant.stockStatus === 'out_of_stock' : false) ||
      availableStock === 0);
  const isMaxInBag = !isOutOfStock && remainingAvailable === 0 && alreadyInCart > 0;
  const isLowStock =
    !isOutOfStock && (selectedVariant?.stockStatus === 'low_stock' || (availableStock > 0 && availableStock <= 5));

  // Handler: Change variant and auto-switch image if variant has associated image
  function handleSelectVariant(variant: ProductVariantPublic) {
    setSelectedVariant(variant);
    setServerStock(null);
    setStockError(null);
    setAvailabilityError(null);
    setIsLoadingAvailability(true);
    setQuantity(1);

    // If variant has mapped image, switch to it
    const variantImage = product.images.find((img) => img.variantId === variant.id);
    if (variantImage) {
      setActiveImage(variantImage);
    }
  }

  // Handler: Toggle wishlist item for customer
  async function handleToggleWishlist() {
    if (!isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }

    const previousState = isWishlisted;
    setIsWishlisted(!previousState);
    setIsTogglingWishlist(true);
    setWishlistMessage(null);

    try {
      if (previousState) {
        const res = await removeProductFromWishlist(product.id, selectedVariant?.id);
        if (!res.success) {
          setIsWishlisted(previousState);
          setWishlistMessage(res.error || 'Failed to update wishlist.');
        } else {
          setWishlistMessage('Removed from your wishlist.');
          setTimeout(() => setWishlistMessage(null), 3000);
        }
      } else {
        const res = await addToWishlist(product.id, selectedVariant?.id);
        if (!res.success) {
          setIsWishlisted(previousState);
          setWishlistMessage(res.error || 'Failed to save to wishlist.');
        } else {
          setWishlistMessage('Saved to your wishlist.');
          setTimeout(() => setWishlistMessage(null), 3000);
        }
      }
    } catch {
      setIsWishlisted(previousState);
      setWishlistMessage('An error occurred updating wishlist.');
    } finally {
      setIsTogglingWishlist(false);
    }
  }

  function handleAddToBag() {
    setStockError(null);
    if (!selectedVariant) return;

    if (isLoadingAvailability) {
      setStockError('Please wait while inventory availability is verified.');
      return;
    }

    if (availabilityError) {
      setStockError(availabilityError);
      return;
    }

    if (isOutOfStock) {
      setStockError('This item is currently out of stock.');
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      setStockError('Please select a valid quantity of at least 1.');
      return;
    }

    if (remainingAvailable <= 0) {
      setStockError(
        alreadyInCart >= availableStock
          ? `All ${availableStock} available units are already in your bag.`
          : 'This item is currently out of stock.'
      );
      return;
    }

    if (quantity > remainingAvailable) {
      setStockError(
        `Only ${remainingAvailable} more ${remainingAvailable === 1 ? 'unit is' : 'units are'} available in stock (${alreadyInCart} already in your bag).`
      );
      return;
    }

    const res = addItem(
      {
        variantId: selectedVariant.id,
        productId: product.id,
        productName: product.name,
        variantTitle: selectedVariant.title,
        sku: selectedVariant.sku,
        price: selectedVariant.price,
        discountPrice: selectedVariant.discountPrice,
        imageUrl: activeImage?.url || null,
        slug: product.slug,
        maxStock: availableStock,
      },
      quantity
    );

    if (!res.success) {
      setStockError(res.error || 'Could not add item to bag.');
      return;
    }

    const newRemaining = Math.max(0, remainingAvailable - quantity);
    if (newRemaining > 0) {
      setQuantity(1);
    }

    setAddedToBag(true);
    setTimeout(() => setAddedToBag(false), 3500);
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
        <ProductImageGallery
          images={product.images}
          productName={product.name}
          selectedVariantId={selectedVariant?.id}
          hasDiscount={hasDiscount}
          discountPercent={discountPercent}
          isNewArrival={product.isNewArrival}
          onActiveImageChange={handleActiveImageChange}
        />


        {/* RIGHT COLUMN: PRODUCT DETAILS & PURCHASE ACTIONS */}
        <div className="space-y-6 flex flex-col justify-start">
          {/* Header Info */}
          <div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
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
              </div>

              {/* Wishlist Heart Action */}
              <button
                type="button"
                onClick={handleToggleWishlist}
                disabled={isTogglingWishlist}
                aria-label={isWishlisted ? 'Remove from Wishlist' : 'Save to Wishlist'}
                className={`p-2.5 sm:p-3 rounded-full border transition-all shrink-0 select-none ${
                  isWishlisted
                    ? 'bg-rose-950/70 border-rose-500/60 text-rose-500 shadow-lg shadow-rose-950/50'
                    : 'bg-neutral-900/80 border-neutral-750 text-neutral-400 hover:text-rose-400 hover:border-neutral-600'
                }`}
                title={isWishlisted ? 'Saved in Wishlist' : 'Add to Wishlist'}
              >
                <Heart
                  className={`h-5 w-5 sm:h-6 sm:w-6 transition-transform active:scale-125 ${
                    isWishlisted ? 'fill-rose-500 text-rose-500' : ''
                  }`}
                />
              </button>
            </div>

            {/* Wishlist Feedback Toast */}
            {wishlistMessage && (
              <p className="text-xs text-rose-400 mt-2 flex items-center gap-1.5 animate-fadeIn">
                <Heart className="h-3.5 w-3.5 fill-current" />
                <span>{wishlistMessage}</span>
              </p>
            )}

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
              {isLoadingAvailability ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400 bg-neutral-900 border border-neutral-800 px-2.5 py-1 rounded">
                  <Loader2 className="h-3 w-3 animate-spin text-luxury-gold" />
                  Checking Stock...
                </span>
              ) : availabilityError ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-950/60 border border-amber-800/40 px-2.5 py-1 rounded">
                  <AlertCircle className="h-3 w-3 text-amber-400" />
                  Stock Unverified
                </span>
              ) : isOutOfStock ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400 bg-rose-950/60 border border-rose-800/40 px-2.5 py-1 rounded">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                  Out of Stock
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2.5 py-1 rounded">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  In Stock
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

          {/* Shopping Bag & WhatsApp Actions */}
          <div className="space-y-3 pt-3">
            <div className="flex items-center gap-3">
              {/* Quantity Selector */}
              <div className="flex items-center border border-neutral-700 rounded bg-neutral-900/80 h-12 px-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1 || isLoadingAvailability || Boolean(availabilityError) || isOutOfStock || remainingAvailable <= 0}
                  className="p-1.5 text-neutral-400 hover:text-white disabled:opacity-30 transition-colors"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-8 text-center font-semibold text-sm text-white select-none">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(remainingAvailable, q + 1))}
                  disabled={isLoadingAvailability || Boolean(availabilityError) || isOutOfStock || remainingAvailable <= 0 || quantity >= remainingAvailable}
                  className="p-1.5 text-neutral-400 hover:text-white disabled:opacity-30 transition-colors"
                  aria-label="Increase quantity"
                  title={
                    isMaxInBag
                      ? `All ${availableStock} available units are already in your bag.`
                      : quantity >= remainingAvailable
                      ? 'Maximum available stock reached'
                      : 'Increase quantity'
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Add to Bag Button */}
              <Button
                type="button"
                variant="gold"
                size="lg"
                disabled={isLoadingAvailability || Boolean(availabilityError) || isOutOfStock || isMaxInBag || remainingAvailable <= 0}
                onClick={handleAddToBag}
                className="flex-1 h-12 text-sm sm:text-base font-semibold flex items-center justify-center gap-2 shadow-lg shadow-luxury-gold/10 hover:shadow-luxury-gold/20 disabled:opacity-50"
              >
                {addedToBag ? (
                  <>
                    <Check className="h-5 w-5 text-luxury-black stroke-[2.5]" />
                    <span>Added to Bag!</span>
                  </>
                ) : isLoadingAvailability ? (
                  <>
                    <Loader2 className="h-5 w-5 text-luxury-black animate-spin" />
                    <span>Verifying Stock...</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="h-5 w-5 text-luxury-black" />
                    <span>
                      {isOutOfStock
                        ? 'Out of Stock'
                        : isMaxInBag
                        ? 'All in Bag'
                        : 'Add to Bag'}
                    </span>
                  </>
                )}
              </Button>
            </div>

            {/* In-Bag Stock Counter & Remaining Limit */}
            {alreadyInCart > 0 && !isOutOfStock && !isLoadingAvailability && (
              <p className="text-xs text-neutral-400">
                <span className="text-luxury-gold font-medium">{alreadyInCart}</span> in your bag
                {remainingAvailable > 0 ? (
                  <span> ({remainingAvailable} more available)</span>
                ) : (
                  <span className="text-amber-400"> — All {availableStock} available units are already in your bag.</span>
                )}
              </p>
            )}

            {/* Availability Error Alert */}
            {availabilityError && (
              <div className="flex items-start gap-2 text-xs bg-amber-950/80 border border-amber-800/60 text-amber-300 p-2.5 rounded shadow-sm">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <span>{availabilityError}</span>
              </div>
            )}

            {/* Stock Validation Error Alert */}
            {stockError && (
              <div className="flex items-start gap-2 text-xs bg-rose-950/80 border border-rose-800/60 text-rose-300 p-2.5 rounded shadow-sm">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{stockError}</span>
              </div>
            )}

            {/* Instant Confirmation Toast / Banner */}
            {addedToBag && (
              <div className="flex items-center justify-between text-xs bg-emerald-950/80 border border-emerald-800/60 text-emerald-300 px-3.5 py-2.5 rounded shadow-md animate-fadeIn">
                <span>Item successfully added to your shopping bag.</span>
                <Link href="/cart" className="underline font-semibold hover:text-white ml-2 shrink-0">
                  View Bag &rarr;
                </Link>
              </div>
            )}

            {/* Concierge WhatsApp Enquiry Button */}
            <a
              href={whatsAppLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block pt-1"
            >
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={isOutOfStock}
                className="w-full text-xs py-3 font-medium flex items-center justify-center gap-2 border-neutral-800 bg-neutral-900/60 text-neutral-300 hover:text-luxury-gold hover:border-luxury-gold/40 transition-colors"
              >
                <MessageCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>Order or Enquire via WhatsApp (+94 76 468 9907)</span>
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
              <span>Islandwide Delivery</span>
            </div>

            <div className="flex items-center gap-2.5 text-xs text-neutral-300">
              <ShieldCheck className="h-4 w-4 text-luxury-gold shrink-0" />
              <span>Secure Protective Packaging</span>
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
                  'Each Splender Jewel piece brings together elegance, modern trends, and timeless style, offering beautiful accessories for everyday wear and memorable occasions.'}
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

      {/* Modal: Guest Login Prompt for Wishlist */}
      {showLoginPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-luxury-card border border-luxury-border rounded-lg max-w-sm w-full p-6 shadow-2xl relative text-center space-y-4 animate-scaleUp">
            <button
              type="button"
              onClick={() => setShowLoginPrompt(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors"
              aria-label="Close modal"
            >
              ✕
            </button>
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-rose-950/50 border border-rose-500/30 text-rose-400 mx-auto">
              <Heart className="h-7 w-7 fill-rose-500 text-rose-500" />
            </div>
            <div>
              <h3 className="text-lg font-serif text-white font-bold">Save to Wishlist</h3>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                Please log in to save fine jewelry pieces to your wishlist and access your saved pieces anytime.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <Link href={`/login?redirect=/products/${product.slug}`}>
                <Button variant="gold" size="md" className="w-full font-semibold text-xs uppercase tracking-wider">
                  Sign In to Save
                </Button>
              </Link>
              <Link href={`/register?redirect=/products/${product.slug}`}>
                <Button variant="outline" size="md" className="w-full text-xs">
                  Create New Account
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
