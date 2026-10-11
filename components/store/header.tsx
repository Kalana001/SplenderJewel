'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingBag, Search, User, Menu, X, Heart } from 'lucide-react';
import { Container } from '@/components/ui/container';
import { getStoreConfig, getInstagramLink } from '@/lib/config/store';
import { InstagramIcon } from '@/components/icons/instagram';
import { twMerge } from 'tailwind-merge';

interface HeaderProps {
  logoUrl?: string | null;
}

export function StoreHeader({ logoUrl }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const config = getStoreConfig();

  const navLinks = [
    { label: 'Shop All', href: '/shop' },
    { label: 'Rings', href: '/category/rings' },
    { label: 'Necklaces', href: '/category/necklaces' },
    { label: 'Bracelets', href: '/category/bracelets' },
    { label: 'Earrings', href: '/category/earrings' },
    { label: 'Men’s Collection', href: '/category/men' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ];

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
          <div className="flex items-center space-x-1 sm:space-x-2 z-10">
            <button
              type="button"
              className="inline-flex lg:hidden p-2 text-neutral-300 hover:text-white transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <Link
              href="/search"
              className="inline-flex items-center space-x-2 text-xs tracking-wider text-neutral-400 hover:text-white transition-colors p-2 sm:py-1.5 sm:px-3 rounded-full sm:border sm:border-neutral-800 sm:hover:border-luxury-gold/40 sm:bg-neutral-900/60"
              aria-label="Search Catalog"
            >
              <Search className="h-4 w-4 text-luxury-gold" />
              <span className="hidden sm:inline text-[11px] uppercase tracking-widest text-neutral-300 font-medium">Search</span>
            </Link>
          </div>

          {/* Center: Truly Centered Brand Logo & Typography */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center text-center">
            <Link href="/" className="flex items-center space-x-2 sm:space-x-2.5 group py-1" aria-label="Splender Jewel Home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl || config.logoUrl || '/images/logo.png'}
                alt={config.storeName}
                className="h-7 sm:h-8 md:h-9 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
              />
              <div className="flex flex-col text-left whitespace-nowrap">
                <span className="font-serif text-sm sm:text-base md:text-lg font-bold tracking-[0.22em] text-white group-hover:text-luxury-gold transition-colors uppercase leading-none">
                  Splender
                </span>
                <span className="text-[7px] sm:text-[8px] uppercase tracking-[0.3em] text-luxury-gold font-medium mt-1 leading-none">
                  The Jewel Gallery
                </span>
              </div>
            </Link>
          </div>

          {/* Right: Customer Utilities (Wishlist, Account, Cart) */}
          <div className="flex items-center justify-end space-x-0.5 sm:space-x-1 z-10">
            <Link
              href="/account/wishlist"
              className="p-2 text-neutral-300 hover:text-luxury-gold transition-colors"
              aria-label="Wishlist"
            >
              <Heart className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </Link>

            <Link
              href="/account"
              className="hidden sm:inline-flex p-2 text-neutral-300 hover:text-luxury-gold transition-colors"
              aria-label="Account"
            >
              <User className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </Link>

            <Link
              href="/cart"
              className="relative p-2 text-neutral-300 hover:text-luxury-gold transition-colors"
              aria-label="Shopping Cart"
            >
              <ShoppingBag className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </Link>
          </div>
        </div>
      </Container>

      {/* Dedicated Centered Navigation Row */}
      <nav className="hidden lg:block border-t border-neutral-850/80 bg-neutral-950/80">
        <Container size="xl">
          <div className="flex items-center justify-center space-x-6 xl:space-x-8 py-2 text-[11px] xl:text-xs tracking-[0.18em] uppercase font-medium whitespace-nowrap">
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
