/**
 * Client-Side Browser WebP Image Optimization Pipeline
 *
 * Provides high-performance, 100% free-tier-compatible image optimization directly in the browser
 * prior to signed direct upload to Supabase Storage.
 *
 * Guarantees:
 * 1. Visual Quality: Preserves high visual fidelity for jewelry products (85% WebP quality).
 * 2. Dimension Bounds: Master resized to max 1200px; Thumbnail resized to max 320px.
 * 3. Aspect Ratio: Strictly preserves original image proportions without distortion.
 * 4. Upscaling Protection: Small images (below max dimensions) are never upscaled.
 * 5. Transparency Preservation: Full alpha channel preserved for transparent PNGs converted to WebP.
 * 6. Orientation Handling: Correctly respects EXIF camera orientation.
 * 7. Memory Safety: Releases ImageBitmap handles, canvas contexts, and Blob URLs immediately after conversion.
 * 8. Never Oversized: Rejects invalid or oversized (>5MB) inputs early; never silently uploads unoptimized files.
 */

import {
  MAX_IMAGE_FILE_SIZE,
  ALLOWED_IMAGE_MIME_TYPES,
  validateImageFile,
} from './image-validation.ts';

export const MASTER_MAX_DIMENSION = 1200;
export const THUMBNAIL_MAX_DIMENSION = 320;
export const WEBP_COMPRESSION_QUALITY = 0.85;

export interface Dimension {
  width: number;
  height: number;
}

export interface OptimizedRendition {
  blob: Blob;
  file: File;
  width: number;
  height: number;
  size: number;
}

export interface OptimizedImagePair {
  master: OptimizedRendition;
  thumbnail: OptimizedRendition;
}

/**
 * Calculates proportionally scaled target dimensions within max bounds.
 * Strictly avoids upscaling if original dimensions are already within bounds.
 */
export function calculateTargetDimensions(
  originalWidth: number,
  originalHeight: number,
  maxDimension: number
): Dimension {
  if (originalWidth <= 0 || originalHeight <= 0 || maxDimension <= 0) {
    return { width: Math.max(1, originalWidth || 1), height: Math.max(1, originalHeight || 1) };
  }

  // Never upscale smaller images
  if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
    return {
      width: Math.round(originalWidth),
      height: Math.round(originalHeight),
    };
  }

  const aspectRatio = originalWidth / originalHeight;

  if (originalWidth >= originalHeight) {
    const width = maxDimension;
    const height = Math.max(1, Math.round(maxDimension / aspectRatio));
    return { width, height };
  } else {
    const height = maxDimension;
    const width = Math.max(1, Math.round(maxDimension * aspectRatio));
    return { width, height };
  }
}

/**
 * Validates an image file specifically for client-side optimization.
 */
export function validateImageForOptimization(file: {
  name?: string;
  size: number;
  type: string;
}): { valid: boolean; error?: string } {
  return validateImageFile(file);
}

/**
 * Converts a Canvas element to a WebP Blob with specified quality.
 */
function canvasToBlobAsync(
  canvas: HTMLCanvasElement,
  mimeType: string = 'image/webp',
  quality: number = WEBP_COMPRESSION_QUALITY
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error(`Failed to encode canvas to ${mimeType}. Format may not be supported by browser.`));
        }
      },
      mimeType,
      quality
    );
  });
}

/**
 * Renders an image source (ImageBitmap or HTMLImageElement) to a canvas at target dimensions.
 */
function renderToCanvas(
  source: ImageBitmap | HTMLImageElement,
  targetWidth: number,
  targetHeight: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d', {
    alpha: true,
    willReadFrequently: false,
  });

  if (!ctx) {
    throw new Error('Could not acquire 2D rendering context on canvas.');
  }

  // High-quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw source scaled to target dimensions
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

  return canvas;
}

/**
 * Cleans up canvas memory by zeroing its dimensions.
 */
function cleanupCanvas(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Browser-side image optimizer.
 * Encodes input raster file into a high-quality master WebP (<= 1200px) and companion thumbnail WebP (<= 320px).
 */
export async function optimizeProductImage(file: File): Promise<OptimizedImagePair> {
  // 1. Validate file
  const validation = validateImageForOptimization(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid image file provided.');
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Image optimization is only available in browser environments.');
  }

  let sourceBitmap: ImageBitmap | null = null;
  let sourceImage: HTMLImageElement | null = null;
  let objectUrl: string | null = null;
  let origWidth = 0;
  let origHeight = 0;

  try {
    // 2. Decode image with EXIF orientation support
    if (typeof createImageBitmap === 'function') {
      try {
        sourceBitmap = await createImageBitmap(file, {
          imageOrientation: 'from-image',
        });
        origWidth = sourceBitmap.width;
        origHeight = sourceBitmap.height;
      } catch {
        // Fall back to Image element if createImageBitmap orientation option is unsupported
        sourceBitmap = null;
      }
    }

    if (!sourceBitmap) {
      objectUrl = URL.createObjectURL(file);
      sourceImage = new Image();
      await new Promise<void>((resolve, reject) => {
        if (!sourceImage) return reject(new Error('Image constructor failed.'));
        sourceImage.onload = () => resolve();
        sourceImage.onerror = () => reject(new Error('Failed to decode image file.'));
        sourceImage.src = objectUrl!;
      });
      origWidth = sourceImage.naturalWidth || sourceImage.width;
      origHeight = sourceImage.naturalHeight || sourceImage.height;
    }

    if (origWidth <= 0 || origHeight <= 0) {
      throw new Error('Decoded image has invalid dimensions (0x0).');
    }

    const imageSource = sourceBitmap || sourceImage!;

    // 3. Compute target dimensions for master and thumbnail
    const masterDims = calculateTargetDimensions(origWidth, origHeight, MASTER_MAX_DIMENSION);
    const thumbDims = calculateTargetDimensions(origWidth, origHeight, THUMBNAIL_MAX_DIMENSION);

    // 4. Render and encode Master rendition (1200px max, 85% WebP)
    let masterCanvas: HTMLCanvasElement | null = null;
    let masterBlob: Blob;
    try {
      masterCanvas = renderToCanvas(imageSource, masterDims.width, masterDims.height);
      masterBlob = await canvasToBlobAsync(masterCanvas, 'image/webp', WEBP_COMPRESSION_QUALITY);
    } finally {
      cleanupCanvas(masterCanvas);
    }

    // 5. Render and encode Thumbnail rendition (320px max, 85% WebP)
    let thumbCanvas: HTMLCanvasElement | null = null;
    let thumbBlob: Blob;
    try {
      thumbCanvas = renderToCanvas(imageSource, thumbDims.width, thumbDims.height);
      thumbBlob = await canvasToBlobAsync(thumbCanvas, 'image/webp', WEBP_COMPRESSION_QUALITY);
    } finally {
      cleanupCanvas(thumbCanvas);
    }

    // 6. Form base filename without extension
    const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const masterFile = new File([masterBlob], `${baseName}.webp`, { type: 'image/webp' });
    const thumbFile = new File([thumbBlob], `${baseName}-thumb.webp`, { type: 'image/webp' });

    return {
      master: {
        blob: masterBlob,
        file: masterFile,
        width: masterDims.width,
        height: masterDims.height,
        size: masterBlob.size,
      },
      thumbnail: {
        blob: thumbBlob,
        file: thumbFile,
        width: thumbDims.width,
        height: thumbDims.height,
        size: thumbBlob.size,
      },
    };
  } finally {
    // 7. Cleanup resources
    if (sourceBitmap) {
      sourceBitmap.close?.();
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}
