/**
 * Splender Jewel — Postal Excel Export Engine
 *
 * Uses official Sri Lanka Post Excel templates:
 * - Bank Transfer: lib/shipping/templates/upload_format_new (3).xlsx
 * - COD: lib/shipping/templates/COD_PostOffice_Upload_Format_New_2023-03-20 (29).xlsx
 *
 * Guarantees:
 * 1. Safe in-memory modification via ExcelJS without altering original template files on disk.
 * 2. Strict formula preservation and replication across populated rows.
 * 3. Excel formula injection sanitization.
 * 4. Separate outputs for Bank Transfer and COD with deterministic Sri Lanka date filenames.
 * 5. Rejection of incomplete orders missing mandatory shipping information (e.g. city).
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import type { ShippingOrderRecord, ExcelExportResult } from './types.ts';
import {
  BANK_TRANSFER_FIELD_MAPPINGS,
  COD_FIELD_MAPPINGS,
} from './field-mappings.ts';
import {
  getSriLankaDateString,
  validateOrderForShipping,
} from './utils.ts';

const BANK_TRANSFER_TEMPLATE_NAME = 'upload_format_new (3).xlsx';
const COD_TEMPLATE_NAME = 'COD_PostOffice_Upload_Format_New_2023-03-20 (29).xlsx';

/**
 * Resolves the absolute path to an official postal Excel template.
 * Evaluates process.cwd() as well as serverless bundle locations.
 */
export function getPostalTemplatePath(templateFileName: string): string {
  const currentDir =
    typeof __dirname !== 'undefined'
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));

  const candidatePaths = [
    path.join(process.cwd(), 'lib', 'shipping', 'templates', templateFileName),
    path.join(process.cwd(), '.next', 'server', 'lib', 'shipping', 'templates', templateFileName),
    path.join(currentDir, 'templates', templateFileName),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidatePaths[0];
}

/**
 * Validates a list of orders for postal export.
 * Throws or returns validation failures if any order lacks mandatory shipping information.
 */
