import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SRI_LANKA_DISTRICTS, isValidDistrict } from '../lib/config/districts.ts';
import { calculateShippingFee, getShippingBreakdown } from '../lib/config/shipping.ts';

const WORKSPACE_DIR = process.cwd();

// -----------------------------------------------------------------------------
// 1. VERIFY ALL 25 SRI LANKAN DISTRICTS
// -----------------------------------------------------------------------------
test('Delivery Matrix — Exactly 25 canonical Sri Lankan administrative districts are defined', () => {
  assert.equal(SRI_LANKA_DISTRICTS.length, 25);

  const expectedDistricts = [
    'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo',
    'Galle', 'Gampaha', 'Hambantota', 'Jaffna', 'Kalutara',
    'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala', 'Mannar',
    'Matale', 'Matara', 'Monaragala', 'Mullaitivu', 'Nuwara Eliya',
    'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
  ];

  for (const district of expectedDistricts) {
    assert.ok(isValidDistrict(district), `Expected ${district} to be valid`);
  }

  assert.equal(isValidDistrict('London'), false);
  assert.equal(isValidDistrict(''), false);
});

// -----------------------------------------------------------------------------
// 2. VERIFY PROVINCIAL PARTITIONING
// -----------------------------------------------------------------------------
test('Delivery Matrix — 25 districts cleanly partition into the 9 provinces of Sri Lanka', () => {
  const provinceMap: Record<string, string[]> = {
    Western: ['Colombo', 'Gampaha', 'Kalutara'],
    Central: ['Kandy', 'Matale', 'Nuwara Eliya'],
    Southern: ['Galle', 'Matara', 'Hambantota'],
    Northern: ['Jaffna', 'Kilinochchi', 'Mannar', 'Mullaitivu', 'Vavuniya'],
    Eastern: ['Ampara', 'Batticaloa', 'Trincomalee'],
    'North Western': ['Kurunegala', 'Puttalam'],
    'North Central': ['Anuradhapura', 'Polonnaruwa'],
    Uva: ['Badulla', 'Monaragala'],
    Sabaragamuwa: ['Kegalle', 'Ratnapura'],
  };

  const provinces = Object.keys(provinceMap);
  assert.equal(provinces.length, 9);

  let totalMappedDistricts = 0;
  for (const [province, districts] of Object.entries(provinceMap)) {
    assert.ok(districts.length >= 2, `${province} should have at least 2 districts`);
    totalMappedDistricts += districts.length;
    for (const d of districts) {
      assert.ok(isValidDistrict(d), `${d} in ${province} must be valid district`);
    }
  }

  assert.equal(totalMappedDistricts, 25);
});

