import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCartItemsAgainstInventory,
  type InventoryRecord,
} from '../lib/cart/validation.ts';

// -----------------------------------------------------------------------------
// HELPER: IN-MEMORY SIMULATION OF CART CONTEXT (MIRRORING CART-CONTEXT.TSX)
// -----------------------------------------------------------------------------
interface SimCartItem {
  variantId: string;
  productId: string;
  productName: string;
  variantTitle: string;
  sku: string;
  price: number;
  discountPrice?: number | null;
  quantity: number;
  maxStock?: number;
}

class SimulatedCartManager {
  private items: SimCartItem[] = [];

  getItems(): SimCartItem[] {
    return [...this.items];
  }

  getItem(variantId: string): SimCartItem | undefined {
    return this.items.find((i) => i.variantId === variantId);
  }

  addItem(
    item: Omit<SimCartItem, 'quantity'>,
    quantityToAdd: number = 1
  ): { success: boolean; addedQuantity: number; totalQuantity: number; error?: string } {
    const rawQty = Number(quantityToAdd);

    if (!Number.isInteger(rawQty) || rawQty < 1 || rawQty > 999999) {
      return {
        success: false,
        addedQuantity: 0,
        totalQuantity: 0,
        error: 'Quantity must be a positive whole number.',
      };
    }

    const existingIndex = this.items.findIndex((i) => i.variantId === item.variantId);

    if (existingIndex > -1) {
      const existing = this.items[existingIndex];
      const currentQty = existing.quantity;
      const effectiveMaxStock = item.maxStock !== undefined ? item.maxStock : existing.maxStock;

      if (effectiveMaxStock !== undefined) {
        const maxAllowed = Math.max(0, effectiveMaxStock);

        if (currentQty >= maxAllowed) {
          return {
            success: false,
            addedQuantity: 0,
            totalQuantity: currentQty,
            error: `You already have the maximum available stock (${maxAllowed}) in your shopping bag.`,
          };
        }

        const combined = currentQty + rawQty;
        if (combined > maxAllowed) {
          const canAdd = Math.max(0, maxAllowed - currentQty);
          return {
            success: false,
            addedQuantity: 0,
            totalQuantity: currentQty,
            error: `Cannot add ${rawQty} units. Only ${canAdd} more available in stock (${currentQty} already in your bag).`,
          };
        }
      }

      existing.quantity += rawQty;
      if (item.maxStock !== undefined) {
        existing.maxStock = item.maxStock;
      }
      return {
        success: true,
        addedQuantity: rawQty,
        totalQuantity: existing.quantity,
      };
    } else {
      if (item.maxStock !== undefined) {
        const maxAllowed = Math.max(0, item.maxStock);
        if (rawQty > maxAllowed) {
          return {
            success: false,
            addedQuantity: 0,
            totalQuantity: 0,
            error: `Requested quantity (${rawQty}) exceeds available stock (${maxAllowed}).`,
          };
        }
      }

      this.items.push({ ...item, quantity: rawQty });
      return {
        success: true,
        addedQuantity: rawQty,
        totalQuantity: rawQty,
      };
    }
  }

  updateQuantity(
    variantId: string,
    quantity: number
  ): { success: boolean; updatedQuantity: number; error?: string } {
    const rawQty = Number(quantity);

    if (rawQty === 0) {
      this.items = this.items.filter((i) => i.variantId !== variantId);
      return { success: true, updatedQuantity: 0 };
    }

    if (!Number.isInteger(rawQty) || rawQty < 0 || rawQty > 999999) {
      return {
        success: false,
        updatedQuantity: 0,
        error: 'Quantity must be a positive whole number.',
      };
    }

    const existing = this.items.find((i) => i.variantId === variantId);
    if (!existing) {
      return { success: false, updatedQuantity: 0, error: 'Item not found in bag.' };
    }

    if (existing.maxStock !== undefined) {
      const maxAllowed = Math.max(0, existing.maxStock);
      if (rawQty > maxAllowed) {
        return {
          success: false,
          updatedQuantity: existing.quantity,
          error: `Only ${maxAllowed} units available in stock for ${existing.productName}.`,
        };
      }
    }

    existing.quantity = rawQty;
    return { success: true, updatedQuantity: rawQty };
  }

