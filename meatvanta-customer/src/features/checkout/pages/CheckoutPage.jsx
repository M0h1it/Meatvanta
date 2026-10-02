import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { fetchDeliveryAvailability, placeOrder, verifyRazorpayPayment } from "../api/checkoutApi";
import { useCart } from "../../../hooks/useCart";
import { useCustomerAuth } from "../../../hooks/useCustomerAuth";
import AddressFormModal from "../../account/components/AddressFormModal";
import { formatWindow, formatDate, formatRupees } from "../../../lib/format";
import { HERO_IMAGE } from "../../../lib/images";
import CouponBox from "../../coupons/components/CouponBox";
import { useCouponPreview } from "../../coupons/useCouponPreview";
import { loadRazorpay } from "../../../lib/externalScripts";

/**
 * First-order welcome offer, shown on a payment option: the live saving when
 * it applies to that method, a nudge when it only applies to the other one.
 */
function WelcomeNote({ welcome, method }) {
  if (!welcome) return null;
  const other = method === "cod" ? "razorpay" : "cod";
  if (welcome.methods.includes(method)) {
    const save = welcome.discountByMethod?.[method] || 0;
    const short = welcome.shortByMethod?.[method] || 0;
    return (
      <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full">
        <span className="material-symbols-outlined text-sm">redeem</span>
        {short > 0
          ? `Add ${formatRupees(short)} more for ${welcome.percent}% off your first order`
          : save > 0
            ? `${welcome.percent}% off your first order - save ${formatRupees(save)}`
            : `${welcome.percent}% off your first order`}
      </span>
    );
  }
  if (welcome.methods.includes(other)) {
    return (
      <span className="mt-1 block text-[11px] text-ink/50">
        {method === "cod" ? "Pay online instead" : "Pay on delivery instead"} to get {welcome.percent}% off your first order.
      </span>
    );
  }
  return null;
}

