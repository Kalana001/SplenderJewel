'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/auth/server';
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  type OrderStatus,
  type PaymentStatus,
} from '@/lib/config/constants';

export interface AdminOrderFilter {
  status?: string;
  paymentMethod?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface AdminOrderSummaryMetrics {
  totalOrders: number;
  totalRevenue: number;
  pendingReviewCount: number;
  pendingBankTransferCount: number;
}

/**
 * FETCH ORDERS LIST FOR ADMIN MANAGEMENT
 * Strictly server-side; enforces requireAdminAuth().
 */
export async function getAdminOrders(filter: AdminOrderFilter = {}) {
  await requireAdminAuth();
  const adminClient = createAdminClient();

  const { status, paymentMethod, search, page = 1, limit = 25 } = filter;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    let query = (adminClient.from('orders') as any)
      .select(
        `
        id,
        order_number,
        customer_name,
        email,
        phone1,
        phone2,
        district,
        subtotal,
        delivery_fee,
        discount_amount,
        total_amount,
        payment_method,
        payment_status,
        order_status,
        tracking_number,
        admin_notes,
        created_at,
        order_items (id)
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('order_status', status);
    }

    if (paymentMethod && paymentMethod !== 'all') {
      query = query.eq('payment_method', paymentMethod);
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      query = query.or(`order_number.ilike.${s},customer_name.ilike.${s},phone1.ilike.${s}`);
    }

    const { data, count, error } = await query.range(from, to);

    if (error) {
      console.error('[AdminOrders] Error fetching orders:', error.message);
      return { success: false, error: 'Failed to retrieve orders list.', orders: [], total: 0 };
    }

    // Compute overview metrics
    const { data: metricsRaw } = await (adminClient.from('orders') as any).select(
      'total_amount, order_status, payment_method, payment_status'
    );

    const metrics: AdminOrderSummaryMetrics = {
      totalOrders: metricsRaw?.length || 0,
      totalRevenue: (metricsRaw || []).reduce((acc: number, o: any) => acc + (Number(o.total_amount) || 0), 0),
      pendingReviewCount: (metricsRaw || []).filter((o: any) => o.order_status === 'pending').length,
      pendingBankTransferCount: (metricsRaw || []).filter(
        (o: any) => o.payment_method === 'bank_transfer' && o.payment_status === 'pending'
      ).length,
    };

    const orders = (data || []).map((o: any) => ({
      ...o,
      itemsCount: Array.isArray(o.order_items) ? o.order_items.length : 0,
    }));

    return {
      success: true,
      orders,
      total: count || 0,
      metrics,
    };
  } catch (err: unknown) {
    console.error('[AdminOrders] Unexpected error in getAdminOrders:', err);
    return { success: false, error: 'Failed to load administrative orders.', orders: [], total: 0 };
  }
}

/**
 * FETCH SINGLE ORDER FOR ADMIN FULFILLMENT & AUDITING
 * Includes confidential purchase_cost and status transition history.
 */
export async function getAdminOrderById(orderId: string) {
  await requireAdminAuth();
  const adminClient = createAdminClient();

  try {
    const { data: orderRaw, error: orderError } = await (adminClient.from('orders') as any)
      .select(
        `
        id,
        order_number,
        order_token,
        user_id,
        customer_name,
        email,
        phone1,
        phone2,
        address_line,
        city,
        district,
        province,
        postal_code,
        delivery_notes,
        subtotal,
        delivery_fee,
        discount_amount,
        coupon_code,
        total_amount,
        payment_method,
        payment_status,
        order_status,
        tracking_number,
        admin_notes,
        created_at,
        updated_at,
        order_items (
          id,
          product_id,
          variant_id,
          product_name,
          variant_title,
          sku,
          image_url,
          unit_price,
          quantity,
          total_price,
          purchase_cost
        ),
        order_status_history (
          id,
          previous_status,
          new_status,
          notes,
          created_at
        ),
        payments (
          id,
          payment_method,
          amount,
          status,
          notes,
          created_at
        )
      `
      )
      .or(`id.eq.${orderId},order_number.eq.${orderId}`)
      .maybeSingle();

    if (orderError || !orderRaw) {
      return { success: false, error: 'Order not found or database query failed.', order: null };
    }

    // Calculate Admin Confidential Financials
    const items = orderRaw.order_items || [];
    const totalPurchaseCost = items.reduce(
      (sum: number, i: any) => sum + (Number(i.purchase_cost) || 0) * (Number(i.quantity) || 1),
      0
    );
    const subtotal = Number(orderRaw.subtotal) || 0;
    const grossProfit = subtotal - totalPurchaseCost;
    const grossMarginPercent = subtotal > 0 ? Math.round((grossProfit / subtotal) * 100) : 0;

    return {
      success: true,
      order: {
        ...orderRaw,
        financials: {
          subtotal,
          totalPurchaseCost,
          grossProfit,
          grossMarginPercent,
        },
      },
    };
  } catch (err: unknown) {
    console.error('[AdminOrderById] Error:', err);
    return { success: false, error: 'Unexpected error fetching order details.', order: null };
  }
}

/**
 * UPDATE ORDER STATUS (PENDING -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED)
 * Logs status transition in order_status_history.
 */
export async function updateOrderStatusAction(input: {
  orderId: string;
  newStatus: OrderStatus;
  notes?: string;
}) {
  const admin = await requireAdminAuth();
  const adminClient = createAdminClient();

  const validStatuses = Object.values(ORDER_STATUSES);
  if (!validStatuses.includes(input.newStatus)) {
    return { success: false, error: 'Invalid order status specified.' };
  }

  try {
    // 1. Fetch current status
    const { data: currentOrder, error: fetchErr } = await (adminClient.from('orders') as any)
      .select('id, order_status, order_number')
      .eq('id', input.orderId)
      .single();

    if (fetchErr || !currentOrder) {
      return { success: false, error: 'Target order not found.' };
    }

    const previousStatus = currentOrder.order_status;

    // 2. Update order status
    const { error: updateErr } = await (adminClient.from('orders') as any)
      .update({
        order_status: input.newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.orderId);

    if (updateErr) {
      return { success: false, error: 'Database failed to update order status.' };
    }

    // 3. Log transition history
    await (adminClient.from('order_status_history') as any).insert({
      order_id: input.orderId,
      previous_status: previousStatus,
      new_status: input.newStatus,
      notes: input.notes?.trim() || `Status updated to ${input.newStatus} by admin (${admin.email})`,
    });

    revalidatePath('/admin/orders');
    revalidatePath(`/admin/orders/${input.orderId}`);
    return { success: true };
  } catch (err: unknown) {
    console.error('[UpdateOrderStatus] Error:', err);
    return { success: false, error: 'Failed to update order status.' };
  }
}

/**
 * UPDATE PAYMENT STATUS (e.g., APPROVING WHATSAPP BANK TRANSFER)
 */
export async function updatePaymentStatusAction(input: {
  orderId: string;
  newPaymentStatus: PaymentStatus;
  notes?: string;
}) {
  const admin = await requireAdminAuth();
  const adminClient = createAdminClient();

  const validStatuses = Object.values(PAYMENT_STATUSES);
  if (!validStatuses.includes(input.newPaymentStatus)) {
    return { success: false, error: 'Invalid payment status specified.' };
  }

  try {
    const { error: updateErr } = await (adminClient.from('orders') as any)
      .update({
        payment_status: input.newPaymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.orderId);

    if (updateErr) {
      return { success: false, error: 'Failed to update payment status.' };
    }

    // Update payments table record if one exists
    await (adminClient.from('payments') as any)
      .update({
        status: input.newPaymentStatus,
        notes: input.notes?.trim() || `Payment status updated to ${input.newPaymentStatus} by admin (${admin.email})`,
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', input.orderId);

    revalidatePath('/admin/orders');
    revalidatePath(`/admin/orders/${input.orderId}`);
    return { success: true };
  } catch (err: unknown) {
    console.error('[UpdatePaymentStatus] Error:', err);
    return { success: false, error: 'Failed to update payment status.' };
  }
}

/**
 * UPDATE INTERNAL ADMIN NOTES
 */
export async function updateAdminNotesAction(input: { orderId: string; adminNotes: string }) {
  await requireAdminAuth();
  const adminClient = createAdminClient();

  try {
    const { error } = await (adminClient.from('orders') as any)
      .update({
        admin_notes: input.adminNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.orderId);

    if (error) {
      return { success: false, error: 'Failed to save admin notes.' };
    }

    revalidatePath(`/admin/orders/${input.orderId}`);
    return { success: true };
  } catch (err: unknown) {
    console.error('[UpdateAdminNotes] Error:', err);
    return { success: false, error: 'Failed to save admin notes.' };
  }
}

/**
 * UPDATE SHIPPING TRACKING NUMBER
 */
export async function updateTrackingNumberAction(input: {
  orderId: string;
  trackingNumber: string;
}) {
  await requireAdminAuth();
  const adminClient = createAdminClient();

  try {
    const { error } = await (adminClient.from('orders') as any)
      .update({
        tracking_number: input.trackingNumber.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.orderId);

    if (error) {
      return { success: false, error: 'Failed to update courier tracking number.' };
    }

    revalidatePath(`/admin/orders/${input.orderId}`);
    return { success: true };
  } catch (err: unknown) {
    console.error('[UpdateTrackingNumber] Error:', err);
    return { success: false, error: 'Failed to update courier tracking number.' };
  }
}
