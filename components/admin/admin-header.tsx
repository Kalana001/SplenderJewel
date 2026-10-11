'use client';

import React from 'react';
import { Menu, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface AdminHeaderProps {
  onOpenMobileSidebar?: () => void;
}

export function AdminHeader({ onOpenMobileSidebar }: AdminHeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-neutral-800 bg-luxury-black/95 px-4 sm:px-6 backdrop-blur-md">
      <div className="flex items-center space-x-3">
        {onOpenMobileSidebar && (
          <button
            onClick={onOpenMobileSidebar}
            className="lg:hidden p-2 text-neutral-400 hover:text-white"
            aria-label="Open Admin Menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <div className="flex items-center space-x-2">
          <Shield className="h-4 w-4 text-luxury-gold" />
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
            Admin Portal
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <Badge variant="gold" className="text-[10px]">
          The Jewel Gallery
        </Badge>
      </div>
    </header>
  );
}
