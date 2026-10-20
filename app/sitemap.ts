import type { MetadataRoute } from 'next';
import { getCanonicalSiteUrl } from '@/lib/auth/redirect';
import { createPublicSupabaseClient } from '@/lib/supabase/server';

export const revalidate = 3600;

const BATCH_SIZE = 1000;

/**
 * Next.js App Router sitemap.xml generator.
 *
 * Generates canonical search engine sitemap containing:
 * - Public storefront informational and catalog index pages
 * - Published, active category collection routes
 * - Published, active individual product detail routes with at least one active variant
 *
 * Strictly adheres to public storefront visibility rules:
 * - Inactive categories and products are excluded
 * - Products without active variants (which return 404 on storefront) are excluded
 * - Private administrative, transactional, customer account, cart, and checkout URLs are excluded
 * - All items are paginated to prevent PostgREST default result limits
 * - URLs are strictly deduplicated
 * - Failure handling is silent and leak-free
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getCanonicalSiteUrl();
  const seenUrls = new Set<string>();
  const sitemapEntries: MetadataRoute.Sitemap = [];

  function addEntry(entry: MetadataRoute.Sitemap[number]) {
    if (!seenUrls.has(entry.url)) {
      seenUrls.add(entry.url);
      sitemapEntries.push(entry);
    }
  }

  // 1. Static storefront pages
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/shop`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/faq`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/returns`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];

  for (const route of staticRoutes) {
    addEntry(route);
  }

  // 2. Dynamic catalog routes (with pagination and active variant filtering)
  try {
    const supabase = createPublicSupabaseClient();
    if (supabase) {
      // Query active categories across all pages
      let catFrom = 0;
      let hasMoreCats = true;
      while (hasMoreCats) {
        const { data: categories, error: catError } = await (supabase.from('categories') as any)
          .select('slug, created_at')
          .eq('is_active', true)
          .order('display_order', { ascending: true })
          .range(catFrom, catFrom + BATCH_SIZE - 1);

        if (catError || !Array.isArray(categories) || categories.length === 0) {
          hasMoreCats = false;
          break;
        }

        for (const cat of categories) {
          const slug = typeof cat?.slug === 'string' ? cat.slug.trim() : '';
          if (slug) {
            addEntry({
              url: `${baseUrl}/category/${encodeURIComponent(slug)}`,
              lastModified: cat.created_at ? new Date(cat.created_at) : new Date(),
              changeFrequency: 'weekly',
              priority: 0.8,
            });
          }
        }

        if (categories.length < BATCH_SIZE) {
          hasMoreCats = false;
        } else {
          catFrom += BATCH_SIZE;
        }
      }

      // Query active products with active variants across all pages
      let prodFrom = 0;
      let hasMoreProds = true;
      while (hasMoreProds) {
        const { data: products, error: prodError } = await (supabase.from('products') as any)
          .select(`
            slug,
            updated_at,
            created_at,
            product_variants ( id, is_active )
          `)
          .eq('is_active', true)
          .order('id', { ascending: true })
          .range(prodFrom, prodFrom + BATCH_SIZE - 1);

        if (prodError || !Array.isArray(products) || products.length === 0) {
          hasMoreProds = false;
          break;
        }

        for (const prod of products) {
          const slug = typeof prod?.slug === 'string' ? prod.slug.trim() : '';
          if (!slug) continue;

          // Parity with public storefront: Product must have at least one active variant
          const variants = Array.isArray(prod.product_variants) ? prod.product_variants : [];
          const hasActiveVariant = variants.some((v: any) => v && v.is_active === true);
          if (!hasActiveVariant) continue;

          addEntry({
            url: `${baseUrl}/products/${encodeURIComponent(slug)}`,
            lastModified: prod.updated_at
              ? new Date(prod.updated_at)
              : prod.created_at
                ? new Date(prod.created_at)
                : new Date(),
            changeFrequency: 'weekly',
            priority: 0.7,
          });
        }

        if (products.length < BATCH_SIZE) {
          hasMoreProds = false;
        } else {
          prodFrom += BATCH_SIZE;
        }
      }
    }
  } catch {
    // Non-leaking error fallback: Failures must never leak database internals or credentials
    console.error('[sitemap] Notice: Could not retrieve dynamic catalog items; serving static storefront routes.');
  }

  return sitemapEntries;
}
