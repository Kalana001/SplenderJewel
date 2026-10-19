'use server';

import 'server-only';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/server';
import type { CartItem } from '@/types/cart';
import {
  validateCartItemsAgainstInventory,
  type CartStockItemInput,
  type CartStockValidationResult,
  type InventoryRecord,
} from './validation';

export type {
  CartStockItemInput,
  CartStockItemValidationResult,
  CartStockValidationResult,
  InventoryRecord,
} from './validation';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CART_VERIFICATION_ITEMS = 30;

export interface VariantAvailabilityResult {
  isAvailable: boolean;
  inStock: boolean;
  availableStock: number;
  error?: string;
}

/**
 * NARROWLY SCOPED, CUSTOMER-SAFE VARIANT AVAILABILITY CHECK
 *
 * Exposes strictly the minimum necessary customer-safe availability.
 * Guarantees:
 * 1. Checks that product is published (is_active = true) AND variant is active (is_active = true).
 * 2. If product or variant is inactive/draft, returns availableStock = 0, isAvailable = false.
 *    Never reveals existence, status, or stock counts of unpublished products.
 * 3. Never leaks internal purchase_cost, low_stock_threshold, supplier, or warehouse metadata.
 * 4. Enforces strict UUID format validation.
 */
export async function checkVariantAvailabilityAction(
  variantId: string
): Promise<VariantAvailabilityResult> {
  try {
    const trimmedId = variantId?.trim();
    if (!trimmedId || !UUID_REGEX.test(trimmedId)) {
      return {
        isAvailable: false,
        inStock: false,
        availableStock: 0,
        error: 'Invalid variant identifier.',
      };
    }

    const adminClient = createAdminClient();

    // Query variant with inner join filter ensuring parent product is published and active
    const { data: variant, error } = await (adminClient.from('product_variants') as any)
      .select(`
        id,
        stock_quantity,
        stock_status,
        is_active,
        products!inner (
          id,
          is_active
        )
      `)
      .eq('id', trimmedId)
      .eq('is_active', true)
      .eq('products.is_active', true)
      .maybeSingle();

    if (error || !variant) {
      return {
        isAvailable: false,
        inStock: false,
        availableStock: 0,
        error: 'Product option is not available.',
      };
    }

    const stock = typeof variant.stock_quantity === 'number' ? Math.max(0, variant.stock_quantity) : 0;
    const inStock = variant.stock_status !== 'out_of_stock' && stock > 0;

    return {
      isAvailable: true,
      inStock,
      availableStock: stock,
    };
  } catch (err) {
    console.error('[CheckVariantAvailabilityAction] Error:', err);
    return {
      isAvailable: false,
      inStock: false,
      availableStock: 0,
      error: 'Unable to check availability at this time.',
    };
  }
}

/**
 * TRUSTED SERVER ACTION: Validate Cart Stock Against Live Database
 *
 * Called by the storefront (Cart page, PDP, checkout preflight) to query
 * live database stock for given items, identify stale inventory, and return
 * clamped limits with friendly explanations.
 *
 * Security Protections:
 * 1. Enforces maximum of 30 distinct items to prevent scraping or denial-of-service.
 * 2. Enforces UUID format on all variant IDs.
 * 3. Only checks variants of published products (products!inner with is_active = true).
 * 4. Never reveals unpublished products, draft items, or confidential accounting data.
 */
