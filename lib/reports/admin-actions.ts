'use server';

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/auth/server';
import type { SalesReportMetrics, ReportTimeRange } from '@/types/report';
import { ORDER_STATUSES, PAYMENT_STATUSES, PAYMENT_METHODS } from '@/lib/config/constants';

export async function getAdminSalesReport(timeRange: ReportTimeRange = '30d'): Promise<{
  success: boolean;
  metrics: SalesReportMetrics;
  error?: string;
}> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    let query = (adminClient.from('orders') as any)
      .select(`
        id,
        order_number,
        subtotal,
        delivery_fee,
        discount_amount,
        total_amount,
        payment_method,
        payment_status,
        order_status,
        district,
        created_at,
        order_items (
          id,
          product_id,
          product_name,
          quantity,
          unit_price,
          total_price,
          purchase_cost
        )
      `);

    // Date filtering
    if (timeRange !== 'all') {
      const now = new Date();
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', startDate);
    }

    const { data: orders, error } = await query;
    if (error) {
      return {
        success: false,
        metrics: {
          totalRevenue: 0,
          totalCollected: 0,
          totalOrders: 0,
          averageOrderValue: 0,
          totalCost: 0,
          grossProfit: 0,
          grossMarginPercent: 0,
          orderCountByStatus: {},
          revenueByPaymentMethod: {
            cod: { count: 0, revenue: 0 },
            bankTransfer: { count: 0, revenue: 0 },
          },
          topDistricts: [],
          topProducts: [],
        },
        error: error.message,
      };
    }

    let totalRevenue = 0;
    let totalCollected = 0;
    let totalOrders = 0;
    let totalCost = 0;

    const orderCountByStatus: Record<string, number> = {
      [ORDER_STATUSES.PENDING]: 0,
      [ORDER_STATUSES.CONFIRMED]: 0,
      [ORDER_STATUSES.PROCESSING]: 0,
      [ORDER_STATUSES.SHIPPED]: 0,
      [ORDER_STATUSES.DELIVERED]: 0,
      [ORDER_STATUSES.CANCELLED]: 0,
    };

    const revenueByPaymentMethod = {
      cod: { count: 0, revenue: 0 },
      bankTransfer: { count: 0, revenue: 0 },
    };

    const districtMap: Record<string, { count: number; revenue: number }> = {};
    const productMap: Record<
      string,
      { name: string; units: number; revenue: number; cost: number }
    > = {};

    for (const order of orders || []) {
      const isCancelled = order.order_status === ORDER_STATUSES.CANCELLED;
      const orderTotal = Number(order.total_amount) || 0;

      // Status counter
      if (orderCountByStatus[order.order_status] !== undefined) {
        orderCountByStatus[order.order_status]++;
      } else {
        orderCountByStatus[order.order_status] = 1;
      }

      // If cancelled, do not count towards revenue, metrics, or profit
      if (isCancelled) continue;

      totalOrders++;
      totalRevenue += orderTotal;

      // Payment verification / collected calculations
      const isVerified =
        order.payment_status === PAYMENT_STATUSES.VERIFIED ||
        (order.payment_method === PAYMENT_METHODS.COD &&
          order.order_status === ORDER_STATUSES.DELIVERED);

      if (isVerified) {
        totalCollected += orderTotal;
      }

      // Payment method breakdown
      if (order.payment_method === PAYMENT_METHODS.COD) {
        revenueByPaymentMethod.cod.count++;
        revenueByPaymentMethod.cod.revenue += orderTotal;
      } else if (order.payment_method === PAYMENT_METHODS.BANK_TRANSFER) {
        revenueByPaymentMethod.bankTransfer.count++;
        revenueByPaymentMethod.bankTransfer.revenue += orderTotal;
      }

      // District breakdown
      const dist = order.district || 'Unspecified';
      if (!districtMap[dist]) {
        districtMap[dist] = { count: 0, revenue: 0 };
      }
      districtMap[dist].count++;
      districtMap[dist].revenue += orderTotal;

      // Order items financial & product calculations
      for (const item of order.order_items || []) {
        const qty = Number(item.quantity) || 1;
        const purchaseCost = Number(item.purchase_cost) || 0;
        const itemRevenue = Number(item.total_price) || Number(item.unit_price) * qty;

        totalCost += purchaseCost * qty;

        const pId = item.product_id || 'unknown';
        const pName = item.product_name || 'Jewelry Piece';

        if (!productMap[pId]) {
          productMap[pId] = { name: pName, units: 0, revenue: 0, cost: 0 };
        }
        productMap[pId].units += qty;
        productMap[pId].revenue += itemRevenue;
        productMap[pId].cost += purchaseCost * qty;
      }
    }

    const grossProfit = totalRevenue - totalCost;
    const grossMarginPercent =
      totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0;
    const averageOrderValue =
      totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    // Top districts sorted by revenue
    const topDistricts = Object.entries(districtMap)
      .map(([district, data]) => ({
        district,
        orderCount: data.count,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Top products sorted by units sold
    const topProducts = Object.entries(productMap)
      .map(([productId, data]) => ({
        productId,
        productName: data.name,
        unitsSold: data.units,
        revenue: data.revenue,
        profit: data.revenue - data.cost,
      }))
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 8);

    return {
      success: true,
      metrics: {
        totalRevenue,
        totalCollected,
        totalOrders,
        averageOrderValue,
        totalCost,
        grossProfit,
        grossMarginPercent,
        orderCountByStatus,
        revenueByPaymentMethod,
        topDistricts,
        topProducts,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      metrics: {
        totalRevenue: 0,
        totalCollected: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        totalCost: 0,
        grossProfit: 0,
        grossMarginPercent: 0,
        orderCountByStatus: {},
        revenueByPaymentMethod: {
          cod: { count: 0, revenue: 0 },
          bankTransfer: { count: 0, revenue: 0 },
        },
        topDistricts: [],
        topProducts: [],
      },
      error: err.message || 'Failed to generate sales report.',
    };
  }
}
