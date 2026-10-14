import { createClient } from '@/lib/supabase/client';
import {
  createProductImageUploadUrlAction,
  type UploadImageResult,
} from '@/lib/catalog/storage';
import {
  MAX_IMAGE_FILE_SIZE,
  ALLOWED_IMAGE_MIME_TYPES,
  validateImageFile,
} from '@/lib/catalog/image-validation';

export { MAX_IMAGE_FILE_SIZE, ALLOWED_IMAGE_MIME_TYPES, validateImageFile };

/**
 * Robust client-side product image uploader using authenticated signed direct uploads.
 *
 * Architecture:
 * 1. Immediate client-side validation for file size (<= 5MB) and MIME type (JPEG, PNG, WebP).
 * 2. Authenticated Signed Direct-Upload to Supabase Storage:
 *    - Requests a single-use signed upload URL bound to an isolated catalog path from the server.
 *    - Uploads the image binary directly to Supabase Storage from the browser.
 *    - Completely bypasses Vercel Serverless Function payload limits (4.5MB).
 *    - Completely bypasses Next.js Server Action body parsing bottlenecks.
 *    - Service-role key remains strictly on the server; client authenticates using the scoped signed token.
 * 3. Fail-closed: If signing or direct upload fails, reports a clear error immediately to allow retry.
 *    No silent fallback to multipart Server Actions.
 */
export async function uploadProductImageFile(file: File): Promise<UploadImageResult> {
  // 1. Client-side validation
  const validation = validateImageFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // 2. Request authenticated signed upload URL from server
  let signRes;
  try {
    signRes = await createProductImageUploadUrlAction({
      filename: file.name,
      contentType: file.type,
      fileSize: file.size,
    });
  } catch (signErr: unknown) {
    const rawMsg = signErr instanceof Error ? signErr.message : '';
    const isMaskedRenderError = rawMsg.includes('Server Components render') || rawMsg.includes('Failed to find Server Action');
    const displayMsg = isMaskedRenderError
      ? 'Authorization request failed (session may be stale). Please refresh the page and verify your administrator login.'
      : (rawMsg || 'Failed to authorize image upload. Please ensure you are logged in as an administrator.');

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
        error: 'Access denied: Active administrative privileges are required to upload product images.',
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
      error: signRes.error || 'Failed to authorize image upload with storage.',
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
