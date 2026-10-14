'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/auth/server';
import type { ProductImage } from '@/types/product';

import {
  validateImageFile,
  generateCatalogStoragePath,
  generateCategoryStoragePath,
} from '@/lib/catalog/image-validation';

const BUCKET_NAME = 'products';

export type UploadErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'STORAGE_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'UPLOAD_FAILED';

export interface UploadImageResult {
  success: boolean;
  code?: UploadErrorCode;
  url?: string;
  path?: string;
  error?: string;
}

export interface CreateSignedUploadUrlInput {
  filename: string;
  contentType: string;
  fileSize: number;
}

export interface CreateSignedUploadUrlResult {
  success: boolean;
  code?: UploadErrorCode;
  signedUrl?: string;
  path?: string;
  token?: string;
  publicUrl?: string;
  error?: string;
}

export interface AttachImageInput {
  productId: string;
  variantId?: string | null;
  url: string;
  altText?: string | null;
  displayOrder?: number;
  isPrimary?: boolean;
}

/**
 * Generates an authenticated signed upload URL for the 'products' storage bucket.
 * Allows client browser to directly upload images up to 5MB, bypassing Vercel serverless function payload limits.
 * Differentiates UNAUTHENTICATED, FORBIDDEN, CONFIGURATION_ERROR, STORAGE_ERROR, and UPLOAD_FAILED.
 */
export async function createProductImageUploadUrlAction(
  input: CreateSignedUploadUrlInput
): Promise<CreateSignedUploadUrlResult> {
  try {
    // 1. Admin Authentication & Role Verification (UNAUTHENTICATED / FORBIDDEN)
    try {
      await requireAdminAuth();
    } catch (authErr: unknown) {
      const isAuthError = authErr instanceof Error && authErr.name === 'AdminAuthError';
      const code = (isAuthError && (authErr as any).code === 'FORBIDDEN') ? 'FORBIDDEN' : 'UNAUTHENTICATED';
      const message = authErr instanceof Error
        ? authErr.message
        : 'Authentication required. Please sign in as an administrator.';
      return { success: false, code, error: message };
    }

    // 2. Server Environment & Client Initialization (CONFIGURATION_ERROR)
    let adminClient;
    try {
      adminClient = createAdminClient();
    } catch (configErr: unknown) {
      console.error('[Storage Action] Server configuration error:', configErr instanceof Error ? configErr.message : 'Missing configuration');
      return {
        success: false,
        code: 'CONFIGURATION_ERROR',
        error: 'Storage service configuration error on server.',
      };
    }

    // 3. Payload Validation (UPLOAD_FAILED)
    const validation = validateImageFile({
      name: input?.filename,
      size: input?.fileSize,
      type: input?.contentType,
    });
    if (!validation.valid) {
      return {
        success: false,
        code: 'UPLOAD_FAILED',
        error: validation.error || 'Invalid image file provided.',
      };
    }

    // 4. Generate Storage Path
    const storagePath = generateCatalogStoragePath(input.contentType);

    // 5. Create Signed Upload URL in Supabase Storage (STORAGE_ERROR)
    const { data, error } = await adminClient.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      console.error('[Storage Action] createSignedUploadUrl failed for path:', storagePath, 'Error:', error?.message);
      return {
        success: false,
        code: 'STORAGE_ERROR',
        error: `Storage service error: ${error?.message || 'Failed to create signed upload token.'}`,
      };
    }

    const { data: urlData } = adminClient.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    return {
      success: true,
      signedUrl: data.signedUrl,
      path: storagePath,
      token: data.token,
      publicUrl: urlData.publicUrl,
    };
  } catch (err: unknown) {
    console.error('[Storage Action] Unexpected error:', err instanceof Error ? err.message : 'Unknown error');
    return {
      success: false,
      code: 'UPLOAD_FAILED',
      error: 'An unexpected error occurred while preparing image upload. Please retry.',
    };
  }
}

