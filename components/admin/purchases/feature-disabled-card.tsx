'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldAlert, Database, Sparkles, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface FeatureDisabledCardProps {
  onToggleMock?: () => void;
  isMockActive?: boolean;
  isMissingMigration?: boolean;
}

export function FeatureDisabledCard({
  onToggleMock,
  isMockActive,
  isMissingMigration,
}: FeatureDisabledCardProps) {
  return (
    <Card className="border border-luxury-gold/30 bg-neutral-900/90 text-neutral-200 backdrop-blur-sm overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-luxury-gold via-amber-400 to-luxury-gold" />
      <CardHeader className="p-5 sm:p-6 pb-3">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-full bg-luxury-gold/10 border border-luxury-gold/30 shrink-0">
            {isMissingMigration ? (
              <Database className="w-6 h-6 text-luxury-gold" />
            ) : (
              <ShieldAlert className="w-6 h-6 text-amber-400" />
            )}
          </div>
          <div className="space-y-1">
            <CardTitle className="text-lg sm:text-xl text-white font-serif flex items-center gap-2">
              {isMissingMigration
                ? 'Purchase Management Database Pending'
                : 'Purchase Management Feature Flag Inactive'}
            </CardTitle>
            <p className="text-xs sm:text-sm text-neutral-400">
              {isMissingMigration
                ? 'PostgreSQL tables and procedures for purchase batches (Migration 00013) have not yet been applied to the database.'
                : 'Purchase Management is currently disabled in this environment (NEXT_PUBLIC_ENABLE_PURCHASE_MANAGEMENT=false).'}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 sm:p-6 pt-2 space-y-4 text-xs sm:text-sm text-neutral-300">
        <div className="p-3 rounded-sm bg-black/40 border border-neutral-800 space-y-2">
          <div className="font-semibold text-neutral-200 text-xs tracking-wider uppercase">
            Architectural Guardrail Status
          </div>
          <ul className="list-disc list-inside space-y-1 text-xs text-neutral-400">
            <li>Customer storefront, shopping carts, and order fulfillment remain 100% unaffected.</li>
            <li>Production database queries are suppressed to protect the live database schema.</li>
            <li>Zero-cent landed cost and moving weighted average calculations are fully implemented locally.</li>
          </ul>
        </div>

        {onToggleMock && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-neutral-800">
            <div className="text-xs text-neutral-400">
              {isMockActive ? (
                <span className="text-luxury-gold font-medium">Currently viewing verified mock demonstration data.</span>
              ) : (
                <span>Switch to mock demonstration mode to review UI, forms, and cost calculations.</span>
              )}
            </div>
            <Button
              variant="gold"
              size="sm"
              onClick={onToggleMock}
              className="w-full sm:w-auto shrink-0 flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isMockActive ? 'Exit Mock Preview' : 'Explore Interactive Mock Preview'}</span>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
