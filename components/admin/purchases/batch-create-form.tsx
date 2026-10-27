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
  X,
  Check,
  ExternalLink
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
import { searchAdminInventoryProductsAction, type AdminInventoryProductSummary } from '@/lib/catalog/variants';
import type { PurchaseExpenseType } from '@/lib/purchases/types';

export type PurchaseItemType = 'new' | 'existing';

export interface FormVariation {
  id: string; // local temporary id
  variationTitle: string;
  attributes: Record<string, string>;
  supplierSku: string;
  quantityPurchased: number | '';
  supplierUnitPriceLkr: number | '';
  isSelected?: boolean;
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
          isSelected: true,
        }
      ]
    }
  ]);

  // Auto-focus tracking for newly added items
  const [focusItemId, setFocusItemId] = useState<string | null>(null);

  // Search state for existing products (mapped by itemId)
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [searchResults, setSearchResults] = useState<Record<string, AdminInventoryProductSummary[]>>({});
  const [isSearchingMap, setIsSearchingMap] = useState<Record<string, boolean>>({});
  const [searchErrors, setSearchErrors] = useState<Record<string, string | null>>({});
  const [searchHasSearched, setSearchHasSearched] = useState<Record<string, boolean>>({});

  // Sequence ref and debounce timer ref per item to prevent race conditions and out-of-order stale overwrites
  const searchSeqRef = useRef<Record<string, number>>({});
  const searchDebounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  // Guided workflow modal/banner state for adding a new variation to an existing product
  const [showNewVariationGuideId, setShowNewVariationGuideId] = useState<string | null>(null);

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

  // Cleanup pending search debounce timers on unmount
  useEffect(() => {
    const timers = searchDebounceTimers.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

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
          quantityPurchased: type === 'new' ? 1 : 0,
          supplierUnitPriceLkr: 0,
          isSelected: type === 'new',
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
    if (searchDebounceTimers.current[itemId]) {
      clearTimeout(searchDebounceTimers.current[itemId]);
    }
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
              quantityPurchased: typeof v.quantityPurchased === 'number' && v.quantityPurchased > 0 ? v.quantityPurchased : 1,
              isSelected: true,
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
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    if (targetItem.itemType === 'existing') {
      // Guide user: new variations under existing products must be registered in Catalog with 0 stock
      // strictly complying with NO PURCHASE = NO ITEM TO SELL to preserve provenance.
      setShowNewVariationGuideId(itemId);
      return;
    }

    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const newVar: FormVariation = {
          id: `var-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          variationTitle: `Variation ${item.variations.length + 1}`,
          attributes: {},
          supplierSku: '',
          quantityPurchased: 1,
          supplierUnitPriceLkr: 0,
          isSelected: true,
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
        // For new items, keep at least 1 variation
        if (item.itemType === 'new' && item.variations.length <= 1) return item;
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

  // Toggle variation selection for purchase
  const handleToggleVariationSelection = (itemId: string, varId: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          variations: item.variations.map((v) => {
            if (v.id !== varId) return v;
            const willSelect = !v.isSelected;
            return {
              ...v,
              isSelected: willSelect,
              // If selecting and quantity was 0 or empty, default to 1 so it is active
              quantityPurchased: willSelect
                ? (typeof v.quantityPurchased === 'number' && v.quantityPurchased > 0 ? v.quantityPurchased : 1)
                : v.quantityPurchased,
            };
          }),
        };
      })
    );
  };

  // Numeric input change handler: allows temporary empty input without resetting to 1
  const handleQuantityChange = (itemId: string, varId: string, rawVal: string) => {
    if (rawVal === '') {
      handleUpdateVariation(itemId, varId, { quantityPurchased: '' });
      return;
    }
    // Only accept non-negative whole integer digits
    if (/^\d+$/.test(rawVal)) {
      const num = parseInt(rawVal, 10);
      handleUpdateVariation(itemId, varId, {
        quantityPurchased: num,
        isSelected: num > 0 ? true : false,
      });
    }
  };

  // Normalize quantity on blur
  const handleQuantityBlur = (itemId: string, varId: string, itemType: PurchaseItemType) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          variations: item.variations.map((v) => {
            if (v.id !== varId) return v;
            if (v.quantityPurchased === '') {
              const defaultQty = itemType === 'existing' ? 0 : 1;
              return {
                ...v,
                quantityPurchased: defaultQty,
                isSelected: defaultQty > 0,
              };
            }
            return v;
          }),
        };
      })
    );
  };

  // Decimal price change handler
  const handlePriceChange = (itemId: string, varId: string, rawVal: string) => {
    if (rawVal === '') {
      handleUpdateVariation(itemId, varId, { supplierUnitPriceLkr: '' });
      return;
    }
    if (/^\d*\.?\d*$/.test(rawVal)) {
      const num = parseFloat(rawVal);
      handleUpdateVariation(itemId, varId, { supplierUnitPriceLkr: isNaN(num) ? '' : num });
    }
  };

  // Normalize price on blur
  const handlePriceBlur = (itemId: string, varId: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          variations: item.variations.map((v) => {
            if (v.id !== varId) return v;
            if (v.supplierUnitPriceLkr === '') {
              return { ...v, supplierUnitPriceLkr: 0 };
            }
            return v;
          }),
        };
      })
    );
  };

  // Execute catalog search with sequence guard against race conditions
  const executeProductSearch = async (itemId: string, query: string) => {
    const seq = (searchSeqRef.current[itemId] || 0) + 1;
    searchSeqRef.current[itemId] = seq;

    setIsSearchingMap((prev) => ({ ...prev, [itemId]: true }));
    setSearchErrors((prev) => ({ ...prev, [itemId]: null }));

    try {
      const res = await searchAdminInventoryProductsAction({
        query,
        limit: 8,
      });

      // Discard stale out-of-order response
      if (seq !== searchSeqRef.current[itemId]) {
        return;
      }

      if (res.success && res.products) {
        setSearchResults((prev) => ({ ...prev, [itemId]: res.products }));
        setSearchErrors((prev) => ({ ...prev, [itemId]: null }));
      } else {
        setSearchResults((prev) => ({ ...prev, [itemId]: [] }));
        if (res.error) {
          setSearchErrors((prev) => ({ ...prev, [itemId]: res.error ?? 'Failed to search inventory.' }));
        }
      }
    } catch (err) {
      if (seq !== searchSeqRef.current[itemId]) return;
      setSearchResults((prev) => ({ ...prev, [itemId]: [] }));
      setSearchErrors((prev) => ({
        ...prev,
        [itemId]: err instanceof Error ? err.message : 'Failed to search inventory.',
      }));
    } finally {
      if (seq === searchSeqRef.current[itemId]) {
        setIsSearchingMap((prev) => ({ ...prev, [itemId]: false }));
        setSearchHasSearched((prev) => ({ ...prev, [itemId]: true }));
      }
    }
  };

  // Search input handler with immediate feedback and 300ms debounce
  const handleSearchInputChange = (itemId: string, query: string) => {
    // 1. Immediate input feedback
    setSearchQueries((prev) => ({ ...prev, [itemId]: query }));
    setSearchErrors((prev) => ({ ...prev, [itemId]: null }));

    // Clear active timer for this item
    if (searchDebounceTimers.current[itemId]) {
      clearTimeout(searchDebounceTimers.current[itemId]);
    }

    if (!query.trim()) {
      setSearchResults((prev) => ({ ...prev, [itemId]: [] }));
      setIsSearchingMap((prev) => ({ ...prev, [itemId]: false }));
      setSearchHasSearched((prev) => ({ ...prev, [itemId]: false }));
      return;
    }

    setIsSearchingMap((prev) => ({ ...prev, [itemId]: true }));

    // 2. Debounce by 300ms (within 250-350ms specification)
    searchDebounceTimers.current[itemId] = setTimeout(() => {
      executeProductSearch(itemId, query.trim());
    }, 300);
  };

  // Selecting an existing product populates its variations and metadata from typed AdminInventoryProductSummary
  const handleSelectExistingProduct = (itemId: string, product: AdminInventoryProductSummary) => {
    if (searchDebounceTimers.current[itemId]) {
      clearTimeout(searchDebounceTimers.current[itemId]);
    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    
    // Map each saved variation accurately;
    // Stage 2: Initialize new purchase quantity to 0 and unselected!
    // Do NOT automatically purchase one unit of every variation!
    const formVariations: FormVariation[] = variants.map((pv, idx) => ({
      id: `var-${Date.now()}-${pv.id || idx}`,
      variationTitle: pv.title || 'Default',
      attributes: {
        existing_product_id: product.id,
        existing_variant_id: pv.id,
        target_sku: pv.sku,
        is_restock: 'true',
      },
      supplierSku: pv.sku || '',
      quantityPurchased: 0, // Starts at 0!
      supplierUnitPriceLkr: 0, // Fresh supplier cost
      isSelected: false, // Default unselected / Not Purchasing
      existingVariantId: pv.id,
      existingCurrentStock: typeof pv.stockQuantity === 'number' ? pv.stockQuantity : 0,
      existingCurrentCost: typeof pv.purchaseCost === 'number' ? pv.purchaseCost : 0,
    }));

    handleUpdateItem(itemId, {
      itemName: product.name,
      itemCategoryHint: product.categoryName || 'Jewelry',
      existingProductId: product.id,
      existingProductCode: product.sku || '',
      variations: formVariations,
    });

    // Clear search state for this item
    setSearchQueries((prev) => ({ ...prev, [itemId]: '' }));
    setSearchResults((prev) => ({ ...prev, [itemId]: [] }));
    setSearchErrors((prev) => ({ ...prev, [itemId]: null }));
    setSearchHasSearched((prev) => ({ ...prev, [itemId]: false }));
  };

  // Clear existing product selection
  const handleClearExistingProduct = (itemId: string) => {
    if (searchDebounceTimers.current[itemId]) {
      clearTimeout(searchDebounceTimers.current[itemId]);
    }
    setSearchQueries((prev) => ({ ...prev, [itemId]: '' }));
    setSearchResults((prev) => ({ ...prev, [itemId]: [] }));
    setSearchErrors((prev) => ({ ...prev, [itemId]: null }));
    setSearchHasSearched((prev) => ({ ...prev, [itemId]: false }));

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
          isSelected: true,
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
          const isSelected = v.isSelected !== false;
          const qty = typeof v.quantityPurchased === 'number' && v.quantityPurchased > 0
            ? Math.floor(v.quantityPurchased)
            : 0;

          // Zero-quantity or unselected variations contribute zero units and zero supplier cost,
          // and receive no expense allocation!
          if (!isSelected || qty === 0) {
            continue;
          }

          const unitCost = typeof v.supplierUnitPriceLkr === 'number' && v.supplierUnitPriceLkr > 0
            ? v.supplierUnitPriceLkr
            : 0;
          const unitCostCents = unitCost > 0 ? decimalLkrToCents(unitCost) : BigInt(0);

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
          totalSupplierCostCents: BigInt(0),
          totalExpensesCents: BigInt(0),
          totalLandedCostCents: BigInt(0),
          allocMap: new Map(),
          error: 'At least one variation must be selected with a quantity greater than zero.',
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
        totalSupplierCostCents: BigInt(0),
        totalExpensesCents: BigInt(0),
        totalLandedCostCents: BigInt(0),
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

    // Validate catalog variations and ensure at least one variation is being purchased
    let hasAnyPurchasedVariation = false;
    for (const item of items) {
      if (item.itemType === 'existing' && item.existingProductId && item.variations.length === 0) {
        setSubmitError(`Product "${item.itemName}" has no variations in the catalog. Please configure variations in Catalog before restocking or remove this item.`);
        return;
      }
      for (const v of item.variations) {
        const isSelected = v.isSelected !== false;
        const qty = typeof v.quantityPurchased === 'number' ? v.quantityPurchased : 0;
        if (isSelected && qty > 0) {
          hasAnyPurchasedVariation = true;
          if (!Number.isInteger(qty) || qty < 1) {
            setSubmitError(`Purchase quantity for "${v.variationTitle}" must be a positive whole integer.`);
            return;
          }
          const cost = typeof v.supplierUnitPriceLkr === 'number' ? v.supplierUnitPriceLkr : 0;
          if (cost <= 0) {
            setSubmitError(`Supplier unit cost is required for included variation "${v.variationTitle}".`);
            return;
          }
        }
      }
    }

    if (!hasAnyPurchasedVariation) {
      setSubmitError('At least one variation must be included with a purchase quantity greater than zero.');
      return;
    }

    if (!calculationPreview.isValid) {
      setSubmitError(calculationPreview.error || 'Please correct line item quantities and costs.');
      return;
    }

    setIsSubmitting(true);

    try {
      const validItems = items
        .map((item) => {
          let itemSupplierCents = BigInt(0);
          let itemAllocExpenseCents = BigInt(0);
          let itemLandedCents = BigInt(0);
          let itemQty = 0;

          const purchasedVariations = item.variations.filter(
            (v) => v.isSelected !== false && typeof v.quantityPurchased === 'number' && v.quantityPurchased > 0
          );

          const mappedVariations = purchasedVariations.map((v) => {
            const qty = Math.floor(v.quantityPurchased as number);
            const unitCost = typeof v.supplierUnitPriceLkr === 'number' && v.supplierUnitPriceLkr > 0
              ? v.supplierUnitPriceLkr
              : 0;
            const supplierUnitCents = decimalLkrToCents(unitCost);
            const alloc = calculationPreview.allocMap.get(v.id);
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
            variations: mappedVariations,
          };
        })
        .filter((i) => i.variations.length > 0);

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
        items: validItems,
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
                  {item.itemType === 'new' ? (
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
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddVariation(item.id)}
                      className="h-7 text-[11px] text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add New Variation...
                    </Button>
                  )}
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

              {/* Guided Workflow for New Variations under Existing Product */}
              {showNewVariationGuideId === item.id && item.itemType === 'existing' && (
                <div className="p-3.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold flex items-center gap-1.5 text-amber-300">
                      <Sparkles className="w-4 h-4 text-luxury-gold" />
                      <span>Adding a New Variation to an Existing Product</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowNewVariationGuideId(null)}
                      className="text-neutral-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-neutral-300 leading-relaxed">
                    To preserve inventory provenance (<span className="font-mono text-luxury-gold">NO PURCHASE = NO ITEM TO SELL</span>) and prevent SKU conflicts, new variations for existing products must first be registered in the Product Catalog with 0 initial stock. Once registered, selecting this product will automatically load the new variation here for purchase ordering and landed-cost calculation.
                  </p>
                  {item.existingProductId && (
                    <div className="pt-1">
                      <a
                        href={`/admin/products/${item.existingProductId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-luxury-gold/20 text-luxury-gold text-xs font-medium hover:bg-luxury-gold/30 border border-luxury-gold/30 transition-colors"
                      >
                        <span>Open Product in Catalog to Add Variation</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              )}

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
                    <div className="space-y-3">
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

                      {item.variations.length === 0 && (
                        <div className="p-3.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
                          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                          <div>
                            <span className="font-semibold">No Variations Found:</span> This product has no active variations in catalog. Please configure variations in Catalog before restocking.
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label className="text-[11px] text-neutral-300 flex items-center gap-1.5">
                        <Search className="w-3.5 h-3.5 text-luxury-gold" />
                        Search Existing Product to Restock *
                      </Label>
                      <div className="relative">
                        <Input
                          id={`focus-target-${item.id}`}
                          placeholder="Search by product name, code (e.g. RNG-001), or variant SKU..."
                          value={searchQueries[item.id] || ''}
                          onChange={(e) => handleSearchInputChange(item.id, e.target.value)}
                          className="bg-neutral-900 border-neutral-800 text-white text-xs pr-8"
                        />
                        {isSearchingMap[item.id] && (
                          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                            <div className="w-3.5 h-3.5 border-2 border-luxury-gold border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                      </div>

                      {isSearchingMap[item.id] && (
                        <div className="text-[11px] text-luxury-gold/80 py-1 flex items-center gap-1.5">
                          <span>Searching existing inventory...</span>
                        </div>
                      )}

                      {searchErrors[item.id] && (
                        <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
                          <span>{searchErrors[item.id]}</span>
                          <button
                            type="button"
                            onClick={() => executeProductSearch(item.id, searchQueries[item.id] || '')}
                            className="text-luxury-gold hover:underline text-[11px] ml-2 shrink-0 font-medium"
                          >
                            Retry
                          </button>
                        </div>
                      )}

                      {!isSearchingMap[item.id] && searchHasSearched[item.id] && searchQueries[item.id]?.trim() && (!searchResults[item.id] || searchResults[item.id].length === 0) && !searchErrors[item.id] && (
                        <div className="text-xs text-neutral-400 py-1.5 italic">
                          No products found matching &quot;{searchQueries[item.id]}&quot;.
                        </div>
                      )}

                      {searchResults[item.id] && searchResults[item.id].length > 0 && (
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pt-1">
                          {searchResults[item.id].map((p) => (
                            <div
                              key={p.id}
                              className="p-3 rounded bg-neutral-900/95 hover:bg-neutral-800/90 border border-neutral-800 flex items-center justify-between gap-3 transition-colors"
                            >
                              <div className="space-y-1">
                                <div className="font-medium text-white text-xs flex items-center gap-2">
                                  <span>{p.name}</span>
                                  {p.sku && (
                                    <span className="font-mono text-[10px] text-luxury-gold px-1.5 py-0.5 rounded bg-neutral-950 border border-neutral-800">
                                      {p.sku}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-neutral-400 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                                  <span>Category: <span className="text-neutral-300">{p.categoryName || 'Jewelry'}</span></span>
                                  <span>•</span>
                                  <span>{p.variants?.length ?? p.variantCount ?? 0} variation{(p.variants?.length ?? p.variantCount) === 1 ? '' : 's'}</span>
                                  <span>•</span>
                                  <span>Total Stock: <span className="font-mono text-neutral-300">{p.totalStock ?? 0}</span></span>
                                </div>
                              </div>

                              <Button
                                type="button"
                                variant="gold"
                                size="sm"
                                onClick={() => handleSelectExistingProduct(item.id, p)}
                                className="h-7 text-xs px-3 shrink-0"
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

              {/* Variations Display (Dual Desktop Table & Mobile Cards) */}
              {item.variations.length > 0 ? (
                <div className="space-y-4">
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="text-neutral-400 border-b border-neutral-800 text-[11px]">
                          {item.itemType === 'existing' && (
                            <th className="py-2 px-2 font-medium w-16 text-center">Include</th>
                          )}
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
                          const isIncluded = v.isSelected !== false && typeof v.quantityPurchased === 'number' && v.quantityPurchased > 0;
                          const alloc = isIncluded ? calculationPreview.allocMap.get(v.id) : undefined;
                          const allocExpenseLkr = alloc ? centsToDecimalLkr(alloc.lineAllocatedExpenseCents) : 0;
                          const unitCostLkr = typeof v.supplierUnitPriceLkr === 'number' && v.supplierUnitPriceLkr > 0 ? v.supplierUnitPriceLkr : 0;
                          const unitLandedLkr = alloc ? centsToDecimalLkr(alloc.unitLandedCostCents) : unitCostLkr;
                          const qty = typeof v.quantityPurchased === 'number' && v.quantityPurchased > 0 ? v.quantityPurchased : 0;
                          const lineLandedLkr = alloc ? centsToDecimalLkr(alloc.lineTotalLandedCostCents) : (qty * unitCostLkr);

                          return (
                            <tr
                              key={v.id}
                              className={`transition-colors hover:bg-neutral-900/40 ${
                                !isIncluded && item.itemType === 'existing' ? 'opacity-60 bg-neutral-950/20' : ''
                              }`}
                            >
                              {item.itemType === 'existing' && (
                                <td className="py-2 px-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleVariationSelection(item.id, v.id)}
                                    title={isIncluded ? 'Click to exclude' : 'Click to include'}
                                    className={`h-5 w-5 rounded inline-flex items-center justify-center border transition-colors ${
                                      isIncluded
                                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                                        : 'bg-neutral-900 border-neutral-700 text-transparent hover:border-neutral-500'
                                    }`}
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              )}
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
                                      <span
                                        className={`font-mono text-[11px] px-2 py-0.5 rounded border ${
                                          v.existingCurrentStock === 0
                                            ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                                            : 'text-neutral-300 bg-neutral-900 border-neutral-800'
                                        }`}
                                      >
                                        {v.existingCurrentStock} units
                                      </span>
                                      {v.existingCurrentCost !== undefined && (
                                        <span className="text-[10px] text-neutral-400 font-mono mt-0.5">
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
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={v.quantityPurchased === '' ? '' : v.quantityPurchased}
                                  onChange={(e) => handleQuantityChange(item.id, v.id, e.target.value)}
                                  onBlur={() => handleQuantityBlur(item.id, v.id, item.itemType)}
                                  placeholder="0"
                                  className="h-7 bg-neutral-900 border-neutral-800 text-white text-xs font-mono text-center"
                                />
                              </td>
                              <td className="py-2 px-2">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={v.supplierUnitPriceLkr === '' ? '' : v.supplierUnitPriceLkr}
                                  onChange={(e) => handlePriceChange(item.id, v.id, e.target.value)}
                                  onBlur={() => handlePriceBlur(item.id, v.id)}
                                  placeholder="0.00"
                                  className="h-7 bg-neutral-900 border-neutral-800 text-white text-xs font-mono text-right"
                                />
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-neutral-400 text-xs">
                                {isIncluded ? `Rs. ${allocExpenseLkr.toFixed(2)}` : '—'}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-luxury-gold font-medium text-xs">
                                {isIncluded ? `Rs. ${unitLandedLkr.toFixed(2)}` : '—'}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-white font-medium text-xs">
                                {isIncluded ? `Rs. ${lineLandedLkr.toFixed(2)}` : '—'}
                              </td>
                              <td className="py-2 px-2 text-right">
                                {item.itemType === 'new' && item.variations.length > 1 && (
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

                  {/* Mobile Card-Based Stacked View (Zero Horizontal Scrolling) */}
                  <div className="block md:hidden space-y-3">
                    {item.variations.map((v) => {
                      const isIncluded = v.isSelected !== false && typeof v.quantityPurchased === 'number' && v.quantityPurchased > 0;
                      const alloc = isIncluded ? calculationPreview.allocMap.get(v.id) : undefined;
                      const allocExpenseLkr = alloc ? centsToDecimalLkr(alloc.lineAllocatedExpenseCents) : 0;
                      const unitCostLkr = typeof v.supplierUnitPriceLkr === 'number' && v.supplierUnitPriceLkr > 0 ? v.supplierUnitPriceLkr : 0;
                      const unitLandedLkr = alloc ? centsToDecimalLkr(alloc.unitLandedCostCents) : unitCostLkr;
                      const qty = typeof v.quantityPurchased === 'number' && v.quantityPurchased > 0 ? v.quantityPurchased : 0;
                      const lineLandedLkr = alloc ? centsToDecimalLkr(alloc.lineTotalLandedCostCents) : (qty * unitCostLkr);

                      return (
                        <div
                          key={v.id}
                          className={`p-3.5 rounded-sm border transition-colors space-y-3 ${
                            isIncluded
                              ? 'bg-neutral-900/90 border-emerald-500/40 shadow-xs'
                              : 'bg-neutral-950/60 border-neutral-800/80 opacity-75'
                          }`}
                        >
                          {/* Header: Title, SKU, and Selection Toggle Pill */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-0.5">
                              <div className="font-semibold text-white text-xs flex items-center gap-1.5">
                                <span>{v.variationTitle || 'Default'}</span>
                              </div>
                              <div className="font-mono text-[11px] text-neutral-400">
                                SKU: <span className="text-neutral-300">{v.supplierSku || '—'}</span>
                              </div>
                            </div>

                            {item.itemType === 'existing' ? (
                              <button
                                type="button"
                                onClick={() => handleToggleVariationSelection(item.id, v.id)}
                                className={`px-2.5 py-1 text-[11px] font-medium rounded-full border flex items-center gap-1.5 transition-colors shrink-0 ${
                                  isIncluded
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : 'bg-neutral-800/80 text-neutral-400 border-neutral-700 hover:text-white'
                                }`}
                              >
                                {isIncluded ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    <span>Included</span>
                                  </>
                                ) : (
                                  <span>Not Purchasing</span>
                                )}
                              </button>
                            ) : (
                              <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20">
                                New Variation
                              </span>
                            )}
                          </div>

                          {/* Existing Inventory Stock (Read-Only) */}
                          {item.itemType === 'existing' && (
                            <div className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded bg-neutral-950/80 border border-neutral-800">
                              <span className="text-neutral-400 text-[11px]">Current Stock:</span>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`font-mono font-medium px-2 py-0.5 rounded text-[11px] ${
                                    v.existingCurrentStock === 0
                                      ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                                      : 'text-neutral-200 bg-neutral-900 border border-neutral-800'
                                  }`}
                                >
                                  {v.existingCurrentStock ?? 0} units
                                </span>
                                {v.existingCurrentCost !== undefined && (
                                  <span className="text-[10px] text-neutral-400 font-mono">
                                    Ref: Rs. {v.existingCurrentCost.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Inputs: Quantity & Supplier Unit Cost */}
                          <div className="grid grid-cols-2 gap-2.5 pt-1">
                            <div>
                              <Label className="text-[11px] text-neutral-300 block mb-1">
                                New Purchase Qty *
                              </Label>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="0"
                                value={v.quantityPurchased === '' ? '' : v.quantityPurchased}
                                onChange={(e) => handleQuantityChange(item.id, v.id, e.target.value)}
                                onBlur={() => handleQuantityBlur(item.id, v.id, item.itemType)}
                                className="h-9 bg-neutral-900 border-neutral-800 text-white font-mono text-sm text-center"
                              />
                            </div>

                            <div>
                              <Label className="text-[11px] text-neutral-300 block mb-1">
                                Supplier Cost (LKR) *
                              </Label>
                              <Input
                                type="text"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={v.supplierUnitPriceLkr === '' ? '' : v.supplierUnitPriceLkr}
                                onChange={(e) => handlePriceChange(item.id, v.id, e.target.value)}
                                onBlur={() => handlePriceBlur(item.id, v.id)}
                                className="h-9 bg-neutral-900 border-neutral-800 text-white font-mono text-sm text-right"
                              />
                            </div>
                          </div>

                          {/* Live Landed Cost Summary */}
                          {isIncluded && (
                            <div className="p-2 rounded bg-neutral-950/80 border border-neutral-800 text-[11px] font-mono grid grid-cols-3 gap-1 text-center">
                              <div>
                                <div className="text-[10px] text-neutral-500">Alloc. Exp.</div>
                                <div className="text-neutral-300 mt-0.5">Rs. {allocExpenseLkr.toFixed(2)}</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-luxury-gold/80">Unit Landed</div>
                                <div className="text-luxury-gold font-medium mt-0.5">Rs. {unitLandedLkr.toFixed(2)}</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-neutral-400">Line Total</div>
                                <div className="text-white font-bold mt-0.5">Rs. {lineLandedLkr.toFixed(2)}</div>
                              </div>
                            </div>
                          )}

                          {/* Remove button for new items */}
                          {item.itemType === 'new' && item.variations.length > 1 && (
                            <div className="flex justify-end pt-1">
                              <button
                                type="button"
                                onClick={() => handleRemoveVariation(item.id, v.id)}
                                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Remove variation</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
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
