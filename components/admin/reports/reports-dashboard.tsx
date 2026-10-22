'use client';

import React, { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  CreditCard,
  Truck,
  Package,
  Calendar,
  Percent,
  Lock,
  RefreshCw,
  Award,
} from 'lucide-react';
import type { SalesReportMetrics, ReportTimeRange } from '@/types/report';
import { getAdminSalesReport } from '@/lib/reports/admin-actions';
import { formatCurrency } from '@/lib/config/store';

interface ReportsDashboardProps {
  initialMetrics: SalesReportMetrics;
}

export function ReportsDashboard({ initialMetrics }: ReportsDashboardProps) {
  const [metrics, setMetrics] = useState<SalesReportMetrics>(initialMetrics);
  const [timeRange, setTimeRange] = useState<ReportTimeRange>('30d');
  const [isLoading, setIsLoading] = useState(false);

  const handleTimeRangeChange = async (range: ReportTimeRange) => {
    setTimeRange(range);
    setIsLoading(true);
    try {
      const res = await getAdminSalesReport(range);
      if (res.success) {
        setMetrics(res.metrics);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Time Range Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-900/60 border border-neutral-800 p-4 rounded-lg">
        <div className="flex items-center gap-2 text-xs text-neutral-300">
          <Calendar className="h-4 w-4 text-luxury-gold" />
          <span>Reporting Period:</span>
        </div>

        <div className="flex items-center gap-2">
          {(
            [
              { label: 'Last 7 Days', value: '7d' },
              { label: 'Last 30 Days', value: '30d' },
              { label: 'Last 90 Days', value: '90d' },
              { label: 'All Time', value: 'all' },
            ] as const
          ).map((t) => (
            <button
              key={t.value}
              type="button"
              disabled={isLoading}
              onClick={() => handleTimeRangeChange(t.value)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                timeRange === t.value
                  ? 'bg-luxury-gold text-neutral-950 font-bold'
                  : 'bg-neutral-950 text-neutral-400 hover:text-white border border-neutral-800'
              }`}
            >
              {t.label}
            </button>
          ))}
          {isLoading && <RefreshCw className="h-4 w-4 animate-spin text-luxury-gold ml-2" />}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Gross Sales */}
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold">
              Gross Sales (Revenue)
            </span>
            <div className="p-2 bg-neutral-950 rounded border border-neutral-800 text-luxury-gold">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-serif font-bold text-white tracking-tight">
            {formatCurrency(metrics.totalRevenue)}
          </p>
          <span className="text-[11px] text-neutral-500">Excludes cancelled &amp; refunded orders</span>
        </div>

        {/* Collected / Verified Cash */}
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold">
              Collected / Verified
            </span>
            <div className="p-2 bg-neutral-950 rounded border border-neutral-800 text-emerald-400">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-serif font-bold text-emerald-300 tracking-tight">
            {formatCurrency(metrics.totalCollected)}
          </p>
          <span className="text-[11px] text-neutral-500">Delivered COD + Approved Bank Slips</span>
        </div>

        {/* Total Orders & AOV */}
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold">
              Order Volume & AOV
            </span>
            <div className="p-2 bg-neutral-950 rounded border border-neutral-800 text-luxury-gold">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-serif font-bold text-white">
              {metrics.totalOrders}
            </span>
            <span className="text-xs text-neutral-400">Orders</span>
          </div>
          <span className="text-[11px] text-neutral-400">
            Avg Order: <strong className="text-white">{formatCurrency(metrics.averageOrderValue)}</strong>
          </span>
        </div>

        {/* Confidential Gross Profit */}
        <div className="bg-neutral-900/60 border border-luxury-gold/30 rounded-lg p-5 space-y-2 bg-gradient-to-br from-neutral-900/80 to-neutral-950">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-luxury-gold font-semibold flex items-center gap-1">
              <Lock className="h-3 w-3" />
              <span>Gross Profit (Admin Only)</span>
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-luxury-gold text-neutral-950">
              {metrics.grossMarginPercent}% Margin
            </span>
          </div>
          <p className="text-2xl font-serif font-bold text-luxury-gold-light tracking-tight">
            {formatCurrency(metrics.grossProfit)}
          </p>
          <span className="text-[11px] text-neutral-500">
            Total Purchase Cost: {formatCurrency(metrics.totalCost)}
          </span>
        </div>
      </div>

      {/* Middle Grid: Payment Methods & Order Lifecycle */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods */}
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-4">
          <h3 className="font-serif font-bold text-base text-white border-b border-neutral-800 pb-3 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-luxury-gold" />
            <span>Revenue by Payment Method</span>
          </h3>

          <div className="space-y-4 pt-1">
            {/* COD */}
            <div className="p-4 bg-neutral-950 rounded border border-neutral-800/80 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-semibold text-white">Cash on Delivery (COD)</span>
                <span className="font-bold text-luxury-gold">
                  {formatCurrency(metrics.revenueByPaymentMethod.cod.revenue)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs text-neutral-400">
                <span>{metrics.revenueByPaymentMethod.cod.count} orders</span>
                <span>
                  {metrics.totalRevenue > 0
                    ? Math.round(
                        (metrics.revenueByPaymentMethod.cod.revenue / metrics.totalRevenue) * 100
                      )
                    : 0}
                  % of sales
                </span>
              </div>
            </div>

            {/* Bank Transfer */}
            <div className="p-4 bg-neutral-950 rounded border border-neutral-800/80 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-semibold text-white">WhatsApp Bank Transfer</span>
                <span className="font-bold text-luxury-gold">
                  {formatCurrency(metrics.revenueByPaymentMethod.bankTransfer.revenue)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs text-neutral-400">
                <span>{metrics.revenueByPaymentMethod.bankTransfer.count} orders</span>
                <span>
                  {metrics.totalRevenue > 0
                    ? Math.round(
                        (metrics.revenueByPaymentMethod.bankTransfer.revenue /
                          metrics.totalRevenue) *
                          100
                      )
                    : 0}
                  % of sales
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Order Status Distribution */}
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-4">
          <h3 className="font-serif font-bold text-base text-white border-b border-neutral-800 pb-3 flex items-center gap-2">
            <Truck className="h-4 w-4 text-luxury-gold" />
            <span>Order Fulfillment Pipeline</span>
          </h3>

          <div className="grid grid-cols-2 gap-3 pt-1">
            {Object.entries(metrics.orderCountByStatus).map(([status, count]) => (
              <div
                key={status}
                className="bg-neutral-950 p-3.5 rounded border border-neutral-800/80 flex items-center justify-between"
              >
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block">
                    {status}
                  </span>
                  <span className="text-lg font-serif font-bold text-white mt-0.5 block">
                    {count}
                  </span>
                </div>
                <span className="text-xs text-neutral-500">orders</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Grid: Top Products Leaderboard & Regional Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-4">
          <h3 className="font-serif font-bold text-base text-white border-b border-neutral-800 pb-3 flex items-center gap-2">
            <Award className="h-4 w-4 text-luxury-gold" />
            <span>Top-Selling Jewelry Pieces</span>
          </h3>

          {metrics.topProducts.length === 0 ? (
            <p className="text-xs text-neutral-500 py-6 text-center">No sales logged in this period.</p>
          ) : (
            <div className="divide-y divide-neutral-800/60">
              {metrics.topProducts.map((p, idx) => (
                <div key={p.productId} className="py-3 flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-neutral-500 w-4">#{idx + 1}</span>
                    <div>
                      <p className="font-medium text-white">{p.productName}</p>
                      <span className="text-xs text-neutral-400">{p.unitsSold} units dispatched</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-luxury-gold">{formatCurrency(p.revenue)}</p>
                    <span className="text-[11px] text-emerald-400">
                      +{formatCurrency(p.profit)} profit
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Regional Sri Lanka Distribution */}
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-4">
          <h3 className="font-serif font-bold text-base text-white border-b border-neutral-800 pb-3 flex items-center gap-2">
            <Truck className="h-4 w-4 text-luxury-gold" />
            <span>Geographic Distribution (Top Districts)</span>
          </h3>

          {metrics.topDistricts.length === 0 ? (
            <p className="text-xs text-neutral-500 py-6 text-center">No orders logged in this period.</p>
          ) : (
            <div className="divide-y divide-neutral-800/60">
              {metrics.topDistricts.map((d, idx) => (
                <div key={d.district} className="py-3 flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-neutral-500 w-4">#{idx + 1}</span>
                    <div>
                      <p className="font-medium text-white">{d.district}</p>
                      <span className="text-xs text-neutral-400">{d.orderCount} customer orders</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-white">{formatCurrency(d.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
