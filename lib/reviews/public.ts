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
