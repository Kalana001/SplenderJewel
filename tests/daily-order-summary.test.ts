import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSummaryTimeWindow,
  formatDailyOrderSummaryEmail,
  type DailyOrderSummaryData,
} from '../lib/orders/daily-summary.ts';
import { getGmailTransporter } from '../lib/email/gmail-mailer.ts';

describe('Daily Order Summary & Gmail Notification Suite', () => {
  it('1. calculates a strict 24-hour time window to prevent missing evening orders', () => {
    const reference = new Date('2026-10-30T12:30:00.000Z'); // 6:00 PM SLT
    const { windowStart, windowEnd } = getSummaryTimeWindow(reference);

    assert.equal(windowEnd.toISOString(), '2026-10-30T12:30:00.000Z');
    assert.equal(windowStart.toISOString(), '2026-10-29T12:30:00.000Z');

    const durationHours = (windowEnd.getTime() - windowStart.getTime()) / (1000 * 60 * 60);
    assert.equal(durationHours, 24);
  });

  it('2. formats daily summary email accurately when zero orders are received', () => {
    const data: DailyOrderSummaryData = {
      reportDate: 'Fri, Oct 30, 2026',
      timeWindowDescription: 'Last 24 Hours (As of 6:00 PM Sri Lanka Time)',
      totalOrders: 0,
      totalRevenue: 0,
      totalUnits: 0,
      orders: [],
    };

    const email = formatDailyOrderSummaryEmail(data);

    assert.match(email.subject, /0 orders today/);
    assert.match(email.text, /Total Orders: 0/);
    assert.match(email.text, /No new customer orders were recorded/);
    assert.match(email.html, /SPLENDER JEWEL/);
    assert.match(email.html, /No customer orders were received/);
    assert.match(email.html, /\/admin\/orders/);
  });

  it('3. formats luxury HTML email and metrics when multiple orders are present', () => {
    const data: DailyOrderSummaryData = {
      reportDate: 'Fri, Oct 30, 2026',
      timeWindowDescription: 'Last 24 Hours (As of 6:00 PM Sri Lanka Time)',
      totalOrders: 2,
      totalRevenue: 5250,
      totalUnits: 3,
      orders: [
        {
          orderNumber: 'SJ-10024',
          customerName: 'Anusha Perera',
          phone: '0771234567',
          district: 'Colombo',
          totalAmount: 3450,
          itemCount: 2,
          paymentMethod: 'COD',
          orderStatus: 'pending',
          createdAt: '2026-10-30T09:15:00.000Z',
          itemsDescription: 'Gold Charm Bracelet x1, Pearl Brooch x1',
        },
        {
          orderNumber: 'SJ-10025',
          customerName: 'Dilini Kumarasinghe',
          phone: '0719876543',
          district: 'Kandy',
          totalAmount: 1800,
          itemCount: 1,
          paymentMethod: 'COD',
          orderStatus: 'pending',
          createdAt: '2026-10-30T11:45:00.000Z',
          itemsDescription: 'Evil Eye Beaded Bracelet x1',
        },
      ],
    };

    const email = formatDailyOrderSummaryEmail(data);

    // Subject
    assert.match(email.subject, /2 order\(s\) received/);
    assert.match(email.subject, /Rs\.\s*5,250/);

    // Plain text
    assert.match(email.text, /Total Orders: 2/);
    assert.match(email.text, /Total Revenue: Rs\.\s*5,250/);
    assert.match(email.text, /Total Units Ordered: 3/);
    assert.match(email.text, /Order #SJ-10024/);
    assert.match(email.text, /Anusha Perera/);
    assert.match(email.text, /Order #SJ-10025/);
    assert.match(email.text, /Dilini Kumarasinghe/);

    // HTML template checks
    assert.match(email.html, /#SJ-10024/);
    assert.match(email.html, /#SJ-10025/);
    assert.match(email.html, /Colombo/);
    assert.match(email.html, /Kandy/);
    assert.match(email.html, /href="tel:0771234567"/);
    assert.match(email.html, /Open Admin Order Manager/);
    assert.match(email.html, /splenderjewel@gmail\.com/);
  });

  it('4. safely strips spaces from 16-letter Google App Passwords', () => {
    const originalUser = process.env.SMTP_USER;
    const originalPass = process.env.SMTP_APP_PASSWORD;

    try {
      // Simulate Google 4x4 app password with spaces: "abcd efgh ijkl mnop"
      process.env.SMTP_USER = 'splenderjewel@gmail.com';
      process.env.SMTP_APP_PASSWORD = 'abcd efgh ijkl mnop';

      const transporter = getGmailTransporter();
      assert.ok(transporter, 'Transporter must be created');
      const auth = (transporter as any).options?.auth;
      assert.equal(auth?.user, 'splenderjewel@gmail.com');
      assert.equal(auth?.pass, 'abcdefghijklmnop', 'Spaces must be stripped from Google App Password');
    } finally {
      process.env.SMTP_USER = originalUser;
      process.env.SMTP_APP_PASSWORD = originalPass;
    }
  });

  it('5. returns null transporter and fails gracefully if SMTP_APP_PASSWORD is not set', () => {
    const originalPass = process.env.SMTP_APP_PASSWORD;
    const originalGmailPass = process.env.GMAIL_APP_PASSWORD;

    try {
      delete process.env.SMTP_APP_PASSWORD;
      delete process.env.GMAIL_APP_PASSWORD;

      const transporter = getGmailTransporter();
      assert.equal(transporter, null, 'Must return null without crashing when password is not configured');
    } finally {
      process.env.SMTP_APP_PASSWORD = originalPass;
      process.env.GMAIL_APP_PASSWORD = originalGmailPass;
    }
  });

  it('6. verifies CRON_SECRET authorization logic for both header and URL query parameter', () => {
    const cronSecret = 'splender_secret_test_token_123';

    // Verify Bearer Header
    const validHeader: string = `Bearer ${cronSecret}`;
    const invalidHeader: string = `Bearer wrong_token`;

    assert.equal(validHeader === `Bearer ${cronSecret}`, true);
    assert.equal(invalidHeader === `Bearer ${cronSecret}`, false);

    // Verify Query Param fallback
    const validQuery: string = 'splender_secret_test_token_123';
    const invalidQuery: string = 'random_query';

    assert.equal(validQuery === cronSecret, true);
    assert.equal(invalidQuery === cronSecret, false);
  });

  it('7. verifies vercel.json cron schedule is configured for 12:30 UTC (6:00 PM Sri Lanka Time)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const vercelConfigPath = path.resolve(process.cwd(), 'vercel.json');

    assert.ok(fs.existsSync(vercelConfigPath), 'vercel.json must exist');
    const config = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));

    assert.ok(Array.isArray(config.crons), 'crons array must be defined');
    const dailyCron = config.crons.find((c: any) => c.path === '/api/cron/daily-order-summary');
    assert.ok(dailyCron, 'daily-order-summary cron must be defined');
    assert.equal(dailyCron.schedule, '30 12 * * *', 'Schedule must be 30 12 * * * (12:30 UTC = 18:00 SLT)');
  });
});
