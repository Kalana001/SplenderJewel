import React from 'react';
import { Package, Plus } from 'lucide-react';

export default function AdminProductsLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading Products Catalog">
      {/* Top Banner Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-900/40 p-5 rounded-md border border-neutral-800">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-luxury-gold/50" />
            <div className="h-6 w-56 bg-neutral-800/80 rounded" />
          </div>
          <div className="h-3.5 w-96 max-w-full bg-neutral-800/50 rounded" />
        </div>
        <div className="h-9 w-36 bg-luxury-gold/20 rounded shrink-0" />
      </div>

      {/* Filter and Search Bar Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-neutral-900/30 p-4 rounded-md border border-neutral-800">
        <div className="h-10 bg-neutral-800/70 rounded" />
        <div className="h-10 bg-neutral-800/60 rounded" />
        <div className="h-10 bg-neutral-800/60 rounded" />
        <div className="h-10 bg-neutral-800/60 rounded" />
      </div>

      {/* Products Table Skeleton */}
      <div className="rounded-md border border-neutral-800 bg-neutral-900/30 overflow-hidden divide-y divide-neutral-800/60">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="h-12 w-12 bg-neutral-800/80 rounded shrink-0" />
              <div className="space-y-2 flex-1 max-w-sm">
                <div className="h-4 w-48 bg-neutral-800/80 rounded" />
                <div className="h-3 w-32 bg-neutral-800/50 rounded" />
              </div>
            </div>
            <div className="hidden sm:block space-y-1">
              <div className="h-3.5 w-16 bg-neutral-800/60 rounded" />
              <div className="h-4 w-20 bg-neutral-800/80 rounded" />
            </div>
            <div className="hidden md:block h-6 w-20 bg-neutral-800/70 rounded-full" />
            <div className="flex gap-2">
              <div className="h-8 w-16 bg-neutral-800/60 rounded" />
              <div className="h-8 w-8 bg-neutral-800/60 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
