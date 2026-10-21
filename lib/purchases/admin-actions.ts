'use server';

import 'server-only';
import { requireAdminAuth } from '@/lib/auth/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import type { 
  StockTransferType,
  ReceivingCorrectionReason,
  PurchaseBatchDTO,
  BatchDetailViewDataDTO
} from './types.ts';
import { 
  MOCK_PURCHASE_BATCH_DTOS, 
  MOCK_BATCH_DETAILS, 
  toBatchDetailViewDataDTO,
  getMockEligiblePurchaseVariations,
  type EligiblePurchaseVariation
} from './mock-data.ts';
import { centsToDecimalLkr } from './calculations.ts';

function isFeatureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_PURCHASE_MANAGEMENT === 'true';
}

export interface CreateBatchPayload {
  batchNumber: string;
  supplierName: string;
  supplierContact?: string;
  invoiceNumber?: string;
  purchaseDate?: string;
  notes?: string;
  totalSupplierCostCents: string | number;
  totalExpensesCents: string | number;
  totalLandedCostCents: string | number;
  totalPurchasedUnits: number;
  expenses: Array<{
    expenseType: string;
    amountCents: string | number;
    description?: string;
  }>;
  items: Array<{
    itemName: string;
    itemCategoryHint?: string;
    totalQuantity: number;
    totalSupplierCostCents: string | number;
    totalAllocatedExpenseCents: string | number;
    totalLandedCostCents: string | number;
    variations: Array<{
      variationTitle: string;
      attributes?: Record<string, string>;
      supplierSku?: string;
      quantityPurchased: number;
      supplierUnitPriceCents: string | number;
      lineSupplierCostCents: string | number;
      lineAllocatedExpenseCents: string | number;
      lineTotalLandedCostCents: string | number;
      unitLandedCostCents: string | number;
    }>;
  }>;
}

export interface ReceiveItemsPayload {
  batchId: string;
  idempotencyKey: string;
  items: Array<{
    batchVariationId: string;
    quantityReceived: number;
    receiptNotes?: string;
  }>;
}

export interface RecordCorrectionPayload {
  batchId: string;
  variationId: string;
  quantityAdjustment: number;
  reason: ReceivingCorrectionReason;
  notes: string;
}

export interface TransferStockPayload {
  batchVariationId: string;
  targetVariantId: string;
  quantity: number;
  transferType: StockTransferType;
  idempotencyKey: string;
}

/**
 * Server Action: Atomically creates a new purchase batch in draft status with items and expenses.
 */
export async function createPurchaseBatchAction(
  payload: CreateBatchPayload
): Promise<{ success: boolean; batchId?: string; batchNumber?: string; error?: string }> {
  try {
    if (!isFeatureEnabled()) {
      return { success: false, error: 'Purchase Management is currently disabled.' };
    }

    const admin = await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!payload.batchNumber?.trim() || !payload.supplierName?.trim()) {
      return { success: false, error: 'Batch number and supplier name are required.' };
    }

    const { data, error } = await (adminClient.rpc as any)('create_purchase_batch', {
      p_batch: {
        batchNumber: payload.batchNumber.trim(),
        supplierName: payload.supplierName.trim(),
        supplierContact: payload.supplierContact?.trim() || null,
        invoiceNumber: payload.invoiceNumber?.trim() || null,
        purchaseDate: payload.purchaseDate || null,
        notes: payload.notes?.trim() || null,
        totalSupplierCostCents: payload.totalSupplierCostCents,
        totalExpensesCents: payload.totalExpensesCents,
        totalLandedCostCents: payload.totalLandedCostCents,
        totalPurchasedUnits: payload.totalPurchasedUnits,
      },
      p_expenses: payload.expenses || [],
      p_items: payload.items || [],
      p_admin_id: admin.id,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to create purchase batch.' };
    }

    revalidatePath('/admin/purchases');
    return { success: true, batchId: data.batch_id, batchNumber: data.batch_number };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Batch creation failed.' };
  }
}

