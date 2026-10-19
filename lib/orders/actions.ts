'use server';

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, getAdminUser } from '@/lib/auth/server';
import { isValidDistrict } from '@/lib/config/districts';
import { calculateShippingFee } from '@/lib/config/shipping';
import { PAYMENT_METHODS, ORDER_STATUSES, PAYMENT_STATUSES, type PaymentMethod } from '@/lib/config/constants';
import { mapDbOrderToDomain, type Order, type OrderDbRow, type OrderItem } from '@/types/order';

export interface CreateOrderItemInput {
  variantId: string;
  quantity: number;
}

export interface CreateOrderInput {
  customerName: string;
  phone1: string;
  phone2?: string | null;
  email?: string | null;
  addressLine: string;
  city?: string | null;
  district: string;
  province?: string | null;
  postalCode?: string | null;
  deliveryNotes?: string | null;
  paymentMethod: PaymentMethod;
  couponCode?: string | null;
  clientRequestId?: string | null;
  items: CreateOrderItemInput[];
}

export interface CreateOrderResult {
  success: boolean;
  orderNumber?: string;
  orderId?: string;
  orderToken?: string;
  error?: string;
}

interface DistrictRow {
  is_active: boolean;
  province: string;
}

import { AUTHORIZED_TESTER_USER_IDS, evaluateCheckoutPermission } from './authorization';
export type { CheckoutPermissionParams, CheckoutPermissionResult } from './authorization';

/**
 * Checks whether the currently authenticated session is authorized to place test orders
 * when the storefront is in development testing mode (NEXT_PUBLIC_ENABLE_LIVE_CHECKOUT != 'true').
 */
export async function checkTesterAccessAction(): Promise<{
  isTester: boolean;
  isLiveCheckout: boolean;
  email?: string;
}> {
  const isLiveCheckout = process.env.NEXT_PUBLIC_ENABLE_LIVE_CHECKOUT === 'true';
  if (isLiveCheckout) {
    return { isTester: true, isLiveCheckout: true };
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { isTester: false, isLiveCheckout: false };
  }

  const adminUser = await getAdminUser();
  const perm = evaluateCheckoutPermission({
    isLiveCheckoutEnabled: false,
    userId: currentUser.id,
    adminUser: adminUser ? { id: adminUser.id, isActive: adminUser.isActive } : null,
  });

  return {
    isTester: perm.allowed,
    isLiveCheckout: false,
    email: currentUser.email,
  };
}

/**
 * SECURE SERVER-SIDE ORDER CREATION BOUNDARY
 *
 * Supports both Authenticated Customers and Guest Checkout.
 * Security & Integrity Protections:
 * 1. Server-Only Execution: Uses privileged admin client solely on the server to bypass
 *    client-side direct table insert restrictions. Service role key NEVER reaches the client.
 * 2. Price & Inventory Integrity: Fetches actual selling prices and stock levels directly
 *    from the database — never trusts client-supplied prices or totals.
 * 3. Purchase Cost Snapshot: Atomically captures confidential purchase_cost on order_items
 *    for server-side reporting, without ever returning it to the caller.
 * 4. District Delivery Fee Verification: Reads official delivery charge for the chosen district.
 */
