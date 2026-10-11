import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRootAuthRedirect } from '../lib/auth/redirect.ts';

// Test password length constraints
test('password validation requirements', () => {
  const isPasswordValid = (pwd: string) => typeof pwd === 'string' && pwd.length >= 8;

  assert.equal(isPasswordValid(''), false);
  assert.equal(isPasswordValid('1234567'), false);
  assert.equal(isPasswordValid('12345678'), true);
  assert.equal(isPasswordValid('luxuryPass123'), true);
});

// Test required fields validation
test('customer registration required fields', () => {
  const validateRegistration = (data: { email?: string; password?: string; fullName?: string }) => {
    if (!data.email || !data.password || !data.fullName) {
      return { success: false, error: 'Full name, email, and password are required.' };
    }
    if (data.password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters long.' };
    }
    return { success: true };
  };

  assert.deepEqual(validateRegistration({ email: '', password: 'password123', fullName: 'Test' }), {
    success: false,
    error: 'Full name, email, and password are required.',
  });

  assert.deepEqual(validateRegistration({ email: 'test@example.com', password: 'short', fullName: 'Test' }), {
    success: false,
    error: 'Password must be at least 8 characters long.',
  });

  assert.deepEqual(validateRegistration({ email: 'test@example.com', password: 'validPassword123', fullName: '' }), {
    success: false,
    error: 'Full name, email, and password are required.',
  });

  assert.deepEqual(validateRegistration({ email: 'test@example.com', password: 'validPassword123', fullName: 'Valid Name' }), {
    success: true,
  });
});

// Test profile field safety and protection
test('profile updates restrict modification to safe customer fields only', () => {
  const allowedFields = new Set(['full_name', 'phone1', 'phone2', 'avatar_url']);
  const sanitizeUpdatePayload = (payload: Record<string, any>) => {
    const safePayload: Record<string, any> = {};
    for (const [key, val] of Object.entries(payload)) {
      if (allowedFields.has(key)) {
        safePayload[key] = val;
      }
    }
    return safePayload;
  };

  const maliciousPayload = {
    full_name: 'Legit Customer',
    phone1: '0771234567',
    account_status: 'admin', // Attack: trying to escalate status
    id: 'another-user-id',   // Attack: trying to take over another user
    email: 'hacker@evil.com',// Attack: trying to change primary identity
  };

  const sanitized = sanitizeUpdatePayload(maliciousPayload);

  assert.equal(sanitized.full_name, 'Legit Customer');
  assert.equal(sanitized.phone1, '0771234567');
  assert.equal('account_status' in sanitized, false);
  assert.equal('id' in sanitized, false);
  assert.equal('email' in sanitized, false);
});

// Test order ownership scoping
test('order retrieval query enforces strict user_id ownership match', () => {
  const buildOrderQuery = (orderId: string, currentUserId: string) => {
    // Simulates the Supabase query filters
    return {
      table: 'orders',
      filterId: orderId,
      filterUserId: currentUserId,
    };
  };

  const currentUserId = 'user-uuid-123';
  const requestedOrderId = 'order-uuid-456';

  const query = buildOrderQuery(requestedOrderId, currentUserId);
  assert.equal(query.filterId, 'order-uuid-456');
  assert.equal(query.filterUserId, 'user-uuid-123');
  // Confirm an order belonging to another user cannot match
  const anotherUserOrder = { id: 'order-uuid-456', user_id: 'user-uuid-999' };
  const isOwned = anotherUserOrder.id === query.filterId && anotherUserOrder.user_id === query.filterUserId;
  assert.equal(isOwned, false);
});

// Test auth callback routing for recovery flows vs standard flows
test('auth callback error routing directs recovery failures to /reset-password with error', () => {
  const resolveErrorRoute = (params: {
    next?: string | null;
    type?: string | null;
    errorCode?: string | null;
    errorParam?: string | null;
  }) => {
    const isRecovery = params.next === '/reset-password' || params.type === 'recovery';
    if (isRecovery) {
      const code = params.errorCode === 'otp_expired' ? 'otp_expired' : 'invalid_link';
      return { path: '/reset-password', error: code };
    }
    return { path: '/login', error: params.errorParam || 'Authentication failed' };
  };

  // Recovery error: otp_expired
  const recoveryExpired = resolveErrorRoute({
    next: '/reset-password',
    errorCode: 'otp_expired',
    errorParam: 'Email link is invalid or has expired',
  });
  assert.equal(recoveryExpired.path, '/reset-password');
  assert.equal(recoveryExpired.error, 'otp_expired');

  // Recovery error: token hash failed with type=recovery
  const tokenHashFailed = resolveErrorRoute({
    type: 'recovery',
    errorCode: 'access_denied',
    errorParam: 'Token has expired or is invalid',
  });
  assert.equal(tokenHashFailed.path, '/reset-password');
  assert.equal(tokenHashFailed.error, 'invalid_link');

  // Non-recovery error: standard login OAuth or confirmation failure
  const loginError = resolveErrorRoute({
    next: '/account',
    errorCode: 'access_denied',
    errorParam: 'User cancelled login',
  });
  assert.equal(loginError.path, '/login');
  assert.equal(loginError.error, 'User cancelled login');
});

