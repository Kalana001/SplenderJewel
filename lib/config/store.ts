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
  currency: string;
  currencySymbol: string;
  whatsAppNumber: string;
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
  tagline: 'Timeless Elegance & Modern Luxury Jewelry',
  currency: 'LKR',
  currencySymbol: 'Rs.',
  whatsAppNumber: process.env.NEXT_PUBLIC_DEFAULT_WHATSAPP_NUMBER || '+94764689907',
  contactEmail: '',
  freeDeliveryEnabled: false,
  defaultDeliveryFee: 0,
  announcementBanner: {
    enabled: false,
    text: '',
  },
};

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
