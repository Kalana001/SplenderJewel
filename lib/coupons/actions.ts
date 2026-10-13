'use server';

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/server';
import type { CouponValidationResult } from '@/types/coupon';

export interface CouponCustomerContext {
  phone1?: string | null;
  email?: string | null;
}

/**
 * PUBLIC SECURE COUPON VALIDATION BOUNDARY
 *
 * Used at storefront checkout to validate a promotional code and compute
 * the exact discount strictly on the server.
 *
 * Security Protections:
 * 1. Sanitizes inputs and normalizes coupon code to uppercase.
 * 2. Uses server-side admin client to verify limits without giving anonymous users
 *    direct table access or exposing usage statistics.
 * 3. Enforces both total_usage_limit and per_customer_limit.
 * 4. Never leaks internal admin metadata, audit notes, or margin data.
 */
export async function validateCouponAction(
  code: string,
  subtotal: number,
  customerContext?: CouponCustomerContext
): Promise<CouponValidationResult> {
  try {
    if (!code || typeof code !== 'string') {
      return { valid: false, error: 'Please enter a coupon code.' };
    }

    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.length < 3 || normalizedCode.length > 30) {
      return { valid: false, error: 'Invalid coupon code format.' };
    }

    if (typeof subtotal !== 'number' || isNaN(subtotal) || subtotal < 0) {
      return { valid: false, error: 'Invalid order subtotal.' };
    }

    const adminClient = createAdminClient();

    // 1. Fetch coupon details
    const { data: coupon, error: couponError } = await (adminClient.from('coupons') as any)
      .select('id, code, discount_type, discount_value, min_order_amount, max_discount_amount, total_usage_limit, per_customer_limit, start_date, end_date, is_active')
      .eq('code', normalizedCode)
      .maybeSingle();

    if (couponError || !coupon) {
      return { valid: false, error: 'Promotional code not found or expired.' };
    }

    // 2. Active status check
    if (!coupon.is_active) {
      return { valid: false, error: 'This coupon is no longer active.' };
    }

    const now = Date.now();

    // 3. Start date check
    if (coupon.start_date) {
      const startTime = new Date(coupon.start_date).getTime();
      if (!isNaN(startTime) && now < startTime) {
        return { valid: false, error: 'This promotional code is not active yet.' };
      }
    }

    // 4. Expiration date check
    if (coupon.end_date) {
      const endTime = new Date(coupon.end_date).getTime();
      if (!isNaN(endTime) && now > endTime) {
        return { valid: false, error: 'This promotional code has expired.' };
      }
    }

    // 5. Minimum order threshold
    const minOrder = Number(coupon.min_order_amount) || 0;
    if (subtotal < minOrder) {
      return {
        valid: false,
        error: `Order subtotal must be at least Rs. ${minOrder.toLocaleString('en-LK')} to use this coupon.`,
      };
    }

    // 6. Total usage limit verification
    if (coupon.total_usage_limit !== null && coupon.total_usage_limit > 0) {
      const { count, error: countError } = await (adminClient.from('coupon_usage') as any)
        .select('*', { count: 'exact', head: true })
        .eq('coupon_id', coupon.id);

      if (!countError && typeof count === 'number' && count >= coupon.total_usage_limit) {
        return { valid: false, error: 'This promotional code has reached its maximum usage limit.' };
      }
    }

    // 6B. Per-customer usage limit verification (authenticated user_id and/or guest phone1/email)
    if (coupon.per_customer_limit !== null && coupon.per_customer_limit > 0) {
      const currentUser = await getCurrentUser().catch(() => null);
      const userId = currentUser?.id || null;
      const phone1 = customerContext?.phone1?.trim() || null;
      const email = customerContext?.email?.trim()?.toLowerCase() || null;

      if (userId) {
        const { count: userUsageCount } = await (adminClient.from('coupon_usage') as any)
          .select('*', { count: 'exact', head: true })
          .eq('coupon_id', coupon.id)
          .eq('user_id', userId);

        if (typeof userUsageCount === 'number' && userUsageCount >= coupon.per_customer_limit) {
          return { valid: false, error: 'You have reached the maximum allowed usage limit for this coupon.' };
        }
      }

      if (phone1 || email) {
        const { data: usagesWithOrders } = await (adminClient.from('coupon_usage') as any)
          .select('order_id, orders!inner(phone1, email)')
          .eq('coupon_id', coupon.id);

        if (Array.isArray(usagesWithOrders)) {
          const matchingGuestCount = usagesWithOrders.filter((row: any) => {
            const ord = row?.orders;
            if (!ord) return false;
            const phoneMatch = phone1 && ord.phone1 === phone1;
            const emailMatch = email && typeof ord.email === 'string' && ord.email.toLowerCase() === email;
            return Boolean(phoneMatch || emailMatch);
          }).length;

          if (matchingGuestCount >= coupon.per_customer_limit) {
            return { valid: false, error: 'You have reached the maximum allowed usage limit for this coupon.' };
          }
        }
      }
    }

    // 7. Calculate discount amount safely
    let calculatedDiscount = 0;
    const discountVal = Number(coupon.discount_value);

    if (coupon.discount_type === 'percentage') {
      calculatedDiscount = (subtotal * discountVal) / 100;
      if (coupon.max_discount_amount !== null && coupon.max_discount_amount !== undefined) {
        const maxCap = Number(coupon.max_discount_amount);
        if (calculatedDiscount > maxCap) {
          calculatedDiscount = maxCap;
        }
      }
    } else {
      // Fixed discount
      calculatedDiscount = Math.min(discountVal, subtotal);
    }

    // Round to 2 decimal places
    calculatedDiscount = Math.round(calculatedDiscount * 100) / 100;

    return {
      valid: true,
      couponId: coupon.id,
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: discountVal,
      calculatedDiscount,
    };
  } catch {
    return { valid: false, error: 'Unable to validate coupon. Please try again.' };
  }
}
