import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ShoppingBag,
  Package,
  Settings,
  Shield,
  Layers,
  Archive,
  Tag,
  ArrowRight,
  DollarSign,
  Truck,
  MessageCircle,
  CreditCard,
} from 'lucide-react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminDashboardMetrics } from '@/lib/orders/admin-actions';
import { formatCurrency } from '@/lib/config/store';

export default async function AdminDashboardPage() {
  await requireAdminPageAuth();

  const { metrics } = await getAdminDashboardMetrics();

  const adminModules = [
    {
      title: 'Order Management',
      href: '/admin/orders',
      icon: ShoppingBag,
      description: 'Review customer orders, update delivery lifecycle status, and dispatch shipments islandwide.',
    },
    {
      title: 'Payment Settlements',
      href: '/admin/payments',
      icon: CreditCard,
      description: 'Reconcile manual COD courier remittances, track pending collections, and verify WhatsApp bank slips.',
    },
    {
      title: 'Product Catalog & Variants',
      href: '/admin/products',
      icon: Package,
      description: 'Manage jewelry products, multi-attribute variants, SKU codes, pricing, and confidential purchase costs.',
    },
    {
      title: 'Categories',
      href: '/admin/categories',
      icon: Layers,
      description: 'Organize jewelry collections (Rings, Necklaces, Bracelets, Men’s, Anklets).',
    },
    {
      title: 'Inventory & Stock Movements',
      href: '/admin/inventory',
      icon: Archive,
      description: 'Real-time stock level tracking, low-stock thresholds, and stock adjustments.',
    },
    {
      title: 'Discounts & Coupons',
      href: '/admin/coupons',
      icon: Tag,
      description: 'Configure promotional coupon codes and per-customer usage rules.',
    },
    {
      title: 'Store & Delivery Settings',
      href: '/admin/settings/store',
      icon: Settings,
      description: 'Manage store information, WhatsApp contact (+94764689907), and 25-district delivery rates.',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-luxury-gold/15 text-luxury-gold text-xs uppercase tracking-wider font-semibold mb-2">
          <Shield className="h-3.5 w-3.5" />
          <span>Splender Jewel — Admin Workspace</span>
        </div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-white">
          Control Center
        </h1>
        <p className="text-xs text-neutral-400 mt-1 max-w-2xl">
          Complete store administration workspace. All metrics reflect verified transactions and active store status.
        </p>
      </div>

      {/* Primary KPI Metrics Row (Black & Gold Theme) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Orders */}
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400 font-medium">Total Orders</span>
            <div className="p-1.5 rounded bg-neutral-800 text-neutral-300">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-white font-mono">
            {metrics.totalOrders}
          </p>
          <span className="text-[11px] text-neutral-500 block">Lifetime volume</span>
        </div>

        {/* Total Revenue (Confirmed Received Money Only) */}
        <div className="bg-neutral-900/90 border border-luxury-gold/40 rounded-lg p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-300 font-medium">Total Revenue</span>
            <div className="p-1.5 rounded bg-luxury-gold/20 text-luxury-gold">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-luxury-gold font-mono">
            {formatCurrency(metrics.totalRevenue)}
          </p>
          <span className="text-[11px] text-emerald-400/90 font-medium block">
            ✓ Confirmed received funds only
          </span>
        </div>

        {/* Pending COD Settlements */}
        <Link href="/admin/payments?queue=pending_cod" className="block group">
          <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-5 space-y-1 group-hover:border-amber-600/60 transition-all h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs text-amber-400 font-medium">Pending COD Settlements</span>
              <div className="p-1.5 rounded bg-amber-950/60 text-amber-400">
                <Truck className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-amber-300 font-mono">
              {metrics.pendingCodSettlementCount}
            </p>
            <span className="text-[11px] text-neutral-500 block group-hover:text-amber-400 transition-colors">
              Delivered ≠ Paid • Remittance pending →
            </span>
          </div>
        </Link>

        {/* Pending Bank Transfer Verifications */}
        <Link href="/admin/payments?queue=pending_bank_transfer" className="block group">
          <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-5 space-y-1 group-hover:border-emerald-600/60 transition-all h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs text-emerald-400 font-medium">Pending Bank Transfers</span>
              <div className="p-1.5 rounded bg-emerald-950/60 text-emerald-400">
                <MessageCircle className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-emerald-300 font-mono">
              {metrics.pendingBankTransferCount}
            </p>
            <span className="text-[11px] text-neutral-500 block group-hover:text-emerald-400 transition-colors">
              WhatsApp deposit slips to verify →
            </span>
          </div>
        </Link>
      </div>

      {/* Admin Modules Grid */}
      <div className="space-y-4">
        <h2 className="text-base font-serif font-bold text-white tracking-wide">
          Administrative Modules
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {adminModules.map((mod) => {
            const Icon = mod.icon;
            return (
              <Card
                key={mod.href}
                className="border-neutral-800 bg-neutral-900/40 hover:border-luxury-gold/50 transition-all flex flex-col justify-between"
              >
                <CardHeader className="p-5">
                  <div className="h-10 w-10 rounded-sm bg-neutral-800 flex items-center justify-center text-luxury-gold mb-3">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base text-white">{mod.title}</CardTitle>
                  <CardDescription className="text-xs text-neutral-400 mt-2 leading-relaxed">
                    {mod.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                  <Link href={mod.href}>
                    <Button variant="outline" size="sm" className="w-full text-xs space-x-2">
                      <span>Open Module</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
