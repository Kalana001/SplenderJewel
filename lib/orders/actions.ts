'use server';

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/server';
import { isValidDistrict } from '@/lib/config/districts';
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
  delivery_fee: number;
  is_active: boolean;
}

interface VariantWithProductRow {
  id: string;
  product_id: string;
  sku: string;
  title: string;
  price: number;
  discount_price: number | null;
  purchase_cost: number;
  stock_quantity: number;
  is_active: boolean;
  products: {
    name: string;
  } | null;
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
    // 1. Validate customer & address inputs
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

    const adminClient = createAdminClient();

    // 2. Identify customer context (Guest vs Registered)
    const currentUser = await getCurrentUser();
    const userId = currentUser ? currentUser.id : null;

    // 3. Fetch delivery fee for district from database
    const { data: districtRaw, error: districtError } = await (adminClient.from('delivery_districts') as any)
      .select('delivery_fee, is_active')
      .eq('name', input.district)
      .single();

    const districtData = districtRaw as DistrictRow | null;

    if (districtError || !districtData || !districtData.is_active) {
      return { success: false, error: 'Delivery to the selected district is currently unavailable.' };
    }

    const deliveryFee = Number(districtData.delivery_fee) || 0;

    // 4. Fetch variants and compute trusted prices & stock
    const variantIds = input.items.map((i) => i.variantId);
    const { data: variantsRaw, error: variantsError } = await (adminClient.from('product_variants') as any)
      .select(`
        id,
        product_id,
        sku,
        title,
        price,
        discount_price,
        purchase_cost,
        stock_quantity,
        is_active,
        products (
          name
        )
      `)
      .in('id', variantIds);

    const variantsData = variantsRaw as VariantWithProductRow[] | null;

    if (variantsError || !variantsData || variantsData.length === 0) {
      return { success: false, error: 'Failed to verify ordered jewelry items.' };
    }

    const variantMap = new Map<string, VariantWithProductRow>(variantsData.map((v) => [v.id, v]));

    let subtotal = 0;
    const validatedItems: Array<{
      productId: string;
      variantId: string;
      productName: string;
      variantTitle: string;
      sku: string;
      unitPrice: number;
      quantity: number;
      totalPrice: number;
      purchaseCost: number;
    }> = [];

    for (const itemInput of input.items) {
      if (!itemInput.quantity || itemInput.quantity < 1) {
        return { success: false, error: 'Quantity must be at least 1.' };
      }

      const variant = variantMap.get(itemInput.variantId);
      if (!variant || !variant.is_active) {
        return { success: false, error: 'One or more items in your cart are no longer available.' };
      }

      if (variant.stock_quantity < itemInput.quantity) {
        return {
          success: false,
          error: `Insufficient stock for "${variant.title}". Only ${variant.stock_quantity} available.`,
        };
      }

      const unitPrice = variant.discount_price != null ? Number(variant.discount_price) : Number(variant.price);
      const itemTotal = unitPrice * itemInput.quantity;
      subtotal += itemTotal;

      const productName = variant.products?.name || 'Jewelry Item';

      validatedItems.push({
        productId: variant.product_id,
        variantId: variant.id,
        productName,
        variantTitle: variant.title,
        sku: variant.sku,
        unitPrice,
        quantity: itemInput.quantity,
        totalPrice: itemTotal,
        purchaseCost: Number(variant.purchase_cost) || 0,
      });
    }

    const totalAmount = subtotal + deliveryFee;

    // 5. Insert order row into database
    const { data: newOrderRaw, error: orderInsertError } = await (adminClient.from('orders') as any)
      .insert({
        user_id: userId,
        customer_name: input.customerName.trim(),
        email: input.email?.trim() || null,
        phone1: input.phone1.trim(),
        phone2: input.phone2?.trim() || null,
        address_line: input.addressLine.trim(),
        city: input.city?.trim() || null,
        district: input.district,
        province: input.province?.trim() || null,
        postal_code: input.postalCode?.trim() || null,
        delivery_notes: input.deliveryNotes?.trim() || null,
        subtotal,
        delivery_fee: deliveryFee,
        discount_amount: 0,
        coupon_code: null,
        total_amount: totalAmount,
        payment_method: input.paymentMethod,
        payment_status: PAYMENT_STATUSES.PENDING,
        order_status: ORDER_STATUSES.PENDING,
      })
      .select('id, order_number, order_token')
      .single();

    const newOrder = newOrderRaw as { id: string; order_number: string; order_token: string } | null;

    if (orderInsertError || !newOrder) {
      return { success: false, error: `Order creation failed: ${orderInsertError?.message || 'Database error'}` };
    }

    // 6. Insert order items
    const orderItemsPayload = validatedItems.map((item) => ({
      order_id: newOrder.id,
      product_id: item.productId,
      variant_id: item.variantId,
      product_name: item.productName,
      variant_title: item.variantTitle,
      sku: item.sku,
      unit_price: item.unitPrice,
      quantity: item.quantity,
      total_price: item.totalPrice,
      purchase_cost: item.purchaseCost,
    }));

    const { error: itemsInsertError } = await (adminClient.from('order_items') as any)
      .insert(orderItemsPayload);

    if (itemsInsertError) {
      return { success: false, error: `Failed to save order line items: ${itemsInsertError.message}` };
    }

    // 7. Insert initial status history
    await (adminClient.from('order_status_history') as any).insert({
      order_id: newOrder.id,
      previous_status: null,
      new_status: ORDER_STATUSES.PENDING,
      notes: 'Order placed by customer (Pending verification)',
    });

    // 8. If Bank Transfer, insert payment tracking record
    if (input.paymentMethod === PAYMENT_METHODS.BANK_TRANSFER) {
      await (adminClient.from('payments') as any).insert({
        order_id: newOrder.id,
        payment_method: PAYMENT_METHODS.BANK_TRANSFER,
        amount: totalAmount,
        status: PAYMENT_STATUSES.PENDING,
        notes: 'Awaiting customer WhatsApp payment confirmation and manual admin verification',
      });
    }

    return {
      success: true,
      orderNumber: newOrder.order_number,
      orderId: newOrder.id,
      orderToken: newOrder.order_token,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred while processing your order.',
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
    if (!orderNumber?.trim() || !orderToken?.trim()) {
      return { success: false, error: 'Order number and security token are required.' };
    }

    const adminClient = createAdminClient();

    // Query order row matching BOTH order_number AND order_token
    const { data: orderRaw, error: orderError } = await (adminClient.from('orders') as any)
      .select(`
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
        delivery_fee,
        subtotal,
        discount_amount,
        coupon_code,
        total_amount,
        payment_method,
        payment_status,
        order_status,
        tracking_number,
        admin_notes,
        created_at,
        updated_at
      `)
      .eq('order_number', orderNumber.trim())
      .eq('order_token', orderToken.trim())
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
        unit_price,
        quantity,
        total_price
      `)
      .eq('order_id', orderRow.id);

    if (itemsError) {
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
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred while retrieving order confirmation.',
    };
  }
}