  syncCartStock(
    stockMap: Record<string, number>
  ): { adjustedItems: { variantId: string; oldQty: number; newQty: number }[] } {
    const adjustedItems: { variantId: string; oldQty: number; newQty: number }[] = [];

    for (const item of this.items) {
      if (item.variantId in stockMap) {
        const available = Math.max(0, stockMap[item.variantId]);
        if (item.quantity > available) {
          adjustedItems.push({
            variantId: item.variantId,
            oldQty: item.quantity,
            newQty: available,
          });
          item.quantity = available;
          item.maxStock = available;
        } else {
          item.maxStock = available;
        }
      }
    }

    return { adjustedItems };
  }
}

// -----------------------------------------------------------------------------
// TEST SUITE: CART & PRODUCT DETAIL STOCK QUANTITY VALIDATION
// -----------------------------------------------------------------------------

test('Stock Quantity Bound: stock = 10 allows requested quantities 5 and 10', () => {
  const cart = new SimulatedCartManager();

  // Test 1: Requested quantity 5 with stock 10 -> ACCEPTED
  const res5 = cart.addItem(
    {
      variantId: 'var-101',
      productId: 'prod-100',
      productName: 'Royal Sri Lankan Sapphire Ring',
      variantTitle: 'Gold 18k / Size 7',
      sku: 'SJ-SAP-01',
      price: 45000,
      maxStock: 10,
    },
    5
  );

  assert.equal(res5.success, true);
  assert.equal(res5.addedQuantity, 5);
  assert.equal(res5.totalQuantity, 5);
  assert.equal(cart.getItem('var-101')?.quantity, 5);

  // Reset cart for second boundary test
  const cartBoundary = new SimulatedCartManager();

  // Test 2: Requested quantity 10 (exact ceiling) with stock 10 -> ACCEPTED
  const res10 = cartBoundary.addItem(
    {
      variantId: 'var-101',
      productId: 'prod-100',
      productName: 'Royal Sri Lankan Sapphire Ring',
      variantTitle: 'Gold 18k / Size 7',
      sku: 'SJ-SAP-01',
      price: 45000,
      maxStock: 10,
    },
    10
  );

  assert.equal(res10.success, true);
  assert.equal(res10.addedQuantity, 10);
  assert.equal(res10.totalQuantity, 10);
  assert.equal(cartBoundary.getItem('var-101')?.quantity, 10);
});

test('Stock Quantity Bound: stock = 10 strictly rejects quantities 11 and 24 (production bug regression)', () => {
  const cart = new SimulatedCartManager();

  // Test 3: Requested quantity 11 with stock 10 -> REJECTED
  const res11 = cart.addItem(
    {
      variantId: 'var-101',
      productId: 'prod-100',
      productName: 'Royal Sri Lankan Sapphire Ring',
      variantTitle: 'Gold 18k / Size 7',
      sku: 'SJ-SAP-01',
      price: 45000,
      maxStock: 10,
    },
    11
  );

  assert.equal(res11.success, false);
  assert.equal(res11.addedQuantity, 0);
  assert.match(res11.error || '', /exceeds available stock \(10\)/);
  assert.equal(cart.getItems().length, 0);

  // Test 4: Requested quantity 24 (the reported production incident) with stock 10 -> REJECTED
  const res24 = cart.addItem(
    {
      variantId: 'var-101',
      productId: 'prod-100',
      productName: 'Royal Sri Lankan Sapphire Ring',
      variantTitle: 'Gold 18k / Size 7',
      sku: 'SJ-SAP-01',
      price: 45000,
      maxStock: 10,
    },
    24
  );

  assert.equal(res24.success, false);
  assert.equal(res24.addedQuantity, 0);
  assert.match(res24.error || '', /exceeds available stock \(10\)/);
  assert.equal(cart.getItems().length, 0);
});

