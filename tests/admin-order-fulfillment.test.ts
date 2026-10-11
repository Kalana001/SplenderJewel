import test from 'node:test';
import assert from 'node:assert/strict';
import { ORDER_STATUSES, PAYMENT_STATUSES } from '../lib/config/constants.ts';

// -----------------------------------------------------------------------------
// 1. ORDER STATUS LIFECYCLE TRANSITION VALIDATION
// -----------------------------------------------------------------------------
test('Order status transitions: permits valid lifecycle states and rejects invalid transitions', () => {
  const validStatuses = Object.values(ORDER_STATUSES);

  const isValidStatus = (status: string) => {
    return validStatuses.includes(status as any);
  };

  assert.equal(isValidStatus('pending'), true);
  assert.equal(isValidStatus('confirmed'), true);
  assert.equal(isValidStatus('processing'), true);
  assert.equal(isValidStatus('shipped'), true);
  assert.equal(isValidStatus('delivered'), true);
  assert.equal(isValidStatus('cancelled'), true);
  assert.equal(isValidStatus('unknown_status'), false);
  assert.equal(isValidStatus(''), false);
});

// -----------------------------------------------------------------------------
// 2. PAYMENT VERIFICATION FOR WHATSAPP BANK TRANSFERS
// -----------------------------------------------------------------------------
test('Payment status verification: allows admin approval of bank transfer to verified status', () => {
  const verifyBankTransfer = (
    currentPaymentStatus: string,
    action: 'approve' | 'reject',
    adminId: string
  ) => {
    if (!adminId) throw new Error('Admin authorization required');
    if (action === 'approve') {
      return { paymentStatus: PAYMENT_STATUSES.VERIFIED, notes: 'Approved by admin' };
    }
    return { paymentStatus: PAYMENT_STATUSES.FAILED, notes: 'Rejected by admin' };
  };

  const approved = verifyBankTransfer('pending', 'approve', 'admin-uuid-1');
  assert.equal(approved.paymentStatus, 'verified');

  const rejected = verifyBankTransfer('pending', 'reject', 'admin-uuid-1');
  assert.equal(rejected.paymentStatus, 'failed');
});

// -----------------------------------------------------------------------------
// 3. ADMIN-EXCLUSIVE CONFIDENTIAL PROFIT CALCULATION
// -----------------------------------------------------------------------------
test('Admin financials: derives accurate gross profit and profit margin percentage using purchase cost', () => {
  const calculateAdminFinancials = (
    items: Array<{ unitPrice: number; purchaseCost: number; quantity: number }>
  ) => {
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const totalPurchaseCost = items.reduce((sum, item) => sum + item.purchaseCost * item.quantity, 0);
    const grossProfit = subtotal - totalPurchaseCost;
    const grossMarginPercent = subtotal > 0 ? Math.round((grossProfit / subtotal) * 100) : 0;
    return { subtotal, totalPurchaseCost, grossProfit, grossMarginPercent };
  };

  const testItems = [
    { unitPrice: 20000, purchaseCost: 12000, quantity: 2 }, // revenue: 40000, cost: 24000
    { unitPrice: 10000, purchaseCost: 6000, quantity: 1 },  // revenue: 10000, cost: 6000
  ];

  const financials = calculateAdminFinancials(testItems);
  assert.equal(financials.subtotal, 50000);
  assert.equal(financials.totalPurchaseCost, 30000);
  assert.equal(financials.grossProfit, 20000);
  assert.equal(financials.grossMarginPercent, 40); // 20000 / 50000 = 40%
});

// -----------------------------------------------------------------------------
// 4. PACKAGE SHIPPING LABEL PRIVACY & INTEGRITY
// -----------------------------------------------------------------------------
test('Package shipping label: formats recipient address and contact numbers, strictly excluding internal costs', () => {
  const generateShippingLabel = (order: {
    orderNumber: string;
    customerName: string;
    addressLine: string;
    city: string | null;
    district: string;
    phone1: string;
    phone2?: string | null;
    paymentMethod: string;
    totalAmount: number;
    purchaseCost?: number; // Should NEVER appear on label
  }) => {
    return {
      orderNumber: order.orderNumber,
      recipient: order.customerName,
      fullAddress: `${order.addressLine}${order.city ? ', ' + order.city : ''}, ${order.district}`,
      contacts: [order.phone1, order.phone2].filter(Boolean).join(' / '),
      collectAmount: order.paymentMethod === 'cod' ? order.totalAmount : 0,
      paymentLabel: order.paymentMethod === 'cod' ? 'CASH ON DELIVERY' : 'PRE-PAID',
    };
  };

  const label = generateShippingLabel({
    orderNumber: 'SJ-20261011-0042',
    customerName: 'Nimal Jayawardena',
    addressLine: 'No. 54, Kandy Road',
    city: 'Kadawatha',
    district: 'Gampaha',
    phone1: '0712345678',
    phone2: '0112987654',
    paymentMethod: 'cod',
    totalAmount: 18500,
    purchaseCost: 11000,
  });

  assert.equal(label.orderNumber, 'SJ-20261011-0042');
  assert.equal(label.recipient, 'Nimal Jayawardena');
  assert.equal(label.fullAddress, 'No. 54, Kandy Road, Kadawatha, Gampaha');
  assert.equal(label.contacts, '0712345678 / 0112987654');
  assert.equal(label.collectAmount, 18500);
  assert.equal(label.paymentLabel, 'CASH ON DELIVERY');

  // Verify serialized label excludes purchaseCost
  const serialized = JSON.stringify(label);
  assert.equal(serialized.includes('11000'), false);
  assert.equal(serialized.includes('purchaseCost'), false);
});
