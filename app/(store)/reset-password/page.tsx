'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { updatePassword } from '@/lib/auth/actions';
import { Eye, EyeOff, Lock, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlError = searchParams.get('error') || searchParams.get('error_code');
  const isExpiredOrInvalid =
    urlError === 'otp_expired' ||
    urlError === 'access_denied' ||
    urlError === 'invalid_link' ||
    (typeof urlError === 'string' && urlError.toLowerCase().includes('expired'));

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!password) {
      setErrorMessage('Please enter a new password.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter your password.');
      return;
    }

    setLoading(true);

    try {
      const result = await updatePassword(password);

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to update password. Please request a new recovery link.');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/account');
        router.refresh();
      }, 2000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'An unexpected error occurred while updating your password.');
      setLoading(false);
    }
  };

  // State 1: Reset link expired or invalid
  if (isExpiredOrInvalid) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center py-12 px-4 sm:px-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <span className="text-[10px] uppercase tracking-[0.3em] text-luxury-gold font-semibold">
              Splender Jewel Security
            </span>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
              Reset Link Expired
            </h1>
          </div>

          <Card className="border border-neutral-200 dark:border-neutral-800 shadow-xl bg-white dark:bg-luxury-surface text-center p-6">
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h2 className="font-serif text-xl font-bold tracking-tight text-foreground">
              Link Invalid or Expired
            </h2>
            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 mt-2 leading-relaxed">
              This password reset link is invalid or has already expired. Password recovery links can only be used once and expire quickly for your security.
            </p>

            <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
              <Button asChild variant="gold" size="md" className="w-full uppercase tracking-wider text-xs font-semibold">
                <Link href="/forgot-password" className="inline-flex items-center justify-center space-x-2">
                  <RotateCcw className="h-4 w-4 mr-1.5" />
                  <span>Request a New Reset Link</span>
                </Link>
              </Button>
              <div>
                <Link
                  href="/login"
                  className="text-xs text-neutral-500 hover:text-luxury-gold transition-colors"
                >
                  Return to Customer Sign In
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // State 2: Password successfully updated
  if (success) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center py-12 px-4 sm:px-6">
        <div className="w-full max-w-md">
          <Card className="border border-neutral-200 dark:border-neutral-800 shadow-xl bg-white dark:bg-luxury-surface text-center p-6">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground">
              Password Updated
            </h2>
            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 mt-2 leading-relaxed">
              Your password has been changed successfully. You will be redirected to your account in a moment...
            </p>

            <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-800">
              <Button asChild variant="gold" size="md" className="w-full uppercase tracking-wider text-xs font-semibold">
                <Link href="/account">Go to My Account</Link>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // State 3: Enter new password form
  return (
    <div className="min-h-[75vh] flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-6">
          <span className="text-[10px] uppercase tracking-[0.3em] text-luxury-gold font-semibold">
            Splender Jewel Security
          </span>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
            Set New Password
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-2">
            Choose a strong new password for your account.
          </p>
        </div>

        <Card className="border border-neutral-200 dark:border-neutral-800 shadow-lg bg-white dark:bg-luxury-surface">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-serif">Update Password</CardTitle>
            <CardDescription className="text-xs">
              Must be at least 8 characters long.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {urlError && !isExpiredOrInvalid && (
              <div
                className="mb-4 p-3 rounded-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-start space-x-2"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                <span className="leading-relaxed">
                  Authentication error: {urlError}. If this persists, please{' '}
                  <Link href="/forgot-password" className="underline font-semibold">
                    request a new reset link
                  </Link>
                  .
                </span>
              </div>
            )}

            {errorMessage && (
              <div
                className="mb-4 p-3 rounded-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-start space-x-2"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                <div className="leading-relaxed">
                  <span>{errorMessage}</span>
                  <div className="mt-1">
                    <Link href="/forgot-password" className="underline font-semibold hover:text-luxury-gold">
                      Request a fresh reset link
                    </Link>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="password"
                  className="block text-xs uppercase tracking-wider font-medium text-neutral-700 dark:text-neutral-300 mb-1.5"
                >
                  New Password (8+ characters)
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    disabled={loading}
                    className="pl-9 pr-10 text-sm"
                  />
                  <Lock className="h-4 w-4 text-neutral-400 absolute left-3 top-3 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-0 top-0 h-full w-11 min-h-[44px] min-w-[44px] flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-xs uppercase tracking-wider font-medium text-neutral-700 dark:text-neutral-300 mb-1.5"
                >
                  Confirm New Password
                </label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    disabled={loading}
                    className="pl-9 text-sm"
                  />
                  <Lock className="h-4 w-4 text-neutral-400 absolute left-3 top-3 pointer-events-none" />
                </div>
              </div>

              <Button
                type="submit"
                variant="gold"
                size="md"
                disabled={loading}
                className="w-full mt-2 font-semibold uppercase tracking-wider text-xs py-3"
              >
                {loading ? 'Updating Password...' : 'Save New Password'}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800/80">
            <div className="text-center text-xs">
              <Link
                href="/login"
                className="text-neutral-500 hover:text-luxury-gold transition-colors"
              >
                Cancel and return to Sign In
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

function ResetPasswordSkeleton() {
  return (
    <div className="min-h-[75vh] flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-md h-80 animate-pulse bg-neutral-100 dark:bg-neutral-800/50 rounded-sm" />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordSkeleton />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
