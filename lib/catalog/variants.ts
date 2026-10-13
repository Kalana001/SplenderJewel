'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/auth/server';
import type { ProductVariantAdmin } from '@/types/product';
import type { StockStatus } from '@/lib/config/constants';

export interface CreateVariantInput {
  productId: string;
  title: string;
  sku: string;
  price: number;
  discountPrice?: number | null;
  purchaseCost?: number;
  stockQuantity?: number;
  lowStockThreshold?: number;
  attributes?: Record<string, string>;
  isActive?: boolean;
}

export interface UpdateVariantInput {
  title?: string;
  sku?: string;
  price?: number;
  discountPrice?: number | null;
  purchaseCost?: number;
  lowStockThreshold?: number;
  attributes?: Record<string, string>;
  isActive?: boolean;
}

export interface InventoryMovementInput {
  variantId: string;
  quantityChange: number;
  reason: 'stock_added' | 'manual_adjustment' | 'order_sold' | 'order_cancelled_restock' | 'correction';
  notes?: string | null;
}

export interface VariantActionResult {
  success: boolean;
  variant?: ProductVariantAdmin;
  error?: string;
}

import { computeStockStatus } from './utils';

/**
 * Admin Action: Create a new product variant
 */
export async function createVariantAction(input: CreateVariantInput): Promise<VariantActionResult> {
  try {
    const admin = await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!input.productId?.trim()) {
      return { success: false, error: 'Product ID is required.' };
    }

    const title = input.title?.trim();
    if (!title) {
      return { success: false, error: 'Variant title is required (e.g. "Gold / 17cm", "Default").' };
    }

    const sku = input.sku?.trim().toUpperCase();
    if (!sku) {
      return { success: false, error: 'A unique SKU is required for every variant.' };
    }

    if (typeof input.price !== 'number' || input.price < 0) {
      return { success: false, error: 'Selling price must be a valid non-negative amount.' };
    }

    if (input.discountPrice != null && (input.discountPrice < 0 || input.discountPrice >= input.price)) {
      return { success: false, error: 'Discount price must be non-negative and less than the regular price.' };
    }

    const purchaseCost = typeof input.purchaseCost === 'number' && input.purchaseCost >= 0 ? input.purchaseCost : 0;
    const stockQuantity = typeof input.stockQuantity === 'number' && input.stockQuantity >= 0 ? input.stockQuantity : 0;
    const lowStockThreshold = typeof input.lowStockThreshold === 'number' && input.lowStockThreshold >= 0 ? input.lowStockThreshold : 5;
    const stockStatus = computeStockStatus(stockQuantity, lowStockThreshold);
    const attributes = input.attributes || {};
    const isActive = input.isActive !== undefined ? input.isActive : true;

    // Check SKU uniqueness
    const { data: existingSku } = await (adminClient.from('product_variants') as any)
      .select('id')
      .eq('sku', sku)
      .maybeSingle();

    if (existingSku) {
      return { success: false, error: `SKU "${sku}" is already assigned to another variant.` };
    }

    const { data: created, error: insertError } = await (adminClient.from('product_variants') as any)
      .insert({
        product_id: input.productId,
        title,
        sku,
        price: input.price,
        discount_price: input.discountPrice != null ? input.discountPrice : null,
        purchase_cost: purchaseCost,
        stock_quantity: stockQuantity,
        low_stock_threshold: lowStockThreshold,
        stock_status: stockStatus,
        attributes,
        is_active: isActive,
      })
      .select()
      .single();

    if (insertError || !created) {
      return { success: false, error: insertError?.message || 'Failed to create product variant.' };
    }

    // Record initial stock movement if quantity was added
    if (stockQuantity > 0) {
      await (adminClient.from('inventory_movements') as any).insert({
        variant_id: created.id,
        quantity_change: stockQuantity,
        previous_quantity: 0,
        new_quantity: stockQuantity,
        reason: 'stock_added',
        reference_id: `INITIAL_VARIANT_CREATION`,
        created_by: admin.id,
      });
    }

    revalidatePath(`/admin/products/${input.productId}`);
    revalidatePath('/shop');

    return {
      success: true,
      variant: {
        id: created.id,
        productId: created.product_id,
        title: created.title,
        sku: created.sku,
        price: Number(created.price),
        discountPrice: created.discount_price != null ? Number(created.discount_price) : null,
        purchaseCost: Number(created.purchase_cost),
        stockQuantity: created.stock_quantity,
        lowStockThreshold: created.low_stock_threshold,
        stockStatus: created.stock_status as StockStatus,
        attributes: created.attributes,
        isActive: created.is_active,
        images: [],
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An error occurred creating the variant.',
    };
  }
}

