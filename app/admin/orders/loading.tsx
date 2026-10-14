import React from 'react';
import { ShoppingBag } from 'lucide-react';

export default function AdminOrdersLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading Orders Management">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <ShoppingBag className="h-5 w-5 text-luxury-gold/50" />
            <div className="h-6 w-64 bg-neutral-800/80 rounded" />
          </div>
          <div className="h-3.5 w-96 max-w-full bg-neutral-800/50 rounded" />
        </div>
      </div>

      {/* Overview Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-4 rounded-md border border-neutral-800 bg-neutral-900/40 space-y-2.5">
            <div className="h-3.5 w-24 bg-neutral-800/70 rounded" />
            <div className="h-7 w-28 bg-neutral-800/90 rounded" />
            <div className="h-2.5 w-32 bg-neutral-800/40 rounded" />
          </div>
        ))}
      </div>

      {/* Filter and Table Skeleton */}
      <div className="rounded-md border border-neutral-800 bg-neutral-900/30 overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex flex-col sm:flex-row gap-3 justify-between">
          <div className="h-9 w-full sm:w-72 bg-neutral-800/70 rounded" />
          <div className="flex gap-2">
            <div className="h-9 w-28 bg-neutral-800/60 rounded" />
            <div className="h-9 w-28 bg-neutral-800/60 rounded" />
          </div>
        </div>

        <div className="divide-y divide-neutral-800/60">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="p-4 flex items-center justify-between gap-4">
              <div className="space-y-1.5 flex-1 max-w-xs">
                <div className="h-4 w-32 bg-neutral-800/80 rounded" />
                <div className="h-3 w-40 bg-neutral-800/50 rounded" />
              </div>
              <div className="h-4 w-20 bg-neutral-800/70 rounded" />
              <div className="h-6 w-24 bg-neutral-800/60 rounded-full" />
              <div className="h-8 w-20 bg-neutral-800/70 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
