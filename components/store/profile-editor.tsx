'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { updateCustomerProfile, updatePassword } from '@/lib/auth/actions';
import { User, Phone, Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';

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

  // Password Update State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

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

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSuccess(null);
    setPasswordError(null);

    if (!newPassword) {
      setPasswordError('Please enter a new password.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setPasswordLoading(true);

    try {
      const result = await updatePassword(newPassword);

      if (!result.success) {
        setPasswordError(result.error || 'Failed to update password.');
      } else {
        setPasswordSuccess('Your password has been updated successfully.');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err: any) {
      setPasswordError(err?.message || 'An unexpected error occurred.');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 1. Personal Profile Details */}
      <Card className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-luxury-surface">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-serif">Personal Information</CardTitle>
          <CardDescription className="text-xs">
            Update your contact details for ordering and shipping updates.
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
                  type="text"
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
                <Input
                  id="profileEmail"
                  type="email"
                  disabled
                  value={initialProfile.email}
                  className="pl-9 text-sm bg-neutral-100 dark:bg-neutral-850 cursor-not-allowed opacity-80"
                />
                <Mail className="h-4 w-4 text-neutral-400 absolute left-3 top-3 pointer-events-none" />
              </div>
              <p className="text-[11px] text-neutral-400 mt-1">
                Your email address is your primary account identity.
              </p>
            </div>

            <div>
              <label
                htmlFor="profilePhone1"
                className="block text-xs uppercase tracking-wider font-medium text-neutral-700 dark:text-neutral-300 mb-1"
              >
                Primary Phone Number
              </label>
              <div className="relative">
                <Input
                  id="profilePhone1"
                  type="tel"
                  value={phone1}
                  onChange={(e) => setPhone1(e.target.value)}
                  placeholder="07X XXX XXXX"
                  disabled={profileLoading}
                  className="pl-9 text-sm"
                />
                <Phone className="h-4 w-4 text-neutral-400 absolute left-3 top-3 pointer-events-none" />
              </div>
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
                  type="tel"
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

      {/* 2. Security & Password Update */}
      <Card className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-luxury-surface">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-serif">Security & Password</CardTitle>
          <CardDescription className="text-xs">
            Change your account password regularly to keep your orders secure.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {passwordError && (
            <div className="mb-4 p-3 rounded-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
              <span>{passwordError}</span>
            </div>
          )}

          {passwordSuccess && (
            <div className="mb-4 p-3 rounded-sm bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs flex items-start space-x-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{passwordSuccess}</span>
            </div>
          )}

          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <label
                htmlFor="newPassword"
                className="block text-xs uppercase tracking-wider font-medium text-neutral-700 dark:text-neutral-300 mb-1"
              >
                New Password (8+ characters)
              </label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  disabled={passwordLoading}
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
                htmlFor="confirmNewPassword"
                className="block text-xs uppercase tracking-wider font-medium text-neutral-700 dark:text-neutral-300 mb-1"
              >
                Confirm New Password
              </label>
              <div className="relative">
                <Input
                  id="confirmNewPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  disabled={passwordLoading}
                  className="pl-9 text-sm"
                />
                <Lock className="h-4 w-4 text-neutral-400 absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>

            <Button
              type="submit"
              variant="outline"
              size="md"
              disabled={passwordLoading}
              className="w-full mt-2 uppercase tracking-wider text-xs font-semibold hover:border-luxury-gold"
            >
              {passwordLoading ? 'Updating Password...' : 'Update Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
