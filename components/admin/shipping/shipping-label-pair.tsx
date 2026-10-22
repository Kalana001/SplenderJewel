'use client';

import React from 'react';
import {
  ShippingOrderRecord,
  ShippingLabelDimensions,
  DEFAULT_LABEL_DIMENSIONS,
  SPLENDER_JEWEL_SENDER,
} from '@/lib/shipping/types';

interface ShippingLabelPairProps {
  order: ShippingOrderRecord;
  dimensions?: ShippingLabelDimensions;
}

/**
 * TWO INDEPENDENT RECTANGULAR LABELS POSITIONED HORIZONTALLY, SIDE BY SIDE
 *
 * Strict formatting:
 * - Rectangle 1: Fixed Business Details (SPLENDER JEWEL / 66A/38 St Jude Place / Thaladuwa, Negombo / 0764689907)
 * - Rectangle 2: Customer Delivery Details (Full name / Address / City, District / Contact Number)
 * - Information order: Name -> Address -> Contact Number
 * - Typography: Same font size (13px) for Name, Address, and Contact Number across both labels.
 *   Names bold, addresses regular weight, contact numbers bold.
 * - NO horizontal separator lines, NO separate footer sections, NO order numbers inside labels.
 * - NO headings such as "Sender", "Receiver", "From", or "To".
 * - Clean rectangular borders, left-aligned black text on white background.
 * - Page-break avoidance for clean multi-order A4 printing.
 */
export function ShippingLabelPair({
  order,
  dimensions = DEFAULT_LABEL_DIMENSIONS,
}: ShippingLabelPairProps) {
  // Format city/district as available
  const cityDistrictDisplay =
    order.city && order.district
      ? `${order.city}, ${order.district}`
      : order.city || order.district || '';

  const contactDisplay = order.phone2
    ? `${order.phone1} / ${order.phone2}`
    : order.phone1;

  const labelBoxStyle: React.CSSProperties = {
    width: `${dimensions.widthMm}mm`,
    minHeight: `${dimensions.minHeightMm}mm`,
    padding: `${dimensions.paddingMm}mm`,
    borderWidth: `${dimensions.borderWidthPx}px`,
  };

  return (
    <div className="shipping-label-pair-wrapper flex flex-col sm:flex-row print:flex-row items-stretch gap-3 print:gap-3 py-2 bg-white text-black break-inside-avoid page-break-inside-avoid">
      {/* ── Rectangle 1: Sender Label (Name -> Address -> Contact Number) ── */}
      <div
        style={labelBoxStyle}
        className="shipping-label-rect border-solid border-black bg-white text-black rounded-none flex flex-col justify-start text-left font-sans space-y-1 box-border"
      >
        <div className="text-[13px] font-bold leading-snug uppercase text-black break-words">
          {SPLENDER_JEWEL_SENDER.name}
        </div>
        <div className="text-[13px] font-normal leading-snug text-black break-words">
          {SPLENDER_JEWEL_SENDER.addressLine1}
        </div>
        <div className="text-[13px] font-normal leading-snug text-black break-words">
          {SPLENDER_JEWEL_SENDER.addressLine2}
        </div>
        <div className="text-[13px] font-bold leading-snug text-black break-words">
          {SPLENDER_JEWEL_SENDER.phone}
        </div>
      </div>

      {/* ── Rectangle 2: Recipient Label (Name -> Address -> Contact Number) ── */}
      <div
        style={labelBoxStyle}
        className="shipping-label-rect border-solid border-black bg-white text-black rounded-none flex flex-col justify-start text-left font-sans space-y-1 box-border"
      >
        <div className="text-[13px] font-bold leading-snug text-black break-words">
          {order.customer_name}
        </div>
        <div className="text-[13px] font-normal leading-snug text-black break-words">
          {order.address_line}
        </div>
        {cityDistrictDisplay && (
          <div className="text-[13px] font-normal leading-snug text-black break-words">
            {cityDistrictDisplay}
          </div>
        )}
        <div className="text-[13px] font-bold leading-snug text-black break-words">
          {contactDisplay}
        </div>
      </div>
    </div>
  );
}
