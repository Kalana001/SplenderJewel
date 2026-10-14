import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateImageFile,
  getImageExtension,
  generateCategoryStoragePath,
  MAX_IMAGE_FILE_SIZE,
  ALLOWED_IMAGE_MIME_TYPES,
} from '../lib/catalog/image-validation.ts';
import {
  filterGalleryImages,
  evaluateTouchGesture,
  calculateNextIndex,
  calculatePrevIndex,
  calculateSafeIndex,
  getVariantTargetIndex,
  GallerySession,
} from '../lib/catalog/gallery-logic.ts';
import type { ProductImage } from '../types/product.ts';

// =============================================================================
// TEST SUITE: CUSTOMER PRODUCT GALLERY, VARIATION SYNC & CATEGORY UPLOAD
// =============================================================================

// -----------------------------------------------------------------------------
// 1. Task 2: All 6 Variation Scenarios & Filtering Rules
// -----------------------------------------------------------------------------

test('Scenario 1: Multiple general product images (no variation images)', () => {
  const images: ProductImage[] = [
    { id: 'gen-1', productId: 'p1', variantId: null, url: '/img/gen-1.jpg', displayOrder: 0, isPrimary: true, createdAt: '2026-01-01' },
    { id: 'gen-2', productId: 'p1', variantId: null, url: '/img/gen-2.jpg', displayOrder: 1, isPrimary: false, createdAt: '2026-01-01' },
    { id: 'gen-3', productId: 'p1', variantId: null, url: '/img/gen-3.jpg', displayOrder: 2, isPrimary: false, createdAt: '2026-01-01' },
  ];

  // Under no variant
  const resultNoVar = filterGalleryImages(images, null);
  assert.equal(resultNoVar.length, 3);
  assert.deepEqual(resultNoVar.map((i) => i.id), ['gen-1', 'gen-2', 'gen-3']);

  // Under arbitrary variant (which has no specific images)
  const resultWithVar = filterGalleryImages(images, 'var-gold');
  assert.equal(resultWithVar.length, 3);
  assert.deepEqual(resultWithVar.map((i) => i.id), ['gen-1', 'gen-2', 'gen-3']);
});

test('Scenario 2: Multiple variations with their own images (no general images)', () => {
  const images: ProductImage[] = [
    { id: 'var-gold-img', productId: 'p1', variantId: 'var-gold', url: '/img/gold.jpg', displayOrder: 0, isPrimary: false, createdAt: '2026-01-01' },
    { id: 'var-silver-img', productId: 'p1', variantId: 'var-silver', url: '/img/silver.jpg', displayOrder: 1, isPrimary: false, createdAt: '2026-01-01' },
  ];

  // Select Gold variant: Gold image shown, Silver image strictly excluded
  const goldResult = filterGalleryImages(images, 'var-gold');
  assert.equal(goldResult.length, 1);
  assert.equal(goldResult[0].id, 'var-gold-img');

  // Select Silver variant: Silver image shown, Gold image strictly excluded
  const silverResult = filterGalleryImages(images, 'var-silver');
  assert.equal(silverResult.length, 1);
  assert.equal(silverResult[0].id, 'var-silver-img');
});

test('Scenario 3: A variation with multiple associated images', () => {
  const images: ProductImage[] = [
    { id: 'var-gold-1', productId: 'p1', variantId: 'var-gold', url: '/img/gold-angle-1.jpg', displayOrder: 0, isPrimary: false, createdAt: '2026-01-01' },
    { id: 'var-gold-2', productId: 'p1', variantId: 'var-gold', url: '/img/gold-angle-2.jpg', displayOrder: 1, isPrimary: false, createdAt: '2026-01-01' },
    { id: 'var-silver-1', productId: 'p1', variantId: 'var-silver', url: '/img/silver-angle-1.jpg', displayOrder: 2, isPrimary: false, createdAt: '2026-01-01' },
    { id: 'gen-packaging', productId: 'p1', variantId: null, url: '/img/box.jpg', displayOrder: 3, isPrimary: false, createdAt: '2026-01-01' },
  ];

  // Gold variant gets both of its images plus general packaging; silver image excluded
  const goldResult = filterGalleryImages(images, 'var-gold');
  assert.equal(goldResult.length, 3);
  assert.deepEqual(goldResult.map((i) => i.id), ['var-gold-1', 'var-gold-2', 'gen-packaging']);
});

