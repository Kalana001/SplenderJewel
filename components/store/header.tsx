'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShoppingBag, Search, User, Menu, X, Heart, LogOut } from 'lucide-react';
import { Container } from '@/components/ui/container';
import { getStoreConfig, getInstagramLink } from '@/lib/config/store';
import { InstagramIcon } from '@/components/icons/instagram';
import { twMerge } from 'tailwind-merge';
import { useCart } from '@/lib/cart/cart-context';
import { createClient } from '@/lib/supabase/client';
import { signOutCustomer } from '@/lib/auth/actions';
import type { Category } from '@/types/product';

interface HeaderProps {
  logoUrl?: string | null;
  categories?: Category[];
}

export function StoreHeader({ logoUrl, categories = [] }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const config = getStoreConfig();
  const { totalCount, isLoaded } = useCart();

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    let isMounted = true;

    // Check existing customer session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
        setIsAuthenticated(!!session?.user);
      }
    });

    // Listen to Supabase auth events (sign in, sign out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setIsAuthenticated(!!session?.user);
      }
    });

    const handleCustomSignOut = () => {
      if (isMounted) setIsAuthenticated(false);
    };
    const handleCustomSignIn = () => {
      if (isMounted) setIsAuthenticated(true);
    };

    window.addEventListener('splender:auth-signed-out', handleCustomSignOut);
    window.addEventListener('splender:auth-signed-in', handleCustomSignIn);

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
      window.removeEventListener('splender:auth-signed-out', handleCustomSignOut);
      window.removeEventListener('splender:auth-signed-in', handleCustomSignIn);
    };
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutError(null);
    try {
      const result = await signOutCustomer();
      if (result && !result.success) {
        setLogoutError(result.error || 'Failed to log out. Please try again.');
        return;
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('splender:auth-signed-out'));
      }
      setMobileMenuOpen(false);
      if (pathname === '/') {
        router.refresh();
      } else {
        router.push('/');
      }
    } catch (err: any) {
      console.error('[Header] Logout error:', err);
      setLogoutError(err?.message || 'Failed to log out. Please try again.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const dynamicCategoryLinks = React.useMemo(() => {
    const seenSlugs = new Set<string>();
    const links: Array<{ label: string; href: string }> = [];

    for (const cat of categories) {
      if (!cat || !cat.slug || !cat.name || cat.isActive === false) continue;
      const cleanSlug = cat.slug.toLowerCase().trim();
      if (!cleanSlug || seenSlugs.has(cleanSlug)) continue;
      // Prevent colliding with static top-level routes
      if (cleanSlug === 'shop' || cleanSlug === 'about' || cleanSlug === 'contact') continue;
      seenSlugs.add(cleanSlug);

      links.push({
        label: cat.name,
        href: `/category/${encodeURIComponent(cleanSlug)}`,
      });
    }

    return links;
  }, [categories]);

  const navLinks = React.useMemo(
    () => [
      { label: 'Shop All', href: '/shop' },
      ...dynamicCategoryLinks,
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ],
    [dynamicCategoryLinks]
  );

  return (
    <header className="sticky top-0 z-40 w-full bg-luxury-black/95 text-white backdrop-blur-md border-b border-neutral-850">
      {/* Optional Top Announcement Bar */}
      {config.announcementBanner?.enabled && (
        <div className="bg-luxury-gold/15 text-luxury-gold-light text-xs text-center py-1.5 px-4 font-medium border-b border-luxury-gold/20 tracking-wider">
          {config.announcementBanner.text}
        </div>
      )}

      {/* Main Header Bar */}
      <Container size="xl">
        <div className="relative flex items-center justify-between h-14 sm:h-16">
          {/* Left: Mobile Menu Toggle & Search Action */}
          <div className="flex items-center space-x-0.5 sm:space-x-2 z-10 shrink-0">
            <button
              type="button"
              className="inline-flex lg:hidden p-1.5 sm:p-2 text-neutral-300 hover:text-white transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <Link
              href="/search"
              className="inline-flex items-center space-x-2 text-xs tracking-wider text-neutral-400 hover:text-white transition-colors p-1.5 sm:py-1.5 sm:px-3 rounded-full sm:border sm:border-neutral-800 sm:hover:border-luxury-gold/40 sm:bg-neutral-900/60"
              aria-label="Search Catalog"
            >
              <Search className="h-4 w-4 text-luxury-gold" />
              <span className="hidden sm:inline text-[11px] uppercase tracking-widest text-neutral-300 font-medium">Search</span>
            </Link>
          </div>

          {/* Center: Truly Centered Brand Logo & Typography */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center text-center max-w-[50%] sm:max-w-none">
            <Link href="/" className="flex items-center space-x-1.5 sm:space-x-2.5 group py-1" aria-label="Splender Jewel Home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl || config.logoUrl || '/images/logo.png'}
                alt={config.storeName}
                className="h-6 sm:h-8 md:h-9 w-auto object-contain transition-transform duration-300 group-hover:scale-105 shrink-0"
              />
              <div className="flex flex-col text-left whitespace-nowrap">
                <span className="font-serif text-xs sm:text-base md:text-lg font-bold tracking-[0.16em] sm:tracking-[0.22em] text-white group-hover:text-luxury-gold transition-colors uppercase leading-none">
                  Splender
                </span>
                <span className="hidden sm:block text-[7px] sm:text-[8px] uppercase tracking-[0.3em] text-luxury-gold font-medium mt-1 leading-none">
                  The Jewel Gallery
                </span>
              </div>
            </Link>
          </div>

          {/* Right: Customer Utilities (Wishlist, Account, Cart) */}
          <div className="flex items-center justify-end space-x-0.5 sm:space-x-1 z-10 shrink-0">
            <Link
              href="/account/wishlist"
              className="p-1.5 sm:p-2 text-neutral-300 hover:text-luxury-gold transition-colors"
              aria-label="Wishlist"
            >
              <Heart className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </Link>

            <Link
              href="/account"
              className="p-1.5 sm:p-2 text-neutral-300 hover:text-luxury-gold transition-colors"
              aria-label="Account"
            >
              <User className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </Link>

            <Link
              href="/cart"
              className="relative p-1.5 sm:p-2 text-neutral-300 hover:text-luxury-gold transition-colors"
              aria-label="Shopping Cart"
            >
              <ShoppingBag className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
              {isLoaded && totalCount > 0 && (
                <span className="absolute 0 top-0.5 right-0.5 sm:top-1 sm:right-1 flex h-4 w-4 items-center justify-center rounded-full bg-luxury-gold text-[10px] font-bold text-luxury-black shadow-sm">
                  {totalCount > 99 ? '99+' : totalCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </Container>

      {/* Dedicated Centered Navigation Row */}
      <nav className="hidden lg:block border-t border-neutral-850/80 bg-neutral-950/80">
        <Container size="xl">
          <div className="flex items-center lg:justify-center space-x-4 lg:space-x-6 xl:space-x-8 py-2 text-[11px] xl:text-xs tracking-[0.18em] uppercase font-medium whitespace-nowrap overflow-x-auto scrollbar-none px-2">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || (link.href !== '/' && (pathname === link.href || pathname.startsWith(`${link.href}/`)));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={twMerge(
                    'py-1 relative group transition-colors',
                    isActive ? 'text-luxury-gold font-semibold' : 'text-neutral-300 hover:text-luxury-gold'
                  )}
                >
                  <span>{link.label}</span>
                  <span
                    className={twMerge(
                      'absolute bottom-0 left-0 h-[1.5px] bg-luxury-gold transition-all duration-300',
                      isActive ? 'w-full' : 'w-0 group-hover:w-full'
                    )}
                  />
                </Link>
              );
            })}
          </div>
        </Container>
      </nav>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-neutral-800 bg-luxury-black/98 px-4 py-5 space-y-4 shadow-xl">
          <nav className="flex flex-col space-y-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || (link.href !== '/' && (pathname === link.href || pathname.startsWith(`${link.href}/`)));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={twMerge(
                    'text-xs uppercase tracking-wider py-2.5 px-2 rounded-sm transition-colors border-b border-neutral-900',
                    isActive ? 'text-luxury-gold font-semibold bg-luxury-gold/5' : 'text-neutral-300 hover:text-luxury-gold'
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="pt-3 border-t border-neutral-800/80 flex flex-col space-y-2">
            <Link
              href="/account"
              onClick={() => setMobileMenuOpen(false)}
              className="inline-flex items-center space-x-2 text-xs text-neutral-400 hover:text-luxury-gold transition-colors py-1 px-2"
            >
              <User className="h-4 w-4" />
              <span>My Account & Orders</span>
            </Link>

            {isAuthenticated && (
              <div className="flex flex-col space-y-1">
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="inline-flex items-center space-x-2 text-xs text-neutral-400 hover:text-luxury-gold transition-colors py-1.5 px-2 text-left disabled:opacity-50 min-h-[44px]"
                  aria-label="Log Out"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span>{isLoggingOut ? 'Logging Out...' : 'Log Out'}</span>
                </button>
                {logoutError && (
                  <p className="text-[11px] text-red-400 px-2" role="alert">
                    {logoutError}
                  </p>
                )}
              </div>
            )}

            <a
              href={getInstagramLink(config)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 text-xs text-luxury-gold hover:text-luxury-gold-light transition-colors py-1 px-2"
            >
              <InstagramIcon className="h-4 w-4" />
              <span>Follow @splender_jewel on Instagram</span>
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
