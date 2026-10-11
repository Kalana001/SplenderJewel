'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Search, Users, ShoppingBag, Eye, Calendar, Phone, Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/config/store';
import type { AdminCustomerRecord } from '@/lib/customers/admin-actions';

interface CustomersTableProps {
  initialCustomers: AdminCustomerRecord[];
  total: number;
}

export function CustomersTable({ initialCustomers, total }: CustomersTableProps) {
  const [customers, setCustomers] = useState<AdminCustomerRecord[]>(initialCustomers);
  const [search, setSearch] = useState('');

  const filtered = customers.filter((c) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase().trim();
    return (
      c.fullName.toLowerCase().includes(s) ||
      c.email.toLowerCase().includes(s) ||
      (c.phone1 && c.phone1.includes(s))
    );
  });

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            type="text"
            placeholder="Search by customer name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-neutral-950 border-neutral-700 text-white text-sm"
          />
        </div>

        <div className="text-xs text-neutral-400">
          Showing <strong className="text-white">{filtered.length}</strong> of{' '}
          <strong className="text-white">{total}</strong> registered accounts
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Users className="h-10 w-10 text-neutral-600 mx-auto" />
            <h3 className="text-base font-semibold text-white">No customers found</h3>
            <p className="text-xs text-neutral-400">
              {customers.length === 0
                ? 'No customers have registered an account yet.'
                : 'No registered profiles match your search.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-950/80 border-b border-neutral-800 text-neutral-400 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-4">Contact Info</th>
                  <th className="py-3 px-4">Joined Date</th>
                  <th className="py-3 px-4 text-center">Orders</th>
                  <th className="py-3 px-4 text-right">Lifetime Spend</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80 text-neutral-300">
                {filtered.map((customer) => {
                  const joinDate = new Date(customer.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });

                  return (
                    <tr key={customer.id} className="hover:bg-neutral-850/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/admin/customers/${customer.id}`}
                          className="font-semibold text-white hover:text-luxury-gold hover:underline block"
                        >
                          {customer.fullName}
                        </Link>
                      </td>
                      <td className="py-3.5 px-4 space-y-0.5">
                        <div className="flex items-center gap-1.5 text-neutral-300">
                          <Mail className="h-3 w-3 text-neutral-500 shrink-0" />
                          <span>{customer.email}</span>
                        </div>
                        {customer.phone1 && (
                          <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 font-mono">
                            <Phone className="h-3 w-3 text-neutral-500 shrink-0" />
                            <span>{customer.phone1}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-400 whitespace-nowrap">{joinDate}</td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-white font-mono">{customer.ordersCount}</span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-luxury-gold whitespace-nowrap">
                        {formatCurrency(customer.totalSpent)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link href={`/admin/customers/${customer.id}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs border-neutral-700 bg-neutral-900 hover:border-luxury-gold hover:text-luxury-gold"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            <span>View</span>
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
