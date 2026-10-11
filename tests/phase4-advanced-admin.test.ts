import test from 'node:test';
import assert from 'node:assert/strict';

// =============================================================================
// 1. CMS VALIDATION & SANITIZATION RULES
// =============================================================================

test('CMS Banner validation: enforces required title, image URLs, and valid display ordering', () => {
  const validateBannerInput = (input: {
    title: string;
    imageUrl: string;
    displayOrder?: number;
  }) => {
    if (!input.title || !input.title.trim()) {
      return { valid: false, error: 'Banner title is required' };
    }
    if (!input.imageUrl || !input.imageUrl.trim()) {
      return { valid: false, error: 'Banner image URL is required' };
    }
    if (input.displayOrder !== undefined && input.displayOrder < 0) {
      return { valid: false, error: 'Display order cannot be negative' };
    }
    return { valid: true, cleanTitle: input.title.trim() };
  };

  assert.equal(validateBannerInput({ title: '', imageUrl: 'https://img.com/banner.jpg' }).valid, false);
  assert.equal(validateBannerInput({ title: 'New Arrival', imageUrl: '' }).valid, false);
  assert.equal(validateBannerInput({ title: 'New Arrival', imageUrl: 'https://img.com/b.jpg', displayOrder: -1 }).valid, false);

  const valid = validateBannerInput({ title: ' Royal Solitaire ', imageUrl: 'https://img.com/banner.jpg', displayOrder: 0 });
  assert.equal(valid.valid, true);
  assert.equal(valid.cleanTitle, 'Royal Solitaire');
});

test('CMS Content Pages: normalizes slugs and preserves standard informational page keys', () => {
  const canonicalSlugs = ['about', 'faq', 'shipping', 'returns', 'privacy', 'terms', 'contact'];
  const normalizeSlug = (slug: string) => slug.toLowerCase().trim();

  for (const slug of canonicalSlugs) {
    assert.equal(normalizeSlug(slug.toUpperCase()), slug);
    assert.equal(canonicalSlugs.includes(normalizeSlug(slug)), true);
  }

  assert.equal(canonicalSlugs.includes(normalizeSlug('unauthorized-page')), false);
});

// =============================================================================
// 2. PRODUCT REVIEWS MODERATION & STAR RATINGS
// =============================================================================

test('Review moderation: enforces 1-5 star ratings and validates moderation states', () => {
  const validateReview = (review: { rating: number; customerName: string; isApproved?: boolean }) => {
    if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) {
      return { valid: false, error: 'Rating must be an integer between 1 and 5' };
    }
    if (!review.customerName || !review.customerName.trim()) {
      return { valid: false, error: 'Customer name is required' };
    }
    return { valid: true };
  };

  assert.equal(validateReview({ rating: 0, customerName: 'Kamal' }).valid, false);
  assert.equal(validateReview({ rating: 6, customerName: 'Kamal' }).valid, false);
  assert.equal(validateReview({ rating: 3.5, customerName: 'Kamal' }).valid, false);
  assert.equal(validateReview({ rating: 5, customerName: '' }).valid, false);
  assert.equal(validateReview({ rating: 5, customerName: 'Anusha P.' }).valid, true);
});

// =============================================================================
// 3. PACKAGE PRINT TEMPLATE PRIVACY ISOLATION
// =============================================================================

test('Package print template: strictly isolates confidential costs, profit, and tokens from physical labels', () => {
  const generateCourierLabel = (order: {
    orderNumber: string;
    customerName: string;
    addressLine: string;
    district: string;
    phone1: string;
    phone2?: string | null;
    paymentMethod: 'cod' | 'bank_transfer';
    totalAmount: number;
    // Internal confidential fields that MUST NOT leak into the label:
    purchaseCost?: number;
    grossProfit?: number;
    orderToken?: string;
    adminNotes?: string;
  }) => {
    // Construct public courier dispatch label payload
    return {
      orderNumber: order.orderNumber,
      recipientName: order.customerName,
      deliveryAddress: `${order.addressLine}, ${order.district}`,
      contactNumbers: [order.phone1, order.phone2].filter(Boolean).join(' / '),
      paymentTerms: order.paymentMethod === 'cod' ? `COD: Rs. ${order.totalAmount.toLocaleString('en-LK')}` : 'PRE-PAID (BANK TRANSFER)',
      collectAmount: order.paymentMethod === 'cod' ? order.totalAmount : 0,
    };
  };

  const sampleOrder = {
    orderNumber: 'SJ-2026-9042',
    customerName: 'Mrs. Anusha Perera',
    addressLine: 'No. 142/B, Galle Road',
    district: 'Colombo',
    phone1: '0774689907',
    paymentMethod: 'cod' as const,
    totalAmount: 14850,
    purchaseCost: 8200,
    grossProfit: 6650,
    orderToken: 'secret-bearer-token-12345',
    adminNotes: 'High-value customer, VIP jewelry package',
  };

  const label = generateCourierLabel(sampleOrder);

  // Verify necessary courier details exist
  assert.equal(label.orderNumber, 'SJ-2026-9042');
  assert.equal(label.recipientName, 'Mrs. Anusha Perera');
  assert.equal(label.collectAmount, 14850);

  // Verify internal data is completely absent
  assert.equal((label as any).purchaseCost, undefined);
  assert.equal((label as any).grossProfit, undefined);
  assert.equal((label as any).orderToken, undefined);
  assert.equal((label as any).adminNotes, undefined);
});

