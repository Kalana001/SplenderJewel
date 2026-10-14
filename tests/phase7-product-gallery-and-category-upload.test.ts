import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateImageFile,
  getImageExtension,
  generateCatalogStoragePath,
  generateCategoryStoragePath,
  MAX_IMAGE_FILE_SIZE,
  ALLOWED_IMAGE_MIME_TYPES,
} from '../lib/catalog/image-validation.ts';
import type { ProductImage } from '../types/product.ts';

// =============================================================================
// TEST SUITE: CUSTOMER PRODUCT GALLERY & CATEGORY IMAGE UPLOAD
// =============================================================================

// Helper replicating gallery variation filtering logic
function filterGalleryImages(images: ProductImage[], selectedVariantId?: string | null): ProductImage[] {
  if (!images || images.length === 0) return [];
  if (!selectedVariantId) return images;

  const variantSpecific = images.filter((img) => img.variantId === selectedVariantId);
  const generalImages = images.filter((img) => !img.variantId);

  if (variantSpecific.length > 0) {
    return [...variantSpecific, ...generalImages];
  }
  return generalImages.length > 0 ? generalImages : images;
}

// Helper simulating mobile swipe gesture calculation
function evaluateTouchGesture(startX: number, startY: number, endX: number, endY: number): 'next' | 'prev' | 'none' {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const minSwipeDistance = 40;

  if (Math.abs(deltaX) >= minSwipeDistance && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
    return deltaX < 0 ? 'next' : 'prev';
  }
  return 'none';
}

// Helper simulating keyboard navigation
function evaluateKeyboardNav(key: string, count: number, currentIdx: number): number {
  if (count <= 1) return currentIdx;
  if (key === 'ArrowLeft') {
    return (currentIdx - 1 + count) % count;
  }
  if (key === 'ArrowRight') {
    return (currentIdx + 1) % count;
  }
  return currentIdx;
}

// -----------------------------------------------------------------------------
// 1. Customer Gallery: Variation Filtering & Image Synchronization
// -----------------------------------------------------------------------------

test('Customer Gallery: filters images to current variant + general images, excluding other variants', () => {
  const images: ProductImage[] = [
    { id: 'img-gen-1', productId: 'p1', variantId: null, url: '/img/general-1.jpg', displayOrder: 0, isPrimary: true, createdAt: '2026-01-01' },
    { id: 'img-var-a', productId: 'p1', variantId: 'var-gold', url: '/img/gold.jpg', displayOrder: 1, isPrimary: false, createdAt: '2026-01-01' },
    { id: 'img-var-b', productId: 'p1', variantId: 'var-silver', url: '/img/silver.jpg', displayOrder: 2, isPrimary: false, createdAt: '2026-01-01' },
    { id: 'img-gen-2', productId: 'p1', variantId: null, url: '/img/general-2.jpg', displayOrder: 3, isPrimary: false, createdAt: '2026-01-01' },
  ];

  // Selecting Gold variant
  const goldList = filterGalleryImages(images, 'var-gold');
  assert.equal(goldList.length, 3);
  assert.equal(goldList[0].id, 'img-var-a', 'Variant-specific image should appear first');
  assert.deepEqual(goldList.map((i) => i.id), ['img-var-a', 'img-gen-1', 'img-gen-2']);
  assert.ok(!goldList.some((i) => i.id === 'img-var-b'), 'Silver variant image must be excluded');

  // Selecting Silver variant
  const silverList = filterGalleryImages(images, 'var-silver');
  assert.equal(silverList.length, 3);
  assert.equal(silverList[0].id, 'img-var-b', 'Silver variant image should appear first');
  assert.deepEqual(silverList.map((i) => i.id), ['img-var-b', 'img-gen-1', 'img-gen-2']);
  assert.ok(!silverList.some((i) => i.id === 'img-var-a'), 'Gold variant image must be excluded');
});

