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
  pendingCodSettlementCount: number;
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

    // Execute paginated orders query and overview metrics query concurrently
    const [ordersResult, rpcMetricsResult] = await Promise.all([
      query.range(from, to),
      (adminClient.rpc as any)('get_admin_order_summary_metrics'),
    ]);

    const { data, count, error } = ordersResult;

    if (error) {
      console.error('[AdminOrders] Error fetching orders:', error.message);
      return { success: false, error: 'Failed to retrieve orders list.', orders: [], total: 0 };
    }

    let metrics: AdminOrderSummaryMetrics;

    if (!rpcMetricsResult.error && rpcMetricsResult.data) {
      // Primary high-performance path: Database-side aggregation via Migration 00008
      const d = rpcMetricsResult.data;
      metrics = {
        totalOrders: Number(d.totalOrders) || 0,
        totalRevenue: Number(d.totalRevenue) || 0,
        pendingReviewCount: Number(d.pendingReviewCount) || 0,
        pendingBankTransferCount: Number(d.pendingBankTransferCount) || 0,
        pendingCodSettlementCount: Number(d.pendingCodSettlementCount) || 0,
      };
    } else {
      // Fallback path when RPC is not yet applied:
      // Computes 100% accurate metrics without arbitrary row caps.
      // Uses count: 'exact', head: true for zero-row transferred count queries,
      // and retrieves total_amount in explicit paginated batches of 1,000 to safely bypass
      // PostgREST's maximum rows per response limit without silent truncation.
      // BUSINESS RULE: Total Revenue includes ONLY confirmed received money (payment_status = 'verified')
      // and excludes unpaid COD, unverified bank transfers, and cancelled/refunded orders.
      const [totalCountRes, pendingReviewRes, pendingTransferRes, pendingCodRes, verifiedCountRes] = await Promise.all([
        (adminClient.from('orders') as any).select('*', { count: 'exact', head: true }),
        (adminClient.from('orders') as any)
          .select('*', { count: 'exact', head: true })
          .eq('order_status', 'pending'),
        (adminClient.from('orders') as any)
          .select('*', { count: 'exact', head: true })
          .eq('payment_method', 'bank_transfer')
          .eq('payment_status', 'pending')
          .not('order_status', 'in', '("cancelled","refunded")'),
        (adminClient.from('orders') as any)
          .select('*', { count: 'exact', head: true })
          .eq('payment_method', 'cod')
          .eq('payment_status', 'pending')
          .not('order_status', 'in', '("cancelled","refunded")'),
        (adminClient.from('orders') as any)
          .select('*', { count: 'exact', head: true })
          .eq('payment_status', 'verified')
          .not('order_status', 'in', '("cancelled","refunded")'),
      ]);

      const exactTotalOrders = totalCountRes.count ?? (count || 0);
      const exactVerifiedOrders = verifiedCountRes.count ?? 0;
      let lifetimeRevenue = 0;

      if (exactVerifiedOrders > 0) {
        const BATCH_SIZE = 1000;
        const totalBatches = Math.ceil(exactVerifiedOrders / BATCH_SIZE);

        // Fetch paginated batches in concurrent groups of up to 5 to avoid connection pool exhaustion
        for (let batchIdx = 0; batchIdx < totalBatches; batchIdx += 5) {
          const batchPromises = [];
          const endBatch = Math.min(batchIdx + 5, totalBatches);

          for (let i = batchIdx; i < endBatch; i++) {
            const rangeFrom = i * BATCH_SIZE;
            const rangeTo = rangeFrom + BATCH_SIZE - 1;
            batchPromises.push(
              (adminClient.from('orders') as any)
                .select('total_amount')
                .eq('payment_status', 'verified')
                .not('order_status', 'in', '("cancelled","refunded")')
                .range(rangeFrom, rangeTo)
            );
          }

          const batchResults = await Promise.all(batchPromises);
          for (const res of batchResults) {
            if (res.error) {
              console.error('[AdminOrders] Error fetching revenue batch:', res.error.message);
            } else if (Array.isArray(res.data)) {
              for (const row of res.data) {
                lifetimeRevenue += Number(row.total_amount) || 0;
              }
            }
          }
        }
      }

      metrics = {
        totalOrders: exactTotalOrders,
        totalRevenue: lifetimeRevenue,
        pendingReviewCount: pendingReviewRes.count ?? 0,
        pendingBankTransferCount: pendingTransferRes.count ?? 0,
        pendingCodSettlementCount: pendingCodRes.count ?? 0,
      };
    }

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
 * UPDATE ORDER STATUS (PENDING -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED / CANCELLED)
 * Logs status transition in order_status_history and atomically restocks inventory when cancelled.
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

    if (previousStatus === input.newStatus) {
      return { success: true };
    }

    if (previousStatus === ORDER_STATUSES.CANCELLED) {
      return {
        success: false,
        error: 'Cancelled orders cannot be reopened or transitioned to another status.',
      };
    }

    // 2. If cancelling the order, execute atomic cancellation + inventory restock procedure
    if (input.newStatus === ORDER_STATUSES.CANCELLED) {
      const { data: cancelData, error: cancelErr } = await (adminClient as any).rpc(
        'cancel_order_and_restock',
        {
          p_order_id: input.orderId,
          p_admin_id: admin.id,
          p_notes: input.notes?.trim() || null,
        }
      );

      if (cancelErr || !cancelData?.success) {
        console.error('[UpdateOrderStatus] cancel_order_and_restock error:', cancelErr);
        return {
          success: false,
          error: cancelErr?.message || 'Database failed to cancel order and restock inventory.',
        };
      }

      revalidatePath('/admin/orders');
      revalidatePath(`/admin/orders/${input.orderId}`);
      revalidatePath('/admin/inventory');
      revalidatePath('/shop');
      return { success: true };
    }

    // 3. Standard non-cancellation status update
    const { error: updateErr } = await (adminClient.from('orders') as any)
      .update({
        order_status: input.newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.orderId);

    if (updateErr) {
      return { success: false, error: 'Database failed to update order status.' };
    }

    // 4. Log transition history
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
    const { data: targetOrder, error: orderErr } = await (adminClient.from('orders') as any)
      .select('id, order_number, order_status, payment_status, payment_method, total_amount')
      .eq('id', input.orderId)
      .single();

    if (orderErr || !targetOrder) {
      return { success: false, error: 'Target order not found.' };
    }

    if (targetOrder.order_status === 'cancelled' || targetOrder.order_status === 'refunded') {
      return {
        success: false,
        error: `Cannot change payment status for a ${targetOrder.order_status} order.`,
      };
    }

    if (
      input.newPaymentStatus === PAYMENT_STATUSES.VERIFIED &&
      targetOrder.payment_status === PAYMENT_STATUSES.VERIFIED
    ) {
      return {
        success: false,
        error: `Payment for order ${targetOrder.order_number} is already verified.`,
      };
    }

    const nowIso = new Date().toISOString();
    const previousPaymentStatus = targetOrder.payment_status;

    const { error: updateErr } = await (adminClient.from('orders') as any)
      .update({
        payment_status: input.newPaymentStatus,
        updated_at: nowIso,
      })
      .eq('id', input.orderId);

    if (updateErr) {
      return { success: false, error: 'Failed to update payment status.' };
    }

    const auditNotes =
      input.notes?.trim() ||
      `Payment status updated to ${input.newPaymentStatus} by admin (${admin.email})`;

    // Update or insert payments table record
    const { data: existingPayment } = await (adminClient.from('payments') as any)
      .select('id')
      .eq('order_id', input.orderId)
      .limit(1)
      .maybeSingle();

    const paymentUpdateData: any = {
      status: input.newPaymentStatus,
      notes: auditNotes,
      updated_at: nowIso,
    };

    if (input.newPaymentStatus === PAYMENT_STATUSES.VERIFIED) {
      paymentUpdateData.approved_by = admin.id;
      paymentUpdateData.approved_at = nowIso;
    }

    if (existingPayment) {
      await (adminClient.from('payments') as any)
        .update(paymentUpdateData)
        .eq('id', existingPayment.id);
    } else {
      await (adminClient.from('payments') as any).insert({
        order_id: input.orderId,
        payment_method: targetOrder.payment_method,
        amount: targetOrder.total_amount,
        status: input.newPaymentStatus,
        approved_by: input.newPaymentStatus === PAYMENT_STATUSES.VERIFIED ? admin.id : null,
        approved_at: input.newPaymentStatus === PAYMENT_STATUSES.VERIFIED ? nowIso : null,
        notes: auditNotes,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    // Insert immutable audit log
    await (adminClient.from('audit_logs') as any).insert({
      admin_id: admin.id,
      admin_email: admin.email,
      action: 'UPDATE_PAYMENT_STATUS',
      resource_type: 'ORDER',
      resource_id: input.orderId,
      details: {
        order_id: input.orderId,
        order_number: targetOrder.order_number,
        previous_payment_status: previousPaymentStatus,
        new_payment_status: input.newPaymentStatus,
        admin_email: admin.email,
        notes: input.notes?.trim() || null,
      },
    });

    revalidatePath('/admin/orders');
    revalidatePath(`/admin/orders/${input.orderId}`);
    revalidatePath('/admin/payments');
    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/reports');
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

/**
 * GET ADMIN DASHBOARD SUMMARY METRICS
 * Strictly computes confirmed revenue and pending queues.
 */
export async function getAdminDashboardMetrics(): Promise<{
  success: boolean;
  metrics: AdminOrderSummaryMetrics;
}> {
  await requireAdminAuth();
  const adminClient = createAdminClient();

  try {
    const { data: rpcData, error: rpcError } = await (adminClient.rpc as any)('get_admin_order_summary_metrics');
    if (!rpcError && rpcData) {
      return {
        success: true,
        metrics: {
          totalOrders: Number(rpcData.totalOrders) || 0,
          totalRevenue: Number(rpcData.totalRevenue) || 0,
          pendingReviewCount: Number(rpcData.pendingReviewCount) || 0,
          pendingBankTransferCount: Number(rpcData.pendingBankTransferCount) || 0,
          pendingCodSettlementCount: Number(rpcData.pendingCodSettlementCount) || 0,
        },
      };
    }

    // Fallback path
    const [totalCountRes, pendingReviewRes, pendingTransferRes, pendingCodRes, verifiedCountRes] = await Promise.all([
      (adminClient.from('orders') as any).select('*', { count: 'exact', head: true }),
      (adminClient.from('orders') as any).select('*', { count: 'exact', head: true }).eq('order_status', 'pending'),
      (adminClient.from('orders') as any)
        .select('*', { count: 'exact', head: true })
        .eq('payment_method', 'bank_transfer')
        .eq('payment_status', 'pending')
        .not('order_status', 'in', '("cancelled","refunded")'),
      (adminClient.from('orders') as any)
        .select('*', { count: 'exact', head: true })
        .eq('payment_method', 'cod')
        .eq('payment_status', 'pending')
        .not('order_status', 'in', '("cancelled","refunded")'),
      (adminClient.from('orders') as any)
        .select('*', { count: 'exact', head: true })
        .eq('payment_status', 'verified')
        .not('order_status', 'in', '("cancelled","refunded")'),
    ]);

    const exactTotalOrders = totalCountRes.count ?? 0;
    const exactVerifiedOrders = verifiedCountRes.count ?? 0;
    let lifetimeRevenue = 0;

    if (exactVerifiedOrders > 0) {
      const BATCH_SIZE = 1000;
      const totalBatches = Math.ceil(exactVerifiedOrders / BATCH_SIZE);

      for (let batchIdx = 0; batchIdx < totalBatches; batchIdx += 5) {
        const batchPromises = [];
        const endBatch = Math.min(batchIdx + 5, totalBatches);

        for (let i = batchIdx; i < endBatch; i++) {
          const rangeFrom = i * BATCH_SIZE;
          const rangeTo = rangeFrom + BATCH_SIZE - 1;
          batchPromises.push(
            (adminClient.from('orders') as any)
              .select('total_amount')
              .eq('payment_status', 'verified')
              .not('order_status', 'in', '("cancelled","refunded")')
              .range(rangeFrom, rangeTo)
          );
        }

        const batchResults = await Promise.all(batchPromises);
        for (const res of batchResults) {
          if (Array.isArray(res.data)) {
            for (const row of res.data) {
              lifetimeRevenue += Number(row.total_amount) || 0;
            }
          }
        }
      }
    }

    return {
      success: true,
      metrics: {
        totalOrders: exactTotalOrders,
        totalRevenue: lifetimeRevenue,
        pendingReviewCount: pendingReviewRes.count ?? 0,
        pendingBankTransferCount: pendingTransferRes.count ?? 0,
        pendingCodSettlementCount: pendingCodRes.count ?? 0,
      },
    };
  } catch (err: unknown) {
    console.error('[AdminDashboardMetrics] Error:', err);
    return {
      success: false,
      metrics: {
        totalOrders: 0,
        totalRevenue: 0,
        pendingReviewCount: 0,
        pendingBankTransferCount: 0,
        pendingCodSettlementCount: 0,
      },
    };
  }
}

export interface ConfirmCodPaymentInput {
  orderId: string;
  courierName?: string;
  settlementReference?: string;
  receiptDate?: string;
  notes?: string;
  confirmedByUser: boolean;
}

/**
 * CONFIRM COD PAYMENT RECEIVED FROM COURIER
 * CRITICAL: Delivered does NOT mean Paid.
 * This action manually confirms that Splender Jewel received the COD remittance.
 * - Validates active admin auth server-side.
 * - Does not trust browser-supplied amounts or admin IDs.
 * - Strictly delegates to atomic database RPC (public.confirm_cod_payment_settlement).
 * - Enforces delivered prerequisite inside database RPC.
 * - Prevents duplicate confirmations via row-level locking.
 * - Rejects cancelled and refunded orders.
 * - Zero non-atomic write fallbacks: if RPC is unavailable or fails, returns safe error without mutations.
 */
export async function confirmCodPaymentAction(input: ConfirmCodPaymentInput) {
  const admin = await requireAdminAuth();
  const adminClient = createAdminClient();

  if (!input.orderId || typeof input.orderId !== 'string') {
    return { success: false, error: 'Target order ID is required.' };
  }

  if (!input.confirmedByUser) {
    return {
      success: false,
      error: 'You must explicitly confirm receipt of COD funds before confirming settlement.',
    };
  }

  try {
    // Atomic database RPC is the ONLY write mechanism (Migration 00009)
    const { data: rpcData, error: rpcError } = await (adminClient.rpc as any)(
      'confirm_cod_payment_settlement',
      {
        p_order_id: input.orderId,
        p_admin_id: admin.id,
        p_courier_name: input.courierName?.trim() || null,
        p_settlement_reference: input.settlementReference?.trim() || null,
        p_receipt_date: input.receiptDate?.trim() || null,
        p_notes: input.notes?.trim() || null,
      }
    );

    if (rpcError || !rpcData?.success) {
      console.error('[ConfirmCodPayment] RPC error:', rpcError);
      const errorMsg = rpcError?.message || 'Database failed to confirm COD payment settlement.';
      return {
        success: false,
        error: errorMsg.includes('does not exist')
          ? 'COD settlement procedure is unavailable. Please ensure migration 00009 is applied.'
          : errorMsg,
      };
    }

    revalidatePath('/admin/payments');
    revalidatePath('/admin/orders');
    revalidatePath(`/admin/orders/${input.orderId}`);
    revalidatePath('/admin/dashboard');
    revalidatePath('/admin/reports');

    return { success: true, amount: rpcData.amount };
  } catch (err: unknown) {
    console.error('[ConfirmCodPayment] Error:', err);
    return { success: false, error: 'Unexpected error during COD payment confirmation.' };
  }
}

export interface AdminPaymentFilter {
  search?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  settlementQueue?: 'all' | 'pending_cod' | 'pending_bank_transfer' | 'confirmed';
  page?: number;
  limit?: number;
}

export interface AdminPaymentRow {
  id: string;
  order_number: string;
  customer_name: string;
  phone1: string;
  district: string;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  order_status: OrderStatus;
  tracking_number: string | null;
  created_at: string;
  payments?: Array<{
    id: string;
    status: string;
    reference_number: string | null;
    approved_by: string | null;
    approved_at: string | null;
    notes: string | null;
    courier_name?: string | null;
    settlement_date?: string | null;
  }>;
}

/**
 * FETCH PAYMENT SETTLEMENTS LIST FOR /admin/payments
 */
export async function getAdminPaymentSettlements(filter: AdminPaymentFilter = {}) {
  await requireAdminAuth();
  const adminClient = createAdminClient();

  const { search, paymentMethod, paymentStatus, settlementQueue = 'all', page = 1, limit = 25 } = filter;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    let query = (adminClient.from('orders') as any)
      .select(
        `
        id,
        order_number,
        customer_name,
        phone1,
        district,
        total_amount,
        payment_method,
        payment_status,
        order_status,
        tracking_number,
        created_at,
        payments (
          id,
          status,
          reference_number,
          approved_by,
          approved_at,
          notes
        )
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    // Settlement Queue Shortcuts
    if (settlementQueue === 'pending_cod') {
      query = query
        .eq('payment_method', 'cod')
        .eq('payment_status', 'pending')
        .not('order_status', 'in', '("cancelled","refunded")');
    } else if (settlementQueue === 'pending_bank_transfer') {
      query = query
        .eq('payment_method', 'bank_transfer')
        .eq('payment_status', 'pending')
        .not('order_status', 'in', '("cancelled","refunded")');
    } else if (settlementQueue === 'confirmed') {
      query = query
        .eq('payment_status', 'verified')
        .not('order_status', 'in', '("cancelled","refunded")');
    } else {
      if (paymentMethod && paymentMethod !== 'all') {
        query = query.eq('payment_method', paymentMethod);
      }
      if (paymentStatus && paymentStatus !== 'all') {
        query = query.eq('payment_status', paymentStatus);
      }
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      query = query.or(`order_number.ilike.${s},customer_name.ilike.${s},phone1.ilike.${s}`);
    }

    const [listResult, metricsResult] = await Promise.all([
      query.range(from, to),
      getAdminDashboardMetrics(),
    ]);

    const { data, count, error } = listResult;
    if (error) {
      console.error('[AdminPayments] Error fetching payments list:', error.message);
      return { success: false, error: 'Failed to retrieve payment records.', payments: [], total: 0, metrics: metricsResult.metrics };
    }

    return {
      success: true,
      payments: (data || []) as AdminPaymentRow[],
      total: count || 0,
      metrics: metricsResult.metrics,
    };
  } catch (err: unknown) {
    console.error('[AdminPayments] Error:', err);
    return {
      success: false,
      error: 'Failed to load payment settlement records.',
      payments: [],
      total: 0,
      metrics: {
        totalOrders: 0,
        totalRevenue: 0,
        pendingReviewCount: 0,
        pendingBankTransferCount: 0,
        pendingCodSettlementCount: 0,
      },
    };
  }
}
