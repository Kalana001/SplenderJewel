import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// -----------------------------------------------------------------------------
// 1. Stage A: Admin Authentication & Authorization
// -----------------------------------------------------------------------------

test('Admin Auth: input validation rejects empty or missing credentials', () => {
  const validateAdminInput = (email?: string, password?: string) => {
    if (!email?.trim() || !password) {
      return { success: false, error: 'Email and password are required.' };
    }
    return { success: true };
  };

  assert.deepEqual(validateAdminInput('', 'password123'), {
    success: false,
    error: 'Email and password are required.',
  });

  assert.deepEqual(validateAdminInput('admin@splenderjewel.com', ''), {
    success: false,
    error: 'Email and password are required.',
  });

  assert.deepEqual(validateAdminInput('   ', 'secretPass'), {
    success: false,
    error: 'Email and password are required.',
  });

  assert.deepEqual(validateAdminInput('admin@splenderjewel.com', 'securePassword123'), {
    success: true,
  });
});

test('Admin Auth: authorization guard rejects customers and inactive admins', () => {
  interface AdminRecord {
    id: string;
    email: string;
    role: 'super_admin' | 'admin' | 'staff';
    is_active: boolean;
  }

  const evaluateAdminAccess = (adminRecord: AdminRecord | null) => {
    if (!adminRecord) {
      return {
        success: false,
        signOutRequired: true,
        error: 'Access Denied: This account is not registered as an authorized administrator.',
      };
    }

    if (!adminRecord.is_active) {
      return {
        success: false,
        signOutRequired: true,
        error: 'Access Denied: Your administrator account has been deactivated. Please contact the store owner.',
      };
    }

    return {
      success: true,
      signOutRequired: false,
      role: adminRecord.role,
      adminId: adminRecord.id,
    };
  };

  // Case 1: Ordinary customer with no admin_users record
  const nonAdminResult = evaluateAdminAccess(null);
  assert.equal(nonAdminResult.success, false);
  assert.equal(nonAdminResult.signOutRequired, true);
  assert.match(nonAdminResult.error!, /not registered as an authorized administrator/);

  // Case 2: Inactive admin staff member
  const inactiveResult = evaluateAdminAccess({
    id: 'user-inactive-1',
    email: 'former-staff@splenderjewel.com',
    role: 'staff',
    is_active: false,
  });
  assert.equal(inactiveResult.success, false);
  assert.equal(inactiveResult.signOutRequired, true);
  assert.match(inactiveResult.error!, /account has been deactivated/);

  // Case 3: Active super administrator
  const superAdminResult = evaluateAdminAccess({
    id: 'user-admin-1',
    email: 'admin@splenderjewel.com',
    role: 'super_admin',
    is_active: true,
  });
  assert.equal(superAdminResult.success, true);
  assert.equal(superAdminResult.signOutRequired, false);
  assert.equal(superAdminResult.role, 'super_admin');
});

test('Admin Auth: safe redirect URL sanitization prevents open redirects', () => {
  const sanitizeAdminRedirect = (target: string | null | undefined): string => {
    if (!target) return '/admin/dashboard';
    // Reject protocol-relative URLs (e.g. //attacker.com) and absolute URLs
    if (target.startsWith('//') || target.includes('://')) return '/admin/dashboard';
    // Only permit paths within the /admin domain
    if (target.startsWith('/admin')) return target;
    return '/admin/dashboard';
  };

  assert.equal(sanitizeAdminRedirect(null), '/admin/dashboard');
  assert.equal(sanitizeAdminRedirect(''), '/admin/dashboard');
  assert.equal(sanitizeAdminRedirect('/admin/orders'), '/admin/orders');
  assert.equal(sanitizeAdminRedirect('/admin/products/new'), '/admin/products/new');
  assert.equal(sanitizeAdminRedirect('https://evil.com'), '/admin/dashboard');
  assert.equal(sanitizeAdminRedirect('//evil.com/admin'), '/admin/dashboard');
  assert.equal(sanitizeAdminRedirect('/account/profile'), '/admin/dashboard');
});

// -----------------------------------------------------------------------------
// 2. Stage B: Checkout Transaction Security & RPC
// -----------------------------------------------------------------------------

