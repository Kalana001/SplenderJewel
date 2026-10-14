'use client';

import React, { useState, useEffect, useRef, useTransition, useCallback } from 'react';
import Link from 'next/link';
import {
  Archive,
  Search,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Plus,
  Minus,
  Edit2,
  Loader2,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  History,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/config/store';
import {
  searchAdminInventoryProductsAction,
  adjustVariantStockAction,
  getVariantMovementHistoryAction,
  type AdminInventoryProductSummary,
  type AdminProductVariantInventory,
  type InventoryMovementRecord,
} from '@/lib/catalog/variants';

interface InventoryManagerProps {
  initialProducts: AdminInventoryProductSummary[];
  initialTotalCount: number;
  initialError?: string | null;
}

export function InventoryManager({
  initialProducts,
  initialTotalCount,
  initialError,
}: InventoryManagerProps) {
  // Search & Pagination State
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [products, setProducts] = useState<AdminInventoryProductSummary[]>(initialProducts);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [isSearching, setIsSearching] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(initialError || null);

  // Selected Product & Variant State
  const initialSelectedProduct = initialProducts[0] || null;
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    initialSelectedProduct?.id || null
  );
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    initialSelectedProduct?.variants.length === 1
      ? initialSelectedProduct.variants[0].id
      : (initialSelectedProduct?.variants[0]?.id || null)
  );

  // Movement History State
  const [movementHistory, setMovementHistory] = useState<InventoryMovementRecord[]>([]);
  const [isLoadingMovements, setIsLoadingMovements] = useState(false);

  // Adjustment Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmationStep, setConfirmationStep] = useState(false);
  const [adjustmentInput, setAdjustmentInput] = useState<string>('');
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [reason, setReason] = useState<'stock_added' | 'manual_adjustment' | 'correction'>('stock_added');
  const [referenceNotes, setReferenceNotes] = useState('');

  // Status Alerts
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const searchDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const searchSeqRef = useRef<number>(0);

  // Active selected product and variant references
  const selectedProduct = products.find((p) => p.id === selectedProductId) || null;
  const selectedVariant =
    selectedProduct?.variants.find((v) => v.id === selectedVariantId) || null;

  // Auto-select variant when product changes (auto-select if single variant)
  useEffect(() => {
    if (!selectedProduct) {
      setSelectedVariantId(null);
      return;
    }

    if (selectedProduct.variants.length === 1) {
      // Auto-select single variant
      setSelectedVariantId(selectedProduct.variants[0].id);
    } else if (selectedProduct.variants.length > 1) {
      setSelectedVariantId((current) => {
        const exists = selectedProduct.variants.some((v) => v.id === current);
        return exists ? current : selectedProduct.variants[0].id;
      });
    } else {
      setSelectedVariantId(null);
    }
  }, [selectedProductId, selectedProduct]);

  // Load movement history whenever selected variant changes
  const fetchMovements = useCallback(async (variantId: string) => {
    setIsLoadingMovements(true);
    const res = await getVariantMovementHistoryAction(variantId, 10);
    if (res.success) {
      setMovementHistory(res.movements);
    } else {
      setMovementHistory([]);
    }
    setIsLoadingMovements(false);
  }, []);

  useEffect(() => {
    if (selectedVariantId) {
      fetchMovements(selectedVariantId);
    } else {
      setMovementHistory([]);
    }
  }, [selectedVariantId, fetchMovements]);

  // Server-side debounced search function with sequence guard against race conditions
  const executeSearch = useCallback(async (query: string, page: number) => {
    const seq = ++searchSeqRef.current;
    setIsSearching(true);
    setLoadError(null);
    try {
      const res = await searchAdminInventoryProductsAction({
        query: query.trim(),
        page,
        limit: 10,
      });

      // Discard stale out-of-order response
      if (seq !== searchSeqRef.current) {
        return;
      }

      if (res.success) {
        setProducts(res.products);
        setTotalCount(res.totalCount);
        setLoadError(null);
        // If current product not in new list, pick first
        if (res.products.length > 0) {
          const productStillVisible = res.products.some((p) => p.id === selectedProductId);
          if (!productStillVisible) {
            setSelectedProductId(res.products[0].id);
            if (res.products[0].variants.length === 1) {
              setSelectedVariantId(res.products[0].variants[0].id);
            }
          }
        } else {
          setSelectedProductId(null);
          setSelectedVariantId(null);
        }
      } else {
        const err = res.error || 'Failed to search inventory products.';
        setLoadError(err);
        setErrorMessage(err);
        setProducts([]);
        setTotalCount(0);
        setSelectedProductId(null);
        setSelectedVariantId(null);
      }
    } catch (err: unknown) {
      if (seq !== searchSeqRef.current) return;
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setLoadError(msg);
      setErrorMessage(msg);
      setProducts([]);
      setTotalCount(0);
      setSelectedProductId(null);
      setSelectedVariantId(null);
    } finally {
      if (seq === searchSeqRef.current) {
        setIsSearching(false);
      }
    }
  }, [selectedProductId]);

  const handleRetry = useCallback(() => {
    setErrorMessage(null);
    executeSearch(searchTerm, currentPage);
  }, [executeSearch, searchTerm, currentPage]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSearchTerm(val);
    setCurrentPage(1);

    if (searchDebounceTimer.current) {
      clearTimeout(searchDebounceTimer.current);
    }

    searchDebounceTimer.current = setTimeout(() => {
      executeSearch(val, 1);
    }, 300);
  }

  function handlePageChange(newPage: number) {
    setCurrentPage(newPage);
    executeSearch(searchTerm, newPage);
  }

  // Parse and validate quantity adjustment input
  function parseAdjustment(input: string): {
    valid: boolean;
    value: number;
    error?: string;
  } {
    const trimmed = input.trim();
    if (!trimmed) {
      return { valid: false, value: 0, error: 'Please enter a quantity adjustment amount.' };
    }

    // Must be a whole integer, allowing optional leading + or -
    if (!/^[-+]?\d+$/.test(trimmed)) {
      return {
        valid: false,
        value: 0,
        error: 'Adjustment must be a whole integer (+ to add stock, - to subtract stock). Decimals are not permitted.',
      };
    }

    const val = parseInt(trimmed, 10);
    if (isNaN(val)) {
      return { valid: false, value: 0, error: 'Invalid numerical format.' };
    }

    if (val === 0) {
      return { valid: false, value: 0, error: 'Adjustment quantity cannot be zero.' };
    }

    return { valid: true, value: val };
  }

  // Open adjustment modal
  function handleOpenAdjustment() {
    if (!selectedVariant) return;
    setAdjustmentInput('');
    setAdjustmentError(null);
    setReason('stock_added');
    setReferenceNotes('');
    setErrorMessage(null);
    setConfirmationStep(false);
    setModalOpen(true);
  }

  // Step 1: Proceed to confirmation
  function handleProceedToConfirmation(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVariant) return;

    const parsed = parseAdjustment(adjustmentInput);
    if (!parsed.valid) {
      setAdjustmentError(parsed.error || 'Invalid adjustment amount.');
      return;
    }

    const projectedStock = selectedVariant.stockQuantity + parsed.value;
    if (projectedStock < 0) {
      setAdjustmentError(
        `Cannot reduce stock below 0. Current stock is ${selectedVariant.stockQuantity}, so the maximum reduction allowed is -${selectedVariant.stockQuantity}.`
      );
      return;
    }

    setAdjustmentError(null);
    setConfirmationStep(true);
  }

  // Step 2: Save verified adjustment
  async function handleConfirmAndSave() {
    if (!selectedVariant) return;

    const parsed = parseAdjustment(adjustmentInput);
    if (!parsed.valid) return;

    startTransition(async () => {
      const res = await adjustVariantStockAction({
        variantId: selectedVariant.id,
        quantityChange: parsed.value,
        reason,
        notes: referenceNotes || undefined,
      });

      if (!res.success || res.newQuantity === undefined) {
        setErrorMessage(res.error || 'Failed to adjust variant stock.');
        setConfirmationStep(false);
        return;
      }

      // Update variant stock in local products state
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== selectedProduct?.id) return p;
          const updatedVariants = p.variants.map((v) =>
            v.id === selectedVariant.id
              ? {
                  ...v,
                  stockQuantity: res.newQuantity!,
                  stockStatus:
                    res.newQuantity! <= 0
                      ? 'out_of_stock'
                      : res.newQuantity! <= v.lowStockThreshold
                      ? 'low_stock'
                      : 'in_stock',
                }
              : v
          );
          const totalStock = updatedVariants.reduce((sum, v) => sum + v.stockQuantity, 0);
          return {
            ...p,
            variants: updatedVariants,
            totalStock,
            hasLowStock: updatedVariants.some((v) => v.stockStatus === 'low_stock'),
            hasOutOfStock: updatedVariants.some((v) => v.stockStatus === 'out_of_stock'),
          };
        })
      );

      // Refresh movement history immediately
      await fetchMovements(selectedVariant.id);

      setSuccessMessage(
        `Inventory for ${selectedVariant.sku} updated to ${res.newQuantity} units.`
      );
      setModalOpen(false);
      setConfirmationStep(false);
    });
  }

  const parsedCurrent = parseAdjustment(adjustmentInput);
  const projectedStock =
    selectedVariant && parsedCurrent.valid
      ? selectedVariant.stockQuantity + parsedCurrent.value
      : selectedVariant?.stockQuantity ?? 0;

  const totalPages = Math.ceil(totalCount / 10);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-luxury-card p-5 rounded-md border border-luxury-border">
        <div>
          <h2 className="text-xl font-serif text-white flex items-center gap-2">
            <Archive className="h-5 w-5 text-luxury-gold" />
            Inventory Control & Stock Movements
          </h2>
          <p className="text-sm text-neutral-400 mt-0.5">
            Search products and adjust variant stock with audited movement ledger logs.
          </p>
        </div>

        <Link href="/admin/products/new">
          <Button variant="gold" size="sm">
            Add New Jewelry
          </Button>
        </Link>
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="flex items-center justify-between gap-3 bg-emerald-950/80 border border-emerald-800/80 text-emerald-200 px-4 py-3 rounded-md text-sm shadow-md">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-xs text-emerald-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center justify-between gap-3 bg-rose-950/80 border border-rose-800/80 text-rose-200 px-4 py-3 rounded-md text-sm shadow-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-xs text-rose-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main 2-Column Workflow: Search Products (Left) & Variant Details / Adjust (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Search & Product Selection List (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-luxury-card border border-luxury-border rounded-md p-4 space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300">
              Search Products & Variants
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
              <Input
                type="text"
                placeholder="Product name, product SKU, or variant SKU..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="pl-9 bg-luxury-surface border-neutral-700 text-white placeholder:text-neutral-500 text-sm"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-luxury-gold" />
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] text-neutral-400">
              <span>{totalCount} matching jewelry items</span>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    executeSearch('', 1);
                  }}
                  className="underline hover:text-luxury-gold"
                >
                  Clear search
                </button>
              )}
            </div>
          </div>

          {/* Compact Product Results List */}
          <div
            className={`bg-luxury-card border border-luxury-border rounded-md divide-y divide-luxury-border overflow-hidden transition-opacity duration-200 ${
              isSearching ? 'opacity-70' : 'opacity-100'
            }`}
          >
            {loadError ? (
              <div className="p-8 text-center space-y-3 bg-rose-950/20">
                <div className="flex items-center justify-center gap-2 text-rose-400 text-sm font-medium">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <span>Failed to load inventory</span>
                </div>
                <p className="text-xs text-neutral-400 max-w-xs mx-auto leading-relaxed">
                  {loadError}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  className="text-xs gap-1.5 border-rose-800/80 hover:bg-rose-950/40 text-neutral-200 mt-1"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-luxury-gold" />
                  Retry
                </Button>
              </div>
            ) : products.length === 0 ? (
              <div className="p-8 text-center text-neutral-400 text-sm">
                No jewelry products found matching your search.
              </div>
            ) : (
              products.map((product) => {
                const isSelected = product.id === selectedProductId;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => setSelectedProductId(product.id)}
                    className={`w-full text-left p-4 transition-colors flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-neutral-800/90 border-l-4 border-l-luxury-gold'
                        : 'hover:bg-neutral-900/60'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-serif text-sm font-semibold text-white truncate">
                          {product.name}
                        </span>
                        {!product.isActive && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1 text-neutral-400">
                            Draft
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-neutral-400 flex items-center gap-2">
                        <span>{product.categoryName}</span>
                        {product.sku && (
                          <>
                            <span>•</span>
                            <span className="font-mono">{product.sku}</span>
                          </>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-300 flex items-center gap-3 pt-0.5">
                        <span>
                          <strong className="text-white font-mono">{product.variantCount}</strong>{' '}
                          {product.variantCount === 1 ? 'variation' : 'variations'}
                        </span>
                        <span>•</span>
                        <span>
                          Total stock:{' '}
                          <strong className="text-luxury-gold font-mono">{product.totalStock}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {product.hasOutOfStock ? (
                        <span className="h-2 w-2 rounded-full bg-rose-500" title="Out of stock variant" />
                      ) : product.hasLowStock ? (
                        <span className="h-2 w-2 rounded-full bg-amber-500" title="Low stock variant" />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-emerald-500" title="In stock" />
                      )}
                      <ChevronRight
                        className={`h-4 w-4 ${isSelected ? 'text-luxury-gold' : 'text-neutral-500'}`}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-luxury-card border border-luxury-border p-3 rounded-md text-xs text-neutral-400">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1 || isSearching}
                onClick={() => handlePageChange(currentPage - 1)}
                className="h-7 px-2.5 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Previous
              </Button>
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages || isSearching}
                onClick={() => handlePageChange(currentPage + 1)}
                className="h-7 px-2.5 text-xs"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}
        </div>

        {/* Right Column: Selected Product & Variant Details (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {!selectedProduct ? (
            <div className="bg-luxury-card border border-luxury-border rounded-md p-12 text-center text-neutral-400">
              {loadError ? (
                <div className="space-y-3 max-w-sm mx-auto">
                  <div className="flex items-center justify-center gap-2 text-rose-400 text-sm font-medium">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <span>Unable to load product details</span>
                  </div>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    A database error occurred while querying the catalog. Please click Retry below to attempt loading again.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRetry}
                    className="text-xs gap-1.5 mt-2"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-luxury-gold" />
                    Retry
                  </Button>
                </div>
              ) : (
                'Select a jewelry product on the left to manage stock and view movement logs.'
              )}
            </div>
          ) : (
            <>
              {/* Product Header Card */}
              <div className="bg-luxury-card border border-luxury-border rounded-md p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-luxury-border pb-4">
                  <div>
                    <h3 className="text-lg font-serif font-bold text-white">
                      {selectedProduct.name}
                    </h3>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Category: <span className="text-neutral-200">{selectedProduct.categoryName}</span>
                    </p>
                  </div>
                  <Link
                    href={`/admin/products/${selectedProduct.id}`}
                    className="inline-flex items-center gap-1.5 text-xs text-luxury-gold hover:underline"
                  >
                    <span>Edit Product Details</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                {/* Variation Selector (Auto-selected if single variant) */}
                <div className="space-y-2">
                  <label className="block text-xs uppercase tracking-wider font-semibold text-neutral-300">
                    Product Variations ({selectedProduct.variants.length})
                  </label>

                  {selectedProduct.variants.length === 1 ? (
                    <div className="p-3 bg-luxury-surface border border-neutral-700 rounded text-xs flex items-center justify-between text-white">
                      <div>
                        <span className="font-semibold">{selectedProduct.variants[0].title}</span>{' '}
                        <span className="text-neutral-400 font-mono">({selectedProduct.variants[0].sku})</span>
                      </div>
                      <Badge variant="outline" className="text-emerald-400 border-emerald-800 text-[10px]">
                        Single Variant Auto-Selected
                      </Badge>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.variants.map((v) => {
                        const isVarSelected = v.id === selectedVariantId;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => setSelectedVariantId(v.id)}
                            className={`px-3 py-2 rounded text-xs transition-all border flex items-center gap-2 ${
                              isVarSelected
                                ? 'bg-luxury-gold text-luxury-black border-luxury-gold font-bold shadow-md'
                                : 'bg-luxury-surface text-neutral-300 border-neutral-700 hover:border-neutral-500'
                            }`}
                          >
                            <span>{v.title}</span>
                            <span className="font-mono text-[11px] opacity-80">
                              (Stock: {v.stockQuantity})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Variant Stock Detail Card */}
              {selectedVariant ? (
                <div className="bg-luxury-card border border-luxury-border rounded-md p-5 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-luxury-border pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-serif text-base font-semibold text-white">
                          {selectedVariant.title}
                        </h4>
                        <Badge
                          variant="outline"
                          className={
                            selectedVariant.stockStatus === 'out_of_stock'
                              ? 'text-rose-400 border-rose-800'
                              : selectedVariant.stockStatus === 'low_stock'
                              ? 'text-amber-400 border-amber-800'
                              : 'text-emerald-400 border-emerald-800'
                          }
                        >
                          {selectedVariant.stockStatus === 'out_of_stock'
                            ? 'Out of Stock'
                            : selectedVariant.stockStatus === 'low_stock'
                            ? 'Low Stock'
                            : 'In Stock'}
                        </Badge>
                      </div>
                      <p className="text-xs font-mono text-neutral-400 mt-1">
                        SKU: <span className="text-white font-bold">{selectedVariant.sku}</span> • Selling Price:{' '}
                        <span className="text-luxury-gold">{formatCurrency(selectedVariant.price)}</span>
                      </p>
                    </div>

                    <Button
                      variant="gold"
                      size="sm"
                      onClick={handleOpenAdjustment}
                      className="shrink-0 flex items-center gap-2"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      <span>Adjust Stock</span>
                    </Button>
                  </div>

                  {/* Stock Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-luxury-surface p-3.5 rounded border border-neutral-800">
                      <div className="text-[11px] text-neutral-400 uppercase tracking-wider">Current Stock</div>
                      <div className="text-2xl font-bold font-mono text-white mt-1">
                        {selectedVariant.stockQuantity}{' '}
                        <span className="text-xs font-sans font-normal text-neutral-400">units</span>
                      </div>
                    </div>

                    <div className="bg-luxury-surface p-3.5 rounded border border-neutral-800">
                      <div className="text-[11px] text-neutral-400 uppercase tracking-wider">Low Stock Threshold</div>
                      <div className="text-2xl font-bold font-mono text-neutral-300 mt-1">
                        {selectedVariant.lowStockThreshold}{' '}
                        <span className="text-xs font-sans font-normal text-neutral-400">units</span>
                      </div>
                    </div>

                    <div className="col-span-2 sm:col-span-1 bg-luxury-surface p-3.5 rounded border border-neutral-800">
                      <div className="text-[11px] text-neutral-400 uppercase tracking-wider">Purchase Cost</div>
                      <div className="text-lg font-bold font-mono text-neutral-300 mt-1.5">
                        {selectedVariant.purchaseCost > 0
                          ? formatCurrency(selectedVariant.purchaseCost)
                          : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Audited Movement History Table */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs uppercase tracking-wider font-semibold text-neutral-300 flex items-center gap-1.5">
                        <History className="h-4 w-4 text-luxury-gold" />
                        Audited Movement History
                      </h5>
                      <button
                        type="button"
                        onClick={() => fetchMovements(selectedVariant.id)}
                        disabled={isLoadingMovements}
                        className="text-xs text-neutral-400 hover:text-white flex items-center gap-1"
                        title="Refresh movement history"
                      >
                        <RotateCcw className={`h-3 w-3 ${isLoadingMovements ? 'animate-spin text-luxury-gold' : ''}`} />
                        <span>Refresh</span>
                      </button>
                    </div>

                    {isLoadingMovements ? (
                      <div className="p-8 text-center text-neutral-400 text-xs flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-luxury-gold" />
                        Loading movement records...
                      </div>
                    ) : movementHistory.length === 0 ? (
                      <div className="p-6 bg-luxury-surface rounded border border-neutral-800 text-center text-neutral-400 text-xs">
                        No historical inventory movements logged for this variant.
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-neutral-800 rounded bg-luxury-surface">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-neutral-900 border-b border-neutral-800 text-neutral-400 uppercase text-[10px]">
                            <tr>
                              <th className="py-2.5 px-3">Date</th>
                              <th className="py-2.5 px-3">Previous</th>
                              <th className="py-2.5 px-3">Change</th>
                              <th className="py-2.5 px-3">New Stock</th>
                              <th className="py-2.5 px-3">Reason</th>
                              <th className="py-2.5 px-3">Reference / Notes</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-800">
                            {movementHistory.map((m) => (
                              <tr key={m.id} className="hover:bg-neutral-850">
                                <td className="py-2 px-3 text-neutral-400 whitespace-nowrap">
                                  {new Date(m.createdAt).toLocaleDateString()} {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="py-2 px-3 font-mono text-neutral-300">
                                  {m.previousQuantity}
                                </td>
                                <td className="py-2 px-3 font-mono font-bold">
                                  {m.quantityChange > 0 ? (
                                    <span className="text-emerald-400">+{m.quantityChange}</span>
                                  ) : (
                                    <span className="text-rose-400">{m.quantityChange}</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-white">
                                  {m.newQuantity}
                                </td>
                                <td className="py-2 px-3 text-neutral-300 capitalize">
                                  {m.reason.replace(/_/g, ' ')}
                                </td>
                                <td className="py-2 px-3 text-neutral-400 italic truncate max-w-[150px]">
                                  {m.referenceId || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-luxury-card border border-luxury-border rounded-md p-8 text-center text-neutral-400 text-sm">
                  Please select a variant to manage stock.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Adjustment Modal with Confirmation Step */}
      {modalOpen && selectedVariant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-luxury-card border border-luxury-border rounded-lg max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => {
                setModalOpen(false);
                setConfirmationStep(false);
              }}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white"
              aria-label="Close modal"
            >
              ✕
            </button>

            {!confirmationStep ? (
              // Step 1: Input Adjustment & Reason
              <div>
                <h3 className="text-xl font-serif text-white mb-1">Adjust Inventory</h3>
                <p className="text-xs text-neutral-400 mb-4">
                  {selectedProduct?.name} — <span className="text-white font-semibold">{selectedVariant.title}</span> (SKU: {selectedVariant.sku})
                </p>

                <form onSubmit={handleProceedToConfirmation} className="space-y-4">
                  <div className="bg-luxury-surface p-3 rounded border border-neutral-700 text-sm flex justify-between">
                    <span className="text-neutral-400">Current Stock:</span>
                    <span className="font-mono font-bold text-white">{selectedVariant.stockQuantity} units</span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Quantity Adjustment (+ to add, - to subtract)
                    </label>
                    <Input
                      type="text"
                      value={adjustmentInput}
                      onChange={(e) => {
                        setAdjustmentInput(e.target.value);
                        setAdjustmentError(null);
                      }}
                      placeholder="e.g. +10 or -3"
                      className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                      autoFocus
                    />
                    {adjustmentError ? (
                      <span className="text-[11px] text-rose-400 mt-1 block">
                        {adjustmentError}
                      </span>
                    ) : (
                      <span className="text-[11px] text-neutral-400 mt-1 block">
                        Projected stock will be:{' '}
                        <strong
                          className={`font-mono ${
                            projectedStock < 0
                              ? 'text-rose-400'
                              : projectedStock <= selectedVariant.lowStockThreshold
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {projectedStock} units
                        </strong>
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Movement Reason
                    </label>
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value as any)}
                      className="w-full bg-luxury-surface border border-neutral-700 text-white text-sm rounded-sm h-10 px-3 focus:outline-none focus:border-luxury-gold/70"
                    >
                      <option value="stock_added">Stock Added / New Restock</option>
                      <option value="manual_adjustment">Manual Adjustment / Physical Recount</option>
                      <option value="correction">Inventory Discrepancy Correction</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Audit Notes / Reference ID (Optional)
                    </label>
                    <Input
                      value={referenceNotes}
                      onChange={(e) => setReferenceNotes(e.target.value)}
                      placeholder="e.g. Batch #104 or physical audit recount"
                      className="bg-luxury-surface border-neutral-700 text-white text-sm"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-luxury-border">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setModalOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="gold"
                      disabled={!parsedCurrent.valid || projectedStock < 0}
                    >
                      Review Adjustment
                    </Button>
                  </div>
                </form>
              </div>
            ) : (
              // Step 2: Confirmation Modal Step
              <div>
                <h3 className="text-xl font-serif text-white mb-1">Confirm Stock Adjustment</h3>
                <p className="text-xs text-neutral-400 mb-4">
                  Please review and confirm this audited inventory change before saving.
                </p>

                <div className="bg-luxury-surface border border-neutral-700 rounded-md p-4 space-y-3 mb-5 text-sm">
                  <div className="flex justify-between border-b border-neutral-800 pb-2">
                    <span className="text-neutral-400">Variant SKU:</span>
                    <span className="font-mono font-bold text-white">{selectedVariant.sku}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Current Stock:</span>
                    <span className="font-mono text-neutral-200">{selectedVariant.stockQuantity} units</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Adjustment Amount:</span>
                    <span className="font-mono font-bold">
                      {parsedCurrent.value > 0 ? (
                        <span className="text-emerald-400">+{parsedCurrent.value} units</span>
                      ) : (
                        <span className="text-rose-400">{parsedCurrent.value} units</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-neutral-800 pt-2 text-base font-bold">
                    <span className="text-white">New Stock:</span>
                    <span className="font-mono text-luxury-gold">{projectedStock} units</span>
                  </div>
                  <div className="flex justify-between border-t border-neutral-800 pt-2 text-xs">
                    <span className="text-neutral-400">Reason:</span>
                    <span className="text-neutral-200 capitalize">{reason.replace(/_/g, ' ')}</span>
                  </div>
                  {referenceNotes && (
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-400">Reference:</span>
                      <span className="text-neutral-300 italic">{referenceNotes}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-luxury-border">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => setConfirmationStep(false)}
                  >
                    Back to Edit
                  </Button>
                  <Button
                    type="button"
                    variant="gold"
                    disabled={isPending}
                    onClick={handleConfirmAndSave}
                    className="flex items-center gap-2"
                  >
                    {isPending && <Loader2 className="h-4 w-4 animate-spin text-luxury-black" />}
                    <span>Confirm & Apply Stock</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
