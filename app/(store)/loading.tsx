import React from 'react';
import { Container } from '@/components/ui/container';

export default function StoreLoading() {
  return (
    <div className="py-8 sm:py-12 bg-luxury-black min-h-screen">
      <Container size="xl">
        {/* Header Shimmer */}
        <div className="space-y-3 mb-8">
          <div className="h-4 w-28 bg-luxury-gold/15 border border-luxury-gold/20 rounded-full animate-pulse" />
          <div className="h-8 sm:h-10 w-48 sm:w-80 bg-neutral-900 border border-neutral-850 rounded-sm animate-pulse" />
          <div className="h-4 w-full max-w-md bg-neutral-900/60 rounded-sm animate-pulse" />
        </div>

        {/* Filter Pills Shimmer */}
        <div className="flex items-center space-x-2 pb-6 overflow-x-hidden border-b border-neutral-850 mb-8">
          <div className="h-8 w-20 bg-neutral-900 border border-neutral-800 rounded-full animate-pulse shrink-0" />
          <div className="h-8 w-24 bg-neutral-900/70 border border-neutral-850 rounded-full animate-pulse shrink-0" />
          <div className="h-8 w-28 bg-neutral-900/70 border border-neutral-850 rounded-full animate-pulse shrink-0" />
          <div className="h-8 w-24 bg-neutral-900/70 border border-neutral-850 rounded-full animate-pulse shrink-0" />
          <div className="h-8 w-20 bg-neutral-900/70 border border-neutral-850 rounded-full animate-pulse shrink-0" />
        </div>

        {/* Product Cards Shimmer Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="flex flex-col bg-luxury-card border border-luxury-border rounded-sm overflow-hidden animate-pulse"
            >
              {/* Product Image Square Shimmer */}
              <div className="relative aspect-square w-full bg-neutral-900/90 overflow-hidden">
                <div className="absolute top-2 left-2 h-4 w-12 bg-luxury-gold/10 border border-luxury-gold/20 rounded-sm" />
              </div>

              {/* Product Info Shimmer */}
              <div className="p-3.5 sm:p-4 flex flex-col flex-grow justify-between space-y-2.5">
                <div className="space-y-1.5">
                  <div className="h-3 w-16 bg-neutral-850 rounded-sm" />
                  <div className="h-4 w-full bg-neutral-850 rounded-sm" />
                </div>
                <div className="pt-2 border-t border-luxury-border/60 flex items-center justify-between">
                  <div className="h-4 w-20 bg-luxury-gold/20 rounded-sm" />
                  <div className="h-3 w-12 bg-neutral-850 rounded-sm" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </div>
  );
}