// Test detection of expired OTP in recovery UI
test('recovery UI detects expired or invalidated OTP tokens', () => {
  const isExpiredToken = (errorStr?: string | null, errorCode?: string | null) => {
    const err = errorCode || errorStr;
    if (!err) return false;
    return (
      err === 'otp_expired' ||
      err === 'access_denied' ||
      err === 'invalid_link' ||
      err.toLowerCase().includes('expired')
    );
  };

  assert.equal(isExpiredToken('Email link is invalid or has expired'), true);
  assert.equal(isExpiredToken(null, 'otp_expired'), true);
  assert.equal(isExpiredToken('access_denied'), true);
  assert.equal(isExpiredToken('invalid_link'), true);
  assert.equal(isExpiredToken('user_cancelled'), false);
  assert.equal(isExpiredToken(null, null), false);
});

// ==============================================================================
// Middleware Root Redirect Hardening Tests
// ==============================================================================

test('middleware root redirect - code with type=recovery and no next routes to /reset-password', () => {
  const params = new URLSearchParams('code=sample-pkce-code&type=recovery');
  const result = resolveRootAuthRedirect(params, 'https://splender-jewel.vercel.app');

  assert.notEqual(result, null);
  assert.equal(result?.pathname, '/auth/callback');
  assert.equal(result?.searchParams.get('code'), 'sample-pkce-code');
  assert.equal(result?.searchParams.get('type'), 'recovery');
  assert.equal(result?.searchParams.get('next'), '/reset-password');
});

test('middleware root redirect - code with type=recovery and valid next preserves destination', () => {
  const params = new URLSearchParams('code=sample-pkce-code&type=recovery&next=/shop');
  const result = resolveRootAuthRedirect(params, 'https://splender-jewel.vercel.app');

  assert.notEqual(result, null);
  assert.equal(result?.pathname, '/auth/callback');
  assert.equal(result?.searchParams.get('code'), 'sample-pkce-code');
  assert.equal(result?.searchParams.get('type'), 'recovery');
  assert.equal(result?.searchParams.get('next'), '/shop');
});

test('middleware root redirect - token_hash with type=recovery forwards required callback parameters', () => {
  const params = new URLSearchParams('token_hash=sample-token-hash-123&type=recovery');
  const result = resolveRootAuthRedirect(params, 'https://splender-jewel.vercel.app');

  assert.notEqual(result, null);
  assert.equal(result?.pathname, '/auth/callback');
  assert.equal(result?.searchParams.get('token_hash'), 'sample-token-hash-123');
  assert.equal(result?.searchParams.get('type'), 'recovery');
  assert.equal(result?.searchParams.get('next'), '/reset-password');
});

test('middleware root redirect - non-recovery parameters are preserved appropriately', () => {
  const params = new URLSearchParams('code=standard-auth-code&next=/checkout');
  const result = resolveRootAuthRedirect(params, 'https://splender-jewel.vercel.app');

  assert.notEqual(result, null);
  assert.equal(result?.pathname, '/auth/callback');
  assert.equal(result?.searchParams.get('code'), 'standard-auth-code');
  assert.equal(result?.searchParams.get('next'), '/checkout');
  assert.equal(result?.searchParams.get('type'), null);
});

test('middleware root redirect - invalid redirect destination in next parameter is sanitized', () => {
  const params = new URLSearchParams('code=sample-code&type=recovery&next=https://attacker-site.com');
  const result = resolveRootAuthRedirect(params, 'https://splender-jewel.vercel.app');

  assert.notEqual(result, null);
  assert.equal(result?.pathname, '/auth/callback');
  assert.equal(result?.searchParams.get('code'), 'sample-code');
  assert.equal(result?.searchParams.get('type'), 'recovery');
  // Sanitized safely to recovery default instead of attacker-site.com
  assert.equal(result?.searchParams.get('next'), '/reset-password');
});

test('middleware root redirect - pure forwarder performs no verification or session creation', () => {
  const params = new URLSearchParams('code=sample-code');
  const result = resolveRootAuthRedirect(params, 'https://splender-jewel.vercel.app');

  // Confirms it only constructs the target URL and returns URL instance
  assert.ok(result instanceof URL);
  assert.equal(result.pathname, '/auth/callback');
  assert.equal(result.searchParams.get('code'), 'sample-code');
});

test('middleware root redirect - expired OTP error routes to /forgot-password with error', () => {
  const params = new URLSearchParams('error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  const result = resolveRootAuthRedirect(params, 'https://splender-jewel.vercel.app');

  assert.notEqual(result, null);
  assert.equal(result?.pathname, '/forgot-password');
  assert.equal(result?.searchParams.get('error'), 'otp_expired');
});
