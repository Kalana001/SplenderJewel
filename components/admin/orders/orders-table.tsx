'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  ShoppingBag,
  Clock,
  Eye,
  MessageCircle,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/config/store';
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from '@/lib/config/constants';
import {
  bulkUpdateOrderStatusAction,
  type BulkOrderStatusResult,
} from '@/lib/orders/admin-actions';

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

interface BulkFeedbackState {
  totalCount: number;
  successCount: number;
  failureCount: number;
  targetStatus: OrderStatus;
  failures: BulkOrderStatusResult[];
}

export function OrdersTable({ initialOrders, total, metrics }: OrdersTableProps) {
  const [orders, setOrders] = useState<OrderItemRow[]>(initialOrders);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTargetStatus, setBulkTargetStatus] = useState<OrderStatus>('confirmed');
  const [bulkNotes, setBulkNotes] = useState('');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<BulkFeedbackState | null>(null);

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

  // Reconcile selection when search or filters change to prevent acting on hidden rows
  const handleSearchChange = (val: string) => {
    setSearch(val);
    setSelectedIds(new Set());
  };

  const handleStatusFilterChange = (val: string) => {
    setStatusFilter(val);
    setSelectedIds(new Set());
  };

  const handlePaymentFilterChange = (val: string) => {
    setPaymentFilter(val);
    setSelectedIds(new Set());
  };

  const handleToggleSelectAll = () => {
    if (filteredOrders.length === 0) return;
    const allSelected = filteredOrders.every((o) => selectedIds.has(o.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      const newSet = new Set(filteredOrders.map((o) => o.id));
      setSelectedIds(newSet);
    }
  };

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleExecuteBulkUpdate = async () => {
    if (selectedIds.size === 0 || isProcessingBulk) return;

    setIsProcessingBulk(true);
    try {
      const orderIds = Array.from(selectedIds);
      const response = await bulkUpdateOrderStatusAction({
        orderIds,
        newStatus: bulkTargetStatus,
        notes: bulkNotes.trim() || undefined,
      });

      if (response.successCount > 0) {
        const successfulIdSet = new Set(
          response.results.filter((r) => r.success).map((r) => r.orderId)
        );
        setOrders((prev) =>
          prev.map((ord) =>
            successfulIdSet.has(ord.id) ? { ...ord, order_status: bulkTargetStatus } : ord
          )
        );
      }

      setBulkFeedback({
        totalCount: response.totalCount,
        successCount: response.successCount,
        failureCount: response.failureCount,
        targetStatus: bulkTargetStatus,
        failures: response.results.filter((r) => !r.success),
      });

      setSelectedIds(new Set());
      setIsConfirmModalOpen(false);
      setBulkNotes('');
    } catch (err: unknown) {
      setBulkFeedback({
        totalCount: selectedIds.size,
        successCount: 0,
        failureCount: selectedIds.size,
        targetStatus: bulkTargetStatus,
        failures: [
          {
            orderId: 'all',
            orderNumber: 'Bulk Request',
            success: false,
            error: err instanceof Error ? err.message : 'An unexpected error occurred.',
          },
        ],
      });
      setIsConfirmModalOpen(false);
    } finally {
      setIsProcessingBulk(false);
    }
  };

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

  const allVisibleSelected =
    filteredOrders.length > 0 && filteredOrders.every((o) => selectedIds.has(o.id));

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

      {/* Bulk Feedback Notification */}
      {bulkFeedback && (
        <div
          role="status"
          className={`p-4 rounded-lg border transition-all text-sm flex flex-col gap-2 ${
            bulkFeedback.failureCount === 0
              ? 'bg-emerald-950/30 border-emerald-800/80 text-emerald-200'
              : bulkFeedback.successCount > 0
              ? 'bg-amber-950/30 border-amber-800/80 text-amber-200'
              : 'bg-rose-950/30 border-rose-800/80 text-rose-200'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              {bulkFeedback.failureCount === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              ) : bulkFeedback.successCount > 0 ? (
                <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-rose-400 flex-shrink-0" />
              )}
              <span className="font-medium">
                {bulkFeedback.failureCount === 0 ? (
                  <>Successfully updated {bulkFeedback.successCount} {bulkFeedback.successCount === 1 ? 'order' : 'orders'} to {ORDER_STATUS_LABELS[bulkFeedback.targetStatus]}.</>
                ) : (
                  <>
                    {bulkFeedback.successCount > 0 && (
                      <span>{bulkFeedback.successCount} {bulkFeedback.successCount === 1 ? 'order' : 'orders'} updated successfully. </span>
                    )}
                    <span>{bulkFeedback.failureCount} {bulkFeedback.failureCount === 1 ? 'order' : 'orders'} could not be updated.</span>
                  </>
                )}
              </span>
            </div>
            <button
              onClick={() => setBulkFeedback(null)}
              aria-label="Dismiss message"
              className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {bulkFeedback.failures.length > 0 && (
            <div className="mt-2 text-xs border-t border-neutral-800 pt-2 space-y-1">
              <span className="font-semibold text-neutral-300">Failure details:</span>
              <ul className="list-disc pl-5 space-y-0.5 text-neutral-400">
                {bulkFeedback.failures.map((f, i) => (
                  <li key={`${f.orderId}-${i}`}>
                    <span className="text-white font-mono">{f.orderNumber}</span>: {f.error || 'Status transition failed.'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            type="text"
            placeholder="Search order #, customer, phone, or district..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 bg-neutral-950 border-neutral-700 text-white text-sm"
          />
        </div>

        {/* Status and Payment Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value)}
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
            onChange={(e) => handlePaymentFilterChange(e.target.value)}
            className="h-10 px-3 py-2 rounded-md bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs focus:ring-1 focus:ring-luxury-gold"
          >
            <option value="all">All Payment Methods</option>
            <option value="cod">Cash on Delivery</option>
            <option value="bank_transfer">Bank Transfer</option>
          </select>
        </div>
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-neutral-900 border-2 border-luxury-gold/60 rounded-lg p-3 sm:p-4 shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <Badge className="bg-luxury-gold text-black font-semibold text-xs px-2.5 py-1">
              <Layers className="h-3.5 w-3.5 mr-1" />
              {selectedIds.size} {selectedIds.size === 1 ? 'order' : 'orders'} selected
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSelection}
              className="h-8 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800"
            >
              Clear selection
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label htmlFor="bulk-target-status" className="text-xs text-neutral-300 font-medium whitespace-nowrap">
                Action:
              </label>
              <select
                id="bulk-target-status"
                value={bulkTargetStatus}
                onChange={(e) => setBulkTargetStatus(e.target.value as OrderStatus)}
                className="h-9 px-3 py-1.5 rounded-md bg-neutral-950 border border-neutral-700 text-neutral-100 text-xs focus:ring-1 focus:ring-luxury-gold flex-1 sm:flex-initial"
              >
                <option value="pending">Set to Pending Review</option>
                <option value="confirmed">Set to Order Confirmed</option>
                <option value="processing">Set to Processing</option>
                <option value="shipped">Set to Shipped</option>
                <option value="delivered">Set to Delivered</option>
                <option value="cancelled">Set to Cancelled</option>
              </select>
            </div>

            <Button
              onClick={() => setIsConfirmModalOpen(true)}
              className="h-9 min-h-[44px] sm:min-h-[36px] px-4 text-xs font-semibold bg-luxury-gold text-black hover:bg-luxury-gold/90 w-full sm:w-auto"
            >
              Apply Status Update
            </Button>
          </div>
        </div>
      )}

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
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      aria-label="Select all visible orders"
                      checked={allVisibleSelected}
                      onChange={handleToggleSelectAll}
                      className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-luxury-gold focus:ring-luxury-gold focus:ring-offset-neutral-950 cursor-pointer accent-amber-500"
                    />
                  </th>
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
                  const isSelected = selectedIds.has(order.id);

                  return (
                    <tr
                      key={order.id}
                      className={`hover:bg-neutral-850/50 transition-colors ${
                        isSelected ? 'bg-luxury-gold/5' : ''
                      }`}
                    >
                      <td className="py-3.5 px-3 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Select order ${order.order_number}`}
                          checked={isSelected}
                          onChange={() => handleToggleRow(order.id)}
                          className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-luxury-gold focus:ring-luxury-gold focus:ring-offset-neutral-950 cursor-pointer accent-amber-500"
                        />
                      </td>
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

      {/* Confirmation Dialog Modal */}
      {isConfirmModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 id="bulk-confirm-title" className="text-base font-serif font-semibold text-white">
                  Confirm Bulk Status Update
                </h3>
                <p className="text-xs text-neutral-400 mt-1">
                  You are about to update {selectedIds.size} {selectedIds.size === 1 ? 'order' : 'orders'} to{' '}
                  <span className="text-luxury-gold font-semibold uppercase">
                    {ORDER_STATUS_LABELS[bulkTargetStatus]}
                  </span>
                  .
                </p>
              </div>
              <button
                onClick={() => !isProcessingBulk && setIsConfirmModalOpen(false)}
                disabled={isProcessingBulk}
                aria-label="Close dialog"
                className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Warning when updating to cancelled */}
            {bulkTargetStatus === 'cancelled' ? (
              <div className="p-3 rounded-md bg-rose-950/40 border border-rose-800 text-rose-300 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>Important Cancellation Warning</span>
                </div>
                <p>
                  Setting status to <strong>Cancelled</strong> is permanent. Eligible orders will be cancelled
                  and their reserved items will be atomically restocked into inventory via the database procedure.
                  Cancelled orders cannot be reopened.
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-md bg-neutral-950 border border-neutral-800 text-neutral-400 text-xs">
                Eligible orders will transition to {ORDER_STATUS_LABELS[bulkTargetStatus]}, and an audit history entry
                will be logged for each updated order.
              </div>
            )}

            {/* Optional Notes */}
            <div className="space-y-1.5">
              <label htmlFor="bulk-notes-input" className="text-xs text-neutral-300 font-medium">
                Admin Notes (Optional)
              </label>
              <Input
                id="bulk-notes-input"
                type="text"
                placeholder="e.g., Dispatched in bulk batch #12"
                value={bulkNotes}
                onChange={(e) => setBulkNotes(e.target.value)}
                disabled={isProcessingBulk}
                className="bg-neutral-950 border-neutral-700 text-white text-xs h-9"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isProcessingBulk}
                className="border-neutral-700 text-neutral-300 hover:text-white bg-neutral-900"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleExecuteBulkUpdate}
                disabled={isProcessingBulk}
                className={`min-h-[36px] px-4 font-semibold ${
                  bulkTargetStatus === 'cancelled'
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-luxury-gold text-black hover:bg-luxury-gold/90'
                }`}
              >
                {isProcessingBulk ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Confirm Update ({selectedIds.size})</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
