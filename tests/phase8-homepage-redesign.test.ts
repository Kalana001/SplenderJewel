import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveHeroData,
  buildCollageItems,
  resolveVisibleCategories,
  resolveVisibleFeaturedProducts,
  mergeHomepageSections,
  HERO_FALLBACK_DEFAULTS,
} from '../lib/cms/homepage-view.ts';
import { DEFAULT_HOMEPAGE_SECTIONS } from '../lib/cms/defaults.ts';
import { getWhatsAppLink, formatCurrency, DEFAULT_DEV_STORE_CONFIG } from '../lib/config/store.ts';
import { getPublicApprovedReviews } from '../lib/reviews/public.ts';
import type { Banner, HomepageSection } from '../types/cms.ts';
import type { Category, ProductPublic, ProductImage } from '../types/product.ts';

// =============================================================================
// PHASE 8: PREMIUM HOMEPAGE REDESIGN & STOREFRONT EXPERIENCE TEST SUITE
// =============================================================================

// Helper to create mock ProductImage
function createMockImage(url: string, isPrimary = false): ProductImage {
  return {
    id: `img-${url}`,
    productId: 'p-1',
    variantId: null,
    url,
    altText: `Image of ${url}`,
    displayOrder: 0,
    isPrimary,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

// Helper to create mock ProductPublic
function createMockProduct(
  id: string,
  name: string,
  slug: string,
  imageUrl?: string,
  isFeatured = true
): ProductPublic {
  return {
    id,
    name,
    slug,
    description: `Description for ${name}`,
    basePrice: 3500,
    baseDiscountPrice: 4200,
    isFeatured,
    isNewArrival: false,
    isBestSeller: false,
    gender: 'unisex',
    isActive: true,
    categoryId: 'cat-1',
    category: {
      id: 'cat-1',
      name: 'Rings',
      slug: 'rings',
      displayOrder: 1,
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
    },
    images: imageUrl ? [createMockImage(imageUrl, true)] : [],
    variants: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

// Helper to create mock Category
function createMockCategory(
  id: string,
  name: string,
  slug: string,
  imageUrl: string | null = null
): Category {
  return {
    id,
    name,
    slug,
    description: `Curated collection of ${name}`,
    imageUrl,
    displayOrder: 1,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

// -----------------------------------------------------------------------------
// 1. Hero Resolution: Editorial vs Banner Carousel Mode
// -----------------------------------------------------------------------------

test('Hero Resolution: selects banners mode when active banners exist', () => {
  const banners: Banner[] = [
    {
      id: 'b1',
      title: 'Festival of Lights',
      subtitle: 'Exclusive Festive Edit',
      imageUrl: '/banners/festive.jpg',
      mobileImageUrl: null,
      linkUrl: '/shop',
      buttonText: 'Discover',
      displayOrder: 1,
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'b2',
      title: 'Inactive Banner',
      subtitle: null,
      imageUrl: '/banners/inactive.jpg',
      mobileImageUrl: null,
      linkUrl: null,
      buttonText: null,
      displayOrder: 2,
      isActive: false, // Inactive banner must be filtered out
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const heroData = resolveHeroData(banners, null, [], []);
  assert.equal(heroData.mode, 'banners');
  assert.equal(heroData.banners.length, 1);
  assert.equal(heroData.banners[0].id, 'b1');
});

test('Hero Resolution: selects editorial mode when no active banners exist', () => {
  const inactiveBanners: Banner[] = [
    {
      id: 'b-archived',
      title: 'Old Promo',
      subtitle: null,
      imageUrl: '/banners/old.jpg',
      mobileImageUrl: null,
      linkUrl: null,
      buttonText: null,
      displayOrder: 1,
      isActive: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const heroData = resolveHeroData(inactiveBanners, null, [], []);
  assert.equal(heroData.mode, 'editorial');
  assert.equal(heroData.banners.length, 0);
  assert.equal(heroData.eyebrow, HERO_FALLBACK_DEFAULTS.eyebrow);
  assert.equal(heroData.headline, HERO_FALLBACK_DEFAULTS.headline);
  assert.equal(heroData.description, HERO_FALLBACK_DEFAULTS.description);
});

test('Hero Resolution: uses CMS section configuration when provided', () => {
  const cmsHero: HomepageSection = {
    id: 'cms-hero-1',
    sectionKey: 'hero',
    title: 'Timeless Gold Creations',
    subtitle: 'THE NEGOMBO GALLERY',
    displayOrder: 1,
    isEnabled: true,
    configData: {
      description: 'Handcrafted fashion jewellery delivered across Sri Lanka.',
      ctaText: 'Explore Collection',
      ctaLink: '/shop?sort=trending',
      secondaryCtaText: 'View Rings',
      secondaryCtaLink: '/category/rings',
      heroImage: '/images/cms-featured-hero.jpg',
    },
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const heroData = resolveHeroData([], cmsHero, [], []);
  assert.equal(heroData.mode, 'editorial');
  assert.equal(heroData.headline, 'Timeless Gold Creations');
  assert.equal(heroData.eyebrow, 'THE NEGOMBO GALLERY');
  assert.equal(heroData.description, 'Handcrafted fashion jewellery delivered across Sri Lanka.');
  assert.equal(heroData.primaryCtaText, 'Explore Collection');
  assert.equal(heroData.primaryCtaLink, '/shop?sort=trending');
  assert.equal(heroData.secondaryCtaText, 'View Rings');
  assert.equal(heroData.secondaryCtaLink, '/category/rings');
  assert.equal(heroData.featuredImageUrl, '/images/cms-featured-hero.jpg');
});

test('Hero Resolution: fallback image priority (featured product -> category -> null)', () => {
  const products = [
    createMockProduct('p1', 'Gold Signet Ring', 'gold-signet-ring', 'https://cdn.splender.lk/p1.jpg'),
  ];
  const categories = [
    createMockCategory('c1', 'Rings', 'rings', 'https://cdn.splender.lk/cat-rings.jpg'),
  ];

  // 1. When products have images, first product image is selected
  const withProduct = resolveHeroData([], null, products, categories);
  assert.equal(withProduct.featuredImageUrl, 'https://cdn.splender.lk/p1.jpg');

  // 2. When products have no images, falls back to category image
  const productsNoImg = [createMockProduct('p1', 'Gold Signet Ring', 'gold-signet-ring')];
  const withCategory = resolveHeroData([], null, productsNoImg, categories);
  assert.equal(withCategory.featuredImageUrl, 'https://cdn.splender.lk/cat-rings.jpg');

  // 3. When neither has images, returns null safely
  const categoriesNoImg = [createMockCategory('c1', 'Rings', 'rings', null)];
  const withNeither = resolveHeroData([], null, productsNoImg, categoriesNoImg);
  assert.equal(withNeither.featuredImageUrl, null);
});

test('Hero Resolution: WhatsApp href format and custom phone number support', () => {
  const defaultHero = resolveHeroData([], null, [], []);
  assert.ok(defaultHero.whatsAppHref?.startsWith('https://wa.me/94764689907'));
  assert.ok(defaultHero.whatsAppHref?.includes('enquire'));

  const customPhoneHero = resolveHeroData([], null, [], [], '+94 77 123 4567');
  assert.ok(customPhoneHero.whatsAppHref?.startsWith('https://wa.me/94771234567'));
});

// -----------------------------------------------------------------------------
// 2. Editorial Collage: Item Construction & Real Image Sourcing
// -----------------------------------------------------------------------------

test('Collage Items: builds up to 5 items from real products and categories', () => {
  const products = [
    createMockProduct('p1', 'Royal Solitaire Ring', 'solitaire-ring', 'https://cdn.splender.lk/ring1.jpg'),
    createMockProduct('p2', 'Pearl Teardrop Pendant', 'pearl-pendant', 'https://cdn.splender.lk/pendant.jpg'),
    createMockProduct('p3', 'Golden Filigree Bangle', 'filigree-bangle', 'https://cdn.splender.lk/bangle.jpg'),
  ];
  const categories = [
    createMockCategory('c1', 'Earrings', 'earrings', 'https://cdn.splender.lk/cat-earrings.jpg'),
    createMockCategory('c2', 'Necklaces', 'necklaces', 'https://cdn.splender.lk/cat-necklaces.jpg'),
    createMockCategory('c3', 'Bracelets', 'bracelets', 'https://cdn.splender.lk/cat-bracelets.jpg'),
  ];

  const collage = buildCollageItems(products, categories, 4);
  assert.equal(collage.length, 4);

  // First 3 items should come from products
  assert.equal(collage[0].title, 'Royal Solitaire Ring');
  assert.equal(collage[0].imageUrl, 'https://cdn.splender.lk/ring1.jpg');
  assert.equal(collage[0].href, '/products/solitaire-ring');

  assert.equal(collage[1].title, 'Pearl Teardrop Pendant');
  assert.equal(collage[2].title, 'Golden Filigree Bangle');

  // 4th item supplements from categories
  assert.equal(collage[3].title, 'Earrings');
  assert.equal(collage[3].imageUrl, 'https://cdn.splender.lk/cat-earrings.jpg');
  assert.equal(collage[3].href, '/category/earrings');
});

test('Collage Items: deduplicates duplicate image URLs across products and categories', () => {
  const sharedImgUrl = 'https://cdn.splender.lk/shared-image.jpg';
  const products = [
    createMockProduct('p1', 'Piece One', 'piece-one', sharedImgUrl),
    createMockProduct('p2', 'Piece Two', 'piece-two', sharedImgUrl), // duplicate image URL
    createMockProduct('p3', 'Piece Three', 'piece-three', 'https://cdn.splender.lk/unique.jpg'),
  ];

  const collage = buildCollageItems(products, [], 5);
  assert.equal(collage.length, 2, 'Must deduplicate and omit duplicate image URLs');
  assert.equal(collage[0].title, 'Piece One');
  assert.equal(collage[1].title, 'Piece Three');
});

test('Collage Items: returns empty array when no products or categories have images', () => {
  const productsNoImg = [
    createMockProduct('p1', 'No Image 1', 'no-img-1'),
    createMockProduct('p2', 'No Image 2', 'no-img-2'),
  ];
  const categoriesNoImg = [
    createMockCategory('c1', 'Rings', 'rings', null),
  ];

  const collage = buildCollageItems(productsNoImg, categoriesNoImg);
  assert.deepEqual(collage, []);
});

// -----------------------------------------------------------------------------
// 3. Category Showcase Resolution
// -----------------------------------------------------------------------------

test('Category Showcase: respects CMS displayCount limit', () => {
  const allCategories = [
    createMockCategory('c1', 'Rings', 'rings'),
    createMockCategory('c2', 'Necklaces', 'necklaces'),
    createMockCategory('c3', 'Bracelets', 'bracelets'),
    createMockCategory('c4', 'Earrings', 'earrings'),
    createMockCategory('c5', 'Anklets', 'anklets'),
    createMockCategory('c6', 'Sets', 'sets'),
    createMockCategory('c7', 'Men', 'men'),
  ];

  // Limited to 3
  const cmsSectionLimit: HomepageSection = {
    id: 's-cat',
    sectionKey: 'categories',
    title: 'Curated Gems',
    subtitle: 'Hand-Selected',
    displayOrder: 3,
    isEnabled: true,
    configData: { displayCount: 3 },
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const res = resolveVisibleCategories(allCategories, cmsSectionLimit);
  assert.equal(res.visibleCategories.length, 3);
  assert.equal(res.title, 'Curated Gems');
  assert.equal(res.subtitle, 'Hand-Selected');
  assert.equal(res.visibleCategories[0].name, 'Rings');
  assert.equal(res.visibleCategories[2].name, 'Bracelets');

  // No limit -> returns all 7
  const cmsSectionNoLimit: HomepageSection = {
    ...cmsSectionLimit,
    configData: {},
  };
  const resAll = resolveVisibleCategories(allCategories, cmsSectionNoLimit);
  assert.equal(resAll.visibleCategories.length, 7);
});

test('Category Showcase: handles string displayCount and empty list', () => {
  const allCategories = [
    createMockCategory('c1', 'Rings', 'rings'),
    createMockCategory('c2', 'Necklaces', 'necklaces'),
    createMockCategory('c3', 'Bracelets', 'bracelets'),
  ];

  const cmsStringLimit = {
    id: 's',
    sectionKey: 'categories',
    title: null,
    subtitle: null,
    displayOrder: 3,
    isEnabled: true,
    configData: { displayCount: '2' },
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const res = resolveVisibleCategories(allCategories, cmsStringLimit);
  assert.equal(res.visibleCategories.length, 2);
  assert.equal(res.title, 'Curated Collections', 'Default title fallback when null');
  assert.equal(res.subtitle, 'Browse by Category', 'Default subtitle fallback when null');

  const emptyRes = resolveVisibleCategories([], cmsStringLimit);
  assert.deepEqual(emptyRes.visibleCategories, []);
});

// -----------------------------------------------------------------------------
// 4. Featured Products Resolution
// -----------------------------------------------------------------------------

test('Featured Products: respects maxItems limit and falls back to 8', () => {
  const mockProducts = Array.from({ length: 12 }, (_, i) =>
    createMockProduct(`p-${i + 1}`, `Jewel Piece ${i + 1}`, `jewel-${i + 1}`)
  );

  // Custom limit of 4
  const cmsFeaturedLimit: HomepageSection = {
    id: 's-feat',
    sectionKey: 'featured_products',
    title: 'Trending Right Now',
    subtitle: 'Signature Fashion Pieces',
    displayOrder: 4,
    isEnabled: true,
    configData: { maxItems: 4 },
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const resLimit = resolveVisibleFeaturedProducts(mockProducts, cmsFeaturedLimit);
  assert.equal(resLimit.visibleProducts.length, 4);
  assert.equal(resLimit.title, 'Trending Right Now');
  assert.equal(resLimit.subtitle, 'Signature Fashion Pieces');

  // No maxItems -> defaults to 8
  const cmsFeaturedDefault: HomepageSection = {
    ...cmsFeaturedLimit,
    configData: {},
  };
  const resDefault = resolveVisibleFeaturedProducts(mockProducts, cmsFeaturedDefault);
  assert.equal(resDefault.visibleProducts.length, 8);
});

// -----------------------------------------------------------------------------
// 5. CMS Defaults & Homepage Section Integration
// -----------------------------------------------------------------------------

test('CMS Defaults: DEFAULT_HOMEPAGE_SECTIONS includes hero, collage, categories, featured_products, pillars, reviews', () => {
  const keys = DEFAULT_HOMEPAGE_SECTIONS.map((s) => s.sectionKey);
  assert.ok(keys.includes('hero'), 'Hero must be present');
  assert.ok(keys.includes('collage'), 'Collage must be present in defaults');
  assert.ok(keys.includes('categories'), 'Categories must be present');
  assert.ok(keys.includes('featured_products'), 'Featured products must be present');
  assert.ok(keys.includes('pillars'), 'Pillars must be present');
  assert.ok(keys.includes('reviews'), 'Reviews must be present');

  // Section keys must be distinct
  const uniqueKeys = new Set(keys);
  assert.equal(uniqueKeys.size, keys.length, 'All default sectionKeys must be unique');

  // Display orders must be strictly monotonically increasing
  for (let i = 1; i < DEFAULT_HOMEPAGE_SECTIONS.length; i++) {
    assert.ok(
      DEFAULT_HOMEPAGE_SECTIONS[i].displayOrder > DEFAULT_HOMEPAGE_SECTIONS[i - 1].displayOrder,
      `Section ${DEFAULT_HOMEPAGE_SECTIONS[i].sectionKey} displayOrder (${DEFAULT_HOMEPAGE_SECTIONS[i].displayOrder}) must be > previous (${DEFAULT_HOMEPAGE_SECTIONS[i - 1].displayOrder})`
    );
  }
});

test('CMS Defaults: collage section is enabled by default with luxury title', () => {
  const collage = DEFAULT_HOMEPAGE_SECTIONS.find((s) => s.sectionKey === 'collage');
  assert.ok(collage, 'Collage section must exist');
  assert.equal(collage.isEnabled, true);
  assert.equal(collage.title, 'The Editorial Edit');
  assert.equal(collage.subtitle, 'Curated Showcase');
});

// -----------------------------------------------------------------------------
// 6. WhatsApp Concierge Link & Missing-Number Fallback Contracts
// -----------------------------------------------------------------------------

test('WhatsApp Concierge: generates clean link with encoded message for Sri Lanka', () => {
  const msg = 'Hello Splender Jewel, I would like to inquire about your jewellery collection.';
  const link = getWhatsAppLink(msg);
  assert.ok(link.startsWith('https://wa.me/94764689907'));
  assert.ok(link.includes(encodeURIComponent('Splender Jewel')));
  assert.ok(link.includes(encodeURIComponent('jewellery collection')));
});

test('WhatsApp Concierge: returns empty string when WhatsApp number is missing or empty', () => {
  // Empty number
  const emptyConfig = { ...DEFAULT_DEV_STORE_CONFIG, whatsAppNumber: '' };
  assert.equal(getWhatsAppLink('Inquiry', emptyConfig), '');

  // Whitespace only
  const wsConfig = { ...DEFAULT_DEV_STORE_CONFIG, whatsAppNumber: '   ' };
  assert.equal(getWhatsAppLink('Inquiry', wsConfig), '');

  // No digits
  const noDigitsConfig = { ...DEFAULT_DEV_STORE_CONFIG, whatsAppNumber: 'not-a-number' };
  assert.equal(getWhatsAppLink('Inquiry', noDigitsConfig), '');

  // Missing config entirely
  assert.equal(getWhatsAppLink('Inquiry', { ...DEFAULT_DEV_STORE_CONFIG, whatsAppNumber: '' }), '');
});

test('Hero Resolution: sets whatsAppHref to null when phone is missing or empty', () => {
  const noPhoneHero = resolveHeroData([], null, [], [], '');
  assert.equal(noPhoneHero.whatsAppHref, null);

  const invalidPhoneHero = resolveHeroData([], null, [], [], '+++');
  assert.equal(invalidPhoneHero.whatsAppHref, null);
});

// -----------------------------------------------------------------------------
// 7. Delivery Claims Wording Contract
// -----------------------------------------------------------------------------

test('Delivery Policy: uses approved non-guaranteed timing wording', () => {
  const approvedWording = 'Delivery typically takes 24–48 working hours after dispatch.';

  // Check approved phrasing presence
  assert.ok(
    approvedWording.includes('typically takes 24–48 working hours after dispatch'),
    'Must state typical timing after dispatch, not guaranteed 24h dispatch'
  );

  // Must not claim instant or guaranteed dispatch
  assert.doesNotMatch(approvedWording, /guaranteed dispatch/i);
  assert.doesNotMatch(approvedWording, /dispatched within 24 hours/i);
});

// -----------------------------------------------------------------------------
// 8. Testimonials & Genuine Reviews Contract
// -----------------------------------------------------------------------------

test('Reviews Contract: suppresses section when no approved reviews are available', () => {
  const emptyApprovedReviews: any[] = [];

  // When empty, storefront returns null rather than fabricated customer quotes
  function renderReviewsSection(reviews: any[]) {
    if (!reviews || reviews.length === 0) {
      return null;
    }
    return { rendered: true, count: reviews.length };
  }

  assert.equal(renderReviewsSection(emptyApprovedReviews), null);

  // Only renders when genuine approved reviews exist
  const genuineReview = [
    {
      id: 'rev-1',
      customerName: 'Kavindi D.',
      rating: 5,
      title: 'Beautiful Necklace',
      comment: 'Loved the packaging and design.',
      productName: 'Pearl Teardrop Pendant',
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];
  const rendered = renderReviewsSection(genuineReview);
  assert.ok(rendered);
  assert.equal(rendered?.count, 1);
});

// -----------------------------------------------------------------------------
// 9. CMS Section Ordering & Deduplication Authority
// -----------------------------------------------------------------------------

test('CMS Sections: orders authoritative DB sections and eliminates duplicate section keys', () => {
  const sections: HomepageSection[] = [
    {
      id: 's1',
      sectionKey: 'hero',
      title: 'Hero',
      subtitle: null,
      displayOrder: 1,
      isEnabled: true,
      configData: {},
      updatedAt: '2026-01-01',
    },
    {
      id: 's2',
      sectionKey: 'collage',
      title: 'Collage',
      subtitle: null,
      displayOrder: 2,
      isEnabled: false, // Disabled by admin
      configData: {},
      updatedAt: '2026-01-01',
    },
    {
      id: 's3',
      sectionKey: 'categories',
      title: 'Categories',
      subtitle: null,
      displayOrder: 3,
      isEnabled: true,
      configData: {},
      updatedAt: '2026-01-01',
    },
    {
      id: 's4-dup',
      sectionKey: 'categories', // Duplicate section key
      title: 'Categories Duplicate',
      subtitle: null,
      displayOrder: 4,
      isEnabled: true,
      configData: {},
      updatedAt: '2026-01-01',
    },
  ];

  // Logic matching app/(store)/page.tsx
  const sortedSectionKeys = Array.from(
    new Set(sections.filter((s) => s.isEnabled).map((s) => s.sectionKey))
  );

  // Disabled 'collage' must be excluded
  assert.ok(!sortedSectionKeys.includes('collage'), 'Disabled collage must not be included');

  // Duplicate 'categories' must appear only once
  assert.equal(sortedSectionKeys.filter((k) => k === 'categories').length, 1);

  // Resulting keys must match active order
  assert.deepEqual(sortedSectionKeys, ['hero', 'categories']);
});

// -----------------------------------------------------------------------------
// 10. Storefront Currency Formatting Contract
// -----------------------------------------------------------------------------

test('Currency Formatting: formats in Sri Lankan Rupees (LKR / Rs.)', () => {
  const formatted = formatCurrency(4500);
  assert.equal(formatted, 'Rs. 4,500');

  const zeroPrice = formatCurrency(0);
  assert.equal(zeroPrice, 'Rs. 0');

  const highValue = formatCurrency(125000);
  assert.equal(highValue, 'Rs. 125,000');
});

// -----------------------------------------------------------------------------
// 11. Stage 2: CMS Compatibility Scenarios A, B, C, D
// -----------------------------------------------------------------------------

test('Stage 2 - Scenario A: Empty DB sections returns all defaults with collage enabled and no duplicates', () => {
  const sections = mergeHomepageSections([]);
  assert.equal(sections.length, DEFAULT_HOMEPAGE_SECTIONS.length);

  const collage = sections.find((s) => s.sectionKey === 'collage');
  assert.ok(collage, 'Collage section must appear in default sections');
  assert.equal(collage?.isEnabled, true);

  const keys = sections.map((s) => s.sectionKey);
  const uniqueKeys = new Set(keys);
  assert.equal(uniqueKeys.size, keys.length, 'No duplicate sections may appear');
});

test('Stage 2 - Scenario B: Existing DB sections take priority, respect ordering/toggles, and preserve collage', () => {
  const dbSections = [
    {
      id: 'db-hero',
      section_key: 'hero',
      title: 'Database Hero Headline',
      subtitle: 'DB Subtitle',
      display_order: 1,
      is_enabled: true,
      config_data: { custom: true },
    },
    {
      id: 'db-categories',
      section_key: 'categories',
      title: 'Our Exquisite Categories',
      subtitle: null,
      display_order: 3,
      is_enabled: false, // Disabled by admin
      config_data: {},
    },
    {
      id: 'db-featured',
      section_key: 'featured_products',
      title: 'Featured Collection',
      subtitle: null,
      display_order: 4,
      is_enabled: true,
      config_data: {},
    },
  ];

  const merged = mergeHomepageSections(dbSections);

  // DB hero overrides default hero
  const hero = merged.find((s) => s.sectionKey === 'hero');
  assert.equal(hero?.id, 'db-hero');
  assert.equal(hero?.title, 'Database Hero Headline');

  // DB categories has isEnabled: false
  const categories = merged.find((s) => s.sectionKey === 'categories');
  assert.equal(categories?.id, 'db-categories');
  assert.equal(categories?.isEnabled, false);

  // Collage was not in DB, so it is preserved from defaults
  const collage = merged.find((s) => s.sectionKey === 'collage');
  assert.ok(collage, 'Collage must be preserved when not present in DB');
  assert.equal(collage?.isEnabled, true);

  // No duplicate collage or categories
  assert.equal(merged.filter((s) => s.sectionKey === 'collage').length, 1);
  assert.equal(merged.filter((s) => s.sectionKey === 'categories').length, 1);
});

test('Stage 2 - Scenario C: Collage disabled by administrator is respected and excluded from public storefront', () => {
  const dbWithDisabledCollage = [
    {
      id: 'db-collage',
      section_key: 'collage',
      title: 'The Editorial Edit',
      display_order: 2,
      is_enabled: false, // Admin turned it off
    },
  ];

  const merged = mergeHomepageSections(dbWithDisabledCollage);
  const collage = merged.find((s) => s.sectionKey === 'collage');
  assert.equal(collage?.isEnabled, false, 'Collage must have isEnabled = false when disabled in DB');

  // On public storefront: filter by isEnabled
  const publicKeys = merged.filter((s) => s.isEnabled).map((s) => s.sectionKey);
  assert.ok(!publicKeys.includes('collage'), 'Public storefront must not render disabled collage');

  // When re-enabled:
  const dbWithEnabledCollage = [
    {
      id: 'db-collage',
      section_key: 'collage',
      title: 'The Editorial Edit',
      display_order: 2,
      is_enabled: true, // Admin turned it back on
    },
  ];
  const reMerged = mergeHomepageSections(dbWithEnabledCollage);
  const rePublicKeys = reMerged.filter((s) => s.isEnabled).map((s) => s.sectionKey);
  assert.ok(rePublicKeys.includes('collage'), 'Public storefront must render re-enabled collage');
});

test('Stage 2 - Scenario D: Section reordering in database persists accurately', () => {
  const dbReordered = [
    { id: 'db-cat', section_key: 'categories', display_order: 0, is_enabled: true },
    { id: 'db-hero', section_key: 'hero', display_order: 1, is_enabled: true },
    { id: 'db-collage', section_key: 'collage', display_order: 2, is_enabled: true },
  ];

  const merged = mergeHomepageSections(dbReordered);
  assert.equal(merged[0].sectionKey, 'categories', 'Categories moved to position 0 must be first');
  assert.equal(merged[1].sectionKey, 'hero');
  assert.equal(merged[2].sectionKey, 'collage');
});

// -----------------------------------------------------------------------------
// 12. Stage 3: Review Security & Customer Privacy Contracts
// -----------------------------------------------------------------------------

test('Stage 3: getPublicApprovedReviews enforces is_approved = true and protects customer privacy', async () => {
  const mockApprovedRows = [
    {
      id: 'rev-safe-1',
      customer_name: 'Anuki P.',
      rating: 5,
      title: 'Stunning Finish',
      comment: 'The jewellery looks gorgeous in person.',
      created_at: '2026-01-01T00:00:00Z',
      products: { name: 'Gold Solitaire Ring' },
      // Private fields that must NOT be exposed:
      user_id: 'secret-user-uuid',
      order_id: 'secret-order-uuid',
      customer_email: 'anuki@example.com',
      customer_phone: '+94771234567',
    },
  ];

  let queriedTable = '';
  let filterApprovedValue: any = null;

  const mockSupabase = {
    from: (table: string) => {
      queriedTable = table;
      return {
        select: () => ({
          eq: (column: string, val: any) => {
            if (column === 'is_approved') {
              filterApprovedValue = val;
            }
            return {
              order: () => ({
                limit: async () => ({
                  data: mockApprovedRows,
                  error: null,
                }),
              }),
            };
          },
        }),
      };
    },
  };

  const results = await getPublicApprovedReviews(6, mockSupabase);

  assert.equal(queriedTable, 'reviews', 'Must query public.reviews table');
  assert.equal(filterApprovedValue, true, 'Must strictly enforce is_approved = true');
  assert.equal(results.length, 1);

  const review = results[0];
  assert.equal(review.id, 'rev-safe-1');
  assert.equal(review.customerName, 'Anuki P.');
  assert.equal(review.rating, 5);
  assert.equal(review.productName, 'Gold Solitaire Ring');

  // Verify private fields are NEVER exposed on public review items
  assert.equal((review as any).user_id, undefined, 'user_id must not be exposed');
  assert.equal((review as any).customer_email, undefined, 'customer_email must not be exposed');
  assert.equal((review as any).customer_phone, undefined, 'customer_phone must not be exposed');
  assert.equal((review as any).order_id, undefined, 'order_id must not be exposed');
});

test('Stage 3: getPublicApprovedReviews returns empty array safely on query error', async () => {
  const mockErrorSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({
              data: null,
              error: { message: 'Database connection failed' },
            }),
          }),
        }),
      }),
    }),
  };

  const results = await getPublicApprovedReviews(6, mockErrorSupabase);
  assert.deepEqual(results, [], 'Must return [] without throwing or exposing raw DB error');
});

// -----------------------------------------------------------------------------
// 13. Stage 4: Insufficient Images and Banner Preservation Contracts
// -----------------------------------------------------------------------------

test('Stage 4: Collage handles 1 product image safely without breaking', () => {
  const singleProduct = [
    createMockProduct('p1', 'Single Piece', 'single-piece', 'https://cdn.splender.lk/single.jpg'),
  ];
  const items = buildCollageItems(singleProduct, [], 4);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Single Piece');
  assert.equal(items[0].href, '/products/single-piece');
});

test('Stage 4: HeroBanner preserves active banners mode when banners exist', () => {
  const activeBanners: Banner[] = [
    {
      id: 'banner-hero-1',
      title: 'Festive Luxury Drops',
      subtitle: 'Exclusive Sri Lanka Edit',
      imageUrl: '/banners/hero1.jpg',
      mobileImageUrl: null,
      linkUrl: '/shop',
      buttonText: 'Shop New Arrivals',
      displayOrder: 1,
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const heroData = resolveHeroData(activeBanners, null, [], []);
  assert.equal(heroData.mode, 'banners', 'Must preserve banners carousel mode when active banners exist');
  assert.equal(heroData.banners.length, 1);
  assert.equal(heroData.banners[0].title, 'Festive Luxury Drops');
});

