'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/auth/server';
import { deleteUnattachedProductImageAction } from '@/lib/catalog/storage';
import type { ProductAdmin, ProductImage, ProductVariantAdmin } from '@/types/product';

export interface CreateProductVariantInput {
  title: string;
  sku: string;
  price: number;
  discountPrice?: number | null;
  purchaseCost?: number;
  stockQuantity?: number;
  lowStockThreshold?: number;
  attributes?: Record<string, string>;
  imageUrls?: string[];
  isActive?: boolean;
}

export interface CreateProductInput {
  name: string;
  slug?: string;
  productCode?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  material?: string | null;
  gender?: 'women' | 'men' | 'unisex';
  categoryId?: string | null;
  isFeatured?: boolean;
  isNewArrival?: boolean;
  isBestSeller?: boolean;
  isActive?: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;

  // Initial primary variant (backward-compatible)
  initialVariant?: {
    title: string;
    sku: string;
    price: number;
    discountPrice?: number | null;
    purchaseCost?: number;
    stockQuantity?: number;
    lowStockThreshold?: number;
    attributes?: Record<string, string>;
  };

  // Multiple variations support
  variants?: CreateProductVariantInput[];

  // Uploaded product-level gallery image URLs
  imageUrls?: string[];
}

export interface UpdateProductInput {
  name?: string;
  slug?: string;
  productCode?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  material?: string | null;
  gender?: 'women' | 'men' | 'unisex';
  categoryId?: string | null;
  isFeatured?: boolean;
  isNewArrival?: boolean;
  isBestSeller?: boolean;
  isActive?: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
}

