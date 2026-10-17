import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchOrders, assignRider } from "../../orders/api/ordersApi";
import { fetchRiders } from "../api/deliveryApi";
import { pickRider } from "../lib/pickRider";
import { usePermission } from "../../../hooks/usePermission";
import { showSuccess, showError } from "../../../lib/sweetAlert";

const POLL_MS = 30000;
const PAGE_SIZE = 50;

const STATUS_OPTIONS = [
  { value: "active", label: "Active (not finished)" },
  { value: "", label: "All orders" },
  { value: "placed", label: "Placed" },
  { value: "preparing", label: "Preparing" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_LABELS = {
  placed: "Placed",
  preparing: "Preparing",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_STYLE = {
  placed: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  preparing: "bg-secondary-fixed text-on-secondary-fixed-variant",
  out_for_delivery: "bg-primary-container text-on-primary",
  delivered: "bg-secondary-fixed text-on-secondary-fixed-variant",
  cancelled: "bg-error-container text-on-error-container",
};

const PAYMENT_METHOD_LABELS = { cod: "Cash (COD)", razorpay: "Online", upi: "UPI", wallet: "Wallet" };

const FINAL = ["delivered", "cancelled"];

function clock(value) {
  return new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function dayAndClock(value) {
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function minutesBetween(a, b) {
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
}

function paymentLine(order) {
  const method = PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod;
  const paid = order.paymentStatus === "paid" || order.paymentStatus === "verified";
  if (order.status === "cancelled") return { text: `${method} · cancelled`, tone: "muted" };
  if (paid) {
    const cashWithRider = order.paymentMethod === "cod" && order.deliveryAdminId && !order.cashSettledAt;
    return {
      text: `${method} · paid${order.paymentVerifiedAt ? ` ${dayAndClock(order.paymentVerifiedAt)}` : ""}${
        cashWithRider ? " · cash with rider" : order.paymentMethod === "cod" && order.cashSettledAt ? " · handed to shop" : ""
      }`,
      tone: cashWithRider ? "warn" : "ok",
    };
  }
  if (order.paymentMethod === "cod") return { text: `${method} · collect ₹${Number(order.total).toFixed(0)}`, tone: "warn" };
  return { text: `${method} · ${order.paymentStatus}`, tone: "warn" };
}

const TONE = { ok: "text-on-surface", warn: "text-error font-semibold", muted: "text-on-surface-variant" };

function Stat({ label, value, tone }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm">
      <p className="text-xs text-on-surface-variant">{label}</p>
      <p className={`text-xl font-bold ${tone || "text-on-surface"}`}>{value}</p>
    </div>
  );
}

function DeliveryRow({ order, now, canAssign, onAssign }) {
  const final = FINAL.includes(order.status);
  const overdue = !final && order.dueBy && new Date(order.dueBy).getTime() < now;
  const pay = paymentLine(order);

  return (
    <article
      className={`bg-surface-container-lowest rounded-lg border p-md ${overdue ? "border-error" : "border-outline-variant"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/orders/${order.id}`} className="font-label-bold text-label-bold text-primary hover:underline">
            {order.orderNumber}
          </Link>
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_STYLE[order.status]}`}>
            {STATUS_LABELS[order.status]}
          </span>
          {overdue && (
            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-error text-white">
              Late by {minutesBetween(order.dueBy, now)} min
            </span>
          )}
        </div>
        <p className="text-sm font-bold text-on-surface">₹{Number(order.total).toFixed(0)}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-md mt-3 text-sm">
        {/* Customer + address + map */}
        <div>
          <p className="text-on-surface font-medium">{order.customerName}</p>
          <a href={`tel:${order.customerPhone}`} className="text-primary hover:underline">
            {order.customerPhone}
          </a>
          {order.deliveryAddress && <p className="text-on-surface-variant mt-1">{order.deliveryAddress}</p>}
          {order.mapUrl && (
            <a
              href={order.mapUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline mt-1"
            >
              <span className="material-symbols-outlined text-lg">location_on</span>
              Map
              <span className="text-xs font-normal text-on-surface-variant">{order.hasPin ? "(exact pin)" : "(from address)"}</span>
            </a>
          )}
        </div>

        {/* Rider + times */}
        <div>
          <p className="text-xs text-on-surface-variant">Rider</p>
          <p className="text-on-surface font-medium">
            {order.deliveryPersonName || <span className="text-error">Not assigned</span>}
          </p>
          {order.deliveryPersonPhone && (
            <a href={`tel:${order.deliveryPersonPhone}`} className="text-primary hover:underline">
              {order.deliveryPersonPhone}
            </a>
          )}
          {canAssign && !final && (
            <button
              onClick={() => onAssign(order)}
              className="block mt-1 text-xs font-semibold px-2.5 py-1 rounded border border-outline-variant text-on-surface hover:bg-surface-container-low"
            >
              {order.deliveryPersonName ? "Change rider" : "Assign rider"}
            </button>
          )}
          {order.deliveryFailedReason && !final && (
            <p className="text-xs text-error mt-1">
              Delivery failed: {order.deliveryFailedReason}{" "}
              <Link to={`/orders/${order.id}`} className="font-semibold underline">
                Decide what next
              </Link>
            </p>
          )}
        </div>

        {/* Timing + payment */}
        <div>
          <p className="text-on-surface-variant">
            Ordered {dayAndClock(order.createdAt)}
          </p>
          {order.pickedUpAt && <p className="text-on-surface-variant">Picked up {clock(order.pickedUpAt)}</p>}
          {order.status === "delivered" && order.deliveredAt ? (
            <p className="text-on-surface font-medium">
              Delivered {dayAndClock(order.deliveredAt)}
              <span className="text-on-surface-variant font-normal">
                {" "}
                · {minutesBetween(order.createdAt, order.deliveredAt)} min
                {order.dueBy ? (new Date(order.deliveredAt) <= new Date(order.dueBy) ? " · on time" : " · late") : ""}
              </span>
            </p>
          ) : (
            !final &&
            order.dueBy && <p className={overdue ? "text-error font-semibold" : "text-on-surface-variant"}>Due by {clock(order.dueBy)}</p>
          )}
          <p className={`mt-1 ${TONE[pay.tone]}`}>{pay.text}</p>
        </div>
      </div>
    </article>
  );
}

export default function DeliveryBoardPage() {
  const { hasPermission } = usePermission();
  const canAssign = hasPermission("delivery:assign") || hasPermission("orders:updateStatus");

  const [filters, setFilters] = useState({
    status: "active",
    riderId: "",
    paymentMethod: "",
    paymentStatus: "",
    from: "",
    to: "",
    search: "",
  });
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ orders: [], total: 0, totalPages: 1 });
  const [riders, setRiders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [updatedAt, setUpdatedAt] = useState(null);

  const requestId = useRef(0);

  // Rider list for the filter. Not everyone who can see orders may list riders - that is fine.
  useEffect(() => {
    fetchRiders()
      .then(setRiders)
      .catch(() => setRiders([]));
  }, []);

  // Typing in search waits a moment before hitting the server.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.search === searchInput.trim() ? f : { ...f, search: searchInput.trim() }));
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(
    async (silent = false) => {
      const myRequest = ++requestId.current;
      if (!silent) setIsLoading(true);
      try {
        const result = await fetchOrders({
          status: filters.status || undefined,
          riderId: filters.riderId || undefined,
          paymentMethod: filters.paymentMethod || undefined,
          paymentStatus: filters.paymentStatus || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          search: filters.search || undefined,
          page,
          pageSize: PAGE_SIZE,
        });
        if (myRequest !== requestId.current) return; // an older request finished late
        setData(result);
        setError(null);
        setUpdatedAt(new Date());
      } catch (err) {
        if (myRequest === requestId.current) setError(err.response?.data?.message || "Couldn't load deliveries.");
      } finally {
        if (myRequest === requestId.current && !silent) setIsLoading(false);
      }
    },
    [filters, page]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  // Live: refresh every 30 s while the tab is open and visible; the clock drives the "late" badges.
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible") load(true);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  function setFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  function clearFilters() {
    setFilters({ status: "active", riderId: "", paymentMethod: "", paymentStatus: "", from: "", to: "", search: "" });
    setSearchInput("");
    setPage(1);
  }

  async function handleAssign(order) {
    const { chosen, riderId } = await pickRider({
      title: `Who is delivering ${order.orderNumber}?`,
      currentRiderId: order.deliveryAdminId,
    });
    if (!chosen) return;
    try {
      await assignRider(order.id, riderId);
      showSuccess("Delivery person updated.");
      load(true);
    } catch (err) {
      showError(err.response?.data?.message || "Failed to assign delivery person.");
    }
  }

  // Quick numbers for what is on screen (all matching orders of this page).
  const summary = useMemo(() => {
    const rows = data.orders;
    const open = rows.filter((o) => !FINAL.includes(o.status));
    return {
      onTheWay: rows.filter((o) => o.status === "out_for_delivery").length,
      unassigned: open.filter((o) => !o.deliveryAdminId).length,
      late: open.filter((o) => o.dueBy && new Date(o.dueBy).getTime() < now).length,
      cashToCollect: rows
        .filter((o) => o.paymentMethod === "cod" && o.paymentStatus !== "paid" && o.status !== "cancelled")
        .reduce((sum, o) => sum + Number(o.total), 0),
    };
  }, [data.orders, now]);

  const isFiltered =
    filters.status !== "active" ||
    filters.riderId ||
    filters.paymentMethod ||
    filters.paymentStatus ||
    filters.from ||
    filters.to ||
    filters.search;

  const selectClass =
    "text-sm rounded border border-outline-variant px-3 py-2 bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-md">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface">All Deliveries</h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Every order with its rider, map location and payment.
            {updatedAt && ` Updated ${clock(updatedAt)} - refreshes by itself.`}
          </p>
        </div>
        <button
          onClick={() => load(false)}
          className="flex items-center gap-1 text-sm px-3 py-2 rounded border border-outline-variant text-on-surface hover:bg-surface-container-low"
        >
          <span className="material-symbols-outlined text-lg">refresh</span>
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-sm mb-md">
        <Stat label="Matching orders" value={data.total} />
        <Stat label="On the way (this list)" value={summary.onTheWay} />
        <Stat label="No rider yet" value={summary.unassigned} tone={summary.unassigned ? "text-error" : undefined} />
        <Stat label="Running late" value={summary.late} tone={summary.late ? "text-error" : undefined} />
      </div>
      {summary.cashToCollect > 0 && (
        <p className="text-sm text-on-surface-variant mb-md">
          Cash still to be collected on this list: <span className="font-bold text-on-surface">₹{summary.cashToCollect.toFixed(0)}</span>
        </p>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-sm mb-md">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant">
            search
          </span>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Order no., name or phone"
            className="w-56 text-sm rounded border border-outline-variant pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={selectClass} aria-label="Status">
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select value={filters.riderId} onChange={(e) => setFilter("riderId", e.target.value)} className={selectClass} aria-label="Rider">
          <option value="">All riders</option>
          <option value="none">No rider assigned</option>
          {riders.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        <select
          value={filters.paymentMethod}
          onChange={(e) => setFilter("paymentMethod", e.target.value)}
          className={selectClass}
          aria-label="Payment type"
        >
          <option value="">Any payment type</option>
          <option value="cod">Cash on delivery</option>
          <option value="razorpay">Online</option>
        </select>

        <select
          value={filters.paymentStatus}
          onChange={(e) => setFilter("paymentStatus", e.target.value)}
          className={selectClass}
          aria-label="Payment status"
        >
          <option value="">Paid or unpaid</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid (cash pending)</option>
        </select>

        <label className="text-xs text-on-surface-variant">
          From
          <input type="date" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} className={`${selectClass} block`} />
        </label>
        <label className="text-xs text-on-surface-variant">
          To
          <input type="date" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} className={`${selectClass} block`} />
        </label>

        {isFiltered && (
          <button onClick={clearFilters} className="text-sm font-semibold text-primary hover:underline pb-2">
            Reset filters
          </button>
        )}
      </div>

      {error && <div className="mb-md rounded bg-error-container text-on-error-container text-sm px-3 py-2">{error}</div>}

      {isLoading ? (
        <p className="text-sm text-on-surface-variant">Loading deliveries...</p>
      ) : data.orders.length === 0 ? (
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-lg text-center text-sm text-on-surface-variant">
          No orders match these filters.
        </div>
      ) : (
        <div className="space-y-sm">
          {data.orders.map((order) => (
            <DeliveryRow key={order.id} order={order} now={now} canAssign={canAssign} onAssign={handleAssign} />
          ))}
        </div>
      )}

      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-md text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded border border-outline-variant disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-on-surface-variant">
            Page {page} of {data.totalPages}
          </span>
          <button
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded border border-outline-variant disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
