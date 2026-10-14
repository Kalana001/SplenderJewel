'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  Truck,
  ArrowLeft,
  AlertCircle,
  Loader2,
  Banknote,
  MessageCircle,
  ShoppingBag,
  Tag,
  CheckCircle2,
  X,
} from 'lucide-react';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCart } from '@/lib/cart/cart-context';
import { formatCurrency, getWhatsAppLink } from '@/lib/config/store';
import { SRI_LANKA_DISTRICTS, getEstimatedDeliveryFee, type SriLankaDistrict } from '@/lib/config/districts';
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/config/constants';
import { createOrderAction } from '@/lib/orders/actions';
import { validateCouponAction } from '@/lib/coupons/actions';

export default function CheckoutPage() {
  const router = useRouter();
  const { items, isLoaded, totalCount, subtotal, clearCart } = useCart();
  const isLiveCheckout = process.env.NEXT_PUBLIC_ENABLE_LIVE_CHECKOUT === 'true';

  // Form Fields
  const [customerName, setCustomerName] = useState('');
  const [phone1, setPhone1] = useState('');
  const [phone2, setPhone2] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState<SriLankaDistrict>('Colombo');
  const [postalCode, setPostalCode] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PAYMENT_METHODS.COD);

  // Coupon State
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; calculatedDiscount: number } | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Submission State & Payload-Bound Idempotency Key
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const clientRequestIdRef = useRef<string | null>(null);
  const clientRequestPayloadRef = useRef<string | null>(null);

  // Delivery fee dynamically calculated by selected district
  const deliveryFee = getEstimatedDeliveryFee(district);
  const discountAmount = appliedCoupon?.calculatedDiscount || 0;
  const grandTotal = Math.max(0, subtotal - discountAmount) + deliveryFee;

  // Handle Coupon Apply
  async function handleApplyCoupon(e: React.FormEvent) {
    e.preventDefault();
    if (!couponInput.trim()) return;
    setCouponError(null);
    setIsValidatingCoupon(true);

    try {
      const res = await validateCouponAction(couponInput.trim(), subtotal, {
        phone1: phone1.trim() || null,
        email: email.trim() || null,
      });
      if (!res.valid || res.calculatedDiscount === undefined) {
        setCouponError(res.error || 'Invalid coupon code.');
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon({
          code: res.code || couponInput.trim().toUpperCase(),
          calculatedDiscount: res.calculatedDiscount,
        });
        setCouponInput('');
      }
    } catch {
      setCouponError('Unable to validate coupon at this time.');
    } finally {
      setIsValidatingCoupon(false);
    }
  }

  // Handle Coupon Removal
  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponError(null);
    setCouponInput('');
  }

  // Handle Form Submit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);

    // Testing Mode Client Block
    if (!isLiveCheckout) {
      setErrorMessage(
        'Online checkout is currently in development testing mode. Live order submission is disabled. For priority orders, please reach out via WhatsApp (+94 76 468 9907).'
      );
      return;
    }

    if (items.length === 0) {
      setErrorMessage('Your shopping bag is empty. Please add items before checking out.');
      return;
    }

    if (!customerName.trim()) {
      setErrorMessage('Please provide your full recipient name.');
      return;
    }

    if (!phone1.trim()) {
      setErrorMessage('Please provide a primary contact phone number.');
      return;
    }

    if (!addressLine.trim()) {
      setErrorMessage('Please provide your street delivery address.');
      return;
    }

    if (!district) {
      setErrorMessage('Please select a Sri Lankan delivery district.');
      return;
    }

    setIsSubmitting(true);

    // Build canonical payload fingerprint to bind idempotency key to intended order contents
    const aggregatedItemsMap = new Map<string, number>();
    for (const item of items) {
      const vid = item.variantId.trim();
      aggregatedItemsMap.set(vid, (aggregatedItemsMap.get(vid) || 0) + item.quantity);
    }
    const canonicalItems = Array.from(aggregatedItemsMap.entries())
      .map(([variantId, quantity]) => ({ variantId, quantity }))
      .sort((a, b) => a.variantId.localeCompare(b.variantId));

    const payloadFingerprint = JSON.stringify({
      customerName: customerName.trim().toLowerCase(),
      phone1: phone1.trim(),
      phone2: phone2.trim() || '',
      email: (email.trim() || '').toLowerCase(),
      addressLine: addressLine.trim().toLowerCase(),
      city: (city.trim() || '').toLowerCase(),
      district,
      postalCode: (postalCode.trim() || '').toLowerCase(),
      deliveryNotes: deliveryNotes.trim() || '',
      paymentMethod,
      couponCode: (appliedCoupon?.code || '').trim().toUpperCase(),
      items: canonicalItems,
    });

    // Retain existing key for retries of the identical checkout attempt;
    // generate a fresh key for a genuinely new order or whenever any order parameter changes
    if (!clientRequestIdRef.current || clientRequestPayloadRef.current !== payloadFingerprint) {
      clientRequestIdRef.current =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `chk-${crypto.randomUUID()}`
          : `chk-${Date.now()}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
      clientRequestPayloadRef.current = payloadFingerprint;
    }

    try {
      const res = await createOrderAction({
        customerName: customerName.trim(),
        phone1: phone1.trim(),
        phone2: phone2.trim() || null,
        email: email.trim() || null,
        addressLine: addressLine.trim(),
        city: city.trim() || null,
        district,
        postalCode: postalCode.trim() || null,
        deliveryNotes: deliveryNotes.trim() || null,
        paymentMethod,
        couponCode: appliedCoupon?.code || null,
        clientRequestId: clientRequestIdRef.current,
        items: items.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
        })),
      });

      if (!res.success || !res.orderNumber) {
        if (res.error?.startsWith('Idempotency key conflict')) {
          clientRequestIdRef.current = null;
          clientRequestPayloadRef.current = null;
        }
        setErrorMessage(res.error || 'Failed to place order. Please review your details and try again.');
        setIsSubmitting(false);
        return;
      }

      // Order created successfully: reset idempotency state, clear client bag, and navigate to confirmation
      clientRequestIdRef.current = null;
      clientRequestPayloadRef.current = null;
      clearCart();
      const confirmationUrl = res.orderToken
        ? `/order-confirmation/${res.orderNumber}?token=${encodeURIComponent(res.orderToken)}`
        : `/order-confirmation/${res.orderNumber}`;

      router.push(confirmationUrl);
    } catch (err: any) {
      setErrorMessage(err?.message || 'An unexpected error occurred while placing your order. Please try again.');
      setIsSubmitting(false);
    }
  }

  if (!isLoaded) {
    return (
      <Container size="xl" className="py-12 sm:py-16">
        <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
          <div className="h-8 bg-neutral-800 rounded w-48" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 h-96 bg-neutral-900 rounded-lg border border-neutral-800" />
            <div className="h-96 bg-neutral-900 rounded-lg border border-neutral-800" />
          </div>
        </div>
      </Container>
    );
  }

  if (items.length === 0) {
    return (
      <Container size="xl" className="py-16 sm:py-24">
        <div className="max-w-md mx-auto text-center space-y-6">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-luxury-gold/10 border border-luxury-gold/30 text-luxury-gold mb-2">
            <ShoppingBag className="h-10 w-10 stroke-[1.5]" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-wide">
              Your Shopping Bag is Empty
            </h1>
            <p className="text-sm text-neutral-400">
              Please add jewelry pieces to your bag before proceeding to checkout.
            </p>
          </div>
          <Link href="/shop">
            <Button variant="gold" size="lg" className="w-full sm:w-auto px-8 font-semibold">
              Browse Jewelry Collection
            </Button>
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <Container size="xl" className="py-10 sm:py-16">
      <div className="space-y-8">
        {/* Navigation Breadcrumb / Return */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-5">
          <div>
            {!isLiveCheckout && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-amber-950/70 border border-amber-800/60 text-amber-300 mb-2">
                <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                Storefront Testing Mode
              </div>
            )}
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-wide">
              {isLiveCheckout ? 'Secure Checkout' : 'Order Review & Checkout Preview'}
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1">
              {isLiveCheckout
                ? 'Islandwide Delivery across Sri Lanka'
                : 'Online order placement is currently inactive while storefront testing is underway'}
            </p>
          </div>

          <Link
            href="/cart"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-400 hover:text-luxury-gold transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Return to Bag</span>
          </Link>
        </div>

        {/* Error Notification Alert */}
        {errorMessage && (
          <div className="flex items-start gap-3 p-4 bg-rose-950/70 border border-rose-800/80 rounded-lg text-rose-200 text-sm">
            <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong className="block font-semibold">Unable to complete checkout:</strong>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Main 2-Column Grid */}
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Left Column: Form Fields */}
            <div className="lg:col-span-2 space-y-8">
              {/* 1. Recipient Contact Details */}
              <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                  <h2 className="text-base sm:text-lg font-serif font-bold text-white">
                    1. Recipient & Contact Details
                  </h2>
                  <span className="text-xs text-luxury-gold font-medium">Required for delivery</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                      Full Name <span className="text-luxury-gold">*</span>
                    </label>
                    <Input
                      type="text"
                      required
                      placeholder="e.g. Kasun Perera"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="bg-neutral-950 border-neutral-700 text-white focus:border-luxury-gold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                      Primary Contact Phone <span className="text-luxury-gold">*</span>
                    </label>
                    <Input
                      type="tel"
                      required
                      placeholder="e.g. 077 123 4567"
                      value={phone1}
                      onChange={(e) => setPhone1(e.target.value)}
                      className="bg-neutral-950 border-neutral-700 text-white focus:border-luxury-gold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                      Secondary Phone <span className="text-neutral-500 font-normal">(Optional)</span>
                    </label>
                    <Input
                      type="tel"
                      placeholder="e.g. 011 234 5678"
                      value={phone2}
                      onChange={(e) => setPhone2(e.target.value)}
                      className="bg-neutral-950 border-neutral-700 text-white focus:border-luxury-gold"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                      Email Address <span className="text-neutral-500 font-normal">(Optional, for receipt)</span>
                    </label>
                    <Input
                      type="email"
                      placeholder="e.g. customer@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-neutral-950 border-neutral-700 text-white focus:border-luxury-gold"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Delivery Address in Sri Lanka */}
              <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                  <h2 className="text-base sm:text-lg font-serif font-bold text-white">
                    2. Delivery Address (Sri Lanka)
                  </h2>
                  <span className="text-xs text-neutral-400">Home or Workplace delivery</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                      Street Address / House / Flat <span className="text-luxury-gold">*</span>
                    </label>
                    <Input
                      type="text"
                      required
                      placeholder="e.g. No. 42, Galle Road, Bambalapitiya"
                      value={addressLine}
                      onChange={(e) => setAddressLine(e.target.value)}
                      className="bg-neutral-950 border-neutral-700 text-white focus:border-luxury-gold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                      City / Town <span className="text-neutral-500 font-normal">(Optional)</span>
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. Colombo 04"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="bg-neutral-950 border-neutral-700 text-white focus:border-luxury-gold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                      District <span className="text-luxury-gold">*</span>
                    </label>
                    <select
                      required
                      value={district}
                      onChange={(e) => setDistrict(e.target.value as SriLankaDistrict)}
                      className="w-full h-10 px-3 py-2 rounded-md bg-neutral-950 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-1 focus:ring-luxury-gold focus:border-luxury-gold"
                    >
                      {SRI_LANKA_DISTRICTS.map((d) => (
                        <option key={d} value={d} className="bg-neutral-950 text-white">
                          {d} ({getEstimatedDeliveryFee(d) === 350 ? 'Rs. 350' : 'Rs. 450'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                      Postal Code <span className="text-neutral-500 font-normal">(Optional)</span>
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. 00400"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      className="bg-neutral-950 border-neutral-700 text-white focus:border-luxury-gold"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                      Delivery Instructions <span className="text-neutral-500 font-normal">(Optional)</span>
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Deliver between 10am and 4pm, call before arrival"
                      value={deliveryNotes}
                      onChange={(e) => setDeliveryNotes(e.target.value)}
                      className="w-full px-3 py-2 rounded-md bg-neutral-950 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-1 focus:ring-luxury-gold focus:border-luxury-gold"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Payment Method */}
              <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-6 space-y-5">
                <div className="border-b border-neutral-800 pb-3">
                  <h2 className="text-base sm:text-lg font-serif font-bold text-white">
                    3. Payment Method
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Choose how you would like to complete your jewelry purchase
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Option 1: Cash on Delivery */}
                  <label
                    className={`block p-4 rounded-lg border cursor-pointer transition-all ${
                      paymentMethod === PAYMENT_METHODS.COD
                        ? 'bg-luxury-gold/10 border-luxury-gold'
                        : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={PAYMENT_METHODS.COD}
                        checked={paymentMethod === PAYMENT_METHODS.COD}
                        onChange={() => setPaymentMethod(PAYMENT_METHODS.COD)}
                        className="mt-1 h-4 w-4 text-luxury-gold focus:ring-luxury-gold border-neutral-700 bg-neutral-900"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Banknote className="h-4 w-4 text-luxury-gold" />
                          <span className="text-sm font-semibold text-white">Cash on Delivery (COD)</span>
                        </div>
                        <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                          Pay in cash when you receive your parcel. Dispatched through Sri Lanka Post COD Service. No advance payment required.
                        </p>
                      </div>
                    </div>
                  </label>

                  {/* Option 2: Bank Transfer */}
                  <label
                    className={`block p-4 rounded-lg border cursor-pointer transition-all ${
                      paymentMethod === PAYMENT_METHODS.BANK_TRANSFER
                        ? 'bg-luxury-gold/10 border-luxury-gold'
                        : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={PAYMENT_METHODS.BANK_TRANSFER}
                        checked={paymentMethod === PAYMENT_METHODS.BANK_TRANSFER}
                        onChange={() => setPaymentMethod(PAYMENT_METHODS.BANK_TRANSFER)}
                        className="mt-1 h-4 w-4 text-luxury-gold focus:ring-luxury-gold border-neutral-700 bg-neutral-900"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <MessageCircle className="h-4 w-4 text-emerald-400" />
                          <span className="text-sm font-semibold text-white">Bank Transfer</span>
                        </div>
                        <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                          Direct bank deposit or transfer. Dispatched through Sri Lanka Post Speed Post Service after payment confirmation.
                        </p>
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Right Column: Order Review & Pricing Summary */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-6 space-y-6 sticky top-24">
                <h2 className="text-lg font-serif font-bold text-white tracking-wide border-b border-neutral-800 pb-3">
                  Order Summary ({totalCount})
                </h2>

                {/* Items Mini List */}
                <div className="max-h-60 overflow-y-auto divide-y divide-neutral-800/80 pr-1 space-y-2">
                  {items.map((item) => {
                    const price = item.discountPrice != null && item.discountPrice > 0 ? item.discountPrice : item.price;
                    return (
                      <div key={item.variantId} className="pt-2 flex items-center gap-3 text-xs">
                        <div className="h-12 w-12 rounded bg-neutral-950 border border-neutral-800 overflow-hidden shrink-0">
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.imageUrl} alt={item.productName} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-neutral-600">
                              <ShoppingBag className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-white truncate">{item.productName}</p>
                          <p className="text-neutral-400 text-[11px]">
                            Qty: {item.quantity} • {item.variantTitle}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold text-luxury-gold">
                            {formatCurrency(price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Promotional Coupon Section */}
                <div className="pt-3 border-t border-neutral-800 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-300">
                    <Tag className="h-3.5 w-3.5 text-luxury-gold" />
                    <span>Promotional Code</span>
                  </div>

                  {appliedCoupon ? (
                    <div className="flex items-center justify-between p-2.5 bg-luxury-gold/10 border border-luxury-gold/40 rounded-md">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-luxury-gold" />
                        <div>
                          <span className="text-xs font-bold text-luxury-gold">{appliedCoupon.code}</span>
                          <span className="text-xs text-neutral-300 ml-1.5">
                            (-{formatCurrency(appliedCoupon.calculatedDiscount)})
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveCoupon}
                        className="p-1 text-neutral-400 hover:text-rose-400 transition-colors"
                        title="Remove coupon"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex gap-2">
                        <Input
                          type="text"
                          placeholder="e.g. WELCOME10"
                          value={couponInput}
                          onChange={(e) => {
                            setCouponInput(e.target.value.toUpperCase());
                            setCouponError(null);
                          }}
                          className="bg-neutral-950 border-neutral-700 text-xs text-white uppercase focus:border-luxury-gold h-9"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isValidatingCoupon || !couponInput.trim()}
                          onClick={(e) => handleApplyCoupon(e)}
                          className="h-9 px-3 border-luxury-gold/50 text-luxury-gold hover:bg-luxury-gold hover:text-neutral-950 text-xs shrink-0 font-medium"
                        >
                          {isValidatingCoupon ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Apply'}
                        </Button>
                      </div>
                      {couponError && (
                        <p className="text-[11px] text-rose-400 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          <span>{couponError}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Financial Totals */}
                <div className="space-y-3 pt-3 border-t border-neutral-800 text-sm">
                  <div className="flex justify-between text-neutral-300">
                    <span>Bag Subtotal</span>
                    <span className="font-semibold text-white">{formatCurrency(subtotal)}</span>
                  </div>

                  {appliedCoupon && (
                    <div className="flex justify-between text-luxury-gold">
                      <span>Coupon Discount ({appliedCoupon.code})</span>
                      <span className="font-semibold">-{formatCurrency(appliedCoupon.calculatedDiscount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-neutral-300">
                    <span>Delivery ({district})</span>
                    <span className="font-semibold text-white">{formatCurrency(deliveryFee)}</span>
                  </div>

                  <div className="pt-3 border-t border-neutral-800 flex justify-between items-baseline">
                    <span className="text-base font-bold text-white">Total Amount</span>
                    <span className="text-xl font-bold text-luxury-gold">{formatCurrency(grandTotal)}</span>
                  </div>
                </div>

                {/* Storefront Preview / Testing Mode Notice */}
                {!isLiveCheckout && (
                  <div className="p-4 bg-amber-950/40 border border-amber-800/60 rounded-lg text-amber-200 text-xs space-y-2.5">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                      <strong className="font-semibold text-amber-300">Storefront Testing Mode</strong>
                    </div>
                    <p className="text-[11px] text-amber-200/90 leading-relaxed">
                      Online automated checkout is currently in development testing mode. Live orders and payments are not being processed through this form.
                    </p>
                    <a
                      href="https://wa.me/94764689907?text=Hello%20Splender%20Jewel%2C%20I%20would%20like%20to%20place%20an%20order."
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-luxury-gold hover:text-luxury-gold-light font-medium transition-colors pt-0.5"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span>Order directly via WhatsApp Concierge (+94 76 468 9907)</span>
                    </a>
                  </div>
                )}

                {/* Submit Action */}
                <div className="space-y-3 pt-2">
                  {isLiveCheckout ? (
                    <Button
                      type="submit"
                      variant="gold"
                      size="lg"
                      disabled={isSubmitting || items.length === 0}
                      className="w-full text-base font-semibold py-4 flex items-center justify-center gap-2 shadow-lg shadow-luxury-gold/15 hover:shadow-luxury-gold/25"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span>Processing Order...</span>
                        </>
                      ) : (
                        <span>Confirm & Place Order</span>
                      )}
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        disabled={true}
                        className="w-full text-xs sm:text-sm font-semibold py-3.5 flex items-center justify-center gap-2 border-amber-600/40 text-amber-300/80 bg-amber-950/20 cursor-not-allowed select-none"
                      >
                        <span>Place Order Disabled (Testing Mode)</span>
                      </Button>
                      <a
                        href={getWhatsAppLink('Hello Splender Jewel, I would like to inquire about items from your collection.')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <Button
                          type="button"
                          variant="gold"
                          size="lg"
                          className="w-full text-xs uppercase tracking-wider font-semibold py-3 flex items-center justify-center gap-2 shadow-md shadow-luxury-gold/10"
                        >
                          <MessageCircle className="h-4 w-4" />
                          <span>Contact Us on WhatsApp</span>
                        </Button>
                      </a>
                    </div>
                  )}

                  <p className="text-[11px] text-neutral-400 text-center leading-relaxed">
                    {isLiveCheckout
                      ? 'By confirming, you agree to our islandwide delivery terms.'
                      : 'Testing preview only. No charge or real delivery will be scheduled.'}
                  </p>
                </div>

                {/* Trust Badges */}
                <div className="border-t border-neutral-800 pt-4 space-y-2 text-xs text-neutral-400">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-luxury-gold shrink-0" />
                    <span>Islandwide Delivery via Sri Lanka Post</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-luxury-gold shrink-0" />
                    <span>Customer data protection & encrypted privacy</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </Container>
  );
}
