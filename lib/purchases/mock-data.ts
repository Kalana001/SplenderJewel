import { allocateBatchExpensesExact, decimalLkrToCents, centsToDecimalLkr } from './calculations.ts';
import type { 
  PurchaseBatch, 
  PurchaseBatchExpense, 
  PurchaseBatchItem, 
  PurchaseBatchItemVariation,
  PurchaseBatchReceiptEvent,
  PurchaseBatchStatus,
  PurchaseBatchDTO,
  PurchaseBatchExpenseDTO,
  PurchaseBatchItemVariationDTO,
  PurchaseBatchItemDTO,
  PurchaseBatchReceiptEventDTO,
  BatchDetailViewDataDTO
} from './types.ts';

export interface BatchDetailViewData {
  batch: PurchaseBatch;
  expenses: PurchaseBatchExpense[];
  items: Array<PurchaseBatchItem & { variations: PurchaseBatchItemVariation[] }>;
  receipts: PurchaseBatchReceiptEvent[];
}

export interface EligiblePurchaseVariation {
  batchId: string;
  batchNumber: string;
  supplierName: string;
  invoiceNumber: string | null;
  purchaseDate: string;
  batchItemId: string;
  itemName: string;
  itemCategoryHint: string | null;
  batchVariationId: string;
  variationTitle: string;
  attributes: Record<string, string>;
  supplierSku: string | null;
  quantityReceived: number;
  quantityLinked: number;
  availableQuantity: number;
  unitLandedCostCents: number;
  unitLandedCostLkr: number;
  supplierUnitPriceLkr: number;
}

/**
 * Generates verified mock batches for UI preview, offline development, and demonstration.
 * All financial allocations are computed directly through the integer landed-cost engine.
 * Uses realistic fashion jewelry examples: gold-plated rings, pearl necklaces, tiger-eye bracelets,
 * fashion earrings, and jewelry sets.
 */
