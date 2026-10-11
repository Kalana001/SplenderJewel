import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminReviews } from '@/lib/reviews/admin-actions';
import { ReviewsManager } from '@/components/admin/reviews/reviews-manager';

export const metadata = {
  title: 'Reviews Moderation | Splender Jewel Admin',
  description: 'Moderate customer product reviews, approve verified purchaser ratings, and manage public testimonials',
};

export default async function AdminReviewsPage() {
  await requireAdminPageAuth();

  const res = await getAdminReviews();
  const reviews = res.success ? res.reviews : [];
  const metrics = res.success
    ? res.metrics
    : { totalReviews: 0, pendingCount: 0, approvedCount: 0, averageRating: 0 };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            Product Reviews Moderation Queue
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Review customer feedback, verify delivered order purchases, and approve genuine ratings for storefront display.
          </p>
        </div>
      </div>

      <ReviewsManager initialReviews={reviews} initialMetrics={metrics} />
    </div>
  );
}