export default function CheckoutPage() {
  const { items, totalPrice, clearCart } = useCart();
  const { customer, isAuthenticated, isLoading: authLoading, openLogin, refreshCustomer } = useCustomerAuth();
  const navigate = useNavigate();

  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [isAddressFormOpen, setIsAddressFormOpen] = useState(false);

  const [availability, setAvailability] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState(null);

  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    deliveryAddress: "",
    deliveryDate: "",
    paymentMethod: "",
    notes: "",
  });

  // Per-customer coupon rules go by phone number: the one typed here, else the account's.
  const phoneDigits = form.customerPhone.replace(/\D/g, "");
  // The chosen payment method matters: the new-customer welcome offer can be
  // limited to online (or cash) payment, so the price is re-checked when it changes.
  const coupon = useCouponPreview({
    customerPhone: phoneDigits.length >= 10 ? form.customerPhone : customer?.phone,
    paymentMethod: form.paymentMethod,
  });
  const welcome = coupon.preview?.welcome || null;

  // Razorpay is loaded here instead of on every page. Started when the page
  // opens so the payment window is ready by the time "Place Order" is pressed.
  useEffect(() => {
    loadRazorpay().catch(() => {}); // a failure is handled again on payment
  }, []);

  useEffect(() => {
    fetchDeliveryAvailability()
      .then((data) => {
        setAvailability(data);
        setForm((f) => ({
          ...f,
          deliveryDate: data.dates[0]?.date || "",
          // upiEnabled now gates "Pay Online" (Razorpay) - see checkoutApi/backend notes.
          paymentMethod: data.payment.codEnabled ? "cod" : data.payment.upiEnabled ? "razorpay" : "",
        }));
      })
      .catch(() => setGeneralError("Couldn't load delivery options. Please refresh."))
      .finally(() => setIsLoading(false));
  }, []);

  // Prefill from the signed-in account so nothing is retyped.
  useEffect(() => {
    if (!customer) return;
    const preferred =
      customer.addresses?.find((a) => a.id === selectedAddressId) ||
      customer.addresses?.find((a) => a.isDefault) ||
      customer.addresses?.[0] ||
      null;

    setForm((f) => ({
      ...f,
      customerName: customer.name || f.customerName,
      customerPhone: customer.phone || f.customerPhone,
      deliveryAddress: preferred
        ? [preferred.addressLine, preferred.area, preferred.pincode].filter(Boolean).join(", ")
        : f.deliveryAddress,
    }));
    if (preferred && selectedAddressId !== preferred.id) setSelectedAddressId(preferred.id);
  }, [customer, selectedAddressId]);

  if (items.length === 0 && !isSubmitting) {
    return (
      <div className="page-x max-w-3xl mx-auto py-16 text-center">
        <p className="text-ink font-bold text-lg mb-1">Your cart is empty</p>
        <Link to="/shop" className="text-brand-dark font-bold underline">
          Browse fresh cuts
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return <div className="page-x max-w-3xl mx-auto py-12 text-sm text-ink/60">Loading delivery options...</div>;
  }

  const isFlatCharge = availability?.deliveryChargeMode === "flat";
  const freeDelivery = Boolean(coupon.preview?.freeDelivery);
  const deliveryCharge = isFlatCharge && !freeDelivery ? Number(availability.flatDeliveryCharge) : 0;
  const discount = coupon.preview?.discount || 0;
  // Display only - the server prices the order itself and the payment amount comes from it.
  const grandTotal = totalPrice + deliveryCharge - discount;
  const noDatesAvailable = availability && availability.dates.length === 0;

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // Sign-in normally happens at the cart, so this is just a safety net for
    // anyone landing on /checkout directly.
    if (!isAuthenticated) {
      openLogin(() => submitOrder());
      return;
    }
    submitOrder();
  }

  /**
   * Opens Razorpay's checkout widget. No order exists on our side yet at
   * this point - only the Razorpay order + a priced draft (see
   * createPublicOrder on the backend). On success it calls the backend to
   * verify the payment signature, and THAT call is what actually creates the
   * real order. If the customer just closes the widget to see the final
   * price/a discount, or payment fails, nothing was ever created - the shop
   * never sees it.
   */
  async function openRazorpayCheckout({ razorpayOrderId, razorpayKeyId, amount }) {
    if (!window.Razorpay) {
      try {
        await loadRazorpay(); // normally already loaded when the page opened
      } catch {
        setGeneralError("Payment couldn't load. Please check your connection and try again.");
        setIsSubmitting(false);
        return;
      }
    }

    const rzp = new window.Razorpay({
      key: razorpayKeyId,
      amount: Math.round(Number(amount) * 100),
      currency: "INR",
      name: "Meat Vanta",
      description: "Order payment",
      order_id: razorpayOrderId,
      prefill: {
        name: form.customerName,
        contact: form.customerPhone,
      },
      theme: { color: "#C8102E" },
      handler: async function handleRazorpaySuccess(response) {
        try {
          const verifiedOrder = await verifyRazorpayPayment({
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          clearCart();
          navigate(`/order-confirmation/${verifiedOrder.orderNumber}`, { state: { order: verifiedOrder } });
        } catch {
          // Payment succeeded at Razorpay but our verification call failed
          // (network blip, etc.) - send them to order tracking rather than
          // leaving them stuck on checkout; the webhook will also catch this
          // and create the order on its own.
          setGeneralError(
            "Your payment went through, but we couldn't confirm it here. Check My Orders in a moment - it'll update shortly."
          );
          setIsSubmitting(false);
        }
      },
      modal: {
        // Customer closed the widget without paying - nothing was ever
        // created on our side, so just let them try again.
        ondismiss: () => setIsSubmitting(false),
      },
    });

    rzp.on("payment.failed", () => {
      setGeneralError("Payment failed. Please try again.");
      setIsSubmitting(false);
    });

    rzp.open();
  }

  async function submitOrder() {
    setGeneralError(null);
    setErrors({});
    setIsSubmitting(true);

    try {
      const { order, razorpayOrderId, razorpayKeyId, amount } = await placeOrder({
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        deliveryAddress: form.deliveryAddress,
        deliveryDate: form.deliveryDate,
        paymentMethod: form.paymentMethod,
        notes: form.notes || undefined,
        couponCode: coupon.couponCode || undefined,
        items: items.map((i) => ({
          productVariantId: i.variantId,
          quantity: i.quantity,
          optionIds: i.optionIds?.length ? i.optionIds : undefined,
        })),
      });

      if (form.paymentMethod === "razorpay") {
        // Nothing exists on our side yet - open the widget; the order is
        // only created once the payment is verified as successful.
        openRazorpayCheckout({ razorpayOrderId, razorpayKeyId, amount });
        return;
      }

      clearCart();
      navigate(`/order-confirmation/${order.orderNumber}`, { state: { order } });
    } catch (err) {
      const response = err.response?.data;
      if (response?.errors) setErrors(response.errors);
      // The coupon stopped working between applying it and ordering (used up,
      // expired, already used by this number) - drop it so the next try works.
      if (coupon.couponCode && response?.message?.includes(coupon.couponCode)) coupon.remove();
      setGeneralError(response?.message || "Something went wrong placing your order.");
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      {/* Hero banner */}
      <section className="relative overflow-hidden bg-gradient-to-r from-surface via-surface to-surface-alt border-b border-hairline">
        <div className="page-x grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center py-8 md:py-10">
          <div className="flex items-center gap-4">
            <span className="w-14 h-14 rounded-full bg-ink flex items-center justify-center shrink-0">
              <span className="text-accent text-[10px] font-bold text-center leading-tight">حلال<br />HALAL</span>
            </span>
            <div>
              <h1 className="font-display text-headline-lg">
                <span className="text-brand">Secure Payment</span>{" "}
                <span className="text-accent">for a Safe Purchase</span>
              </h1>
              <p className="text-ink/60 text-sm mt-1">
                Choose your preferred payment method and complete your order securely.
              </p>
            </div>
          </div>
          <div className="relative hidden md:block w-64 h-32 rounded-lg overflow-hidden shrink-0">
            <img src={HERO_IMAGE} alt="Fresh cuts" className="w-full h-full object-cover" />
          </div>
        </div>
      </section>

      <div className="page-x max-w-3xl mx-auto py-8 md:py-12">

      {/* Decorative step indicator - this is still a single-page checkout,
          just visually framed as Cart -> Payment -> Confirmation. */}
      <div className="flex items-center gap-2 mb-8 text-sm">
        <span className="flex items-center gap-1.5 text-white font-semibold bg-brand-dark px-3 py-1.5 rounded-full">
          <span className="material-symbols-outlined text-lg">check_circle</span>
          Cart
        </span>
        <span className="flex-1 h-px bg-hairline" />
        <span className="flex items-center gap-1.5 text-brand-dark font-bold border border-brand-dark px-3 py-1.5 rounded-full">
          <span className="w-5 h-5 rounded-full bg-brand-dark text-white text-[11px] flex items-center justify-center">2</span>
          Payment
        </span>
        <span className="flex-1 h-px bg-hairline" />
        <span className="flex items-center gap-1.5 text-ink/40 px-3 py-1.5">
          <span className="w-5 h-5 rounded-full border border-ink/20 text-[11px] flex items-center justify-center">3</span>
          Confirmation
        </span>
      </div>

      {generalError && (
        <div className="mb-4 rounded-sm bg-brand/10 border border-brand/30 text-brand text-sm px-4 py-3">
          {generalError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Saved addresses - only for signed-in customers */}
        {isAuthenticated && customer?.addresses?.length > 0 && (
          <section className="bg-white rounded border border-hairline p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-ink">Deliver To</h2>
              <button
                type="button"
                onClick={() => setIsAddressFormOpen(true)}
                className="text-sm font-bold text-brand-dark"
              >
                + Add New
              </button>
            </div>
            <div className="space-y-2">
              {customer.addresses.map((address) => {
                const isSelected = selectedAddressId === address.id;
                return (
                  <button
                    key={address.id}
                    type="button"
                    onClick={() => {
                      setSelectedAddressId(address.id);
                      setField(
                        "deliveryAddress",
                        [address.addressLine, address.area, address.pincode].filter(Boolean).join(", ")
                      );
                    }}
                    className={`w-full text-left p-3 rounded-sm border transition-colors ${
                      isSelected ? "border-brand-dark bg-brand-dark/5" : "border-ink/15"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-ink text-sm">{address.label}</span>
                      {address.isDefault && (
                        <span className="text-[10px] font-bold uppercase bg-brand-dark/10 text-brand-dark px-2 py-0.5 rounded-full">
                          Default
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-ink/60 mt-0.5">
                      {[address.addressLine, address.area, address.pincode].filter(Boolean).join(", ")}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Contact */}
        <section className="bg-white rounded border border-hairline p-5">
          <h2 className="font-bold text-ink mb-3">Your Details</h2>

          <label className="block text-sm font-semibold text-ink mb-1">Full Name</label>
          <input
            required
            value={form.customerName}
            onChange={(e) => setField("customerName", e.target.value)}
            className="w-full mb-1 rounded-sm border border-ink/15 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-dark"
          />
          {errors.customerName && <p className="text-xs text-brand mb-2">{errors.customerName}</p>}

          <label className="block text-sm font-semibold text-ink mb-1 mt-3">Phone Number</label>
          <input
            required
            type="tel"
            placeholder="10-digit mobile number"
            value={form.customerPhone}
            onChange={(e) => setField("customerPhone", e.target.value)}
            className="w-full mb-1 rounded-sm border border-ink/15 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-dark"
          />
          {errors.customerPhone && <p className="text-xs text-brand mb-2">{errors.customerPhone}</p>}
          <p className="text-xs text-ink/50 mt-1">You'll need this to track your order.</p>

          <label className="block text-sm font-semibold text-ink mb-1 mt-3">Delivery Address</label>
          <textarea
            required
            rows={3}
            placeholder="House / flat number, street, sector, landmark"
            value={form.deliveryAddress}
            onChange={(e) => setField("deliveryAddress", e.target.value)}
            className="w-full rounded-sm border border-ink/15 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-dark"
          />
          {errors.deliveryAddress && <p className="text-xs text-brand mt-1">{errors.deliveryAddress}</p>}
          {availability?.deliveryAreaNote && (
            <p className="text-xs text-ink/50 mt-1">{availability.deliveryAreaNote}</p>
          )}
        </section>

        {/* Delivery slot */}
        <section className="bg-white rounded border border-hairline p-5">
          <h2 className="font-bold text-ink mb-1">Delivery Date</h2>
          <p className="text-xs text-ink/50 mb-3">
            We deliver {formatWindow(availability?.deliveryWindow.startTime, availability?.deliveryWindow.endTime)}.
          </p>

          {noDatesAvailable ? (
            <div className="rounded-sm bg-brand/10 border border-brand/30 text-brand text-sm px-4 py-3">
              No delivery dates are open right now. Please try again later.
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {availability.dates.map((d) => {
                const isSelected = form.deliveryDate === d.date;
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setField("deliveryDate", d.date)}
                    className={`shrink-0 px-4 py-3 rounded-sm border text-left transition-all ${
                      isSelected
                        ? "border-brand-dark bg-brand-dark text-surface"
                        : "border-ink/15 bg-white text-ink hover:border-brand-dark"
                    }`}
                  >
                    <span className="block text-xs font-bold">{d.label || formatDate(d.date).split(",")[0]}</span>
                    <span className={`block text-sm font-semibold ${isSelected ? "text-surface" : "text-ink"}`}>
                      {formatDate(d.date).split(", ")[1]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {errors.deliveryDate && <p className="text-xs text-brand mt-2">{errors.deliveryDate}</p>}

          <div className="mt-3 inline-flex items-center gap-1.5 bg-brand-dark/10 text-brand-dark text-xs font-bold px-3 py-1.5 rounded-full">
            <span className="material-symbols-outlined text-sm">schedule</span>
            Morning Delivery · {formatWindow(availability?.deliveryWindow.startTime, availability?.deliveryWindow.endTime)}
          </div>
        </section>

        {/* Payment */}
        <section className="bg-white rounded border border-hairline p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-brand">lock</span>
            <h2 className="font-bold text-ink">Payment Method</h2>
          </div>
          <p className="text-xs text-ink/50 mb-3">Select your preferred payment option</p>

          <div className="space-y-2">
            {availability?.payment.codEnabled && (
              <label
                className={`flex items-start gap-3 p-3 rounded-sm border cursor-pointer transition-colors ${
                  form.paymentMethod === "cod" ? "border-brand-dark bg-brand-dark/5" : "border-ink/15"
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  checked={form.paymentMethod === "cod"}
                  onChange={() => setField("paymentMethod", "cod")}
                  className="mt-1"
                />
                <span className="flex items-center gap-2 flex-1">
                  <span className="material-symbols-outlined text-ink/60">payments</span>
                  <span>
                    <span className="font-semibold text-ink text-sm block">Cash on Delivery</span>
                    <span className="text-xs text-ink/60">Pay when your order arrives.</span>
                    <WelcomeNote welcome={welcome} method="cod" />
                  </span>
                </span>
                <span className="text-[10px] font-bold uppercase text-success bg-success/10 px-2 py-0.5 rounded-full self-center shrink-0">
                  Available
                </span>
              </label>
            )}

            {/* "upiEnabled" from Delivery Settings now gates online payment via
                Razorpay - it opens a single widget covering card, UPI and
                netbanking together, rather than a separate option per method. */}
            {availability?.payment.upiEnabled && (
              <label
                className={`flex items-start gap-3 p-3 rounded-sm border cursor-pointer transition-colors ${
                  form.paymentMethod === "razorpay" ? "border-brand-dark bg-brand-dark/5" : "border-ink/15"
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  checked={form.paymentMethod === "razorpay"}
                  onChange={() => setField("paymentMethod", "razorpay")}
                  className="mt-1"
                />
                <span className="flex items-center gap-2 flex-1">
                  <span className="material-symbols-outlined text-ink/60">credit_card</span>
                  <span>
                    <span className="font-semibold text-ink text-sm block">Pay Online</span>
                    <span className="text-xs text-ink/60">Card, UPI or Net Banking - pay securely now via Razorpay.</span>
                    <WelcomeNote welcome={welcome} method="razorpay" />
                  </span>
                </span>
                <span className="text-[10px] font-bold uppercase text-success bg-success/10 px-2 py-0.5 rounded-full self-center shrink-0">
                  Available
                </span>
              </label>
            )}

          </div>

          <div className="mt-4 flex items-start gap-2 bg-brand/5 border border-brand/15 rounded-sm p-3">
            <span className="material-symbols-outlined text-brand text-lg">shield</span>
            <p className="text-xs text-ink/70">
              Your payment information is safe & secure with us. We use industry-standard encryption to protect your data.
            </p>
          </div>
        </section>

        {/* Notes */}
        <section className="bg-white rounded border border-hairline p-5">
          <label className="block text-sm font-semibold text-ink mb-1">
            Any special instructions? <span className="font-normal text-ink/50">(optional)</span>
          </label>
          <textarea
            rows={2}
            placeholder="e.g. cut into small pieces, call before arriving"
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
            className="w-full rounded-sm border border-ink/15 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-dark"
          />
        </section>

        {/* Summary */}
        <section className="bg-white rounded border border-hairline p-5">
          <h2 className="font-bold text-ink mb-3">Order Summary</h2>
          {items.map((item) => (
            <div key={item.lineKey} className="flex justify-between text-sm mb-1.5">
              <span className="text-ink/70">
                {item.quantity}× {item.productName}{" "}
                <span className="text-ink/50">({item.variantLabel})</span>
                {item.optionLabels?.length > 0 && (
                  <span className="block text-xs text-brand-dark">{item.optionLabels.join(", ")}</span>
                )}
                {item.includes && <span className="block text-xs text-ink/50">Includes: {item.includes}</span>}
              </span>
              <span className="font-semibold text-ink">
                {formatRupees((item.price + (item.optionsTotal || 0)) * item.quantity)}
              </span>
            </div>
          ))}

          <div className="border-t border-hairline mt-3 pt-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-ink/70">Subtotal</span>
              <span className="font-semibold text-ink">{formatRupees(totalPrice)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-success">
                <span>
                  {coupon.preview.kind === "welcome" ? (
                    <>Welcome offer ({welcome?.percent}% off)</>
                  ) : (
                    <>
                      Coupon <span className="font-mono font-semibold">{coupon.preview.code}</span>
                    </>
                  )}
                </span>
                <span className="font-semibold">−{formatRupees(discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-ink/70">Delivery</span>
              {freeDelivery ? (
                <span className="font-semibold text-success">Free (coupon)</span>
              ) : isFlatCharge ? (
                <span className="font-semibold text-ink">{formatRupees(deliveryCharge)}</span>
              ) : (
                <span className="text-ink/50 text-xs text-right max-w-[60%]">
                  Confirmed after we check your address
                </span>
              )}
            </div>
          </div>

          <div className="border-t border-hairline mt-3 pt-3">
            <CouponBox coupon={coupon} />
          </div>

          <div className="border-t border-hairline mt-3 pt-3 flex justify-between items-center">
            <span className="font-bold text-ink">Total</span>
            <span className="text-2xl font-bold text-ink">{formatRupees(grandTotal)}</span>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || noDatesAvailable || !form.paymentMethod}
            className="flex items-center justify-center gap-2 w-full mt-4 bg-brand text-white font-bold py-4 rounded-full hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-lg">lock</span>
            {isSubmitting ? "Placing your order..." : `Place Order · ${formatRupees(grandTotal)}`}
          </button>
        </section>
      </form>

      <AddressFormModal
        isOpen={isAddressFormOpen}
        onClose={() => setIsAddressFormOpen(false)}
        onSaved={async (saved) => {
          await refreshCustomer();
          setSelectedAddressId(saved.id);
          setField(
            "deliveryAddress",
            [saved.addressLine, saved.area, saved.pincode].filter(Boolean).join(", ")
          );
        }}
      />
      </div>
    </div>
  );
}