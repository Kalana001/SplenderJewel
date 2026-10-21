/**
 * SPLENDER JEWEL — PURCHASE LANDED-COST & INVENTORY VALUATION ENGINE
 *
 * Implements deterministic integer-cent arithmetic for physical quantity-based
 * expense allocation and moving weighted-average cost (WAC) calculations.
 *
 * Mathematical Invariants:
 * 1. Minor Units: All currency operations are calculated in integer cents (BIGINT).
 * 2. 0-Cent Discrepancy: Sum of line allocated expenses strictly equals total batch expenses.
 * 3. Exact Landed Total: Sum of line landed costs strictly equals batch supplier cost + batch expenses.
 * 4. Deterministic Ordering: Variation lines are sorted canonically by variationId ascending.
 */

export interface LineCostInput {
  variationId: string;
  quantity: number;
  supplierUnitPriceCents: bigint;
}

export interface LineCostAllocation {
  variationId: string;
  quantity: number;
  supplierUnitPriceCents: bigint;
  lineSupplierCostCents: bigint;
  lineAllocatedExpenseCents: bigint;
  lineTotalLandedCostCents: bigint;
  unitLandedCostCents: bigint;
}

/**
 * Converts decimal currency (LKR) to integer cents (BIGINT).
 * Handles string or number inputs safely.
 * Example: 1250.50 => 125050n
 */
