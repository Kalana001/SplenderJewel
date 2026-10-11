'use client';

import React, { useState } from 'react';
import {
  Printer,
  ShieldCheck,
  Check,
  AlertCircle,
  RefreshCw,
  FileText,
  Sliders,
  Eye,
} from 'lucide-react';
import type { ShippingLabelPrintConfig } from '@/types/settings';
import { updateAdminPrintTemplateConfig } from '@/lib/settings/admin-actions';

interface PrintTemplateManagerProps {
  initialConfig: ShippingLabelPrintConfig;
}

export function PrintTemplateManager({ initialConfig }: PrintTemplateManagerProps) {
  const [config, setConfig] = useState<ShippingLabelPrintConfig>(initialConfig);
  const [storeName, setStoreName] = useState(initialConfig.storeName);
  const [storePhone, setStorePhone] = useState(initialConfig.storePhone);
  const [returnAddress, setReturnAddress] = useState(initialConfig.returnAddress);
  const [showStoreLogo, setShowStoreLogo] = useState(initialConfig.showStoreLogo);
  const [fontSize, setFontSize] = useState(initialConfig.fontSize);
  const [paperSize, setPaperSize] = useState(initialConfig.paperSize);
  const [includeOrderDate, setIncludeOrderDate] = useState(initialConfig.includeOrderDate);
  const [includeItemSummary, setIncludeItemSummary] = useState(initialConfig.includeItemSummary);
  const [footerNotice, setFooterNotice] = useState(initialConfig.footerNotice);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handlePrintTest = () => {
    window.print();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSuccessMessage(null);

    try {
      const payload: ShippingLabelPrintConfig = {
        storeName: storeName.trim(),
        storePhone: storePhone.trim(),
        returnAddress: returnAddress.trim(),
        showStoreLogo,
        fontSize,
        paperSize,
        includeOrderDate,
        includeItemSummary,
        footerNotice: footerNotice.trim(),
      };

      const res = await updateAdminPrintTemplateConfig(payload);
      if (res.success) {
        setConfig(payload);
        setSuccessMessage('Print template layout saved successfully.');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        alert(res.error || 'Failed to save print template.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Privacy Guarantee Card */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5 flex items-start gap-3.5">
        <ShieldCheck className="h-5 w-5 text-luxury-gold shrink-0 mt-0.5" />
        <div className="text-xs text-neutral-400 leading-relaxed">
          <strong className="text-white block mb-0.5">Package Privacy & Shipping Security Standard:</strong>
          Package shipping labels printed for couriers (Prompt, Koombiyo, Pronto, etc.) contain exclusively:
          Recipient Name, Delivery Address, Contact Number, Order ID, and COD Collect Amount.
          <strong> Purchase costs, gross margins, internal profit metrics, and bearer tokens are strictly excluded</strong> to protect commercial privacy.
        </div>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-800 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Settings Form */}
        <form onSubmit={handleSubmit} className="space-y-5 bg-neutral-900/60 border border-neutral-800 rounded-lg p-6">
          <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
            <Sliders className="h-4 w-4 text-luxury-gold" />
            <h2 className="text-sm font-serif font-bold text-white uppercase tracking-wider">
              Label Layout Parameters
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                Paper Format
              </label>
              <select
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value as any)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-xs text-white focus:outline-none focus:border-luxury-gold"
              >
                <option value="thermal_4x6">Standard Thermal 4&quot; x 6&quot;</option>
                <option value="a4_standard">A4 Sheet (Courier Slip)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                Font Scale
              </label>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value as any)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-xs text-white focus:outline-none focus:border-luxury-gold"
              >
                <option value="compact">Compact (Small)</option>
                <option value="standard">Standard (Recommended)</option>
                <option value="large">High Visibility (Large)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Sender Brand Name
            </label>
            <input
              type="text"
              required
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Sender Contact Hotline
            </label>
            <input
              type="text"
              required
              value={storePhone}
              onChange={(e) => setStorePhone(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Return Dispatch Address
            </label>
            <textarea
              rows={2}
              required
              value={returnAddress}
              onChange={(e) => setReturnAddress(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-xs text-white focus:outline-none focus:border-luxury-gold"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Courier Handling Notice
            </label>
            <input
              type="text"
              value={footerNotice}
              onChange={(e) => setFooterNotice(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-xs text-white focus:outline-none focus:border-luxury-gold"
            />
          </div>

          {/* Toggles */}
          <div className="space-y-2.5 pt-2 border-t border-neutral-800">
            <label className="flex items-center justify-between text-xs text-neutral-300 cursor-pointer">
              <span>Show Brand Logo Header</span>
              <input
                type="checkbox"
                checked={showStoreLogo}
                onChange={(e) => setShowStoreLogo(e.target.checked)}
                className="h-4 w-4 rounded bg-neutral-950 border-neutral-700 text-luxury-gold focus:ring-0"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-neutral-300 cursor-pointer">
              <span>Include Dispatch Date Stamp</span>
              <input
                type="checkbox"
                checked={includeOrderDate}
                onChange={(e) => setIncludeOrderDate(e.target.checked)}
                className="h-4 w-4 rounded bg-neutral-950 border-neutral-700 text-luxury-gold focus:ring-0"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-neutral-300 cursor-pointer">
              <span>Include Package Item Count Summary</span>
              <input
                type="checkbox"
                checked={includeItemSummary}
                onChange={(e) => setIncludeItemSummary(e.target.checked)}
                className="h-4 w-4 rounded bg-neutral-950 border-neutral-700 text-luxury-gold focus:ring-0"
              />
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-800">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 bg-luxury-gold text-neutral-950 font-semibold rounded text-sm hover:bg-luxury-gold-light transition-colors disabled:opacity-50"
            >
              {isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Save Template'}
            </button>
          </div>
        </form>

        {/* Live Thermal Label Preview (Printable target) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 text-luxury-gold" />
              <span>Live Thermal Sticker Preview (4&quot; x 6&quot;)</span>
            </h3>

            <button
              type="button"
              onClick={handlePrintTest}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-luxury-gold rounded transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print Sample</span>
            </button>
          </div>

          {/* White Thermal Shipping Label Simulation */}
          <div className="bg-white text-black p-6 rounded shadow-2xl border-2 border-dashed border-neutral-400 space-y-4 font-sans select-none">
            {/* Store Header */}
            <div className="border-b-2 border-black pb-3 flex items-center justify-between">
              <div>
                <span className="font-serif font-black text-lg tracking-wider uppercase block">
                  {storeName}
                </span>
                <span className="text-[10px] text-gray-700 block font-mono">{storePhone}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider block bg-black text-white px-2 py-0.5 rounded">
                  ISLANDWIDE COURIER
                </span>
                {includeOrderDate && (
                  <span className="text-[9px] text-gray-500 font-mono block mt-0.5">
                    {new Date().toLocaleDateString('en-LK')}
                  </span>
                )}
              </div>
            </div>

            {/* Recipient Details */}
            <div className="border-2 border-black p-3 space-y-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 block">
                DELIVER TO (RECIPIENT):
              </span>
              <p className="font-bold text-base uppercase leading-tight">MRS. ANUSHA PERERA</p>
              <p className="text-xs leading-snug">No. 142/B, Galle Road, Bambalapitiya</p>
              <p className="text-xs font-bold uppercase">COLOMBO 04, WESTERN PROVINCE</p>
              <div className="pt-1 flex items-center gap-2">
                <span className="text-[10px] font-bold">CONTACT:</span>
                <span className="text-sm font-mono font-black">077 468 9907 / 011 258 4433</span>
              </div>
            </div>

            {/* Financial Collect Box */}
            <div className="grid grid-cols-2 gap-2 border-2 border-black p-2 bg-gray-50">
              <div className="border-r border-black pr-2">
                <span className="text-[9px] font-bold text-gray-600 block uppercase">ORDER NUMBER</span>
                <span className="font-mono font-black text-sm">#SJ-2026-9042</span>
              </div>
              <div className="pl-1">
                <span className="text-[9px] font-bold text-gray-600 block uppercase">PAYMENT / COD</span>
                <span className="font-mono font-black text-sm text-red-600">COD: Rs. 14,850</span>
              </div>
            </div>

            {/* Summary & Fragile Footer */}
            <div className="pt-1 text-[10px] text-gray-700 flex justify-between items-center border-t border-gray-300">
              {includeItemSummary ? (
                <span>Package Contains: <strong>2 Jewelry Pieces</strong></span>
              ) : (
                <span />
              )}
              <span className="font-bold uppercase tracking-wide text-black">{footerNotice}</span>
            </div>

            {/* Return Address */}
            <div className="text-[8px] text-gray-500 border-t border-gray-200 pt-1">
              <span>Return Address: {returnAddress}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