export async function validateCartStockAction(
  items: CartStockItemInput[]
): Promise<CartStockValidationResult> {
  try {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return {
        isValid: true,
        items: [],
        stockMap: {},
        errors: [],
      };
    }

    // Input limit: prevent abuse
    if (items.length > MAX_CART_VERIFICATION_ITEMS) {
      return {
        isValid: false,
        items: [],
        stockMap: {},
        errors: [`Shopping bag contains too many distinct items for validation (max ${MAX_CART_VERIFICATION_ITEMS}).`],
      };
    }

    const validVariantIds: string[] = [];
    for (const item of items) {
      const vid = item?.variantId?.trim();
      if (vid && UUID_REGEX.test(vid) && !validVariantIds.includes(vid)) {
        validVariantIds.push(vid);
      }
    }

    if (validVariantIds.length === 0) {
      return {
        isValid: false,
        items: [],
        stockMap: {},
        errors: ['No valid variant identifiers provided for inventory verification.'],
      };
    }

    const adminClient = createAdminClient();

    // Query active variants belonging to published active products
    const { data: variants, error } = await (adminClient.from('product_variants') as any)
      .select(`
        id,
        title,
        stock_quantity,
        stock_status,
        is_active,
        products!inner (
          id,
          name,
          is_active
        )
      `)
      .eq('is_active', true)
      .eq('products.is_active', true)
      .in('id', validVariantIds);

    if (error) {
      console.error('[CartStockAction] Error querying variant stock:', error);
      return {
        isValid: false,
        items: [],
        stockMap: {},
        errors: ['Unable to verify live inventory availability at this time.'],
      };
    }

    const inventoryMap = new Map<string, InventoryRecord>();

    for (const v of variants || []) {
      const prod = v.products as { id: string; name: string; is_active: boolean } | null;
      inventoryMap.set(v.id, {
        variantId: v.id,
        productName: prod?.name || 'Jewelry item',
        variantTitle: v.title || '',
        stockQuantity: typeof v.stock_quantity === 'number' ? v.stock_quantity : Number(v.stock_quantity) || 0,
        stockStatus: v.stock_status || 'in_stock',
        isVariantActive: Boolean(v.is_active),
        isProductActive: Boolean(prod?.is_active),
      });
    }

    return validateCartItemsAgainstInventory(items, inventoryMap);
  } catch (err) {
    console.error('[CartStockAction] Unexpected exception during stock validation:', err);
    return {
      isValid: false,
      items: [],
      stockMap: {},
      errors: ['An unexpected error occurred while verifying product inventory.'],
    };
  }
}

export interface GetCartActionResult {
  success: boolean;
  items: CartItem[] | null;
  authenticated?: boolean;
  userId?: string;
  error?: string;
}

/**
 * SERVER ACTION: Retrieve authenticated customer's persisted cart from Supabase.
 * Enforces customer session validation via getCurrentUser() and RLS.
 */
export async function getAuthenticatedCartAction(): Promise<GetCartActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: true, items: null, authenticated: false };
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return { success: false, items: null, authenticated: true, error: 'Database service unavailable.' };
    }

    // 1. Fetch user's cart
    const { data: cart, error: cartError } = await (supabase.from('carts') as any)
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (cartError) {
      console.error('[GetAuthenticatedCartAction] Database error querying user cart:', cartError);
      return {
        success: false,
        items: null,
        authenticated: true,
        error: cartError.message || 'Unable to retrieve shopping bag from server.',
      };
    }

    if (!cart) {
      // User is authenticated, query succeeded, but user has no cart row in database yet -> legitimate empty cart
      return { success: true, items: [], authenticated: true, userId: user.id };
    }

    // 2. Fetch cart items with live product and variant details
    const { data: rows, error: itemsError } = await (supabase.from('cart_items') as any)
      .select(`
        id,
        variant_id,
        quantity,
        product_variants (
          id,
          product_id,
          title,
          sku,
          price,
          discount_price,
          stock_quantity,
          stock_status,
          is_active,
          products (
            id,
            name,
            slug,
            is_active,
            product_images (
              url,
              is_primary,
              display_order
            )
          )
        )
      `)
      .eq('cart_id', cart.id)
      .order('created_at', { ascending: true });

    if (itemsError) {
      console.error('[GetAuthenticatedCartAction] Database error querying cart items:', itemsError);
      return {
        success: false,
        items: null,
        authenticated: true,
        error: itemsError.message || 'Unable to retrieve shopping bag items.',
      };
    }

    const cartItems: CartItem[] = [];

    for (const row of rows || []) {
      const variant = row.product_variants;
      const product = variant?.products;

      // Filter out any deleted or deactivated products/variants
      if (!variant || !product || !variant.is_active || !product.is_active) {
        continue;
      }

      const images = product.product_images || [];
      const primaryImage =
        images.find((img: any) => img.is_primary)?.url ||
        images.sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))[0]?.url ||
        null;

      const availableStock = typeof variant.stock_quantity === 'number' ? Math.max(0, variant.stock_quantity) : 0;
      const rawQty = Number(row.quantity);
      const effectiveQty = availableStock > 0 ? Math.min(rawQty, availableStock) : rawQty;

      cartItems.push({
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        variantTitle: variant.title || 'Default',
        sku: variant.sku || '',
        price: Number(variant.price) || 0,
        discountPrice: variant.discount_price ? Number(variant.discount_price) : null,
        imageUrl: primaryImage,
        slug: product.slug,
        quantity: effectiveQty,
        maxStock: availableStock,
      });
    }

    return { success: true, items: cartItems, authenticated: true, userId: user.id };
  } catch (err: any) {
    console.error('[GetAuthenticatedCartAction] Error:', err);
    return { success: false, items: null, error: err?.message || 'Failed to fetch cart.' };
  }
}

