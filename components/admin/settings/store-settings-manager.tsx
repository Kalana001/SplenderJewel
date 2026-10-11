'use client';

import React, { useState } from 'react';
import {
  Store,
  DollarSign,
  Mail,
  Phone,
  Megaphone,
  Check,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import type { GeneralStoreConfig } from '@/types/settings';
import { updateAdminGeneralStoreSettings } from '@/lib/settings/admin-actions';
import { normalizePhoneNumber, isValidPhoneNumber } from '@/lib/config/whatsapp';

interface StoreSettingsManagerProps {
  initialSettings: GeneralStoreConfig;
}

export function StoreSettingsManager({ initialSettings }: StoreSettingsManagerProps) {
  const [storeName, setStoreName] = useState(initialSettings.storeName);
  const [tagline, setTagline] = useState(initialSettings.tagline);
  const [logoUrl, setLogoUrl] = useState(initialSettings.logoUrl || '/images/logo.png');
  const [currency, setCurrency] = useState(initialSettings.currency);
  const [currencySymbol, setCurrencySymbol] = useState(initialSettings.currencySymbol);
  const [contactEmail, setContactEmail] = useState(initialSettings.contactEmail);
  const [whatsappNumber, setWhatsappNumber] = useState(initialSettings.whatsappNumber);
  const [announcementEnabled, setAnnouncementEnabled] = useState(initialSettings.announcementBannerEnabled);
  const [announcementText, setAnnouncementText] = useState(initialSettings.announcementBannerText);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const normalizedPhone = normalizePhoneNumber(whatsappNumber);
  const isPhoneValid = isValidPhoneNumber(normalizedPhone);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!storeName.trim()) {
      setErrorMessage('Store brand name is required.');
      return;
    }

    if (!isPhoneValid) {
      setErrorMessage('Please provide a valid official WhatsApp phone number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: GeneralStoreConfig = {
        storeName: storeName.trim(),
        tagline: tagline.trim(),
        logoUrl: logoUrl.trim(),
        currency: currency.trim(),
        currencySymbol: currencySymbol.trim(),
        contactEmail: contactEmail.trim(),
        whatsappNumber: normalizedPhone,
        announcementBannerEnabled: announcementEnabled,
        announcementBannerText: announcementText.trim(),
      };

      const res = await updateAdminGeneralStoreSettings(payload);
      if (res.success) {
        setWhatsappNumber(normalizedPhone);
        setSuccessMessage('General store settings updated successfully.');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setErrorMessage(res.error || 'Failed to update store settings.');
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

      {/* 1. Store Brand Identity */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-5">
        <div className="flex items-center gap-2.5 border-b border-neutral-800 pb-3">
          <Store className="h-5 w-5 text-luxury-gold" />
          <h2 className="text-base font-serif font-bold text-white">Brand Identity & Visuals</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Brand Store Name
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
              Brand Tagline / Slogan
            </label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Logo Asset URL
            </label>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="flex-1 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white font-mono focus:outline-none focus:border-luxury-gold"
              />
              <div className="h-10 w-10 bg-black border border-neutral-800 rounded p-1 flex items-center justify-center shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt="Logo preview"
                  className="max-h-full max-w-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Currency & Customer Contacts */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-5">
        <div className="flex items-center gap-2.5 border-b border-neutral-800 pb-3">
          <DollarSign className="h-5 w-5 text-luxury-gold" />
          <h2 className="text-base font-serif font-bold text-white">Currency & Support Contacts</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Currency Code
            </label>
            <input
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white font-mono focus:outline-none focus:border-luxury-gold"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Currency Symbol
            </label>
            <input
              type="text"
              value={currencySymbol}
              onChange={(e) => setCurrencySymbol(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white font-mono focus:outline-none focus:border-luxury-gold"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Customer Support Email
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Official WhatsApp Phone
            </label>
            <input
              type="text"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white font-mono focus:outline-none focus:border-luxury-gold"
            />
          </div>
        </div>
      </div>

      {/* 3. Announcement Banner */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2.5">
            <Megaphone className="h-5 w-5 text-luxury-gold" />
            <h2 className="text-base font-serif font-bold text-white">Header Announcement Notification Bar</h2>
          </div>

          <button
            type="button"
            onClick={() => setAnnouncementEnabled(!announcementEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              announcementEnabled ? 'bg-luxury-gold' : 'bg-neutral-800'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                announcementEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
            Announcement Message
          </label>
          <input
            type="text"
            disabled={!announcementEnabled}
            placeholder="e.g. Free islandwide courier delivery on orders over Rs. 10,000"
            value={announcementText}
            onChange={(e) => setAnnouncementText(e.target.value)}
            className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold disabled:opacity-40"
          />
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
              Saving Settings...
            </>
          ) : (
            'Save General Store Settings'
          )}
        </button>
      </div>
    </form>
  );
}
