'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/auth/server';
import type { Coupon, CreateCouponInput, UpdateCouponInput } from '@/types/coupon';

/**
 * Validates and normalizes coupon input fields server-side.
 */
function validateCouponInput(input: CreateCouponInput | UpdateCouponInput, isCreate = false): {
  isValid: boolean;
  error?: string;
  normalizedCode?: string;
} {
  if (isCreate) {
    const createInput = input as CreateCouponInput;
    if (!createInput.code || typeof createInput.code !== 'string') {
      return { isValid: false, error: 'Coupon code is required.' };
    }
    const trimmed = createInput.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(trimmed)) {
      return { isValid: false, error: 'Coupon code must be 3-30 characters long and contain only letters, numbers, hyphens, and underscores.' };
    }
  }

  if (input.discountType !== undefined && input.discountType !== 'percentage' && input.discountType !== 'fixed') {
    return { isValid: false, error: 'Discount type must be either percentage or fixed.' };
  }

  if (input.discountValue !== undefined) {
    if (typeof input.discountValue !== 'number' || isNaN(input.discountValue) || input.discountValue <= 0) {
      return { isValid: false, error: 'Discount value must be greater than zero.' };
    }
    if (input.discountType === 'percentage' && input.discountValue > 100) {
      return { isValid: false, error: 'Percentage discount cannot exceed 100%.' };
    }
  }

  if (input.minOrderAmount !== undefined && (typeof input.minOrderAmount !== 'number' || input.minOrderAmount < 0)) {
    return { isValid: false, error: 'Minimum order amount cannot be negative.' };
  }

  if (input.maxDiscountAmount !== undefined && input.maxDiscountAmount !== null) {
    if (typeof input.maxDiscountAmount !== 'number' || input.maxDiscountAmount < 0) {
      return { isValid: false, error: 'Maximum discount amount cannot be negative.' };
    }
  }

  if (input.totalUsageLimit !== undefined && input.totalUsageLimit !== null) {
    if (!Number.isInteger(input.totalUsageLimit) || input.totalUsageLimit < 1) {
      return { isValid: false, error: 'Total usage limit must be a positive integer.' };
    }
  }

  if (input.perCustomerLimit !== undefined && input.perCustomerLimit !== null) {
    if (!Number.isInteger(input.perCustomerLimit) || input.perCustomerLimit < 1) {
      return { isValid: false, error: 'Per-customer usage limit must be a positive integer.' };
    }
  }

  if (input.startDate && input.endDate) {
    const start = new Date(input.startDate).getTime();
    const end = new Date(input.endDate).getTime();
    if (isNaN(start) || isNaN(end)) {
      return { isValid: false, error: 'Invalid start or end date format.' };
    }
    if (end < start) {
      return { isValid: false, error: 'End date cannot be earlier than start date.' };
    }
  }

  const normalizedCode = isCreate ? (input as CreateCouponInput).code.trim().toUpperCase() : undefined;
  return { isValid: true, normalizedCode };
}

/**
 * FETCH ALL COUPONS FOR ADMIN MANAGEMENT
 * Server-only; enforces requireAdminAuth().
 */
