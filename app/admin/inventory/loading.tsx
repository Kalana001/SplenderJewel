import React from 'react';
import { Archive, Search } from 'lucide-react';

export default function AdminInventoryLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading Inventory Control">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Archive className="h-5 w-5 text-luxury-gold/50" />
            <div className="h-6 w-56 bg-neutral-800/80 rounded" />
          </div>
          <div className="h-3.5 w-80 max-w-full bg-neutral-800/50 rounded" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-32 bg-neutral-800/60 rounded" />
        </div>
      </div>

      {/* Two-Column Master-Detail Layout Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Product Search & Selector (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-md border border-neutral-800 bg-neutral-900/40 p-4 space-y-3">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-3 text-neutral-600" />
              <div className="h-10 w-full pl-9 bg-neutral-950/80 border border-neutral-800 rounded-sm" />
            </div>
            <div className="flex justify-between items-center text-xs text-neutral-500 pt-1">
              <div className="h-3 w-28 bg-neutral-800/60 rounded" />
              <div className="h-3 w-16 bg-neutral-800/60 rounded" />
            </div>
          </div>

          {/* Product Cards List */}
          <div className="space-y-2.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="p-4 rounded-md border border-neutral-800 bg-neutral-900/30 flex items-center justify-between gap-3"
              >
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-44 bg-neutral-800/80 rounded" />
                  <div className="flex gap-2">
                    <div className="h-3 w-20 bg-neutral-800/50 rounded" />
                    <div className="h-3 w-24 bg-neutral-800/40 rounded" />
                  </div>
                </div>
                <div className="h-6 w-20 bg-neutral-800/70 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Variant Detail & Audit Ledger (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Variant Detail Card */}
          <div className="rounded-md border border-neutral-800 bg-neutral-900/40 p-6 space-y-5">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <div className="h-5 w-48 bg-neutral-800/80 rounded" />
                <div className="h-3 w-32 bg-neutral-800/50 rounded" />
              </div>
              <div className="h-7 w-28 bg-neutral-800/70 rounded-full" />
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-3 bg-neutral-950/60 border border-neutral-800/80 rounded space-y-1.5">
                  <div className="h-3 w-16 bg-neutral-800/60 rounded" />
                  <div className="h-6 w-12 bg-neutral-800/80 rounded" />
                </div>
              ))}
            </div>

            {/* Action Bar */}
            <div className="pt-2 flex gap-3">
              <div className="h-10 flex-1 bg-luxury-gold/20 rounded" />
              <div className="h-10 w-28 bg-neutral-800/60 rounded" />
            </div>
          </div>

          {/* Audit History Ledger Skeleton */}
          <div className="rounded-md border border-neutral-800 bg-neutral-900/30 p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
              <div className="h-4 w-36 bg-neutral-800/80 rounded" />
              <div className="h-3 w-20 bg-neutral-800/50 rounded" />
            </div>
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-3 bg-neutral-950/40 border border-neutral-800/50 rounded flex justify-between items-center">
                  <div className="space-y-1">
                    <div className="h-3.5 w-32 bg-neutral-800/70 rounded" />
                    <div className="h-2.5 w-24 bg-neutral-800/40 rounded" />
                  </div>
                  <div className="h-4 w-12 bg-neutral-800/80 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
