'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, 
  Search, 
  CheckCircle2, 
  Sparkles, 
  ShieldCheck, 
  ArrowRight, 
  Layers, 
  X,
  Truck,
  Receipt
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  getEligiblePurchaseVariationsAction 
} from '@/lib/purchases/admin-actions.ts';
import type { EligiblePurchaseVariation } from '@/lib/purchases/mock-data.ts';

export interface SelectedPurchaseLink {
  batchId: string;
  batchNumber: string;
  supplierName: string;
  invoiceNumber: string | null;
  batchItemId: string;
  itemName: string;
  itemCategoryHint: string | null;
  variations: Array<{
    batchVariationId: string;
    variationTitle: string;
    attributes: Record<string, string>;
    supplierSku: string | null;
    unitLandedCostLkr: number;
    allocatedQuantity: number;
    availableQuantity: number;
  }>;
}

interface PurchaseSourceSelectorProps {
  onSelectPurchaseItem: (selection: SelectedPurchaseLink) => void;
  currentLink: SelectedPurchaseLink | null;
  onClearLink: () => void;
}

export function PurchaseSourceSelector({
  onSelectPurchaseItem,
  currentLink,
  onClearLink,
}: PurchaseSourceSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [variations, setVariations] = useState<EligiblePurchaseVariation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBatchItemId, setSelectedBatchItemId] = useState<string | null>(null);
  const [allocatedQtys, setAllocatedQtys] = useState<Record<string, number>>({});

  useEffect(() => {
    let isMounted = true;
    async function loadEligible() {
      setIsLoading(true);
      const res = await getEligiblePurchaseVariationsAction();
      if (isMounted && res.success) {
        setVariations(res.variations);
      }
      if (isMounted) setIsLoading(false);
    }
    loadEligible();
    return () => { isMounted = false; };
  }, []);

  // Group variations by batchItemId
  const itemsMap = useMemo(() => {
    const map = new Map<string, {
      batchId: string;
      batchNumber: string;
      supplierName: string;
      invoiceNumber: string | null;
      purchaseDate: string;
      batchItemId: string;
      itemName: string;
      itemCategoryHint: string | null;
      variations: EligiblePurchaseVariation[];
    }>();

    for (const v of variations) {
      let group = map.get(v.batchItemId);
      if (!group) {
        group = {
          batchId: v.batchId,
          batchNumber: v.batchNumber,
          supplierName: v.supplierName,
          invoiceNumber: v.invoiceNumber,
          purchaseDate: v.purchaseDate,
          batchItemId: v.batchItemId,
          itemName: v.itemName,
          itemCategoryHint: v.itemCategoryHint,
          variations: [],
        };
        map.set(v.batchItemId, group);
      }
      group.variations.push(v);
    }

    return map;
  }, [variations]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return Array.from(itemsMap.values()).filter((item) => {
      if (!q) return true;
      return (
        item.itemName.toLowerCase().includes(q) ||
        item.batchNumber.toLowerCase().includes(q) ||
        item.supplierName.toLowerCase().includes(q)
      );
    });
  }, [itemsMap, searchQuery]);

  const activeGroup = selectedBatchItemId ? itemsMap.get(selectedBatchItemId) : null;

  const handleOpenModal = () => {
    setIsOpen(true);
    if (!selectedBatchItemId && filteredItems.length > 0) {
      handleSelectGroup(filteredItems[0].batchItemId);
    }
  };

  const handleSelectGroup = (itemId: string) => {
    setSelectedBatchItemId(itemId);
    const grp = itemsMap.get(itemId);
    if (grp) {
      const initial: Record<string, number> = {};
      for (const v of grp.variations) {
        initial[v.batchVariationId] = v.availableQuantity;
      }
      setAllocatedQtys(initial);
    }
  };

  const handleConfirmSelection = () => {
    if (!activeGroup) return;

    const selectedVars = activeGroup.variations.map((v) => ({
      batchVariationId: v.batchVariationId,
      variationTitle: v.variationTitle,
      attributes: v.attributes,
      supplierSku: v.supplierSku,
      unitLandedCostLkr: v.unitLandedCostLkr,
      allocatedQuantity: allocatedQtys[v.batchVariationId] ?? v.availableQuantity,
      availableQuantity: v.availableQuantity,
    }));

    onSelectPurchaseItem({
      batchId: activeGroup.batchId,
      batchNumber: activeGroup.batchNumber,
      supplierName: activeGroup.supplierName,
      invoiceNumber: activeGroup.invoiceNumber,
      batchItemId: activeGroup.batchItemId,
      itemName: activeGroup.itemName,
      itemCategoryHint: activeGroup.itemCategoryHint,
      variations: selectedVars,
    });

    setIsOpen(false);
  };

  return (
    <div>
      {/* Current Link Provenance Banner */}
      {currentLink ? (
        <div className="p-4 rounded-sm border border-luxury-gold/40 bg-neutral-900/90 text-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 rounded-full bg-luxury-gold/15 border border-luxury-gold/30 text-luxury-gold shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white text-xs sm:text-sm">
                  Verified Purchase Provenance Linked
                </span>
                <Badge variant="gold" className="text-[10px] py-0 font-mono">
                  {currentLink.batchNumber}
                </Badge>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Source: <span className="text-neutral-200">{currentLink.supplierName}</span> | Item:{' '}
                <span className="text-luxury-gold font-medium">{currentLink.itemName}</span> ({currentLink.variations.length} variations)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenModal}
              className="h-8 text-xs text-luxury-gold hover:bg-luxury-gold/10 border-neutral-700"
            >
              Change Source
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClearLink}
              className="h-8 text-xs text-neutral-400 hover:text-rose-400 border-neutral-800"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Unlink
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-sm border border-neutral-800 bg-neutral-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-neutral-800 text-neutral-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-neutral-200 uppercase tracking-wider">
                Purchase Stock Provenance (Recommended)
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Autofill product details, variations, and landed costs from received purchase batches.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="gold"
            size="sm"
            onClick={handleOpenModal}
            className="flex items-center gap-1.5 shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Select Purchase Source Item</span>
          </Button>
        </div>
      )}

      {/* Modal Selection Dialog */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <Card className="max-w-3xl w-full bg-neutral-900 border-neutral-800 text-neutral-200 shadow-2xl flex flex-col max-h-[85vh]">
            <CardHeader className="p-5 border-b border-neutral-800 flex flex-row items-center justify-between shrink-0">
              <div>
                <CardTitle className="text-base font-serif text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-luxury-gold" />
                  Select Received Purchase Item
                </CardTitle>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Choose a purchased jewelry item to autofill product details and allocate physical stock.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </CardHeader>

            {/* Filter Search */}
            <div className="p-4 border-b border-neutral-800/80 bg-neutral-950/60 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <Input
                  type="text"
                  placeholder="Search received items (e.g. 18K Gold Plated Stacking Ring), batch, or supplier..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-neutral-900 border-neutral-800 text-white text-xs"
                />
              </div>
            </div>

            {/* Content: List + Variation Allocation */}
            <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-neutral-800">
              {/* Left Item Selector */}
              <div className="md:col-span-5 p-3 space-y-2 overflow-y-auto max-h-[50vh]">
                <div className="text-[10px] text-neutral-500 uppercase font-semibold px-2">
                  Available Purchase Items ({filteredItems.length})
                </div>

                {filteredItems.length === 0 ? (
                  <div className="p-6 text-center text-xs text-neutral-500">
                    No received items with unlinked stock match your search.
                  </div>
                ) : (
                  filteredItems.map((item) => {
                    const isSelected = selectedBatchItemId === item.batchItemId;
                    const totalAvail = item.variations.reduce((sum, v) => sum + v.availableQuantity, 0);

                    return (
                      <button
                        key={item.batchItemId}
                        type="button"
                        onClick={() => handleSelectGroup(item.batchItemId)}
                        className={`w-full text-left p-3 rounded-sm border transition-all ${
                          isSelected
                            ? 'bg-luxury-gold/15 border-luxury-gold/50 text-white'
                            : 'bg-neutral-950/60 border-neutral-800/80 hover:bg-neutral-800/40 text-neutral-300'
                        }`}
                      >
                        <div className="font-medium text-xs text-white">{item.itemName}</div>
                        <div className="text-[11px] text-neutral-400 mt-0.5 truncate">
                          {item.supplierName} • {item.batchNumber}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-neutral-500 mt-2 pt-1.5 border-t border-neutral-800/50">
                          <span>{item.variations.length} variation(s)</span>
                          <span className="font-mono text-emerald-400 font-medium">
                            {totalAvail} units avail
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Right Variation & Quantity Allocation Panel */}
              <div className="md:col-span-7 p-4 space-y-4 max-h-[50vh] overflow-y-auto">
                {activeGroup ? (
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs text-neutral-400 uppercase font-semibold">
                        Selected Purchase Item
                      </div>
                      <div className="text-base font-serif font-bold text-white mt-1">
                        {activeGroup.itemName}
                      </div>
                      <div className="text-xs text-neutral-400">
                        Batch: <span className="font-mono text-luxury-gold">{activeGroup.batchNumber}</span> | Supplier:{' '}
                        <span className="text-neutral-200">{activeGroup.supplierName}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold text-neutral-300 uppercase">
                        Variation Stock Allocation
                      </div>

                      <div className="space-y-2">
                        {activeGroup.variations.map((v) => {
                          const currentVal = allocatedQtys[v.batchVariationId] ?? v.availableQuantity;

                          return (
                            <div
                              key={v.batchVariationId}
                              className="p-3 rounded-sm bg-neutral-950 border border-neutral-800 flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="flex-1">
                                <div className="font-medium text-white">{v.variationTitle}</div>
                                <div className="text-[11px] text-neutral-400">
                                  Available: <span className="text-emerald-400 font-mono">{v.availableQuantity}</span> | Landed Cost:{' '}
                                  <span className="text-luxury-gold font-mono">Rs. {v.unitLandedCostLkr.toFixed(2)}</span>
                                </div>
                              </div>

                              <div className="w-28">
                                <label className="text-[10px] text-neutral-500 uppercase block">Allocate Qty</label>
                                <Input
                                  type="number"
                                  min="1"
                                  max={v.availableQuantity}
                                  value={currentVal}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    setAllocatedQtys((prev) => ({
                                      ...prev,
                                      [v.batchVariationId]: isNaN(val) ? 0 : Math.min(v.availableQuantity, Math.max(0, val)),
                                    }));
                                  }}
                                  className="h-7 bg-neutral-900 border-neutral-800 text-white font-mono text-xs mt-0.5"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-center p-8 text-neutral-500 text-xs">
                    Select an item from the left to review variations and allocate stock.
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-neutral-800 flex items-center justify-between bg-neutral-950/80 shrink-0">
              <div className="text-xs text-neutral-400">
                {activeGroup && (
                  <span>
                    Allocating stock from <span className="text-luxury-gold font-mono">{activeGroup.batchNumber}</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="gold"
                  size="sm"
                  disabled={!activeGroup}
                  onClick={handleConfirmSelection}
                  className="flex items-center gap-1.5"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>Apply & Autofill Product</span>
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