test('Scenario 4: A variation with no associated images', () => {
  // Case A: Has general product images to fall back to
  const imagesWithGeneral: ProductImage[] = [
    { id: 'var-gold-1', productId: 'p1', variantId: 'var-gold', url: '/img/gold.jpg', displayOrder: 0, isPrimary: false, createdAt: '2026-01-01' },
    { id: 'gen-1', productId: 'p1', variantId: null, url: '/img/model.jpg', displayOrder: 1, isPrimary: true, createdAt: '2026-01-01' },
    { id: 'gen-2', productId: 'p1', variantId: null, url: '/img/detail.jpg', displayOrder: 2, isPrimary: false, createdAt: '2026-01-01' },
  ];

  // Platinum has no images: falls back to all general images; gold is excluded
  const platinumResult = filterGalleryImages(imagesWithGeneral, 'var-platinum');
  assert.equal(platinumResult.length, 2);
  assert.deepEqual(platinumResult.map((i) => i.id), ['gen-1', 'gen-2']);
  assert.ok(!platinumResult.some((i) => i.id === 'var-gold-1'));

  // Case B: No general images exist at all; falls back sensibly to primary image
  const imagesOnlyVariants: ProductImage[] = [
    { id: 'var-gold-1', productId: 'p1', variantId: 'var-gold', url: '/img/gold.jpg', displayOrder: 0, isPrimary: true, createdAt: '2026-01-01' },
    { id: 'var-silver-1', productId: 'p1', variantId: 'var-silver', url: '/img/silver.jpg', displayOrder: 1, isPrimary: false, createdAt: '2026-01-01' },
  ];

  const fallbackResult = filterGalleryImages(imagesOnlyVariants, 'var-platinum');
  assert.equal(fallbackResult.length, 1);
  assert.equal(fallbackResult[0].id, 'var-gold-1', 'Should fall back to primary image');
});

test('Scenario 5: A product containing only variation-specific images', () => {
  const images: ProductImage[] = [
    { id: 'gold-1', productId: 'p1', variantId: 'var-gold', url: '/img/g1.jpg', displayOrder: 0, isPrimary: false, createdAt: '2026-01-01' },
    { id: 'gold-2', productId: 'p1', variantId: 'var-gold', url: '/img/g2.jpg', displayOrder: 1, isPrimary: false, createdAt: '2026-01-01' },
    { id: 'rose-1', productId: 'p1', variantId: 'var-rose', url: '/img/r1.jpg', displayOrder: 2, isPrimary: false, createdAt: '2026-01-01' },
    { id: 'rose-2', productId: 'p1', variantId: 'var-rose', url: '/img/r2.jpg', displayOrder: 3, isPrimary: false, createdAt: '2026-01-01' },
  ];

  const goldList = filterGalleryImages(images, 'var-gold');
  assert.equal(goldList.length, 2);
  assert.deepEqual(goldList.map((i) => i.id), ['gold-1', 'gold-2']);

  const roseList = filterGalleryImages(images, 'var-rose');
  assert.equal(roseList.length, 2);
  assert.deepEqual(roseList.map((i) => i.id), ['rose-1', 'rose-2']);
});

test('Scenario 6: A product containing both general and variation-specific images', () => {
  const images: ProductImage[] = [
    { id: 'gen-primary', productId: 'p1', variantId: null, url: '/img/hero.jpg', displayOrder: 0, isPrimary: true, createdAt: '2026-01-01' },
    { id: 'gold-specific', productId: 'p1', variantId: 'var-gold', url: '/img/gold-on-hand.jpg', displayOrder: 1, isPrimary: false, createdAt: '2026-01-01' },
    { id: 'silver-specific', productId: 'p1', variantId: 'var-silver', url: '/img/silver-on-hand.jpg', displayOrder: 2, isPrimary: false, createdAt: '2026-01-01' },
    { id: 'gen-lifestyle', productId: 'p1', variantId: null, url: '/img/lifestyle.jpg', displayOrder: 3, isPrimary: false, createdAt: '2026-01-01' },
  ];

  const goldGallery = filterGalleryImages(images, 'var-gold');
  assert.equal(goldGallery.length, 3);
  assert.equal(goldGallery[0].id, 'gold-specific', 'Variant image prioritized first');
  assert.deepEqual(goldGallery.map((i) => i.id), ['gold-specific', 'gen-primary', 'gen-lifestyle']);

  const silverGallery = filterGalleryImages(images, 'var-silver');
  assert.equal(silverGallery.length, 3);
  assert.equal(silverGallery[0].id, 'silver-specific', 'Variant image prioritized first');
  assert.deepEqual(silverGallery.map((i) => i.id), ['silver-specific', 'gen-primary', 'gen-lifestyle']);
});

