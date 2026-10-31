'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageCircle,
  FileText,
  Printer,
  ShieldCheck,
  DollarSign,
  Package,
  Save,
  Check,
  Send,
  X,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/config/store';
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  type OrderStatus,
  type PaymentStatus,
} from '@/lib/config/constants';
import {
  updateOrderStatusAction,
  updatePaymentStatusAction,
  confirmCodPaymentAction,
  updateAdminNotesAction,
  updateTrackingNumberAction,
} from '@/lib/orders/admin-actions';
import { generateOrderInvoicePdf, type InvoiceOrderData } from '@/lib/orders/invoice-pdf';

interface OrderFulfillmentManagerProps {
  order: any;
}

export function OrderFulfillmentManager({ order: initialOrder }: OrderFulfillmentManagerProps) {
  const [order, setOrder] = useState(initialOrder);

  // Status transition states
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus>(order.order_status);
  const [statusNotes, setStatusNotes] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Payment states
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);

  // Admin notes state
  const [adminNotes, setAdminNotes] = useState(order.admin_notes || '');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  // Tracking state
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number || '');
  const [isSavingTracking, setIsSavingTracking] = useState(false);
  const [trackingSaved, setTrackingSaved] = useState(false);

  // Print label modal state
  const [showPrintLabel, setShowPrintLabel] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Download Invoice / Receipt PDF
  const handleDownloadInvoice = () => {
    try {
      setIsGeneratingPdf(true);
      const invoiceData: InvoiceOrderData = {
        orderNumber: order.order_number,
        createdAt: order.created_at,
        customerName: order.customer_name,
        phone1: order.phone1,
        phone2: order.phone2,
        email: order.email,
        addressLine: order.address_line,
        city: order.city,
        district: order.district,
        postalCode: order.postal_code,
        subtotal: Number(order.subtotal) || 0,
        deliveryFee: Number(order.delivery_fee) || 0,
        discountAmount: Number(order.discount_amount) || 0,
        couponCode: order.coupon_code,
        totalAmount: Number(order.total_amount) || 0,
        paymentMethod: order.payment_method,
        paymentStatus: order.payment_status,
        orderStatus: order.order_status,
        trackingNumber: order.tracking_number,
        items: (order.order_items || []).map((item: any) => ({
          productName: item.product_name,
          variantTitle: item.variant_title,
          sku: item.sku,
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unit_price) || 0,
          totalPrice: Number(item.total_price) || 0,
        })),
      };
      generateOrderInvoicePdf(invoiceData);
    } catch (err) {
      console.error('Failed to generate invoice PDF:', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Update order status
  async function handleUpdateStatus() {
    if (selectedStatus === order.order_status) return;
    setIsUpdatingStatus(true);
    try {
      const res = await updateOrderStatusAction({
        orderId: order.id,
        newStatus: selectedStatus,
        notes: statusNotes.trim() || undefined,
      });
      if (res.success) {
        setOrder((prev: any) => ({
          ...prev,
          order_status: selectedStatus,
          order_status_history: [
            {
              id: 'local-' + Date.now(),
              previous_status: prev.order_status,
              new_status: selectedStatus,
              notes: statusNotes.trim() || `Status updated to ${selectedStatus}`,
              created_at: new Date().toISOString(),
            },
            ...(prev.order_status_history || []),
          ],
        }));
        setStatusNotes('');
      } else {
        alert(res.error || 'Failed to update order status');
      }
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  // Verify WhatsApp Bank Transfer
  async function handleVerifyBankTransfer() {
    setIsUpdatingPayment(true);
    try {
      const res = await updatePaymentStatusAction({
        orderId: order.id,
        newPaymentStatus: PAYMENT_STATUSES.VERIFIED,
        notes: 'Bank transfer verified by administrator after receipt confirmation.',
      });
      if (res.success) {
        setOrder((prev: any) => ({
          ...prev,
          payment_status: PAYMENT_STATUSES.VERIFIED,
        }));
      } else {
        alert(res.error || 'Failed to update payment status');
      }
    } finally {
      setIsUpdatingPayment(false);
    }
  }

  // COD Settlement Modal State
  const [showCodModal, setShowCodModal] = useState(false);
  const [courierName, setCourierName] = useState('');
  const [settlementRef, setSettlementRef] = useState(order.tracking_number || '');
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [settlementNotes, setSettlementNotes] = useState('');
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);
  const [isSubmittingCod, setIsSubmittingCod] = useState(false);
  const [codError, setCodError] = useState<string | null>(null);

  async function handleConfirmCodSettlement() {
    if (!confirmCheckbox) return;
    if (order.order_status !== 'delivered') {
      setCodError('Order must be marked as delivered before COD payment can be confirmed.');
      return;
    }

    setIsSubmittingCod(true);
    setCodError(null);
    try {
      const res = await confirmCodPaymentAction({
        orderId: order.id,
        courierName: courierName.trim() || undefined,
        settlementReference: settlementRef.trim() || undefined,
        receiptDate: receiptDate.trim() || undefined,
        notes: settlementNotes.trim() || undefined,
        confirmedByUser: true,
      });

      if (res.success) {
        setOrder((prev: any) => ({
          ...prev,
          payment_status: PAYMENT_STATUSES.VERIFIED,
        }));
        setShowCodModal(false);
      } else {
        setCodError(res.error || 'Failed to confirm COD settlement.');
      }
    } catch (err: unknown) {
      setCodError('An unexpected error occurred.');
    } finally {
      setIsSubmittingCod(false);
    }
  }

  // Save internal admin notes
  async function handleSaveAdminNotes() {
    setIsSavingNotes(true);
    try {
      const res = await updateAdminNotesAction({
        orderId: order.id,
        adminNotes: adminNotes.trim(),
      });
      if (res.success) {
        setNotesSaved(true);
        setTimeout(() => setNotesSaved(false), 2500);
      } else {
        alert(res.error || 'Failed to save admin notes');
      }
    } finally {
      setIsSavingNotes(false);
    }
  }

  // Save tracking number
  async function handleSaveTracking() {
    setIsSavingTracking(true);
    try {
      const res = await updateTrackingNumberAction({
        orderId: order.id,
        trackingNumber: trackingNumber.trim(),
      });
      if (res.success) {
        setTrackingSaved(true);
        setTimeout(() => setTrackingSaved(false), 2500);
      } else {
        alert(res.error || 'Failed to update tracking number');
      }
    } finally {
      setIsSavingTracking(false);
    }
  }

  // Pre-filled WhatsApp Customer Link
  const rawCustomerPhone = order.phone1 ? order.phone1.replace(/[^0-9]/g, '') : '';
  const whatsAppPhone = rawCustomerPhone.startsWith('0')
    ? '94' + rawCustomerPhone.slice(1)
    : rawCustomerPhone.startsWith('94')
    ? rawCustomerPhone
    : '94' + rawCustomerPhone;

  const whatsAppStatusMessage = encodeURIComponent(
    `Hello ${order.customer_name}, this is Splender Jewel regarding your Order *${order.order_number}*.\n\nYour order is currently *${order.order_status.toUpperCase()}*. Total amount: *${formatCurrency(order.total_amount)}*.${order.tracking_number ? `\nCourier Tracking Number: *${order.tracking_number}*.` : ''}\n\nThank you for choosing Splender Jewel!`
  );
  const whatsAppCustomerUrl = `https://wa.me/${whatsAppPhone}?text=${whatsAppStatusMessage}`;

  const isBankTransfer = order.payment_method === 'bank_transfer';
  const isCod = order.payment_method === 'cod';
  const isPaymentPending = order.payment_status === 'pending';
  const isDelivered = order.order_status === 'delivered';

  return (
    <div className="space-y-8">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/orders"
            className="p-2 rounded bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:border-luxury-gold/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-serif font-bold text-white font-mono">
                {order.order_number}
              </h1>
              <Badge variant="outline" className="border-neutral-700 bg-neutral-900 text-luxury-gold uppercase text-[10px] tracking-wider font-bold">
                {order.order_status}
              </Badge>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              Placed on {new Date(order.created_at).toLocaleString('en-US')}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadInvoice}
            disabled={isGeneratingPdf}
            className="text-xs border-luxury-gold/60 bg-luxury-gold/10 text-luxury-gold hover:bg-luxury-gold/20 flex items-center gap-1.5"
            title="Download PDF Invoice / Receipt for WhatsApp or Instagram sharing"
          >
            {isGeneratingPdf ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            <span>
              {order.payment_status === 'verified'
                ? 'Download Receipt PDF'
                : 'Download Invoice PDF'}
            </span>
          </Button>

          {whatsAppPhone && (
            <a href={whatsAppCustomerUrl} target="_blank" rel="noopener noreferrer">
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-emerald-800/80 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-950/80 flex items-center gap-1.5"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                <span>Message Customer</span>
              </Button>
            </a>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPrintLabel(!showPrintLabel)}
            className="text-xs border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-luxury-gold hover:text-luxury-gold flex items-center gap-1.5"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Shipping Label</span>
          </Button>
        </div>
      </div>

      {/* Printable Package Shipping Label Box (Toggled) */}
      {showPrintLabel && (
        <div className="bg-white text-black p-6 rounded-lg border-2 border-dashed border-luxury-gold max-w-xl mx-auto shadow-2xl space-y-4">
          <div className="flex justify-between items-start border-b-2 border-black pb-3">
            <div>
              <h3 className="font-serif font-black text-xl tracking-wider uppercase">SPLENDER JEWEL</h3>
              <p className="text-[10px] font-sans text-neutral-600">The Jewel Gallery • Priority Jewelry Delivery</p>
            </div>
            <div className="text-right font-mono font-bold text-sm">
              {order.order_number}
            </div>
          </div>

          <div className="space-y-1 text-sm font-sans">
            <span className="text-[10px] uppercase font-bold text-neutral-500 block">Deliver To:</span>
            <p className="font-bold text-base">{order.customer_name}</p>
            <p className="leading-snug">{order.address_line}{order.city ? `, ${order.city}` : ''}</p>
            <p className="font-bold uppercase text-sm tracking-wide">{order.district}{order.postal_code ? ` - ${order.postal_code}` : ''}</p>
            <p className="font-mono text-sm pt-1">
              Contact: <strong>{order.phone1}</strong>{order.phone2 ? ` / ${order.phone2}` : ''}
            </p>
            {order.delivery_notes && (
              <p className="text-xs italic text-neutral-700 pt-1">
                Instructions: &quot;{order.delivery_notes}&quot;
              </p>
            )}
          </div>

          <div className="border-t-2 border-black pt-3 flex justify-between items-center text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold block text-neutral-500">Payment:</span>
              <span className="font-bold uppercase">
                {order.payment_method === 'cod' ? 'CASH ON DELIVERY (COLLECT)' : 'PRE-PAID (BANK TRANSFER)'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold block text-neutral-500">Amount Due:</span>
              <span className="font-mono font-black text-base">
                {order.payment_method === 'cod' ? formatCurrency(order.total_amount) : 'PAID (LKR 0)'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Bank Transfer Approval Alert Box */}
      {isBankTransfer && (
        <div
          className={`p-5 rounded-lg border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
            isPaymentPending
              ? 'bg-amber-950/40 border-amber-800/80 text-amber-200'
              : 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              <strong className="font-semibold text-sm">
                Payment Method: Bank Deposit / WhatsApp Transfer
              </strong>
            </div>
            <p className="text-xs text-neutral-300">
              {isPaymentPending
                ? 'Customer submitted order with bank transfer. Verify that the bank slip was received on WhatsApp (+94 76 468 9907) before approving.'
                : 'Payment verified and confirmed by administrator.'}
            </p>
          </div>

          {isPaymentPending ? (
            <Button
              variant="gold"
              size="sm"
              disabled={isUpdatingPayment}
              onClick={handleVerifyBankTransfer}
              className="font-semibold text-xs whitespace-nowrap"
            >
              {isUpdatingPayment ? 'Approving...' : 'Approve Bank Transfer'}
            </Button>
          ) : (
            <Badge variant="outline" className="border-emerald-600 bg-emerald-950 text-emerald-400 font-bold uppercase text-xs">
              ✓ Verified & Paid
            </Badge>
          )}
        </div>
      )}

      {/* COD Payment Settlement Alert Box */}
      {isCod && (
        <div
          className={`p-5 rounded-lg border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
            isPaymentPending
              ? isDelivered
                ? 'bg-amber-950/50 border-amber-500/80 text-amber-200'
                : 'bg-neutral-900 border-neutral-800 text-neutral-200'
              : 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-luxury-gold" />
              <strong className="font-semibold text-sm">
                Payment Method: Cash on Delivery (COD)
              </strong>
            </div>
            <p className="text-xs text-neutral-300">
              {isPaymentPending ? (
                isDelivered ? (
                  <span className="text-amber-300 font-medium">
                    ⚠️ Parcel is Delivered, but COD Payment is NOT Yet Settled. Delivered does NOT mean Paid.
                    Confirm receipt of courier funds once remitted to mark as paid.
                  </span>
                ) : (
                  'Courier will collect funds upon delivery. Splender Jewel must explicitly confirm receipt of the COD funds from the courier before marking as paid.'
                )
              ) : (
                'COD payment settlement confirmed and funds received by Splender Jewel.'
              )}
            </p>
          </div>

          {isPaymentPending ? (
            isDelivered ? (
              <Button
                variant="gold"
                size="sm"
                disabled={isUpdatingPayment}
                onClick={() => {
                  setConfirmCheckbox(false);
                  setCodError(null);
                  setShowCodModal(true);
                }}
                className="font-semibold text-xs whitespace-nowrap"
              >
                Confirm Payment Received
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled
                className="text-xs font-normal text-neutral-500 border-neutral-800 bg-neutral-950/50 cursor-not-allowed whitespace-nowrap"
                title="Order must be delivered before COD payment can be confirmed"
              >
                Awaiting Delivery
              </Button>
            )
          ) : (
            <Badge variant="outline" className="border-emerald-600 bg-emerald-950 text-emerald-400 font-bold uppercase text-xs">
              ✓ Settled & Paid
            </Badge>
          )}
        </div>
      )}

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Order Items & Financials (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Purchased Items Card */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 space-y-4">
            <h2 className="text-base font-serif font-bold text-white flex items-center gap-2 border-b border-neutral-800 pb-3">
              <Package className="h-4 w-4 text-luxury-gold" />
              <span>Order Line Items ({order.order_items?.length || 0})</span>
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-neutral-400 border-b border-neutral-800 uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5">Item</th>
                    <th className="py-2.5">SKU</th>
                    <th className="py-2.5 text-right">Selling Price</th>
                    <th className="py-2.5 text-right text-rose-400/90 font-mono">Purchase Cost (Admin)</th>
                    <th className="py-2.5 text-center">Qty</th>
                    <th className="py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/80 text-neutral-300">
                  {(order.order_items || []).map((item: any) => (
                    <tr key={item.id}>
                      <td className="py-3">
                        <div className="font-semibold text-white">{item.product_name}</div>
                        <div className="text-[11px] text-neutral-400">Variant: {item.variant_title}</div>
                      </td>
                      <td className="py-3 font-mono text-neutral-400">{item.sku}</td>
                      <td className="py-3 text-right">{formatCurrency(item.unit_price)}</td>
                      <td className="py-3 text-right font-mono text-rose-300">
                        {formatCurrency(item.purchase_cost || 0)}
                      </td>
                      <td className="py-3 text-center font-bold text-white">{item.quantity}</td>
                      <td className="py-3 text-right font-bold text-luxury-gold">
                        {formatCurrency(item.total_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Admin Confidential Financial Profit Breakdown */}
          {order.financials && (
            <div className="bg-neutral-900/90 border border-luxury-gold/30 rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <h2 className="text-base font-serif font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-luxury-gold" />
                  <span>Confidential Cost & Profit Analysis (Admin Exclusive)</span>
                </h2>
                <Badge variant="outline" className="border-luxury-gold/40 text-luxury-gold text-[10px] uppercase font-bold">
                  Margin: {order.financials.grossMarginPercent}%
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div className="bg-neutral-950 p-3 rounded border border-neutral-800">
                  <span className="text-neutral-400 block">Items Subtotal</span>
                  <span className="font-bold text-white text-sm font-mono">
                    {formatCurrency(order.financials.subtotal)}
                  </span>
                </div>

                <div className="bg-neutral-950 p-3 rounded border border-neutral-800">
                  <span className="text-rose-400 block">Total Purchase Cost</span>
                  <span className="font-bold text-rose-300 text-sm font-mono">
                    {formatCurrency(order.financials.totalPurchaseCost)}
                  </span>
                </div>

                <div className="bg-neutral-950 p-3 rounded border border-neutral-800">
                  <span className="text-emerald-400 block">Gross Profit</span>
                  <span className="font-bold text-emerald-300 text-sm font-mono">
                    {formatCurrency(order.financials.grossProfit)}
                  </span>
                </div>

                <div className="bg-neutral-950 p-3 rounded border border-neutral-800">
                  <span className="text-neutral-400 block">Delivery Charge</span>
                  <span className="font-bold text-white text-sm font-mono">
                    {formatCurrency(order.delivery_fee)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Status Transition History Audit Trail */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 space-y-4">
            <h2 className="text-base font-serif font-bold text-white flex items-center gap-2 border-b border-neutral-800 pb-3">
              <Clock className="h-4 w-4 text-luxury-gold" />
              <span>Order Transition Audit Trail</span>
            </h2>

            {(order.order_status_history || []).length === 0 ? (
              <p className="text-xs text-neutral-400">No transition history logged.</p>
            ) : (
              <div className="space-y-3">
                {order.order_status_history.map((hist: any) => (
                  <div key={hist.id} className="text-xs flex items-start gap-3 p-2.5 rounded bg-neutral-950 border border-neutral-800">
                    <CheckCircle2 className="h-4 w-4 text-luxury-gold shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white capitalize">
                          {hist.previous_status ? `${hist.previous_status} → ${hist.new_status}` : hist.new_status}
                        </span>
                        <span className="text-[10px] text-neutral-500">
                          {new Date(hist.created_at).toLocaleString('en-US')}
                        </span>
                      </div>
                      {hist.notes && <p className="text-neutral-400 mt-0.5">{hist.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Controls, Notes & Recipient Info (1 col) */}
        <div className="space-y-6">
          {/* Order Lifecycle Status Controller */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 space-y-4">
            <h2 className="text-base font-serif font-bold text-white border-b border-neutral-800 pb-3">
              Fulfillment Status
            </h2>

            <div className="space-y-3 text-xs">
              <label className="text-neutral-300 font-semibold block uppercase tracking-wider text-[11px]">
                Transition Status:
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as OrderStatus)}
                className="w-full h-10 px-3 rounded bg-neutral-950 border border-neutral-700 text-white text-xs focus:ring-1 focus:ring-luxury-gold"
              >
                <option value="pending">Pending Review</option>
                <option value="confirmed">Confirmed</option>
                <option value="processing">Processing</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>

              <Input
                type="text"
                placeholder="Optional transition notes..."
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                className="bg-neutral-950 border-neutral-700 text-white text-xs h-9"
              />

              <Button
                variant="gold"
                size="sm"
                disabled={isUpdatingStatus || selectedStatus === order.order_status}
                onClick={handleUpdateStatus}
                className="w-full font-semibold text-xs"
              >
                {isUpdatingStatus ? 'Saving Status...' : 'Apply Status Transition'}
              </Button>
            </div>
          </div>

          {/* Courier Tracking Number Box */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 space-y-4">
            <h2 className="text-base font-serif font-bold text-white border-b border-neutral-800 pb-3 flex items-center gap-2">
              <Truck className="h-4 w-4 text-luxury-gold" />
              <span>Courier Tracking</span>
            </h2>

            <div className="space-y-3 text-xs">
              <label className="text-neutral-300 font-semibold block uppercase tracking-wider text-[11px]">
                Tracking Code:
              </label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="e.g. PR-894812LK"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="bg-neutral-950 border-neutral-700 text-white text-xs h-9 font-mono"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isSavingTracking}
                  onClick={handleSaveTracking}
                  className="border-neutral-700 bg-neutral-950 text-neutral-300 text-xs px-3"
                >
                  {trackingSaved ? <Check className="h-4 w-4 text-emerald-400" /> : <Save className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Recipient Contact & Delivery Card */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 space-y-3">
            <h2 className="text-base font-serif font-bold text-white border-b border-neutral-800 pb-3">
              Recipient & Address
            </h2>

            <div className="text-xs text-neutral-300 space-y-1.5">
              <p className="font-bold text-white text-sm">{order.customer_name}</p>
              <p>{order.address_line}{order.city ? `, ${order.city}` : ''}</p>
              <p className="font-semibold text-luxury-gold uppercase">{order.district}{order.postal_code ? ` - ${order.postal_code}` : ''}</p>
              <div className="pt-2 border-t border-neutral-800/80 space-y-1 font-mono text-[11px]">
                <p>Phone 1: <strong className="text-white">{order.phone1}</strong></p>
                {order.phone2 && <p>Phone 2: {order.phone2}</p>}
                {order.email && <p>Email: {order.email}</p>}
              </div>
              {order.delivery_notes && (
                <div className="pt-2 border-t border-neutral-800/80 text-neutral-400 italic">
                  Note: &quot;{order.delivery_notes}&quot;
                </div>
              )}
            </div>
          </div>

          {/* Internal Administrative Notes */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 space-y-3">
            <h2 className="text-base font-serif font-bold text-white border-b border-neutral-800 pb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-luxury-gold" />
              <span>Internal Admin Notes</span>
            </h2>

            <p className="text-[11px] text-neutral-400">
              Private notes visible solely to store administrators. Never exposed to customers.
            </p>

            <textarea
              rows={3}
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="e.g. Customer requested call before 3pm; bank slip confirmed in chat..."
              className="w-full px-3 py-2 rounded bg-neutral-950 border border-neutral-700 text-white text-xs focus:ring-1 focus:ring-luxury-gold"
            />

            <Button
              variant="outline"
              size="sm"
              disabled={isSavingNotes}
              onClick={handleSaveAdminNotes}
              className="w-full border-neutral-700 bg-neutral-950 text-xs font-semibold text-neutral-300 hover:border-luxury-gold hover:text-luxury-gold flex items-center justify-center gap-2"
            >
              {notesSaved ? (
                <>
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span>Notes Saved!</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>{isSavingNotes ? 'Saving...' : 'Save Notes'}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* COD SETTLEMENT CONFIRMATION MODAL */}
      {showCodModal && (
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
                  Order <strong className="text-white font-mono">{order.order_number}</strong> • Customer: {order.customer_name}
                </p>
              </div>
              <button
                onClick={() => setShowCodModal(false)}
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
                  {formatCurrency(order.total_amount)}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block">Current Delivery Status:</span>
                <span className="font-semibold text-white capitalize">{order.order_status}</span>
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
                  placeholder="e.g. Courier batch reconciled with bank deposit"
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value)}
                  className="bg-neutral-950 border-neutral-700 text-white text-xs h-9"
                />
              </div>

              {/* Delivery Prerequisite Non-Overridable Notice */}
              {order.order_status !== 'delivered' && (
                <div className="bg-amber-950/60 border border-amber-700/80 rounded p-3 text-xs space-y-1 text-amber-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                    <div>
                      <strong className="block text-amber-100">Delivery Confirmation Required</strong>
                      <span className="text-[11px] leading-relaxed text-amber-300/90">
                        This order is currently marked as <strong className="uppercase text-amber-100">{order.order_status}</strong>. COD remittance cannot be confirmed until the parcel has been delivered to the customer.
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
                    disabled={order.order_status !== 'delivered'}
                    className="h-4 w-4 mt-0.5 rounded border-neutral-700 text-luxury-gold focus:ring-luxury-gold bg-black disabled:opacity-50"
                  />
                  <span className="text-[11px] text-neutral-300 leading-snug">
                    I confirm that Splender Jewel has physically received the funds ({formatCurrency(order.total_amount)}) from the courier service for this order.
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
                onClick={() => setShowCodModal(false)}
                disabled={isSubmittingCod}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="gold"
                size="sm"
                onClick={handleConfirmCodSettlement}
                disabled={
                  !confirmCheckbox ||
                  order.order_status !== 'delivered' ||
                  isSubmittingCod
                }
                className="text-xs font-semibold"
              >
                {isSubmittingCod ? 'Recording Settlement...' : 'Confirm Payment Received'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
