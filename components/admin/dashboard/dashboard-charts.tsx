'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  ShoppingBag,
  CreditCard,
  MapPin,
  Clock,
  ArrowUpRight,
  Eye,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/config/store';
import type {
  AdminDashboardAnalytics,
  DailyChartPoint,
} from '@/lib/orders/admin-actions';
import type { OrderStatus } from '@/lib/config/constants';

interface DashboardChartsProps {
  analytics: AdminDashboardAnalytics;
}

const CHART_WIDTH = 800;
const CHART_HEIGHT = 260;
const CHART_PADDING = { top: 25, right: 30, bottom: 40, left: 55 };
const GRAPH_WIDTH = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
const GRAPH_HEIGHT = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

export function DashboardCharts({ analytics }: DashboardChartsProps) {
  const [timeRange, setTimeRange] = useState<'7d' | '30d'>('7d');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const series: DailyChartPoint[] = useMemo(() => {
    return timeRange === '7d' ? analytics.dailySeries7d : analytics.dailySeries30d;
  }, [timeRange, analytics]);

  // Aggregate metrics for active time range
  const rangeTotals = useMemo(() => {
    const rev = series.reduce((sum, p) => sum + p.revenue, 0);
    const ord = series.reduce((sum, p) => sum + p.orders, 0);
    const aov = ord > 0 ? Math.round(rev / ord) : 0;
    return { rev, ord, aov };
  }, [series]);

  const maxRevenue = useMemo(() => {
    const m = Math.max(...series.map((p) => p.revenue), 0);
    return m === 0 ? 5000 : Math.ceil(m * 1.25);
  }, [series]);

  const maxOrders = useMemo(() => {
    const m = Math.max(...series.map((p) => p.orders), 0);
    return m === 0 ? 5 : m;
  }, [series]);

  // Point coordinates
  const points = useMemo(() => {
    if (series.length === 0) return [];
    const stepX = GRAPH_WIDTH / Math.max(series.length - 1, 1);
    return series.map((p, i) => {
      const x = CHART_PADDING.left + i * stepX;
      const y = CHART_PADDING.top + GRAPH_HEIGHT - (p.revenue / maxRevenue) * GRAPH_HEIGHT;
      const barH = (p.orders / maxOrders) * (GRAPH_HEIGHT * 0.45);
      const barY = CHART_PADDING.top + GRAPH_HEIGHT - barH;
      return { ...p, x, y, barH, barY, stepX };
    });
  }, [series, maxRevenue, maxOrders]);

  // Generate Smooth Bezier Curve Path
  const { linePath, areaPath } = useMemo(() => {
    if (points.length === 0) return { linePath: '', areaPath: '' };
    if (points.length === 1) {
      const p = points[0];
      return {
        linePath: `M ${CHART_PADDING.left} ${p.y} L ${CHART_WIDTH - CHART_PADDING.right} ${p.y}`,
        areaPath: `M ${CHART_PADDING.left} ${p.y} L ${CHART_WIDTH - CHART_PADDING.right} ${p.y} L ${CHART_WIDTH - CHART_PADDING.right} ${CHART_PADDING.top + GRAPH_HEIGHT} L ${CHART_PADDING.left} ${CHART_PADDING.top + GRAPH_HEIGHT} Z`,
      };
    }

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const controlX = (curr.x + next.x) / 2;
      d += ` C ${controlX} ${curr.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
    }

    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;
    const bottomY = CHART_PADDING.top + GRAPH_HEIGHT;
    const aPath = `${d} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;

    return { linePath: d, areaPath: aPath };
  }, [points]);

  // Payment totals
  const totalPaymentRev =
    analytics.paymentBreakdown.cod.revenue + analytics.paymentBreakdown.bankTransfer.revenue;
  const codPct =
    totalPaymentRev > 0
      ? Math.round((analytics.paymentBreakdown.cod.revenue / totalPaymentRev) * 100)
      : 0;
  const bankPct =
    totalPaymentRev > 0
      ? Math.round((analytics.paymentBreakdown.bankTransfer.revenue / totalPaymentRev) * 100)
      : 0;

  // District totals
  const totalDistrictOrders = analytics.topDistricts.reduce((sum, d) => sum + d.count, 0);

  function getStatusBadge(status: OrderStatus) {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="border-amber-600/60 bg-amber-950/40 text-amber-400 text-[10px]">Pending</Badge>;
      case 'confirmed':
        return <Badge variant="outline" className="border-blue-600/60 bg-blue-950/40 text-blue-400 text-[10px]">Confirmed</Badge>;
      case 'processing':
        return <Badge variant="outline" className="border-purple-600/60 bg-purple-950/40 text-purple-400 text-[10px]">Processing</Badge>;
      case 'shipped':
        return <Badge variant="outline" className="border-indigo-600/60 bg-indigo-950/40 text-indigo-400 text-[10px]">Shipped</Badge>;
      case 'delivered':
        return <Badge variant="outline" className="border-emerald-600/60 bg-emerald-950/40 text-emerald-400 text-[10px]">Delivered</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="border-rose-600/60 bg-rose-950/40 text-rose-400 text-[10px]">Cancelled</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Main Time-Series Trend Line/Area Chart */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-luxury-gold" />
              <h2 className="text-base sm:text-lg font-serif font-bold text-white tracking-wide">
                Sales Revenue &amp; Order Trajectory
              </h2>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              Daily revenue velocity (gold curve) and order placement volume (bars).
            </p>
          </div>

          {/* Time Filter Controls & Period Summary */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setTimeRange('7d')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                timeRange === '7d'
                  ? 'bg-luxury-gold text-neutral-950 shadow-md font-bold'
                  : 'bg-neutral-950 text-neutral-400 hover:text-white border border-neutral-800'
              }`}
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('30d')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                timeRange === '30d'
                  ? 'bg-luxury-gold text-neutral-950 shadow-md font-bold'
                  : 'bg-neutral-950 text-neutral-400 hover:text-white border border-neutral-800'
              }`}
            >
              Last 30 Days
            </button>
          </div>
        </div>

        {/* Period Summary Badges */}
        <div className="grid grid-cols-3 gap-3 border-y border-neutral-800/80 py-3">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 block">
              Period Sales
            </span>
            <span className="text-base sm:text-lg font-serif font-bold text-luxury-gold font-mono">
              {formatCurrency(rangeTotals.rev)}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 block">
              Orders Placed
            </span>
            <span className="text-base sm:text-lg font-serif font-bold text-white font-mono">
              {rangeTotals.ord} {rangeTotals.ord === 1 ? 'order' : 'orders'}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 block">
              Average Order Value
            </span>
            <span className="text-base sm:text-lg font-serif font-bold text-neutral-300 font-mono">
              {formatCurrency(rangeTotals.aov)}
            </span>
          </div>
        </div>

        {/* SVG Responsive Chart Viewport */}
        <div className="relative w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="w-full h-56 sm:h-72 select-none"
          >
            <defs>
              {/* Luxury Gold Area Gradient */}
              <linearGradient id="goldAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d4af37" stopOpacity="0.32" />
                <stop offset="60%" stopColor="#d4af37" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#d4af37" stopOpacity="0.0" />
              </linearGradient>

              {/* Order Bars Gradient */}
              <linearGradient id="orderBarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d4af37" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#d4af37" stopOpacity="0.1" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid Lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
              const y = CHART_PADDING.top + GRAPH_HEIGHT * (1 - pct);
              const val = Math.round(maxRevenue * pct);
              return (
                <g key={idx}>
                  <line
                    x1={CHART_PADDING.left}
                    y1={y}
                    x2={CHART_WIDTH - CHART_PADDING.right}
                    y2={y}
                    stroke="#262626"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <text
                    x={CHART_PADDING.left - 8}
                    y={y + 3}
                    textAnchor="end"
                    fill="#737373"
                    fontSize="9.5"
                    fontFamily="monospace"
                  >
                    Rs.{val >= 1000 ? `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k` : val}
                  </text>
                </g>
              );
            })}

            {/* Order Count Bars (Under Area Chart) */}
            {points.map((p, idx) => {
              if (p.orders === 0) return null;
              const barWidth = Math.max(Math.min(p.stepX * 0.45, 14), 4);
              return (
                <rect
                  key={`bar-${idx}`}
                  x={p.x - barWidth / 2}
                  y={p.barY}
                  width={barWidth}
                  height={p.barH}
                  rx="2"
                  fill="url(#orderBarGradient)"
                  className="transition-all duration-200"
                />
              );
            })}

            {/* Gradient Area Fill */}
            {areaPath && <path d={areaPath} fill="url(#goldAreaGradient)" />}

            {/* Smooth Curve Line */}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="#d4af37"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Data Points on Line */}
            {points.map((p, idx) => {
              const isHovered = hoveredIndex === idx;
              return (
                <g key={`pt-${idx}`}>
                  {/* Invisible hit target for hover */}
                  <rect
                    x={p.x - (p.stepX ? p.stepX / 2 : 15)}
                    y={CHART_PADDING.top}
                    width={p.stepX || 30}
                    height={GRAPH_HEIGHT}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />

                  {/* Active Point Circle */}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isHovered ? 6 : p.orders > 0 ? 3.5 : 2}
                    fill={isHovered ? '#fff' : '#d4af37'}
                    stroke={isHovered ? '#d4af37' : '#171717'}
                    strokeWidth={isHovered ? 2.5 : 1.5}
                    className="transition-all duration-150 pointer-events-none"
                  />
                </g>
              );
            })}

            {/* X-Axis Date Labels */}
            {points.map((p, idx) => {
              // Show appropriate label interval
              const shouldShowLabel =
                timeRange === '7d'
                  ? true
                  : idx % 4 === 0 || idx === points.length - 1;

              if (!shouldShowLabel) return null;
              return (
                <text
                  key={`lbl-${idx}`}
                  x={p.x}
                  y={CHART_HEIGHT - 12}
                  textAnchor="middle"
                  fill="#737373"
                  fontSize="9.5"
                  className="pointer-events-none"
                >
                  {p.label}
                </text>
              );
            })}
          </svg>

          {/* Interactive Floating Hover Tooltip */}
          {hoveredIndex !== null && points[hoveredIndex] && (
            <div
              className="absolute z-20 pointer-events-none bg-neutral-950/95 border border-luxury-gold/50 shadow-2xl rounded-md p-2.5 text-xs text-white transform -translate-x-1/2 -translate-y-full transition-all duration-75"
              style={{
                left: `${(points[hoveredIndex].x / CHART_WIDTH) * 100}%`,
                top: `${(points[hoveredIndex].y / CHART_HEIGHT) * 100}%`,
                marginTop: '-12px',
              }}
            >
              <p className="font-bold text-neutral-300 pb-1 border-b border-neutral-800 text-[11px]">
                {points[hoveredIndex].dayName}, {points[hoveredIndex].label}
              </p>
              <div className="pt-1 space-y-0.5">
                <p className="font-bold text-luxury-gold font-mono">
                  Revenue: {formatCurrency(points[hoveredIndex].revenue)}
                </p>
                <p className="text-neutral-400 text-[11px]">
                  Orders: <span className="text-white font-semibold">{points[hoveredIndex].orders}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Middle Row: Payment Method Breakdown & Regional District Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Breakdown Card */}
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-luxury-gold" />
              <h3 className="font-serif font-bold text-white text-base">
                Revenue by Payment Method
              </h3>
            </div>
            <span className="text-xs text-neutral-400">Past 30 Days</span>
          </div>

          <div className="space-y-4 pt-1">
            {/* COD */}
            <div className="p-3.5 bg-neutral-950/80 rounded border border-neutral-800/80 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-white">Cash on Delivery (COD)</span>
                <span className="font-bold text-amber-400 font-mono">
                  {formatCurrency(analytics.paymentBreakdown.cod.revenue)}
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${codPct}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[11px] text-neutral-400">
                <span>{analytics.paymentBreakdown.cod.count} orders</span>
                <span>{codPct}% of total sales</span>
              </div>
            </div>

            {/* Bank Transfer */}
            <div className="p-3.5 bg-neutral-950/80 rounded border border-neutral-800/80 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-white">Bank Transfer (Verified)</span>
                <span className="font-bold text-emerald-400 font-mono">
                  {formatCurrency(analytics.paymentBreakdown.bankTransfer.revenue)}
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${bankPct}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[11px] text-neutral-400">
                <span>{analytics.paymentBreakdown.bankTransfer.count} orders</span>
                <span>{bankPct}% of total sales</span>
              </div>
            </div>
          </div>
        </div>

        {/* Regional District Distribution Card */}
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-luxury-gold" />
              <h3 className="font-serif font-bold text-white text-base">
                Top Delivery Districts
              </h3>
            </div>
            <span className="text-xs text-neutral-400">Sri Lanka Islandwide</span>
          </div>

          {analytics.topDistricts.length === 0 ? (
            <div className="py-8 text-center text-neutral-500 text-xs">
              No regional order data recorded yet.
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              {analytics.topDistricts.map((d) => {
                const pct =
                  totalDistrictOrders > 0
                    ? Math.round((d.count / totalDistrictOrders) * 100)
                    : 0;
                return (
                  <div key={d.district} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-medium text-white">{d.district}</span>
                      <span className="font-mono text-neutral-300">
                        {d.count} {d.count === 1 ? 'order' : 'orders'} ({formatCurrency(d.revenue)})
                      </span>
                    </div>
                    <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-luxury-gold h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 3. Bottom Row: Recent Orders Quick-Audit Table */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-luxury-gold" />
            <h3 className="font-serif font-bold text-white text-base">
              Recent Orders Quick Access
            </h3>
          </div>
          <Link href="/admin/orders">
            <Button
              variant="outline"
              size="sm"
              className="text-xs border-neutral-700 bg-neutral-900 text-luxury-gold hover:border-luxury-gold hover:bg-luxury-gold/10 flex items-center gap-1"
            >
              <span>View All Orders</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        {analytics.recentOrders.length === 0 ? (
          <div className="py-8 text-center text-neutral-500 text-xs">
            No customer orders received yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Order #</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">District</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Payment</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
                {analytics.recentOrders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-neutral-800/40 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-white">
                      {ord.orderNumber}
                    </td>
                    <td className="py-3 px-3 font-medium text-white">
                      {ord.customerName}
                    </td>
                    <td className="py-3 px-3 text-neutral-400">
                      {ord.district}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-luxury-gold">
                      {formatCurrency(ord.totalAmount)}
                    </td>
                    <td className="py-3 px-3">
                      <span className="capitalize text-[11px] text-neutral-300">
                        {ord.paymentMethod === 'cod' ? 'COD' : 'Bank Transfer'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {getStatusBadge(ord.orderStatus)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Link href={`/admin/orders/${ord.id}`}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px] border-neutral-700 bg-neutral-900 hover:border-luxury-gold hover:text-luxury-gold"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          <span>Fulfill</span>
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
