'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { signOutCustomer } from '@/lib/auth/actions';
import { LogOut } from 'lucide-react';

interface SignOutButtonProps {
  className?: string;
  variant?: 'outline' | 'ghost' | 'secondary' | 'primary';
  size?: 'sm' | 'md' | 'lg';
}

export function SignOutButton({
  className,
  variant = 'outline',
  size = 'sm',
}: SignOutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOutCustomer();
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('Sign out error:', err);
      setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      disabled={loading}
      onClick={handleSignOut}
      className={className}
    >
      <LogOut className="h-4 w-4 mr-2" />
      <span>{loading ? 'Signing Out...' : 'Sign Out'}</span>
    </Button>
  );
}
