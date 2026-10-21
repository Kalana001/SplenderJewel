'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import type { PurchaseBatchStatus } from '@/lib/purchases/types';

interface BatchStatusBadgeProps {
  status: PurchaseBatchStatus | string;
  className?: string;
}

export function BatchStatusBadge({ status, className }: BatchStatusBadgeProps) {
  switch (status) {
    case 'received':
      return (
        <Badge variant="success" className={className}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5" />
          Received
        </Badge>
      );
    case 'partially_received':
      return (
        <Badge variant="warning" className={className}>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 animate-pulse" />
          Partially Received
        </Badge>
      );
    case 'ordered':
      return (
        <Badge variant="gold" className={className}>
          <span className="w-1.5 h-1.5 rounded-full bg-luxury-gold mr-1.5" />
          Ordered
        </Badge>
      );
    case 'draft':
      return (
        <Badge variant="outline" className={className}>
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 mr-1.5" />
          Draft
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge variant="danger" className={className}>
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mr-1.5" />
          Cancelled
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={className}>
          {status}
        </Badge>
      );
  }
}
