/**
 * Core Domain Constants & Enums for Splender Jewel
 */

export const ORDER_STATUSES = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
} as const;

export type OrderStatus = (typeof ORDER_STATUSES)[keyof typeof ORDER_STATUSES];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending Review',
  confirmed: 'Order Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export const PAYMENT_METHODS = {
  COD: 'cod',
  BANK_TRANSFER: 'bank_transfer',
} as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cod: 'Cash on Delivery',
  bank_transfer: 'Bank Transfer (WhatsApp Verification)',
};

export const PAYMENT_STATUSES = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[keyof typeof PAYMENT_STATUSES];

export const STOCK_STATUSES = {
  IN_STOCK: 'in_stock',
  LOW_STOCK: 'low_stock',
  OUT_OF_STOCK: 'out_of_stock',
} as const;

export type StockStatus = (typeof STOCK_STATUSES)[keyof typeof STOCK_STATUSES];

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  in_stock: 'In Stock',
  low_stock: 'Low Stock',
  out_of_stock: 'Out of Stock',
};

/**
 * Human-readable order number generator format: SJ-YYYYMMDD-XXXX
 * Example: SJ-20261008-0001
 */
export function formatOrderNumber(date: Date, sequenceNumber: number): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const seq = String(sequenceNumber).padStart(4, '0');
  return `SJ-${year}${month}${day}-${seq}`;
}

export function isValidOrderNumber(orderNumber: string): boolean {
  return /^SJ-\d{8}-\d{4,}$/.test(orderNumber);
}
