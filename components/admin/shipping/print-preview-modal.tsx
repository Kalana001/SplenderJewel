'use client';

import React, { useState } from 'react';
import { X, Printer, Settings2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ShippingOrderRecord,
  ShippingLabelDimensions,
  DEFAULT_LABEL_DIMENSIONS,
} from '@/lib/shipping/types';
import { ShippingLabelPair } from './shipping-label-pair';

interface PrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedOrders: ShippingOrderRecord[];
}

export function PrintPreviewModal({
  isOpen,
  onClose,
  selectedOrders,
}: PrintPreviewModalProps) {
  const [dimensions, setDimensions] = useState<ShippingLabelDimensions>(DEFAULT_LABEL_DIMENSIONS);
  const [showConfig, setShowConfig] = useState(false);

  if (!isOpen) return null;

  function handleTriggerPrint() {
    window.print();
  }

  const incompleteCount = selectedOrders.filter((o) => !o.validation.isValid).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 print:p-0 print:bg-white print:static print:inset-auto">
      {/* ── Modal Dialog Container (Hidden during print except label contents) ── */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden print:border-none print:shadow-none print:max-w-none print:max-h-none print:w-full print:bg-white">
        {/* Header (Screen only) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/70 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-serif font-bold text-white tracking-wide">
                Shipping Labels Print Preview
              </h2>
              <p className="text-xs text-neutral-400">
                {selectedOrders.length} order{selectedOrders.length === 1 ? '' : 's'} selected ({selectedOrders.length * 2} separate labels)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfig(!showConfig)}
              className="text-xs border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-luxury-gold hover:text-luxury-gold"
            >
              <Settings2 className="h-3.5 w-3.5 mr-1" />
              Dimensions
            </Button>
            <Button
              variant="gold"
              size="sm"
              onClick={handleTriggerPrint}
              className="bg-luxury-gold text-black hover:bg-luxury-gold/90 font-medium text-xs px-4"
            >
              <Printer className="h-3.5 w-3.5 mr-1.5" />
              Print / Save PDF
            </Button>
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Warning Banner if incomplete shipping info exists (Screen only) */}
        {incompleteCount > 0 && (
          <div className="bg-amber-950/40 border-b border-amber-800/40 px-6 py-2.5 flex items-center gap-2.5 text-xs text-amber-200 print:hidden">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              <strong>Note:</strong> {incompleteCount} selected order{incompleteCount === 1 ? ' has' : 's have'} missing city data. On the physical label, district will be printed as available.
            </span>
          </div>
        )}

        {/* Dimension Configuration Drawer (Screen only) */}
        {showConfig && (
          <div className="bg-neutral-950 border-b border-neutral-800 p-4 text-xs space-y-3 print:hidden">
            <div className="font-semibold text-neutral-200">Adjust Label Dimensions (mm)</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-neutral-400 block mb-1">Width (mm)</label>
                <input
                  type="number"
                  value={dimensions.widthMm}
                  onChange={(e) =>
                    setDimensions({ ...dimensions, widthMm: Number(e.target.value) || 85 })
                  }
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-white text-xs font-mono"
                  min="50"
                  max="150"
                />
              </div>
              <div>
                <label className="text-neutral-400 block mb-1">Min Height (mm)</label>
                <input
                  type="number"
                  value={dimensions.minHeightMm}
                  onChange={(e) =>
                    setDimensions({ ...dimensions, minHeightMm: Number(e.target.value) || 45 })
                  }
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-white text-xs font-mono"
                  min="30"
                  max="100"
                />
              </div>
              <div>
                <label className="text-neutral-400 block mb-1">Padding (mm)</label>
                <input
                  type="number"
                  value={dimensions.paddingMm}
                  onChange={(e) =>
                    setDimensions({ ...dimensions, paddingMm: Number(e.target.value) || 4 })
                  }
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-white text-xs font-mono"
                  min="2"
                  max="15"
                />
              </div>
              <div>
                <label className="text-neutral-400 block mb-1">Border (px)</label>
                <input
                  type="number"
                  value={dimensions.borderWidthPx}
                  onChange={(e) =>
                    setDimensions({ ...dimensions, borderWidthPx: Number(e.target.value) || 1.5 })
                  }
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-white text-xs font-mono"
                  min="1"
                  max="4"
                  step="0.5"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDimensions(DEFAULT_LABEL_DIMENSIONS)}
                className="text-[11px] h-7 border-neutral-700 text-neutral-300"
              >
                Reset to Standard (85x45mm)
              </Button>
            </div>
          </div>
        )}

        {/* Scrollable Preview Area & Print Target */}
        <div
          id="shipping-labels-print-area"
          className="flex-1 overflow-y-auto p-6 bg-neutral-800/40 print:p-0 print:m-0 print:bg-white print:overflow-visible space-y-6 print:space-y-4"
        >
          {selectedOrders.map((order, idx) => (
            <div
              key={order.id}
              className="bg-white p-3 rounded-lg shadow-sm border border-neutral-700/50 print:p-0 print:rounded-none print:shadow-none print:border-none print-page-break"
            >
              <div className="text-[10px] font-mono text-neutral-500 mb-1 px-1 flex justify-between print:hidden">
                <span>Parcel #{idx + 1} — {order.order_number} ({order.payment_method === 'cod' ? 'COD' : 'Bank Transfer'})</span>
                <span>{order.customer_name}</span>
              </div>
              <ShippingLabelPair
                order={order}
                dimensions={dimensions}
              />
            </div>
          ))}
        </div>

        {/* Footer (Screen only) */}
        <div className="px-6 py-3 border-t border-neutral-800 bg-neutral-950/70 flex items-center justify-between text-xs text-neutral-400 print:hidden">
          <span>
            Printing tip: In your browser print dialog, set Margins to &quot;None&quot; or &quot;Minimum&quot; for optimal parcel label placement.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="border-neutral-700 text-neutral-300 hover:text-white"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