/**
 * Generates an authenticated signed upload URL for category images in the 'products' storage bucket.
 * Uses the isolated 'categories/' prefix.
 * Allows client browser to directly upload category images up to 5MB, bypassing Vercel serverless function payload limits.
 * Differentiates UNAUTHENTICATED, FORBIDDEN, CONFIGURATION_ERROR, STORAGE_ERROR, and UPLOAD_FAILED.
 */
export async function createCategoryImageUploadUrlAction(
  input: CreateSignedUploadUrlInput
): Promise<CreateSignedUploadUrlResult> {
  try {
    // 1. Admin Authentication & Role Verification (UNAUTHENTICATED / FORBIDDEN)
    try {
      await requireAdminAuth();
    } catch (authErr: unknown) {
      const isAuthError = authErr instanceof Error && authErr.name === 'AdminAuthError';
      const code = (isAuthError && (authErr as any).code === 'FORBIDDEN') ? 'FORBIDDEN' : 'UNAUTHENTICATED';
      const message = authErr instanceof Error
        ? authErr.message
        : 'Authentication required. Please sign in as an administrator.';
      return { success: false, code, error: message };
    }

    // 2. Server Environment & Client Initialization (CONFIGURATION_ERROR)
    let adminClient;
    try {
      adminClient = createAdminClient();
    } catch (configErr: unknown) {
      console.error('[Storage Action] Server configuration error:', configErr instanceof Error ? configErr.message : 'Missing configuration');
      return {
        success: false,
        code: 'CONFIGURATION_ERROR',
        error: 'Storage service configuration error on server.',
      };
    }

    // 3. Payload Validation (UPLOAD_FAILED)
    const validation = validateImageFile({
      name: input?.filename,
      size: input?.fileSize,
      type: input?.contentType,
    });
    if (!validation.valid) {
      return {
        success: false,
        code: 'UPLOAD_FAILED',
        error: validation.error || 'Invalid image file provided.',
      };
    }

    // 4. Generate Storage Path under categories/
    const storagePath = generateCategoryStoragePath(input.contentType);

    // 5. Create Signed Upload URL in Supabase Storage (STORAGE_ERROR)
    const { data, error } = await adminClient.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      console.error('[Storage Action] createSignedUploadUrl failed for path:', storagePath, 'Error:', error?.message);
      return {
        success: false,
        code: 'STORAGE_ERROR',
        error: `Storage service error: ${error?.message || 'Failed to create signed upload token.'}`,
      };
    }

    const { data: urlData } = adminClient.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    return {
      success: true,
      signedUrl: data.signedUrl,
      path: storagePath,
      token: data.token,
      publicUrl: urlData.publicUrl,
    };
  } catch (err: unknown) {
    console.error('[Storage Action] Unexpected error:', err instanceof Error ? err.message : 'Unknown error');
    return {
      success: false,
      code: 'UPLOAD_FAILED',
      error: 'An unexpected error occurred while preparing category image upload. Please retry.',
    };
  }
}

/**
 * Validates and uploads a product image to the Supabase Storage 'products' bucket.
 * Requires active administrator authorization.
 */
export async function uploadProductImageAction(formData: FormData): Promise<UploadImageResult> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const file = formData.get('file') as File | null;
    if (!file) {
      return { success: false, error: 'No image file provided.' };
    }

    const validation = validateImageFile({
      name: file.name,
      size: file.size,
      type: file.type,
    });
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const storagePath = generateCatalogStoragePath(file.type);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await adminClient.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      return { success: false, error: `Storage upload failed: ${uploadError.message}` };
    }

    const { data: urlData } = adminClient.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    return {
      success: true,
      url: urlData.publicUrl,
      path: storagePath,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Image upload failed.',
    };
  }
}

/**
 * Attaches an image record to a product and optional variant in public.product_images.
 */
