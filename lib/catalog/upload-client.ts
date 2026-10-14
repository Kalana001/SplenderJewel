import { createClient } from '@/lib/supabase/client';
import {
  createProductImageUploadUrlAction,
  createCategoryImageUploadUrlAction,
  type UploadImageResult,
  type CreateSignedUploadUrlInput,
  type CreateSignedUploadUrlResult,
} from '@/lib/catalog/storage';
import {
  MAX_IMAGE_FILE_SIZE,
  ALLOWED_IMAGE_MIME_TYPES,
  validateImageFile,
} from '@/lib/catalog/image-validation';

export { MAX_IMAGE_FILE_SIZE, ALLOWED_IMAGE_MIME_TYPES, validateImageFile };

/**
 * Shared client-side direct-to-storage signed uploader.
 * Validates file on client, calls server action to obtain signed upload token/URL,
 * and performs binary upload directly to Supabase Storage.
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

  // 3. Direct upload to Supabase Storage via signed URL
  const supabase = createClient();
  let uploadErrorMessage: string | null = null;

  try {
    // Strategy A: Supabase SDK uploadToSignedUrl
    if (supabase) {
      const { error: uploadError } = await supabase.storage
        .from('products')
        .uploadToSignedUrl(signRes.path, signRes.token, file, {
          contentType: file.type,
          upsert: false,
        });

      if (!uploadError) {
        return {
          success: true,
          url: signRes.publicUrl,
          path: signRes.path,
        };
      }
      uploadErrorMessage = uploadError.message;
    }

    // Strategy B: Direct HTTP PUT with signed URL (for environments where browser client is uninitialized)
    if (signRes.signedUrl) {
      const putResponse = await fetch(signRes.signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });

      if (putResponse.ok) {
        return {
          success: true,
          url: signRes.publicUrl,
          path: signRes.path,
        };
      }
      uploadErrorMessage = `Storage upload failed with HTTP ${putResponse.status}: ${putResponse.statusText}`;
    }

    return {
      success: false,
      error: uploadErrorMessage || 'Direct storage upload failed. Please check your network connection and retry.',
    };
  } catch (uploadErr: unknown) {
    return {
      success: false,
      error:
        uploadErr instanceof Error
          ? `Storage upload error: ${uploadErr.message}`
          : 'Direct storage upload encountered an unexpected network error. Please retry.',
    };
  }
}

/**
 * Robust client-side product image uploader using authenticated signed direct uploads.
 */
export async function uploadProductImageFile(file: File): Promise<UploadImageResult> {
  return uploadFileUsingSignedAction(file, 'product', createProductImageUploadUrlAction);
}

/**
 * Robust client-side category image uploader using authenticated signed direct uploads.
 */
export async function uploadCategoryImageFile(file: File): Promise<UploadImageResult> {
  return uploadFileUsingSignedAction(file, 'category', createCategoryImageUploadUrlAction);
}
