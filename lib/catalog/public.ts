import 'server-only';
import { cache } from 'react';
import { createPublicSupabaseClient } from '@/lib/supabase/server';
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
export const getPublicProducts = cache(async function getPublicProducts(
  filters?: PublicProductsFilter
): Promise<PublicProductsResult> {
  const rawPage = Number(filters?.page);
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawLimit = Number(filters?.limit);
  const limit = Number.isInteger(rawLimit) && rawLimit >= 1 ? Math.min(48, rawLimit) : 24;

  const emptyResult: PublicProductsResult = {
    products: [],
    total: 0,
    page,
    limit,
    totalPages: 0,
  };

  try {
    const supabase = createPublicSupabaseClient();
    if (!supabase) return emptyResult;

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

    // Sorting with deterministic secondary tie-breaker to prevent pagination shifts
    switch (filters?.sort) {
      case 'name-asc':
        query = query.order('name', { ascending: true }).order('id', { ascending: true });
        break;
      case 'featured':
        query = query
          .order('is_featured', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false });
        break;
      case 'newest':
      default:
        query = query.order('created_at', { ascending: false }).order('id', { ascending: false });
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
});

/**
 * Retrieves a single active product by slug for the product details page.
 * Returns null if the product does not exist or is inactive.
 */
export const getPublicProductBySlug = cache(async function getPublicProductBySlug(
  slug: string
): Promise<ProductPublic | null> {
  try {
    const supabase = createPublicSupabaseClient();
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
});

/**
 * Retrieves category details by slug.
 *
 * Rules:
 * 1. A successful Supabase query returning no matching category may use fallback metadata
 *    for the six recognized slugs ('rings', 'necklaces', 'bracelets', 'earrings', 'men', 'sets').
 * 2. A successful query returning a real category must return the real database record.
 * 3. A Supabase query error must propagate.
 * 4. Any unexpected exception must propagate rather than silently returning fallback metadata.
 * 5. An unrecognized slug should return null only after a successful query confirms no matching category exists.
 * 6. Intentional fallback behavior is preserved for a genuinely unconfigured Supabase client
 *    (identified safely by createServerSupabaseClient() returning null in offline dev).
 */
export const getPublicCategoryBySlug = cache(async function getPublicCategoryBySlug(
  slug: string,
  client?: any
): Promise<Category | null> {
  const normalizedSlug = slug?.trim().toLowerCase();
  if (!normalizedSlug) return null;

  const supabase = client !== undefined ? client : createPublicSupabaseClient();
  if (!supabase) {
    // Supabase client is genuinely unconfigured (e.g. offline development without credentials)
    const fallback = DEFAULT_STORE_CATEGORIES.find((c) => c.slug === normalizedSlug);
    return fallback || null;
  }

  // Execute query on Supabase. Any unexpected exception during execution will propagate.
  const { data, error } = await (supabase.from('categories') as any)
    .select('id, name, slug, description, image_url, display_order, is_active, created_at')
    .eq('slug', normalizedSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error(`[getPublicCategoryBySlug] Database error querying category "${normalizedSlug}":`, error.message);
    const dbError = new Error(`Database error querying category: ${error.message}`);
    (dbError as any).code = error.code;
    (dbError as any).details = error.details;
    throw dbError;
  }

  if (data) {
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

  // The query succeeded without error, confirming no category exists in the database.
  // Check if it matches one of the recognized curated fallback categories:
  const fallback = DEFAULT_STORE_CATEGORIES.find((c) => c.slug === normalizedSlug);
  return fallback || null;
});

/**
 * Fetches configured store WhatsApp number from store_settings table, falling back to store config.
 */
export const getStoreWhatsAppNumber = cache(async function getStoreWhatsAppNumber(): Promise<string> {
  try {
    const supabase = createPublicSupabaseClient();
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
});

/**
 * Retrieves all active categories for public storefront navigation, homepage display, and filters.
 *
 * Rules:
 * 1. Queries public.categories with is_active = true.
 * 2. Primary sort: display_order ASC.
 * 3. Stable secondary sort: name ASC.
 * 4. Deduplicates records by normalized slug to prevent duplicate navigation entries.
 * 5. Handles empty category lists and database errors correctly.
 * 6. Only uses development fallbacks (DEFAULT_STORE_CATEGORIES) when the database is genuinely unconfigured
 *    (e.g., createPublicSupabaseClient() returns null in offline dev environment).
 */
export const getPublicCategories = cache(async function getPublicCategories(
  client?: any
): Promise<Category[]> {
  const supabase = client !== undefined ? client : createPublicSupabaseClient();
  if (!supabase) {
    // Database is genuinely unconfigured (e.g. offline dev without credentials)
    return DEFAULT_STORE_CATEGORIES;
  }

  const { data, error } = await (supabase.from('categories') as any)
    .select('id, name, slug, description, image_url, display_order, is_active, created_at')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('[getPublicCategories] Database error querying categories:', error.message);
    const dbError = new Error(`Database error querying categories: ${error.message}`);
    (dbError as any).code = error.code;
    (dbError as any).details = error.details;
    throw dbError;
  }

  if (!data || !Array.isArray(data)) {
    return [];
  }

  const seenSlugs = new Set<string>();
  const categories: Category[] = [];

  for (const row of data) {
    const slug = (row.slug || '').trim().toLowerCase();
    if (!slug || seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);

    categories.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      imageUrl: row.image_url,
      displayOrder: row.display_order ?? 0,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at || '',
    });
  }

  return categories;
});

/**
 * Retrieves all distinct product materials for public catalog filter options.
 * Selects distinct materials from active products across the entire catalog
 * without truncating at arbitrary small row limits, using safe bounded batching.
 */
export const getPublicMaterials = cache(async function getPublicMaterials(
  client?: any
): Promise<string[]> {
  const fallbackMaterials = ['Gold', 'Rose Gold', 'Silver', 'Stainless Steel', 'Titanium'];
  try {
    const supabase = client !== undefined ? client : createPublicSupabaseClient();
    if (!supabase) {
      return fallbackMaterials;
    }

    const set = new Set<string>();
    const batchSize = 1000;
    let from = 0;
    const maxRows = 5000;

    while (from < maxRows) {
      let query = (supabase.from('products') as any)
        .select('material')
        .eq('is_active', true)
        .not('material', 'is', null);

      if (typeof query.range === 'function') {
        query = query.range(from, from + batchSize - 1);
      }

      const { data, error } = await query;

      if (error || !data || !Array.isArray(data) || data.length === 0) {
        break;
      }

      for (const row of data) {
        if (row.material && typeof row.material === 'string' && row.material.trim()) {
          set.add(row.material.trim());
        }
      }

      if (data.length < batchSize || typeof query.range !== 'function') {
        break;
      }
      from += batchSize;
    }

    const list = Array.from(set).sort();
    return list.length > 0 ? list : fallbackMaterials;
  } catch {
    return fallbackMaterials;
  }
});
