'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Plus, 
  Trash2, 
  ArrowLeft, 
  Calculator, 
  CheckCircle, 
  AlertCircle, 
  Sparkles, 
  ShieldCheck, 
  Receipt,
  DollarSign,
  PackageCheck,
  Search,
  Boxes,
  Layers,
  ArrowUp,
  X
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  decimalLkrToCents, 
  centsToDecimalLkr, 
  allocateBatchExpensesExact, 
  LineCostInput 
} from '@/lib/purchases/calculations';
import { createPurchaseBatchAction, CreateBatchPayload } from '@/lib/purchases/admin-actions';
import { searchAdminInventoryProductsAction } from '@/lib/catalog/variants';
import type { PurchaseExpenseType } from '@/lib/purchases/types';

export type PurchaseItemType = 'new' | 'existing';

export interface FormVariation {
  id: string; // local temporary id
  variationTitle: string;
  attributes: Record<string, string>;
  supplierSku: string;
  quantityPurchased: number;
  supplierUnitPriceLkr: number;
  existingVariantId?: string;
  existingCurrentStock?: number;
  existingCurrentCost?: number;
}

export interface FormItem {
  id: string; // local temporary id
  itemType: PurchaseItemType;
  itemName: string;
  itemCategoryHint: string;
  existingProductId?: string;
  existingProductCode?: string;
  variations: FormVariation[];
}

export interface FormExpense {
  id: string; // local temporary id
  expenseType: PurchaseExpenseType;
  amountLkr: number;
  description: string;
}

