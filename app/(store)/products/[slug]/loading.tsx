import React from 'react';
import { Container } from '@/components/ui/container';

export default function ProductDetailLoading() {
  return (
    <div className="py-8 sm:py-12 bg-luxury-black min-h-screen">
      <Container size="xl">
        {/* Breadcrumb Shimmer */}
        <div className="flex items-center space-x-2 mb-6">
          <div className="h-3 w-16 bg-neutral-850 rounded-sm animate-pulse" />
          <div className="h-3 w-3 bg-neutral-850 rounded-full animate-pulse" />
          <div className="h-3 w-20 bg-neutral-850 rounded-sm animate-pulse" />
          <div className="h-3 w-3 bg-neutral-850 rounded-full animate-pulse" />
          <div className="h-3 w-28 bg-luxury-gold/20 rounded-sm animate-pulse" />
        </div>

        {/* 2-Column Product Detail Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Left Column: Gallery Shimmer */}
          <div className="space-y-4">
            {/* Main Image Shimmer */}
            <div className="aspect-square w-full rounded-sm bg-neutral-900 border border-neutral-850 animate-pulse relative overflow-hidden">
              <div className="absolute top-3 left-3 h-5 w-16 bg-luxury-gold/15 border border-luxury-gold/25 rounded-sm" />
            </div>

            {/* Thumbnail Row Shimmer */}
            <div className="flex space-x-3 overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 w-20 rounded-sm bg-neutral-900 border border-neutral-850 animate-pulse shrink-0"
                />
              ))}
            </div>
          </div>

          {/* Right Column: Product Meta & Purchase Shimmer */}
          <div className="space-y-6">
            <div className="space-y-3 pb-6 border-b border-neutral-850">
              <div className="h-4 w-28 bg-luxury-gold/20 rounded-full animate-pulse" />
              <div className="h-8 sm:h-10 w-3/4 bg-neutral-900 border border-neutral-850 rounded-sm animate-pulse" />
              <div className="h-4 w-36 bg-neutral-850 rounded-sm animate-pulse" />
              <div className="h-7 w-40 bg-luxury-gold/25 rounded-sm animate-pulse mt-3" />
            </div>

            {/* Variant Selector Shimmer */}
            <div className="space-y-3 pb-6 border-b border-neutral-850">
              <div className="h-4 w-24 bg-neutral-850 rounded-sm animate-pulse" />
              <div className="flex flex-wrap gap-2">
                <div className="h-9 w-24 rounded-sm bg-neutral-900 border border-neutral-800 animate-pulse" />
                <div className="h-9 w-28 rounded-sm bg-neutral-900/60 border border-neutral-850 animate-pulse" />
                <div className="h-9 w-20 rounded-sm bg-neutral-900/60 border border-neutral-850 animate-pulse" />
              </div>
            </div>

            {/* Action Buttons Shimmer */}
            <div className="space-y-3 pt-2">
              <div className="h-12 w-full rounded-sm bg-luxury-gold/20 border border-luxury-gold/30 animate-pulse" />
              <div className="h-12 w-full rounded-sm bg-neutral-900 border border-neutral-800 animate-pulse" />
            </div>

            {/* Trust Badges Shimmer */}
            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-neutral-850">
              <div className="h-12 rounded-sm bg-neutral-900/50 border border-neutral-850 animate-pulse" />
              <div className="h-12 rounded-sm bg-neutral-900/50 border border-neutral-850 animate-pulse" />
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
