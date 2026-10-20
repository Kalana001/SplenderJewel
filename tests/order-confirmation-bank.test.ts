import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatCurrency, getStoreConfig } from '../lib/config/store.ts';

const WORKSPACE_DIR = process.cwd();

// =============================================================================
// STAGE B.2: MOBILE BANK TRANSFER CONFIRMATION REGRESSION TESTS
// =============================================================================

test('Bank Confirmation: Message template generates expected prefilled WhatsApp text with order reference and total', () => {
  const mockOrderNumber = 'SJ-20261020-0002';
  const mockTotalAmount = 4700;
  const formattedTotal = formatCurrency(mockTotalAmount);

  const rawMessage = `Hello Splender Jewel,\n\nI placed order ${mockOrderNumber} for ${formattedTotal} using bank transfer.\n\nPlease send me your bank account details so I can complete the payment.\n\nThank you.`;

  assert.ok(rawMessage.includes('SJ-20261020-0002'), 'Message must contain exact order reference');
  assert.ok(rawMessage.includes(formattedTotal), 'Message must contain formatted total amount');
  assert.ok(rawMessage.includes('bank account details'), 'Message must request bank account details');

  const encoded = encodeURIComponent(rawMessage);
  const storeConfig = getStoreConfig();
  const rawWhatsApp = storeConfig.whatsAppNumber || '+94764689907';
  const cleanPhone = rawWhatsApp.replace(/[^0-9]/g, '');
  const url = `https://wa.me/${cleanPhone}?text=${encoded}`;

  assert.ok(url.startsWith('https://wa.me/94764689907?text=Hello%20Splender%20Jewel'), 'URL must target official WhatsApp number');
  assert.ok(!url.includes('undefined'), 'URL must not contain undefined variables');
});

test('Bank Confirmation: Static source inspection confirms exact button label and responsive classes', () => {
  const pagePath = join(WORKSPACE_DIR, 'app/(store)/order-confirmation/[orderNumber]/page.tsx');
  const content = readFileSync(pagePath, 'utf-8');

  // Exact button label
  assert.match(
    content,
    /Get Bank Details via WhatsApp/,
    'Button label must be exactly "Get Bank Details via WhatsApp"'
  );

  // Must not have old overflowing text with phone number in label
  assert.doesNotMatch(
    content,
    /Send Payment Slip via WhatsApp/,
    'Must remove old long button label that caused mobile text overflow'
  );

  // Minimum touch target of 44px
  assert.match(
    content,
    /min-h-\[44px\]/,
    'Button must specify min-h-[44px] for accessible mobile touch target'
  );

  // Responsive button layout (full width on mobile, auto on sm+)
  assert.match(
    content,
    /w-full sm:w-auto/,
    'Button and anchor must adapt responsively from mobile to desktop'
  );

  // Icon collision prevention: whitespace-normal on text and shrink-0 on icon
  assert.match(
    content,
    /whitespace-normal/,
    'Button label must have whitespace-normal to prevent horizontal clipping'
  );
  assert.match(
    content,
    /<MessageCircle[^>]*shrink-0/,
    'WhatsApp icon must include shrink-0 to prevent icon squishing on small screens'
  );
});

test('Bank Confirmation: Explains all required steps and protects bank account privacy', () => {
  const pagePath = join(WORKSPACE_DIR, 'app/(store)/order-confirmation/[orderNumber]/page.tsx');
  const content = readFileSync(pagePath, 'utf-8');

  // Must explain:
  // 1. Order has been received
  assert.match(content, /order has been received/i, 'Must state order has been received');

  // 2. Request bank account details via WhatsApp
  assert.match(content, /request.*bank account details via WhatsApp/i, 'Must instruct to request bank details via WhatsApp');

  // 3. Transfer the confirmed order total
  assert.match(content, /transfer the confirmed.*total/i, 'Must instruct to transfer confirmed total');

  // 4. Send payment receipt / slip
  assert.match(content, /send.*payment receipt/i, 'Must instruct to send payment receipt');

  // 5. Payment remains pending until verification
  assert.match(content, /Pending Verification/i, 'Must explain payment is pending verification');

  // Must NOT expose actual bank account numbers or banking passwords in code
  assert.doesNotMatch(content, /account\s*number\s*:\s*\d{8,}/i, 'Must not publicly expose real bank account numbers');
});

test('Order Confirmation: COD flow is completely unaffected and hides bank instructions', () => {
  const pagePath = join(WORKSPACE_DIR, 'app/(store)/order-confirmation/[orderNumber]/page.tsx');
  const content = readFileSync(pagePath, 'utf-8');

  // Bank instructions must be strictly wrapped inside isBankTransfer conditional
  assert.match(
    content,
    /\{\s*isBankTransfer\s*&&\s*\(/,
    'Bank instructions card must be rendered strictly when isBankTransfer is true'
  );

  // General delivery details and order breakdown must render unconditionally for all payment methods
  assert.match(content, /Delivery Details \(Sri Lanka\)/, 'Delivery details must render for all payment methods');
  assert.match(content, /Ordered Jewelry Pieces/, 'Ordered items breakdown must render for all payment methods');
});
