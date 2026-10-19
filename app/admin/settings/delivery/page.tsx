import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminDeliverySettings } from '@/lib/settings/admin-actions';
import { DeliverySettingsManager } from '@/components/admin/settings/delivery-settings-manager';

export const metadata = {
  title: 'Delivery Matrix | Splender Jewel Admin',
  description: 'Manage shipping fees and delivery zones for all 25 administrative districts in Sri Lanka',
};

export default async function AdminDeliverySettingsPage() {
  await requireAdminPageAuth();

  const res = await getAdminDeliverySettings();
  const districts = res.success ? res.districts : [];
  const globalConfig = res.success
    ? res.globalConfig
    : { freeDeliveryEnabled: false, freeDeliveryThreshold: 10000, defaultDeliveryFee: 400 };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            Delivery Matrix & Shipping Rates
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Review payment-method and quantity delivery tier rules, free shipping thresholds, and operational status for all 25 Sri Lankan districts.
          </p>
        </div>
      </div>

      <DeliverySettingsManager
        initialDistricts={districts}
        initialGlobalConfig={globalConfig}
      />
    </div>
  );
}
