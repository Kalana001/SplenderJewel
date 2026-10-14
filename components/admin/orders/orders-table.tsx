'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Filter,
  ShoppingBag,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  ArrowRight,
  Eye,
  CreditCard,
  MessageCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/config/store';
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type OrderStatus,
} from '@/lib/config/constants';

interface OrderItemRow {
  id: string;
  order_number: string;
  customer_name: string;
  email: string | null;
  phone1: string;
  district: string;
  subtotal: number;
  delivery_fee: number;
  discount_amount: number;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  order_status: OrderStatus;
  tracking_number: string | null;
  admin_notes: string | null;
  created_at: string;
  itemsCount: number;
}

interface OrdersTableProps {
  initialOrders: OrderItemRow[];
  total: number;
  metrics: {
    totalOrders: number;
    totalRevenue: number;
    pendingReviewCount: number;
    pendingBankTransferCount: number;
  };
}

export function OrdersTable({ initialOrders, total, metrics }: OrdersTableProps) {
  const [orders, setOrders] = useState<OrderItemRow[]>(initialOrders);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');

  // Filter client-side
  const filteredOrders = orders.filter((order) => {
    if (statusFilter !== 'all' && order.order_status !== statusFilter) return false;
    if (paymentFilter !== 'all' && order.payment_method !== paymentFilter) return false;
    if (search.trim()) {
      const s = search.toLowerCase().trim();
      const matchNumber = order.order_number.toLowerCase().includes(s);
      const matchName = order.customer_name.toLowerCase().includes(s);
      const matchPhone = order.phone1.includes(s);
      const matchDistrict = order.district.toLowerCase().includes(s);
      if (!matchNumber && !matchName && !matchPhone && !matchDistrict) return false;
    }
    return true;
  });

  function getStatusBadge(status: OrderStatus) {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="border-amber-600/60 bg-amber-950/40 text-amber-400">Pending</Badge>;
      case 'confirmed':
        return <Badge variant="outline" className="border-blue-600/60 bg-blue-950/40 text-blue-400">Confirmed</Badge>;
      case 'processing':
        return <Badge variant="outline" className="border-purple-600/60 bg-purple-950/40 text-purple-400">Processing</Badge>;
      case 'shipped':
        return <Badge variant="outline" className="border-indigo-600/60 bg-indigo-950/40 text-indigo-400">Shipped</Badge>;
      case 'delivered':
        return <Badge variant="outline" className="border-emerald-600/60 bg-emerald-950/40 text-emerald-400">Delivered</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="border-rose-600/60 bg-rose-950/40 text-rose-400">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-1">
          <span className="text-xs text-neutral-400">Total Orders</span>
          <p className="text-xl sm:text-2xl font-bold text-white font-mono">{metrics.totalOrders}</p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-1">
          <span className="text-xs text-neutral-400">Total Revenue (Verified)</span>
          <p className="text-xl sm:text-2xl font-bold text-luxury-gold font-mono">{formatCurrency(metrics.totalRevenue)}</p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-1">
          <span className="text-xs text-amber-400 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>Pending Review</span>
          </span>
          <p className="text-xl sm:text-2xl font-bold text-amber-300 font-mono">{metrics.pendingReviewCount}</p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-1">
          <span className="text-xs text-emerald-400 flex items-center gap-1.5">
            <MessageCircle className="h-3.5 w-3.5" />
            <span>Bank Transfers Pending</span>
          </span>
          <p className="text-xl sm:text-2xl font-bold text-emerald-300 font-mono">{metrics.pendingBankTransferCount}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            type="text"
            placeholder="Search order #, customer, phone, or district..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-neutral-950 border-neutral-700 text-white text-sm"
          />
        </div>

        {/* Status and Payment Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 px-3 py-2 rounded-md bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs focus:ring-1 focus:ring-luxury-gold"
          >
            <option value="all">All Order Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="h-10 px-3 py-2 rounded-md bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs focus:ring-1 focus:ring-luxury-gold"
          >
            <option value="all">All Payment Methods</option>
            <option value="cod">Cash on Delivery</option>
            <option value="bank_transfer">Bank Transfer</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <ShoppingBag className="h-10 w-10 text-neutral-600 mx-auto" />
            <h3 className="text-base font-semibold text-white">No orders found</h3>
            <p className="text-xs text-neutral-400">
              {orders.length === 0
                ? 'No customer orders have been placed yet.'
                : 'No orders match your search and filter criteria.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-950/80 border-b border-neutral-800 text-neutral-400 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Order #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">District</th>
                  <th className="py-3 px-4 text-center">Items</th>
                  <th className="py-3 px-4">Total</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80 text-neutral-300">
                {filteredOrders.map((order) => {
                  const dateStr = new Date(order.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });

                  return (
                    <tr key={order.id} className="hover:bg-neutral-850/50 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-semibold text-white">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="hover:text-luxury-gold hover:underline"
                        >
                          {order.order_number}
                        </Link>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-400 whitespace-nowrap">{dateStr}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-white truncate max-w-[10rem]">
                          {order.customer_name}
                        </div>
                        <div className="text-[11px] text-neutral-500">{order.phone1}</div>
                      </td>
                      <td className="py-3.5 px-4">{order.district}</td>
                      <td className="py-3.5 px-4 text-center">{order.itemsCount}</td>
                      <td className="py-3.5 px-4 font-semibold text-luxury-gold whitespace-nowrap">
                        {formatCurrency(order.total_amount)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="capitalize text-[11px] text-neutral-300">
                            {order.payment_method === 'cod' ? 'COD' : 'Bank Transfer'}
                          </span>
                          <span
                            className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-bold ${
                              order.payment_status === 'verified'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-amber-950 text-amber-400 border border-amber-800'
                            }`}
                          >
                            {order.payment_status}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getStatusBadge(order.order_status)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link href={`/admin/orders/${order.id}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs border-neutral-700 bg-neutral-900 hover:border-luxury-gold hover:text-luxury-gold"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            <span>Fulfill</span>
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