function createMockBatch1(): BatchDetailViewData {
  const batchId = '00000000-0000-0000-0000-000000000001';
  const expenses: PurchaseBatchExpense[] = [
    {
      id: 'exp-001-1',
      batchId,
      expenseType: 'shipping',
      amountCents: decimalLkrToCents(1500),
      description: 'Insured Armored Courier from Colombo Wholesale District',
      createdAt: '2026-10-10T09:00:00Z',
    },
    {
      id: 'exp-001-2',
      batchId,
      expenseType: 'customs_taxes',
      amountCents: decimalLkrToCents(2500),
      description: 'Electroplating & Precious Metal Alloy Duty',
      createdAt: '2026-10-10T09:00:00Z',
    },
    {
      id: 'exp-001-3',
      batchId,
      expenseType: 'packing',
      amountCents: decimalLkrToCents(800),
      description: 'Velvet Display Boxes with Anti-Tarnish Pouches',
      createdAt: '2026-10-10T09:00:00Z',
    },
  ];

  const totalExpensesCents = expenses.reduce((sum, e) => sum + e.amountCents, BigInt(0));

  const lineInputs = [
    { variationId: 'var-001-1', quantity: 5, supplierUnitPriceCents: decimalLkrToCents(400) },
    { variationId: 'var-001-2', quantity: 8, supplierUnitPriceCents: decimalLkrToCents(450) },
    { variationId: 'var-001-3', quantity: 7, supplierUnitPriceCents: decimalLkrToCents(500) },
  ];

  const allocations = allocateBatchExpensesExact(totalExpensesCents, lineInputs);
  const allocMap = new Map(allocations.map(a => [a.variationId, a]));

  const itemId = 'item-001-1';
  const variations: PurchaseBatchItemVariation[] = [
    {
      id: 'var-001-1',
      batchId,
      batchItemId: itemId,
      variationTitle: 'Size 6',
      attributes: { Size: '6', Material: '18K Gold Plated' },
      supplierSku: 'RNG-GP-SZ6',
      quantityPurchased: 5,
      quantityReceived: 5,
      quantityLinked: 0,
      quantityRemaining: 0,
      supplierUnitPriceCents: decimalLkrToCents(400),
      lineSupplierCostCents: allocMap.get('var-001-1')!.lineSupplierCostCents,
      lineAllocatedExpenseCents: allocMap.get('var-001-1')!.lineAllocatedExpenseCents,
      lineTotalLandedCostCents: allocMap.get('var-001-1')!.lineTotalLandedCostCents,
      unitLandedCostCents: allocMap.get('var-001-1')!.unitLandedCostCents,
      createdAt: '2026-10-10T09:00:00Z',
    },
    {
      id: 'var-001-2',
      batchId,
      batchItemId: itemId,
      variationTitle: 'Size 7',
      attributes: { Size: '7', Material: '18K Gold Plated' },
      supplierSku: 'RNG-GP-SZ7',
      quantityPurchased: 8,
      quantityReceived: 8,
      quantityLinked: 0,
      quantityRemaining: 0,
      supplierUnitPriceCents: decimalLkrToCents(450),
      lineSupplierCostCents: allocMap.get('var-001-2')!.lineSupplierCostCents,
      lineAllocatedExpenseCents: allocMap.get('var-001-2')!.lineAllocatedExpenseCents,
      lineTotalLandedCostCents: allocMap.get('var-001-2')!.lineTotalLandedCostCents,
      unitLandedCostCents: allocMap.get('var-001-2')!.unitLandedCostCents,
      createdAt: '2026-10-10T09:00:00Z',
    },
    {
      id: 'var-001-3',
      batchId,
      batchItemId: itemId,
      variationTitle: 'Size 8',
      attributes: { Size: '8', Material: '18K Gold Plated' },
      supplierSku: 'RNG-GP-SZ8',
      quantityPurchased: 7,
      quantityReceived: 7,
      quantityLinked: 0,
      quantityRemaining: 0,
      supplierUnitPriceCents: decimalLkrToCents(500),
      lineSupplierCostCents: allocMap.get('var-001-3')!.lineSupplierCostCents,
      lineAllocatedExpenseCents: allocMap.get('var-001-3')!.lineAllocatedExpenseCents,
      lineTotalLandedCostCents: allocMap.get('var-001-3')!.lineTotalLandedCostCents,
      unitLandedCostCents: allocMap.get('var-001-3')!.unitLandedCostCents,
      createdAt: '2026-10-10T09:00:00Z',
    },
  ];

  const totalSupplierCostCents = variations.reduce((sum, v) => sum + v.lineSupplierCostCents, BigInt(0));
  const totalLandedCostCents = totalSupplierCostCents + totalExpensesCents;

  const item: PurchaseBatchItem & { variations: PurchaseBatchItemVariation[] } = {
    id: itemId,
    batchId,
    itemName: '18K Gold Plated Stacking Ring',
    itemCategoryHint: 'Rings',
    totalQuantity: 20,
    totalSupplierCostCents,
    totalAllocatedExpenseCents: totalExpensesCents,
    totalLandedCostCents,
    createdAt: '2026-10-10T09:00:00Z',
    variations,
  };

  const batch: PurchaseBatch = {
    id: batchId,
    batchNumber: 'PB-2026-001',
    supplierName: 'Colombo Fashion Jewelry Wholesale',
    supplierContact: '+94 77 123 4567',
    invoiceNumber: 'INV-CFJ-9412',
    purchaseDate: '2026-10-10',
    status: 'received',
    totalSupplierCostCents,
    totalExpensesCents,
    totalLandedCostCents,
    totalPurchasedUnits: 20,
    totalReceivedUnits: 20,
    notes: 'Premium 18K gold-plated brass stacking rings with tarnish-resistant coating.',
    createdBy: '00000000-0000-0000-0000-000000000000',
    createdAt: '2026-10-10T09:00:00Z',
    updatedAt: '2026-10-12T14:30:00Z',
    receivedAt: '2026-10-12T14:30:00Z',
  };

  const receipts: PurchaseBatchReceiptEvent[] = [
    {
      id: 'rcpt-001-1',
      batchId,
      batchVariationId: 'var-001-1',
      quantityReceived: 5,
      receiptNotes: 'Full shipment arrived in anti-tarnish security pack',
      receivedBy: '00000000-0000-0000-0000-000000000000',
      createdAt: '2026-10-12T14:30:00Z',
    },
    {
      id: 'rcpt-001-2',
      batchId,
      batchVariationId: 'var-001-2',
      quantityReceived: 8,
      receiptNotes: 'Inspection passed, plating thickness verified',
      receivedBy: '00000000-0000-0000-0000-000000000000',
      createdAt: '2026-10-12T14:30:00Z',
    },
    {
      id: 'rcpt-001-3',
      batchId,
      batchVariationId: 'var-001-3',
      quantityReceived: 7,
      receiptNotes: 'Finish testing passed, zero surface defects',
      receivedBy: '00000000-0000-0000-0000-000000000000',
      createdAt: '2026-10-12T14:30:00Z',
    },
  ];

  return { batch, expenses, items: [item], receipts };
}

