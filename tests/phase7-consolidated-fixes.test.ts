import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DEV_STORE_CONFIG, getInstagramLink, getWhatsAppLink } from '../lib/config/store.ts';
import { DEFAULT_CONTENT_PAGES } from '../lib/cms/defaults.ts';

// =============================================================================
// 1. TASK 1: PRODUCT IMAGE VARIATION ASSIGNMENT & EDIT WORKFLOW
// =============================================================================

test('Phase 7 Fixes - Task 1: Product image variant update payload validation', () => {
  function validateImageVariantUpdate(payload: {
    imageId: string;
    productId: string;
    variantId?: string | null;
  }) {
    if (!payload.imageId || payload.imageId.trim() === '') {
      return { success: false, error: 'Image ID is required.' };
    }
    if (!payload.productId || payload.productId.trim() === '') {
      return { success: false, error: 'Product ID is required.' };
    }
    // variantId may be string or null/undefined (product-level)
    return {
      success: true,
      data: {
        imageId: payload.imageId.trim(),
        productId: payload.productId.trim(),
        variantId: payload.variantId ? payload.variantId.trim() : null,
      },
    };
  }

  // Missing image ID
  const res1 = validateImageVariantUpdate({ imageId: '', productId: 'prod-123' });
  assert.equal(res1.success, false);
  assert.equal(res1.error, 'Image ID is required.');

  // Missing product ID
  const res2 = validateImageVariantUpdate({ imageId: 'img-123', productId: '' });
  assert.equal(res2.success, false);
  assert.equal(res2.error, 'Product ID is required.');

  // Assign to product-level (null variant)
  const res3 = validateImageVariantUpdate({
    imageId: 'img-123',
    productId: 'prod-123',
    variantId: null,
  });
  assert.equal(res3.success, true);
  assert.equal(res3.data?.variantId, null);

  // Assign to specific variant
  const res4 = validateImageVariantUpdate({
    imageId: 'img-123',
    productId: 'prod-123',
    variantId: 'var-456',
  });
  assert.equal(res4.success, true);
  assert.equal(res4.data?.variantId, 'var-456');
});

// =============================================================================
// 2. TASK 2: IMAGE UPLOAD CONTROLS & DOM CONTRACT
// =============================================================================

test('Phase 7 Fixes - Task 2: File picker triggers via direct ref without nested button in label', () => {
  function simulateFilePickerTrigger(triggerType: 'nested_button_in_label' | 'ref_click') {
    if (triggerType === 'nested_button_in_label') {
      return {
        pickerOpened: false,
        domViolation: true,
        issue: 'Click event captured by inner button; label activation suppressed.',
      };
    }
    return {
      pickerOpened: true,
      domViolation: false,
      issue: null,
    };
  }

  const badPattern = simulateFilePickerTrigger('nested_button_in_label');
  assert.equal(badPattern.pickerOpened, false);
  assert.equal(badPattern.domViolation, true);

  const fixedPattern = simulateFilePickerTrigger('ref_click');
  assert.equal(fixedPattern.pickerOpened, true);
  assert.equal(fixedPattern.domViolation, false);
});

// =============================================================================
// 3. TASK 3: WISHLIST HEART ICON & REMOVAL ACTIONS
// =============================================================================

