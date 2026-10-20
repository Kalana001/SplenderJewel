'use client';

import React, { useState, useRef, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
  Sparkles,
} from 'lucide-react';
import { Container } from '@/components/ui/container';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCart } from '@/lib/cart/cart-context';
import { formatCurrency, getWhatsAppLink } from '@/lib/config/store';
import { SRI_LANKA_DISTRICTS, type SriLankaDistrict } from '@/lib/config/districts';
import { getShippingBreakdown } from '@/lib/config/shipping';
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/config/constants';
import { createOrderAction, checkTesterAccessAction } from '@/lib/orders/actions';
import { validateCouponAction } from '@/lib/coupons/actions';
import { getBuyNowItemAction, type BuyNowItemDetails } from '@/lib/cart/actions';

function CheckoutLoadingSkeleton() {
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

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isBuyNow = searchParams.get('buyNow') === 'true';

  const { items, isLoaded, totalCount, subtotal: cartSubtotal, clearPurchasedItems } = useCart();
  const isLiveCheckout = process.env.NEXT_PUBLIC_ENABLE_LIVE_CHECKOUT === 'true';

  // Buy Now Isolated Session State
  const [buyNowItem, setBuyNowItem] = useState<BuyNowItemDetails | null>(null);
  const [buyNowQty, setBuyNowQty] = useState<number>(1);
  const [isLoadingBuyNow, setIsLoadingBuyNow] = useState<boolean>(isBuyNow);
  const [buyNowError, setBuyNowError] = useState<string | null>(null);

  // Tester Authorization State
  const [testerState, setTesterState] = useState<{ isTester: boolean; isLiveCheckout: boolean; email?: string } | null>(null);

  useEffect(() => {
    let isMounted = true;
    checkTesterAccessAction()
      .then((res) => {
        if (isMounted) setTesterState(res);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Hydrate and validate Buy Now selection strictly from server
  useEffect(() => {
    if (!isBuyNow) return;

    let isMounted = true;
    setIsLoadingBuyNow(true);
    setBuyNowError(null);

    try {
      const stored = typeof window !== 'undefined' ? sessionStorage.getItem('splender_buy_now_session') : null;
      if (!stored) {
        if (isMounted) {
          setBuyNowError('No Buy Now item selected. Redirecting to your bag...');
          setIsLoadingBuyNow(false);
          setTimeout(() => router.push('/cart'), 2000);
        }
        return;
      }

      const parsed = JSON.parse(stored);
      if (!parsed || !parsed.variantId || !parsed.quantity) {
        if (isMounted) {
          setBuyNowError('Invalid Buy Now selection. Redirecting to your bag...');
          setIsLoadingBuyNow(false);
          setTimeout(() => router.push('/cart'), 2000);
        }
        return;
      }

      const requestedQty = Math.max(1, Number(parsed.quantity) || 1);

      getBuyNowItemAction(parsed.variantId)
        .then((res) => {
          if (!isMounted) return;
          if (!res.success || !res.item) {
            setBuyNowError(res.error || 'The selected item is no longer available.');
            setIsLoadingBuyNow(false);
            return;
          }

          if (!res.item.isAvailable || res.item.availableStock <= 0) {
            setBuyNowError('The selected item is currently out of stock.');
            setIsLoadingBuyNow(false);
            return;
          }

          const clampedQty = Math.min(requestedQty, res.item.availableStock);
          setBuyNowItem(res.item);
          setBuyNowQty(clampedQty);
          setIsLoadingBuyNow(false);
        })
        .catch(() => {
          if (isMounted) {
            setBuyNowError('Failed to verify item availability. Please try again.');
            setIsLoadingBuyNow(false);
          }
        });
    } catch {
      if (isMounted) {
        setBuyNowError('Failed to initialize Buy Now checkout.');
        setIsLoadingBuyNow(false);
      }
    }

    return () => {
      isMounted = false;
    };
  }, [isBuyNow, router]);

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

  // Active items for this specific checkout session
  const checkoutItems = isBuyNow
    ? buyNowItem
      ? [
          {
            variantId: buyNowItem.variantId,
            productId: buyNowItem.productId,
            productName: buyNowItem.productName,
            variantTitle: buyNowItem.variantTitle,
            sku: buyNowItem.sku,
            price: buyNowItem.price,
            discountPrice: buyNowItem.discountPrice,
            imageUrl: buyNowItem.imageUrl,
            slug: buyNowItem.slug,
            quantity: buyNowQty,
          },
        ]
      : []
    : items;

  const checkoutTotalCount = isBuyNow ? buyNowQty : totalCount;

  const checkoutSubtotal = isBuyNow
    ? buyNowItem
      ? (buyNowItem.discountPrice != null && buyNowItem.discountPrice > 0
          ? buyNowItem.discountPrice
          : buyNowItem.price) * buyNowQty
      : 0
    : cartSubtotal;

  // Delivery fee dynamically calculated by payment method and total item quantity
  const totalItemQuantity = isBuyNow ? buyNowQty : items.reduce((sum, item) => sum + item.quantity, 0);
  const shippingBreakdown = getShippingBreakdown({
    paymentMethod,
    totalQuantity: Math.max(1, totalItemQuantity),
  });
  const deliveryFee = totalItemQuantity > 0 ? shippingBreakdown.fee : 0;
  const discountAmount = appliedCoupon?.calculatedDiscount || 0;
  const grandTotal = Math.max(0, checkoutSubtotal - discountAmount) + deliveryFee;

  // Handle Coupon Apply
  async function handleApplyCoupon(e: React.FormEvent) {
    e.preventDefault();
    if (!couponInput.trim()) return;
    setCouponError(null);
    setIsValidatingCoupon(true);

    try {
      const res = await validateCouponAction(couponInput.trim(), checkoutSubtotal, {
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

    // Testing Mode Client Block — allow authorized testers to submit controlled test orders
    if (!isLiveCheckout && !testerState?.isTester) {
      setErrorMessage(
        'Online checkout is currently in development testing mode. Live order submission is disabled. For priority orders, please reach out via WhatsApp (+94 76 468 9907).'
      );
      return;
    }

    if (checkoutItems.length === 0) {
      setErrorMessage(
        isBuyNow
          ? 'No Buy Now item selected for purchase.'
          : 'Your shopping bag is empty. Please add items before checking out.'
      );
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
    for (const item of checkoutItems) {
      const vid = item.variantId.trim();
      aggregatedItemsMap.set(vid, (aggregatedItemsMap.get(vid) || 0) + item.quantity);
    }
    const canonicalItems = Array.from(aggregatedItemsMap.entries())
      .map(([variantId, quantity]) => ({ variantId, quantity }))
      .sort((a, b) => a.variantId.localeCompare(b.variantId));

    const payloadFingerprint = JSON.stringify({
      checkoutSource: isBuyNow ? 'buy_now' : 'cart',
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
        checkoutSource: isBuyNow ? 'buy_now' : 'cart',
        items: checkoutItems.map((i) => ({
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

      // Order created successfully: reset idempotency state
      clientRequestIdRef.current = null;
      clientRequestPayloadRef.current = null;

      if (isBuyNow) {
        // Clear temporary Buy Now session; shopping bag is untouched!
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('splender_buy_now_session');
        }
      } else {
        // Cart checkout: deduct purchased items from shopping bag
        const purchasedItems = checkoutItems.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
        }));
        await clearPurchasedItems(purchasedItems, res.orderNumber);
      }

      const confirmationUrl = res.orderToken
        ? `/order-confirmation/${res.orderNumber}?token=${encodeURIComponent(res.orderToken)}`
        : `/order-confirmation/${res.orderNumber}`;

      router.push(confirmationUrl);
    } catch (err: any) {
      setErrorMessage(err?.message || 'An unexpected error occurred while placing your order. Please try again.');
      setIsSubmitting(false);
    }
  }

  // Loading skeleton during cart or buy-now initialization
  if ((!isLoaded && !isBuyNow) || (isBuyNow && isLoadingBuyNow)) {
    return <CheckoutLoadingSkeleton />;
  }

  // Buy Now Error Display
  if (isBuyNow && buyNowError) {
    return (
      <Container size="xl" className="py-16 sm:py-24">
        <div className="max-w-md mx-auto text-center space-y-6">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-rose-950/40 border border-rose-800 text-rose-400 mb-2">
            <AlertCircle className="h-10 w-10 stroke-[1.5]" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-wide">
              Buy Now Unavailable
            </h1>
            <p className="text-sm text-neutral-400">{buyNowError}</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link href="/shop">
              <Button variant="gold" size="lg" className="w-full sm:w-auto px-8 font-semibold">
                Browse Jewelry Collection
              </Button>
            </Link>
            {items.length > 0 && (
              <Link href="/cart">
                <Button variant="outline" size="lg" className="w-full sm:w-auto px-6 border-neutral-700 text-neutral-300">
                  View Shopping Bag ({totalCount})
                </Button>
              </Link>
            )}
          </div>
        </div>
      </Container>
    );
  }

  // Empty Bag Display (Standard checkout)
  if (!isBuyNow && items.length === 0) {
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
              {isBuyNow ? 'Instant Buy Now Checkout' : isLiveCheckout ? 'Secure Checkout' : 'Order Review & Checkout Preview'}
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1">
              {isBuyNow
                ? 'Review your selected piece and complete your direct order with islandwide delivery.'
                : isLiveCheckout
                ? 'Please complete your shipping and payment information to place your order.'
                : 'Review calculated prices, official courier fees, and verified promo discounts before placing your order.'}
            </p>
          </div>
          <Link
            href={isBuyNow ? (buyNowItem ? `/products/${buyNowItem.slug}` : '/shop') : '/cart'}
            className="hidden sm:inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-luxury-gold transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isBuyNow ? 'Back to Product' : 'Return to Bag'}</span>
          </Link>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="p-4 rounded-lg bg-rose-950/80 border border-rose-800/80 text-rose-200 text-sm flex items-start gap-3 shadow-md animate-fadeIn">
            <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs sm:text-sm">
              <strong className="font-semibold block mb-0.5 text-rose-300">Order Submission Notice</strong>
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-rose-200 transition-colors"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Checkout Two-Column Grid */}
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Recipient & Delivery Information */}
            <div className="lg:col-span-2 space-y-8">
              {/* Recipient Details */}
              <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-6 space-y-4">
                <h2 className="text-lg font-serif font-bold text-white tracking-wide border-b border-neutral-800 pb-3 flex items-center gap-2">
                  <span>1. Recipient Information</span>
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2 space-y-1.5">
                    <label htmlFor="customerName" className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                      Full Recipient Name <span className="text-luxury-gold">*</span>
                    </label>
                    <Input
                      id="customerName"
                      type="text"
                      required
                      placeholder="e.g. Anusha Perera"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="bg-neutral-950 border-neutral-700 text-white focus:border-luxury-gold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="phone1" className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                      Primary Contact Number <span className="text-luxury-gold">*</span>
                    </label>
                    <Input
                      id="phone1"
                      type="tel"
                      required
                      placeholder="e.g. 0771234567"
                      value={phone1}
                      onChange={(e) => setPhone1(e.target.value)}
                      className="bg-neutral-950 border-neutral-700 text-white focus:border-luxury-gold"
                    />
                    <p className="text-[11px] text-neutral-500">Required for courier delivery coordination.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="phone2" className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                      Alternative Phone Number <span className="text-neutral-500 font-normal">(Optional)</span>
                    </label>
                    <Input
                      id="phone2"
                      type="tel"
                      placeholder="e.g. 0112345678"
                      value={phone2}
                      onChange={(e) => setPhone2(e.target.value)}
                      className="bg-neutral-950 border-neutral-700 text-white focus:border-luxury-gold"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1.5">
                    <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                      Email Address <span className="text-neutral-500 font-normal">(Optional for order confirmation)</span>
                    </label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="e.g. customer@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-neutral-950 border-neutral-700 text-white focus:border-luxury-gold"
                    />
                  </div>
                </div>
              </div>

              {/* Delivery Address */}
              <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-6 space-y-4">
                <h2 className="text-lg font-serif font-bold text-white tracking-wide border-b border-neutral-800 pb-3 flex items-center gap-2">
                  <span>2. Delivery Address (Sri Lanka)</span>
                </h2>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="addressLine" className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                      Street Address <span className="text-luxury-gold">*</span>
                    </label>
                    <Input
                      id="addressLine"
                      type="text"
                      required
                      placeholder="e.g. No. 45, Galle Road, Apartment 3B"
                      value={addressLine}
                      onChange={(e) => setAddressLine(e.target.value)}
                      className="bg-neutral-950 border-neutral-700 text-white focus:border-luxury-gold"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="district" className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                        District <span className="text-luxury-gold">*</span>
                      </label>
                      <select
                        id="district"
                        required
                        value={district}
                        onChange={(e) => setDistrict(e.target.value as SriLankaDistrict)}
                        className="w-full h-10 px-3 py-2 rounded-md bg-neutral-950 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-1 focus:ring-luxury-gold"
                      >
                        {SRI_LANKA_DISTRICTS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="city" className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                        City / Town <span className="text-neutral-500 font-normal">(Optional)</span>
                      </label>
                      <Input
                        id="city"
                        type="text"
                        placeholder="e.g. Kollupitiya"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="bg-neutral-950 border-neutral-700 text-white focus:border-luxury-gold"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="postalCode" className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                        Postal Code <span className="text-neutral-500 font-normal">(Optional)</span>
                      </label>
                      <Input
                        id="postalCode"
                        type="text"
                        placeholder="e.g. 00300"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        className="bg-neutral-950 border-neutral-700 text-white focus:border-luxury-gold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="deliveryNotes" className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                      Courier Delivery Instructions <span className="text-neutral-500 font-normal">(Optional)</span>
                    </label>
                    <Input
                      id="deliveryNotes"
                      type="text"
                      placeholder="e.g. Leave with security desk or call before arriving"
                      value={deliveryNotes}
                      onChange={(e) => setDeliveryNotes(e.target.value)}
                      className="bg-neutral-950 border-neutral-700 text-white focus:border-luxury-gold"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Method Selection */}
              <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-6 space-y-4">
                <h2 className="text-lg font-serif font-bold text-white tracking-wide border-b border-neutral-800 pb-3 flex items-center gap-2">
                  <span>3. Payment Method</span>
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* COD */}
                  <label
                    className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                      paymentMethod === PAYMENT_METHODS.COD
                        ? 'border-luxury-gold bg-luxury-gold/5 ring-1 ring-luxury-gold'
                        : 'border-neutral-800 hover:border-neutral-700 bg-neutral-950'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={PAYMENT_METHODS.COD}
                      checked={paymentMethod === PAYMENT_METHODS.COD}
                      onChange={() => setPaymentMethod(PAYMENT_METHODS.COD)}
                      className="mt-1 text-luxury-gold focus:ring-luxury-gold bg-neutral-900 border-neutral-700"
                    />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Banknote className="h-4 w-4 text-luxury-gold" />
                        <span className="font-semibold text-white text-sm">Cash on Delivery</span>
                      </div>
                      <p className="text-xs text-neutral-400">
                        Pay cash directly to the courier upon delivery of your parcel.
                      </p>
                    </div>
                  </label>

                  {/* Bank Transfer */}
                  <label
                    className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                      paymentMethod === PAYMENT_METHODS.BANK_TRANSFER
                        ? 'border-luxury-gold bg-luxury-gold/5 ring-1 ring-luxury-gold'
                        : 'border-neutral-800 hover:border-neutral-700 bg-neutral-950'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={PAYMENT_METHODS.BANK_TRANSFER}
                      checked={paymentMethod === PAYMENT_METHODS.BANK_TRANSFER}
                      onChange={() => setPaymentMethod(PAYMENT_METHODS.BANK_TRANSFER)}
                      className="mt-1 text-luxury-gold focus:ring-luxury-gold bg-neutral-900 border-neutral-700"
                    />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4 text-emerald-400" />
                        <span className="font-semibold text-white text-sm">Bank Transfer (WhatsApp)</span>
                      </div>
                      <p className="text-xs text-neutral-400">
                        Transfer funds and share payment receipt via WhatsApp for verification.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Right Column: Order Review & Pricing Summary */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-6 space-y-6 sticky top-24">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                  <h2 className="text-lg font-serif font-bold text-white tracking-wide">
                    Order Summary ({checkoutTotalCount})
                  </h2>
                  {isBuyNow && (
                    <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-luxury-gold/20 text-luxury-gold border border-luxury-gold/40">
                      Buy Now
                    </span>
                  )}
                </div>

                {/* Buy Now Preservation Notice */}
                {isBuyNow && (
                  <div className="p-3 bg-luxury-gold/10 border border-luxury-gold/30 rounded-md text-xs text-luxury-gold space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <Sparkles className="h-4 w-4 shrink-0" />
                      <span>Instant Checkout</span>
                    </div>
                    <p className="text-[11px] text-neutral-300">
                      Purchasing this item directly. Your normal shopping bag ({totalCount} items) is safe and preserved.
                    </p>
                  </div>
                )}

                {/* Items Mini List */}
                <div className="max-h-60 overflow-y-auto divide-y divide-neutral-800/80 pr-1 space-y-2">
                  {checkoutItems.map((item) => {
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
                    <span>{isBuyNow ? 'Item Subtotal' : 'Bag Subtotal'}</span>
                    <span className="font-semibold text-white">{formatCurrency(checkoutSubtotal)}</span>
                  </div>

                  {appliedCoupon && (
                    <div className="flex justify-between text-luxury-gold">
                      <span>Coupon Discount ({appliedCoupon.code})</span>
                      <span className="font-semibold">-{formatCurrency(appliedCoupon.calculatedDiscount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-neutral-300">
                    <span>Delivery ({shippingBreakdown.courierService})</span>
                    <span className="font-semibold text-white">{formatCurrency(deliveryFee)}</span>
                  </div>

                  <div className="pt-3 border-t border-neutral-800 flex justify-between items-baseline">
                    <span className="text-base font-bold text-white">Total Amount</span>
                    <span className="text-xl font-bold text-luxury-gold">{formatCurrency(grandTotal)}</span>
                  </div>
                </div>

                {/* Storefront Preview / Testing Mode Notice */}
                {!isLiveCheckout && (
                  testerState?.isTester ? (
                    <div className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-emerald-200 text-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        <strong className="font-semibold text-emerald-300">Authorized Tester Mode Active</strong>
                      </div>
                      <p className="text-[11px] text-emerald-200/90 leading-relaxed">
                        Authenticated session verified ({testerState.email || 'Authorized Tester ID'}). Controlled test order submission is enabled for your session only.
                      </p>
                    </div>
                  ) : (
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
                  )
                )}

                {/* Submit Action */}
                <div className="space-y-3 pt-2">
                  {isLiveCheckout || testerState?.isTester ? (
                    <Button
                      type="submit"
                      variant="gold"
                      size="lg"
                      disabled={isSubmitting || checkoutItems.length === 0}
                      className="w-full text-base font-semibold py-4 flex items-center justify-center gap-2 shadow-lg shadow-luxury-gold/15 hover:shadow-luxury-gold/25"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span>Processing Order...</span>
                        </>
                      ) : (
                        <span>{isLiveCheckout ? 'Confirm & Place Order' : 'Confirm & Place Test Order (Authorized)'}</span>
                      )}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      disabled
                      size="lg"
                      className="w-full text-sm font-medium py-3.5 bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed"
                    >
                      Live Checkout Disabled
                    </Button>
                  )}

                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-neutral-400 pt-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-luxury-gold" />
                    <span>256-Bit SSL Encrypted • Direct Customer Care</span>
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

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutLoadingSkeleton />}>
      <CheckoutContent />
    </Suspense>
  );
}
