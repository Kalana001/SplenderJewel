/**
 * Splender Jewel — Postal Excel Field Mappings
 *
 * Extensible configuration mapping domain order data to official Sri Lanka Post Excel templates.
 *
 * Strict constraints:
 * - Bank Transfer and COD mappings are kept strictly separate.
 * - Only approved automatic fields are populated in the current phase.
 * - Unapproved fields are defined with isApproved: false for future extension without redesigning the system.
 * - Missing or ambiguous columns are reported rather than guessed.
 */

import { type ShippingOrderRecord, SPLENDER_JEWEL_SENDER } from './types.ts';
import { sanitizeSpreadsheetValue } from './utils.ts';

export interface PostalFieldMapping {
  fieldId: string;
  label: string;
  targetWorksheet?: string;
  targetColumn: string; // Excel column letter, e.g. 'B', 'C'
  targetHeader: string;
  isApproved: boolean;  // true = populated in current phase; false = unapproved / future
  extractValue?: (order: ShippingOrderRecord, rowIndex: number) => any;
  fixedValue?: string;
  isFormula?: boolean;
  notes?: string;
}

/**
 * BANK TRANSFER EXCEL MAPPINGS
 * Template: upload_format_new (3).xlsx
 * Target Worksheet: 'Sheet2'
 *
 * Columns in Template:
 * A: RegNo
 * B: Name       -> Approved (Customer Name)
 * C: Address1   -> Approved (Customer Delivery Address)
 * D: Address2   -> Not Approved (Left blank)
 * E: City1      -> Approved (Customer City)
 * F: City2      -> Not Approved (Left blank)
 * G: doffice    -> Not Approved (Left blank)
 * H: weight     -> Not Approved (Left blank)
 * I: netprice   -> Formula (Auto-calculating based on weight)
 *
 * Architectural Note:
 * This template has NO Sender column. In accordance with requirements, we do NOT insert
 * unauthorized columns and do not guess.
 */
export const BANK_TRANSFER_FIELD_MAPPINGS: PostalFieldMapping[] = [
  // --- Approved Fields ---
  {
    fieldId: 'customer_name',
    label: 'Customer Name',
    targetColumn: 'B',
    targetHeader: 'Name',
    isApproved: true,
    extractValue: (order) => sanitizeSpreadsheetValue(order.customer_name),
  },
  {
    fieldId: 'delivery_address',
    label: 'Customer Delivery Address',
    targetColumn: 'C',
    targetHeader: 'Address1',
    isApproved: true,
    extractValue: (order) => sanitizeSpreadsheetValue(order.address_line),
  },
  {
    fieldId: 'customer_city',
    label: 'Customer City',
    targetColumn: 'E',
    targetHeader: 'City1',
    isApproved: true,
    extractValue: (order) => sanitizeSpreadsheetValue(order.city || ''),
  },

  // --- Fields Not Yet Approved (Future Extension Placeholders) ---
  {
    fieldId: 'reg_no',
    label: 'Registration Number',
    targetColumn: 'A',
    targetHeader: 'RegNo',
    isApproved: false,
    notes: 'Official registration tracking number not yet approved for automatic entry.',
  },
  {
    fieldId: 'address2',
    label: 'Address Line 2',
    targetColumn: 'D',
    targetHeader: 'Address2',
    isApproved: false,
    notes: 'Secondary address field.',
  },
  {
    fieldId: 'city2',
    label: 'City 2',
    targetColumn: 'F',
    targetHeader: 'City2',
    isApproved: false,
    notes: 'Secondary city field.',
  },
  {
    fieldId: 'doffice',
    label: 'Delivery Office',
    targetColumn: 'G',
    targetHeader: 'doffice',
    isApproved: false,
    notes: 'Postal delivery office code or branch name.',
  },
  {
    fieldId: 'weight',
    label: 'Parcel Weight (grams)',
    targetColumn: 'H',
    targetHeader: 'weight',
    isApproved: false,
    notes: 'Package weight in grams not yet approved for automatic entry.',
  },
  {
    fieldId: 'netprice',
    label: 'Net Postage Price',
    targetColumn: 'I',
    targetHeader: 'netprice',
    isApproved: false,
    isFormula: true,
    notes: 'Template formula auto-calculates from weight column (H). Preserved from template.',
  },
];

