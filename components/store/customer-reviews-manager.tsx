'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Star, ShieldCheck, Clock, CheckCircle2, MessageSquare, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitCustomerReview } from '@/lib/reviews/customer-actions';
import type { CustomerReviewItem, EligibleReviewItem, SubmitReviewInput } from '@/types/customer-review';

interface CustomerReviewsManagerProps {
  initialReviews: CustomerReviewItem[];
  initialEligible: EligibleReviewItem[];
}

export function CustomerReviewsManager({
  initialReviews,
  initialEligible,
}: CustomerReviewsManagerProps) {
  const [reviews, setReviews] = useState<CustomerReviewItem[]>(initialReviews);
  const [eligible, setEligible] = useState<EligibleReviewItem[]>(initialEligible);
  const [activeTab, setActiveTab] = useState<'eligible' | 'submitted'>(
    initialEligible.length > 0 ? 'eligible' : 'submitted'
  );

  // Modal State
  const [selectedEligible, setSelectedEligible] = useState<EligibleReviewItem | null>(null);
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const starLabels: Record<number, string> = {
    1: 'Poor',
    2: 'Fair',
    3: 'Good',
    4: 'Very Good',
    5: 'Excellent',
  };

  const openReviewModal = (item: EligibleReviewItem) => {
    setSelectedEligible(item);
    setRating(5);
    setHoverRating(null);
    setTitle('');
    setComment('');
    setFeedback(null);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEligible) return;

    setSubmitting(true);
    setFeedback(null);

    const input: SubmitReviewInput = {
      orderId: selectedEligible.orderId,
      orderItemId: selectedEligible.orderItemId,
      productId: selectedEligible.productId,
      variantId: selectedEligible.variantId,
      rating,
      title: title || undefined,
      comment,
    };

    try {
      const res = await submitCustomerReview(input);
      if (res.success) {
        // Remove from eligible items
        setEligible((prev) => prev.filter((i) => i.orderItemId !== selectedEligible.orderItemId));

        // Add to submitted reviews in pending status
        const newReview: CustomerReviewItem = {
          id: `rev-${Date.now()}`,
          productId: selectedEligible.productId,
          productName: selectedEligible.productName,
          productSlug: selectedEligible.productSlug,
          productImage: selectedEligible.productImage,
          variantTitle: selectedEligible.variantTitle,
          orderId: selectedEligible.orderId,
          orderNumber: selectedEligible.orderNumber,
          orderItemId: selectedEligible.orderItemId,
          rating,
          title: title || null,
          comment,
          isVerifiedPurchase: true,
          isApproved: false,
          createdAt: new Date().toISOString(),
        };

        setReviews((prev) => [newReview, ...prev]);
        setFeedback({
          type: 'success',
          message: 'Thank you! Your verified review has been submitted for moderation and will appear live upon approval.',
        });
        setSelectedEligible(null);
        setActiveTab('submitted');
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to submit review.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'An unexpected error occurred.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            Product Reviews
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Share feedback on your delivered jewelry pieces to help other connoisseurs choose.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 p-1 rounded-md self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('eligible')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${
              activeTab === 'eligible'
                ? 'bg-neutral-800 text-white shadow'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <span>Awaiting Review</span>
            {eligible.length > 0 && (
              <span className="px-1.5 py-0.2 bg-luxury-gold text-black rounded-full text-[10px] font-bold">
                {eligible.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('submitted')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${
              activeTab === 'submitted'
                ? 'bg-neutral-800 text-white shadow'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <span>Submitted Reviews</span>
            <span className="text-neutral-500 text-[10px]">({reviews.length})</span>
          </button>
        </div>
      </div>

      {/* Global alert feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-md border text-sm flex items-start gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-emerald-400" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-rose-400" />
          )}
          <div className="flex-1 font-medium">{feedback.message}</div>
        </div>
      )}

      {/* Tab 1: Eligible Purchases */}
      {activeTab === 'eligible' && (
        <div className="space-y-4">
          {eligible.length === 0 ? (
            <Card className="border-neutral-800 bg-neutral-900/40 text-center py-12">
              <CardContent className="space-y-3">
                <div className="h-14 w-14 mx-auto rounded-full bg-luxury-gold/10 border border-luxury-gold/30 flex items-center justify-center text-luxury-gold">
                  <ShieldCheck className="h-7 w-7 stroke-[1.5]" />
                </div>
                <h3 className="text-base font-medium text-white">No pending reviews</h3>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                  Only delivered orders qualify for verified purchase reviews. Once an order is delivered, it will appear here.
                </p>
                <div className="pt-2">
                  <Link href="/account/orders">
                    <Button variant="outline" size="sm" className="border-neutral-700 text-xs">
                      View Order Status
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {eligible.map((item) => (
                <Card
                  key={item.orderItemId}
                  className="border-neutral-800 bg-neutral-900/50 hover:border-neutral-700 transition-colors"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between text-xs text-neutral-400">
                      <span>Order #{item.orderNumber}</span>
                      <Badge variant="success" className="text-[10px] uppercase font-bold tracking-wider">
                        Delivered
                      </Badge>
                    </div>
                    <CardTitle className="text-base text-white mt-1">
                      {item.productName}
                    </CardTitle>
                    {item.variantTitle && (
                      <CardDescription className="text-xs text-neutral-400">
                        Variant: {item.variantTitle}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Button
                      variant="gold"
                      size="sm"
                      onClick={() => openReviewModal(item)}
                      className="w-full text-xs font-semibold gap-1.5"
                    >
                      <Star className="h-3.5 w-3.5 fill-current" />
                      Write Verified Review
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Submitted Reviews */}
      {activeTab === 'submitted' && (
        <div className="space-y-4">
          {reviews.length === 0 ? (
            <Card className="border-neutral-800 bg-neutral-900/40 text-center py-12">
              <CardContent className="space-y-3">
                <div className="h-14 w-14 mx-auto rounded-full bg-luxury-gold/10 border border-luxury-gold/30 flex items-center justify-center text-luxury-gold">
                  <MessageSquare className="h-7 w-7 stroke-[1.5]" />
                </div>
                <h3 className="text-base font-medium text-white">No reviews submitted yet</h3>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                  When you review your purchased jewelry pieces, your reviews and approval statuses will be displayed here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {reviews.map((rev) => (
                <Card key={rev.id} className="border-neutral-800 bg-neutral-900/50">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <CardTitle className="text-base text-white">
                          {rev.productName}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          {/* Star Rating */}
                          <div className="flex items-center gap-0.5 text-luxury-gold">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`h-3.5 w-3.5 ${
                                  star <= rev.rating ? 'fill-current' : 'text-neutral-700'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-neutral-400">
                            • {new Date(rev.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {/* Moderation Badge */}
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <Badge variant="outline" className="text-[10px] text-neutral-400 border-neutral-700">
                          <ShieldCheck className="h-3 w-3 mr-1 text-luxury-gold" />
                          Verified Purchase
                        </Badge>
                        {rev.isApproved ? (
                          <Badge variant="success" className="text-[10px] uppercase font-bold tracking-wider">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Approved & Live
                          </Badge>
                        ) : (
                          <Badge variant="warning" className="text-[10px] uppercase font-bold tracking-wider">
                            <Clock className="h-3 w-3 mr-1" />
                            Pending Review
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-2 text-xs text-neutral-300">
                    {rev.title && (
                      <p className="font-semibold text-white text-sm">
                        {rev.title}
                      </p>
                    )}
                    <p className="leading-relaxed whitespace-pre-line text-neutral-300">
                      {rev.comment}
                    </p>
                    {!rev.isApproved && (
                      <p className="text-[11px] text-amber-400/90 italic pt-1">
                        * Note: This review is pending concierge moderation and will appear publicly once verified.
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Review Submission Modal */}
      {selectedEligible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-1.5 text-xs text-luxury-gold font-semibold uppercase tracking-wider mb-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                Verified Purchase Review
              </div>
              <h3 className="text-lg font-serif font-bold text-white">
                {selectedEligible.productName}
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                From Order #{selectedEligible.orderNumber}
              </p>
            </div>

            <form onSubmit={handleSubmitReview} className="space-y-4">
              {/* Star Rating Picker */}
              <div className="space-y-2">
                <Label className="text-xs text-neutral-300">Overall Rating *</Label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const active = (hoverRating ?? rating) >= star;
                      return (
                        <button
                          key={star}
                          type="button"
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(null)}
                          onClick={() => setRating(star)}
                          className="p-1 text-luxury-gold transition-transform hover:scale-110 focus:outline-none"
                        >
                          <Star
                            className={`h-6 w-6 ${
                              active ? 'fill-current' : 'text-neutral-700'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-xs font-semibold text-luxury-gold">
                    {starLabels[hoverRating ?? rating]}
                  </span>
                </div>
              </div>

              {/* Review Headline */}
              <div className="space-y-1">
                <Label className="text-xs text-neutral-300">Review Headline (Optional)</Label>
                <Input
                  maxLength={100}
                  placeholder="e.g. Exquisite craftsmanship and shine"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="border-neutral-800 bg-neutral-950 text-xs text-white"
                />
              </div>

              {/* Review Commentary */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-neutral-300">Review Commentary *</Label>
                  <span className="text-[10px] text-neutral-500">{comment.length} / 2000</span>
                </div>
                <textarea
                  required
                  rows={4}
                  maxLength={2000}
                  placeholder="Tell us about the weight, finish, clasp, sizing, and your overall experience wearing this piece..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full rounded-md border border-neutral-800 bg-neutral-950 p-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-luxury-gold resize-none"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedEligible(null)}
                  disabled={submitting}
                  className="border-neutral-700 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="gold"
                  size="sm"
                  disabled={submitting}
                  className="text-xs font-semibold px-5"
                >
                  {submitting ? 'Submitting...' : 'Submit Review'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
