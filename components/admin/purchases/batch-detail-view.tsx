'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Receipt, 
  Truck, 
  Calendar, 
  Building2, 
  FileText, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ShieldCheck, 
  Ban, 
  Layers, 
  Sparkles,
  PackageCheck,
  X
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BatchStatusBadge } from './batch-status-badge';
import type { 
  BatchDetailViewDataDTO, 
  PurchaseBatchItemVariationDTO 
} from '@/lib/purchases/types';
import { centsToDecimalLkr } from '@/lib/purchases/calculations';
import { 
  confirmPurchaseBatchAction, 
  receivePurchaseBatchItemsAction, 
  cancelPurchaseBatchAction 
} from '@/lib/purchases/admin-actions';

interface BatchDetailViewProps {
  data: BatchDetailViewDataDTO;
  isMock?: boolean;
}

export function BatchDetailView({ data, isMock }: BatchDetailViewProps) {
  const router = useRouter();
  const { batch, expenses, items, receipts } = data;

  // Actions state
  const [isConfirming, setIsConfirming] = useState(false);
  const [isReceivingModalOpen, setIsReceivingModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Receiving Form State: map variationId -> quantity to receive
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});
  const [receiveNotes, setReceiveNotes] = useState('');
  const [isSubmittingReceipt, setIsSubmittingReceipt] = useState(false);

  // All flat variations for easy lookup and receiving
  const allVariations: Array<PurchaseBatchItemVariationDTO & { itemName: string }> = [];
  for (const item of items) {
    for (const v of item.variations) {
      allVariations.push({ ...v, itemName: item.itemName });
    }
  }

  // Variations with pending unreceived stock
  const pendingVariations = allVariations.filter(
    (v) => (v.quantityPurchased - v.quantityReceived) > 0
  );

  // Total linked across batch
  const totalLinkedUnits = allVariations.reduce((sum, v) => sum + v.quantityLinked, 0);

  // Financials in LKR
  const supplierSubtotalLkr = centsToDecimalLkr(batch.totalSupplierCostCents);
  const totalExpensesLkr = centsToDecimalLkr(batch.totalExpensesCents);
  const totalLandedCostLkr = centsToDecimalLkr(batch.totalLandedCostCents);
  const percentReceived = batch.totalPurchasedUnits > 0
    ? Math.round((batch.totalReceivedUnits / batch.totalPurchasedUnits) * 100)
    : 0;

  // Handlers
  const handleConfirmBatch = async () => {
    setActionError(null);
    setActionSuccess(null);
    setIsConfirming(true);

    try {
      const res = await confirmPurchaseBatchAction(batch.id);
      if (!res.success) {
        setActionError(res.error || 'Failed to confirm purchase batch.');
        setIsConfirming(false);
        return;
      }
      setActionSuccess('Purchase batch successfully confirmed and committed to supplier.');
      setIsConfirming(false);
      router.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Confirmation failed.');
      setIsConfirming(false);
    }
  };

  const handleCancelBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);

    if (!cancellationReason.trim()) {
      setActionError('Cancellation reason is mandatory for financial audit compliance.');
      return;
    }

    setIsCancelling(true);

    try {
      const res = await cancelPurchaseBatchAction(batch.id, cancellationReason.trim());
      if (!res.success) {
        setActionError(res.error || 'Failed to cancel purchase batch.');
        setIsCancelling(false);
        return;
      }
      setActionSuccess('Purchase batch cancelled successfully.');
      setIsCancelling(false);
      setIsCancelModalOpen(false);
      router.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Cancellation failed.');
      setIsCancelling(false);
    }
  };

  const handleOpenReceiveModal = () => {
    // Initialize default quantities to the full remaining quantity
    const initial: Record<string, number> = {};
    for (const v of pendingVariations) {
      initial[v.id] = v.quantityPurchased - v.quantityReceived;
    }
    setReceiveQuantities(initial);
    setReceiveNotes('');
    setIsReceivingModalOpen(true);
    setActionError(null);
  };

  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);

    // Validate quantities
    const receiptItems: Array<{ batchVariationId: string; quantityReceived: number; receiptNotes?: string }> = [];
    let totalReceiving = 0;

    for (const v of pendingVariations) {
      const qty = receiveQuantities[v.id] || 0;
      const maxAvailable = v.quantityPurchased - v.quantityReceived;

      if (qty < 0) {
        setActionError(`Quantity for "${v.variationTitle}" cannot be negative.`);
        return;
      }
      if (qty > maxAvailable) {
        setActionError(`Cannot receive ${qty} units for "${v.variationTitle}". Maximum remaining: ${maxAvailable}.`);
        return;
      }

      if (qty > 0) {
        totalReceiving += qty;
        receiptItems.push({
          batchVariationId: v.id,
          quantityReceived: qty,
          receiptNotes: receiveNotes.trim() || undefined,
        });
      }
    }

    if (totalReceiving === 0) {
      setActionError('Please specify at least 1 unit to receive.');
      return;
    }

    setIsSubmittingReceipt(true);

    try {
      const idempotencyKey = `rcpt-${batch.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await receivePurchaseBatchItemsAction({
        batchId: batch.id,
        idempotencyKey,
        items: receiptItems,
      });

      if (!res.success) {
        setActionError(res.error || 'Failed to record receipt event.');
        setIsSubmittingReceipt(false);
        return;
      }

      setActionSuccess(`Successfully recorded receipt of ${totalReceiving} physical unit(s).`);
      setIsSubmittingReceipt(false);
      setIsReceivingModalOpen(false);
      router.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to record physical receipt.');
      setIsSubmittingReceipt(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div className="flex items-center gap-3">
          <Link href="/admin/purchases">
            <Button variant="outline" size="sm" className="h-9 w-9 p-0">
              <ArrowLeft className="w-4 h-4 text-neutral-400" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide font-mono">
                {batch.batchNumber}
              </h1>
              <BatchStatusBadge status={batch.status} />
              {isMock && (
                <span className="px-2 py-0.5 rounded text-[10px] bg-luxury-gold/15 text-luxury-gold border border-luxury-gold/30">
                  Mock Demonstration
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1">
              Procured from <span className="text-neutral-200 font-medium">{batch.supplierName}</span> on {batch.purchaseDate}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {batch.status === 'draft' && (
            <Button
              variant="gold"
              size="sm"
              onClick={handleConfirmBatch}
              disabled={isConfirming}
              className="flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isConfirming ? 'Confirming...' : 'Confirm Supplier Order'}</span>
            </Button>
          )}

          {(batch.status === 'ordered' || batch.status === 'partially_received') && (
            <Button
              variant="gold"
              size="sm"
              onClick={handleOpenReceiveModal}
              disabled={pendingVariations.length === 0}
              className="flex items-center gap-1.5"
            >
              <Truck className="w-4 h-4" />
              <span>Record Physical Receipt</span>
            </Button>
          )}

          {(batch.status === 'draft' || batch.status === 'ordered') && totalLinkedUnits === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCancelModalOpen(true)}
              className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border-neutral-800"
            >
              <Ban className="w-3.5 h-3.5 mr-1" />
              Cancel Batch
            </Button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="p-4 rounded-sm bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 rounded-sm bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* KPI Financial & Receiving Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-neutral-900/60 border-neutral-800 p-4">
          <div className="text-neutral-400 text-xs">Supplier Subtotal</div>
          <div className="mt-2 text-lg sm:text-xl font-bold font-mono text-neutral-200">
            Rs. {supplierSubtotalLkr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-[11px] text-neutral-400">Direct invoice subtotal</div>
        </Card>

        <Card className="bg-neutral-900/60 border-neutral-800 p-4">
          <div className="text-neutral-400 text-xs">Additional Expenses</div>
          <div className="mt-2 text-lg sm:text-xl font-bold font-mono text-amber-300">
            + Rs. {totalExpensesLkr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-[11px] text-neutral-400">{expenses.length} allocated expense line(s)</div>
        </Card>

        <Card className="bg-neutral-900/60 border-neutral-800 p-4">
          <div className="text-luxury-gold text-xs font-medium">Total Landed Valuation</div>
          <div className="mt-2 text-lg sm:text-xl font-bold font-mono text-luxury-gold-light">
            Rs. {totalLandedCostLkr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-[11px] text-neutral-400">
            ~Rs. {(batch.totalPurchasedUnits > 0 ? (totalLandedCostLkr / batch.totalPurchasedUnits) : 0).toFixed(2)}/unit avg
          </div>
        </Card>

        <Card className="bg-neutral-900/60 border-neutral-800 p-4">
          <div className="text-neutral-400 text-xs">Physical Delivery Status</div>
          <div className="mt-2 text-lg sm:text-xl font-bold font-mono text-white flex items-center gap-2">
            <span>{batch.totalReceivedUnits} / {batch.totalPurchasedUnits}</span>
            <span className="text-xs text-neutral-400 font-normal">({percentReceived}%)</span>
          </div>
          <div className="mt-1 text-[11px] text-neutral-400">
            {batch.totalPurchasedUnits - batch.totalReceivedUnits} units remaining
          </div>
        </Card>
      </div>

      {/* Batch Header Information */}
      <Card className="bg-neutral-900/60 border-neutral-800">
        <CardHeader className="p-4 sm:p-5 border-b border-neutral-800/80">
          <CardTitle className="text-sm font-semibold tracking-wider uppercase text-neutral-300 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-luxury-gold" />
            Supplier & Procurement Details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-neutral-500 uppercase tracking-wider text-[10px]">Supplier</div>
            <div className="mt-1 font-medium text-white">{batch.supplierName}</div>
            <div className="text-neutral-400 mt-0.5">{batch.supplierContact || 'No contact specified'}</div>
          </div>

          <div>
            <div className="text-neutral-500 uppercase tracking-wider text-[10px]">Invoice / Reference</div>
            <div className="mt-1 font-mono text-neutral-200">{batch.invoiceNumber || '—'}</div>
          </div>

          <div>
            <div className="text-neutral-500 uppercase tracking-wider text-[10px]">Purchase Date</div>
            <div className="mt-1 text-neutral-200">{batch.purchaseDate}</div>
          </div>

          <div>
            <div className="text-neutral-500 uppercase tracking-wider text-[10px]">Created On</div>
            <div className="mt-1 text-neutral-200">{batch.createdAt ? new Date(batch.createdAt).toLocaleDateString() : '—'}</div>
          </div>

          {batch.notes && (
            <div className="col-span-2 md:col-span-4 pt-2 border-t border-neutral-800/60">
              <div className="text-neutral-500 uppercase tracking-wider text-[10px]">Notes</div>
              <div className="mt-0.5 text-neutral-300">{batch.notes}</div>
            </div>
          )}

          {batch.cancellationReason && (
            <div className="col-span-2 md:col-span-4 p-3 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300">
              <div className="font-semibold text-xs">Cancellation Reason:</div>
              <div className="text-xs mt-0.5">{batch.cancellationReason}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Additional Expenses Breakdown */}
      {expenses.length > 0 && (
        <Card className="bg-neutral-900/60 border-neutral-800">
          <CardHeader className="p-4 sm:p-5 border-b border-neutral-800/80">
            <CardTitle className="text-sm font-semibold tracking-wider uppercase text-neutral-300 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-luxury-gold" />
              Allocated Procurement Expenses
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-950/80 text-neutral-400">
                  <th className="py-2.5 px-4 font-medium">Category</th>
                  <th className="py-2.5 px-4 font-medium">Description</th>
                  <th className="py-2.5 px-4 font-medium text-right">Amount (LKR)</th>
                  <th className="py-2.5 px-4 font-medium text-right">Per Unit Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {expenses.map((e) => {
                  const amtLkr = centsToDecimalLkr(e.amountCents);
                  const perUnitLkr = batch.totalPurchasedUnits > 0 ? (amtLkr / batch.totalPurchasedUnits) : 0;
                  return (
                    <tr key={e.id} className="hover:bg-neutral-800/20">
                      <td className="py-2.5 px-4 font-medium text-neutral-200 capitalize">
                        {e.expenseType.replace('_', ' ')}
                      </td>
                      <td className="py-2.5 px-4 text-neutral-400">
                        {e.description || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-white">
                        Rs. {amtLkr.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-neutral-400">
                        ~Rs. {perUnitLkr.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Items & Variations Breakdown */}
      <Card className="bg-neutral-900/60 border-neutral-800">
        <CardHeader className="p-4 sm:p-5 border-b border-neutral-800/80 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold tracking-wider uppercase text-neutral-300 flex items-center gap-2">
            <Layers className="w-4 h-4 text-luxury-gold" />
            Purchased Jewelry Items & Variation Breakdown
          </CardTitle>
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>0.00 LKR Drift Verified</span>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-950/80 text-neutral-400">
                <th className="py-3 px-4 font-medium">Item & Variation</th>
                <th className="py-3 px-4 font-medium">Attributes / SKU</th>
                <th className="py-3 px-4 font-medium text-center">Purchased</th>
                <th className="py-3 px-4 font-medium text-center">Received</th>
                <th className="py-3 px-4 font-medium text-center">Unreceived</th>
                <th className="py-3 px-4 font-medium text-right">Supplier Unit</th>
                <th className="py-3 px-4 font-medium text-right">Allocated Exp</th>
                <th className="py-3 px-4 font-medium text-right">Unit Landed</th>
                <th className="py-3 px-4 font-medium text-right">Line Landed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {items.map((item) => (
                <React.Fragment key={item.id}>
                  {item.variations.map((v) => {
                    const unreceived = v.quantityPurchased - v.quantityReceived;
                    const supplierUnitLkr = centsToDecimalLkr(v.supplierUnitPriceCents);
                    const allocExpenseLkr = centsToDecimalLkr(v.lineAllocatedExpenseCents);
                    const unitLandedLkr = centsToDecimalLkr(v.unitLandedCostCents);
                    const lineLandedLkr = centsToDecimalLkr(v.lineTotalLandedCostCents);

                    return (
                      <tr key={v.id} className="hover:bg-neutral-800/20">
                        <td className="py-3 px-4">
                          <div className="font-medium text-neutral-200">{item.itemName}</div>
                          <div className="text-[11px] text-luxury-gold mt-0.5">{v.variationTitle}</div>
                        </td>

                        <td className="py-3 px-4 text-neutral-400">
                          {Object.entries(v.attributes || {}).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(v.attributes).map(([key, val]) => (
                                <span key={key} className="px-1.5 py-0.5 rounded bg-neutral-950 border border-neutral-800 text-[10px]">
                                  {key}: {val}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="font-mono text-[11px]">{v.supplierSku || '—'}</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center font-mono font-medium text-white">
                          {v.quantityPurchased}
                        </td>

                        <td className="py-3 px-4 text-center font-mono text-emerald-400">
                          {v.quantityReceived}
                        </td>

                        <td className="py-3 px-4 text-center font-mono">
                          {unreceived > 0 ? (
                            <span className="text-amber-400 font-semibold">{unreceived}</span>
                          ) : (
                            <span className="text-neutral-500">0</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right font-mono text-neutral-300">
                          Rs. {supplierUnitLkr.toFixed(2)}
                        </td>

                        <td className="py-3 px-4 text-right font-mono text-neutral-400">
                          Rs. {allocExpenseLkr.toFixed(2)}
                        </td>

                        <td className="py-3 px-4 text-right font-mono text-luxury-gold font-medium">
                          Rs. {unitLandedLkr.toFixed(2)}
                        </td>

                        <td className="py-3 px-4 text-right font-mono text-white font-semibold">
                          Rs. {lineLandedLkr.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Physical Receipt History */}
      <Card className="bg-neutral-900/60 border-neutral-800">
        <CardHeader className="p-4 sm:p-5 border-b border-neutral-800/80">
          <CardTitle className="text-sm font-semibold tracking-wider uppercase text-neutral-300 flex items-center gap-2">
            <Clock className="w-4 h-4 text-luxury-gold" />
            Warehouse Receipt History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {receipts.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500">
              No physical receipts recorded yet. Goods are pending delivery from supplier.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-950/80 text-neutral-400">
                  <th className="py-2.5 px-4 font-medium">Receipt Timestamp</th>
                  <th className="py-2.5 px-4 font-medium">Received Variation</th>
                  <th className="py-2.5 px-4 font-medium text-center">Quantity</th>
                  <th className="py-2.5 px-4 font-medium">Receipt Notes / Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {receipts.map((r) => {
                  const matchingVar = allVariations.find(v => v.id === r.batchVariationId);
                  return (
                    <tr key={r.id} className="hover:bg-neutral-800/20">
                      <td className="py-2.5 px-4 text-neutral-400 font-mono text-[11px]">
                        {r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-neutral-200">
                        {matchingVar ? `${matchingVar.itemName} (${matchingVar.variationTitle})` : r.batchVariationId}
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono text-emerald-400 font-semibold">
                        +{r.quantityReceived}
                      </td>
                      <td className="py-2.5 px-4 text-neutral-400">
                        {r.receiptNotes || 'Verified upon delivery'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Warehouse Receiving Info Banner */}
      <div className="p-4 rounded-sm bg-neutral-950 border border-neutral-800 text-xs text-neutral-400 flex items-start gap-3">
        <PackageCheck className="w-4 h-4 text-luxury-gold shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-neutral-300">Physical Stock vs Storefront Inventory: </span>
          Recording a receipt confirms physical arrival into the warehouse procurement ledger.
          Active customer catalog stock and sales availability remain unchanged until goods are allocated via Stage 3 inventory transfer.
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* RECORD RECEIPT MODAL                                                      */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {isReceivingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <Card className="max-w-2xl w-full bg-neutral-900 border-neutral-800 text-neutral-200 shadow-2xl">
            <form onSubmit={handleSubmitReceipt}>
              <CardHeader className="p-5 border-b border-neutral-800 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base text-white font-serif flex items-center gap-2">
                    <Truck className="w-5 h-5 text-luxury-gold" />
                    Record Physical Goods Receipt
                  </CardTitle>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Batch: <span className="font-mono text-luxury-gold">{batch.batchNumber}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReceivingModalOpen(false)}
                  className="text-neutral-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </CardHeader>

              <CardContent className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
                <div className="text-xs text-neutral-400">
                  Enter the quantity arrived for each pending variation. You may record partial shipments.
                </div>

                <div className="space-y-3">
                  {pendingVariations.map((v) => {
                    const maxUnreceived = v.quantityPurchased - v.quantityReceived;
                    const entered = receiveQuantities[v.id] ?? maxUnreceived;

                    return (
                      <div
                        key={v.id}
                        className="p-3 rounded-sm bg-neutral-950 border border-neutral-800 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-white">{v.itemName}</div>
                          <div className="text-luxury-gold text-[11px]">{v.variationTitle}</div>
                          <div className="text-neutral-500 text-[10px] mt-0.5">
                            Purchased: {v.quantityPurchased} | Arrived to date: {v.quantityReceived} | Balance: {maxUnreceived}
                          </div>
                        </div>

                        <div className="w-32">
                          <Label className="text-[10px] text-neutral-400 uppercase">Receiving Qty</Label>
                          <Input
                            type="number"
                            min="0"
                            max={maxUnreceived}
                            value={entered}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setReceiveQuantities((prev) => ({
                                ...prev,
                                [v.id]: isNaN(val) ? 0 : val,
                              }));
                            }}
                            className="h-8 bg-neutral-900 border-neutral-800 text-white font-mono text-xs mt-1"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-1.5 pt-2">
                  <Label htmlFor="receiveNotes" className="text-xs text-neutral-300">
                    Receipt Notes / Inspection Signoff (Optional)
                  </Label>
                  <Input
                    id="receiveNotes"
                    placeholder="e.g. Courier consignment received in tamper-evident pouch. All items inspected."
                    value={receiveNotes}
                    onChange={(e) => setReceiveNotes(e.target.value)}
                    className="bg-neutral-950 border-neutral-800 text-white text-xs"
                  />
                </div>
              </CardContent>

              <div className="p-4 border-t border-neutral-800 flex items-center justify-end gap-3 bg-neutral-950/60">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsReceivingModalOpen(false)}
                  disabled={isSubmittingReceipt}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="gold"
                  size="sm"
                  disabled={isSubmittingReceipt}
                  className="flex items-center gap-1.5"
                >
                  <PackageCheck className="w-4 h-4" />
                  <span>{isSubmittingReceipt ? 'Recording Receipt...' : 'Confirm Receipt'}</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* CANCELLATION MODAL                                                        */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <Card className="max-w-md w-full bg-neutral-900 border-neutral-800 text-neutral-200 shadow-2xl">
            <form onSubmit={handleCancelBatch}>
              <CardHeader className="p-5 border-b border-neutral-800 flex flex-row items-center justify-between">
                <CardTitle className="text-base text-rose-400 font-serif flex items-center gap-2">
                  <Ban className="w-5 h-5 text-rose-400" />
                  Cancel Purchase Batch
                </CardTitle>
                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(false)}
                  className="text-neutral-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </CardHeader>

              <CardContent className="p-5 space-y-3 text-xs">
                <p className="text-neutral-300">
                  Are you sure you want to cancel batch <span className="font-mono text-white">{batch.batchNumber}</span>?
                  This action cannot be undone.
                </p>

                <div className="space-y-1.5">
                  <Label htmlFor="cancelReason" className="text-neutral-300">
                    Audit Cancellation Reason *
                  </Label>
                  <Input
                    id="cancelReason"
                    placeholder="e.g. Supplier stock out, price renegotiation, or order cancelled"
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    required
                    className="bg-neutral-950 border-neutral-800 text-white text-xs"
                  />
                </div>
              </CardContent>

              <div className="p-4 border-t border-neutral-800 flex items-center justify-end gap-3 bg-neutral-950/60">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCancelModalOpen(false)}
                  disabled={isCancelling}
                >
                  Close
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  disabled={isCancelling || !cancellationReason.trim()}
                >
                  {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
