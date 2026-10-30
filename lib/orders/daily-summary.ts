if (typeof window !== 'undefined') {
  throw new Error('[Security] lib/orders/daily-summary.ts can only be executed in a server environment.');
}

import { formatCurrency } from '../config/store.ts';

export interface DailyOrderSummaryItem {
  orderNumber: string;
  customerName: string;
  phone: string;
  district: string;
  totalAmount: number;
  itemCount: number;
  paymentMethod: string;
  orderStatus: string;
  createdAt: string;
  itemsDescription: string;
}

export interface DailyOrderSummaryData {
  reportDate: string;
  timeWindowDescription: string;
  totalOrders: number;
  totalRevenue: number;
  totalUnits: number;
  orders: DailyOrderSummaryItem[];
}

/**
 * Calculates the 24-hour time window up to the current moment.
 * Ensures orders placed in the evening after 6:00 PM are never missed.
 */
export function getSummaryTimeWindow(referenceDate: Date = new Date()) {
  const windowEnd = new Date(referenceDate);
  const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);

  return {
    windowStart,
    windowEnd,
  };
}
/**
 * Queries orders placed within the time window and compiles summary metrics.
 */
export async function compileDailyOrderSummary(referenceDate: Date = new Date()): Promise<DailyOrderSummaryData> {
  const { windowStart, windowEnd } = getSummaryTimeWindow(referenceDate);
  const { createAdminClient } = await import('../supabase/admin.ts');
  const adminClient = createAdminClient();

  const { data: orders, error } = await (adminClient.from('orders') as any)
    .select(`
      id,
      order_number,
      customer_name,
      phone1,
      district,
      total_amount,
      payment_method,
      order_status,
      created_at,
      order_items (
        id,
        product_name,
        variant_title,
        quantity,
        total_price
      )
    `)
    .gte('created_at', windowStart.toISOString())
    .lte('created_at', windowEnd.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to query orders for daily summary: ${error.message}`);
  }

  const rawOrders = (orders || []) as Array<{
    id: string;
    order_number: string;
    customer_name: string;
    phone1: string;
    district: string;
    total_amount: number;
    payment_method: string;
    order_status: string;
    created_at: string;
    order_items: Array<{
      id: string;
      product_name: string;
      variant_title?: string;
      quantity: number;
      total_price: number;
    }>;
  }>;

  let totalRevenue = 0;
  let totalUnits = 0;

  const summarizedOrders: DailyOrderSummaryItem[] = rawOrders.map((o) => {
    const amount = Number(o.total_amount) || 0;
    totalRevenue += amount;

    const items = o.order_items || [];
    const itemCount = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    totalUnits += itemCount;

    const itemsDescription = items
      .map((it) => `${it.product_name}${it.variant_title ? ` (${it.variant_title})` : ''} x${it.quantity}`)
      .join(', ');

    return {
      orderNumber: o.order_number,
      customerName: o.customer_name || 'Valued Customer',
      phone: o.phone1 || 'N/A',
      district: o.district || 'Sri Lanka',
      totalAmount: amount,
      itemCount,
      paymentMethod: o.payment_method || 'COD',
      orderStatus: o.order_status || 'pending',
      createdAt: o.created_at,
      itemsDescription: itemsDescription || `${itemCount} item(s)`,
    };
  });

  // Format local Sri Lanka date string (UTC+5:30)
  const sriLankaDateStr = windowEnd.toLocaleDateString('en-US', {
    timeZone: 'Asia/Colombo',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return {
    reportDate: sriLankaDateStr,
    timeWindowDescription: 'Last 24 Hours (As of 6:00 PM Sri Lanka Time)',
    totalOrders: summarizedOrders.length,
    totalRevenue,
    totalUnits,
    orders: summarizedOrders,
  };
}

/**
 * Builds HTML and plain text email content matching Splender Jewel's luxury aesthetic.
 */
export function formatDailyOrderSummaryEmail(data: DailyOrderSummaryData) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://splender-jewel.vercel.app';
  const adminOrdersUrl = `${baseUrl}/admin/orders`;

  const subject = data.totalOrders > 0
    ? `📦 Splender Jewel Daily Orders: ${data.totalOrders} order(s) received — ${formatCurrency(data.totalRevenue)}`
    : `📦 Splender Jewel Daily Orders: 0 orders today (${data.reportDate})`;

  // Plain Text Version
  let text = `SPLENDER JEWEL — DAILY ORDER SUMMARY\n`;
  text += `Date: ${data.reportDate}\n`;
  text += `Period: ${data.timeWindowDescription}\n\n`;
  text += `═══════════════════════════════════════\n`;
  text += `SUMMARY METRICS:\n`;
  text += `• Total Orders: ${data.totalOrders}\n`;
  text += `• Total Revenue: ${formatCurrency(data.totalRevenue)}\n`;
  text += `• Total Units Ordered: ${data.totalUnits}\n`;
  text += `═══════════════════════════════════════\n\n`;

  if (data.totalOrders === 0) {
    text += `No new customer orders were recorded during this 24-hour period.\n\n`;
  } else {
    text += `ORDER DETAILS:\n`;
    data.orders.forEach((ord, index) => {
      text += `\n${index + 1}. Order #${ord.orderNumber}\n`;
      text += `   Customer: ${ord.customerName} (${ord.phone})\n`;
      text += `   District: ${ord.district}\n`;
      text += `   Items: ${ord.itemsDescription}\n`;
      text += `   Total: ${formatCurrency(ord.totalAmount)} [${ord.paymentMethod.toUpperCase()}]\n`;
      text += `   Status: ${ord.orderStatus.toUpperCase()}\n`;
    });
  }

  text += `\nManage these orders in the admin dashboard: ${adminOrdersUrl}\n`;

  // HTML Version (Luxury Gold & Dark Palette)
  const ordersHtml = data.totalOrders === 0
    ? `
      <div style="padding: 24px; text-align: center; background-color: #1a1a1a; border-radius: 8px; border: 1px solid #2a2a2a; color: #a3a3a3; font-size: 14px;">
        No customer orders were received during this 24-hour cycle.
      </div>
    `
    : data.orders
        .map(
          (ord, idx) => `
        <div style="background-color: #171717; border: 1px solid #2a2a2a; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #262626; padding-bottom: 10px; margin-bottom: 10px;">
            <div>
              <span style="color: #d4af37; font-weight: bold; font-size: 14px; font-family: monospace;">#${ord.orderNumber}</span>
              <span style="color: #737373; font-size: 12px; margin-left: 8px;">• ${ord.district}</span>
            </div>
            <div style="color: #ffffff; font-weight: bold; font-size: 15px;">
              ${formatCurrency(ord.totalAmount)}
            </div>
          </div>
          <div style="font-size: 13px; color: #e5e5e5; margin-bottom: 6px;">
            <strong>${ord.customerName}</strong> &bull; <a href="tel:${ord.phone}" style="color: #d4af37; text-decoration: none;">${ord.phone}</a>
          </div>
          <div style="font-size: 12px; color: #a3a3a3; line-height: 1.5;">
            ${ord.itemsDescription}
          </div>
          <div style="margin-top: 8px; display: inline-block; padding: 3px 8px; border-radius: 4px; background-color: #262626; color: #10b981; font-size: 11px; font-weight: 600; text-transform: uppercase;">
            ${ord.paymentMethod} &bull; ${ord.orderStatus}
          </div>
        </div>
      `
        )
        .join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e5e5e5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    
    <!-- Brand Header -->
    <div style="text-align: center; padding-bottom: 24px; border-bottom: 1px solid #262626;">
      <h1 style="color: #d4af37; font-size: 22px; font-family: Georgia, serif; letter-spacing: 2px; text-transform: uppercase; margin: 0;">SPLENDER JEWEL</h1>
      <p style="color: #737373; font-size: 12px; margin: 6px 0 0 0; text-transform: uppercase; letter-spacing: 1px;">Daily Order Dispatch Notification</p>
    </div>

    <!-- Date & Period Subhead -->
    <div style="padding: 16px 0 20px 0; display: flex; justify-content: space-between; align-items: baseline;">
      <div>
        <h2 style="color: #ffffff; font-size: 18px; margin: 0;">${data.reportDate}</h2>
        <span style="color: #737373; font-size: 12px;">${data.timeWindowDescription}</span>
      </div>
    </div>

    <!-- Metrics Cards -->
    <table style="width: 100%; border-collapse: separate; border-spacing: 8px 0; margin-bottom: 24px;">
      <tr>
        <td style="width: 33.33%; background-color: #171717; border: 1px solid #2a2a2a; border-radius: 8px; padding: 14px; text-align: center;">
          <div style="color: #737373; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Orders</div>
          <div style="color: #d4af37; font-size: 22px; font-weight: bold; margin-top: 4px;">${data.totalOrders}</div>
        </td>
        <td style="width: 33.33%; background-color: #171717; border: 1px solid #2a2a2a; border-radius: 8px; padding: 14px; text-align: center;">
          <div style="color: #737373; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Revenue</div>
          <div style="color: #ffffff; font-size: 18px; font-weight: bold; margin-top: 6px;">${formatCurrency(data.totalRevenue)}</div>
        </td>
        <td style="width: 33.33%; background-color: #171717; border: 1px solid #2a2a2a; border-radius: 8px; padding: 14px; text-align: center;">
          <div style="color: #737373; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Units</div>
          <div style="color: #10b981; font-size: 22px; font-weight: bold; margin-top: 4px;">${data.totalUnits}</div>
        </td>
      </tr>
    </table>

    <!-- Order Items List -->
    <div style="margin-bottom: 24px;">
      <h3 style="color: #d4af37; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 12px 4px;">
        Order Breakdown (${data.totalOrders})
      </h3>
      ${ordersHtml}
    </div>

    <!-- Action Button -->
    <div style="text-align: center; margin: 32px 0 16px 0;">
      <a href="${adminOrdersUrl}" style="background-color: #d4af37; color: #0a0a0a; font-weight: bold; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; display: inline-block;">
        Open Admin Order Manager
      </a>
    </div>

    <!-- Footer -->
    <div style="border-top: 1px solid #262626; padding-top: 20px; text-align: center; color: #525252; font-size: 11px; line-height: 1.5;">
      Automated administrative notification sent to <strong>splenderjewel@gmail.com</strong>.<br>
      Splender Jewel Colombo, Sri Lanka &bull; All Rights Reserved.
    </div>

  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}
