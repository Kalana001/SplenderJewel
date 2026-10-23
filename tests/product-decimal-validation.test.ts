import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Product Creation & Edit Decimal Validation Verification', () => {
  it('validates monetary decimal values such as LKR 657.78, 650.00, 660.00, 0.01 as valid numbers', () => {
    const testCases = [
      { input: '657.78', expectedNum: 657.78, valid: true },
      { input: '650', expectedNum: 650, valid: true },
      { input: '650.00', expectedNum: 650, valid: true },
      { input: '660', expectedNum: 660, valid: true },
      { input: '660.00', expectedNum: 660, valid: true },
      { input: '0.01', expectedNum: 0.01, valid: true },
      { input: '4500.50', expectedNum: 4500.5, valid: true },
    ];

    for (const tc of testCases) {
      const num = Number(tc.input);
      assert.equal(isNaN(num), false, `Expected ${tc.input} not to be NaN`);
      assert.equal(num >= 0, true, `Expected ${tc.input} to be non-negative`);
      assert.equal(num, tc.expectedNum);
    }
  });

  it('verifies product-form.tsx allows two-decimal steps (step="0.01") for selling price, discount price, and purchase cost', () => {
    const filePath = path.join(process.cwd(), 'components/admin/product-form.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Selling Price Input must have step="0.01" and min={0}
    const sellingPriceRegex = /Selling Price \(LKR\)[\s\S]*?<Input[\s\S]*?min=\{0\}[\s\S]*?step="0\.01"/;
    assert.match(
      content,
      sellingPriceRegex,
      'Selling Price input in product-form.tsx must have min={0} and step="0.01"'
    );

    // Discount Price Input must have step="0.01" and min={0}
    const discountPriceRegex = /Discount Price \(LKR\)[\s\S]*?<Input[\s\S]*?min=\{0\}[\s\S]*?step="0\.01"/;
    assert.match(
      content,
      discountPriceRegex,
      'Discount Price input in product-form.tsx must have min={0} and step="0.01"'
    );

    // Purchase Cost Input must have step="0.01" and min={0}
    const purchaseCostRegex = /Purchase Cost \(LKR\)[\s\S]*?<Input[\s\S]*?min=\{0\}[\s\S]*?step="0\.01"/;
    assert.match(
      content,
      purchaseCostRegex,
      'Purchase Cost input in product-form.tsx must have min={0} and step="0.01"'
    );

    // Verify step={10} is no longer present in product-form.tsx
    assert.equal(
      content.includes('step={10}'),
      false,
      'product-form.tsx must not contain restrictive step={10} on monetary fields'
    );
  });

  it('verifies product-edit-manager.tsx also uses step="0.01" for variant price, discount, and purchase cost', () => {
    const filePath = path.join(process.cwd(), 'components/admin/product-edit-manager.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Selling Price in product-edit-manager.tsx
    const sellingPriceRegex = /Selling Price <span[\s\S]*?<Input[\s\S]*?min=\{0\}[\s\S]*?step="0\.01"/;
    assert.match(
      content,
      sellingPriceRegex,
      'Selling Price input in product-edit-manager.tsx must have step="0.01"'
    );

    // Discount Price in product-edit-manager.tsx
    const discountPriceRegex = /Discount Price[\s\S]*?<Input[\s\S]*?min=\{0\}[\s\S]*?step="0\.01"/;
    assert.match(
      content,
      discountPriceRegex,
      'Discount Price input in product-edit-manager.tsx must have step="0.01"'
    );

    // Purchase Cost in product-edit-manager.tsx
    const purchaseCostRegex = /Purchase Cost[\s\S]*?<Input[\s\S]*?min=\{0\}[\s\S]*?step="0\.01"/;
    assert.match(
      content,
      purchaseCostRegex,
      'Purchase Cost input in product-edit-manager.tsx must have step="0.01"'
    );
  });

  it('ensures quantity and threshold fields preserve whole-number constraints', () => {
    const formPath = path.join(process.cwd(), 'components/admin/product-form.tsx');
    const formContent = fs.readFileSync(formPath, 'utf-8');

    // Initial Stock Quantity should not specify a decimal step
    const stockMatch = formContent.match(/Initial Stock Quantity[\s\S]*?<Input([\s\S]*?)\/>/);
    assert.ok(stockMatch, 'Initial Stock Quantity input must exist');
    assert.equal(
      stockMatch[1].includes('step="0.01"'),
      false,
      'Initial Stock Quantity must NOT have decimal step'
    );

    // Low Stock Alert Threshold should not specify a decimal step
    const thresholdMatch = formContent.match(/Low Stock Alert Threshold[\s\S]*?<Input([\s\S]*?)\/>/);
    assert.ok(thresholdMatch, 'Low Stock Alert Threshold input must exist');
    assert.equal(
      thresholdMatch[1].includes('step="0.01"'),
      false,
      'Low Stock Alert Threshold must NOT have decimal step'
    );
  });
});
