'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Lock, Eye, EyeOff, AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { signInAdmin } from '@/lib/auth/actions';

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const errorParam = searchParams.get('error');
  const nextParam = searchParams.get('next');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(() => {
    if (errorParam === 'unauthorized') {
      return 'Administrative privileges are required to access this resource. Please sign in with an authorized staff account.';
    }
    if (errorParam === 'forbidden') {
      return 'Access forbidden. Your account does not have sufficient administrative permissions.';
    }
    return null;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your administrator email and password.');
      return;
    }

    setLoading(true);

    try {
      const result = await signInAdmin({
        email: email.trim(),
        password,
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Authentication failed. Please verify your administrator credentials.');
        setLoading(false);
        return;
      }

      // Safe target path
      let targetPath = '/admin/dashboard';
      if (nextParam && nextParam.startsWith('/admin') && !nextParam.startsWith('//')) {
        targetPath = nextParam;
      }

      router.push(targetPath);
      router.refresh();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected error occurred during administrative sign in.'
      );
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md border-neutral-800 bg-neutral-900/90 shadow-2xl backdrop-blur-md">
      <CardHeader className="text-center pb-4">
        <div className="mx-auto h-14 w-14 rounded-full bg-neutral-800/80 border border-luxury-gold/30 flex items-center justify-center text-luxury-gold mb-3 shadow-inner">
          <Shield className="h-7 w-7 text-luxury-gold" />
        </div>
        <CardTitle className="text-xl sm:text-2xl font-serif text-white tracking-wide">
          Admin Portal Authentication
        </CardTitle>
        <CardDescription className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
          Restricted access for authorized Splender Jewel store staff, managers, and administrators.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {errorMessage && (
          <div
            className="p-3 rounded-sm bg-red-950/60 border border-red-800/60 text-red-200 text-xs flex items-start space-x-2.5"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Administrator Email
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@splenderjewel.com"
              disabled={loading}
              required
              autoComplete="email"
              className="bg-neutral-800/60 border-neutral-700 text-white placeholder:text-neutral-500 focus:border-luxury-gold focus:ring-luxury-gold/20"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                disabled={loading}
                required
                autoComplete="current-password"
                className="bg-neutral-800/60 border-neutral-700 text-white placeholder:text-neutral-500 pr-10 focus:border-luxury-gold focus:ring-luxury-gold/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="p-3 rounded-sm bg-neutral-800/40 border border-neutral-700/50 text-[11px] text-neutral-400 leading-normal">
            <span className="text-luxury-gold font-medium">Security Notice: </span>
            Administrative actions, catalog updates, and order modifications are logged in the store security audit trail.
          </div>

          <Button
            type="submit"
            variant="gold"
            className="w-full h-10 font-medium tracking-wide uppercase text-xs"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                <span>Authenticating Admin...</span>
              </>
            ) : (
              <>
                <Lock className="h-4 w-4 mr-2" />
                <span>Sign In to Admin Workspace</span>
              </>
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="pt-2 pb-6 border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400">
        <Link
          href="/"
          className="flex items-center space-x-1.5 hover:text-luxury-gold transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Return to Storefront</span>
        </Link>
        <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
          Splender Jewel v0.1
        </span>
      </CardFooter>
    </Card>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <Card className="w-full max-w-md border-neutral-800 bg-neutral-900/90 p-8 text-center text-neutral-400">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-luxury-gold mb-2" />
          <p className="text-xs">Loading admin portal...</p>
        </Card>
      }
    >
      <AdminLoginForm />
    </Suspense>
  );
}
