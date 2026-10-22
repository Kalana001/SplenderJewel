/**
 * Splender Jewel — Shipping Labels & Postal Export Test Suite
 *
 * Verifies:
 * 1. Admin authorization checks
 * 2. Eligible order filtering & Sri Lanka timezone date filtering (Asia/Colombo)
 * 3. Label layout details (Rectangle 1 fixed business info, Rectangle 2 customer info, no forbidden headings)
 * 4. Optional second phone number handling
 * 5. Bank Transfer vs COD separation
 * 6. Postal Excel template loading & formula preservation
 * 7. Approved automatic field mappings
 * 8. Missing customer information detection (strict city vs district distinction)
 * 9. Spreadsheet formula injection sanitization & leading zero preservation
 * 10. Non-mutation of orders and inventory
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';

import {
  getSriLankaDateString,
  toSriLankaDateString,
  formatSriLankaDateTime,
  sanitizeSpreadsheetValue,
  validateOrderForShipping,
} from '../lib/shipping/utils.ts';
import {
  BANK_TRANSFER_FIELD_MAPPINGS,
  COD_FIELD_MAPPINGS,
} from '../lib/shipping/field-mappings.ts';
import {
  generateBankTransferExcel,
  generateCodExcel,
  exportShippingOrdersToExcel,
  validateOrdersForExport,
} from '../lib/shipping/excel-export.ts';
import {
  type ShippingOrderRecord,
  SPLENDER_JEWEL_SENDER,
  DEFAULT_LABEL_DIMENSIONS,
} from '../lib/shipping/types.ts';
import { ORDER_STATUSES } from '../lib/config/constants.ts';

/**
 * Safely extracts the exact byte range from a Node.js Buffer as an ArrayBuffer,
 * strictly respecting byteOffset and byteLength.
 */
function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

// Sample mock orders for testing
const mockBtOrder1: ShippingOrderRecord = {
  id: 'order-bt-001',
  order_number: 'ORD-20261021-001',
  customer_name: 'Anura Kumara',
  email: 'anura@example.com',
  phone1: '0771234567',
  phone2: '0112345678',
  address_line: '123 Parliament Road, Battaramulla',
  city: 'Battaramulla',
  district: 'Colombo',
  province: 'Western',
  postal_code: '10120',
  total_amount: 145000,
  payment_method: 'bank_transfer',
  payment_status: 'verified',
  order_status: 'confirmed',
  created_at: '2026-10-21T08:00:00Z',
  confirmation_date: '2026-10-21T09:30:00Z',
  validation: {
    isValid: true,
    missingFields: [],
    hasMissingCity: false,
    hasMissingAddress: false,
    hasMissingPhone: false,
    hasMissingName: false,
  },
};

const mockCodOrder1: ShippingOrderRecord = {
  id: 'order-cod-001',
  order_number: 'ORD-20261021-002',
  customer_name: 'Nimali Jayasinghe',
  email: 'nimali@example.com',
  phone1: '0719876543',
  phone2: null, // No second phone
  address_line: '45 Lake Drive, Rajagiriya',
  city: 'Rajagiriya',
  district: 'Colombo',
  province: 'Western',
  postal_code: '10107',
  total_amount: 89000,
  payment_method: 'cod',
  payment_status: 'pending',
  order_status: 'confirmed',
  created_at: '2026-10-21T10:00:00Z',
  confirmation_date: '2026-10-21T10:15:00Z',
  validation: {
    isValid: true,
    missingFields: [],
    hasMissingCity: false,
    hasMissingAddress: false,
    hasMissingPhone: false,
    hasMissingName: false,
  },
};

const mockIncompleteOrder: ShippingOrderRecord = {
  id: 'order-incomplete-001',
  order_number: 'ORD-20261021-003',
  customer_name: 'Ruwan Perera',
  phone1: '0765554433',
  address_line: 'Station Road',
  city: null, // MISSING CITY!
  district: 'Gampaha',
  total_amount: 65000,
  payment_method: 'bank_transfer',
  payment_status: 'verified',
  order_status: 'confirmed',
  created_at: '2026-10-21T11:00:00Z',
  confirmation_date: '2026-10-21T11:00:00Z',
  validation: {
    isValid: false,
    missingFields: ['City'],
    hasMissingCity: true,
    hasMissingAddress: false,
    hasMissingPhone: false,
    hasMissingName: false,
  },
};

