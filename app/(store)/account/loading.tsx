import React from 'react';
import { Container } from '@/components/ui/container';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

/**
 * Account Dashboard skeleton.
 * Matches the layout and black-and-gold styling of AccountDashboardPage to eliminate
 * layout shift while streaming. Contains zero private customer data.
 */
export default function AccountDashboardLoading() {
  return (
    <div className="py-8 sm:py-12 bg-neutral-50/50 dark:bg-neutral-950/30 min-h-[80vh]">
      <Container size="xl">
        <div role="status" aria-label="Loading account dashboard">
          <span className="sr-only">Loading account dashboard...</span>

          {/* Welcome Header Skeleton */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-8 border-b border-neutral-200 dark:border-neutral-800 gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 rounded-full bg-luxury-gold/15 border border-luxury-gold/30 animate-pulse shrink-0" />
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="h-7 w-44 bg-neutral-200 dark:bg-neutral-800 rounded-sm animate-pulse" />
                  <div className="h-5 w-24 bg-emerald-100/50 dark:bg-emerald-950/40 border border-emerald-200/50 dark:border-emerald-800/40 rounded-full animate-pulse" />
                </div>
                <div className="h-4 w-56 bg-neutral-200 dark:bg-neutral-800/70 rounded-sm animate-pulse" />
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="h-9 w-36 bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-sm animate-pulse" />
              <div className="h-9 w-20 bg-neutral-200 dark:bg-neutral-800/60 rounded-sm animate-pulse" />
            </div>
          </div>

          {/* Quick Navigation Cards Skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 my-8">
            {Array.from({ length: 4 }).map((_, index) => (
              <Card key={index} className="h-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 animate-pulse">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <div className="w-10 h-10 rounded-sm bg-neutral-100 dark:bg-neutral-800" />
                  <div className="w-4 h-4 bg-neutral-200 dark:bg-neutral-800 rounded-sm" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="h-6 w-10 bg-neutral-200 dark:bg-neutral-800 rounded-sm" />
                  <div className="h-4 w-28 bg-neutral-200 dark:bg-neutral-800/80 rounded-sm" />
                  <div className="h-3 w-44 bg-neutral-200 dark:bg-neutral-800/50 rounded-sm" />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Recent Orders Section Skeleton */}
          <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <div className="space-y-1">
                <div className="h-6 w-32 bg-neutral-200 dark:bg-neutral-800 rounded-sm animate-pulse" />
                <div className="h-3 w-64 bg-neutral-200 dark:bg-neutral-800/60 rounded-sm animate-pulse" />
              </div>
              <div className="h-8 w-24 bg-neutral-200 dark:bg-neutral-800/60 rounded-sm animate-pulse" />
            </div>

            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-sm border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-luxury-surface gap-3 animate-pulse"
                >
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <div className="h-4 w-20 bg-neutral-200 dark:bg-neutral-800 rounded-sm" />
                      <div className="h-4 w-16 bg-neutral-200 dark:bg-neutral-800 rounded-full" />
                    </div>
                    <div className="h-3 w-36 bg-neutral-200 dark:bg-neutral-800/60 rounded-sm" />
                  </div>
                  <div className="h-8 w-24 bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-sm" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