test('Combined Quantity Validation: adding duplicate variant enforces aggregate stock ceiling (5 + 5 vs 5 + 6)', () => {
  const cart = new SimulatedCartManager();
  const itemDef = {
    variantId: 'var-101',
    productId: 'prod-100',
    productName: 'Royal Sri Lankan Sapphire Ring',
    variantTitle: 'Gold 18k / Size 7',
    sku: 'SJ-SAP-01',
    price: 45000,
    maxStock: 10,
  };

  // Step 1: Customer adds 5 units -> Bag has 5
  const step1 = cart.addItem(itemDef, 5);
  assert.equal(step1.success, true);
  assert.equal(step1.totalQuantity, 5);

  // Step 2A: Customer attempts to add 6 more units (5 + 6 = 11 > 10) -> REJECTED
  const step2A = cart.addItem(itemDef, 6);
  assert.equal(step2A.success, false);
  assert.equal(step2A.totalQuantity, 5);
  assert.match(step2A.error || '', /Cannot add 6 units.*Only 5 more available in stock \(5 already in your bag\)/);
  assert.equal(cart.getItem('var-101')?.quantity, 5);

  // Step 2B: Customer adds exactly 5 more units (5 + 5 = 10 == 10) -> ACCEPTED
  const step2B = cart.addItem(itemDef, 5);
  assert.equal(step2B.success, true);
  assert.equal(step2B.totalQuantity, 10);
  assert.equal(cart.getItem('var-101')?.quantity, 10);

  // Step 3: Customer attempts to add 1 more unit when cart already has 10 (maximum) -> REJECTED
  const step3 = cart.addItem(itemDef, 1);
  assert.equal(step3.success, false);
  assert.match(step3.error || '', /already have the maximum available stock \(10\)/);
  assert.equal(cart.getItem('var-101')?.quantity, 10);
});

test('Cart Stepper & Quantity Updates: prevents increasing cart quantity beyond available stock', () => {
  const cart = new SimulatedCartManager();
  cart.addItem(
    {
      variantId: 'var-101',
      productId: 'prod-100',
      productName: 'Royal Sri Lankan Sapphire Ring',
      variantTitle: 'Gold 18k / Size 7',
      sku: 'SJ-SAP-01',
      price: 45000,
      maxStock: 10,
    },
    9
  );

  assert.equal(cart.getItem('var-101')?.quantity, 9);

  // Increment +1 to reach 10 -> SUCCESS
  const updateTo10 = cart.updateQuantity('var-101', 10);
  assert.equal(updateTo10.success, true);
  assert.equal(updateTo10.updatedQuantity, 10);
  assert.equal(cart.getItem('var-101')?.quantity, 10);

  // Increment +1 to reach 11 -> REJECTED, stays at 10
  const updateTo11 = cart.updateQuantity('var-101', 11);
  assert.equal(updateTo11.success, false);
  assert.equal(updateTo11.updatedQuantity, 10);
  assert.match(updateTo11.error || '', /Only 10 units available in stock/);
  assert.equal(cart.getItem('var-101')?.quantity, 10);

  // Direct manual jump to 24 inside cart -> REJECTED, stays at 10
  const updateTo24 = cart.updateQuantity('var-101', 24);
  assert.equal(updateTo24.success, false);
  assert.equal(updateTo24.updatedQuantity, 10);
  assert.equal(cart.getItem('var-101')?.quantity, 10);

  // Decrement to 0 -> Removes item from bag
  const updateTo0 = cart.updateQuantity('var-101', 0);
  assert.equal(updateTo0.success, true);
  assert.equal(cart.getItems().length, 0);
});