/**
 * Admin Action: Update an existing product variant
 */
export async function updateVariantAction(
  variantId: string,
  input: UpdateVariantInput
): Promise<VariantActionResult> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    // Fetch existing variant
    const { data: current, error: fetchError } = await (adminClient.from('product_variants') as any)
      .select('*')
      .eq('id', variantId)
      .single();

    if (fetchError || !current) {
      return { success: false, error: 'Variant not found.' };
    }

    const updatePayload: Record<string, any> = {};

    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) return { success: false, error: 'Variant title cannot be empty.' };
      updatePayload.title = title;
    }

    if (input.sku !== undefined) {
      const sku = input.sku.trim().toUpperCase();
      if (!sku) return { success: false, error: 'SKU cannot be empty.' };

      // Verify uniqueness excluding current
      const { data: existingSku } = await (adminClient.from('product_variants') as any)
        .select('id')
        .eq('sku', sku)
        .neq('id', variantId)
        .maybeSingle();

      if (existingSku) {
        return { success: false, error: `SKU "${sku}" is already assigned to another variant.` };
      }
      updatePayload.sku = sku;
    }

    if (input.price !== undefined) {
      if (input.price < 0) return { success: false, error: 'Selling price must be non-negative.' };
      updatePayload.price = input.price;
    }

    const effectivePrice = input.price !== undefined ? input.price : Number(current.price);

    if (input.discountPrice !== undefined) {
      if (input.discountPrice != null) {
        if (input.discountPrice < 0 || input.discountPrice >= effectivePrice) {
          return { success: false, error: 'Discount price must be less than regular selling price.' };
        }
        updatePayload.discount_price = input.discountPrice;
      } else {
        updatePayload.discount_price = null;
      }
    }

    if (input.purchaseCost !== undefined) {
      if (input.purchaseCost < 0) return { success: false, error: 'Purchase cost must be non-negative.' };
      updatePayload.purchase_cost = input.purchaseCost;
    }

    if (input.lowStockThreshold !== undefined) {
      if (input.lowStockThreshold < 0) return { success: false, error: 'Low stock threshold must be non-negative.' };
      updatePayload.low_stock_threshold = input.lowStockThreshold;
      updatePayload.stock_status = computeStockStatus(current.stock_quantity, input.lowStockThreshold);
    }

    if (input.attributes !== undefined) {
      updatePayload.attributes = input.attributes;
    }

    if (input.isActive !== undefined) {
      updatePayload.is_active = input.isActive;
    }

    const { data: updated, error: updateError } = await (adminClient.from('product_variants') as any)
      .update(updatePayload)
      .eq('id', variantId)
      .select()
      .single();

    if (updateError || !updated) {
      return { success: false, error: updateError?.message || 'Failed to update variant.' };
    }

    revalidatePath(`/admin/products/${current.product_id}`);
    revalidatePath('/admin/inventory');
    revalidatePath('/shop');

    return {
      success: true,
      variant: {
        id: updated.id,
        productId: updated.product_id,
        title: updated.title,
        sku: updated.sku,
        price: Number(updated.price),
        discountPrice: updated.discount_price != null ? Number(updated.discount_price) : null,
        purchaseCost: Number(updated.purchase_cost),
        stockQuantity: updated.stock_quantity,
        lowStockThreshold: updated.low_stock_threshold,
        stockStatus: updated.stock_status as StockStatus,
        attributes: updated.attributes,
        isActive: updated.is_active,
        images: [],
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An error occurred updating the variant.',
    };
  }
}

