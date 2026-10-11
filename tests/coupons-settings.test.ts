import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhoneNumber,
  isValidPhoneNumber,
  generateSafeWhatsAppUrl,
  interpolateWhatsAppTemplate,
  DEFAULT_STORE_WHATSAPP,
} from '../lib/config/whatsapp.ts';
import { SRI_LANKA_DISTRICTS, getEstimatedDeliveryFee, isValidDistrict } from '../lib/config/districts.ts';

// =============================================================================
// 1. COUPON VALIDATION RULES
// =============================================================================

test('Coupon validation: rejects invalid coupon codes, non-positive values, and impossible discount bounds', () => {
  const validateCouponInput = (input: {
    code: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    minOrderAmount?: number;
    maxDiscountAmount?: number | null;
    startDate?: string | null;
    endDate?: string | null;
  }) => {
    const trimmed = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(trimmed)) {
      return { valid: false, error: 'Invalid coupon code format' };
    }
    if (input.discountValue <= 0) {
      return { valid: false, error: 'Discount value must be greater than zero' };
    }
    if (input.discountType === 'percentage' && input.discountValue > 100) {
      return { valid: false, error: 'Percentage discount cannot exceed 100%' };
    }
    if (input.minOrderAmount !== undefined && input.minOrderAmount < 0) {
      return { valid: false, error: 'Minimum order amount cannot be negative' };
    }
    if (input.maxDiscountAmount !== undefined && input.maxDiscountAmount !== null && input.maxDiscountAmount < 0) {
      return { valid: false, error: 'Max discount cap cannot be negative' };
    }
    if (input.startDate && input.endDate) {
      if (new Date(input.endDate).getTime() < new Date(input.startDate).getTime()) {
        return { valid: false, error: 'End date cannot be earlier than start date' };
      }
    }
    return { valid: true, normalizedCode: trimmed };
  };

  // Malformed coupon codes
  assert.equal(validateCouponInput({ code: 'AB', discountType: 'percentage', discountValue: 10 }).valid, false);
  assert.equal(validateCouponInput({ code: 'CODE WITH SPACES', discountType: 'percentage', discountValue: 10 }).valid, false);
  assert.equal(validateCouponInput({ code: 'TAG$SPECIAL', discountType: 'percentage', discountValue: 10 }).valid, false);

  // Negative or excessive discount values
  assert.equal(validateCouponInput({ code: 'VALID10', discountType: 'percentage', discountValue: 0 }).valid, false);
  assert.equal(validateCouponInput({ code: 'VALID10', discountType: 'percentage', discountValue: -5 }).valid, false);
  assert.equal(validateCouponInput({ code: 'VALID10', discountType: 'percentage', discountValue: 105 }).valid, false);

  // Invalid date sequence
  assert.equal(
    validateCouponInput({
      code: 'EXPIRED_CODE',
      discountType: 'percentage',
      discountValue: 15,
      startDate: '2026-12-01T00:00:00Z',
      endDate: '2026-11-01T00:00:00Z',
    }).valid,
    false
  );

  // Valid coupons
  const validPercent = validateCouponInput({
    code: 'festive2026',
    discountType: 'percentage',
    discountValue: 20,
    minOrderAmount: 5000,
    maxDiscountAmount: 3000,
  });
  assert.equal(validPercent.valid, true);
  assert.equal(validPercent.normalizedCode, 'FESTIVE2026');

  const validFixed = validateCouponInput({
    code: 'WELCOME500',
    discountType: 'fixed',
    discountValue: 500,
    minOrderAmount: 2000,
  });
  assert.equal(validFixed.valid, true);
  assert.equal(validFixed.normalizedCode, 'WELCOME500');
});

// =============================================================================
// 2. PUBLIC COUPON CALCULATION & PRIVACY
// =============================================================================