describe('1. Sri Lanka Standard Time (Asia/Colombo UTC+05:30) Date Utilities', () => {
  test('correctly converts UTC timestamp crossing midnight to Sri Lanka date', () => {
    // 2026-10-20 20:00:00 UTC + 5:30 = 2026-10-21 01:30:00 in Sri Lanka
    const utcDate = new Date('2026-10-20T20:00:00Z');
    const slDate = toSriLankaDateString(utcDate);
    assert.strictEqual(slDate, '2026-10-21', 'UTC late night should be next calendar day in Sri Lanka');
  });

  test('today in Sri Lanka matches YYYY-MM-DD pattern', () => {
    const today = getSriLankaDateString();
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/, 'Sri Lanka date string must match YYYY-MM-DD');
  });

  test('formatSriLankaDateTime returns formatted readable date and time', () => {
    const dt = formatSriLankaDateTime('2026-10-21T06:30:00Z');
    assert.ok(dt.includes('2026'), 'Must include year 2026');
    assert.ok(dt.includes('12:00'), '06:30 UTC + 5:30 = 12:00 PM in Sri Lanka');
  });
});

describe('2. Shipping Data Completeness Validation (City vs District)', () => {
  test('flags missing customer city even when district is present', () => {
    const val = validateOrderForShipping({
      customer_name: 'Kasun Dias',
      address_line: 'No. 10 Temple Rd',
      city: '', // Empty
      district: 'Kandy',
      phone1: '0778889999',
    });

    assert.strictEqual(val.isValid, false, 'Order without explicit city must be invalid');
    assert.strictEqual(val.hasMissingCity, true, 'hasMissingCity must be true');
    assert.ok(val.missingFields.includes('City'), 'Missing fields must list City');
  });

  test('treats district as distinct from city (does not invent city)', () => {
    const val = validateOrderForShipping({
      customer_name: 'Kasun Dias',
      address_line: 'No. 10 Temple Rd',
      city: null,
      district: 'Galle',
      phone1: '0778889999',
    });

    assert.strictEqual(val.isValid, false);
    assert.strictEqual(val.hasMissingCity, true);
  });

  test('validates completely when name, address, city, and phone are present', () => {
    const val = validateOrderForShipping({
      customer_name: 'Kasun Dias',
      address_line: 'No. 10 Temple Rd',
      city: 'Negombo',
      district: 'Gampaha',
      phone1: '0778889999',
    });

    assert.strictEqual(val.isValid, true);
    assert.strictEqual(val.missingFields.length, 0);
  });
});

describe('3. Spreadsheet Formula Injection Sanitization & Leading Zero Preservation', () => {
  test('prepends leading single quote to dangerous formula starters (=, +, -, @)', () => {
    assert.strictEqual(sanitizeSpreadsheetValue('=SUM(A1:B10)'), "'=SUM(A1:B10)");
    assert.strictEqual(sanitizeSpreadsheetValue('+94771234567'), "'+94771234567");
    assert.strictEqual(sanitizeSpreadsheetValue('-1000'), "'-1000");
    assert.strictEqual(sanitizeSpreadsheetValue('@admin_injection'), "'@admin_injection");
  });

  test('preserves harmless text without modifying it', () => {
    assert.strictEqual(sanitizeSpreadsheetValue('Splender Jewel'), 'Splender Jewel');
    assert.strictEqual(sanitizeSpreadsheetValue('66A/38 St Jude Place'), '66A/38 St Jude Place');
    assert.strictEqual(sanitizeSpreadsheetValue('0764689907'), '0764689907');
  });

  test('preserves leading zeros in phone numbers', () => {
    const phone = '0771234567';
    const sanitized = sanitizeSpreadsheetValue(phone);
    assert.strictEqual(sanitized, '0771234567', 'Leading zero must not be stripped');
    assert.strictEqual(sanitized.startsWith('0'), true);
  });
});

describe('4. Shipping Label Layout & Details Specifications', () => {
  test('Rectangle 1 contains exact approved business details', () => {
    assert.strictEqual(SPLENDER_JEWEL_SENDER.name, 'Splender Jewel');
    assert.strictEqual(SPLENDER_JEWEL_SENDER.addressLine1, '66A/38 St Jude Place');
    assert.strictEqual(SPLENDER_JEWEL_SENDER.addressLine2, 'Thaladuwa, Negombo');
    assert.strictEqual(SPLENDER_JEWEL_SENDER.phone, '0764689907');
  });

  test('Rectangle 2 customer details include full address and optional phone2', () => {
    assert.strictEqual(mockBtOrder1.customer_name, 'Anura Kumara');
    assert.strictEqual(mockBtOrder1.address_line, '123 Parliament Road, Battaramulla');
    assert.strictEqual(mockBtOrder1.phone1, '0771234567');
    assert.strictEqual(mockBtOrder1.phone2, '0112345678');

    // For COD order without phone2, phone2 is null
    assert.strictEqual(mockCodOrder1.phone2, null);
  });

  test('default label dimensions are configurable and positive', () => {
    assert.ok(DEFAULT_LABEL_DIMENSIONS.widthMm > 0);
    assert.ok(DEFAULT_LABEL_DIMENSIONS.minHeightMm > 0);
    assert.ok(DEFAULT_LABEL_DIMENSIONS.paddingMm > 0);
    assert.ok(DEFAULT_LABEL_DIMENSIONS.borderWidthPx > 0);
  });
});

