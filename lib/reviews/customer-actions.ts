'use server';

import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireCustomerAuth, getCurrentUser } from '@/lib/auth/server';
import type { CustomerReviewItem, EligibleReviewItem, SubmitReviewInput } from '@/types/customer-review';

export async function getCustomerReviews(): Promise<{
  success: boolean;
  reviews: CustomerReviewItem[];
  error?: string;
}> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error('UNAUTHORIZED_CUSTOMER');
    }
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return { success: false, reviews: [], error: 'Database service is currently unavailable.' };
    }

    const { data, error } = await (supabase.from('reviews') as any)
      .select(`
        id,
        product_id,
        order_id,
        order_item_id,
        rating,
        title,
        comment,
        is_verified_purchase,
        is_approved,
        created_at,
        products (
          id,
          name,
          slug,
          product_images (url, is_primary)
        ),
        orders (
          id,
          order_number
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, reviews: [], error: error.message };
    }

    const reviews: CustomerReviewItem[] = (data || []).map((row: any) => {
      const prod = row.products;
      const primaryImg = prod?.product_images?.find((img: any) => img.is_primary)?.url
        || prod?.product_images?.[0]?.url
        || null;

      return {
        id: row.id,
        productId: row.product_id,
        productName: prod?.name || 'Jewelry Piece',
        productSlug: prod?.slug || '',
        productImage: primaryImg,
        orderId: row.order_id,
        orderNumber: row.orders?.order_number,
        orderItemId: row.order_item_id,
        rating: row.rating,
        title: row.title,
        comment: row.comment,
        isVerifiedPurchase: Boolean(row.is_verified_purchase),
        isApproved: Boolean(row.is_approved),
        createdAt: row.created_at,
      };
    });

    return { success: true, reviews };
  } catch (err: any) {
    return {
      success: false,
      reviews: [],
      error: err.message === 'UNAUTHORIZED_CUSTOMER' ? 'Please log in to view your reviews.' : (err.message || 'Failed to load reviews.'),
    };
  }
}

export async function getEligibleReviewProducts(): Promise<{
  success: boolean;
  eligibleItems: EligibleReviewItem[];
  error?: string;
}> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error('UNAUTHORIZED_CUSTOMER');
    }
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return { success: false, eligibleItems: [], error: 'Database service is currently unavailable.' };
    }

    // 1. Fetch delivered orders for this user
    const { data: deliveredOrders, error: ordersError } = await (supabase.from('orders') as any)
      .select(`
        id,
        order_number,
        updated_at,
        order_items (
          id,
          product_id,
          product_name,
          variant_id,
          variant_title,
          unit_price,
          total_price
        )
      `)
      .eq('user_id', user.id)
      .eq('order_status', 'delivered')
      .order('updated_at', { ascending: false });

    if (ordersError) {
      return { success: false, eligibleItems: [], error: ordersError.message };
    }

    if (!deliveredOrders || deliveredOrders.length === 0) {
      return { success: true, eligibleItems: [] };
    }

    // 2. Fetch existing reviews to exclude already reviewed order items
    const { data: existingReviews } = await (supabase.from('reviews') as any)
      .select('order_item_id')
      .eq('user_id', user.id);

    const reviewedItemIds = new Set((existingReviews || []).map((r: any) => r.order_item_id));

    // 3. Assemble eligible items
    const eligible: EligibleReviewItem[] = [];
    for (const order of deliveredOrders) {
      for (const item of (order.order_items || [])) {
        if (!reviewedItemIds.has(item.id)) {
          eligible.push({
            orderId: order.id,
            orderNumber: order.order_number,
            orderItemId: item.id,
            deliveredAt: order.updated_at,
            productId: item.product_id,
            productName: item.product_name,
            productSlug: item.product_name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            variantId: item.variant_id,
            variantTitle: item.variant_title,
          });
        }
      }
    }

    return { success: true, eligibleItems: eligible };
  } catch (err: any) {
    return {
      success: false,
      eligibleItems: [],
      error: err.message === 'UNAUTHORIZED_CUSTOMER' ? 'Please log in to view review eligibility.' : (err.message || 'Failed to check eligibility.'),
    };
  }
}

export async function submitCustomerReview(input: SubmitReviewInput): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const profile = await requireCustomerAuth();
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Database service is currently unavailable.' };
    }

    // Validation
    const rating = Math.floor(input.rating);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      return { success: false, error: 'Please select a star rating between 1 and 5.' };
    }

    const comment = input.comment?.trim();
    if (!comment || comment.length < 5) {
      return { success: false, error: 'Please write a review comment with at least 5 characters.' };
    }
    if (comment.length > 2000) {
      return { success: false, error: 'Review comment exceeds maximum limit of 2,000 characters.' };
    }

    const title = input.title?.trim() || null;
    if (title && title.length > 100) {
      return { success: false, error: 'Review headline must not exceed 100 characters.' };
    }

    // Verify order item and verified purchase status
    const { data: itemData, error: itemError } = await (supabase.from('order_items') as any)
      .select(`
        id,
        order_id,
        product_id,
        orders (
          user_id,
          order_status
        )
      `)
      .eq('id', input.orderItemId)
      .single();

    if (itemError || !itemData) {
      return { success: false, error: 'Could not find the referenced purchased order item.' };
    }

    if (itemData.orders?.user_id !== profile.id) {
      return { success: false, error: 'You are only authorized to review items from your own purchases.' };
    }

    if (itemData.orders?.order_status !== 'delivered') {
      return { success: false, error: 'Reviews may only be submitted for verified delivered purchases.' };
    }

    // Check if already reviewed
    const { data: existing } = await (supabase.from('reviews') as any)
      .select('id')
      .eq('order_item_id', input.orderItemId)
      .single();

    if (existing) {
      return { success: false, error: 'You have already submitted a review for this purchased item.' };
    }

    // Insert review into moderation queue
    const { error: insertError } = await (supabase.from('reviews') as any).insert({
      product_id: itemData.product_id,
      variant_id: input.variantId || null,
      order_id: itemData.order_id,
      order_item_id: input.orderItemId,
      user_id: profile.id,
      customer_name: profile.fullName || 'Verified Customer',
      rating,
      title,
      comment,
      is_verified_purchase: true,
      is_approved: false, // Requires admin moderation
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to submit review.' };
  }
}