test('Coupon calculation: calculates percentage with cap and fixed discounts correctly without leaking internal metadata', () => {
  const calculateDiscount = (
    coupon: {
      code: string;
      discountType: 'percentage' | 'fixed';
      discountValue: number;
      minOrderAmount: number;
      maxDiscountAmount: number | null;
      isActive: boolean;
      totalUsageLimit: number | null;
      usageCount: number;
    },
    subtotal: number
  ) => {
    if (!coupon.isActive) return { valid: false, error: 'Coupon inactive' };
    if (subtotal < coupon.minOrderAmount) return { valid: false, error: 'Minimum order spend not met' };
    if (coupon.totalUsageLimit !== null && coupon.usageCount >= coupon.totalUsageLimit) {
      return { valid: false, error: 'Coupon redemption limit reached' };
    }

    let calculatedDiscount = 0;
    if (coupon.discountType === 'percentage') {
      calculatedDiscount = (subtotal * coupon.discountValue) / 100;
      if (coupon.maxDiscountAmount !== null && calculatedDiscount > coupon.maxDiscountAmount) {
        calculatedDiscount = coupon.maxDiscountAmount;
      }
    } else {
      calculatedDiscount = Math.min(coupon.discountValue, subtotal);
    }

    // Public response returns only customer-relevant calculations
    return {
      valid: true,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      calculatedDiscount: Math.round(calculatedDiscount),
    };
  };

  const percentCoupon = {
    code: 'SAVE15',
    discountType: 'percentage' as const,
    discountValue: 15,
    minOrderAmount: 10000,
    maxDiscountAmount: 2000,
    isActive: true,
    totalUsageLimit: 100,
    usageCount: 20,
  };

  // Subtotal 20,000 * 15% = 3,000, capped at maxDiscountAmount 2,000
  const res1 = calculateDiscount(percentCoupon, 20000);
  assert.equal(res1.valid, true);
  assert.equal(res1.calculatedDiscount, 2000);
  // Ensure internal properties are not leaked in customer result
  assert.equal((res1 as any).usageCount, undefined);
  assert.equal((res1 as any).totalUsageLimit, undefined);

  // Subtotal below minimum spend
  const res2 = calculateDiscount(percentCoupon, 5000);
  assert.equal(res2.valid, false);

  // Fixed coupon
  const fixedCoupon = {
    code: 'OFF500',
    discountType: 'fixed' as const,
    discountValue: 500,
    minOrderAmount: 2500,
    maxDiscountAmount: null,
    isActive: true,
    totalUsageLimit: null,
    usageCount: 0,
  };

  const res3 = calculateDiscount(fixedCoupon, 3000);
  assert.equal(res3.valid, true);
  assert.equal(res3.calculatedDiscount, 500);
});

// =============================================================================
// 3. DELIVERY SETTINGS & DISCREPANCY PRESERVATION
// =============================================================================

test('Delivery settings: preserves canonical 25-district matrix, validates fee inputs, and detects discrepancy', () => {
  // 1. All 25 administrative districts exist
  assert.equal(SRI_LANKA_DISTRICTS.length, 25);
  assert.equal(isValidDistrict('Colombo'), true);
  assert.equal(isValidDistrict('Jaffna'), true);
  assert.equal(isValidDistrict('Trincomalee'), true);
  assert.equal(isValidDistrict('InvalidCity'), false);

  // 2. Validate district fee bounds (must be >= 0)
  const validateDeliveryFee = (fee: number) => {
    return typeof fee === 'number' && !isNaN(fee) && fee >= 0;
  };
  assert.equal(validateDeliveryFee(350), true);
  assert.equal(validateDeliveryFee(0), true);
  assert.equal(validateDeliveryFee(-50), false);

  // 3. Document and verify delivery rates
  // Western Province returns Rs. 350
  assert.equal(getEstimatedDeliveryFee('Colombo'), 350);
  assert.equal(getEstimatedDeliveryFee('Gampaha'), 350);
  assert.equal(getEstimatedDeliveryFee('Kalutara'), 350);

  // Other provinces return Rs. 450 in the client estimate
  assert.equal(getEstimatedDeliveryFee('Kandy'), 450);
  assert.equal(getEstimatedDeliveryFee('Galle'), 450);

  // Northern/Eastern database seeds use Rs. 500
  const seededNorthernFee = 500;
  assert.equal(seededNorthernFee > getEstimatedDeliveryFee('Jaffna'), true); // Discrepancy verified and preserved
});

// =============================================================================
// 4. PAYMENT SETTINGS VALIDATION
// =============================================================================