export interface AdminProductListItem {
  id: string;
  name: string;
  slug: string;
  productCode: string | null;
  categoryName: string | null;
  categoryId: string | null;
  primaryImageUrl: string | null;
  minPrice: number;
  maxPrice: number;
  minDiscountPrice: number | null;
  totalStock: number;
  variantCount: number;
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Normalizes a string into a URL-safe lowercase slug
 */
export async function generateProductSlug(text: string): Promise<string> {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface GetAdminProductsFilters {
  search?: string;
  categoryId?: string;
  isActive?: boolean;
  sort?: string;
  page?: number;
  limit?: number;
}

/**
 * Admin Action: Fetch products with search, category filtering, status, and sorting.
 * Pushes search and pagination down to the database for optimal transfer speed.
 */
export async function getAdminProducts(
  filters?: GetAdminProductsFilters
): Promise<{ success: boolean; products: AdminProductListItem[]; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    let query = (adminClient.from('products') as any)
      .select(`
        id,
        name,
        slug,
        product_code,
        category_id,
        is_featured,
        is_new_arrival,
        is_best_seller,
        is_active,
        created_at,
        updated_at,
        categories ( id, name ),
        product_images ( id, url, is_primary, display_order ),
        product_variants ( id, sku, price, discount_price, stock_quantity, is_active )
      `);

    if (filters?.categoryId && filters.categoryId !== 'all') {
      query = query.eq('category_id', filters.categoryId);
    }

    if (filters?.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
    }

    if (filters?.search?.trim()) {
      const q = filters.search.trim();
      // Efficient database-side filter to avoid downloading unmatching records
      query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%,product_code.ilike.%${q}%`);
    }

    if (filters?.sort === 'name-asc') {
      query = query.order('name', { ascending: true });
    } else if (filters?.sort === 'name-desc') {
      query = query.order('name', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    if (filters?.limit && filters.limit > 0) {
      const page = Math.max(1, filters.page || 1);
      const limit = Math.min(100, filters.limit);
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);
    }

    const { data: rawProducts, error } = await query;

    if (error) {
      return { success: false, products: [], error: error.message };
    }

    let items: AdminProductListItem[] = (rawProducts || []).map((row: any) => {
      // Find primary or first image
      const images: any[] = Array.isArray(row.product_images) ? row.product_images : [];
      const primaryImg = images.find((img) => img.is_primary) || images[0];

      // Aggregate variants
      const variants: any[] = Array.isArray(row.product_variants) ? row.product_variants : [];
      let minPrice = 0;
      let maxPrice = 0;
      let minDiscountPrice: number | null = null;
      let totalStock = 0;

      if (variants.length > 0) {
        const prices = variants.map((v) => Number(v.price));
        minPrice = Math.min(...prices);
        maxPrice = Math.max(...prices);

        const discountPrices = variants
          .map((v) => (v.discount_price != null ? Number(v.discount_price) : null))
          .filter((p): p is number => p !== null);

        if (discountPrices.length > 0) {
          minDiscountPrice = Math.min(...discountPrices);
        }

        totalStock = variants.reduce((sum, v) => sum + (Number(v.stock_quantity) || 0), 0);
      }

      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        productCode: row.product_code,
        categoryName: row.categories?.name || null,
        categoryId: row.category_id,
        primaryImageUrl: primaryImg?.url || null,
        minPrice,
        maxPrice,
        minDiscountPrice,
        totalStock,
        variantCount: variants.length,
        isFeatured: row.is_featured,
        isNewArrival: row.is_new_arrival,
        isBestSeller: row.is_best_seller,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    if (filters?.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          (p.productCode && p.productCode.toLowerCase().includes(q))
      );
    }

    return { success: true, products: items };
  } catch (err: unknown) {
    return {
      success: false,
      products: [],
      error: err instanceof Error ? err.message : 'Failed to load products.',
    };
  }
}

/**
 * Admin Action: Fetch full product details including variants (with purchase_cost) and images.
 */
export async function getAdminProductById(
  id: string
): Promise<{ success: boolean; product?: ProductAdmin; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const { data: row, error } = await (adminClient.from('products') as any)
      .select(`
        id,
        name,
        slug,
        product_code,
        short_description,
        description,
        material,
        gender,
        category_id,
        is_featured,
        is_new_arrival,
        is_best_seller,
        is_active,
        meta_title,
        meta_description,
        created_at,
        updated_at,
        categories ( id, name, slug ),
        product_images ( id, product_id, variant_id, url, alt_text, display_order, is_primary, created_at ),
        product_variants ( id, product_id, sku, title, attributes, price, discount_price, purchase_cost, stock_quantity, low_stock_threshold, stock_status, is_active, created_at, updated_at )
      `)
      .eq('id', id)
      .single();

    if (error || !row) {
      return { success: false, error: 'Product not found.' };
    }

    const images: ProductImage[] = (row.product_images || [])
      .sort((a: any, b: any) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || a.display_order - b.display_order)
      .map((img: any) => ({
        id: img.id,
        productId: img.product_id,
        variantId: img.variant_id,
        url: img.url,
        altText: img.alt_text,
        displayOrder: img.display_order,
        isPrimary: img.is_primary,
        createdAt: img.created_at,
      }));

    const variants: ProductVariantAdmin[] = (row.product_variants || []).map((v: any) => ({
      id: v.id,
      productId: v.product_id,
      sku: v.sku,
      title: v.title,
      attributes: v.attributes || {},
      price: Number(v.price),
      discountPrice: v.discount_price != null ? Number(v.discount_price) : null,
      purchaseCost: Number(v.purchase_cost), // ADMIN-ONLY
      stockQuantity: v.stock_quantity,
      lowStockThreshold: v.low_stock_threshold,
      stockStatus: v.stock_status,
      isActive: v.is_active,
      images: images.filter((img) => img.variantId === v.id),
      createdAt: v.created_at,
      updatedAt: v.updated_at,
    }));

    const product: ProductAdmin = {
      id: row.id,
      name: row.name,
      slug: row.slug,
      productCode: row.product_code,
      shortDescription: row.short_description,
      description: row.description,
      material: row.material,
      gender: row.gender,
      categoryId: row.category_id,
      category: row.categories ? {
        id: row.categories.id,
        name: row.categories.name,
        slug: row.categories.slug,
        displayOrder: 0,
        isActive: true,
        createdAt: '',
      } : null,
      images,
      variants,
      isFeatured: row.is_featured,
      isNewArrival: row.is_new_arrival,
      isBestSeller: row.is_best_seller,
      isActive: row.is_active,
      metaTitle: row.meta_title,
      metaDescription: row.meta_description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    return { success: true, product };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch product details.',
    };
  }
}

/**
 * Admin Action: Create a new jewelry product with its initial primary variant and gallery images.
 */
export async function createProductAction(
  input: CreateProductInput
): Promise<{ success: boolean; productId?: string; slug?: string; error?: string }> {
  try {
    const admin = await requireAdminAuth();
    const adminClient = createAdminClient();

    const name = input.name?.trim();
    if (!name) {
      return { success: false, error: 'Product name is required.' };
    }

    const slug = input.slug?.trim() ? await generateProductSlug(input.slug) : await generateProductSlug(name);
    if (!slug) {
      return { success: false, error: 'A valid URL slug is required.' };
    }

    // Check slug collision
    const { data: existingSlug } = await (adminClient.from('products') as any)
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (existingSlug) {
      return { success: false, error: `The slug "${slug}" is already in use by another product.` };
    }

    // Determine variations to create (support both variants array and initialVariant)
    const rawVariants: CreateProductVariantInput[] =
      Array.isArray(input.variants) && input.variants.length > 0
        ? input.variants
        : input.initialVariant
        ? [
            {
              title: input.initialVariant.title,
              sku: input.initialVariant.sku,
              price: input.initialVariant.price,
              discountPrice: input.initialVariant.discountPrice,
              purchaseCost: input.initialVariant.purchaseCost,
              stockQuantity: input.initialVariant.stockQuantity,
              lowStockThreshold: input.initialVariant.lowStockThreshold,
              attributes: input.initialVariant.attributes,
            },
          ]
        : [];

    if (rawVariants.length === 0) {
      return { success: false, error: 'At least one product variation is required.' };
    }

    // Validate each variant and verify in-payload SKU uniqueness
    const normalizedVariants: Array<CreateProductVariantInput & { sku: string; title: string }> = [];
    const seenSkus = new Set<string>();

    for (let i = 0; i < rawVariants.length; i++) {
      const v = rawVariants[i];
      const title = v.title?.trim() || `Variant ${i + 1}`;
      const sku = v.sku?.trim().toUpperCase();

      if (!sku) {
        return { success: false, error: `SKU is required for variation #${i + 1} (${title}).` };
      }

      if (seenSkus.has(sku)) {
        return { success: false, error: `Duplicate SKU "${sku}" found within the variation list.` };
      }
      seenSkus.add(sku);

      if (typeof v.price !== 'number' || v.price < 0) {
        return { success: false, error: `Selling price for variant "${sku}" must be a non-negative amount.` };
      }

      if (v.discountPrice != null && (v.discountPrice < 0 || v.discountPrice >= v.price)) {
        return { success: false, error: `Discount price for variant "${sku}" must be less than regular price.` };
      }

      normalizedVariants.push({
        ...v,
        title,
        sku,
        price: v.price,
        discountPrice: v.discountPrice != null ? v.discountPrice : null,
        purchaseCost: typeof v.purchaseCost === 'number' && v.purchaseCost >= 0 ? v.purchaseCost : 0,
        stockQuantity: typeof v.stockQuantity === 'number' && v.stockQuantity >= 0 ? Math.floor(v.stockQuantity) : 0,
        lowStockThreshold:
          typeof v.lowStockThreshold === 'number' && v.lowStockThreshold >= 0 ? Math.floor(v.lowStockThreshold) : 5,
        attributes: v.attributes || {},
        isActive: v.isActive !== undefined ? Boolean(v.isActive) : true,
      });
    }

    // Check variant SKU uniqueness across database
    const skusToCheck = normalizedVariants.map((v) => v.sku);
    const { data: existingSkus } = await (adminClient.from('product_variants') as any)
      .select('sku')
      .in('sku', skusToCheck);

    if (existingSkus && existingSkus.length > 0) {
      return { success: false, error: `SKU "${existingSkus[0].sku}" is already assigned to another product.` };
    }

    // Prepare structured payloads for transactional RPC and hardened fallback
    const targetIsActive = input.isActive !== undefined ? Boolean(input.isActive) : true;
    const baseSku = normalizedVariants[0].sku;
    const productPayload = {
      name,
      slug,
      product_code: input.productCode?.trim() || baseSku,
      short_description: input.shortDescription?.trim() || null,
      description: input.description?.trim() || null,
      material: input.material?.trim() || null,
      gender: input.gender || 'women',
      category_id: input.categoryId || null,
      is_featured: Boolean(input.isFeatured),
      is_new_arrival: Boolean(input.isNewArrival),
      is_best_seller: Boolean(input.isBestSeller),
      is_active: targetIsActive,
      meta_title: input.metaTitle?.trim() || null,
      meta_description: input.metaDescription?.trim() || null,
    };

    const variantsPayload = normalizedVariants.map((v) => ({
      sku: v.sku,
      title: v.title,
      price: v.price,
      discount_price: v.discountPrice,
      purchase_cost: v.purchaseCost,
      stock_quantity: v.stockQuantity,
      low_stock_threshold: v.lowStockThreshold,
      attributes: v.attributes,
      is_active: v.isActive,
    }));

    const imagesPayload: Array<{
      url: string;
      variant_sku: string | null;
      alt_text: string;
      display_order: number;
      is_primary: boolean;
    }> = [];

    let displayOrderCounter = 0;
    if (input.imageUrls && input.imageUrls.length > 0) {
      for (const url of input.imageUrls) {
        imagesPayload.push({
          url,
          variant_sku: null,
          alt_text: name,
          display_order: displayOrderCounter,
          is_primary: displayOrderCounter === 0,
        });
        displayOrderCounter++;
      }
    }

    for (const v of normalizedVariants) {
      if (v.imageUrls && v.imageUrls.length > 0) {
        for (const url of v.imageUrls) {
          imagesPayload.push({
            url,
            variant_sku: v.sku,
            alt_text: `${name} - ${v.title}`,
            display_order: displayOrderCounter,
            is_primary: displayOrderCounter === 0,
          });
          displayOrderCounter++;
        }
      }
    }

/**
 * Strictly identifies if an RPC error is due to the function being absent in the database
 * (migration not yet applied), as opposed to execution failures, constraint violations,
 * authorization errors, network timeouts, or schema errors.
 */
function isRpcMissingError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '').trim().toUpperCase();
  const message = String(error.message || '').toLowerCase();

