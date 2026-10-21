/**
 * Splender Jewel — Shipping Utilities
 *
 * - Sri Lanka Standard Time (UTC+05:30) helpers
 * - Excel spreadsheet formula injection sanitization
 * - Order shipping data completeness validation
 */

import type { ShippingOrderRecord, OrderShippingValidation } from './types.ts';

/**
 * Returns the current date in Sri Lanka Standard Time (Asia/Colombo) formatted as YYYY-MM-DD.
 */
export function getSriLankaDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Converts any UTC timestamp to a Sri Lanka Standard Time date string YYYY-MM-DD.
 */
export function toSriLankaDateString(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Formats a date string or Date object in Sri Lanka Standard Time for user display.
 * Example: "Oct 21, 2026, 09:15 PM"
 */
export function formatSriLankaDateTime(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) {
    return 'Invalid Date';
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Sanitizes spreadsheet cell strings to prevent Excel formula injection (CSV/Excel Formula Injection).
 *
 * If a cell string starts with '=', '+', '-', '@', tab, or carriage return,
 * Excel may execute it as a formula or DDE command.
 * Prepending with a single quote (') forces Excel to treat the cell value strictly as text.
 */
export function sanitizeSpreadsheetValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value).trim();
  if (str.length === 0) {
    return '';
  }
  const dangerousPrefixes = ['=', '+', '-', '@', '\t', '\r'];
  if (dangerousPrefixes.some((prefix) => str.startsWith(prefix))) {
    return `'${str}`;
  }
  return str;
}

/**
 * Validates whether an order possesses all mandatory shipping information.
 *
 * CRITICAL BUSINESS RULES:
 * - Customer name must be non-empty.
 * - Delivery address must be non-empty.
 * - Customer city must be explicitly present. If only district exists, DO NOT silently treat district as city.
 * - Primary contact number must be non-empty.
 */
export function validateOrderForShipping(order: {
  customer_name?: string | null;
  address_line?: string | null;
  city?: string | null;
  district?: string | null;
  phone1?: string | null;
}): OrderShippingValidation {
  const missingFields: string[] = [];

  const hasMissingName = !order.customer_name || !order.customer_name.trim();
  if (hasMissingName) {
    missingFields.push('Customer Name');
  }

  const hasMissingAddress = !order.address_line || !order.address_line.trim();
  if (hasMissingAddress) {
    missingFields.push('Delivery Address');
  }

  // Strict check: Do not treat district as city!
  const hasMissingCity = !order.city || !order.city.trim();
  if (hasMissingCity) {
    missingFields.push('City');
  }

  const hasMissingPhone = !order.phone1 || !order.phone1.trim();
  if (hasMissingPhone) {
    missingFields.push('Contact Number');
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
    hasMissingCity,
    hasMissingAddress,
    hasMissingPhone,
    hasMissingName,
  };
}
