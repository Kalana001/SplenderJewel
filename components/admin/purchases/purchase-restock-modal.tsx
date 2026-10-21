'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  Receipt
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  calculateMovingWeightedAverageCost, 
  decimalLkrToCents, 
  centsToDecimalLkr 
} from '@/lib/purchases/calculations.ts';
import { 
  getEligiblePurchaseVariationsAction,
  transferPurchaseStockToVariantAction 
} from '@/lib/purchases/admin-actions.ts';
import type { EligiblePurchaseVariation } from '@/lib/purchases/mock-data.ts';

interface PurchaseRestockModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetVariant: {
    id: string;
    title: string;
    sku: string;
    stockQuantity: number;
    purchaseCost: number;
    productTitle: string;
  };
  onSuccess: (newStock: number, blendedCost: number) => void;
}

export function PurchaseRestockModal({
  isOpen,
  onClose,
  targetVariant,
  onSuccess,
}: PurchaseRestockModalProps) {
  const [variations, setVariations] = useState<EligiblePurchaseVariation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedBatchVariationId, setSelectedBatchVariationId] = useState<string | null>(null);
  const [restockQuantity, setRestockQuantity] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadVariations() {
      if (!isOpen) return;
      setIsLoading(true);
      const res = await getEligiblePurchaseVariationsAction();
      if (isMounted && res.success) {
        setVariations(res.variations);
        if (res.variations.length > 0) {
          setSelectedBatchVariationId((prev) => prev || res.variations[0].batchVariationId);
        }
      }
      if (isMounted) setIsLoading(false);
    }
    loadVariations();
    return () => { isMounted = false; };
  }, [isOpen]);

  const selectedVariation = useMemo(() => {
    return variations.find((v) => v.batchVariationId === selectedBatchVariationId) || null;
  }, [variations, selectedBatchVariationId]);

  // Live Moving Weighted Average Cost (WAC) Preview
  const wacPreview = useMemo(() => {
    if (!selectedVariation || restockQuantity <= 0) {
      return null;
    }

    try {
      const currentStock = targetVariant.stockQuantity;
      const currentCostCents = decimalLkrToCents(targetVariant.purchaseCost || 0);
      const transferQty = Math.min(restockQuantity, selectedVariation.availableQuantity);
      const transferUnitCostCents = BigInt(selectedVariation.unitLandedCostCents);

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
        costDelta: newCostLkr - targetVariant.purchaseCost,
      };
    } catch {
      return null;
    }
  }, [selectedVariation, restockQuantity, targetVariant]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedVariation) {
      setErrorMessage('Please select a purchase variation to restock from.');
      return;
    }

    if (restockQuantity <= 0) {
      setErrorMessage('Restock quantity must be at least 1.');
      return;
    }

    if (restockQuantity > selectedVariation.availableQuantity) {
      setErrorMessage(
        `Cannot restock ${restockQuantity} units. Only ${selectedVariation.availableQuantity} unlinked units are available.`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const idempotencyKey = `restock-${targetVariant.id}-${selectedVariation.batchVariationId}-${Date.now()}`;
      const res = await transferPurchaseStockToVariantAction({
        batchVariationId: selectedVariation.batchVariationId,
        targetVariantId: targetVariant.id,
        quantity: restockQuantity,
        transferType: 'restock_existing',
        idempotencyKey,
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to transfer purchase stock.');
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      onSuccess(
        res.newStock ?? (wacPreview?.newStock || targetVariant.stockQuantity + restockQuantity),
        res.blendedCost ?? (wacPreview?.newCostLkr || targetVariant.purchaseCost)
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
                Restock Variant from Purchase Batch
              </CardTitle>
              <p className="text-xs text-neutral-400 mt-0.5">
                Target: <span className="text-white font-medium">{targetVariant.productTitle}</span> ({targetVariant.title}) •{' '}
                <span className="font-mono text-luxury-gold">{targetVariant.sku}</span>
              </p>
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

            {/* Target Variant Current Status */}
            <div className="grid grid-cols-2 gap-3 p-3 rounded-sm bg-neutral-950 border border-neutral-800 text-xs">
              <div>
                <span className="text-neutral-500 text-[10px] uppercase block">Current Storefront Stock</span>
                <span className="text-base font-bold font-mono text-white">{targetVariant.stockQuantity} units</span>
              </div>
              <div>
                <span className="text-neutral-500 text-[10px] uppercase block">Current Valuation Cost</span>
                <span className="text-base font-bold font-mono text-luxury-gold">
                  Rs. {targetVariant.purchaseCost.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Select Inbound Purchase Variation */}
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

            {/* Restock Quantity Input */}
            {selectedVariation && (
              <div className="space-y-1.5">
                <Label htmlFor="restockQty" className="text-xs text-neutral-300 uppercase font-semibold">
                  Restock Quantity (Max: {selectedVariation.availableQuantity})
                </Label>
                <Input
                  id="restockQty"
                  type="number"
                  min="1"
                  max={selectedVariation.availableQuantity}
                  value={restockQuantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setRestockQuantity(isNaN(val) ? 1 : Math.max(1, Math.min(selectedVariation.availableQuantity, val)));
                  }}
                  className="bg-neutral-950 border-neutral-800 text-white font-mono text-sm h-9"
                  required
                />
              </div>
            )}

            {/* Live Moving Weighted Average Cost (WAC) Preview */}
            {wacPreview && (
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
                      {targetVariant.stockQuantity} + {wacPreview.transferQty} = {wacPreview.newStock}
                    </span>
                  </div>

                  <div>
                    <span className="text-neutral-500 text-[10px] uppercase block">Inbound Landed Cost</span>
                    <span className="font-bold font-mono text-neutral-200 text-sm">
                      Rs. {selectedVariation?.unitLandedCostLkr.toFixed(2)}
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
              Confirming this transfer updates the variant stock level, recalculates the moving weighted-average cost, records an audit inventory movement, and updates the batch variation ledger.
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
              disabled={isSubmitting || !selectedVariation || restockQuantity <= 0}
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
