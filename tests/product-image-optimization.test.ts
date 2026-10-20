import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  getMasterImageUrl,
  getThumbnailImageUrl,
  getOptimizedImageUrl,
  isSupabaseStorageUrl,
  supabaseImageLoader,
} from '../lib/catalog/image-loader.ts';
import {
  calculateTargetDimensions,
  validateImageForOptimization,
  MASTER_MAX_DIMENSION,
  THUMBNAIL_MAX_DIMENSION,
  WEBP_COMPRESSION_QUALITY,
} from '../lib/catalog/image-optimizer.ts';
import { filterGalleryImages } from '../lib/catalog/gallery-logic.ts';
import type { ProductImage } from '../types/product.ts';

const ROOT_DIR = process.cwd();

// =============================================================================
// 1. FREE-TIER IMAGE URL RESOLVER CONTRACT TESTS
// =============================================================================

test('Image Resolver: getMasterImageUrl returns standard object storage URL and strips transformation queries', () => {
  const renderUrlWithParams =
    'https://wztwulijwsgjjrabvtek.supabase.co/storage/v1/render/image/public/products/catalog/1791994618849-wyyr5dl.webp?width=800&height=800&quality=80&format=webp';

  const master = getMasterImageUrl(renderUrlWithParams);

  assert.ok(
    master.includes('/storage/v1/object/public/products/catalog/1791994618849-wyyr5dl.webp'),
    'Must resolve to standard /storage/v1/object/public/'
  );
  assert.ok(!master.includes('/storage/v1/render/image/public/'), 'Must not retain render path');
  assert.ok(!master.includes('width='), 'Must strip width param');
  assert.ok(!master.includes('height='), 'Must strip height param');
  assert.ok(!master.includes('quality='), 'Must strip quality param');
  assert.ok(!master.includes('format='), 'Must strip format param');

  // If passed a thumbnail URL, normalizes back to master
  const thumbUrl = 'https://wztwulijwsgjjrabvtek.supabase.co/storage/v1/object/public/products/catalog/1791994618849-wyyr5dl-thumb.webp';
  const resolvedMaster = getMasterImageUrl(thumbUrl);
  assert.strictEqual(
    resolvedMaster,
    'https://wztwulijwsgjjrabvtek.supabase.co/storage/v1/object/public/products/catalog/1791994618849-wyyr5dl.webp'
  );
});

test('Image Resolver: getThumbnailImageUrl derives companion -thumb.webp for WebP assets', () => {
  const masterWebp =
    'https://wztwulijwsgjjrabvtek.supabase.co/storage/v1/object/public/products/catalog/1792000000000-abc1234.webp';

  const thumb = getThumbnailImageUrl(masterWebp);

  assert.strictEqual(
    thumb,
    'https://wztwulijwsgjjrabvtek.supabase.co/storage/v1/object/public/products/catalog/1792000000000-abc1234-thumb.webp'
  );

  // If already a thumb URL, remains unchanged
  assert.strictEqual(getThumbnailImageUrl(thumb), thumb);
});

test('Image Resolver: legacy PNG and JPEG assets safely return master URL without 404', () => {
  const legacyPng =
    'https://wztwulijwsgjjrabvtek.supabase.co/storage/v1/object/public/products/catalog/1791994618849-wyyr5dl.png';
  const legacyJpg =
    'https://wztwulijwsgjjrabvtek.supabase.co/storage/v1/object/public/products/catalog/1791994618849-wyyr5dl.jpg';

  // Legacy images do not have a separate thumbnail file, so getThumbnailImageUrl must return the master URL
  assert.strictEqual(getThumbnailImageUrl(legacyPng), legacyPng);
  assert.strictEqual(getThumbnailImageUrl(legacyJpg), legacyJpg);
  assert.strictEqual(getMasterImageUrl(legacyPng), legacyPng);
  assert.strictEqual(getMasterImageUrl(legacyJpg), legacyJpg);
});

test('Image Resolver: external URLs, SVGs, local paths, and data URLs are left completely untouched', () => {
  assert.strictEqual(getMasterImageUrl('/images/logo.png'), '/images/logo.png');
  assert.strictEqual(getThumbnailImageUrl('/images/logo.png'), '/images/logo.png');

  const external = 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800';
  assert.strictEqual(getMasterImageUrl(external), external);
  assert.strictEqual(getThumbnailImageUrl(external), external);

  const svg = 'https://wztwulijwsgjjrabvtek.supabase.co/storage/v1/object/public/products/icons/badge.svg';
  assert.strictEqual(getMasterImageUrl(svg), svg);
  assert.strictEqual(getThumbnailImageUrl(svg), svg);

  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY44YAAAAASUVORK5CYII=';
  assert.strictEqual(getMasterImageUrl(dataUrl), dataUrl);
});

