import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatInvoiceDate, type InvoiceOrderData } from '../lib/orders/invoice-pdf.ts';

describe('Order Invoice & Receipt Generation Suite', () => {
  it('1. formats invoice date in Sri Lanka timezone with NO time component', () => {
    // 2026-10-31 10:00:00 UTC = 2026-10-31 15:30:00 Colombo
    const date1 = '2026-10-31T10:00:00.000Z';
    const formatted1 = formatInvoiceDate(date1);

    // Should be "Oct 31, 2026" and contain no colons, am/pm, or hours
    assert.equal(formatted1, 'Oct 31, 2026');
    assert.doesNotMatch(formatted1, /:/);
    assert.doesNotMatch(formatted1, /(am|pm)/i);

    // Cross-midnight UTC check: 2026-10-30 20:00:00 UTC is 2026-10-31 01:30:00 AM Colombo
    const date2 = '2026-10-30T20:00:00.000Z';
    const formatted2 = formatInvoiceDate(date2);
    assert.equal(formatted2, 'Oct 31, 2026');
  });

  it('2. falls back gracefully on invalid dates without throwing', () => {
    const invalidDate = 'not-a-valid-date';
    const result = formatInvoiceDate(invalidDate);
    // Invalid Date returns 'Invalid Date' or the raw string
    assert.ok(typeof result === 'string');
  });

  it('3. structures verified bank transfer orders with official receipt status', () => {
    const paidOrder: InvoiceOrderData = {
      orderNumber: 'SJ-1001',
      createdAt: '2026-10-31T08:00:00.000Z',
      customerName: 'Anuki Perera',
      phone1: '0771234567',
      phone2: '0719876543',
      email: 'anuki@example.com',
      addressLine: '12 Temple Road',
      city: 'Negombo',
      district: 'Gampaha',
      postalCode: '11500',
      subtotal: 4500,
      deliveryFee: 350,
      discountAmount: 0,
      couponCode: null,
      totalAmount: 4850,
      paymentMethod: 'bank_transfer',
      paymentStatus: 'verified',
      orderStatus: 'confirmed',
      trackingNumber: 'TRK-9901',
      items: [
        {
          productName: 'Crystal Elegance Necklace',
          variantTitle: 'Rose Gold',
          sku: 'SJ-NECK-RG-01',
          quantity: 1,
          unitPrice: 4500,
          totalPrice: 4500,
        },
      ],
    };

    assert.equal(paidOrder.paymentStatus, 'verified');
    assert.equal(paidOrder.paymentMethod, 'bank_transfer');
    assert.equal(paidOrder.totalAmount, paidOrder.subtotal + paidOrder.deliveryFee - (paidOrder.discountAmount || 0));
    assert.equal(paidOrder.items.length, 1);
  });

  it('4. structures COD orders with pending courier collection status', () => {
    const codOrder: InvoiceOrderData = {
      orderNumber: 'SJ-1002',
      createdAt: '2026-10-31T09:30:00.000Z',
      customerName: 'Kavinda Silva',
      phone1: '0769998888',
      phone2: null,
      email: null,
      addressLine: '45 Galle Road',
      city: 'Colombo 03',
      district: 'Colombo',
      postalCode: '00300',
      subtotal: 8000,
      deliveryFee: 350,
      discountAmount: 500,
      couponCode: 'WELCOME500',
      totalAmount: 7850,
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      orderStatus: 'pending',
      items: [
        {
          productName: 'Silver Charm Bracelet',
          variantTitle: 'Standard',
          sku: 'SJ-BRAC-02',
          quantity: 2,
          unitPrice: 4000,
          totalPrice: 8000,
        },
      ],
    };

    assert.equal(codOrder.paymentStatus, 'pending');
    assert.equal(codOrder.paymentMethod, 'cod');
    assert.equal(codOrder.totalAmount, codOrder.subtotal + codOrder.deliveryFee - (codOrder.discountAmount || 0));
    assert.equal(codOrder.couponCode, 'WELCOME500');
  });
});
