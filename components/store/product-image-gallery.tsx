'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
  ZoomIn,
  ZoomOut,
  Package,
} from 'lucide-react';
import type { ProductImage } from '@/types/product';

export interface ProductImageGalleryProps {
  images: ProductImage[];
  productName: string;
  selectedVariantId?: string | null;
  hasDiscount?: boolean;
  discountPercent?: number;
  isNewArrival?: boolean;
  onActiveImageChange?: (image: ProductImage | null) => void;
}

import { filterGalleryImages } from '@/lib/catalog/gallery-logic';
import {
  getMasterImageUrl,
  getThumbnailImageUrl,
} from '@/lib/catalog/image-loader';
export { filterGalleryImages };


export function ProductImageGallery({
  images,
  productName,
  selectedVariantId,
  hasDiscount,
  discountPercent,
  isNewArrival,
  onActiveImageChange,
}: ProductImageGalleryProps) {
  // 1. Compute filtered images for current variation
  const filteredImages = useMemo(() => {
    return filterGalleryImages(images, selectedVariantId);
  }, [images, selectedVariantId]);

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxZoomed, setLightboxZoomed] = useState(false);

  // Fallback tracking to prevent infinite retry loops and support stable placeholder display
  const [failedThumbIds, setFailedThumbIds] = useState<Record<string, boolean>>({});
  const [failedMasterIds, setFailedMasterIds] = useState<Record<string, boolean>>({});

  // Reset fallback state when selectedVariantId changes
  useEffect(() => {
    setFailedThumbIds({});
    setFailedMasterIds({});
  }, [selectedVariantId]);

  const getThumbSource = useCallback(
    (img: ProductImage | null) => {
      if (!img?.url) return '';
      const key = img.id || img.url;
      if (failedThumbIds[key]) {
        return getMasterImageUrl(img.url);
      }
      return getThumbnailImageUrl(img.url);
    },
    [failedThumbIds]
  );

  const handleThumbError = useCallback(
    (img: ProductImage | null) => {
      if (!img?.url) return;
      const key = img.id || img.url;
      if (!failedThumbIds[key]) {
        // Stage 1: Fall back from companion thumbnail to master image URL
        setFailedThumbIds((prev) => ({ ...prev, [key]: true }));
      } else if (!failedMasterIds[key]) {
        // Stage 2: Master image also failed; render stable placeholder and terminate retries
        setFailedMasterIds((prev) => ({ ...prev, [key]: true }));
      }
    },
    [failedThumbIds, failedMasterIds]
  );

  const handleMasterError = useCallback((img: ProductImage | null) => {
    if (!img?.url) return;
    const key = img.id || img.url;
    setFailedMasterIds((prev) => ({ ...prev, [key]: true }));
  }, []);

  // Touch gesture state for mobile swiping
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const thumbnailRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Safe clamped active image
  const safeActiveIndex =
    filteredImages.length > 0
      ? Math.max(0, Math.min(activeIndex, filteredImages.length - 1))
      : 0;
  const activeImage = filteredImages[safeActiveIndex] || null;

  // Stable ref for parent callback to prevent re-triggering effects
  const onActiveImageChangeRef = useRef(onActiveImageChange);
  useEffect(() => {
    onActiveImageChangeRef.current = onActiveImageChange;
  });

  // Track previous variant ID to isolate variant-switch synchronization from ordinary navigation
  const prevVariantIdRef = useRef<string | null | undefined>(selectedVariantId);

  // Effect 1: Variation Change Synchronization
  // Runs ONLY when selectedVariantId changes or images change
  useEffect(() => {
    // If variant hasn't changed, just ensure activeIndex is clamped if list shrank
    if (prevVariantIdRef.current === selectedVariantId) {
      setActiveIndex((prev) => {
        if (filteredImages.length === 0) return 0;
        return prev >= filteredImages.length ? filteredImages.length - 1 : prev;
      });
      return;
    }

    // Variant changed: update tracked variant
    prevVariantIdRef.current = selectedVariantId;

    if (filteredImages.length === 0) {
      setActiveIndex(0);
      return;
    }

    // If new variant has a specific image in filteredImages, target it (typically index 0)
    if (selectedVariantId) {
      const variantIdx = filteredImages.findIndex((img) => img.variantId === selectedVariantId);
      if (variantIdx !== -1) {
        setActiveIndex(variantIdx);
        return;
      }
    }

    // If new variant has no specific image, default to primary image or 0
    const primaryIdx = filteredImages.findIndex((img) => img.isPrimary);
    setActiveIndex(primaryIdx !== -1 ? primaryIdx : 0);
  }, [selectedVariantId, filteredImages]);

  // Effect 2: Synchronize activeImage with parent component outside of state updaters
  const lastReportedImageRef = useRef<{ id: string | undefined; url: string | undefined } | null>(null);

  useEffect(() => {
    const currentId = activeImage?.id;
    const currentUrl = activeImage?.url;

    if (
      !lastReportedImageRef.current ||
      lastReportedImageRef.current.id !== currentId ||
      lastReportedImageRef.current.url !== currentUrl
    ) {
      lastReportedImageRef.current = { id: currentId, url: currentUrl };
      onActiveImageChangeRef.current?.(activeImage);
    }
  }, [activeImage]);

  // Navigation handlers with functional updates (dependencies ONLY filteredImages.length)
  const handleSelectIndex = useCallback(
    (index: number) => {
      if (filteredImages.length === 0) return;
      const safeIndex = (index + filteredImages.length) % filteredImages.length;
      setActiveIndex(safeIndex);
    },
    [filteredImages.length]
  );

  const handlePrev = useCallback(() => {
    if (filteredImages.length <= 1) return;
    setActiveIndex((prev) => (prev - 1 + filteredImages.length) % filteredImages.length);
  }, [filteredImages.length]);

  const handleNext = useCallback(() => {
    if (filteredImages.length <= 1) return;
    setActiveIndex((prev) => (prev + 1) % filteredImages.length);
  }, [filteredImages.length]);

  // Keyboard navigation on main gallery container
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (filteredImages.length <= 1) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
    },
    [filteredImages.length, handlePrev, handleNext]
  );

  // Mobile Touch Gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    if (filteredImages.length <= 1) return;
    const touch = e.touches[0];
    setTouchStartX(touch.clientX);
    setTouchStartY(touch.clientY);
    setIsSwiping(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isSwiping || touchStartX === null || touchStartY === null) {
      setIsSwiping(false);
      setTouchStartX(null);
      setTouchStartY(null);
      return;
    }

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;

    const minSwipeDistance = 40;

    // Must be predominantly horizontal gesture to avoid interfering with vertical scroll
    if (Math.abs(deltaX) >= minSwipeDistance && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
      if (deltaX < 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }

    setIsSwiping(false);
    setTouchStartX(null);
    setTouchStartY(null);
  };

  // Auto-scroll active thumbnail into view
  useEffect(() => {
    if (thumbnailRefs.current[safeActiveIndex]) {
      thumbnailRefs.current[safeActiveIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [safeActiveIndex]);

  // Lightbox keyboard controls & body scroll lock
  useEffect(() => {
    if (!lightboxOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxOpen(false);
        setLightboxZoomed(false);
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [lightboxOpen, handlePrev, handleNext]);

  // 0 Images Fallback
  if (filteredImages.length === 0) {
    return (
      <div className="space-y-4">
        <div className="relative aspect-square w-full bg-neutral-900 border border-luxury-border rounded-sm overflow-hidden shadow-2xl flex flex-col items-center justify-center text-neutral-600">
          <Package className="h-16 w-16 text-luxury-gold/30 mb-2" />
          <span className="text-xs uppercase tracking-widest text-neutral-500 font-mono">
            Splender Jewel
          </span>
        </div>
      </div>
    );
  }

  const hasMultiple = filteredImages.length > 1;

  return (
    <div className="space-y-4 select-none">
      {/* MAIN GALLERY CONTAINER */}
      <div
        ref={containerRef}
        tabIndex={0}
        role="region"
        aria-label="Product image gallery"
        onKeyDown={handleKeyDown}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'pan-y' }}
        className="group relative aspect-square w-full bg-neutral-950 border border-luxury-border rounded-sm overflow-hidden shadow-2xl focus:outline-none focus:ring-1 focus:ring-luxury-gold/50 cursor-pointer"
      >
        {/* Main Display Image */}
        {activeImage && (
          failedMasterIds[activeImage.id || activeImage.url] ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-900 text-neutral-600">
              <Package className="h-16 w-16 text-luxury-gold/30 mb-2" />
              <span className="text-xs uppercase tracking-widest text-neutral-500 font-mono">
                Splender Jewel
              </span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`main-${activeImage.id || activeImage.url}`}
              src={getMasterImageUrl(activeImage.url)}
              alt={activeImage.altText || productName}
              onClick={() => setLightboxOpen(true)}
              loading={safeActiveIndex === 0 ? 'eager' : 'lazy'}
              onError={() => handleMasterError(activeImage)}
              className="w-full h-full object-cover transition-opacity duration-300"
            />
          )
        )}

        {/* Badges Overlay (Discount / New Arrival) */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10 pointer-events-none">
          {hasDiscount && (
            <span className="bg-luxury-ruby text-white text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-sm shadow-md shadow-luxury-ruby/20 border border-luxury-ruby-light/30">
              -{discountPercent}% OFF
            </span>
          )}
          {isNewArrival && (
            <span className="bg-luxury-black/90 text-luxury-gold border border-luxury-gold/40 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-sm backdrop-blur-sm">
              New Arrival
            </span>
          )}
        </div>

        {/* Desktop Navigation Arrow: Previous */}
        {hasMultiple && (
          <button
            type="button"
            aria-label="Previous image"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11 min-h-[44px] min-w-[44px] rounded-full bg-black/60 hover:bg-black/90 text-white hover:text-luxury-gold border border-white/10 hover:border-luxury-gold/50 flex items-center justify-center transition-all opacity-80 md:opacity-0 md:group-hover:opacity-100 backdrop-blur-sm z-10"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {/* Desktop Navigation Arrow: Next */}
        {hasMultiple && (
          <button
            type="button"
            aria-label="Next image"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 min-h-[44px] min-w-[44px] rounded-full bg-black/60 hover:bg-black/90 text-white hover:text-luxury-gold border border-white/10 hover:border-luxury-gold/50 flex items-center justify-center transition-all opacity-80 md:opacity-0 md:group-hover:opacity-100 backdrop-blur-sm z-10"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {/* Image Position Counter Badge & Fullscreen Icon */}
        <div className="absolute bottom-3 right-3 flex items-center gap-2 z-10">
          {hasMultiple && (
            <div className="bg-black/75 backdrop-blur-sm text-neutral-300 font-mono text-xs px-2.5 py-1 rounded-sm border border-neutral-800 tracking-wider shadow-md">
              {safeActiveIndex + 1} / {filteredImages.length}
            </div>
          )}

          <button
            type="button"
            aria-label="Expand image"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxOpen(true);
            }}
            className="h-10 w-10 min-h-[44px] min-w-[44px] rounded-sm bg-black/75 hover:bg-black text-neutral-300 hover:text-luxury-gold border border-neutral-800 flex items-center justify-center transition-colors backdrop-blur-sm shadow-md"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* THUMBNAILS CAROUSEL */}
      {hasMultiple && (
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none pt-0.5">
          {filteredImages.map((img, idx) => {
            const isActive = idx === safeActiveIndex;
            const imgKey = img.id || img.url;
            const isMasterFailed = failedMasterIds[imgKey];
            const isThumbFailed = failedThumbIds[imgKey];

            return (
              <button
                key={img.id || `${img.url}-${idx}`}
                ref={(el) => {
                  thumbnailRefs.current[idx] = el;
                }}
                type="button"
                aria-label={`View image ${idx + 1} of ${filteredImages.length}`}
                onClick={() => handleSelectIndex(idx)}
                className={`relative aspect-square w-20 rounded-sm overflow-hidden border-2 transition-all shrink-0 ${
                  isActive
                    ? 'border-luxury-gold ring-1 ring-luxury-gold scale-105 opacity-100 shadow-md'
                    : 'border-neutral-800 hover:border-neutral-600 opacity-60 hover:opacity-100'
                }`}
              >
                {isMasterFailed ? (
                  <div className="w-full h-full flex items-center justify-center bg-neutral-900 text-neutral-600">
                    <Package className="h-6 w-6 text-luxury-gold/40" />
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`thumb-${imgKey}-${isThumbFailed ? 'master' : 'thumb'}`}
                    src={getThumbSource(img)}
                    alt={img.altText || `Thumbnail ${idx + 1}`}
                    loading="lazy"
                    width={80}
                    height={80}
                    onError={() => handleThumbError(img)}
                    className="w-full h-full object-cover"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* FULLSCREEN LIGHTBOX MODAL */}
      {lightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Fullscreen image gallery"
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between p-4 md:p-6"
        >
          {/* Top Bar: Title, Zoom, Close */}
          <div className="flex items-center justify-between gap-4 z-20">
            <div className="text-sm font-medium text-neutral-300 truncate">
              <span>{productName}</span>
              {hasMultiple && (
                <span className="text-luxury-gold font-mono ml-3 text-xs">
                  {safeActiveIndex + 1} / {filteredImages.length}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={lightboxZoomed ? 'Zoom out' : 'Zoom in'}
                onClick={() => setLightboxZoomed(!lightboxZoomed)}
                className="h-9 w-9 rounded-full bg-neutral-900/90 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700 flex items-center justify-center transition-colors"
              >
                {lightboxZoomed ? (
                  <ZoomOut className="h-4 w-4" />
                ) : (
                  <ZoomIn className="h-4 w-4" />
                )}
              </button>

              <button
                type="button"
                aria-label="Close fullscreen gallery"
                onClick={() => {
                  setLightboxOpen(false);
                  setLightboxZoomed(false);
                }}
                className="h-9 w-9 rounded-full bg-neutral-900/90 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700 flex items-center justify-center transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Main Lightbox Viewport */}
          <div
            className="relative flex-1 flex items-center justify-center my-4 overflow-hidden"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            style={{ touchAction: 'pan-y' }}
          >
            {activeImage && (
              failedMasterIds[activeImage.id || activeImage.url] ? (
                <div className="flex flex-col items-center justify-center text-neutral-500 py-16">
                  <Package className="h-20 w-20 text-luxury-gold/30 mb-4" />
                  <span className="text-sm text-neutral-400">Image unavailable</span>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`lightbox-main-${activeImage.id || activeImage.url}`}
                  src={getMasterImageUrl(activeImage.url)}
                  alt={activeImage.altText || productName}
                  onClick={() => setLightboxZoomed(!lightboxZoomed)}
                  onError={() => handleMasterError(activeImage)}
                  className={`max-w-full max-h-[75vh] object-contain transition-transform duration-200 select-none ${
                    lightboxZoomed ? 'scale-150 cursor-zoom-out' : 'scale-100 cursor-zoom-in'
                  }`}
                />
              )
            )}

            {/* Lightbox Navigation: Previous */}
            {hasMultiple && (
              <button
                type="button"
                aria-label="Previous image"
                onClick={handlePrev}
                className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-black/60 hover:bg-black/90 text-white hover:text-luxury-gold border border-neutral-700 flex items-center justify-center transition-all z-20 backdrop-blur-sm"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            {/* Lightbox Navigation: Next */}
            {hasMultiple && (
              <button
                type="button"
                aria-label="Next image"
                onClick={handleNext}
                className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-black/60 hover:bg-black/90 text-white hover:text-luxury-gold border border-neutral-700 flex items-center justify-center transition-all z-20 backdrop-blur-sm"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>

          {/* Lightbox Bottom Thumbnails Row */}
          {hasMultiple && (
            <div className="flex justify-center gap-2 overflow-x-auto py-2 z-20">
              {filteredImages.map((img, idx) => {
                const imgKey = img.id || img.url;
                const isMasterFailed = failedMasterIds[imgKey];
                const isThumbFailed = failedThumbIds[imgKey];

                return (
                  <button
                    key={`lightbox-${img.id || idx}`}
                    type="button"
                    aria-label={`Jump to image ${idx + 1}`}
                    onClick={() => {
                      handleSelectIndex(idx);
                      setLightboxZoomed(false);
                    }}
                    className={`relative aspect-square w-14 rounded-sm overflow-hidden border-2 transition-all shrink-0 ${
                      idx === safeActiveIndex
                        ? 'border-luxury-gold ring-1 ring-luxury-gold scale-105'
                        : 'border-neutral-800 opacity-50 hover:opacity-100'
                    }`}
                  >
                    {isMasterFailed ? (
                      <div className="w-full h-full flex items-center justify-center bg-neutral-900 text-neutral-600">
                        <Package className="h-4 w-4 text-luxury-gold/40" />
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`lightbox-thumb-${imgKey}-${isThumbFailed ? 'master' : 'thumb'}`}
                        src={getThumbSource(img)}
                        alt=""
                        loading="lazy"
                        width={56}
                        height={56}
                        onError={() => handleThumbError(img)}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
