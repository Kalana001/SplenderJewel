import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminPaymentSettings } from '@/lib/settings/admin-actions';
import { PaymentSettingsManager } from '@/components/admin/settings/payment-settings-manager';

export const metadata = {
  title: 'Payment Methods | Splender Jewel Admin',
  description: 'Manage Cash on Delivery and WhatsApp Bank Transfer payment methods',
};

export default async function AdminPaymentSettingsPage() {
  await requireAdminPageAuth();

  const res = await getAdminPaymentSettings();
  const settings = res.success
    ? res.settings
    : {
        codEnabled: true,
        bankTransferEnabled: true,
        whatsappNumber: '+94764689907',
        bankTransferInstructions: 'Please contact us on WhatsApp to verify your bank transfer payment.',
        bankName: 'Commercial Bank of Ceylon',
        accountName: 'Splender Jewel (Pvt) Ltd',
        accountNumber: '8001234567',
        branchName: 'Colombo Main Branch',
      };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            Payment Methods & Bank Instructions
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Configure Cash on Delivery (COD) availability and official bank deposit credentials for manual WhatsApp payment verification.
          </p>
        </div>
      </div>

      <PaymentSettingsManager initialSettings={settings} />
    </div>
  );
}
