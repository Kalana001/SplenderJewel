import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminWhatsAppSettings } from '@/lib/settings/admin-actions';
import { WhatsAppSettingsManager } from '@/components/admin/settings/whatsapp-settings-manager';
import { DEFAULT_STORE_WHATSAPP, DEFAULT_WHATSAPP_TEMPLATES } from '@/lib/config/whatsapp';

export const metadata = {
  title: 'WhatsApp Settings | Splender Jewel Admin',
  description: 'Manage store WhatsApp contact number and automated message templates',
};

export default async function AdminWhatsAppSettingsPage() {
  await requireAdminPageAuth();

  const res = await getAdminWhatsAppSettings();
  const settings = res.success
    ? res.settings
    : {
        whatsappNumber: DEFAULT_STORE_WHATSAPP,
        bankTransferMessageTemplate: DEFAULT_WHATSAPP_TEMPLATES.bankTransfer,
        productInquiryTemplate: DEFAULT_WHATSAPP_TEMPLATES.productInquiry,
        generalSupportTemplate: DEFAULT_WHATSAPP_TEMPLATES.generalSupport,
      };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            WhatsApp Integration & Message Templates
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Configure the official Splender Jewel customer communication number (+94764689907) and pre-filled message templates.
          </p>
        </div>
      </div>

      <WhatsAppSettingsManager initialSettings={settings} />
    </div>
  );
}