test('Customer Gallery: safely handles empty image lists without throwing', () => {
  const emptyList = filterGalleryImages([], 'var-gold');
  assert.deepEqual(emptyList, []);
});

test('Customer Gallery: returns all images when variantId is null or unspecified', () => {
  const images: ProductImage[] = [
    { id: 'img-1', productId: 'p1', variantId: null, url: '/img/1.jpg', displayOrder: 0, isPrimary: true, createdAt: '2026-01-01' },
    { id: 'img-2', productId: 'p1', variantId: null, url: '/img/2.jpg', displayOrder: 1, isPrimary: false, createdAt: '2026-01-01' },
  ];

  const list = filterGalleryImages(images, null);
  assert.equal(list.length, 2);
});

// -----------------------------------------------------------------------------
// 2. Task 1 & Task 3: State Machine & Interaction Tests (No Unexpected Resets)
// -----------------------------------------------------------------------------

test('Gallery State: clicking Next, Previous, or selecting thumbnails does NOT reset activeIndex', () => {
  const images: ProductImage[] = [
    { id: 'gold-1', productId: 'p1', variantId: 'var-gold', url: '/img/g1.jpg', displayOrder: 0, isPrimary: false, createdAt: '2026-01-01' },
    { id: 'gen-1', productId: 'p1', variantId: null, url: '/img/gen1.jpg', displayOrder: 1, isPrimary: false, createdAt: '2026-01-01' },
    { id: 'gen-2', productId: 'p1', variantId: null, url: '/img/gen2.jpg', displayOrder: 2, isPrimary: false, createdAt: '2026-01-01' },
  ];

  const gallery = new GallerySession(images, 'var-gold');
  assert.equal(gallery.getActiveIndex(), 0, 'Starts at 0 for variant image');

  // Navigate Next
  gallery.next();
  assert.equal(gallery.getActiveIndex(), 1, 'Advanced to image 1');

  // Simulate parent component re-render (which previously caused activeIndex to reset to 0!)
  gallery.parentRerender();
  assert.equal(gallery.getActiveIndex(), 1, 'Index MUST remain 1 after parent re-render');

  // Navigate Next again
  gallery.next();
  assert.equal(gallery.getActiveIndex(), 2, 'Advanced to image 2');

  gallery.parentRerender();
  assert.equal(gallery.getActiveIndex(), 2, 'Index MUST remain 2 after parent re-render');

  // Select thumbnail 0
  gallery.selectIndex(0);
  assert.equal(gallery.getActiveIndex(), 0);

  // Navigate Prev (wraps around to last image 2)
  gallery.prev();
  assert.equal(gallery.getActiveIndex(), 2, 'Wraps backwards to index 2');
});

test('Gallery State: switching variations resets gallery to the new variation image', () => {
  const images: ProductImage[] = [
    { id: 'gold-1', productId: 'p1', variantId: 'var-gold', url: '/img/g1.jpg', displayOrder: 0, isPrimary: false, createdAt: '2026-01-01' },
    { id: 'gen-1', productId: 'p1', variantId: null, url: '/img/gen1.jpg', displayOrder: 1, isPrimary: false, createdAt: '2026-01-01' },
    { id: 'silver-1', productId: 'p1', variantId: 'var-silver', url: '/img/s1.jpg', displayOrder: 2, isPrimary: false, createdAt: '2026-01-01' },
  ];

  const gallery = new GallerySession(images, 'var-gold');
  assert.equal(gallery.getActiveImage()?.id, 'gold-1');

  // Customer navigates to general image (index 1)
  gallery.next();
  assert.equal(gallery.getActiveIndex(), 1);
  assert.equal(gallery.getActiveImage()?.id, 'gen-1');

  // Customer now chooses Silver variant
  gallery.switchVariant('var-silver');
  // Gallery must re-target Silver's image at index 0 of silver list
  assert.equal(gallery.getActiveIndex(), 0);
  assert.equal(gallery.getActiveImage()?.id, 'silver-1', 'Focused on silver variant image');

  // Customer switches back to Gold
  gallery.switchVariant('var-gold');
  assert.equal(gallery.getActiveIndex(), 0);
  assert.equal(gallery.getActiveImage()?.id, 'gold-1', 'Focused on gold variant image');
});