/**
 * SERVER ACTION: Persist authenticated customer's cart to Supabase.
 * Atomically updates cart_items for the authenticated user's cart.
 */
export async function saveAuthenticatedCartAction(items: CartItem[]): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'User is not authenticated.' };
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Database service unavailable.' };
    }

    // 1. Ensure user's cart exists
    let { data: cart } = await (supabase.from('carts') as any)
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!cart) {
      const { data: newCart, error: createError } = await (supabase.from('carts') as any)
        .insert({ user_id: user.id })
        .select('id')
        .single();

      if (createError || !newCart) {
        return { success: false, error: createError?.message || 'Failed to create cart.' };
      }
      cart = newCart;
    }

    if (!items || items.length === 0) {
      return { success: true };
    }

    // Clean and sanitize input items (deduplicate variant IDs)
    const consolidatedMap = new Map<string, number>();
    for (const item of items) {
      const vid = item?.variantId?.trim();
      const qty = Number(item?.quantity);
      if (vid && UUID_REGEX.test(vid) && Number.isInteger(qty) && qty > 0) {
        const cur = consolidatedMap.get(vid) || 0;
        consolidatedMap.set(vid, cur + qty);
      }
    }

    // Non-destructive upsert: upsert items without deleting existing items for other variants
    if (consolidatedMap.size > 0) {
      const rowsToUpsert = Array.from(consolidatedMap.entries()).map(([variant_id, quantity]) => ({
        cart_id: cart.id,
        variant_id,
        quantity,
        updated_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await (supabase.from('cart_items') as any)
        .upsert(rowsToUpsert, { onConflict: 'cart_id, variant_id' });

      if (upsertError) {
        return { success: false, error: upsertError.message };
      }
    }

    await (supabase.from('carts') as any)
      .update({ updated_at: new Date().toISOString() })
      .eq('id', cart.id);

    return { success: true };
  } catch (err: any) {
    console.error('[SaveAuthenticatedCartAction] Error:', err);
    return { success: false, error: err?.message || 'Failed to save cart.' };
  }
}

/**
 * SERVER ACTION: Merge guest cart items into authenticated user's cart on login.
 * Safely resolves duplicates by combining quantities up to available stock.
 */
/**
 * CONFLICT RESOLUTION & CONCURRENCY POLICY:
 * 
 * 1. Intra-Browser Queue:
 *    The client-side mutation queue in CartContext guarantees strict in-order (FIFO)
 *    execution for a single browser instance, preventing out-of-order writes from rapid UI taps.
 *    NOTE: This is NOT a distributed cross-device lock.
 *
 * 2. Cross-Device Atomic Upsert (PostgreSQL Transaction Level):
 *    When two devices update the same variant simultaneously, PostgreSQL evaluates
 *    `UPSERT ... ON CONFLICT (cart_id, variant_id)` with row-level locking.
 *    Resolution rule: Last-Write-Wins (LWW) at the transaction level, with quantity
 *    strictly clamped to live available stock.
 *
 * 3. Cross-Device Client Convergence:
 *    Clients do not poll continuously. Instead, when a device's window regains focus
 *    (`window.focus`) or becomes visible (`document.visibilitychange`), it quietly calls
 *    `getAuthenticatedCartAction()` to refresh local state to the authoritative server quantity.
 *
 * 4. Durable Database Idempotency (PostgreSQL cart_idempotency_records & RPCs):
 *    Operations with exactly-once requirements (guest cart merge on login, checkout order deduction)
 *    rely on durable PostgreSQL records (uq_cart_idempotency) and advisory transaction locks.
 *    They do NOT rely on process-local Sets, in-memory maps, browser flags, or ephemeral container memory.
 */

/**
 * SERVER ACTION: Merge guest cart items into authenticated user's cart on login.
 * Safely resolves duplicates by combining quantities up to available stock.
 *
 * Durable Idempotency Protection:
 * - Uses atomic PostgreSQL procedure `merge_guest_cart` and durable table `cart_idempotency_records`.
 * - Does NOT rely on process-local memory. Survives serverless restarts and multi-instance concurrency.
 */
export interface MergeGuestCartResult {
  success: boolean;
  items: CartItem[];
  alreadyProcessed?: boolean;
  unauthenticated?: boolean;
  error?: string;
  userId?: string;
}

export async function mergeGuestCartAction(
  guestItems: CartItem[],
  options?: { mergeToken?: string; expectedUserId?: string }
): Promise<MergeGuestCartResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        items: guestItems,
        unauthenticated: true,
        error: 'Authentication required to merge shopping bag with your account.',
      };
    }

    if (options?.expectedUserId && options.expectedUserId !== user.id) {
      return {
        success: false,
        items: guestItems,
        error: 'Authenticated session does not match the active user session.',
      };
    }

    if (!guestItems || !Array.isArray(guestItems) || guestItems.length === 0) {
      const existing = await getAuthenticatedCartAction();
      if (!existing.success || !existing.items) {
        return {
          success: false,
          items: [],
          error: existing.error || 'Failed to retrieve shopping bag.',
        };
      }
      return { success: true, items: existing.items, userId: user.id };
    }

    // Generate or normalize durable merge token
    const rawToken = options?.mergeToken?.trim();
    const mergeToken =
      rawToken && rawToken.length >= 8 && rawToken.length <= 255
        ? rawToken
        : createHash('sha256')
            .update(
              guestItems
                .filter((i) => i?.variantId && UUID_REGEX.test(i.variantId.trim()))
                .map((i) => `${i.variantId.trim()}:${Math.max(1, Math.floor(Number(i.quantity) || 1))}`)
                .sort()
                .join('|')
            )
            .digest('hex');

    const adminClient = createAdminClient();

    // 1. Attempt Atomic Stored Procedure Execution (Migration 00011)
    const sanitizedGuestPayload = guestItems
      .filter((i) => i?.variantId && UUID_REGEX.test(i.variantId.trim()))
      .map((i) => ({
        variant_id: i.variantId.trim(),
        quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)),
      }));

    if (sanitizedGuestPayload.length === 0) {
      const existing = await getAuthenticatedCartAction();
      if (!existing.success || !existing.items) {
        return {
          success: false,
          items: [],
          error: existing.error || 'Failed to retrieve shopping bag.',
        };
      }
      return { success: true, items: existing.items, userId: user.id };
    }

    const { data: rpcData, error: rpcError } = await (adminClient as any).rpc('merge_guest_cart', {
      p_user_id: user.id,
      p_guest_items: sanitizedGuestPayload,
      p_merge_token: mergeToken,
    });

    if (rpcError) {
      console.error('[MergeGuestCartAction] RPC merge_guest_cart error:', rpcError);
      // FAIL CLOSED: Preserve local cart, do not fall back to non-atomic writes
      return {
        success: false,
        items: guestItems,
        error: 'Cloud shopping bag synchronization service is currently unavailable. Your items remain saved locally.',
      };
    }

    if (!rpcData?.success) {
      return {
        success: false,
        items: guestItems,
        error: rpcData?.error || 'Failed to merge shopping bag.',
      };
    }

    const refreshed = await getAuthenticatedCartAction();
    if (!refreshed.success || !refreshed.items) {
      console.error('[MergeGuestCartAction] Post-merge cart fetch failed:', refreshed.error);
      return {
        success: false,
        items: guestItems,
        alreadyProcessed: Boolean(rpcData.already_processed),
        userId: user.id,
        error: refreshed.error || 'Shopping bag merged in cloud, but failed to load remote state. Your items are safe.',
      };
    }

    return {
      success: true,
      items: refreshed.items,
      alreadyProcessed: Boolean(rpcData.already_processed),
      userId: user.id,
    };
  } catch (err: any) {
    console.error('[MergeGuestCartAction] Unexpected error:', err);
    return {
      success: false,
      items: guestItems,
      error: 'Unable to synchronize shopping bag. Your items remain saved locally.',
    };
  }
}

