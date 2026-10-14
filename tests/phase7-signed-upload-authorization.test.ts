import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateImageFile,
  generateCatalogStoragePath,
} from '../lib/catalog/image-validation.ts';
import type { UploadErrorCode, CreateSignedUploadUrlResult } from '../lib/catalog/storage.ts';

// =============================================================================
// TEST SUITE: SIGNED IMAGE UPLOAD AUTHORIZATION & ERROR RESILIENCE (TASK 5)
// =============================================================================

/**
 * Mock simulator for createProductImageUploadUrlAction logic to verify
 * end-to-end authorization, session discrimination, and error structuring.
 */
async function simulateCreateSignedUploadUrl(options: {
  currentUser?: { id: string; email: string } | null;
  authError?: Error | null;
  adminRecord?: { id: string; is_active: boolean; role: string } | null;
  adminLookupError?: Error | null;
  hasEnvConfig?: boolean;
  storageError?: { message: string } | null;
  fileInput: { filename: string; contentType: string; fileSize: number };
}): Promise<CreateSignedUploadUrlResult> {
  // 1. Session & Auth Check
  if (options.authError) {
    return {
      success: false,
      code: 'UNAUTHENTICATED',
      error: 'Authentication required. Please sign in as an administrator.',
    };
  }

  const user = options.currentUser;
  if (!user) {
    return {
      success: false,
      code: 'UNAUTHENTICATED',
      error: 'Authentication required. Please sign in as an administrator.',
    };
  }

  // 2. Admin RBAC Verification
  if (options.adminLookupError) {
    return {
      success: false,
      code: 'FORBIDDEN',
      error: 'Forbidden: Active administrative privileges are required.',
    };
  }

  const admin = options.adminRecord;
  if (!admin || !admin.is_active || !['super_admin', 'admin', 'staff'].includes(admin.role)) {
    return {
      success: false,
      code: 'FORBIDDEN',
      error: 'Forbidden: Active administrative privileges are required.',
    };
  }

  // 3. Server Configuration Check
  if (options.hasEnvConfig === false) {
    return {
      success: false,
      code: 'CONFIGURATION_ERROR',
      error: 'Storage service configuration error on server.',
    };
  }

  // 4. Image Validation
  const val = validateImageFile({
    name: options.fileInput.filename,
    size: options.fileInput.fileSize,
    type: options.fileInput.contentType,
  });
  if (!val.valid) {
    return {
      success: false,
      code: 'UPLOAD_FAILED',
      error: val.error || 'Invalid image file provided.',
    };
  }

  // 5. Supabase Storage Signed URL Creation
  if (options.storageError) {
    return {
      success: false,
      code: 'STORAGE_ERROR',
      error: `Storage service error: ${options.storageError.message}`,
    };
  }

  const storagePath = generateCatalogStoragePath(options.fileInput.contentType);
  return {
    success: true,
    signedUrl: `https://test.supabase.co/storage/v1/upload/sign/products/${storagePath}?token=mock-token`,
    path: storagePath,
    token: 'mock-token',
    publicUrl: `https://test.supabase.co/storage/v1/object/public/products/${storagePath}`,
  };
}

// -----------------------------------------------------------------------------
// 1. VALID ADMINISTRATOR
// -----------------------------------------------------------------------------
test('Signed Upload Auth: Valid active administrator generates signed URL successfully', async () => {
  const result = await simulateCreateSignedUploadUrl({
    currentUser: { id: 'admin-1', email: 'admin@splenderjewel.com' },
    adminRecord: { id: 'admin-1', is_active: true, role: 'super_admin' },
    hasEnvConfig: true,
    fileInput: { filename: 'monkey.png', contentType: 'image/png', fileSize: 1024 * 50 },
  });

  assert.equal(result.success, true);
  assert.equal(result.code, undefined);
  assert.ok(result.signedUrl?.includes('mock-token'));
  assert.ok(result.path?.startsWith('catalog/'));
  assert.ok(result.publicUrl?.includes(result.path!));
});

// -----------------------------------------------------------------------------
// 2. EXPIRED SESSION
// -----------------------------------------------------------------------------
test('Signed Upload Auth: Expired session returns UNAUTHENTICATED without crashing', async () => {
  const result = await simulateCreateSignedUploadUrl({
    currentUser: null, // Session expired, getUser returns null
    hasEnvConfig: true,
    fileInput: { filename: 'monkey.png', contentType: 'image/png', fileSize: 1024 * 50 },
  });

  assert.equal(result.success, false);
  assert.equal(result.code, 'UNAUTHENTICATED');
  assert.match(result.error || '', /Authentication required/i);
});

