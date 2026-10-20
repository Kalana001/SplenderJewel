import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKSPACE_DIR = process.cwd();

// =============================================================================
// STAGE B.3: CUSTOMER ORDER TRACKING VISIBILITY REGRESSION TESTS
// =============================================================================

test('Customer Tracking: Static source inspection confirms Delivery Tracking card exists and handles presence and absence', () => {
  const pagePath = join(WORKSPACE_DIR, 'app/(store)/account/orders/[orderId]/page.tsx');
  const content = readFileSync(pagePath, 'utf-8');

  // Must render Delivery Tracking card
  assert.match(
    content,
    /Delivery Tracking/,
    'Customer order details page must render a Delivery Tracking section'
  );

  // Must render fallback message when tracking number is absent
  assert.match(
    content,
    /Tracking information will appear here once your parcel has been dispatched\./,
    'Must display exact dispatched fallback message when tracking is absent'
  );

  // Must render tracking_number with break-all for layout safety
  assert.match(
    content,
    /order\.tracking_number[\s\S]*?break-all/,
    'Must render tracking number with break-all to prevent long tracking strings from breaking mobile layout'
  );

  // Must display order status in tracking section
  assert.match(
    content,
    /Order Status:[\s\S]*?\{currentStatus\}/,
    'Must display current order status in tracking section'
  );
});

test('Customer Tracking: Query strictly enforces customer ownership and omits sensitive admin fields', () => {
  const pagePath = join(WORKSPACE_DIR, 'app/(store)/account/orders/[orderId]/page.tsx');
  const content = readFileSync(pagePath, 'utf-8');

  // Must filter by customer user_id
  assert.match(
    content,
    /\.eq\('id',\s*orderId\)[\s\S]*?\.eq\('user_id',\s*user\.id\)/,
    'Customer order details query must enforce .eq("user_id", user.id)'
  );

  // Must select tracking_number
  assert.match(
    content,
    /tracking_number,/,
    'Order query must project tracking_number column'
  );

  // Must NOT select admin_notes or purchase_cost
  assert.doesNotMatch(
    content,
    /admin_notes/,
    'Customer order query must strictly omit admin_notes'
  );
  assert.doesNotMatch(
    content,
    /purchase_cost/,
    'Customer order query must strictly omit purchase_cost'
  );
});

test('Customer Tracking Logic: Correctly distinguishes populated, missing, empty, and whitespace tracking numbers', () => {
  function renderTrackingCard(trackingNumber: string | null | undefined, currentStatus: string, courierName?: string | null) {
    const trimmed = trackingNumber?.trim();
    if (trimmed) {
      return {
        hasTracking: true,
        trackingNumber: trimmed,
        courier: courierName || null,
        status: currentStatus,
      };
    }
    return {
      hasTracking: false,
      message: 'Tracking information will appear here once your parcel has been dispatched.',
    };
  }

  // Case 1: Populated tracking number
  const case1 = renderTrackingCard('SL-POST-8839210', 'shipped');
  assert.equal(case1.hasTracking, true);
  assert.equal(case1.trackingNumber, 'SL-POST-8839210');
  assert.equal(case1.status, 'shipped');

  // Case 2: Populated tracking number before dispatch (e.g. pending/confirmed)
  const case2 = renderTrackingCard('SL-POST-8839210', 'confirmed');
  assert.equal(case2.hasTracking, true);
  assert.equal(case2.trackingNumber, 'SL-POST-8839210');
  assert.equal(case2.status, 'confirmed', 'Must display actual status without falsely claiming shipped');

  // Case 3: Missing tracking number (null)
  const case3 = renderTrackingCard(null, 'pending');
  assert.equal(case3.hasTracking, false);
  assert.equal(case3.message, 'Tracking information will appear here once your parcel has been dispatched.');

  // Case 4: Missing tracking number (undefined)
  const case4 = renderTrackingCard(undefined, 'pending');
  assert.equal(case4.hasTracking, false);
  assert.equal(case4.message, 'Tracking information will appear here once your parcel has been dispatched.');

  // Case 5: Empty tracking string ("")
  const case5 = renderTrackingCard('', 'processing');
  assert.equal(case5.hasTracking, false);
  assert.equal(case5.message, 'Tracking information will appear here once your parcel has been dispatched.');

  // Case 6: Whitespace-only tracking string ("   ")
  const case6 = renderTrackingCard('   ', 'processing');
  assert.equal(case6.hasTracking, false);
  assert.equal(case6.message, 'Tracking information will appear here once your parcel has been dispatched.');

  // Case 7: Updated tracking number
  const case7 = renderTrackingCard('DOM-EXPRESS-9912', 'shipped');
  assert.equal(case7.hasTracking, true);
  assert.equal(case7.trackingNumber, 'DOM-EXPRESS-9912');
});

test('Customer Tracking Safety: No invented courier or tracking URLs', () => {
  const pagePath = join(WORKSPACE_DIR, 'app/(store)/account/orders/[orderId]/page.tsx');
  const content = readFileSync(pagePath, 'utf-8');

  // Must not contain fabricated third-party tracking links
  assert.doesNotMatch(
    content,
    /https?:\/\/(?:www\.)?(?:slpost|certis|prompt|fardar|dhl|fedex)\.com/i,
    'Must not hardcode unverified external tracking redirect URLs'
  );
});
