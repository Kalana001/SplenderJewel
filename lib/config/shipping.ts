import { PAYMENT_METHODS } from './constants.ts';

export interface ShippingCalculationInput {
  paymentMethod: string;
  totalQuantity: number;
}

export interface ShippingFeeBreakdown {
  fee: number;
  courierService: string;
  tierDescription: string;
}

/**
 * Calculates authoritative shipping fee (in LKR) based on payment method
 * and total aggregate item quantity across all cart / order lines.
 *
 * Rules:
 * 1. Bank Transfer (Sri Lanka Post Speed Post):
 *    - 1–3 items: LKR 200
 *    - 4–7 items: LKR 250
 *    - 8+ items:  LKR 350
 *
 * 2. Cash on Delivery (Sri Lanka Post COD):
 *    - 1–3 items:  LKR 350
 *    - 4–10 items: LKR 400
 *    - 11+ items:  LKR 500
 *
 * Uniformly applies to all 25 Sri Lankan administrative districts.
 */
export function calculateShippingFee(input: ShippingCalculationInput): number {
  return getShippingBreakdown(input).fee;
}

/**
 * Returns full breakdown of shipping charge, designated postal carrier service,
 * and rate tier description for display in checkout and order confirmation.
 */
export function getShippingBreakdown(input: ShippingCalculationInput): ShippingFeeBreakdown {
  const { paymentMethod, totalQuantity } = input;

  if (typeof totalQuantity !== 'number' || !Number.isInteger(totalQuantity) || totalQuantity < 1 || totalQuantity > 2147483647) {
    throw new Error('Total item quantity must be a positive integer between 1 and 2,147,483,647.');
  }

  const normalizedMethod = paymentMethod?.trim().toLowerCase();

  if (normalizedMethod === PAYMENT_METHODS.BANK_TRANSFER || normalizedMethod === 'bank_transfer') {
    if (totalQuantity <= 3) {
      return {
        fee: 200,
        courierService: 'Sri Lanka Post Speed Post',
        tierDescription: '1–3 items (Speed Post)',
      };
    }
    if (totalQuantity <= 7) {
      return {
        fee: 250,
        courierService: 'Sri Lanka Post Speed Post',
        tierDescription: '4–7 items (Speed Post)',
      };
    }
    return {
      fee: 350,
      courierService: 'Sri Lanka Post Speed Post',
      tierDescription: '8+ items (Speed Post)',
    };
  }

  if (normalizedMethod === PAYMENT_METHODS.COD || normalizedMethod === 'cod') {
    if (totalQuantity <= 3) {
      return {
        fee: 350,
        courierService: 'Sri Lanka Post COD',
        tierDescription: '1–3 items (Post COD)',
      };
    }
    if (totalQuantity <= 10) {
      return {
        fee: 400,
        courierService: 'Sri Lanka Post COD',
        tierDescription: '4–10 items (Post COD)',
      };
    }
    return {
      fee: 500,
      courierService: 'Sri Lanka Post COD',
      tierDescription: '11+ items (Post COD)',
    };
  }

  throw new Error(`Invalid payment method: "${paymentMethod}". Must be "bank_transfer" or "cod".`);
}