export async function attachProductImageAction(
  input: AttachImageInput
): Promise<{ success: boolean; image?: ProductImage; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!input.productId?.trim() || !input.url?.trim()) {
      return { success: false, error: 'Product ID and image URL are required.' };
    }

    // If marked primary, unset existing primary images for this product
    if (input.isPrimary) {
      await (adminClient.from('product_images') as any)
        .update({ is_primary: false })
        .eq('product_id', input.productId);
    }

    // If displayOrder not specified, set it to the next available order
    let displayOrder = input.displayOrder;
    if (displayOrder === undefined) {
      const { data: existingImages } = await (adminClient.from('product_images') as any)
        .select('display_order')
        .eq('product_id', input.productId)
        .order('display_order', { ascending: false })
        .limit(1);

      displayOrder = existingImages && existingImages.length > 0 ? (existingImages[0].display_order + 1) : 0;
    }

    const { data: created, error: insertError } = await (adminClient.from('product_images') as any)
      .insert({
        product_id: input.productId,
        variant_id: input.variantId || null,
        url: input.url.trim(),
        alt_text: input.altText?.trim() || null,
        display_order: displayOrder,
        is_primary: Boolean(input.isPrimary),
      })
      .select()
      .single();

    if (insertError || !created) {
      return { success: false, error: insertError?.message || 'Failed to attach product image.' };
    }

    revalidatePath(`/admin/products/${input.productId}`);
    revalidatePath('/shop');

    return {
      success: true,
      image: {
        id: created.id,
        productId: created.product_id,
        variantId: created.variant_id,
        url: created.url,
        altText: created.alt_text,
        displayOrder: created.display_order,
        isPrimary: created.is_primary,
        createdAt: created.created_at,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An error occurred attaching image.',
    };
  }
}

/**
 * Sets an image as the primary cover photo for a product.
 */
export async function setPrimaryProductImageAction(
  productId: string,
  imageId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    // Reset other images
    await (adminClient.from('product_images') as any)
      .update({ is_primary: false })
      .eq('product_id', productId);

    // Set target image
    const { error } = await (adminClient.from('product_images') as any)
      .update({ is_primary: true })
      .eq('id', imageId)
      .eq('product_id', productId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(`/admin/products/${productId}`);
    revalidatePath('/shop');
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update primary image.',
    };
  }
}

/**
 * Updates the variant association of a product image.
 * Passing variantId = null associates the image with the product in general (all variations).
 */
export async function updateProductImageVariantAction(
  productId: string,
  imageId: string,
  variantId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const { error } = await (adminClient.from('product_images') as any)
      .update({ variant_id: variantId || null })
      .eq('id', imageId)
      .eq('product_id', productId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(`/admin/products/${productId}`);
    revalidatePath('/shop');
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update image variation.',
    };
  }
}


/**
 * Reorders product gallery images.
 */
export async function reorderProductImagesAction(
  productId: string,
  imageIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    for (let index = 0; index < imageIds.length; index++) {
      await (adminClient.from('product_images') as any)
        .update({ display_order: index })
        .eq('id', imageIds[index])
        .eq('product_id', productId);
    }

    revalidatePath(`/admin/products/${productId}`);
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to reorder images.',
    };
  }
}

/**
 * Deletes a product image record and safely attempts to remove it from Storage if not referenced elsewhere.
 */
export async function deleteProductImageAction(
  productId: string,
  imageId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    // Fetch image details
    const { data: imgRow } = await (adminClient.from('product_images') as any)
      .select('id, url, is_primary')
      .eq('id', imageId)
      .eq('product_id', productId)
      .single();

    if (!imgRow) {
      return { success: false, error: 'Image not found.' };
    }

    // Delete database record
    const { error: dbDeleteError } = await (adminClient.from('product_images') as any)
      .delete()
      .eq('id', imageId);

    if (dbDeleteError) {
      return { success: false, error: dbDeleteError.message };
    }

    // If deleted image was primary, promote the first remaining image to primary
    if (imgRow.is_primary) {
      const { data: remaining } = await (adminClient.from('product_images') as any)
        .select('id')
        .eq('product_id', productId)
        .order('display_order', { ascending: true })
        .limit(1);

      if (remaining && remaining.length > 0) {
        await (adminClient.from('product_images') as any)
          .update({ is_primary: true })
          .eq('id', remaining[0].id);
      }
    }

    // Safely delete from Storage if not referenced anywhere else in the catalog or orders
    try {
      const storagePath = extractAndValidateCatalogPath(imgRow.url);
      if (storagePath) {
        const { referenced, error: refError } = await isStorageObjectReferenced(adminClient, storagePath);
        if (!referenced && !refError) {
          await adminClient.storage.from(BUCKET_NAME).remove([storagePath]);
        }
      }
    } catch {
      // Storage cleanup is best-effort; don't fail the action if deletion was already done
    }

    revalidatePath(`/admin/products/${productId}`);
    revalidatePath('/shop');
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete product image.',
    };
  }
}

