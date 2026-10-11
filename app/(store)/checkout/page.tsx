'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCart } from '@/lib/cart/cart-context';
import { formatCurrency } from '@/lib/config/store';
import { SRI_LANKA_DISTRICTS, getEstimatedDeliveryFee, type SriLankaDistrict } from '@/lib/config/districts';
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/config/constants';
import { createOrderAction } from '@/lib/orders/actions';

export default function CheckoutPage() {
  const router = useRouter();
  const { items, isLoaded, totalCount, subtotal, clearCart } = useCart();

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

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Delivery fee dynamically calculated by selected district
  const deliveryFee = getEstimatedDeliveryFee(district);
  const grandTotal = subtotal + deliveryFee;

  // Handle Form Submit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

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
        items: items.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
        })),
      });

      if (!res.success || !res.orderNumber) {
        setErrorMessage(res.error || 'Failed to place order. Please review your details and try again.');
        setIsSubmitting(false);
        return;
      }

      // Order created successfully: clear client bag and navigate to confirmation
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
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-wide">
              Secure Checkout
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1">
              Islandwide home delivery across all 25 Sri Lankan districts
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
                          Pay in cash upon physical receipt at your doorstep anywhere in Sri Lanka. Inspected prior to handover.
                        </p>
                      </div>
                    </div>
                  </label>

                  {/* Option 2: Bank Transfer via WhatsApp */}
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
                          <span className="text-sm font-semibold text-white">Bank Deposit / Transfer (via WhatsApp)</span>
                        </div>
                        <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                          Direct bank deposit. You will receive account details on the next screen and can share your deposit slip directly to WhatsApp (+94 76 468 9907) for priority order verification.
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

                {/* Financial Totals */}
                <div className="space-y-3 pt-3 border-t border-neutral-800 text-sm">
                  <div className="flex justify-between text-neutral-300">
                    <span>Bag Subtotal</span>
                    <span className="font-semibold text-white">{formatCurrency(subtotal)}</span>
                  </div>

                  <div className="flex justify-between text-neutral-300">
                    <span>Delivery ({district})</span>
                    <span className="font-semibold text-white">{formatCurrency(deliveryFee)}</span>
                  </div>

                  <div className="pt-3 border-t border-neutral-800 flex justify-between items-baseline">
                    <span className="text-base font-bold text-white">Total Amount</span>
                    <span className="text-xl font-bold text-luxury-gold">{formatCurrency(grandTotal)}</span>
                  </div>
                </div>

                {/* Submit Action */}
                <div className="space-y-3 pt-2">
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

                  <p className="text-[11px] text-neutral-400 text-center leading-relaxed">
                    By confirming, you agree to our islandwide courier delivery terms.
                  </p>
                </div>

                {/* Trust Badges */}
                <div className="border-t border-neutral-800 pt-4 space-y-2 text-xs text-neutral-400">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-luxury-gold shrink-0" />
                    <span>Safe doorstep delivery in {district}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-luxury-gold shrink-0" />
                    <span>Verified customer privacy & encrypted actions</span>
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
