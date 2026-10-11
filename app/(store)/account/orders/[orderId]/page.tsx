import React from 'react';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Container } from '@/components/ui/container';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/config/store';
import { ArrowLeft, Clock, MapPin, PackageCheck, Receipt, ShieldCheck } from 'lucide-react';

interface AccountOrderDetailPageProps {
  params: Promise<{ orderId: string }>;
}

function getStatusBadgeVariant(status: string) {
  switch (status.toLowerCase()) {
    case 'delivered':
      return 'success';
    case 'confirmed':
    case 'shipped':
      return 'gold';
    case 'pending':
      return 'warning';
    case 'cancelled':
      return 'danger';
    default:
      return 'outline';
  }
}

export default async function AccountOrderDetailPage({ params }: AccountOrderDetailPageProps) {
  const { orderId } = await params;
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    redirect('/login?error=Database%20service%20unavailable');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=/account/orders/${orderId}`);
  }

  // Strictly enforce customer ownership: query by order id AND user_id with safe column projection
  const { data: order, error } = await (supabase.from('orders') as any)
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
      created_at,
      updated_at,
      order_items (
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
      )
    `)
    .eq('id', orderId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !order) {
    notFound();
  }

  const orderDate = new Date(order.created_at).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const currentStatus = (order.order_status || order.status || 'pending').toLowerCase();
  const deliveryFee = Number(order.delivery_fee ?? order.shipping_fee ?? 0);
  const grandTotal = Number(order.total_amount ?? order.total ?? 0);

  return (
    <div className="py-8 sm:py-12 bg-neutral-50/50 dark:bg-neutral-950/30 min-h-[80vh]">
      <Container size="xl">
        {/* Breadcrumb Navigation */}
        <div className="mb-6">
          <Link
            href="/account/orders"
            className="inline-flex items-center space-x-1.5 text-xs text-neutral-500 hover:text-luxury-gold transition-colors font-medium"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to All Orders</span>
          </Link>
        </div>

        {/* Order Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-neutral-200 dark:border-neutral-800 gap-4 mb-8">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Order #{order.order_number}
              </h1>
              <Badge variant={getStatusBadgeVariant(currentStatus)}>
                {currentStatus.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center space-x-2 text-xs text-neutral-500 mt-1">
              <Clock className="h-3.5 w-3.5" />
              <span>Placed on {orderDate}</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-neutral-500">Order Token:</span>
            <code className="text-xs font-mono bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded text-foreground">
              {order.order_token ? `${order.order_token.slice(0, 8)}...` : 'N/A'}
            </code>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Order Items */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-luxury-surface">
              <CardHeader className="pb-3 border-b border-neutral-100 dark:border-neutral-850">
                <CardTitle className="text-base font-serif flex items-center space-x-2">
                  <Receipt className="h-4 w-4 text-luxury-gold" />
                  <span>Itemized Order Details</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {order.order_items && order.order_items.length > 0 ? (
                  <div className="divide-y divide-neutral-100 dark:divide-neutral-850">
                    {order.order_items.map((item: any) => (
                      <div key={item.id} className="p-4 sm:p-5 flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <h4 className="text-sm font-semibold text-foreground">
                            {item.product_name}
                          </h4>
                          {item.variant_title && (
                            <p className="text-xs text-neutral-500">
                              Variant: {item.variant_title}
                            </p>
                          )}
                          <p className="text-xs text-neutral-400">
                            Qty: {item.quantity} &times; {formatCurrency(Number(item.unit_price) || 0)}
                          </p>
                        </div>
                        <div className="text-sm font-semibold text-foreground text-right shrink-0">
                          {formatCurrency(Number(item.total_price) || (item.quantity * item.unit_price) || 0)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-neutral-500">
                    No item details available for this order.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Delivery Details */}
            <Card className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-luxury-surface">
              <CardHeader className="pb-3 border-b border-neutral-100 dark:border-neutral-850">
                <CardTitle className="text-base font-serif flex items-center space-x-2">
                  <MapPin className="h-4 w-4 text-luxury-gold" />
                  <span>Delivery Address</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-2 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300">
                <p className="font-semibold text-foreground">{order.customer_name}</p>
                <p>{order.address_line}</p>
                <p>
                  {order.district}
                  {order.city ? `, ${order.city}` : ''}
                  {order.postal_code ? ` ${order.postal_code}` : ''}
                </p>
                <p className="text-neutral-500 pt-1">
                  Contact: {order.phone1} {order.phone2 ? `/ ${order.phone2}` : ''}
                </p>
                {order.delivery_notes && (
                  <p className="text-neutral-500 italic pt-1">
                    Notes: &ldquo;{order.delivery_notes}&rdquo;
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Cost Summary */}
          <div>
            <Card className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-luxury-surface sticky top-24">
              <CardHeader className="pb-3 border-b border-neutral-100 dark:border-neutral-850">
                <CardTitle className="text-base font-serif flex items-center space-x-2">
                  <ShieldCheck className="h-4 w-4 text-luxury-gold" />
                  <span>Order Summary</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-3 text-xs sm:text-sm">
                <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                  <span>Subtotal</span>
                  <span>{formatCurrency(Number(order.subtotal) || 0)}</span>
                </div>

                <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                  <span>Delivery Fee</span>
                  <span>
                    {deliveryFee === 0 ? (
                      <span className="text-emerald-600 font-medium">Free</span>
                    ) : (
                      formatCurrency(deliveryFee)
                    )}
                  </span>
                </div>

                {Number(order.discount_amount) > 0 && (
                  <div className="flex justify-between text-luxury-gold">
                    <span>Discount</span>
                    <span>-{formatCurrency(Number(order.discount_amount) || 0)}</span>
                  </div>
                )}

                <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-between font-bold text-base text-foreground">
                  <span>Grand Total</span>
                  <span>{formatCurrency(grandTotal)}</span>
                </div>

                <div className="pt-4 border-t border-neutral-100 dark:border-neutral-850">
                  <div className="text-xs text-neutral-500 mb-3">
                    Payment Method:{' '}
                    <span className="font-semibold text-foreground uppercase">
                      {order.payment_method || 'Cash on Delivery'}
                    </span>
                  </div>
                  <Button asChild variant="outline" size="sm" className="w-full text-xs">
                    <Link href="/contact">Need help with this order?</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </Container>
    </div>
  );
}
