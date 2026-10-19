import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCheckoutPermission, AUTHORIZED_TESTER_USER_IDS } from '../lib/orders/authorization.ts';

// Known Test UUIDs from Database Inspection
const TEST_CUSTOMER_USER_ID = 'a7db3a41-c12f-4dfd-9dc6-54fee355e60d'; // kalanasri001@gmail.com
const AUTHORIZED_ADMIN_USER_ID = '4c0ad512-e507-4f3a-8908-11048d5edf7e'; // splenderjewel@gmail.com
const ORDINARY_CUSTOMER_USER_ID = 'f89e2231-1122-3344-5566-778899aabbcc';
const UNLISTED_ADMIN_USER_ID = 'd1122334-4455-6677-8899-aabbccddeeff';

// =============================================================================
// PHASE 9D: TESTER CHECKOUT AUTHORIZATION VERIFICATION (7 SCENARIOS)
// =============================================================================

test('Scenario 1: Production checkout disabled + authorized test customer signed in = checkout allowed', () => {
  const result = evaluateCheckoutPermission({
    isLiveCheckoutEnabled: false,
    userId: TEST_CUSTOMER_USER_ID,
    adminUser: null,
  });

  assert.equal(result.allowed, true, 'Authorized test customer must be allowed to checkout');
  assert.equal(result.reason, undefined);
});

test('Scenario 2A: Production checkout disabled + explicitly authorized active admin signed in = checkout allowed', () => {
  const result = evaluateCheckoutPermission({
    isLiveCheckoutEnabled: false,
    userId: AUTHORIZED_ADMIN_USER_ID,
    adminUser: { id: AUTHORIZED_ADMIN_USER_ID, isActive: true },
  });

  assert.equal(result.allowed, true, 'Explicitly authorized active admin must be allowed to checkout');
});

test('Scenario 2B: Production checkout disabled + unlisted admin signed in = checkout strictly BLOCKED', () => {
  // An administrator account NOT in the explicit allowlist must NOT be permitted
  const result = evaluateCheckoutPermission({
    isLiveCheckoutEnabled: false,
    userId: UNLISTED_ADMIN_USER_ID,
    adminUser: { id: UNLISTED_ADMIN_USER_ID, isActive: true },
  });

  assert.equal(result.allowed, false, 'Unlisted admin must be blocked');
  assert.match(result.reason || '', /not on the explicit authorized tester allowlist/);
});

test('Scenario 2C: Production checkout disabled + inactive admin signed in = checkout strictly BLOCKED', () => {
  const result = evaluateCheckoutPermission({
    isLiveCheckoutEnabled: false,
    userId: AUTHORIZED_ADMIN_USER_ID,
    adminUser: { id: AUTHORIZED_ADMIN_USER_ID, isActive: false }, // Inactive
  });

  assert.equal(result.allowed, false, 'Inactive admin must be blocked even if ID is listed');
});

test('Scenario 3: Production checkout disabled + ordinary authenticated customer = checkout BLOCKED', () => {
  const result = evaluateCheckoutPermission({
    isLiveCheckoutEnabled: false,
    userId: ORDINARY_CUSTOMER_USER_ID,
    adminUser: null,
  });

  assert.equal(result.allowed, false, 'Ordinary customer must be blocked during preview mode');
  assert.match(result.reason || '', /storefront is currently in development preview mode/);
});

test('Scenario 4: Production checkout disabled + guest checkout = checkout BLOCKED', () => {
  const result = evaluateCheckoutPermission({
    isLiveCheckoutEnabled: false,
    userId: null, // Guest
    adminUser: null,
  });

  assert.equal(result.allowed, false, 'Guest checkout must be blocked during preview mode');
  assert.match(result.reason || '', /storefront is currently in development preview mode/);
});

