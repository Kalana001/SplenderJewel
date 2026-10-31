'use client';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from '../config/store.ts';

export interface InvoiceItem {
  productName: string;
  variantTitle?: string | null;
  sku?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface InvoiceOrderData {
  orderNumber: string;
  createdAt: string;
  customerName: string;
  phone1: string;
  phone2?: string | null;
  email?: string | null;
  addressLine?: string | null;
  city?: string | null;
  district: string;
  postalCode?: string | null;
  subtotal: number;
  deliveryFee: number;
  discountAmount?: number;
  couponCode?: string | null;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  trackingNumber?: string | null;
  items: InvoiceItem[];
}

/**
 * Formats a clean date without time (e.g. "Oct 31, 2026") in Sri Lanka timezone.
 */
export function formatInvoiceDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('en-US', {
      timeZone: 'Asia/Colombo',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

/**
 * Loads the brand logo as a Data URL for jsPDF.
 */
async function loadLogoDataUrl(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const response = await fetch('/images/logo.png');
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Generates and downloads an A4 single-page luxury PDF invoice for Splender Jewel.
 * Designed to strictly stay within page boundaries with zero text overflowing.
 */
export async function generateOrderInvoicePdf(order: InvoiceOrderData): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182 mm

  // Refined Color Palette
  const brandDark: [number, number, number] = [24, 24, 27]; // #18181b
  const brandGold: [number, number, number] = [190, 145, 45]; // #be912d
  const textDark: [number, number, number] = [35, 35, 35];
  const textMuted: [number, number, number] = [110, 110, 110];
  const borderLight: [number, number, number] = [225, 227, 230];
  const cardBg: [number, number, number] = [252, 252, 252];
  const successGreen: [number, number, number] = [16, 140, 95];
  const pendingAmber: [number, number, number] = [190, 105, 5];

  const isPaid = order.paymentStatus === 'verified';
  const isCod = order.paymentMethod === 'cod';

  // 1. TOP HEADER: LOGO & INVOICE IDENTIFIER
  const logoData = await loadLogoDataUrl();
  const logoSize = 18; // 18x18 mm

  if (logoData) {
    try {
      doc.addImage(logoData, 'JPEG', margin, margin, logoSize, logoSize);
    } catch {
      // Fallback gracefully
    }
  }

  // Brand Name & Tagline next to logo
  const brandTextX = logoData ? margin + logoSize + 4 : margin;
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...brandDark);
  doc.text('SPLENDER JEWEL', brandTextX, margin + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...brandGold);
  doc.text('THE JEWEL GALLERY  •  LUXURY ACCESSORIES', brandTextX, margin + 11);

  doc.setTextColor(...textMuted);
  doc.setFontSize(7);
  doc.text('66/A/38 St. Jude Place, Thaladuwa, Negombo', brandTextX, margin + 15);

  // Right Header Title
  const invoiceTitle = isPaid ? 'OFFICIAL RECEIPT' : 'ORDER INVOICE';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...brandDark);
  doc.text(invoiceTitle, pageWidth - margin, margin + 6, { align: 'right' });

  // Right Status Tag Pill
  const statusPillW = 46;
  const statusPillH = 6.5;
  const statusPillX = pageWidth - margin - statusPillW;
  const statusPillY = margin + 9.5;

  if (isPaid) {
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(...successGreen);
    doc.setLineWidth(0.3);
    doc.roundedRect(statusPillX, statusPillY, statusPillW, statusPillH, 1, 1, 'FD');
    doc.setTextColor(...successGreen);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('PAID IN FULL', statusPillX + statusPillW / 2, statusPillY + 4.5, { align: 'center' });
  } else if (isCod) {
    doc.setFillColor(254, 252, 232);
    doc.setDrawColor(...pendingAmber);
    doc.setLineWidth(0.3);
    doc.roundedRect(statusPillX, statusPillY, statusPillW, statusPillH, 1, 1, 'FD');
    doc.setTextColor(...pendingAmber);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('PAYMENT DUE ON DELIVERY', statusPillX + statusPillW / 2, statusPillY + 4.5, { align: 'center' });
  } else {
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(...pendingAmber);
    doc.setLineWidth(0.3);
    doc.roundedRect(statusPillX, statusPillY, statusPillW, statusPillH, 1, 1, 'FD');
    doc.setTextColor(...pendingAmber);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('PAYMENT PENDING', statusPillX + statusPillW / 2, statusPillY + 4.5, { align: 'center' });
  }

  // Header Divider
  doc.setDrawColor(...borderLight);
  doc.setLineWidth(0.4);
  doc.line(margin, margin + 22, pageWidth - margin, margin + 22);

  // 2. TWO DETAILS CARDS (FROM & TO)
  const cardY = margin + 26;
  const cardGap = 8;
  const cardW = (contentWidth - cardGap) / 2; // 87 mm each
  const cardH = 38; // 38 mm height
  const leftCardX = margin;
  const rightCardX = margin + cardW + cardGap;
  const textPad = 4.5;
  const usableTextW = cardW - textPad * 2; // 78 mm max width for text!

  // Left Card: FROM (Splender Jewel)
  doc.setFillColor(...cardBg);
  doc.setDrawColor(...borderLight);
  doc.setLineWidth(0.3);
  doc.roundedRect(leftCardX, cardY, cardW, cardH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...brandGold);
  doc.text('FROM', leftCardX + textPad, cardY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...brandDark);
  doc.text('Splender Jewel', leftCardX + textPad, cardY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...textDark);
  doc.text('Luxury Jewelry & Accessories', leftCardX + textPad, cardY + 16.5);
  doc.text('66/A/38 St. Jude Place, Thaladuwa, Negombo', leftCardX + textPad, cardY + 21);
  doc.setTextColor(...textMuted);
  doc.text('WhatsApp: +94 76 468 9907', leftCardX + textPad, cardY + 26);
  doc.text('Email: splenderjewel@gmail.com', leftCardX + textPad, cardY + 30.5);
  doc.text('Web: https://splender-jewel.vercel.app', leftCardX + textPad, cardY + 35);

  // Right Card: TO (Client Details)
  doc.setFillColor(...cardBg);
  doc.setDrawColor(...borderLight);
  doc.setLineWidth(0.3);
  doc.roundedRect(rightCardX, cardY, cardW, cardH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...brandGold);
  doc.text('TO', rightCardX + textPad, cardY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...brandDark);
  const clientName = order.customerName || 'Valued Customer';
  doc.text(clientName, rightCardX + textPad, cardY + 12);

  // Strictly wrap address text to stay inside usable card width!
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...textDark);