export async function createOrderAction(input: CreateOrderInput): Promise<CreateOrderResult> {
  try {
    // 0. Development & Testing Mode Guardrail
    // Online public checkout remains strictly disabled until official launch.
    // In preview mode, only verified authenticated active admins or designated tester user IDs can submit orders.
    const isLiveCheckoutEnabled = process.env.NEXT_PUBLIC_ENABLE_LIVE_CHECKOUT === 'true';

    // Identify customer context strictly via server-side Supabase Auth session (never from client JSON)
    const currentUser = await getCurrentUser();
    const userId = currentUser ? currentUser.id : null;
    const adminUser = userId ? await getAdminUser() : null;

    const permission = evaluateCheckoutPermission({
      isLiveCheckoutEnabled,
      userId,
      adminUser: adminUser ? { id: adminUser.id, isActive: adminUser.isActive } : null,
    });

    if (!permission.allowed) {
      return {
        success: false,
        error:
          permission.reason ||
          'The storefront is currently in development preview mode. Online checkout submission is temporarily disabled while transactional database verification is underway. For priority inquiries, please contact us on WhatsApp.',
      };
    }

    // 1. Validate customer & address inputs
    if (!input || typeof input !== 'object') {
      return { success: false, error: 'Invalid checkout request payload.' };
    }
    const rawPayload = input as unknown as Record<string, unknown>;
    if ('user_id' in rawPayload || 'userId' in rawPayload) {
      return {
        success: false,
        error: 'Client-supplied user identity is not permitted.',
      };
    }
    if (!input.customerName?.trim()) {
      return { success: false, error: 'Full name is required.' };
    }
    if (!input.phone1?.trim()) {
      return { success: false, error: 'Primary contact phone number is required.' };
    }
    if (!input.addressLine?.trim()) {
      return { success: false, error: 'Delivery address is required.' };
    }
    if (!input.district || !isValidDistrict(input.district)) {
      return { success: false, error: 'A valid Sri Lankan district must be selected.' };
    }
    if (!input.items || input.items.length === 0) {
      return { success: false, error: 'Your order must contain at least one jewelry item.' };
    }
    if (input.paymentMethod !== PAYMENT_METHODS.COD && input.paymentMethod !== PAYMENT_METHODS.BANK_TRANSFER) {
      return { success: false, error: 'Invalid payment method selected.' };
    }

    const trimmedRequestId = input.clientRequestId?.trim() || '';
    if (!trimmedRequestId || trimmedRequestId.length < 16 || trimmedRequestId.length > 128) {
      return {
        success: false,
        error: 'Idempotency key is required and must be between 16 and 128 characters.',
      };
    }

    const adminClient = createAdminClient();

    // 2. Customer profile status verification for authenticated sessions
    if (userId) {
      const { data: profileData, error: profileError } = await (adminClient.from('profiles') as any)
        .select('id, account_status')
        .eq('id', userId)
        .maybeSingle();

      if (profileError || !profileData) {
        return {
          success: false,
          error: 'Authenticated customer profile could not be verified.',
        };
      }

      if (profileData.account_status !== 'active') {
        return {
          success: false,
          error: 'Your customer account has been suspended and cannot place orders.',
        };
      }
    }

    // 3. Verify district availability from database
    const { data: districtRaw, error: districtError } = await (adminClient.from('delivery_districts') as any)
      .select('is_active, province')
      .eq('name', input.district)
      .single();

    const districtData = districtRaw as DistrictRow | null;

    if (districtError || !districtData || !districtData.is_active) {
      return { success: false, error: 'Delivery to the selected district is currently unavailable.' };
    }

    // 4. Strictly validate raw item quantities BEFORE aggregating duplicate variants
    let totalQuantity = 0;
    const aggregatedMap = new Map<string, number>();
    for (const item of input.items) {
      const variantId = item.variantId?.trim();
      if (!variantId) {
        return { success: false, error: 'Each order item must specify a valid variant.' };
      }
      const rawQty = Number(item.quantity);
      if (!Number.isInteger(rawQty) || rawQty < 1 || rawQty > 999999) {
        return { success: false, error: 'Item quantity must be a positive integer of at least 1.' };
      }
      totalQuantity += rawQty;
      if (totalQuantity > 2147483647) {
        return { success: false, error: 'Total order quantity exceeds permissible limit.' };
      }
      const current = aggregatedMap.get(variantId) || 0;
      aggregatedMap.set(variantId, current + rawQty);
    }

    if (aggregatedMap.size === 0 || totalQuantity < 1) {
      return { success: false, error: 'Your order must contain at least one valid jewelry item.' };
    }

    const consolidatedItems: CreateOrderItemInput[] = Array.from(aggregatedMap.entries()).map(
      ([variantId, quantity]) => ({ variantId, quantity })
    );

    // Ensure shipping quantity strictly equals the aggregate quantity used for inventory deduction
    const inventoryDeductionQuantity = consolidatedItems.reduce((acc, i) => acc + i.quantity, 0);
    if (inventoryDeductionQuantity !== totalQuantity) {
      return {
        success: false,
        error: 'Internal integrity error: shipping quantity does not match inventory deduction quantity.',
      };
    }

    // Calculate authoritative shipping fee based on payment method and verified total item quantity
    const deliveryFee = calculateShippingFee({
      paymentMethod: input.paymentMethod,
      totalQuantity,
    });

    // 5. Normalize coupon code if provided (authoritative validation & locking occur inside process_order_checkout)
    const appliedCouponCode: string | null = input.couponCode?.trim()
      ? input.couponCode.trim().toUpperCase()
      : null;

    // 6. Atomic RPC checkout procedure (Strict single-transaction PostgreSQL execution)
    // Performs full-payload idempotency verification first, followed by row-locked (FOR UPDATE)
    // variant stock deduction, coupon usage enforcement, and order/payment/history creation.
    const { data: rpcData, error: rpcError } = await (adminClient as any).rpc('process_order_checkout', {
      p_order_data: {
        user_id: userId,
        customer_name: input.customerName.trim(),
        email: input.email?.trim() || null,
        phone1: input.phone1.trim(),
        phone2: input.phone2?.trim() || null,
        address_line: input.addressLine.trim(),
        city: input.city?.trim() || null,
        district: input.district,
        province: input.province?.trim() || districtData?.province || null,
        postal_code: input.postalCode?.trim() || null,
        delivery_notes: input.deliveryNotes?.trim() || null,
        delivery_fee: deliveryFee,
        payment_method: input.paymentMethod,
        idempotency_key: trimmedRequestId,
      },
      p_items_data: consolidatedItems.map((i) => ({
        variant_id: i.variantId,
        quantity: i.quantity,
      })),
      p_coupon_code: appliedCouponCode,
    });

    if (rpcError) {
      console.error('[OrderCreation] Database atomic RPC process_order_checkout error:', rpcError);
      const errMsg = rpcError.message || 'Unable to place order.';
      if (
        errMsg.includes('does not exist') ||
        rpcError.code === 'PGRST202' ||
        rpcError.code === '42883'
      ) {
        return {
          success: false,
          error: 'Transactional checkout database procedure is currently undergoing scheduled maintenance. Please contact customer service.',
        };
      }
      // Only surface domain validation messages raised by process_order_checkout; sanitize raw SQL/system errors
      const safeDomainPrefixes = [
        'Insufficient stock',
        'One or more items',
        'Invalid promotional coupon',
        'Coupon code',
        'This coupon',
        'This promotional',
        'Order subtotal',
        'You have reached',
        'Delivery to district',
        'Delivery address',
        'Delivery district',
        'Customer full name',
        'Recipient full name',
        'Primary contact phone',
        'A valid Sri Lankan district',
        'Invalid payment method',
        'Order payload',
        'Order must contain',
        'Your order must contain',
        'Each order item',
        'Item quantity',
        'Idempotency key',
        'Authenticated customer profile',
        'Customer account',
        'Your customer account',
      ];
      const isSafeDomainError = safeDomainPrefixes.some((prefix) => errMsg.startsWith(prefix));
      return {
        success: false,
        error: isSafeDomainError ? errMsg : 'Unable to process your order at this time. Please try again.',
      };
    }

    if (!rpcData || !rpcData.success) {
      return {
        success: false,
        error: rpcData?.error || 'Unable to process your order at this time.',
      };
    }

    return {
      success: true,
      orderNumber: rpcData.order_number,
      orderId: rpcData.order_id,
      orderToken: rpcData.order_token,
    };
  } catch (err: unknown) {
    console.error('[OrderCreation] Unexpected server error processing order:', err instanceof Error ? err.message : err);
    return {
      success: false,
      error: 'An unexpected error occurred while processing your order. Please try again later.',
    };
  }
}