  // PostgREST specific missing RPC code
  if (code === 'PGRST202') return true;

  // PostgreSQL undefined_function error code
  if (code === '42883') return true;

  // Explicit function not found signatures
  if (
    message.includes('could not find the function') ||
    (message.includes('create_product_with_variations') && message.includes('does not exist'))
  ) {
    return true;
  }

  return false;
}

    // Strictly invoke Atomic PostgreSQL Transactional RPC (Migration 00007)
    // The database RPC is the SOLE write path. Zero non-atomic multi-step write fallbacks.
    try {
      const { data: rpcData, error: rpcError } = await (adminClient.rpc as any)(
        'create_product_with_variations',
        {
          p_product: productPayload,
          p_variants: variantsPayload,
          p_images: imagesPayload,
          p_admin_id: admin.id,
        }
      );

      if (rpcError) {
        console.error('[createProductAction] Database RPC error:', rpcError);
        const errMsg = rpcError.message || 'Product creation transaction failed.';
        return {
          success: false,
          error: isRpcMissingError(rpcError)
            ? 'Database product creation procedure is unavailable. Please ensure database migration 00007 is applied.'
            : errMsg,
        };
      }

      if (!rpcData?.success) {
        return {
          success: false,
          error: rpcData?.error || 'Product creation failed.',
        };
      }

      revalidatePath('/admin/products');
      revalidatePath('/shop');
      if (rpcData.slug) {
        revalidatePath(`/products/${rpcData.slug}`);
      }

      return {
        success: true,
        productId: rpcData.product_id,
        slug: rpcData.slug,
      };
    } catch (rpcCallErr: unknown) {
      console.error('[createProductAction] Unexpected RPC execution error:', rpcCallErr);
      if (isRpcMissingError(rpcCallErr)) {
        return {
          success: false,
          error: 'Database product creation procedure is unavailable. Please ensure database migration 00007 is applied.',
        };
      }
      return {
        success: false,
        error: rpcCallErr instanceof Error ? rpcCallErr.message : 'Network or server error during product creation.',
      };
    }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An error occurred creating the product.',
    };
  }
}