function createMockBatch2(): BatchDetailViewData {
  const batchId = '00000000-0000-0000-0000-000000000002';
  const expenses: PurchaseBatchExpense[] = [
    {
      id: 'exp-002-1',
      batchId,
      expenseType: 'transport',
      amountCents: decimalLkrToCents(2000),
      description: 'Secured Islandwide Freight from Pearl Cultivation Center',
      createdAt: '2026-10-15T11:00:00Z',
    },
    {
      id: 'exp-002-2',
      batchId,
      expenseType: 'other',
      amountCents: decimalLkrToCents(1250),
      description: 'Luster & Surface Quality Grading Certification',
      createdAt: '2026-10-15T11:00:00Z',
    },
  ];

  const totalExpensesCents = expenses.reduce((sum, e) => sum + e.amountCents, BigInt(0));

  const lineInputs = [
    { variationId: 'var-002-1', quantity: 10, supplierUnitPriceCents: decimalLkrToCents(800) },
    { variationId: 'var-002-2', quantity: 15, supplierUnitPriceCents: decimalLkrToCents(850) },
  ];

  const allocations = allocateBatchExpensesExact(totalExpensesCents, lineInputs);
  const allocMap = new Map(allocations.map(a => [a.variationId, a]));

  const itemId = 'item-002-1';
  const variations: PurchaseBatchItemVariation[] = [
    {
      id: 'var-002-1',
      batchId,
      batchItemId: itemId,
      variationTitle: '16 Inch Chain',
      attributes: { Length: '16 inch', Stone: 'Freshwater Pearl' },
      supplierSku: 'PRL-NCK-16',
      quantityPurchased: 10,
      quantityReceived: 10,
      quantityLinked: 0,
      quantityRemaining: 0,
      supplierUnitPriceCents: decimalLkrToCents(800),
      lineSupplierCostCents: allocMap.get('var-002-1')!.lineSupplierCostCents,
      lineAllocatedExpenseCents: allocMap.get('var-002-1')!.lineAllocatedExpenseCents,
      lineTotalLandedCostCents: allocMap.get('var-002-1')!.lineTotalLandedCostCents,
      unitLandedCostCents: allocMap.get('var-002-1')!.unitLandedCostCents,
      createdAt: '2026-10-15T11:00:00Z',
    },
    {
      id: 'var-002-2',
      batchId,
      batchItemId: itemId,
      variationTitle: '18 Inch Chain',
      attributes: { Length: '18 inch', Stone: 'Freshwater Pearl' },
      supplierSku: 'PRL-NCK-18',
      quantityPurchased: 15,
      quantityReceived: 5,
      quantityLinked: 0,
      quantityRemaining: 10,
      supplierUnitPriceCents: decimalLkrToCents(850),
      lineSupplierCostCents: allocMap.get('var-002-2')!.lineSupplierCostCents,
      lineAllocatedExpenseCents: allocMap.get('var-002-2')!.lineAllocatedExpenseCents,
      lineTotalLandedCostCents: allocMap.get('var-002-2')!.lineTotalLandedCostCents,
      unitLandedCostCents: allocMap.get('var-002-2')!.unitLandedCostCents,
      createdAt: '2026-10-15T11:00:00Z',
    },
  ];

  const totalSupplierCostCents = variations.reduce((sum, v) => sum + v.lineSupplierCostCents, BigInt(0));
  const totalLandedCostCents = totalSupplierCostCents + totalExpensesCents;

  const item: PurchaseBatchItem & { variations: PurchaseBatchItemVariation[] } = {
    id: itemId,
    batchId,
    itemName: 'Freshwater Pearl Pendant Necklace',
    itemCategoryHint: 'Necklaces',
    totalQuantity: 25,
    totalSupplierCostCents,
    totalAllocatedExpenseCents: totalExpensesCents,
    totalLandedCostCents,
    createdAt: '2026-10-15T11:00:00Z',
    variations,
  };

  const batch: PurchaseBatch = {
    id: batchId,
    batchNumber: 'PB-2026-002',
    supplierName: 'Lanka Pearl Traders',
    supplierContact: '+94 11 234 5678',
    invoiceNumber: 'INV-LPT-104',
    purchaseDate: '2026-10-15',
    status: 'partially_received',
    totalSupplierCostCents,
    totalExpensesCents,
    totalLandedCostCents,
    totalPurchasedUnits: 25,
    totalReceivedUnits: 15,
    notes: 'Partial shipment received. Balance 10 units of 18-inch chain scheduled for delivery next week.',
    createdBy: '00000000-0000-0000-0000-000000000000',
    createdAt: '2026-10-15T11:00:00Z',
    updatedAt: '2026-10-18T16:00:00Z',
    receivedAt: null,
  };

  const receipts: PurchaseBatchReceiptEvent[] = [
    {
      id: 'rcpt-002-1',
      batchId,
      batchVariationId: 'var-002-1',
      quantityReceived: 10,
      receiptNotes: 'First delivery batch: full 16-inch quantity received',
      receivedBy: '00000000-0000-0000-0000-000000000000',
      createdAt: '2026-10-18T16:00:00Z',
    },
    {
      id: 'rcpt-002-2',
      batchId,
      batchVariationId: 'var-002-2',
      quantityReceived: 5,
      receiptNotes: 'Partial delivery: 5 of 15 units of 18-inch received',
      receivedBy: '00000000-0000-0000-0000-000000000000',
      createdAt: '2026-10-18T16:00:00Z',
    },
  ];

  return { batch, expenses, items: [item], receipts };
}

