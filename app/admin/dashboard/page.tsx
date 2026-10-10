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
} from 'lucide-react';

export default function AdminDashboardPage() {
  const adminModules = [
    {
      title: 'Order Management',
      href: '/admin/orders',
      icon: ShoppingBag,
      description: 'Review orders, update lifecycle status, and verify WhatsApp bank transfer payments.',
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
      description: 'Organize jewelry collections (Rings, Necklaces, Bracelets, Men’s).',
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
      description: 'Configure promotional coupon codes and usage rules.',
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
          Complete store administration workspace. All modules are architected for dynamic configuration
          without requiring code modifications.
        </p>
      </div>

      {/* Admin Modules Grid */}
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
  );
}
