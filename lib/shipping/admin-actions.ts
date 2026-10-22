'use server';

import 'server-only';
import { requireAdminAuth } from '@/lib/auth/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ShippingOrderRecord,
  ShippingOrderFilterOptions,
  ExcelExportResult,
} from './types';
import {
  validateOrderForShipping,
  toSriLankaDateString,
  getSriLankaDateString,
} from './utils';
import { exportShippingOrdersToExcel } from './excel-export';
import { ORDER_STATUSES, OrderStatus, PaymentMethod } from '@/lib/config/constants';

/**
 * FETCH CONFIRMED & PROCESSING ORDERS ELIGIBLE FOR SHIPPING LABEL GENERATION
 *
 * Strict Admin Authentication via requireAdminAuth().
 * Business Rules:
 * - Eligible orders: confirmed or processing status.
 * - Cancelled or refunded orders are strictly excluded.
 * - Confirmation date extracted from earliest transition to 'confirmed' or 'processing' in order_status_history.
 * - Each order is evaluated for mandatory shipping data completeness (customer_name, address_line, city, phone1).
 */
export async function getEligibleShippingOrdersAction(
  filters: ShippingOrderFilterOptions = {}
): Promise<{
  success: boolean;
  orders: ShippingOrderRecord[];
  totalEligible: number;
  bankTransferCount: number;
  codCount: number;
  incompleteCount: number;
  error?: string;
}> {
  await requireAdminAuth();
  const adminClient = createAdminClient();

  try {
    // 1. Query orders that are eligible for fulfillment dispatch
    // Do not assume every order is literally named 'confirmed'; also include 'processing'
    let query = (adminClient.from('orders') as any)
      .select(`
        id,
        order_number,
        customer_name,
        email,
        phone1,
        phone2,
        address_line,
        city,
        district,
        province,
        postal_code,
        total_amount,
        payment_method,
        payment_status,
        order_status,
        created_at,
        updated_at,
        order_status_history (
          id,
          new_status,
          created_at
        )
      `)
      .in('order_status', [ORDER_STATUSES.CONFIRMED, ORDER_STATUSES.PROCESSING])
      .not('order_status', 'in', `("${ORDER_STATUSES.CANCELLED}","${ORDER_STATUSES.REFUNDED}")`)
      .order('created_at', { ascending: false });

    // Optional status filter override if specifically requested
    if (filters.status && filters.status !== 'all') {
      query = query.eq('order_status', filters.status);
    }

    // Optional payment method filter at database query level
    if (filters.paymentMethod && filters.paymentMethod !== 'all') {
      query = query.eq('payment_method', filters.paymentMethod);
    }

    const { data: rawOrders, error } = await query;

    if (error) {
      console.error('[ShippingAdminActions] Database query failed:', error.message);
      return {
        success: false,
        orders: [],
        totalEligible: 0,
        bankTransferCount: 0,
        codCount: 0,
        incompleteCount: 0,
        error: 'Failed to retrieve eligible orders from database.',
      };
    }

    const todaySLT = getSriLankaDateString();

    // 2. Map raw records to ShippingOrderRecord with confirmation date & validation
    const mappedOrders: ShippingOrderRecord[] = (rawOrders || []).map((row: any) => {
      // Find confirmation date in order_status_history
      let confirmationDate = row.created_at;
      if (Array.isArray(row.order_status_history) && row.order_status_history.length > 0) {
        // Find earliest confirmed or processing status transition
        const confirmedEntries = row.order_status_history
          .filter(
            (h: any) =>
              h.new_status === ORDER_STATUSES.CONFIRMED ||
              h.new_status === ORDER_STATUSES.PROCESSING
          )
          .sort(
            (a: any, b: any) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );

        if (confirmedEntries.length > 0) {
          confirmationDate = confirmedEntries[0].created_at;
        }
      }

      const validation = validateOrderForShipping({
        customer_name: row.customer_name,
        address_line: row.address_line,
        city: row.city,
        district: row.district,
        phone1: row.phone1,
      });

      return {
        id: row.id,
        order_number: row.order_number,
        customer_name: row.customer_name,
        email: row.email,
        phone1: row.phone1,
        phone2: row.phone2,
        address_line: row.address_line,
        city: row.city,
        district: row.district,
        province: row.province,
        postal_code: row.postal_code,
        total_amount: Number(row.total_amount) || 0,
        payment_method: row.payment_method as PaymentMethod,
        payment_status: row.payment_status,
        order_status: row.order_status as OrderStatus,
        created_at: row.created_at,
        updated_at: row.updated_at,
        confirmation_date: confirmationDate,
        validation,
      };
    });

    // 3. Apply memory filters (Today's SLT filter, Date range, Search query)
    const filteredOrders = mappedOrders.filter((order) => {
      const orderSLTDate = toSriLankaDateString(order.confirmation_date);

      // Today's orders filter (in Sri Lanka local time UTC+05:30)
      if (filters.todayOnly) {
        if (orderSLTDate !== todaySLT) {
          return false;
        }
      }

      // Custom date range filter
      if (filters.startDate && orderSLTDate < filters.startDate) {
        return false;
      }
      if (filters.endDate && orderSLTDate > filters.endDate) {
        return false;
      }

      // Search query (order number, customer name, phone numbers)
      if (filters.searchQuery && filters.searchQuery.trim()) {
        const queryNorm = filters.searchQuery.trim().toLowerCase();
        const matchesNumber = order.order_number.toLowerCase().includes(queryNorm);
        const matchesName = order.customer_name.toLowerCase().includes(queryNorm);
        const matchesPhone1 = order.phone1.toLowerCase().includes(queryNorm);
        const matchesPhone2 = (order.phone2 || '').toLowerCase().includes(queryNorm);
        const matchesCity = (order.city || '').toLowerCase().includes(queryNorm);
        const matchesDistrict = order.district.toLowerCase().includes(queryNorm);

        if (
          !matchesNumber &&
          !matchesName &&
          !matchesPhone1 &&
          !matchesPhone2 &&
          !matchesCity &&
          !matchesDistrict
        ) {
          return false;
        }
      }

      return true;
    });

    // Calculate metrics
    const totalEligible = filteredOrders.length;
    const bankTransferCount = filteredOrders.filter((o) => o.payment_method === 'bank_transfer').length;
    const codCount = filteredOrders.filter((o) => o.payment_method === 'cod').length;
    const incompleteCount = filteredOrders.filter((o) => !o.validation.isValid).length;

    return {
      success: true,
      orders: filteredOrders,
      totalEligible,
      bankTransferCount,
      codCount,
      incompleteCount,
    };
  } catch (err: any) {
    console.error('[ShippingAdminActions] Unexpected error:', err);
    return {
      success: false,
      orders: [],
      totalEligible: 0,
      bankTransferCount: 0,
      codCount: 0,
      incompleteCount: 0,
      error: err.message || 'An unexpected error occurred while fetching eligible orders.',
    };
  }
}

