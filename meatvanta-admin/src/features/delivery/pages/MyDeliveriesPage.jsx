import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMyOrders, fetchMyCash, pickUpOrder, deliverOrder, reportDeliveryProblem } from "../api/deliveryApi";
import { playNotificationSound } from "../../../lib/notificationSound";
import { showSuccess, showError, showConfirm } from "../../../lib/sweetAlert";

const POLL_MS = 15000;

function clock(dateString) {
  return new Date(dateString).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

/** "12 min left" / "5 min late" */
function timeLeft(dueBy, now) {
  const mins = Math.round((new Date(dueBy).getTime() - now) / 60000);
  if (mins >= 0) return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m left` : `${mins} min left`;
  return `${Math.abs(mins)} min late`;
}

function OrderCard({ order, now, busy, onPickUp, onDeliver, onProblem }) {
  const late = order.isOverdue;
  return (
    <article
      className={`bg-surface-container-lowest rounded-lg border p-md ${
        late ? "border-error" : "border-outline-variant"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-label-bold text-label-bold text-on-surface">{order.orderNumber}</p>
          <p
            className={`text-sm mt-0.5 flex items-center gap-1 ${late ? "text-error font-semibold" : "text-on-surface-variant"}`}
          >
            <span className="material-symbols-outlined text-base">schedule</span>
            Deliver by {clock(order.dueBy)} · {timeLeft(order.dueBy, now)}
          </p>
        </div>
        <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded bg-surface-container text-on-surface-variant">
          {order.status === "out_for_delivery" ? "On the way" : order.waitingForShop ? "Being prepared" : "Ready"}
        </span>
      </div>

      <div className="mt-3">
        <p className="text-on-surface font-semibold">{order.customerName}</p>
        <p className="text-sm text-on-surface-variant mt-0.5">{order.deliveryAddress || "No address on the order"}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          href={`tel:${order.customerPhone}`}
          className="flex items-center justify-center gap-1.5 rounded border border-outline-variant py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-low"
        >
          <span className="material-symbols-outlined text-base">call</span>
          Call
        </a>
        {order.mapUrl ? (
          <a
            href={order.mapUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 rounded border border-outline-variant py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-base">map</span>
            Map
          </a>
        ) : (
          <span className="flex items-center justify-center rounded border border-outline-variant py-2.5 text-sm text-on-surface-variant opacity-60">
            No map
          </span>
        )}
      </div>

      <ul className="mt-3 text-sm text-on-surface space-y-0.5">
        {order.items.map((item, i) => (
          <li key={i} className={item.quantity === 0 ? "line-through text-on-surface-variant" : ""}>
            {item.quantity} × {item.productName} <span className="text-on-surface-variant">({item.variantLabel})</span>
            {item.selectedOptions.length > 0 && (
              <span className="text-on-surface-variant"> — {item.selectedOptions.map((o) => o.optionName).join(", ")}</span>
            )}
            {item.notSent > 0 && (
              <span className="ml-1 text-error font-semibold no-underline">
                · {item.quantity === 0 ? "Not available - do not take" : `${item.notSent} not available (customer ordered ${item.orderedQuantity})`}
              </span>
            )}
          </li>
        ))}
      </ul>
      {order.unavailableAmount > 0 && (
        <p className="mt-2 text-xs text-error">
          Some items could not be sent, so the bill is smaller than the customer expects. The amount to collect is already updated.
        </p>
      )}
      {order.notes && <p className="mt-2 text-sm text-on-surface-variant italic">Note: {order.notes}</p>}

      <div
        className={`mt-3 rounded px-3 py-2 text-sm font-semibold ${
          order.amountToCollect > 0 ? "bg-accent-soft text-on-surface" : "bg-surface-container text-on-surface-variant"
        }`}
      >
        {order.amountToCollect > 0 ? `Collect cash: ₹${order.amountToCollect}` : "Paid online — do not collect cash"}
      </div>

      {order.deliveryFailedReason && order.status === "out_for_delivery" && (
        <p className="mt-2 text-xs text-error">
        You reported: {order.deliveryFailedReason}. Waiting for the shop to decide - you can still mark it delivered if it works out.
      </p>
      )}

      <div className="mt-3 space-y-2">
        {order.waitingForShop && (
          <p className="text-sm text-center text-on-surface-variant py-2">The shop is still preparing this order.</p>
        )}
        {order.canPickUp && (
          <button
            disabled={busy}
            onClick={() => onPickUp(order)}
            className="w-full rounded bg-primary-container text-on-primary py-3 font-label-bold text-label-bold disabled:opacity-60"
          >
            Picked up — start delivery
          </button>
        )}
        {order.canDeliver && (
          <>
            <button
              disabled={busy}
              onClick={() => onDeliver(order)}
              className="w-full rounded bg-primary-container text-on-primary py-3 font-label-bold text-label-bold disabled:opacity-60"
            >
              Delivered
            </button>
            {!order.deliveryFailedReason && (
            <button
              disabled={busy}
              onClick={() => onProblem(order)}
              className="w-full rounded border border-outline-variant text-error py-2.5 text-sm font-medium hover:bg-error-container disabled:opacity-60"
            >
              Could not deliver
            </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}

export default function MyDeliveriesPage() {
  const [data, setData] = useState({ active: [], delivered: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [cash, setCash] = useState({ amount: 0, count: 0 });
  const [busyId, setBusyId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const knownIds = useRef(null); // null until the first load, so opening the page is silent

  const load = useCallback(async () => {
    try {
      const [next, myCash] = await Promise.all([fetchMyOrders(), fetchMyCash().catch(() => null)]);
      if (myCash) setCash(myCash);
      const ids = next.active.map((o) => o.id);
      if (knownIds.current && ids.some((id) => !knownIds.current.has(id))) {
        playNotificationSound(); // a new order was assigned to this rider
      }
      knownIds.current = new Set(ids);
      setData(next);
      setLoadError("");
    } catch (err) {
      setLoadError(err.response?.data?.message || "Could not refresh. Check your internet.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 30000);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  async function run(order, action, successMessage) {
    setBusyId(order.id);
    try {
      await action();
      showSuccess(successMessage);
      await load();
    } catch (err) {
      showError(err.response?.data?.message || "That did not work. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  function handlePickUp(order) {
    return run(order, () => pickUpOrder(order.id), "Marked as picked up.");
  }

  async function handleDeliver(order) {
    const text =
      order.amountToCollect > 0 ? `Did you collect ₹${order.amountToCollect} in cash?` : "Confirm this order was handed over.";
    const ok = await showConfirm({ title: `Delivered ${order.orderNumber}?`, text, confirmButtonText: "Yes, delivered" });
    if (!ok) return;
    return run(order, () => deliverOrder(order.id), "Delivered. Well done!");
  }

  function handleProblem(order) {
    const reason = window.prompt("What went wrong? (e.g. customer not answering, wrong address)");
    if (reason === null) return;
    return run(order, () => reportDeliveryProblem(order.id, reason), "The shop has been told.");
  }

  if (isLoading) return <p className="text-sm text-on-surface-variant">Loading your deliveries…</p>;

  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-md">
        <h1 className="font-headline-md text-headline-md text-on-surface">My Deliveries</h1>
        <button onClick={load} className="text-sm text-primary flex items-center gap-1" aria-label="Refresh">
          <span className="material-symbols-outlined text-base">refresh</span>
          Refresh
        </button>
      </div>

      {loadError && <p className="mb-md text-sm text-error">{loadError}</p>}

      {cash.amount > 0 && (
        <div className="mb-md rounded-lg bg-accent-soft border border-outline-variant px-md py-sm">
          <p className="text-sm font-semibold text-on-surface">Cash with you: ₹{cash.amount.toFixed(0)}</p>
          <p className="text-xs text-on-surface-variant">
            From {cash.count} delivered order{cash.count === 1 ? "" : "s"}. Hand it to the shop - they will mark it received.
          </p>
        </div>
      )}

      {data.active.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-lg border border-outline-variant p-xl text-center">
          <span className="material-symbols-outlined text-3xl text-outline-variant">moped</span>
          <p className="text-on-surface font-medium mt-2">No deliveries right now</p>
          <p className="text-sm text-on-surface-variant mt-1">New orders appear here with a sound. Keep this page open.</p>
        </div>
      ) : (
        <div className="space-y-md">
          {data.active.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              now={now}
              busy={busyId === order.id}
              onPickUp={handlePickUp}
              onDeliver={handleDeliver}
              onProblem={handleProblem}
            />
          ))}
        </div>
      )}

      {data.delivered.length > 0 && (
        <section className="mt-xl">
          <h2 className="font-label-bold text-label-bold text-on-surface-variant mb-2">Delivered in the last 24 hours</h2>
          <ul className="bg-surface-container-lowest rounded-lg border border-outline-variant divide-y divide-outline-variant">
            {data.delivered.map((order) => (
              <li key={order.id} className="px-md py-2.5 flex items-center justify-between text-sm">
                <span className="text-on-surface">
                  {order.orderNumber} · {order.customerName}
                </span>
                <span className="text-on-surface-variant">{order.deliveredAt ? clock(order.deliveredAt) : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
