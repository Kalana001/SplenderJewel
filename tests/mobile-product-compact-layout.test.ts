import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { ProductPublic, ProductVariantPublic, ProductImage } from '../types/product.ts';
import { filterGalleryImages } from '../lib/catalog/gallery-logic.ts';
import { getThumbnailImageUrl, getMasterImageUrl } from '../lib/catalog/image-loader.ts';

describe('Mobile Product Detail Page: Compact Layout & UX Improvements', () => {
  const viewerPath = path.join(process.cwd(), 'components/store/product-detail-viewer.tsx');
  const galleryPath = path.join(process.cwd(), 'components/store/product-image-gallery.tsx');
  const viewerSrc = fs.readFileSync(viewerPath, 'utf-8');
  const gallerySrc = fs.readFileSync(galleryPath, 'utf-8');

  // Mock multi-variation product (like Boho Trendy Chunky Bracelet Set)
  const mockImages: ProductImage[] = [
    {
      id: 'img-cover',
      productId: 'prod-bracelet-1',
      variantId: null,
      url: 'https://wztwulijwsgjjrabvtek.supabase.co/storage/v1/object/public/products/catalog/bracelet-cover.webp',
      altText: 'Boho Trendy Chunky Bracelet Set Cover',
      displayOrder: 0,
      isPrimary: true,
      createdAt: '',
    },
    {
      id: 'img-gold',
      productId: 'prod-bracelet-1',
      variantId: 'var-gold',
      url: 'https://wztwulijwsgjjrabvtek.supabase.co/storage/v1/object/public/products/catalog/bracelet-gold.webp',
      altText: 'Gold Chunky Bracelet',
      displayOrder: 1,
      isPrimary: false,
      createdAt: '',
    },
    {
      id: 'img-silver',
      productId: 'prod-bracelet-1',
      variantId: 'var-silver',
      url: 'https://wztwulijwsgjjrabvtek.supabase.co/storage/v1/object/public/products/catalog/bracelet-silver.webp',
      altText: 'Silver Chunky Bracelet',
      displayOrder: 2,
      isPrimary: false,
      createdAt: '',
    },
  ];

  const mockVariants: ProductVariantPublic[] = [
    {
      id: 'var-gold',
      productId: 'prod-bracelet-1',
      sku: 'SJ-BOHO-GOLD',
      title: 'Gold Set',
      attributes: { color: 'Gold' },
      price: 1850,
      discountPrice: 1650,
      stockStatus: 'in_stock',
      stockQuantity: 10,
      isActive: true,
      images: [],
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'var-silver',
      productId: 'prod-bracelet-1',
      sku: 'SJ-BOHO-SILVER',
      title: 'Silver Set',
      attributes: { color: 'Silver' },
      price: 1850,
      discountPrice: null,
      stockStatus: 'in_stock',
      stockQuantity: 5,
      isActive: true,
      images: [],
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'var-rose',
      productId: 'prod-bracelet-1',
      sku: 'SJ-BOHO-ROSE',
      title: 'Rose Gold Set (No Image)',
      attributes: { color: 'Rose Gold' },
      price: 1950,
      discountPrice: null,
      stockStatus: 'out_of_stock',
      stockQuantity: 0,
      isActive: true,
      images: [],
      createdAt: '',
      updatedAt: '',
    },
  ];

  it('Requirement 1: Compact Title typography on mobile with preserved desktop font', () => {
    // Mobile title ~20-22px (text-[21px]), desktop preserved (lg:text-3xl)
    assert.match(
      viewerSrc,
      /text-\[21px\] sm:text-2xl lg:text-3xl font-serif text-white/,
      'Title must use 21px font size on mobile and 3xl on desktop'
    );
    // Reduced margin above title
    assert.match(
      viewerSrc,
      /mb-1 sm:mb-2/,
      'Title container must use reduced top margin on mobile'
    );
  });

  it('Requirement 2: Compact Price and Stock section with side-by-side layout', () => {
    // Compact mobile padding (py-2.5 px-3)
    assert.match(
      viewerSrc,
      /py-2\.5 px-3 sm:p-4 bg-luxury-card border border-luxury-border rounded-sm flex items-center justify-between/,
      'Price container must use compact mobile padding while keeping side-by-side flex layout'
    );
    // Compact stock indicator badges
    assert.match(
      viewerSrc,
      /px-2 py-0\.5 sm:px-2\.5 sm:py-1 rounded/,
      'Stock indicator badge must be compact on mobile'
    );
  });

  it('Requirement 3: Reordered mobile content hierarchy (Reviews and SKU relocated)', () => {
    // Desktop reviews summary is hidden on mobile
    assert.match(
      viewerSrc,
      /hidden lg:inline-flex items-center gap-1\.5 mt-2 text-xs/,
      'Header reviews summary must be hidden on mobile'
    );
    // Mobile reviews summary is positioned below purchasing controls
    assert.match(
      viewerSrc,
      /<div className="lg:hidden pt-2 border-t border-luxury-border\/40">\s*\{reviewsSummary &&/,
      'Mobile reviews summary must be placed below main purchasing controls'
    );
    // Desktop SKU is hidden on mobile header (lives in lower details on mobile)
    assert.match(
      viewerSrc,
      /hidden lg:flex items-center gap-3 text-xs font-mono text-neutral-400 mt-2/,
      'Header SKU display must be hidden on mobile to eliminate clutter above price'
    );
  });

  it('Requirement 4: Gallery mobile thumbnail dimensions and touch targets', () => {
    // Mobile thumbnails reduced to 56px (w-14) with minimum 44px touch targets
    assert.match(
      gallerySrc,
      /w-14 sm:w-16 md:w-20 rounded-sm overflow-hidden border-2 transition-all shrink-0 min-h-\[44px\] min-w-\[44px\]/,
      'Thumbnails must use w-14 (56px) on mobile with min 44px touch area, scaling to 80px on desktop'
    );
    // Mobile gap reduced to gap-2
    assert.match(
      gallerySrc,
      /flex gap-2 sm:gap-2\.5 md:gap-3 overflow-x-auto/,
      'Thumbnails container must use compact gap-2 on mobile'
    );
  });

  it('Requirement 5: Variation comparison with inline button thumbnails and mobile preview card', () => {
    // Each variation button displays a mini thumbnail if image exists
    assert.match(
      viewerSrc,
      /product\.images\.find\(\(img\) => img\.variantId === variant\.id\)/,
      'Variant buttons must query matching image for visual preview'
    );
    assert.match(
      viewerSrc,
      /src=\{getThumbnailImageUrl\(variantImg\.url\)\}/,
      'Variant button thumbnail must use getThumbnailImageUrl'
    );

    // Selected variation displays compact mobile preview card
    assert.match(
      viewerSrc,
      /selectedVariant && selectedVariantImage && \(/,
      'Compact variation preview card renders only when variant and variant image exist'
    );
    assert.match(
      viewerSrc,
      /className="lg:hidden flex items-center gap-2\.5 p-2 bg-neutral-900\/90 border border-luxury-gold\/40/,
      'Mobile preview card must be hidden on desktop and styled in luxury theme'
    );

    // Test preview lookup logic with mocks
    const selectedVarWithImage = mockVariants[0]; // Gold has img-gold
    const foundImgWithImage = mockImages.find((img) => img.variantId === selectedVarWithImage.id);
    assert.ok(foundImgWithImage, 'Gold variant must have an associated image');
    assert.equal(getThumbnailImageUrl(foundImgWithImage?.url), 'https://wztwulijwsgjjrabvtek.supabase.co/storage/v1/object/public/products/catalog/bracelet-gold-thumb.webp');

    const selectedVarNoImage = mockVariants[2]; // Rose has no image
    const foundImgNoImage = mockImages.find((img) => img.variantId === selectedVarNoImage.id);
    assert.equal(foundImgNoImage, undefined, 'Rose variant must not have an associated image');
  });

  it('Requirement 6: Invariant preservation (unselected initial state, cover priority, add-to-bag guard)', () => {
    // Multi-variation product starts unselected
    assert.match(
      viewerSrc,
      /hasSelectableVariants \? null : product\.variants\[0\] \|\| null/,
      'Multi-variation products must start unselected'
    );

    // Initial gallery starts with primary cover image
    assert.match(
      gallerySrc,
      /const primaryIdx = images\.findIndex\(\(img\) => img\.isPrimary\);/,
      'Gallery must initially display the primary cover image'
    );

    // Add to Bag blocks unselected multi-variation purchase
    assert.match(
      viewerSrc,
      /if \(!selectedVariant\) \{\s*setStockError\('Please select a variation first\.'\);/,
      'handleAddToBag must guard against unselected variants'
    );

    // Buy Now blocks unselected multi-variation purchase
    assert.match(
      viewerSrc,
      /if \(!selectedVariant\) \{\s*setStockError\('Please select a variation first\.'\);/,
      'handleBuyNow must guard against unselected variants'
    );
  });

  it('Requirement 7: Responsive touch target verification (>= 40-44px)', () => {
    // Variation buttons: min-h-[40px] touch-manipulation
    assert.match(
      viewerSrc,
      /min-h-\[40px\] touch-manipulation/,
      'Variation buttons must provide >= 40px touch area'
    );

    // Purchasing action buttons: h-11 (44px) on mobile
    assert.match(
      viewerSrc,
      /h-11 sm:h-12 min-h-\[44px\]/,
      'Add to Bag and Buy Now must provide >= 44px touch target on mobile'
    );

    // Quantity selector: h-11 (44px) on mobile
    assert.match(
      viewerSrc,
      /h-11 sm:h-12 px-2 shrink-0/,
      'Quantity selector container must provide 44px touch height on mobile'
    );

    // Gallery arrows & controls
    assert.match(
      gallerySrc,
      /min-h-\[40px\] min-w-\[40px\]/,
      'Gallery navigation arrows must provide >= 40px touch area'
    );
  });
});