export function decimalLkrToCents(amount: number | string): bigint {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid decimal amount: "${amount}". Must be a finite number.`);
  }
  if (num < 0) {
    throw new Error(`Currency amounts cannot be negative: ${num}.`);
  }
  // Use Math.round to safely convert floating point representations
  return BigInt(Math.round(num * 100));
}

/**
 * Converts integer cents (BIGINT or number) to 2-decimal LKR number.
 * Example: 125050n => 1250.50
 */
export function centsToDecimalLkr(cents: bigint | number): number {
  const c = typeof cents === 'bigint' ? Number(cents) : cents;
  if (!Number.isFinite(c)) {
    throw new Error(`Invalid cents amount: "${cents}".`);
  }
  return Number((c / 100).toFixed(2));
}

/**
 * Deterministically allocates total batch expenses across physical units using integer cents.
 *
 * Formula:
 * base_expense_per_unit = floor(total_expenses / total_units)
 * remainder_cents = total_expenses % total_units
 *
 * The remainder cents are deterministically distributed across variations in
 * ascending variationId order (1 extra cent per unit until exhausted).
 */
export function allocateBatchExpensesExact(
  totalExpensesCents: bigint,
  lines: LineCostInput[]
): LineCostAllocation[] {
  if (totalExpensesCents < BigInt(0)) {
    throw new Error('Total batch expenses cannot be negative.');
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('At least one variation line is required for expense allocation.');
  }

  // 1. Validate inputs and calculate total physical units
  let totalUnits = 0;
  for (const line of lines) {
    if (!line.variationId || typeof line.variationId !== 'string') {
      throw new Error('Each variation line must have a valid variationId string.');
    }
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error(`Invalid quantity for line "${line.variationId}": must be a positive integer.`);
    }
    if (line.supplierUnitPriceCents < BigInt(0)) {
      throw new Error(`Invalid supplier unit price for line "${line.variationId}": cannot be negative.`);
    }
    totalUnits += line.quantity;
  }

  if (totalUnits <= 0) {
    throw new Error('Total batch units must be greater than zero.');
  }

  // 2. Canonical deterministic sort by variationId ascending
  const sortedLines = [...lines].sort((a, b) => a.variationId.localeCompare(b.variationId));

  const totalUnitsBig = BigInt(totalUnits);
  const baseExpensePerUnit = totalExpensesCents / totalUnitsBig;
  let remainderCents = totalExpensesCents % totalUnitsBig;

  const results: LineCostAllocation[] = [];
  let allocatedExpensesSum = BigInt(0);
  let totalSupplierSum = BigInt(0);
  let totalLandedSum = BigInt(0);

  // 3. Line-by-line allocation
  for (const line of sortedLines) {
    const qtyBig = BigInt(line.quantity);
    const lineSupplierCost = qtyBig * line.supplierUnitPriceCents;

    // Distribute remainder cents deterministically across the physical units in this line
    const extraForLine = remainderCents > BigInt(0)
      ? (remainderCents >= qtyBig ? qtyBig : remainderCents)
      : BigInt(0);
    remainderCents -= extraForLine;

    const lineAllocatedExpense = (qtyBig * baseExpensePerUnit) + extraForLine;
    const lineTotalLanded = lineSupplierCost + lineAllocatedExpense;

    // Half-up integer rounding for per-unit cost reference
    const unitLandedCost = (lineTotalLanded + (qtyBig / BigInt(2))) / qtyBig;

    allocatedExpensesSum += lineAllocatedExpense;
    totalSupplierSum += lineSupplierCost;
    totalLandedSum += lineTotalLanded;

    results.push({
      variationId: line.variationId,
      quantity: line.quantity,
      supplierUnitPriceCents: line.supplierUnitPriceCents,
      lineSupplierCostCents: lineSupplierCost,
      lineAllocatedExpenseCents: lineAllocatedExpense,
      lineTotalLandedCostCents: lineTotalLanded,
      unitLandedCostCents: unitLandedCost,
    });
  }

  // 4. Mathematical Reconciliation Invariant Checks
  if (allocatedExpensesSum !== totalExpensesCents) {
    throw new Error(
      `CRITICAL EXPENSE RECONCILIATION DISCREPANCY: Allocated sum (${allocatedExpensesSum}) does not match total batch expenses (${totalExpensesCents}).`
    );
  }

  if (totalLandedSum !== totalSupplierSum + totalExpensesCents) {
    throw new Error(
      `CRITICAL LANDED COST DISCREPANCY: Total landed sum (${totalLandedSum}) does not match supplier (${totalSupplierSum}) + expenses (${totalExpensesCents}).`
    );
  }

  return results;
}

/**
 * Calculates new moving Weighted Average Cost (WAC) when transferring purchased units
 * into existing storefront inventory.
 *
 * Formula:
 * If current_stock <= 0:
 *   new_cost = transfer_unit_cost
 * Else:
 *   new_cost = round(((current_stock * current_cost) + (transfer_qty * transfer_unit_cost)) / (current_stock + transfer_qty))
 */
export function calculateMovingWeightedAverageCost(
  currentStock: number,
  currentCostCents: bigint,
  transferQuantity: number,
  transferUnitCostCents: bigint
): bigint {
  if (!Number.isInteger(transferQuantity) || transferQuantity <= 0) {
    throw new Error('Transfer quantity must be a positive integer.');
  }
  if (transferUnitCostCents < BigInt(0)) {
    throw new Error('Transfer unit cost cannot be negative.');
  }

  // If currently out of stock or negative due to discrepancy, adopt new batch landed cost directly
  if (currentStock <= 0) {
    return transferUnitCostCents;
  }

  if (currentCostCents < BigInt(0)) {
    throw new Error('Current variant cost cannot be negative.');
  }

  const currentStockBig = BigInt(currentStock);
  const transferQtyBig = BigInt(transferQuantity);

  const existingInventoryValuation = currentStockBig * currentCostCents;
  const newStockValuation = transferQtyBig * transferUnitCostCents;
  const totalStockUnits = currentStockBig + transferQtyBig;

  // Round half-up to exact integer cents
  const totalValuation = existingInventoryValuation + newStockValuation;
  return (totalValuation + (totalStockUnits / BigInt(2))) / totalStockUnits;
}

export interface TransferCostResult {
  transferCostCents: bigint;
  transferUnitCostCents: bigint;
  newCumulativeTransferredCostCents: bigint;
  newQuantityLinked: number;
}

/**
 * Calculates transfer cost for stock being moved from a purchase variation to storefront inventory.
 * Enforces partial-receipt accounting invariants:
 * - Uses quantityPurchased as the basis for line-cost allocation so that partial receipts
 *   do not prematurely absorb costs belonging to unreceived units.
 * - Final transfer of all purchased units absorbs exact residual cents, guaranteeing zero drift.
 */
export function calculateTransferCostCents(params: {
  quantityPurchased: number;
  quantityReceived: number;
  quantityLinked: number;
  transferQuantity: number;
  lineTotalLandedCostCents: bigint;
  cumulativeTransferredCostCents: bigint;
}): TransferCostResult {
  if (!Number.isInteger(params.transferQuantity) || params.transferQuantity <= 0) {
    throw new Error('Transfer quantity must be a positive integer.');
  }
  if (!Number.isInteger(params.quantityPurchased) || params.quantityPurchased <= 0) {
    throw new Error('Quantity purchased must be a positive integer.');
  }
  if (!Number.isInteger(params.quantityReceived) || params.quantityReceived < 0) {
    throw new Error('Quantity received cannot be negative.');
  }
  if (!Number.isInteger(params.quantityLinked) || params.quantityLinked < 0) {
    throw new Error('Quantity linked cannot be negative.');
  }
  if (params.quantityLinked + params.transferQuantity > params.quantityReceived) {
    throw new Error(
      `Cannot transfer ${params.transferQuantity} unit(s): only ${
        params.quantityReceived - params.quantityLinked
      } unlinked unit(s) available.`
    );
  }

  let transferCostCents: bigint;

  // Final transfer of all purchased units absorbs exact remaining line balance
  if (params.quantityLinked + params.transferQuantity === params.quantityPurchased) {
    transferCostCents = params.lineTotalLandedCostCents - params.cumulativeTransferredCostCents;
  } else {
    // Pro-rata portion based on purchased quantity to prevent premature cost absorption on partial receipts
    const numLineTotal = Number(params.lineTotalLandedCostCents);
    const cost = Math.round((numLineTotal / params.quantityPurchased) * params.transferQuantity);
    transferCostCents = BigInt(cost);
  }

  const transferQtyBig = BigInt(params.transferQuantity);
  const transferUnitCostCents = (transferCostCents + (transferQtyBig / BigInt(2))) / transferQtyBig;

  return {
    transferCostCents,
    transferUnitCostCents,
    newCumulativeTransferredCostCents: params.cumulativeTransferredCostCents + transferCostCents,
    newQuantityLinked: params.quantityLinked + params.transferQuantity,
  };
}

