'use client';

import React, { useState } from 'react';
import {
  MessageCircle,
  Phone,
  ExternalLink,
  Check,
  AlertCircle,
  RefreshCw,
  FileText,
  Copy,
  ShieldCheck,
} from 'lucide-react';
import type { WhatsAppSettingsConfig } from '@/types/settings';
import { updateAdminWhatsAppSettings } from '@/lib/settings/admin-actions';
import {
  normalizePhoneNumber,
  isValidPhoneNumber,
  generateSafeWhatsAppUrl,
  interpolateWhatsAppTemplate,
} from '@/lib/config/whatsapp';

interface WhatsAppSettingsManagerProps {
  initialSettings: WhatsAppSettingsConfig;
}

export function WhatsAppSettingsManager({ initialSettings }: WhatsAppSettingsManagerProps) {
  const [whatsappNumber, setWhatsappNumber] = useState(initialSettings.whatsappNumber);
  const [bankTransferTemplate, setBankTransferTemplate] = useState(
    initialSettings.bankTransferMessageTemplate
  );
  const [productInquiryTemplate, setProductInquiryTemplate] = useState(
    initialSettings.productInquiryTemplate
  );
  const [generalSupportTemplate, setGeneralSupportTemplate] = useState(
    initialSettings.generalSupportTemplate
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Computed normalized number and validation
  const normalizedNumber = normalizePhoneNumber(whatsappNumber);
  const isNumberValid = isValidPhoneNumber(normalizedNumber);

  // Live previews
  const previewBankTransferMsg = interpolateWhatsAppTemplate(bankTransferTemplate, {
    ORDER_NUMBER: 'SJ-2026-8814',
  });
  const previewProductInquiryMsg = interpolateWhatsAppTemplate(productInquiryTemplate, {
    PRODUCT_NAME: '18K Gold Royal Solitaire Ring',
  });

  const testChatUrl = isNumberValid
    ? generateSafeWhatsAppUrl(normalizedNumber, generalSupportTemplate)
    : '#';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isNumberValid) {
      setErrorMessage('Please enter a valid international WhatsApp number (e.g. +94764689907 or 0764689907).');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: WhatsAppSettingsConfig = {
        whatsappNumber: normalizedNumber,
        bankTransferMessageTemplate: bankTransferTemplate,
        productInquiryTemplate,
        generalSupportTemplate,
      };

      const res = await updateAdminWhatsAppSettings(payload);
      if (res.success) {
        setWhatsappNumber(normalizedNumber);
        setSuccessMessage('WhatsApp integration settings updated successfully.');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setErrorMessage(res.error || 'Failed to update WhatsApp settings.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
      {errorMessage && (
        <div className="p-4 bg-red-950/60 border border-red-800 rounded-lg text-xs text-red-300 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-800 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Security Architecture Note */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5 flex items-start gap-3.5">
        <ShieldCheck className="h-5 w-5 text-luxury-gold shrink-0 mt-0.5" />
        <div className="text-xs text-neutral-400 leading-relaxed">
          <strong className="text-white block mb-0.5">Safe Message Encoding Architecture:</strong>
          All customer-facing WhatsApp direct links strictly use E.164 phone normalization, standard URL parameter encoding
          (<code className="bg-neutral-950 px-1 py-0.5 rounded font-mono text-[11px]">encodeURIComponent</code>), and sanitize HTML tags to prevent cross-site scripting.
        </div>
      </div>

      {/* Official Business WhatsApp Contact */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-neutral-950 rounded border border-neutral-800 text-luxury-gold">
              <Phone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-serif font-bold text-white">
                Official Store WhatsApp Number
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Centralized contact used across storefront header, footer, product inquiry, and checkout confirmation.
              </p>
            </div>
          </div>

          {isNumberValid && (
            <a
              href={testChatUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-luxury-gold rounded transition-colors"
            >
              <span>Test Chat</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Contact Number Input
            </label>
            <input
              type="text"
              required
              placeholder="e.g. +94764689907 or 0764689907"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white font-mono focus:outline-none focus:border-luxury-gold"
            />
            <p className="text-[11px] text-neutral-500">
              Accepts international format with + or local 10-digit Sri Lankan phone numbers.
            </p>
          </div>

          <div className="space-y-1.5 bg-neutral-950 p-3.5 rounded border border-neutral-800/80">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-neutral-400 block">
              Normalized International Format
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className={`font-mono text-sm font-bold ${isNumberValid ? 'text-white' : 'text-red-400'}`}>
                {normalizedNumber || 'None'}
              </span>
              {isNumberValid ? (
                <span className="text-emerald-400 text-xs flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" /> Valid E.164
                </span>
              ) : (
                <span className="text-red-400 text-xs flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" /> Invalid format
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Message Templates Configuration */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-6">
        <div className="border-b border-neutral-800 pb-3">
          <h2 className="text-base font-serif font-bold text-white flex items-center gap-2">
            <FileText className="h-5 w-5 text-luxury-gold" />
            Pre-Filled Message Templates
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Customize automated messages pre-populated when customers click WhatsApp buttons on Splender Jewel.
          </p>
        </div>

        {/* Template 1: Bank Transfer Slip Submission */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-neutral-200 uppercase tracking-wider">
              1. Bank Transfer Receipt Submission Template
            </label>
            <span className="text-[11px] text-neutral-500 font-mono">Placeholder: [ORDER_NUMBER]</span>
          </div>
          <textarea
            rows={3}
            required
            value={bankTransferTemplate}
            onChange={(e) => setBankTransferTemplate(e.target.value)}
            className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
          />
          {/* Live Preview */}
          <div className="bg-neutral-950/70 border border-neutral-800/80 p-3 rounded text-xs space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-luxury-gold font-semibold block">
              Customer Message Preview:
            </span>
            <p className="text-neutral-300 italic">"{previewBankTransferMsg}"</p>
          </div>
        </div>

        {/* Template 2: Product Inquiry */}
        <div className="space-y-3 pt-4 border-t border-neutral-800/60">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-neutral-200 uppercase tracking-wider">
              2. Product Inquiry Template
            </label>
            <span className="text-[11px] text-neutral-500 font-mono">Placeholder: [PRODUCT_NAME]</span>
          </div>
          <textarea
            rows={3}
            required
            value={productInquiryTemplate}
            onChange={(e) => setProductInquiryTemplate(e.target.value)}
            className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
          />
          {/* Live Preview */}
          <div className="bg-neutral-950/70 border border-neutral-800/80 p-3 rounded text-xs space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-luxury-gold font-semibold block">
              Customer Message Preview:
            </span>
            <p className="text-neutral-300 italic">"{previewProductInquiryMsg}"</p>
          </div>
        </div>

        {/* Template 3: General Customer Support */}
        <div className="space-y-3 pt-4 border-t border-neutral-800/60">
          <label className="text-xs font-semibold text-neutral-200 uppercase tracking-wider block">
            3. General Customer Support Message
          </label>
          <textarea
            rows={2}
            required
            value={generalSupportTemplate}
            onChange={(e) => setGeneralSupportTemplate(e.target.value)}
            className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
          />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={isSubmitting || !isNumberValid}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-luxury-gold text-neutral-950 font-semibold rounded text-sm hover:bg-luxury-gold-light transition-colors disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Saving Settings...
            </>
          ) : (
            'Save WhatsApp Settings'
          )}
        </button>
      </div>
    </form>
  );
}
