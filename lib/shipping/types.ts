/**
 * Splender Jewel — Shipping Labels & Postal Export Type Definitions
 *
 * Strict typing for postal export, label printing, and customer shipping validation.
 */

import type { OrderStatus, PaymentMethod } from '../config/constants.ts';

export interface ShippingOrderRecord {
  id: string;
  order_number: string;
  customer_name: string;
  email?: string | null;
  phone1: string;
  phone2?: string | null;
  address_line: string;
  city?: string | null;
  district: string;
  province?: string | null;
  postal_code?: string | null;
  total_amount: number;
  payment_method: PaymentMethod;
  payment_status: string;
  order_status: OrderStatus;
  created_at: string;
  updated_at?: string;
  confirmation_date: string; // ISO timestamp when confirmed (from order_status_history or created_at fallback)
  validation: OrderShippingValidation;
}

export interface OrderShippingValidation {
  isValid: boolean;
  missingFields: string[];
  hasMissingCity: boolean;
  hasMissingAddress: boolean;
  hasMissingPhone: boolean;
  hasMissingName: boolean;
}

export interface ShippingLabelDimensions {
  widthMm: number;
  minHeightMm: number;
  paddingMm: number;
  borderWidthPx: number;
  gapMm: number;
  fontSizePt: number;
}

export const DEFAULT_LABEL_DIMENSIONS: ShippingLabelDimensions = {
  widthMm: 85,
  minHeightMm: 45,
  paddingMm: 4,
  borderWidthPx: 1.5,
  gapMm: 6,
  fontSizePt: 10,
};

export interface FixedBusinessSender {
  name: string;
  addressLine1: string;
  addressLine2: string;
  phone: string;
}

export const SPLENDER_JEWEL_SENDER: FixedBusinessSender = {
  name: 'Splender Jewel',
  addressLine1: '66A/38 St Jude Place',
  addressLine2: 'Thaladuwa, Negombo',
  phone: '0764689907',
};

export interface ShippingOrderFilterOptions {
  todayOnly?: boolean;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  paymentMethod?: 'all' | 'bank_transfer' | 'cod';
  searchQuery?: string;
  status?: 'all' | OrderStatus;
}

export interface ExcelExportResult {
  success: boolean;
  base64?: string;
  filename?: string;
  rowCount?: number;
  paymentMethod?: 'bank_transfer' | 'cod';
  error?: string;
  validationErrors?: {
    orderNumber: string;
    missingFields: string[];
  }[];
}
