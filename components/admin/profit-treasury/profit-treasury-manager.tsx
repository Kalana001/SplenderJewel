'use client';

import React, { useState } from 'react';
import {
  Banknote,
  TrendingUp,
  CreditCard,
  Plus,
  Trash2,
  Calendar,
  Layers,
  ArrowDownRight,
  ShieldCheck,
  AlertTriangle,
  X,
  Loader2,
  PieChart,
  Check,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/config/store';
import type {
  ProfitTreasuryData,
  ProfitTimeFilter,
  ProfitCategory,
} from '@/types/profit-treasury';
import {
  getAdminProfitTreasuryData,
  updateProfitCategoriesAction,
  logProfitExpenseAction,
  deleteProfitExpenseAction,
} from '@/lib/profit-treasury/admin-actions';

interface ProfitTreasuryManagerProps {
  initialData: ProfitTreasuryData;
}

export function ProfitTreasuryManager({ initialData }: ProfitTreasuryManagerProps) {
  const [data, setData] = useState<ProfitTreasuryData>(initialData);
  const [timeFilter, setTimeFilter] = useState<ProfitTimeFilter>(initialData.timeFilter);
  const [isLoadingFilter, setIsLoadingFilter] = useState(false);

  // Modal 1: Log Expense
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [expenseAmount, setExpenseAmount] = useState<string>('');
  const [expenseDescription, setExpenseDescription] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);

  // Modal 2: Edit Categories & Allocations
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategories, setEditingCategories] = useState<
    { id?: string; name: string; percentage: number; color: string }[]
  >([]);
  const [isSubmittingCategories, setIsSubmittingCategories] = useState(false);
  const [categoryModalError, setCategoryModalError] = useState<string | null>(null);

  // Handle Time Filter Change
  const handleFilterChange = async (newFilter: ProfitTimeFilter) => {
    setTimeFilter(newFilter);
    setIsLoadingFilter(true);
    try {
      const res = await getAdminProfitTreasuryData(newFilter);
      if (res.success && res.data) {
        setData(res.data);
      }
    } finally {
      setIsLoadingFilter(false);
    }
  };

  // Open Log Expense Modal
  const openExpenseModal = (preselectedCatId?: string) => {
    const catId = preselectedCatId || data.categoriesSummary[0]?.category.id || '';
    setSelectedCategoryId(catId);
    setExpenseAmount('');
    setExpenseDescription('');
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setExpenseError(null);
    setIsExpenseModalOpen(true);
  };

  // Submit Expense
  const handleLogExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(expenseAmount);
    if (isNaN(num) || num <= 0) {
      setExpenseError('Please enter a valid expense amount greater than 0.');
      return;
    }
    if (!expenseDescription.trim()) {
      setExpenseError('Please enter a description or reason for this expense.');
      return;
    }

    setIsSubmittingExpense(true);
    setExpenseError(null);
    try {
      const res = await logProfitExpenseAction({
        categoryId: selectedCategoryId,
        amount: num,
        description: expenseDescription.trim(),
        date: expenseDate,
      });

      if (res.success) {
        setIsExpenseModalOpen(false);
        // Refresh data
        const refreshed = await getAdminProfitTreasuryData(timeFilter);
        if (refreshed.success && refreshed.data) {
          setData(refreshed.data);
        }
      } else {
        setExpenseError(res.error || 'Failed to record expense.');
      }
    } catch {
      setExpenseError('An unexpected error occurred while saving the expense.');
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  // Open Edit Categories Modal
  const openCategoryModal = () => {
    setEditingCategories(
      data.categoriesSummary.map((cs) => ({
        id: cs.category.id,
        name: cs.category.name,
        percentage: cs.category.percentage,
        color: cs.category.color,
      }))
    );
    setCategoryModalError(null);
    setIsCategoryModalOpen(true);
  };

  // Add new row in categories modal
  const handleAddCategoryRow = () => {
    const defaultColors = ['#d4af37', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
    const nextColor = defaultColors[editingCategories.length % defaultColors.length];
    setEditingCategories((prev) => [
      ...prev,
      {
        name: '',
        percentage: 0,
        color: nextColor,
      },
    ]);
  };

  // Remove row in categories modal
  const handleRemoveCategoryRow = (index: number) => {
    setEditingCategories((prev) => prev.filter((_, i) => i !== index));
  };

  // Live sum of editing percentages
  const totalEditingPercentage = editingCategories.reduce(
    (sum, c) => sum + (Number(c.percentage) || 0),
    0
  );

  // Submit Categories
  const handleCategoriesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalEditingPercentage > 100) {
      setCategoryModalError(
        `Total percentage (${totalEditingPercentage}%) exceeds the 100% maximum limit.`
      );
      return;
    }

    setIsSubmittingCategories(true);
    setCategoryModalError(null);
    try {
      const res = await updateProfitCategoriesAction(editingCategories);
      if (res.success) {
        setIsCategoryModalOpen(false);
        const refreshed = await getAdminProfitTreasuryData(timeFilter);
        if (refreshed.success && refreshed.data) {
          setData(refreshed.data);
        }
      } else {
        setCategoryModalError(res.error || 'Failed to save categories.');
      }
    } catch {
      setCategoryModalError('An unexpected error occurred while saving categories.');
    } finally {
      setIsSubmittingCategories(false);
    }
  };

  // Delete an expense
  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm('Are you sure you want to delete this expense record? The allocated balance will be restored.')) {
      return;
    }
    const res = await deleteProfitExpenseAction(expenseId);
    if (res.success) {
      const refreshed = await getAdminProfitTreasuryData(timeFilter);
      if (refreshed.success && refreshed.data) {
        setData(refreshed.data);
      }
    } else {
      alert(res.error || 'Failed to delete expense.');
    }
  };

  const selectedCategorySummary = data.categoriesSummary.find(
    (cs) => cs.category.id === selectedCategoryId
  );

  return (
    <div className="space-y-8">
      {/* 1. Header & Time Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-luxury-gold/15 text-luxury-gold text-xs uppercase tracking-wider font-semibold mb-2">
            <Banknote className="h-3.5 w-3.5" />
            <span>Splender Jewel — Financial Treasury</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            Profit Allocation &amp; Treasury
          </h1>
          <p className="text-xs text-neutral-400 mt-1 max-w-2xl">
            Realized product gross profit distribution across dedicated funds (COD settled &amp; verified bank transfers only).
          </p>
        </div>

        {/* Time Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { label: 'All Time', value: 'all' },
              { label: 'This Month', value: 'this_month' },
              { label: 'Last Month', value: 'last_month' },
              { label: 'Year to Date', value: 'ytd' },
            ] as const
          ).map((t) => (
            <button
              key={t.value}
              type="button"
              disabled={isLoadingFilter}
              onClick={() => handleFilterChange(t.value)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                timeFilter === t.value
                  ? 'bg-luxury-gold text-neutral-950 font-bold shadow-md'
                  : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
              }`}
            >
              {t.label}
            </button>
          ))}
          {isLoadingFilter && <Loader2 className="h-4 w-4 animate-spin text-luxury-gold ml-1" />}
        </div>
      </div>

      {/* 2. Top 4 Primary KPI Treasury Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Realized Gross Profit (Option A) */}
        <div className="bg-neutral-900/90 border border-luxury-gold/40 rounded-lg p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-300 font-medium">Realized Product Profit</span>
            <div className="p-1.5 rounded bg-luxury-gold/20 text-luxury-gold">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-luxury-gold font-mono">
            {formatCurrency(data.realizedProductProfit)}
          </p>
          <span className="text-[11px] text-emerald-400 font-medium block">
            ✓ Selling Price − Purchase Cost ({data.verifiedOrderCount} verified orders)
          </span>
        </div>

        {/* Total Profit Spent / Drawn */}
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-rose-400 font-medium">Total Profit Spent</span>
            <div className="p-1.5 rounded bg-rose-950/60 text-rose-400">
              <ArrowDownRight className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-rose-300 font-mono">
            {formatCurrency(data.totalSpent)}
          </p>
          <span className="text-[11px] text-neutral-500 block">
            Across {data.recentExpenses.length} logged disbursements
          </span>
        </div>

        {/* Current Treasury Balance */}
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-400 font-medium">Available Treasury Pool</span>
            <div className="p-1.5 rounded bg-emerald-950/60 text-emerald-400">
              <Banknote className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-emerald-300 font-mono">
            {formatCurrency(data.treasuryBalance)}
          </p>
          <span className="text-[11px] text-neutral-500 block">
            Unspent realized net profit
          </span>
        </div>

        {/* Allocation Status */}
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400 font-medium">Allocation Status</span>
            <div className="p-1.5 rounded bg-neutral-800 text-neutral-300">
              <PieChart className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-white font-mono">
            {data.totalAllocatedPercentage}%
          </p>
          <span
            className={`text-[11px] font-semibold block ${
              data.totalAllocatedPercentage === 100
                ? 'text-emerald-400'
                : 'text-amber-400'
            }`}
          >
            {data.totalAllocatedPercentage === 100
              ? '✓ 100% Fully Allocated'
              : `• ${data.unallocatedPercentage}% Unallocated`}
          </span>
        </div>
      </div>

      {/* 3. Category Allocations & Fund Balances Table */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-neutral-800 pb-3">
          <div>
            <h2 className="font-serif font-bold text-white text-base sm:text-lg flex items-center gap-2">
              <Layers className="h-4 w-4 text-luxury-gold" />
              <span>Category Profit Allocations &amp; Fund Balances</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Each category receives its configured percentage share of the realized profit.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={openCategoryModal}
              className="text-xs border-neutral-700 bg-neutral-900 hover:border-luxury-gold hover:text-luxury-gold"
            >
              <span>Edit Allocations (%)</span>
            </Button>
            <Button
              size="sm"
              onClick={() => openExpenseModal()}
              className="text-xs bg-luxury-gold text-neutral-950 hover:bg-luxury-gold/90 font-bold flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Log Expense / Draw</span>
            </Button>
          </div>
        </div>

        {/* Category Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-400 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3">Fund / Category</th>
                <th className="py-3 px-3">Share (%)</th>
                <th className="py-3 px-3">Allocated Amount</th>
                <th className="py-3 px-3">Total Spent</th>
                <th className="py-3 px-3">Available Balance</th>
                <th className="py-3 px-3">Utilization</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
              {data.categoriesSummary.map((cs) => {
                const isOverspent = cs.remainingBalance < 0;
                return (
                  <tr key={cs.category.id} className="hover:bg-neutral-800/30 transition-colors">
                    {/* Category Name & Color Tag */}
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: cs.category.color }}
                        />
                        <span className="font-semibold text-white">
                          {cs.category.name}
                        </span>
                      </div>
                    </td>

                    {/* Percentage */}
                    <td className="py-3.5 px-3">
                      <Badge
                        variant="outline"
                        className="border-neutral-700 bg-neutral-950 font-mono font-bold text-luxury-gold"
                      >
                        {cs.category.percentage}%
                      </Badge>
                    </td>

                    {/* Allocated Amount */}
                    <td className="py-3.5 px-3 font-mono font-semibold text-white">
                      {formatCurrency(cs.allocatedAmount)}
                    </td>

                    {/* Total Spent */}
                    <td className="py-3.5 px-3 font-mono text-rose-400">
                      {formatCurrency(cs.spentAmount)}
                    </td>

                    {/* Remaining Available Balance */}
                    <td className="py-3.5 px-3 font-mono font-bold">
                      <span className={isOverspent ? 'text-rose-500' : 'text-emerald-400'}>
                        {formatCurrency(cs.remainingBalance)}
                      </span>
                    </td>

                    {/* Utilization Progress Bar */}
                    <td className="py-3.5 px-3 min-w-[120px]">
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[10px] text-neutral-400">
                          <span>{cs.utilizationPercent}% spent</span>
                        </div>
                        <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-300 ${
                              isOverspent
                                ? 'bg-rose-500'
                                : cs.utilizationPercent > 80
                                ? 'bg-amber-400'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(cs.utilizationPercent, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openExpenseModal(cs.category.id)}
                        className="h-7 px-2 text-[11px] border-neutral-700 bg-neutral-900 hover:border-luxury-gold hover:text-luxury-gold"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        <span>Log Spend</span>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Category-Wise Spending Visual Breakdown */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-5 sm:p-6 space-y-4">
        <h3 className="font-serif font-bold text-white text-base flex items-center gap-2 border-b border-neutral-800 pb-3">
          <CreditCard className="h-4 w-4 text-luxury-gold" />
          <span>Category Spending Distribution</span>
        </h3>

        {data.totalSpent === 0 ? (
          <p className="text-xs text-neutral-500 py-6 text-center">
            No expenses or profit drawings have been recorded yet.
          </p>
        ) : (
          <div className="space-y-3 pt-1">
            {data.categoriesSummary
              .filter((cs) => cs.spentAmount > 0)
              .sort((a, b) => b.spentAmount - a.spentAmount)
              .map((cs) => {
                const spentShare =
                  data.totalSpent > 0
                    ? Math.round((cs.spentAmount / data.totalSpent) * 100)
                    : 0;
                return (
                  <div key={cs.category.id} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: cs.category.color }}
                        />
                        <span className="font-medium text-white">{cs.category.name}</span>
                      </div>
                      <span className="font-mono text-neutral-300">
                        {formatCurrency(cs.spentAmount)}{' '}
                        <span className="text-neutral-500">({spentShare}% of all spend)</span>
                      </span>
                    </div>
                    <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full transition-all duration-500"
                        style={{
                          width: `${spentShare}%`,
                          backgroundColor: cs.category.color || '#d4af37',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* 5. Recent Expenses Audit History */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <h3 className="font-serif font-bold text-white text-base flex items-center gap-2">
            <History className="h-4 w-4 text-luxury-gold" />
            <span>Recent Expense &amp; Disbursement History</span>
          </h3>
          <span className="text-xs text-neutral-400">
            {data.recentExpenses.length} entries
          </span>
        </div>

        {data.recentExpenses.length === 0 ? (
          <p className="text-xs text-neutral-500 py-6 text-center">
            No expenses logged yet. Click &quot;Log Expense / Draw&quot; above to record spending.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Description / Purpose</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
                {data.recentExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-neutral-800/30 transition-colors">
                    <td className="py-3 px-3 font-mono text-neutral-400 whitespace-nowrap">
                      {exp.date}
                    </td>
                    <td className="py-3 px-3 font-medium text-white">
                      {exp.categoryName}
                    </td>
                    <td className="py-3 px-3 text-neutral-300">
                      {exp.description}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-rose-400">
                      -{formatCurrency(exp.amount)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteExpense(exp.id)}
                        className="h-7 px-2 text-xs border-neutral-800 text-neutral-500 hover:text-rose-400 hover:border-rose-800"
                        title="Delete expense entry"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 1: LOG EXPENSE / WITHDRAWAL                             */}
      {/* ───────────────────────────────────────────────────────────── */}
      {isExpenseModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-base font-serif font-semibold text-white">
                  Log Expense / Profit Disbursement
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Record funds spent or drawn from an allocated profit category.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsExpenseModalOpen(false)}
                className="text-neutral-400 hover:text-white p-1 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {expenseError && (
              <div className="p-3 rounded bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
                {expenseError}
              </div>
            )}

            <form onSubmit={handleLogExpenseSubmit} className="space-y-4 text-xs">
              {/* Category Select */}
              <div className="space-y-1.5">
                <label className="text-neutral-300 font-semibold block">Select Category</label>
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-xs text-white focus:border-luxury-gold focus:outline-none"
                >
                  {data.categoriesSummary.map((cs) => (
                    <option key={cs.category.id} value={cs.category.id}>
                      {cs.category.name} (Available: {formatCurrency(cs.remainingBalance)})
                    </option>
                  ))}
                </select>
                {selectedCategorySummary && (
                  <p className="text-[11px] text-neutral-400 pt-0.5">
                    Available in fund:{' '}
                    <span className="text-emerald-400 font-bold font-mono">
                      {formatCurrency(selectedCategorySummary.remainingBalance)}
                    </span>
                  </p>
                )}
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <label className="text-neutral-300 font-semibold block">Amount (LKR)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  required
                  className="bg-neutral-950 border-neutral-800 text-white font-mono"
                />
              </div>

              {/* Expense Date */}
              <div className="space-y-1.5">
                <label className="text-neutral-300 font-semibold block">Date of Expense</label>
                <Input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  required
                  className="bg-neutral-950 border-neutral-800 text-white"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-neutral-300 font-semibold block">Description / Purpose</label>
                <Input
                  type="text"
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                  placeholder="e.g. Meta Instagram Ads campaign, Jewelry packaging"
                  required
                  className="bg-neutral-950 border-neutral-800 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsExpenseModalOpen(false)}
                  disabled={isSubmittingExpense}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmittingExpense}
                  className="text-xs bg-luxury-gold text-neutral-950 font-bold hover:bg-luxury-gold/90"
                >
                  {isSubmittingExpense ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      Saving...
                    </>
                  ) : (
                    'Record Expense'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* MODAL 2: EDIT CATEGORIES & PERCENTAGE ALLOCATIONS             */}
      {/* ───────────────────────────────────────────────────────────── */}
      {isCategoryModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 max-w-xl w-full shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-base font-serif font-semibold text-white">
                  Manage Categories &amp; Percentage Allocations
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Configure allocation percentages. Total across all categories cannot exceed 100%.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-neutral-400 hover:text-white p-1 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Total Percentage Status Bar */}
            <div
              className={`p-3 rounded border text-xs flex items-center justify-between font-semibold ${
                totalEditingPercentage === 100
                  ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                  : totalEditingPercentage < 100
                  ? 'bg-amber-950/40 border-amber-800 text-amber-300'
                  : 'bg-rose-950/40 border-rose-800 text-rose-300'
              }`}
            >
              <span>Total Allocation: {totalEditingPercentage}% / 100%</span>
              <span>
                {totalEditingPercentage === 100
                  ? '✓ Exactly 100%'
                  : totalEditingPercentage < 100
                  ? `${100 - totalEditingPercentage}% Remaining (Unallocated)`
                  : '⚠️ Exceeds 100% Maximum Limit'}
              </span>
            </div>

            {categoryModalError && (
              <div className="p-3 rounded bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
                {categoryModalError}
              </div>
            )}

            <form onSubmit={handleCategoriesSubmit} className="space-y-4 text-xs">
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {editingCategories.map((cat, idx) => (
                  <div
                    key={cat.id || idx}
                    className="flex items-center gap-2 p-2 rounded bg-neutral-950 border border-neutral-800"
                  >
                    <input
                      type="color"
                      value={cat.color}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditingCategories((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, color: val } : c))
                        );
                      }}
                      className="w-7 h-7 rounded border-0 bg-transparent cursor-pointer flex-shrink-0"
                      title="Select category color"
                    />

                    <Input
                      type="text"
                      value={cat.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditingCategories((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, name: val } : c))
                        );
                      }}
                      placeholder="Category Name"
                      required
                      className="bg-neutral-900 border-neutral-800 text-white text-xs h-8 flex-1"
                    />

                    <div className="flex items-center gap-1 w-24">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={cat.percentage}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setEditingCategories((prev) =>
                            prev.map((c, i) => (i === idx ? { ...c, percentage: val } : c))
                          );
                        }}
                        required
                        className="bg-neutral-900 border-neutral-800 text-white font-mono text-xs h-8 w-16 text-right"
                      />
                      <span className="text-neutral-400 font-bold">%</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveCategoryRow(idx)}
                      disabled={editingCategories.length <= 1}
                      className="p-1.5 text-neutral-500 hover:text-rose-400 disabled:opacity-30 transition-colors"
                      title="Delete category"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCategoryRow}
                  className="text-xs border-dashed border-neutral-700 bg-neutral-950 hover:border-luxury-gold hover:text-luxury-gold w-full"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  <span>Add Another Category</span>
                </Button>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCategoryModalOpen(false)}
                  disabled={isSubmittingCategories}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmittingCategories || totalEditingPercentage > 100}
                  className="text-xs bg-luxury-gold text-neutral-950 font-bold hover:bg-luxury-gold/90 disabled:opacity-50"
                >
                  {isSubmittingCategories ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      Saving...
                    </>
                  ) : (
                    'Save Allocations'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
