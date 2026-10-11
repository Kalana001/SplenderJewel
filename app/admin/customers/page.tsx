import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminCustomers } from '@/lib/customers/admin-actions';
import { CustomersTable } from '@/components/admin/customers/customers-table';

export const metadata = {
  title: 'Customer Directory | Splender Jewel Admin',
  description: 'View registered customer accounts, order histories, and contact info',
};

export default async function AdminCustomersPage() {
  await requireAdminPageAuth();

  const res = await getAdminCustomers();
  const customers = res.success ? res.customers : [];
  const total = res.success ? res.total : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            Registered Customers
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Directory of customer profiles, purchase history, and delivery metrics.
          </p>
        </div>
      </div>

      <CustomersTable initialCustomers={customers} total={total} />
    </div>
  );
}
