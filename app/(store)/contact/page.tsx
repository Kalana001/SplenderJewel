import React from 'react';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { getStoreConfig, getWhatsAppLink, getInstagramLink } from '@/lib/config/store';
import { InstagramIcon } from '@/components/icons/instagram';
import { MessageCircle, Shield, Truck, Clock } from 'lucide-react';

export default function ContactPage() {
  const config = getStoreConfig();

  return (
    <div className="py-12 sm:py-16">
      <Container size="lg">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs uppercase tracking-[0.25em] text-luxury-gold font-semibold">
            Customer Care & Inquiries
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-white mt-2 uppercase tracking-wide">
            Contact Splender Jewel
          </h1>
          <p className="text-sm text-neutral-400 mt-3 leading-relaxed">
            Have a question about our jewelry pieces, sizing, custom orders, or delivery?
            Connect directly with our concierge team through our official channels.
          </p>
        </div>

        {/* Primary Contact Channels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* WhatsApp Card */}
          <div className="p-6 sm:p-8 rounded-sm border border-neutral-800 bg-neutral-900/60 flex flex-col justify-between hover:border-luxury-gold/50 transition-colors">
            <div className="space-y-4">
              <div className="h-12 w-12 rounded-full bg-luxury-gold/10 border border-luxury-gold/30 flex items-center justify-center text-luxury-gold">
                <MessageCircle className="h-6 w-6" />
              </div>
              <h2 className="font-serif text-xl font-semibold text-white">
                WhatsApp Concierge
              </h2>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Connect directly for instant stock inquiries, high-resolution photos/videos of pieces, custom orders, and Bank Transfer payment confirmations.
              </p>
              <div className="pt-2 text-sm text-luxury-gold font-mono">
                {config.whatsAppNumber}
              </div>
            </div>
            <div className="pt-6">
              <a
                href={getWhatsAppLink('Hello Splender Jewel, I would like to make an inquiry.')}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="gold" className="w-full space-x-2">
                  <MessageCircle className="h-4 w-4" />
                  <span>Chat on WhatsApp</span>
                </Button>
              </a>
            </div>
          </div>

          {/* Instagram Card */}
          <div className="p-6 sm:p-8 rounded-sm border border-neutral-800 bg-neutral-900/60 flex flex-col justify-between hover:border-luxury-gold/50 transition-colors">
            <div className="space-y-4">
              <div className="h-12 w-12 rounded-full bg-luxury-gold/10 border border-luxury-gold/30 flex items-center justify-center text-luxury-gold">
                <InstagramIcon className="h-6 w-6" />
              </div>
              <h2 className="font-serif text-xl font-semibold text-white">
                Official Instagram
              </h2>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Follow our official page for new arrivals, jewelry styling inspiration, customer showcases, and direct messaging (DM).
              </p>
              <div className="pt-2 text-sm text-luxury-gold font-mono">
                @splender_jewel
              </div>
            </div>
            <div className="pt-6">
              <a
                href={getInstagramLink(config)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" className="w-full border-luxury-gold/50 text-luxury-gold hover:bg-luxury-gold/10 hover:border-luxury-gold space-x-2">
                  <InstagramIcon className="h-4 w-4" />
                  <span>Follow @splender_jewel</span>
                </Button>
              </a>
            </div>
          </div>
        </div>

        {/* Support Information Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 border-t border-neutral-800/80 text-center">
          <div className="p-5 rounded-sm border border-neutral-850 bg-neutral-950/40">
            <Clock className="h-5 w-5 text-luxury-gold mx-auto mb-2" />
            <h3 className="text-xs uppercase tracking-wider text-white font-semibold">Service Hours</h3>
            <p className="text-xs text-neutral-400 mt-1">Monday – Sunday: 9:00 AM – 9:00 PM</p>
          </div>
          <div className="p-5 rounded-sm border border-neutral-850 bg-neutral-950/40">
            <Truck className="h-5 w-5 text-luxury-gold mx-auto mb-2" />
            <h3 className="text-xs uppercase tracking-wider text-white font-semibold">Delivery Coverage</h3>
            <p className="text-xs text-neutral-400 mt-1">Islandwide to all 25 Sri Lankan Districts</p>
          </div>
          <div className="p-5 rounded-sm border border-neutral-850 bg-neutral-950/40">
            <Shield className="h-5 w-5 text-luxury-gold mx-auto mb-2" />
            <h3 className="text-xs uppercase tracking-wider text-white font-semibold">Payment Methods</h3>
            <p className="text-xs text-neutral-400 mt-1">Cash on Delivery & Direct Bank Transfer</p>
          </div>
        </div>
      </Container>
    </div>
  );
}
