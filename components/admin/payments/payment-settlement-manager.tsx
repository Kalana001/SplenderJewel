'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  CheckCircle2,
  AlertCircle,
  Truck,
  Eye,
  MessageCircle,
  DollarSign,
  Calendar,
  X,
  CreditCard,
  ShieldCheck,
  Building,
  FileCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/config/store';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUSES,
  type OrderStatus,
} from '@/lib/config/constants';
import {
  confirmCodPaymentAction,
  updatePaymentStatusAction,
  type AdminPaymentRow,
  type AdminOrderSummaryMetrics,
} from '@/lib/orders/admin-actions';

interface PaymentSettlementManagerProps {
  initialPayments: AdminPaymentRow[];
  total: number;
  metrics: AdminOrderSummaryMetrics;
}

export function PaymentSettlementManager({
  initialPayments,
  total,
  metrics: initialMetrics,
}: PaymentSettlementManagerProps) {
  const [payments, setPayments] = useState<AdminPaymentRow[]>(initialPayments);
  const [metrics, setMetrics] = useState<AdminOrderSummaryMetrics>(initialMetrics);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'all' | 'pending_cod' | 'pending_bank' | 'verified'>('all');

  // Modal State for COD Confirmation
  const [codModalOrder, setCodModalOrder] = useState<AdminPaymentRow | null>(null);
  const [courierName, setCourierName] = useState('');
  const [settlementRef, setSettlementRef] = useState('');
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [settlementNotes, setSettlementNotes] = useState('');
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);
  const [isSubmittingCod, setIsSubmittingCod] = useState(false);
  const [codError, setCodError] = useState<string | null>(null);

  // Modal State for Bank Transfer Verification
  const [bankModalOrder, setBankModalOrder] = useState<AdminPaymentRow | null>(null);
  const [bankNotes, setBankNotes] = useState('');
  const [isSubmittingBank, setIsSubmittingBank] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);

  // Client-side filtering
  const filteredPayments = payments.filter((item) => {
    // Tab filter
    if (activeTab === 'pending_cod') {
      if (item.payment_method !== 'cod' || item.payment_status === 'verified') return false;
      if (item.order_status === 'cancelled' || item.order_status === 'refunded') return false;
    } else if (activeTab === 'pending_bank') {
      if (item.payment_method !== 'bank_transfer' || item.payment_status === 'verified') return false;
      if (item.order_status === 'cancelled' || item.order_status === 'refunded') return false;
    } else if (activeTab === 'verified') {
      if (item.payment_status !== 'verified') return false;
      if (item.order_status === 'cancelled' || item.order_status === 'refunded') return false;
    }

    // Dropdown filters
    if (methodFilter !== 'all' && item.payment_method !== methodFilter) return false;
    if (statusFilter !== 'all' && item.payment_status !== statusFilter) return false;

    // Search query
    if (search.trim()) {
      const s = search.toLowerCase().trim();
      const matchNumber = item.order_number.toLowerCase().includes(s);
      const matchName = item.customer_name.toLowerCase().includes(s);
      const matchPhone = item.phone1.includes(s);
      const matchDistrict = item.district.toLowerCase().includes(s);
      const paymentRecord = item.payments?.[0];
      const matchRef = paymentRecord?.reference_number?.toLowerCase().includes(s);
      const matchNotes = paymentRecord?.notes?.toLowerCase().includes(s);
      if (!matchNumber && !matchName && !matchPhone && !matchDistrict && !matchRef && !matchNotes) {
        return false;
      }
    }

    return true;
  });

  // Open COD Modal
  function handleOpenCodModal(order: AdminPaymentRow) {
    setCodModalOrder(order);
    setCourierName('');
    setSettlementRef(order.tracking_number || '');
    setReceiptDate(new Date().toISOString().split('T')[0]);
    setSettlementNotes('');
    setConfirmCheckbox(false);
    setCodError(null);
  }

  // Submit COD Settlement
  async function handleSubmitCodSettlement() {
    if (!codModalOrder || !confirmCheckbox) return;
    if (codModalOrder.order_status !== 'delivered') {
      setCodError('Order must be marked as delivered before COD payment can be confirmed.');
      return;
    }

    setIsSubmittingCod(true);
    setCodError(null);

    try {
      const res = await confirmCodPaymentAction({
        orderId: codModalOrder.id,
        courierName: courierName.trim() || undefined,
        settlementReference: settlementRef.trim() || undefined,
        receiptDate: receiptDate.trim() || undefined,
        notes: settlementNotes.trim() || undefined,
        confirmedByUser: true,
      });

      if (!res.success) {
        setCodError(res.error || 'Failed to confirm COD settlement.');
        return;
      }

      // Update local state optimistically
      setPayments((prev) =>
        prev.map((o) =>
          o.id === codModalOrder.id
            ? {
                ...o,
                payment_status: 'verified',
                payments: [
                  {
                    id: 'local-' + Date.now(),
                    status: 'verified',
                    reference_number: settlementRef.trim() || null,
                    approved_by: 'current-admin',
                    approved_at: new Date().toISOString(),
                    notes: `COD Settlement Confirmed | Courier: ${courierName || 'Unspecified'} | Ref: ${settlementRef || 'N/A'}`,
                  },
                ],
              }
            : o
        )
      );

      // Adjust metrics
      setMetrics((prev) => ({
        ...prev,
        totalRevenue: prev.totalRevenue + Number(codModalOrder.total_amount),
        pendingCodSettlementCount: Math.max(0, prev.pendingCodSettlementCount - 1),
      }));

      setCodModalOrder(null);
    } catch (err: unknown) {
      setCodError('An unexpected network or server error occurred.');
    } finally {
      setIsSubmittingCod(false);
    }
  }

  // Open Bank Modal
  function handleOpenBankModal(order: AdminPaymentRow) {
    setBankModalOrder(order);
    setBankNotes('Verified via WhatsApp deposit slip confirmation.');
    setBankError(null);
  }

  // Submit Bank Transfer Verification
  async function handleSubmitBankVerification() {
    if (!bankModalOrder) return;

    setIsSubmittingBank(true);
    setBankError(null);

    try {
      const res = await updatePaymentStatusAction({
        orderId: bankModalOrder.id,
        newPaymentStatus: PAYMENT_STATUSES.VERIFIED,
        notes: bankNotes.trim() || 'Bank transfer verified by administrator.',
      });

      if (!res.success) {
        setBankError(res.error || 'Failed to verify bank transfer.');
        return;
      }

      setPayments((prev) =>
        prev.map((o) =>
          o.id === bankModalOrder.id
            ? {
                ...o,
                payment_status: 'verified',
              }
            : o
        )
      );

      setMetrics((prev) => ({
        ...prev,
        totalRevenue: prev.totalRevenue + Number(bankModalOrder.total_amount),
        pendingBankTransferCount: Math.max(0, prev.pendingBankTransferCount - 1),
      }));

      setBankModalOrder(null);
    } catch (err: unknown) {
      setBankError('An unexpected network or server error occurred.');
    } finally {
      setIsSubmittingBank(false);
    }
  }

  function getDeliveryBadge(status: OrderStatus) {
    switch (status) {
      case 'delivered':
        return <Badge variant="outline" className="border-emerald-600/70 bg-emerald-950/40 text-emerald-400 font-semibold">Delivered</Badge>;
      case 'shipped':
        return <Badge variant="outline" className="border-indigo-600/70 bg-indigo-950/40 text-indigo-400">Shipped</Badge>;
      case 'processing':
        return <Badge variant="outline" className="border-purple-600/70 bg-purple-950/40 text-purple-400">Processing</Badge>;
      case 'confirmed':
        return <Badge variant="outline" className="border-blue-600/70 bg-blue-950/40 text-blue-400">Confirmed</Badge>;
      case 'pending':
        return <Badge variant="outline" className="border-amber-600/70 bg-amber-950/40 text-amber-400">Pending</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="border-rose-600/70 bg-rose-950/40 text-rose-400">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  function getPaymentBadge(status: string) {
    switch (status) {
      case 'verified':
        return <Badge variant="outline" className="border-emerald-500/80 bg-emerald-950/60 text-emerald-300 font-bold">✓ Confirmed & Paid</Badge>;
      case 'pending':
        return <Badge variant="outline" className="border-amber-500/80 bg-amber-950/60 text-amber-300 font-bold">⏳ Payment Pending</Badge>;
      case 'failed':
        return <Badge variant="outline" className="border-rose-600 bg-rose-950/60 text-rose-400">Failed</Badge>;
      case 'refunded':
        return <Badge variant="outline" className="border-neutral-600 bg-neutral-900 text-neutral-400">Refunded</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  return (
    <div className="space-y-6">
      {/* Overview Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Confirmed Revenue */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-1">
          <span className="text-xs text-neutral-400 flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-luxury-gold" />
            <span>Total Revenue (Confirmed)</span>
          </span>
          <p className="text-xl sm:text-2xl font-bold text-luxury-gold font-mono">
            {formatCurrency(metrics.totalRevenue)}
          </p>
          <span className="text-[10px] text-neutral-500 block">Funds physically received only</span>
        </div>

        {/* Pending COD Settlements */}
        <div
          onClick={() => setActiveTab('pending_cod')}
          className={`cursor-pointer rounded-lg p-4 space-y-1 border transition-all ${
            activeTab === 'pending_cod'
              ? 'bg-amber-950/40 border-amber-500/80 ring-1 ring-amber-500'
              : 'bg-neutral-900 border-neutral-800 hover:border-amber-700/60'
          }`}
        >
          <span className="text-xs text-amber-400 flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" />
            <span>Pending COD Settlements</span>
          </span>
          <p className="text-xl sm:text-2xl font-bold text-amber-300 font-mono">
            {metrics.pendingCodSettlementCount}
          </p>
          <span className="text-[10px] text-neutral-500 block">Courier funds awaiting receipt</span>
        </div>

        {/* Pending Bank Transfers */}
        <div
          onClick={() => setActiveTab('pending_bank')}
          className={`cursor-pointer rounded-lg p-4 space-y-1 border transition-all ${
            activeTab === 'pending_bank'
              ? 'bg-emerald-950/40 border-emerald-500/80 ring-1 ring-emerald-500'
              : 'bg-neutral-900 border-neutral-800 hover:border-emerald-700/60'
          }`}
        >
          <span className="text-xs text-emerald-400 flex items-center gap-1.5">
            <MessageCircle className="h-3.5 w-3.5" />
            <span>Pending Bank Transfers</span>
          </span>
          <p className="text-xl sm:text-2xl font-bold text-emerald-300 font-mono">
            {metrics.pendingBankTransferCount}
          </p>
          <span className="text-[10px] text-neutral-500 block">WhatsApp slips awaiting review</span>
        </div>

        {/* Total Orders Count */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-1">
          <span className="text-xs text-neutral-400 flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5 text-neutral-400" />
            <span>Total Orders</span>
          </span>
          <p className="text-xl sm:text-2xl font-bold text-white font-mono">
            {metrics.totalOrders}
          </p>
          <span className="text-[10px] text-neutral-500 block">Lifetime store volume</span>
        </div>
      </div>

      {/* Critical Business Rule Banner */}
      <div className="bg-neutral-900/90 border border-luxury-gold/40 rounded-lg p-4 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-luxury-gold shrink-0 mt-0.5" />
        <div className="text-xs text-neutral-300 space-y-0.5">
          <span className="font-semibold text-white">Critical Accounting Rule: Delivered does NOT mean Paid.</span>
          <p className="text-neutral-400 leading-relaxed">
            When a COD parcel is marked delivered, the customer has received the jewelry, but courier remittance to
            Splender Jewel is still pending. Total Revenue reflects strictly money verified and confirmed received.
          </p>
        </div>
      </div>

      {/* Quick Filter Tabs & Search Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-4">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 pb-3">
          <Button
            variant={activeTab === 'all' ? 'gold' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('all')}
            className="text-xs font-semibold"
          >
            All Transactions
          </Button>
          <Button
            variant={activeTab === 'pending_cod' ? 'gold' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('pending_cod')}
            className={`text-xs font-semibold ${
              metrics.pendingCodSettlementCount > 0 ? 'text-amber-300' : ''
            }`}
          >
            Pending COD ({metrics.pendingCodSettlementCount})
          </Button>
          <Button
            variant={activeTab === 'pending_bank' ? 'gold' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('pending_bank')}
            className={`text-xs font-semibold ${
              metrics.pendingBankTransferCount > 0 ? 'text-emerald-300' : ''
            }`}
          >
            Pending Bank Transfers ({metrics.pendingBankTransferCount})
          </Button>
          <Button
            variant={activeTab === 'verified' ? 'gold' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('verified')}
            className="text-xs font-semibold"
          >
            Confirmed Payments
          </Button>
        </div>

        {/* Search & Select Filters */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              type="text"
              placeholder="Search order #, customer, phone, or settlement ref..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-neutral-950 border-neutral-700 text-white text-xs h-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="h-9 px-3 rounded bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs focus:ring-1 focus:ring-luxury-gold"
            >
              <option value="all">All Payment Methods</option>
              <option value="cod">Cash on Delivery (COD)</option>
              <option value="bank_transfer">Bank Deposit (WhatsApp)</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 rounded bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs focus:ring-1 focus:ring-luxury-gold"
            >
              <option value="all">All Payment Statuses</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified & Paid</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
        </div>
      </div>

      {/* Settlements Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        {filteredPayments.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <CreditCard className="h-10 w-10 text-neutral-600 mx-auto" />
            <h3 className="text-base font-semibold text-white">No payment settlement records found</h3>
            <p className="text-xs text-neutral-400">
              No orders match the current filter or search criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-950 text-neutral-400 uppercase text-[10px] tracking-wider border-b border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Order # & Date</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Delivery Status</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4">Payment Status</th>
                  <th className="py-3 px-4 text-right">Amount (LKR)</th>
                  <th className="py-3 px-4">Settlement Info</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80 text-neutral-300">
                {filteredPayments.map((item) => {
                  const paymentRecord = item.payments?.[0];
                  const isCod = item.payment_method === 'cod';
                  const isBank = item.payment_method === 'bank_transfer';
                  const isPending = item.payment_status === 'pending';
                  const isDelivered = item.order_status === 'delivered';
                  const isCancelled = item.order_status === 'cancelled' || item.order_status === 'refunded';

                  return (
                    <tr key={item.id} className="hover:bg-neutral-800/30 transition-colors">
                      {/* Order Number & Date */}
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/admin/orders/${item.id}`}
                          className="font-mono font-bold text-white hover:text-luxury-gold transition-colors block"
                        >
                          {item.order_number}
                        </Link>
                        <span className="text-[10px] text-neutral-500">
                          {new Date(item.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </td>

                      {/* Customer Info */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{item.customer_name}</div>
                        <div className="text-[11px] text-neutral-400 font-mono">{item.phone1}</div>
                        <div className="text-[10px] text-neutral-500 uppercase">{item.district}</div>
                      </td>

                      {/* Delivery Status */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          {getDeliveryBadge(item.order_status)}
                          {isCod && isDelivered && isPending && (
                            <span className="block text-[10px] text-amber-400 font-medium">
                              ⚠ Delivered, payment uncollected
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Payment Method */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-neutral-200 block">
                          {isCod ? 'Cash on Delivery' : 'Bank Deposit'}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-mono">
                          {isCod ? 'Courier Collection' : 'WhatsApp Slip'}
                        </span>
                      </td>

                      {/* Payment Status */}
                      <td className="py-3.5 px-4">
                        {getPaymentBadge(item.payment_status)}
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 text-right">
                        <span
                          className={`font-mono font-bold text-sm ${
                            item.payment_status === 'verified' ? 'text-luxury-gold' : 'text-neutral-300'
                          }`}
                        >
                          {formatCurrency(item.total_amount)}
                        </span>
                      </td>

                      {/* Settlement / Audit Info */}
                      <td className="py-3.5 px-4">
                        {paymentRecord ? (
                          <div className="space-y-0.5 text-[11px]">
                            {paymentRecord.reference_number && (
                              <div className="font-mono text-neutral-300">
                                Ref: <strong className="text-white">{paymentRecord.reference_number}</strong>
                              </div>
                            )}
                            {paymentRecord.approved_at && (
                              <div className="text-[10px] text-neutral-500">
                                Confirmed: {new Date(paymentRecord.approved_at).toLocaleDateString()}
                              </div>
                            )}
                            {paymentRecord.notes && (
                              <div className="text-[10px] text-neutral-400 truncate max-w-xs" title={paymentRecord.notes}>
                                {paymentRecord.notes}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-neutral-600 italic">No settlement record</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Confirm COD Payment Action */}
                          {isCod && isPending && !isCancelled && (
                            item.order_status === 'delivered' ? (
                              <Button
                                variant="gold"
                                size="sm"
                                onClick={() => handleOpenCodModal(item)}
                                className="text-xs font-semibold h-8 whitespace-nowrap"
                              >
                                Confirm Payment
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled
                                className="text-xs font-normal h-8 text-neutral-500 border-neutral-800 bg-neutral-950/50 cursor-not-allowed whitespace-nowrap"
                                title="Order must be delivered before COD payment can be confirmed"
                              >
                                Awaiting Delivery
                              </Button>
                            )
                          )}

                          {/* Verify Bank Transfer Action */}
                          {isBank && isPending && !isCancelled && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenBankModal(item)}
                              className="text-xs font-semibold h-8 border-emerald-700/80 text-emerald-300 hover:bg-emerald-950/60 whitespace-nowrap"
                            >
                              Verify Transfer
                            </Button>
                          )}

                          {/* View Order Link */}
                          <Link href={`/admin/orders/${item.id}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0 border-neutral-700 bg-neutral-950 text-neutral-400 hover:text-white"
                              title="View Order Details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: CONFIRM COD SETTLEMENT RECEIVED */}
      {codModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg max-w-lg w-full p-6 space-y-5 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-neutral-800 pb-4">
              <div>
                <h3 className="text-lg font-serif font-bold text-white flex items-center gap-2">
                  <Truck className="h-5 w-5 text-luxury-gold" />
                  <span>Confirm COD Settlement Received</span>
                </h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Order <strong className="text-white font-mono">{codModalOrder.order_number}</strong> • Customer: {codModalOrder.customer_name}
                </p>
              </div>
              <button
                onClick={() => setCodModalOrder(null)}
                className="text-neutral-400 hover:text-white transition-colors p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Warning Callout */}
            <div className="bg-amber-950/40 border border-amber-800/80 rounded p-3 text-xs text-amber-200 space-y-1">
              <strong>CRITICAL BUSINESS RULE: Delivered does NOT mean Paid.</strong>
              <p className="text-[11px] text-amber-300/90 leading-relaxed">
                Only confirm this order after Splender Jewel has physically received the cash remittance from the courier partner.
              </p>
            </div>

            {/* Financial Summary Card */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-neutral-950 p-3.5 rounded border border-neutral-800">
              <div>
                <span className="text-neutral-400 block">Expected COD Amount:</span>
                <span className="text-base font-bold text-luxury-gold font-mono">
                  {formatCurrency(codModalOrder.total_amount)}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block">Current Delivery Status:</span>
                <span className="font-semibold text-white capitalize">{codModalOrder.order_status}</span>
              </div>
            </div>

            {/* Input Form Fields */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-neutral-300 font-semibold block mb-1">
                  Courier Partner Name (Optional):
                </label>
                <Input
                  type="text"
                  placeholder="e.g. PromptX, Pronto, Domex, Koombiyo, Certis Lanka..."
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                  className="bg-neutral-950 border-neutral-700 text-white text-xs h-9"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">
                    Settlement / Voucher Ref:
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. REM-89412 or Cheque #"
                    value={settlementRef}
                    onChange={(e) => setSettlementRef(e.target.value)}
                    className="bg-neutral-950 border-neutral-700 text-white text-xs h-9 font-mono"
                  />
                </div>

                <div>
                  <label className="text-neutral-300 font-semibold block mb-1">
                    Funds Receipt Date:
                  </label>
                  <Input
                    type="date"
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                    className="bg-neutral-950 border-neutral-700 text-white text-xs h-9"
                  />
                </div>
              </div>

              <div>
                <label className="text-neutral-300 font-semibold block mb-1">
                  Administrative Notes (Optional):
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Courier batch #49 reconciled with bank deposit"
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value)}
                  className="bg-neutral-950 border-neutral-700 text-white text-xs h-9"
                />
              </div>

              {/* Delivery Prerequisite Non-Overridable Notice */}
              {codModalOrder.order_status !== 'delivered' && (
                <div className="bg-amber-950/60 border border-amber-700/80 rounded p-3 text-xs space-y-1 text-amber-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                    <div>
                      <strong className="block text-amber-100">Delivery Confirmation Required</strong>
                      <span className="text-[11px] leading-relaxed text-amber-300/90">
                        This order is currently marked as <strong className="uppercase text-amber-100">{codModalOrder.order_status}</strong>. COD remittance cannot be confirmed until the parcel has been delivered to the customer.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Mandatory Confirmation Checkbox */}
              <div className="pt-1">
                <label className="flex items-start gap-2.5 p-3 rounded bg-neutral-950 border border-neutral-800 cursor-pointer hover:border-neutral-700">
                  <input
                    type="checkbox"
                    checked={confirmCheckbox}
                    onChange={(e) => setConfirmCheckbox(e.target.checked)}
                    disabled={codModalOrder.order_status !== 'delivered'}
                    className="h-4 w-4 mt-0.5 rounded border-neutral-700 text-luxury-gold focus:ring-luxury-gold bg-black disabled:opacity-50"
                  />
                  <span className="text-[11px] text-neutral-300 leading-snug">
                    I confirm that Splender Jewel has physically received the funds ({formatCurrency(codModalOrder.total_amount)}) from the courier service for this order.
                  </span>
                </label>
              </div>

              {codError && (
                <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{codError}</span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCodModalOrder(null)}
                disabled={isSubmittingCod}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="gold"
                size="sm"
                onClick={handleSubmitCodSettlement}
                disabled={
                  !confirmCheckbox ||
                  codModalOrder.order_status !== 'delivered' ||
                  isSubmittingCod
                }
                className="text-xs font-semibold flex items-center gap-1.5"
              >
                <FileCheck className="h-3.5 w-3.5" />
                <span>{isSubmittingCod ? 'Recording Settlement...' : 'Confirm Payment Received'}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: VERIFY BANK TRANSFER */}
      {bankModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-neutral-800 pb-4">
              <div>
                <h3 className="text-lg font-serif font-bold text-white flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-emerald-400" />
                  <span>Verify Bank Transfer</span>
                </h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Order <strong className="text-white font-mono">{bankModalOrder.order_number}</strong> • Amount: {formatCurrency(bankModalOrder.total_amount)}
                </p>
              </div>
              <button
                onClick={() => setBankModalOrder(null)}
                className="text-neutral-400 hover:text-white transition-colors p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Ensure the customer deposit slip was received on WhatsApp (+94 76 468 9907) and verified in the company bank account before confirming.
            </p>

            <div className="space-y-1 text-xs">
              <label className="text-neutral-300 font-semibold block">
                Verification Notes:
              </label>
              <Input
                type="text"
                value={bankNotes}
                onChange={(e) => setBankNotes(e.target.value)}
                className="bg-neutral-950 border-neutral-700 text-white text-xs h-9"
              />
            </div>

            {bankError && (
              <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                {bankError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBankModalOrder(null)}
                disabled={isSubmittingBank}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="gold"
                size="sm"
                onClick={handleSubmitBankVerification}
                disabled={isSubmittingBank}
                className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {isSubmittingBank ? 'Verifying...' : 'Approve Bank Transfer'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
