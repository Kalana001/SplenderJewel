/**
 * Pure image validation and path calculation logic for Splender Jewel product images.
 * Safe for import across Server Components, Server Actions, Client Components, and pure Node.js test runners.
 */

export const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024; // 5MB (5,242,880 bytes)
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  sizeMB?: string;
}

/**
 * Strictly validates an image file's size and MIME type against Splender Jewel catalog limits.
 */
export function validateImageFile(file: {
  name?: string;
  size: number;
  type: string;
}): ImageValidationResult {
  if (!file) {
    return { valid: false, error: 'No image file provided.' };
  }

  if (typeof file.size !== 'number' || file.size <= 0) {
    return { valid: false, error: 'The selected image file is empty.' };
  }

  const sizeMB = (file.size / (1024 * 1024)).toFixed(2);

  if (file.size > MAX_IMAGE_FILE_SIZE) {
    return {
      valid: false,
      sizeMB,
      error: `File size exceeds the 5MB limit (${sizeMB} MB). Please select an image under 5MB.`,
    };
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      sizeMB,
      error: `Invalid image format (${file.type || 'unknown'}). Allowed formats: JPEG, PNG, WebP.`,
    };
  }

  return { valid: true, sizeMB };
}

/**
 * Determines safe file extension based on MIME type.
 */
export function getImageExtension(mimeType: string): string {
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  return extMap[mimeType] || 'jpg';
}

/**
 * Generates a collision-resistant catalog storage path for Supabase Storage 'products' bucket.
 * e.g. catalog/1791987654321-abc1234.jpg
 */
export function generateCatalogStoragePath(mimeType: string): string {
  const ext = getImageExtension(mimeType);
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  return `catalog/${uniqueSuffix}.${ext}`;
}

/**
 * Generates a collision-resistant category storage path for Supabase Storage 'products' bucket.
 * e.g. categories/1791987654321-abc1234.jpg
 */
export function generateCategoryStoragePath(mimeType: string): string {
  const ext = getImageExtension(mimeType);
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  return `categories/${uniqueSuffix}.${ext}`;
}
