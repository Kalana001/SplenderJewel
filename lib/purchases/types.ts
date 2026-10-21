export type PurchaseBatchStatus = 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';

export type PurchaseExpenseType = 'shipping' | 'transport' | 'customs_taxes' | 'packing' | 'other';

export type ReceivingCorrectionReason = 
  | 'damaged_on_arrival' 
  | 'short_shipped' 
  | 'vendor_overage' 
  | 'inspection_failure';

export type StockTransferType = 'new_product' | 'restock_existing';

export interface PurchaseBatch {
  id: string;
  batchNumber: string;
  supplierName: string;
  supplierContact?: string | null;
  invoiceNumber?: string | null;
  purchaseDate: string;
  status: PurchaseBatchStatus;
  totalSupplierCostCents: bigint;
  totalExpensesCents: bigint;
  totalLandedCostCents: bigint;
  totalPurchasedUnits: number;
  totalReceivedUnits: number;
  notes?: string | null;
  cancellationReason?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  receivedAt?: string | null;
}

export interface PurchaseBatchExpense {
  id: string;
  batchId: string;
  expenseType: PurchaseExpenseType;
  amountCents: bigint;
  description?: string | null;
  createdAt: string;
}

export interface PurchaseBatchItem {
  id: string;
  batchId: string;
  itemName: string;
  itemCategoryHint?: string | null;
  totalQuantity: number;
  totalSupplierCostCents: bigint;
  totalAllocatedExpenseCents: bigint;
  totalLandedCostCents: bigint;
  createdAt: string;
}

export interface PurchaseBatchItemVariation {
  id: string;
  batchId: string;
  batchItemId: string;
  variationTitle: string;
  attributes: Record<string, string>;
  supplierSku?: string | null;
  quantityPurchased: number;
  quantityReceived: number;
  quantityLinked: number;
  quantityRemaining: number;
  supplierUnitPriceCents: bigint;
  lineSupplierCostCents: bigint;
  lineAllocatedExpenseCents: bigint;
  lineTotalLandedCostCents: bigint;
  unitLandedCostCents: bigint;
  createdAt: string;
}

export interface PurchaseBatchReceiptEvent {
  id: string;
  batchId: string;
  batchVariationId: string;
  quantityReceived: number;
  receiptNotes?: string | null;
  receivedBy: string;
  createdAt: string;
}

export interface PurchaseReceivingCorrection {
  id: string;
  batchId: string;
  batchVariationId: string;
  quantityAdjustment: number;
  reason: ReceivingCorrectionReason;
  notes: string;
  correctedBy: string;
  createdAt: string;
}

export interface PurchaseReceiptTransfer {
  id: string;
  transferBatchId: string;
  batchVariationId: string;
  targetVariantId: string;
  quantityTransferred: number;
  transferredUnitCostCents: bigint;
  transferType: StockTransferType;
  inventoryMovementId: string;
  idempotencyKey: string;
  createdBy: string;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT-SAFE DTO TYPES (For Next.js React Component / Server Action boundaries)
// Native BigInt cannot be serialized into JSON directly across Server Actions.
// ─────────────────────────────────────────────────────────────────────────────

export interface PurchaseBatchDTO {
  id: string;
  batchNumber: string;
  supplierName: string;
  supplierContact?: string | null;
  invoiceNumber?: string | null;
  purchaseDate: string;
  status: PurchaseBatchStatus;
  totalSupplierCostCents: number;
  totalExpensesCents: number;
  totalLandedCostCents: number;
  totalPurchasedUnits: number;
  totalReceivedUnits: number;
  notes?: string | null;
  cancellationReason?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  receivedAt?: string | null;
}

export interface PurchaseBatchExpenseDTO {
  id: string;
  batchId: string;
  expenseType: PurchaseExpenseType;
  amountCents: number;
  description?: string | null;
  createdAt: string;
}

export interface PurchaseBatchItemVariationDTO {
  id: string;
  batchId: string;
  batchItemId: string;
  variationTitle: string;
  attributes: Record<string, string>;
  supplierSku?: string | null;
  quantityPurchased: number;
  quantityReceived: number;
  quantityLinked: number;
  quantityRemaining: number;
  supplierUnitPriceCents: number;
  lineSupplierCostCents: number;
  lineAllocatedExpenseCents: number;
  lineTotalLandedCostCents: number;
  unitLandedCostCents: number;
  createdAt: string;
}

export interface PurchaseBatchItemDTO {
  id: string;
  batchId: string;
  itemName: string;
  itemCategoryHint?: string | null;
  totalQuantity: number;
  totalSupplierCostCents: number;
  totalAllocatedExpenseCents: number;
  totalLandedCostCents: number;
  createdAt: string;
  variations: PurchaseBatchItemVariationDTO[];
}

export interface PurchaseBatchReceiptEventDTO {
  id: string;
  batchId: string;
  batchVariationId: string;
  quantityReceived: number;
  receiptNotes?: string | null;
  receivedBy: string;
  createdAt: string;
}

export interface BatchDetailViewDataDTO {
  batch: PurchaseBatchDTO;
  expenses: PurchaseBatchExpenseDTO[];
  items: PurchaseBatchItemDTO[];
  receipts: PurchaseBatchReceiptEventDTO[];
}