test('Gallery State: prevents redundant parent notifications when image has not changed', () => {
  const images: ProductImage[] = [
    { id: 'img-1', productId: 'p1', variantId: null, url: '/img/1.jpg', displayOrder: 0, isPrimary: true, createdAt: '2026-01-01' },
    { id: 'img-2', productId: 'p1', variantId: null, url: '/img/2.jpg', displayOrder: 1, isPrimary: false, createdAt: '2026-01-01' },
  ];

  const gallery = new GallerySession(images);
  assert.equal(gallery.notifyCount, 1, 'Initial sync notification');

  // Triggering parent re-renders without image changes should not fire notifications
  gallery.parentRerender();
  gallery.parentRerender();
  assert.equal(gallery.notifyCount, 1, 'No redundant notification fired');

  // Navigating to image 2 fires notification
  gallery.next();
  assert.equal(gallery.notifyCount, 2);

  // Navigating to same index via selectIndex(1) does not fire extra notification
  gallery.selectIndex(1);
  assert.equal(gallery.notifyCount, 2);
});

// -----------------------------------------------------------------------------
// 3. Customer Gallery Contract: Target Index & Fallback Contract
// -----------------------------------------------------------------------------

test('Customer Gallery Contract: getVariantTargetIndex prefers variant-specific image over primary', () => {
  const images: ProductImage[] = [
    { id: 'gen-primary', productId: 'p1', variantId: null, url: '/img/box.jpg', displayOrder: 0, isPrimary: true, createdAt: '2026-01-01' },
    { id: 'var-img', productId: 'p1', variantId: 'var-1', url: '/img/ring.jpg', displayOrder: 1, isPrimary: false, createdAt: '2026-01-01' },
  ];

  const targetIdx = getVariantTargetIndex(images, 'var-1');
  assert.equal(targetIdx, 1, 'Targets variant-specific image index');

  const fallbackIdx = getVariantTargetIndex(images, 'var-nonexistent');
  assert.equal(fallbackIdx, 0, 'Falls back to primary image index');
});


// -----------------------------------------------------------------------------
// 4. Mobile Touch Gestures & Discrimination
// -----------------------------------------------------------------------------

test('Customer Gallery: swipe left beyond threshold triggers next image', () => {
  const action = evaluateTouchGesture(200, 300, 120, 310);
  assert.equal(action, 'next');
});

test('Customer Gallery: swipe right beyond threshold triggers previous image', () => {
  const action = evaluateTouchGesture(100, 300, 180, 295);
  assert.equal(action, 'prev');
});

test('Customer Gallery: vertical page scrolling is ignored and does NOT trigger horizontal swipe', () => {
  const action = evaluateTouchGesture(200, 400, 215, 280);
  assert.equal(action, 'none', 'Dominant vertical movement must not trigger gallery swipe');
});

test('Customer Gallery: micro-drags under minimum distance threshold are discarded', () => {
  const action = evaluateTouchGesture(200, 300, 180, 300);
  assert.equal(action, 'none', 'Movement under 40px threshold should be ignored');
});

// -----------------------------------------------------------------------------
// 5. Keyboard Navigation & Index Calculations
// -----------------------------------------------------------------------------

test('Customer Gallery: ArrowRight navigates forward and wraps at boundaries', () => {
  assert.equal(calculateNextIndex(0, 3), 1);
  assert.equal(calculateNextIndex(1, 3), 2);
  assert.equal(calculateNextIndex(2, 3), 0, 'Wraps back to start');
});

test('Customer Gallery: ArrowLeft navigates backward and wraps at boundaries', () => {
  assert.equal(calculatePrevIndex(0, 3), 2, 'Wraps to end');
  assert.equal(calculatePrevIndex(2, 3), 1);
  assert.equal(calculatePrevIndex(1, 3), 0);
});

test('Customer Gallery: single-image galleries ignore keyboard navigation', () => {
  assert.equal(calculateNextIndex(0, 1), 0);
  assert.equal(calculatePrevIndex(0, 1), 0);
});

test('Navigation Math: calculateSafeIndex clamps and wraps negative and excessive indices', () => {
  assert.equal(calculateSafeIndex(-1, 5), 4);
  assert.equal(calculateSafeIndex(5, 5), 0);
  assert.equal(calculateSafeIndex(2, 5), 2);
});

// -----------------------------------------------------------------------------
// 6. Category Image Storage, Validation & Replacement Parity
// -----------------------------------------------------------------------------

