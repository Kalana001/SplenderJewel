import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, User, Mail, Phone, Calendar, ShoppingBag, Eye } from 'lucide-react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminCustomerById } from '@/lib/customers/admin-actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/config/store';

interface AdminCustomerDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: AdminCustomerDetailPageProps) {
  const { id } = await params;
  return {
    title: `Customer Profile #${id} | Splender Jewel Admin`,
  };
}

export default async function AdminCustomerDetailPage({ params }: AdminCustomerDetailPageProps) {
  await requireAdminPageAuth();
  const { id } = await params;

  const res = await getAdminCustomerById(id);
  if (!res.success || !res.customer) {
    notFound();
  }

  const { customer } = res;
  const joinDate = new Date(customer.created_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex items-center gap-3 border-b border-neutral-800 pb-5">
        <Link
          href="/admin/customers"
          className="p-2 rounded bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:border-luxury-gold/50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white">
            {customer.full_name}
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Registered customer since {joinDate}
          </p>
        </div>
      </div>

      {/* Profile & Spend Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-serif font-bold text-white border-b border-neutral-800 pb-2">
            Contact Details
          </h2>
          <div className="text-xs space-y-2 text-neutral-300">
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-neutral-500" />
              <span>{customer.email}</span>
            </div>
            <div className="flex items-center gap-2 font-mono">
              <Phone className="h-3.5 w-3.5 text-neutral-500" />
              <span>{customer.phone1 || 'No phone recorded'}</span>
            </div>
            {customer.phone2 && (
              <div className="flex items-center gap-2 font-mono text-neutral-400">
                <Phone className="h-3.5 w-3.5 text-neutral-600" />
                <span>Secondary: {customer.phone2}</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-2">
          <span className="text-xs text-neutral-400">Total Orders Placed</span>
          <p className="text-2xl font-bold text-white font-mono">{customer.ordersCount}</p>
          <p className="text-[11px] text-neutral-500">Order count across all statuses</p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-2">
          <span className="text-xs text-neutral-400">Lifetime Spending Value</span>
          <p className="text-2xl font-bold text-luxury-gold font-mono">
            {formatCurrency(customer.totalSpent)}
          </p>
          <p className="text-[11px] text-neutral-500">Gross purchase total</p>
        </div>
      </div>

      {/* Orders Placed by Customer */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 space-y-4">
        <h2 className="text-base font-serif font-bold text-white flex items-center gap-2 border-b border-neutral-800 pb-3">
          <ShoppingBag className="h-4 w-4 text-luxury-gold" />
          <span>Customer Order History ({customer.orders?.length || 0})</span>
        </h2>

        {(customer.orders || []).length === 0 ? (
          <p className="text-xs text-neutral-400 py-6 text-center">
            This customer has not placed any orders yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-neutral-400 border-b border-neutral-800 uppercase text-[10px]">
                <tr>
                  <th className="py-2.5">Order #</th>
                  <th className="py-2.5">Date</th>
                  <th className="py-2.5">Payment</th>
                  <th className="py-2.5">Status</th>
                  <th className="py-2.5 text-right">Total</th>
                  <th className="py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80 text-neutral-300">
                {customer.orders.map((ord: any) => (
                  <tr key={ord.id} className="hover:bg-neutral-850/50 transition-colors">
                    <td className="py-3 font-mono font-bold text-white">
                      <Link href={`/admin/orders/${ord.id}`} className="hover:text-luxury-gold hover:underline">
                        {ord.order_number}
                      </Link>
                    </td>
                    <td className="py-3 text-neutral-400">
                      {new Date(ord.created_at).toLocaleDateString('en-US')}
                    </td>
                    <td className="py-3 uppercase text-[11px]">
                      {ord.payment_method === 'cod' ? 'COD' : 'Bank Transfer'}
                    </td>
                    <td className="py-3 capitalize">
                      <Badge variant="outline" className="text-[10px] uppercase font-bold">
                        {ord.order_status}
                      </Badge>
                    </td>
                    <td className="py-3 text-right font-bold text-luxury-gold">
                      {formatCurrency(ord.total_amount)}
                    </td>
                    <td className="py-3 text-right">
                      <Link href={`/admin/orders/${ord.id}`}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs border-neutral-700 bg-neutral-900 hover:border-luxury-gold"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          <span>View</span>
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
