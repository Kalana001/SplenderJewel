import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Container } from '@/components/ui/container';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/config/store';
import { Package, ArrowLeft, Clock, Eye, Truck, Gem, ArrowRight } from 'lucide-react';

export const metadata = {
  title: 'Order History | Splender Jewel',
  description: 'View your past orders and shipping status with Splender Jewel.',
};

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

export default async function AccountOrdersPage() {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    redirect('/login?error=Database%20service%20unavailable');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/account/orders');
  }

  const { data: orders } = await (supabase.from('orders') as any)
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <div className="py-8 sm:py-12 bg-neutral-50/50 dark:bg-neutral-950/30 min-h-[80vh]">
      <Container size="xl">
        {/* Breadcrumb Navigation */}
        <div className="mb-6">
          <Link
            href="/account"
            className="inline-flex items-center space-x-1.5 text-xs text-neutral-500 hover:text-luxury-gold transition-colors font-medium"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to My Account</span>
          </Link>
        </div>

        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-sm bg-luxury-gold/15 text-luxury-gold">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Order History
              </h1>
              <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                Track your ongoing shipments, past orders, and receipts.
              </p>
            </div>
          </div>
        </div>

        {orders && orders.length > 0 ? (
          <div className="space-y-4">
            {orders.map((order: any) => {
              const orderDate = new Date(order.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });

              return (
                <Card
                  key={order.id}
                  className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-luxury-surface hover:border-luxury-gold/50 transition-colors"
                >
                  <CardContent className="p-5 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-100 dark:border-neutral-850">
                      <div>
                        <div className="flex items-center space-x-3">
                          <span className="font-mono text-sm font-bold text-foreground">
                            Order #{order.order_number}
                          </span>
                          <Badge variant={getStatusBadgeVariant(order.status)}>
                            {order.status.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-neutral-500 mt-1">
                          <Clock className="h-3.5 w-3.5" />
                          <span>Placed on {orderDate}</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4 sm:text-right">
                        <div>
                          <div className="text-xs text-neutral-500">Total Amount</div>
                          <div className="font-semibold text-base sm:text-lg text-foreground">
                            {formatCurrency(Number(order.total) || 0)}
                          </div>
                        </div>

                        <Button asChild variant="outline" size="sm" className="text-xs shrink-0">
                          <Link href={`/account/orders/${order.id}`}>
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            View Details
                          </Link>
                        </Button>
                      </div>
                    </div>

                    <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs text-neutral-600 dark:text-neutral-400">
                      <div>
                        <span className="font-medium text-foreground">Recipient: </span>
                        {order.customer_name} ({order.phone1})
                      </div>
                      <div className="sm:col-span-1 lg:col-span-2">
                        <span className="font-medium text-foreground">Delivery To: </span>
                        {order.address_line}, {order.district}
                        {order.city ? `, ${order.city}` : ''}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border border-dashed border-neutral-300 dark:border-neutral-800 text-center py-16 px-4 bg-transparent">
            <Truck className="h-12 w-12 text-neutral-400 mx-auto mb-3" />
            <h3 className="font-serif text-lg font-semibold text-foreground">
              No orders placed yet
            </h3>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 max-w-md mx-auto mt-1 mb-6">
              When you purchase pieces from Splender Jewel, your order tracking, courier details, and itemized receipts will appear here.
            </p>
            <Button asChild variant="gold" size="md" className="uppercase tracking-[0.18em] text-xs font-semibold shadow-md shadow-luxury-gold/10">
              <Link href="/shop" className="inline-flex items-center space-x-2">
                <Gem className="h-4 w-4" />
                <span>Explore Catalog</span>
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          </Card>
        )}
      </Container>
    </div>
  );
}