/**
 * Safely parses, canonicalizes, and validates the storage object path from a public Storage URL.
 * Strictly verifies:
 * 1. String length and absence of null bytes (%00, \0), path traversal (..), or backslashes (\).
 * 2. Origin matches the configured NEXT_PUBLIC_SUPABASE_URL (rejects arbitrary hostnames).
 * 3. Exact expected public Storage URL structure: /storage/v1/object/public/products/<dir>/<filename>
 * 4. Rejects repeated slashes (//) and malformed percent-encoding.
 * 5. Rejects paths outside allowed directories and filenames not conforming to supported naming convention.
 */
function extractAndValidateStoragePath(
  imageUrl: string,
  allowedDirs: ('catalog' | 'categories')[] = ['catalog', 'categories']
): string | null {
  if (!imageUrl || typeof imageUrl !== 'string') return null;

  const raw = imageUrl.trim();
  if (!raw || raw.length > 2048) return null;

  // Reject raw null bytes, traversal sequences, or backslashes
  if (/(\0|%00|\.\.|%2e%2e|\\|%5c)/i.test(raw)) return null;

  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!configuredUrl) return null;

  let trustedOrigin: string;
  try {
    trustedOrigin = new URL(configuredUrl).origin.toLowerCase();
  } catch {
    return null;
  }

  let parsed: URL;
  try {
    if (raw.startsWith('/')) {
      // Root-relative path: anchor strictly to trusted Supabase origin
      parsed = new URL(raw, trustedOrigin);
    } else {
      parsed = new URL(raw);
      // Absolute URL: origin must strictly match configured Supabase project URL
      if (parsed.origin.toLowerCase() !== trustedOrigin) {
        return null;
      }
    }
  } catch {
    return null;
  }

  // Reject repeated slashes in pathname
  if (parsed.pathname.includes('//')) return null;

  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }

  // Verify decoded pathname does not contain traversal, backslashes, or null bytes
  if (decodedPathname.includes('..') || decodedPathname.includes('\\') || decodedPathname.includes('\0')) {
    return null;
  }

  // Require exact expected public Storage URL structure for the 'products' bucket
  const baseBucketPrefix = `/storage/v1/object/public/${BUCKET_NAME}/`;
  if (!decodedPathname.startsWith(baseBucketPrefix)) {
    return null;
  }

  const relative = decodedPathname.slice(baseBucketPrefix.length);
  const parts = relative.split('/');
  if (parts.length !== 2) {
    return null;
  }

  const [dir, filename] = parts;
  if (!allowedDirs.includes(dir as any)) {
    return null;
  }

  // Supported naming convention: accommodates upload generator (timestamp-suffix.ext)
  // as well as standard catalog alphanumeric/hyphen/underscore legacy filenames
  const validFilenameRegex = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i;
  if (!validFilenameRegex.test(filename)) {
    return null;
  }

  return `${dir}/${filename}`;
}

function extractAndValidateCatalogPath(imageUrl: string): string | null {
  return extractAndValidateStoragePath(imageUrl, ['catalog']);
}


