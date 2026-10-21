import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateBatchExpensesExact,
  calculateMovingWeightedAverageCost,
  decimalLkrToCents,
  centsToDecimalLkr,
  type LineCostInput,
} from '../lib/purchases/calculations.ts';

describe('Purchase Management: Landed Cost & Expense Allocation Engine', () => {
  it('reconciles evenly divisible expenses with 0 remainder cents', () => {
    // 10 units total, Rs. 100.00 total expenses (10,000 cents) => 1,000 cents/unit
    const lines: LineCostInput[] = [
      { variationId: 'var-1', quantity: 6, supplierUnitPriceCents: BigInt(50000) }, // Rs. 500.00
      { variationId: 'var-2', quantity: 4, supplierUnitPriceCents: BigInt(75000) }, // Rs. 750.00
    ];

    const results = allocateBatchExpensesExact(BigInt(10000), lines);

    assert.equal(results.length, 2);
    // Line 1: 6 units * 1,000 cents = 6,000 cents
    assert.equal(results[0].lineAllocatedExpenseCents, BigInt(6000));
    assert.equal(results[0].lineSupplierCostCents, BigInt(300000));
    assert.equal(results[0].lineTotalLandedCostCents, BigInt(306000));
    assert.equal(results[0].unitLandedCostCents, BigInt(51000)); // Rs. 510.00

    // Line 2: 4 units * 1,000 cents = 4,000 cents
    assert.equal(results[1].lineAllocatedExpenseCents, BigInt(4000));
    assert.equal(results[1].lineSupplierCostCents, BigInt(300000));
    assert.equal(results[1].lineTotalLandedCostCents, BigInt(304000));
    assert.equal(results[1].unitLandedCostCents, BigInt(76000)); // Rs. 760.00

    // Strict 0-cent reconciliation assertion
    const sumExpenses = results[0].lineAllocatedExpenseCents + results[1].lineAllocatedExpenseCents;
    assert.equal(sumExpenses, BigInt(10000));
  });

  it('worked example 1: handles non-divisible 1-cent remainder across 3 units without money loss', () => {
    // 3 units total, Rs. 1,000.00 expenses (100,000 cents). Base: 33,333 cents/unit, Remainder: 1 cent
    const lines: LineCostInput[] = [
      { variationId: 'var-a', quantity: 2, supplierUnitPriceCents: BigInt(50000) }, // Rs. 500.00
      { variationId: 'var-b', quantity: 1, supplierUnitPriceCents: BigInt(75000) }, // Rs. 750.00
    ];

    const results = allocateBatchExpensesExact(BigInt(100000), lines);

    // Line A (2 units): gets base 66,666 + 1 remainder cent = 66,667 cents
    assert.equal(results[0].variationId, 'var-a');
    assert.equal(results[0].lineAllocatedExpenseCents, BigInt(66667));
    assert.equal(results[0].lineSupplierCostCents, BigInt(100000));
    assert.equal(results[0].lineTotalLandedCostCents, BigInt(166667));
    assert.equal(results[0].unitLandedCostCents, BigInt(83334)); // half-up 83,333.5 => 83,334 cents

    // Line B (1 unit): gets base 33,333 + 0 remainder cents = 33,333 cents
    assert.equal(results[1].variationId, 'var-b');
    assert.equal(results[1].lineAllocatedExpenseCents, BigInt(33333));
    assert.equal(results[1].lineSupplierCostCents, BigInt(75000));
    assert.equal(results[1].lineTotalLandedCostCents, BigInt(108333));
    assert.equal(results[1].unitLandedCostCents, BigInt(108333));

    // Exact reconciliation
    assert.equal(results[0].lineAllocatedExpenseCents + results[1].lineAllocatedExpenseCents, BigInt(100000));
    assert.equal(results[0].lineTotalLandedCostCents + results[1].lineTotalLandedCostCents, BigInt(275000));
  });

  it('worked example 2: handles 3 remainder cents across 7 units in 3 lines deterministically', () => {
    // 7 units total, Rs. 250.00 expenses (25,000 cents). Base: 3,571 cents/unit, Remainder: 3 cents
    const lines: LineCostInput[] = [
      { variationId: 'line-1', quantity: 3, supplierUnitPriceCents: BigInt(10000) }, // Rs. 100.00
      { variationId: 'line-2', quantity: 2, supplierUnitPriceCents: BigInt(15000) }, // Rs. 150.00
      { variationId: 'line-3', quantity: 2, supplierUnitPriceCents: BigInt(20000) }, // Rs. 200.00
    ];

    const results = allocateBatchExpensesExact(BigInt(25000), lines);

    // Line 1 (3 units): 3 * 3,571 + 3 remainder cents = 10,716 cents
    assert.equal(results[0].variationId, 'line-1');
    assert.equal(results[0].lineAllocatedExpenseCents, BigInt(10716));
    assert.equal(results[0].lineTotalLandedCostCents, BigInt(40716));
    assert.equal(results[0].unitLandedCostCents, BigInt(13572)); // 40,716 / 3 = 13,572 cents

    // Line 2 (2 units): 2 * 3,571 + 0 remainder cents = 7,142 cents
    assert.equal(results[1].variationId, 'line-2');
    assert.equal(results[1].lineAllocatedExpenseCents, BigInt(7142));
    assert.equal(results[1].lineTotalLandedCostCents, BigInt(37142));
    assert.equal(results[1].unitLandedCostCents, BigInt(18571)); // 37,142 / 2 = 18,571 cents

    // Line 3 (2 units): 2 * 3,571 + 0 remainder cents = 7,142 cents
    assert.equal(results[2].variationId, 'line-3');
    assert.equal(results[2].lineAllocatedExpenseCents, BigInt(7142));
    assert.equal(results[2].lineTotalLandedCostCents, BigInt(47142));
    assert.equal(results[2].unitLandedCostCents, BigInt(23571)); // 47,142 / 2 = 23,571 cents

    // Total allocated expenses must equal 25,000 cents
    const totalAllocated = results.reduce((sum, r) => sum + r.lineAllocatedExpenseCents, BigInt(0));
    assert.equal(totalAllocated, BigInt(25000));

    // Total batch cost must equal 100,000 supplier + 25,000 expenses = 125,000 cents
    const totalLanded = results.reduce((sum, r) => sum + r.lineTotalLandedCostCents, BigInt(0));
    assert.equal(totalLanded, BigInt(125000));
  });

  it('guarantees identical output regardless of input variation order (deterministic sorting)', () => {
    const linesUnordered: LineCostInput[] = [
      { variationId: 'zeta', quantity: 2, supplierUnitPriceCents: BigInt(20000) },
      { variationId: 'alpha', quantity: 3, supplierUnitPriceCents: BigInt(10000) },
      { variationId: 'beta', quantity: 2, supplierUnitPriceCents: BigInt(15000) },
    ];

    const results = allocateBatchExpensesExact(BigInt(25000), linesUnordered);

    // Alpha must be first, beta second, zeta third
    assert.equal(results[0].variationId, 'alpha');
    assert.equal(results[1].variationId, 'beta');
    assert.equal(results[2].variationId, 'zeta');

    // Alpha receives the remainder cents because it is sorted first
    assert.equal(results[0].lineAllocatedExpenseCents, BigInt(10716));
    assert.equal(results[1].lineAllocatedExpenseCents, BigInt(7142));
    assert.equal(results[2].lineAllocatedExpenseCents, BigInt(7142));
  });

  it('handles zero batch expenses safely with 0 allocated expenses', () => {
    const lines: LineCostInput[] = [
      { variationId: 'v1', quantity: 5, supplierUnitPriceCents: BigInt(12000) },
    ];

    const results = allocateBatchExpensesExact(BigInt(0), lines);
    assert.equal(results[0].lineAllocatedExpenseCents, BigInt(0));
    assert.equal(results[0].lineTotalLandedCostCents, BigInt(60000));
    assert.equal(results[0].unitLandedCostCents, BigInt(12000));
  });

  it('rejects invalid inputs: negative expenses, empty lines, negative quantities', () => {
    assert.throws(() => allocateBatchExpensesExact(BigInt(-100), []), /cannot be negative/i);
    assert.throws(() => allocateBatchExpensesExact(BigInt(500), []), /at least one variation/i);
    assert.throws(
      () => allocateBatchExpensesExact(BigInt(500), [{ variationId: 'v1', quantity: 0, supplierUnitPriceCents: BigInt(100) }]),
      /positive integer/i
    );
    assert.throws(
      () => allocateBatchExpensesExact(BigInt(500), [{ variationId: 'v1', quantity: 1, supplierUnitPriceCents: BigInt(-50) }]),
      /cannot be negative/i
    );
  });

  it('converts currency and minor units accurately round-trip', () => {
    assert.equal(decimalLkrToCents(1250.50), BigInt(125050));
    assert.equal(decimalLkrToCents('1250.50'), BigInt(125050));
    assert.equal(decimalLkrToCents(0), BigInt(0));
    assert.equal(centsToDecimalLkr(BigInt(125050)), 1250.50);
    assert.equal(centsToDecimalLkr(BigInt(0)), 0.00);
    assert.equal(centsToDecimalLkr(BigInt(99)), 0.99);
  });
});

