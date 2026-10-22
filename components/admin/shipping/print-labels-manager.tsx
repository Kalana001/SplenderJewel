'use client';

import React, { useState, useMemo } from 'react';
import {
  Printer,
  FileSpreadsheet,
  Download,
  Calendar,
  Search,
  Filter,
  CheckSquare,
  Square,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Clock,
  PackageCheck,
  CreditCard,
  Banknote,
  Info,
  MapPin,
  Edit2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ShippingOrderRecord,
  ShippingOrderFilterOptions,
} from '@/lib/shipping/types';
import {
  formatSriLankaDateTime,
  toSriLankaDateString,
  getSriLankaDateString,
} from '@/lib/shipping/utils';
import { exportPostalExcelAction } from '@/lib/shipping/admin-actions';
import { PrintPreviewModal } from './print-preview-modal';
import { PostalCityDialog } from './postal-city-dialog';

interface PrintLabelsManagerProps {
  initialOrders: ShippingOrderRecord[];
}

export function PrintLabelsManager({ initialOrders }: PrintLabelsManagerProps) {
  // Filter states
  const [todayOnly, setTodayOnly] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<'all' | 'bank_transfer' | 'cod'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selection state (Set of order IDs)
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  // Modal & export states
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [singlePreviewOrder, setSinglePreviewOrder] = useState<ShippingOrderRecord | null>(null);
  const [isExportingBT, setIsExportingBT] = useState(false);
  const [isExportingCOD, setIsExportingCOD] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // In-memory postal city overrides for export (does NOT mutate DB records)
  const [postalCityOverrides, setPostalCityOverrides] = useState<Record<string, string>>({});
  const [cityDialogOpen, setCityDialogOpen] = useState(false);
  const [dialogOrders, setDialogOrders] = useState<ShippingOrderRecord[]>([]);
  const [dialogActionTitle, setDialogActionTitle] = useState('Save & Continue Export');
  const [pendingAction, setPendingAction] = useState<((overrides: Record<string, string>) => void) | null>(null);

  const todaySLT = useMemo(() => getSriLankaDateString(), []);

  // Helper to determine effective city for an order
  const getEffectiveCity = React.useCallback(
    (order: ShippingOrderRecord, overrides: Record<string, string> = postalCityOverrides): string | null => {
      return (
        (order.city && order.city.trim()) ||
        (overrides[order.id] && overrides[order.id].trim()) ||
        null
      );
    },
    [postalCityOverrides]
  );

  // Filter orders
  const filteredOrders = useMemo(() => {
    return initialOrders.filter((order) => {
      const orderSLTDate = toSriLankaDateString(order.confirmation_date);

      // Today's filter in Sri Lanka local time
      if (todayOnly && orderSLTDate !== todaySLT) {
        return false;
      }

      // Date range filter
      if (startDate && orderSLTDate < startDate) {
        return false;
      }
      if (endDate && orderSLTDate > endDate) {
        return false;
      }

      // Payment method filter
      if (paymentMethodFilter !== 'all' && order.payment_method !== paymentMethodFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesNum = order.order_number.toLowerCase().includes(q);
        const matchesName = order.customer_name.toLowerCase().includes(q);
        const matchesPhone1 = order.phone1.toLowerCase().includes(q);
        const matchesPhone2 = (order.phone2 || '').toLowerCase().includes(q);
        const matchesCity = (getEffectiveCity(order) || '').toLowerCase().includes(q);
        const matchesDistrict = order.district.toLowerCase().includes(q);

        if (!matchesNum && !matchesName && !matchesPhone1 && !matchesPhone2 && !matchesCity && !matchesDistrict) {
          return false;
        }
      }

      return true;
    });
  }, [initialOrders, todayOnly, startDate, endDate, paymentMethodFilter, searchQuery, todaySLT, getEffectiveCity]);

  // Selected orders list
  const selectedOrders = useMemo(() => {
    return initialOrders.filter((o) => selectedOrderIds.has(o.id));
  }, [initialOrders, selectedOrderIds]);

  // Metrics for selection
  const selectedBtCount = useMemo(() => {
    return selectedOrders.filter((o) => o.payment_method === 'bank_transfer').length;
  }, [selectedOrders]);

  const selectedCodCount = useMemo(() => {
    return selectedOrders.filter((o) => o.payment_method === 'cod').length;
  }, [selectedOrders]);

  const selectedIncompleteCount = useMemo(() => {
    return selectedOrders.filter((o) => !getEffectiveCity(o)).length;
  }, [selectedOrders, getEffectiveCity]);

  // Selection handlers
  function handleToggleOrder(id: string) {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSelectAllVisible() {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      filteredOrders.forEach((o) => next.add(o.id));
      return next;
    });
  }

  function handleClearSelection() {
    setSelectedOrderIds(new Set());
    setExportError(null);
  }

  function handleResetFilters() {
    setTodayOnly(false);
    setStartDate('');
    setEndDate('');
    setPaymentMethodFilter('all');
    setSearchQuery('');
  }

  // Open Postal City Dialog
  function openCityDialog(
    orders: ShippingOrderRecord[],
    onConfirmCallback?: (overrides: Record<string, string>) => void,
    actionTitle = 'Save & Continue Export'
  ) {
    setDialogOrders(orders);
    setDialogActionTitle(actionTitle);
    setPendingAction(() => onConfirmCallback || null);
    setCityDialogOpen(true);
  }

  function handleCityDialogConfirm(newOverrides: Record<string, string>) {
    const updated = { ...postalCityOverrides, ...newOverrides };
    setPostalCityOverrides(updated);
    setCityDialogOpen(false);
    if (pendingAction) {
      const act = pendingAction;
      setPendingAction(null);
      act(updated);
    }
  }

  // Helper to trigger browser download from base64 string
  function triggerBase64Download(base64: string, filename: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Export handlers with automatic postal city prompt if any selected order lacks a city
  async function executeExportBT(currentOverrides: Record<string, string>) {
    const btOrders = selectedOrders.filter((o) => o.payment_method === 'bank_transfer');
    if (btOrders.length === 0) return;

    const missing = btOrders.filter((o) => !getEffectiveCity(o, currentOverrides));
    if (missing.length > 0) {
      openCityDialog(missing, (updated) => executeExportBT(updated), 'Save & Export Bank Transfer');
      return;
    }

    setIsExportingBT(true);
    setExportError(null);
    try {
      const res = await exportPostalExcelAction({
        orderIds: btOrders.map((o) => o.id),
        paymentMethod: 'bank_transfer',
        postalCityOverrides: currentOverrides,
      });

      if (res.success && res.base64 && res.filename) {
        triggerBase64Download(res.base64, res.filename);
      } else {
        setExportError(res.error || 'Failed to export Bank Transfer excel.');
      }
    } catch (err: any) {
      setExportError(err.message || 'An error occurred during Bank Transfer export.');
    } finally {
      setIsExportingBT(false);
    }
  }

  function handleExportBankTransfer() {
    executeExportBT(postalCityOverrides);
  }

  async function executeExportCOD(currentOverrides: Record<string, string>) {
    const codOrders = selectedOrders.filter((o) => o.payment_method === 'cod');
    if (codOrders.length === 0) return;

    const missing = codOrders.filter((o) => !getEffectiveCity(o, currentOverrides));
    if (missing.length > 0) {
      openCityDialog(missing, (updated) => executeExportCOD(updated), 'Save & Export COD');
      return;
    }

    setIsExportingCOD(true);
    setExportError(null);
    try {
      const res = await exportPostalExcelAction({
        orderIds: codOrders.map((o) => o.id),
        paymentMethod: 'cod',
        postalCityOverrides: currentOverrides,
      });

      if (res.success && res.base64 && res.filename) {
        triggerBase64Download(res.base64, res.filename);
      } else {
        setExportError(res.error || 'Failed to export COD excel.');
      }
    } catch (err: any) {
      setExportError(err.message || 'An error occurred during COD export.');
    } finally {
      setIsExportingCOD(false);
    }
  }

  function handleExportCOD() {
    executeExportCOD(postalCityOverrides);
  }

  async function executeExportBoth(currentOverrides: Record<string, string>) {
    const missing = selectedOrders.filter((o) => !getEffectiveCity(o, currentOverrides));
    if (missing.length > 0) {
      openCityDialog(missing, (updated) => executeExportBoth(updated), 'Save & Download Both');
      return;
    }

    if (selectedBtCount > 0) {
      await executeExportBT(currentOverrides);
    }
    if (selectedCodCount > 0) {
      setTimeout(() => {
        executeExportCOD(currentOverrides);
      }, 600);
    }
  }

  function handleExportBoth() {
    executeExportBoth(postalCityOverrides);
  }

  const allVisibleSelected =
    filteredOrders.length > 0 && filteredOrders.every((o) => selectedOrderIds.has(o.id));

  return (
    <div className="space-y-6">
      {/* ── Print Stylesheet Injection (Guarantees zero app chrome during print) ── */}
      <style jsx global>{`
        @media print {
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
          }
          /* Hide application navigation, sidebar, and admin controls */
          header,
          aside,
          nav,
          .print-hidden,
          button,
          input,
          [role="navigation"] {
            display: none !important;
          }
          .lg\\:pl-64 {
            padding-left: 0 !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
          }
          #shipping-labels-print-area {
            display: block !important;
            visibility: visible !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-page-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            margin-bottom: 12px !important;
          }
        }
      `}</style>

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5 print:hidden">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide flex items-center gap-2.5">
            <span>Shipping Label Printing & Postal Export</span>
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Generate side-by-side rectangular address labels and download Sri Lanka Post bulk upload sheets.
          </p>
        </div>

        {/* Global Overview Pill */}
        <div className="flex items-center gap-2 text-xs text-neutral-400 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-lg font-mono">
          <Clock className="h-3.5 w-3.5 text-luxury-gold" />
          <span>Sri Lanka Time: {todaySLT}</span>
        </div>
      </div>

      {/* ── Metrics Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 print:hidden">
        <div className="bg-luxury-black border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
          <span className="text-neutral-400 text-xs uppercase tracking-wider font-mono">
            Eligible Orders
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-white font-mono">
              {initialOrders.length}
            </span>
            <PackageCheck className="h-5 w-5 text-luxury-gold/70" />
          </div>
        </div>

        <div className="bg-luxury-black border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
          <span className="text-neutral-400 text-xs uppercase tracking-wider font-mono">
            Bank Transfer
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-emerald-400 font-mono">
              {initialOrders.filter((o) => o.payment_method === 'bank_transfer').length}
            </span>
            <CreditCard className="h-5 w-5 text-emerald-500/70" />
          </div>
        </div>

        <div className="bg-luxury-black border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
          <span className="text-neutral-400 text-xs uppercase tracking-wider font-mono">
            Cash on Delivery
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-amber-400 font-mono">
              {initialOrders.filter((o) => o.payment_method === 'cod').length}
            </span>
            <Banknote className="h-5 w-5 text-amber-500/70" />
          </div>
        </div>

        <div className="bg-luxury-black border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
          <span className="text-neutral-400 text-xs uppercase tracking-wider font-mono">
            Incomplete Data
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-rose-400 font-mono">
              {initialOrders.filter((o) => !o.validation.isValid).length}
            </span>
            <AlertTriangle className="h-5 w-5 text-rose-500/70" />
          </div>
        </div>
      </div>

      {/* ── Filters Bar ── */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 space-y-4 print:hidden">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTodayOnly(!todayOnly);
                if (!todayOnly) {
                  setStartDate('');
                  setEndDate('');
                }
              }}
              className={`text-xs border-neutral-700 font-medium ${
                todayOnly
                  ? 'bg-luxury-gold text-black border-luxury-gold hover:bg-luxury-gold/90'
                  : 'bg-neutral-900 text-neutral-300 hover:text-white hover:border-neutral-600'
              }`}
            >
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              Today&apos;s Orders (Sri Lanka)
            </Button>

            {/* Payment Method Selector */}
            <div className="flex items-center bg-neutral-950 border border-neutral-700 rounded-md p-0.5">
              <button
                type="button"
                onClick={() => setPaymentMethodFilter('all')}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                  paymentMethodFilter === 'all'
                    ? 'bg-neutral-800 text-luxury-gold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethodFilter('bank_transfer')}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                  paymentMethodFilter === 'bank_transfer'
                    ? 'bg-neutral-800 text-emerald-400'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Bank Transfer
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethodFilter('cod')}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                  paymentMethodFilter === 'cod'
                    ? 'bg-neutral-800 text-amber-400'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                COD
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
            <Input
              type="text"
              placeholder="Search order #, customer, phone, city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-neutral-950 border-neutral-700 text-white placeholder:text-neutral-500 text-xs h-9"
            />
          </div>
        </div>

        {/* Date Range & Reset Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-800/60 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-neutral-400">Custom Date Range:</span>
            <input
              type="date"
              value={startDate}
              disabled={todayOnly}
              onChange={(e) => {
                setStartDate(e.target.value);
                setTodayOnly(false);
              }}
              className="bg-neutral-950 border border-neutral-700 text-neutral-200 rounded px-2.5 py-1 text-xs font-mono disabled:opacity-50"
            />
            <span className="text-neutral-500">to</span>
            <input
              type="date"
              value={endDate}
              disabled={todayOnly}
              onChange={(e) => {
                setEndDate(e.target.value);
                setTodayOnly(false);
              }}
              className="bg-neutral-950 border border-neutral-700 text-neutral-200 rounded px-2.5 py-1 text-xs font-mono disabled:opacity-50"
            />
          </div>

          {(todayOnly || startDate || endDate || paymentMethodFilter !== 'all' || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="text-neutral-400 hover:text-white text-xs h-7 px-2"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset Filters
            </Button>
          )}
        </div>
      </div>

      {/* ── Selection Action Bar (Sticky / Highlighted) ── */}
      <div className="bg-luxury-black border border-luxury-gold/30 rounded-xl p-4 shadow-lg flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between print:hidden">
        {/* Selection Status */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={allVisibleSelected ? handleClearSelection : handleSelectAllVisible}
            className="text-xs border-neutral-700 text-neutral-200 bg-neutral-900 hover:border-luxury-gold hover:text-luxury-gold"
          >
            {allVisibleSelected ? (
              <CheckSquare className="h-3.5 w-3.5 mr-1.5 text-luxury-gold" />
            ) : (
              <Square className="h-3.5 w-3.5 mr-1.5" />
            )}
            {allVisibleSelected ? 'Deselect All' : `Select All Visible (${filteredOrders.length})`}
          </Button>

          {selectedOrders.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSelection}
              className="text-neutral-400 hover:text-white text-xs h-8"
            >
              Clear Selection
            </Button>
          )}

          <div className="text-xs text-neutral-300 font-mono">
            <strong className="text-luxury-gold text-sm font-bold">
              {selectedOrders.length}
            </strong>{' '}
            selected{' '}
            <span className="text-neutral-500">
              ({selectedBtCount} BT, {selectedCodCount} COD)
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Print Labels Button */}
          <Button
            variant="gold"
            size="sm"
            disabled={selectedOrders.length === 0}
            onClick={() => {
              setSinglePreviewOrder(null);
              setPreviewModalOpen(true);
            }}
            className="bg-luxury-gold text-black hover:bg-luxury-gold/90 text-xs font-semibold px-3 h-8 shadow"
          >
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Print Labels ({selectedOrders.length})
          </Button>

          {/* Download Bank Transfer Excel */}
          <Button
            variant="outline"
            size="sm"
            disabled={selectedBtCount === 0 || isExportingBT}
            onClick={handleExportBankTransfer}
            className="border-emerald-700/60 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60 hover:text-emerald-100 text-xs h-8"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
            {isExportingBT ? 'Exporting...' : `Bank Transfer Excel (${selectedBtCount})`}
          </Button>

          {/* Download COD Excel */}
          <Button
            variant="outline"
            size="sm"
            disabled={selectedCodCount === 0 || isExportingCOD}
            onClick={handleExportCOD}
            className="border-amber-700/60 bg-amber-950/40 text-amber-300 hover:bg-amber-900/60 hover:text-amber-100 text-xs h-8"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-amber-400" />
            {isExportingCOD ? 'Exporting...' : `COD Excel (${selectedCodCount})`}
          </Button>

          {/* Download Both */}
          {selectedBtCount > 0 && selectedCodCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={isExportingBT || isExportingCOD}
              onClick={handleExportBoth}
              className="border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-luxury-gold text-xs h-8"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download Both
            </Button>
          )}
        </div>
      </div>

      {/* ── Error Banner (Validation or Export Failure) ── */}
      {exportError && (
        <div className="bg-rose-950/50 border border-rose-800 text-rose-200 p-4 rounded-xl text-xs flex items-start gap-3 print:hidden">
          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-rose-100">Export Blocked — Data Incomplete</div>
            <p>{exportError}</p>
          </div>
        </div>
      )}

      {/* ── Warning on Incomplete Selected Records ── */}
      {selectedIncompleteCount > 0 && !exportError && (
        <div className="bg-amber-950/30 border border-amber-800/40 text-amber-200 px-4 py-3 rounded-xl text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              <strong>Note:</strong> {selectedIncompleteCount} selected order{selectedIncompleteCount === 1 ? ' is' : 's are'} missing city information. You can supply postal cities for this export batch without modifying customer orders.
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              openCityDialog(
                selectedOrders.filter((o) => !getEffectiveCity(o)),
                undefined,
                'Save Postal Cities'
              )
            }
            className="text-xs h-7 shrink-0 border-amber-700/60 bg-amber-950/40 text-amber-300 hover:bg-amber-900/60 hover:text-amber-100"
          >
            <MapPin className="h-3 w-3 mr-1" />
            Set Postal Cities ({selectedIncompleteCount})
          </Button>
        </div>
      )}

      {/* ── Orders Table ── */}
      <div className="bg-luxury-black border border-neutral-800 rounded-xl overflow-hidden shadow-xl print:hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/70 text-neutral-400 font-mono uppercase text-[10px]">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={allVisibleSelected ? handleClearSelection : handleSelectAllVisible}
                    className="rounded border-neutral-700 bg-neutral-950 text-luxury-gold focus:ring-luxury-gold cursor-pointer"
                    aria-label="Select all visible orders"
                  />
                </th>
                <th className="py-3 px-4 font-semibold">Order Number</th>
                <th className="py-3 px-4 font-semibold">Customer Details</th>
                <th className="py-3 px-4 font-semibold">Contact Numbers</th>
                <th className="py-3 px-4 font-semibold">Destination City / District</th>
                <th className="py-3 px-4 font-semibold">Payment Method</th>
                <th className="py-3 px-4 font-semibold">Confirmed (SLT)</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-neutral-500 space-y-2">
                    <Info className="h-6 w-6 mx-auto text-neutral-600" />
                    <p className="font-medium text-sm text-neutral-400">No eligible shipping orders found.</p>
                    <p className="text-xs">
                      Confirmed and processing customer orders eligible for parcel dispatch will appear here.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const isSelected = selectedOrderIds.has(order.id);
                  const isMissingCity = order.validation.hasMissingCity;

                  return (
                    <tr
                      key={order.id}
                      onClick={() => handleToggleOrder(order.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-luxury-gold/5 hover:bg-luxury-gold/10'
                          : 'hover:bg-neutral-900/40'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleOrder(order.id)}
                          className="rounded border-neutral-700 bg-neutral-950 text-luxury-gold focus:ring-luxury-gold cursor-pointer"
                          aria-label={`Select order ${order.order_number}`}
                        />
                      </td>

                      {/* Order Number */}
                      <td className="py-3 px-4 font-mono font-bold text-white whitespace-nowrap">
                        {order.order_number}
                      </td>

                      {/* Customer Name & Address */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-semibold text-neutral-100">{order.customer_name}</div>
                        <div className="text-[11px] text-neutral-400 truncate" title={order.address_line}>
                          {order.address_line}
                        </div>
                      </td>

                      {/* Phone Numbers */}
                      <td className="py-3 px-4 font-mono text-neutral-200 whitespace-nowrap">
                        <div>{order.phone1}</div>
                        {order.phone2 && (
                          <div className="text-[10px] text-neutral-400">Alt: {order.phone2}</div>
                        )}
                      </td>

                      {/* Delivery City / District */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {order.city ? (
                            <span className="font-medium text-neutral-200">{order.city}</span>
                          ) : postalCityOverrides[order.id] ? (
                            <span className="inline-flex items-center gap-1 text-luxury-gold bg-luxury-gold/10 border border-luxury-gold/30 px-1.5 py-0.5 rounded text-[10px] font-mono">
                              <MapPin className="h-2.5 w-2.5 shrink-0" />
                              <span>{postalCityOverrides[order.id]}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openCityDialog([order], undefined, 'Update Postal City');
                                }}
                                className="text-neutral-400 hover:text-white ml-0.5"
                                title="Edit postal city override"
                              >
                                <Edit2 className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded text-[10px] font-mono">
                              <span>Missing City</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openCityDialog([order], undefined, 'Set Postal City');
                                }}
                                className="text-luxury-gold hover:underline font-sans ml-0.5"
                                title="Supply postal hub city for export"
                              >
                                Set
                              </button>
                            </span>
                          )}
                          <span className="text-neutral-500">/</span>
                          <span className="text-neutral-400">{order.district}</span>
                        </div>
                      </td>

                      {/* Payment Method */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {order.payment_method === 'cod' ? (
                          <Badge variant="outline" className="border-amber-600/40 bg-amber-950/30 text-amber-400 text-[10px] font-mono">
                            COD
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-600/40 bg-emerald-950/30 text-emerald-400 text-[10px] font-mono">
                            Bank Transfer
                          </Badge>
                        )}
                      </td>

                      {/* Confirmation Date in SLT */}
                      <td className="py-3 px-4 font-mono text-neutral-400 whitespace-nowrap text-[11px]">
                        {formatSriLankaDateTime(order.confirmation_date)}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-neutral-800 text-neutral-300 border border-neutral-700">
                          {order.order_status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSinglePreviewOrder(order);
                            setPreviewModalOpen(true);
                          }}
                          className="h-7 px-2 text-neutral-400 hover:text-luxury-gold hover:bg-neutral-800"
                          title="Preview shipping label pair"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer Summary */}
        <div className="py-3 px-4 border-t border-neutral-800 bg-neutral-950/60 text-xs text-neutral-400 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Showing {filteredOrders.length} of {initialOrders.length} eligible shipping orders
          </span>
          <span className="font-mono text-[11px]">
            Selected: {selectedOrders.length} parcel{selectedOrders.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* ── Print Preview Modal ── */}
      <PrintPreviewModal
        isOpen={previewModalOpen}
        onClose={() => {
          setPreviewModalOpen(false);
          setSinglePreviewOrder(null);
        }}
        selectedOrders={(singlePreviewOrder ? [singlePreviewOrder] : selectedOrders).map((o) => {
          const overrideCity = postalCityOverrides[o.id];
          if (overrideCity && !o.city) {
            return {
              ...o,
              city: overrideCity,
            };
          }
          return o;
        })}
      />

      {/* ── Postal City Dialog (Sri Lanka Post hub city resolution) ── */}
      <PostalCityDialog
        isOpen={cityDialogOpen}
        onClose={() => {
          setCityDialogOpen(false);
          setPendingAction(null);
        }}
        orders={dialogOrders}
        initialOverrides={postalCityOverrides}
        onConfirm={handleCityDialogConfirm}
        actionTitle={dialogActionTitle}
      />
    </div>
  );
}