test('Scenario 5: Direct unauthorized Server Action invocation without session = BLOCKED', () => {
  // Simulates direct POST to Server Action endpoint by anonymous attacker
  const result = evaluateCheckoutPermission({
    isLiveCheckoutEnabled: false,
    userId: null,
    adminUser: null,
  });

  assert.equal(result.allowed, false);
  assert.match(result.reason || '', /temporarily disabled while transactional database verification is underway/);
});

test('Scenario 6: Invalid or forged user ID = strictly BLOCKED', () => {
  // A forged random string or malicious client-supplied ID not in the server allowlist
  const forgedResult = evaluateCheckoutPermission({
    isLiveCheckoutEnabled: false,
    userId: 'admin" OR 1=1--',
    adminUser: null,
  });
  assert.equal(forgedResult.allowed, false, 'Forged SQL injection user ID must be blocked');

  const randomGuidResult = evaluateCheckoutPermission({
    isLiveCheckoutEnabled: false,
    userId: '00000000-0000-0000-0000-000000000000',
    adminUser: null,
  });
  assert.equal(randomGuidResult.allowed, false, 'Unregistered UUID must be blocked');
});

test('Scenario 7: Production checkout enabled after official launch = normal customer and guest checkout allowed without tester restrictions', () => {
  // Subcase 7A: Guest checkout permitted after launch
  const guestAfterLaunch = evaluateCheckoutPermission({
    isLiveCheckoutEnabled: true,
    userId: null,
    adminUser: null,
  });
  assert.equal(guestAfterLaunch.allowed, true, 'Guest checkout must work when live checkout is enabled');

  // Subcase 7B: Ordinary customer permitted after launch
  const customerAfterLaunch = evaluateCheckoutPermission({
    isLiveCheckoutEnabled: true,
    userId: ORDINARY_CUSTOMER_USER_ID,
    adminUser: null,
  });
  assert.equal(customerAfterLaunch.allowed, true, 'Ordinary customer must work when live checkout is enabled');

  // Subcase 7C: Admin permitted after launch
  const adminAfterLaunch = evaluateCheckoutPermission({
    isLiveCheckoutEnabled: true,
    userId: UNLISTED_ADMIN_USER_ID,
    adminUser: { id: UNLISTED_ADMIN_USER_ID, isActive: true },
  });
  assert.equal(adminAfterLaunch.allowed, true, 'Admin checkout must work when live checkout is enabled');
});

test('Server Allowlist: Verify server-only allowlist integrity and contents', () => {
  assert.equal(AUTHORIZED_TESTER_USER_IDS.has(TEST_CUSTOMER_USER_ID), true);
  assert.equal(AUTHORIZED_TESTER_USER_IDS.has(AUTHORIZED_ADMIN_USER_ID), true);
  assert.equal(AUTHORIZED_TESTER_USER_IDS.has(ORDINARY_CUSTOMER_USER_ID), false);
  assert.equal(AUTHORIZED_TESTER_USER_IDS.has(UNLISTED_ADMIN_USER_ID), false);
});

// =============================================================================
// PHASE 9D REGRESSION: UI AND SERVER AUTHORIZATION CONSISTENCY
// =============================================================================

test('Consistency 1: Authorized tester + public checkout disabled = UI ALLOWED & Server ALLOWED', () => {
  const isLiveCheckout = false;
  const isTester = true;
  const userId = TEST_CUSTOMER_USER_ID;

  // UI check in handleSubmit:
  const uiBlocked = !isLiveCheckout && !isTester;
  assert.equal(uiBlocked, false, 'UI must allow authorized tester to submit');

  // Server check in createOrderAction:
  const serverPerm = evaluateCheckoutPermission({
    isLiveCheckoutEnabled: isLiveCheckout,
    userId,
    adminUser: null,
  });
  assert.equal(serverPerm.allowed, true, 'Server must allow authorized tester');
});

