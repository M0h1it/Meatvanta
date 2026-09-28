import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchMyOrder } from "../api/ordersApi";
import { formatWindow, formatDate, formatRupees } from "../../../lib/format";

// 15s - the customer is often watching this screen while waiting, so a
// shorter interval is worth the extra requests. Only polls while the tab is
// visible and the order isn't already delivered/cancelled.
const POLL_INTERVAL_MS = 15000;

const STATUS_STEPS = [
  { key: "placed", label: "Order Placed", icon: "receipt_long" },
  { key: "preparing", label: "Preparing", icon: "skillet" },
  { key: "out_for_delivery", label: "Out for Delivery", icon: "moped" },
  { key: "delivered", label: "Delivered", icon: "check_circle" },
];

const PAYMENT_LABELS = {
  unpaid: "Pay on delivery",
  submitted: "Payment under review",
  verified: "Payment verified",
  rejected: "Payment not confirmed",
  paid: "Paid",
};

export default function MyOrderDetailPage() {
  const { orderNumber } = useParams();

  const [order, setOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Kept in a ref so the polling effect doesn't need `order` as a dependency
  // (which would tear down and rebuild the interval on every refresh).
  const isFinalRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load(isInitial) {
      if (isInitial) setIsLoading(true);
      try {
        const data = await fetchMyOrder(orderNumber);
        if (cancelled) return;
        setOrder(data);
        setLastUpdated(new Date());
        isFinalRef.current = ["delivered", "cancelled"].includes(data.status);
      } catch (err) {
        if (!cancelled && isInitial) setError(err.response?.data?.message || "Couldn't load this order.");
      } finally {
        if (!cancelled && isInitial) setIsLoading(false);
      }
    }

    load(true);

    // Auto-refresh so the customer never has to reload the page. Stops once the
    // order reaches a final state - nothing left to poll for.
    const interval = setInterval(() => {
      if (!isFinalRef.current && document.visibilityState === "visible") {
        load(false);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [orderNumber]);

  if (isLoading) {
    return <div className="page-x max-w-3xl mx-auto py-12 text-sm text-ink/60">Loading your order...</div>;
  }

  if (error || !order) {
    return (
      <div className="page-x max-w-3xl mx-auto py-16 text-center">
        <p className="text-ink font-bold text-lg mb-2">{error || "Order not found"}</p>
        <Link to="/my-orders" className="text-brand-dark font-bold underline">
          Back to my orders
        </Link>
      </div>
    );
  }

  const isCancelled = order.status === "cancelled";
  const currentStepIndex = STATUS_STEPS.findIndex((s) => s.key === order.status);

  return (
    <div className="page-x max-w-3xl mx-auto py-8 md:py-12">
      <Link
        to="/my-orders"
        className="inline-flex items-center gap-1 text-sm font-semibold text-ink/60 hover:text-brand-dark mb-4"
      >
        <span className="material-symbols-outlined text-base">chevron_left</span>
        My Orders
      </Link>

      <div className="bg-white rounded border border-hairline p-5 mb-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="font-mono font-bold text-brand-dark">{order.orderNumber}</p>
            <p className="text-xs text-ink/50">Placed {formatDate(order.createdAt)}</p>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-surface text-ink">
            {PAYMENT_LABELS[order.paymentStatus] || order.paymentStatus}
          </span>
        </div>

        {isCancelled ? (
          <div className="rounded-sm bg-brand/10 border border-brand/30 text-brand text-sm px-4 py-3">
            This order was cancelled.
          </div>
        ) : (
          <div className="space-y-3">
            {STATUS_STEPS.map((step, index) => {
              const isDone = index <= currentStepIndex;
              const isCurrent = index === currentStepIndex;
              return (
                <div key={step.key} className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      isDone ? "bg-brand-dark text-surface" : "bg-surface text-ink/30"
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg">{step.icon}</span>
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${isDone ? "text-ink" : "text-ink/40"}`}>
                      {step.label}
                    </p>
                    {step.key === "out_for_delivery" && isDone && order.deliveryPersonName && (
                      <p className="text-xs text-ink/60">
                        <span className="font-semibold text-ink">{order.deliveryPersonName}</span> is on the way
                      </p>
                    )}
                    {isCurrent && <p className="text-xs text-brand-dark font-medium">Current status</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isCancelled && order.status !== "delivered" && (
          <p className="text-[11px] text-ink/40 mt-4 flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">autorenew</span>
            Updates automatically
            {lastUpdated && ` · last checked ${lastUpdated.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`}
          </p>
        )}
      </div>

      <div className="bg-white rounded border border-hairline p-5 mb-5">
        <h2 className="font-bold text-ink mb-3">Delivery</h2>
        <p className="text-sm font-semibold text-ink">{formatDate(order.deliveryDate)}</p>
        <p className="text-xs text-ink/60 mb-3">
          {formatWindow(order.deliveryStartTime, order.deliveryEndTime)}
        </p>
        <p className="text-sm text-ink/70">{order.deliveryAddress}</p>

        {order.deliveryPersonName && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-hairline">
            <span className="material-symbols-outlined text-base text-brand-dark">moped</span>
            <p className="text-sm text-ink/70">
              Delivered by <span className="font-semibold text-ink">{order.deliveryPersonName}</span>
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded border border-hairline p-5">
        <h2 className="font-bold text-ink mb-3">Items</h2>
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
          <span className="font-bold text-ink">Total</span>
          <span className="text-2xl font-bold text-ink">{formatRupees(order.total)}</span>
        </div>
      </div>

      <Link to="/shop" className="block text-center mt-5 text-sm font-bold text-brand-dark underline">
        Order again
      </Link>
    </div>
  );
}