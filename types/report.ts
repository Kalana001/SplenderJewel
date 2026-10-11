export interface SalesReportMetrics {
  totalRevenue: number;
  totalCollected: number;
  totalOrders: number;
  averageOrderValue: number;
  totalCost: number;
  grossProfit: number;
  grossMarginPercent: number;
  orderCountByStatus: Record<string, number>;
  revenueByPaymentMethod: {
    cod: { count: number; revenue: number };
    bankTransfer: { count: number; revenue: number };
  };
  topDistricts: Array<{ district: string; orderCount: number; revenue: number }>;
  topProducts: Array<{
    productId: string;
    productName: string;
    unitsSold: number;
    revenue: number;
    profit: number;
  }>;
}

export type ReportTimeRange = '7d' | '30d' | '90d' | 'all';
