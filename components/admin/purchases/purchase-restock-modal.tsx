'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Truck, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight, 
  Calculator, 
  ShieldCheck, 
  X,
  Layers,
  Receipt,
  Search,
  Package
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  calculateMovingWeightedAverageCost, 
  decimalLkrToCents, 
  centsToDecimalLkr 
} from '@/lib/purchases/calculations';
import { 
  getEligiblePurchaseVariationsAction,
  transferPurchaseStockToVariantAction,
  getStorefrontVariantDetailsAction
} from '@/lib/purchases/admin-actions';
import { searchAdminInventoryProductsAction } from '@/lib/catalog/variants';
import type { EligiblePurchaseVariation } from '@/lib/purchases/mock-data';

export interface TargetVariantInfo {
  id: string;
  title: string;
  sku: string;
  stockQuantity: number;
  purchaseCost: number;
  productTitle: string;
}

export interface SourceBatchVariationInfo {
  id: string; // batchVariationId
  batchNumber: string;
  supplierName?: string;
  itemName: string;
  variationTitle: string;
  availableQuantity: number;
  unitLandedCostCents: number;
  attributes?: Record<string, string>;
}

export interface PurchaseRestockModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Mode 1: Preselected target variant from inventory manager
  targetVariant?: TargetVariantInfo;
  // Mode 2: Preselected source purchase variation from batch detail view
  sourceBatchVariation?: SourceBatchVariationInfo;
  onSuccess: (newStock: number, blendedCost: number) => void;
}

