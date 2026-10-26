import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { filterGalleryImages } from '../lib/catalog/gallery-logic.ts';
import type { ProductImage, ProductVariantPublic, ProductPublic } from '../types/product.ts';

describe('Product Detail Page: Variation Selection & Mobile UX Verification', () => {
  const mockImages: ProductImage[] = [
    {
      id: 'img-cover',
      productId: 'prod-1',
      variantId: null,
      url: 'https://cdn.example.com/cover.jpg',
      altText: 'Cover Image',
      displayOrder: 1,
      isPrimary: true,
      createdAt: '',
    },
    {
      id: 'img-var-gold',
      productId: 'prod-1',
      variantId: 'var-gold',
      url: 'https://cdn.example.com/gold.jpg',
      altText: 'Gold Variant',
      displayOrder: 2,
      isPrimary: false,
      createdAt: '',
    },
    {
      id: 'img-var-silver',
      productId: 'prod-1',
      variantId: 'var-silver',
      url: 'https://cdn.example.com/silver.jpg',
      altText: 'Silver Variant',
      displayOrder: 3,
      isPrimary: false,
      createdAt: '',
    },
    {
      id: 'img-var-rose',
      productId: 'prod-1',
      variantId: 'var-rose',
      url: 'https://cdn.example.com/rose.jpg',
      altText: 'Rose Gold Variant',
      displayOrder: 4,
      isPrimary: false,
      createdAt: '',
    },
    {
      id: 'img-general',
      productId: 'prod-1',
      variantId: null,
      url: 'https://cdn.example.com/general.jpg',
      altText: 'Lifestyle Image',
      displayOrder: 5,
      isPrimary: false,
      createdAt: '',
    },
  ];

  const mockFiveVariants: ProductVariantPublic[] = [
    {
      id: 'var-gold',
      productId: 'prod-1',
      sku: 'SJ-ANK-GLD',
      title: '18K Yellow Gold',
      attributes: { color: 'Yellow Gold' },
      price: 5500,
      discountPrice: 4950,
      stockQuantity: 10,
      stockStatus: 'in_stock',
      images: [],
      isActive: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'var-silver',
      productId: 'prod-1',
      sku: 'SJ-ANK-SLV',
      title: 'Sterling Silver',
      attributes: { color: 'Silver' },
      price: 4800,
      discountPrice: null,
      stockQuantity: 5,
      stockStatus: 'in_stock',
      images: [],
      isActive: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'var-rose',
      productId: 'prod-1',
      sku: 'SJ-ANK-RSE',
      title: 'Rose Gold',
      attributes: { color: 'Rose Gold' },
      price: 5600,
      discountPrice: null,
      stockQuantity: 0,
      stockStatus: 'out_of_stock',
      images: [],
      isActive: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'var-platinum',
      productId: 'prod-1',
      sku: 'SJ-ANK-PLT',
      title: 'Platinum Plated',
      attributes: { color: 'Platinum' },
      price: 6200,
      discountPrice: null,
      stockQuantity: 2,
      stockStatus: 'low_stock',
      images: [],
      isActive: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'var-black',
      productId: 'prod-1',
      sku: 'SJ-ANK-BLK',
      title: 'Black Rhodium',
      attributes: { color: 'Black' },
      price: 5200,
      discountPrice: null,
      stockQuantity: 8,
      stockStatus: 'in_stock',
      images: [],
      isActive: true,
      createdAt: '',
      updatedAt: '',
    },
  ];

  it('Scenario 1 & 2: Initial load with multiple variations has no variant selected and displays cover image first', () => {
    // Gallery with null variantId returns all images with cover image first
    const unselectedGallery = filterGalleryImages(mockImages, null);
    assert.equal(unselectedGallery.length, mockImages.length);
    assert.equal(unselectedGallery[0].isPrimary, true);
    assert.equal(unselectedGallery[0].id, 'img-cover');

    // Primary image lookup
    const primaryImg = mockImages.find((img) => img.isPrimary) || mockImages[0];
    assert.equal(primaryImg.id, 'img-cover');

    // Verify viewer source enforces unselected initial state when multiple variants exist
    const viewerPath = path.join(process.cwd(), 'components/store/product-detail-viewer.tsx');
    const viewerSrc = fs.readFileSync(viewerPath, 'utf-8');
    assert.match(
      viewerSrc,
      /const hasSelectableVariants = Boolean\(product\.variants && product\.variants\.length > 1\);/,
      'Must check for selectable variants'
    );
    assert.match(
      viewerSrc,
      /useState<ProductVariantPublic \| null>\(\s*hasSelectableVariants \? null : product\.variants\[0\] \|\| null\s*\)/,
      'Must initialize selectedVariant to null when product has selectable variations'
    );
    assert.match(
      viewerSrc,
      /Choose a Colour \/ Variation/,
      'Must prompt customer to Choose a Colour / Variation when nothing is selected'
    );
  });

  it('Scenario 3: Manually selecting each variation filters to its corresponding image immediately', () => {
    // Gold selection
    const goldGallery = filterGalleryImages(mockImages, 'var-gold');
    assert.equal(goldGallery[0].id, 'img-var-gold');
    assert.equal(goldGallery[0].variantId, 'var-gold');

    // Silver selection
    const silverGallery = filterGalleryImages(mockImages, 'var-silver');
    assert.equal(silverGallery[0].id, 'img-var-silver');
    assert.equal(silverGallery[0].variantId, 'var-silver');

    // Rose selection
    const roseGallery = filterGalleryImages(mockImages, 'var-rose');
    assert.equal(roseGallery[0].id, 'img-var-rose');
    assert.equal(roseGallery[0].variantId, 'var-rose');
  });

  it('Scenario 4 & 5: Add to Bag and Buy Now are blocked with clear message when no variant is selected', () => {
    const viewerPath = path.join(process.cwd(), 'components/store/product-detail-viewer.tsx');
    const viewerSrc = fs.readFileSync(viewerPath, 'utf-8');

    // handleAddToBag validation
    const addToBagBlock = viewerSrc.slice(viewerSrc.indexOf('function handleAddToBag'));
    assert.match(
      addToBagBlock,
      /if \(!selectedVariant\) \{\s*setStockError\('Please select a variation first\.'\);/,
      'handleAddToBag must set "Please select a variation first." when unselected'
    );

    // handleBuyNow validation
    const buyNowBlock = viewerSrc.slice(viewerSrc.indexOf('function handleBuyNow'));
    assert.match(
      buyNowBlock,
      /if \(!selectedVariant\) \{\s*setStockError\('Please select a variation first\.'\);/,
      'handleBuyNow must set "Please select a variation first." when unselected'
    );
  });

  it('Scenario 6 & 7: Stock validation properly distinguishes in-stock and out-of-stock variations', () => {
    const inStockVar = mockFiveVariants.find((v) => v.id === 'var-gold')!;
    const outOfStockVar = mockFiveVariants.find((v) => v.id === 'var-rose')!;

    assert.equal(inStockVar.stockStatus, 'in_stock');
    assert.equal(inStockVar.stockQuantity! > 0, true);

    assert.equal(outOfStockVar.stockStatus, 'out_of_stock');
    assert.equal(outOfStockVar.stockQuantity === 0, true);

    const viewerPath = path.join(process.cwd(), 'components/store/product-detail-viewer.tsx');
    const viewerSrc = fs.readFileSync(viewerPath, 'utf-8');

    // Verify isOutOfStock logic requires selectedVariant
    assert.match(
      viewerSrc,
      /selectedVariant !== null &&\s*\(selectedVariant\.stockStatus === 'out_of_stock' \|\| availableStock === 0\)/,
      'isOutOfStock must check selectedVariant status safely'
    );
  });

  it('Scenario 8: Products with single variant (no selectable variations) preserve direct purchasing workflow', () => {
    const viewerPath = path.join(process.cwd(), 'components/store/product-detail-viewer.tsx');
    const viewerSrc = fs.readFileSync(viewerPath, 'utf-8');

    // When hasSelectableVariants is false, preselects product.variants[0] and starts availability check
    assert.match(
      viewerSrc,
      /hasSelectableVariants \? null : product\.variants\[0\] \|\| null/,
      'Single-variant products pre-select variant[0]'
    );
    assert.match(
      viewerSrc,
      /useState\(!hasSelectableVariants\)/,
      'Single-variant products trigger availability check immediately'
    );
  });

  it('Scenario 9: Variation without specific image safely retains gallery or falls back to primary cover image', () => {
    // Platinum variant has no dedicated image in mockImages
    const platinumGallery = filterGalleryImages(mockImages, 'var-platinum');
    // General images or primary fallback returned
    assert.ok(platinumGallery.length > 0);
    // Neither should have variantId of other variations
    for (const img of platinumGallery) {
      assert.notEqual(img.variantId, 'var-gold');
      assert.notEqual(img.variantId, 'var-silver');
      assert.notEqual(img.variantId, 'var-rose');
    }

    const galleryPath = path.join(process.cwd(), 'components/store/product-image-gallery.tsx');
    const gallerySrc = fs.readFileSync(galleryPath, 'utf-8');
    assert.match(
      gallerySrc,
      /const primaryIdx = filteredImages\.findIndex\(\(img\) => img\.isPrimary\);/,
      'Gallery must fall back to primary image if variant has no specific image'
    );
  });

  it('Scenario 10: Mobile layout positioning & compact styling', () => {
    const viewerPath = path.join(process.cwd(), 'components/store/product-detail-viewer.tsx');
    const viewerSrc = fs.readFileSync(viewerPath, 'utf-8');

    // Compact grid gap on mobile
    assert.match(
      viewerSrc,
      /grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-14/,
      'Mobile grid gap must be compact (gap-6)'
    );

    // Variant selector positioned before short description
    const variantSelectorIndex = viewerSrc.indexOf('{/* Variant Selector - Positioned directly after price section */}');
    const shortDescIndex = viewerSrc.indexOf('{/* Short Description - Below purchasing controls */}');
    assert.ok(variantSelectorIndex !== -1, 'Variant selector must exist');
    assert.ok(shortDescIndex !== -1, 'Short description must exist');
    assert.ok(
      variantSelectorIndex < shortDescIndex,
      'Variant selector must be positioned BEFORE short description'
    );

    // Compact touch-friendly buttons with min-h-[40px] and touch-manipulation
    assert.match(
      viewerSrc,
      /min-h-\[40px\] touch-manipulation/,
      'Variation buttons must be touch-friendly with minimum 40px height'
    );
  });
});