describe('Purchase Management: Moving Weighted Average Cost (WAC)', () => {
  it('adopts batch landed cost directly when current stock is zero or out of stock', () => {
    const wac = calculateMovingWeightedAverageCost(
      0, // current stock 0
      BigInt(50000), // old historical cost
      10, // transfer 10 units
      BigInt(65000) // new batch landed cost Rs. 650.00
    );
    assert.equal(wac, BigInt(65000));
  });

  it('blends moving weighted average cost accurately when current stock exists', () => {
    // Current: 10 units @ Rs. 500.00 (50,000 cents) = 500,000 cents
    // Incoming: 10 units @ Rs. 600.00 (60,000 cents) = 600,000 cents
    // Combined: 20 units, Total Valuation: 1,100,000 cents => 55,000 cents (Rs. 550.00)
    const wac = calculateMovingWeightedAverageCost(10, BigInt(50000), 10, BigInt(60000));
    assert.equal(wac, BigInt(55000));
  });

  it('rounds non-divisible weighted average cost half-up to exact integer cents', () => {
    // Current: 1 unit @ Rs. 100.00 (10,000 cents)
    // Incoming: 2 units @ Rs. 150.00 (15,000 cents each = 30,000 cents)
    // Combined: 3 units, Total Valuation: 40,000 cents => 40,000 / 3 = 13,333.33 => 13,333 cents
    const wac = calculateMovingWeightedAverageCost(1, BigInt(10000), 2, BigInt(15000));
    assert.equal(wac, BigInt(13333));
  });

  it('rejects invalid transfer quantities or negative unit costs', () => {
    assert.throws(() => calculateMovingWeightedAverageCost(5, BigInt(10000), 0, BigInt(15000)), /positive integer/i);
    assert.throws(() => calculateMovingWeightedAverageCost(5, BigInt(10000), 5, BigInt(-100)), /cannot be negative/i);
  });
});
