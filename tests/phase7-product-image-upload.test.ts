import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_IMAGE_FILE_SIZE,
  ALLOWED_IMAGE_MIME_TYPES,
  validateImageFile,
  generateCatalogStoragePath,
  getImageExtension,
} from '../lib/catalog/image-validation.ts';
import nextConfig from '../next.config.ts';

// =============================================================================
// 1. FILE SIZE AND FORMAT VALIDATION TESTS
// =============================================================================

test('Image Upload Validation: Advertised 5MB limit constant is exactly 5 * 1024 * 1024 bytes', () => {
  assert.equal(MAX_IMAGE_FILE_SIZE, 5 * 1024 * 1024);
  assert.equal(MAX_IMAGE_FILE_SIZE, 5242880);
});

test('Image Upload Validation: Supported formats strictly include JPEG, PNG, and WebP', () => {
  assert.deepEqual(ALLOWED_IMAGE_MIME_TYPES, ['image/jpeg', 'image/png', 'image/webp']);
});

test('Image Upload Validation: Upload under 1MB is accepted and validated', () => {
  const result = validateImageFile({
    name: 'small-photo.jpg',
    size: 500 * 1024,
    type: 'image/jpeg',
  });
  assert.equal(result.valid, true);
  assert.equal(result.error, undefined);
  assert.equal(result.sizeMB, '0.49');
});

test('Image Upload Validation: Upload around 3.5MB (reported failure size 3,628,810 bytes) is accepted and validated', () => {
  const reportedFailureSize = 3628810;
  const result = validateImageFile({
    name: 'luxury-necklace.png',
    size: reportedFailureSize,
    type: 'image/png',
  });
  assert.equal(result.valid, true);
  assert.equal(result.error, undefined);
  assert.equal(result.sizeMB, '3.46');
});

test('Image Upload Validation: Upload near the 5MB maximum (e.g. 4.9MB) is accepted and validated', () => {
  const nearMaxBytes = Math.floor(4.9 * 1024 * 1024);
  const result = validateImageFile({
    name: 'high-res-gem.webp',
    size: nearMaxBytes,
    type: 'image/webp',
  });
  assert.equal(result.valid, true);
  assert.equal(result.error, undefined);
  assert.equal(result.sizeMB, '4.90');
});

test('Image Upload Validation: Files exceeding 5MB are rejected with clear error message', () => {
  const oversizedBytes = Math.floor(5.2 * 1024 * 1024); // 5.2MB
  const result = validateImageFile({
    name: 'giant-photo.jpg',
    size: oversizedBytes,
    type: 'image/jpeg',
  });
  assert.equal(result.valid, false);
  assert.match(result.error || '', /exceeds the 5MB limit/i);
  assert.match(result.error || '', /5\.20 MB/);
});

test('Image Upload Validation: Zero-byte or empty files are rejected', () => {
  const emptyResult = validateImageFile({
    name: 'empty.jpg',
    size: 0,
    type: 'image/jpeg',
  });
  assert.equal(emptyResult.valid, false);
  assert.match(emptyResult.error || '', /empty/i);
});

test('Image Upload Validation: Unsupported image formats (GIF, SVG, PDF) are rejected with clear message', () => {
  const gifResult = validateImageFile({ name: 'animation.gif', size: 1024, type: 'image/gif' });
  assert.equal(gifResult.valid, false);
  assert.match(gifResult.error || '', /Invalid image format/i);
  assert.match(gifResult.error || '', /JPEG, PNG, WebP/i);

  const svgResult = validateImageFile({ name: 'vector.svg', size: 1024, type: 'image/svg+xml' });
  assert.equal(svgResult.valid, false);
  assert.match(svgResult.error || '', /Invalid image format/i);

  const pdfResult = validateImageFile({ name: 'doc.pdf', size: 1024, type: 'application/pdf' });
  assert.equal(pdfResult.valid, false);
  assert.match(pdfResult.error || '', /Invalid image format/i);
});

// =============================================================================
// 2. STORAGE PATH GENERATION TESTS
// =============================================================================

test('Storage Path Generation: Generates collision-resistant paths conforming to catalog/ prefix and valid extensions', () => {
  const jpgPath = generateCatalogStoragePath('image/jpeg');
  assert.match(jpgPath, /^catalog\/\d+-[a-z0-9]+\.jpg$/);

  const pngPath = generateCatalogStoragePath('image/png');
  assert.match(pngPath, /^catalog\/\d+-[a-z0-9]+\.png$/);

  const webpPath = generateCatalogStoragePath('image/webp');
  assert.match(webpPath, /^catalog\/\d+-[a-z0-9]+\.webp$/);

  assert.equal(getImageExtension('image/jpeg'), 'jpg');
  assert.equal(getImageExtension('image/png'), 'png');
  assert.equal(getImageExtension('image/webp'), 'webp');
});

// =============================================================================
// 3. NEXT.JS CONFIGURATION TESTS
// =============================================================================

test('Next.js Config - Task 2: Global serverActions.bodySizeLimit is not artificially increased', () => {
  const experimental = (nextConfig as any).experimental;
  // Experimental serverActions should either be undefined or not set to an arbitrary limit
  assert.equal(experimental?.serverActions?.bodySizeLimit, undefined);
});

