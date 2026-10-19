'use client';

import React, { useState } from 'react';
import {
  Truck,
  MapPin,
  Check,
  AlertTriangle,
  RefreshCw,
  Sliders,
  DollarSign,
  ShieldAlert,
} from 'lucide-react';
import type { DeliveryDistrictSetting, GlobalDeliveryConfig } from '@/types/settings';
import {
  updateDistrictDeliveryFee,
  updateProvinceDeliveryFees,
  updateGlobalDeliverySettings,
} from '@/lib/settings/admin-actions';
import { formatCurrency } from '@/lib/config/store';

interface DeliverySettingsManagerProps {
  initialDistricts: DeliveryDistrictSetting[];
  initialGlobalConfig: GlobalDeliveryConfig;
}

export function DeliverySettingsManager({
  initialDistricts,
  initialGlobalConfig,
}: DeliverySettingsManagerProps) {
  const [districts, setDistricts] = useState<DeliveryDistrictSetting[]>(initialDistricts);
  const [globalConfig, setGlobalConfig] = useState<GlobalDeliveryConfig>(initialGlobalConfig);

  // Global settings state
  const [freeDeliveryEnabled, setFreeDeliveryEnabled] = useState(initialGlobalConfig.freeDeliveryEnabled);
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState(initialGlobalConfig.freeDeliveryThreshold);
  const [defaultDeliveryFee, setDefaultDeliveryFee] = useState(initialGlobalConfig.defaultDeliveryFee);
  const [isSavingGlobal, setIsSavingGlobal] = useState(false);
  const [globalSuccessMsg, setGlobalSuccessMsg] = useState<string | null>(null);

  // District editing state (fee and active)
  const [districtEdits, setDistrictEdits] = useState<Record<string, { fee: number; isActive: boolean }>>(
    () => {
      const init: Record<string, { fee: number; isActive: boolean }> = {};
      for (const d of initialDistricts) {
        init[d.id] = { fee: d.deliveryFee, isActive: d.isActive };
      }
      return init;
    }
  );
  const [savingDistrictId, setSavingDistrictId] = useState<string | null>(null);
  const [savedDistrictId, setSavedDistrictId] = useState<string | null>(null);

  // Province batch update state
  const [provinceBatchFee, setProvinceBatchFee] = useState<Record<string, number>>({});
  const [savingProvince, setSavingProvince] = useState<string | null>(null);

  // Group districts by province
  const provinces = Array.from(new Set(districts.map((d) => d.province))).sort();

  // Handle single district update
  const handleSaveDistrict = async (district: DeliveryDistrictSetting) => {
    const edit = districtEdits[district.id];
    if (!edit || edit.fee < 0) {
      alert('Please enter a valid non-negative delivery fee.');
      return;
    }

    setSavingDistrictId(district.id);
    try {
      const res = await updateDistrictDeliveryFee(district.id, edit.fee, edit.isActive);
      if (res.success) {
        setDistricts((prev) =>
          prev.map((d) =>
            d.id === district.id ? { ...d, deliveryFee: edit.fee, isActive: edit.isActive } : d
          )
        );
        setSavedDistrictId(district.id);
        setTimeout(() => setSavedDistrictId(null), 2000);
      } else {
        alert(res.error || 'Failed to update district delivery fee.');
      }
    } finally {
      setSavingDistrictId(null);
    }
  };

  // Handle Province Batch Update
  const handleBatchUpdateProvince = async (provinceName: string) => {
    const fee = provinceBatchFee[provinceName];
    if (fee === undefined || fee < 0) {
      alert(`Please enter a valid delivery fee for ${provinceName} province.`);
      return;
    }

    setSavingProvince(provinceName);
    try {
      const res = await updateProvinceDeliveryFees(provinceName, fee);
      if (res.success) {
        setDistricts((prev) =>
          prev.map((d) => (d.province === provinceName ? { ...d, deliveryFee: fee } : d))
        );
        setDistrictEdits((prev) => {
          const next = { ...prev };
          for (const d of districts.filter((item) => item.province === provinceName)) {
            next[d.id] = { ...next[d.id], fee };
          }
          return next;
        });
        alert(`Successfully updated all districts in ${provinceName} to Rs. ${fee}.`);
      } else {
        alert(res.error || `Failed to update ${provinceName} province.`);
      }
    } finally {
      setSavingProvince(null);
    }
  };

  // Handle Global Delivery Settings Save
  const handleSaveGlobal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingGlobal(true);
    setGlobalSuccessMsg(null);

    try {
      const newConfig: GlobalDeliveryConfig = {
        freeDeliveryEnabled,
        freeDeliveryThreshold: Number(freeDeliveryThreshold),
        defaultDeliveryFee: Number(defaultDeliveryFee),
      };

      const res = await updateGlobalDeliverySettings(newConfig);
      if (res.success) {
        setGlobalConfig(newConfig);
        setGlobalSuccessMsg('Global delivery settings updated successfully.');
        setTimeout(() => setGlobalSuccessMsg(null), 3000);
      } else {
        alert(res.error || 'Failed to update global delivery settings.');
      }
    } finally {
      setIsSavingGlobal(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Policy & Tier Pricing Notice */}
      <div className="bg-amber-950/30 border border-amber-800/60 rounded-lg p-5 text-amber-200 space-y-2">
        <div className="flex items-center gap-2 font-serif font-bold text-amber-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>Payment-Method & Item-Quantity Tiered Shipping System</span>
        </div>
        <p className="text-xs leading-relaxed text-amber-200/90">
          <strong>Active Store Policy:</strong> Delivery charges apply uniformly across all 25 Sri Lankan districts based on payment method and aggregate cart item quantity:
          <br />• <strong>Bank Transfer (Sri Lanka Post Speed Post):</strong> 1–3 items: LKR 200 | 4–7 items: LKR 250 | 8+ items: LKR 350.
          <br />• <strong>Cash on Delivery (Sri Lanka Post COD):</strong> 1–3 items: LKR 350 | 4–10 items: LKR 400 | 11+ items: LKR 500.
          <br />The <code className="bg-amber-900/60 px-1 py-0.5 rounded font-mono text-[11px]">delivery_districts</code> table below governs district operational availability (<code className="bg-amber-900/60 px-1 py-0.5 rounded font-mono text-[11px]">is_active</code>) and provincial routing.
        </p>
      </div>

      {/* Global Delivery Settings Card */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2.5">
            <Sliders className="h-5 w-5 text-luxury-gold" />
            <h2 className="text-base font-serif font-bold text-white">Global Delivery Rules</h2>
          </div>
          {globalSuccessMsg && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> {globalSuccessMsg}
            </span>
          )}
        </div>

        <form onSubmit={handleSaveGlobal} className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="space-y-2 bg-neutral-950 p-4 rounded border border-neutral-800/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                Free Delivery Offer
              </label>
              <button
                type="button"
                onClick={() => setFreeDeliveryEnabled(!freeDeliveryEnabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  freeDeliveryEnabled ? 'bg-luxury-gold' : 'bg-neutral-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    freeDeliveryEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <p className="text-[11px] text-neutral-500">
              {freeDeliveryEnabled ? 'Active across qualifying orders' : 'Currently turned OFF'}
            </p>
          </div>

          <div className="space-y-1.5 bg-neutral-950 p-4 rounded border border-neutral-800/80">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Free Delivery Spend Threshold (Rs.)
            </label>
            <input
              type="number"
              min="0"
              step="500"
              value={freeDeliveryThreshold}
              onChange={(e) => setFreeDeliveryThreshold(Number(e.target.value))}
              disabled={!freeDeliveryEnabled}
              className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold disabled:opacity-40"
            />
            <p className="text-[11px] text-neutral-500">Orders exceeding this total earn free shipping.</p>
          </div>

          <div className="space-y-1.5 bg-neutral-950 p-4 rounded border border-neutral-800/80">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Default Fallback Delivery Fee (Rs.)
            </label>
            <input
              type="number"
              min="0"
              step="50"
              value={defaultDeliveryFee}
              onChange={(e) => setDefaultDeliveryFee(Number(e.target.value))}
              className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
            />
            <p className="text-[11px] text-neutral-500">Used if a customer address has no matched district.</p>
          </div>

          <div className="md:col-span-3 flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSavingGlobal}
              className="inline-flex items-center gap-2 px-5 py-2 bg-luxury-gold text-neutral-950 font-semibold rounded text-sm hover:bg-luxury-gold-light transition-colors disabled:opacity-50"
            >
              {isSavingGlobal ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Saving Settings...
                </>
              ) : (
                'Save Global Delivery Rules'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* 25 Districts Matrix Grouped by Province */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2.5">
            <MapPin className="h-5 w-5 text-luxury-gold" />
            <h2 className="text-lg font-serif font-bold text-white">
              Sri Lanka 25 Districts Delivery Matrix
            </h2>
          </div>
          <span className="text-xs text-neutral-400">
            {districts.filter((d) => d.isActive).length} / 25 Active Delivery Zones
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
                {/* Province Header with Batch Fee Edit */}
                <div className="bg-neutral-950 px-5 py-3.5 border-b border-neutral-800 flex items-center justify-between">
                  <div>
                    <h3 className="font-serif font-bold text-white text-sm">{province} Province</h3>
                    <span className="text-[11px] text-neutral-400">
                      {provinceDistricts.length} administrative districts
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Fee"
                      min="0"
                      step="50"
                      value={provinceBatchFee[province] ?? ''}
                      onChange={(e) =>
                        setProvinceBatchFee((prev) => ({
                          ...prev,
                          [province]: e.target.value === '' ? ('' as any) : Number(e.target.value),
                        }))
                      }
                      className="w-20 px-2 py-1 bg-neutral-900 border border-neutral-700 rounded text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-luxury-gold text-right"
                    />
                    <button
                      type="button"
                      disabled={savingProvince === province}
                      onClick={() => handleBatchUpdateProvince(province)}
                      className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-luxury-gold rounded text-xs font-semibold transition-colors disabled:opacity-50"
                      title="Set fee for all districts in this province"
                    >
                      {savingProvince === province ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        'Apply All'
                      )}
                    </button>
                  </div>
                </div>

                {/* District Rows */}
                <div className="divide-y divide-neutral-800/60 flex-1">
                  {provinceDistricts.map((district) => {
                    const edit = districtEdits[district.id] || {
                      fee: district.deliveryFee,
                      isActive: district.isActive,
                    };
                    const isSaving = savingDistrictId === district.id;
                    const isSaved = savedDistrictId === district.id;

                    return (
                      <div
                        key={district.id}
                        className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-neutral-800/20 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setDistrictEdits((prev) => ({
                                ...prev,
                                [district.id]: { ...edit, isActive: !edit.isActive },
                              }))
                            }
                            title={edit.isActive ? 'Active Delivery Zone' : 'Delivery Disabled'}
                            className={`h-2.5 w-2.5 rounded-full ${
                              edit.isActive ? 'bg-emerald-400' : 'bg-red-500'
                            }`}
                          />
                          <div>
                            <span className="text-sm font-medium text-white">{district.name}</span>
                            <div className="text-[11px] text-neutral-500">
                              {edit.isActive ? 'Active' : 'Delivery disabled'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-neutral-400">Rs.</span>
                            <input
                              type="number"
                              min="0"
                              step="50"
                              value={edit.fee}
                              onChange={(e) =>
                                setDistrictEdits((prev) => ({
                                  ...prev,
                                  [district.id]: {
                                    ...edit,
                                    fee: e.target.value === '' ? 0 : Number(e.target.value),
                                  },
                                }))
                              }
                              className="w-20 px-2 py-1 bg-neutral-950 border border-neutral-700 rounded text-xs text-white focus:outline-none focus:border-luxury-gold text-right"
                            />
                          </div>

                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleSaveDistrict(district)}
                            className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded transition-colors disabled:opacity-50"
                            title="Save district delivery fee"
                          >
                            {isSaving ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : isSaved ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                          </button>
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
