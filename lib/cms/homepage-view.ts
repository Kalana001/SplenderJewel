import type { Banner, HomepageSection } from '@/types/cms';
import type { Category, ProductPublic } from '@/types/product';
import { getWhatsAppLink, DEFAULT_DEV_STORE_CONFIG } from '../config/store.ts';
import { DEFAULT_HOMEPAGE_SECTIONS } from './defaults.ts';

/**
 * Pure presentation & data-resolution logic for the Splender Jewel homepage.
 *
 * This module contains no React, JSX, or browser-specific APIs so that it can
 * be imported by client/server components and executed directly by Node.js tests.
 */

// -----------------------------------------------------------------------------
// Hero Resolution
// -----------------------------------------------------------------------------

export interface HeroEditorialData {
  mode: 'banners' | 'editorial';
  banners: Banner[];
  eyebrow: string;
  headline: string;
  description: string;
  primaryCtaText: string;
  primaryCtaLink: string;
  secondaryCtaText: string;
  secondaryCtaLink: string;
  whatsAppHref: string | null;
  featuredImageUrl: string | null;
  featuredImageAlt: string;
}

export const HERO_FALLBACK_DEFAULTS = {
  eyebrow: 'SPLENDER JEWEL · FASHION JEWELLERY',
  headline: 'Everyday Elegance, Beautifully Yours',
  description:
    'Discover stylish jewellery for everyday moments, thoughtful gifts, and special occasions.',
  primaryCtaText: 'Shop the Collection',
  primaryCtaLink: '/shop',
  secondaryCtaText: 'Explore Categories',
  secondaryCtaLink: '/#categories',
  whatsAppMessage:
    'Hello Splender Jewel, I would like to enquire about your jewellery collection.',
} as const;

export function resolveHeroData(
  banners: Banner[],
  heroSection?: HomepageSection | null,
  featuredProducts?: ProductPublic[],
  categories?: Category[],
  whatsAppNumber?: string,
  categoriesSection?: HomepageSection | null,
  categoriesAvailable?: boolean
): HeroEditorialData {
  const activeBanners = (banners || []).filter((b) => b.isActive);
  const mode: 'banners' | 'editorial' = activeBanners.length > 0 ? 'banners' : 'editorial';

  // Determine if categories section and items are active and available
  let isCategoriesAvailable = true;
  if (categoriesAvailable !== undefined) {
    isCategoriesAvailable = categoriesAvailable;
  } else if (categoriesSection !== undefined && categoriesSection !== null) {
    isCategoriesAvailable =
      Boolean(categoriesSection.isEnabled) &&
      (categories !== undefined ? categories.length > 0 : true);
  } else if (categories !== undefined) {
    isCategoriesAvailable = categories.length > 0;
  }

  // Eyebrow: CMS subtitle -> default
  const eyebrow =
    heroSection?.subtitle?.trim() || HERO_FALLBACK_DEFAULTS.eyebrow;

  // Headline: CMS title -> default
  const headline =
    heroSection?.title?.trim() || HERO_FALLBACK_DEFAULTS.headline;

  // Description: CMS configData.description -> default
  const description =
    (heroSection?.configData?.description as string)?.trim() ||
    HERO_FALLBACK_DEFAULTS.description;

  // Primary CTA
  const primaryCtaText =
    (heroSection?.configData?.ctaText as string)?.trim() ||
    HERO_FALLBACK_DEFAULTS.primaryCtaText;
  const primaryCtaLink =
    (heroSection?.configData?.ctaLink as string)?.trim() ||
    HERO_FALLBACK_DEFAULTS.primaryCtaLink;

  // Secondary CTA
  const secondaryCtaText =
    (heroSection?.configData?.secondaryCtaText as string)?.trim() ||
    HERO_FALLBACK_DEFAULTS.secondaryCtaText;
  const configuredSecondaryLink =
    (heroSection?.configData?.secondaryCtaLink as string)?.trim();

  let secondaryCtaLink =
    configuredSecondaryLink || HERO_FALLBACK_DEFAULTS.secondaryCtaLink;

  // If pointing to categories anchor ('#categories' or '/#categories') but categories are unavailable,
  // provide a working fallback to the shop catalog.
  const isCategoriesAnchor =
    secondaryCtaLink === '#categories' ||
    secondaryCtaLink === '/#categories' ||
    secondaryCtaLink.endsWith('#categories');

  if (isCategoriesAnchor && !isCategoriesAvailable) {
    secondaryCtaLink = '/shop';
  }

  // WhatsApp Link Resolution:
  const phoneToUse = whatsAppNumber !== undefined ? whatsAppNumber : DEFAULT_DEV_STORE_CONFIG.whatsAppNumber;
  const rawWaHref = getWhatsAppLink(
    HERO_FALLBACK_DEFAULTS.whatsAppMessage,
    { ...DEFAULT_DEV_STORE_CONFIG, whatsAppNumber: phoneToUse }
  );
  const whatsAppHref = rawWaHref && rawWaHref.trim() ? rawWaHref : null;

  // Featured Image: CMS configData.heroImage -> top featured product image -> top category image -> null
  let featuredImageUrl: string | null =
    (heroSection?.configData?.heroImage as string)?.trim() || null;
  let featuredImageAlt = 'Splender Jewel signature jewellery piece';

  if (!featuredImageUrl && featuredProducts && featuredProducts.length > 0) {
    const prodWithImg = featuredProducts.find((p) =>
      p.images && p.images.length > 0 && Boolean(p.images[0].url)
    );
    if (prodWithImg) {
      const primaryImg =
        prodWithImg.images.find((img) => img.isPrimary) || prodWithImg.images[0];
      featuredImageUrl = primaryImg.url;
      featuredImageAlt = primaryImg.altText || prodWithImg.name;
    }
  }

  if (!featuredImageUrl && categories && categories.length > 0) {
    const catWithImg = categories.find((c) => Boolean(c.imageUrl));
    if (catWithImg && catWithImg.imageUrl) {
      featuredImageUrl = catWithImg.imageUrl;
      featuredImageAlt = catWithImg.name;
    }
  }

  return {
    mode,
    banners: activeBanners,
    eyebrow,
    headline,
    description,
    primaryCtaText,
    primaryCtaLink,
    secondaryCtaText,
    secondaryCtaLink,
    whatsAppHref,
    featuredImageUrl,
    featuredImageAlt,
  };
}

