'use server';

import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCurrentUser, requireCustomerAuth } from '@/lib/auth/server';
import type { WishlistProduct } from '@/types/wishlist';

export async function getCustomerWishlist(): Promise<{
  success: boolean;
  items: WishlistProduct[];
  error?: string;
}> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: true, items: [] };
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return { success: false, items: [], error: 'Database service is currently unavailable.' };
    }

    // 1. Get user wishlist record
    let { data: wishlist } = await (supabase.from('wishlists') as any)
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!wishlist) {
      // Create empty wishlist record
      const { data: newWishlist, error: createError } = await (supabase.from('wishlists') as any)
        .insert({ user_id: user.id })
        .select('id')
        .single();

      if (createError) {
        return { success: false, items: [], error: createError.message };
      }
      wishlist = newWishlist;
    }

    // 2. Fetch wishlist items with products and variants
    const { data: items, error: itemsError } = await (supabase.from('wishlist_items') as any)
      .select(`
        id,
        created_at,
        products (
          id,
          name,
          slug,
          product_images (url, is_primary)
        ),
        product_variants (
          id,
          title,
          sku,
          price,
          discount_price,
          stock_status
        )
      `)
      .eq('wishlist_id', wishlist.id)
      .order('created_at', { ascending: false });

    if (itemsError) {
      return { success: false, items: [], error: itemsError.message };
    }

    const wishlistProducts: WishlistProduct[] = (items || []).map((row: any) => {
      const prod = row.products;
      const variant = row.product_variants;
      const primaryImg = prod?.product_images?.find((img: any) => img.is_primary)?.url
        || prod?.product_images?.[0]?.url
        || null;

      return {
        id: row.id,
        productId: prod?.id || '',
        variantId: variant?.id || null,
        productName: prod?.name || 'Jewelry Piece',
        slug: prod?.slug || '',
        variantTitle: variant?.title || null,
        sku: variant?.sku || null,
        price: Number(variant?.price || 0),
        discountPrice: variant?.discount_price ? Number(variant.discount_price) : null,
        imageUrl: primaryImg,
        stockStatus: variant?.stock_status || 'in_stock',
        addedAt: row.created_at,
      };
    });

    return { success: true, items: wishlistProducts };
  } catch (err: any) {
    return { success: false, items: [], error: err.message || 'Failed to retrieve wishlist.' };
  }
}

export async function addToWishlist(
  productId: string,
  variantId?: string | null
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const profile = await requireCustomerAuth();
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Database service is currently unavailable.' };
    }

    // Ensure wishlist exists
    let { data: wishlist } = await (supabase.from('wishlists') as any)
      .select('id')
      .eq('user_id', profile.id)
      .maybeSingle();

    if (!wishlist) {
      const { data: newWishlist, error: createError } = await (supabase.from('wishlists') as any)
        .insert({ user_id: profile.id })
        .select('id')
        .single();

      if (createError) {
        return { success: false, error: createError.message };
      }
      wishlist = newWishlist;
    }

    // Check if item is already saved (explicitly handles NULL variant_id where SQL UNIQUE treats NULL != NULL)
    const targetVariantId = variantId || null;
    let existingQuery = (supabase.from('wishlist_items') as any)
      .select('id')
      .eq('wishlist_id', wishlist.id)
      .eq('product_id', productId);

    if (targetVariantId) {
      existingQuery = existingQuery.eq('variant_id', targetVariantId);
    } else {
      existingQuery = existingQuery.is('variant_id', null);
    }

    const { data: existingItem } = await existingQuery.maybeSingle();

    if (existingItem) {
      return { success: true };
    }

    const { error: insertError } = await (supabase.from('wishlist_items') as any).insert({
      wishlist_id: wishlist.id,
      product_id: productId,
      variant_id: targetVariantId,
    });

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to add item to wishlist.' };
  }
}

export async function removeFromWishlist(wishlistItemId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const profile = await requireCustomerAuth();
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Database service is currently unavailable.' };
    }

    // Verify ownership through wishlist relation
    const { data: item } = await (supabase.from('wishlist_items') as any)
      .select('id, wishlists (user_id)')
      .eq('id', wishlistItemId)
      .single();

    if (!item || item.wishlists?.user_id !== profile.id) {
      return { success: false, error: 'Unauthorized or item not found.' };
    }

    const { error } = await (supabase.from('wishlist_items') as any)
      .delete()
      .eq('id', wishlistItemId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to remove item.' };
  }
}

export async function removeProductFromWishlist(
  productId: string,
  variantId?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await requireCustomerAuth();
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Database service is currently unavailable.' };
    }

    const { data: wishlist } = await (supabase.from('wishlists') as any)
      .select('id')
      .eq('user_id', profile.id)
      .maybeSingle();

    if (!wishlist) {
      return { success: true };
    }

    const targetVariantId = variantId || null;
    let query = (supabase.from('wishlist_items') as any)
      .delete()
      .eq('wishlist_id', wishlist.id)
      .eq('product_id', productId);

    if (targetVariantId) {
      query = query.eq('variant_id', targetVariantId);
    } else {
      query = query.is('variant_id', null);
    }

    const { error } = await query;
    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to remove product from wishlist.' };
  }
}

export async function clearWishlist(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const profile = await requireCustomerAuth();
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Database service is currently unavailable.' };
    }

    const { data: wishlist, error: wishlistError } = await (supabase.from('wishlists') as any)
      .select('id')
      .eq('user_id', profile.id)
      .maybeSingle();

    // Never report success unless the server actually confirmed the deletion.
    if (wishlistError) {
      return { success: false, error: 'Failed to clear wishlist.' };
    }

    if (wishlist) {
      const { error: deleteError } = await (supabase.from('wishlist_items') as any)
        .delete()
        .eq('wishlist_id', wishlist.id);

      if (deleteError) {
        return { success: false, error: 'Failed to clear wishlist.' };
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to clear wishlist.' };
  }
}
