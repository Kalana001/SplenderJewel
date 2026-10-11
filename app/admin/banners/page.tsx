import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminBanners } from '@/lib/cms/admin-actions';
import { BannersManager } from '@/components/admin/cms/banners-manager';

export const metadata = {
  title: 'Promotional Banners | Splender Jewel Admin',
  description: 'Manage storefront hero banners, mobile graphics, and promotional destinations',
};

export default async function AdminBannersPage() {
  await requireAdminPageAuth();

  const res = await getAdminBanners();
  const banners = res.success ? res.banners : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            Promotional Hero Banners
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Configure desktop and mobile promotional banners, headline copy, and call-to-action destination links.
          </p>
        </div>
      </div>

      <BannersManager initialBanners={banners} />
    </div>
  );
}
