import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminCoupons } from '@/lib/coupons/admin-actions';
import { CouponsManager } from '@/components/admin/coupons/coupons-manager';

export const metadata = {
  title: 'Coupons & Discounts | Splender Jewel Admin',
  description: 'Manage store coupons, percentage discounts, fixed vouchers, and redemption limits',
};

export default async function AdminCouponsPage() {
  await requireAdminPageAuth();

  const res = await getAdminCoupons();
  const coupons = res.success ? res.coupons : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            Promotional Coupons & Discounts
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Create and track promotional codes, configure percentage and fixed discounts, and monitor usage limits.
          </p>
        </div>
      </div>

      <CouponsManager initialCoupons={coupons} />
    </div>
  );
}