/**
 * Admin Action: Safely adjust variant inventory stock with atomic movement audit record.
 * Executes atomically via the database stored procedure `public.adjust_variant_stock`.
 *
 * SECURITY & IDENTITY BOUNDARY ARCHITECTURE:
 * 1. Admin authentication is cryptographically validated at this Next.js server boundary via `requireAdminAuth()`.
 * 2. The admin identity (`admin.id`) is derived strictly from the verified session; client input cannot choose or override it.
 * 3. Permitted reasons are strictly restricted to manual actions: 'stock_added', 'manual_adjustment', 'correction'.
 * 4. Architectural limitation: Because this action connects to PostgreSQL using the administrative `service_role` client,
 *    the database procedure executes under service_role. The database verifies that `p_admin_id` exists in `admin_users`
 *    where `is_active = TRUE`, but cannot independently prove human identity without application-tier verification.
 */
export async function adjustVariantStockAction(
  input: InventoryMovementInput
): Promise<{ success: boolean; newQuantity?: number; error?: string }> {
  try {
    const admin = await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!input.variantId?.trim()) {
      return { success: false, error: 'Variant ID is required.' };
    }

    if (!input.quantityChange || typeof input.quantityChange !== 'number') {
      return { success: false, error: 'A non-zero quantity change is required.' };
    }

    const validReasons = [
      'stock_added',
      'manual_adjustment',
      'correction',
    ];
    if (!validReasons.includes(input.reason)) {
      return {
        success: false,
        error: `Invalid manual adjustment reason: "${input.reason}". Only manual inventory adjustment reasons ('stock_added', 'manual_adjustment', 'correction') may be submitted directly by administrators.`,
      };
    }

    // Call atomic stored procedure with row-level locking (FOR UPDATE)
    const { data: rpcData, error: rpcError } = await (adminClient.rpc as any)(
      'adjust_variant_stock',
      {
        p_variant_id: input.variantId.trim(),
        p_quantity_change: Math.trunc(input.quantityChange),
        p_reason: input.reason,
        p_reference_id: input.notes?.trim() || null,
        p_admin_id: admin.id,
      }
    );

    if (rpcError) {
      return { success: false, error: rpcError.message };
    }

    const resultRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!resultRow) {
      return { success: false, error: 'Failed to adjust variant stock.' };
    }

    const newQuantity = Number(resultRow.new_quantity);
    const productId = resultRow.product_id;

    if (productId) {
      revalidatePath(`/admin/products/${productId}`);
    }
    revalidatePath('/admin/inventory');
    revalidatePath('/shop');

    return { success: true, newQuantity };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to adjust inventory.',
    };
  }
}

/**
 * Admin Action: Safely delete a variant
 */
export async function deleteVariantAction(
  productId: string,
  variantId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    // Check count of variants on this product
    const { count: variantCount } = await (adminClient.from('product_variants') as any)
      .select('id', { count: 'exact', head: true })
      .eq('product_id', productId);

    if (variantCount && variantCount <= 1) {
      return {
        success: false,
        error: 'Cannot delete the only variant of a product. Products must maintain at least one variant.',
      };
    }

    // Check if variant has been used in order items
    const { count: orderItemsCount } = await (adminClient.from('order_items') as any)
      .select('id', { count: 'exact', head: true })
      .eq('variant_id', variantId);

    if (orderItemsCount && orderItemsCount > 0) {
      return {
        success: false,
        error: 'Cannot delete this variant because it is referenced in past customer orders. Deactivate it instead.',
      };
    }

    // Check if variant has recorded inventory movements (preserve audit ledger)
    const { count: movementsCount } = await (adminClient.from('inventory_movements') as any)
      .select('id', { count: 'exact', head: true })
      .eq('variant_id', variantId);

    if (movementsCount && movementsCount > 0) {
      return {
        success: false,
        error: 'Cannot delete this variant because it has recorded inventory movements. Deactivate the variant instead to preserve historical audit records.',
      };
    }

    const { error: deleteError } = await (adminClient.from('product_variants') as any)
      .delete()
      .eq('id', variantId);

    if (deleteError) {
      if ((deleteError as any).code === '23503') {
        return {
          success: false,
          error: 'Cannot delete this variant because historical records (orders or inventory movements) still reference it. Deactivate the variant instead.',
        };
      }
      return { success: false, error: deleteError.message };
    }

    revalidatePath(`/admin/products/${productId}`);
    revalidatePath('/admin/inventory');
    revalidatePath('/shop');

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An error occurred deleting the variant.',
    };
  }
}

