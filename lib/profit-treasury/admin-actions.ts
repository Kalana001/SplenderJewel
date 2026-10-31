'use server';

if (typeof window !== 'undefined') {
  throw new Error(
    '[Security] lib/profit-treasury/admin-actions.ts can only be executed in a server environment.'
  );
}

import { createAdminClient } from '../supabase/admin.ts';
import { requireAdminAuth } from '../auth/server.ts';
import type {
  ProfitCategory,
  ProfitExpense,
  ProfitTimeFilter,
  ProfitTreasuryData,
} from '../../types/profit-treasury.ts';
import { DEFAULT_PROFIT_CATEGORIES } from '../../types/profit-treasury.ts';

async function safeRevalidatePath(path: string) {
  try {
    const nextCache = await import('next/cache');
    if (nextCache && typeof nextCache.revalidatePath === 'function') {
      nextCache.revalidatePath(path);
    }
  } catch {
    // Graceful fallback for non-Next.js test environments
  }
}

const SETTINGS_KEY = 'profit_allocation_treasury';

interface StoredTreasuryPayload {
  categories: ProfitCategory[];
  expenses: ProfitExpense[];
}

/**
 * Calculates start and end timestamps for time filters in Sri Lanka timezone.
 */
function getTimeFilterRange(filter: ProfitTimeFilter): { start?: string; end?: string } {
  if (filter === 'all') return {};

  const now = new Date();
  // Get Colombo year, month, date
  const colomboDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
  const [yearStr, monthStr] = colomboDateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1-12

  if (filter === 'this_month') {
    const startStr = `${year}-${String(month).padStart(2, '0')}-01T00:00:00+05:30`;
    return { start: new Date(startStr).toISOString() };
  }

  if (filter === 'last_month') {
    const lastMonthYear = month === 1 ? year - 1 : year;
    const lastMonth = month === 1 ? 12 : month - 1;
    const startStr = `${lastMonthYear}-${String(lastMonth).padStart(2, '0')}-01T00:00:00+05:30`;
    const endStr = `${year}-${String(month).padStart(2, '0')}-01T00:00:00+05:30`;
    return {
      start: new Date(startStr).toISOString(),
      end: new Date(endStr).toISOString(),
    };
  }

  if (filter === 'ytd') {
    const startStr = `${year}-01-01T00:00:00+05:30`;
    return { start: new Date(startStr).toISOString() };
  }

  return {};
}

/**
 * FETCH PROFIT ALLOCATION & TREASURY DATA
 * Enforces requireAdminAuth()
 * Calculates Option A: Product Gross Profit = Sum of (Item Total - Purchase Cost)
 * for confirmed, verified orders only.
 */
