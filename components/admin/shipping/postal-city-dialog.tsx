'use client';

import React, { useState, useEffect } from 'react';
import { X, MapPin, Info, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShippingOrderRecord } from '@/lib/shipping/types';

interface PostalCityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  orders: ShippingOrderRecord[];
  initialOverrides: Record<string, string>;
  onConfirm: (overrides: Record<string, string>) => void;
  actionTitle?: string;
}

export function PostalCityDialog({
  isOpen,
  onClose,
  orders,
  initialOverrides,
  onConfirm,
  actionTitle = 'Save & Continue Export',
}: PostalCityDialogProps) {
  const [cityValues, setCityValues] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      orders.forEach((o) => {
        initial[o.id] = initialOverrides[o.id] || o.city || '';
      });
      setCityValues(initial);
      setErrorMessage(null);
    }
  }, [isOpen, orders, initialOverrides]);

  if (!isOpen || orders.length === 0) return null;

  function handleChange(orderId: string, value: string) {
    setCityValues((prev) => ({
      ...prev,
      [orderId]: value,
    }));
    if (errorMessage) {
      setErrorMessage(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Check that every order has a non-empty trimmed city
    const missing = orders.filter((o) => !cityValues[o.id]?.trim());
    if (missing.length > 0) {
      setErrorMessage(
        `Please specify a postal city for all listed orders (${missing.length} remaining).`
      );
      return;
    }

    const trimmedOverrides: Record<string, string> = {};
    orders.forEach((o) => {
      trimmedOverrides[o.id] = cityValues[o.id].trim();
    });

    onConfirm(trimmedOverrides);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/20">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-serif font-bold text-white tracking-wide">
                Supply Postal City for Sri Lanka Post
              </h2>
              <p className="text-xs text-neutral-400">
                {orders.length} order{orders.length === 1 ? '' : 's'} require a postal hub city for export
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="bg-neutral-950 px-6 py-3 border-b border-neutral-800/80 text-xs text-neutral-300 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-luxury-gold shrink-0 mt-0.5" />
          <p>
            Sri Lanka Post requires a postal hub city for parcel routing. Cities entered here will be used
            for this postal export without altering the customer&apos;s original address in the database.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 overflow-y-auto space-y-4 flex-1">
            {errorMessage && (
              <div className="bg-rose-950/50 border border-rose-800/60 text-rose-200 p-3 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="space-y-3">
              {orders.map((order) => {
                const val = cityValues[order.id] || '';
                const isInvalid = errorMessage && !val.trim();

                return (
                  <div
                    key={order.id}
                    className="p-3.5 bg-neutral-950/60 border border-neutral-800 rounded-lg space-y-2.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                      <div className="font-mono font-bold text-white flex items-center gap-2">
                        <span>{order.order_number}</span>
                        <span className="text-neutral-500 font-normal">|</span>
                        <span className="text-neutral-300 font-sans">{order.customer_name}</span>
                      </div>
                      <div className="text-neutral-400 font-mono text-[11px]">
                        District: <span className="text-neutral-200">{order.district}</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-neutral-400 truncate" title={order.address_line}>
                      {order.address_line}
                    </div>

                    <div>
                      <label
                        htmlFor={`postal-city-${order.id}`}
                        className="block text-[11px] font-medium text-neutral-300 mb-1"
                      >
                        Postal City <span className="text-luxury-gold">*</span>
                      </label>
                      <Input
                        id={`postal-city-${order.id}`}
                        type="text"
                        placeholder="e.g. Negombo, Moratuwa, Colombo 03, Kandy"
                        value={val}
                        onChange={(e) => handleChange(order.id, e.target.value)}
                        className={`h-8 text-xs bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500 ${
                          isInvalid ? 'border-rose-500 focus-visible:ring-rose-500' : ''
                        }`}
                        autoFocus={orders.length === 1}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs border-neutral-700 bg-neutral-900 text-neutral-300 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="gold"
              size="sm"
              className="bg-luxury-gold text-black hover:bg-luxury-gold/90 text-xs font-semibold px-4"
            >
              {actionTitle}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