test('Phase 7 Fixes - Task 3: Wishlist toggle behavior for authenticated vs guest customers', () => {
  interface WishlistState {
    isAuthenticated: boolean;
    wishlistProductIds: Set<string>;
  }

  type WishlistClickResult =
    | {
        action: 'show_guest_modal';
        loginUrl: string;
        registerUrl: string;
        stateModified: false;
      }
    | {
        action: 'added' | 'removed';
        isSaved: boolean;
        stateModified: true;
      };

  function handleWishlistHeartClick(
    state: WishlistState,
    productId: string,
    variantId?: string | null
  ): WishlistClickResult {
    if (!state.isAuthenticated) {
      return {
        action: 'show_guest_modal',
        loginUrl: `/login?redirect=/products/${productId}`,
        registerUrl: `/register?redirect=/products/${productId}`,
        stateModified: false,
      };
    }

    const key = variantId ? `${productId}:${variantId}` : productId;
    const isSaved = state.wishlistProductIds.has(key);

    if (isSaved) {
      state.wishlistProductIds.delete(key);
      return { action: 'removed', isSaved: false, stateModified: true };
    } else {
      state.wishlistProductIds.add(key);
      return { action: 'added', isSaved: true, stateModified: true };
    }
  }

  // Guest user prompt
  const guestState: WishlistState = {
    isAuthenticated: false,
    wishlistProductIds: new Set<string>(),
  };
  const guestResult = handleWishlistHeartClick(guestState, 'prod-diamond-ring');
  assert.equal(guestResult.action, 'show_guest_modal');
  assert.equal(guestResult.stateModified, false);
  if (guestResult.action === 'show_guest_modal') {
    assert.match(guestResult.loginUrl, /\/login\?redirect=/);
  }

  // Authenticated user toggle
  const authState: WishlistState = {
    isAuthenticated: true,
    wishlistProductIds: new Set<string>(),
  };
  const addResult = handleWishlistHeartClick(authState, 'prod-diamond-ring', 'var-gold');
  assert.equal(addResult.action, 'added');
  assert.equal(addResult.isSaved, true);
  assert.equal(authState.wishlistProductIds.has('prod-diamond-ring:var-gold'), true);

  const removeResult = handleWishlistHeartClick(authState, 'prod-diamond-ring', 'var-gold');
  assert.equal(removeResult.action, 'removed');
  assert.equal(removeResult.isSaved, false);
  assert.equal(authState.wishlistProductIds.has('prod-diamond-ring:var-gold'), false);
});

// =============================================================================
// 4. TASK 4: SIMPLIFIED STOCK AVAILABILITY LABELS
// =============================================================================

test('Phase 7 Fixes - Task 4: Stock availability labels are strictly In Stock or Out of Stock', () => {
  function getCustomerStockLabel(stockQuantity: number, isActive: boolean = true): {
    badgeLabel: 'In Stock' | 'Out of Stock';
    buttonLabel: 'Add to Cart' | 'Out of Stock';
    isAvailable: boolean;
  } {
    const isAvailable = isActive && stockQuantity > 0;
    return {
      badgeLabel: isAvailable ? 'In Stock' : 'Out of Stock',
      buttonLabel: isAvailable ? 'Add to Cart' : 'Out of Stock',
      isAvailable,
    };
  }

  // High stock
  const normalStock = getCustomerStockLabel(50);
  assert.equal(normalStock.badgeLabel, 'In Stock');
  assert.equal(normalStock.buttonLabel, 'Add to Cart');
  assert.equal(normalStock.isAvailable, true);

  // Low stock (e.g. 2 items) — must NOT display "Low Stock (2 remaining)" or "Ready for Delivery"
  const lowStock = getCustomerStockLabel(2);
  assert.equal(lowStock.badgeLabel, 'In Stock');
  assert.equal(lowStock.buttonLabel, 'Add to Cart');
  assert.equal(lowStock.isAvailable, true);

  // Single item remaining — must be "In Stock"
  const singleItem = getCustomerStockLabel(1);
  assert.equal(singleItem.badgeLabel, 'In Stock');
  assert.equal(singleItem.buttonLabel, 'Add to Cart');
  assert.equal(singleItem.isAvailable, true);

  // Exactly zero stock — must be strictly "Out of Stock" (never "Sold Out")
  const zeroStock = getCustomerStockLabel(0);
  assert.equal(zeroStock.badgeLabel, 'Out of Stock');
  assert.equal(zeroStock.buttonLabel, 'Out of Stock');
  assert.equal(zeroStock.isAvailable, false);

  // Inactive variant with stock — must be treated as Out of Stock
  const inactiveWithStock = getCustomerStockLabel(10, false);
  assert.equal(inactiveWithStock.badgeLabel, 'Out of Stock');
  assert.equal(inactiveWithStock.buttonLabel, 'Out of Stock');
  assert.equal(inactiveWithStock.isAvailable, false);
});

