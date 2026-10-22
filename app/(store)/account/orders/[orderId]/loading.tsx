import React from 'react';
import { Container } from '@/components/ui/container';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

/**
 * Order Details loading skeleton.
 * Mirrors the exact 3-column layout and black-and-gold styling of AccountOrderDetailPage
 * for immediate visual feedback during navigation without layout shift.
 * Contains zero private customer data.
 */
export default function AccountOrderDetailLoading() {
  return (
    <div className="py-8 sm:py-12 bg-neutral-50/50 dark:bg-neutral-950/30 min-h-[80vh]">
      <Container size="xl">
        <div role="status" aria-label="Loading order details">
          <span className="sr-only">Loading order details...</span>

          {/* Breadcrumb Skeleton */}
          <div className="mb-6">
            <div className="h-4 w-36 rounded-sm bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
          </div>

          {/* Order Header Skeleton */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-neutral-200 dark:border-neutral-800 gap-4 mb-8">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="h-7 sm:h-9 w-52 rounded-sm bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
                <div className="h-5 w-20 rounded-full bg-luxury-gold/15 border border-luxury-gold/25 animate-pulse" />
                <div className="h-5 w-28 rounded-full bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
              </div>
              <div className="h-3.5 w-48 rounded-sm bg-neutral-200 dark:bg-neutral-800/70 animate-pulse" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" aria-hidden="true">
            {/* Left Column: Items, Address, Tracking */}
            <div className="lg:col-span-2 space-y-6">
              {/* Itemized Order Details Card */}
              <Card className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-luxury-surface animate-pulse">
                <CardHeader className="pb-3 border-b border-neutral-100 dark:border-neutral-850">
                  <div className="h-5 w-44 rounded-sm bg-neutral-200 dark:bg-neutral-800" />
                </CardHeader>
                <CardContent className="p-0 divide-y divide-neutral-100 dark:divide-neutral-850">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <div key={index} className="p-4 sm:p-5 flex items-center justify-between gap-4">
                      <div className="space-y-2">
                        <div className="h-4 w-48 rounded-sm bg-neutral-200 dark:bg-neutral-800" />
                        <div className="h-3 w-32 rounded-sm bg-neutral-200 dark:bg-neutral-800/70" />
                        <div className="h-3 w-24 rounded-sm bg-neutral-200 dark:bg-neutral-800/50" />
                      </div>
                      <div className="h-4 w-24 rounded-sm bg-neutral-200 dark:bg-neutral-800 shrink-0" />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Delivery Address Card */}
              <Card className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-luxury-surface animate-pulse">
                <CardHeader className="pb-3 border-b border-neutral-100 dark:border-neutral-850">
                  <div className="h-5 w-36 rounded-sm bg-neutral-200 dark:bg-neutral-800" />
                </CardHeader>
                <CardContent className="p-5 space-y-2.5">
                  <div className="h-4 w-40 rounded-sm bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-3.5 w-64 rounded-sm bg-neutral-200 dark:bg-neutral-800/70" />
                  <div className="h-3.5 w-48 rounded-sm bg-neutral-200 dark:bg-neutral-800/70" />
                  <div className="h-3.5 w-44 rounded-sm bg-neutral-200 dark:bg-neutral-800/50" />
                </CardContent>
              </Card>

              {/* Delivery Tracking Card */}
              <Card className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-luxury-surface animate-pulse">
                <CardHeader className="pb-3 border-b border-neutral-100 dark:border-neutral-850">
                  <div className="h-5 w-36 rounded-sm bg-neutral-200 dark:bg-neutral-800" />
                </CardHeader>
                <CardContent className="p-5">
                  <div className="h-4 w-72 rounded-sm bg-neutral-200 dark:bg-neutral-800/70" />
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Order Summary */}
            <div>
              <Card className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-luxury-surface sticky top-24 animate-pulse">
                <CardHeader className="pb-3 border-b border-neutral-100 dark:border-neutral-850">
                  <div className="h-5 w-32 rounded-sm bg-neutral-200 dark:bg-neutral-800" />
                </CardHeader>
                <CardContent className="p-5 space-y-3">
                  <div className="flex justify-between">
                    <div className="h-3.5 w-16 rounded-sm bg-neutral-200 dark:bg-neutral-800/70" />
                    <div className="h-3.5 w-20 rounded-sm bg-neutral-200 dark:bg-neutral-800" />
                  </div>
                  <div className="flex justify-between">
                    <div className="h-3.5 w-24 rounded-sm bg-neutral-200 dark:bg-neutral-800/70" />
                    <div className="h-3.5 w-16 rounded-sm bg-neutral-200 dark:bg-neutral-800" />
                  </div>
                  <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-between">
                    <div className="h-5 w-24 rounded-sm bg-neutral-200 dark:bg-neutral-800" />
                    <div className="h-5 w-28 rounded-sm bg-luxury-gold/20" />
                  </div>
                  <div className="pt-4 border-t border-neutral-100 dark:border-neutral-850 space-y-3">
                    <div className="h-3.5 w-44 rounded-sm bg-neutral-200 dark:bg-neutral-800/70" />
                    <div className="h-10 w-full rounded-sm border border-luxury-gold/30 bg-luxury-gold/10" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
