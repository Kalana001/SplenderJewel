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
  showOrderRefBadge?: boolean;
}

/**
 * TWO INDEPENDENT RECTANGULAR LABELS POSITIONED HORIZONTALLY, SIDE BY SIDE
 *
 * Strict formatting:
 * - Rectangle 1: Fixed Business Details (Splender Jewel / 66A/38 St Jude Place / Thaladuwa, Negombo / 0764689907)
 * - Rectangle 2: Customer Delivery Details (Full name, Address, City/District, Phone1, Phone2 if present)
 * - NO headings such as "Sender", "Receiver", "From", or "To".
 * - Clean rectangular borders, black text on white background, readable font sizes.
 * - Suitable for physical parcel affixation.
 * - Page-break avoidance for clean multi-order printing.
 */
export function ShippingLabelPair({
  order,
  dimensions = DEFAULT_LABEL_DIMENSIONS,
  showOrderRefBadge = false,
}: ShippingLabelPairProps) {
  // Format city/district as available
  const cityDistrictDisplay =
    order.city && order.district
      ? `${order.city}, ${order.district}`
      : order.city || order.district || '';

  const labelBoxStyle: React.CSSProperties = {
    width: `${dimensions.widthMm}mm`,
    minHeight: `${dimensions.minHeightMm}mm`,
    padding: `${dimensions.paddingMm}mm`,
    borderWidth: `${dimensions.borderWidthPx}px`,
  };

  return (
    <div className="shipping-label-pair-wrapper flex flex-col sm:flex-row items-stretch gap-3 print:gap-3 py-2 bg-white text-black break-inside-avoid page-break-inside-avoid">
      {/* ── Rectangle 1: Fixed Business Details ── */}
      <div
        style={labelBoxStyle}
        className="shipping-label-rect border-solid border-black bg-white text-black rounded-none flex flex-col justify-between box-border"
      >
        <div className="space-y-1">
          <div className="font-serif font-black text-[13px] leading-tight tracking-wider uppercase text-black">
            {SPLENDER_JEWEL_SENDER.name}
          </div>
          <div className="text-[11px] font-sans leading-snug text-black">
            {SPLENDER_JEWEL_SENDER.addressLine1}
          </div>
          <div className="text-[11px] font-sans leading-snug text-black">
            {SPLENDER_JEWEL_SENDER.addressLine2}
          </div>
        </div>
        <div className="text-[12px] font-mono font-bold pt-2 tracking-wide text-black border-t border-black/20 mt-1">
          {SPLENDER_JEWEL_SENDER.phone}
        </div>
      </div>

      {/* ── Rectangle 2: Customer Delivery Details ── */}
      <div
        style={labelBoxStyle}
        className="shipping-label-rect border-solid border-black bg-white text-black rounded-none flex flex-col justify-between box-border relative"
      >
        <div className="space-y-1">
          <div className="font-sans font-bold text-[13px] leading-tight text-black break-words">
            {order.customer_name}
          </div>
          <div className="text-[11px] font-sans leading-snug text-black break-words">
            {order.address_line}
          </div>
          {cityDistrictDisplay && (
            <div className="text-[11px] font-sans font-medium text-black">
              {cityDistrictDisplay}
            </div>
          )}
        </div>

        <div className="text-[12px] font-mono font-bold pt-2 text-black border-t border-black/20 mt-1 flex items-center justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
            <span>{order.phone1}</span>
            {order.phone2 && (
              <span className="text-[11px] text-neutral-700 font-normal">
                / {order.phone2}
              </span>
            )}
          </div>

          {showOrderRefBadge && (
            <span className="text-[9px] font-mono text-neutral-500 font-normal uppercase print:hidden">
              {order.order_number}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
