import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminSalesReport } from '@/lib/reports/admin-actions';
import { ReportsDashboard } from '@/components/admin/reports/reports-dashboard';

export const metadata = {
  title: 'Reports & Analytics | Splender Jewel Admin',
  description: 'Executive sales performance, confidential gross profit analysis, and regional district order metrics',
};

export default async function AdminReportsPage() {
  await requireAdminPageAuth();

  const res = await getAdminSalesReport('30d');
  const metrics = res.success
    ? res.metrics
    : {
        totalRevenue: 0,
        totalCollected: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        totalCost: 0,
        grossProfit: 0,
        grossMarginPercent: 0,
        orderCountByStatus: {},
        revenueByPaymentMethod: {
          cod: { count: 0, revenue: 0 },
          bankTransfer: { count: 0, revenue: 0 },
        },
        topDistricts: [],
        topProducts: [],
      };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            Analytics & Executive Business Reports
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Real sales data, confidential gross margins derived from purchase costs, payment collection, and regional distributions.
          </p>
        </div>
      </div>

      <ReportsDashboard initialMetrics={metrics} />
    </div>
  );
}
