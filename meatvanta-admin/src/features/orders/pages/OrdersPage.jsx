import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchOrders,
  fetchOrder,
  createOrder,
  updateOrderStatus,
  cancelOrder,
  verifyPayment,
  setDeliveryCharge,
  assignDeliveryPerson,
} from "../api/ordersApi";
import { fetchProducts } from "../../products/api/productsApi";
import { usePermission } from "../../../hooks/usePermission";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import Modal from "../../../components/common/Modal";
import { showSuccess, showError, showConfirm } from "../../../lib/sweetAlert";

const STATUS_LABELS = {
  placed: "Placed",
  preparing: "Preparing",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// Mirrors the backend's ALLOWED_TRANSITIONS - for UI purposes only (which
// buttons to show). The backend re-validates every transition regardless.
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

const PAYMENT_BADGE_STYLE = {
  unpaid: "bg-surface-container text-on-surface-variant",
  submitted: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  verified: "bg-secondary-fixed text-on-secondary-fixed-variant",
  rejected: "bg-error-container text-on-error-container",
  pending: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  paid: "bg-secondary-fixed text-on-secondary-fixed-variant",
  failed: "bg-error-container text-on-error-container",
};

function formatDeliveryDate(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

const EMPTY_ORDER_FORM = {
  customerName: "",
  customerPhone: "",
  deliveryAddress: "",
  paymentMethod: "cod",
  deliveryCharge: 0,
  discount: 0,
  notes: "",
  items: [], // { productVariantId, label, unitPrice, quantity }
};

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(null);
  const [pickerProductId, setPickerProductId] = useState("");
  const [pickerVariantId, setPickerVariantId] = useState("");
  const [pickerQty, setPickerQty] = useState(1);

  const { hasPermission } = usePermission();
  const canCreate = hasPermission("orders:create");
  const canUpdateStatus = hasPermission("orders:updateStatus");
  const canCancel = hasPermission("orders:cancel");

  async function loadOrders(currentPage, currentStatus, currentSearch = debouncedSearch) {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchOrders({
        status: currentStatus || undefined,
        search: currentSearch || undefined,
        page: currentPage,
      });
      setOrders(result.orders);
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load orders.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadOrders(page, statusFilter, debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, debouncedSearch]);

  // A new search should start from page 1, not page 4 of the previous results.
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  async function openCreateForm() {
    setForm(EMPTY_ORDER_FORM);
    if (products.length === 0) {
      try {
        const data = await fetchProducts({ includeInactive: false });
        setProducts(data);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load products.");
      }
    }
  }

  const pickerProduct = products.find((p) => p.id === Number(pickerProductId));
  const pickerVariants = pickerProduct ? pickerProduct.variants.filter((v) => v.isInStock) : [];

  function addItemToOrder() {
    if (!pickerVariantId || pickerQty < 1) return;
    const variant = pickerVariants.find((v) => v.id === Number(pickerVariantId));
    if (!variant) return;

    setForm({
      ...form,
      items: [
        ...form.items,
        {
          productVariantId: variant.id,
          label: `${pickerProduct.name} - ${variant.label}`,
          unitPrice: Number(variant.price),
          quantity: Number(pickerQty),
        },
      ],
    });
    setPickerVariantId("");
    setPickerQty(1);
  }

  function removeItem(index) {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  }

  const subtotal = form ? form.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0) : 0;
  const total = form ? Math.max(0, subtotal + Number(form.deliveryCharge || 0) - Number(form.discount || 0)) : 0;

  async function handleSaveOrder(e) {
    e.preventDefault();
    if (form.items.length === 0) {
      setError("Add at least one item to the order.");
      return;
    }
    try {
      await createOrder({
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        deliveryAddress: form.deliveryAddress || undefined,
        paymentMethod: form.paymentMethod,
        deliveryCharge: Number(form.deliveryCharge || 0),
        discount: Number(form.discount || 0),
        notes: form.notes || undefined,
        items: form.items.map((i) => ({ productVariantId: i.productVariantId, quantity: i.quantity })),
      });
      setForm(null);
      setError(null);
      loadOrders(1, statusFilter);
      setPage(1);
      showSuccess("Order created.");
    } catch (err) {
      const message = err.response?.data?.message || "Failed to create order.";
      setError(message);
      showError(message);
    }
  }

  async function handleStatusChange(order, nextStatus) {
    try {
      await updateOrderStatus(order.id, nextStatus);
      loadOrders(page, statusFilter);
      showSuccess(`Order marked ${STATUS_LABELS[nextStatus]}.`);
    } catch (err) {
      showError(err.response?.data?.message || "Failed to update status.");
    }
  }

  async function handleCancel(order) {
    const confirmed = await showConfirm({
      title: `Cancel order ${order.orderNumber}?`,
      text: "This cannot be undone.",
      confirmButtonText: "Cancel Order",
    });
    if (!confirmed) return;
    try {
      await cancelOrder(order.id);
      loadOrders(page, statusFilter);
      showSuccess("Order cancelled.");
    } catch (err) {
      showError(err.response?.data?.message || "Failed to cancel order.");
    }
  }

  async function handleVerifyPayment(order, paymentStatus) {
    if (paymentStatus === "rejected") {
      const confirmed = await showConfirm({
        title: `Reject payment for ${order.orderNumber}?`,
        text: "The customer will see that their payment wasn't confirmed.",
        confirmButtonText: "Reject Payment",
      });
      if (!confirmed) return;
    }
    try {
      await verifyPayment(order.id, paymentStatus);
      loadOrders(page, statusFilter);
      showSuccess(paymentStatus === "verified" ? "Payment verified." : "Payment rejected.");
    } catch (err) {
      showError(err.response?.data?.message || "Failed to update payment.");
    }
  }

  async function handleSetDeliveryCharge(order) {
    const input = prompt(`Delivery charge for ${order.orderNumber} (Rs.):`, Number(order.deliveryCharge) || "");
    if (input === null) return;
    const charge = Number(input);
    if (Number.isNaN(charge) || charge < 0) {
      showError("Please enter a valid amount.");
      return;
    }
    try {
      await setDeliveryCharge(order.id, charge);
      loadOrders(page, statusFilter);
      showSuccess("Delivery charge updated.");
    } catch (err) {
      showError(err.response?.data?.message || "Failed to set delivery charge.");
    }
  }

  async function handleAssignDeliveryPerson(order) {
    const input = prompt(`Who is delivering ${order.orderNumber}?`, order.deliveryPersonName || "");
    if (input === null) return;
    try {
      await assignDeliveryPerson(order.id, input);
      loadOrders(page, statusFilter);
      showSuccess("Delivery person updated.");
    } catch (err) {
      showError(err.response?.data?.message || "Failed to assign delivery person.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-lg">
        <h1 className="font-headline-md text-headline-md text-on-surface">Orders</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant">
              search
            </span>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Order no, name or phone..."
              className="w-60 text-sm rounded border border-outline-variant pl-9 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                aria-label="Clear search"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            )}
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="text-sm rounded border border-outline-variant px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {canCreate && (
            <button
              onClick={openCreateForm}
              className="flex items-center gap-1 bg-primary-container text-on-primary text-sm px-4 py-2 rounded hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              New Order
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-md rounded bg-error-container text-on-error-container text-sm px-3 py-2">{error}</div>
      )}

      <Modal
        isOpen={!!form}
        onClose={() => setForm(null)}
        title="Record a New Order"
        maxWidth="max-w-3xl"
      >
        {form && (
        <form
          onSubmit={handleSaveOrder}
          className="space-y-md"
        >
          <p className="text-xs text-on-surface-variant -mt-2">
            For phone/WhatsApp orders taken by staff. Prices are always recalculated from current catalogue prices.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div>
              <label className="block font-label-bold text-label-bold text-on-surface mb-1">Customer Name</label>
              <input
                required
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                className="w-full rounded border border-outline-variant px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block font-label-bold text-label-bold text-on-surface mb-1">Phone</label>
              <input
                required
                value={form.customerPhone}
                onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                className="w-full rounded border border-outline-variant px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block font-label-bold text-label-bold text-on-surface mb-1">
              Delivery Address <span className="text-on-surface-variant font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={form.deliveryAddress}
              onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })}
              className="w-full rounded border border-outline-variant px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <hr className="border-outline-variant" />

          <h3 className="font-label-bold text-label-bold text-on-surface">Items</h3>

          {form.items.length > 0 && (
            <div className="rounded-lg border border-outline-variant overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low text-on-surface">
                  <tr>
                    <th className="text-left px-3 py-2 font-label-bold text-label-bold">Item</th>
                    <th className="text-left px-3 py-2 font-label-bold text-label-bold">Qty</th>
                    <th className="text-left px-3 py-2 font-label-bold text-label-bold">Unit Price</th>
                    <th className="text-left px-3 py-2 font-label-bold text-label-bold">Line Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((item, index) => (
                    <tr key={index} className="border-t border-outline-variant">
                      <td className="px-3 py-2">{item.label}</td>
                      <td className="px-3 py-2">{item.quantity}</td>
                      <td className="px-3 py-2">₹{item.unitPrice}</td>
                      <td className="px-3 py-2">₹{(item.unitPrice * item.quantity).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => removeItem(index)} className="text-error">
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs text-on-surface-variant mb-1">Product</label>
              <select
                value={pickerProductId}
                onChange={(e) => {
                  setPickerProductId(e.target.value);
                  setPickerVariantId("");
                }}
                className="w-full rounded border border-outline-variant px-2 py-2 text-sm"
              >
                <option value="">Select product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs text-on-surface-variant mb-1">Variant</label>
              <select
                value={pickerVariantId}
                onChange={(e) => setPickerVariantId(e.target.value)}
                disabled={!pickerProduct}
                className="w-full rounded border border-outline-variant px-2 py-2 text-sm disabled:opacity-50"
              >
                <option value="">Select variant</option>
                {pickerVariants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label} - ₹{v.price}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-20">
              <label className="block text-xs text-on-surface-variant mb-1">Qty</label>
              <input
                type="number"
                min={1}
                value={pickerQty}
                onChange={(e) => setPickerQty(e.target.value)}
                className="w-full rounded border border-outline-variant px-2 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={addItemToOrder}
              disabled={!pickerVariantId}
              className="flex items-center gap-1 text-sm px-3 py-2 rounded border border-outline-variant text-on-surface hover:bg-surface-container-low disabled:opacity-50 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Add Item
            </button>
          </div>

          <hr className="border-outline-variant" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
            <div>
              <label className="block font-label-bold text-label-bold text-on-surface mb-1">Delivery Charge</label>
              <input
                type="number"
                min={0}
                value={form.deliveryCharge}
                onChange={(e) => setForm({ ...form, deliveryCharge: e.target.value })}
                className="w-full rounded border border-outline-variant px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block font-label-bold text-label-bold text-on-surface mb-1">Discount</label>
              <input
                type="number"
                min={0}
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: e.target.value })}
                className="w-full rounded border border-outline-variant px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block font-label-bold text-label-bold text-on-surface mb-1">Payment Method</label>
              <select
                value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                className="w-full rounded border border-outline-variant px-3 py-2 text-sm"
              >
                <option value="cod">Cash on Delivery</option>
                <option value="upi">UPI (customer pays directly)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-label-bold text-label-bold text-on-surface mb-1">
              Notes <span className="text-on-surface-variant font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full rounded border border-outline-variant px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-sm text-on-surface-variant">
              Subtotal ₹{subtotal.toFixed(2)} · <span className="font-semibold text-on-surface">Total ₹{total.toFixed(2)}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="text-sm px-4 py-2 rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
              >
                Cancel
              </button>
              <button type="submit" className="bg-primary-container text-on-primary text-sm px-5 py-2 rounded hover:opacity-90">
                Save Order
              </button>
            </div>
          </div>
        </form>
        )}
      </Modal>

      {isLoading ? (
        <p className="text-sm text-on-surface-variant">Loading...</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          {debouncedSearch ? `No orders match "${debouncedSearch}".` : "No orders yet."}
        </p>
      ) : (
        <>
          <div className="space-y-3">
            {orders.map((order) => {
              const nextStatuses = ALLOWED_TRANSITIONS[order.status] || [];
              return (
                <div key={order.id} className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-on-surface">
                        <Link to={`/orders/${order.id}`} className="text-primary hover:underline">
                          {order.orderNumber}
                        </Link>
                        <span className="text-on-surface-variant font-normal"> · {order.customerName}</span>
                      </p>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        {order.customerPhone} · placed {new Date(order.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_BADGE_STYLE[order.status]}`}>
                        {STATUS_LABELS[order.status]}
                      </span>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${PAYMENT_BADGE_STYLE[order.paymentStatus] || ""}`}>
                        {order.paymentMethod.toUpperCase()} · {PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus}
                      </span>
                    </div>
                  </div>

                  {/* Delivery info - only present on customer-placed orders */}
                  {order.deliveryDate && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">event</span>
                        {formatDeliveryDate(order.deliveryDate)}
                        {order.deliveryStartTime && ` · ${order.deliveryStartTime}–${order.deliveryEndTime}`}
                      </span>
                      {order.deliveryPersonName && (
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">moped</span>
                          {order.deliveryPersonName}
                        </span>
                      )}
                    </div>
                  )}

                  {order.deliveryAddress && (
                    <p className="mt-1.5 text-xs text-on-surface-variant">
                      <span className="material-symbols-outlined text-sm align-middle">location_on</span>{" "}
                      {order.deliveryAddress}
                    </p>
                  )}

                  <div className="mt-2 text-sm text-on-surface-variant">
                    {order.items
                      .map((i) => {
                        const opts = i.selectedOptions?.length
                          ? ` [${i.selectedOptions.map((s) => s.optionName).join(", ")}]`
                          : "";
                        const inside = i.comboItems?.length
                          ? ` {${i.comboItems.map((c) => `${c.quantity * i.quantity}x ${c.productName} ${c.variantLabel}`).join(" + ")}}`
                          : "";
                        return `${i.quantity}x ${i.productName} (${i.variantLabel})${opts}${inside}`;
                      })
                      .join(", ")}
                  </div>

                  {order.notes && (
                    <p className="mt-1.5 text-xs text-on-surface-variant italic">Note: {order.notes}</p>
                  )}

                  {/* UPI proof - raw text from the customer's app, read by a human */}
                  {order.paymentMethod === "upi" && (order.upiReceiptText || order.upiTransactionId) && (
                    <div className="mt-2 rounded border border-outline-variant bg-surface-container-low p-2">
                      <p className="text-xs font-semibold text-on-surface mb-1">Customer payment proof</p>
                      {order.upiTransactionId && (
                        <p className="text-xs text-on-surface-variant">UTR: <span className="font-mono">{order.upiTransactionId}</span></p>
                      )}
                      {order.upiReceiptText && (
                        <p className="text-xs text-on-surface-variant whitespace-pre-wrap mt-1">{order.upiReceiptText}</p>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-on-surface">₹{Number(order.total).toFixed(2)}</p>
                      <p className="text-xs text-on-surface-variant">
                        Items ₹{Number(order.subtotal).toFixed(2)} + delivery{" "}
                        {order.deliveryChargeStatus === "pending" ? (
                          <span className="text-error font-medium">not set</span>
                        ) : (
                          `₹${Number(order.deliveryCharge).toFixed(2)}`
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 justify-end">
                      <Link
                        to={`/orders/${order.id}`}
                        className="text-xs px-3 py-1.5 rounded border border-outline-variant text-on-surface hover:bg-surface-container-low"
                      >
                        View Details
                      </Link>

                      {canUpdateStatus && order.paymentMethod === "upi" && order.paymentStatus === "submitted" && (
                        <>
                          <button
                            onClick={() => handleVerifyPayment(order, "verified")}
                            className="text-xs px-3 py-1.5 rounded bg-primary-container text-on-primary hover:opacity-90"
                          >
                            Verify Payment
                          </button>
                          <button
                            onClick={() => handleVerifyPayment(order, "rejected")}
                            className="text-xs px-3 py-1.5 rounded border border-outline-variant text-error hover:bg-error-container"
                          >
                            Reject Payment
                          </button>
                        </>
                      )}

                      {canUpdateStatus && order.deliveryChargeStatus === "pending" && (
                        <button
                          onClick={() => handleSetDeliveryCharge(order)}
                          className="text-xs px-3 py-1.5 rounded border border-outline-variant text-primary hover:bg-surface-container-low"
                        >
                          Set Delivery Charge
                        </button>
                      )}

                      {canUpdateStatus && !["delivered", "cancelled"].includes(order.status) && (
                        <button
                          onClick={() => handleAssignDeliveryPerson(order)}
                          className="text-xs px-3 py-1.5 rounded border border-outline-variant text-on-surface hover:bg-surface-container-low"
                        >
                          {order.deliveryPersonName ? "Change Delivery Boy" : "Assign Delivery Boy"}
                        </button>
                      )}

                      {canUpdateStatus &&
                        nextStatuses.map((next) => (
                          <button
                            key={next}
                            onClick={() => handleStatusChange(order, next)}
                            className="text-xs px-3 py-1.5 rounded border border-outline-variant text-primary hover:bg-surface-container-low"
                          >
                            Mark {STATUS_LABELS[next]}
                          </button>
                        ))}

                      {canCancel && !["delivered", "cancelled"].includes(order.status) && (
                        <button
                          onClick={() => handleCancel(order)}
                          className="text-xs px-3 py-1.5 rounded border border-outline-variant text-error hover:bg-error-container"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-on-surface-variant">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded border border-outline-variant disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded border border-outline-variant disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
