import { pickRider } from "../../delivery/lib/pickRider";
import { retryDelivery, cancelFailedDelivery } from "../../delivery/api/deliveryApi";
import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  fetchOrder,
  updateOrderStatus,
  cancelOrder,
  verifyPayment,
  setDeliveryCharge,
  assignRider,
  markItemsUnavailable,
} from "../api/ordersApi";
import Modal from "../../../components/common/Modal";
import { usePermission } from "../../../hooks/usePermission";
import { showSuccess, showError, showConfirm } from "../../../lib/sweetAlert";

const STATUS_LABELS = {
  placed: "Placed",
  preparing: "Preparing",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const ALLOWED_TRANSITIONS = {
  placed: ["preparing"],
  preparing: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
};

const STATUS_BADGE_STYLE = {
  placed: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  preparing: "bg-secondary-fixed text-on-secondary-fixed-variant",
  out_for_delivery: "bg-secondary-fixed text-on-secondary-fixed-variant",
  delivered: "bg-secondary-fixed text-on-secondary-fixed-variant",
  cancelled: "bg-error-container text-on-error-container",
};

const PAYMENT_STATUS_LABELS = {
  unpaid: "Unpaid (COD)",
  submitted: "Payment submitted",
  verified: "Payment verified",
  rejected: "Payment rejected",
  pending: "Awaiting payment",
  paid: "Paid",
  failed: "Payment failed",
};

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDeliveryDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

const PAYMENT_METHOD_LABELS = {
  cod: "Cash on delivery (COD)",
  razorpay: "Online (Razorpay)",
  upi: "UPI (manual)",
  wallet: "Customer wallet",
};

function formatTimeOnly(value) {
  return new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

/** "1 h 20 min" / "45 min" between two moments. */
function formatDuration(fromValue, toValue) {
  const mins = Math.max(0, Math.round((new Date(toValue) - new Date(fromValue)) / 60000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

/** What was ordered vs what will be sent (older orders have no orderedQuantity). */
function orderedOf(item) {
  return item.orderedQuantity ?? item.quantity;
}

const money = (n) => `₹${Number(n).toFixed(0)}`;

/**
 * Preview of what "Item not available" will do, so the owner sees the money before
 * confirming. The server works the real numbers out again - this is only for display.
 */
function previewAdjustment(order, qtyByItem) {
  let removed = 0;
  let stillSending = false;
  for (const item of order.items) {
    const available = qtyByItem[item.id] ?? item.quantity;
    removed += (Number(item.unitPrice) + Number(item.optionsTotal || 0)) * (item.quantity - available);
    if (available > 0) stillSending = true;
  }
  const paidOnline =
    (order.paymentMethod === "razorpay" && order.paymentStatus === "paid") ||
    (order.paymentMethod === "upi" && order.paymentStatus === "verified");
  const alreadyCredited = Number(order.walletCredited || 0);
  const paidSoFar = paidOnline ? Number(order.total) + alreadyCredited : Number(order.walletUsed || 0);
  const newUnavailable = Number(order.unavailableAmount || 0) + removed;
  const newTotal = Math.max(
    0,
    Number(order.subtotal) - newUnavailable + Number(order.deliveryCharge) - Number(order.discount)
  );
  if (!stillSending) {
    return { removed, cancelled: true, credit: Math.max(0, paidSoFar - alreadyCredited), newTotal: Number(order.total) };
  }
  return { removed, cancelled: false, credit: Math.max(0, Math.max(0, paidSoFar - newTotal) - alreadyCredited), newTotal };
}

function TimelineRow({ icon, label, time, detail, done }) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={`material-symbols-outlined text-lg mt-0.5 ${done ? "text-primary" : "text-on-surface-variant/40"}`}
        style={done ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        {icon}
      </span>
      <div className="text-sm">
        <p className={done ? "text-on-surface font-medium" : "text-on-surface-variant/60"}>
          {label}
          {done && time && <span className="text-on-surface-variant font-normal"> · {formatDateTime(time)}</span>}
        </p>
        {done && detail && <p className="text-xs text-on-surface-variant">{detail}</p>}
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const { hasPermission } = usePermission();
  const canUpdateStatus = hasPermission("orders:updateStatus");
  const canAssignRider = canUpdateStatus || hasPermission("delivery:assign");
  const canCancel = hasPermission("orders:cancel");
  const canSettleCash = hasPermission("delivery:settle");
  const canViewCustomers = hasPermission("customers:view");
  const canAdjustItems = hasPermission("orders:adjustItems");

  // "Item not available" dialog: itemId -> quantity that can still be sent.
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustQty, setAdjustQty] = useState({});
  const [isAdjusting, setIsAdjusting] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrder(await fetchOrder(Number(id)));
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't load this order.");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStatusChange(nextStatus) {
    try {
      await updateOrderStatus(order.id, nextStatus);
      await load();
      showSuccess(`Order marked ${STATUS_LABELS[nextStatus]}.`);
    } catch (err) {
      showError(err.response?.data?.message || "Failed to update status.");
    }
  }

  async function handleCancel() {
    const confirmed = await showConfirm({
      title: `Cancel order ${order.orderNumber}?`,
      text: "This cannot be undone.",
      confirmButtonText: "Cancel Order",
    });
    if (!confirmed) return;
    try {
      const cancelled = await cancelOrder(order.id);
      await load();
      const credited = Number(cancelled?.walletCredited || 0);
      showSuccess(
        credited > 0 ? `Order cancelled. Rs.${credited.toFixed(0)} was added to the customer's wallet.` : "Order cancelled."
      );
    } catch (err) {
      showError(err.response?.data?.message || "Failed to cancel order.");
    }
  }

  async function handleVerifyPayment(paymentStatus) {
    if (paymentStatus === "rejected") {
      const confirmed = await showConfirm({
        title: "Reject this payment?",
        text: "The customer will see that their payment wasn't confirmed.",
        confirmButtonText: "Reject Payment",
      });
      if (!confirmed) return;
    }
    try {
      await verifyPayment(order.id, paymentStatus);
      await load();
      showSuccess(paymentStatus === "verified" ? "Payment verified." : "Payment rejected.");
    } catch (err) {
      showError(err.response?.data?.message || "Failed to update payment.");
    }
  }

  async function handleSetDeliveryCharge() {
    const input = prompt(`Delivery charge for ${order.orderNumber} (Rs.):`, Number(order.deliveryCharge) || "");
    if (input === null) return;
    const charge = Number(input);
    if (Number.isNaN(charge) || charge < 0) {
      showError("Please enter a valid amount.");
      return;
    }
    try {
      await setDeliveryCharge(order.id, charge);
      await load();
      showSuccess("Delivery charge updated.");
    } catch (err) {
      showError(err.response?.data?.message || "Failed to set delivery charge.");
    }
  }

  async function handleAssignDeliveryPerson() {
    const { chosen, riderId } = await pickRider({
      title: "Who is delivering this order?",
      currentRiderId: order.deliveryAdminId,
    });
    if (!chosen) return;
    try {
      await assignRider(order.id, riderId);
      await load();
      showSuccess("Delivery person updated.");
    } catch (err) {
      showError(err.response?.data?.message || "Failed to assign delivery person.");
    }
  }

  // Rider said "could not deliver" and the order is still waiting for the owner's decision.
  const deliveryFailed = Boolean(order && order.status === "out_for_delivery" && order.deliveryFailedReason);

  async function handleRetrySameRider() {
    const ok = await showConfirm({
      title: `Send ${order.orderNumber} again?`,
      text: `${order.deliveryPersonName} will be told to try this delivery once more.`,
      confirmButtonText: "Send again",
    });
    if (!ok) return;
    try {
      await retryDelivery(order.id);
      await load();
      showSuccess("The rider has been asked to try again.");
    } catch (err) {
      showError(err.response?.data?.message || "Couldn't send it again.");
    }
  }

  async function handleRetryOtherRider() {
    const { chosen, riderId } = await pickRider({
      title: "Send this order with which rider?",
      currentRiderId: order.deliveryAdminId,
    });
    if (!chosen) return;
    if (!riderId) {
      showError("Please pick a rider.");
      return;
    }
    try {
      await retryDelivery(order.id, riderId);
      await load();
      showSuccess("Order handed to the new rider - it is ready for pickup.");
    } catch (err) {
      showError(err.response?.data?.message || "Couldn't reassign the order.");
    }
  }

  async function handleCancelFailed() {
    const ok = await showConfirm({
      title: `Cancel ${order.orderNumber}?`,
      text: "The delivery could not be made. This cannot be undone.",
      confirmButtonText: "Cancel Order",
    });
    if (!ok) return;
    try {
      const result = await cancelFailedDelivery(order.id);
      await load();
      if (result.refundNeeded) {
        // Only when the order has no usable phone number, so the wallet could not be credited.
        showError(`Order cancelled, but the customer's phone number is not valid for a wallet. Refund Rs.${Number(result.creditSkipped).toFixed(0)} manually.`);
      } else {
        showSuccess(
          result.walletCredited > 0
            ? `Order cancelled. Rs.${Number(result.walletCredited).toFixed(0)} was added to the customer's wallet.`
            : "Order cancelled."
        );
      }
    } catch (err) {
      showError(err.response?.data?.message || "Failed to cancel order.");
    }
  }

  function openAdjustDialog() {
    const start = {};
    order.items.forEach((item) => {
      start[item.id] = item.quantity;
    });
    setAdjustQty(start);
    setAdjustOpen(true);
  }

  async function handleAdjustSubmit() {
    const changes = order.items
      .filter((item) => (adjustQty[item.id] ?? item.quantity) !== item.quantity)
      .map((item) => ({ itemId: item.id, availableQuantity: adjustQty[item.id] }));
    if (changes.length === 0) {
      showError("Lower the quantity of at least one item.");
      return;
    }
    const preview = previewAdjustment(order, adjustQty);
    const ok = await showConfirm({
      title: preview.cancelled ? "Cancel this order?" : "Confirm unavailable items?",
      text: preview.cancelled
        ? `Nothing is left to send, so the order will be cancelled${preview.credit > 0 ? ` and ${money(preview.credit)} goes to the customer's wallet` : ""}.`
        : `New total ${money(preview.newTotal)}${preview.credit > 0 ? `. ${money(preview.credit)} will be added to the customer's wallet` : ""}. This cannot be undone.`,
      confirmButtonText: "Yes, confirm",
    });
    if (!ok) return;

    setIsAdjusting(true);
    try {
      const result = await markItemsUnavailable(order.id, changes);
      setAdjustOpen(false);
      await load();
      showSuccess(result.message || "Order updated.");
    } catch (err) {
      showError(err.response?.data?.message || "Couldn't update the order.");
    } finally {
      setIsAdjusting(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-on-surface-variant">Loading order...</p>;
  }

  if (error || !order) {
    return (
      <div>
        <p className="text-on-surface font-semibold mb-2">{error || "Order not found."}</p>
        <Link to="/orders" className="text-primary underline text-sm">
          Back to orders
        </Link>
      </div>
    );
  }

  const nextStatuses = ALLOWED_TRANSITIONS[order.status] || [];
  // Legacy manual-UPI phone orders only - the customer-facing checkout no
  // longer creates orders in "submitted" state (see Razorpay integration).
  const isUpiAwaitingReview = order.paymentMethod === "upi" && order.paymentStatus === "submitted";
  const isRazorpayOrder = order.paymentMethod === "razorpay";

  return (
    <div className="print-full-width">
      <div className="no-print mb-lg">
        <button
          onClick={() => navigate("/orders")}
          className="inline-flex items-center gap-1 text-sm font-semibold text-on-surface-variant hover:text-primary mb-3"
        >
          <span className="material-symbols-outlined text-base">chevron_left</span>
          All Orders
        </button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-headline-md text-headline-md text-on-surface">{order.orderNumber}</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">
              Placed {formatDateTime(order.createdAt)}
              {order.createdByAdmin && ` · entered by ${order.createdByAdmin.name}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${STATUS_BADGE_STYLE[order.status]}`}>
              {STATUS_LABELS[order.status]}
            </span>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border border-outline-variant text-on-surface hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-lg">print</span>
              Print
            </button>
          </div>
        </div>
      </div>

      {/* Print-only header - the screen version above is hidden when printing */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-bold">Meat Vanta</h1>
        <p className="text-sm">
          Order {order.orderNumber} · {formatDateTime(order.createdAt)}
        </p>
      </div>

      {isUpiAwaitingReview && (
        <div className="no-print mb-lg rounded-lg bg-tertiary-fixed border border-outline-variant p-md">
          <p className="font-medium text-on-surface text-sm mb-2">
            This UPI payment needs your confirmation before the order is prepared.
          </p>
          {canUpdateStatus && (
            <div className="flex gap-2">
              <button
                onClick={() => handleVerifyPayment("verified")}
                className="text-sm px-4 py-2 rounded bg-primary-container text-on-primary hover:opacity-90"
              >
                Verify Payment
              </button>
              <button
                onClick={() => handleVerifyPayment("rejected")}
                className="text-sm px-4 py-2 rounded border border-outline-variant text-error hover:bg-error-container"
              >
                Reject Payment
              </button>
            </div>
          )}
        </div>
      )}

      {isRazorpayOrder && order.paymentStatus === "pending" && (
        <div className="no-print mb-lg rounded-lg bg-tertiary-fixed border border-outline-variant p-md">
          <p className="font-medium text-on-surface text-sm">
            Waiting on payment - the customer hasn't completed checkout with Razorpay yet.
            This order won't need any action from you unless it stays pending for a while.
          </p>
        </div>
      )}

      {isRazorpayOrder && order.paymentStatus === "failed" && (
        <div className="no-print mb-lg rounded-lg bg-error-container border border-outline-variant p-md">
          <p className="font-medium text-on-error-container text-sm">
            The customer's Razorpay payment failed or couldn't be verified. They may retry from their end,
            or you can follow up directly.
          </p>
        </div>
      )}

      {deliveryFailed && (
        <div className="no-print mb-lg rounded-lg bg-error-container border border-error p-md">
          <p className="font-semibold text-on-error-container text-sm">
            Delivery failed{order.deliveryAttempts > 1 ? ` (attempt ${order.deliveryAttempts})` : ""}
            {order.deliveryFailedAt ? ` at ${formatTimeOnly(order.deliveryFailedAt)}` : ""}
          </p>
          <p className="text-sm text-on-error-container mt-0.5">
            {order.deliveryPersonName} reported: "{order.deliveryFailedReason}". Call the customer, then decide:
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {canAssignRider && (
              <button
                onClick={handleRetrySameRider}
                className="text-sm px-4 py-2 rounded bg-primary-container text-on-primary hover:opacity-90"
              >
                Send again ({order.deliveryPersonName})
              </button>
            )}
            {canAssignRider && (
              <button
                onClick={handleRetryOtherRider}
                className="text-sm px-4 py-2 rounded border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low"
              >
                Send with another rider
              </button>
            )}
            {canCancel && (
              <button
                onClick={handleCancelFailed}
                className="text-sm px-4 py-2 rounded border border-error text-error bg-surface-container-lowest hover:bg-error-container"
              >
                Cancel order
              </button>
            )}
          </div>
          {order.paymentMethod === "razorpay" && order.paymentStatus === "paid" && (
            <p className="text-xs text-on-error-container mt-2">
              The customer already paid online - if you cancel, the full amount goes to their wallet.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-md">
        {/* Left: items + payment */}
        <div className="lg:col-span-2 space-y-md">
          <section className="print-card bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Items</h2>
              {canAdjustItems && ["placed", "preparing"].includes(order.status) && (
                <button
                  onClick={openAdjustDialog}
                  className="no-print inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded border border-outline-variant text-on-surface hover:bg-surface-container-low"
                >
                  <span className="material-symbols-outlined text-base">remove_shopping_cart</span>
                  Item not available?
                </button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="text-on-surface-variant">
                <tr className="border-b border-outline-variant">
                  <th className="text-left pb-2 font-label-bold text-label-bold">Item</th>
                  <th className="text-center pb-2 font-label-bold text-label-bold">Qty</th>
                  <th className="text-right pb-2 font-label-bold text-label-bold">Price</th>
                  <th className="text-right pb-2 font-label-bold text-label-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b border-outline-variant last:border-b-0">
                    <td className="py-2 text-on-surface">
                      {item.productName}
                      <span className="block text-xs text-on-surface-variant">{item.variantLabel}</span>
                      {item.selectedOptions?.length > 0 && (
                        <span className="block text-xs text-primary font-medium">
                          {item.selectedOptions
                            .map((o) => (o.extraPrice > 0 ? `${o.optionName} (+₹${o.extraPrice})` : o.optionName))
                            .join(", ")}
                        </span>
                      )}
                      {item.comboItems?.length > 0 && (
                        <ul className="mt-1 text-xs text-on-surface-variant list-disc list-inside">
                          {item.comboItems.map((c, i) => (
                            <li key={i}>
                              {c.productName} - {c.variantLabel} × {c.quantity * item.quantity}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="py-2 text-center text-on-surface font-medium">
                      {orderedOf(item) > item.quantity ? (
                        <>
                          <span>{item.quantity}</span>
                          <span className="block text-xs font-normal text-error">
                            of {orderedOf(item)} (
                            {order.status === "cancelled" || item.quantity === 0 ? "not sent" : `${orderedOf(item) - item.quantity} not available`})
                          </span>
                        </>
                      ) : (
                        item.quantity
                      )}
                    </td>
                    <td className="py-2 text-right text-on-surface-variant">
                      ₹{(Number(item.unitPrice) + Number(item.optionsTotal || 0)).toFixed(2)}
                    </td>
                    <td className="py-2 text-right text-on-surface font-medium">
                      ₹{Number(item.lineTotal).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 pt-3 border-t border-outline-variant space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Subtotal</span>
                <span className="text-on-surface">₹{Number(order.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Delivery</span>
                {order.freeDelivery ? (
                  <span className="text-on-surface">Free (coupon)</span>
                ) : order.deliveryChargeStatus === "pending" ? (
                  <span className="text-error font-medium">Not set</span>
                ) : (
                  <span className="text-on-surface">₹{Number(order.deliveryCharge).toFixed(2)}</span>
                )}
              </div>
              {Number(order.discount) > 0 && (
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">
                    Discount
                    {order.couponCode && <span className="ml-1 font-mono text-xs">({order.couponCode})</span>}
                  </span>
                  <span className="text-on-surface">−₹{Number(order.discount).toFixed(2)}</span>
                </div>
              )}
              {order.couponCode && Number(order.discount) === 0 && (
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Coupon</span>
                  <span className="font-mono text-xs text-on-surface">{order.couponCode}</span>
                </div>
              )}
              {Number(order.unavailableAmount) > 0 && order.status !== "cancelled" && (
                <div className="flex justify-between">
                  <span className="text-error">Items not available</span>
                  <span className="text-error">−₹{Number(order.unavailableAmount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-outline-variant">
                <span className="font-bold text-on-surface">Total</span>
                <span className="font-bold text-on-surface text-lg">₹{Number(order.total).toFixed(2)}</span>
              </div>
              {Number(order.walletCredited) > 0 && (
                <div className="flex justify-between text-primary">
                  <span>Credited to customer's wallet</span>
                  <span className="font-semibold">₹{Number(order.walletCredited).toFixed(2)}</span>
                </div>
              )}
            </div>
          </section>

          <section className="print-card bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-3">Payment</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-on-surface-variant">Method</p>
                <p className="text-on-surface font-medium">{order.paymentMethod.toUpperCase()}</p>
              </div>
              <div>
                <p className="text-xs text-on-surface-variant">Status</p>
                <p className="text-on-surface font-medium">
                  {PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus}
                </p>
              </div>
              <div>
                <p className="text-xs text-on-surface-variant">Amount</p>
                <p className="text-on-surface font-medium">₹{Number(order.total).toFixed(2)}</p>
              </div>
              {Number(order.walletUsed) > 0 && (
                <div>
                  <p className="text-xs text-on-surface-variant">
                    {order.paymentMethod === "cod" && order.paymentNote ? "Paid up front" : "Paid from wallet"}
                  </p>
                  <p className="text-on-surface font-medium">₹{Number(order.walletUsed).toFixed(2)}</p>
                </div>
              )}
              {order.paymentVerifiedAt && (
                <div>
                  <p className="text-xs text-on-surface-variant">
                    {order.paymentMethod === "cod" ? "Cash collected at" : "Paid at"}
                  </p>
                  <p className="text-on-surface">{formatDateTime(order.paymentVerifiedAt)}</p>
                </div>
              )}
            </div>

            {/* One plain sentence: how it was paid and who has the money. */}
            <p className="mt-3 pt-3 border-t border-outline-variant text-sm text-on-surface">
              {order.paymentMethod === "cod" && order.paymentStatus === "paid" && (
                <>
                  <span className="font-semibold">₹{Math.max(0, Number(order.total) - Number(order.walletUsed || 0)).toFixed(0)} cash collected</span>
                  {order.deliveryPersonName ? ` by ${order.deliveryPersonName}` : " on delivery"}
                  {order.paymentVerifiedAt ? ` at ${formatTimeOnly(order.paymentVerifiedAt)}` : ""}.{" "}
                  {order.deliveryAdminId &&
                    (order.cashSettledAt ? (
                      <span className="text-on-surface-variant">
                        Handed over to the shop on {formatDateTime(order.cashSettledAt)}
                        {order.cashSettledByName && order.cashSettledByName !== "Before cash tracking"
                          ? ` (received by ${order.cashSettledByName})`
                          : ""}
                        .
                      </span>
                    ) : (
                      <span className="text-error font-semibold">
                        Cash is still with the rider{canSettleCash ? " - settle it in Rider Cash." : "."}
                      </span>
                    ))}
                </>
              )}
              {order.paymentMethod === "cod" && order.paymentStatus !== "paid" && (
                <>
                  {order.status === "cancelled"
                    ? "Cancelled - nothing to collect."
                    : `₹${Math.max(0, Number(order.total) - Number(order.walletUsed || 0)).toFixed(0)} to be collected in cash at the door${
                        Number(order.walletUsed) > 0 ? ` (₹${Number(order.walletUsed).toFixed(0)} already paid)` : ""
                      }.`}
                </>
              )}
              {order.paymentMethod === "wallet" && (
                <>Paid from the customer's wallet - nothing to collect at the door.</>
              )}
              {order.paymentMethod === "razorpay" && order.paymentStatus === "paid" && (
                <>Paid online - nothing to collect from the customer at the door.</>
              )}
              {order.paymentMethod === "razorpay" && order.paymentStatus !== "paid" && <>Online payment is not completed yet.</>}
              {order.paymentMethod === "upi" && (
                <>
                  {order.paymentStatus === "verified"
                    ? "UPI payment verified by the shop."
                    : `UPI payment: ${PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus}.`}
                </>
              )}
            </p>

            {isRazorpayOrder && (order.razorpayOrderId || order.razorpayPaymentId) && (
              <div className="mt-3 pt-3 border-t border-outline-variant">
                <p className="text-xs font-semibold text-on-surface mb-1">Razorpay reference</p>
                {order.razorpayOrderId && (
                  <p className="text-sm text-on-surface-variant">
                    Order ID: <span className="font-mono">{order.razorpayOrderId}</span>
                  </p>
                )}
                {order.razorpayPaymentId && (
                  <p className="text-sm text-on-surface-variant">
                    Payment ID: <span className="font-mono">{order.razorpayPaymentId}</span>
                  </p>
                )}
              </div>
            )}

            {/* Legacy manual-UPI proof, still shown for old phone orders that carry it. */}
            {(order.upiTransactionId || order.upiReceiptText) && (
              <div className="mt-3 pt-3 border-t border-outline-variant">
                <p className="text-xs font-semibold text-on-surface mb-1">Customer payment proof</p>
                {order.upiTransactionId && (
                  <p className="text-sm text-on-surface-variant">
                    UTR: <span className="font-mono">{order.upiTransactionId}</span>
                  </p>
                )}
                {order.upiReceiptText && (
                  <pre className="text-xs text-on-surface-variant whitespace-pre-wrap mt-1 font-sans">
                    {order.upiReceiptText}
                  </pre>
                )}
              </div>
            )}
          </section>

          {order.notes && (
            <section className="print-card bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
              <h2 className="font-headline-sm text-headline-sm text-on-surface mb-2">Customer Note</h2>
              <p className="text-sm text-on-surface-variant italic">{order.notes}</p>
            </section>
          )}
        </div>

        {/* Right: customer, delivery, actions */}
        <div className="space-y-md">
          <section className="print-card bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-3">Customer</h2>
            <p className="text-on-surface font-medium">{order.customerName}</p>
            <a
              href={`tel:${order.customerPhone}`}
              className="text-sm text-primary hover:underline block mt-0.5"
            >
              {order.customerPhone}
            </a>
            {order.customerId && canViewCustomers && (
              <Link
                to={`/customers/${order.customerId}`}
                className="no-print inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
              >
                View customer history
                <span className="material-symbols-outlined text-sm">chevron_right</span>
              </Link>
            )}
            {!order.customerId && (
              <p className="text-xs text-on-surface-variant mt-2">
                Phone order — no customer account.
              </p>
            )}
          </section>

          <section className="print-card bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-3">Delivery</h2>
            {order.deliveryDate ? (
              <>
                <p className="text-on-surface font-medium">{formatDeliveryDate(order.deliveryDate)}</p>
                <p className="text-sm text-on-surface-variant">
                  {order.deliveryStartTime}–{order.deliveryEndTime}
                </p>
              </>
            ) : (
              <p className="text-sm text-on-surface-variant">No delivery date on this order.</p>
            )}

            {order.deliveryAddress && (
              <div className="mt-3 pt-3 border-t border-outline-variant">
                <p className="text-sm text-on-surface-variant">{order.deliveryAddress}</p>
                {order.mapUrl && (
                  <a
                    href={order.mapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="no-print inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline mt-2"
                  >
                    <span className="material-symbols-outlined text-lg">location_on</span>
                    Open in Maps
                    <span className="text-xs font-normal text-on-surface-variant">
                      ({order.hasPin ? "customer's exact pin" : "found from address text - no pin"})
                    </span>
                  </a>
                )}
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-outline-variant">
              <p className="text-xs text-on-surface-variant mb-2">Delivery person</p>
              <p className="text-sm text-on-surface font-medium mb-3">
                {order.deliveryPersonName || "Not assigned"}
                {order.deliveryPersonPhone && (
                  <a href={`tel:${order.deliveryPersonPhone}`} className="text-primary font-normal hover:underline">
                    {" "}
                    · {order.deliveryPersonPhone}
                  </a>
                )}
              </p>

              <div className="space-y-2">
                <TimelineRow icon="receipt_long" label="Order placed" time={order.createdAt} done />
                <TimelineRow
                  icon="person_add"
                  label="Rider assigned"
                  time={order.deliveryAssignedAt}
                  detail={order.deliveryPersonName}
                  done={Boolean(order.deliveryAssignedAt)}
                />
                <TimelineRow
                  icon="package_2"
                  label="Picked up from shop"
                  time={order.pickedUpAt}
                  detail={order.deliveryPersonName ? `by ${order.deliveryPersonName}` : null}
                  done={Boolean(order.pickedUpAt)}
                />
                <TimelineRow
                  icon="check_circle"
                  label="Delivered"
                  time={order.deliveredAt}
                  done={order.status === "delivered" && Boolean(order.deliveredAt)}
                  detail={
                    order.deliveredAt
                      ? [
                          order.deliveryPersonName ? `by ${order.deliveryPersonName}` : "marked by the shop",
                          `${formatDuration(order.createdAt, order.deliveredAt)} after ordering`,
                          order.dueBy ? (new Date(order.deliveredAt) <= new Date(order.dueBy) ? "on time" : "late") : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : null
                  }
                />
              </div>

              {order.deliveryFailedReason && (
                <p className="text-xs text-error mt-2">Rider reported: {order.deliveryFailedReason}</p>
              )}
              {order.dueBy && !["delivered", "cancelled"].includes(order.status) && (
                <p
                  className={`text-xs mt-2 ${
                    new Date(order.dueBy).getTime() < Date.now() ? "text-error font-semibold" : "text-on-surface-variant"
                  }`}
                >
                  Due by {formatTimeOnly(order.dueBy)}
                  {new Date(order.dueBy).getTime() < Date.now() && " (overdue)"}
                </p>
              )}
            </div>
          </section>

          {/* Actions - never printed */}
          <section className="no-print bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-3">Actions</h2>
            <div className="flex flex-col gap-2">
              {canUpdateStatus &&
                nextStatuses.map((next) => (
                  <button
                    key={next}
                    onClick={() => handleStatusChange(next)}
                    className="w-full text-sm px-4 py-2 rounded bg-primary-container text-on-primary hover:opacity-90"
                  >
                    Mark {STATUS_LABELS[next]}
                  </button>
                ))}

              {canUpdateStatus && order.deliveryChargeStatus === "pending" && (
                <button
                  onClick={handleSetDeliveryCharge}
                  className="w-full text-sm px-4 py-2 rounded border border-outline-variant text-primary hover:bg-surface-container-low"
                >
                  Set Delivery Charge
                </button>
              )}

              {canAssignRider && !["delivered", "cancelled"].includes(order.status) && (
                <button
                  onClick={handleAssignDeliveryPerson}
                  className="w-full text-sm px-4 py-2 rounded border border-outline-variant text-on-surface hover:bg-surface-container-low"
                >
                  {order.deliveryPersonName ? "Change Delivery Boy" : "Assign Delivery Boy"}
                </button>
              )}

              {canCancel && !["delivered", "cancelled"].includes(order.status) && (
                <button
                  onClick={handleCancel}
                  className="w-full text-sm px-4 py-2 rounded border border-outline-variant text-error hover:bg-error-container"
                >
                  Cancel Order
                </button>
              )}

              {["delivered", "cancelled"].includes(order.status) && (
                <p className="text-sm text-on-surface-variant">
                  This order is {STATUS_LABELS[order.status].toLowerCase()} — no further actions.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Item not available: how many of each can still be sent */}
      <Modal isOpen={adjustOpen} onClose={() => !isAdjusting && setAdjustOpen(false)} title="Item not available?" maxWidth="max-w-xl">
        <p className="text-sm text-on-surface-variant mb-3">
          Set how many of each item you can still send. The rest is taken off the bill
          {order.paymentStatus === "paid" || order.paymentStatus === "verified"
            ? " and added to the customer's wallet."
            : " - the customer pays less on delivery."}
        </p>
        <ul className="divide-y divide-outline-variant border border-outline-variant rounded">
          {order.items.map((item) => {
            const max = item.quantity;
            const value = adjustQty[item.id] ?? max;
            return (
              <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-on-surface truncate">{item.productName}</p>
                  <p className="text-xs text-on-surface-variant">
                    {item.variantLabel} · {money(Number(item.unitPrice) + Number(item.optionsTotal || 0))} each · ordered {orderedOf(item)}
                    {orderedOf(item) > max ? ` (now ${max})` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={value <= 0 || isAdjusting}
                    onClick={() => setAdjustQty((q) => ({ ...q, [item.id]: Math.max(0, value - 1) }))}
                    className="w-8 h-8 rounded border border-outline-variant text-on-surface disabled:opacity-40"
                    aria-label="Send one less"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-semibold text-on-surface">{value}</span>
                  <button
                    type="button"
                    disabled={value >= max || isAdjusting}
                    onClick={() => setAdjustQty((q) => ({ ...q, [item.id]: Math.min(max, value + 1) }))}
                    className="w-8 h-8 rounded border border-outline-variant text-on-surface disabled:opacity-40"
                    aria-label="Send one more"
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {(() => {
          const p = previewAdjustment(order, adjustQty);
          if (p.removed <= 0) return null;
          return (
            <div className="mt-3 rounded bg-surface-container px-3 py-2 text-sm text-on-surface">
              {p.cancelled ? (
                <>Nothing left to send - the order will be <strong>cancelled</strong>{p.credit > 0 && <>, {money(p.credit)} to the wallet</>}.</>
              ) : (
                <>
                  Removed {money(p.removed)} · new total <strong>{money(p.newTotal)}</strong>
                  {p.credit > 0 && <> · <strong>{money(p.credit)}</strong> to the customer's wallet</>}
                </>
              )}
              {Number(order.discount) > 0 && (
                <p className="text-xs text-on-surface-variant mt-1">The coupon discount stays as it was.</p>
              )}
            </div>
          );
        })()}

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={() => setAdjustOpen(false)}
            disabled={isAdjusting}
            className="text-sm px-4 py-2 rounded border border-outline-variant text-on-surface hover:bg-surface-container-low disabled:opacity-60"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleAdjustSubmit}
            disabled={isAdjusting}
            className="text-sm px-4 py-2 rounded bg-primary-container text-on-primary hover:opacity-90 disabled:opacity-60"
          >
            {isAdjusting ? "Saving..." : "Save"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