function createMockBatch3(): BatchDetailViewData {
  const batchId = '00000000-0000-0000-0000-000000000003';
  const expenses: PurchaseBatchExpense[] = [
    {
      id: 'exp-003-1',
      batchId,
      expenseType: 'shipping',
      amountCents: decimalLkrToCents(3500),
      description: 'Specialized Gemstone Armored Transit',
      createdAt: '2026-10-19T08:30:00Z',
    },
  ];

  const totalExpensesCents = expenses.reduce((sum, e) => sum + e.amountCents, BigInt(0));

  const lineInputs = [
    { variationId: 'var-003-1', quantity: 6, supplierUnitPriceCents: decimalLkrToCents(1200) },
    { variationId: 'var-003-2', quantity: 4, supplierUnitPriceCents: decimalLkrToCents(1600) },
  ];

  const allocations = allocateBatchExpensesExact(totalExpensesCents, lineInputs);
  const allocMap = new Map(allocations.map(a => [a.variationId, a]));

  const itemId = 'item-003-1';
  const variations: PurchaseBatchItemVariation[] = [
    {
      id: 'var-003-1',
      batchId,
      batchItemId: itemId,
      variationTitle: '8mm Beads',
      attributes: { BeadSize: '8mm', Stone: 'Tiger Eye' },
      supplierSku: 'TE-BRL-8MM',
      quantityPurchased: 6,
      quantityReceived: 0,
      quantityLinked: 0,
      quantityRemaining: 6,
      supplierUnitPriceCents: decimalLkrToCents(1200),
      lineSupplierCostCents: allocMap.get('var-003-1')!.lineSupplierCostCents,
      lineAllocatedExpenseCents: allocMap.get('var-003-1')!.lineAllocatedExpenseCents,
      lineTotalLandedCostCents: allocMap.get('var-003-1')!.lineTotalLandedCostCents,
      unitLandedCostCents: allocMap.get('var-003-1')!.unitLandedCostCents,
      createdAt: '2026-10-19T08:30:00Z',
    },
    {
      id: 'var-003-2',
      batchId,
      batchItemId: itemId,
      variationTitle: '10mm Beads',
      attributes: { BeadSize: '10mm', Stone: 'Tiger Eye' },
      supplierSku: 'TE-BRL-10MM',
      quantityPurchased: 4,
      quantityReceived: 0,
      quantityLinked: 0,
      quantityRemaining: 4,
      supplierUnitPriceCents: decimalLkrToCents(1600),
      lineSupplierCostCents: allocMap.get('var-003-2')!.lineSupplierCostCents,
      lineAllocatedExpenseCents: allocMap.get('var-003-2')!.lineAllocatedExpenseCents,
      lineTotalLandedCostCents: allocMap.get('var-003-2')!.lineTotalLandedCostCents,
      unitLandedCostCents: allocMap.get('var-003-2')!.unitLandedCostCents,
      createdAt: '2026-10-19T08:30:00Z',
    },
  ];

  const totalSupplierCostCents = variations.reduce((sum, v) => sum + v.lineSupplierCostCents, BigInt(0));
  const totalLandedCostCents = totalSupplierCostCents + totalExpensesCents;

  const item: PurchaseBatchItem & { variations: PurchaseBatchItemVariation[] } = {
    id: itemId,
    batchId,
    itemName: 'Natural Tiger Eye Beaded Bracelet',
    itemCategoryHint: 'Bracelets',
    totalQuantity: 10,
    totalSupplierCostCents,
    totalAllocatedExpenseCents: totalExpensesCents,
    totalLandedCostCents,
    createdAt: '2026-10-19T08:30:00Z',
    variations,
  };

  const batch: PurchaseBatch = {
    id: batchId,
    batchNumber: 'PB-2026-003',
    supplierName: 'Ceylon Gem & Bead Supply',
    supplierContact: '+94 45 222 3344',
    invoiceNumber: 'INV-CGBS-772',
    purchaseDate: '2026-10-19',
    status: 'ordered',
    totalSupplierCostCents,
    totalExpensesCents,
    totalLandedCostCents,
    totalPurchasedUnits: 10,
    totalReceivedUnits: 0,
    notes: 'Natural A-grade tiger eye stone beads on durable stretch cord. Awaiting physical delivery.',
    createdBy: '00000000-0000-0000-0000-000000000000',
    createdAt: '2026-10-19T08:30:00Z',
    updatedAt: '2026-10-19T08:30:00Z',
    receivedAt: null,
  };

  return { batch, expenses, items: [item], receipts: [] };
}