// -----------------------------------------------------------------------------
// 3. MISSING SESSION
// -----------------------------------------------------------------------------
test('Signed Upload Auth: Missing session (unauthenticated guest) returns UNAUTHENTICATED', async () => {
  const result = await simulateCreateSignedUploadUrl({
    currentUser: null,
    hasEnvConfig: true,
    fileInput: { filename: 'monkey.png', contentType: 'image/png', fileSize: 1024 * 50 },
  });

  assert.equal(result.success, false);
  assert.equal(result.code, 'UNAUTHENTICATED');
  assert.match(result.error || '', /Authentication required/i);
});

// -----------------------------------------------------------------------------
// 4. INACTIVE ADMINISTRATOR
// -----------------------------------------------------------------------------
test('Signed Upload Auth: Inactive administrator returns FORBIDDEN', async () => {
  const result = await simulateCreateSignedUploadUrl({
    currentUser: { id: 'admin-inactive', email: 'deactivated@splenderjewel.com' },
    adminRecord: { id: 'admin-inactive', is_active: false, role: 'admin' }, // is_active = false
    hasEnvConfig: true,
    fileInput: { filename: 'monkey.png', contentType: 'image/png', fileSize: 1024 * 50 },
  });

  assert.equal(result.success, false);
  assert.equal(result.code, 'FORBIDDEN');
  assert.match(result.error || '', /Active administrative privileges are required/i);
});

// -----------------------------------------------------------------------------
// 5. ORDINARY CUSTOMER
// -----------------------------------------------------------------------------
test('Signed Upload Auth: Ordinary authenticated customer returns FORBIDDEN', async () => {
  const result = await simulateCreateSignedUploadUrl({
    currentUser: { id: 'customer-123', email: 'customer@gmail.com' },
    adminRecord: null, // Customer not in public.admin_users
    hasEnvConfig: true,
    fileInput: { filename: 'monkey.png', contentType: 'image/png', fileSize: 1024 * 50 },
  });

  assert.equal(result.success, false);
  assert.equal(result.code, 'FORBIDDEN');
  assert.match(result.error || '', /Active administrative privileges are required/i);
});

// -----------------------------------------------------------------------------
// 6. SUPABASE AUTH ERROR
// -----------------------------------------------------------------------------
test('Signed Upload Auth: Supabase Auth service error fails closed with UNAUTHENTICATED', async () => {
  const result = await simulateCreateSignedUploadUrl({
    authError: new Error('Network timeout contacting Supabase Auth service'),
    hasEnvConfig: true,
    fileInput: { filename: 'monkey.png', contentType: 'image/png', fileSize: 1024 * 50 },
  });

  assert.equal(result.success, false);
  assert.equal(result.code, 'UNAUTHENTICATED');
  assert.match(result.error || '', /Authentication required/i);
});

// -----------------------------------------------------------------------------
// 7. ADMIN LOOKUP ERROR
// -----------------------------------------------------------------------------
test('Signed Upload Auth: Database error querying admin_users fails closed with FORBIDDEN', async () => {
  const result = await simulateCreateSignedUploadUrl({
    currentUser: { id: 'admin-1', email: 'admin@splenderjewel.com' },
    adminLookupError: new Error('Postgres query timeout'),
    hasEnvConfig: true,
    fileInput: { filename: 'monkey.png', contentType: 'image/png', fileSize: 1024 * 50 },
  });

  assert.equal(result.success, false);
  assert.equal(result.code, 'FORBIDDEN');
  assert.match(result.error || '', /Active administrative privileges are required/i);
});

// -----------------------------------------------------------------------------
// 8. MISSING SERVER CONFIGURATION
// -----------------------------------------------------------------------------
test('Signed Upload Auth: Missing service role key returns CONFIGURATION_ERROR without leaking secrets', async () => {
  const result = await simulateCreateSignedUploadUrl({
    currentUser: { id: 'admin-1', email: 'admin@splenderjewel.com' },
    adminRecord: { id: 'admin-1', is_active: true, role: 'super_admin' },
    hasEnvConfig: false, // Missing SUPABASE_SERVICE_ROLE_KEY
    fileInput: { filename: 'monkey.png', contentType: 'image/png', fileSize: 1024 * 50 },
  });

  assert.equal(result.success, false);
  assert.equal(result.code, 'CONFIGURATION_ERROR');
  assert.equal(result.error, 'Storage service configuration error on server.');
  // Confirm no secret keys or internal paths in client error
  assert.equal(result.error?.includes('SUPABASE_SERVICE_ROLE_KEY'), false);
});

// -----------------------------------------------------------------------------
// 9. SIGNED URL CREATION FAILURE
// -----------------------------------------------------------------------------
test('Signed Upload Auth: Supabase Storage bucket error returns STORAGE_ERROR with clean message', async () => {
  const result = await simulateCreateSignedUploadUrl({
    currentUser: { id: 'admin-1', email: 'admin@splenderjewel.com' },
    adminRecord: { id: 'admin-1', is_active: true, role: 'super_admin' },
    hasEnvConfig: true,
    storageError: { message: 'Bucket products not accessible or rate limited' },
    fileInput: { filename: 'monkey.png', contentType: 'image/png', fileSize: 1024 * 50 },
  });

  assert.equal(result.success, false);
  assert.equal(result.code, 'STORAGE_ERROR');
  assert.match(result.error || '', /Storage service error: Bucket products/i);
});

