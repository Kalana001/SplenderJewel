import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CheckCircle2,
  Package,
  Truck,
  MessageCircle,
  Clock,
  ShieldCheck,
  ArrowRight,
  ShoppingBag,
  AlertCircle,
} from 'lucide-react';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/server';
import { formatCurrency, getStoreConfig } from '@/lib/config/store';
import { PAYMENT_METHODS } from '@/lib/config/constants';

interface OrderConfirmationPageProps {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function OrderConfirmationPage({
  params,
  searchParams,
}: OrderConfirmationPageProps) {
  const { orderNumber } = await params;
  const { token } = await searchParams;

  const adminClient = createAdminClient();
  const currentUser = await getCurrentUser();

  // 1. Secure order lookup: Exclude admin_notes and purchase_cost
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
      subtotal,
      delivery_fee,
      discount_amount,
      total_amount,
      payment_method,
      payment_status,
      order_status,
      created_at,
      order_items (
        id,
        variant_id,
        product_id,
        product_name,
        variant_title,
        sku,
        unit_price,
        quantity,
        total_price
      )
    `)
    .eq('order_number', orderNumber)
    .maybeSingle();

  if (orderError || !orderRaw) {
    notFound();
  }

  // 2. Strict privacy authorization verification:
  // Must match either the unguessable bearer order_token (guest lookup) OR the authenticated user_id
  const isAuthorizedByToken = Boolean(token && orderRaw.order_token && token === orderRaw.order_token);
  const isAuthorizedByUser = Boolean(currentUser && orderRaw.user_id && currentUser.id === orderRaw.user_id);

  if (!isAuthorizedByToken && !isAuthorizedByUser) {
    return (
      <Container size="xl" className="py-16 sm:py-24">
        <div className="max-w-md mx-auto text-center space-y-6">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-amber-950/60 border border-amber-800/80 text-amber-400">
            <AlertCircle className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-serif font-bold text-white">
              Order Access Restricted
            </h1>
            <p className="text-sm text-neutral-400">
              For your privacy, this order details page requires authorization. Please use the secure link sent with your confirmation or sign in to your customer account.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link href="/login">
              <Button variant="gold" className="w-full sm:w-auto font-semibold">
                Sign In to Account
              </Button>
            </Link>
            <Link href="/shop">
              <Button variant="outline" className="w-full sm:w-auto">
                Continue Shopping
              </Button>
            </Link>
          </div>
        </div>
      </Container>
    );
  }

  const order = orderRaw;
  const storeConfig = getStoreConfig();
  const rawWhatsApp = storeConfig.whatsAppNumber || '+94764689907';
  const cleanPhone = rawWhatsApp.replace(/[^0-9]/g, '');

  const whatsAppBankMessage = encodeURIComponent(
    `Hello Splender Jewel,\n\nI placed order ${order.order_number} for ${formatCurrency(order.total_amount)} using bank transfer.\n\nPlease send me your bank account details so I can complete the payment.\n\nThank you.`
  );
  const whatsAppBankUrl = `https://wa.me/${cleanPhone}?text=${whatsAppBankMessage}`;

  const isBankTransfer = order.payment_method === PAYMENT_METHODS.BANK_TRANSFER;
  const formattedDate = new Date(order.created_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Container size="xl" className="py-10 sm:py-16">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Success Header Card */}
        <div className="bg-gradient-to-b from-neutral-900 to-neutral-950 border border-luxury-gold/30 rounded-xl p-6 sm:p-8 text-center space-y-4 shadow-xl">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-emerald-950/80 border border-emerald-700/60 text-emerald-400 shadow-md">
            <CheckCircle2 className="h-8 w-8 stroke-[2]" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-wide">
              Order Confirmed!
            </h1>
            <p className="text-sm text-neutral-300">
              Thank you, <strong className="text-white">{order.customer_name}</strong>. Your jewelry order has been received and logged.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-4 py-2 rounded-full text-xs font-mono text-neutral-300">
            <span>Order Reference:</span>
            <strong className="text-luxury-gold font-bold text-sm tracking-wide">{order.order_number}</strong>
          </div>
        </div>

        {/* Bank Transfer Instructions Card (if applicable) */}
        {isBankTransfer && (
          <div className="bg-amber-950/30 border border-amber-800/60 rounded-xl p-5 sm:p-6 space-y-4 text-neutral-200">
            <div className="flex items-center gap-2.5 text-amber-400">
              <MessageCircle className="h-5 w-5 shrink-0" />
              <h2 className="text-base sm:text-lg font-serif font-bold text-white">
                Bank Transfer Payment Instructions
              </h2>
            </div>

            <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
              Your order has been received and logged in our system. To protect your payment security, bank account details are provided directly through WhatsApp. Please complete the following steps:
            </p>

            <ol className="space-y-2 text-xs sm:text-sm text-neutral-300 list-decimal list-inside pl-1 leading-relaxed">
              <li>
                Tap the button below to request our bank account details via WhatsApp.
              </li>
              <li>
                Transfer the confirmed order total of <strong className="text-white font-semibold">{formatCurrency(order.total_amount)}</strong>.
              </li>
              <li>
                Send a photo or screenshot of your payment receipt / slip to our WhatsApp support.
              </li>
              <li>
                Your payment will remain <span className="text-amber-400 font-medium">Pending Verification</span> until our admin confirms the transfer. Once verified, your order will be dispatched.
              </li>
            </ol>

            <div className="pt-2">
              <a
                href={whatsAppBankUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block w-full sm:w-auto"
              >
                <Button
                  variant="gold"
                  size="lg"
                  className="w-full sm:w-auto min-h-[44px] px-5 py-3 font-semibold flex items-center justify-center gap-2.5 text-center text-xs sm:text-sm text-luxury-black bg-luxury-gold hover:bg-luxury-gold/90 transition-all shadow-md active:scale-[0.99]"
                >
                  <MessageCircle className="h-4 w-4 shrink-0 fill-current" />
                  <span className="whitespace-normal">Get Bank Details via WhatsApp</span>
                </Button>
              </a>
            </div>
          </div>
        )}

        {/* Order Details & Summary Grid */}
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl divide-y divide-neutral-800 overflow-hidden">
          {/* Header Row */}
          <div className="p-6 flex flex-wrap items-center justify-between gap-4 bg-neutral-900/90">
            <div>
              <span className="text-xs text-neutral-400 block">Placed on</span>
              <span className="text-sm font-semibold text-white">{formattedDate}</span>
            </div>

            <div className="flex items-center gap-3">
              <Badge variant="outline" className="border-neutral-700 bg-neutral-950 text-neutral-300 text-xs uppercase tracking-wider">
                {order.order_status}
              </Badge>
              <Badge variant="outline" className="border-luxury-gold/40 bg-luxury-gold/10 text-luxury-gold text-xs">
                {order.payment_method === 'cod' ? 'Cash on Delivery' : 'Bank Transfer'}
              </Badge>
            </div>
          </div>

          {/* Delivery Details */}
          <div className="p-6 space-y-3">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-neutral-400 flex items-center gap-2">
              <Truck className="h-4 w-4 text-luxury-gold" />
              <span>Delivery Details (Sri Lanka)</span>
            </h3>

            <div className="text-sm text-neutral-300 space-y-1">
              <p className="font-semibold text-white">{order.customer_name}</p>
              <p>{order.address_line}{order.city ? `, ${order.city}` : ''}</p>
              <p>{order.district}{order.postal_code ? ` - ${order.postal_code}` : ''}</p>
              <p className="text-xs text-neutral-400 pt-1">
                Primary Phone: <strong className="text-neutral-200">{order.phone1}</strong>
                {order.phone2 ? ` • Secondary: ${order.phone2}` : ''}
              </p>
              {order.delivery_notes && (
                <p className="text-xs text-neutral-400 italic pt-1">
                  Note: &quot;{order.delivery_notes}&quot;
                </p>
              )}
            </div>
          </div>

          {/* Purchased Items List */}
          <div className="p-6 space-y-4">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-neutral-400 flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-luxury-gold" />
              <span>Ordered Jewelry Pieces</span>
            </h3>

            <div className="divide-y divide-neutral-800/80">
              {(order.order_items || []).map((item: any) => (
                <div key={item.id} className="py-3 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-white">{item.product_name}</p>
                    <p className="text-xs text-neutral-400">
                      Variant: {item.variant_title} • Qty: {item.quantity}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-luxury-gold">
                      {formatCurrency(item.total_price)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="p-6 space-y-3 bg-neutral-950/60 text-sm">
            <div className="flex justify-between text-neutral-300">
              <span>Subtotal</span>
              <span className="font-semibold text-white">{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-neutral-300">
              <span>Delivery Charge ({order.payment_method === 'bank_transfer' ? 'Sri Lanka Post Speed Post' : 'Sri Lanka Post COD'})</span>
              <span className="font-semibold text-white">{formatCurrency(order.delivery_fee)}</span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>Discount</span>
                <span>-{formatCurrency(order.discount_amount)}</span>
              </div>
            )}
            <div className="pt-3 border-t border-neutral-800 flex justify-between items-baseline">
              <span className="text-base font-bold text-white">Grand Total</span>
              <span className="text-xl font-bold text-luxury-gold">{formatCurrency(order.total_amount)}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center pt-2">
          <Link href="/shop" className="w-full sm:w-auto">
            <Button variant="outline" className="w-full sm:w-auto">
              Continue Shopping
            </Button>
          </Link>

          {currentUser && (
            <Link href="/account/orders" className="w-full sm:w-auto">
              <Button variant="gold" className="w-full sm:w-auto font-semibold flex items-center justify-center gap-2">
                <span>View My Order History</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </Container>
  );
}