function createMockBatch4(): BatchDetailViewData {
  const batchId = '00000000-0000-0000-0000-000000000004';
  const expenses: PurchaseBatchExpense[] = [
    {
      id: 'exp-004-1',
      batchId,
      expenseType: 'shipping',
      amountCents: decimalLkrToCents(1200),
      description: 'Standard Islandwide Freight',
      createdAt: '2026-10-20T10:15:00Z',
    },
    {
      id: 'exp-004-2',
      batchId,
      expenseType: 'packing',
      amountCents: decimalLkrToCents(600),
      description: 'Velvet Card Earring Cases',
      createdAt: '2026-10-20T10:15:00Z',
    },
  ];

  const totalExpensesCents = expenses.reduce((sum, e) => sum + e.amountCents, BigInt(0));

  const lineInputs = [
    { variationId: 'var-004-1', quantity: 12, supplierUnitPriceCents: decimalLkrToCents(650) },
  ];

  const allocations = allocateBatchExpensesExact(totalExpensesCents, lineInputs);
  const allocMap = new Map(allocations.map(a => [a.variationId, a]));

  const itemId = 'item-004-1';
  const variations: PurchaseBatchItemVariation[] = [
    {
      id: 'var-004-1',
      batchId,
      batchItemId: itemId,
      variationTitle: 'Gold Finish',
      attributes: { Color: 'Gold', Type: 'Crystal Huggie' },
      supplierSku: 'HUG-EAR-GLD',
      quantityPurchased: 12,
      quantityReceived: 0,
      quantityLinked: 0,
      quantityRemaining: 12,
      supplierUnitPriceCents: decimalLkrToCents(650),
      lineSupplierCostCents: allocMap.get('var-004-1')!.lineSupplierCostCents,
      lineAllocatedExpenseCents: allocMap.get('var-004-1')!.lineAllocatedExpenseCents,
      lineTotalLandedCostCents: allocMap.get('var-004-1')!.lineTotalLandedCostCents,
      unitLandedCostCents: allocMap.get('var-004-1')!.unitLandedCostCents,
      createdAt: '2026-10-20T10:15:00Z',
    },
  ];

  const totalSupplierCostCents = variations.reduce((sum, v) => sum + v.lineSupplierCostCents, BigInt(0));
  const totalLandedCostCents = totalSupplierCostCents + totalExpensesCents;

  const item: PurchaseBatchItem & { variations: PurchaseBatchItemVariation[] } = {
    id: itemId,
    batchId,
    itemName: 'Crystal Drop Huggie Earrings',
    itemCategoryHint: 'Earrings',
    totalQuantity: 12,
    totalSupplierCostCents,
    totalAllocatedExpenseCents: totalExpensesCents,
    totalLandedCostCents,
    createdAt: '2026-10-20T10:15:00Z',
    variations,
  };

  const batch: PurchaseBatch = {
    id: batchId,
    batchNumber: 'PB-2026-004',
    supplierName: 'Kandy Fashion Studio',
    supplierContact: '+94 71 999 8877',
    invoiceNumber: 'INV-KFS-330',
    purchaseDate: '2026-10-20',
    status: 'draft',
    totalSupplierCostCents,
    totalExpensesCents,
    totalLandedCostCents,
    totalPurchasedUnits: 12,
    totalReceivedUnits: 0,
    notes: 'Draft order pending final plating sample approval.',
    createdBy: '00000000-0000-0000-0000-000000000000',
    createdAt: '2026-10-20T10:15:00Z',
    updatedAt: '2026-10-20T10:15:00Z',
    receivedAt: null,
  };

  return { batch, expenses, items: [item], receipts: [] };
}

