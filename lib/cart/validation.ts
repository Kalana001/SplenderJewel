export interface CartStockItemInput {
  variantId: string;
  quantity: number;
}

export interface CartStockItemValidationResult {
  variantId: string;
  requestedQuantity: number;
  availableStock: number;
  inStock: boolean;
  isValid: boolean;
  clampedQuantity: number;
  productName?: string;
  variantTitle?: string;
  error?: string;
}

export interface CartStockValidationResult {
  isValid: boolean;
  items: CartStockItemValidationResult[];
  stockMap: Record<string, number>;
  errors: string[];
}

export interface InventoryRecord {
  variantId: string;
  productName?: string;
  variantTitle?: string;
  stockQuantity: number;
  stockStatus: string;
  isVariantActive: boolean;
  isProductActive: boolean;
}

/**
 * PURE INVENTORY VALIDATION LOGIC
 *
 * Evaluates cart items against an authoritative inventory map.
 * Enforces:
 * 1. Positive whole integer sanitization (rejects 0, negative, fractional, NaN, >999999)
 * 2. Combined quantity aggregation across duplicate variants
 * 3. Variant and product active lifecycle state verification
 * 4. Available stock ceiling clamping and customer-friendly error generation
 */
export function validateCartItemsAgainstInventory(
  items: CartStockItemInput[],
  inventoryMap: Map<string, InventoryRecord>
): CartStockValidationResult {
  const errors: string[] = [];
  const stockMap: Record<string, number> = {};
  const itemResults: CartStockItemValidationResult[] = [];

  if (!items || !Array.isArray(items) || items.length === 0) {
    return {
      isValid: true,
      items: [],
      stockMap: {},
      errors: [],
    };
  }

  // 1. Validate raw quantities and aggregate duplicate variant additions
  const aggregatedMap = new Map<string, number>();
  const invalidInputs = new Map<string, string>();

  for (const item of items) {
    const vid = item?.variantId?.trim();
    if (!vid) {
      errors.push('Each cart item must have a valid variant identifier.');
      continue;
    }

    const rawQty = Number(item.quantity);
    if (!Number.isInteger(rawQty) || rawQty < 1 || rawQty > 999999) {
      invalidInputs.set(
        vid,
        `Invalid quantity (${item.quantity}) requested. Quantity must be a positive whole number.`
      );
      continue;
    }

    aggregatedMap.set(vid, (aggregatedMap.get(vid) || 0) + rawQty);
  }

  // Record validation errors for malformed item quantities
  for (const [vid, err] of invalidInputs.entries()) {
    errors.push(err);
    itemResults.push({
      variantId: vid,
      requestedQuantity: 0,
      availableStock: 0,
      inStock: false,
      isValid: false,
      clampedQuantity: 0,
      error: err,
    });
  }

  // 2. Validate aggregated variant quantities against inventory
  for (const [variantId, totalRequested] of aggregatedMap.entries()) {
    const inv = inventoryMap.get(variantId);

    if (!inv) {
      const err = 'Selected item variant is no longer available in the store.';
      errors.push(err);
      stockMap[variantId] = 0;
      itemResults.push({
        variantId,
        requestedQuantity: totalRequested,
        availableStock: 0,
        inStock: false,
        isValid: false,
        clampedQuantity: 0,
        error: err,
      });
      continue;
    }

    const prodName = inv.productName || 'Jewelry item';
    const varTitle = inv.variantTitle ? ` (${inv.variantTitle})` : '';
    const itemLabel = `${prodName}${varTitle}`;

    if (!inv.isProductActive || !inv.isVariantActive) {
      const err = `${itemLabel} is currently inactive and cannot be ordered.`;
      errors.push(err);
      stockMap[variantId] = 0;
      itemResults.push({
        variantId,
        requestedQuantity: totalRequested,
        availableStock: 0,
        inStock: false,
        isValid: false,
        clampedQuantity: 0,
        productName: inv.productName,
        variantTitle: inv.variantTitle,
        error: err,
      });
      continue;
    }

    const available = Math.max(0, inv.stockQuantity);
    stockMap[variantId] = available;

    if (available === 0 || inv.stockStatus === 'out_of_stock') {
      const err = `${itemLabel} is currently out of stock.`;
      errors.push(err);
      itemResults.push({
        variantId,
        requestedQuantity: totalRequested,
        availableStock: 0,
        inStock: false,
        isValid: false,
        clampedQuantity: 0,
        productName: inv.productName,
        variantTitle: inv.variantTitle,
        error: err,
      });
      continue;
    }

    if (totalRequested > available) {
      const err = `Requested quantity (${totalRequested}) for ${itemLabel} exceeds available stock (${available}).`;
      errors.push(err);
      itemResults.push({
        variantId,
        requestedQuantity: totalRequested,
        availableStock: available,
        inStock: true,
        isValid: false,
        clampedQuantity: available,
        productName: inv.productName,
        variantTitle: inv.variantTitle,
        error: err,
      });
      continue;
    }

    // Fully valid
    itemResults.push({
      variantId,
      requestedQuantity: totalRequested,
      availableStock: available,
      inStock: true,
      isValid: true,
      clampedQuantity: totalRequested,
      productName: inv.productName,
      variantTitle: inv.variantTitle,
    });
  }

  const allValid = errors.length === 0 && itemResults.every((i) => i.isValid);

  return {
    isValid: allValid,
    items: itemResults,
    stockMap,
    errors,
  };
}
