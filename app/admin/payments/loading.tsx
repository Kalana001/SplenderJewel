import React from 'react';

export default function AdminPaymentsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading payment settlements...">
      {/* Page Title Shimmer */}
      <div className="border-b border-neutral-800 pb-5 space-y-2">
        <div className="h-8 w-64 bg-neutral-800/80 rounded animate-pulse" />
        <div className="h-4 w-96 bg-neutral-900 rounded animate-pulse" />
      </div>

      {/* Metrics Row Shimmer */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4 space-y-2">
            <div className="h-3.5 w-28 bg-neutral-800/70 rounded animate-pulse" />
            <div className="h-7 w-36 bg-neutral-800 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Filter and Search Bar Shimmer */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4 flex flex-col md:flex-row gap-4 justify-between items-stretch">
        <div className="h-10 w-full max-w-md bg-neutral-800/70 rounded animate-pulse" />
        <div className="flex gap-3">
          <div className="h-10 w-36 bg-neutral-800/70 rounded animate-pulse" />
          <div className="h-10 w-36 bg-neutral-800/70 rounded animate-pulse" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="bg-neutral-900/40 border border-neutral-800 rounded-lg overflow-hidden p-6 space-y-4">
        <div className="h-6 w-full bg-neutral-800/50 rounded animate-pulse" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-12 w-full bg-neutral-800/30 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}