// =============================================================================
// 4. ANALYTICS & PROFIT METRICS DERIVATION
// =============================================================================

test('Analytics metrics: accurately calculates gross profit and omits cancelled orders from sales', () => {
  const calculateSalesMetrics = (orders: Array<{
    status: string;
    totalAmount: number;
    paymentMethod: string;
    paymentStatus: string;
    items: Array<{ purchaseCost: number; quantity: number }>;
  }>) => {
    let totalRevenue = 0;
    let totalCollected = 0;
    let totalOrders = 0;
    let totalCost = 0;

    for (const order of orders) {
      if (order.status === 'cancelled') continue; // Cancelled excluded

      totalOrders++;
      totalRevenue += order.totalAmount;

      if (order.paymentStatus === 'verified' || (order.paymentMethod === 'cod' && order.status === 'delivered')) {
        totalCollected += order.totalAmount;
      }

      for (const item of order.items) {
        totalCost += item.purchaseCost * item.quantity;
      }
    }

    const grossProfit = totalRevenue - totalCost;
    const marginPercent = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0;

    return { totalRevenue, totalCollected, totalOrders, totalCost, grossProfit, marginPercent };
  };

  const testOrders = [
    {
      status: 'delivered',
      totalAmount: 20000,
      paymentMethod: 'cod',
      paymentStatus: 'pending', // Collected on delivery
      items: [{ purchaseCost: 6000, quantity: 2 }], // Cost = 12,000
    },
    {
      status: 'shipped',
      totalAmount: 30000,
      paymentMethod: 'bank_transfer',
      paymentStatus: 'verified', // Collected
      items: [{ purchaseCost: 15000, quantity: 1 }], // Cost = 15,000
    },
    {
      status: 'cancelled', // Must be omitted
      totalAmount: 50000,
      paymentMethod: 'cod',
      paymentStatus: 'failed',
      items: [{ purchaseCost: 25000, quantity: 1 }],
    },
  ];

  const metrics = calculateSalesMetrics(testOrders);
  assert.equal(metrics.totalOrders, 2); // 2 active orders
  assert.equal(metrics.totalRevenue, 50000); // 20k + 30k
  assert.equal(metrics.totalCollected, 50000); // 20k COD delivered + 30k verified bank transfer
  assert.equal(metrics.totalCost, 27000); // 12k + 15k
  assert.equal(metrics.grossProfit, 23000); // 50k - 27k = 23k
  assert.equal(metrics.marginPercent, 46); // 23000 / 50000 = 46%
});

// =============================================================================
// 5. SECURITY AUDIT LOG REDACTION
// =============================================================================

test('Security audit log: automatically redacts passwords, bearer tokens, and secrets from logged metadata', () => {
  const sanitizeAuditDetails = (details: any): Record<string, any> => {
    if (!details || typeof details !== 'object') return {};
    const clean: Record<string, any> = {};
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'bearer', 'service_role', 'order_token'];

    for (const [k, v] of Object.entries(details)) {
      const isSensitive = sensitiveKeys.some((s) => k.toLowerCase().includes(s));
      if (isSensitive) {
        clean[k] = '[REDACTED_FOR_SECURITY]';
      } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        clean[k] = sanitizeAuditDetails(v);
      } else {
        clean[k] = v;
      }
    }
    return clean;
  };

  const rawAuditPayload = {
    orderNumber: 'SJ-2026-9042',
    updatedStatus: 'shipped',
    adminNotes: 'Fulfillment dispatched via Prompt Courier',
    order_token: 'secret-bearer-token-abc',
    customerPasswordHash: 'argon2id$v=19$m=65536...',
    apiKey: 'sk_live_xyz123',
    nestedSettings: {
      service_role_key: 'eyJh...',
      storeName: 'Splender Jewel',
    },
  };

  const sanitized = sanitizeAuditDetails(rawAuditPayload);

  // Safe fields retained
  assert.equal(sanitized.orderNumber, 'SJ-2026-9042');
  assert.equal(sanitized.updatedStatus, 'shipped');
  assert.equal(sanitized.nestedSettings.storeName, 'Splender Jewel');

  // Sensitive fields redacted
  assert.equal(sanitized.order_token, '[REDACTED_FOR_SECURITY]');
  assert.equal(sanitized.customerPasswordHash, '[REDACTED_FOR_SECURITY]');
  assert.equal(sanitized.apiKey, '[REDACTED_FOR_SECURITY]');
  assert.equal(sanitized.nestedSettings.service_role_key, '[REDACTED_FOR_SECURITY]');
});
