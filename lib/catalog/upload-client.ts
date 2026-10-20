import { createClient } from '@/lib/supabase/client';
import {
  createProductImageUploadUrlAction,
  createProductImagePairUploadUrlAction,
  createCategoryImageUploadUrlAction,
  deleteUnattachedProductImageAction,
  type UploadImageResult,
  type CreateSignedUploadUrlInput,
  type CreateSignedUploadUrlResult,
  type SignedUploadTarget,
} from '@/lib/catalog/storage';
import {
  MAX_IMAGE_FILE_SIZE,
  ALLOWED_IMAGE_MIME_TYPES,
  validateImageFile,
} from '@/lib/catalog/image-validation';
import { optimizeProductImage } from '@/lib/catalog/image-optimizer';

export { MAX_IMAGE_FILE_SIZE, ALLOWED_IMAGE_MIME_TYPES, validateImageFile };

export interface ProductUploadResult extends UploadImageResult {
  thumbnailUrl?: string;
  thumbnailPath?: string;
}

/**
 * Uploads a binary payload directly to Supabase Storage using a signed upload target.
 * Tries Supabase client SDK first, then falls back to direct HTTP PUT.
 */
async function uploadToSignedTarget(
  target: SignedUploadTarget,
  fileOrBlob: File | Blob,
  contentType: string = 'image/webp'
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  let uploadErrorMessage: string | null = null;

  try {
    // Strategy A: Supabase SDK uploadToSignedUrl
    if (supabase) {
      const { error: uploadError } = await supabase.storage
        .from('products')
        .uploadToSignedUrl(target.path, target.token, fileOrBlob, {
          contentType,
          upsert: false,
          cacheControl: '86400',
        });

      if (!uploadError) {
        return { success: true };
      }
      uploadErrorMessage = uploadError.message;
    }

    // Strategy B: Direct HTTP PUT with signed URL
    if (target.signedUrl) {
      const putResponse = await fetch(target.signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'cache-control': 'max-age=86400',
        },
        body: fileOrBlob,
      });

      if (putResponse.ok) {
        return { success: true };
      }
      uploadErrorMessage = `Storage upload failed with HTTP ${putResponse.status}: ${putResponse.statusText}`;
    }

    return {
      success: false,
      error: uploadErrorMessage || 'Direct storage upload failed. Please check your network connection and retry.',
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unexpected network error during storage upload.',
    };
  }
}

/**
 * Shared client-side direct-to-storage signed uploader for generic files.
 */
async function uploadFileUsingSignedAction(
  file: File,
  entityLabel: string,
  createSignedUrlFn: (input: CreateSignedUploadUrlInput) => Promise<CreateSignedUploadUrlResult>
): Promise<UploadImageResult> {
  // 1. Client-side validation
  const validation = validateImageFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // 2. Request authenticated signed upload URL from server
  let signRes: CreateSignedUploadUrlResult;
  try {
    signRes = await createSignedUrlFn({
      filename: file.name,
      contentType: file.type,
      fileSize: file.size,
    });
  } catch (signErr: unknown) {
    const rawMsg = signErr instanceof Error ? signErr.message : '';
    const isMaskedRenderError = rawMsg.includes('Server Components render') || rawMsg.includes('Failed to find Server Action');
    const displayMsg = isMaskedRenderError
      ? 'Authorization request failed (session may be stale). Please refresh the page and verify your administrator login.'
      : (rawMsg || `Failed to authorize ${entityLabel} image upload. Please ensure you are logged in as an administrator.`);

    return {
      success: false,
      code: 'UNAUTHENTICATED',
      error: displayMsg,
    };
  }

  if (!signRes.success || !signRes.path || !signRes.token || !signRes.publicUrl) {
    if (signRes.code === 'UNAUTHENTICATED') {
      return {
        success: false,
        code: 'UNAUTHENTICATED',
        error: 'Your administrator session has expired. Please refresh the page or log in again to upload images.',
      };
    }
    if (signRes.code === 'FORBIDDEN') {
      return {
        success: false,
        code: 'FORBIDDEN',
        error: `Access denied: Active administrative privileges are required to upload ${entityLabel} images.`,
      };
    }
    if (signRes.code === 'CONFIGURATION_ERROR') {
      return {
        success: false,
        code: 'CONFIGURATION_ERROR',
        error: 'Storage service configuration error on server. Please notify the technical administrator.',
      };
    }
    return {
      success: false,
      code: signRes.code || 'UPLOAD_FAILED',
      error: signRes.error || `Failed to authorize ${entityLabel} image upload with storage.`,
    };
  }

  const uploadResult = await uploadToSignedTarget(
    {
      signedUrl: signRes.signedUrl || '',
      path: signRes.path,
      token: signRes.token,
      publicUrl: signRes.publicUrl,
    },
    file,
    file.type
  );

  if (uploadResult.success) {
    return {
      success: true,
      url: signRes.publicUrl,
      path: signRes.path,
    };
  }

  return {
    success: false,
    error: uploadResult.error || 'Direct storage upload failed.',
  };
}

