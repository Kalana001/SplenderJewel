'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/auth/server';
import type { ProductReview, ReviewFilter } from '@/types/review';

export interface AdminReviewsSummaryMetrics {
  totalReviews: number;
  pendingCount: number;
  approvedCount: number;
  averageRating: number;
}

export async function getAdminReviews(filter: ReviewFilter = {}): Promise<{
  success: boolean;
  reviews: ProductReview[];
  metrics: AdminReviewsSummaryMetrics;
  error?: string;
}> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    let query = (adminClient.from('reviews') as any)
      .select(`
        id,
        product_id,
        variant_id,
        order_id,
        order_item_id,
        user_id,
        customer_name,
        rating,
        title,
        comment,
        is_verified_purchase,
        is_approved,
        created_at,
        updated_at,
        products (
          name
        )
      `)
      .order('created_at', { ascending: false });

    if (filter.status === 'pending') {
      query = query.eq('is_approved', false);
    } else if (filter.status === 'approved') {
      query = query.eq('is_approved', true);
    }

    if (filter.rating) {
      query = query.eq('rating', filter.rating);
    }

    const { data, error } = await query;
    if (error) {
      return {
        success: false,
        reviews: [],
        metrics: { totalReviews: 0, pendingCount: 0, approvedCount: 0, averageRating: 0 },
        error: error.message,
      };
    }

    const reviews: ProductReview[] = (data || []).map((row: any) => ({
      id: row.id,
      productId: row.product_id,
      productName: row.products?.name || 'Jewelry Piece',
      variantId: row.variant_id,
      orderId: row.order_id,
      orderItemId: row.order_item_id,
      userId: row.user_id,
      customerName: row.customer_name,
      rating: Number(row.rating),
      title: row.title,
      comment: row.comment,
      isVerifiedPurchase: Boolean(row.is_verified_purchase),
      isApproved: Boolean(row.is_approved),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    // Derive metrics across all reviews
    let totalReviews = reviews.length;
    let pendingCount = 0;
    let approvedCount = 0;
    let totalRatingSum = 0;

    for (const r of reviews) {
      if (r.isApproved) approvedCount++;
      else pendingCount++;
      totalRatingSum += r.rating;
    }

    const averageRating = totalReviews > 0 ? Number((totalRatingSum / totalReviews).toFixed(1)) : 0;

    return {
      success: true,
      reviews,
      metrics: {
        totalReviews,
        pendingCount,
        approvedCount,
        averageRating,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      reviews: [],
      metrics: { totalReviews: 0, pendingCount: 0, approvedCount: 0, averageRating: 0 },
      error: err.message || 'Failed to fetch reviews.',
    };
  }
}

export async function approveAdminReview(
  reviewId: string,
  isApproved: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!reviewId) return { success: false, error: 'Review ID is required.' };

    const { error } = await (adminClient.from('reviews') as any)
      .update({
        is_approved: isApproved,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reviewId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/admin/reviews');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update review status.' };
  }
}

export async function deleteAdminReview(reviewId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!reviewId) return { success: false, error: 'Review ID is required.' };

    const { error } = await (adminClient.from('reviews') as any)
      .delete()
      .eq('id', reviewId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/admin/reviews');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete review.' };
  }
}