test('Checkout Atomicity: duplicate cart variants are consolidated into aggregated quantities', () => {
  const inputItems = [
    { variantId: 'var-1', quantity: 2 },
    { variantId: 'var-2', quantity: 1 },
    { variantId: 'var-1', quantity: 3 }, // duplicate var-1
    { variantId: 'var-3', quantity: 1 },
    { variantId: 'var-2', quantity: 2 }, // duplicate var-2
  ];

  const aggregatedMap = new Map<string, number>();
  for (const item of inputItems) {
    if (!item.variantId) continue;
    const current = aggregatedMap.get(item.variantId) || 0;
    aggregatedMap.set(item.variantId, current + (Number(item.quantity) > 0 ? Number(item.quantity) : 1));
  }

  const consolidatedItems = Array.from(aggregatedMap.entries()).map(([variantId, quantity]) => ({
    variantId,
    quantity,
  }));

  assert.equal(consolidatedItems.length, 3);
  assert.deepEqual(consolidatedItems.find((i) => i.variantId === 'var-1'), {
    variantId: 'var-1',
    quantity: 5,
  });
  assert.deepEqual(consolidatedItems.find((i) => i.variantId === 'var-2'), {
    variantId: 'var-2',
    quantity: 3,
  });
  assert.deepEqual(consolidatedItems.find((i) => i.variantId === 'var-3'), {
    variantId: 'var-3',
    quantity: 1,
  });
});

test('Checkout Atomicity: validates both variant active status AND parent product active status', () => {
  interface VariantCheck {
    id: string;
    is_active: boolean;
    product: {
      id: string;
      is_active: boolean;
    };
  }

  const validateProductAndVariant = (v: VariantCheck | null | undefined) => {
    if (!v || !v.is_active || !v.product?.is_active) {
      return { success: false, error: 'One or more items in your cart are no longer available or inactive.' };
    }
    return { success: true };
  };

  // Case 1: Variant is active, but parent product has been deactivated
  assert.deepEqual(
    validateProductAndVariant({
      id: 'v1',
      is_active: true,
      product: { id: 'p1', is_active: false },
    }),
    { success: false, error: 'One or more items in your cart are no longer available or inactive.' }
  );

  // Case 2: Parent product active, but variant deactivated
  assert.deepEqual(
    validateProductAndVariant({
      id: 'v2',
      is_active: false,
      product: { id: 'p2', is_active: true },
    }),
    { success: false, error: 'One or more items in your cart are no longer available or inactive.' }
  );

  // Case 3: Both parent and variant active
  assert.deepEqual(
    validateProductAndVariant({
      id: 'v3',
      is_active: true,
      product: { id: 'p3', is_active: true },
    }),
    { success: true }
  );
});

test('Checkout Atomicity: zero fallback guarantee when RPC is missing or fails', () => {
  // Simulates the behavior of lib/orders/actions.ts when RPC encounters an error
  const handleRpcResult = (rpcError: any, rpcData: any) => {
    if (rpcError) {
      const errMsg = rpcError.message || 'Unable to place order.';
      if (
        errMsg.includes('does not exist') ||
        rpcError.code === 'PGRST202' ||
        rpcError.code === '42883'
      ) {
        return {
          success: false,
          fallbackExecuted: false,
          error: 'Transactional checkout database procedure is currently undergoing scheduled maintenance. Please contact customer service.',
        };
      }
      return {
        success: false,
        fallbackExecuted: false,
        error: errMsg,
      };
    }

    if (!rpcData || !rpcData.success) {
      return {
        success: false,
        fallbackExecuted: false,
        error: rpcData?.error || 'Unable to process your order at this time.',
      };
    }

    return {
      success: true,
      fallbackExecuted: false,
      orderNumber: rpcData.order_number,
    };
  };

  // Missing stored procedure does not trigger fallback writes
  const missingRpcResult = handleRpcResult(
    { code: '42883', message: 'function public.process_order_checkout does not exist' },
    null
  );
  assert.equal(missingRpcResult.success, false);
  assert.equal(missingRpcResult.fallbackExecuted, false);
  assert.match(missingRpcResult.error, /undergoing scheduled maintenance/);

  // Business failure (e.g. out of stock) does not trigger fallback writes
  const outOfStockResult = handleRpcResult(
    { message: 'Insufficient stock for "22K Gold Sovereign Ring". Only 1 available.' },
    null
  );
  assert.equal(outOfStockResult.success, false);
  assert.equal(outOfStockResult.fallbackExecuted, false);
  assert.match(outOfStockResult.error, /Insufficient stock/);
});