// -----------------------------------------------------------------------------
// Photography Collage Resolution
// -----------------------------------------------------------------------------

export interface CollageItem {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
  href: string;
  tag?: string;
}

/**
 * Builds an editorial collage of 3–5 items using real Splender Jewel photographs.
 * Sources exclusively from approved published products and categories.
 */
export function buildCollageItems(
  products: ProductPublic[] = [],
  categories: Category[] = [],
  limit: number = 4
): CollageItem[] {
  const items: CollageItem[] = [];
  const seenUrls = new Set<string>();

  // 1. Gather distinct product images from published products
  for (const product of products) {
    if (!product || !product.images) continue;
    for (const img of product.images) {
      if (img.url && !seenUrls.has(img.url)) {
        seenUrls.add(img.url);
        items.push({
          id: `product-${product.id}-${img.id}`,
          title: product.name,
          subtitle: product.category?.name || 'Fine Fashion Jewellery',
          imageUrl: img.url,
          href: `/products/${product.slug}`,
          tag: product.isNewArrival
            ? 'New Arrival'
            : product.isFeatured
            ? 'Signature'
            : undefined,
        });
        break; // 1 distinct image per product for variety
      }
    }
    if (items.length >= limit) break;
  }

  // 2. If more items needed, supplement with category images
  if (items.length < limit) {
    for (const cat of categories) {
      if (cat.imageUrl && !seenUrls.has(cat.imageUrl)) {
        seenUrls.add(cat.imageUrl);
        items.push({
          id: `category-${cat.id}`,
          title: cat.name,
          subtitle: 'Curated Collection',
          imageUrl: cat.imageUrl,
          href: `/category/${cat.slug}`,
          tag: 'Collection',
        });
      }
      if (items.length >= limit) break;
    }
  }

  return items;
}

// -----------------------------------------------------------------------------
// Categories Display Limit Resolution
// -----------------------------------------------------------------------------

export function resolveVisibleCategories(
  categories: Category[],
  categorySection?: HomepageSection | null
): {
  visibleCategories: Category[];
  title: string;
  subtitle: string;
} {
  const rawDisplayCount = categorySection?.configData?.displayCount;
  const explicitLimit =
    typeof rawDisplayCount === 'number' && rawDisplayCount > 0
      ? rawDisplayCount
      : typeof rawDisplayCount === 'string' && Number(rawDisplayCount) > 0
      ? Number(rawDisplayCount)
      : null;

  const visibleCategories = explicitLimit
    ? categories.slice(0, explicitLimit)
    : categories;

  const title = categorySection?.title?.trim() || 'Curated Collections';
  const subtitle = categorySection?.subtitle?.trim() || 'Browse by Category';

  return { visibleCategories, title, subtitle };
}

// -----------------------------------------------------------------------------
// Featured Products Display Limit Resolution
// -----------------------------------------------------------------------------

export function resolveVisibleFeaturedProducts(
  products: ProductPublic[],
  featuredSection?: HomepageSection | null
): {
  visibleProducts: ProductPublic[];
  title: string;
  subtitle: string;
} {
  const maxFeaturedItems =
    typeof featuredSection?.configData?.maxItems === 'number' &&
    featuredSection.configData.maxItems > 0
      ? featuredSection.configData.maxItems
      : 8;

  const visibleProducts = products.slice(0, maxFeaturedItems);
  const title = featuredSection?.title?.trim() || 'Signature & Trending Pieces';
  const subtitle =
    featuredSection?.subtitle?.trim() || 'Hand-selected by our stylists';

  return { visibleProducts, title, subtitle };
}

// -----------------------------------------------------------------------------
// Shared Homepage Sections Merging Logic
// -----------------------------------------------------------------------------

export function mergeHomepageSections(dbRows?: any[] | null): HomepageSection[] {
  const mergedMap = new Map<string, HomepageSection>();

  // 1. Initialize with seeded defaults
  DEFAULT_HOMEPAGE_SECTIONS.forEach((s, idx) => {
    mergedMap.set(s.sectionKey, {
      ...s,
      id: `default-${s.sectionKey}-${idx}`,
      updatedAt: new Date().toISOString(),
    });
  });

  // 2. If database rows exist, overlay them
  if (dbRows && dbRows.length > 0) {
    for (const row of dbRows) {
      if (!row || !row.section_key) continue;
      mergedMap.set(row.section_key, {
        id: row.id,
        sectionKey: row.section_key,
        title: row.title ?? null,
        subtitle: row.subtitle ?? null,
        displayOrder: typeof row.display_order === 'number' ? row.display_order : 0,
        isEnabled: Boolean(row.is_enabled),
        configData: typeof row.config_data === 'object' && row.config_data !== null ? row.config_data : {},
        updatedAt: row.updated_at || new Date().toISOString(),
      });
    }
  }

  return Array.from(mergedMap.values()).sort((a, b) => a.displayOrder - b.displayOrder);
}
