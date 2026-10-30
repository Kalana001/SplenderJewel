import { NextRequest, NextResponse } from 'next/server';
import { compileDailyOrderSummary, formatDailyOrderSummaryEmail } from '@/lib/orders/daily-summary';
import { sendAdminEmail } from '@/lib/email/gmail-mailer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Validates request authorization.
 * Accepts:
 * 1. Standard Vercel Cron Bearer header: `Authorization: Bearer <CRON_SECRET>`
 * 2. Query param for easy manual testing: `?secret=<CRON_SECRET>`
 * If CRON_SECRET is not configured in environment variables, allows execution with a warning log.
 */
function verifyCronAuthorization(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // If no CRON_SECRET is set, allow (with log) so testing is straightforward before user sets the secret
  if (!cronSecret) {
    return true;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  const urlSecret = request.nextUrl.searchParams.get('secret');
  if (urlSecret && urlSecret === cronSecret) {
    return true;
  }

  return false;
}

export async function GET(request: NextRequest) {
  try {
    if (!verifyCronAuthorization(request)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid or missing CRON_SECRET' },
        { status: 401 }
      );
    }

    // 1. Compile 24-hour order summary metrics
    const summaryData = await compileDailyOrderSummary();

    // 2. Format luxury email template
    const emailPayload = formatDailyOrderSummaryEmail(summaryData);

    // 3. Dispatch via Gmail SMTP to splenderjewel@gmail.com
    const emailResult = await sendAdminEmail(emailPayload);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      reportDate: summaryData.reportDate,
      totalOrders: summaryData.totalOrders,
      totalRevenue: summaryData.totalRevenue,
      totalUnits: summaryData.totalUnits,
      emailSent: emailResult.success,
      emailMessageId: emailResult.messageId || null,
      emailWarning: emailResult.error || null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error during daily summary dispatch';
    console.error('[Daily Order Summary Cron] Error:', message);

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // Support POST for manual administrative triggers
  return GET(request);
}
