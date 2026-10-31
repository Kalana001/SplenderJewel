import React from 'react';
import Link from 'next/link';
import {
  ShoppingBag,
  Shield,
  DollarSign,
  Truck,
  MessageCircle,
} from 'lucide-react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import {
  getAdminDashboardMetrics,
  getAdminDashboardAnalytics,
} from '@/lib/orders/admin-actions';
import { formatCurrency } from '@/lib/config/store';
import { DashboardCharts } from '@/components/admin/dashboard/dashboard-charts';

export default async function AdminDashboardPage() {
  await requireAdminPageAuth();

  const [metricsRes, analyticsRes] = await Promise.all([
    getAdminDashboardMetrics(),
    getAdminDashboardAnalytics(),
  ]);

  const metrics = metricsRes.metrics;
  const analytics = analyticsRes.analytics;

  return (
    <div className="space-y-8">
      {/* Dashboard Top Header */}
      <div>
        <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-luxury-gold/15 text-luxury-gold text-xs uppercase tracking-wider font-semibold mb-2">
          <Shield className="h-3.5 w-3.5" />
          <span>Splender Jewel — Admin Workspace</span>
        </div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-white">
          Control Center
        </h1>
        <p className="text-xs text-neutral-400 mt-1 max-w-2xl">
          Complete store administration workspace. Real-time performance analytics, regional demand, and fulfillment operations.
        </p>
      </div>

      {/* Primary KPI Metrics Row (Black & Gold Theme) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Orders */}
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400 font-medium">Total Orders</span>
            <div className="p-1.5 rounded bg-neutral-800 text-neutral-300">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-white font-mono">
            {metrics.totalOrders}
          </p>
          <span className="text-[11px] text-neutral-500 block">Lifetime volume</span>
        </div>

        {/* Total Revenue (Confirmed Received Money Only) */}
        <div className="bg-neutral-900/90 border border-luxury-gold/40 rounded-lg p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-300 font-medium">Total Revenue</span>
            <div className="p-1.5 rounded bg-luxury-gold/20 text-luxury-gold">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-luxury-gold font-mono">
            {formatCurrency(metrics.totalRevenue)}
          </p>
          <span className="text-[11px] text-emerald-400/90 font-medium block">
            ✓ Confirmed received funds only
          </span>
        </div>

        {/* Pending COD Settlements */}
        <Link href="/admin/payments?queue=pending_cod" className="block group">
          <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-5 space-y-1 group-hover:border-amber-600/60 transition-all h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs text-amber-400 font-medium">Pending COD Settlements</span>
              <div className="p-1.5 rounded bg-amber-950/60 text-amber-400">
                <Truck className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-amber-300 font-mono">
              {metrics.pendingCodSettlementCount}
            </p>
            <span className="text-[11px] text-neutral-500 block group-hover:text-amber-400 transition-colors">
              Delivered ≠ Paid • Remittance pending →
            </span>
          </div>
        </Link>

        {/* Pending Bank Transfer Verifications */}
        <Link href="/admin/payments?queue=pending_bank_transfer" className="block group">
          <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-5 space-y-1 group-hover:border-emerald-600/60 transition-all h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs text-emerald-400 font-medium">Pending Bank Transfers</span>
              <div className="p-1.5 rounded bg-emerald-950/60 text-emerald-400">
                <MessageCircle className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-emerald-300 font-mono">
              {metrics.pendingBankTransferCount}
            </p>
            <span className="text-[11px] text-neutral-500 block group-hover:text-emerald-400 transition-colors">
              WhatsApp deposit slips to verify →
            </span>
          </div>
        </Link>
      </div>

      {/* Interactive Charts & Analytics Section */}
      <DashboardCharts analytics={analytics} />
    </div>
  );
}