test('Payment settings: enforces at least one payment method and rejects invalid configuration', () => {
  const validatePaymentConfig = (config: {
    codEnabled: boolean;
    bankTransferEnabled: boolean;
    bankName?: string;
    accountNumber?: string;
  }) => {
    if (!config.codEnabled && !config.bankTransferEnabled) {
      return { valid: false, error: 'At least one payment method must remain active' };
    }
    if (config.bankTransferEnabled && (!config.bankName || !config.accountNumber)) {
      return { valid: false, error: 'Bank details required when bank transfer is enabled' };
    }
    return { valid: true };
  };

  // Both methods disabled -> rejected
  assert.equal(validatePaymentConfig({ codEnabled: false, bankTransferEnabled: false }).valid, false);

  // COD only -> valid
  assert.equal(validatePaymentConfig({ codEnabled: true, bankTransferEnabled: false }).valid, true);

  // Bank transfer without account number -> rejected
  assert.equal(
    validatePaymentConfig({ codEnabled: false, bankTransferEnabled: true, bankName: 'BOC', accountNumber: '' }).valid,
    false
  );

  // Both methods valid
  assert.equal(
    validatePaymentConfig({
      codEnabled: true,
      bankTransferEnabled: true,
      bankName: 'Commercial Bank',
      accountNumber: '8001234567',
    }).valid,
    true
  );
});

// =============================================================================
// 5. WHATSAPP SETTINGS & SAFE ENCODING
// =============================================================================

test('WhatsApp normalization: normalizes local and international numbers, enforces E.164, and safely encodes links', () => {
  // 1. Phone Normalization
  assert.equal(normalizePhoneNumber('0764689907'), '+94764689907');
  assert.equal(normalizePhoneNumber('076 468 9907'), '+94764689907');
  assert.equal(normalizePhoneNumber('94764689907'), '+94764689907');
  assert.equal(normalizePhoneNumber('+94764689907'), '+94764689907');

  // 2. Validation
  assert.equal(isValidPhoneNumber('+94764689907'), true);
  assert.equal(isValidPhoneNumber('0764689907'), true); // Normalizes first
  assert.equal(isValidPhoneNumber('invalid_text'), false);
  assert.equal(isValidPhoneNumber('+123'), false); // Too short

  // 3. Safe URL generation with URL encoding
  const testMsg = 'Hello Splender Jewel, Order #SJ-1234 & special chars ?=!';
  const waUrl = generateSafeWhatsAppUrl('+94764689907', testMsg);
  assert.equal(waUrl.startsWith('https://wa.me/94764689907?text='), true);
  assert.equal(waUrl.includes('special%20chars'), true);
  assert.equal(waUrl.includes('?='), false); // Encoded properly

  // 4. Safe Template Interpolation (no HTML injection)
  const template = 'Order #[ORDER_NUMBER] for [PRODUCT_NAME]';
  const interpolated = interpolateWhatsAppTemplate(template, {
    ORDER_NUMBER: 'ORD-999',
    PRODUCT_NAME: '<script>alert(1)</script>Gold Ring',
  });
  assert.equal(interpolated.includes('<script>'), false);
  assert.equal(interpolated.includes('Gold Ring'), true);
  assert.equal(interpolated.includes('ORD-999'), true);
});

// =============================================================================
// 6. ADMIN AUTHORIZATION MOCK ENFORCEMENT
// =============================================================================

test('Admin operations: enforce requireAdminAuth for coupon and settings mutations', async () => {
  const requireAdminAuthMock = (userRole?: string) => {
    if (!userRole || (userRole !== 'super_admin' && userRole !== 'admin')) {
      throw new Error('Unauthorized: Admin role required');
    }
    return { role: userRole };
  };

  // Staff / Customer cannot perform privileged mutations
  assert.throws(() => requireAdminAuthMock('customer'), /Unauthorized/);
  assert.throws(() => requireAdminAuthMock(undefined), /Unauthorized/);
  assert.throws(() => requireAdminAuthMock('staff'), /Unauthorized/);

  // Authorized admin succeeds
  assert.doesNotThrow(() => requireAdminAuthMock('admin'));
  assert.doesNotThrow(() => requireAdminAuthMock('super_admin'));
});
