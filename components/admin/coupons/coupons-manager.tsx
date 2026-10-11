'use client';

import React, { useState } from 'react';
import {
  Tag,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  Edit2,
  Copy,
  Check,
  AlertCircle,
  X,
  RefreshCw,
} from 'lucide-react';
import type { Coupon, CreateCouponInput, DiscountType } from '@/types/coupon';
import {
  createAdminCoupon,
  updateAdminCoupon,
  toggleAdminCouponActive,
  deleteAdminCoupon,
} from '@/lib/coupons/admin-actions';
import { formatCurrency } from '@/lib/config/store';

interface CouponsManagerProps {
  initialCoupons: Coupon[];
}

export function CouponsManager({ initialCoupons }: CouponsManagerProps) {
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'active' | 'inactive'>('all');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('percentage');
  const [discountValue, setDiscountValue] = useState<number | ''>(10);
  const [minOrderAmount, setMinOrderAmount] = useState<number | ''>(0);
  const [maxDiscountAmount, setMaxDiscountAmount] = useState<number | ''>('');
  const [totalUsageLimit, setTotalUsageLimit] = useState<number | ''>('');
  const [perCustomerLimit, setPerCustomerLimit] = useState<number | ''>(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Copy code to clipboard
  const handleCopy = (couponCode: string) => {
    navigator.clipboard.writeText(couponCode);
    setCopiedCode(couponCode);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Open Create Modal
  const openCreateModal = () => {
    setEditingCoupon(null);
    setCode('');
    setDiscountType('percentage');
    setDiscountValue(10);
    setMinOrderAmount(0);
    setMaxDiscountAmount('');
    setTotalUsageLimit('');
    setPerCustomerLimit(1);
    setStartDate('');
    setEndDate('');
    setIsActive(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setCode(coupon.code);
    setDiscountType(coupon.discountType);
    setDiscountValue(coupon.discountValue);
    setMinOrderAmount(coupon.minOrderAmount);
    setMaxDiscountAmount(coupon.maxDiscountAmount ?? '');
    setTotalUsageLimit(coupon.totalUsageLimit ?? '');
    setPerCustomerLimit(coupon.perCustomerLimit ?? 1);
    setStartDate(coupon.startDate ? coupon.startDate.substring(0, 16) : '');
    setEndDate(coupon.endDate ? coupon.endDate.substring(0, 16) : '');
    setIsActive(coupon.isActive);
    setFormError(null);
    setIsModalOpen(true);
  };

  // Toggle Active
  const handleToggleActive = async (coupon: Coupon) => {
    const nextState = !coupon.isActive;
    const res = await toggleAdminCouponActive(coupon.id, nextState);
    if (res.success) {
      setCoupons((prev) =>
        prev.map((c) => (c.id === coupon.id ? { ...c, isActive: nextState } : c))
      );
    } else {
      alert(res.error || 'Failed to update coupon status.');
    }
  };

  // Delete Coupon
  const handleDelete = async (coupon: Coupon) => {
    if (!confirm(`Are you sure you want to delete coupon '${coupon.code}'?`)) {
      return;
    }
    const res = await deleteAdminCoupon(coupon.id);
    if (res.success) {
      setCoupons((prev) => prev.filter((c) => c.id !== coupon.id));
    } else {
      alert(res.error || 'Failed to delete coupon.');
    }
  };

  // Save Coupon (Create or Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (discountValue === '' || Number(discountValue) <= 0) {
      setFormError('Discount value must be greater than zero.');
      return;
    }
    if (discountType === 'percentage' && Number(discountValue) > 100) {
      setFormError('Percentage discount cannot exceed 100%.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingCoupon) {
        // Update
        const res = await updateAdminCoupon(editingCoupon.id, {
          discountType,
          discountValue: Number(discountValue),
          minOrderAmount: minOrderAmount === '' ? 0 : Number(minOrderAmount),
          maxDiscountAmount: maxDiscountAmount === '' ? null : Number(maxDiscountAmount),
          totalUsageLimit: totalUsageLimit === '' ? null : Number(totalUsageLimit),
          perCustomerLimit: perCustomerLimit === '' ? 1 : Number(perCustomerLimit),
          startDate: startDate ? new Date(startDate).toISOString() : null,
          endDate: endDate ? new Date(endDate).toISOString() : null,
          isActive,
        });

        if (res.success) {
          setCoupons((prev) =>
            prev.map((c) =>
              c.id === editingCoupon.id
                ? {
                    ...c,
                    discountType,
                    discountValue: Number(discountValue),
                    minOrderAmount: minOrderAmount === '' ? 0 : Number(minOrderAmount),
                    maxDiscountAmount: maxDiscountAmount === '' ? null : Number(maxDiscountAmount),
                    totalUsageLimit: totalUsageLimit === '' ? null : Number(totalUsageLimit),
                    perCustomerLimit: perCustomerLimit === '' ? 1 : Number(perCustomerLimit),
                    startDate: startDate ? new Date(startDate).toISOString() : null,
                    endDate: endDate ? new Date(endDate).toISOString() : null,
                    isActive,
                  }
                : c
            )
          );
          setIsModalOpen(false);
        } else {
          setFormError(res.error || 'Failed to update coupon.');
        }
      } else {
        // Create
        const input: CreateCouponInput = {
          code: code.trim().toUpperCase(),
          discountType,
          discountValue: Number(discountValue),
          minOrderAmount: minOrderAmount === '' ? 0 : Number(minOrderAmount),
          maxDiscountAmount: maxDiscountAmount === '' ? null : Number(maxDiscountAmount),
          totalUsageLimit: totalUsageLimit === '' ? null : Number(totalUsageLimit),
          perCustomerLimit: perCustomerLimit === '' ? 1 : Number(perCustomerLimit),
          startDate: startDate ? new Date(startDate).toISOString() : null,
          endDate: endDate ? new Date(endDate).toISOString() : null,
          isActive,
        };

        const res = await createAdminCoupon(input);
        if (res.success && res.coupon) {
          setCoupons((prev) => [res.coupon!, ...prev]);
          setIsModalOpen(false);
        } else {
          setFormError(res.error || 'Failed to create coupon.');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered List
  const filteredCoupons = coupons.filter((c) => {
    const matchesSearch = c.code.toLowerCase().includes(search.toLowerCase());
    const matchesType =
      filterType === 'all'
        ? true
        : filterType === 'active'
        ? c.isActive
        : !c.isActive;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
            <input
              type="text"
              placeholder="Search coupon code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-neutral-900 border border-neutral-800 rounded text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-luxury-gold"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-300 focus:outline-none focus:border-luxury-gold"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-luxury-gold text-neutral-950 rounded font-semibold text-sm hover:bg-luxury-gold-light transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>New Coupon</span>
        </button>
      </div>

      {/* Coupons Table */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-neutral-300">
            <thead className="bg-neutral-950/80 text-xs uppercase tracking-wider text-neutral-400 border-b border-neutral-800">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Coupon Code</th>
                <th className="px-4 py-3.5 font-semibold">Discount</th>
                <th className="px-4 py-3.5 font-semibold">Min Order</th>
                <th className="px-4 py-3.5 font-semibold">Redemptions</th>
                <th className="px-4 py-3.5 font-semibold">Validity</th>
                <th className="px-4 py-3.5 font-semibold">Status</th>
                <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {filteredCoupons.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-neutral-500">
                    <Tag className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No promotional coupons found.
                  </td>
                </tr>
              ) : (
                filteredCoupons.map((coupon) => {
                  const now = Date.now();
                  const isExpired = coupon.endDate && new Date(coupon.endDate).getTime() < now;
                  const isScheduled = coupon.startDate && new Date(coupon.startDate).getTime() > now;

                  return (
                    <tr key={coupon.id} className="hover:bg-neutral-800/30 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white bg-neutral-950 px-2.5 py-1 rounded border border-neutral-800 text-xs">
                            {coupon.code}
                          </span>
                          <button
                            onClick={() => handleCopy(coupon.code)}
                            title="Copy Coupon Code"
                            className="text-neutral-500 hover:text-luxury-gold transition-colors"
                          >
                            {copiedCode === coupon.code ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-luxury-gold/15 text-luxury-gold border border-luxury-gold/30">
                          {coupon.discountType === 'percentage'
                            ? `${coupon.discountValue}% OFF`
                            : `${formatCurrency(coupon.discountValue)} OFF`}
                        </span>
                        {coupon.maxDiscountAmount && (
                          <div className="text-[11px] text-neutral-400 mt-0.5">
                            Up to {formatCurrency(coupon.maxDiscountAmount)}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-4 text-xs">
                        {coupon.minOrderAmount > 0 ? (
                          <span>{formatCurrency(coupon.minOrderAmount)}</span>
                        ) : (
                          <span className="text-neutral-500">No minimum</span>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1 text-xs">
                          <span className="font-medium text-white">
                            {coupon.usageCount}{' '}
                            <span className="text-neutral-500 font-normal">
                              / {coupon.totalUsageLimit ? coupon.totalUsageLimit : '∞'} used
                            </span>
                          </span>
                          {coupon.totalUsageLimit && (
                            <div className="w-24 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-luxury-gold rounded-full"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (coupon.usageCount / coupon.totalUsageLimit) * 100
                                  )}%`,
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-xs text-neutral-400">
                        {isExpired ? (
                          <span className="text-red-400 font-medium flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Expired
                          </span>
                        ) : isScheduled ? (
                          <span className="text-amber-400 font-medium flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Scheduled
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-medium flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Active
                          </span>
                        )}
                        {coupon.endDate && (
                          <div className="text-[11px] text-neutral-500 mt-0.5">
                            Until {new Date(coupon.endDate).toLocaleDateString('en-LK')}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <button
                          onClick={() => handleToggleActive(coupon)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            coupon.isActive ? 'bg-luxury-gold' : 'bg-neutral-800'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                              coupon.isActive ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(coupon)}
                            className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors"
                            title="Edit Coupon"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(coupon)}
                            className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-neutral-800 rounded transition-colors"
                            title="Delete Coupon"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h2 className="text-lg font-serif font-bold text-white flex items-center gap-2">
                <Tag className="h-5 w-5 text-luxury-gold" />
                {editingCoupon ? 'Edit Coupon Code' : 'Create New Promotional Coupon'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-950/60 border border-red-800 rounded text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Code */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Coupon Code
                </label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingCoupon)}
                  placeholder="e.g. LUXURY10 or FESTIVE2026"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white font-mono placeholder-neutral-600 focus:outline-none focus:border-luxury-gold uppercase disabled:opacity-60"
                />
              </div>

              {/* Discount Type & Value */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Discount Type
                  </label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (LKR)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    {discountType === 'percentage' ? 'Percentage (1-100%)' : 'Discount Amount (Rs.)'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={discountType === 'percentage' ? '100' : undefined}
                    step={discountType === 'percentage' ? '1' : '50'}
                    required
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
                  />
                </div>
              </div>

              {/* Min Order & Max Discount */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Min Order Spend (Rs.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0 = No limit"
                    value={minOrderAmount}
                    onChange={(e) => setMinOrderAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
                  />
                </div>

                {discountType === 'percentage' ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Max Discount Cap (Rs.)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="Optional cap"
                      value={maxDiscountAmount}
                      onChange={(e) => setMaxDiscountAmount(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Per-Customer Limit
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={perCustomerLimit}
                      onChange={(e) => setPerCustomerLimit(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
                    />
                  </div>
                )}
              </div>

              {/* Total Usage Limit */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  Total Redemption Limit
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="Leave empty for unlimited redemptions"
                  value={totalUsageLimit}
                  onChange={(e) => setTotalUsageLimit(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-sm text-white focus:outline-none focus:border-luxury-gold"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Start Date (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-xs text-white focus:outline-none focus:border-luxury-gold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                    Expiration Date (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-xs text-white focus:outline-none focus:border-luxury-gold"
                  />
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-neutral-300">Set Coupon Active Immediately</span>
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isActive ? 'bg-luxury-gold' : 'bg-neutral-800'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      isActive ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-neutral-800 text-neutral-300 rounded text-sm hover:bg-neutral-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-luxury-gold text-neutral-950 font-semibold rounded text-sm hover:bg-luxury-gold-light transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Coupon'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