/**
 * Checks whether an object path is referenced anywhere across all confirmed image-bearing tables:
 * - product_images.url (covers product gallery and variant-specific imagery via variant_id)
 * - categories.image_url
 * - order_items.image_url
 * - banners.image_url & banners.mobile_image_url
 *
 * NOTE ON DISTRIBUTED RACE CONDITION & SAFE ARCHITECTURE:
 * An inherent race window exists between this database reference verification and the subsequent Storage API
 * deletion call (`adminClient.storage.from().remove()`). Because Supabase Storage operates outside PostgreSQL ACID
 * transaction boundaries, an image could theoretically be attached concurrently in another session immediately after
 * this check passes but before the Storage object is removed.
 * In a future phase with high-volume concurrent multi-admin catalog authoring, a transactional tombstone table
 * with a delayed soft-delete grace period is recommended. This architectural limitation is explicitly acknowledged.
 *
 * Employs exact reference checks and exact query-string/fragment prefix matches.
 * Avoids arbitrary substring matching and unsafe PostgREST filter string interpolation.
 * Fail-closed design: Returns referenced: true if any check throws, errors, or returns ambiguous results.
 */
async function isStorageObjectReferenced(
  adminClient: ReturnType<typeof createAdminClient>,
  objectPath: string
): Promise<{ referenced: boolean; error?: string }> {
  try {
    const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
    const baseOrigin = configuredUrl.replace(/\/+$/, '');
    const canonicalFullUrl = `${baseOrigin}/storage/v1/object/public/${BUCKET_NAME}/${objectPath}`;
    const canonicalRootPath = `/storage/v1/object/public/${BUCKET_NAME}/${objectPath}`;

    const candidateUrls = Array.from(
      new Set([
        canonicalFullUrl,
        canonicalRootPath,
        encodeURI(canonicalFullUrl),
        encodeURI(canonicalRootPath),
      ])
    ).filter(Boolean);

    // Escape LIKE wildcards (underscore and percent) for strict query-string and fragment matching
    const escapedFullQueryPattern = canonicalFullUrl.replace(/[_%]/g, '\\$&') + '?%';
    const escapedPathQueryPattern = canonicalRootPath.replace(/[_%]/g, '\\$&') + '?%';
    const escapedFullHashPattern = canonicalFullUrl.replace(/[_%]/g, '\\$&') + '#%';
    const escapedPathHashPattern = canonicalRootPath.replace(/[_%]/g, '\\$&') + '#%';

    // Run parallel parameterized checks across all image-bearing tables in the schema
    const results = await Promise.all([
      // 1. product_images (covers all product gallery & variant-specific images via variant_id)
      (adminClient.from('product_images') as any)
        .select('id', { count: 'exact', head: true })
        .in('url', candidateUrls),
      (adminClient.from('product_images') as any)
        .select('id', { count: 'exact', head: true })
        .like('url', escapedFullQueryPattern),
      (adminClient.from('product_images') as any)
        .select('id', { count: 'exact', head: true })
        .like('url', escapedPathQueryPattern),
      (adminClient.from('product_images') as any)
        .select('id', { count: 'exact', head: true })
        .like('url', escapedFullHashPattern),
      (adminClient.from('product_images') as any)
        .select('id', { count: 'exact', head: true })
        .like('url', escapedPathHashPattern),

      // 2. categories (image_url)
      (adminClient.from('categories') as any)
        .select('id', { count: 'exact', head: true })
        .in('image_url', candidateUrls),
      (adminClient.from('categories') as any)
        .select('id', { count: 'exact', head: true })
        .like('image_url', escapedFullQueryPattern),
      (adminClient.from('categories') as any)
        .select('id', { count: 'exact', head: true })
        .like('image_url', escapedPathQueryPattern),

      // 3. order_items (historical order snapshots)
      (adminClient.from('order_items') as any)
        .select('id', { count: 'exact', head: true })
        .in('image_url', candidateUrls),
      (adminClient.from('order_items') as any)
        .select('id', { count: 'exact', head: true })
        .like('image_url', escapedFullQueryPattern),
      (adminClient.from('order_items') as any)
        .select('id', { count: 'exact', head: true })
        .like('image_url', escapedPathQueryPattern),

      // 4. banners (image_url & mobile_image_url)
      (adminClient.from('banners') as any)
        .select('id', { count: 'exact', head: true })
        .in('image_url', candidateUrls),
      (adminClient.from('banners') as any)
        .select('id', { count: 'exact', head: true })
        .like('image_url', escapedFullQueryPattern),
      (adminClient.from('banners') as any)
        .select('id', { count: 'exact', head: true })
        .like('image_url', escapedPathQueryPattern),
      (adminClient.from('banners') as any)
        .select('id', { count: 'exact', head: true })
        .in('mobile_image_url', candidateUrls),
      (adminClient.from('banners') as any)
        .select('id', { count: 'exact', head: true })
        .like('mobile_image_url', escapedFullQueryPattern),
      (adminClient.from('banners') as any)
        .select('id', { count: 'exact', head: true })
        .like('mobile_image_url', escapedPathQueryPattern),
    ]);

    // Fail-closed verification: If any query returned an error, refuse deletion
    for (const res of results) {
      if (res.error) {
        return {
          referenced: true,
          error: `Database reference verification failed (${res.error.message}). Deletion refused for safety.`,
        };
      }
    }

    // Check if any query found matching records
    const hasReference = results.some((res) => (res.count || 0) > 0);

    return { referenced: hasReference };
  } catch (err: unknown) {
    return {
      referenced: true,
      error: err instanceof Error ? err.message : 'Database reference check encountered an unexpected error. Deletion refused.',
    };
  }
}