// -----------------------------------------------------------------------------
// 3. VERIFY UI SOURCE CODE HARDENING (NO OBSOLETE FEE OR FREE-SHIPPING INPUTS)
// -----------------------------------------------------------------------------
test('Delivery Matrix UI — components/admin/settings/delivery-settings-manager.tsx removes obsolete fee inputs and misleading controls', () => {
  const componentPath = path.join(WORKSPACE_DIR, 'components/admin/settings/delivery-settings-manager.tsx');
  assert.ok(fs.existsSync(componentPath), 'delivery-settings-manager.tsx must exist');

  const source = fs.readFileSync(componentPath, 'utf8');

  // Must NOT contain number inputs for editing district fees
  assert.doesNotMatch(source, /<input[^>]*type=["']number["']/i, 'Must not render numeric fee inputs');
  assert.doesNotMatch(source, /provinceBatchFee/i, 'Must not contain province batch fee state');
  assert.doesNotMatch(source, /handleBatchUpdateProvince/i, 'Must not contain province batch update handler');

  // Must NOT contain misleading global free-delivery controls
  assert.doesNotMatch(source, /freeDeliveryEnabled/i, 'Must not contain freeDeliveryEnabled state');
  assert.doesNotMatch(source, /freeDeliveryThreshold/i, 'Must not contain freeDeliveryThreshold state');
  assert.doesNotMatch(source, /defaultDeliveryFee/i, 'Must not contain defaultDeliveryFee state');
  assert.doesNotMatch(source, /updateGlobalDeliverySettings/i, 'Must not import updateGlobalDeliverySettings');

  // MUST display official Postal Rate Card with exact tiers
  assert.match(source, /Rs\.\s*200/i, 'Must display Rs. 200 rate');
  assert.match(source, /Rs\.\s*250/i, 'Must display Rs. 250 rate');
  assert.match(source, /Rs\.\s*350/i, 'Must display Rs. 350 rate');
  assert.match(source, /Rs\.\s*400/i, 'Must display Rs. 400 rate');
  assert.match(source, /Rs\.\s*500/i, 'Must display Rs. 500 rate');
  assert.match(source, /Sri Lanka Post Speed Post/i, 'Must mention Speed Post service');
  assert.match(source, /Cash on Delivery/i, 'Must mention Cash on Delivery');

  // MUST use dedicated updateDistrictAvailability action
  assert.match(source, /updateDistrictAvailability/i, 'Must import updateDistrictAvailability');
});

// -----------------------------------------------------------------------------
// 4. VERIFY DEDICATED SERVER ACTION ARCHITECTURAL CONTRACTS
// -----------------------------------------------------------------------------
test('Delivery Matrix Server Action — updateDistrictAvailability enforces requireAdminAuth, validation, and safe update', () => {
  const actionsPath = path.join(WORKSPACE_DIR, 'lib/settings/admin-actions.ts');
  assert.ok(fs.existsSync(actionsPath), 'lib/settings/admin-actions.ts must exist');

  const content = fs.readFileSync(actionsPath, 'utf8');

  // 1. Must export updateDistrictAvailability
  assert.match(
    content,
    /export\s+async\s+function\s+updateDistrictAvailability/,
    'Must export updateDistrictAvailability server action'
  );

  const fnIndex = content.indexOf('updateDistrictAvailability');
  const fnBody = content.slice(fnIndex, content.indexOf('export async function updateDistrictDeliveryFee', fnIndex));

  // 2. Must call requireAdminAuth()
  assert.match(
    fnBody,
    /await\s+requireAdminAuth\(\)/,
    'updateDistrictAvailability must strictly call requireAdminAuth()'
  );

  // 3. Must validate district ID presence and UUID format
  assert.match(
    fnBody,
    /UUID_REGEX\.test/,
    'updateDistrictAvailability must validate districtId with UUID regex'
  );
  assert.match(
    fnBody,
    /typeof\s+isActive\s*!==\s*['"]boolean['"]/,
    'updateDistrictAvailability must validate boolean type for isActive'
  );

  // 4. Must update is_active on delivery_districts
  assert.match(
    fnBody,
    /\.from\(['"]delivery_districts['"]\)/,
    'updateDistrictAvailability must target delivery_districts table'
  );
  assert.match(
    fnBody,
    /is_active:\s*isActive/,
    'updateDistrictAvailability must update is_active column'
  );

  // 5. Must NOT mutate delivery_fee
  assert.doesNotMatch(
    fnBody,
    /delivery_fee:/,
    'updateDistrictAvailability must never mutate delivery_fee'
  );

  // 6. Must revalidate admin delivery settings path
  assert.match(
    fnBody,
    /revalidatePath\(['"]\/admin\/settings\/delivery['"]\)/,
    'updateDistrictAvailability must revalidate /admin/settings/delivery'
  );
});

// -----------------------------------------------------------------------------
// 5. REGRESSION: CHECKOUT SHIPPING CALCULATION INTEGRITY
// -----------------------------------------------------------------------------
test('Delivery Matrix Regression — Active shipping calculations remain 100% intact and unchanged', () => {
  // Bank Transfer (Speed Post)
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 1 }), 200);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 3 }), 200);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 4 }), 250);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 7 }), 250);
  assert.equal(calculateShippingFee({ paymentMethod: 'bank_transfer', totalQuantity: 8 }), 350);

  // Cash on Delivery (Post COD)
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: 1 }), 350);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: 3 }), 350);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: 4 }), 400);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: 10 }), 400);
  assert.equal(calculateShippingFee({ paymentMethod: 'cod', totalQuantity: 11 }), 500);

  // Breakdown carrier names
  const bankBreakdown = getShippingBreakdown({ paymentMethod: 'bank_transfer', totalQuantity: 2 });
  assert.equal(bankBreakdown.courierService, 'Sri Lanka Post Speed Post');
  assert.equal(bankBreakdown.fee, 200);

  const codBreakdown = getShippingBreakdown({ paymentMethod: 'cod', totalQuantity: 5 });
  assert.equal(codBreakdown.courierService, 'Sri Lanka Post COD');
  assert.equal(codBreakdown.fee, 400);
});
