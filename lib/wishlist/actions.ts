'use server';

import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCurrentUser, requireCustomerAuth } from '@/lib/auth/server';
import { isWishlistRowOwnedByUser, mapWishlistRowsForUser } from '@/lib/wishlist/wishlist-view';
import type { WishlistProduct } from '@/types/wishlist';

/**
 * Check whether a specific product is in the currently authenticated customer's wishlist.
 * Used for client-side wishlist status hydration on ISR product detail pages.
 * Executes a single RLS-protected query joining `wishlists!inner(user_id)`.
 */
export async function checkProductWishlistStatus(productId: string): Promise<{
  isAuthenticated: boolean;
  isWishlisted: boolean;
}> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { isAuthenticated: false, isWishlisted: false };
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return { isAuthenticated: true, isWishlisted: false };
    }

    const { data: item, error } = await (supabase.from('wishlist_items') as any)
      .select('id, wishlists!inner(user_id)')
      .eq('wishlists.user_id', user.id)
      .eq('product_id', productId)
      .limit(1)
      .maybeSingle();

    if (error || !item) {
      return { isAuthenticated: true, isWishlisted: false };
    }

    return {
      isAuthenticated: true,
      isWishlisted: isWishlistRowOwnedByUser(item, user.id),
    };
  } catch {
    return { isAuthenticated: false, isWishlisted: false };
  }
}

/**
 * Retrieve total item count in the authenticated customer's wishlist.
 * Used for the header wishlist counter badge.
 * Executes a single RLS-protected HEAD count query joining `wishlists!inner(user_id)`
 * without creating empty wishlist rows.
 * Strictly isolated per customer; returns count: 0 for guests.
 */
export async function getCustomerWishlistCount(): Promise<{
  isAuthenticated: boolean;
  count: number;
}> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { isAuthenticated: false, count: 0 };
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return { isAuthenticated: true, count: 0 };
    }

    const { count, error } = await (supabase.from('wishlist_items') as any)
      .select('id, wishlists!inner(user_id)', { count: 'exact', head: true })
      .eq('wishlists.user_id', user.id);

    if (error || typeof count !== 'number') {
      return { isAuthenticated: true, count: 0 };
    }

    return { isAuthenticated: true, count };
  } catch {
    return { isAuthenticated: false, count: 0 };
  }
}

/**
 * Retrieve all saved wishlist items for the authenticated customer in a single
 * RLS-protected PostgREST query via `wishlists!inner(user_id)`.
 * Does NOT insert an empty wishlist record on read; wishlist creation only occurs
 * when a customer explicitly saves a product via `addToWishlist()`.
 */
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

    const { data: items, error: itemsError } = await (supabase.from('wishlist_items') as any)
      .select(`
        id,
        created_at,
        wishlists!inner (
          user_id
        ),
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
      .eq('wishlists.user_id', user.id)
      .order('created_at', { ascending: false });

    if (itemsError) {
      return { success: false, items: [], error: itemsError.message };
    }

    const wishlistProducts = mapWishlistRowsForUser(items, user.id);

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