function createMockBatch5(): BatchDetailViewData {
  const batchId = '00000000-0000-0000-0000-000000000005';
  const expenses: PurchaseBatchExpense[] = [];
  const totalExpensesCents = BigInt(0);

  const lineInputs = [
    { variationId: 'var-005-1', quantity: 10, supplierUnitPriceCents: decimalLkrToCents(250) },
    { variationId: 'var-005-2', quantity: 10, supplierUnitPriceCents: decimalLkrToCents(280) },
  ];

  const allocations = allocateBatchExpensesExact(totalExpensesCents, lineInputs);
  const allocMap = new Map(allocations.map(a => [a.variationId, a]));

  const itemId = 'item-005-1';
  const variations: PurchaseBatchItemVariation[] = [
    {
      id: 'var-005-1',
      batchId,
      batchItemId: itemId,
      variationTitle: 'Rose Gold Finish',
      attributes: { Color: 'Rose Gold', Pieces: 'Necklace + Earrings' },
      supplierSku: 'SET-FLR-RG',
      quantityPurchased: 10,
      quantityReceived: 0,
      quantityLinked: 0,
      quantityRemaining: 10,
      supplierUnitPriceCents: decimalLkrToCents(250),
      lineSupplierCostCents: allocMap.get('var-005-1')!.lineSupplierCostCents,
      lineAllocatedExpenseCents: allocMap.get('var-005-1')!.lineAllocatedExpenseCents,
      lineTotalLandedCostCents: allocMap.get('var-005-1')!.lineTotalLandedCostCents,
      unitLandedCostCents: allocMap.get('var-005-1')!.unitLandedCostCents,
      createdAt: '2026-10-05T09:00:00Z',
    },
    {
      id: 'var-005-2',
      batchId,
      batchItemId: itemId,
      variationTitle: 'Yellow Gold Finish',
      attributes: { Color: 'Yellow Gold', Pieces: 'Necklace + Earrings' },
      supplierSku: 'SET-FLR-YG',
      quantityPurchased: 10,
      quantityReceived: 0,
      quantityLinked: 0,
      quantityRemaining: 10,
      supplierUnitPriceCents: decimalLkrToCents(280),
      lineSupplierCostCents: allocMap.get('var-005-2')!.lineSupplierCostCents,
      lineAllocatedExpenseCents: allocMap.get('var-005-2')!.lineAllocatedExpenseCents,
      lineTotalLandedCostCents: allocMap.get('var-005-2')!.lineTotalLandedCostCents,
      unitLandedCostCents: allocMap.get('var-005-2')!.unitLandedCostCents,
      createdAt: '2026-10-05T09:00:00Z',
    },
  ];

  const totalSupplierCostCents = variations.reduce((sum, v) => sum + v.lineSupplierCostCents, BigInt(0));
  const totalLandedCostCents = totalSupplierCostCents;

  const item: PurchaseBatchItem & { variations: PurchaseBatchItemVariation[] } = {
    id: itemId,
    batchId,
    itemName: 'Bridal Floral Jewelry Set (Necklace & Earrings)',
    itemCategoryHint: 'Jewelry Sets',
    totalQuantity: 20,
    totalSupplierCostCents,
    totalAllocatedExpenseCents: BigInt(0),
    totalLandedCostCents,
    createdAt: '2026-10-05T09:00:00Z',
    variations,
  };

  const batch: PurchaseBatch = {
    id: batchId,
    batchNumber: 'PB-2026-005',
    supplierName: 'Southern Craft Guild',
    supplierContact: '+94 91 333 4455',
    invoiceNumber: 'INV-SCG-08',
    purchaseDate: '2026-10-05',
    status: 'cancelled',
    totalSupplierCostCents,
    totalExpensesCents,
    totalLandedCostCents,
    totalPurchasedUnits: 20,
    totalReceivedUnits: 0,
    notes: 'Order initiated for festive season bridal jewelry collection.',
    cancellationReason: 'Supplier discontinued filigree mold; order voided by mutual agreement.',
    createdBy: '00000000-0000-0000-0000-000000000000',
    createdAt: '2026-10-05T09:00:00Z',
    updatedAt: '2026-10-06T11:00:00Z',
    receivedAt: null,
  };

  return { batch, expenses, items: [item], receipts: [] };
}