test('Image Resolver: safe error handling for null, undefined, empty, or malformed URLs', () => {
  assert.strictEqual(getMasterImageUrl(null), '');
  assert.strictEqual(getMasterImageUrl(undefined), '');
  assert.strictEqual(getMasterImageUrl(''), '');
  assert.strictEqual(getMasterImageUrl('   '), '');
  assert.strictEqual(getMasterImageUrl('invalid-url'), 'invalid-url');

  assert.strictEqual(getThumbnailImageUrl(null), '');
  assert.strictEqual(getThumbnailImageUrl(undefined), '');
  assert.strictEqual(getThumbnailImageUrl(''), '');
  assert.strictEqual(getThumbnailImageUrl('invalid-url'), 'invalid-url');
});

test('Image Resolver: backward-compatible getOptimizedImageUrl routes by width threshold <= 320', () => {
  const masterWebp =
    'https://wztwulijwsgjjrabvtek.supabase.co/storage/v1/object/public/products/catalog/1792000000000-abc1234.webp';

  const thumbResult = getOptimizedImageUrl(masterWebp, { width: 160 });
  assert.ok(thumbResult.endsWith('-thumb.webp'), 'Width <= 320 must resolve thumbnail');

  const masterResult = getOptimizedImageUrl(masterWebp, { width: 800 });
  assert.ok(!masterResult.endsWith('-thumb.webp'), 'Width > 320 must resolve master');
});

// =============================================================================
// 2. IMAGE DIMENSION CALCULATION & ASPECT RATIO PRESERVATION TESTS
// =============================================================================

test('Image Optimizer: aspect ratio preservation and scaling logic', () => {
  // Landscape (2400x1600, aspect 1.5)
  const masterLandscape = calculateTargetDimensions(2400, 1600, MASTER_MAX_DIMENSION);
  assert.strictEqual(masterLandscape.width, 1200);
  assert.strictEqual(masterLandscape.height, 800);

  const thumbLandscape = calculateTargetDimensions(2400, 1600, THUMBNAIL_MAX_DIMENSION);
  assert.strictEqual(thumbLandscape.width, 320);
  assert.strictEqual(thumbLandscape.height, 213);

  // Portrait (1600x2400, aspect 0.6667)
  const masterPortrait = calculateTargetDimensions(1600, 2400, MASTER_MAX_DIMENSION);
  assert.strictEqual(masterPortrait.width, 800);
  assert.strictEqual(masterPortrait.height, 1200);

  const thumbPortrait = calculateTargetDimensions(1600, 2400, THUMBNAIL_MAX_DIMENSION);
  assert.strictEqual(thumbPortrait.width, 213);
  assert.strictEqual(thumbPortrait.height, 320);

  // Square (2000x2000)
  const masterSquare = calculateTargetDimensions(2000, 2000, MASTER_MAX_DIMENSION);
  assert.strictEqual(masterSquare.width, 1200);
  assert.strictEqual(masterSquare.height, 1200);

  const thumbSquare = calculateTargetDimensions(2000, 2000, THUMBNAIL_MAX_DIMENSION);
  assert.strictEqual(thumbSquare.width, 320);
  assert.strictEqual(thumbSquare.height, 320);
});

test('Image Optimizer: strictly avoids upscaling smaller images', () => {
  // Smaller than 1200px master bound (800x600)
  const masterDims = calculateTargetDimensions(800, 600, MASTER_MAX_DIMENSION);
  assert.strictEqual(masterDims.width, 800, 'Must not upscale 800px to 1200px');
  assert.strictEqual(masterDims.height, 600, 'Must not upscale 600px');

  // Thumbnail scaling still applies proportionally down to 320
  const thumbDims = calculateTargetDimensions(800, 600, THUMBNAIL_MAX_DIMENSION);
  assert.strictEqual(thumbDims.width, 320);
  assert.strictEqual(thumbDims.height, 240);

  // Tiny image smaller than thumbnail bound (200x150)
  const tinyThumb = calculateTargetDimensions(200, 150, THUMBNAIL_MAX_DIMENSION);
  assert.strictEqual(tinyThumb.width, 200, 'Must not upscale tiny image for thumbnail');
  assert.strictEqual(tinyThumb.height, 150);
});

