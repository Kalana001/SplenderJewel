export type DiscountType = 'percentage' | 'fixed';

export interface Coupon {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
  totalUsageLimit: number | null;
  perCustomerLimit: number | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCouponInput {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number | null;
  totalUsageLimit?: number | null;
  perCustomerLimit?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive?: boolean;
}

export interface UpdateCouponInput {
  discountType?: DiscountType;
  discountValue?: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number | null;
  totalUsageLimit?: number | null;
  perCustomerLimit?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive?: boolean;
}

export interface CouponValidationResult {
  valid: boolean;
  couponId?: string;
  code?: string;
  discountType?: DiscountType;
  discountValue?: number;
  calculatedDiscount?: number;
  error?: string;
}
