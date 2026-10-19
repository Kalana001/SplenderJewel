/**
 * Server-side Tester Authorization & Checkout Permission Logic
 *
 * Enforces strict multi-mode authorization independently of client-side button state:
 * 1. Production checkout disabled + authorized test customer signed in = checkout allowed.
 * 2. Production checkout disabled + admin signed in = checkout allowed only if explicitly authorized.
 * 3. Production checkout disabled + ordinary authenticated customer = checkout blocked.
 * 4. Production checkout disabled + guest = checkout blocked.
 * 5. Direct unauthorized Server Action invocation = blocked.
 * 6. Invalid or forged user ID = blocked.
 * 7. Production checkout enabled after official launch = normal customer and guest checkout works without tester restrictions.
 */

export interface CheckoutPermissionParams {
  isLiveCheckoutEnabled: boolean;
  userId: string | null;
  adminUser?: { id: string; isActive: boolean } | null;
}

export interface CheckoutPermissionResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Server-only allowlist of verified user IDs explicitly permitted to place test orders
 * when the storefront is in preview / testing mode (NEXT_PUBLIC_ENABLE_LIVE_CHECKOUT != 'true').
 * Both test customers and admins must have their verified Supabase Auth UUID in this set.
 */
export const AUTHORIZED_TESTER_USER_IDS: ReadonlySet<string> = new Set([
  // Designated test customer account (kalanasri001@gmail.com)
  'a7db3a41-c12f-4dfd-9dc6-54fee355e60d',
  // Designated store owner / administrator account (splenderjewel@gmail.com)
  '4c0ad512-e507-4f3a-8908-11048d5edf7e',
  ...(typeof process !== 'undefined' && process.env?.AUTHORIZED_TESTER_USER_IDS
    ? process.env.AUTHORIZED_TESTER_USER_IDS.split(',').map((id) => id.trim()).filter(Boolean)
    : []),
]);

/**
 * Pure evaluation function for checkout permission across all operational states.
 * Enforces server-side authorization independently of client-side button state.
 */
export function evaluateCheckoutPermission(params: CheckoutPermissionParams): CheckoutPermissionResult {
  // Case 7: Production checkout enabled after official launch
  // Normal customer and guest checkout works without tester restrictions.
  if (params.isLiveCheckoutEnabled) {
    return { allowed: true };
  }

  // Case 4 & 5: Public / Guest checkout strictly blocked in preview mode
  if (!params.userId) {
    return {
      allowed: false,
      reason:
        'The storefront is currently in development preview mode. Online checkout submission is temporarily disabled while transactional database verification is underway. For priority inquiries, please contact us on WhatsApp.',
    };
  }

  const isExplicitlyAuthorized = AUTHORIZED_TESTER_USER_IDS.has(params.userId);

  // Case 2: Admin signed in — allowed ONLY if explicitly authorized in allowlist
  if (params.adminUser) {
    if (params.adminUser.isActive && isExplicitlyAuthorized) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason:
        'The storefront is currently in development preview mode. This administrator account is not on the explicit authorized tester allowlist for preview checkout.',
    };
  }

  // Case 1: Authorized test customer signed in
  if (isExplicitlyAuthorized) {
    return { allowed: true };
  }

  // Case 3: Ordinary authenticated customer — checkout blocked
  return {
    allowed: false,
    reason:
      'The storefront is currently in development preview mode. Online checkout submission is temporarily disabled while transactional database verification is underway. For priority inquiries, please contact us on WhatsApp.',
  };
}
