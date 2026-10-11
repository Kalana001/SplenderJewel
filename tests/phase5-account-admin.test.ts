import test from 'node:test';
import assert from 'node:assert/strict';
import { SRI_LANKA_DISTRICTS, isValidDistrict } from '../lib/config/districts.ts';
import { normalizePhoneNumber } from '../lib/config/whatsapp.ts';

// =============================================================================
// 1. CUSTOMER ADDRESS VALIDATION & DISTRICT NORMALIZATION
// =============================================================================

test('Customer Address Validation: validates required fields, Sri Lankan districts, and phone formats', () => {
  const validateAddress = (input: {
    fullName: string;
    phone1: string;
    addressLine: string;
    district: string;
  }) => {
    const fullName = input.fullName?.trim();
    if (!fullName || fullName.length < 2) {
      return { valid: false, error: 'Full name is required (minimum 2 characters).' };
    }

    const rawPhone = input.phone1?.trim();
    if (!rawPhone) {
      return { valid: false, error: 'Primary contact phone number is required.' };
    }
    const phone = normalizePhoneNumber(rawPhone);
    if (!phone || phone.length < 9) {
      return { valid: false, error: 'Please enter a valid phone number.' };
    }

    const addressLine = input.addressLine?.trim();
    if (!addressLine || addressLine.length < 5) {
      return { valid: false, error: 'Street address line is required (minimum 5 characters).' };
    }

    const district = input.district?.trim();
    if (!district || !isValidDistrict(district)) {
      return { valid: false, error: 'Please select a valid Sri Lankan administrative district.' };
    }

    return { valid: true, normalized: { fullName, phone, addressLine, district } };
  };

  // Invalid names
  assert.equal(validateAddress({ fullName: '', phone1: '0771234567', addressLine: '123 Galle Rd', district: 'Colombo' }).valid, false);
  assert.equal(validateAddress({ fullName: 'A', phone1: '0771234567', addressLine: '123 Galle Rd', district: 'Colombo' }).valid, false);

  // Invalid phone numbers
  assert.equal(validateAddress({ fullName: 'Kasun Perera', phone1: '', addressLine: '123 Galle Rd', district: 'Colombo' }).valid, false);
  assert.equal(validateAddress({ fullName: 'Kasun Perera', phone1: '123', addressLine: '123 Galle Rd', district: 'Colombo' }).valid, false);

  // Invalid address line
  assert.equal(validateAddress({ fullName: 'Kasun Perera', phone1: '0771234567', addressLine: 'Road', district: 'Colombo' }).valid, false);

  // Invalid district
  assert.equal(validateAddress({ fullName: 'Kasun Perera', phone1: '0771234567', addressLine: '123 Galle Rd', district: 'London' }).valid, false);
  assert.equal(validateAddress({ fullName: 'Kasun Perera', phone1: '0771234567', addressLine: '123 Galle Rd', district: 'California' }).valid, false);

  // Valid address with Sri Lankan local phone
  const valid = validateAddress({
    fullName: ' Kasun Perera ',
    phone1: '077 123 4567',
    addressLine: 'No. 45/2, Temple Road',
    district: 'Kandy',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.normalized?.fullName, 'Kasun Perera');
  assert.equal(valid.normalized?.phone, '+94771234567');
  assert.equal(valid.normalized?.district, 'Kandy');
});

test('Customer Address Default State: automatically designates first address as default and manages default switching', () => {
  type MockAddress = { id: string; label: string; isDefault: boolean };

  function addAddress(existing: MockAddress[], newAddr: { id: string; label: string; isDefault?: boolean }): MockAddress[] {
    const isFirst = existing.length === 0;
    const shouldBeDefault = isFirst || Boolean(newAddr.isDefault);

    const updatedExisting = shouldBeDefault
      ? existing.map(a => ({ ...a, isDefault: false }))
      : [...existing];

    return [...updatedExisting, { id: newAddr.id, label: newAddr.label, isDefault: shouldBeDefault }];
  }

  function deleteAddress(existing: MockAddress[], idToDelete: string): MockAddress[] {
    const target = existing.find(a => a.id === idToDelete);
    const filtered = existing.filter(a => a.id !== idToDelete);

    if (target?.isDefault && filtered.length > 0) {
      filtered[0].isDefault = true;
    }
    return filtered;
  }

  // 1. First address automatically becomes default
  let addresses: MockAddress[] = [];
  addresses = addAddress(addresses, { id: 'addr-1', label: 'Home', isDefault: false });
  assert.equal(addresses.length, 1);
  assert.equal(addresses[0].isDefault, true);

  // 2. Second address added without isDefault does not override default
  addresses = addAddress(addresses, { id: 'addr-2', label: 'Office', isDefault: false });
  assert.equal(addresses.length, 2);
  assert.equal(addresses.find(a => a.id === 'addr-1')?.isDefault, true);
  assert.equal(addresses.find(a => a.id === 'addr-2')?.isDefault, false);

  // 3. Third address added with isDefault=true overrides default
  addresses = addAddress(addresses, { id: 'addr-3', label: 'Vacation Home', isDefault: true });
  assert.equal(addresses.find(a => a.id === 'addr-3')?.isDefault, true);
  assert.equal(addresses.find(a => a.id === 'addr-1')?.isDefault, false);
  assert.equal(addresses.find(a => a.id === 'addr-2')?.isDefault, false);

  // 4. Deleting default address promotes remaining address
  addresses = deleteAddress(addresses, 'addr-3');
  assert.equal(addresses.length, 2);
  assert.equal(addresses.some(a => a.isDefault), true);
});

// =============================================================================
// 2. CUSTOMER REVIEW SUBMISSION BOUNDS & ELIGIBILITY
// =============================================================================

test('Customer Review Submission: enforces 1-5 rating, comment bounds, and verified delivered purchase status', () => {
  const validateReviewSubmission = (input: {
    rating: number;
    comment: string;
    title?: string;
    orderStatus: string;
  }) => {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      return { valid: false, error: 'Please select a star rating between 1 and 5.' };
    }

    const comment = input.comment?.trim();
    if (!comment || comment.length < 5) {
      return { valid: false, error: 'Review comment must have at least 5 characters.' };
    }
    if (comment.length > 2000) {
      return { valid: false, error: 'Review comment exceeds maximum limit of 2,000 characters.' };
    }

    if (input.title && input.title.trim().length > 100) {
      return { valid: false, error: 'Review headline must not exceed 100 characters.' };
    }

    if (input.orderStatus !== 'delivered') {
      return { valid: false, error: 'Reviews may only be submitted for verified delivered purchases.' };
    }

    return {
      valid: true,
      reviewRecord: {
        rating: input.rating,
        title: input.title?.trim() || null,
        comment,
        isVerifiedPurchase: true,
        isApproved: false, // Must enter moderation queue
      },
    };
  };

  // Rejects invalid rating
  assert.equal(validateReviewSubmission({ rating: 0, comment: 'Great product!', orderStatus: 'delivered' }).valid, false);
  assert.equal(validateReviewSubmission({ rating: 6, comment: 'Great product!', orderStatus: 'delivered' }).valid, false);
  assert.equal(validateReviewSubmission({ rating: 4.5, comment: 'Great product!', orderStatus: 'delivered' }).valid, false);

  // Rejects too short comment
  assert.equal(validateReviewSubmission({ rating: 5, comment: 'Good', orderStatus: 'delivered' }).valid, false);

  // Rejects undelivered orders
  assert.equal(validateReviewSubmission({ rating: 5, comment: 'Beautiful ring, arrived promptly.', orderStatus: 'pending' }).valid, false);
  assert.equal(validateReviewSubmission({ rating: 5, comment: 'Beautiful ring, arrived promptly.', orderStatus: 'shipped' }).valid, false);

  // Valid submission
  const valid = validateReviewSubmission({
    rating: 5,
    title: ' Exquisite Craftsmanship ',
    comment: 'The gold plating has exceptional luster and the setting is very secure.',
    orderStatus: 'delivered',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.reviewRecord?.rating, 5);
  assert.equal(valid.reviewRecord?.title, 'Exquisite Craftsmanship');
  assert.equal(valid.reviewRecord?.isVerifiedPurchase, true);
  assert.equal(valid.reviewRecord?.isApproved, false); // Pending moderation
});

// =============================================================================
// 3. WISHLIST MANAGEMENT & CART TRANSFER
// =============================================================================

test('Wishlist Cart Transfer: correctly transforms Wishlist item to cart input with stock & pricing integrity', () => {
  const wishlistItem = {
    id: 'w-item-123',
    productId: 'prod-456',
    variantId: 'var-789',
    productName: 'Royal Solitaire Gold Ring',
    slug: 'royal-solitaire-gold-ring',
    variantTitle: 'Size 6 / Gold Plated',
    sku: 'SJ-RNG-001-SZ6',
    price: 15500,
    discountPrice: 12900,
    imageUrl: 'https://images.splenderjewel.com/ring.jpg',
    stockStatus: 'in_stock',
  };

  const toCartItem = (item: typeof wishlistItem) => ({
    productId: item.productId,
    variantId: item.variantId,
    productName: item.productName,
    variantTitle: item.variantTitle,
    sku: item.sku,
    price: item.price,
    discountPrice: item.discountPrice,
    imageUrl: item.imageUrl,
    slug: item.slug,
    quantity: 1,
  });

  const cartItem = toCartItem(wishlistItem);
  assert.equal(cartItem.productId, 'prod-456');
  assert.equal(cartItem.variantId, 'var-789');
  assert.equal(cartItem.productName, 'Royal Solitaire Gold Ring');
  assert.equal(cartItem.price, 15500);
  assert.equal(cartItem.discountPrice, 12900);
  assert.equal(cartItem.quantity, 1);
});

// =============================================================================
// 4. ADMIN USER RBAC & SELF-LOCKOUT SAFEGUARDS
// =============================================================================

test('Admin User RBAC: prevents self-deactivation, enforces super_admin authority, and prevents sole super_admin demotion', () => {
  interface MockAdmin {
    id: string;
    email: string;
    role: 'super_admin' | 'admin' | 'staff';
    isActive: boolean;
  }

  const admins: MockAdmin[] = [
    { id: 'admin-super-1', email: 'owner@splenderjewel.com', role: 'super_admin', isActive: true },
    { id: 'admin-staff-1', email: 'support@splenderjewel.com', role: 'staff', isActive: true },
    { id: 'admin-mgr-1', email: 'manager@splenderjewel.com', role: 'admin', isActive: true },
  ];

  // Rule 1: Cannot deactivate self
  const canDeactivate = (callerId: string, callerRole: string, targetId: string) => {
    if (callerId === targetId) {
      return { allowed: false, error: 'Self-deactivation is prohibited to prevent lockout.' };
    }
    if (callerRole === 'staff') {
      return { allowed: false, error: 'Staff cannot modify accounts.' };
    }
    const target = admins.find(a => a.id === targetId);
    if (target?.role === 'super_admin' && callerRole !== 'super_admin') {
      return { allowed: false, error: 'Only Super Admins can deactivate other Super Admins.' };
    }
    return { allowed: true };
  };

  assert.equal(canDeactivate('admin-super-1', 'super_admin', 'admin-super-1').allowed, false);
  assert.equal(canDeactivate('admin-staff-1', 'staff', 'admin-mgr-1').allowed, false);
  assert.equal(canDeactivate('admin-mgr-1', 'admin', 'admin-super-1').allowed, false);
  assert.equal(canDeactivate('admin-super-1', 'super_admin', 'admin-staff-1').allowed, true);

  // Rule 2: Cannot demote sole active super_admin
  const canDemoteRole = (callerId: string, callerRole: string, targetId: string, newRole: string) => {
    if (callerRole !== 'super_admin') {
      return { allowed: false, error: 'Only Super Admin can change roles.' };
    }
    const target = admins.find(a => a.id === targetId);
    if (target?.role === 'super_admin' && newRole !== 'super_admin') {
      const activeSuperCount = admins.filter(a => a.role === 'super_admin' && a.isActive).length;
      if (activeSuperCount <= 1) {
        return { allowed: false, error: 'Cannot demote the sole active Super Administrator.' };
      }
    }
    return { allowed: true };
  };

  // Demoting the only super_admin is forbidden
  assert.equal(canDemoteRole('admin-super-1', 'super_admin', 'admin-super-1', 'admin').allowed, false);

  // If there are two super admins, demotion is allowed
  admins.push({ id: 'admin-super-2', email: 'tech@splenderjewel.com', role: 'super_admin', isActive: true });
  assert.equal(canDemoteRole('admin-super-1', 'super_admin', 'admin-super-2', 'admin').allowed, true);
});
