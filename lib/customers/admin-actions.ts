'use server';

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/auth/server';

export interface AdminCustomerFilter {
  search?: string;
  page?: number;
  limit?: number;
}

export interface AdminCustomerRecord {
  id: string;
  email: string;
  fullName: string;
  phone1: string | null;
  phone2: string | null;
  createdAt: string;
  ordersCount: number;
  totalSpent: number;
}

/**
 * FETCH REGISTERED CUSTOMERS DIRECTORY
 * Includes aggregated orders count and total spent.
 */
export async function getAdminCustomers(filter: AdminCustomerFilter = {}) {
  await requireAdminAuth();
  const adminClient = createAdminClient();

  const { search, page = 1, limit = 25 } = filter;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    let query = (adminClient.from('profiles') as any)
      .select('id, email, full_name, phone1, phone2, created_at', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      query = query.or(`full_name.ilike.${s},email.ilike.${s},phone1.ilike.${s}`);
    }

    const { data: profiles, count, error } = await query.range(from, to);

    if (error) {
      console.error('[AdminCustomers] Error querying profiles:', error.message);
      return { success: false, error: 'Failed to load customers directory.', customers: [], total: 0 };
    }

    // Fetch orders to aggregate customer spending for currently loaded profiles
    const profileIds = (profiles || []).map((p: any) => p.id);
    let allOrders: any[] = [];
    if (profileIds.length > 0) {
      const { data: pOrders } = await (adminClient.from('orders') as any)
        .select('user_id, total_amount')
        .in('user_id', profileIds);
      allOrders = pOrders || [];
    }

    const spendMap = new Map<string, { count: number; total: number }>();
    if (allOrders) {
      for (const order of allOrders) {
        if (!order.user_id) continue;
        const current = spendMap.get(order.user_id) || { count: 0, total: 0 };
        spendMap.set(order.user_id, {
          count: current.count + 1,
          total: current.total + (Number(order.total_amount) || 0),
        });
      }
    }

    const customers: AdminCustomerRecord[] = (profiles || []).map((p: any) => {
      const stats = spendMap.get(p.id) || { count: 0, total: 0 };
      return {
        id: p.id,
        email: p.email,
        fullName: p.full_name,
        phone1: p.phone1,
        phone2: p.phone2,
        createdAt: p.created_at,
        ordersCount: stats.count,
        totalSpent: stats.total,
      };
    });

    return {
      success: true,
      customers,
      total: count || 0,
      totalRegisteredCount: count || 0,
    };
  } catch (err: unknown) {
    console.error('[AdminCustomers] Unexpected error:', err);
    return { success: false, error: 'Failed to load customers directory.', customers: [], total: 0 };
  }
}

/**
 * FETCH SINGLE CUSTOMER DETAIL AND ORDER HISTORY
 */
export async function getAdminCustomerById(customerId: string) {
  await requireAdminAuth();
  const adminClient = createAdminClient();

  try {
    const { data: profile, error: profileErr } = await (adminClient.from('profiles') as any)
      .select('id, email, full_name, phone1, phone2, avatar_url, created_at, updated_at')
      .eq('id', customerId)
      .single();

    if (profileErr || !profile) {
      return { success: false, error: 'Customer not found.', customer: null };
    }

    const { data: orders, error: ordersErr } = await (adminClient.from('orders') as any)
      .select('id, order_number, total_amount, order_status, payment_method, payment_status, created_at')
      .eq('user_id', customerId)
      .order('created_at', { ascending: false });

    const totalSpent = (orders || []).reduce((acc: number, o: any) => acc + (Number(o.total_amount) || 0), 0);

    return {
      success: true,
      customer: {
        ...profile,
        orders: orders || [],
        ordersCount: orders?.length || 0,
        totalSpent,
      },
    };
  } catch (err: unknown) {
    console.error('[AdminCustomerById] Error:', err);
    return { success: false, error: 'Failed to retrieve customer details.', customer: null };
  }
}