export const MOCK_BATCH_DETAILS: Record<string, BatchDetailViewData> = {
  '00000000-0000-0000-0000-000000000001': createMockBatch1(),
  '00000000-0000-0000-0000-000000000002': createMockBatch2(),
  '00000000-0000-0000-0000-000000000003': createMockBatch3(),
  '00000000-0000-0000-0000-000000000004': createMockBatch4(),
  '00000000-0000-0000-0000-000000000005': createMockBatch5(),
  // Also index by batchNumber for easy lookup
  'PB-2026-001': createMockBatch1(),
  'PB-2026-002': createMockBatch2(),
  'PB-2026-003': createMockBatch3(),
  'PB-2026-004': createMockBatch4(),
  'PB-2026-005': createMockBatch5(),
};

export const MOCK_PURCHASE_BATCHES: PurchaseBatch[] = [
  MOCK_BATCH_DETAILS['PB-2026-001'].batch,
  MOCK_BATCH_DETAILS['PB-2026-002'].batch,
  MOCK_BATCH_DETAILS['PB-2026-003'].batch,
  MOCK_BATCH_DETAILS['PB-2026-004'].batch,
  MOCK_BATCH_DETAILS['PB-2026-005'].batch,
];

export function toPurchaseBatchDTO(batch: PurchaseBatch): PurchaseBatchDTO {
  return {
    ...batch,
    totalSupplierCostCents: Number(batch.totalSupplierCostCents),
    totalExpensesCents: Number(batch.totalExpensesCents),
    totalLandedCostCents: Number(batch.totalLandedCostCents),
  };
}