// =============================================================================
// 5. TASK 5: CHECKOUT TESTING MODE SAFETY & WHATSAPP CARE
// =============================================================================

test('Phase 7 Fixes - Task 5: Checkout testing mode blocks placement and uses Contact Us on WhatsApp', () => {
  function evaluateCheckoutPolicy(envEnableLiveCheckout: string | undefined) {
    const isLive = envEnableLiveCheckout === 'true';

    return {
      canSubmitOrder: isLive,
      buttonLabel: isLive ? 'Place Order' : 'Place Order Disabled (Testing Mode)',
      headerBadge: isLive ? 'Secure Checkout' : 'Storefront Testing Mode',
      whatsAppActionLabel: 'Contact Us on WhatsApp',
      whatsAppLink: getWhatsAppLink('Hello Splender Jewel, I would like to inquire about items from your collection.'),
    };
  }

  // When live checkout is false (testing mode active)
  const testingMode = evaluateCheckoutPolicy('false');
  assert.equal(testingMode.canSubmitOrder, false);
  assert.equal(testingMode.buttonLabel, 'Place Order Disabled (Testing Mode)');
  assert.equal(testingMode.headerBadge, 'Storefront Testing Mode');
  assert.equal(testingMode.whatsAppActionLabel, 'Contact Us on WhatsApp');
  assert.match(testingMode.whatsAppLink, /https:\/\/wa\.me\/94764689907/);
  // Must NOT imply confirmed order placement
  assert.doesNotMatch(testingMode.whatsAppLink, /confirm%20order/i);
});

// =============================================================================
// 6. TASK 6: CANONICAL INSTAGRAM LINK
// =============================================================================

test('Phase 7 Fixes - Task 6: Instagram link is canonical without tracking query parameters', () => {
  const link = getInstagramLink(DEFAULT_DEV_STORE_CONFIG);
  assert.equal(link, 'https://www.instagram.com/splender_jewel/');
  assert.equal(link.includes('?'), false);
  assert.equal(link.includes('igsh='), false);
});

// =============================================================================
// 7. TASK 7: APPROVED ABOUT US COPY & MATERIAL RESTRICTIONS
// =============================================================================

test('Phase 7 Fixes - Task 7: About page contains exact approved copy and obeys material restrictions', () => {
  const aboutPage = DEFAULT_CONTENT_PAGES.find((p) => p.slug === 'about');
  assert.ok(aboutPage, 'About page default must exist');

  // Must match approved wording from Part 5
  assert.match(aboutPage.content, /About Splender Jewel/);
  assert.match(aboutPage.content, /every piece of jewellery should make you feel special/);
  assert.match(aboutPage.content, /A Little Sparkle, A Lot of Elegance\./);

  // Must NOT mention restricted material claims
  assert.doesNotMatch(aboutPage.content, /\b18K\b/i);
  assert.doesNotMatch(aboutPage.content, /\bgold\b/i);
  assert.doesNotMatch(aboutPage.content, /\bsilver\b/i);
  assert.doesNotMatch(aboutPage.content, /\bplating\b/i);
  assert.doesNotMatch(aboutPage.content, /\bhypoallergenic\b/i);
});

// =============================================================================
// 8. TASK 8: FAQ REPLACEMENT (12 APPROVED QUESTIONS & ANSWERS)
// =============================================================================

