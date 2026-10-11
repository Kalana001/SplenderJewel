'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Layers,
  Archive,
  Users,
  Tag,
  Star,
  Image,
  Sliders,
  FileText,
  BarChart3,
  Settings,
  ShieldCheck,
  History,
  Store,
  Printer,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';

interface AdminSidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function AdminSidebar({ mobileOpen, onCloseMobile }: AdminSidebarProps) {
  const pathname = usePathname();

  const navGroups = [
    {
      group: 'Overview',
      items: [
        { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
        { label: 'Analytics & Reports', href: '/admin/reports', icon: BarChart3 },
      ],
    },
    {
      group: 'Sales & Catalog',
      items: [
        { label: 'Orders', href: '/admin/orders', icon: ShoppingBag },
        { label: 'Products', href: '/admin/products', icon: Package },
        { label: 'Categories', href: '/admin/categories', icon: Layers },
        { label: 'Inventory', href: '/admin/inventory', icon: Archive },
        { label: 'Customers', href: '/admin/customers', icon: Users },
      ],
    },
    {
      group: 'Marketing & Content',
      items: [
        { label: 'Coupons & Discounts', href: '/admin/coupons', icon: Tag },
        { label: 'Reviews', href: '/admin/reviews', icon: Star },
        { label: 'Banners', href: '/admin/banners', icon: Image },
        { label: 'Homepage Layout', href: '/admin/homepage', icon: Sliders },
        { label: 'Pages & Content', href: '/admin/content', icon: FileText },
      ],
    },
    {
      group: 'Settings & System',
      items: [
        { label: 'Store Settings', href: '/admin/settings/store', icon: Store },
        { label: 'Delivery Matrix', href: '/admin/settings/delivery', icon: Settings },
        { label: 'Payment Settings', href: '/admin/settings/payments', icon: Settings },
        { label: 'WhatsApp Settings', href: '/admin/settings/whatsapp', icon: Settings },
        { label: 'Package Label Print', href: '/admin/settings/print-template', icon: Printer },
        { label: 'Admin Users', href: '/admin/admin-user', icon: ShieldCheck },
        { label: 'Audit Log', href: '/admin/audit-log', icon: History },
      ],
    },
  ];

  const sidebarContent = (
    <div className="flex h-full flex-col bg-luxury-black text-neutral-300 border-r border-neutral-800">
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-6 border-b border-neutral-800">
        <Link href="/admin/dashboard" className="flex items-center space-x-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/logo.png"
            alt="Splender Jewel"
            className="h-9 w-auto object-contain rounded border border-luxury-gold/30 p-0.5 bg-black"
          />
          <div className="flex flex-col">
            <span className="font-serif text-sm font-bold tracking-[0.15em] text-white uppercase">
              Splender
            </span>
            <span className="text-[9px] text-luxury-gold uppercase tracking-widest font-medium">
              Admin Workspace
            </span>
          </div>
        </Link>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="lg:hidden text-neutral-400 hover:text-white"
            aria-label="Close Sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 text-xs">
        {navGroups.map((group) => (
          <div key={group.group} className="space-y-1">
            <h5 className="px-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              {group.group}
            </h5>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onCloseMobile}
                    className={clsx(
                      'flex items-center space-x-3 px-3 py-2 rounded-sm font-medium transition-colors',
                      isActive
                        ? 'bg-luxury-gold/15 text-luxury-gold-light border-l-2 border-luxury-gold'
                        : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Storefront Quick Link */}
      <div className="p-4 border-t border-neutral-800 text-xs">
        <Link
          href="/"
          target="_blank"
          className="flex items-center justify-center space-x-2 w-full py-2 px-3 rounded-sm border border-neutral-700 text-neutral-300 hover:text-luxury-gold hover:border-luxury-gold/50 transition-colors"
        >
          <Store className="h-3.5 w-3.5" />
          <span>View Live Storefront</span>
        </Link>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="fixed inset-y-0 left-0 w-72 max-w-full z-50">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
