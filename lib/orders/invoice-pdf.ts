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
 * Generates and downloads a luxury vector PDF invoice for Splender Jewel.
 */
export function generateOrderInvoicePdf(order: InvoiceOrderData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Colors
  const goldColor: [number, number, number] = [212, 175, 55]; // #d4af37
  const darkBg: [number, number, number] = [24, 24, 27]; // #18181b
  const textDark: [number, number, number] = [35, 35, 35];
  const textMuted: [number, number, number] = [105, 105, 105];
  const successGreen: [number, number, number] = [16, 140, 95];
  const pendingAmber: [number, number, number] = [190, 105, 5];

  const isBankTransfer = order.paymentMethod === 'bank_transfer';
  const isPaid = order.paymentStatus === 'verified';
  const isCod = order.paymentMethod === 'cod';

  // 1. Top Decorative Brand Bar
  doc.setFillColor(...darkBg);
  doc.rect(margin, margin, contentWidth, 24, 'F');

  // Brand Name
  doc.setTextColor(...goldColor);
  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  doc.text('SPLENDER JEWEL', margin + 6, margin + 10);

  doc.setTextColor(220, 220, 220);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('LUXURY JEWELRY & ACCESSORIES', margin + 6, margin + 15);
  doc.text('66/A/38 St. Jude Place, Thaladuwa, Negombo', margin + 6, margin + 19);

  // Right Header: Invoice Title
  doc.setTextColor(...goldColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  const invoiceTypeTitle = isPaid ? 'OFFICIAL RECEIPT' : 'ORDER INVOICE';
  doc.text(invoiceTypeTitle, pageWidth - margin - 6, margin + 10, { align: 'right' });

  doc.setTextColor(240, 240, 240);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Invoice #: INV-${order.orderNumber}`, pageWidth - margin - 6, margin + 15, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${formatInvoiceDate(order.createdAt)}`, pageWidth - margin - 6, margin + 19, { align: 'right' });

  let currentY = margin + 30;

  // 2. Payment Status Banner
  if (isPaid) {
    // Green Paid Badge
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(...successGreen);
    doc.setLineWidth(0.4);
    doc.roundedRect(margin, currentY, contentWidth, 12, 1.5, 1.5, 'FD');

    doc.setTextColor(...successGreen);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('PAID IN FULL', margin + 4, currentY + 7);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Payment Method: Bank Deposit / Transfer  |  Balance Due: Rs. 0.00`, margin + 34, currentY + 7);
  } else if (isCod) {
    // Amber COD Payment Due Badge
    doc.setFillColor(254, 252, 232);
    doc.setDrawColor(...pendingAmber);
    doc.setLineWidth(0.4);
    doc.roundedRect(margin, currentY, contentWidth, 12, 1.5, 1.5, 'FD');

    doc.setTextColor(...pendingAmber);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('PAYMENT DUE ON DELIVERY', margin + 4, currentY + 7);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(
      `Payment Method: Cash on Delivery (COD)  |  Amount Due to Courier: ${formatCurrency(order.totalAmount)}`,
      margin + 62,
      currentY + 7
    );
  } else {
    // General Pending
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(...pendingAmber);
    doc.setLineWidth(0.4);
    doc.roundedRect(margin, currentY, contentWidth, 12, 1.5, 1.5, 'FD');

    doc.setTextColor(...pendingAmber);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(`PAYMENT PENDING: ${order.paymentStatus.toUpperCase()}`, margin + 4, currentY + 7);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Amount: ${formatCurrency(order.totalAmount)}`, margin + 70, currentY + 7);
  }

  currentY += 17;

  // 3. Customer & Delivery Address Card
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(225, 225, 225);
  doc.setLineWidth(0.3);
  doc.rect(margin, currentY, contentWidth, 26, 'FD');

  // Customer Information (Left)
  doc.setTextColor(...darkBg);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('CUSTOMER / RECIPIENT:', margin + 4, currentY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...textDark);
  doc.text(order.customerName, margin + 4, currentY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...textMuted);
  const phones = [order.phone1, order.phone2].filter(Boolean).join(' / ');
  doc.text(`Phone: ${phones}`, margin + 4, currentY + 17);
  if (order.email) {
    doc.text(`Email: ${order.email}`, margin + 4, currentY + 22);
  }

  // Delivery Details (Right)
  const rightColX = margin + (contentWidth / 2) + 4;
  doc.setTextColor(...darkBg);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('DELIVERY ADDRESS (SRI LANKA):', rightColX, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...textDark);
  const addressParts = [
    order.addressLine,
    order.city,
    order.district ? `${order.district} District` : null,
    order.postalCode,
  ].filter(Boolean);

  const addressLine1 = addressParts.slice(0, 2).join(', ');
  const addressLine2 = addressParts.slice(2).join(', ');

  doc.text(addressLine1 || 'Delivery Address Provided', rightColX, currentY + 12);
  if (addressLine2) {
    doc.text(addressLine2, rightColX, currentY + 17);
  }
  if (order.trackingNumber) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Courier Tracking: ${order.trackingNumber}`, rightColX, currentY + 22);
  }

  currentY += 32;

  // 4. Items Table via AutoTable
  const tableRows = (order.items || []).map((item, index) => {
    const desc = item.variantTitle ? `${item.productName} (${item.variantTitle})` : item.productName;
    return [
      String(index + 1),
      desc,
      item.sku || '-',
      String(item.quantity),
      formatCurrency(item.unitPrice),
      formatCurrency(item.totalPrice),
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Item Description', 'SKU', 'Qty', 'Unit Price', 'Line Total']],
    body: tableRows,
    theme: 'grid',
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: darkBg,
      textColor: goldColor,
      fontStyle: 'bold',
      fontSize: 8.5,
      cellPadding: 2.5,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 26, halign: 'center' },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: textDark,
      cellPadding: 2.5,
    },
    alternateRowStyles: {
      fillColor: [248, 248, 248],
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 6;

  // 5. Financial Summary (Right aligned)
  const summaryX = pageWidth - margin - 70;
  const summaryValX = pageWidth - margin - 2;
  let summaryY = finalY;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...textMuted);

  // Subtotal
  doc.text('Subtotal:', summaryX, summaryY);
  doc.text(formatCurrency(order.subtotal), summaryValX, summaryY, { align: 'right' });
  summaryY += 5;

  // Discount
  if (order.discountAmount && order.discountAmount > 0) {
    doc.text(`Discount (${order.couponCode || 'Promo'}):`, summaryX, summaryY);
    doc.text(`-${formatCurrency(order.discountAmount)}`, summaryValX, summaryY, { align: 'right' });
    summaryY += 5;
  }

  // Delivery Fee
  doc.text('Delivery Fee:', summaryX, summaryY);
  doc.text(formatCurrency(order.deliveryFee), summaryValX, summaryY, { align: 'right' });
  summaryY += 6;

  // Grand Total Line
  doc.setDrawColor(...goldColor);
  doc.setLineWidth(0.5);
  doc.line(summaryX, summaryY - 2, pageWidth - margin, summaryY - 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...darkBg);
  doc.text('Total Amount:', summaryX, summaryY + 2);
  doc.setTextColor(...goldColor);
  doc.text(formatCurrency(order.totalAmount), summaryValX, summaryY + 2, { align: 'right' });

  // 6. Footer Notes
  const footerY = 270;
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...textMuted);
  doc.text('Thank you for choosing Splender Jewel!', margin, footerY);
  doc.text(
    'For inquiries, WhatsApp customer support: +94 76 468 9907  |  Website: https://splender-jewel.vercel.app',
    margin,
    footerY + 4
  );
  doc.text(
    'Store Address: 66/A/38 St. Jude Place, Thaladuwa, Negombo  |  Islandwide Delivery by Sri Lanka Post / Courier',
    margin,
    footerY + 8
  );

  // Save the PDF
  const filename = `SplenderJewel_Invoice_${order.orderNumber}.pdf`;
  doc.save(filename);
}