test('Input Sanitization: rejects zero, negative, fractional, NaN, and excessive quantities', () => {
  const cart = new SimulatedCartManager();
  const itemDef = {
    variantId: 'var-101',
    productId: 'prod-100',
    productName: 'Royal Sri Lankan Sapphire Ring',
    variantTitle: 'Gold 18k / Size 7',
    sku: 'SJ-SAP-01',
    price: 45000,
    maxStock: 10,
  };

  // Zero
  const zeroRes = cart.addItem(itemDef, 0);
  assert.equal(zeroRes.success, false);
  assert.match(zeroRes.error || '', /positive whole number/);

  // Negative
  const negRes = cart.addItem(itemDef, -5);
  assert.equal(negRes.success, false);
  assert.match(negRes.error || '', /positive whole number/);

  // Fractional
  const fracRes = cart.addItem(itemDef, 3.5);
  assert.equal(fracRes.success, false);
  assert.match(fracRes.error || '', /positive whole number/);

  // NaN
  const nanRes = cart.addItem(itemDef, NaN);
  assert.equal(nanRes.success, false);
  assert.match(nanRes.error || '', /positive whole number/);

  // Excessive number > 999999
  const hugeRes = cart.addItem(itemDef, 1000000);
  assert.equal(hugeRes.success, false);
  assert.match(hugeRes.error || '', /positive whole number/);

  // Verify cart remained completely empty
  assert.equal(cart.getItems().length, 0);
});

test('Stale Inventory Synchronization: automatically detects reduced stock and clamps cart quantity', () => {
  const cart = new SimulatedCartManager();

  // Customer added 10 units when 10 were available
  cart.addItem(
    {
      variantId: 'var-101',
      productId: 'prod-100',
      productName: 'Royal Sri Lankan Sapphire Ring',
      variantTitle: 'Gold 18k / Size 7',
      sku: 'SJ-SAP-01',
      price: 45000,
      maxStock: 10,
    },
    10
  );
  assert.equal(cart.getItem('var-101')?.quantity, 10);

  // Case A: Warehouse stock dropped to 3 while customer was browsing
  const syncResult = cart.syncCartStock({ 'var-101': 3 });

  assert.equal(syncResult.adjustedItems.length, 1);
  assert.equal(syncResult.adjustedItems[0].variantId, 'var-101');
  assert.equal(syncResult.adjustedItems[0].oldQty, 10);
  assert.equal(syncResult.adjustedItems[0].newQty, 3);

  // Cart quantity is now automatically clamped to 3
  const itemAfterSync = cart.getItem('var-101');
  assert.equal(itemAfterSync?.quantity, 3);
  assert.equal(itemAfterSync?.maxStock, 3);

  // Case B: Warehouse stock dropped to 0 (out of stock)
  const syncToZero = cart.syncCartStock({ 'var-101': 0 });
  assert.equal(syncToZero.adjustedItems.length, 1);
  assert.equal(syncToZero.adjustedItems[0].newQty, 0);
  assert.equal(cart.getItem('var-101')?.quantity, 0);
  assert.equal(cart.getItem('var-101')?.maxStock, 0);
});