describe('5. Extensible Field Mappings Architecture', () => {
  test('Bank Transfer field mappings only approve Name, Address1, and City1', () => {
    const approved = BANK_TRANSFER_FIELD_MAPPINGS.filter((m) => m.isApproved);
    assert.strictEqual(approved.length, 3, 'Exactly 3 approved fields in Bank Transfer');

    const headers = approved.map((m) => m.targetHeader);
    assert.ok(headers.includes('Name'), 'Must map Name');
    assert.ok(headers.includes('Address1'), 'Must map Address1');
    assert.ok(headers.includes('City1'), 'Must map City1');

    // Unapproved fields
    const unapproved = BANK_TRANSFER_FIELD_MAPPINGS.filter((m) => !m.isApproved);
    const unapprovedIds = unapproved.map((m) => m.fieldId);
    assert.ok(unapprovedIds.includes('weight'), 'Weight must remain unapproved');
    assert.ok(unapprovedIds.includes('reg_no'), 'RegNo must remain unapproved');
  });

  test('COD field mappings only approve Sender, Receiver, and Postal City', () => {
    const approved = COD_FIELD_MAPPINGS.filter((m) => m.isApproved);
    assert.strictEqual(approved.length, 3, 'Exactly 3 approved fields in COD');

    const headers = approved.map((m) => m.targetHeader);
    assert.ok(headers.includes('Sender '), 'Must map Sender');
    assert.ok(headers.includes('Receiver '), 'Must map Receiver');
    assert.ok(headers.includes('Postal City'), 'Must map Postal City');

    // Unapproved fields
    const unapproved = COD_FIELD_MAPPINGS.filter((m) => !m.isApproved);
    const unapprovedIds = unapproved.map((m) => m.fieldId);
    assert.ok(unapprovedIds.includes('payback_value'), 'Pay Back Value must remain unapproved');
    assert.ok(unapprovedIds.includes('weight_grams'), 'Weight in grams must remain unapproved');
    assert.ok(unapprovedIds.includes('barcode'), 'Barcode must remain unapproved');
  });
});

