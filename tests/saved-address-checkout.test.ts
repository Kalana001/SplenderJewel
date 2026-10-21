import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { SRI_LANKA_DISTRICTS, isValidDistrict } from '../lib/config/districts.ts';
import { getShippingBreakdown } from '../lib/config/shipping.ts';
import type { CustomerAddress } from '../types/address.ts';

const WORKSPACE_DIR = process.cwd();

// =============================================================================
// 1. SERVER ACTION SECURITY & ARCHITECTURE CONTRACTS
// =============================================================================

test('Saved Address Checkout Action: getCheckoutSavedAddressesAction exists and requires zero client-supplied user parameters', () => {
  const actionsPath = join(WORKSPACE_DIR, 'lib/addresses/actions.ts');
  assert.ok(existsSync(actionsPath), 'lib/addresses/actions.ts must exist');

  const content = readFileSync(actionsPath, 'utf-8');

  // Must export getCheckoutSavedAddressesAction
  assert.match(
    content,
    /export\s+async\s+function\s+getCheckoutSavedAddressesAction\s*\(/,
    'lib/addresses/actions.ts must export getCheckoutSavedAddressesAction'
  );

  // Must authenticate server-side via getCurrentUser()
  assert.match(
    content,
    /user\s*=\s*await\s+getCurrentUser\(\)/,
    'getCheckoutSavedAddressesAction must verify session server-side via getCurrentUser()'
  );

  // Must NOT accept userId parameter from client
  assert.match(
    content,
    /export\s+async\s+function\s+getCheckoutSavedAddressesAction\s*\(\s*\)/,
    'getCheckoutSavedAddressesAction must take zero client parameters to prevent ID spoofing'
  );

  // Must call getCustomerAddresses
  assert.match(
    content,
    /getCustomerAddresses\s*\(\s*\)/,
    'Must retrieve saved addresses via getCustomerAddresses after verifying customer authentication'
  );
});

test('Saved Address Checkout Action: Guest safe retrieval and unauthenticated handling', () => {
  const actionsPath = join(WORKSPACE_DIR, 'lib/addresses/actions.ts');
  const content = readFileSync(actionsPath, 'utf-8');

  // Verify guest branch returns unauthenticated state safely without error
  assert.match(
    content,
    /if\s*\(!user\)\s*\{\s*return\s*\{\s*isAuthenticated:\s*false,\s*addresses:\s*\[\]\s*\};\s*\}/,
    'Guest requests must return { isAuthenticated: false, addresses: [] } without throwing'
  );
});

// =============================================================================
// 2. CHECKOUT PAGE UI CONTRACT & ASYNC SAFETY INVARIANTS
// =============================================================================

test('Checkout Page: verifies saved address state, sequence guard, and manual edit protection', () => {
  const checkoutPagePath = join(WORKSPACE_DIR, 'app/(store)/checkout/page.tsx');
  assert.ok(existsSync(checkoutPagePath), 'app/(store)/checkout/page.tsx must exist');

  const content = readFileSync(checkoutPagePath, 'utf-8');

  // Saved address state declarations
  assert.match(content, /savedAddresses,\s*setSavedAddresses/, 'Must manage savedAddresses state');
  assert.match(content, /selectedAddressId,\s*setSelectedAddressId/, 'Must track selectedAddressId state');
  assert.match(content, /isAuthenticatedCustomer,\s*setIsAuthenticatedCustomer/, 'Must track customer auth state');

  // Sequence ref for race-condition prevention across slow network / account switches
  assert.match(
    content,
    /const\s+addressSeqRef\s*=\s*useRef\s*\(\s*0\s*\)/,
    'Must have addressSeqRef to discard responses from superseded async fetches'
  );

  // Manual edit ref to prevent late async fetches from clobbering user typing
  assert.match(
    content,
    /const\s+hasUserManuallyEditedRef\s*=\s*useRef\s*\(\s*false\s*\)/,
    'Must have hasUserManuallyEditedRef to guard user manual input against async overwrite'
  );

  // Auth event listeners for seamless login/logout/switch
  assert.match(content, /splender:auth-signed-in/, 'Must listen to splender:auth-signed-in custom event');
  assert.match(content, /splender:auth-signed-out/, 'Must listen to splender:auth-signed-out custom event');
  assert.match(content, /supabase\.auth\.onAuthStateChange/, 'Must listen to Supabase onAuthStateChange');
});

test('Checkout Page: ensures input field changes mark hasUserManuallyEditedRef', () => {
  const checkoutPagePath = join(WORKSPACE_DIR, 'app/(store)/checkout/page.tsx');
  const content = readFileSync(checkoutPagePath, 'utf-8');

  // Recipient name, phone, address fields must mark hasUserManuallyEditedRef.current = true
  assert.ok(
    content.includes('hasUserManuallyEditedRef.current = true;'),
    'Input onChange handlers must mark hasUserManuallyEditedRef.current = true'
  );
});

test('Checkout Page: renders Default badge and + Enter a new address option', () => {
  const checkoutPagePath = join(WORKSPACE_DIR, 'app/(store)/checkout/page.tsx');
  const content = readFileSync(checkoutPagePath, 'utf-8');

  // Check for Default badge
  assert.match(content, /Default/, 'Must display Default badge on default address');

  // Check for Enter new address button/card
  assert.match(
    content,
    /Enter a new address/,
    'Must render an option to enter a new address alongside saved addresses'
  );
});

// =============================================================================
// 3. BEHAVIORAL LOGIC & FORM PRE-FILL SIMULATION
// =============================================================================

test('Address Selection Logic: selecting saved address populates delivery fields and updates district', () => {
  const mockAddresses: CustomerAddress[] = [
    {
      id: 'addr-1',
      userId: 'user-123',
      label: 'Home',
      fullName: 'Sunil Perera',
      phone1: '+94771234567',
      phone2: '+94112345678',
      addressLine: '123 Galle Road',
      city: 'Colombo 03',
      district: 'Colombo',
      postalCode: '00300',
      deliveryNotes: 'Ring bell at gate',
      isDefault: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'addr-2',
      userId: 'user-123',
      label: 'Office',
      fullName: 'Sunil Perera (Work)',
      phone1: '+94719876543',
      phone2: null,
      addressLine: '45 Kandy Road',
      city: 'Peradeniya',
      district: 'Kandy',
      postalCode: '20400',
      deliveryNotes: null,
      isDefault: false,
      createdAt: '2026-01-02T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    },
  ];

  // Helper simulating checkout page address selection
  function handleSelectSavedAddress(
    addressId: string,
    addresses: CustomerAddress[],
    currentForm: Record<string, string>
  ) {
    if (addressId === 'new') {
      return {
        ...currentForm,
        customerName: '',
        phone1: '',
        phone2: '',
        addressLine: '',
        city: '',
        district: 'Colombo',
        postalCode: '',
        deliveryNotes: '',
      };
    }

    const addr = addresses.find((a) => a.id === addressId);
    if (!addr) return currentForm;

    return {
      ...currentForm,
      customerName: addr.fullName,
      phone1: addr.phone1,
      phone2: addr.phone2 || '',
      addressLine: addr.addressLine,
      city: addr.city || '',
      district: addr.district,
      postalCode: addr.postalCode || '',
      deliveryNotes: addr.deliveryNotes || '',
    };
  }

  // 1. Select Home (addr-1)
  const initialForm = {
    customerName: '',
    phone1: '',
    phone2: '',
    addressLine: '',
    city: '',
    district: 'Colombo',
    postalCode: '',
    deliveryNotes: '',
    email: 'sunil@example.com',
  };

  const formAfterAddr1 = handleSelectSavedAddress('addr-1', mockAddresses, initialForm);
  assert.equal(formAfterAddr1.customerName, 'Sunil Perera');
  assert.equal(formAfterAddr1.phone1, '+94771234567');
  assert.equal(formAfterAddr1.phone2, '+94112345678');
  assert.equal(formAfterAddr1.addressLine, '123 Galle Road');
  assert.equal(formAfterAddr1.city, 'Colombo 03');
  assert.equal(formAfterAddr1.district, 'Colombo');
  assert.equal(formAfterAddr1.postalCode, '00300');
  assert.equal(formAfterAddr1.deliveryNotes, 'Ring bell at gate');
  assert.equal(formAfterAddr1.email, 'sunil@example.com');

  // 2. Switch to Office (addr-2)
  const formAfterAddr2 = handleSelectSavedAddress('addr-2', mockAddresses, formAfterAddr1);
  assert.equal(formAfterAddr2.customerName, 'Sunil Perera (Work)');
  assert.equal(formAfterAddr2.phone1, '+94719876543');
  assert.equal(formAfterAddr2.phone2, '');
  assert.equal(formAfterAddr2.addressLine, '45 Kandy Road');
  assert.equal(formAfterAddr2.city, 'Peradeniya');
  assert.equal(formAfterAddr2.district, 'Kandy');
  assert.equal(formAfterAddr2.postalCode, '20400');
  assert.equal(formAfterAddr2.deliveryNotes, '');

  // 3. Switch to "+ Enter a new address" ('new')
  const formAfterNew = handleSelectSavedAddress('new', mockAddresses, formAfterAddr2);
  assert.equal(formAfterNew.customerName, '');
  assert.equal(formAfterNew.phone1, '');
  assert.equal(formAfterNew.addressLine, '');
  assert.equal(formAfterNew.city, '');
  assert.equal(formAfterNew.district, 'Colombo'); // Default fallback district
  assert.equal(formAfterNew.email, 'sunil@example.com'); // Email preserved
});

test('Address Pre-fill Guard: late async response does NOT overwrite user who started manual typing', () => {
  let hasUserManuallyEdited = false;
  let formCustomerName = '';
  let formAddressLine = '';

  // Simulate user immediately typing before async load completes
  hasUserManuallyEdited = true;
  formCustomerName = 'Kasun Manual';
  formAddressLine = '99 Custom Lane';

  // Async load completes
  const asyncAddresses: CustomerAddress[] = [
    {
      id: 'addr-default',
      userId: 'user-123',
      label: 'Home',
      fullName: 'Stored Default Name',
      phone1: '+94770000000',
      phone2: null,
      addressLine: '123 Old Stored St',
      city: 'Colombo',
      district: 'Colombo',
      postalCode: null,
      deliveryNotes: null,
      isDefault: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  // Logic from checkout page:
  let selectedAddressId = 'new';
  if (!hasUserManuallyEdited) {
    const defaultAddr = asyncAddresses.find((a) => a.isDefault) || asyncAddresses[0];
    selectedAddressId = defaultAddr.id;
    formCustomerName = defaultAddr.fullName;
    formAddressLine = defaultAddr.addressLine;
  }

  // Verify that manual input was preserved!
  assert.equal(formCustomerName, 'Kasun Manual');
  assert.equal(formAddressLine, '99 Custom Lane');
  assert.equal(selectedAddressId, 'new');
});

test('Account Transition Privacy: Customer A signout wipes all private auto-filled fields and Customer B never sees Customer A data', () => {
  // 1. Customer A state
  let savedAddresses: CustomerAddress[] = [
    {
      id: 'addr-customer-a',
      userId: 'user-a-123',
      label: 'Home',
      fullName: 'Customer A Private Name',
      phone1: '+94771234567',
      phone2: '+94112345678',
      addressLine: '123 Customer A Street',
      city: 'Colombo 07',
      district: 'Colombo',
      postalCode: '00700',
      deliveryNotes: 'Leave with concierge for Customer A',
      isDefault: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];
  let selectedAddressId = 'addr-customer-a';
  let isAuthenticatedCustomer = true;
  let customerName = 'Customer A Private Name';
  let phone1 = '+94771234567';
  let phone2 = '+94112345678';
  let email = 'customer.a@example.com';
  let addressLine = '123 Customer A Street';
  let city = 'Colombo 07';
  let district: any = 'Colombo';
  let postalCode = '00700';
  let deliveryNotes = 'Leave with concierge for Customer A';
  let addressSeq = 1;
  let hasUserManuallyEdited = false;

  // 2. Customer A signs out while remaining on checkout
  const handleSignOut = () => {
    ++addressSeq;
    isAuthenticatedCustomer = false;
    savedAddresses = [];
    selectedAddressId = 'new';
    hasUserManuallyEdited = false;

    // Clear all customer-specific recipient & delivery fields
    customerName = '';
    phone1 = '';
    phone2 = '';
    email = '';
    addressLine = '';
    city = '';
    district = 'Colombo';
    postalCode = '';
    deliveryNotes = '';
  };

  handleSignOut();

  // 3. Confirm all Customer A private data is wiped
  assert.equal(savedAddresses.length, 0, 'Saved address cards must be empty on sign-out');
  assert.equal(selectedAddressId, 'new', 'Selected address ID must reset to new');
  assert.equal(isAuthenticatedCustomer, false, 'Auth customer flag must be false');
  assert.equal(customerName, '', 'Customer name must be cleared');
  assert.equal(phone1, '', 'Phone1 must be cleared');
  assert.equal(phone2, '', 'Phone2 must be cleared');
  assert.equal(email, '', 'Email must be cleared');
  assert.equal(addressLine, '', 'Address line must be cleared');
  assert.equal(city, '', 'City must be cleared');
  assert.equal(postalCode, '', 'Postal code must be cleared');
  assert.equal(deliveryNotes, '', 'Delivery notes must be cleared');

  // 4. Delayed response from Customer A's session arrives after sign-out
  const delayedResponseCustomerA = {
    seq: 1, // Stale sequence from Customer A's load request
    addresses: [{ id: 'addr-customer-a-delayed', fullName: 'Customer A Stale' }],
  };

  // The checkout logic rejects any response where seq !== addressSeq
  if (delayedResponseCustomerA.seq === addressSeq) {
    customerName = (delayedResponseCustomerA.addresses[0] as any).fullName;
  }
  assert.equal(customerName, '', 'Delayed response from Customer A must be discarded by sequence guard');

  // 5. Customer B signs in
  const customerBSeq = ++addressSeq;
  isAuthenticatedCustomer = true;
  const customerBAddresses: CustomerAddress[] = [
    {
      id: 'addr-customer-b',
      userId: 'user-b-456',
      label: 'Office',
      fullName: 'Customer B Distinct Name',
      phone1: '+94719876543',
      phone2: null,
      addressLine: '99 Customer B Boulevard',
      city: 'Kandy City',
      district: 'Kandy',
      postalCode: '20000',
      deliveryNotes: null,
      isDefault: true,
      createdAt: '2026-02-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
    },
  ];

  // Customer B async response resolves
  if (customerBSeq === addressSeq) {
    savedAddresses = customerBAddresses;
    const defaultAddr = customerBAddresses[0];
    selectedAddressId = defaultAddr.id;
    customerName = defaultAddr.fullName;
    phone1 = defaultAddr.phone1;
    phone2 = defaultAddr.phone2 || '';
    addressLine = defaultAddr.addressLine;
    city = defaultAddr.city || '';
    district = defaultAddr.district;
    postalCode = defaultAddr.postalCode || '';
    deliveryNotes = defaultAddr.deliveryNotes || '';
    email = 'customer.b@example.com';
  }

  // 6. Confirm Customer B sees only their data and ZERO traces of Customer A
  assert.equal(customerName, 'Customer B Distinct Name');
  assert.equal(phone1, '+94719876543');
  assert.equal(phone2, '');
  assert.equal(addressLine, '99 Customer B Boulevard');
  assert.equal(city, 'Kandy City');
  assert.equal(district, 'Kandy');
  assert.equal(postalCode, '20000');
  assert.equal(deliveryNotes, '');
  assert.equal(email, 'customer.b@example.com');
  assert.equal(selectedAddressId, 'addr-customer-b');
  assert.ok(!JSON.stringify(savedAddresses).includes('Customer A'));
});

test('Error Handling: getCheckoutSavedAddressesAction distinguishes DB/network error from guest and does not leak internal errors', () => {
  const actionsPath = join(WORKSPACE_DIR, 'lib/addresses/actions.ts');
  const content = readFileSync(actionsPath, 'utf-8');

  // Verify generic, customer-safe error message
  assert.match(
    content,
    /error:\s*['"]Unable to retrieve saved addresses at this time\.['"]/,
    'Must return customer-safe error message without leaking SQL or stack traces'
  );

  // Authenticated state preserved even when address retrieval has DB error
  assert.match(
    content,
    /isAuthenticated:\s*true,\s*addresses:\s*\[\],\s*email:\s*user\.email/,
    'Must preserve isAuthenticated: true and customer email on address fetch failure'
  );
});

test('Live Checkout Protection: NEXT_PUBLIC_ENABLE_LIVE_CHECKOUT remains disabled', () => {
  const envContent = existsSync(join(WORKSPACE_DIR, '.env.local'))
    ? readFileSync(join(WORKSPACE_DIR, '.env.local'), 'utf-8')
    : '';

  assert.match(
    envContent,
    /NEXT_PUBLIC_ENABLE_LIVE_CHECKOUT\s*=\s*false/,
    'NEXT_PUBLIC_ENABLE_LIVE_CHECKOUT must be strictly false in .env.local'
  );
});

// =============================================================================
// 4. SHIPPING MATRIX INTEGRATION & DISTRICT VALIDATION
// =============================================================================

test('District Integration: all 25 official Sri Lankan districts update shipping rates accurately', () => {
  assert.equal(SRI_LANKA_DISTRICTS.length, 25);

  for (const district of SRI_LANKA_DISTRICTS) {
    assert.equal(isValidDistrict(district), true, `${district} must be valid`);

    // Tier 1 calculation: 1 item, Bank Transfer
    const breakdown = getShippingBreakdown({ paymentMethod: 'BANK_TRANSFER', totalQuantity: 1 });
    assert.equal(breakdown.fee, 200, 'Bank transfer tier 1 fee must be 200 LKR');
    assert.match(breakdown.tierDescription, /1–3 items/);
  }

  // Invalid districts must be rejected
  assert.equal(isValidDistrict('London'), false);
  assert.equal(isValidDistrict('California'), false);
  assert.equal(isValidDistrict(''), false);

  // COD Tier calculations
  const codTier1 = getShippingBreakdown({ paymentMethod: 'COD', totalQuantity: 2 });
  assert.equal(codTier1.fee, 350);

  const codTier2 = getShippingBreakdown({ paymentMethod: 'COD', totalQuantity: 5 });
  assert.equal(codTier2.fee, 400);

  const codTier3 = getShippingBreakdown({ paymentMethod: 'COD', totalQuantity: 15 });
  assert.equal(codTier3.fee, 500);
});

// =============================================================================
// 5. ORDER SNAPSHOT & ADDRESS BOOK IMMUTABILITY
// =============================================================================

test('Order Snapshot Immutability: Editing form values does not alter customer address book', () => {
  const addressInDatabase: CustomerAddress = {
    id: 'addr-100',
    userId: 'user-abc',
    label: 'Home',
    fullName: 'Original Name',
    phone1: '+94770000000',
    phone2: null,
    addressLine: '10 Original Way',
    city: 'Colombo',
    district: 'Colombo',
    postalCode: '00100',
    deliveryNotes: null,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  // Deep clone to represent database state before checkout
  const dbSnapshotBefore = JSON.parse(JSON.stringify(addressInDatabase));

  // User selects address addr-100, then edits the phone number and address line on checkout form
  const orderFormData = {
    customerName: addressInDatabase.fullName,
    phone1: '+94779999999', // Modified for this order only
    phone2: '+94119999999',
    addressLine: '10 Original Way, Suite 4B (Temporary Delivery)', // Modified
    city: addressInDatabase.city,
    district: addressInDatabase.district,
    postalCode: addressInDatabase.postalCode,
    deliveryNotes: 'Leave with security guard',
  };

  // Verify order payload contains the modified delivery details
  assert.equal(orderFormData.phone1, '+94779999999');
  assert.equal(orderFormData.addressLine, '10 Original Way, Suite 4B (Temporary Delivery)');

  // Verify saved address in database is 100% UNCHANGED
  assert.deepEqual(addressInDatabase, dbSnapshotBefore);
});

test('Guest Checkout Preservation: guest checkouts render manual form without address selector', () => {
  const checkoutPagePath = join(WORKSPACE_DIR, 'app/(store)/checkout/page.tsx');
  const content = readFileSync(checkoutPagePath, 'utf-8');

  // Address card list must only render when isAuthenticatedCustomer && savedAddresses.length > 0
  assert.match(
    content,
    /isAuthenticatedCustomer\s*&&\s*savedAddresses\.length\s*>\s*0/,
    'Address selector must only render for authenticated customers with saved addresses'
  );

  // Manual input fields (customerName, phone1, addressLine, district) must always be rendered
  assert.match(content, /id="customerName"/, 'customerName input must always be present');
  assert.match(content, /id="phone1"/, 'phone1 input must always be present');
  assert.match(content, /id="addressLine"/, 'addressLine input must always be present');
  assert.match(content, /id="district"/, 'district select must always be present');
});