/**
 * Admin query: Fetch variants across the entire catalog for the inventory management screen
 */
export async function getAdminInventoryVariants(filters?: {
  search?: string;
  stockStatus?: string;
}): Promise<{ success: boolean; variants: any[]; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    let query = (adminClient.from('product_variants') as any)
      .select(`
        id,
        sku,
        title,
        price,
        discount_price,
        purchase_cost,
        stock_quantity,
        low_stock_threshold,
        stock_status,
        is_active,
        updated_at,
        products (
          id,
          name,
          slug,
          is_active,
          categories ( name )
        )
      `)
      .order('stock_quantity', { ascending: true });

    if (filters?.stockStatus && filters.stockStatus !== 'all') {
      query = query.eq('stock_status', filters.stockStatus);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, variants: [], error: error.message };
    }

    let results = (data || []).map((row: any) => ({
      id: row.id,
      sku: row.sku,
      title: row.title,
      price: Number(row.price),
      discountPrice: row.discount_price != null ? Number(row.discount_price) : null,
      purchaseCost: Number(row.purchase_cost),
      stockQuantity: row.stock_quantity,
      lowStockThreshold: row.low_stock_threshold,
      stockStatus: row.stock_status,
      isActive: row.is_active,
      updatedAt: row.updated_at,
      productName: row.products?.name || 'Unknown Product',
      productSlug: row.products?.slug || '',
      categoryName: row.products?.categories?.name || 'Uncategorized',
      productIsActive: row.products?.is_active ?? true,
    }));

    if (filters?.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      results = results.filter(
        (v: any) =>
          v.sku.toLowerCase().includes(q) ||
          v.title.toLowerCase().includes(q) ||
          v.productName.toLowerCase().includes(q)
      );
    }

    return { success: true, variants: results };
  } catch (err: unknown) {
    return {
      success: false,
      variants: [],
      error: err instanceof Error ? err.message : 'Failed to fetch inventory variants.',
    };
  }
}

export interface AdminProductVariantInventory {
  id: string;
  sku: string;
  title: string;
  price: number;
  discountPrice: number | null;
  purchaseCost: number;
  stockQuantity: number;
  lowStockThreshold: number;
  stockStatus: string;
  isActive: boolean;
  updatedAt: string;
}

export interface AdminInventoryProductSummary {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  categoryName: string;
  isActive: boolean;
  variantCount: number;
  totalStock: number;
  hasLowStock: boolean;
  hasOutOfStock: boolean;
  variants: AdminProductVariantInventory[];
}

export interface SearchAdminInventoryParams {
  query?: string;
  page?: number;
  limit?: number;
}

export interface SearchAdminInventoryResult {
  success: boolean;
  products: AdminInventoryProductSummary[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  error?: string;
}

/**
 * Scalable Search-First Admin Inventory:
 * Searches products by product name, product SKU, or variant SKU with pagination.
 */
export async function searchAdminInventoryProductsAction(
  params?: SearchAdminInventoryParams
): Promise<SearchAdminInventoryResult> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const page = Math.max(1, params?.page || 1);
    const limit = Math.max(1, Math.min(50, params?.limit || 10));
    const query = params?.query?.trim().toLowerCase() || '';

    // 1. If query is provided, find product IDs matching variant SKU, product name, or product SKU
    let matchingProductIds: string[] | null = null;
    if (query) {
      const { data: matchedVariants } = await (adminClient.from('product_variants') as any)
        .select('product_id')
        .ilike('sku', `%${query}%`);

      const variantProductIds = (matchedVariants || []).map((v: any) => v.product_id);

      const { data: matchedProds } = await (adminClient.from('products') as any)
        .select('id')
        .or(`name.ilike.%${query}%,sku.ilike.%${query}%`);

      const prodIds = (matchedProds || []).map((p: any) => p.id);

      matchingProductIds = Array.from(new Set([...variantProductIds, ...prodIds]));
      if (matchingProductIds.length === 0) {
        return {
          success: true,
          products: [],
          totalCount: 0,
          page,
          limit,
          totalPages: 0,
        };
      }
    }

