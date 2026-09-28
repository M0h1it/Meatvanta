import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  fetchOrder,
  updateOrderStatus,
  cancelOrder,
  verifyPayment,
  setDeliveryCharge,
  assignDeliveryPerson,
} from "../api/ordersApi";
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

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const { hasPermission } = usePermission();
  const canUpdateStatus = hasPermission("orders:updateStatus");
  const canCancel = hasPermission("orders:cancel");
  const canViewCustomers = hasPermission("customers:view");

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
      await cancelOrder(order.id);
      await load();
      showSuccess("Order cancelled.");
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
    const input = prompt("Who is delivering this order?", order.deliveryPersonName || "");
    if (input === null) return;
    try {
      await assignDeliveryPerson(order.id, input);
      await load();
      showSuccess("Delivery person updated.");
    } catch (err) {
      showError(err.response?.data?.message || "Failed to assign delivery person.");
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-md">
        {/* Left: items + payment */}
        <div className="lg:col-span-2 space-y-md">
          <section className="print-card bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-3">Items</h2>
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
                    <td className="py-2 text-center text-on-surface font-medium">{item.quantity}</td>
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
              <div className="flex justify-between pt-2 border-t border-outline-variant">
                <span className="font-bold text-on-surface">Total</span>
                <span className="font-bold text-on-surface text-lg">₹{Number(order.total).toFixed(2)}</span>
              </div>
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
              {order.paymentVerifiedAt && (
                <div>
                  <p className="text-xs text-on-surface-variant">Verified at</p>
                  <p className="text-on-surface">{formatDateTime(order.paymentVerifiedAt)}</p>
                </div>
              )}
            </div>

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
              <p className="text-sm text-on-surface-variant mt-3 pt-3 border-t border-outline-variant">
                {order.deliveryAddress}
              </p>
            )}

            <div className="mt-3 pt-3 border-t border-outline-variant">
              <p className="text-xs text-on-surface-variant">Delivery person</p>
              <p className="text-sm text-on-surface font-medium">
                {order.deliveryPersonName || "Not assigned"}
              </p>
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

              {canUpdateStatus && !["delivered", "cancelled"].includes(order.status) && (
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
    </div>
  );
}
