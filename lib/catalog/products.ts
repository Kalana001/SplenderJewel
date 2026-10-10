'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/auth/server';
import type { ProductAdmin, ProductImage, ProductVariantAdmin } from '@/types/product';
import { computeStockStatus } from './utils';

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

  // Initial primary variant
  initialVariant: {
    title: string;
    sku: string;
    price: number;
    discountPrice?: number | null;
    purchaseCost?: number;
    stockQuantity?: number;
    lowStockThreshold?: number;
    attributes?: Record<string, string>;
  };

  // Uploaded image URLs
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

/**
 * Admin Action: Fetch products with search, category filtering, status, and sorting.
 */
export async function getAdminProducts(filters?: {
  search?: string;
  categoryId?: string;
  isActive?: boolean;
  sort?: string;
}): Promise<{ success: boolean; products: AdminProductListItem[]; error?: string }> {
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

    if (filters?.sort === 'name-asc') {
      query = query.order('name', { ascending: true });
    } else if (filters?.sort === 'name-desc') {
      query = query.order('name', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
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

    // Validate initial variant
    const variantTitle = input.initialVariant.title?.trim() || 'Default';
    const variantSku = input.initialVariant.sku?.trim().toUpperCase();
    if (!variantSku) {
      return { success: false, error: 'A primary variant SKU is required (e.g. SJ-RNG-001).' };
    }

    if (typeof input.initialVariant.price !== 'number' || input.initialVariant.price < 0) {
      return { success: false, error: 'Initial variant selling price must be a non-negative amount.' };
    }

    if (
      input.initialVariant.discountPrice != null &&
      (input.initialVariant.discountPrice < 0 || input.initialVariant.discountPrice >= input.initialVariant.price)
    ) {
      return { success: false, error: 'Discount price must be less than regular price.' };
    }

    // Check variant SKU uniqueness
    const { data: existingSku } = await (adminClient.from('product_variants') as any)
      .select('id')
      .eq('sku', variantSku)
      .maybeSingle();

    if (existingSku) {
      return { success: false, error: `SKU "${variantSku}" is already assigned to another product.` };
    }

    // 1. Insert product record
    const { data: productRow, error: productError } = await (adminClient.from('products') as any)
      .insert({
        name,
        slug,
        product_code: input.productCode?.trim() || variantSku,
        short_description: input.shortDescription?.trim() || null,
        description: input.description?.trim() || null,
        material: input.material?.trim() || null,
        gender: input.gender || 'women',
        category_id: input.categoryId || null,
        is_featured: Boolean(input.isFeatured),
        is_new_arrival: Boolean(input.isNewArrival),
        is_best_seller: Boolean(input.isBestSeller),
        is_active: input.isActive !== undefined ? Boolean(input.isActive) : true,
        meta_title: input.metaTitle?.trim() || null,
        meta_description: input.metaDescription?.trim() || null,
      })
      .select('id, slug')
      .single();

    if (productError || !productRow) {
      return { success: false, error: `Failed to create product: ${productError?.message || 'Database error'}` };
    }

    const productId = productRow.id;

    // 2. Insert primary variant
    const stockQty = typeof input.initialVariant.stockQuantity === 'number' ? Math.max(0, input.initialVariant.stockQuantity) : 0;
    const lowStockThreshold = typeof input.initialVariant.lowStockThreshold === 'number' ? Math.max(0, input.initialVariant.lowStockThreshold) : 5;
    const purchaseCost = typeof input.initialVariant.purchaseCost === 'number' ? Math.max(0, input.initialVariant.purchaseCost) : 0;
    const stockStatus = computeStockStatus(stockQty, lowStockThreshold);

    const { data: variantRow, error: variantError } = await (adminClient.from('product_variants') as any)
      .insert({
        product_id: productId,
        title: variantTitle,
        sku: variantSku,
        price: input.initialVariant.price,
        discount_price: input.initialVariant.discountPrice != null ? input.initialVariant.discountPrice : null,
        purchase_cost: purchaseCost,
        stock_quantity: stockQty,
        low_stock_threshold: lowStockThreshold,
        stock_status: stockStatus,
        attributes: input.initialVariant.attributes || {},
        is_active: true,
      })
      .select('id')
      .single();

    if (variantError) {
      // Rollback product insert if variant failed
      await (adminClient.from('products') as any).delete().eq('id', productId);
      return { success: false, error: `Failed to create primary variant: ${variantError.message}` };
    }

    // Record initial inventory movement
    if (stockQty > 0 && variantRow) {
      await (adminClient.from('inventory_movements') as any).insert({
        variant_id: variantRow.id,
        quantity_change: stockQty,
        previous_quantity: 0,
        new_quantity: stockQty,
        reason: 'stock_added',
        reference_id: 'INITIAL_PRODUCT_SETUP',
        created_by: admin.id,
      });
    }

    // 3. Attach gallery images if provided
    if (input.imageUrls && input.imageUrls.length > 0) {
      const imagesPayload = input.imageUrls.map((url, idx) => ({
        product_id: productId,
        variant_id: null,
        url,
        alt_text: name,
        display_order: idx,
        is_primary: idx === 0,
      }));

      await (adminClient.from('product_images') as any).insert(imagesPayload);
    }

    revalidatePath('/admin/products');
    revalidatePath('/shop');

    return {
      success: true,
      productId,
      slug: productRow.slug,
    };
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

    // Check if any variant of this product was purchased in orders
    const { count: orderCount } = await (adminClient.from('order_items') as any)
      .select('id', { count: 'exact', head: true })
      .eq('product_id', productId);

    if (orderCount && orderCount > 0) {
      return {
        success: false,
        error: `Cannot delete this product because it has been ordered in ${orderCount} customer order(s). Unpublish/deactivate the product instead to preserve order records.`,
      };
    }

    const { error: deleteError } = await (adminClient.from('products') as any)
      .delete()
      .eq('id', productId);

    if (deleteError) {
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