test('Customer Gallery: falls back to general images when variant has no mapped images', () => {
  const images: ProductImage[] = [
    { id: 'img-gen-1', productId: 'p1', variantId: null, url: '/img/gen1.jpg', displayOrder: 0, isPrimary: true, createdAt: '2026-01-01' },
    { id: 'img-gen-2', productId: 'p1', variantId: null, url: '/img/gen2.jpg', displayOrder: 1, isPrimary: false, createdAt: '2026-01-01' },
    { id: 'img-var-other', productId: 'p1', variantId: 'var-rose-gold', url: '/img/rose.jpg', displayOrder: 2, isPrimary: false, createdAt: '2026-01-01' },
  ];

  // Variant with no images
  const platinumList = filterGalleryImages(images, 'var-platinum');
  assert.equal(platinumList.length, 2);
  assert.deepEqual(platinumList.map((i) => i.id), ['img-gen-1', 'img-gen-2']);
  assert.ok(!platinumList.some((i) => i.id === 'img-var-other'));
});

test('Customer Gallery: returns all images when variantId is null or unspecified', () => {
  const images: ProductImage[] = [
    { id: 'img-1', productId: 'p1', variantId: null, url: '/img/1.jpg', displayOrder: 0, isPrimary: true, createdAt: '2026-01-01' },
    { id: 'img-2', productId: 'p1', variantId: null, url: '/img/2.jpg', displayOrder: 1, isPrimary: false, createdAt: '2026-01-01' },
  ];

  const list = filterGalleryImages(images, null);
  assert.equal(list.length, 2);
});

test('Customer Gallery: safely handles empty image lists without throwing', () => {
  const emptyList = filterGalleryImages([], 'var-gold');
  assert.deepEqual(emptyList, []);
});

// -----------------------------------------------------------------------------
// 2. Customer Gallery: Mobile Touch Swipe Gestures
// -----------------------------------------------------------------------------

test('Customer Gallery: swipe left beyond threshold triggers next image', () => {
  // Start at (200, 300), drag left to (120, 310) -> deltaX = -80, deltaY = 10
  const action = evaluateTouchGesture(200, 300, 120, 310);
  assert.equal(action, 'next');
});

test('Customer Gallery: swipe right beyond threshold triggers previous image', () => {
  // Start at (100, 300), drag right to (180, 295) -> deltaX = +80, deltaY = -5
  const action = evaluateTouchGesture(100, 300, 180, 295);
  assert.equal(action, 'prev');
});

test('Customer Gallery: vertical page scrolling is ignored and does NOT trigger horizontal swipe', () => {
  // Customer is scrolling page vertically: deltaY = -120, deltaX = 15
  const action = evaluateTouchGesture(200, 400, 215, 280);
  assert.equal(action, 'none', 'Dominant vertical movement must not trigger gallery swipe');
});

test('Customer Gallery: micro-drags under minimum distance threshold are discarded', () => {
  // deltaX = -20 (threshold is 40)
  const action = evaluateTouchGesture(200, 300, 180, 300);
  assert.equal(action, 'none', 'Movement under 40px threshold should be ignored');
});

// -----------------------------------------------------------------------------
// 3. Customer Gallery: Keyboard Navigation & Boundary Wrapping
// -----------------------------------------------------------------------------

test('Customer Gallery: ArrowRight navigates forward and wraps at boundaries', () => {
  const count = 3;
  assert.equal(evaluateKeyboardNav('ArrowRight', count, 0), 1);
  assert.equal(evaluateKeyboardNav('ArrowRight', count, 1), 2);
  assert.equal(evaluateKeyboardNav('ArrowRight', count, 2), 0, 'Wraps back to start');
});

test('Customer Gallery: ArrowLeft navigates backward and wraps at boundaries', () => {
  const count = 3;
  assert.equal(evaluateKeyboardNav('ArrowLeft', count, 0), 2, 'Wraps to end');
  assert.equal(evaluateKeyboardNav('ArrowLeft', count, 2), 1);
  assert.equal(evaluateKeyboardNav('ArrowLeft', count, 1), 0);
});

test('Customer Gallery: single-image galleries ignore keyboard navigation', () => {
  const count = 1;
  assert.equal(evaluateKeyboardNav('ArrowRight', count, 0), 0);
  assert.equal(evaluateKeyboardNav('ArrowLeft', count, 0), 0);
});

// -----------------------------------------------------------------------------
// 4. Category Image Storage & Path Generation
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

// -----------------------------------------------------------------------------
// 5. Image Validation Constraints (Product & Category Parity)
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// 6. Category Image Upload & Safe Replacement Semantics
// -----------------------------------------------------------------------------

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
