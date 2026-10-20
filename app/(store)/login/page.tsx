'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Container } from '@/components/ui/container';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { signInCustomer } from '@/lib/auth/actions';
import { getSafeRedirectUrl } from '@/lib/auth/redirect';
import { useOptionalCart } from '@/lib/cart/cart-context';
import { Eye, EyeOff, Lock, Mail, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectTo = searchParams.get('redirectTo');
  const errorParam = searchParams.get('error');
  const messageParam = searchParams.get('message');

  const cart = useOptionalCart();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(errorParam);
  const [infoMessage, setInfoMessage] = useState<string | null>(messageParam);

  const safeTargetUrl = getSafeRedirectUrl(redirectTo, '/');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setLoading(true);

    try {
      const result = await signInCustomer({
        email: email.trim(),
        password,
      });

      if (!result.success) {
        if (result.error?.toLowerCase().includes('email not confirmed')) {
          setErrorMessage(
            'Your email address has not been confirmed. Please check your inbox or spam folder for the verification link.'
          );
        } else if (result.error?.toLowerCase().includes('invalid login credentials')) {
          setErrorMessage('Invalid email or password. Please verify your credentials and try again.');
        } else {
          setErrorMessage(result.error || 'Unable to sign in. Please try again.');
        }
        setLoading(false);
        return;
      }

      // Successful sign in: synchronize remote cart and merge any pending guest items
      if (cart?.refreshCart) {
        try {
          await cart.refreshCart();
        } catch (syncErr) {
          console.warn('[Login] Cart sync error on sign in:', syncErr);
        }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('splender:auth-signed-in'));
      }
      router.push(safeTargetUrl);
    } catch (err: any) {
      setErrorMessage(err?.message || 'An unexpected error occurred during sign in.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-md">
        {/* Brand header badge */}
        <div className="text-center mb-6">
          <span className="text-[10px] uppercase tracking-[0.3em] text-luxury-gold font-semibold">
            Splender Jewel Customer Portal
          </span>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
            Customer Sign In
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-2">
            Sign in to access your orders, profile, and wishlist.
          </p>
        </div>

        <Card className="border border-neutral-200 dark:border-neutral-800 shadow-lg bg-white dark:bg-luxury-surface">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-serif">Welcome Back</CardTitle>
            <CardDescription className="text-xs">
              Enter your registered email and password below.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {errorMessage && (
              <div
                className="mb-4 p-3 rounded-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-start space-x-2"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {infoMessage && (
              <div
                className="mb-4 p-3 rounded-sm bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs flex items-start space-x-2"
                role="status"
              >
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="leading-relaxed">{infoMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs uppercase tracking-wider font-medium text-neutral-700 dark:text-neutral-300 mb-1.5"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    disabled={loading}
                    className="pl-9 text-sm"
                  />
                  <Mail className="h-4 w-4 text-neutral-400 absolute left-3 top-3 pointer-events-none" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="password"
                    className="block text-xs uppercase tracking-wider font-medium text-neutral-700 dark:text-neutral-300"
                  >
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-luxury-gold hover:text-luxury-gold-hover hover:underline transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={loading}
                    className="pl-9 pr-10 text-sm"
                  />
                  <Lock className="h-4 w-4 text-neutral-400 absolute left-3 top-3 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                variant="gold"
                size="md"
                disabled={loading}
                className="w-full mt-2 font-semibold uppercase tracking-wider text-xs py-3"
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col space-y-3 pt-2 border-t border-neutral-100 dark:border-neutral-800/80">
            <div className="text-center text-xs text-neutral-600 dark:text-neutral-400">
              New customer?{' '}
              <Link
                href={redirectTo ? `/register?redirectTo=${encodeURIComponent(redirectTo)}` : '/register'}
                className="font-semibold text-luxury-gold hover:text-luxury-gold-hover hover:underline inline-flex items-center space-x-0.5"
              >
                <span>Create an Account</span>
                <ArrowRight className="h-3 w-3 inline" />
              </Link>
            </div>

            <div className="text-center text-[11px] text-neutral-400">
              Guest shopping is always available.{' '}
              <Link href="/shop" className="underline hover:text-foreground transition-colors">
                Continue browsing
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

function LoginSkeleton() {
  return (
    <div className="min-h-[75vh] flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-md h-96 animate-pulse bg-neutral-100 dark:bg-neutral-800/50 rounded-sm" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}