  const addressRawParts = [
    order.addressLine,
    order.city,
    order.district ? `${order.district} District` : null,
    order.postalCode,
  ].filter(Boolean);
  const fullAddressStr = addressRawParts.join(', ') || 'Domestic Delivery (Sri Lanka)';

  const wrappedAddressLines: string[] = doc.splitTextToSize(fullAddressStr, usableTextW);
  let addressCursorY = cardY + 16.5;

  // Print first 2 wrapped lines safely
  for (let i = 0; i < Math.min(wrappedAddressLines.length, 2); i++) {
    doc.text(wrappedAddressLines[i], rightCardX + textPad, addressCursorY);
    addressCursorY += 4.5;
  }

  // Client Phone & Contact
  const phones = [order.phone1, order.phone2].filter(Boolean).join(' / ') || 'Not provided';
  doc.setTextColor(...textMuted);
  doc.text(`Phone: ${phones}`, rightCardX + textPad, cardY + 26);

  if (order.email) {
    doc.text(`Email: ${order.email}`, rightCardX + textPad, cardY + 30.5);
  } else if (order.trackingNumber) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...textDark);
    doc.text(`Courier Tracking: ${order.trackingNumber}`, rightCardX + textPad, cardY + 30.5);
    doc.setFont('helvetica', 'normal');
  } else {
    doc.text('Delivery Method: Doorstep Courier Delivery', rightCardX + textPad, cardY + 30.5);
  }

  if (order.trackingNumber && order.email) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...textDark);
    doc.text(`Courier Tracking: ${order.trackingNumber}`, rightCardX + textPad, cardY + 35);
  }

  // 3. METADATA ROW (Below Cards, matching reference)
  const metaY = cardY + cardH + 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...brandDark);
  doc.text('Invoice No : ', margin, metaY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textDark);
  doc.text(order.orderNumber, margin + 18, metaY);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...brandDark);
  doc.text('Invoice Date : ', margin, metaY + 5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textDark);
  doc.text(formatInvoiceDate(order.createdAt), margin + 20, metaY + 5);

  // Right side of metadata row
  const rightMetaColX = 118;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...brandDark);
  doc.text('Payment Method : ', rightMetaColX, metaY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textDark);
  const paymentMethodLabel = isCod ? 'Cash on Delivery (COD)' : 'Bank Deposit / Transfer';
  doc.text(paymentMethodLabel, rightMetaColX + 27, metaY);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...brandDark);
  doc.text('Payment Status : ', rightMetaColX, metaY + 5);

  if (isPaid) {
    doc.setTextColor(...successGreen);
    doc.text('Paid in Full (Balance Due: Rs. 0.00)', rightMetaColX + 25, metaY + 5);
  } else if (isCod) {
    doc.setTextColor(...pendingAmber);
    doc.text(`Due on Delivery (${formatCurrency(order.totalAmount)})`, rightMetaColX + 25, metaY + 5);
  } else {
    doc.setTextColor(...pendingAmber);
    doc.text(`${order.paymentStatus.toUpperCase()} (${formatCurrency(order.totalAmount)})`, rightMetaColX + 25, metaY + 5);
  }

  // 4. ITEMS TABLE (AutoTable)
  const tableStartY = metaY + 9;

  const tableRows = (order.items || []).map((item, index) => {
    const details = [
      item.variantTitle ? `Variant: ${item.variantTitle}` : null,
      item.sku ? `SKU: ${item.sku}` : null,
    ]
      .filter(Boolean)
      .join('  |  ');

    const desc = details ? `${item.productName}\n${details}` : item.productName;

    return [
      String(index + 1),
      desc,
      String(item.quantity),
      formatCurrency(item.unitPrice),
      formatCurrency(item.totalPrice),
    ];
  });

  autoTable(doc, {
    startY: tableStartY,
    head: [['#', 'Item Description', 'Qty', 'Unit Price', 'Line Total']],
    body: tableRows,
    theme: 'plain',
    margin: { left: margin, right: margin },
    tableWidth: contentWidth,
    headStyles: {
      fillColor: [244, 245, 247],
      textColor: [35, 35, 35],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      lineColor: [220, 222, 226],
      lineWidth: { bottom: 0.5, top: 0.5 },
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 98, halign: 'left' },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [40, 40, 40],
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      lineColor: [235, 237, 240],
      lineWidth: { bottom: 0.3 },
    },
    alternateRowStyles: {
      fillColor: [253, 253, 254],
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 6;

  // 5. INVOICE SUMMARY BOX (Bottom Right, matching reference)
  const summaryBoxW = 78;
  const summaryBoxX = pageWidth - margin - summaryBoxW; // 118 mm
  const summaryCursorY = finalY;

  // Outer border card for summary
  const hasDiscount = Boolean(order.discountAmount && order.discountAmount > 0);
  const summaryBoxH = hasDiscount ? 42 : 36;

  doc.setFillColor(...cardBg);
  doc.setDrawColor(...borderLight);
  doc.setLineWidth(0.3);
  doc.roundedRect(summaryBoxX, summaryCursorY, summaryBoxW, summaryBoxH, 1.5, 1.5, 'FD');

  // Header band for summary box
  doc.setFillColor(244, 245, 247);
  doc.roundedRect(summaryBoxX, summaryCursorY, summaryBoxW, 7, 1.5, 1.5, 'F');
  doc.setDrawColor(...borderLight);
  doc.line(summaryBoxX, summaryCursorY + 7, summaryBoxX + summaryBoxW, summaryCursorY + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...brandDark);
  doc.text('Invoice Summary', summaryBoxX + 4, summaryCursorY + 4.8);

  const sumLabelX = summaryBoxX + 4;
  const sumValX = summaryBoxX + summaryBoxW - 4;
  let rowY = summaryCursorY + 12;

  // Subtotal
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...textMuted);
  doc.text('Subtotal', sumLabelX, rowY);
  doc.setTextColor(...textDark);
  doc.text(formatCurrency(order.subtotal), sumValX, rowY, { align: 'right' });
  rowY += 5;

  // Discount (if any)
  if (hasDiscount) {
    doc.setTextColor(...textMuted);
    doc.text(`Discount (${order.couponCode || 'Promo'})`, sumLabelX, rowY);
    doc.setTextColor(190, 40, 40);
    doc.text(`-${formatCurrency(order.discountAmount || 0)}`, sumValX, rowY, { align: 'right' });
    rowY += 5;
  }

  // Delivery Fee
  doc.setTextColor(...textMuted);
  doc.text('Delivery Fee', sumLabelX, rowY);
  doc.setTextColor(...textDark);
  doc.text(formatCurrency(order.deliveryFee), sumValX, rowY, { align: 'right' });
  rowY += 6;

  // Divider line before Total
  doc.setDrawColor(...borderLight);
  doc.setLineWidth(0.4);
  doc.line(sumLabelX, rowY - 2, sumValX, rowY - 2);

  // Total Amount
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...brandDark);
  doc.text('Total Amount', sumLabelX, rowY + 1.5);
  doc.setTextColor(...brandGold);
  doc.text(formatCurrency(order.totalAmount), sumValX, rowY + 1.5, { align: 'right' });

  // Status Note Pill inside Summary Card
  const pillY = rowY + 4;
  if (isPaid) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...successGreen);
    doc.text('✓ Paid in Full (Balance Due: Rs. 0.00)', sumLabelX, pillY + 3);
  } else if (isCod) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...pendingAmber);
    doc.text(`• Amount Due to Courier: ${formatCurrency(order.totalAmount)}`, sumLabelX, pillY + 3);
  }

  // 6. FOOTER (Strictly pinned at bottom of A4 page: Y = 274 mm)
  const footerY = 274;
  doc.setDrawColor(...borderLight);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY, pageWidth - margin, footerY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...textDark);
  doc.text('Thank you for choosing Splender Jewel!', pageWidth / 2, footerY + 5, { align: 'center' });

  doc.setFontSize(7);
  doc.setTextColor(...textMuted);
  doc.text(
    'Store: 66/A/38 St. Jude Place, Thaladuwa, Negombo   •   WhatsApp: +94 76 468 9907   •   splenderjewel@gmail.com',
    pageWidth / 2,
    footerY + 9,
    { align: 'center' }
  );
  doc.text(
    'Website: https://splender-jewel.vercel.app   •   Priority Islandwide Doorstep Delivery by Courier',
    pageWidth / 2,
    footerY + 13,
    { align: 'center' }
  );

  // Save the PDF
  const cleanOrderNum = order.orderNumber.replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = `SplenderJewel_Invoice_${cleanOrderNum}.pdf`;
  doc.save(filename);
}