test('Image Optimizer: input validation rejects invalid files and oversized payloads', () => {
  // Valid JPEG
  const validJpeg = validateImageForOptimization({ name: 'test.jpg', size: 1024 * 500, type: 'image/jpeg' });
  assert.strictEqual(validJpeg.valid, true);

  // Valid PNG
  const validPng = validateImageForOptimization({ name: 'test.png', size: 1024 * 1024, type: 'image/png' });
  assert.strictEqual(validPng.valid, true);

  // Valid WebP
  const validWebp = validateImageForOptimization({ name: 'test.webp', size: 1024 * 300, type: 'image/webp' });
  assert.strictEqual(validWebp.valid, true);

  // Empty file (size 0)
  const emptyFile = validateImageForOptimization({ name: 'empty.jpg', size: 0, type: 'image/jpeg' });
  assert.strictEqual(emptyFile.valid, false);

  // Oversized file (> 5MB)
  const oversizedFile = validateImageForOptimization({ name: 'huge.jpg', size: 6 * 1024 * 1024, type: 'image/jpeg' });
  assert.strictEqual(oversizedFile.valid, false);

  // Invalid MIME type
  const pdfFile = validateImageForOptimization({ name: 'doc.pdf', size: 1024 * 500, type: 'application/pdf' });
  assert.strictEqual(pdfFile.valid, false);
});

// =============================================================================
// 3. STORAGE INTEGRATION & CLEANUP CONTRACTS
// =============================================================================

test('Storage Actions: createProductImagePairUploadUrlAction is defined with validation', () => {
  const storagePath = join(ROOT_DIR, 'lib/catalog/storage.ts');
  assert.ok(existsSync(storagePath), 'storage.ts must exist');
  const content = readFileSync(storagePath, 'utf-8');

  // Verify export
  assert.match(
    content,
    /export async function createProductImagePairUploadUrlAction/,
    'Must export createProductImagePairUploadUrlAction'
  );

  // Generates paired .webp and -thumb.webp
  assert.match(
    content,
    /catalog\/\$\{uniqueSuffix\}\.webp/,
    'Must generate master .webp path'
  );
  assert.match(
    content,
    /catalog\/\$\{uniqueSuffix\}-thumb\.webp/,
    'Must generate thumbnail -thumb.webp path'
  );

  // Checks admin auth
  assert.match(
    content,
    /await requireAdminAuth\(\)/,
    'Pair action must enforce admin authentication'
  );
});

test('Storage Actions: deletion routines clean up companion thumbnail files', () => {
  const storagePath = join(ROOT_DIR, 'lib/catalog/storage.ts');
  const content = readFileSync(storagePath, 'utf-8');

  // deleteProductImageAction removes companion thumbnail
  assert.match(
    content,
    /pathsToRemove\.push\(storagePath\.replace\(\/\\\.webp\$\/,\s*'-thumb\.webp'\)\)/,
    'deleteProductImageAction must remove companion thumbnail'
  );

  // deleteUnattachedProductImageAction removes companion thumbnail
  assert.match(
    content,
    /pathsToRemove\.push\(storagePath\.replace\(\/\\\.webp\$\/,\s*'-thumb\.webp'\)\)/,
    'deleteUnattachedProductImageAction must remove companion thumbnail'
  );
});

