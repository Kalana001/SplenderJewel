import { AdminPageSkeleton } from '@/components/admin/admin-page-skeleton';

export default function AdminCouponsPage() {
  return (
    <AdminPageSkeleton
      title="Coupons & Promotional Discounts"
      category="Marketing"
      description="Create and manage coupon codes (percentage discount, fixed amount discount, minimum order limits, expiration dates)."
      targetPhase="Phase 3 (Cart, Checkout & Coupons)"
      capabilities={[
        'Coupon code generation and validation rules',
        'Discount type: percentage vs fixed LKR amount',
        'Usage limits (total and per-customer)',
        'Active date ranges and minimum purchase requirements',
      ]}
    />
  );
}
