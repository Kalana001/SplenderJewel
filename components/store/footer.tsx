import React from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { getStoreConfig, getWhatsAppLink } from '@/lib/config/store';
import { MessageCircle } from 'lucide-react';

export function StoreFooter() {
  const config = getStoreConfig();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-luxury-black text-neutral-300 border-t border-neutral-800 pt-16 pb-12 text-sm">
      <Container size="xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand & Mission */}
          <div className="space-y-4">
            <span className="font-serif text-lg font-bold tracking-[0.2em] text-white uppercase block">
              {config.storeName}
            </span>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Curated fine fashion jewelry designed for enduring beauty and timeless sophistication.
              Gold-plated, tiger eye, pearl jewelry, and modern accents for women and men.
            </p>
            <div>
              <a
                href={getWhatsAppLink('Hello Splender Jewel, I have an enquiry.')}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 text-xs text-luxury-gold hover:text-luxury-gold-light transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                <span>Chat with us on WhatsApp</span>
              </a>
            </div>
          </div>

          {/* Quick Collections */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-widest font-semibold text-white">Collections</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/category/rings" className="hover:text-luxury-gold transition-colors">
                  Rings
                </Link>
              </li>
              <li>
                <Link href="/category/necklaces" className="hover:text-luxury-gold transition-colors">
                  Necklaces & Pendants
                </Link>
              </li>
              <li>
                <Link href="/category/bracelets" className="hover:text-luxury-gold transition-colors">
                  Bracelets & Bangles
                </Link>
              </li>
              <li>
                <Link href="/category/earrings" className="hover:text-luxury-gold transition-colors">
                  Earrings
                </Link>
              </li>
              <li>
                <Link href="/category/men" className="hover:text-luxury-gold transition-colors">
                  Men’s Collection
                </Link>
              </li>
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
          <p className="text-[11px] text-neutral-600">
            Secure Home Delivery across Sri Lanka
          </p>
        </div>
      </Container>
    </footer>
  );
}
