import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Container } from '@/components/ui/container';
import { ProfileEditor } from '@/components/store/profile-editor';
import { ArrowLeft, UserCircle } from 'lucide-react';

export const metadata = {
  title: 'Profile Details',
  description: 'Manage your contact information and account security at Splender Jewel.',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AccountProfilePage() {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    redirect('/login?error=Database%20service%20unavailable');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/account/profile');
  }

  const { data: profile } = await (supabase.from('profiles') as any)
    .select('id, email, full_name, phone1, phone2, avatar_url, account_status, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle();

  // Sanitize phone1: ensure legacy or autofilled email addresses are never treated as phone numbers
  const rawPhone1 = profile?.phone1 || (user.user_metadata?.phone1 as string) || '';
  const sanitizedPhone1 = rawPhone1 && !rawPhone1.includes('@') ? rawPhone1 : '';

  const initialProfile = {
    fullName: profile?.full_name || (user.user_metadata?.full_name as string) || '',
    email: user.email || '',
    phone1: sanitizedPhone1,
    phone2: profile?.phone2 || null,
  };

  return (
    <div className="py-8 sm:py-12 bg-neutral-50/50 dark:bg-neutral-950/30 min-h-[80vh]">
      <Container size="xl">
        {/* Breadcrumb & Navigation */}
        <div className="mb-6">
          <Link
            href="/account"
            className="inline-flex items-center space-x-1.5 text-xs text-neutral-500 hover:text-luxury-gold transition-colors font-medium"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to My Account</span>
          </Link>
        </div>

        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-sm bg-luxury-gold/15 text-luxury-gold border border-luxury-gold/30">
              <UserCircle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Personal Details
              </h1>
              <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                Manage your contact information and account security.
              </p>
            </div>
          </div>
        </div>

        {/* Profile Editor Component */}
        <ProfileEditor initialProfile={initialProfile} />
      </Container>
    </div>
  );
}