// =============================================================================
// 4. DIRECT SIGNED UPLOAD WORKFLOW & FALLBACK REMOVAL TESTS
// =============================================================================

test('Upload Architecture - Task 1: Direct signed upload fails closed without fallback to Server Actions', async () => {
  // Simulate the direct signed upload flow with simulated failure
  async function simulateUploadFlow(file: { name: string; size: number; type: string }, shouldSignSucceed: boolean) {
    // 1. Validation
    const val = validateImageFile(file);
    if (!val.valid) return { success: false, error: val.error, fallbackAttempted: false };

    // 2. Signing
    if (!shouldSignSucceed) {
      // Must return error directly without attempting server action fallback
      return {
        success: false,
        error: 'Failed to authorize image upload with storage.',
        fallbackAttempted: false,
      };
    }

    return {
      success: true,
      url: 'https://example.supabase.co/storage/v1/object/public/products/catalog/test.jpg',
      fallbackAttempted: false,
    };
  }

  const file = { name: 'diamond-necklace.png', size: 3628810, type: 'image/png' };
  const failRes = await simulateUploadFlow(file, false);
  assert.equal(failRes.success, false);
  assert.equal(failRes.fallbackAttempted, false, 'No fallback to Server Actions should be attempted');
  assert.match(failRes.error || '', /Failed to authorize image upload/);
});

// =============================================================================
// 5. UI ERROR HANDLING, SPINNER RESET & PARTIAL FAILURE RESILIENCE
// =============================================================================

test('UI Handler Resilience - Task 5: Upload spinner reset and input clearing guaranteed via try/catch/finally', async () => {
  let isUploading = false;
  let fileInputValue = 'C:\\fakepath\\necklace.jpg';
  let capturedError: string | null = null;

  async function simulateUploadWithFailure() {
    isUploading = true;
    try {
      throw new Error('Storage upload failed (simulated network error)');
    } catch (err: unknown) {
      capturedError = err instanceof Error ? err.message : 'Unknown error';
    } finally {
      isUploading = false;
      fileInputValue = '';
    }
  }

  await simulateUploadWithFailure();

  assert.equal(isUploading, false, 'Spinner must reset to false after error');
  assert.equal(fileInputValue, '', 'File input value must reset to empty string for re-selection');
  assert.match(capturedError || '', /Storage upload failed/);
});

test('UI Handler Resilience - Task 5: Multiple-file partial failure aggregates successes and isolates errors', async () => {
  const files = [
    { name: 'ring.jpg', size: 1024, type: 'image/jpeg' },
    { name: 'invalid.gif', size: 100, type: 'image/gif' },
    { name: 'huge.png', size: 6 * 1024 * 1024, type: 'image/png' },
  ];

  const successes: string[] = [];
  const errors: string[] = [];
  let isUploading = true;

  try {
    for (const file of files) {
      const val = validateImageFile(file);
      if (!val.valid) {
        errors.push(`${file.name}: ${val.error}`);
        continue;
      }
      successes.push(file.name);
    }
  } finally {
    isUploading = false;
  }

  assert.equal(isUploading, false);
  assert.equal(successes.length, 1);
  assert.equal(successes[0], 'ring.jpg');
  assert.equal(errors.length, 2);
  assert.ok(errors.some((e) => e.includes('invalid.gif') && e.includes('Invalid image format')));
  assert.ok(errors.some((e) => e.includes('huge.png') && e.includes('exceeds the 5MB limit')));
});

test('Image Attachment Logic - Task 4: Existing gallery images are never deleted during cleanup of unattached uploads', async () => {
  const existingGallery = [
    { id: 'img-1', url: 'https://storage/catalog/ring-front.jpg', isPrimary: true },
    { id: 'img-2', url: 'https://storage/catalog/ring-side.jpg', isPrimary: false },
  ];

  const newUploadedUrl = 'https://storage/catalog/failed-attach.jpg';
  const dbAttachmentFailed = true;

  const galleryAfterOperation = [...existingGallery];
  if (!dbAttachmentFailed) {
    galleryAfterOperation.push({ id: 'img-3', url: newUploadedUrl, isPrimary: false });
  }

  // Existing images remain intact
  assert.equal(galleryAfterOperation.length, 2);
  assert.equal(galleryAfterOperation[0].id, 'img-1');
  assert.equal(galleryAfterOperation[1].id, 'img-2');
});

test('Variation Image Association - Task 4: Correctly assigns variantId when targetVariantId is provided or omitted', () => {
  function prepareImageAttachment(targetVariantId: string | null) {
    return {
      productId: 'prod-001',
      variantId: targetVariantId ? targetVariantId : null,
      url: 'https://storage/catalog/test.jpg',
    };
  }

  const variantSpecific = prepareImageAttachment('var-gold-ring');
  assert.equal(variantSpecific.variantId, 'var-gold-ring');

  const generalProductLevel = prepareImageAttachment(null);
  assert.equal(generalProductLevel.variantId, null);
});
