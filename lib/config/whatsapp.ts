/**
 * WhatsApp Configuration & Safe URI Helper
 *
 * Enforces phone number normalization, E.164 validation, safe placeholder interpolation,
 * and standard URL encoding to prevent XSS or malformed link generation.
 */

export const DEFAULT_STORE_WHATSAPP = '+94764689907';

export const DEFAULT_WHATSAPP_TEMPLATES = {
  bankTransfer: 'Hello Splender Jewel, I have completed the bank transfer for Order #[ORDER_NUMBER]. Please find my deposit slip attached for verification.',
  productInquiry: 'Hello Splender Jewel, I am interested in [PRODUCT_NAME]. Could you please share pricing and availability details?',
  generalSupport: 'Hello Splender Jewel, I would like to make an inquiry regarding your fine jewelry collection.',
} as const;

/**
 * Normalizes phone numbers to standard international format (e.g., +94764689907).
 * Handles Sri Lankan local formats (e.g. "076 468 9907", "764689907") gracefully.
 */
export function normalizePhoneNumber(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  // Remove all spaces, hyphens, and brackets
  const stripped = trimmed.replace(/[\s\-\(\)]/g, '');

  if (stripped.startsWith('+')) {
    return stripped;
  }
  // Sri Lankan local format starting with '0' (e.g. 0764689907 -> +94764689907)
  if (stripped.startsWith('0') && stripped.length === 10) {
    return `+94${stripped.substring(1)}`;
  }
  // Sri Lankan format starting with 94 without '+'
  if (stripped.startsWith('94') && stripped.length === 11) {
    return `+${stripped}`;
  }
  // Sri Lankan 9-digit format without leading 0 or country code (e.g. 764689907)
  if (stripped.length === 9 && (stripped.startsWith('7') || stripped.startsWith('1'))) {
    return `+94${stripped}`;
  }

  return `+${stripped}`;
}

/**
 * Validates international E.164 compliant phone numbers.
 * Requires 9 to 15 digits following the '+' prefix.
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone) return false;
  const normalized = normalizePhoneNumber(phone);
  return /^\+[1-9]\d{8,14}$/.test(normalized);
}

/**
 * Safely constructs a wa.me direct chat link with strict URI encoding.
 */
export function generateSafeWhatsAppUrl(phoneNumber: string, message?: string): string {
  const normalized = normalizePhoneNumber(phoneNumber);
  const digitsOnly = normalized.replace(/[^0-9]/g, '');

  if (!digitsOnly) {
    return '#';
  }

  const encodedMessage = message && message.trim() ? `?text=${encodeURIComponent(message.trim())}` : '';
  return `https://wa.me/${digitsOnly}${encodedMessage}`;
}

/**
 * Safely interpolates placeholders (e.g., [ORDER_NUMBER], [PRODUCT_NAME])
 * without executing untrusted code or HTML tags.
 */
export function interpolateWhatsAppTemplate(
  template: string,
  variables: Record<string, string>
): string {
  if (!template) return '';
  let result = template;
  for (const [key, val] of Object.entries(variables)) {
    // Strip HTML tags from replacement values to prevent untrusted formatting
    const sanitizedVal = val.replace(/<[^>]*>?/gm, '');
    result = result.split(`[${key}]`).join(sanitizedVal);
  }
  return result;
}
