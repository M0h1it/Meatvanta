import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { formatWindow, formatDate, formatRupees } from "../../../lib/format";
import { HERO_IMAGE } from "../../../lib/images";

const TRUST_BADGES = [
  { icon: "eco", title: "100% Fresh", sub: "& Natural" },
  { icon: "verified", title: "Halal", sub: "Certified" },
  { icon: "content_cut", title: "Daily Cut", sub: "Always Fresh" },
  { icon: "local_shipping", title: "Fast & Safe", sub: "Delivery" },
  { icon: "favorite", title: "Trusted by", sub: "Families" },
];

// Mirrors the status keys used on MyOrderDetailPage/admin - kept in sync there.
const STATUS_STEPS = [
  { key: "placed", label: "Order Placed", icon: "receipt_long" },
  { key: "preparing", label: "Preparing Order", icon: "skillet" },
  { key: "out_for_delivery", label: "Out for Delivery", icon: "moped" },
  { key: "delivered", label: "Delivered", icon: "check_circle" },
];

export default function OrderConfirmationPage() {
  const { orderNumber } = useParams();
  const location = useLocation();

  // Coming straight from checkout, the order is handed over in router state -
  // no need to re-fetch (and no phone number needed to look it up).
  const [order] = useState(location.state?.order || null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  if (!order) {
    // Page was refreshed or opened directly - we don't have the phone number
    // required to fetch it, so send them to their order list instead.
    return (
      <div className="page-x max-w-3xl mx-auto py-16 text-center">
        <p className="text-ink font-bold text-lg mb-1">Order {orderNumber}</p>
        <p className="text-ink/60 text-sm mb-6">
          This order is saved to your account.
        </p>
        <Link
          to="/my-orders"
          className="inline-block bg-brand text-white font-bold px-8 py-3 rounded-full hover:opacity-90"
        >
          View My Orders
        </Link>
      </div>
    );
  }

  const isUpi = order.paymentMethod === "upi";
  const currentStepIndex = Math.max(0, STATUS_STEPS.findIndex((s) => s.key === order.status));

  return (
    <div>
      {/* Hero banner */}
      <section className="relative overflow-hidden bg-gradient-to-r from-surface via-surface to-surface-alt border-b border-hairline">
        <div className="page-x grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-center py-10 md:py-14">
          <div className="text-center md:text-left">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto md:mx-0 mb-4">
              <span className="material-symbols-outlined text-4xl text-success">check_circle</span>
            </div>
            <h1 className="font-display text-headline-lg text-ink mb-1">Payment Successful!</h1>
            <p className="text-ink/60 text-sm max-w-md mx-auto md:mx-0">
              Thanks, {order.customerName}. Your order has been placed successfully. We will start preparing your
              fresh meat and keep you updated.
            </p>

            <div className="flex flex-wrap justify-center md:justify-start gap-3 mt-5">
              <span className="flex items-center gap-1.5 bg-accent-soft/40 border border-accent/30 text-ink text-xs font-semibold px-3 py-1.5 rounded-full">
                <span className="material-symbols-outlined text-sm">description</span>
                Order ID: <span className="font-mono">{order.orderNumber}</span>
              </span>
              <span className="flex items-center gap-1.5 bg-accent-soft/40 border border-accent/30 text-ink text-xs font-semibold px-3 py-1.5 rounded-full">
                <span className="material-symbols-outlined text-sm">calendar_today</span>
                {formatDate(order.createdAt || new Date())}
              </span>
            </div>

            <div className="flex flex-wrap justify-center md:justify-start gap-3 mt-5">
              <Link
                to="/shop"
                className="inline-flex items-center gap-1.5 bg-brand text-white font-bold px-6 py-2.5 rounded-full hover:opacity-90"
              >
                <span className="material-symbols-outlined text-lg">storefront</span>
                Continue Shopping
              </Link>
              <Link
                to={`/my-orders/${order.orderNumber}`}
                className="inline-flex items-center gap-1.5 border border-brand text-brand font-bold px-6 py-2.5 rounded-full hover:bg-white"
              >
                <span className="material-symbols-outlined text-lg">local_shipping</span>
                Track Your Order
              </Link>
            </div>
          </div>
          <div className="relative hidden md:block w-64 h-40 rounded-lg overflow-hidden shrink-0">
            <img src={HERO_IMAGE} alt="Fresh cuts" className="w-full h-full object-cover" />
          </div>
        </div>
      </section>

      <div className="page-x max-w-3xl mx-auto py-10 md:py-14">

      {isUpi && (
        <div className="bg-accent/10 border border-accent/30 rounded p-4 mb-5">
          <p className="font-bold text-ink text-sm flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base text-accent">hourglass_top</span>
            Payment under review
          </p>
          <p className="text-xs text-ink/70 mt-1">
            We're confirming your UPI payment. Once verified, we'll start preparing your order.
          </p>
        </div>
      )}

      {/* Status tracker */}
      <div className="bg-white rounded border border-hairline p-5 mb-5">
        <h2 className="font-bold text-ink mb-4">Order Confirmed!</h2>
        <div className="flex items-start justify-between">
          {STATUS_STEPS.map((step, index) => {
            const isDone = index <= currentStepIndex;
            return (
              <div key={step.key} className="flex-1 flex flex-col items-center text-center relative">
                {index > 0 && (
                  <span
                    className={`absolute top-5 right-1/2 w-full h-0.5 -z-10 ${
                      isDone ? "bg-success" : "bg-hairline"
                    }`}
                  />
                )}
                <span
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    isDone ? "bg-success text-white" : "bg-surface text-ink/30 border border-hairline"
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">{step.icon}</span>
                </span>
                <p className={`text-xs font-semibold mt-2 ${isDone ? "text-ink" : "text-ink/40"}`}>{step.label}</p>
                <p className="text-[11px] text-ink/50">
                  {index === currentStepIndex
                    ? "In progress"
                    : isDone
                    ? "Done"
                    : "Will be updated soon"}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded border border-hairline p-5 mb-5">
        <h2 className="font-bold text-ink mb-3">Delivery</h2>
        <div className="flex items-start gap-2 mb-2">
          <span className="material-symbols-outlined text-base text-brand-dark mt-0.5">event</span>
          <div>
            <p className="text-sm font-semibold text-ink">{formatDate(order.deliveryDate)}</p>
            <p className="text-xs text-ink/60">
              {formatWindow(order.deliveryStartTime, order.deliveryEndTime)}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded border border-hairline p-5 mb-6">
        <h2 className="font-bold text-ink mb-3">Order Summary</h2>
        {order.items?.map((item) => (
          <div key={item.id} className="flex justify-between text-sm mb-1.5">
            <span className="text-ink/70">
              {item.quantity}× {item.productName}{" "}
              <span className="text-ink/50">({item.variantLabel})</span>
              {item.selectedOptions?.length > 0 && (
                <span className="block text-xs text-brand-dark">
                  {item.selectedOptions.map((o) => o.optionName).join(", ")}
                </span>
              )}
              {item.comboItems?.length > 0 && (
                <span className="block text-xs text-ink/50">
                  Includes: {item.comboItems.map((c) => `${c.productName} ${c.variantLabel}${c.quantity > 1 ? ` ×${c.quantity}` : ""}`).join(" + ")}
                </span>
              )}
            </span>
            <span className="font-semibold text-ink">{formatRupees(item.lineTotal)}</span>
          </div>
        ))}

        <div className="border-t border-hairline mt-3 pt-3 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-ink/70">Subtotal</span>
            <span className="font-semibold text-ink">{formatRupees(order.subtotal)}</span>
          </div>
          {Number(order.discount) > 0 && (
            <div className="flex justify-between text-sm text-success">
              <span>
                Coupon{order.couponCode && <span className="font-mono font-semibold"> {order.couponCode}</span>}
              </span>
              <span className="font-semibold">−{formatRupees(order.discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-ink/70">Delivery</span>
            {order.freeDelivery ? (
              <span className="font-semibold text-success">Free{order.couponCode ? ` (${order.couponCode})` : ""}</span>
            ) : order.deliveryChargeStatus === "pending" ? (
              <span className="text-ink/50 text-xs">To be confirmed</span>
            ) : (
              <span className="font-semibold text-ink">{formatRupees(order.deliveryCharge)}</span>
            )}
          </div>
        </div>

        <div className="border-t border-hairline mt-3 pt-3 flex justify-between items-center">
          <span className="font-bold text-ink">
            Total
            <span className="block text-xs font-normal text-ink/50">
              {order.paymentMethod === "cod" ? "Pay on delivery" : "Paid online"}
            </span>
          </span>
          <span className="text-2xl font-bold text-ink">{formatRupees(order.total)}</span>
        </div>
      </div>

      <div className="bg-brand/5 border border-brand/15 rounded p-4 flex items-start gap-2">
        <span className="material-symbols-outlined text-brand text-lg">notifications</span>
        <p className="text-xs text-ink/70">
          You'll receive updates here and under My Orders. For any queries, feel free to contact us.
        </p>
      </div>
      </div>

      {/* Trust badge strip */}
      <section className="bg-surface-alt border-y border-hairline">
        <div className="page-x py-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {TRUST_BADGES.map((b) => (
            <div key={b.title} className="flex flex-col items-center gap-1 text-center w-20">
              <span className="material-symbols-outlined text-brand">{b.icon}</span>
              <span className="text-xs font-semibold text-ink leading-tight">
                {b.title} {b.sub}
              </span>
            </div>
          ))}
          <p className="font-display italic text-accent text-base">Thank You for Choosing Meatvanta ♡</p>
        </div>
      </section>
    </div>
  );
}
