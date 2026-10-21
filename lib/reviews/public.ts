import { cache } from 'react';

export interface PublicApprovedReview {
  id: string;
  customerName: string;
  rating: number;
  title: string | null;
  comment: string | null;
  productName: string | null;
  createdAt: string;
}

/**
 * Public accessor for verified, administrator-approved customer reviews.
 * Returns only genuine reviews from the database where is_approved = true.
 * Cached per request. Returns empty array if no approved reviews exist.
 */
export const getPublicApprovedReviews = cache(async function getPublicApprovedReviews(
  limit = 6,
  client?: any
): Promise<PublicApprovedReview[]> {
  try {
    let supabase = client;
    if (supabase === undefined) {
      try {
        const { createPublicSupabaseClient } = await import('@/lib/supabase/server');
        supabase = createPublicSupabaseClient();
      } catch {
        return [];
      }
    }
    if (!supabase) return [];

    const { data, error } = await (supabase.from('reviews') as any)
      .select(`
        id,
        customer_name,
        rating,
        title,
        comment,
        created_at,
        products (
          name
        )
      `)
      .eq('is_approved', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Reviews] Error fetching public approved reviews:', error.message);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map((row: any) => ({
      id: row.id,
      customerName: row.customer_name || 'Verified Patron',
      rating: typeof row.rating === 'number' ? row.rating : 5,
      title: row.title || null,
      comment: row.comment || null,
      productName: row.products?.name || null,
      createdAt: row.created_at,
    }));
  } catch (err) {
    console.error('[Reviews] Unexpected error loading approved reviews:', err instanceof Error ? err.message : err);
    return [];
  }
});

export interface ProductReviewSummary {
  averageRating: number;
  totalReviews: number;
  ratingDistribution: Record<number, number>;
  isUnavailable?: boolean;
}

export interface ProductReviewsData {
  reviews: PublicApprovedReview[];
  summary: ProductReviewSummary;
}

/**
 * Public accessor for product-specific approved customer reviews.
 * Returns only genuine reviews from the database where is_approved = true and product_id matches.
 * Never exposes pending, rejected, or private customer data.
 * Safe for public product ISR caching without reading request cookies.
 */
export const getProductApprovedReviews = cache(async function getProductApprovedReviews(
  productId: string,
  limit = 20,
  client?: any
): Promise<ProductReviewsData> {
  const emptySummary: ProductReviewSummary = {
    averageRating: 0,
    totalReviews: 0,
    ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  };

  if (!productId || typeof productId !== 'string') {
    return { reviews: [], summary: emptySummary };
  }

  try {
    let supabase = client;
    if (supabase === undefined) {
      try {
        const { createPublicSupabaseClient } = await import('@/lib/supabase/server');
        supabase = createPublicSupabaseClient();
      } catch {
        return { reviews: [], summary: emptySummary };
      }
    }
    if (!supabase) return { reviews: [], summary: emptySummary };

    const [reviewsResult, summaryResult] = await Promise.all([
      (supabase.from('reviews') as any)
        .select(`
          id,
          customer_name,
          rating,
          title,
          comment,
          created_at
        `)
        .eq('product_id', productId)
        .eq('is_approved', true)
        .order('created_at', { ascending: false })
        .limit(limit),
      (supabase.from('reviews') as any)
        .select('rating', { count: 'exact' })
        .eq('product_id', productId)
        .eq('is_approved', true)
        .limit(5000),
    ]);

    if (reviewsResult.error) {
      console.error('[Reviews] Error fetching product approved reviews:', reviewsResult.error.message);
      return { reviews: [], summary: emptySummary };
    }

    const displayData = reviewsResult.data || [];
    const summaryData = summaryResult.data || [];

    // Map displayed reviews (limited to the requested batch, e.g. 20)
    const reviews: PublicApprovedReview[] = displayData.map((row: any) => {
      const rawRating = Number(row.rating);
      const rating = Number.isInteger(rawRating) && rawRating >= 1 && rawRating <= 5 ? rawRating : 5;

      return {
        id: row.id,
        customerName: row.customer_name || 'Verified Patron',
        rating,
        title: row.title || null,
        comment: row.comment || null,
        productName: null,
        createdAt: row.created_at,
      };
    });

    if (displayData.length === 0 && summaryData.length === 0) {
      return { reviews: [], summary: emptySummary };
    }

    // Detect if database approved reviews exceed the supported ceiling of 5,000.
    // If the dataset exceeds the limit, return an explicit unavailable-summary state
    // rather than calculating misleading metrics from a partial truncated slice.
    const totalApprovedCount = summaryResult.count != null ? summaryResult.count : summaryData.length;
    const isOverflow = totalApprovedCount > 5000 || (summaryResult.count == null && summaryData.length >= 5000);

    if (isOverflow) {
      console.warn(
        `[Reviews] Product approved review count (${totalApprovedCount}) exceeds supported ceiling (5000). Returning explicit unavailable-summary state.`
      );
      return {
        reviews,
        summary: {
          averageRating: 0,
          totalReviews: 0,
          ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          isUnavailable: true,
        },
      };
    }

    // Compute genuine rating summary across ALL approved reviews for this product
    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let ratingSum = 0;

    for (const row of summaryData) {
      const rawRating = Number(row.rating);
      const rating = Number.isInteger(rawRating) && rawRating >= 1 && rawRating <= 5 ? rawRating : 5;
      ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
      ratingSum += rating;
    }

    const totalReviews = summaryData.length;
    const averageRating = totalReviews > 0 ? Number((ratingSum / totalReviews).toFixed(1)) : 0;

    return {
      reviews,
      summary: {
        averageRating,
        totalReviews,
        ratingDistribution,
        isUnavailable: false,
      },
    };
  } catch (err) {
    console.error('[Reviews] Unexpected error loading product reviews:', err instanceof Error ? err.message : err);
    return { reviews: [], summary: emptySummary };
  }
});