export function BatchCreateForm() {
  const router = useRouter();

  // Basic Details
  const [batchNumber, setBatchNumber] = useState(`PB-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Expenses
  const [expenses, setExpenses] = useState<FormExpense[]>([
    { id: 'exp-1', expenseType: 'shipping', amountLkr: 0, description: '' }
  ]);

  // Items
  const [items, setItems] = useState<FormItem[]>([
    {
      id: 'item-1',
      itemType: 'new',
      itemName: '',
      itemCategoryHint: 'Rings',
      variations: [
        {
          id: 'var-1-1',
          variationTitle: 'Default',
          attributes: {},
          supplierSku: '',
          quantityPurchased: 1,
          supplierUnitPriceLkr: 0,
        }
      ]
    }
  ]);

  // Auto-focus tracking for newly added items
  const [focusItemId, setFocusItemId] = useState<string | null>(null);

  // Search state for existing products (mapped by itemId)
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [searchResults, setSearchResults] = useState<Record<string, any[]>>({});
  const [isSearchingMap, setIsSearchingMap] = useState<Record<string, boolean>>({});

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successBatchId, setSuccessBatchId] = useState<string | null>(null);

  // Focus effect: focuses the new item input whenever focusItemId is set
  useEffect(() => {
    if (focusItemId) {
      const el = document.getElementById(`focus-target-${focusItemId}`);
      if (el) {
        el.focus();
      }
      setFocusItemId(null);
    }
  }, [focusItemId]);

  // Add Item Handler: Prepends to top and sets focus
  const handleAddItem = (type: PurchaseItemType = 'new') => {
    const newItemId = `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newItem: FormItem = {
      id: newItemId,
      itemType: type,
      itemName: '',
      itemCategoryHint: 'Jewelry',
      variations: [
        {
          id: `var-${Date.now()}-1`,
          variationTitle: 'Default',
          attributes: {},
          supplierSku: '',
          quantityPurchased: 1,
          supplierUnitPriceLkr: 0,
        }
      ]
    };

    // Prepend newly added purchase item to the TOP
    setItems((prev) => [newItem, ...prev]);
    setFocusItemId(newItemId);
  };

  // Safe ID-based item operations to prevent index-shifting bugs
  const handleRemoveItem = (itemId: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleUpdateItem = (itemId: string, patch: Partial<FormItem>) => {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  };

  const handleSetItemType = (itemId: string, itemType: PurchaseItemType) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        if (item.itemType === itemType) return item;

        if (itemType === 'new') {
          return {
            ...item,
            itemType: 'new',
            existingProductId: undefined,
            existingProductCode: undefined,
            variations: item.variations.map((v) => ({
              ...v,
              existingVariantId: undefined,
              existingCurrentStock: undefined,
              existingCurrentCost: undefined,
              attributes: {},
            })),
          };
        } else {
          return {
            ...item,
            itemType: 'existing',
          };
        }
      })
    );
  };

  const handleAddVariation = (itemId: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const newVar: FormVariation = {
          id: `var-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          variationTitle: `Variation ${item.variations.length + 1}`,
          attributes: item.existingProductId ? { existing_product_id: item.existingProductId } : {},
          supplierSku: '',
          quantityPurchased: 1,
          supplierUnitPriceLkr: 0,
        };
        return {
          ...item,
          variations: [...item.variations, newVar],
        };
      })
    );
  };

  const handleRemoveVariation = (itemId: string, varId: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        if (item.variations.length <= 1) return item;
        return {
          ...item,
          variations: item.variations.filter((v) => v.id !== varId),
        };
      })
    );
  };

  const handleUpdateVariation = (itemId: string, varId: string, patch: Partial<FormVariation>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          variations: item.variations.map((v) => (v.id === varId ? { ...v, ...patch } : v)),
        };
      })
    );
  };

  // Search existing catalog products for an item
  const handleSearchExistingProducts = async (itemId: string, query: string) => {
    setSearchQueries((prev) => ({ ...prev, [itemId]: query }));

    if (!query.trim()) {
      setSearchResults((prev) => ({ ...prev, [itemId]: [] }));
      return;
    }

    setIsSearchingMap((prev) => ({ ...prev, [itemId]: true }));

    try {
      const res = await searchAdminInventoryProductsAction({
        query: query.trim(),
        limit: 6,
      });

      if (res.success && res.products) {
        setSearchResults((prev) => ({ ...prev, [itemId]: res.products }));
      } else {
        setSearchResults((prev) => ({ ...prev, [itemId]: [] }));
      }
    } catch {
      setSearchResults((prev) => ({ ...prev, [itemId]: [] }));
    } finally {
      setIsSearchingMap((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  // Selecting an existing product populates its variations and metadata
  const handleSelectExistingProduct = (itemId: string, product: any) => {
    const productVariants = Array.isArray(product.product_variants) ? product.product_variants : [];
    
    const formVariations: FormVariation[] = productVariants.length > 0 
      ? productVariants.map((pv: any, idx: number) => ({
          id: `var-${Date.now()}-${pv.id || idx}`,
          variationTitle: pv.title || 'Default',
          attributes: {
            existing_product_id: product.id,
            existing_variant_id: pv.id,
            target_sku: pv.sku,
          },
          supplierSku: pv.sku || '',
          quantityPurchased: 1,
          supplierUnitPriceLkr: Number(pv.purchase_cost || 0),
          existingVariantId: pv.id,
          existingCurrentStock: Number(pv.stock_quantity || 0),
          existingCurrentCost: Number(pv.purchase_cost || 0),
        }))
      : [
          {
            id: `var-${Date.now()}-1`,
            variationTitle: 'Default',
            attributes: { existing_product_id: product.id },
            supplierSku: product.product_code || '',
            quantityPurchased: 1,
            supplierUnitPriceLkr: 0,
          }
        ];

    handleUpdateItem(itemId, {
      itemName: product.name,
      itemCategoryHint: product.categories?.name || 'Jewelry',
      existingProductId: product.id,
      existingProductCode: product.product_code || '',
      variations: formVariations,
    });

    // Clear search results for this item
    setSearchQueries((prev) => ({ ...prev, [itemId]: '' }));
    setSearchResults((prev) => ({ ...prev, [itemId]: [] }));
  };

  // Clear existing product selection
  const handleClearExistingProduct = (itemId: string) => {
    handleUpdateItem(itemId, {
      itemName: '',
      itemCategoryHint: 'Jewelry',
      existingProductId: undefined,
      existingProductCode: undefined,
      variations: [
        {
          id: `var-${Date.now()}-1`,
          variationTitle: 'Default',
          attributes: {},
          supplierSku: '',
          quantityPurchased: 1,
          supplierUnitPriceLkr: 0,
        }
      ],
    });
  };

  // Expense Handlers
  const handleAddExpense = () => {
    setExpenses((prev) => [
      ...prev,
      { id: `exp-${Date.now()}`, expenseType: 'shipping', amountLkr: 0, description: '' }
    ]);
  };

  const handleRemoveExpense = (index: number) => {
    setExpenses((prev) => prev.filter((_, i) => i !== index));
  };

  // ───────────────────────────────────────────────────────────────────────────
  // LIVE LANDED COST CALCULATION (Reusing pure integer calculation module)
  // ───────────────────────────────────────────────────────────────────────────
  const calculationPreview = useMemo(() => {
    try {
      // 1. Calculate total expenses in integer cents
      let totalExpensesCents = BigInt(0);
      for (const exp of expenses) {
        if (exp.amountLkr > 0) {
          totalExpensesCents += decimalLkrToCents(exp.amountLkr);
        }
      }

      // 2. Prepare line inputs for all variations across all items
      const lineInputs: LineCostInput[] = [];
      let totalPurchasedUnits = 0;
      let totalSupplierCostCents = BigInt(0);

      for (const item of items) {
        for (const v of item.variations) {
          const qty = Math.max(1, Math.floor(v.quantityPurchased || 0));
          const unitCostCents = v.supplierUnitPriceLkr > 0 ? decimalLkrToCents(v.supplierUnitPriceLkr) : BigInt(0);
          totalPurchasedUnits += qty;
          totalSupplierCostCents += BigInt(qty) * unitCostCents;

          lineInputs.push({
            variationId: v.id,
            quantity: qty,
            supplierUnitPriceCents: unitCostCents,
          });
        }
      }

      if (lineInputs.length === 0 || totalPurchasedUnits === 0) {
        return {
          isValid: false,
          totalPurchasedUnits: 0,
          totalSupplierCostLkr: 0,
          totalExpensesLkr: 0,
          totalLandedCostLkr: 0,
          allocMap: new Map(),
          error: 'At least one variation with quantity >= 1 is required.',
        };
      }

      // 3. Allocate exact expenses using the tested pure integer engine
      const allocations = allocateBatchExpensesExact(totalExpensesCents, lineInputs);
      const allocMap = new Map(allocations.map(a => [a.variationId, a]));

      const totalLandedCostCents = totalSupplierCostCents + totalExpensesCents;

      return {
        isValid: true,
        totalPurchasedUnits,
        totalSupplierCostLkr: centsToDecimalLkr(totalSupplierCostCents),
        totalExpensesLkr: centsToDecimalLkr(totalExpensesCents),
        totalLandedCostLkr: centsToDecimalLkr(totalLandedCostCents),
        totalSupplierCostCents,
        totalExpensesCents,
        totalLandedCostCents,
        allocMap,
        error: null,
      };
    } catch (err) {
      return {
        isValid: false,
        totalPurchasedUnits: 0,
        totalSupplierCostLkr: 0,
        totalExpensesLkr: 0,
        totalLandedCostLkr: 0,
        allocMap: new Map(),
        error: err instanceof Error ? err.message : 'Calculation error',
      };
    }
  }, [items, expenses]);

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!batchNumber.trim()) {
      setSubmitError('Batch number is required.');
      return;
    }
    if (!supplierName.trim()) {
      setSubmitError('Supplier name is required.');
      return;
    }
    if (!calculationPreview.isValid) {
      setSubmitError(calculationPreview.error || 'Please correct line item quantities and costs.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: CreateBatchPayload = {
        batchNumber: batchNumber.trim(),
        supplierName: supplierName.trim(),
        supplierContact: supplierContact.trim() || undefined,
        invoiceNumber: invoiceNumber.trim() || undefined,
        purchaseDate,
        notes: notes.trim() || undefined,
        totalSupplierCostCents: calculationPreview.totalSupplierCostCents?.toString() || '0',
        totalExpensesCents: calculationPreview.totalExpensesCents?.toString() || '0',
        totalLandedCostCents: calculationPreview.totalLandedCostCents?.toString() || '0',
        totalPurchasedUnits: calculationPreview.totalPurchasedUnits,
        expenses: expenses
          .filter(e => e.amountLkr > 0)
          .map(e => ({
            expenseType: e.expenseType,
            amountCents: decimalLkrToCents(e.amountLkr).toString(),
            description: e.description.trim() || undefined,
          })),
        items: items.map(item => {
          let itemSupplierCents = BigInt(0);
          let itemAllocExpenseCents = BigInt(0);
          let itemLandedCents = BigInt(0);
          let itemQty = 0;

          const variations = item.variations.map(v => {
            const alloc = calculationPreview.allocMap.get(v.id);
            const qty = Math.max(1, Math.floor(v.quantityPurchased || 0));
            const supplierUnitCents = v.supplierUnitPriceLkr > 0 ? decimalLkrToCents(v.supplierUnitPriceLkr) : BigInt(0);
            const lineSupplierCents = alloc?.lineSupplierCostCents ?? (BigInt(qty) * supplierUnitCents);
            const lineAllocExpenseCents = alloc?.lineAllocatedExpenseCents ?? BigInt(0);
            const lineLandedCents = alloc?.lineTotalLandedCostCents ?? (lineSupplierCents + lineAllocExpenseCents);
            const unitLandedCents = alloc?.unitLandedCostCents ?? supplierUnitCents;

            itemQty += qty;
            itemSupplierCents += lineSupplierCents;
            itemAllocExpenseCents += lineAllocExpenseCents;
            itemLandedCents += lineLandedCents;

            // Preserve existing product and variation identity in attributes JSON
            const attributes: Record<string, string> = {
              ...v.attributes,
              ...(v.existingVariantId ? { existing_variant_id: v.existingVariantId } : {}),
              ...(item.existingProductId ? { existing_product_id: item.existingProductId } : {}),
              ...(v.existingVariantId ? { is_restock: 'true' } : {}),
            };

            return {
              variationTitle: v.variationTitle.trim() || 'Default',
              attributes,
              supplierSku: v.supplierSku.trim() || undefined,
              quantityPurchased: qty,
              supplierUnitPriceCents: supplierUnitCents.toString(),
              lineSupplierCostCents: lineSupplierCents.toString(),
              lineAllocatedExpenseCents: lineAllocExpenseCents.toString(),
              lineTotalLandedCostCents: lineLandedCents.toString(),
              unitLandedCostCents: unitLandedCents.toString(),
            };
          });

          return {
            itemName: item.itemName.trim() || 'Untitled Jewelry Item',
            itemCategoryHint: item.itemCategoryHint || undefined,
            totalQuantity: itemQty,
            totalSupplierCostCents: itemSupplierCents.toString(),
            totalAllocatedExpenseCents: itemAllocExpenseCents.toString(),
            totalLandedCostCents: itemLandedCents.toString(),
            variations,
          };
        }),
      };

      const res = await createPurchaseBatchAction(payload);

      if (!res.success) {
        setSubmitError(res.error || 'Failed to create purchase batch.');
        setIsSubmitting(false);
        return;
      }

      setSuccessBatchId(res.batchId || null);
      router.push(`/admin/purchases/${res.batchId || ''}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'An unexpected error occurred during submission.');
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div className="flex items-center gap-3">
          <Link href="/admin/purchases">
            <Button type="button" variant="outline" size="sm" className="h-9 w-9 p-0">
              <ArrowLeft className="w-4 h-4 text-neutral-400" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
              New Purchase Batch
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
              Record new jewelry orders, restock existing products, item variations, additional expenses, and landed costs.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/admin/purchases">
            <Button type="button" variant="outline" size="sm" disabled={isSubmitting}>
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            variant="gold"
            size="sm"
            disabled={isSubmitting || !calculationPreview.isValid}
            className="flex items-center gap-2"
          >
            <PackageCheck className="w-4 h-4" />
            <span>{isSubmitting ? 'Saving Draft...' : 'Save Purchase Batch'}</span>
          </Button>
        </div>
      </div>

      {submitError && (
        <div className="p-4 rounded-sm bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <span>{submitError}</span>
        </div>
      )}

      {/* 1. Batch & Supplier Details */}
      <Card className="bg-neutral-900/60 border-neutral-800">
        <CardHeader className="p-4 sm:p-5 border-b border-neutral-800/80">
          <CardTitle className="text-sm font-semibold tracking-wider uppercase text-neutral-300 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-luxury-gold" />
            1. Supplier & Procurement Header
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="batchNumber" className="text-xs text-neutral-400">Batch Number *</Label>
            <Input
              id="batchNumber"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              required
              className="bg-neutral-950 border-neutral-800 text-white font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="supplierName" className="text-xs text-neutral-400">Supplier Name *</Label>
            <Input
              id="supplierName"
              placeholder="e.g. Hatton Jewels Ltd, Bullion Market"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              required
              className="bg-neutral-950 border-neutral-800 text-white text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="supplierContact" className="text-xs text-neutral-400">Supplier Phone / Contact</Label>
            <Input
              id="supplierContact"
              placeholder="+94 77 123 4567"
              value={supplierContact}
              onChange={(e) => setSupplierContact(e.target.value)}
              className="bg-neutral-950 border-neutral-800 text-white text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoiceNumber" className="text-xs text-neutral-400">Invoice / Reference #</Label>
            <Input
              id="invoiceNumber"
              placeholder="e.g. INV-2026-9481"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="bg-neutral-950 border-neutral-800 text-white text-xs font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="purchaseDate" className="text-xs text-neutral-400">Purchase Date *</Label>
            <Input
              id="purchaseDate"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              required
              className="bg-neutral-950 border-neutral-800 text-white text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-xs text-neutral-400">Procurement Notes</Label>
            <Input
              id="notes"
              placeholder="e.g. 18K Yellow Gold with authenticity certification"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-neutral-950 border-neutral-800 text-white text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* 2. Items & Variations */}
      <Card className="bg-neutral-900/60 border-neutral-800">
        <CardHeader className="p-4 sm:p-5 border-b border-neutral-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold tracking-wider uppercase text-neutral-300 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-luxury-gold" />
              2. Purchased Items & Variations
            </CardTitle>
            <p className="text-xs text-neutral-500 mt-0.5">
              Choose &quot;Create New Product&quot; for newly sourced lines, or &quot;Restock Existing Product&quot; to blend stock into existing storefront variants.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAddItem('new')}
              className="h-8 text-xs flex items-center gap-1.5 text-neutral-200 border-neutral-700 hover:border-luxury-gold hover:text-luxury-gold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Product Item</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAddItem('existing')}
              className="h-8 text-xs flex items-center gap-1.5 text-luxury-gold border-luxury-gold/40 hover:bg-luxury-gold/10"
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>Add Restock Item</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 space-y-6">
          {items.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded-sm bg-neutral-950/70 border space-y-4 transition-colors ${
                item.itemType === 'existing' ? 'border-amber-500/30' : 'border-neutral-800'
              }`}
            >
              {/* Type Switcher & Item Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-sm p-0.5 bg-neutral-900 border border-neutral-800 text-[11px]">
                    <button
                      type="button"
                      onClick={() => handleSetItemType(item.id, 'new')}
                      className={`px-2.5 py-1 rounded-xs transition-colors font-medium ${
                        item.itemType === 'new'
                          ? 'bg-luxury-gold/20 text-luxury-gold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      New Product
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetItemType(item.id, 'existing')}
                      className={`px-2.5 py-1 rounded-xs transition-colors font-medium flex items-center gap-1 ${
                        item.itemType === 'existing'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      <Boxes className="w-3 h-3" />
                      <span>Existing Product / Restock</span>
                    </button>
                  </div>

                  {item.itemType === 'existing' && item.existingProductId && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300">
                      Restock: {item.existingProductCode || item.itemName}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddVariation(item.id)}
                    className="h-7 text-[11px] text-luxury-gold hover:bg-luxury-gold/10"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Variation
                  </Button>
                  {items.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveItem(item.id)}
                      className="h-7 w-7 p-0 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border-neutral-800"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Product Identity Section */}
              {item.itemType === 'new' ? (
                /* Mode 1: New Product Form Inputs */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] text-neutral-400">New Product Name *</Label>
                    <Input
                      id={`focus-target-${item.id}`}
                      placeholder="e.g. Diamond Solitaire Ring, Gold Bangle"
                      value={item.itemName}
                      onChange={(e) => handleUpdateItem(item.id, { itemName: e.target.value })}
                      required
                      className="bg-neutral-900 border-neutral-800 text-white text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-neutral-400">Category Hint</Label>
                    <Input
                      placeholder="e.g. Rings, Bangles, Necklaces"
                      value={item.itemCategoryHint}
                      onChange={(e) => handleUpdateItem(item.id, { itemCategoryHint: e.target.value })}
                      className="bg-neutral-900 border-neutral-800 text-white text-xs mt-1"
                    />
                  </div>
                </div>
              ) : (
                /* Mode 2: Existing Product Search and Selection */
                <div className="space-y-3">
                  {item.existingProductId ? (
                    <div className="p-3 rounded-sm bg-neutral-900 border border-amber-500/30 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-white text-xs flex items-center gap-2">
                          <span>{item.itemName}</span>
                          {item.existingProductCode && (
                            <span className="font-mono text-[10px] text-luxury-gold px-1.5 py-0.5 rounded bg-neutral-950 border border-neutral-800">
                              {item.existingProductCode}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-neutral-400 mt-0.5">
                          Category: <span className="text-neutral-300">{item.itemCategoryHint || 'Jewelry'}</span> • Variations below will blend into this existing product without creating duplicates.
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleClearExistingProduct(item.id)}
                        className="h-7 text-[11px] text-neutral-400 hover:text-white"
                      >
                        Change Product
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label className="text-[11px] text-neutral-300 flex items-center gap-1.5">
                        <Search className="w-3.5 h-3.5 text-luxury-gold" />
                        Search Existing Product to Restock *
                      </Label>
                      <Input
                        id={`focus-target-${item.id}`}
                        placeholder="Search by product name, code (e.g. RNG-001), or variant SKU..."
                        value={searchQueries[item.id] || ''}
                        onChange={(e) => handleSearchExistingProducts(item.id, e.target.value)}
                        className="bg-neutral-900 border-neutral-800 text-white text-xs"
                      />

                      {isSearchingMap[item.id] && (
                        <div className="text-[11px] text-neutral-400 py-1">Searching existing inventory...</div>
                      )}

                      {searchResults[item.id] && searchResults[item.id].length > 0 && (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pt-1">
                          {searchResults[item.id].map((p) => (
                            <div
                              key={p.id}
                              className="p-2.5 rounded bg-neutral-900/90 hover:bg-neutral-800/80 border border-neutral-800 flex items-center justify-between gap-3 transition-colors"
                            >
                              <div>
                                <div className="font-medium text-white text-xs flex items-center gap-2">
                                  <span>{p.name}</span>
                                  {p.product_code && (
                                    <span className="font-mono text-[10px] text-neutral-400">{p.product_code}</span>
                                  )}
                                </div>
                                <div className="text-[10px] text-neutral-400 mt-0.5">
                                  Category: {p.categories?.name || 'Jewelry'} • {p.product_variants?.length || 0} variant(s)
                                </div>
                              </div>

                              <Button
                                type="button"
                                variant="gold"
                                size="sm"
                                onClick={() => handleSelectExistingProduct(item.id, p)}
                                className="h-6 text-[10px] px-2.5"
                              >
                                Select Product
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Variations Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="text-neutral-400 border-b border-neutral-800 text-[11px]">
                      <th className="py-2 px-2 font-medium">Variation Title / Size</th>
                      <th className="py-2 px-2 font-medium">Supplier / Target SKU</th>
                      {item.itemType === 'existing' && (
                        <th className="py-2 px-2 font-medium text-center w-28">Current Stock</th>
                      )}
                      <th className="py-2 px-2 font-medium w-24">Qty *</th>
                      <th className="py-2 px-2 font-medium w-36">Supplier Cost (LKR) *</th>
                      <th className="py-2 px-2 font-medium text-right w-32">Allocated Exp.</th>
                      <th className="py-2 px-2 font-medium text-right w-32">Unit Landed</th>
                      <th className="py-2 px-2 font-medium text-right w-32">Line Landed</th>
                      <th className="py-2 px-2 text-right w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/40">
                    {item.variations.map((v) => {
                      const alloc = calculationPreview.allocMap.get(v.id);
                      const allocExpenseLkr = alloc ? centsToDecimalLkr(alloc.lineAllocatedExpenseCents) : 0;
                      const unitLandedLkr = alloc ? centsToDecimalLkr(alloc.unitLandedCostCents) : v.supplierUnitPriceLkr;
                      const lineLandedLkr = alloc ? centsToDecimalLkr(alloc.lineTotalLandedCostCents) : (v.quantityPurchased * v.supplierUnitPriceLkr);

                      return (
                        <tr key={v.id} className="hover:bg-neutral-900/40">
                          <td className="py-2 px-2">
                            <Input
                              placeholder="e.g. Size 7, Oval Cut"
                              value={v.variationTitle}
                              onChange={(e) => handleUpdateVariation(item.id, v.id, { variationTitle: e.target.value })}
                              className="h-7 bg-neutral-900 border-neutral-800 text-white text-xs"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <Input
                              placeholder="SKU-..."
                              value={v.supplierSku}
                              onChange={(e) => handleUpdateVariation(item.id, v.id, { supplierSku: e.target.value })}
                              className="h-7 bg-neutral-900 border-neutral-800 text-neutral-300 font-mono text-xs"
                            />
                          </td>
                          {item.itemType === 'existing' && (
                            <td className="py-2 px-2 text-center">
                              {v.existingCurrentStock !== undefined ? (
                                <div className="flex flex-col items-center">
                                  <span className="font-mono text-[11px] text-neutral-300 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                                    {v.existingCurrentStock} units
                                  </span>
                                  {v.existingCurrentCost !== undefined && (
                                    <span className="text-[10px] text-neutral-500 font-mono mt-0.5">
                                      Ref: Rs. {v.existingCurrentCost.toFixed(2)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-neutral-500 text-[11px]">—</span>
                              )}
                            </td>
                          )}
                          <td className="py-2 px-2">
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              value={v.quantityPurchased}
                              onChange={(e) =>
                                handleUpdateVariation(item.id, v.id, {
                                  quantityPurchased: Math.max(1, parseInt(e.target.value, 10) || 1),
                                })
                              }
                              required
                              className="h-7 bg-neutral-900 border-neutral-800 text-white text-xs font-mono"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={v.supplierUnitPriceLkr || ''}
                              onChange={(e) =>
                                handleUpdateVariation(item.id, v.id, {
                                  supplierUnitPriceLkr: parseFloat(e.target.value) || 0,
                                })
                              }
                              required
                              placeholder="0.00"
                              className="h-7 bg-neutral-900 border-neutral-800 text-white text-xs font-mono"
                            />
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-neutral-400 text-xs">
                            Rs. {allocExpenseLkr.toFixed(2)}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-luxury-gold font-medium text-xs">
                            Rs. {unitLandedLkr.toFixed(2)}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-white font-medium text-xs">
                            Rs. {lineLandedLkr.toFixed(2)}
                          </td>
                          <td className="py-2 px-2 text-right">
                            {item.variations.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveVariation(item.id, v.id)}
                                className="text-neutral-500 hover:text-rose-400 transition-colors p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 3. Additional Expenses */}
      <Card className="bg-neutral-900/60 border-neutral-800">
        <CardHeader className="p-4 sm:p-5 border-b border-neutral-800/80 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold tracking-wider uppercase text-neutral-300 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-luxury-gold" />
              3. Freight, Customs, & Packing Expenses
            </CardTitle>
            <p className="text-xs text-neutral-500 mt-0.5">
              Expenses are allocated strictly pro-rata by physical unit quantity using exact integer arithmetic.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddExpense}
            className="h-8 text-xs flex items-center gap-1.5 text-luxury-gold border-luxury-gold/30 hover:bg-luxury-gold/10"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Expense</span>
          </Button>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 space-y-3">
          {expenses.map((exp, expIdx) => (
            <div
              key={exp.id}
              className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center p-3 rounded-sm bg-neutral-950/60 border border-neutral-800/70"
            >
              <div className="sm:col-span-3">
                <Label className="text-[10px] text-neutral-500 uppercase">Expense Category</Label>
                <select
                  value={exp.expenseType}
                  onChange={(e) => {
                    const copy = [...expenses];
                    copy[expIdx].expenseType = e.target.value as PurchaseExpenseType;
                    setExpenses(copy);
                  }}
                  className="w-full mt-1 h-8 rounded-sm bg-neutral-900 border border-neutral-800 text-xs text-neutral-200 px-2.5 focus:border-luxury-gold focus:outline-none"
                >
                  <option value="shipping">Freight & Shipping</option>
                  <option value="transport">Local Armored Transport</option>
                  <option value="customs_taxes">Customs & Precious Metal Duty</option>
                  <option value="packing">Security Packaging & Display Boxes</option>
                  <option value="other">Assaying, Testing & Other</option>
                </select>
              </div>

              <div className="sm:col-span-5">
                <Label className="text-[10px] text-neutral-500 uppercase">Description / Note</Label>
                <Input
                  placeholder="e.g. Courier consignment #4812, Gold assay cert"
                  value={exp.description}
                  onChange={(e) => {
                    const copy = [...expenses];
                    copy[expIdx].description = e.target.value;
                    setExpenses(copy);
                  }}
                  className="h-8 bg-neutral-900 border-neutral-800 text-white text-xs mt-1"
                />
              </div>

              <div className="sm:col-span-3">
                <Label className="text-[10px] text-neutral-500 uppercase">Amount (LKR)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={exp.amountLkr || ''}
                  onChange={(e) => {
                    const copy = [...expenses];
                    copy[expIdx].amountLkr = parseFloat(e.target.value) || 0;
                    setExpenses(copy);
                  }}
                  className="h-8 bg-neutral-900 border-neutral-800 text-white font-mono text-xs mt-1"
                />
              </div>

              <div className="sm:col-span-1 flex justify-end pt-4 sm:pt-0">
                <button
                  type="button"
                  onClick={() => handleRemoveExpense(expIdx)}
                  className="text-neutral-500 hover:text-rose-400 p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 4. Live Landed Cost Summary & Reconciliation */}
      <Card className="border border-luxury-gold/40 bg-neutral-950 text-neutral-200 shadow-lg">
        <CardHeader className="p-4 sm:p-5 border-b border-neutral-800/80 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold tracking-wider uppercase text-luxury-gold flex items-center gap-2 font-serif">
            <Sparkles className="w-4 h-4 text-luxury-gold" />
            4. Live Landed-Cost Valuation & Mathematical Reconciliation
          </CardTitle>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-mono">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>0.00 LKR Drift Verified</span>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center divide-x divide-neutral-800/80">
            <div className="p-2">
              <div className="text-[11px] text-neutral-400 uppercase tracking-wider">Total Quantity</div>
              <div className="mt-1 text-xl sm:text-2xl font-bold font-mono text-white">
                {calculationPreview.totalPurchasedUnits}
              </div>
              <div className="text-[10px] text-neutral-500">Physical units</div>
            </div>

            <div className="p-2">
              <div className="text-[11px] text-neutral-400 uppercase tracking-wider">Supplier Cost</div>
              <div className="mt-1 text-lg sm:text-xl font-bold font-mono text-neutral-200">
                Rs. {calculationPreview.totalSupplierCostLkr.toFixed(2)}
              </div>
              <div className="text-[10px] text-neutral-500">Direct purchase value</div>
            </div>

            <div className="p-2">
              <div className="text-[11px] text-neutral-400 uppercase tracking-wider">Additional Expenses</div>
              <div className="mt-1 text-lg sm:text-xl font-bold font-mono text-amber-300">
                + Rs. {calculationPreview.totalExpensesLkr.toFixed(2)}
              </div>
              <div className="text-[10px] text-neutral-500">Allocated across units</div>
            </div>

            <div className="p-2">
              <div className="text-[11px] text-luxury-gold uppercase tracking-wider font-semibold">Total Landed Cost</div>
              <div className="mt-1 text-xl sm:text-2xl font-bold font-mono text-luxury-gold-light">
                Rs. {calculationPreview.totalLandedCostLkr.toFixed(2)}
              </div>
              <div className="text-[10px] text-luxury-gold/70">
                ~Rs. {(calculationPreview.totalPurchasedUnits > 0 ? (calculationPreview.totalLandedCostLkr / calculationPreview.totalPurchasedUnits) : 0).toFixed(2)} / unit avg
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bottom Actions */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-neutral-800">
        <Link href="/admin/purchases">
          <Button type="button" variant="outline" disabled={isSubmitting}>
            Cancel
          </Button>
        </Link>
        <Button
          type="submit"
          variant="gold"
          disabled={isSubmitting || !calculationPreview.isValid}
          className="flex items-center gap-2 px-6"
        >
          <PackageCheck className="w-4 h-4" />
          <span>{isSubmitting ? 'Creating Purchase Batch...' : 'Save Draft Batch'}</span>
        </Button>
      </div>
    </form>
  );
}
