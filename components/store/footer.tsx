import React from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { getStoreConfig, getWhatsAppLink, getInstagramLink } from '@/lib/config/store';
import { MessageCircle } from 'lucide-react';
import { InstagramIcon } from '@/components/icons/instagram';
import type { Category } from '@/types/product';

interface FooterProps {
  categories?: Category[];
}

export function StoreFooter({ categories = [] }: FooterProps = {}) {
  const config = getStoreConfig();
  const currentYear = new Date().getFullYear();

  const activeCategories = (categories || [])
    .filter((cat) => Boolean(cat && cat.slug && cat.name && cat.isActive !== false))
    .slice(0, 6);

  return (
    <footer className="bg-luxury-black text-neutral-300 border-t border-neutral-800 pt-16 pb-12 text-sm">
      <Container size="xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand & Mission */}
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={config.logoUrl || '/images/logo.png'}
                alt={config.storeName}
                className="h-12 w-auto object-contain rounded border border-luxury-gold/30 p-0.5 bg-black"
              />
              <div className="flex flex-col">
                <span className="font-serif text-lg font-bold tracking-[0.2em] text-white uppercase block">
                  Splender
                </span>
                <span className="text-[10px] uppercase tracking-[0.3em] text-luxury-gold font-medium">
                  The Jewel Gallery
                </span>
              </div>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Curated fine fashion jewelry designed for enduring beauty and timeless sophistication.
              Gold-plated, tiger eye, pearl jewelry, and modern accents for women and men.
            </p>
            <div className="space-y-2 pt-1">
              <a
                href={getWhatsAppLink('Hello Splender Jewel, I have an enquiry.')}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 text-xs text-luxury-gold hover:text-luxury-gold-light transition-colors"
              >
                <MessageCircle className="h-4 w-4 shrink-0" />
                <span>Chat with us on WhatsApp</span>
              </a>
              <div>
                <a
                  href={getInstagramLink(config)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-2 text-xs text-luxury-gold hover:text-luxury-gold-light transition-colors"
                >
                  <InstagramIcon className="h-4 w-4 shrink-0" />
                  <span>Follow @splender_jewel on Instagram</span>
                </a>
              </div>
            </div>
          </div>

          {/* Quick Collections */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-widest font-semibold text-white">Collections</h4>
            <ul className="space-y-2 text-xs">
              {activeCategories.length > 0 ? (
                activeCategories.map((cat) => (
                  <li key={cat.id || cat.slug}>
                    <Link href={`/category/${cat.slug}`} className="hover:text-luxury-gold transition-colors">
                      {cat.name}
                    </Link>
                  </li>
                ))
              ) : (
                <li>
                  <Link href="/shop" className="hover:text-luxury-gold transition-colors">
                    All Jewelry Pieces
                  </Link>
                </li>
              )}
            </ul>
          </div>

          {/* Customer Support */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-widest font-semibold text-white">Customer Care</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/shipping" className="hover:text-luxury-gold transition-colors">
                  Delivery & Shipping
                </Link>
              </li>
              <li>
                <Link href="/returns" className="hover:text-luxury-gold transition-colors">
                  Returns & Exchanges
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-luxury-gold transition-colors">
                  Frequently Asked Questions
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-luxury-gold transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/account/orders" className="hover:text-luxury-gold transition-colors">
                  Order Tracking
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal & Policies */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-widest font-semibold text-white">Legal & Policies</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/privacy" className="hover:text-luxury-gold transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-luxury-gold transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-luxury-gold transition-colors">
                  About Splender Jewel
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-neutral-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <p>© {currentYear} {config.storeName}. All rights reserved.</p>
          <div className="flex items-center space-x-4">
            <a
              href={getInstagramLink(config)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-400 hover:text-luxury-gold transition-colors inline-flex items-center space-x-1.5"
              aria-label="Follow Splender Jewel on Instagram"
            >
              <InstagramIcon className="h-3.5 w-3.5" />
              <span className="text-[11px]">@splender_jewel</span>
            </a>
            <span className="text-neutral-700">|</span>
            <p className="text-[11px] text-neutral-600">
              Secure Home Delivery across Sri Lanka
            </p>
          </div>
        </div>
      </Container>
    </footer>
  );
}
