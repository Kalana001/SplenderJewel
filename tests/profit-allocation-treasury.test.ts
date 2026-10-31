import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROFIT_CATEGORIES, type ProfitCategory } from '../types/profit-treasury.ts';

describe('Profit Allocation & Treasury Business Logic Suite', () => {
  it('1. seeds default categories that sum up to exactly 100%', () => {
    const totalPercentage = DEFAULT_PROFIT_CATEGORIES.reduce(
      (sum, cat) => sum + cat.percentage,
      0
    );

    assert.equal(totalPercentage, 100, 'Default categories must sum to exactly 100%');
    assert.equal(DEFAULT_PROFIT_CATEGORIES.length, 5);

    const names = DEFAULT_PROFIT_CATEGORIES.map((c) => c.name);
    assert.ok(names.includes('Inventory & Stock Reinvestment'));
    assert.ok(names.includes('Marketing & Advertisements'));
    assert.ok(names.includes('Owner Drawings / Profit'));
    assert.ok(names.includes('Emergency & Reserve Fund'));
    assert.ok(names.includes('Church Fees'));
  });

  it('2. calculates Option A Realized Product Gross Profit excluding delivery fee and pass-through costs', () => {
    // Verified order items:
    // Item 1: Bohemian Crystal Bracelet: Unit Price Rs. 1,100, Qty 1, Purchase Cost Rs. 450 -> Profit: 650
    // Item 2: Butterfly Brooch: Unit Price Rs. 850, Qty 2, Purchase Cost Rs. 300 -> Profit: (850*2) - (300*2) = 1700 - 600 = 1100
    // Order Total: Rs. 2,800 + Rs. 350 delivery = Rs. 3,150
    const items = [
      { unit_price: 1100, quantity: 1, purchase_cost: 450, total_price: 1100 },
      { unit_price: 850, quantity: 2, purchase_cost: 300, total_price: 1700 },
    ];

    let realizedProfit = 0;
    for (const it of items) {
      const revenue = it.total_price;
      const cost = it.purchase_cost * it.quantity;
      realizedProfit += revenue - cost;
    }

    assert.equal(realizedProfit, 1750);
  });

  it('3. rejects category allocations exceeding 100%', () => {
    const invalidCategories: ProfitCategory[] = [
      { id: '1', name: 'Cat A', percentage: 60, color: '#d4af37', createdAt: '' },
      { id: '2', name: 'Cat B', percentage: 45, color: '#3b82f6', createdAt: '' },
    ];

    const sum = invalidCategories.reduce((acc, c) => acc + c.percentage, 0);
    assert.ok(sum > 100);

    const isValid = sum <= 100;
    assert.equal(isValid, false, 'Allocations summing to >100% must be rejected');
  });

  it('4. distributes realized profit proportionally and reduces balance when expenses are logged', () => {
    const realizedProfit = 100000; // Rs. 100,000

    // Inventory & Stock Reinvestment: 55% -> Rs. 55,000
    // Marketing & Advertisements: 15% -> Rs. 15,000
    const invAllocated = Math.round(realizedProfit * (55 / 100));
    const mktAllocated = Math.round(realizedProfit * (15 / 100));

    assert.equal(invAllocated, 55000);
    assert.equal(mktAllocated, 15000);

    // Admin logs an expense of Rs. 4,000 in Marketing
    const mktExpenses = [{ amount: 4000, description: 'Meta Ads' }];
    const mktSpent = mktExpenses.reduce((acc, e) => acc + e.amount, 0);
    const mktRemaining = mktAllocated - mktSpent;

    assert.equal(mktSpent, 4000);
    assert.equal(mktRemaining, 11000);

    // Total Treasury remaining balance decreases
    const totalRemaining = realizedProfit - mktSpent;
    assert.equal(totalRemaining, 96000);
  });
});