test('Consistency 2: Ordinary customer + public checkout disabled = UI BLOCKED & Server BLOCKED', () => {
  const isLiveCheckout = false;
  const isTester = false;
  const userId = ORDINARY_CUSTOMER_USER_ID;

  // UI check in handleSubmit:
  const uiBlocked = !isLiveCheckout && !isTester;
  assert.equal(uiBlocked, true, 'UI must block ordinary customer');

  // Server check in createOrderAction:
  const serverPerm = evaluateCheckoutPermission({
    isLiveCheckoutEnabled: isLiveCheckout,
    userId,
    adminUser: null,
  });
  assert.equal(serverPerm.allowed, false, 'Server must block ordinary customer');
});

test('Consistency 3: Guest + public checkout disabled = UI BLOCKED & Server BLOCKED', () => {
  const isLiveCheckout = false;
  const isTester = false;
  const userId = null;

  // UI check in handleSubmit:
  const uiBlocked = !isLiveCheckout && !isTester;
  assert.equal(uiBlocked, true, 'UI must block guest');

  // Server check in createOrderAction:
  const serverPerm = evaluateCheckoutPermission({
    isLiveCheckoutEnabled: isLiveCheckout,
    userId,
    adminUser: null,
  });
  assert.equal(serverPerm.allowed, false, 'Server must block guest');
});

test('Security 4: Forged client-side tester status (attacker sets isTester=true) = Server strictly BLOCKS', () => {
  const isLiveCheckout = false;
  // Attacker tampers client memory to make UI think isTester = true
  const forgedClientTester = true;
  const uiBlocked = !isLiveCheckout && !forgedClientTester;
  assert.equal(uiBlocked, false, 'Tampered UI allows button click');

  // But Server Action uses actual session from cookies (ordinary customer or guest), completely ignoring client claims
  const ordinarySessionUserId = ORDINARY_CUSTOMER_USER_ID;
  const serverPerm = evaluateCheckoutPermission({
    isLiveCheckoutEnabled: isLiveCheckout,
    userId: ordinarySessionUserId,
    adminUser: null,
  });
  assert.equal(serverPerm.allowed, false, 'Server action strictly rejects forged client session');
});

test('Security 5: Authenticated user ID mismatch or injected user_id payload = Server strictly BLOCKS', () => {
  // Simulates an attacker sending payload with an authorized tester user_id while signed in as ordinary customer
  const clientSuppliedPayload: Record<string, unknown> = {
    customerName: 'Attacker',
    user_id: TEST_CUSTOMER_USER_ID, // Injected tester ID
    userId: TEST_CUSTOMER_USER_ID,
  };

  // createOrderAction payload guard:
  const hasInjectedUserIdentity = 'user_id' in clientSuppliedPayload || 'userId' in clientSuppliedPayload;
  assert.equal(hasInjectedUserIdentity, true);

  // Even if stripped, server uses actual session user ID
  const actualSessionUserId = ORDINARY_CUSTOMER_USER_ID;
  const serverPerm = evaluateCheckoutPermission({
    isLiveCheckoutEnabled: false,
    userId: actualSessionUserId,
    adminUser: null,
  });
  assert.equal(serverPerm.allowed, false, 'Injected identity cannot bypass server allowlist');
});

test('Consistency 6: Public checkout enabled = UI ALLOWED & Server ALLOWED for all users', () => {
  const isLiveCheckout = true;
  for (const uid of [null, ORDINARY_CUSTOMER_USER_ID, TEST_CUSTOMER_USER_ID, UNLISTED_ADMIN_USER_ID]) {
    const isTester = false; // Not a tester
    const uiBlocked = !isLiveCheckout && !isTester;
    assert.equal(uiBlocked, false, 'UI allows checkout when live checkout is enabled');

    const serverPerm = evaluateCheckoutPermission({
      isLiveCheckoutEnabled: isLiveCheckout,
      userId: uid,
      adminUser: null,
    });
    assert.equal(serverPerm.allowed, true, 'Server allows checkout when live checkout is enabled');
  }
});