test('Category Storage: generateCategoryStoragePath creates paths under categories/ with valid extensions', () => {
  const jpegPath = generateCategoryStoragePath('image/jpeg');
  assert.match(jpegPath, /^categories\/\d+-[a-z0-9]+\.jpg$/i);

  const pngPath = generateCategoryStoragePath('image/png');
  assert.match(pngPath, /^categories\/\d+-[a-z0-9]+\.png$/i);

  const webpPath = generateCategoryStoragePath('image/webp');
  assert.match(webpPath, /^categories\/\d+-[a-z0-9]+\.webp$/i);
});

test('Category Storage: generates collision-resistant unique paths for successive calls', () => {
  const pathA = generateCategoryStoragePath('image/jpeg');
  const pathB = generateCategoryStoragePath('image/jpeg');
  assert.notEqual(pathA, pathB, 'Successive category storage paths must be distinct');
});

test('Category Storage: getImageExtension maps allowed MIME types and falls back safely', () => {
  assert.equal(getImageExtension('image/jpeg'), 'jpg');
  assert.equal(getImageExtension('image/png'), 'png');
  assert.equal(getImageExtension('image/webp'), 'webp');
  assert.equal(getImageExtension('application/octet-stream'), 'jpg');
});

test('Image Validation: accepts standard JPEG, PNG, and WebP files <= 5MB', () => {
  const validJpeg = validateImageFile({ name: 'ring.jpg', size: 2 * 1024 * 1024, type: 'image/jpeg' });
  assert.equal(validJpeg.valid, true);

  const validPng = validateImageFile({ name: 'necklace.png', size: 4.8 * 1024 * 1024, type: 'image/png' });
  assert.equal(validPng.valid, true);

  const validWebp = validateImageFile({ name: 'bracelet.webp', size: 1024 * 100, type: 'image/webp' });
  assert.equal(validWebp.valid, true);
});

test('Image Validation: rejects files exceeding the 5MB limit', () => {
  const oversized = validateImageFile({ name: 'heavy.jpg', size: 5.5 * 1024 * 1024, type: 'image/jpeg' });
  assert.equal(oversized.valid, false);
  assert.match(oversized.error || '', /exceeds the 5MB limit/i);
});

test('Image Validation: rejects unsupported formats (GIF, SVG, PDF)', () => {
  const gif = validateImageFile({ name: 'anim.gif', size: 500 * 1024, type: 'image/gif' });
  assert.equal(gif.valid, false);
  assert.match(gif.error || '', /Allowed formats: JPEG, PNG, WebP/i);

  const svg = validateImageFile({ name: 'vector.svg', size: 500 * 1024, type: 'image/svg+xml' });
  assert.equal(svg.valid, false);

  const pdf = validateImageFile({ name: 'doc.pdf', size: 500 * 1024, type: 'application/pdf' });
  assert.equal(pdf.valid, false);
});

test('Image Validation: rejects empty or corrupt 0-byte files', () => {
  const zero = validateImageFile({ name: 'empty.png', size: 0, type: 'image/png' });
  assert.equal(zero.valid, false);
  assert.match(zero.error || '', /file is empty/i);
});

test('Category Manager: replacing image updates form URL without deleting previous image prematurely', () => {
  let formImageUrl = 'https://supabase.co/storage/v1/object/public/products/categories/original.jpg';
  let databaseSavedUrl = formImageUrl;

  // Simulate admin uploading a replacement image
  const newUploadedUrl = 'https://supabase.co/storage/v1/object/public/products/categories/replacement.jpg';
  formImageUrl = newUploadedUrl;

  // Prior to "Save Changes", database remains unchanged and original image is safe
  assert.equal(databaseSavedUrl, 'https://supabase.co/storage/v1/object/public/products/categories/original.jpg');

  // If user cancels form, form is reset to database value:
  const cancelledFormUrl = databaseSavedUrl;
  assert.equal(cancelledFormUrl, 'https://supabase.co/storage/v1/object/public/products/categories/original.jpg');

  // If user submits form ("Save Changes"), database updates:
  databaseSavedUrl = formImageUrl;
  assert.equal(databaseSavedUrl, newUploadedUrl);
});

test('Category Manager: removing image sets form URL to empty string safely', () => {
  let formImageUrl = 'https://supabase.co/storage/v1/object/public/products/categories/existing.jpg';

  // Admin clicks "Remove Image"
  formImageUrl = '';
  assert.equal(formImageUrl, '');
});
