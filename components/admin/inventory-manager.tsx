'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Archive,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Plus,
  Minus,
  Edit2,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/config/store';
import { adjustVariantStockAction } from '@/lib/catalog/variants';

interface InventoryItem {
  id: string;
  sku: string;
  title: string;
  price: number;
  discountPrice: number | null;
  purchaseCost: number;
  stockQuantity: number;
  lowStockThreshold: number;
  stockStatus: string;
  isActive: boolean;
  updatedAt: string;
  productName: string;
  productSlug: string;
  categoryName: string;
  productIsActive: boolean;
}

interface InventoryManagerProps {
  initialVariants: InventoryItem[];
}

export function InventoryManager({ initialVariants }: InventoryManagerProps) {
  const [variants, setVariants] = useState<InventoryItem[]>(initialVariants);
  const [isPending, startTransition] = useTransition();

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Adjustment Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<InventoryItem | null>(null);
  const [adjustmentValue, setAdjustmentValue] = useState<number>(0);
  const [reason, setReason] = useState<'stock_added' | 'manual_adjustment' | 'correction'>('stock_added');
  const [referenceNotes, setReferenceNotes] = useState('');

  // Alerts
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filteredVariants = variants.filter((v) => {
    if (statusFilter !== 'all' && v.stockStatus !== statusFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      const matchSku = v.sku.toLowerCase().includes(q);
      const matchTitle = v.title.toLowerCase().includes(q);
      const matchProduct = v.productName.toLowerCase().includes(q);
      if (!matchSku && !matchTitle && !matchProduct) return false;
    }
    return true;
  });

  // Calculate high-level summary counts
  const totalStockUnits = variants.reduce((sum, v) => sum + v.stockQuantity, 0);
  const lowStockCount = variants.filter((v) => v.stockStatus === 'low_stock').length;
  const outOfStockCount = variants.filter((v) => v.stockStatus === 'out_of_stock').length;

  function handleOpenAdjustment(v: InventoryItem) {
    setSelectedVariant(v);
    setAdjustmentValue(0);
    setReason('stock_added');
    setReferenceNotes('');
    setErrorMessage(null);
    setModalOpen(true);
  }

  async function handleSaveAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVariant || adjustmentValue === 0) return;

    startTransition(async () => {
      const res = await adjustVariantStockAction({
        variantId: selectedVariant.id,
        quantityChange: adjustmentValue,
        reason,
        notes: referenceNotes || undefined,
      });

      if (!res.success || res.newQuantity === undefined) {
        setErrorMessage(res.error || 'Failed to adjust stock.');
        return;
      }

      setVariants((prev) =>
        prev.map((v) =>
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
        )
      );

      setSuccessMessage(`Inventory for ${selectedVariant.sku} updated to ${res.newQuantity} units.`);
      setModalOpen(false);
    });
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-luxury-card p-5 rounded-md border border-luxury-border">
        <div>
          <h2 className="text-xl font-serif text-white flex items-center gap-2">
            <Archive className="h-5 w-5 text-luxury-gold" />
            Inventory & Stock Movements
          </h2>
          <p className="text-sm text-neutral-400 mt-0.5">
            Real-time stock levels across all SKU variants. Adjust quantities with audited movement logging.
          </p>
        </div>

        <Link href="/admin/products/new">
          <Button variant="gold" size="sm">
            Add New Jewelry
          </Button>
        </Link>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-luxury-card p-4 rounded-md border border-luxury-border flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-neutral-400">Total In-Stock Units</div>
            <div className="text-2xl font-bold font-mono text-white mt-1">{totalStockUnits}</div>
          </div>
          <Archive className="h-8 w-8 text-neutral-600" />
        </div>

        <div className="bg-luxury-card p-4 rounded-md border border-amber-900/40 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-amber-400">Low Stock Warnings</div>
            <div className="text-2xl font-bold font-mono text-amber-400 mt-1">{lowStockCount}</div>
          </div>
          <AlertTriangle className="h-8 w-8 text-amber-500/50" />
        </div>

        <div className="bg-luxury-card p-4 rounded-md border border-rose-900/40 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-rose-400">Out of Stock SKUs</div>
            <div className="text-2xl font-bold font-mono text-rose-400 mt-1">{outOfStockCount}</div>
          </div>
          <AlertCircle className="h-8 w-8 text-rose-500/50" />
        </div>
      </div>

      {/* Alerts */}
      {successMessage && (
        <div className="bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 px-4 py-3 rounded-md text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            {successMessage}
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-950/40 border border-rose-500/30 text-rose-300 px-4 py-3 rounded-md text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            {errorMessage}
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-luxury-card p-4 rounded-md border border-luxury-border">
        <div className="relative sm:col-span-2">
          <Search className="h-4 w-4 absolute left-3 top-3 text-neutral-400" />
          <Input
            placeholder="Search by SKU, variant title, product name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-luxury-surface border-neutral-700 text-white text-sm"
          />
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-luxury-surface border border-neutral-700 text-white text-sm rounded-sm h-10 px-3 focus:outline-none focus:border-luxury-gold/70"
          >
            <option value="all">All Inventory Statuses</option>
            <option value="in_stock">In Stock</option>
            <option value="low_stock">Low Stock (Alert)</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-luxury-card rounded-md border border-luxury-border overflow-hidden">
        {filteredVariants.length === 0 ? (
          <div className="text-center py-16 px-4">
            <Archive className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-white mb-1">No Inventory Records Found</h3>
            <p className="text-sm text-neutral-400 max-w-md mx-auto mb-5">
              Create product variants in the catalog to begin tracking real-time stock levels.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-neutral-300">
              <thead className="bg-luxury-surface text-xs uppercase tracking-wider text-neutral-400 border-b border-luxury-border">
                <tr>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">Product & Variant</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Price</th>
                  <th className="py-3 px-4 text-center">In Stock</th>
                  <th className="py-3 px-4 text-center">Threshold</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-luxury-border">
                {filteredVariants.map((item) => (
                  <tr key={item.id} className="hover:bg-luxury-surface/50">
                    <td className="py-3 px-4 font-mono font-medium text-white text-xs">
                      {item.sku}
                    </td>

                    <td className="py-3 px-4">
                      <div>
                        <Link
                          href={`/admin/products/${item.id}`} // link to product
                          className="font-medium text-white hover:text-luxury-gold transition-colors"
                        >
                          {item.productName}
                        </Link>
                        <div className="text-xs text-neutral-400">{item.title}</div>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-xs text-neutral-300">
                      {item.categoryName}
                    </td>

                    <td className="py-3 px-4 text-xs font-mono">
                      {item.discountPrice != null ? (
                        <span>
                          <span className="text-luxury-gold font-semibold">{formatCurrency(item.discountPrice)}</span>{' '}
                          <span className="line-through text-neutral-500">{formatCurrency(item.price)}</span>
                        </span>
                      ) : (
                        <span>{formatCurrency(item.price)}</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-center font-mono font-bold text-sm">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          item.stockQuantity <= 0
                            ? 'text-rose-400 bg-rose-950/70 border border-rose-800/40'
                            : item.stockQuantity <= item.lowStockThreshold
                            ? 'text-amber-400 bg-amber-950/70 border border-amber-800/40'
                            : 'text-emerald-400 bg-emerald-950/70 border border-emerald-800/40'
                        }`}
                      >
                        {item.stockQuantity}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center font-mono text-xs text-neutral-400">
                      {item.lowStockThreshold}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <Badge
                        variant={
                          item.stockStatus === 'in_stock'
                            ? 'success'
                            : item.stockStatus === 'low_stock'
                            ? 'warning'
                            : 'danger'
                        }
                      >
                        {item.stockStatus === 'in_stock'
                          ? 'In Stock'
                          : item.stockStatus === 'low_stock'
                          ? 'Low Stock'
                          : 'Out of Stock'}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenAdjustment(item)}
                        className="text-xs text-neutral-400 hover:text-luxury-gold"
                      >
                        <Edit2 className="h-3.5 w-3.5 mr-1" />
                        Adjust Stock
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stock Adjustment Modal */}
      {modalOpen && selectedVariant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-luxury-card border border-luxury-border rounded-lg max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white"
            >
              ✕
            </button>

            <h3 className="text-xl font-serif text-white mb-1">Adjust Inventory</h3>
            <p className="text-xs text-neutral-400 mb-4">
              {selectedVariant.productName} — <span className="text-white">{selectedVariant.title}</span> (SKU: {selectedVariant.sku})
            </p>

            <form onSubmit={handleSaveAdjustment} className="space-y-4">
              <div className="bg-luxury-surface p-3 rounded border border-neutral-700 text-sm flex justify-between">
                <span className="text-neutral-400">Current Stock:</span>
                <span className="font-mono font-bold text-white">{selectedVariant.stockQuantity} units</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Quantity Adjustment (+ to add, - to subtract)
                </label>
                <Input
                  type="number"
                  value={adjustmentValue}
                  onChange={(e) => setAdjustmentValue(Number(e.target.value))}
                  placeholder="e.g. 15 or -3"
                  required
                  className="bg-luxury-surface border-neutral-700 text-white font-mono text-sm"
                />
                <span className="text-[11px] text-neutral-400 mt-1 block">
                  New stock will be: {selectedVariant.stockQuantity + adjustmentValue} units
                </span>
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
                  <option value="manual_adjustment">Manual Adjustment / Audit</option>
                  <option value="correction">Inventory Discrepancy Correction</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Audit Notes / Reference (Optional)
                </label>
                <Input
                  value={referenceNotes}
                  onChange={(e) => setReferenceNotes(e.target.value)}
                  placeholder="e.g. Batch #104 or physical recount"
                  className="bg-luxury-surface border-neutral-700 text-white text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-luxury-border">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="gold" disabled={isPending || adjustmentValue === 0}>
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Movement
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