test('Upload Client: sets 24-hour cache-control on signed uploads', () => {
  const clientPath = join(ROOT_DIR, 'lib/catalog/upload-client.ts');
  assert.ok(existsSync(clientPath), 'upload-client.ts must exist');
  const content = readFileSync(clientPath, 'utf-8');

  assert.match(
    content,
    /cacheControl:\s*['"]86400['"]/,
    'SDK upload must set cacheControl: "86400"'
  );
  assert.match(
    content,
    /['"]cache-control['"]:\s*['"]max-age=86400['"]/,
    'PUT upload must set cache-control: "max-age=86400"'
  );
});

test('Upload Client: parallel uploads settle before cleanup and report cleanup failures', () => {
  const clientPath = join(ROOT_DIR, 'lib/catalog/upload-client.ts');
  const content = readFileSync(clientPath, 'utf-8');

  // Promise.allSettled ensures both master and thumbnail uploads finish before cleanup begins
  assert.match(
    content,
    /Promise\.allSettled\(\s*\[[\s\S]*?uploadToSignedTarget\(pairRes\.master[\s\S]*?uploadToSignedTarget\(pairRes\.thumbnail/,
    'Must use Promise.allSettled on master and thumbnail uploads'
  );

  // Verifies bidirectional cleanup: if master succeeded but thumb failed, or vice versa
  assert.match(
    content,
    /if\s*\(\s*masterSuccess\s*\)\s*\{[\s\S]*?deleteUnattachedProductImageAction\(pairRes\.master\.publicUrl\)/,
    'Must delete master if thumbnail fails'
  );
  assert.match(
    content,
    /if\s*\(\s*thumbSuccess\s*\)\s*\{[\s\S]*?deleteUnattachedProductImageAction\(pairRes\.thumbnail\.publicUrl\)/,
    'Must delete thumbnail if master fails'
  );

  // Cleanup warnings are reported, never silently swallowed
  assert.match(
    content,
    /Storage Cleanup Warning/,
    'Must report storage cleanup warnings in failure message'
  );
});

test('Storage Actions: isStorageObjectReferenced protects companion thumbnails from accidental deletion', () => {
  const storagePath = join(ROOT_DIR, 'lib/catalog/storage.ts');
  const content = readFileSync(storagePath, 'utf-8');

  // Verifies that when checking if a thumbnail is referenced, it checks its master image
  assert.match(
    content,
    /objectPath\.endsWith\('-thumb\.webp'\)\s*\?\s*objectPath\.replace\(\/-thumb\\\.webp\$\/,\s*'\.webp'\)/,
    'Must map thumbnail back to master path to check references'
  );
});

// =============================================================================
// 4. STOREFRONT COMPONENT CONTRACTS (GALLERY & CARDS)
// =============================================================================

test('Product Gallery: uses getMasterImageUrl for main and getThumbnailImageUrl for thumbnails', () => {
  const galleryPath = join(ROOT_DIR, 'components/store/product-image-gallery.tsx');
  const content = readFileSync(galleryPath, 'utf-8');

  // Imports
  assert.match(content, /getMasterImageUrl/, 'Must import getMasterImageUrl');
  assert.match(content, /getThumbnailImageUrl/, 'Must import getThumbnailImageUrl');

  // Main image loads master
  assert.match(
    content,
    /src=\{getMasterImageUrl\(activeImage\.url\)\}/,
    'Main display image must load via getMasterImageUrl'
  );

  // Thumbnails load thumbnail with master fallback
  assert.match(
    content,
    /src=\{getThumbSource\(img\)\}/,
    'Thumbnail carousel must load via getThumbSource'
  );

  // Fallback states tracked and reset on variant switch
  assert.match(content, /failedThumbIds/, 'Gallery must track failedThumbIds');
  assert.match(content, /failedMasterIds/, 'Gallery must track failedMasterIds');
  assert.match(
    content,
    /setFailedThumbIds\(\{\}\);[\s\S]*?setFailedMasterIds\(\{\}\);/,
    'Gallery must reset fallback state on variant change'
  );

  // Placeholder rendered on master failure
  assert.match(
    content,
    /failedMasterIds\[activeImage\.id\s*\|\|\s*activeImage\.url\]\s*\?/,
    'Gallery must render fallback placeholder when master fails'
  );
});

test('Product Card: uses getThumbnailImageUrl with master fallback and placeholder', () => {
  const cardPath = join(ROOT_DIR, 'components/store/product-card.tsx');
  const content = readFileSync(cardPath, 'utf-8');

  assert.match(content, /getMasterImageUrl/, 'Card must import getMasterImageUrl');
  assert.match(content, /getThumbnailImageUrl/, 'Card must import getThumbnailImageUrl');

  assert.match(
    content,
    /primaryThumbFailed\s*\?\s*getMasterImageUrl\(primaryImage\.url\)\s*:\s*getThumbnailImageUrl\(primaryImage\.url\)/,
    'Card must attempt thumbnail and fall back to master'
  );

  assert.match(content, /primaryMasterFailed/, 'Card must track master failure');
  assert.match(content, /secondaryThumbFailed/, 'Card must track secondary hover thumb failure');
  assert.match(content, /secondaryMasterFailed/, 'Card must track secondary hover master failure');
});

test('Product Gallery: variant filtering prioritizes variant-specific imagery', () => {
  const images: ProductImage[] = [
    { id: 'img-1', productId: 'p1', variantId: null, url: 'https://test/p1.png', isPrimary: true, displayOrder: 1, createdAt: '2026-01-01T00:00:00Z' },
    { id: 'img-2', productId: 'p1', variantId: 'v1', url: 'https://test/v1.png', isPrimary: false, displayOrder: 2, createdAt: '2026-01-01T00:00:00Z' },
    { id: 'img-3', productId: 'p1', variantId: 'v2', url: 'https://test/v2.png', isPrimary: false, displayOrder: 3, createdAt: '2026-01-01T00:00:00Z' },
  ];

  const general = filterGalleryImages(images, null);
  assert.strictEqual(general.length, 3);

  const v1Images = filterGalleryImages(images, 'v1');
  assert.ok(v1Images.some((img) => img.variantId === 'v1'));
  assert.ok(v1Images.every((img) => img.variantId === 'v1' || img.variantId === null));
});
