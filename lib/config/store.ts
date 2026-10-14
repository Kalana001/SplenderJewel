/**
 * Store Configuration Architecture
 *
 * ARCHITECTURAL RULE:
 * 1. `DEFAULT_DEV_STORE_CONFIG` serves solely as safe development & offline fallback.
 * 2. In production with Supabase connected, all business settings (store name, WhatsApp number,
 *    delivery charges, currencies, social links) will be fetched dynamically from the `store_settings`
 *    database table and managed via the Admin Panel.
 * 3. Components must NEVER hardcode business data, contact numbers, or delivery rates directly.
 */

export interface StoreConfig {
  storeName: string;
  tagline: string;
  logoUrl?: string;
  currency: string;
  currencySymbol: string;
  whatsAppNumber: string;
  instagramUrl?: string;
  contactEmail: string;
  freeDeliveryEnabled: boolean;
  freeDeliveryThreshold?: number;
  defaultDeliveryFee: number;
  announcementBanner?: {
    enabled: boolean;
    text: string;
  };
}

/**
 * Safe development fallback configuration.
 * Non-sensitive defaults for Splender Jewel.
 */
export const DEFAULT_DEV_STORE_CONFIG: StoreConfig = {
  storeName: 'Splender Jewel',
  tagline: 'The Jewel Gallery — Timeless Elegance & Modern Luxury',
  logoUrl: '/images/logo.png',
  currency: 'LKR',
  currencySymbol: 'Rs.',
  whatsAppNumber: process.env.NEXT_PUBLIC_DEFAULT_WHATSAPP_NUMBER || '+94764689907',
  instagramUrl: 'https://www.instagram.com/splender_jewel/',
  contactEmail: '',
  freeDeliveryEnabled: false,
  defaultDeliveryFee: 0,
  announcementBanner: {
    enabled: false,
    text: '',
  },
};

/**
 * Curated store categories fallback when database is empty.
 */
export const DEFAULT_STORE_CATEGORIES = [
  {
    id: 'default-rings',
    name: 'Rings',
    slug: 'rings',
    description: 'Curated collection of stylish rings, statement pieces, and everyday accents.',
    imageUrl: null as string | null,
    displayOrder: 1,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'default-necklaces',
    name: 'Necklaces & Pendants',
    slug: 'necklaces',
    description: 'Exquisite necklaces, chains, and radiant pendants crafted for elegance.',
    imageUrl: null as string | null,
    displayOrder: 2,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'default-bracelets',
    name: 'Bracelets & Bangles',
    slug: 'bracelets',
    description: 'Sophisticated bangles, charm bracelets, and modern wristwear.',
    imageUrl: null as string | null,
    displayOrder: 3,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'default-earrings',
    name: 'Earrings',
    slug: 'earrings',
    description: 'Delicate studs, drop earrings, and hoops designed with fine detail.',
    imageUrl: null as string | null,
    displayOrder: 4,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'default-men',
    name: "Men's Collection",
    slug: 'men',
    description: 'Distinctive jewelry pieces and modern accents tailored for men.',
    imageUrl: null as string | null,
    displayOrder: 5,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'default-sets',
    name: 'Jewelry Sets',
    slug: 'sets',
    description: 'Coordinated fine fashion jewelry sets for memorable occasions.',
    imageUrl: null as string | null,
    displayOrder: 6,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
];

/**
 * Accessor for the active store configuration.
 * In later phases, this will read from Supabase cache / server context.
 */
export function getStoreConfig(): StoreConfig {
  return DEFAULT_DEV_STORE_CONFIG;
}

/**
 * Formats a given number into the active store currency string (e.g. "Rs. 4,500").
 */
export function formatCurrency(amount: number, config: StoreConfig = DEFAULT_DEV_STORE_CONFIG): string {
  const formatted = new Intl.NumberFormat('en-LK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);

  return `${config.currencySymbol} ${formatted}`;
}

/**
 * Generates a clean WhatsApp direct link with an optional pre-filled message.
 */
export function getWhatsAppLink(message?: string, config: StoreConfig = DEFAULT_DEV_STORE_CONFIG): string {
  const cleanedNumber = config.whatsAppNumber.replace(/[^0-9]/g, '');
  const encodedMessage = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${cleanedNumber}${encodedMessage}`;
}

/**
 * Returns the official Instagram profile URL for Splender Jewel.
 */
export function getInstagramLink(config: StoreConfig = DEFAULT_DEV_STORE_CONFIG): string {
  return config.instagramUrl || 'https://www.instagram.com/splender_jewel/';
}