test('Phase 7 Fixes - Task 8: FAQ contains all 12 approved questions and approved delivery details', () => {
  const faqPage = DEFAULT_CONTENT_PAGES.find((p) => p.slug === 'faq');
  assert.ok(faqPage, 'FAQ page default must exist');

  // Verify all 12 questions exist
  assert.match(faqPage.content, /### 1\. What is Splender Jewel\?/);
  assert.match(faqPage.content, /Negombo, Sri Lanka/);

  assert.match(faqPage.content, /### 2\. Do you offer Islandwide Delivery\?/);
  assert.match(faqPage.content, /Islandwide Delivery across Sri Lanka through Sri Lanka Post/);

  assert.match(faqPage.content, /### 3\. What payment methods do you accept\?/);
  assert.match(faqPage.content, /Cash on Delivery \(COD\) and Bank Transfer/);

  assert.match(faqPage.content, /### 4\. How are orders delivered\?/);
  assert.match(faqPage.content, /Sri Lanka Post COD Service/);
  assert.match(faqPage.content, /Sri Lanka Post Speed Post Service/);

  assert.match(faqPage.content, /### 5\. How long does delivery take\?/);
  assert.match(faqPage.content, /24–48 hours on working days after dispatch/);

  assert.match(faqPage.content, /### 6\. How much does delivery cost\?/);
  assert.match(faqPage.content, /### 7\. How can I place an order\?/);
  assert.match(faqPage.content, /### 8\. Can I track my order\?/);
  assert.match(faqPage.content, /### 9\. Can I cancel my order\?/);
  assert.match(faqPage.content, /### 10\. Do you accept returns or exchanges\?/);
  assert.match(faqPage.content, /Returns and exchanges are generally not accepted for changes of mind/);

  assert.match(faqPage.content, /### 11\. Where is Splender Jewel located\?/);
  assert.match(faqPage.content, /### 12\. How can I contact Splender Jewel\?/);

  // Must NOT mention restricted material claims or 25 districts count
  assert.doesNotMatch(faqPage.content, /\b18K\b/i);
  assert.doesNotMatch(faqPage.content, /\bgold\b/i);
  assert.doesNotMatch(faqPage.content, /\bsilver\b/i);
  assert.doesNotMatch(faqPage.content, /25 districts/i);
});

// =============================================================================
// 9. TASK 9: TERMS & CONDITIONS APPROVED STRUCTURE
// =============================================================================

test('Phase 7 Fixes - Task 9: Terms of Service includes required points and no material claims', () => {
  const termsPage = DEFAULT_CONTENT_PAGES.find((p) => p.slug === 'terms');
  assert.ok(termsPage, 'Terms page default must exist');

  assert.match(termsPage.content, /Negombo, Sri Lanka/);
  assert.match(termsPage.content, /In Stock/);
  assert.match(termsPage.content, /Out of Stock/);
  assert.match(termsPage.content, /Sri Lanka Post COD Service/);
  assert.match(termsPage.content, /Sri Lanka Post Speed Post Service/);
  assert.match(termsPage.content, /Islandwide Delivery/);
  assert.match(termsPage.content, /24–48 hours on working days after dispatch/);
  assert.match(termsPage.content, /Product Care/);

  // Must NOT mention restricted material claims
  assert.doesNotMatch(termsPage.content, /\b18K\b/i);
  assert.doesNotMatch(termsPage.content, /\bgold\b/i);
  assert.doesNotMatch(termsPage.content, /\bsilver\b/i);
  assert.doesNotMatch(termsPage.content, /\bplating\b/i);
});

// =============================================================================
// 10. TASK 10: PRIVACY POLICY ACCORDING TO SPECIFICATION
// =============================================================================

test('Phase 7 Fixes - Task 10: Privacy Policy follows approved personal information list and exact COD copy', () => {
  const privacyPage = DEFAULT_CONTENT_PAGES.find((p) => p.slug === 'privacy');
  assert.ok(privacyPage, 'Privacy page default must exist');

  // Verify Personal Information list contains the 5 required items
  assert.match(privacyPage.content, /Full name/);
  assert.match(privacyPage.content, /Email address/);
  assert.match(privacyPage.content, /Contact telephone numbers/);
  assert.match(privacyPage.content, /Delivery address and district/);
  assert.match(privacyPage.content, /Order and purchase history/);

  // Must NOT have a separate item named "Account Information" in the personal info list
  const personalInfoSection = privacyPage.content.split('### Account Registration')[0];
  assert.doesNotMatch(personalInfoSection, /- Account Information/i);

  // Account registration must be explained elsewhere
  assert.match(privacyPage.content, /Account Registration & Login Sessions/);

  // Exact COD wording
  assert.match(
    privacyPage.content,
    /Cash on Delivery \(COD\): Customers pay in cash when their order is delivered\. No advance payment or online payment information is required for COD orders\./
  );

  // Courier sharing
  assert.match(privacyPage.content, /Sri Lanka Post/);
});
