'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, Shield, LogOut, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { signOutAdmin } from '@/lib/auth/actions';

interface AdminHeaderProps {
  onOpenMobileSidebar?: () => void;
}

export function AdminHeader({ onOpenMobileSidebar }: AdminHeaderProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOutAdmin();
      router.push('/admin/login');
      router.refresh();
    } catch {
      // Fallback redirect
      window.location.href = '/admin/login';
    } finally {
      setSigningOut(false);
    }
  };

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
        <Badge variant="gold" className="text-[10px] hidden sm:inline-flex">
          The Jewel Gallery
        </Badge>

        <Button
          variant="outline"
          size="sm"
          onClick={handleSignOut}
          disabled={signingOut}
          className="border-neutral-700 bg-neutral-900/60 text-neutral-300 hover:bg-neutral-800 hover:text-luxury-gold text-xs h-8 px-2.5 space-x-1.5"
          title="Sign out of Administrator Portal"
        >
          {signingOut ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LogOut className="h-3.5 w-3.5 text-neutral-400 group-hover:text-luxury-gold" />
          )}
          <span className="hidden sm:inline">Sign Out</span>
        </Button>
      </div>
    </header>
  );
}