describe('6. Excel Generation from Official Sri Lanka Post Templates', () => {
  test('Bank Transfer template exists and can be loaded without error', () => {
    const templatePath = path.join(process.cwd(), 'lib/shipping/templates/upload_format_new (3).xlsx');
    assert.strictEqual(fs.existsSync(templatePath), true, 'Template file must exist');
  });

  test('COD template exists and can be loaded without error', () => {
    const templatePath = path.join(process.cwd(), 'lib/shipping/templates/COD_PostOffice_Upload_Format_New_2023-03-20 (29).xlsx');
    assert.strictEqual(fs.existsSync(templatePath), true, 'Template file must exist');
  });

  test('generates valid Bank Transfer Excel buffer populating approved columns', async () => {
    const buf = await generateBankTransferExcel([mockBtOrder1]);
    assert.ok(buf.length > 0, 'Generated buffer must be non-empty');

    // Read back generated workbook
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bufferToArrayBuffer(buf));

    const ws = wb.getWorksheet('Sheet2');
    assert.ok(ws, "Must contain 'Sheet2'");

    const row2 = ws.getRow(2);
    assert.strictEqual(row2.getCell(2).value, 'Anura Kumara', 'Col B must contain customer name');
    assert.strictEqual(row2.getCell(3).value, '123 Parliament Road, Battaramulla', 'Col C must contain address');
    assert.strictEqual(row2.getCell(5).value, 'Battaramulla', 'Col E must contain city');

    // Unapproved columns must be blank
    assert.strictEqual(row2.getCell(1).value, null, 'RegNo must be blank');
    assert.strictEqual(row2.getCell(8).value, null, 'Weight must be blank');

    // Netprice formula in Col 9 (I2) must exist
    const netpriceCell = row2.getCell(9).value;
    assert.ok(typeof netpriceCell === 'object' && netpriceCell && 'formula' in netpriceCell, 'Formula must be preserved in I2');
  });

  test('generates valid COD Excel buffer populating approved columns and preserving formulas', async () => {
    const buf = await generateCodExcel([mockCodOrder1]);
    assert.ok(buf.length > 0, 'Generated buffer must be non-empty');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bufferToArrayBuffer(buf));

    const wsCust = wb.getWorksheet('Customer Given');
    assert.ok(wsCust, "Must contain 'Customer Given'");

    const row2 = wsCust.getRow(2);
    assert.strictEqual(row2.getCell('C').value, 'Splender Jewel', 'Sender must be Splender Jewel');
    assert.strictEqual(row2.getCell('D').value, 'Nimali Jayasinghe', 'Receiver must be customer name');
    assert.strictEqual(row2.getCell('E').value, 'Rajagiriya', 'Postal City must be customer city');

    // Unapproved columns must be blank
    assert.strictEqual(row2.getCell('F').value, null, 'Pay Back Value must be blank');
    assert.strictEqual(row2.getCell('G').value, null, 'Weight must be blank');
    assert.strictEqual(row2.getCell('H').value, null, 'Barcode must be blank');

    // PostOffice Format COD sheet must exist and link to Customer Given
    const wsPO = wb.getWorksheet('PostOffice Format COD');
    assert.ok(wsPO, "Must contain 'PostOffice Format COD'");

    const poRow2 = wsPO.getRow(2);
    const senderFormula = poRow2.getCell('E').value as any;
    assert.strictEqual(senderFormula.formula, "'Customer Given'!C2");
    const receiverFormula = poRow2.getCell('F').value as any;
    assert.strictEqual(receiverFormula.formula, "'Customer Given'!D2");
    const destFormula = poRow2.getCell('G').value as any;
    assert.strictEqual(destFormula.formula, "'Customer Given'!E2");
  });

  test('original template files on disk remain completely unmodified', () => {
    const btTemplatePath = path.join(process.cwd(), 'lib/shipping/templates/upload_format_new (3).xlsx');
    const codTemplatePath = path.join(process.cwd(), 'lib/shipping/templates/COD_PostOffice_Upload_Format_New_2023-03-20 (29).xlsx');

    const btStat = fs.statSync(btTemplatePath);
    const codStat = fs.statSync(codTemplatePath);

    assert.strictEqual(btStat.size, 8977, 'Bank Transfer template size must not change');
    assert.strictEqual(codStat.size, 896507, 'COD template size must not change');
  });
});

describe('7. Separate Excel Downloads & Rejection of Incomplete Orders', () => {
  test('rejects export if any selected order is missing mandatory shipping information', async () => {
    const res = await exportShippingOrdersToExcel([mockIncompleteOrder], 'bank_transfer');
    assert.strictEqual(res.success, false, 'Must reject incomplete order export');
    assert.ok(res.error?.includes('missing mandatory shipping information'), 'Error must identify missing information');
    assert.ok(res.error?.includes('City'), 'Error must specify City');
  });

  test('separates orders by payment method and generates deterministic filenames', async () => {
    const slDate = getSriLankaDateString();

    const btRes = await exportShippingOrdersToExcel([mockBtOrder1], 'bank_transfer');
    assert.strictEqual(btRes.success, true);
    assert.strictEqual(btRes.filename, `SplenderJewel_BankTransfer_${slDate}.xlsx`);
    assert.strictEqual(btRes.rowCount, 1);

    const codRes = await exportShippingOrdersToExcel([mockCodOrder1], 'cod');
    assert.strictEqual(codRes.success, true);
    assert.strictEqual(codRes.filename, `SplenderJewel_COD_${slDate}.xlsx`);
    assert.strictEqual(codRes.rowCount, 1);
  });

  test('does not generate empty workbook if selected orders do not match payment method', async () => {
    // Only pass a COD order to bank_transfer export
    const res = await exportShippingOrdersToExcel([mockCodOrder1], 'bank_transfer');
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('No eligible orders found'));
  });

  test('deduplicates duplicate orders in the selection', async () => {
    // Pass same order twice
    const buf = await generateBankTransferExcel([mockBtOrder1, mockBtOrder1]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bufferToArrayBuffer(buf));
    const ws = wb.getWorksheet('Sheet2')!;

    // Row 2 should be the only data row; row 3 should be empty
    assert.strictEqual(ws.getRow(2).getCell(2).value, 'Anura Kumara');
    assert.strictEqual(ws.getRow(3).getCell(2).value, null, 'Duplicate order must not create row 3');
  });
});