export function PurchaseRestockModal({
  isOpen,
  onClose,
  targetVariant: initialTargetVariant,
  sourceBatchVariation,
  onSuccess,
}: PurchaseRestockModalProps) {
  // Variations for Mode 1
  const [variations, setVariations] = useState<EligiblePurchaseVariation[]>([]);
  const [isLoadingVariations, setIsLoadingVariations] = useState(false);
  const [selectedBatchVariationId, setSelectedBatchVariationId] = useState<string | null>(null);

  // Target variant for Mode 2
  const [activeTargetVariant, setActiveTargetVariant] = useState<TargetVariantInfo | null>(
    initialTargetVariant || null
  );
  const [isLoadingTargetVariant, setIsLoadingTargetVariant] = useState(false);

  // Search state for Mode 2 when no target variant is preselected or user wants to search
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Restock Quantity
  const [restockQuantity, setRestockQuantity] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Stable idempotency key ref to prevent duplicate submission on double-clicks or retries
  const restockAttemptKeyRef = useRef<string | null>(null);

  // Sync initial target variant if passed
  useEffect(() => {
    if (initialTargetVariant) {
      setActiveTargetVariant(initialTargetVariant);
    }
  }, [initialTargetVariant]);

  // Mode 1: Fetch eligible variations when targetVariant is provided and source is not
  useEffect(() => {
    let isMounted = true;
    async function loadVariations() {
      if (!isOpen || sourceBatchVariation) return;
      setIsLoadingVariations(true);
      const res = await getEligiblePurchaseVariationsAction();
      if (isMounted && res.success) {
        setVariations(res.variations);
        if (res.variations.length > 0) {
          setSelectedBatchVariationId((prev) => prev || res.variations[0].batchVariationId);
        }
      }
      if (isMounted) setIsLoadingVariations(false);
    }
    loadVariations();
    return () => { isMounted = false; };
  }, [isOpen, sourceBatchVariation]);

  // Mode 2: Fetch target variant if sourceBatchVariation has existing_variant_id in attributes
  useEffect(() => {
    let isMounted = true;
    async function resolveSourceTarget() {
      if (!isOpen || !sourceBatchVariation) return;
      
      const existingVariantId = sourceBatchVariation.attributes?.existing_variant_id;
      if (existingVariantId) {
        setIsLoadingTargetVariant(true);
        const res = await getStorefrontVariantDetailsAction(existingVariantId);
        if (isMounted && res.success && res.variant) {
          setActiveTargetVariant(res.variant);
        }
        if (isMounted) setIsLoadingTargetVariant(false);
      } else {
        setActiveTargetVariant(null);
      }

      setRestockQuantity(Math.max(1, sourceBatchVariation.availableQuantity));
    }
    resolveSourceTarget();
    return () => { isMounted = false; };
  }, [isOpen, sourceBatchVariation]);

  // Debounced search for Mode 2 target variant selection
  useEffect(() => {
    if (!isOpen || !sourceBatchVariation || activeTargetVariant) return;
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await searchAdminInventoryProductsAction({
          query: searchQuery.trim(),
          limit: 6,
        });
        if (res.success && res.products) {
          setSearchResults(res.products);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, isOpen, sourceBatchVariation, activeTargetVariant]);

  // Effective Source Variation
  const effectiveSourceVariation = useMemo(() => {
    if (sourceBatchVariation) {
      return {
        batchVariationId: sourceBatchVariation.id,
        batchNumber: sourceBatchVariation.batchNumber,
        supplierName: sourceBatchVariation.supplierName || 'Supplier',
        itemName: sourceBatchVariation.itemName,
        variationTitle: sourceBatchVariation.variationTitle,
        availableQuantity: sourceBatchVariation.availableQuantity,
        unitLandedCostCents: sourceBatchVariation.unitLandedCostCents,
        unitLandedCostLkr: centsToDecimalLkr(sourceBatchVariation.unitLandedCostCents),
      };
    }
    return variations.find((v) => v.batchVariationId === selectedBatchVariationId) || null;
  }, [sourceBatchVariation, variations, selectedBatchVariationId]);

  // Live Moving Weighted Average Cost (WAC) Preview
  const wacPreview = useMemo(() => {
    if (!effectiveSourceVariation || !activeTargetVariant || restockQuantity <= 0) {
      return null;
    }

    try {
      const currentStock = activeTargetVariant.stockQuantity;
      const currentCostCents = decimalLkrToCents(activeTargetVariant.purchaseCost || 0);
      const transferQty = Math.min(restockQuantity, effectiveSourceVariation.availableQuantity);
      const transferUnitCostCents = BigInt(effectiveSourceVariation.unitLandedCostCents);

      const newCostCents = calculateMovingWeightedAverageCost(
        currentStock,
        currentCostCents,
        transferQty,
        transferUnitCostCents
      );

      const newStock = currentStock + transferQty;
      const newCostLkr = centsToDecimalLkr(newCostCents);

      return {
        newStock,
        newCostLkr,
        transferQty,
        costDelta: newCostLkr - activeTargetVariant.purchaseCost,
      };
    } catch {
      return null;
    }
  }, [effectiveSourceVariation, activeTargetVariant, restockQuantity]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; // Prevent double-clicking and overlapping concurrent submissions
    setErrorMessage(null);

    if (!effectiveSourceVariation) {
      setErrorMessage('Please select a purchase variation to restock from.');
      return;
    }

    if (!activeTargetVariant) {
      setErrorMessage('Please select the target storefront product variation to restock.');
      return;
    }

    if (restockQuantity <= 0) {
      setErrorMessage('Restock quantity must be at least 1.');
      return;
    }

    if (restockQuantity > effectiveSourceVariation.availableQuantity) {
      setErrorMessage(
        `Cannot restock ${restockQuantity} units. Only ${effectiveSourceVariation.availableQuantity} unlinked units are available.`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      // Re-use stable idempotency key for retries of the identical transfer
      if (!restockAttemptKeyRef.current) {
        restockAttemptKeyRef.current = `restock-${activeTargetVariant.id}-${effectiveSourceVariation.batchVariationId}-${Date.now()}`;
      }
      const idempotencyKey = restockAttemptKeyRef.current;

      const res = await transferPurchaseStockToVariantAction({
        batchVariationId: effectiveSourceVariation.batchVariationId,
        targetVariantId: activeTargetVariant.id,
        quantity: restockQuantity,
        transferType: 'restock_existing',
        idempotencyKey,
      });

      if (!res.success) {
        restockAttemptKeyRef.current = null; // Clear key on error to allow clean correction
        setErrorMessage(res.error || 'Failed to transfer purchase stock.');
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      onSuccess(
        res.newStock ?? (wacPreview?.newStock || activeTargetVariant.stockQuantity + restockQuantity),
        res.blendedCost ?? (wacPreview?.newCostLkr || activeTargetVariant.purchaseCost)
      );
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An error occurred during restocking.');
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <Card className="max-w-2xl w-full bg-neutral-900 border-neutral-800 text-neutral-200 shadow-2xl">
        <form onSubmit={handleSubmit}>
          <CardHeader className="p-5 border-b border-neutral-800 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-serif text-white flex items-center gap-2">
                <Truck className="w-5 h-5 text-luxury-gold" />
                Restock Existing Variant from Purchase Batch
              </CardTitle>
              {activeTargetVariant ? (
                <p className="text-xs text-neutral-400 mt-0.5">
                  Target: <span className="text-white font-medium">{activeTargetVariant.productTitle}</span> ({activeTargetVariant.title}) •{' '}
                  <span className="font-mono text-luxury-gold">{activeTargetVariant.sku}</span>
                </p>
              ) : (
                <p className="text-xs text-neutral-400 mt-0.5">
                  Select an existing storefront product variation to receive inbound batch stock.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="text-neutral-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </CardHeader>

          <CardContent className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {errorMessage && (
              <div className="p-3.5 rounded-sm bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Inbound Source Batch Variation Details */}
            {effectiveSourceVariation && (
              <div className="p-3.5 rounded-sm bg-neutral-950 border border-neutral-800 text-xs space-y-2">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-luxury-gold" />
                  Source Purchase Batch Variation
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-white text-sm">
                      {effectiveSourceVariation.itemName} — {effectiveSourceVariation.variationTitle}
                    </div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">
                      Batch: <span className="font-mono text-luxury-gold">{effectiveSourceVariation.batchNumber}</span> • {effectiveSourceVariation.supplierName}
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <div className="font-mono text-emerald-400 font-semibold">
                      {effectiveSourceVariation.availableQuantity} available to transfer
                    </div>
                    <div className="text-[11px] font-mono text-luxury-gold mt-0.5">
                      Rs. {effectiveSourceVariation.unitLandedCostLkr.toFixed(2)} / unit landed
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Target Variant Current Status or Selection */}
            {isLoadingTargetVariant ? (
              <div className="p-4 text-center text-xs text-neutral-400">Loading target product details...</div>
            ) : activeTargetVariant ? (
              <div className="grid grid-cols-2 gap-3 p-3 rounded-sm bg-neutral-950 border border-neutral-800 text-xs">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 text-[10px] uppercase block">Current Storefront Stock</span>
                    {sourceBatchVariation && (
                      <button
                        type="button"
                        onClick={() => setActiveTargetVariant(null)}
                        className="text-[10px] text-luxury-gold hover:underline"
                      >
                        Change Variant
                      </button>
                    )}
                  </div>
                  <span className="text-base font-bold font-mono text-white mt-0.5 block">
                    {activeTargetVariant.stockQuantity} units
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 text-[10px] uppercase block">Current Valuation Cost</span>
                  <span className="text-base font-bold font-mono text-luxury-gold mt-0.5 block">
                    Rs. {activeTargetVariant.purchaseCost.toFixed(2)}
                  </span>
                </div>
              </div>
            ) : (
              /* Search and select target variant if not yet selected */
              <div className="space-y-2 p-3.5 rounded-sm bg-neutral-950 border border-neutral-800">
                <Label className="text-xs text-neutral-300 uppercase font-semibold flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-luxury-gold" />
                  Select Target Storefront Product & Variant
                </Label>
                <Input
                  placeholder="Search existing product by title or SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-neutral-900 border-neutral-800 text-white text-xs h-8"
                />

                {isSearching && (
                  <div className="text-[11px] text-neutral-400 py-1">Searching catalog products...</div>
                )}

                {searchResults.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto pt-2">
                    {searchResults.map((p) => (
                      <div key={p.id} className="p-2 rounded bg-neutral-900 border border-neutral-800 text-xs space-y-1.5">
                        <div className="font-medium text-white flex items-center justify-between">
                          <span>{p.name}</span>
                          <span className="text-[10px] text-neutral-400 font-mono">{p.product_code || ''}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(p.product_variants || []).map((v: any) => (
                            <Button
                              key={v.id}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setActiveTargetVariant({
                                  id: v.id,
                                  title: v.title || 'Default',
                                  sku: v.sku || '',
                                  stockQuantity: Number(v.stock_quantity || 0),
                                  purchaseCost: Number(v.purchase_cost || 0),
                                  productTitle: p.name,
                                });
                              }}
                              className="h-6 text-[10px] px-2 text-neutral-300 border-neutral-700 hover:border-luxury-gold hover:text-luxury-gold"
                            >
                              <span>{v.title} ({v.sku})</span>
                              <span className="ml-1 text-neutral-500 font-mono">[{v.stock_quantity} in stock]</span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Mode 1: Select Inbound Purchase Variation (when targetVariant is provided from inventory page) */}
            {!sourceBatchVariation && (
              <div className="space-y-1.5">
                <Label className="text-xs text-neutral-300 uppercase font-semibold">
                  Select Received Purchase Variation
                </Label>

                {variations.length === 0 ? (
                  <div className="p-4 rounded-sm bg-neutral-950 border border-neutral-800 text-xs text-neutral-500 text-center">
                    No received purchase variations with unlinked stock available. Record a physical receipt in Purchase Management first.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {variations.map((v) => {
                      const isSelected = selectedBatchVariationId === v.batchVariationId;
                      return (
                        <button
                          key={v.batchVariationId}
                          type="button"
                          onClick={() => {
                            setSelectedBatchVariationId(v.batchVariationId);
                            setRestockQuantity(Math.min(restockQuantity, v.availableQuantity));
                          }}
                          className={`w-full text-left p-3 rounded-sm border transition-all text-xs flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-luxury-gold/15 border-luxury-gold text-white'
                              : 'bg-neutral-950/70 border-neutral-800 hover:bg-neutral-800/40 text-neutral-300'
                          }`}
                        >
                          <div>
                            <div className="font-semibold text-white">{v.itemName} — {v.variationTitle}</div>
                            <div className="text-[11px] text-neutral-400 mt-0.5">
                              Batch: <span className="font-mono text-luxury-gold">{v.batchNumber}</span> • {v.supplierName}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="text-[11px] font-mono text-emerald-400 font-semibold">
                              {v.availableQuantity} available
                            </div>
                            <div className="text-[10px] font-mono text-neutral-400 mt-0.5">
                              Rs. {v.unitLandedCostLkr.toFixed(2)} / unit
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Restock Quantity Input */}
            {effectiveSourceVariation && activeTargetVariant && (
              <div className="space-y-1.5">
                <Label htmlFor="restockQty" className="text-xs text-neutral-300 uppercase font-semibold">
                  Restock Quantity (Max: {effectiveSourceVariation.availableQuantity})
                </Label>
                <Input
                  id="restockQty"
                  type="number"
                  min="1"
                  max={effectiveSourceVariation.availableQuantity}
                  value={restockQuantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setRestockQuantity(isNaN(val) ? 1 : Math.max(1, Math.min(effectiveSourceVariation.availableQuantity, val)));
                  }}
                  className="bg-neutral-950 border-neutral-800 text-white font-mono text-sm h-9"
                  required
                />
              </div>
            )}

            {/* Live Moving Weighted Average Cost (WAC) Preview */}
            {wacPreview && activeTargetVariant && effectiveSourceVariation && (
              <div className="p-4 rounded-sm border border-luxury-gold/30 bg-neutral-950 space-y-2 text-xs">
                <div className="flex items-center justify-between text-neutral-300 font-semibold border-b border-neutral-800 pb-2">
                  <span className="flex items-center gap-1.5 text-luxury-gold uppercase text-[11px]">
                    <Calculator className="w-3.5 h-3.5" />
                    Moving Weighted Average Cost Preview
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">Exact Integer Formula</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <span className="text-neutral-500 text-[10px] uppercase block">New Stock Level</span>
                    <span className="font-bold font-mono text-white text-sm">
                      {activeTargetVariant.stockQuantity} + {wacPreview.transferQty} = {wacPreview.newStock}
                    </span>
                  </div>

                  <div>
                    <span className="text-neutral-500 text-[10px] uppercase block">Inbound Landed Cost</span>
                    <span className="font-bold font-mono text-neutral-200 text-sm">
                      Rs. {effectiveSourceVariation.unitLandedCostLkr.toFixed(2)}
                    </span>
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <span className="text-luxury-gold text-[10px] uppercase block font-semibold">
                      Blended Landed Cost (WAC)
                    </span>
                    <span className="font-bold font-mono text-luxury-gold-light text-sm">
                      Rs. {wacPreview.newCostLkr.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="text-[11px] text-neutral-500">
              Confirming this transfer atomically updates the variant storefront stock, recalculates the moving weighted-average cost, records an inventory movement audit record, and updates the purchase variation ledger.
            </div>
          </CardContent>

          <div className="p-4 border-t border-neutral-800 flex items-center justify-end gap-3 bg-neutral-950/80">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="gold"
              size="sm"
              disabled={isSubmitting || !effectiveSourceVariation || !activeTargetVariant || restockQuantity <= 0}
              className="flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Transferring Stock...' : 'Confirm Stock Restock'}</span>
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