/**
 * Safely cleans up an uploaded image that has NOT yet been attached to any product, category, or order.
 * Strictly verifies:
 * 1. Caller is an authenticated active administrator.
 * 2. URL belongs to the 'products' bucket and matches the expected 'catalog/' path format.
 * 3. Origin strictly matches the trusted configured NEXT_PUBLIC_SUPABASE_URL.
 * 4. Removes query strings (?v=123) and URL fragments (#anchor) before path validation using new URL().
 * 5. Strictly prevents path traversal ('..'), malformed characters, and non-catalog paths.
 * 6. NO database record in public.product_images, public.categories, public.order_items, or public.banners references this file.
 */
export async function deleteUnattachedProductImageAction(
  imageUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!imageUrl?.trim()) {
      return { success: false, error: 'Image URL is required.' };
    }

    const storagePath = extractAndValidateCatalogPath(imageUrl);
    if (!storagePath) {
      return { success: false, error: 'Malformed, unrecognized, or unauthorized storage object URL/path.' };
    }

    // STRICT SAFETY CHECK: Ensure NO database record references this image across any table
    const { referenced, error: checkError } = await isStorageObjectReferenced(adminClient, storagePath);
    if (checkError) {
      return { success: false, error: checkError };
    }

    if (referenced) {
      return {
        success: false,
        error: 'Cannot delete: this image is referenced by an existing product, category, order, or banner record in the catalog.',
      };
    }

    // Safely remove unattached object from storage
    const { error: removeError } = await adminClient.storage
      .from(BUCKET_NAME)
      .remove([storagePath]);

    if (removeError) {
      return { success: false, error: removeError.message };
    }

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete unattached image.',
    };
  }
}

/**
 * Safely cleans up an uploaded category image that has NOT yet been attached or referenced in the catalog.
 */
export async function deleteUnattachedCategoryImageAction(
  imageUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!imageUrl?.trim()) {
      return { success: false, error: 'Image URL is required.' };
    }

    const storagePath = extractAndValidateStoragePath(imageUrl, ['categories']);
    if (!storagePath) {
      return { success: false, error: 'Malformed, unrecognized, or unauthorized storage object URL/path.' };
    }

    // STRICT SAFETY CHECK: Ensure NO database record references this image across any table
    const { referenced, error: checkError } = await isStorageObjectReferenced(adminClient, storagePath);
    if (checkError) {
      return { success: false, error: checkError };
    }

    if (referenced) {
      return {
        success: false,
        error: 'Cannot delete: this image is referenced by an existing product, category, order, or banner record in the catalog.',
      };
    }

    const { error: removeError } = await adminClient.storage
      .from(BUCKET_NAME)
      .remove([storagePath]);

    if (removeError) {
      return { success: false, error: removeError.message };
    }

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete unattached category image.',
    };
  }
}
