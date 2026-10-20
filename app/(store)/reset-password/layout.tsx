import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Set New Password',
  description: 'Update and set your new password for your Splender Jewel account.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
