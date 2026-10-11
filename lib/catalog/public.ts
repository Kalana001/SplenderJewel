'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ProductPublic, ProductVariantPublic, ProductImage, Category } from '@/types/product';
import type { StockStatus } from '@/lib/config/constants';
import { DEFAULT_DEV_STORE_CONFIG, DEFAULT_STORE_CATEGORIES } from '@/lib/config/store';

export interface PublicProductsFilter {
  categorySlug?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  gender?: 'women' | 'men' | 'unisex';
  material?: string;
  sort?: 'newest' | 'price-asc' | 'price-desc' | 'featured' | 'name-asc';
  page?: number;
  limit?: number;
}

export interface PublicProductsResult {
  products: ProductPublic[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Retrieves customer-facing catalog products.
 * STRICT SECURITY GUARANTEE:
 * - Selects only published products (`is_active = true`)
 * - Selects only active variants (`is_active = true`)
 * - NEVER retrieves or exposes `purchase_cost`
 */
export async function getPublicProducts(
  filters?: PublicProductsFilter
): Promise<PublicProductsResult> {
  const emptyResult: PublicProductsResult = {
    products: [],
    total: 0,
    page: filters?.page || 1,
    limit: filters?.limit || 12,
    totalPages: 0,
  };

  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return emptyResult;

    const page = Math.max(1, filters?.page || 1);
    const limit = Math.max(1, Math.min(50, filters?.limit || 12));
    const offset = (page - 1) * limit;

    // If filtering by categorySlug, first resolve category ID
    let categoryId: string | null = null;
    if (filters?.categorySlug?.trim()) {
      const { data: catData } = await (supabase.from('categories') as any)
        .select('id')
        .eq('slug', filters.categorySlug.trim())
        .eq('is_active', true)
        .maybeSingle();

      if (!catData) {
        return emptyResult; // Category not found or inactive
      }
      categoryId = catData.id;
    }

    let query = (supabase.from('products') as any)
      .select(
        `
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
        created_at,
        updated_at,
        categories ( id, name, slug ),
        product_images ( id, product_id, variant_id, url, alt_text, display_order, is_primary ),
        product_variants (
          id,
          product_id,
          sku,
          title,
          attributes,
          price,
          discount_price,
          stock_status,
          is_active,
          created_at,
          updated_at
        )
      `,
        { count: 'exact' }
      )
      .eq('is_active', true);

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    if (filters?.gender) {
      query = query.eq('gender', filters.gender);
    }

    if (filters?.material?.trim()) {
      query = query.ilike('material', `%${filters.material.trim()}%`);
    }

    if (filters?.search?.trim()) {
      // NOTE ON POSTGREST FILTER SECURITY & MULTILINGUAL SUPPORT:
      // The Supabase PostgREST client does not provide parameterized bindings for composite .or() expressions;
      // filters are evaluated from string query expressions. To guarantee grammar integrity and prevent filter
      // injection, we enforce a strict length limit (max 80 chars) and normalize input by stripping all PostgREST
      // delimiters (commas, parentheses, dots, colons, quotes) and SQL wildcards (%, _, \), while safely retaining
      // Unicode letters (\p{L}), combining vowel/diacritic marks (\p{M}), numbers (\p{N}), whitespace, and hyphens.
      // This guarantees native support for Sinhala, Tamil, and English jewelry searches without filter disruption.
      const rawSearch = filters.search.trim().slice(0, 80);
      const q = rawSearch
        .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (q.length > 0) {
        query = query.or(`name.ilike.%${q}%,short_description.ilike.%${q}%,description.ilike.%${q}%`);
      }
    }

    // Sorting
    switch (filters?.sort) {
      case 'name-asc':
        query = query.order('name', { ascending: true });
        break;
      case 'featured':
        query = query.order('is_featured', { ascending: false }).order('created_at', { ascending: false });
        break;
      case 'newest':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    query = query.range(offset, offset + limit - 1);

    const { data: rawProducts, count, error } = await query;

    if (error || !rawProducts) {
      return emptyResult;
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    const products: ProductPublic[] = [];

    for (const row of rawProducts as any[]) {
      // Filter only active variants and strip any non-public fields
      const activeVariants: ProductVariantPublic[] = (row.product_variants || [])
        .filter((v: any) => v.is_active === true)
        .map((v: any) => ({
          id: v.id,
          productId: v.product_id,
          sku: v.sku,
          title: v.title,
          attributes: v.attributes || {},
          price: Number(v.price),
          discountPrice: v.discount_price != null ? Number(v.discount_price) : null,
          stockStatus: v.stock_status as StockStatus,
          isActive: v.is_active,
          images: [],
          createdAt: v.created_at,
          updatedAt: v.updated_at,
        }));

      // If product has no active variants, skip from customer listing
      if (activeVariants.length === 0) {
        continue;
      }

      const prices = activeVariants.map((v) => v.price);
      const basePrice = Math.min(...prices);

      const discountPrices = activeVariants
        .map((v) => v.discountPrice)
        .filter((p): p is number => p != null && p > 0);
      const baseDiscountPrice = discountPrices.length > 0 ? Math.min(...discountPrices) : null;

      // Price filter check if applied
      if (filters?.minPrice != null && basePrice < filters.minPrice) continue;
      if (filters?.maxPrice != null && basePrice > filters.maxPrice) continue;

      const images: ProductImage[] = (row.product_images || [])
        .sort(
          (a: any, b: any) =>
            (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || a.display_order - b.display_order
        )
        .map((img: any) => ({
          id: img.id,
          productId: img.product_id,
          variantId: img.variant_id,
          url: img.url,
          altText: img.alt_text,
          displayOrder: img.display_order,
          isPrimary: img.is_primary,
          createdAt: '',
        }));

      const category: Category | null = row.categories
        ? {
            id: row.categories.id,
            name: row.categories.name,
            slug: row.categories.slug,
            displayOrder: 0,
            isActive: true,
            createdAt: '',
          }
        : null;

      products.push({
        id: row.id,
        name: row.name,
        slug: row.slug,
        productCode: row.product_code,
        shortDescription: row.short_description,
        description: row.description,
        material: row.material,
        gender: row.gender,
        categoryId: row.category_id,
        category,
        images,
        variants: activeVariants,
        basePrice,
        baseDiscountPrice,
        isFeatured: row.is_featured,
        isNewArrival: row.is_new_arrival,
        isBestSeller: row.is_best_seller,
        isActive: row.is_active,
        metaTitle: row.meta_title,
        metaDescription: row.meta_description,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }

    // Client-side sort by price if requested
    if (filters?.sort === 'price-asc') {
      products.sort((a, b) => (a.baseDiscountPrice || a.basePrice) - (b.baseDiscountPrice || b.basePrice));
    } else if (filters?.sort === 'price-desc') {
      products.sort((a, b) => (b.baseDiscountPrice || b.basePrice) - (a.baseDiscountPrice || a.basePrice));
    }

    return {
      products,
      total,
      page,
      limit,
      totalPages,
    };
  } catch {
    return emptyResult;
  }
}

/**
 * Retrieves a single active product by slug for the product details page.
 * Returns null if the product does not exist or is inactive.
 */
export async function getPublicProductBySlug(slug: string): Promise<ProductPublic | null> {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase || !slug?.trim()) return null;

    const { data: row, error } = await (supabase.from('products') as any)
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
        categories ( id, name, slug, description ),
        product_images ( id, product_id, variant_id, url, alt_text, display_order, is_primary ),
        product_variants (
          id,
          product_id,
          sku,
          title,
          attributes,
          price,
          discount_price,
          stock_status,
          is_active,
          created_at,
          updated_at
        )
      `)
      .eq('slug', slug.trim())
      .eq('is_active', true)
      .maybeSingle();

    if (error || !row) {
      return null;
    }

    const activeVariants: ProductVariantPublic[] = (row.product_variants || [])
      .filter((v: any) => v.is_active === true)
      .map((v: any) => ({
        id: v.id,
        productId: v.product_id,
        sku: v.sku,
        title: v.title,
        attributes: v.attributes || {},
        price: Number(v.price),
        discountPrice: v.discount_price != null ? Number(v.discount_price) : null,
        stockStatus: v.stock_status as StockStatus,
        isActive: v.is_active,
        images: [],
        createdAt: v.created_at,
        updatedAt: v.updated_at,
      }));

    if (activeVariants.length === 0) {
      return null; // Product has no active variants
    }

    const prices = activeVariants.map((v) => v.price);
    const basePrice = Math.min(...prices);

    const discountPrices = activeVariants
      .map((v) => v.discountPrice)
      .filter((p): p is number => p != null && p > 0);
    const baseDiscountPrice = discountPrices.length > 0 ? Math.min(...discountPrices) : null;

    const images: ProductImage[] = (row.product_images || [])
      .sort(
        (a: any, b: any) =>
          (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || a.display_order - b.display_order
        )
      .map((img: any) => ({
        id: img.id,
        productId: img.product_id,
        variantId: img.variant_id,
        url: img.url,
        altText: img.alt_text,
        displayOrder: img.display_order,
        isPrimary: img.is_primary,
        createdAt: '',
      }));

    const category: Category | null = row.categories
      ? {
          id: row.categories.id,
          name: row.categories.name,
          slug: row.categories.slug,
          description: row.categories.description,
          displayOrder: 0,
          isActive: true,
          createdAt: '',
        }
      : null;

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      productCode: row.product_code,
      shortDescription: row.short_description,
      description: row.description,
      material: row.material,
      gender: row.gender,
      categoryId: row.category_id,
      category,
      images,
      variants: activeVariants,
      basePrice,
      baseDiscountPrice,
      isFeatured: row.is_featured,
      isNewArrival: row.is_new_arrival,
      isBestSeller: row.is_best_seller,
      isActive: row.is_active,
      metaTitle: row.meta_title,
      metaDescription: row.meta_description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

/**
 * Retrieves category details by slug.
 */
export async function getPublicCategoryBySlug(slug: string): Promise<Category | null> {
  const normalizedSlug = slug?.trim().toLowerCase();
  if (!normalizedSlug) return null;

  try {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { data, error } = await (supabase.from('categories') as any)
        .select('id, name, slug, description, image_url, display_order, is_active, created_at')
        .eq('slug', normalizedSlug)
        .eq('is_active', true)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          name: data.name,
          slug: data.slug,
          description: data.description,
          imageUrl: data.image_url,
          displayOrder: data.display_order,
          isActive: data.is_active,
          createdAt: data.created_at,
        };
      }
    }

    // Fallback to curated store categories when database is unseeded
    const fallback = DEFAULT_STORE_CATEGORIES.find((c) => c.slug === normalizedSlug);
    return fallback || null;
  } catch {
    const fallback = DEFAULT_STORE_CATEGORIES.find((c) => c.slug === normalizedSlug);
    return fallback || null;
  }
}

/**
 * Fetches configured store WhatsApp number from store_settings table, falling back to store config.
 */
export async function getStoreWhatsAppNumber(): Promise<string> {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return DEFAULT_DEV_STORE_CONFIG.whatsAppNumber;

    const { data } = await (supabase.from('store_settings') as any)
      .select('value')
      .eq('key', 'general')
      .maybeSingle();

    if (data?.value && typeof data.value === 'object' && (data.value as any).whatsapp_number) {
      return (data.value as any).whatsapp_number;
    }
  } catch {
    // fallback
  }
  return DEFAULT_DEV_STORE_CONFIG.whatsAppNumber;
}
