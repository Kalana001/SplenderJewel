'use client';

import React, { useState } from 'react';
import {
  CreditCard,
  Banknote,
  Building2,
  Check,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  MessageCircle,
} from 'lucide-react';
import type { PaymentSettingsConfig } from '@/types/settings';
import { updateAdminPaymentSettings } from '@/lib/settings/admin-actions';

interface PaymentSettingsManagerProps {
  initialSettings: PaymentSettingsConfig;
}

export function PaymentSettingsManager({ initialSettings }: PaymentSettingsManagerProps) {
  const [settings, setSettings] = useState<PaymentSettingsConfig>(initialSettings);
  const [codEnabled, setCodEnabled] = useState(initialSettings.codEnabled);
  const [bankTransferEnabled, setBankTransferEnabled] = useState(initialSettings.bankTransferEnabled);
  const [bankName, setBankName] = useState(initialSettings.bankName);
  const [accountName, setAccountName] = useState(initialSettings.accountName);
  const [accountNumber, setAccountNumber] = useState(initialSettings.accountNumber);
  const [branchName, setBranchName] = useState(initialSettings.branchName);
  const [bankTransferInstructions, setBankTransferInstructions] = useState(
    initialSettings.bankTransferInstructions
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!codEnabled && !bankTransferEnabled) {
      setErrorMessage('At least one payment method (Cash on Delivery or Bank Transfer) must remain enabled.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: PaymentSettingsConfig = {
        codEnabled,
        bankTransferEnabled,
        whatsappNumber: settings.whatsappNumber,
        bankTransferInstructions,
        bankName,
        accountName,
        accountNumber,
        branchName,
      };

      const res = await updateAdminPaymentSettings(payload);
      if (res.success) {
        setSettings(payload);
        setSuccessMessage('Payment settings updated successfully.');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setErrorMessage(res.error || 'Failed to update payment settings.');
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

      {/* Security Architecture Callout */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5 flex items-start gap-3.5">
        <ShieldCheck className="h-5 w-5 text-luxury-gold shrink-0 mt-0.5" />
        <div className="text-xs text-neutral-400 leading-relaxed">
          <strong className="text-white block mb-0.5">Payment Security Architecture:</strong>
          Splender Jewel strictly operates with verified Cash on Delivery and manual Bank Transfer verification.
          No private banking credentials, API secrets, or merchant keys are stored in client-accessible tables.
        </div>
      </div>

      {/* Method 1: Cash on Delivery (COD) */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-neutral-950 rounded-lg border border-neutral-800 text-luxury-gold">
              <Banknote className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-serif font-bold text-white">Cash on Delivery (COD)</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Recipient pays the courier upon arrival at their shipping address.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCodEnabled(!codEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              codEnabled ? 'bg-luxury-gold' : 'bg-neutral-800'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                codEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="text-xs text-neutral-500 pt-2 border-t border-neutral-800/60">
          Status: {codEnabled ? (
            <span className="text-emerald-400 font-semibold">Enabled at checkout</span>
          ) : (
            <span className="text-neutral-500 font-semibold">Disabled</span>
          )}
        </div>
      </div>

      {/* Method 2: Bank Transfer & WhatsApp Verification */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-neutral-950 rounded-lg border border-neutral-800 text-luxury-gold">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-serif font-bold text-white">
                Bank Deposit / Online Transfer
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Customers deposit to company bank account and submit deposit slip on WhatsApp.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setBankTransferEnabled(!bankTransferEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              bankTransferEnabled ? 'bg-luxury-gold' : 'bg-neutral-800'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                bankTransferEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Bank Account Fields */}
        <div className="space-y-4 pt-4 border-t border-neutral-800/80">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-luxury-gold">
            Official Store Bank Account Details
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                Bank Name
              </label>
              <input
                type="text"
                placeholder="e.g. Commercial Bank of Ceylon"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                disabled={!bankTransferEnabled}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                Account Holder Name
              </label>
              <input
                type="text"
                placeholder="e.g. Splender Jewel (Pvt) Ltd"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                disabled={!bankTransferEnabled}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                Account Number
              </label>
              <input
                type="text"
                placeholder="e.g. 8001234567"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                disabled={!bankTransferEnabled}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white font-mono focus:outline-none focus:border-luxury-gold disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                Branch Name
              </label>
              <input
                type="text"
                placeholder="e.g. Colombo Main Branch"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                disabled={!bankTransferEnabled}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold disabled:opacity-50"
              />
            </div>
          </div>

          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Customer Payment Instructions
            </label>
            <textarea
              rows={3}
              value={bankTransferInstructions}
              onChange={(e) => setBankTransferInstructions(e.target.value)}
              disabled={!bankTransferEnabled}
              placeholder="e.g. Please transfer the full amount to the account above and forward your payment receipt to our WhatsApp."
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold disabled:opacity-50"
            />
            <p className="text-[11px] text-neutral-500">
              Displayed to customers on the order confirmation screen and receipt.
            </p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-luxury-gold text-neutral-950 font-semibold rounded text-sm hover:bg-luxury-gold-light transition-colors disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Saving Payment Settings...
            </>
          ) : (
            'Save Payment Settings'
          )}
        </button>
      </div>
    </form>
  );
}
