import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminGeneralStoreSettings } from '@/lib/settings/admin-actions';
import { StoreSettingsManager } from '@/components/admin/settings/store-settings-manager';

export const metadata = {
  title: 'Store Settings | Splender Jewel Admin',
  description: 'Manage brand identity, contact email, default currency, and storefront announcement banner',
};

export default async function AdminStoreSettingsPage() {
  await requireAdminPageAuth();

  const res = await getAdminGeneralStoreSettings();
  const settings = res.success
    ? res.settings
    : {
        storeName: 'Splender Jewel',
        tagline: 'Timeless Elegance & Modern Luxury Jewelry',
        logoUrl: '/images/logo.png',
        currency: 'LKR',
        currencySymbol: 'Rs.',
        contactEmail: 'concierge@splenderjewel.com',
        whatsappNumber: '+94764689907',
        announcementBannerEnabled: false,
        announcementBannerText: 'Islandwide delivery in Sri Lanka | Cash on Delivery Available',
      };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            General Store Settings
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Configure store brand identity, logo, currency standards, and header announcement bar.
          </p>
        </div>
      </div>

      <StoreSettingsManager initialSettings={settings} />
    </div>
  );
}
