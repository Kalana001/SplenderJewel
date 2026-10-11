import type { HomepageSection, ContentPage } from '@/types/cms';

export const DEFAULT_HOMEPAGE_SECTIONS: Array<Omit<HomepageSection, 'id' | 'updatedAt'>> = [
  {
    sectionKey: 'hero',
    title: 'Timeless Elegance & Refined Luxury',
    subtitle: 'The Jewel Gallery — Sri Lanka',
    displayOrder: 1,
    isEnabled: true,
    configData: {
      headline: 'Timeless Elegance',
      italicWord: 'Refined Luxury',
      ctaText: 'Explore Catalog',
      ctaLink: '/shop',
    },
  },
  {
    sectionKey: 'pillars',
    title: 'The Splender Jewel Distinction',
    subtitle: 'Why our patrons choose us',
    displayOrder: 2,
    isEnabled: true,
    configData: {
      pillar1: 'Curated Luxury',
      pillar2: 'Doorstep Courier Delivery',
      pillar3: 'Personal WhatsApp Concierge',
    },
  },
  {
    sectionKey: 'categories',
    title: 'Curated Collections',
    subtitle: 'Explore by jewelry category',
    displayOrder: 3,
    isEnabled: true,
    configData: {
      displayCount: 6,
    },
  },
  {
    sectionKey: 'featured_products',
    title: 'Signature & Trending Pieces',
    subtitle: 'Hand-selected by our master jewelers',
    displayOrder: 4,
    isEnabled: true,
    configData: {
      maxItems: 8,
    },
  },
  {
    sectionKey: 'reviews',
    title: 'Patron Testimonials',
    subtitle: 'What our distinguished clients say',
    displayOrder: 5,
    isEnabled: true,
    configData: {
      minRating: 4,
    },
  },
];

export const DEFAULT_CONTENT_PAGES: Array<Omit<ContentPage, 'id' | 'updatedAt'>> = [
  {
    slug: 'about',
    title: 'About Splender Jewel',
    content: `# Our Heritage & Distinction\n\nWelcome to **Splender Jewel**, where timeless elegance converges with modern fashion refinement. Founded in Sri Lanka, we curate an exclusive assortment of fine fashion jewelry crafted to elevate everyday moments and grace life's most unforgettable celebrations.\n\n### The Art of Refinement\nEvery item in our collection is carefully inspected for impeccable craftsmanship, lustrous finishes, and durable wear. From radiant 18K gold-plated accents to grounding tiger eye gems and luminous cultured pearls, our collections offer unmatched distinction.`,
    metaTitle: 'About Splender Jewel | Our Heritage & Fine Jewelry',
    metaDescription: 'Learn about Splender Jewel — fine fashion jewelry, gold-plated collections, and modern luxury in Sri Lanka.',
  },
  {
    slug: 'faq',
    title: 'Frequently Asked Questions',
    content: `# Customer Inquiries & FAQ\n\n### 1. What materials are used in Splender Jewel pieces?\nOur jewelry features premium hypoallergenic alloys with thick 18K gold and silver electroplating, genuine semi-precious tiger eye, cubic zirconia, and cultured pearls.\n\n### 2. How does delivery work in Sri Lanka?\nWe partner with premier islandwide courier services. Deliveries within the Western Province arrive in 1-2 business days; other districts arrive within 2-4 business days.\n\n### 3. What payment methods are supported?\nWe accept Cash on Delivery (COD) islandwide and direct Bank Transfer with manual WhatsApp verification.`,
    metaTitle: 'Frequently Asked Questions | Splender Jewel',
    metaDescription: 'Common inquiries regarding materials, islandwide courier delivery, and payments for Splender Jewel.',
  },
  {
    slug: 'shipping',
    title: 'Shipping & Delivery Policy',
    content: `# Islandwide Courier Shipping\n\nSplender Jewel provides safe and insured delivery across all **25 administrative districts of Sri Lanka**.\n\n### Delivery Fees & Timelines\n- **Western Province (Colombo, Gampaha, Kalutara):** Rs. 350 (1–2 business days)\n- **Islandwide (All other 22 districts):** Rs. 450 (2–4 business days)\n\n### Packaging\nAll jewelry is packaged in signature Splender Jewel protective presentation boxes to ensure pristine arrival.`,
    metaTitle: 'Shipping & Delivery Policy | Splender Jewel Sri Lanka',
    metaDescription: 'Learn about islandwide delivery rates, shipping timelines, and doorstep courier service in Sri Lanka.',
  },
  {
    slug: 'returns',
    title: 'Returns & Exchange Policy',
    content: `# Returns & Exchanges\n\nWe take immense pride in the craftsmanship of our jewelry. If your order arrives damaged or defective, please notify us on WhatsApp (+94 76 468 9907) within **48 hours of receipt**.\n\n### Exchange Eligibility\n- Items must be unused, in their original presentation packaging with tags intact.\n- For hygiene reasons, pierced earrings cannot be exchanged unless received damaged.\n- Defective items will be replaced promptly at no additional shipping cost.`,
    metaTitle: 'Returns & Exchanges | Splender Jewel Guarantee',
    metaDescription: 'Exchange policy, customer quality guarantee, and return guidelines for Splender Jewel.',
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    content: `# Privacy & Data Protection\n\nYour privacy is paramount. Splender Jewel collects personal information (name, delivery address, phone numbers) solely for fulfilling orders and communicating courier tracking updates.\n\nWe do not sell, rent, or trade customer information to third parties. All order receipts and communications are handled strictly in accordance with modern security standards.`,
    metaTitle: 'Privacy Policy | Splender Jewel',
    metaDescription: 'How Splender Jewel protects customer personal data and privacy.',
  },
  {
    slug: 'terms',
    title: 'Terms of Service',
    content: `# Terms & Conditions of Purchase\n\nBy placing an order on Splender Jewel, you agree to our standard conditions of sale. All prices are listed in Sri Lankan Rupees (LKR). Orders placed via Bank Transfer are reserved for 24 hours pending WhatsApp payment slip verification before automatic release.`,
    metaTitle: 'Terms of Service | Splender Jewel',
    metaDescription: 'Terms and conditions for orders, purchases, and browsing on Splender Jewel.',
  },
  {
    slug: 'contact',
    title: 'Contact Splender Jewel',
    content: `# Get in Touch\n\nOur client concierges are available to assist you with inquiries, custom set requests, and order assistance.\n\n- **WhatsApp Support:** +94 76 468 9907\n- **Instagram:** @splender_jewel\n- **Location:** Colombo, Sri Lanka\n- **Operating Hours:** Monday – Saturday, 9:00 AM – 7:00 PM`,
    metaTitle: 'Contact Us | Splender Jewel Concierge',
    metaDescription: 'Get in touch with Splender Jewel concierge via WhatsApp or social media.',
  },
];
