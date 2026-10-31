export interface ProfitCategory {
  id: string;
  name: string;
  percentage: number; // e.g. 55 for 55%
  color: string; // e.g. '#d4af37'
  createdAt: string;
}

export const DEFAULT_PROFIT_CATEGORIES: ProfitCategory[] = [
  {
    id: 'cat-inv-reinvest',
    name: 'Inventory & Stock Reinvestment',
    percentage: 55,
    color: '#d4af37', // Gold
    createdAt: '2026-10-31T00:00:00.000Z',
  },
  {
    id: 'cat-marketing',
    name: 'Marketing & Advertisements',
    percentage: 15,
    color: '#3b82f6', // Blue
    createdAt: '2026-10-31T00:00:00.000Z',
  },
  {
    id: 'cat-owner-draw',
    name: 'Owner Drawings / Profit',
    percentage: 10,
    color: '#10b981', // Emerald
    createdAt: '2026-10-31T00:00:00.000Z',
  },
  {
    id: 'cat-emergency-res',
    name: 'Emergency & Reserve Fund',
    percentage: 10,
    color: '#f59e0b', // Amber
    createdAt: '2026-10-31T00:00:00.000Z',
  },
  {
    id: 'cat-church-fees',
    name: 'Church Fees',
    percentage: 10,
    color: '#8b5cf6', // Purple
    createdAt: '2026-10-31T00:00:00.000Z',
  },
];

export interface ProfitExpense {
  id: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  description: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
}

export interface ProfitCategorySummary {
  category: ProfitCategory;
  allocatedAmount: number;
  spentAmount: number;
  remainingBalance: number;
  utilizationPercent: number;
}

export type ProfitTimeFilter = 'all' | 'this_month' | 'last_month' | 'ytd';

export interface ProfitTreasuryData {
  timeFilter: ProfitTimeFilter;
  realizedProductProfit: number;
  totalSpent: number;
  treasuryBalance: number;
  totalAllocatedPercentage: number;
  unallocatedPercentage: number;
  verifiedOrderCount: number;
  categoriesSummary: ProfitCategorySummary[];
  recentExpenses: ProfitExpense[];
}