    // 2. Query products with joined categories and product_variants
    let dbQuery = (adminClient.from('products') as any)
      .select(
        `
        id,
        name,
        slug,
        sku,
        is_active,
        created_at,
        categories ( name ),
        product_variants (
          id,
          sku,
          title,
          price,
          discount_price,
          purchase_cost,
          stock_quantity,
          low_stock_threshold,
          stock_status,
          is_active,
          updated_at
        )
      `,
        { count: 'exact' }
      );

    if (matchingProductIds) {
      dbQuery = dbQuery.in('id', matchingProductIds);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    dbQuery = dbQuery.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await dbQuery;

    if (error) {
      return {
        success: false,
        products: [],
        totalCount: 0,
        page,
        limit,
        totalPages: 0,
        error: error.message,
      };
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    const products: AdminInventoryProductSummary[] = (data || []).map((p: any) => {
      const rawVariants = Array.isArray(p.product_variants) ? p.product_variants : [];
      const variants: AdminProductVariantInventory[] = rawVariants.map((v: any) => ({
        id: v.id,
        sku: v.sku,
        title: v.title,
        price: Number(v.price),
        discountPrice: v.discount_price != null ? Number(v.discount_price) : null,
        purchaseCost: Number(v.purchase_cost),
        stockQuantity: Number(v.stock_quantity) || 0,
        lowStockThreshold: Number(v.low_stock_threshold) || 5,
        stockStatus: v.stock_status,
        isActive: Boolean(v.is_active),
        updatedAt: v.updated_at,
      }));

      const totalStock = variants.reduce((sum, v) => sum + v.stockQuantity, 0);
      const hasLowStock = variants.some((v) => v.stockStatus === 'low_stock');
      const hasOutOfStock = variants.some(
        (v) => v.stockStatus === 'out_of_stock' || v.stockQuantity <= 0
      );

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        sku: p.sku || null,
        categoryName: p.categories?.name || 'Uncategorized',
        isActive: Boolean(p.is_active),
        variantCount: variants.length,
        totalStock,
        hasLowStock,
        hasOutOfStock,
        variants,
      };
    });

    return {
      success: true,
      products,
      totalCount,
      page,
      limit,
      totalPages,
    };
  } catch (err: unknown) {
    return {
      success: false,
      products: [],
      totalCount: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
      error: err instanceof Error ? err.message : 'Failed to search inventory.',
    };
  }
}

export interface InventoryMovementRecord {
  id: string;
  variantId: string;
  quantityChange: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string;
  referenceId: string | null;
  createdBy: string | null;
  createdAt: string;
}

/**
 * Fetch audited stock movement history for a specific variant
 */
export async function getVariantMovementHistoryAction(
  variantId: string,
  limit: number = 10
): Promise<{ success: boolean; movements: InventoryMovementRecord[]; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!variantId?.trim()) {
      return { success: false, movements: [], error: 'Variant ID is required.' };
    }

    const { data, error } = await (adminClient.from('inventory_movements') as any)
      .select(
        'id, variant_id, quantity_change, previous_quantity, new_quantity, reason, reference_id, created_by, created_at'
      )
      .eq('variant_id', variantId.trim())
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(50, limit)));

    if (error) {
      return { success: false, movements: [], error: error.message };
    }

    const movements: InventoryMovementRecord[] = (data || []).map((m: any) => ({
      id: m.id,
      variantId: m.variant_id,
      quantityChange: Number(m.quantity_change),
      previousQuantity: Number(m.previous_quantity),
      newQuantity: Number(m.new_quantity),
      reason: m.reason,
      referenceId: m.reference_id || null,
      createdBy: m.created_by || null,
      createdAt: m.created_at,
    }));

    return { success: true, movements };
  } catch (err: unknown) {
    return {
      success: false,
      movements: [],
      error: err instanceof Error ? err.message : 'Failed to load movement history.',
    };
  }
}