/**
 * CASH ON DELIVERY (COD) EXCEL MAPPINGS
 * Template: COD_PostOffice_Upload_Format_New_2023-03-20 (29).xlsx
 * Target Worksheet: 'Customer Given'
 *
 * Columns in 'Customer Given':
 * A: Date
 * B: NO (Start From 1) Write this number on the Parcel
 * C: Sender        -> Approved (Fixed: 'Splender Jewel')
 * D: Receiver      -> Approved (Customer Name)
 * E: Postal City   -> Approved (Customer City)
 * F: Pay Back Value (For COD) -> Not Approved (Left blank)
 * G: Weight in grams          -> Not Approved (Left blank)
 * H: Barcode                  -> Not Approved (Left blank)
 *
 * Architectural Note:
 * This template has NO separate Customer Address column. In accordance with requirements,
 * we do NOT insert unauthorized columns and report this missing column rather than guessing.
 * The second sheet ('PostOffice Format COD') contains pre-configured formulas referencing 'Customer Given'.
 */
export const COD_FIELD_MAPPINGS: PostalFieldMapping[] = [
  // --- Approved Fields ---
  {
    fieldId: 'sender_name',
    label: 'Sender Name',
    targetWorksheet: 'Customer Given',
    targetColumn: 'C',
    targetHeader: 'Sender ',
    isApproved: true,
    fixedValue: SPLENDER_JEWEL_SENDER.name,
  },
  {
    fieldId: 'customer_name',
    label: 'Customer Name (Receiver)',
    targetWorksheet: 'Customer Given',
    targetColumn: 'D',
    targetHeader: 'Receiver ',
    isApproved: true,
    extractValue: (order) => sanitizeSpreadsheetValue(order.customer_name),
  },
  {
    fieldId: 'postal_city',
    label: 'Customer City (Postal City)',
    targetWorksheet: 'Customer Given',
    targetColumn: 'E',
    targetHeader: 'Postal City',
    isApproved: true,
    extractValue: (order) => sanitizeSpreadsheetValue(order.city || ''),
  },

  // --- Fields Not Yet Approved (Future Extension Placeholders) ---
  {
    fieldId: 'dispatch_date',
    label: 'Dispatch Date',
    targetWorksheet: 'Customer Given',
    targetColumn: 'A',
    targetHeader: 'Date ',
    isApproved: false,
    notes: 'Date field in Customer Given sheet not yet approved for automatic entry.',
  },
  {
    fieldId: 'parcel_no',
    label: 'Parcel Sequence Number',
    targetWorksheet: 'Customer Given',
    targetColumn: 'B',
    targetHeader: 'NO (Start From 1) Write this number on the Parcel',
    isApproved: false,
    notes: 'Sequence number written on parcel not yet approved for automatic generation.',
  },
  {
    fieldId: 'payback_value',
    label: 'COD Pay Back Value',
    targetWorksheet: 'Customer Given',
    targetColumn: 'F',
    targetHeader: 'Pay Back Value (For COD)',
    isApproved: false,
    notes: 'COD collection amount (pay back value) not yet approved for automatic entry.',
  },
  {
    fieldId: 'weight_grams',
    label: 'Weight in Grams',
    targetWorksheet: 'Customer Given',
    targetColumn: 'G',
    targetHeader: 'Weight in grams',
    isApproved: false,
    notes: 'Parcel weight in grams not yet approved for automatic entry.',
  },
  {
    fieldId: 'barcode',
    label: 'Postal Barcode',
    targetWorksheet: 'Customer Given',
    targetColumn: 'H',
    targetHeader: 'Barcode',
    isApproved: false,
    notes: 'Pre-assigned postal barcode numbers not yet approved for automatic entry.',
  },
];
