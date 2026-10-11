'use client';

import React, { useState } from 'react';
import {
  Star,
  CheckCircle2,
  XCircle,
  Trash2,
  Check,
  Search,
  AlertCircle,
  MessageSquare,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import type { ProductReview } from '@/types/review';
import { approveAdminReview, deleteAdminReview, type AdminReviewsSummaryMetrics } from '@/lib/reviews/admin-actions';

interface ReviewsManagerProps {
  initialReviews: ProductReview[];
  initialMetrics: AdminReviewsSummaryMetrics;
}

export function ReviewsManager({ initialReviews, initialMetrics }: ReviewsManagerProps) {
  const [reviews, setReviews] = useState<ProductReview[]>(initialReviews);
  const [metrics, setMetrics] = useState<AdminReviewsSummaryMetrics>(initialMetrics);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [search, setSearch] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const handleApprove = async (review: ProductReview, approve: boolean) => {
    setActionLoadingId(review.id);
    try {
      const res = await approveAdminReview(review.id, approve);
      if (res.success) {
        setReviews((prev) =>
          prev.map((r) => (r.id === review.id ? { ...r, isApproved: approve } : r))
        );
        setMetrics((prev) => ({
          ...prev,
          pendingCount: approve ? prev.pendingCount - 1 : prev.pendingCount + 1,
          approvedCount: approve ? prev.approvedCount + 1 : prev.approvedCount - 1,
        }));
      } else {
        alert(res.error || 'Failed to update review status.');
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (review: ProductReview) => {
    if (!confirm(`Are you sure you want to permanently delete this review from '${review.customerName}'?`)) {
      return;
    }

    setActionLoadingId(review.id);
    try {
      const res = await deleteAdminReview(review.id);
      if (res.success) {
        setReviews((prev) => prev.filter((r) => r.id !== review.id));
        setMetrics((prev) => ({
          ...prev,
          totalReviews: prev.totalReviews - 1,
          pendingCount: !review.isApproved ? prev.pendingCount - 1 : prev.pendingCount,
          approvedCount: review.isApproved ? prev.approvedCount - 1 : prev.approvedCount,
        }));
      } else {
        alert(res.error || 'Failed to delete review.');
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredReviews = reviews.filter((r) => {
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'pending'
        ? !r.isApproved
        : r.isApproved;

    const query = search.toLowerCase();
    const matchesSearch =
      r.customerName.toLowerCase().includes(query) ||
      (r.productName || '').toLowerCase().includes(query) ||
      (r.comment || '').toLowerCase().includes(query) ||
      (r.title || '').toLowerCase().includes(query);

    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4">
          <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block">
            Total Reviews
          </span>
          <span className="text-xl font-bold font-serif text-white mt-1 block">
            {metrics.totalReviews}
          </span>
        </div>

        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4">
          <span className="text-[11px] uppercase tracking-wider text-amber-400 font-semibold block">
            Pending Moderation
          </span>
          <span className="text-xl font-bold font-serif text-amber-300 mt-1 block">
            {metrics.pendingCount}
          </span>
        </div>

        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4">
          <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold block">
            Approved Reviews
          </span>
          <span className="text-xl font-bold font-serif text-emerald-300 mt-1 block">
            {metrics.approvedCount}
          </span>
        </div>

        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-4">
          <span className="text-[11px] uppercase tracking-wider text-luxury-gold font-semibold block">
            Average Rating
          </span>
          <div className="flex items-center gap-1.5 mt-1">
            <Star className="h-4 w-4 fill-luxury-gold text-luxury-gold" />
            <span className="text-xl font-bold font-serif text-white">
              {metrics.averageRating > 0 ? metrics.averageRating : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              statusFilter === 'all'
                ? 'bg-luxury-gold text-neutral-950'
                : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
            }`}
          >
            All ({metrics.totalReviews})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              statusFilter === 'pending'
                ? 'bg-amber-500 text-neutral-950 font-bold'
                : 'bg-neutral-900 text-amber-400/80 hover:text-amber-300 border border-neutral-800'
            }`}
          >
            <span>Pending Moderation</span>
            {metrics.pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-400/20 text-[10px]">
                {metrics.pendingCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('approved')}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              statusFilter === 'approved'
                ? 'bg-emerald-500 text-neutral-950 font-bold'
                : 'bg-neutral-900 text-emerald-400/80 hover:text-emerald-300 border border-neutral-800'
            }`}
          >
            Approved ({metrics.approvedCount})
          </button>
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-500" />
          <input
            type="text"
            placeholder="Search by customer, product, comment..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-luxury-gold"
          />
        </div>
      </div>

      {/* Reviews List */}
      {filteredReviews.length === 0 ? (
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-12 text-center text-neutral-500">
          <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No reviews found matching current filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReviews.map((review) => {
            const isLoading = actionLoadingId === review.id;

            return (
              <div
                key={review.id}
                className={`bg-neutral-900/60 border rounded-lg p-6 space-y-4 transition-all ${
                  review.isApproved
                    ? 'border-neutral-800'
                    : 'border-amber-800/60 bg-amber-950/10'
                }`}
              >
                {/* Header: Customer, Product, Rating, Status */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <h3 className="font-semibold text-white text-sm">{review.customerName}</h3>
                      {review.isVerifiedPurchase && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-luxury-gold/15 text-luxury-gold border border-luxury-gold/30">
                          <ShieldCheck className="h-3 w-3" />
                          <span>Verified Purchase</span>
                        </span>
                      )}
                      <span className="text-[11px] text-neutral-500">
                        {new Date(review.createdAt).toLocaleDateString('en-LK', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>

                    <div className="text-xs text-neutral-400">
                      Product:{' '}
                      <strong className="text-neutral-200">{review.productName}</strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Stars */}
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-4 w-4 ${
                            star <= review.rating
                              ? 'fill-luxury-gold text-luxury-gold'
                              : 'text-neutral-700'
                          }`}
                        />
                      ))}
                    </div>

                    {/* Status Badge */}
                    {review.isApproved ? (
                      <span className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded text-xs font-semibold bg-amber-950 text-amber-400 border border-amber-800 flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5" /> Pending
                      </span>
                    )}
                  </div>
                </div>

                {/* Review Body */}
                <div className="space-y-1.5 pt-2 border-t border-neutral-800/80">
                  {review.title && (
                    <h4 className="font-serif font-bold text-sm text-white">{review.title}</h4>
                  )}
                  {review.comment && (
                    <p className="text-xs text-neutral-300 leading-relaxed italic">
                      &quot;{review.comment}&quot;
                    </p>
                  )}
                </div>

                {/* Moderation Actions */}
                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-800/80">
                  {review.isApproved ? (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleApprove(review, false)}
                      className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-amber-300 rounded text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      Unpublish (Revoke)
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleApprove(review, true)}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isLoading ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      <span>Approve Review</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleDelete(review)}
                    className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-neutral-800 rounded transition-colors disabled:opacity-50"
                    title="Delete Review"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
