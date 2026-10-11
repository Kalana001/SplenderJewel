'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { requestPasswordReset } from '@/lib/auth/actions';
import { Mail, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get('error') || searchParams.get('error_code');
  const isExpired =
    urlError === 'otp_expired' ||
    (typeof urlError === 'string' && urlError.toLowerCase().includes('expired'));

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    setLoading(true);

    try {
      const result = await requestPasswordReset(email.trim());

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to send password reset email. Please try again.');
        setLoading(false);
        return;
      }

      setSubmitted(true);
    } catch (err: any) {
      setErrorMessage(err?.message || 'An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center py-12 px-4 sm:px-6">
        <div className="w-full max-w-md">
          <Card className="border border-neutral-200 dark:border-neutral-800 shadow-xl bg-white dark:bg-luxury-surface text-center p-6">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground">
              Instructions Sent
            </h2>
            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 mt-2 leading-relaxed">
              If an account is associated with <strong className="text-foreground">{email}</strong>, you will receive an email shortly with a secure link to reset your password.
            </p>
            <p className="text-[11px] text-neutral-400 mt-2">
              Be sure to check your spam or junk folder if the email does not appear within a few minutes.
            </p>

            <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
              <Button asChild variant="gold" size="md" className="w-full uppercase tracking-wider text-xs font-semibold">
                <Link href="/login">
                  Return to Sign In
                </Link>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[75vh] flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-6">
          <span className="text-[10px] uppercase tracking-[0.3em] text-luxury-gold font-semibold">
            Splender Jewel
          </span>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
            Reset Password
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-2">
            Enter your registered email to receive secure recovery instructions.
          </p>
        </div>

        <Card className="border border-neutral-200 dark:border-neutral-800 shadow-lg bg-white dark:bg-luxury-surface">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-serif">Password Recovery</CardTitle>
            <CardDescription className="text-xs">
              We will send you a one-time link to create a new password.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {isExpired && !errorMessage && (
              <div
                className="mb-4 p-3 rounded-sm bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200 text-xs flex items-start space-x-2"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="leading-relaxed">
                  Your previous password reset link was invalid or has expired. Please enter your email below to receive a fresh reset link.
                </span>
              </div>
            )}

            {errorMessage && (
              <div
                className="mb-4 p-3 rounded-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-start space-x-2"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                <span className="leading-relaxed">{errorMessage}</span>
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

              <Button
                type="submit"
                variant="gold"
                size="md"
                disabled={loading}
                className="w-full mt-2 font-semibold uppercase tracking-wider text-xs py-3"
              >
                {loading ? 'Sending Link...' : 'Send Reset Link'}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800/80">
            <div className="text-center text-xs">
              <Link
                href="/login"
                className="inline-flex items-center space-x-1 text-neutral-600 dark:text-neutral-400 hover:text-luxury-gold transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Customer Sign In</span>
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

function ForgotPasswordSkeleton() {
  return (
    <div className="min-h-[75vh] flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-md h-80 animate-pulse bg-neutral-100 dark:bg-neutral-800/50 rounded-sm" />
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<ForgotPasswordSkeleton />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
