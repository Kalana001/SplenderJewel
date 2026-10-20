'use client';

import React, { useState } from 'react';
import {
  Truck,
  MapPin,
  Check,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Package,
  CreditCard,
  Banknote,
} from 'lucide-react';
import type { DeliveryDistrictSetting, GlobalDeliveryConfig } from '@/types/settings';
import { updateDistrictAvailability } from '@/lib/settings/admin-actions';

interface DeliverySettingsManagerProps {
  initialDistricts: DeliveryDistrictSetting[];
  initialGlobalConfig?: GlobalDeliveryConfig;
}

export function DeliverySettingsManager({
  initialDistricts,
}: DeliverySettingsManagerProps) {
  const [districts, setDistricts] = useState<DeliveryDistrictSetting[]>(initialDistricts);
  const [updatingDistrictId, setUpdatingDistrictId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Group districts by province
  const provinces = Array.from(new Set(districts.map((d) => d.province))).sort();
  const activeCount = districts.filter((d) => d.isActive).length;

  // Handle District Availability Toggle
  const handleToggleDistrict = async (district: DeliveryDistrictSetting) => {
    const nextState = !district.isActive;
    setUpdatingDistrictId(district.id);
    setStatusMessage(null);

    try {
      const res = await updateDistrictAvailability(district.id, nextState);
      if (res.success) {
        setDistricts((prev) =>
          prev.map((d) => (d.id === district.id ? { ...d, isActive: nextState } : d))
        );
        setStatusMessage({
          text: `${district.name} delivery ${nextState ? 'activated' : 'disabled'}.`,
        });
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        setStatusMessage({
          text: res.error || `Failed to update ${district.name} status.`,
          isError: true,
        });
      }
    } catch {
      setStatusMessage({
        text: `Unexpected network error while updating ${district.name}.`,
        isError: true,
      });
    } finally {
      setUpdatingDistrictId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Official Read-Only Shipping Policy & Postal Rates Card */}
      <div className="bg-neutral-900/70 border border-neutral-800 rounded-lg p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Truck className="h-5 w-5 text-luxury-gold" />
            <h2 className="text-base sm:text-lg font-serif font-bold text-white tracking-wide">
              Official Store Delivery Policy & Postal Rate Card
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-luxury-gold bg-luxury-gold/10 border border-luxury-gold/30 px-3 py-1 rounded-full font-medium">
            <ShieldCheck className="h-3.5 w-3.5" /> Server-Enforced & Non-Tamperable
          </span>
        </div>

        <p className="text-xs text-neutral-400 leading-relaxed">
          Splender Jewel enforces authoritative nationwide postal delivery charges across all 25 Sri Lankan administrative districts.
          Shipping fees are automatically calculated server-side based on the chosen payment method and verified aggregate cart item quantity.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Bank Transfer / Speed Post Card */}
          <div className="bg-neutral-950 p-5 rounded-lg border border-neutral-800/90 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Bank Transfer (Speed Post)</h3>
              </div>
              <span className="text-[11px] text-neutral-400 font-mono">Sri Lanka Post</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 px-3 rounded bg-neutral-900/60 border border-neutral-800/50">
                <span className="text-neutral-300">1 – 3 Items</span>
                <span className="font-bold text-white font-mono">Rs. 200</span>
              </div>
              <div className="flex items-center justify-between py-1.5 px-3 rounded bg-neutral-900/60 border border-neutral-800/50">
                <span className="text-neutral-300">4 – 7 Items</span>
                <span className="font-bold text-white font-mono">Rs. 250</span>
              </div>
              <div className="flex items-center justify-between py-1.5 px-3 rounded bg-neutral-900/60 border border-neutral-800/50">
                <span className="text-neutral-300">8+ Items</span>
                <span className="font-bold text-white font-mono">Rs. 350</span>
              </div>
            </div>

            <p className="text-[11px] text-neutral-500 leading-normal">
              Dispatched via Sri Lanka Post Speed Post service upon payment receipt verification.
            </p>
          </div>

          {/* Cash on Delivery / Post COD Card */}
          <div className="bg-neutral-950 p-5 rounded-lg border border-neutral-800/90 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-luxury-gold" />
                <h3 className="text-sm font-semibold text-white">Cash on Delivery (Post COD)</h3>
              </div>
              <span className="text-[11px] text-neutral-400 font-mono">Sri Lanka Post</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 px-3 rounded bg-neutral-900/60 border border-neutral-800/50">
                <span className="text-neutral-300">1 – 3 Items</span>
                <span className="font-bold text-white font-mono">Rs. 350</span>
              </div>
              <div className="flex items-center justify-between py-1.5 px-3 rounded bg-neutral-900/60 border border-neutral-800/50">
                <span className="text-neutral-300">4 – 10 Items</span>
                <span className="font-bold text-white font-mono">Rs. 400</span>
              </div>
              <div className="flex items-center justify-between py-1.5 px-3 rounded bg-neutral-900/60 border border-neutral-800/50">
                <span className="text-neutral-300">11+ Items</span>
                <span className="font-bold text-white font-mono">Rs. 500</span>
              </div>
            </div>

            <p className="text-[11px] text-neutral-500 leading-normal">
              Dispatched via Sri Lanka Post COD courier service with cash collection at customer doorstep.
            </p>
          </div>
        </div>

        {/* Informational Policy Note */}
        <div className="flex items-start gap-2.5 p-3.5 rounded bg-amber-950/20 border border-amber-900/40 text-[11px] text-amber-200/90">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>Operational Availability Control:</strong> The district switches below govern operational shipping availability (<code className="bg-amber-950/60 px-1 py-0.5 rounded font-mono text-amber-300">is_active</code>). Disabling a district immediately stops customers from submitting checkout orders to that destination. Shipping rates remain uniform across all active zones.
          </span>
        </div>
      </div>

      {/* Status Alert Notification */}
      {statusMessage && (
        <div
          role="status"
          className={`px-4 py-2.5 rounded-lg border text-xs flex items-center justify-between transition-all ${
            statusMessage.isError
              ? 'bg-red-950/50 border-red-800/70 text-red-300'
              : 'bg-emerald-950/50 border-emerald-800/70 text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.isError ? (
              <AlertTriangle className="h-4 w-4 text-red-400" />
            ) : (
              <Check className="h-4 w-4 text-emerald-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-neutral-400 hover:text-white text-xs ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {/* 25 Districts Delivery Zones Grouped by Province */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2.5">
            <MapPin className="h-5 w-5 text-luxury-gold" />
            <h2 className="text-base sm:text-lg font-serif font-bold text-white">
              Sri Lanka 25 Districts Operational Coverage
            </h2>
          </div>
          <span className="text-xs text-neutral-400 font-mono">
            {activeCount} / 25 Active Delivery Zones
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {provinces.map((province) => {
            const provinceDistricts = districts.filter((d) => d.province === province);

            return (
              <div
                key={province}
                className="bg-neutral-900/60 border border-neutral-800 rounded-lg overflow-hidden flex flex-col"
              >
                {/* Province Header */}
                <div className="bg-neutral-950 px-5 py-3 border-b border-neutral-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-neutral-400" />
                    <h3 className="font-serif font-bold text-white text-sm">{province} Province</h3>
                  </div>
                  <span className="text-[11px] text-neutral-400 font-mono">
                    {provinceDistricts.filter((d) => d.isActive).length} / {provinceDistricts.length} active
                  </span>
                </div>

                {/* District Rows */}
                <div className="divide-y divide-neutral-800/60 flex-1">
                  {provinceDistricts.map((district) => {
                    const isUpdating = updatingDistrictId === district.id;

                    return (
                      <div
                        key={district.id}
                        className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-neutral-800/20 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            aria-hidden="true"
                            className={`h-2.5 w-2.5 rounded-full shrink-0 transition-colors ${
                              district.isActive ? 'bg-emerald-400 shadow-sm shadow-emerald-500/50' : 'bg-red-500'
                            }`}
                          />
                          <div>
                            <span className="text-sm font-medium text-white">{district.name}</span>
                            <div className="text-[11px] text-neutral-500">
                              {district.isActive ? 'Active (Accepting orders)' : 'Disabled (Delivery blocked)'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-neutral-400 bg-neutral-950 border border-neutral-800 px-2 py-0.5 rounded font-mono hidden sm:inline">
                            Postal Tier Rate
                          </span>

                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => handleToggleDistrict(district)}
                            aria-label={`Toggle delivery for ${district.name}`}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                              district.isActive ? 'bg-emerald-500' : 'bg-neutral-800'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                district.isActive ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>

                          {isUpdating && (
                            <RefreshCw className="h-3.5 w-3.5 text-luxury-gold animate-spin" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