/**
 * EXPORT SELECTED ORDERS TO SRI LANKA POST EXCEL
 *
 * Strict Admin Authentication via requireAdminAuth().
 * Business Rules:
 * - Only approved customer and sender fields populated.
 * - Prohibits formula injection.
 * - Rejects incomplete orders lacking customer city or address.
 * - Generates separate files per payment method.
 * - Does not modify any production orders or database records.
 */
export async function exportPostalExcelAction(params: {
  orderIds: string[];
  paymentMethod: 'bank_transfer' | 'cod';
  postalCityOverrides?: Record<string, string>;
}): Promise<ExcelExportResult> {
  await requireAdminAuth();

  const { orderIds, paymentMethod, postalCityOverrides } = params;
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return {
      success: false,
      error: 'Please select at least one order to export.',
    };
  }

  const adminClient = createAdminClient();

  try {
    // Fetch exact selected orders from database
    const { data: rawOrders, error } = await (adminClient.from('orders') as any)
      .select(`
        id,
        order_number,
        customer_name,
        email,
        phone1,
        phone2,
        address_line,
        city,
        district,
        province,
        postal_code,
        total_amount,
        payment_method,
        payment_status,
        order_status,
        created_at,
        updated_at,
        order_status_history (
          id,
          new_status,
          created_at
        )
      `)
      .in('id', orderIds);

    if (error || !rawOrders) {
      console.error('[ShippingAdminActions] Failed to fetch selected orders for export:', error?.message);
      return {
        success: false,
        error: 'Failed to retrieve selected orders for export.',
      };
    }

    const mappedOrders: ShippingOrderRecord[] = rawOrders.map((row: any) => {
      let confirmationDate = row.created_at;
      if (Array.isArray(row.order_status_history) && row.order_status_history.length > 0) {
        const confirmedEntries = row.order_status_history
          .filter(
            (h: any) =>
              h.new_status === ORDER_STATUSES.CONFIRMED ||
              h.new_status === ORDER_STATUSES.PROCESSING
          )
          .sort(
            (a: any, b: any) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );

        if (confirmedEntries.length > 0) {
          confirmationDate = confirmedEntries[0].created_at;
        }
      }

      const validation = validateOrderForShipping({
        customer_name: row.customer_name,
        address_line: row.address_line,
        city: row.city,
        district: row.district,
        phone1: row.phone1,
      });

      return {
        id: row.id,
        order_number: row.order_number,
        customer_name: row.customer_name,
        email: row.email,
        phone1: row.phone1,
        phone2: row.phone2,
        address_line: row.address_line,
        city: row.city,
        district: row.district,
        province: row.province,
        postal_code: row.postal_code,
        total_amount: Number(row.total_amount) || 0,
        payment_method: row.payment_method as PaymentMethod,
        payment_status: row.payment_status,
        order_status: row.order_status as OrderStatus,
        created_at: row.created_at,
        updated_at: row.updated_at,
        confirmation_date: confirmationDate,
        validation,
      };
    });

    return await exportShippingOrdersToExcel(mappedOrders, paymentMethod, postalCityOverrides);
  } catch (err: any) {
    console.error('[ShippingAdminActions] Export failed:', err);
    return {
      success: false,
      error: err.message || 'An error occurred during postal Excel generation.',
    };
  }
}