/**
 * Admin Action: Update product attributes and SEO metadata
 */
export async function updateProductAction(
  productId: string,
  input: UpdateProductInput
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!productId?.trim()) {
      return { success: false, error: 'Product ID is required.' };
    }

    const updatePayload: Record<string, any> = {};

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) return { success: false, error: 'Product name cannot be empty.' };
      updatePayload.name = name;
    }

    if (input.slug !== undefined) {
      const slug = await generateProductSlug(input.slug);
      if (!slug) return { success: false, error: 'A valid slug is required.' };

      // Verify uniqueness
      const { data: existingSlug } = await (adminClient.from('products') as any)
        .select('id')
        .eq('slug', slug)
        .neq('id', productId)
        .maybeSingle();

      if (existingSlug) {
        return { success: false, error: `The slug "${slug}" is already used by another product.` };
      }
      updatePayload.slug = slug;
    }

    if (input.productCode !== undefined) updatePayload.product_code = input.productCode?.trim() || null;
    if (input.shortDescription !== undefined) updatePayload.short_description = input.shortDescription?.trim() || null;
    if (input.description !== undefined) updatePayload.description = input.description?.trim() || null;
    if (input.material !== undefined) updatePayload.material = input.material?.trim() || null;
    if (input.gender !== undefined) updatePayload.gender = input.gender;
    if (input.categoryId !== undefined) updatePayload.category_id = input.categoryId || null;
    if (input.isFeatured !== undefined) updatePayload.is_featured = Boolean(input.isFeatured);
    if (input.isNewArrival !== undefined) updatePayload.is_new_arrival = Boolean(input.isNewArrival);
    if (input.isBestSeller !== undefined) updatePayload.is_best_seller = Boolean(input.isBestSeller);
    if (input.isActive !== undefined) updatePayload.is_active = Boolean(input.isActive);
    if (input.metaTitle !== undefined) updatePayload.meta_title = input.metaTitle?.trim() || null;
    if (input.metaDescription !== undefined) updatePayload.meta_description = input.metaDescription?.trim() || null;

    const { error } = await (adminClient.from('products') as any)
      .update(updatePayload)
      .eq('id', productId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/admin/products');
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath('/shop');

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update product.',
    };
  }
}