export function validateOrdersForExport(orders: ShippingOrderRecord[]): {
  valid: boolean;
  errors: { orderNumber: string; missingFields: string[] }[];
} {
  const errors: { orderNumber: string; missingFields: string[] }[] = [];

  for (const order of orders) {
    const val = validateOrderForShipping(order);
    if (!val.isValid) {
      errors.push({
        orderNumber: order.order_number,
        missingFields: val.missingFields,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generates the Bank Transfer Excel workbook from the official template.
 */
export async function generateBankTransferExcel(
  orders: ShippingOrderRecord[]
): Promise<Buffer> {
  const templatePath = getPostalTemplatePath(BANK_TRANSFER_TEMPLATE_NAME);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Bank Transfer template not found at: ${templatePath}`);
  }

  // Load template into memory via readFile (leaves on-disk template file unaltered)
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  const worksheet = workbook.getWorksheet('Sheet2');
  if (!worksheet) {
    throw new Error("Required worksheet 'Sheet2' not found in Bank Transfer template.");
  }

  // Row 1 is header
  // Extract the original netprice formula from row 2 cell 9 (I2) to replicate on subsequent rows
  const row2NetpriceCell = worksheet.getRow(2).getCell(9);
  const netpriceFormulaPattern =
    typeof row2NetpriceCell.value === 'object' && row2NetpriceCell.value
      ? (row2NetpriceCell.value as any).formula
      : null;

  // Filter approved mappings
  const approvedMappings = BANK_TRANSFER_FIELD_MAPPINGS.filter((m) => m.isApproved);

  // Deduplicate orders by ID to prevent duplicate rows in one export
  const seenIds = new Set<string>();
  const uniqueOrders = orders.filter((o) => {
    if (seenIds.has(o.id)) return false;
    seenIds.add(o.id);
    return true;
  });

  // Populate orders starting at row 2
  uniqueOrders.forEach((order, index) => {
    const rowIndex = index + 2;
    const row = worksheet.getRow(rowIndex);

    // Apply approved fields
    approvedMappings.forEach((mapping) => {
      const cell = row.getCell(mapping.targetColumn);
      const val = mapping.extractValue ? mapping.extractValue(order, rowIndex) : '';
      cell.value = val;
      cell.numFmt = '@'; // Force text format
    });

    // Replicate netprice formula for rows after row 2 if formula pattern is known
    if (rowIndex > 2 && netpriceFormulaPattern) {
      const rowFormula = netpriceFormulaPattern.replace(/H2/g, `H${rowIndex}`);
      row.getCell(9).value = { formula: rowFormula };
    }

    row.commit();
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Generates the Cash on Delivery (COD) Excel workbook from the official template.
 */
export async function generateCodExcel(
  orders: ShippingOrderRecord[]
): Promise<Buffer> {
  const templatePath = getPostalTemplatePath(COD_TEMPLATE_NAME);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`COD template not found at: ${templatePath}`);
  }

  // Load template into memory via readFile (leaves on-disk template file unaltered)
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  const customerGivenWs = workbook.getWorksheet('Customer Given');
  if (!customerGivenWs) {
    throw new Error("Required worksheet 'Customer Given' not found in COD template.");
  }

  // Verify that 'PostOffice Format COD' sheet exists so formulas remain intact
  const postOfficeWs = workbook.getWorksheet('PostOffice Format COD');
  if (!postOfficeWs) {
    throw new Error("Required worksheet 'PostOffice Format COD' not found in COD template.");
  }

  // Filter approved mappings for COD
  const approvedMappings = COD_FIELD_MAPPINGS.filter((m) => m.isApproved);

  // Deduplicate orders by ID
  const seenIds = new Set<string>();
  const uniqueOrders = orders.filter((o) => {
    if (seenIds.has(o.id)) return false;
    seenIds.add(o.id);
    return true;
  });

  // Populate orders starting at row 2 of 'Customer Given'
  uniqueOrders.forEach((order, index) => {
    const rowIndex = index + 2;
    const row = customerGivenWs.getRow(rowIndex);

    approvedMappings.forEach((mapping) => {
      const cell = row.getCell(mapping.targetColumn);
      let val = '';
      if (mapping.fixedValue) {
        val = mapping.fixedValue;
      } else if (mapping.extractValue) {
        val = mapping.extractValue(order, rowIndex);
      }
      cell.value = val;
      cell.numFmt = '@'; // Force text format
    });

    row.commit();
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * High-level export dispatcher that validates orders and generates the appropriate workbook.
 * Supports administrator postal city overrides for orders where the customer left City/Town optional during checkout.
 * Does NOT mutate original order objects or persistent database records.
 */
export async function exportShippingOrdersToExcel(
  orders: ShippingOrderRecord[],
  paymentMethod: 'bank_transfer' | 'cod',
  postalCityOverrides?: Record<string, string>
): Promise<ExcelExportResult> {
  try {
    // 1. Filter orders strictly for the specified payment method
    const matchingOrders = orders.filter((o) => o.payment_method === paymentMethod);
    if (matchingOrders.length === 0) {
      return {
        success: false,
        error: `No eligible orders found for payment method: ${paymentMethod === 'bank_transfer' ? 'Bank Transfer' : 'Cash on Delivery'}.`,
      };
    }

    // 2. Prepare export representations incorporating administrator postal city overrides
    // CRITICAL: Does NOT mutate original order objects or database records!
    const targetOrders: ShippingOrderRecord[] = matchingOrders.map((order) => {
      const explicitCity =
        (order.city && order.city.trim()) ||
        (postalCityOverrides && postalCityOverrides[order.id]?.trim()) ||
        (postalCityOverrides && postalCityOverrides[order.order_number]?.trim()) ||
        null;

      if (explicitCity === order.city) {
        return order;
      }

      return {
        ...order,
        city: explicitCity,
        validation: validateOrderForShipping({
          customer_name: order.customer_name,
          address_line: order.address_line,
          city: explicitCity,
          district: order.district,
          phone1: order.phone1,
        }),
      };
    });

    // 3. Validate mandatory shipping info completeness
    const validation = validateOrdersForExport(targetOrders);
    if (!validation.valid) {
      const errorDetails = validation.errors
        .map((e) => `${e.orderNumber} (Missing: ${e.missingFields.join(', ')})`)
        .join('; ');
      return {
        success: false,
        error: `Cannot export postal sheet. The following order(s) are missing mandatory shipping information: ${errorDetails}. Please ensure customer city and address are verified before export.`,
        validationErrors: validation.errors,
      };
    }

    // 3. Generate filename with Sri Lanka local date (YYYY-MM-DD)
    const slDate = getSriLankaDateString();
    const filename =
      paymentMethod === 'bank_transfer'
        ? `SplenderJewel_BankTransfer_${slDate}.xlsx`
        : `SplenderJewel_COD_${slDate}.xlsx`;

    // 4. Generate Excel buffer
    let buffer: Buffer;
    if (paymentMethod === 'bank_transfer') {
      buffer = await generateBankTransferExcel(targetOrders);
    } else {
      buffer = await generateCodExcel(targetOrders);
    }

    return {
      success: true,
      base64: buffer.toString('base64'),
      filename,
      rowCount: targetOrders.length,
      paymentMethod,
    };
  } catch (err: any) {
    console.error(`[ShippingExcelExport] Failed to generate ${paymentMethod} excel:`, err);
    return {
      success: false,
      error: err.message || 'An unexpected error occurred during Excel export generation.',
    };
  }
}
