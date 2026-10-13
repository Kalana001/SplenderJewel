import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Container } from '@/components/ui/container';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SignOutButton } from '@/components/store/sign-out-button';
import { formatCurrency } from '@/lib/config/store';
import {
  User,
  Package,
  MapPin,
  Heart,
  ChevronRight,
  Clock,
  ShieldCheck,
  ShoppingBag,
  Gem,
  ArrowUpRight,
} from 'lucide-react';

export const metadata = {
  title: 'My Account | Splender Jewel',
  description: 'Manage your customer profile, order history, and preferences at Splender Jewel.',
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

export default async function AccountDashboardPage() {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    redirect('/login?error=Database%20service%20unavailable');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/account');
  }

  // Fetch profile record with explicit column projection
  const { data: profile } = await (supabase.from('profiles') as any)
    .select('id, email, full_name, phone1, phone2, avatar_url, account_status, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle();

  // Fetch orders overview with safe column projection omitting admin_notes
  const { data: recentOrders, count: totalOrders } = await (supabase.from('orders') as any)
    .select(`
      id,
      order_number,
      order_status,
      total_amount,
      created_at
    `, { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(3);

  // Fetch address count
  const { count: addressCount } = await (supabase.from('addresses') as any)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  // Fetch wishlist items count for the signed-in customer
  let wishlistCount = 0;
  const { data: userWishlist } = await (supabase.from('wishlists') as any)
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (userWishlist?.id) {
    const { count: itemsCount } = await (supabase.from('wishlist_items') as any)
      .select('id', { count: 'exact', head: true })
      .eq('wishlist_id', userWishlist.id);
    wishlistCount = itemsCount ?? 0;
  }

  const displayName = profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Customer';
  const memberSince = new Date(profile?.created_at || user.created_at).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="py-8 sm:py-12 bg-neutral-50/50 dark:bg-neutral-950/30 min-h-[80vh]">
      <Container size="xl">
        {/* Welcome Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-8 border-b border-neutral-200 dark:border-neutral-800 gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-full bg-luxury-gold/15 border border-luxury-gold/30 flex items-center justify-center text-luxury-gold font-serif text-2xl font-bold shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  Hello, {displayName}
                </h1>
                <span className="inline-flex items-center text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <ShieldCheck className="h-3 w-3 mr-1" /> Verified Member
                </span>
              </div>
              <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                {user.email} &bull; Member since {memberSince}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="border-luxury-gold/40 hover:border-luxury-gold text-neutral-800 dark:text-neutral-200 hover:text-luxury-gold hover:bg-luxury-gold/10 uppercase tracking-[0.16em] text-[11px] font-semibold transition-all duration-300 shadow-sm"
            >
              <Link href="/shop" className="inline-flex items-center space-x-1.5">
                <Gem className="h-3.5 w-3.5 text-luxury-gold" />
                <span>Explore Catalog</span>
                <ArrowUpRight className="h-3 w-3 opacity-60" />
              </Link>
            </Button>
            <SignOutButton variant="ghost" size="sm" />
          </div>
        </div>

        {/* Quick Navigation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 my-8">
          {/* Orders */}
          <Link href="/account/orders" className="group">
            <Card className="h-full border border-neutral-200 dark:border-neutral-800 transition-all duration-200 hover:border-luxury-gold/60 hover:shadow-md">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div className="p-2.5 rounded-sm bg-neutral-100 dark:bg-neutral-800 text-luxury-gold group-hover:bg-luxury-gold group-hover:text-luxury-black transition-colors">
                  <Package className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-luxury-gold transition-colors group-hover:translate-x-0.5" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-foreground font-serif">
                  {totalOrders ?? 0}
                </div>
                <CardTitle className="text-sm font-sans font-medium text-foreground mt-0.5">
                  Order History
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  Track ongoing shipments and view past receipts
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          {/* Profile & Credentials */}
          <Link href="/account/profile" className="group">
            <Card className="h-full border border-neutral-200 dark:border-neutral-800 transition-all duration-200 hover:border-luxury-gold/60 hover:shadow-md">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div className="p-2.5 rounded-sm bg-neutral-100 dark:bg-neutral-800 text-luxury-gold group-hover:bg-luxury-gold group-hover:text-luxury-black transition-colors">
                  <User className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-luxury-gold transition-colors group-hover:translate-x-0.5" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-foreground font-serif">
                  Profile
                </div>
                <CardTitle className="text-sm font-sans font-medium text-foreground mt-0.5">
                  Personal Details
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  Manage contact numbers, identity, and security
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          {/* Addresses */}
          <Link href="/account/addresses" className="group">
            <Card className="h-full border border-neutral-200 dark:border-neutral-800 transition-all duration-200 hover:border-luxury-gold/60 hover:shadow-md">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div className="p-2.5 rounded-sm bg-neutral-100 dark:bg-neutral-800 text-luxury-gold group-hover:bg-luxury-gold group-hover:text-luxury-black transition-colors">
                  <MapPin className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-luxury-gold transition-colors group-hover:translate-x-0.5" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-foreground font-serif">
                  {addressCount ?? 0}
                </div>
                <CardTitle className="text-sm font-sans font-medium text-foreground mt-0.5">
                  Saved Addresses
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  Manage Sri Lankan delivery addresses
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          {/* Wishlist */}
          <Link href="/account/wishlist" className="group">
            <Card className="h-full border border-neutral-200 dark:border-neutral-800 transition-all duration-200 hover:border-luxury-gold/60 hover:shadow-md">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div className="p-2.5 rounded-sm bg-neutral-100 dark:bg-neutral-800 text-luxury-gold group-hover:bg-luxury-gold group-hover:text-luxury-black transition-colors">
                  <Heart className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-luxury-gold transition-colors group-hover:translate-x-0.5" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-foreground font-serif">
                  {wishlistCount ?? 0}
                </div>
                <CardTitle className="text-sm font-sans font-medium text-foreground mt-0.5">
                  My Wishlist
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  Saved luxury jewelry pieces for later
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Recent Orders Section */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-serif text-xl font-bold text-foreground">Recent Orders</h2>
              <p className="text-xs text-neutral-500">Your most recent purchases and their delivery status</p>
            </div>
            {totalOrders && totalOrders > 0 ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/account/orders">View All ({totalOrders})</Link>
              </Button>
            ) : null}
          </div>

          {recentOrders && recentOrders.length > 0 ? (
            <div className="space-y-3">
              {recentOrders.map((order: any) => (
                <div
                  key={order.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-sm border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-luxury-surface hover:border-luxury-gold/50 transition-colors gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-semibold text-foreground">
                        #{order.order_number}
                      </span>
                      <Badge variant={getStatusBadgeVariant(order.order_status || order.status || 'pending')}>
                        {(order.order_status || order.status || 'pending').toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-3 text-xs text-neutral-500">
                      <span className="flex items-center">
                        <Clock className="h-3.5 w-3.5 mr-1" />
                        {new Date(order.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      <span>&bull;</span>
                      <span className="font-medium text-foreground">
                        {formatCurrency(Number(order.total_amount ?? order.total ?? 0))}
                      </span>
                    </div>
                  </div>

                  <div>
                    <Button asChild variant="outline" size="sm" className="text-xs">
                      <Link href={`/account/orders/${order.id}`}>
                        View Details
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Card className="border border-dashed border-neutral-300 dark:border-neutral-800 text-center py-12 px-4 bg-transparent">
              <Package className="h-10 w-10 text-neutral-400 mx-auto mb-3" />
              <h3 className="font-serif text-base font-semibold text-foreground">
                No orders placed yet
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto mt-1 mb-6">
                Explore our fine handcrafted jewelry collection and place your first order.
              </p>
              <Button asChild variant="gold" size="sm" className="uppercase tracking-wider text-xs font-semibold">
                <Link href="/shop">Start Shopping</Link>
              </Button>
            </Card>
          )}
        </div>
      </Container>
    </div>
  );
}
