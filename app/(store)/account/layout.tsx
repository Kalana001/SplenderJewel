import type { Metadata } from 'next';
import { AccountNav } from '@/components/store/account-nav';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AccountNav />
      {children}
    </>
  );
}
