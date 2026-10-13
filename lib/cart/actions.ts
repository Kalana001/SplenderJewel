'use server';

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
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