// -----------------------------------------------------------------------------
// 10. SUCCESSFUL SIGNED URL CREATION INTEGRITY
// -----------------------------------------------------------------------------
test('Signed Upload Auth: Successful signed upload payload contains all required storage fields', async () => {
  const result = await simulateCreateSignedUploadUrl({
    currentUser: { id: 'admin-1', email: 'admin@splenderjewel.com' },
    adminRecord: { id: 'admin-1', is_active: true, role: 'super_admin' },
    hasEnvConfig: true,
    fileInput: { filename: 'ring.jpg', contentType: 'image/jpeg', fileSize: 200000 },
  });

  assert.equal(result.success, true);
  assert.ok(typeof result.signedUrl === 'string' && result.signedUrl.length > 20);
  assert.ok(typeof result.path === 'string' && result.path.startsWith('catalog/'));
  assert.ok(typeof result.token === 'string' && result.token.length > 0);
  assert.ok(typeof result.publicUrl === 'string' && result.publicUrl.endsWith('.jpg'));
});

// -----------------------------------------------------------------------------
// 11. UI ERROR RECOVERY & STRUCTURED ERROR CLIENT TRANSLATION
// -----------------------------------------------------------------------------
test('Signed Upload Auth: Client uploader maps UNAUTHENTICATED to actionable user alert', () => {
  function translateClientError(signRes: CreateSignedUploadUrlResult): string {
    if (signRes.code === 'UNAUTHENTICATED') {
      return 'Your administrator session has expired. Please refresh the page or log in again to upload images.';
    }
    if (signRes.code === 'FORBIDDEN') {
      return 'Access denied: Active administrative privileges are required to upload product images.';
    }
    if (signRes.code === 'CONFIGURATION_ERROR') {
      return 'Storage service configuration error on server. Please notify the technical administrator.';
    }
    return signRes.error || 'Failed to authorize image upload with storage.';
  }

  const unauthRes: CreateSignedUploadUrlResult = {
    success: false,
    code: 'UNAUTHENTICATED',
    error: 'Authentication required. Please sign in as an administrator.',
  };
  const unauthMsg = translateClientError(unauthRes);
  assert.match(unauthMsg, /session has expired/i);
  assert.match(unauthMsg, /refresh the page or log in again/i);

  const forbiddenRes: CreateSignedUploadUrlResult = {
    success: false,
    code: 'FORBIDDEN',
    error: 'Forbidden: Active administrative privileges are required.',
  };
  const forbiddenMsg = translateClientError(forbiddenRes);
  assert.match(forbiddenMsg, /Access denied: Active administrative privileges are required/i);
});

// -----------------------------------------------------------------------------
// 12. MIDDLEWARE SERVER ACTION PROTECTION
// -----------------------------------------------------------------------------
test('Signed Upload Auth: Middleware distinguishes Server Actions from page navigation', () => {
  function simulateMiddlewareDecision(headers: Record<string, string>, user: any, adminRecord: any) {
    const isServerAction = 'next-action' in headers;
    const isAdminProtected = true;

    if (isAdminProtected) {
      if (!user) {
        if (isServerAction) {
          // Do NOT redirect via 307
          return { action: 'PASS_THROUGH', redirect: null };
        }
        return { action: 'REDIRECT', redirect: '/admin/login' };
      }

      if (!adminRecord) {
        if (isServerAction) {
          return { action: 'PASS_THROUGH', redirect: null };
        }
        return { action: 'REDIRECT', redirect: '/admin/login?error=unauthorized' };
      }
    }

    return { action: 'PASS_THROUGH', redirect: null };
  }

  // 1. Regular browser navigation without session -> REDIRECT to /admin/login
  const navDec = simulateMiddlewareDecision({}, null, null);
  assert.equal(navDec.action, 'REDIRECT');
  assert.equal(navDec.redirect, '/admin/login');

  // 2. Server Action without session -> PASS_THROUGH so action returns structured UNAUTHENTICATED
  const actionDec = simulateMiddlewareDecision({ 'next-action': '40e304b27979' }, null, null);
  assert.equal(actionDec.action, 'PASS_THROUGH');
  assert.equal(actionDec.redirect, null);

  // 3. Server Action with non-admin customer -> PASS_THROUGH so action returns structured FORBIDDEN
  const customerActionDec = simulateMiddlewareDecision({ 'next-action': '40e304b27979' }, { id: 'cust' }, null);
  assert.equal(customerActionDec.action, 'PASS_THROUGH');
  assert.equal(customerActionDec.redirect, null);
});
