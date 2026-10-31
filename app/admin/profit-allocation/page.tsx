import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminProfitTreasuryData } from '@/lib/profit-treasury/admin-actions';
import { ProfitTreasuryManager } from '@/components/admin/profit-treasury/profit-treasury-manager';

export const metadata = {
  title: 'Profit Allocation & Treasury | Splender Jewel Admin',
  description: 'Verified net product profit allocation, fund distribution, and expense management.',
};

export default async function AdminProfitAllocationPage() {
  await requireAdminPageAuth();

  const res = await getAdminProfitTreasuryData('all');

  return (
    <div className="space-y-6">
      <ProfitTreasuryManager initialData={res.data} />
    </div>
  );
}