export function toPurchaseBatchExpenseDTO(expense: PurchaseBatchExpense): PurchaseBatchExpenseDTO {
  return {
    ...expense,
    amountCents: Number(expense.amountCents),
  };
}

export function toPurchaseBatchItemVariationDTO(variation: PurchaseBatchItemVariation): PurchaseBatchItemVariationDTO {
  return {
    ...variation,
    supplierUnitPriceCents: Number(variation.supplierUnitPriceCents),
    lineSupplierCostCents: Number(variation.lineSupplierCostCents),
    lineAllocatedExpenseCents: Number(variation.lineAllocatedExpenseCents),
    lineTotalLandedCostCents: Number(variation.lineTotalLandedCostCents),
    unitLandedCostCents: Number(variation.unitLandedCostCents),
  };
}

export function toBatchDetailViewDataDTO(data: BatchDetailViewData): BatchDetailViewDataDTO {
  return {
    batch: toPurchaseBatchDTO(data.batch),
    expenses: data.expenses.map(toPurchaseBatchExpenseDTO),
    items: data.items.map(item => ({
      ...item,
      totalSupplierCostCents: Number(item.totalSupplierCostCents),
      totalAllocatedExpenseCents: Number(item.totalAllocatedExpenseCents),
      totalLandedCostCents: Number(item.totalLandedCostCents),
      variations: item.variations.map(toPurchaseBatchItemVariationDTO),
    })),
    receipts: data.receipts.map(rcpt => ({
      ...rcpt,
    })),
  };
}

export const MOCK_PURCHASE_BATCH_DTOS: PurchaseBatchDTO[] = MOCK_PURCHASE_BATCHES.map(toPurchaseBatchDTO);

/**
 * Extracts all received purchase variations with unlinked physical stock (> 0)
 * suitable for product creation autofill and inventory restocking.
 */
export function getMockEligiblePurchaseVariations(): EligiblePurchaseVariation[] {
  const eligible: EligiblePurchaseVariation[] = [];

  const batches = [
    MOCK_BATCH_DETAILS['PB-2026-001'],
    MOCK_BATCH_DETAILS['PB-2026-002'],
    MOCK_BATCH_DETAILS['PB-2026-003'],
  ];

  for (const b of batches) {
    for (const item of b.items) {
      for (const v of item.variations) {
        const available = v.quantityReceived - v.quantityLinked;
        if (available > 0) {
          eligible.push({
            batchId: b.batch.id,
            batchNumber: b.batch.batchNumber,
            supplierName: b.batch.supplierName,
            invoiceNumber: b.batch.invoiceNumber || null,
            purchaseDate: b.batch.purchaseDate,
            batchItemId: item.id,
            itemName: item.itemName,
            itemCategoryHint: item.itemCategoryHint || null,
            batchVariationId: v.id,
            variationTitle: v.variationTitle,
            attributes: v.attributes || {},
            supplierSku: v.supplierSku || null,
            quantityReceived: v.quantityReceived,
            quantityLinked: v.quantityLinked,
            availableQuantity: available,
            unitLandedCostCents: Number(v.unitLandedCostCents),
            unitLandedCostLkr: centsToDecimalLkr(v.unitLandedCostCents),
            supplierUnitPriceLkr: centsToDecimalLkr(v.supplierUnitPriceCents),
          });
        }
      }
    }
  }

  return eligible;
}