export interface GuestOrderConfirmationResult {
  success: boolean;
  order?: Order;
  error?: string;
}

/**
 * SECURE GUEST ORDER CONFIRMATION ACCESS
 *
 * Validates BOTH order_number and unguessable order_token on the server.
 * Ensures guest customers can view their order status without:
 * 1. Making public.orders readable by anonymous users in PostgREST/RLS
 * 2. Exposing service-role credentials to the browser
 * 3. Leaking purchase_cost or internal administrative fields
 */
export async function getGuestOrderConfirmation(
  orderNumber: string,
  orderToken: string
): Promise<GuestOrderConfirmationResult> {
  try {
    const trimmedNumber = orderNumber?.trim() || '';
    const trimmedToken = orderToken?.trim() || '';

    if (!trimmedNumber || !trimmedToken) {
      return { success: false, error: 'Order number and security token are required.' };
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmedToken)) {
      return { success: false, error: 'Order not found or invalid security token.' };
    }

    const adminClient = createAdminClient();

    // Query order row matching BOTH order_number AND order_token (omitting order_token, idempotency_key, and admin_notes from returned projection)
    const { data: orderRaw, error: orderError } = await (adminClient.from('orders') as any)
      .select(`
        id,
        order_number,
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
        delivery_fee,
        subtotal,
        discount_amount,
        coupon_code,
        total_amount,
        payment_method,
        payment_status,
        order_status,
        tracking_number,
        created_at,
        updated_at
      `)
      .eq('order_number', trimmedNumber)
      .eq('order_token', trimmedToken)
      .single();

    if (orderError || !orderRaw) {
      return { success: false, error: 'Order not found or invalid security token.' };
    }

    const orderRow = orderRaw as OrderDbRow;

    // Fetch line items for this order (purposely omitting purchase_cost)
    const { data: itemsRaw, error: itemsError } = await (adminClient.from('order_items') as any)
      .select(`
        id,
        order_id,
        product_id,
        variant_id,
        product_name,
        variant_title,
        sku,
        image_url,
        unit_price,
        quantity,
        total_price
      `)
      .eq('order_id', orderRow.id);

    if (itemsError) {
      console.error('[GuestOrderConfirmation] Database failed to retrieve order items:', itemsError.message);
      return { success: false, error: 'Failed to retrieve order line items.' };
    }

    const items: OrderItem[] = ((itemsRaw as any[]) || []).map((item) => ({
      id: item.id,
      orderId: item.order_id,
      productId: item.product_id,
      variantId: item.variant_id,
      productName: item.product_name,
      variantTitle: item.variant_title,
      sku: item.sku,
      imageUrl: item.image_url ?? null,
      unitPrice: Number(item.unit_price),
      quantity: Number(item.quantity),
      totalPrice: Number(item.total_price),
    }));

    const order = mapDbOrderToDomain(orderRow, items);

    return {
      success: true,
      order,
    };
  } catch (err: unknown) {
    console.error('[GuestOrderConfirmation] Unexpected server error retrieving order confirmation:', err instanceof Error ? err.message : err);
    return {
      success: false,
      error: 'An unexpected error occurred while retrieving order confirmation.',
    };
  }
}