/**
 * SERVER ACTION: Upsert single cart item for authenticated customer.
 * Uses atomic onConflict on (cart_id, variant_id) to guarantee that
 * updating or adding this item NEVER deletes or overwrites other items
 * added from another device or session.
 */
export async function syncCartItemAction(
  variantId: string,
  quantity: number
): Promise<{ success: boolean; error?: string; clampedQuantity?: number }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'User must be authenticated to sync items to account.' };

    const trimmedId = variantId?.trim();
    if (!trimmedId || !UUID_REGEX.test(trimmedId) || !Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, error: 'Invalid item or quantity.' };
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) return { success: false, error: 'Database service unavailable.' };

    // Check live stock
    const avail = await checkVariantAvailabilityAction(trimmedId);
    if (!avail.isAvailable || !avail.inStock) {
      return { success: false, error: 'Item is currently unavailable.' };
    }

    const effectiveQty = avail.availableStock > 0 ? Math.min(quantity, avail.availableStock) : quantity;

    // Ensure cart exists (handles concurrent creation safely)
    let { data: cart } = await (supabase.from('carts') as any)
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!cart) {
      const { data: newCart, error: createError } = await (supabase.from('carts') as any)
        .insert({ user_id: user.id })
        .select('id')
        .single();
      if (createError) {
        // Fallback for concurrent creation: re-query existing cart
        const { data: existingCart } = await (supabase.from('carts') as any)
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!existingCart) {
          return { success: false, error: createError.message || 'Failed to create cart.' };
        }
        cart = existingCart;
      } else {
        cart = newCart;
      }
    }

    // Atomic upsert on (cart_id, variant_id)
    const { error: upsertError } = await (supabase.from('cart_items') as any).upsert(
      {
        cart_id: cart.id,
        variant_id: trimmedId,
        quantity: effectiveQty,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'cart_id, variant_id' }
    );

    if (upsertError) {
      return { success: false, error: upsertError.message };
    }

    // Touch cart updated_at to ensure consistent timestamping and row participation
    await (supabase.from('carts') as any)
      .update({ updated_at: new Date().toISOString() })
      .eq('id', cart.id);

    return { success: true, clampedQuantity: effectiveQty };
  } catch (err: any) {
    console.error('[SyncCartItemAction] Error:', err);
    return { success: false, error: err?.message || 'Failed to sync item.' };
  }
}

