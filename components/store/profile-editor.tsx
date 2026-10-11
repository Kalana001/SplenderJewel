'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { updateCustomerProfile, requestPasswordReset } from '@/lib/auth/actions';
import { User, Phone, Mail, ShieldCheck, KeyRound, AlertCircle, CheckCircle2, Send } from 'lucide-react';

interface ProfileEditorProps {
  initialProfile: {
    fullName: string;
    email: string;
    phone1?: string | null;
    phone2?: string | null;
  };
}

export function ProfileEditor({ initialProfile }: ProfileEditorProps) {
  // Profile Details State
  const [fullName, setFullName] = useState(initialProfile.fullName || '');
  const [phone1, setPhone1] = useState(initialProfile.phone1 || '');
  const [phone2, setPhone2] = useState(initialProfile.phone2 || '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Email-Verified Password Reset State
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccess(null);
    setProfileError(null);

    if (!fullName.trim()) {
      setProfileError('Full name cannot be empty.');
      return;
    }

    setProfileLoading(true);

    try {
      const result = await updateCustomerProfile({
        fullName: fullName.trim(),
        phone1: phone1.trim() || undefined,
        phone2: phone2.trim() || undefined,
      });

      if (!result.success) {
        setProfileError(result.error || 'Failed to update profile.');
      } else {
        setProfileSuccess('Your profile details have been saved successfully.');
      }
    } catch (err: any) {
      setProfileError(err?.message || 'An unexpected error occurred.');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleSendResetEmail = async () => {
    setResetSuccess(null);
    setResetError(null);
    setResetLoading(true);

    try {
      const result = await requestPasswordReset(initialProfile.email);
      if (!result.success) {
        setResetError(result.error || 'Failed to send password reset email.');
      } else {
        setResetSuccess(
          `A secure password reset link has been dispatched to ${initialProfile.email}. Check your inbox and click the link to update your password.`
        );
      }
    } catch (err: any) {
      setResetError(err?.message || 'An unexpected error occurred while requesting password reset.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 1. Personal Profile Details */}
      <Card className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-luxury-surface">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-serif">Personal Information</CardTitle>
          <CardDescription className="text-xs">
            Update your contact details for ordering and Sri Lankan delivery updates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profileError && (
            <div className="mb-4 p-3 rounded-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
              <span>{profileError}</span>
            </div>
          )}

          {profileSuccess && (
            <div className="mb-4 p-3 rounded-sm bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs flex items-start space-x-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{profileSuccess}</span>
            </div>
          )}

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label
                htmlFor="profileFullName"
                className="block text-xs uppercase tracking-wider font-medium text-neutral-700 dark:text-neutral-300 mb-1"
              >
                Full Name
              </label>
              <div className="relative">
                <Input
                  id="profileFullName"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  disabled={profileLoading}
                  className="pl-9 text-sm"
                />
                <User className="h-4 w-4 text-neutral-400 absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>

            <div>
              <label
                htmlFor="profileEmail"
                className="block text-xs uppercase tracking-wider font-medium text-neutral-700 dark:text-neutral-300 mb-1"
              >
                Email Address
              </label>
              <div className="relative">
                <input
                  id="profileEmail"
                  name="email"
                  type="email"
                  readOnly
                  value={initialProfile.email}
                  className="flex h-10 w-full rounded-sm border border-neutral-300 dark:border-neutral-700 bg-neutral-100/80 dark:bg-neutral-900/90 px-3 py-2 pl-9 text-sm font-medium text-neutral-900 dark:text-neutral-100 select-all cursor-default focus:outline-none"
                />
                <Mail className="h-4 w-4 text-luxury-gold absolute left-3 top-3 pointer-events-none" />
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1.5 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Primary account identity (Read-only)</span>
              </p>
            </div>

            <div>
              <label
                htmlFor="profilePhone1"
                className="block text-xs uppercase tracking-wider font-medium text-neutral-700 dark:text-neutral-300 mb-1"
              >
                Primary Contact Number
              </label>
              <div className="relative">
                <Input
                  id="profilePhone1"
                  name="phone1"
                  type="tel"
                  autoComplete="tel"
                  value={phone1}
                  onChange={(e) => setPhone1(e.target.value)}
                  placeholder="07X XXX XXXX"
                  disabled={profileLoading}
                  className="pl-9 text-sm"
                />
                <Phone className="h-4 w-4 text-neutral-400 absolute left-3 top-3 pointer-events-none" />
              </div>
              <p className="text-[11px] text-neutral-400 mt-1">
                Used by courier delivery services for shipping notifications.
              </p>
            </div>

            <div>
              <label
                htmlFor="profilePhone2"
                className="block text-xs uppercase tracking-wider font-medium text-neutral-700 dark:text-neutral-300 mb-1"
              >
                Secondary / WhatsApp Number
              </label>
              <div className="relative">
                <Input
                  id="profilePhone2"
                  name="phone2"
                  type="tel"
                  autoComplete="tel"
                  value={phone2}
                  onChange={(e) => setPhone2(e.target.value)}
                  placeholder="07X XXX XXXX (optional)"
                  disabled={profileLoading}
                  className="pl-9 text-sm"
                />
                <Phone className="h-4 w-4 text-neutral-400 absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>

            <Button
              type="submit"
              variant="gold"
              size="md"
              disabled={profileLoading}
              className="w-full mt-2 uppercase tracking-wider text-xs font-semibold"
            >
              {profileLoading ? 'Saving Changes...' : 'Save Profile Changes'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 2. Account Security & Password Protection */}
      <Card className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-luxury-surface">
        <CardHeader className="pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-sm bg-luxury-gold/15 text-luxury-gold">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-serif">Account Security</CardTitle>
              <CardDescription className="text-xs">
                Password recovery and account authentication
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="p-4 rounded-sm border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 space-y-2">
            <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
              <KeyRound className="h-4 w-4 text-luxury-gold shrink-0" />
              <span>Password Protection</span>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              To keep your orders and personal data safe, password changes require email verification. When you request a password change, an encrypted one-time reset link is dispatched directly to your registered email address.
            </p>
          </div>

          {resetError && (
            <div className="p-3 rounded-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
              <span className="leading-relaxed">{resetError}</span>
            </div>
          )}

          {resetSuccess ? (
            <div className="p-4 rounded-sm bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs flex items-start space-x-2.5">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-xs">Reset Instructions Sent</p>
                <p className="leading-relaxed text-[11px] opacity-90">{resetSuccess}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={handleSendResetEmail}
                disabled={resetLoading}
                className="w-full border-neutral-300 dark:border-neutral-700 hover:border-luxury-gold hover:text-luxury-gold uppercase tracking-[0.14em] text-xs font-semibold space-x-2 transition-colors"
              >
                <Send className="h-3.5 w-3.5 text-luxury-gold" />
                <span>{resetLoading ? 'Sending Reset Link...' : 'Send Password Reset Link to Email'}</span>
              </Button>
              <p className="text-[11px] text-center text-neutral-500 dark:text-neutral-400">
                You will receive an official verification email with a link to securely enter a new password.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