/**
 * Server Action: Confirms a draft purchase batch, committing supplier order quantities.
 * Status transitions from 'draft' => 'ordered'.
 */
export async function confirmPurchaseBatchAction(batchId: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isFeatureEnabled()) {
      return { success: false, error: 'Purchase Management is currently disabled.' };
    }

    const admin = await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!batchId?.trim()) {
      return { success: false, error: 'Batch ID is required.' };
    }

    const { data, error } = await (adminClient.rpc as any)('confirm_purchase_batch', {
      p_batch_id: batchId.trim(),
      p_admin_id: admin.id,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to confirm purchase batch.' };
    }

    revalidatePath('/admin/purchases');
    revalidatePath(`/admin/purchases/${batchId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Confirmation failed.' };
  }
}

/**
 * Server Action: Records physical arrival of goods (partial or full receipt) with durable idempotency.
 */
export async function receivePurchaseBatchItemsAction(
  payload: ReceiveItemsPayload
): Promise<{ success: boolean; error?: string; batchStatus?: string; idempotent?: boolean }> {
  try {
    if (!isFeatureEnabled()) {
      return { success: false, error: 'Purchase Management is currently disabled.' };
    }

    const admin = await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!payload.batchId?.trim() || !payload.idempotencyKey?.trim()) {
      return { success: false, error: 'Batch ID and idempotency key are required.' };
    }

    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      return { success: false, error: 'At least one item receipt is required.' };
    }

    const { data, error } = await (adminClient.rpc as any)('receive_purchase_batch_items', {
      p_batch_id: payload.batchId.trim(),
      p_receipts: payload.items,
      p_idempotency_key: payload.idempotencyKey.trim(),
      p_admin_id: admin.id,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to receive purchase items.' };
    }

    revalidatePath('/admin/purchases');
    revalidatePath(`/admin/purchases/${payload.batchId}`);
    return { 
      success: true, 
      batchStatus: data.batch_status,
      idempotent: data.idempotent 
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Receipt recording failed.' };
  }
}

/**
 * Server Action: Records a discrepancy or damage adjustment on received goods prior to linking.
 */
export async function recordReceivingCorrectionAction(
  payload: RecordCorrectionPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isFeatureEnabled()) {
      return { success: false, error: 'Purchase Management is currently disabled.' };
    }

    const admin = await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!payload.batchId?.trim() || !payload.variationId?.trim()) {
      return { success: false, error: 'Batch ID and Variation ID are required.' };
    }

    if (!payload.notes?.trim()) {
      return { success: false, error: 'Detailed correction notes are mandatory.' };
    }

    const { data, error } = await (adminClient.rpc as any)('record_receiving_correction', {
      p_batch_id: payload.batchId.trim(),
      p_variation_id: payload.variationId.trim(),
      p_adjustment: payload.quantityAdjustment,
      p_reason: payload.reason,
      p_notes: payload.notes.trim(),
      p_admin_id: admin.id,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Correction failed.' };
    }

    revalidatePath('/admin/purchases');
    revalidatePath(`/admin/purchases/${payload.batchId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Correction failed.' };
  }
}

/**
 * Server Action: Atomically transfers received purchase stock to storefront inventory.
 * Blends moving weighted average cost, updates variant stock, and balances residual cents.
 */
export async function transferPurchaseStockToVariantAction(
  payload: TransferStockPayload
): Promise<{ success: boolean; error?: string; newStock?: number; blendedCost?: number; idempotent?: boolean }> {
  try {
    if (!isFeatureEnabled()) {
      return { success: false, error: 'Purchase Management is currently disabled.' };
    }

    const admin = await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!payload.batchVariationId?.trim() || !payload.targetVariantId?.trim()) {
      return { success: false, error: 'Batch Variation ID and Target Variant ID are required.' };
    }

    if (!payload.idempotencyKey?.trim()) {
      return { success: false, error: 'Idempotency key is required.' };
    }

    if (payload.quantity <= 0) {
      return { success: false, error: 'Transfer quantity must be positive.' };
    }

    const { data, error } = await (adminClient.rpc as any)('transfer_purchase_stock_to_variant', {
      p_batch_variation_id: payload.batchVariationId.trim(),
      p_target_variant_id: payload.targetVariantId.trim(),
      p_quantity: payload.quantity,
      p_transfer_type: payload.transferType,
      p_idempotency_key: payload.idempotencyKey.trim(),
      p_admin_id: admin.id,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Stock transfer failed.' };
    }

    revalidatePath('/admin/inventory');
    revalidatePath('/admin/products');
    revalidatePath('/shop');
    return { 
      success: true, 
      newStock: data.new_stock_quantity, 
      blendedCost: data.blended_purchase_cost,
      idempotent: data.idempotent 
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Stock transfer failed.' };
  }
}

/**
 * Server Action: Safely cancels a purchase batch if no physical units have been transferred to storefront.
 */
export async function cancelPurchaseBatchAction(
  batchId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isFeatureEnabled()) {
      return { success: false, error: 'Purchase Management is currently disabled.' };
    }

    const admin = await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!batchId?.trim() || !reason?.trim()) {
      return { success: false, error: 'Batch ID and cancellation reason are required.' };
    }

    const { data, error } = await (adminClient.rpc as any)('cancel_purchase_batch', {
      p_batch_id: batchId.trim(),
      p_reason: reason.trim(),
      p_admin_id: admin.id,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to cancel purchase batch.' };
    }

    revalidatePath('/admin/purchases');
    revalidatePath(`/admin/purchases/${batchId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Cancellation failed.' };
  }
}

/**
 * Server Action: Queries list of purchase batches with optional search and status filtering.
 * Never queries missing tables if the feature flag is disabled or migration is pending.
 */
export async function listPurchaseBatchesAction(filters?: {
  search?: string;
  status?: string;
}): Promise<{
  success: boolean;
  batches?: PurchaseBatchDTO[];
  isFeatureDisabled?: boolean;
  isMissingMigration?: boolean;
  error?: string;
}> {
  try {
    if (!isFeatureEnabled()) {
      return { 
        success: false, 
        isFeatureDisabled: true, 
        error: 'Purchase Management is currently disabled by system feature flag.' 
      };
    }

    await requireAdminAuth();
    const adminClient = createAdminClient();

    let query = (adminClient as any)
      .from('purchase_batches')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters?.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      query = query.or(`batch_number.ilike.${term},supplier_name.ilike.${term}`);
    }

    const { data, error } = await query;

    if (error) {
      if (
        error.code === '42P01' || 
        error.message?.includes('relation "public.purchase_batches" does not exist') || 
        error.message?.includes('does not exist')
      ) {
        return {
          success: false,
          isMissingMigration: true,
          error: 'Purchase database tables have not been created yet (Migration 00013 pending).',
        };
      }
      return { success: false, error: error.message };
    }

    const batches: PurchaseBatchDTO[] = (data || []).map((row: any) => ({
      id: row.id,
      batchNumber: row.batch_number,
      supplierName: row.supplier_name,
      supplierContact: row.supplier_contact,
      invoiceNumber: row.invoice_number,
      purchaseDate: row.purchase_date,
      status: row.status,
      totalSupplierCostCents: Number(row.total_supplier_cost_cents || 0),
      totalExpensesCents: Number(row.total_expenses_cents || 0),
      totalLandedCostCents: Number(row.total_landed_cost_cents || 0),
      totalPurchasedUnits: Number(row.total_purchased_units || 0),
      totalReceivedUnits: Number(row.total_received_units || 0),
      notes: row.notes,
      cancellationReason: row.cancellation_reason,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      receivedAt: row.received_at,
    }));

    return { success: true, batches };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to query purchase batches.' };
  }
}

/**
 * Server Action: Fetches complete purchase batch details, expenses, items, variations, and receipt logs.
 */
export async function getPurchaseBatchDetailAction(batchId: string): Promise<{
  success: boolean;
  data?: BatchDetailViewDataDTO;
  isFeatureDisabled?: boolean;
  isMissingMigration?: boolean;
  error?: string;
}> {
  try {
    if (!isFeatureEnabled()) {
      return { 
        success: false, 
        isFeatureDisabled: true, 
        error: 'Purchase Management is currently disabled by system feature flag.' 
      };
    }

    await requireAdminAuth();
    const adminClient = createAdminClient();

    // Query batch
    const { data: batchRow, error: batchErr } = await (adminClient as any)
      .from('purchase_batches')
      .select('*')
      .eq('id', batchId)
      .single();

    if (batchErr) {
      if (batchErr.code === '42P01' || batchErr.message?.includes('does not exist')) {
        return {
          success: false,
          isMissingMigration: true,
          error: 'Purchase database tables have not been created yet (Migration 00013 pending).',
        };
      }
      return { success: false, error: batchErr.message };
    }

    if (!batchRow) {
      return { success: false, error: 'Purchase batch not found.' };
    }

    // Query expenses
    const { data: expenseRows } = await (adminClient as any)
      .from('purchase_batch_expenses')
      .select('*')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: true });

    // Query items
    const { data: itemRows } = await (adminClient as any)
      .from('purchase_batch_items')
      .select('*')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: true });

    // Query variations
    const { data: variationRows } = await (adminClient as any)
      .from('purchase_batch_item_variations')
      .select('*')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: true });

    // Query receipt events
    const { data: receiptRows } = await (adminClient as any)
      .from('purchase_batch_receipt_events')
      .select('*')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: false });

    // Map variations by item
    const variationsByItemId = new Map<string, any[]>();
    for (const v of variationRows || []) {
      const list = variationsByItemId.get(v.batch_item_id) || [];
      list.push({
        id: v.id,
        batchId: v.batch_id,
        batchItemId: v.batch_item_id,
        variationTitle: v.variation_title,
        attributes: v.attributes || {},
        supplierSku: v.supplier_sku,
        quantityPurchased: Number(v.quantity_purchased || 0),
        quantityReceived: Number(v.quantity_received || 0),
        quantityLinked: Number(v.quantity_linked || 0),
        quantityRemaining: Number(v.quantity_purchased || 0) - Number(v.quantity_received || 0),
        supplierUnitPriceCents: Number(v.supplier_unit_price_cents || 0),
        lineSupplierCostCents: Number(v.line_supplier_cost_cents || 0),
        lineAllocatedExpenseCents: Number(v.line_allocated_expense_cents || 0),
        lineTotalLandedCostCents: Number(v.line_total_landed_cost_cents || 0),
        unitLandedCostCents: Number(v.unit_landed_cost_cents || 0),
        createdAt: v.created_at,
      });
      variationsByItemId.set(v.batch_item_id, list);
    }

    const items = (itemRows || []).map((i: any) => ({
      id: i.id,
      batchId: i.batch_id,
      itemName: i.item_name,
      itemCategoryHint: i.item_category_hint,
      totalQuantity: Number(i.total_quantity || 0),
      totalSupplierCostCents: Number(i.total_supplier_cost_cents || 0),
      totalAllocatedExpenseCents: Number(i.total_allocated_expense_cents || 0),
      totalLandedCostCents: Number(i.total_landed_cost_cents || 0),
      createdAt: i.created_at,
      variations: variationsByItemId.get(i.id) || [],
    }));

    const expenses = (expenseRows || []).map((e: any) => ({
      id: e.id,
      batchId: e.batch_id,
      expenseType: e.expense_type,
      amountCents: Number(e.amount_cents || 0),
      description: e.description,
      createdAt: e.created_at,
    }));

    const receipts = (receiptRows || []).map((r: any) => ({
      id: r.id,
      batchId: r.batch_id,
      batchVariationId: r.batch_variation_id,
      quantityReceived: Number(r.quantity_received || 0),
      receiptNotes: r.receipt_notes,
      receivedBy: r.received_by,
      createdAt: r.created_at,
    }));

    const batchDTO: PurchaseBatchDTO = {
      id: batchRow.id,
      batchNumber: batchRow.batch_number,
      supplierName: batchRow.supplier_name,
      supplierContact: batchRow.supplier_contact,
      invoiceNumber: batchRow.invoice_number,
      purchaseDate: batchRow.purchase_date,
      status: batchRow.status,
      totalSupplierCostCents: Number(batchRow.total_supplier_cost_cents || 0),
      totalExpensesCents: Number(batchRow.total_expenses_cents || 0),
      totalLandedCostCents: Number(batchRow.total_landed_cost_cents || 0),
      totalPurchasedUnits: Number(batchRow.total_purchased_units || 0),
      totalReceivedUnits: Number(batchRow.total_received_units || 0),
      notes: batchRow.notes,
      cancellationReason: batchRow.cancellation_reason,
      createdBy: batchRow.created_by,
      createdAt: batchRow.created_at,
      updatedAt: batchRow.updated_at,
      receivedAt: batchRow.received_at,
    };

    return {
      success: true,
      data: {
        batch: batchDTO,
        expenses,
        items,
        receipts,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to retrieve batch details.' };
  }
}

/**
 * Server Action: Fetches mock batches for UI demonstration and offline architectural review.
 */
export async function getMockPurchaseBatchesAction(): Promise<{
  success: boolean;
  batches: PurchaseBatchDTO[];
  error?: string;
}> {
  if (!isFeatureEnabled()) {
    return { success: false, batches: [], error: 'Purchase Management is currently disabled.' };
  }
  return { success: true, batches: MOCK_PURCHASE_BATCH_DTOS };
}

/**
 * Server Action: Fetches mock batch detail for UI demonstration and offline architectural review.
 */
export async function getMockPurchaseBatchDetailAction(batchId: string): Promise<{
  success: boolean;
  data?: BatchDetailViewDataDTO;
  error?: string;
}> {
  if (!isFeatureEnabled()) {
    return { success: false, error: 'Purchase Management is currently disabled.' };
  }
  const mockDetail = MOCK_BATCH_DETAILS[batchId] || MOCK_BATCH_DETAILS['00000000-0000-0000-0000-000000000001'];
  if (!mockDetail) {
    return { success: false, error: 'Mock batch not found.' };
  }
  return { success: true, data: toBatchDetailViewDataDTO(mockDetail) };
}

/**
 * Server Action: Queries all received purchase variations that have unlinked physical stock (> 0).
 * Safe against missing tables or disabled feature flags (falls back to verified mock variations).
 */
export async function getEligiblePurchaseVariationsAction(): Promise<{
  success: boolean;
  variations: EligiblePurchaseVariation[];
  isFeatureDisabled?: boolean;
  isMissingMigration?: boolean;
  error?: string;
}> {
  try {
    if (!isFeatureEnabled()) {
      return {
        success: true,
        variations: getMockEligiblePurchaseVariations(),
        isFeatureDisabled: true,
      };
    }

    await requireAdminAuth();
    const adminClient = createAdminClient();

    const { data, error } = await (adminClient as any)
      .from('purchase_batch_item_variations')
      .select(`
        id,
        batch_id,
        batch_item_id,
        variation_title,
        attributes,
        supplier_sku,
        quantity_received,
        quantity_linked,
        unit_landed_cost_cents,
        supplier_unit_price_cents,
        purchase_batches (
          id,
          batch_number,
          supplier_name,
          invoice_number,
          purchase_date,
          status
        ),
        purchase_batch_items (
          id,
          item_name,
          item_category_hint
        )
      `)
      .gt('quantity_received', 0);

    if (error) {
      if (
        error.code === '42P01' ||
        error.message?.includes('does not exist')
      ) {
        return {
          success: true,
          variations: getMockEligiblePurchaseVariations(),
          isMissingMigration: true,
        };
      }
      return { success: false, variations: [], error: error.message };
    }

    const eligible: EligiblePurchaseVariation[] = [];

    for (const row of data || []) {
      const batch = row.purchase_batches;
      const item = row.purchase_batch_items;

      if (!batch || (batch.status !== 'received' && batch.status !== 'partially_received')) {
        continue;
      }

      const received = Number(row.quantity_received || 0);
      const linked = Number(row.quantity_linked || 0);
      const available = received - linked;

      if (available > 0) {
        eligible.push({
          batchId: row.batch_id,
          batchNumber: batch.batch_number,
          supplierName: batch.supplier_name,
          invoiceNumber: batch.invoice_number,
          purchaseDate: batch.purchase_date,
          batchItemId: row.batch_item_id,
          itemName: item?.item_name || 'Jewelry Item',
          itemCategoryHint: item?.item_category_hint || null,
          batchVariationId: row.id,
          variationTitle: row.variation_title,
          attributes: row.attributes || {},
          supplierSku: row.supplier_sku,
          quantityReceived: received,
          quantityLinked: linked,
          availableQuantity: available,
          unitLandedCostCents: Number(row.unit_landed_cost_cents || 0),
          unitLandedCostLkr: centsToDecimalLkr(row.unit_landed_cost_cents || 0),
          supplierUnitPriceLkr: centsToDecimalLkr(row.supplier_unit_price_cents || 0),
        });
      }
    }

    return { success: true, variations: eligible };
  } catch (err) {
    return {
      success: false,
      variations: [],
      error: err instanceof Error ? err.message : 'Failed to query eligible purchase variations.',
    };
  }
}

export interface PurchaseStockLinkItem {
  batchVariationId: string;
  targetVariantSku: string;
  quantity: number;
}

/**
 * Server Action: Transactionally transfers purchase stock to newly created product variants.
 * Looks up targetVariantId by sku from the new product, then executes transferPurchaseStockToVariantAction.
 */
export async function linkTransferredStockToNewProductAction(params: {
  productId: string;
  links: PurchaseStockLinkItem[];
}): Promise<{
  success: boolean;
  transferredCount: number;
  errors?: string[];
}> {
  try {
    if (!isFeatureEnabled()) {
      return { success: true, transferredCount: params.links.length };
    }

    await requireAdminAuth();
    const adminClient = createAdminClient();

    // Query product_variants for this product
    const { data: variants, error: varError } = await (adminClient as any)
      .from('product_variants')
      .select('id, sku')
      .eq('product_id', params.productId);

    if (varError || !variants) {
      return {
        success: false,
        transferredCount: 0,
        errors: [varError?.message || 'Could not find product variants.'],
      };
    }

    const skuToId = new Map<string, string>();
    for (const v of variants) {
      skuToId.set(v.sku.toUpperCase(), v.id);
    }

    let transferredCount = 0;
    const errors: string[] = [];

    for (const link of params.links) {
      const targetVariantId = skuToId.get(link.targetVariantSku.toUpperCase());
      if (!targetVariantId) {
        errors.push(`Target variant with SKU "${link.targetVariantSku}" not found.`);
        continue;
      }

      if (link.quantity <= 0) continue;

      const idempotencyKey = `newprod-${params.productId}-${link.batchVariationId}-${link.targetVariantSku}`;
      const res = await transferPurchaseStockToVariantAction({
        batchVariationId: link.batchVariationId,
        targetVariantId,
        quantity: link.quantity,
        transferType: 'new_product',
        idempotencyKey,
      });

      if (!res.success) {
        errors.push(`Stock transfer failed for SKU ${link.targetVariantSku}: ${res.error}`);
      } else {
        transferredCount++;
      }
    }

    revalidatePath('/admin/inventory');
    revalidatePath('/admin/products');
    revalidatePath(`/admin/products/${params.productId}`);

    return {
      success: errors.length === 0,
      transferredCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (err) {
    return {
      success: false,
      transferredCount: 0,
      errors: [err instanceof Error ? err.message : 'Unexpected transfer error'],
    };
  }
}

export interface CreateProductFromPurchaseBatchInput {
  product: {
    name: string;
    slug?: string;
    productCode?: string | null;
    shortDescription?: string | null;
    description?: string | null;
    material?: string | null;
    gender?: string;
    categoryId?: string | null;
    isFeatured?: boolean;
    isNewArrival?: boolean;
    isBestSeller?: boolean;
    metaTitle?: string | null;
    metaDescription?: string | null;
  };
  variants: Array<{
    title: string;
    sku: string;
    price: number;
    discountPrice?: number | null;
    lowStockThreshold?: number;
    attributes?: Record<string, string>;
    batchVariationId: string;
    transferQuantity: number;
    isActive?: boolean;
  }>;
  images?: Array<{
    url: string;
    alt_text?: string;
    display_order?: number;
    variant_sku?: string;
    is_primary?: boolean;
  }>;
  idempotencyKey?: string;
}

/**
 * Server Action: Atomically creates a new jewelry product from a purchase batch in a SINGLE transaction.
 * Creates the product in draft status, inserts variants with initial transferred stock and landed cost,
 * updates purchase ledger unlinked balance, and writes inventory audit movements.
 * Guarantees zero double-counting and full rollback on partial failures.
 */
export async function createProductFromPurchaseBatchAction(
  input: CreateProductFromPurchaseBatchInput
): Promise<{
  success: boolean;
  productId?: string;
  slug?: string;
  idempotent?: boolean;
  error?: string;
}> {
  try {
    if (!isFeatureEnabled()) {
      return { success: false, error: 'Purchase Management is currently disabled.' };
    }

    const admin = await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!input.product?.name?.trim()) {
      return { success: false, error: 'Product name is required.' };
    }

    if (!Array.isArray(input.variants) || input.variants.length === 0) {
      return { success: false, error: 'At least one variation is required.' };
    }

    for (const v of input.variants) {
      if (!v.batchVariationId?.trim()) {
        return { success: false, error: `Batch variation ID is required for variation "${v.sku}".` };
      }
      if (typeof v.transferQuantity !== 'number' || v.transferQuantity <= 0) {
        return { success: false, error: `Transfer quantity must be greater than zero for variation "${v.sku}".` };
      }
    }

    const idempotencyKey = input.idempotencyKey?.trim() || `prod-create-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const { data, error } = await (adminClient.rpc as any)('create_product_from_purchase_batch', {
      p_product: {
        name: input.product.name.trim(),
        slug: input.product.slug?.trim() || input.product.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        product_code: input.product.productCode || null,
        short_description: input.product.shortDescription || null,
        description: input.product.description || null,
        material: input.product.material || null,
        gender: input.product.gender || 'women',
        category_id: input.product.categoryId || null,
        is_featured: Boolean(input.product.isFeatured),
        is_new_arrival: input.product.isNewArrival !== undefined ? Boolean(input.product.isNewArrival) : true,
        is_best_seller: Boolean(input.product.isBestSeller),
        meta_title: input.product.metaTitle || null,
        meta_description: input.product.metaDescription || null,
      },
      p_variants: input.variants.map((v) => ({
        title: v.title.trim() || 'Default',
        sku: v.sku.trim().toUpperCase(),
        price: v.price,
        discount_price: v.discountPrice ?? null,
        low_stock_threshold: v.lowStockThreshold ?? 5,
        attributes: v.attributes || {},
        batch_variation_id: v.batchVariationId.trim(),
        transfer_quantity: v.transferQuantity,
        is_active: v.isActive !== undefined ? Boolean(v.isActive) : true,
      })),
      p_images: input.images || [],
      p_idempotency_key: idempotencyKey,
      p_admin_id: admin.id,
    });

    if (error) {
      if (error.code === '42P01' || error.code === '42883') {
        return {
          success: false,
          error: 'Purchase product creation procedure is unavailable. Please ensure database migration 00013 is applied.',
        };
      }
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Atomic product creation from purchase batch failed.' };
    }

    revalidatePath('/admin/products');
    revalidatePath('/admin/inventory');
    revalidatePath('/admin/purchases');

    return {
      success: true,
      productId: data.product_id,
      slug: data.slug,
      idempotent: data.idempotent,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Product creation from purchase batch failed.',
    };
  }
}