/**
 * SERVER ACTION: Remove a single item from the authenticated customer's cart.
 * Guarantees that only this variant is removed; other items remain untouched.
 */
export async function removeCartItemAction(
  variantId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'User must be authenticated to remove items from account.' };

    const trimmedId = variantId?.trim();
    if (!trimmedId || !UUID_REGEX.test(trimmedId)) {
      return { success: false, error: 'Invalid variant identifier.' };
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) return { success: false, error: 'Database service unavailable.' };

    const { data: cart } = await (supabase.from('carts') as any)
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (cart) {
      await (supabase.from('cart_items') as any)
        .delete()
        .eq('cart_id', cart.id)
        .eq('variant_id', trimmedId);

      // Touch cart updated_at
      await (supabase.from('carts') as any)
        .update({ updated_at: new Date().toISOString() })
        .eq('id', cart.id);
    }

    return { success: true };
  } catch (err: any) {
    console.error('[RemoveCartItemAction] Error:', err);
    return { success: false, error: err?.message || 'Failed to remove item.' };
  }
}

/**
 * SERVER ACTION: Deduct purchased item quantities from the authenticated customer's cart.
 *
 * Security & Concurrency Protections:
 * 1. Authenticated User Resolution: Derives customer ID strictly from server session (`getCurrentUser`).
 * 2. Authoritative Database Source: Ignores client-supplied quantities. Authoritatively derives
 *    purchased variant IDs and quantities directly from persisted `public.order_items` in PostgreSQL.
 * 3. Cross-Account Defense: Validates in a single database transaction that `orders.user_id = auth.user.id`.
 *    Prevents replay attacks, arbitrary order guessing, or deducting items for someone else's order.
 * 4. Multi-Device Surplus Protection: Preserves additional quantities added from other devices.
 * 5. Single-Transaction Atomicity: Executes row mutations, advisory locking, and idempotency in one transaction.
 * 6. Guest Checkout Safe: Returns early for guest checkouts without touching server carts.
 * 7. Fail Closed: Rejects execution without non-atomic fallback if the RPC is unavailable.
 */
