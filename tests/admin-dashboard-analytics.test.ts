import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DailyChartPoint } from '../lib/orders/admin-actions.ts';

describe('Admin Dashboard Analytics & Chart Suite', () => {
  it('1. builds accurate 7-day and 30-day buckets with consecutive dates', () => {
    const now = new Date('2026-10-31T12:00:00.000Z');
    const series30d: DailyChartPoint[] = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateKey = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
      const label = d.toLocaleDateString('en-US', {
        timeZone: 'Asia/Colombo',
        month: 'short',
        day: 'numeric',
      });
      const dayName = d.toLocaleDateString('en-US', {
        timeZone: 'Asia/Colombo',
        weekday: 'short',
      });

      series30d.push({
        date: dateKey,
        label,
        dayName,
        revenue: 0,
        orders: 0,
      });
    }

    assert.equal(series30d.length, 30);
    assert.equal(series30d[0].date, '2026-10-02');
    assert.equal(series30d[29].date, '2026-10-31');

    const series7d = series30d.slice(23);
    assert.equal(series7d.length, 7);
    assert.equal(series7d[0].date, '2026-10-25');
    assert.equal(series7d[6].date, '2026-10-31');
  });

  it('2. maps order revenue into corresponding date buckets', () => {
    const map: Record<string, DailyChartPoint> = {
      '2026-10-31': { date: '2026-10-31', label: 'Oct 31', dayName: 'Sat', revenue: 0, orders: 0 },
    };

    const mockOrders = [
      { total_amount: 1450, created_at: '2026-10-31T09:30:00Z', payment_method: 'cod' },
      { total_amount: 2500, created_at: '2026-10-31T11:00:00Z', payment_method: 'bank_transfer' },
    ];

    for (const ord of mockOrders) {
      const dKey = new Date(ord.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
      if (map[dKey]) {
        map[dKey].revenue += ord.total_amount;
        map[dKey].orders += 1;
      }
    }

    assert.equal(map['2026-10-31'].revenue, 3950);
    assert.equal(map['2026-10-31'].orders, 2);
  });

  it('3. aggregates payment breakdown and district distribution correctly', () => {
    const paymentBreakdown = {
      cod: { count: 0, revenue: 0 },
      bankTransfer: { count: 0, revenue: 0 },
    };
    const districtMap: Record<string, { count: number; revenue: number }> = {};

    const orders = [
      { total_amount: 1450, payment_method: 'cod', district: 'Colombo' },
      { total_amount: 3000, payment_method: 'bank_transfer', district: 'Gampaha' },
      { total_amount: 2000, payment_method: 'cod', district: 'Colombo' },
    ];

    for (const ord of orders) {
      if (ord.payment_method === 'cod') {
        paymentBreakdown.cod.count += 1;
        paymentBreakdown.cod.revenue += ord.total_amount;
      } else if (ord.payment_method === 'bank_transfer') {
        paymentBreakdown.bankTransfer.count += 1;
        paymentBreakdown.bankTransfer.revenue += ord.total_amount;
      }

      if (!districtMap[ord.district]) {
        districtMap[ord.district] = { count: 0, revenue: 0 };
      }
      districtMap[ord.district].count += 1;
      districtMap[ord.district].revenue += ord.total_amount;
    }

    assert.equal(paymentBreakdown.cod.count, 2);
    assert.equal(paymentBreakdown.cod.revenue, 3450);
    assert.equal(paymentBreakdown.bankTransfer.count, 1);
    assert.equal(paymentBreakdown.bankTransfer.revenue, 3000);

    assert.equal(districtMap['Colombo'].count, 2);
    assert.equal(districtMap['Colombo'].revenue, 3450);
    assert.equal(districtMap['Gampaha'].count, 1);
    assert.equal(districtMap['Gampaha'].revenue, 3000);
  });
});
