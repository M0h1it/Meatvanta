import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { fetchCustomer } from "../api/customersApi";
import { usePermission } from "../../../hooks/usePermission";

const STATUS_LABELS = {
  placed: "Placed",
  preparing: "Preparing",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_BADGE_STYLE = {
  placed: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  preparing: "bg-secondary-fixed text-on-secondary-fixed-variant",
  out_for_delivery: "bg-secondary-fixed text-on-secondary-fixed-variant",
  delivered: "bg-secondary-fixed text-on-secondary-fixed-variant",
  cancelled: "bg-error-container text-on-error-container",
};

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");

  const { hasPermission } = usePermission();
  const canViewOrders = hasPermission("orders:view");

  useEffect(() => {
    fetchCustomer(Number(id))
      .then(setCustomer)
      .catch((err) => setError(err.response?.data?.message || "Couldn't load this customer."))
      .finally(() => setIsLoading(false));
  }, [id]);

  if (isLoading) {
    return <p className="text-sm text-on-surface-variant">Loading customer...</p>;
  }

  if (error || !customer) {
    return (
      <div>
        <p className="text-on-surface font-semibold mb-2">{error || "Customer not found."}</p>
        <Link to="/customers" className="text-primary underline text-sm">
          Back to customers
        </Link>
      </div>
    );
  }

  const { stats, monthlyStats = [] } = customer;
  const visibleOrders = statusFilter
    ? customer.orders.filter((o) => o.status === statusFilter)
    : customer.orders;

  // Longest bar in the month chart - everything else scales against it.
  const peakMonthlySpend = monthlyStats.reduce((max, m) => Math.max(max, m.totalSpent), 0);

  return (
    <div>
      <button
        onClick={() => navigate("/customers")}
        className="inline-flex items-center gap-1 text-sm font-semibold text-on-surface-variant hover:text-primary mb-3"
      >
        <span className="material-symbols-outlined text-base">chevron_left</span>
        All Customers
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-lg">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface">{customer.name}</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            <a href={`tel:${customer.phone}`} className="text-primary hover:underline">
              {customer.phone}
            </a>
            {" · joined "}
            {formatDate(customer.createdAt)}
          </p>
        </div>
        {!customer.isActive && (
          <span className="text-xs px-3 py-1 rounded-full bg-error-container text-on-error-container font-medium">
            Account inactive
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-md mb-lg">
        <div className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
          <p className="font-headline-sm text-headline-sm text-on-surface">{stats.orderCount}</p>
          <p className="text-xs text-on-surface-variant mt-0.5">Total Orders</p>
        </div>
        <div className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
          <p className="font-headline-sm text-headline-sm text-on-surface">₹{stats.totalSpent.toFixed(0)}</p>
          <p className="text-xs text-on-surface-variant mt-0.5">Total Spent</p>
        </div>
        <div className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
          <p className="font-headline-sm text-headline-sm text-on-surface">
            ₹{stats.averageOrderValue.toFixed(0)}
          </p>
          <p className="text-xs text-on-surface-variant mt-0.5">Average Order</p>
        </div>
        <div className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
          <p className="font-headline-sm text-headline-sm text-on-surface">
            {stats.lastOrderAt ? formatDate(stats.lastOrderAt) : "—"}
          </p>
          <p className="text-xs text-on-surface-variant mt-0.5">Last Order</p>
        </div>
      </div>

      {/* Wallet: store credit tied to this phone number (what the shop owes the customer) */}
      {customer.wallet && (customer.wallet.balance > 0 || customer.wallet.transactions.length > 0) && (
        <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md mb-lg">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Wallet</h2>
            <p className="text-sm text-on-surface-variant">
              Balance <span className="font-bold text-on-surface text-lg">₹{Number(customer.wallet.balance).toFixed(2)}</span>
            </p>
          </div>
          {customer.wallet.transactions.length > 0 && (
            <ul className="divide-y divide-outline-variant text-sm">
              {customer.wallet.transactions.map((t) => (
                <li key={t.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-on-surface">
                    {t.reason}
                    <span className="block text-xs text-on-surface-variant">
                      {new Date(t.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    </span>
                  </span>
                  <span className={t.type === "credit" || t.type === "release" ? "font-semibold text-primary" : "font-semibold text-on-surface"}>
                    {t.type === "credit" || t.type === "release" ? "+" : "−"}₹{Number(t.amount).toFixed(2)}
                    <span className="block text-xs font-normal text-on-surface-variant text-right">
                      balance ₹{Number(t.balanceAfter).toFixed(2)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Month-wise activity */}
      {monthlyStats.length > 0 && (
        <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md mb-lg">
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">Monthly Activity</h2>
          <p className="text-xs text-on-surface-variant mb-4">
            Cancelled orders are excluded. Last {monthlyStats.length}{" "}
            {monthlyStats.length === 1 ? "month" : "months"} with activity.
          </p>

          <div className="space-y-2.5">
            {monthlyStats.map((month) => (
              <div key={month.month} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs font-medium text-on-surface-variant">
                  {month.label}
                </span>
                <div className="flex-1 h-6 bg-surface-container-low rounded overflow-hidden">
                  <div
                    className="h-full bg-primary-container rounded flex items-center justify-end pr-2"
                    style={{
                      width: peakMonthlySpend
                        ? `${Math.max(8, (month.totalSpent / peakMonthlySpend) * 100)}%`
                        : "8%",
                    }}
                  >
                    <span className="text-[10px] font-bold text-on-primary whitespace-nowrap">
                      ₹{month.totalSpent.toFixed(0)}
                    </span>
                  </div>
                </div>
                <span className="w-16 shrink-0 text-xs text-on-surface-variant text-right">
                  {month.orderCount} {month.orderCount === 1 ? "order" : "orders"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-md">
        {/* Order history */}
        <div className="lg:col-span-2">
          <section className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden">
            <div className="px-md py-sm border-b border-outline-variant flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Order History</h2>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-sm rounded border border-outline-variant px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">All statuses</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {visibleOrders.length === 0 ? (
              <p className="px-md py-lg text-sm text-on-surface-variant text-center">
                {statusFilter
                  ? `No ${STATUS_LABELS[statusFilter].toLowerCase()} orders.`
                  : "This customer hasn't placed an order yet."}
              </p>
            ) : (
              <div className="divide-y divide-outline-variant">
                {visibleOrders.map((order) => (
                  <div key={order.id} className="px-md py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        {canViewOrders ? (
                          <Link
                            to={`/orders/${order.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {order.orderNumber}
                          </Link>
                        ) : (
                          <span className="font-medium text-on-surface">{order.orderNumber}</span>
                        )}
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          {formatDate(order.createdAt)} · {order.paymentMethod.toUpperCase()}
                        </p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                            STATUS_BADGE_STYLE[order.status] || ""
                          }`}
                        >
                          {STATUS_LABELS[order.status]}
                        </span>
                        <p className="font-semibold text-on-surface mt-1">
                          ₹{Number(order.total).toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-on-surface-variant mt-1.5">
                      {order.items.map((i) => `${i.quantity}× ${i.productName}`).join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Addresses */}
        <div>
          <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-3">Saved Addresses</h2>

            {customer.addresses.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No saved addresses.</p>
            ) : (
              <div className="space-y-3">
                {customer.addresses.map((address) => (
                  <div key={address.id} className="border border-outline-variant rounded p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-on-surface">{address.label}</p>
                      {address.isDefault && (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-secondary-fixed text-on-secondary-fixed-variant px-2 py-0.5 rounded-full">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-on-surface-variant">{address.addressLine}</p>
                    {(address.area || address.pincode) && (
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        {[address.area, address.pincode].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-on-surface-variant mt-3 pt-3 border-t border-outline-variant">
              Customers manage their own details — these can't be edited from here.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