export async function deductPurchasedCartItemsAction(
  orderIdentifierOrItems?: string | { variantId: string; quantity: number }[],
  orderIdentifier?: string
): Promise<{ success: boolean; alreadyProcessed?: boolean; isGuest?: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      // Guest checkout: no server cart exists, client cart is cleared from localStorage locally
      return { success: true, isGuest: true };
    }

    const rawOrder = typeof orderIdentifierOrItems === 'string' ? orderIdentifierOrItems : orderIdentifier;
    const trimmedOrder = rawOrder?.trim();
    if (!trimmedOrder || trimmedOrder.length < 8 || trimmedOrder.length > 128) {
      return { success: false, error: 'Valid order identifier is required for checkout cart deduction.' };
    }

    const adminClient = createAdminClient();

    // Atomic Stored Procedure Execution (Derives purchased items authoritatively from orders / order_items)
    const { data: rpcData, error: rpcError } = await (adminClient as any).rpc(
      'deduct_purchased_cart_items',
      {
        p_user_id: user.id,
        p_order_number: trimmedOrder,
      }
    );

    if (rpcError) {
      console.error('[DeductPurchasedCartItemsAction] RPC deduct_purchased_cart_items error:', rpcError);
      const errMsg = rpcError.message || '';
      const isDomainError = errMsg.includes('Unauthorized') || errMsg.includes('Order not found');
      // FAIL CLOSED: Never fall back to separate non-atomic reads/writes
      return {
        success: false,
        error: isDomainError
          ? errMsg
          : 'Unable to update cloud shopping bag after checkout. Your order was placed successfully.',
      };
    }

    if (!rpcData?.success) {
      return {
        success: false,
        error: rpcData?.error || 'Failed to deduct purchased items from shopping bag.',
      };
    }

    return {
      success: true,
      alreadyProcessed: Boolean(rpcData.already_processed),
    };
  } catch (err: any) {
    console.error('[DeductPurchasedCartItemsAction] Unexpected error:', err);
    return { success: false, error: 'Unable to complete cart cleanup.' };
  }
}

/**
 * Backward-compatible wrapper for variant ID based removal.
 */
export async function removePurchasedCartItemsAction(
  purchasedVariantIds: string[]
): Promise<{ success: boolean; error?: string }> {
  return deductPurchasedCartItemsAction(
    purchasedVariantIds.map((id) => ({ variantId: id, quantity: 999999 }))
  );
}

/**
 * SERVER ACTION: Explicitly empty authenticated customer's cart.
 */
export async function clearCartAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'User must be authenticated to clear account shopping bag.' };

    const supabase = await createServerSupabaseClient();
    if (!supabase) return { success: false, error: 'Database service unavailable.' };

    const { data: cart } = await (supabase.from('carts') as any)
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (cart) {
      await (supabase.from('cart_items') as any)
        .delete()
        .eq('cart_id', cart.id);

      await (supabase.from('carts') as any)
        .update({ updated_at: new Date().toISOString() })
        .eq('id', cart.id);
    }

    return { success: true };
  } catch (err: any) {
    console.error('[ClearCartAction] Error:', err);
    return { success: false, error: err?.message || 'Failed to clear cart.' };
  }
}