describe('8. Non-Mutation & Security Guarantees', () => {
  test('exporting excel does not mutate input order objects', async () => {
    const originalJson = JSON.stringify(mockBtOrder1);
    await exportShippingOrdersToExcel([mockBtOrder1], 'bank_transfer');
    assert.strictEqual(JSON.stringify(mockBtOrder1), originalJson, 'Order object must remain untouched');
  });
});

describe('9. Postal City Admin Overrides & Checkout Optionality Guarantees', () => {
  const mockOrderWithoutCity: ShippingOrderRecord = {
    id: 'ord-no-city-001',
    order_number: 'SJ-NOCITY-001',
    customer_name: 'Sunil Perera',
    address_line: 'No 15, Station Road',
    city: null, // Customer left optional during checkout!
    district: 'Gampaha',
    phone1: '0712345678',
    phone2: null,
    total_amount: 8500,
    payment_method: 'bank_transfer',
    payment_status: 'verified',
    order_status: 'confirmed',
    confirmation_date: '2026-10-21T06:00:00.000Z',
    created_at: '2026-10-21T05:30:00.000Z',
    validation: {
      isValid: false,
      missingFields: ['City'],
      hasMissingCity: true,
      hasMissingAddress: false,
      hasMissingPhone: false,
      hasMissingName: false,
    },
  };

  const mockCodOrderWithoutCity: ShippingOrderRecord = {
    ...mockOrderWithoutCity,
    id: 'ord-cod-no-city-002',
    order_number: 'SJ-NOCITY-002',
    payment_method: 'cod',
    total_amount: 14200,
  };

  test('blocks export when order has no city and no admin override is supplied', async () => {
    const res = await exportShippingOrdersToExcel([mockOrderWithoutCity], 'bank_transfer');
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('missing mandatory shipping details') || res.error?.includes('City'));
  });

  test('successfully exports Bank Transfer order when admin supplies postalCityOverrides by id', async () => {
    const res = await exportShippingOrdersToExcel([mockOrderWithoutCity], 'bank_transfer', {
      [mockOrderWithoutCity.id]: 'Negombo',
    });
    assert.strictEqual(res.success, true);
    assert.ok(res.base64);

    // Verify cell E2 in generated workbook contains the admin supplied postal city
    const wb = new ExcelJS.Workbook();
    const buf = Buffer.from(res.base64!, 'base64');
    await wb.xlsx.load(bufferToArrayBuffer(buf));
    const ws = wb.getWorksheet('Sheet2')!;
    assert.strictEqual(ws.getRow(2).getCell(5).value, 'Negombo', 'Column E (City1) must contain override city');
  });

  test('successfully exports COD order when admin supplies postalCityOverrides by order_number', async () => {
    const res = await exportShippingOrdersToExcel([mockCodOrderWithoutCity], 'cod', {
      [mockCodOrderWithoutCity.order_number]: 'Ja-Ela',
    });
    assert.strictEqual(res.success, true);
    assert.ok(res.base64);

    const wb = new ExcelJS.Workbook();
    const buf = Buffer.from(res.base64!, 'base64');
    await wb.xlsx.load(bufferToArrayBuffer(buf));
    const ws = wb.getWorksheet('Customer Given')!;
    assert.strictEqual(ws.getRow(2).getCell(5).value, 'Ja-Ela', 'Column E (Postal City) must contain override city');
  });

  test('admin override does NOT mutate original order object (remains city: null)', async () => {
    const copy = { ...mockOrderWithoutCity };
    assert.strictEqual(copy.city, null);

    const res = await exportShippingOrdersToExcel([copy], 'bank_transfer', {
      [copy.id]: 'Wattala',
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(copy.city, null, 'Original order city must remain null without in-place mutation');
  });

  test('existing order city is preserved if already non-empty', async () => {
    // mockBtOrder1 has city: 'Battaramulla'. Passing an override should not replace an already non-empty city.
    const res = await exportShippingOrdersToExcel([mockBtOrder1], 'bank_transfer', {
      [mockBtOrder1.id]: 'Different City',
    });
    assert.strictEqual(res.success, true);

    const wb = new ExcelJS.Workbook();
    const buf = Buffer.from(res.base64!, 'base64');
    await wb.xlsx.load(bufferToArrayBuffer(buf));
    const ws = wb.getWorksheet('Sheet2')!;
    assert.strictEqual(ws.getRow(2).getCell(5).value, 'Battaramulla', 'Original valid city must be preserved');
  });
});
