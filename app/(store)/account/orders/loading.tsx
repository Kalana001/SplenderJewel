import React from 'react';
import { Container } from '@/components/ui/container';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Order History loading skeleton.
 * Mirrors the exact layout and black-and-gold styling of AccountOrdersPage
 * for immediate visual feedback during navigation without layout shift.
 * Contains zero private customer data.
 */
export default function AccountOrdersLoading() {
  return (
    <div className="py-8 sm:py-12 bg-neutral-50/50 dark:bg-neutral-950/30 min-h-[80vh]">
      <Container size="xl">
        <div role="status" aria-label="Loading order history">
          <span className="sr-only">Loading your order history...</span>

          {/* Breadcrumb Skeleton */}
          <div className="mb-6">
            <div className="h-4 w-36 rounded-sm bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
          </div>

          {/* Page Header Skeleton */}
          <div className="mb-8">
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 rounded-sm bg-luxury-gold/15 border border-luxury-gold/25 animate-pulse shrink-0" />
              <div className="space-y-2">
                <div className="h-7 sm:h-8 w-44 rounded-sm bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
                <div className="h-4 w-64 sm:w-80 rounded-sm bg-neutral-200 dark:bg-neutral-800/70 animate-pulse" />
              </div>
            </div>
          </div>

          {/* Order Cards Skeleton */}
          <div className="space-y-4" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card
                key={index}
                className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-luxury-surface animate-pulse"
              >
                <CardContent className="p-5 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-100 dark:border-neutral-850">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="h-4 w-36 rounded-sm bg-neutral-200 dark:bg-neutral-800" />
                        <div className="h-5 w-20 rounded-full bg-luxury-gold/15 border border-luxury-gold/25" />
                        <div className="h-5 w-28 rounded-full bg-neutral-200 dark:bg-neutral-800" />
                      </div>
                      <div className="h-3.5 w-40 rounded-sm bg-neutral-200 dark:bg-neutral-800/70" />
                    </div>

                    <div className="flex items-center justify-between sm:justify-end space-x-4">
                      <div className="space-y-1.5 sm:text-right">
                        <div className="h-3 w-20 rounded-sm bg-neutral-200 dark:bg-neutral-800/60" />
                        <div className="h-5 w-28 rounded-sm bg-neutral-200 dark:bg-neutral-800" />
                      </div>
                      <div className="h-4 w-24 rounded-sm bg-luxury-gold/20" />
                    </div>
                  </div>

                  <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="h-4 w-48 rounded-sm bg-neutral-200 dark:bg-neutral-800/70" />
                    <div className="sm:col-span-1 lg:col-span-2 h-4 w-64 rounded-sm bg-neutral-200 dark:bg-neutral-800/70" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </Container>
    </div>
  );
}