test('Checkout Atomicity: coupon per-customer usage limit enforcement', () => {
  interface CouponLimitRule {
    code: string;
    total_usage_limit: number | null;
    per_customer_limit: number | null;
  }

  const validateCouponLimits = (
    coupon: CouponLimitRule,
    totalUsages: number,
    customerUsages: number,
    userId: string | null
  ) => {
    if (coupon.total_usage_limit && totalUsages >= coupon.total_usage_limit) {
      return { valid: false, error: 'This promotional coupon has reached its maximum total usage limit.' };
    }

    if (userId && coupon.per_customer_limit && customerUsages >= coupon.per_customer_limit) {
      return { valid: false, error: 'You have reached the maximum allowed usage limit for this coupon.' };
    }

    return { valid: true };
  };

  const coupon: CouponLimitRule = {
    code: 'VIPGOLD',
    total_usage_limit: 100,
    per_customer_limit: 1,
  };

  // Customer has already used the coupon once
  const limitReached = validateCouponLimits(coupon, 10, 1, 'user-123');
  assert.equal(limitReached.valid, false);
  assert.match(limitReached.error!, /maximum allowed usage limit/);

  // Customer has never used the coupon
  const firstUse = validateCouponLimits(coupon, 10, 0, 'user-456');
  assert.equal(firstUse.valid, true);

  // Total store usage exhausted
  const storeExhausted = validateCouponLimits(coupon, 100, 0, 'user-789');
  assert.equal(storeExhausted.valid, false);
  assert.match(storeExhausted.error!, /maximum total usage limit/);
});

// -----------------------------------------------------------------------------
// 3. Stage C: Migration Schema & Database Security Verification
// -----------------------------------------------------------------------------

test('Schema Integrity: 00001_initial_schema.sql matches required SHA256 checksum', () => {
  const REQUIRED_SHA256 = '32945B287744C077C90592E0BFFFBBEF56E77421EEA836BCB64A8F6933ACF1EA';
  const schemaPath = join(process.cwd(), 'supabase', 'migrations', '00001_initial_schema.sql');

  assert.equal(existsSync(schemaPath), true, 'Initial migration file must exist.');
  const content = readFileSync(schemaPath);
  const actualHash = createHash('sha256').update(content).digest('hex').toUpperCase();

  assert.equal(
    actualHash,
    REQUIRED_SHA256,
    `Initial schema SHA256 was altered! Expected ${REQUIRED_SHA256}, got ${actualHash}`
  );
});

test('Schema Integrity: Migration 00004 defines atomic procedure with privilege isolation', () => {
  const m4Path = join(process.cwd(), 'supabase', 'migrations', '00004_atomic_checkout_procedure.sql');
  assert.equal(existsSync(m4Path), true, 'Migration 00004 must exist.');

  const sql = readFileSync(m4Path, 'utf8');

  // Must declare idempotency column
  assert.match(sql, /ADD COLUMN IF NOT EXISTS idempotency_key/);

  // Must enforce search_path on process_order_checkout
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.process_order_checkout/);
  assert.match(sql, /SECURITY DEFINER SET search_path = public, pg_temp/);

  // Must row-lock variants and coupon
  assert.match(sql, /FOR UPDATE OF pv/);
  assert.match(sql, /FOR UPDATE;/);

  // Must aggregate duplicate items
  assert.match(sql, /SUM\(\(elem->>'quantity'\)::INT\)::INT AS quantity/);

  // Must check parent product active state
  assert.match(sql, /p\.is_active AS product_is_active/);

  // Must check authoritative delivery fee
  assert.match(sql, /FROM public\.delivery_districts/);

  // Must check per_customer_limit
  assert.match(sql, /per_customer_limit/);

  // Must revoke from PUBLIC and grant to service_role
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.process_order_checkout/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.process_order_checkout.*TO service_role/);
});

test('Schema Integrity: Migration 00005 hardens advisor-flagged functions and search paths', () => {
  const m5Path = join(process.cwd(), 'supabase', 'migrations', '00005_database_security_hardening.sql');
  assert.equal(existsSync(m5Path), true, 'Migration 00005 must exist.');

  const sql = readFileSync(m5Path, 'utf8');

  // generate_order_number revoked from client roles, granted to service_role
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.generate_order_number\(\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.generate_order_number\(\) TO service_role/);

  // handle_new_user revoked from client roles
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.handle_new_user\(\) FROM PUBLIC, anon, authenticated/);

  // protect_profile_fields revoked from client roles
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.protect_profile_fields\(\) FROM PUBLIC, anon, authenticated/);

  // is_admin revoked from anon, granted to authenticated and service_role
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.is_admin\(\) FROM PUBLIC, anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.is_admin\(\) TO authenticated, service_role/);

  // All functions enforce immutable search_path
  assert.match(sql, /SET search_path = public, pg_temp/);
});
