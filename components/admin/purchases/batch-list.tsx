'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  Search, 
  Plus, 
  Calendar, 
  Truck, 
  Layers, 
  FileSpreadsheet, 
  ArrowUpDown,
  Filter,
  CheckCircle2,
  Clock,
  ExternalLink,
  Receipt
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BatchStatusBadge } from './batch-status-badge';
import type { PurchaseBatchDTO, PurchaseBatchStatus } from '@/lib/purchases/types';
import { centsToDecimalLkr } from '@/lib/purchases/calculations';

interface BatchListProps {
  initialBatches: PurchaseBatchDTO[];
  isFeatureDisabled?: boolean;
  isMissingMigration?: boolean;
}

export function BatchList({ 
  initialBatches,
  isFeatureDisabled,
  isMissingMigration
}: BatchListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [batches] = useState<PurchaseBatchDTO[]>(initialBatches);

  // Filtered batches
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        b.batchNumber.toLowerCase().includes(q) ||
        b.supplierName.toLowerCase().includes(q) ||
        (b.invoiceNumber && b.invoiceNumber.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [batches, searchQuery, statusFilter]);

  // Aggregate metrics
  const metrics = useMemo(() => {
    let totalPurchasedCostCents = 0;
    let totalUnits = 0;
    let totalReceived = 0;
    let activeBatches = 0;

    for (const b of batches) {
      totalPurchasedCostCents += b.totalLandedCostCents;
      totalUnits += b.totalPurchasedUnits;
      totalReceived += b.totalReceivedUnits;
      if (b.status === 'ordered' || b.status === 'partially_received') {
        activeBatches += 1;
      }
    }

    return {
      totalBatches: batches.length,
      totalPurchasedCostLkr: centsToDecimalLkr(totalPurchasedCostCents),
      totalUnits,
      totalReceived,
      activeBatches,
    };
  }, [batches]);

  const statusOptions: Array<{ id: string; label: string }> = [
    { id: 'all', label: 'All Batches' },
    { id: 'draft', label: 'Draft' },
    { id: 'ordered', label: 'Ordered' },
    { id: 'partially_received', label: 'Partially Received' },
    { id: 'received', label: 'Received' },
    { id: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide flex items-center gap-2">
            <Receipt className="w-6 h-6 text-luxury-gold" />
            Purchase Batch Management
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Create supplier purchase orders, track incoming jewelry shipments, and verify exact landed cost accounting.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/purchases/new">
            <Button variant="gold" className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <span>Create Purchase Batch</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-neutral-900/60 border-neutral-800 p-4">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>Total Batches</span>
            <FileSpreadsheet className="w-4 h-4 text-luxury-gold" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-semibold text-white font-serif">
            {metrics.totalBatches}
          </div>
          <div className="mt-1 text-[11px] text-neutral-400">
            {metrics.activeBatches} active shipments
          </div>
        </Card>

        <Card className="bg-neutral-900/60 border-neutral-800 p-4">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>Capital Invested</span>
            <span className="text-[10px] font-mono text-luxury-gold uppercase">LKR</span>
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-semibold text-luxury-gold-light font-mono">
            Rs. {metrics.totalPurchasedCostLkr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-[11px] text-neutral-400">
            Exact landed valuation
          </div>
        </Card>

        <Card className="bg-neutral-900/60 border-neutral-800 p-4">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>Physical Receipt Rate</span>
            <Truck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-semibold text-white font-mono">
            {metrics.totalUnits > 0
              ? `${Math.round((metrics.totalReceived / metrics.totalUnits) * 100)}%`
              : '0%'}
          </div>
          <div className="mt-1 text-[11px] text-neutral-400">
            {metrics.totalReceived} / {metrics.totalUnits} units received
          </div>
        </Card>

        <Card className="bg-neutral-900/60 border-neutral-800 p-4">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>In-Transit / Pending</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-semibold text-amber-300 font-mono">
            {Math.max(0, metrics.totalUnits - metrics.totalReceived)}
          </div>
          <div className="mt-1 text-[11px] text-neutral-400">
            Units pending delivery
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="bg-neutral-900/60 border-neutral-800 p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <Input
              type="text"
              placeholder="Search by batch number (e.g. PB-2026-001), supplier, or invoice..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-neutral-950 border-neutral-800 text-white placeholder:text-neutral-500 text-xs sm:text-sm"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {statusOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setStatusFilter(opt.id)}
                className={`px-3 py-1.5 rounded-sm text-xs font-medium whitespace-nowrap transition-colors ${
                  statusFilter === opt.id
                    ? 'bg-luxury-gold/20 text-luxury-gold-light border border-luxury-gold/40'
                    : 'bg-neutral-950 text-neutral-400 border border-neutral-800 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Batches Table & Responsive Cards */}
      <Card className="bg-neutral-900/60 border-neutral-800 overflow-hidden">
        {filteredBatches.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Layers className="w-8 h-8 text-neutral-600 mx-auto" />
            <div className="text-neutral-300 font-medium text-sm">No purchase batches match your filter</div>
            <p className="text-neutral-500 text-xs max-w-sm mx-auto">
              {searchQuery || statusFilter !== 'all'
                ? 'Try clearing the search query or selecting a different status filter.'
                : 'Get started by creating your first purchase batch to record supplier procurement.'}
            </p>
            {batches.length === 0 && (
              <Link href="/admin/purchases/new">
                <Button variant="gold" size="sm" className="mt-2">
                  Create First Batch
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-950/80 text-neutral-400 font-medium">
                  <th className="py-3 px-4">Batch Details</th>
                  <th className="py-3 px-4">Supplier & Reference</th>
                  <th className="py-3 px-4">Purchase Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Received / Purchased</th>
                  <th className="py-3 px-4 text-right">Landed Cost</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {filteredBatches.map((batch) => {
                  const landedLkr = centsToDecimalLkr(batch.totalLandedCostCents);
                  const isFullyReceived = batch.totalReceivedUnits >= batch.totalPurchasedUnits;
                  const percentReceived = batch.totalPurchasedUnits > 0
                    ? Math.round((batch.totalReceivedUnits / batch.totalPurchasedUnits) * 100)
                    : 0;

                  return (
                    <tr
                      key={batch.id}
                      className="hover:bg-neutral-800/30 transition-colors group"
                    >
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/admin/purchases/${batch.id}`}
                          className="font-mono font-medium text-luxury-gold hover:text-luxury-gold-light hover:underline flex items-center gap-1.5"
                        >
                          <span>{batch.batchNumber}</span>
                          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                        {batch.notes && (
                          <div className="text-[11px] text-neutral-500 truncate max-w-xs mt-0.5">
                            {batch.notes}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-medium text-neutral-200">{batch.supplierName}</div>
                        <div className="text-[11px] text-neutral-500">
                          {batch.invoiceNumber ? `Inv: ${batch.invoiceNumber}` : 'No invoice ref'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-neutral-300">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                          <span>{batch.purchaseDate}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <BatchStatusBadge status={batch.status} />
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                isFullyReceived
                                  ? 'bg-emerald-500'
                                  : batch.totalReceivedUnits > 0
                                  ? 'bg-amber-400'
                                  : 'bg-neutral-600'
                              }`}
                              style={{ width: `${percentReceived}%` }}
                            />
                          </div>
                          <span className="font-mono text-neutral-300">
                            {batch.totalReceivedUnits} / {batch.totalPurchasedUnits}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="font-mono font-medium text-white">
                          Rs. {landedLkr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-neutral-500">
                          {batch.totalPurchasedUnits > 0
                            ? `~Rs. ${(landedLkr / batch.totalPurchasedUnits).toFixed(2)}/ea`
                            : ''}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <Link href={`/admin/purchases/${batch.id}`}>
                          <Button variant="outline" size="sm" className="h-7 text-xs">
                            View Details
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
