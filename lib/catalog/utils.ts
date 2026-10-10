import type { StockStatus } from '@/lib/config/constants';

/**
 * Computes deterministic stock status based on current quantity and low-stock threshold.
 */
export function computeStockStatus(quantity: number, threshold: number): StockStatus {
  if (quantity <= 0) return 'out_of_stock';
  if (quantity <= threshold) return 'low_stock';
  return 'in_stock';
}

/**
 * Normalizes a text string into a URL-friendly lowercase slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
