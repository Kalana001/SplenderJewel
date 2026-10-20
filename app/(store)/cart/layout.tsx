import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shopping Bag',
  description: 'Review the items in your Splender Jewel shopping bag.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function CartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
