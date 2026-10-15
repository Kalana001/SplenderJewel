import React from 'react';
import { Container } from '@/components/ui/container';

/**
 * Wishlist skeleton. Mirrors the real page header and card grid so content
 * replaces the placeholders without layout shift.
 */
export default function AccountWishlistLoading() {
  return (
    <Container size="xl" className="py-8 sm:py-12 lg:py-16">
      <div className="space-y-6" role="status" aria-label="Loading your wishlist">
        <span className="sr-only">Loading your wishlist...</span>

        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-neutral-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="h-3 w-20 animate-pulse rounded-sm bg-luxury-gold/20" />
            <div className="h-8 w-44 animate-pulse rounded-sm bg-neutral-900 sm:h-9" />
            <div className="h-4 w-28 animate-pulse rounded-sm bg-neutral-900" />
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <div className="h-4 w-32 animate-pulse rounded-sm bg-neutral-900" />
            <div className="h-10 w-24 animate-pulse rounded-sm border border-neutral-800 bg-neutral-900/60" />
          </div>
        </div>

        {/* Card grid */}
        <ul
          aria-hidden="true"
          className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-3 lg:gap-6 xl:grid-cols-4"
        >
          {Array.from({ length: 4 }).map((_, index) => (
            <li key={index} className="min-w-0">
              <div className="flex h-full flex-col overflow-hidden rounded-sm border border-neutral-800 bg-neutral-900/40">
                <div className="flex flex-1 gap-3 p-3 sm:gap-4 sm:p-4 lg:flex-col lg:gap-0 lg:p-0">
                  <div className="aspect-square w-[100px] shrink-0 animate-pulse rounded-sm bg-neutral-900 min-[375px]:w-[110px] min-[430px]:w-[120px] md:w-[128px] lg:w-full lg:rounded-none" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2 lg:p-4 lg:pb-0">
                    <div className="h-4 w-11/12 animate-pulse rounded-sm bg-neutral-900" />
                    <div className="h-4 w-2/3 animate-pulse rounded-sm bg-neutral-900" />
                    <div className="h-3 w-1/2 animate-pulse rounded-sm bg-neutral-900" />
                    <div className="h-4 w-24 animate-pulse rounded-sm bg-luxury-gold/15" />
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 pb-3 sm:px-4 sm:pb-4 lg:pt-4">
                  <div className="h-11 flex-1 animate-pulse rounded-sm bg-luxury-gold/15 sm:h-10" />
                  <div className="h-11 w-11 animate-pulse rounded-sm border border-neutral-800 bg-neutral-900 sm:h-10 sm:w-10" />
                  <div className="h-11 w-11 animate-pulse rounded-sm border border-neutral-800 bg-neutral-900 sm:h-10 sm:w-10" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Container>
  );
}
