'use client';

import React from 'react';
import Link from 'next/link';
import { Star, MessageSquare, ShieldCheck, CheckCircle2 } from 'lucide-react';
import type { ProductReviewsData } from '@/lib/reviews/public';

interface ProductReviewsSectionProps {
  reviewsData: ProductReviewsData;
  productName: string;
}

export function ProductReviewsSection({ reviewsData, productName }: ProductReviewsSectionProps) {
  const { reviews, summary } = reviewsData;
  const { averageRating, totalReviews, ratingDistribution, isUnavailable } = summary;

  return (
    <section id="reviews" aria-label="Customer Reviews" className="mt-16 sm:mt-24 pt-12 border-t border-neutral-850">
      <div className="space-y-8">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-luxury-gold/10 border border-luxury-gold/25 text-luxury-gold-light text-[10px] uppercase tracking-[0.2em] mb-2">
              <ShieldCheck className="h-3 w-3 text-luxury-gold" />
              <span>Verified Patron Feedback</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
              Customer Reviews
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1">
              Genuine reviews from patrons who purchased {productName}
            </p>
          </div>

          <div className="text-xs text-neutral-400">
            Purchased this piece?{' '}
            <Link
              href="/account/orders"
              className="text-luxury-gold hover:underline font-medium"
            >
              Review from your orders
            </Link>
          </div>
        </div>

        {isUnavailable || totalReviews > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Rating Summary Card */}
            <div className="bg-luxury-card border border-luxury-border p-6 rounded-md space-y-5 h-fit">
              {isUnavailable ? (
                <div className="text-center space-y-2 py-4">
                  <p className="text-sm font-serif font-semibold text-white">
                    Rating Summary Unavailable
                  </p>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    Aggregated rating statistics are temporarily unavailable due to high review volume. You can still read recent verified patron reviews beside this card.
                  </p>
                </div>
              ) : (
                <>
                  <div className="text-center space-y-2">
                    <div className="text-4xl font-serif font-bold text-white">
                      {averageRating.toFixed(1)}
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-4 w-4 ${
                            star <= Math.round(averageRating)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-neutral-600'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-neutral-400">
                      Based on {totalReviews} {totalReviews === 1 ? 'verified review' : 'verified reviews'}
                    </p>
                  </div>

                  {/* Rating Distribution Bars */}
                  <div className="space-y-2 pt-2 border-t border-neutral-800">
                    {[5, 4, 3, 2, 1].map((score) => {
                      const count = ratingDistribution[score] || 0;
                      const percentage = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
                      return (
                        <div key={score} className="flex items-center gap-2 text-xs text-neutral-400">
                          <span className="w-12 text-right">{score} star</span>
                          <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-luxury-gold rounded-full"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="w-8 text-left text-neutral-500">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Reviews List */}
            <div className="lg:col-span-2 space-y-4">
              {reviews.map((rev) => (
                <div
                  key={rev.id}
                  className="bg-luxury-card border border-luxury-border p-5 rounded-md space-y-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">
                          {rev.customerName}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Verified Patron
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-3.5 w-3.5 ${
                              star <= rev.rating
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-neutral-600'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <time className="text-[11px] text-neutral-500 shrink-0">
                      {new Date(rev.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </time>
                  </div>

                  {rev.title && (
                    <h4 className="text-sm font-semibold text-neutral-200">
                      {rev.title}
                    </h4>
                  )}

                  {rev.comment && (
                    <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed font-light">
                      {rev.comment}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className="bg-luxury-card border border-luxury-border rounded-md p-10 sm:p-14 text-center max-w-xl mx-auto space-y-4">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-500 mx-auto">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-serif font-semibold text-white">
                No Reviews Yet
              </h3>
              <p className="text-xs sm:text-sm text-neutral-400 mt-1.5 leading-relaxed font-light">
                Be the first to share your experience with this piece. Verified buyers can submit a review directly from their customer account order history once delivered.
              </p>
            </div>
            <div className="pt-2">
              <Link href="/account/orders">
                <span className="inline-flex items-center text-xs text-luxury-gold hover:underline font-medium">
                  Go to Order History &rarr;
                </span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
