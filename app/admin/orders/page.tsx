import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminOrders } from '@/lib/orders/admin-actions';
import { OrdersTable } from '@/components/admin/orders/orders-table';

export const metadata = {
  title: 'Orders Management | Splender Jewel Admin',
  description: 'Manage store orders, verify bank transfers, and track fulfillment',
};

export default async function AdminOrdersPage() {
  await requireAdminPageAuth();

  const res = await getAdminOrders();
  const orders = res.success ? res.orders : [];
  const total = res.success ? res.total : 0;
  const metrics = res.success && res.metrics ? res.metrics : {
    totalOrders: 0,
    totalRevenue: 0,
    pendingReviewCount: 0,
    pendingBankTransferCount: 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            Order Fulfillment & Sales Operations
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Track customer orders, approve bank transfers, and dispatch jewelry packages islandwide.
          </p>
        </div>
      </div>

      <OrdersTable initialOrders={orders} total={total} metrics={metrics} />
    </div>
  );
}
