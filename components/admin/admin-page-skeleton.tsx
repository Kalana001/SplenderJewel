import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface AdminPageSkeletonProps {
  title: string;
  category: string;
  description: string;
  targetPhase?: string;
  capabilities?: string[];
}

export function AdminPageSkeleton({
  title,
  category,
  description,
  targetPhase = 'Phase 4 (Admin Panel Implementation)',
  capabilities = [],
}: AdminPageSkeletonProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs uppercase tracking-wider text-neutral-400">{category}</span>
            <span className="text-neutral-600">/</span>
            <Badge variant="gold" className="text-[10px]">
              {targetPhase}
            </Badge>
          </div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-white mt-1">
            {title}
          </h1>
        </div>
      </div>

      <Card className="border-neutral-800 bg-neutral-900/40">
        <CardHeader>
          <div className="flex items-center space-x-2 text-luxury-gold mb-1">
            <Shield className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Architecture Module Ready
            </span>
          </div>
          <CardTitle className="text-lg text-white">{title}</CardTitle>
          <CardDescription className="text-neutral-400 text-xs leading-relaxed">
            {description}
          </CardDescription>
        </CardHeader>
        {capabilities.length > 0 && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                Planned Functionality:
              </h4>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-neutral-400">
                {capabilities.map((cap, idx) => (
                  <li key={idx} className="flex items-center space-x-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-luxury-gold" />
                    <span>{cap}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