/**
 * Robust client-side product image uploader.
 * Encodes raster uploads to optimized master WebP (<=1200px) and companion thumbnail WebP (<=320px)
 * via browser Canvas before direct signed upload to Supabase Storage.
 */
export async function uploadProductImageFile(file: File): Promise<ProductUploadResult> {
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

  // In non-browser environments (e.g., Node test simulators), fall back to standard signed upload
  if (!isBrowser) {
    return uploadFileUsingSignedAction(file, 'product', createProductImageUploadUrlAction);
  }

  // 1. Browser-side WebP optimization
  let optimized;
  try {
    optimized = await optimizeProductImage(file);
  } catch (optErr: unknown) {
    const errorMsg = optErr instanceof Error ? optErr.message : 'Image optimization failed.';
    return {
      success: false,
      error: `Could not optimize image for upload: ${errorMsg}`,
    };
  }

  // 2. Request authenticated signed upload tokens for both Master and Thumbnail
  let pairRes;
  try {
    pairRes = await createProductImagePairUploadUrlAction({
      masterSize: optimized.master.size,
      thumbnailSize: optimized.thumbnail.size,
    });
  } catch (signErr: unknown) {
    const rawMsg = signErr instanceof Error ? signErr.message : '';
    return {
      success: false,
      code: 'UNAUTHENTICATED',
      error: rawMsg || 'Failed to authorize product image upload with storage.',
    };
  }

  if (!pairRes.success || !pairRes.master || !pairRes.thumbnail) {
    return {
      success: false,
      code: pairRes.code || 'UPLOAD_FAILED',
      error: pairRes.error || 'Failed to authorize product image upload with storage.',
    };
  }

  // 3. Perform parallel uploads of Master and Thumbnail, ensuring both settle before any cleanup
  const [masterSettled, thumbSettled] = await Promise.allSettled([
    uploadToSignedTarget(pairRes.master, optimized.master.blob, 'image/webp'),
    uploadToSignedTarget(pairRes.thumbnail, optimized.thumbnail.blob, 'image/webp'),
  ]);

  const masterSuccess = masterSettled.status === 'fulfilled' && masterSettled.value.success;
  const thumbSuccess = thumbSettled.status === 'fulfilled' && thumbSettled.value.success;

  if (!masterSuccess || !thumbSuccess) {
    const cleanupErrors: string[] = [];

    // If master uploaded successfully before thumbnail failed, remove it so no orphan remains
    if (masterSuccess) {
      try {
        const cleanupMaster = await deleteUnattachedProductImageAction(pairRes.master.publicUrl);
        if (!cleanupMaster.success) {
          cleanupErrors.push(`Master cleanup: ${cleanupMaster.error || 'Failed to remove'}`);
        }
      } catch (cleanErr: unknown) {
        cleanupErrors.push(`Master cleanup error: ${cleanErr instanceof Error ? cleanErr.message : 'Unknown'}`);
      }
    }

    // If thumbnail uploaded successfully before master failed, remove it so no orphan remains
    if (thumbSuccess) {
      try {
        const cleanupThumb = await deleteUnattachedProductImageAction(pairRes.thumbnail.publicUrl);
        if (!cleanupThumb.success) {
          cleanupErrors.push(`Thumbnail cleanup: ${cleanupThumb.error || 'Failed to remove'}`);
        }
      } catch (cleanErr: unknown) {
        cleanupErrors.push(`Thumbnail cleanup error: ${cleanErr instanceof Error ? cleanErr.message : 'Unknown'}`);
      }
    }

    const masterErrorMsg = masterSettled.status === 'fulfilled'
      ? (masterSettled.value.error || (masterSuccess ? null : 'Master upload failed'))
      : (masterSettled.reason?.message || 'Master upload encountered network failure');

    const thumbErrorMsg = thumbSettled.status === 'fulfilled'
      ? (thumbSettled.value.error || (thumbSuccess ? null : 'Thumbnail upload failed'))
      : (thumbSettled.reason?.message || 'Thumbnail upload encountered network failure');

    const failureReasons = [
      !masterSuccess ? `Master: ${masterErrorMsg}` : null,
      !thumbSuccess ? `Thumbnail: ${thumbErrorMsg}` : null,
    ].filter(Boolean).join('; ');

    const cleanupWarning = cleanupErrors.length > 0
      ? ` [Storage Cleanup Warning: ${cleanupErrors.join('; ')}]`
      : '';

    return {
      success: false,
      error: `Product image upload failed (${failureReasons}).${cleanupWarning}`,
    };
  }

  // 4. Successful dual-upload
  return {
    success: true,
    url: pairRes.master.publicUrl,
    path: pairRes.master.path,
    thumbnailUrl: pairRes.thumbnail.publicUrl,
    thumbnailPath: pairRes.thumbnail.path,
  };
}

/**
 * Robust client-side category image uploader using authenticated signed direct uploads.
 */
export async function uploadCategoryImageFile(file: File): Promise<UploadImageResult> {
  return uploadFileUsingSignedAction(file, 'category', createCategoryImageUploadUrlAction);
}