test('Server Validation Action: validateCartItemsAgainstInventory authoritative verification', () => {
  const inventoryMap = new Map<string, InventoryRecord>();
  inventoryMap.set('var-101', {
    variantId: 'var-101',
    productName: 'Royal Sri Lankan Sapphire Ring',
    variantTitle: 'Gold 18k / Size 7',
    stockQuantity: 10,
    stockStatus: 'in_stock',
    isVariantActive: true,
    isProductActive: true,
  });
  inventoryMap.set('var-202', {
    variantId: 'var-202',
    productName: 'Diamond Solitaire Pendant',
    variantTitle: 'White Gold',
    stockQuantity: 2,
    stockStatus: 'in_stock',
    isVariantActive: true,
    isProductActive: true,
  });
  inventoryMap.set('var-303', {
    variantId: 'var-303',
    productName: 'Gold Bangle Set',
    variantTitle: 'Standard',
    stockQuantity: 0,
    stockStatus: 'out_of_stock',
    isVariantActive: true,
    isProductActive: true,
  });

  // Test 1: Valid quantities within bounds (5 of var-101)
  const validCheck = validateCartItemsAgainstInventory(
    [{ variantId: 'var-101', quantity: 5 }],
    inventoryMap
  );
  assert.equal(validCheck.isValid, true);
  assert.equal(validCheck.errors.length, 0);
  assert.equal(validCheck.items[0].clampedQuantity, 5);

  // Test 2: Exact ceiling (10 of var-101)
  const boundaryCheck = validateCartItemsAgainstInventory(
    [{ variantId: 'var-101', quantity: 10 }],
    inventoryMap
  );
  assert.equal(boundaryCheck.isValid, true);
  assert.equal(boundaryCheck.errors.length, 0);
  assert.equal(boundaryCheck.items[0].clampedQuantity, 10);

  // Test 3: Excessive requested quantity 24 (production bug) -> Invalid, clamped to 10
  const excessCheck = validateCartItemsAgainstInventory(
    [{ variantId: 'var-101', quantity: 24 }],
    inventoryMap
  );
  assert.equal(excessCheck.isValid, false);
  assert.equal(excessCheck.errors.length, 1);
  assert.match(excessCheck.errors[0], /exceeds available stock \(10\)/);
  assert.equal(excessCheck.items[0].clampedQuantity, 10);

  // Test 4: Combined duplicates in payload (6 + 5 = 11 > 10)
  const combinedCheck = validateCartItemsAgainstInventory(
    [
      { variantId: 'var-101', quantity: 6 },
      { variantId: 'var-101', quantity: 5 },
    ],
    inventoryMap
  );
  assert.equal(combinedCheck.isValid, false);
  assert.match(combinedCheck.errors[0], /Requested quantity \(11\).*exceeds available stock \(10\)/);

  // Test 5: Out of stock item requested
  const oosCheck = validateCartItemsAgainstInventory(
    [{ variantId: 'var-303', quantity: 1 }],
    inventoryMap
  );
  assert.equal(oosCheck.isValid, false);
  assert.match(oosCheck.errors[0], /is currently out of stock/);
  assert.equal(oosCheck.items[0].clampedQuantity, 0);

  // Test 6: Malformed inputs (negative, fractional, string NaN)
  const malformedCheck = validateCartItemsAgainstInventory(
    [
      { variantId: 'var-101', quantity: -2 },
      { variantId: 'var-202', quantity: 1.5 },
    ],
    inventoryMap
  );
  assert.equal(malformedCheck.isValid, false);
  assert.equal(malformedCheck.errors.length, 2);
  assert.match(malformedCheck.errors[0], /must be a positive whole number/);
  assert.match(malformedCheck.errors[1], /must be a positive whole number/);
});

test('Guest & Authenticated Carts Parity: identical rules apply regardless of auth state', () => {
  const guestCart = new SimulatedCartManager();
  const authCart = new SimulatedCartManager();

  const item = {
    variantId: 'var-101',
    productId: 'prod-100',
    productName: 'Royal Sri Lankan Sapphire Ring',
    variantTitle: 'Gold 18k / Size 7',
    sku: 'SJ-SAP-01',
    price: 45000,
    maxStock: 10,
  };

  // Both attempt to add 24 units
  const guestRes24 = guestCart.addItem(item, 24);
  const authRes24 = authCart.addItem(item, 24);

  assert.equal(guestRes24.success, false);
  assert.equal(authRes24.success, false);
  assert.equal(guestRes24.error, authRes24.error);

  // Both attempt to add 10 units
  const guestRes10 = guestCart.addItem(item, 10);
  const authRes10 = authCart.addItem(item, 10);

  assert.equal(guestRes10.success, true);
  assert.equal(authRes10.success, true);
  assert.equal(guestCart.getItem('var-101')?.quantity, authCart.getItem('var-101')?.quantity);
});
