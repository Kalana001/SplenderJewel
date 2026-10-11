'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { signUpCustomer } from '@/lib/auth/actions';
import { getSafeRedirectUrl } from '@/lib/auth/redirect';
import { Eye, EyeOff, Lock, Mail, User, Phone, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo');
  const safeTargetUrl = getSafeRedirectUrl(redirectTo, '/account');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone1, setPhone1] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!fullName.trim() || !email.trim() || !password) {
      setErrorMessage('Full name, email address, and password are required.');
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

    if (!agreeTerms) {
      setErrorMessage('Please accept the Terms of Service and Privacy Policy to create your account.');
      return;
    }

    setLoading(true);

    try {
      const result = await signUpCustomer({
        fullName: fullName.trim(),
        email: email.trim(),
        phone1: phone1.trim() || undefined,
        password,
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to create account. Please try again.');
        setLoading(false);
        return;
      }

      // Check whether an email confirmation is required or direct login succeeded
      if (result.message && result.message.toLowerCase().includes('check your email')) {
        setRegisteredEmail(email.trim());
      } else {
        router.push(safeTargetUrl);
        router.refresh();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'An unexpected error occurred during account creation.');
      setLoading(false);
    }
  };

  // If waiting for email verification
  if (registeredEmail) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center py-12 px-4 sm:px-6">
        <div className="w-full max-w-md">
          <Card className="border border-neutral-200 dark:border-neutral-800 shadow-xl bg-white dark:bg-luxury-surface text-center p-6">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground">
              Verify Your Email
            </h2>
            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 mt-2 leading-relaxed">
              We have sent a verification link to <strong className="text-foreground">{registeredEmail}</strong>.
              Please check your inbox (and spam folder) and click the link to activate your Splender Jewel account.
            </p>

            <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
              <Button asChild variant="gold" size="md" className="w-full uppercase tracking-wider text-xs font-semibold">
                <Link href={redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login'}>
                  Proceed to Sign In
                </Link>
              </Button>
              <div>
                <Link href="/shop" className="text-xs text-neutral-400 hover:text-foreground transition-colors">
                  Continue browsing catalog
                </Link>
              </div>
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
            Create an Account
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-2">
            Register to track orders, save delivery addresses, and create your wishlist.
          </p>
        </div>

        <Card className="border border-neutral-200 dark:border-neutral-800 shadow-lg bg-white dark:bg-luxury-surface">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-serif">Customer Registration</CardTitle>
            <CardDescription className="text-xs">
              Fill in your details below to set up your Splender Jewel account.
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

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label
                  htmlFor="fullName"
                  className="block text-xs uppercase tracking-wider font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Input
                    id="fullName"
                    name="fullName"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Kasun Fernando"
                    disabled={loading}
                    className="pl-9 text-sm"
                  />
                  <User className="h-4 w-4 text-neutral-400 absolute left-3 top-3 pointer-events-none" />
                </div>
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-xs uppercase tracking-wider font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  Email Address <span className="text-red-500">*</span>
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
                <label
                  htmlFor="phone1"
                  className="block text-xs uppercase tracking-wider font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  Contact Number <span className="text-neutral-400 text-[10px] normal-case">(Optional)</span>
                </label>
                <div className="relative">
                  <Input
                    id="phone1"
                    name="phone1"
                    type="tel"
                    value={phone1}
                    onChange={(e) => setPhone1(e.target.value)}
                    placeholder="07X XXX XXXX"
                    disabled={loading}
                    className="pl-9 text-sm"
                  />
                  <Phone className="h-4 w-4 text-neutral-400 absolute left-3 top-3 pointer-events-none" />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-xs uppercase tracking-wider font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  Password (8+ characters) <span className="text-red-500">*</span>
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
                    className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-xs uppercase tracking-wider font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  Confirm Password <span className="text-red-500">*</span>
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
                    placeholder="Re-enter password"
                    disabled={loading}
                    className="pl-9 text-sm"
                  />
                  <Lock className="h-4 w-4 text-neutral-400 absolute left-3 top-3 pointer-events-none" />
                </div>
              </div>

              <div className="flex items-start space-x-2 pt-1">
                <input
                  id="agreeTerms"
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-luxury-gold focus:ring-luxury-gold"
                  disabled={loading}
                />
                <label htmlFor="agreeTerms" className="text-xs text-neutral-600 dark:text-neutral-400 leading-tight">
                  I agree to the{' '}
                  <Link href="/terms" className="text-luxury-gold hover:underline">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="text-luxury-gold hover:underline">
                    Privacy Policy
                  </Link>
                  .
                </label>
              </div>

              <Button
                type="submit"
                variant="gold"
                size="md"
                disabled={loading}
                className="w-full mt-3 font-semibold uppercase tracking-wider text-xs py-3"
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col space-y-3 pt-2 border-t border-neutral-100 dark:border-neutral-800/80">
            <div className="text-center text-xs text-neutral-600 dark:text-neutral-400">
              Already have an account?{' '}
              <Link
                href={redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login'}
                className="font-semibold text-luxury-gold hover:text-luxury-gold-hover hover:underline inline-flex items-center space-x-0.5"
              >
                <span>Sign In</span>
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

function RegisterSkeleton() {
  return (
    <div className="min-h-[75vh] flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-md h-[460px] animate-pulse bg-neutral-100 dark:bg-neutral-800/50 rounded-sm" />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<RegisterSkeleton />}>
      <RegisterForm />
    </Suspense>
  );
}
