if (typeof window !== 'undefined') {
  throw new Error('[Security] lib/email/gmail-mailer.ts can only be executed in a server environment.');
}
import nodemailer from 'nodemailer';

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SendEmailOptions {
  to?: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Returns a configured Nodemailer transporter using Gmail SMTP.
 * Requires an App Password generated from Google Account Security.
 */
export function getGmailTransporter() {
  const user = process.env.SMTP_USER || process.env.GMAIL_USER || 'splenderjewel@gmail.com';
  const pass = process.env.SMTP_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD;

  if (!pass) {
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: user.trim(),
      pass: pass.trim().replace(/\s+/g, ''), // Strip any spaces from the 16-letter App Password
    },
  });
}

/**
 * Sends an email using Gmail SMTP.
 * Fails safely with a clear warning if credentials are not configured yet.
 */
export async function sendAdminEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const recipient = options.to || process.env.ADMIN_NOTIFICATION_EMAIL || process.env.SMTP_USER || 'splenderjewel@gmail.com';
  const sender = process.env.SMTP_USER || process.env.GMAIL_USER || 'splenderjewel@gmail.com';

  const transporter = getGmailTransporter();
  if (!transporter) {
    const errorMsg = '[Gmail SMTP] SMTP_APP_PASSWORD is not set. Please set SMTP_APP_PASSWORD in environment variables.';
    console.warn(errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }

  try {
    const info = await transporter.sendMail({
      from: `"Splender Jewel Storefront" <${sender}>`,
      to: recipient,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown SMTP error';
    console.error('[Gmail SMTP] Failed to dispatch email:', message);
    return {
      success: false,
      error: message,
    };
  }
}
