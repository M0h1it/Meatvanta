import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRiderCash, settleRiderCash } from "../api/deliveryApi";
import { showSuccess, showError, showConfirm } from "../../../lib/sweetAlert";

function when(value) {
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function daysAgo(value) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return "today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export default function RiderCashPage() {
  const [data, setData] = useState({ riders: [], totalHeld: 0, recentlySettled: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyRider, setBusyRider] = useState(null);
  // riderId -> Set of ticked order ids (nothing ticked = settle everything for that rider)
  const [picked, setPicked] = useState({});

  const load = useCallback(async () => {
    try {
      setData(await fetchRiderCash());
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't load rider cash.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(riderId, orderId) {
    setPicked((prev) => {
      const next = new Set(prev[riderId] || []);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return { ...prev, [riderId]: next };
    });
  }

  async function handleSettle(rider) {
    const chosen = [...(picked[rider.riderId] || [])];
    const orders = chosen.length ? rider.orders.filter((o) => chosen.includes(o.id)) : rider.orders;
    const amount = orders.reduce((sum, o) => sum + o.total, 0);

    const ok = await showConfirm({
      title: `Received ₹${amount.toFixed(0)} from ${rider.riderName}?`,
      text: `${orders.length} order${orders.length === 1 ? "" : "s"}. Count the cash first - this cannot be undone.`,
      confirmButtonText: "Yes, cash received",
    });
    if (!ok) return;

    setBusyRider(rider.riderId);
    try {
      const result = await settleRiderCash(rider.riderId, chosen.length ? chosen : undefined);
      showSuccess(`₹${result.amount.toFixed(0)} marked as received.`);
      setPicked((prev) => ({ ...prev, [rider.riderId]: new Set() }));
      await load();
    } catch (err) {
      showError(err.response?.data?.message || "Couldn't settle the cash.");
    } finally {
      setBusyRider(null);
    }
  }

  if (isLoading) return <p className="text-sm text-on-surface-variant">Loading rider cash…</p>;

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-md">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface">Rider Cash</h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Cash riders collected from customers (COD) and have not yet handed to the shop.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1 text-sm px-3 py-2 rounded border border-outline-variant text-on-surface hover:bg-surface-container-low"
        >
          <span className="material-symbols-outlined text-lg">refresh</span>
          Refresh
        </button>
      </div>

      {error && <div className="mb-md rounded bg-error-container text-on-error-container text-sm px-3 py-2">{error}</div>}

      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm mb-md inline-block">
        <p className="text-xs text-on-surface-variant">Total cash with riders</p>
        <p className={`text-2xl font-bold ${data.totalHeld > 0 ? "text-error" : "text-on-surface"}`}>
          ₹{data.totalHeld.toFixed(0)}
        </p>
      </div>

      {data.riders.length === 0 ? (
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-lg text-center text-sm text-on-surface-variant">
          Nothing pending - every rider has handed over their cash.
        </div>
      ) : (
        <div className="space-y-md">
          {data.riders.map((rider) => {
            const ticked = picked[rider.riderId] || new Set();
            const tickedAmount = rider.orders.filter((o) => ticked.has(o.id)).reduce((sum, o) => sum + o.total, 0);
            return (
              <section
                key={rider.riderId}
                className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-label-bold text-label-bold text-on-surface">{rider.riderName}</p>
                    {rider.riderPhone && (
                      <a href={`tel:${rider.riderPhone}`} className="text-sm text-primary hover:underline">
                        {rider.riderPhone}
                      </a>
                    )}
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      {rider.count} order{rider.count === 1 ? "" : "s"} · oldest {daysAgo(rider.oldestDeliveredAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-on-surface">₹{rider.amount.toFixed(0)}</p>
                    <button
                      disabled={busyRider === rider.riderId}
                      onClick={() => handleSettle(rider)}
                      className="mt-1 text-sm px-4 py-2 rounded bg-primary-container text-on-primary hover:opacity-90 disabled:opacity-60"
                    >
                      {ticked.size > 0 ? `Received ₹${tickedAmount.toFixed(0)} (ticked)` : `Received all ₹${rider.amount.toFixed(0)}`}
                    </button>
                  </div>
                </div>

                <ul className="mt-3 divide-y divide-outline-variant border-t border-outline-variant">
                  {rider.orders.map((o) => (
                    <li key={o.id} className="flex items-center gap-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={ticked.has(o.id)}
                        onChange={() => toggle(rider.riderId, o.id)}
                        aria-label={`Select ${o.orderNumber}`}
                      />
                      <Link to={`/orders/${o.id}`} className="text-primary hover:underline">
                        {o.orderNumber}
                      </Link>
                      <span className="text-on-surface-variant flex-1 truncate">
                        {o.customerName} · {o.deliveredAt ? when(o.deliveredAt) : ""}
                      </span>
                      <span className="font-medium text-on-surface">₹{o.total.toFixed(0)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-on-surface-variant mt-2">
                  Rider gave only part of it? Tick the orders you received cash for, then press the button.
                </p>
              </section>
            );
          })}
        </div>
      )}

      {data.recentlySettled.length > 0 && (
        <section className="mt-xl">
          <h2 className="font-label-bold text-label-bold text-on-surface-variant mb-2">Received in the last 7 days</h2>
          <ul className="bg-surface-container-lowest rounded-lg border border-outline-variant divide-y divide-outline-variant">
            {data.recentlySettled.map((o) => (
              <li key={o.id} className="px-md py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-on-surface">
                  <Link to={`/orders/${o.id}`} className="text-primary hover:underline">
                    {o.orderNumber}
                  </Link>{" "}
                  · {o.deliveryPersonName}
                </span>
                <span className="text-on-surface-variant">
                  ₹{o.total.toFixed(0)} · {when(o.cashSettledAt)}
                  {o.cashSettledByName ? ` · by ${o.cashSettledByName}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
