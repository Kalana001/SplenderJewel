'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShoppingBag, Search, User, Menu, X, Heart } from 'lucide-react';
import { Container } from '@/components/ui/container';
import { getStoreConfig } from '@/lib/config/store';

interface HeaderProps {
  logoUrl?: string | null;
}

export function StoreHeader({ logoUrl }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    <header className="sticky top-0 z-40 w-full bg-luxury-black/95 text-white backdrop-blur-md border-b border-neutral-800">
      {/* Optional Top Announcement Bar */}
      {config.announcementBanner?.enabled && (
        <div className="bg-luxury-gold/20 text-luxury-gold-light text-xs text-center py-1.5 px-4 font-medium border-b border-luxury-gold/20">
          {config.announcementBanner.text}
        </div>
      )}

      <Container size="xl">
        <div className="flex h-16 sm:h-20 items-center justify-between gap-4">
          {/* Mobile Menu Button */}
          <button
            type="button"
            className="inline-flex lg:hidden p-2 text-neutral-300 hover:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>

          {/* Brand / Logo Architecture */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2 group">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt={config.storeName}
                  className="h-8 sm:h-10 w-auto object-contain"
                />
              ) : (
                <div className="flex flex-col">
                  <span className="font-serif text-lg sm:text-xl md:text-2xl font-bold tracking-[0.2em] text-white group-hover:text-luxury-gold-hover transition-colors uppercase">
                    Splender Jewel
                  </span>
                  <span className="text-[9px] uppercase tracking-[0.3em] text-luxury-gold/80 hidden sm:block">
                    Luxury & Elegance
                  </span>
                </div>
              )}
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-8 text-sm tracking-widest uppercase font-medium">
            {navLinks.slice(0, 6).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-neutral-300 hover:text-luxury-gold transition-colors text-xs"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Utility Actions (Search, Wishlist, Account, Cart) */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            <Link
              href="/search"
              className="p-2 text-neutral-300 hover:text-luxury-gold transition-colors"
              aria-label="Search Catalog"
            >
              <Search className="h-5 w-5" />
            </Link>

            <Link
              href="/account/wishlist"
              className="hidden sm:inline-flex p-2 text-neutral-300 hover:text-luxury-gold transition-colors"
              aria-label="Wishlist"
            >
              <Heart className="h-5 w-5" />
            </Link>

            <Link
              href="/account"
              className="p-2 text-neutral-300 hover:text-luxury-gold transition-colors"
              aria-label="Account"
            >
              <User className="h-5 w-5" />
            </Link>

            <Link
              href="/cart"
              className="relative p-2 text-neutral-300 hover:text-luxury-gold transition-colors"
              aria-label="Shopping Cart"
            >
              <ShoppingBag className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </Container>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-neutral-800 bg-luxury-black/98 px-4 py-6 space-y-4">
          <nav className="flex flex-col space-y-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm font-medium uppercase tracking-wider text-neutral-300 hover:text-luxury-gold py-2 border-b border-neutral-800/50"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
