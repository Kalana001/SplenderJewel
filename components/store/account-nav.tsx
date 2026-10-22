'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Container } from '@/components/ui/container';
import { LayoutDashboard, Package, Heart, MapPin, User, Star, Loader2 } from 'lucide-react';

export interface AccountNavItem {
  href: string;
  label: string;
  exact?: boolean;
}

export const ACCOUNT_NAV_ITEMS: readonly AccountNavItem[] = [
  { href: '/account', label: 'Overview', exact: true },
  { href: '/account/orders', label: 'Order History' },
  { href: '/account/wishlist', label: 'Wishlist' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/profile', label: 'Profile' },
  { href: '/account/reviews', label: 'Reviews' },
] as const;

const NAV_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '/account': LayoutDashboard,
  '/account/orders': Package,
  '/account/wishlist': Heart,
  '/account/addresses': MapPin,
  '/account/profile': User,
  '/account/reviews': Star,
};

/**
 * Determines whether an account navigation item is active for the given pathname.
 */
export function isAccountNavItemActive(pathname: string | null | undefined, item: AccountNavItem): boolean {
  if (!pathname) return false;
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AccountNav() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    if (!pendingHref) return;
    const timer = setTimeout(() => {
      setPendingHref(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [pendingHref]);

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-luxury-black/90 backdrop-blur-sm">
      <Container size="xl">
        <nav
          aria-label="Customer account navigation"
          className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-2.5 no-scrollbar"
        >
          {ACCOUNT_NAV_ITEMS.map((item) => {
            const isCurrent = isAccountNavItemActive(pathname, item);
            const isPending = pendingHref === item.href && pathname !== item.href;
            const isHighlighted = isCurrent || isPending;
            const Icon = NAV_ICONS[item.href] || LayoutDashboard;

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                aria-current={isCurrent ? 'page' : undefined}
                aria-busy={isPending ? 'true' : undefined}
                onClick={(event) => {
                  if (
                    pathname !== item.href &&
                    event.button === 0 &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.shiftKey &&
                    !event.altKey
                  ) {
                    setPendingHref(item.href);
                  }
                }}
                className={`inline-flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-sm text-xs font-medium tracking-wide transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-luxury-gold ${
                  isHighlighted
                    ? 'bg-luxury-gold/15 text-luxury-gold border border-luxury-gold/40 font-semibold shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 border border-transparent hover:text-luxury-gold hover:bg-neutral-100/70 dark:hover:bg-neutral-900/70'
                }`}
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-luxury-gold shrink-0" aria-hidden="true" />
                ) : (
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </Container>
    </div>
  );
}