export async function getAdminProfitTreasuryData(
  filter: ProfitTimeFilter = 'all'
): Promise<{ success: boolean; data: ProfitTreasuryData; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    // 1. Load Stored Treasury Categories & Expenses
    const { data: settingsRow } = await (adminClient.from('store_settings') as any)
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();

    const stored: StoredTreasuryPayload = settingsRow?.value || {
      categories: DEFAULT_PROFIT_CATEGORIES,
      expenses: [],
    };

    const categories = stored.categories && stored.categories.length > 0
      ? stored.categories
      : DEFAULT_PROFIT_CATEGORIES;
    const allExpenses = stored.expenses || [];

    // 2. Query Verified Orders with Order Items
    let orderQuery = (adminClient.from('orders') as any)
      .select(`
        id,
        created_at,
        payment_status,
        order_status,
        order_items (
          id,
          product_name,
          quantity,
          unit_price,
          total_price,
          purchase_cost
        )
      `)
      .eq('payment_status', 'verified')
      .not('order_status', 'in', '("cancelled","refunded")');

    const { start, end } = getTimeFilterRange(filter);
    if (start) {
      orderQuery = orderQuery.gte('created_at', start);
    }
    if (end) {
      orderQuery = orderQuery.lt('created_at', end);
    }

    const { data: verifiedOrders, error: orderError } = await orderQuery;

    if (orderError) {
      throw new Error(`Failed to load verified orders: ${orderError.message}`);
    }

    // 3. Calculate Realized Product Profit (Option A)
    let realizedProductProfit = 0;
    const orderCount = verifiedOrders?.length || 0;

    for (const ord of verifiedOrders || []) {
      for (const it of ord.order_items || []) {
        const qty = Number(it.quantity) || 1;
        const itemRevenue = Number(it.total_price) || (Number(it.unit_price) * qty);
        const itemCost = (Number(it.purchase_cost) || 0) * qty;
        const itemProfit = itemRevenue - itemCost;
        realizedProductProfit += itemProfit;
      }
    }

    // If negative or zero, clamp to non-negative for treasury allocation
    if (realizedProductProfit < 0) {
      realizedProductProfit = 0;
    }

    // Filter expenses by date range if applicable
    const filteredExpenses = allExpenses.filter((exp) => {
      if (filter === 'all') return true;
      const expDate = new Date(`${exp.date}T12:00:00+05:30`);
      if (start && expDate < new Date(start)) return false;
      if (end && expDate >= new Date(end)) return false;
      return true;
    });

    // 4. Calculate Category Summaries
    const categoryNameMap = new Map(categories.map((c) => [c.id, c.name]));
    let totalSpent = 0;
    let totalAllocatedPercentage = 0;

    const categoriesSummary = categories.map((cat) => {
      totalAllocatedPercentage += Number(cat.percentage) || 0;
      const allocatedAmount = Math.round(realizedProductProfit * ((Number(cat.percentage) || 0) / 100));

      const catExpenses = filteredExpenses.filter((e) => e.categoryId === cat.id);
      const spentAmount = catExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      totalSpent += spentAmount;

      const remainingBalance = allocatedAmount - spentAmount;
      const utilizationPercent = allocatedAmount > 0
        ? Math.min(Math.round((spentAmount / allocatedAmount) * 100), 100)
        : 0;

      return {
        category: cat,
        allocatedAmount,
        spentAmount,
        remainingBalance,
        utilizationPercent,
      };
    });

    const treasuryBalance = realizedProductProfit - totalSpent;
    const unallocatedPercentage = Math.max(0, 100 - totalAllocatedPercentage);

    // Format recent expenses with category name
    const recentExpenses = filteredExpenses
      .map((e) => ({
        ...e,
        categoryName: categoryNameMap.get(e.categoryId) || 'General Fund',
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);

    return {
      success: true,
      data: {
        timeFilter: filter,
        realizedProductProfit,
        totalSpent,
        treasuryBalance,
        totalAllocatedPercentage,
        unallocatedPercentage,
        verifiedOrderCount: orderCount,
        categoriesSummary,
        recentExpenses,
      },
    };
  } catch (err: unknown) {
    console.error('[ProfitTreasury] Error in getAdminProfitTreasuryData:', err);
    return {
      success: false,
      data: {
        timeFilter: filter,
        realizedProductProfit: 0,
        totalSpent: 0,
        treasuryBalance: 0,
        totalAllocatedPercentage: 100,
        unallocatedPercentage: 0,
        verifiedOrderCount: 0,
        categoriesSummary: [],
        recentExpenses: [],
      },
      error: err instanceof Error ? err.message : 'Failed to retrieve treasury data.',
    };
  }
}

/**
 * UPDATE PROFIT ALLOCATION CATEGORIES & PERCENTAGES
 * Strictly validates that total percentage across all categories <= 100%
 */
export async function updateProfitCategoriesAction(
  categoriesInput: { id?: string; name: string; percentage: number; color?: string }[]
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    // 1. Validation
    if (!Array.isArray(categoriesInput) || categoriesInput.length === 0) {
      return { success: false, error: 'At least one profit category is required.' };
    }

    let totalPercentage = 0;
    const sanitizedCategories: ProfitCategory[] = [];

    const defaultColors = ['#d4af37', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

    for (let i = 0; i < categoriesInput.length; i++) {
      const c = categoriesInput[i];
      const name = c.name.trim();
      const pct = Number(c.percentage);

      if (!name) {
        return { success: false, error: `Category #${i + 1} must have a valid name.` };
      }
      if (isNaN(pct) || pct < 0) {
        return { success: false, error: `Percentage for "${name}" must be a non-negative number.` };
      }

      totalPercentage += pct;

      sanitizedCategories.push({
        id: c.id && c.id.trim() ? c.id.trim() : `cat-${Date.now()}-${i}`,
        name,
        percentage: pct,
        color: c.color && c.color.trim() ? c.color.trim() : defaultColors[i % defaultColors.length],
        createdAt: new Date().toISOString(),
      });
    }

    if (totalPercentage > 100) {
      return {
        success: false,
        error: `Total percentage (${totalPercentage}%) exceeds the 100% maximum limit. Please adjust your percentages.`,
      };
    }

    // 2. Load existing payload to preserve logged expenses
    const { data: settingsRow } = await (adminClient.from('store_settings') as any)
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();

    const existingExpenses: ProfitExpense[] = settingsRow?.value?.expenses || [];

    const newPayload: StoredTreasuryPayload = {
      categories: sanitizedCategories,
      expenses: existingExpenses,
    };

    const { error: upsertError } = await (adminClient.from('store_settings') as any)
      .upsert(
        {
          key: SETTINGS_KEY,
          value: newPayload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    if (upsertError) {
      return { success: false, error: upsertError.message };
    }

    await safeRevalidatePath('/admin/profit-allocation');
    return { success: true };
  } catch (err: unknown) {
    console.error('[ProfitTreasury] Error updating categories:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update profit categories.',
    };
  }
}

/**
 * LOG AN EXPENSE / DISBURSEMENT AGAINST A CATEGORY
 */
export async function logProfitExpenseAction(input: {
  categoryId: string;
  amount: number;
  description: string;
  date: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const { categoryId, amount, description, date } = input;

    if (!categoryId || !categoryId.trim()) {
      return { success: false, error: 'Please select a valid profit category.' };
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return { success: false, error: 'Expense amount must be a positive number.' };
    }

    if (!description || !description.trim()) {
      return { success: false, error: 'Please enter a description or purpose for this expense.' };
    }

    if (!date || !date.trim()) {
      return { success: false, error: 'Please select a valid expense date.' };
    }

    // Load existing settings
    const { data: settingsRow } = await (adminClient.from('store_settings') as any)
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();

    const currentCategories: ProfitCategory[] =
      settingsRow?.value?.categories || DEFAULT_PROFIT_CATEGORIES;
    const currentExpenses: ProfitExpense[] = settingsRow?.value?.expenses || [];

    const targetCategory = currentCategories.find((c) => c.id === categoryId);
    if (!targetCategory) {
      return { success: false, error: 'Selected category does not exist.' };
    }

    const newExpense: ProfitExpense = {
      id: `exp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      categoryId,
      categoryName: targetCategory.name,
      amount: numAmount,
      description: description.trim(),
      date: date.trim(),
      createdAt: new Date().toISOString(),
    };

    const updatedExpenses = [newExpense, ...currentExpenses];

    const { error: upsertError } = await (adminClient.from('store_settings') as any)
      .upsert(
        {
          key: SETTINGS_KEY,
          value: {
            categories: currentCategories,
            expenses: updatedExpenses,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    if (upsertError) {
      return { success: false, error: upsertError.message };
    }

    await safeRevalidatePath('/admin/profit-allocation');
    return { success: true };
  } catch (err: unknown) {
    console.error('[ProfitTreasury] Error logging expense:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to record expense.',
    };
  }
}

/**
 * DELETE / REVERSE AN EXPENSE
 */
export async function deleteProfitExpenseAction(
  expenseId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!expenseId || !expenseId.trim()) {
      return { success: false, error: 'Invalid expense ID.' };
    }

    const { data: settingsRow } = await (adminClient.from('store_settings') as any)
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();

    const currentCategories: ProfitCategory[] =
      settingsRow?.value?.categories || DEFAULT_PROFIT_CATEGORIES;
    const currentExpenses: ProfitExpense[] = settingsRow?.value?.expenses || [];

    const filteredExpenses = currentExpenses.filter((e) => e.id !== expenseId);

    const { error: upsertError } = await (adminClient.from('store_settings') as any)
      .upsert(
        {
          key: SETTINGS_KEY,
          value: {
            categories: currentCategories,
            expenses: filteredExpenses,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    if (upsertError) {
      return { success: false, error: upsertError.message };
    }

    await safeRevalidatePath('/admin/profit-allocation');
    return { success: true };
  } catch (err: unknown) {
    console.error('[ProfitTreasury] Error deleting expense:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete expense.',
    };
  }
}