export async function getAdminCoupons(): Promise<{ success: boolean; coupons: Coupon[]; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    // 1. Fetch coupons list
    const { data: couponsData, error: couponsError } = await (adminClient.from('coupons') as any)
      .select('*')
      .order('created_at', { ascending: false });

    if (couponsError) {
      return { success: false, coupons: [], error: couponsError.message };
    }

    // 2. Fetch usage counts
    const { data: usageData } = await (adminClient.from('coupon_usage') as any)
      .select('coupon_id');

    const usageCountMap: Record<string, number> = {};
    if (usageData && Array.isArray(usageData)) {
      for (const row of usageData) {
        if (row.coupon_id) {
          usageCountMap[row.coupon_id] = (usageCountMap[row.coupon_id] || 0) + 1;
        }
      }
    }

    const coupons: Coupon[] = (couponsData || []).map((row: any) => ({
      id: row.id,
      code: row.code,
      discountType: row.discount_type,
      discountValue: Number(row.discount_value),
      minOrderAmount: Number(row.min_order_amount) || 0,
      maxDiscountAmount: row.max_discount_amount !== null ? Number(row.max_discount_amount) : null,
      totalUsageLimit: row.total_usage_limit !== null ? Number(row.total_usage_limit) : null,
      perCustomerLimit: row.per_customer_limit !== null ? Number(row.per_customer_limit) : 1,
      startDate: row.start_date,
      endDate: row.end_date,
      isActive: Boolean(row.is_active),
      usageCount: usageCountMap[row.id] || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { success: true, coupons };
  } catch (err: any) {
    return { success: false, coupons: [], error: err.message || 'Failed to fetch coupons.' };
  }
}

/**
 * CREATE A NEW COUPON
 */
export async function createAdminCoupon(input: CreateCouponInput): Promise<{ success: boolean; coupon?: Coupon; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const validation = validateCouponInput(input, true);
    if (!validation.isValid || !validation.normalizedCode) {
      return { success: false, error: validation.error || 'Invalid coupon details.' };
    }

    const payload = {
      code: validation.normalizedCode,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      min_order_amount: input.minOrderAmount ?? 0,
      max_discount_amount: input.discountType === 'percentage' ? (input.maxDiscountAmount ?? null) : null,
      total_usage_limit: input.totalUsageLimit ?? null,
      per_customer_limit: input.perCustomerLimit ?? 1,
      start_date: input.startDate || null,
      end_date: input.endDate || null,
      is_active: input.isActive ?? true,
    };

    const { data, error } = await (adminClient.from('coupons') as any)
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: `Coupon code '${validation.normalizedCode}' already exists.` };
      }
      return { success: false, error: error.message };
    }

    revalidatePath('/admin/coupons');

    return {
      success: true,
      coupon: {
        id: data.id,
        code: data.code,
        discountType: data.discount_type,
        discountValue: Number(data.discount_value),
        minOrderAmount: Number(data.min_order_amount) || 0,
        maxDiscountAmount: data.max_discount_amount !== null ? Number(data.max_discount_amount) : null,
        totalUsageLimit: data.total_usage_limit !== null ? Number(data.total_usage_limit) : null,
        perCustomerLimit: data.per_customer_limit !== null ? Number(data.per_customer_limit) : 1,
        startDate: data.start_date,
        endDate: data.end_date,
        isActive: Boolean(data.is_active),
        usageCount: 0,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create coupon.' };
  }
}

/**
 * UPDATE AN EXISTING COUPON
 */
export async function updateAdminCoupon(
  id: string,
  input: UpdateCouponInput
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!id) {
      return { success: false, error: 'Coupon ID is required.' };
    }

    const validation = validateCouponInput(input, false);
    if (!validation.isValid) {
      return { success: false, error: validation.error || 'Invalid coupon input.' };
    }

    const payload: Record<string, any> = {};
    if (input.discountType !== undefined) payload.discount_type = input.discountType;
    if (input.discountValue !== undefined) payload.discount_value = input.discountValue;
    if (input.minOrderAmount !== undefined) payload.min_order_amount = input.minOrderAmount;
    if (input.maxDiscountAmount !== undefined) payload.max_discount_amount = input.maxDiscountAmount;
    if (input.totalUsageLimit !== undefined) payload.total_usage_limit = input.totalUsageLimit;
    if (input.perCustomerLimit !== undefined) payload.per_customer_limit = input.perCustomerLimit;
    if (input.startDate !== undefined) payload.start_date = input.startDate || null;
    if (input.endDate !== undefined) payload.end_date = input.endDate || null;
    if (input.isActive !== undefined) payload.is_active = input.isActive;

    const { error } = await (adminClient.from('coupons') as any)
      .update(payload)
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/admin/coupons');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update coupon.' };
  }
}

/**
 * TOGGLE COUPON ACTIVE STATE
 */
export async function toggleAdminCouponActive(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const { error } = await (adminClient.from('coupons') as any)
      .update({ is_active: isActive })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/admin/coupons');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to toggle coupon status.' };
  }
}

/**
 * DELETE A COUPON
 */
export async function deleteAdminCoupon(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const { error } = await (adminClient.from('coupons') as any)
      .delete()
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/admin/coupons');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete coupon.' };
  }
}