/**
 * Admin Action: Toggle product publication / draft status
 */
export async function toggleProductActiveAction(
  productId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const { error } = await (adminClient.from('products') as any)
      .update({ is_active: isActive })
      .eq('id', productId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/admin/products');
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath('/shop');

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to toggle product status.',
    };
  }
}

/**
 * Admin Action: Safely delete product or recommend archiving if referenced in orders.
 */
export async function deleteProductAction(
  productId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    // 1. Check if any variant of this product was purchased in orders
    const { count: orderCount } = await (adminClient.from('order_items') as any)
      .select('id', { count: 'exact', head: true })
      .eq('product_id', productId);

    if (orderCount && orderCount > 0) {
      return {
        success: false,
        error: `Cannot delete this product because it has been ordered in ${orderCount} customer order(s). Unpublish/deactivate the product instead to preserve order records.`,
      };
    }

    // 2. Check if any variant has recorded inventory movements (preserves ON DELETE RESTRICT audit ledger)
    const { data: variants } = await (adminClient.from('product_variants') as any)
      .select('id')
      .eq('product_id', productId);

    const variantIds = (variants || []).map((v: any) => v.id);

    if (variantIds.length > 0) {
      const { count: movementCount } = await (adminClient.from('inventory_movements') as any)
        .select('id', { count: 'exact', head: true })
        .in('variant_id', variantIds);

      if (movementCount && movementCount > 0) {
        return {
          success: false,
          error: `Cannot delete this product because ${movementCount} historical inventory audit record(s) exist for its variations. Unpublish/deactivate the product instead to preserve inventory audit integrity.`,
        };
      }
    }

    const { error: deleteError } = await (adminClient.from('products') as any)
      .delete()
      .eq('id', productId);

    if (deleteError) {
      if ((deleteError as any).code === '23503' || (deleteError as any).code === '23001') {
        return {
          success: false,
          error: 'Cannot delete this product because historical audit records (orders or inventory movements) still reference it. Deactivate the product instead.',
        };
      }
      return { success: false, error: deleteError.message };
    }

    revalidatePath('/admin/products');
    revalidatePath('/shop');

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An error occurred deleting the product.',
    };
  }
}
